#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 블로그 RSS → 발행 이력 JSON (recommend.py plan 의 history 입력).

기본 RSS: https://rss.blog.naver.com/didimip.xml
- 네트워크가 막힌 환경이면 브라우저 등으로 받은 XML 파일을 --file 로 넘긴다.
- RSS 는 최근 글 일부(보통 15~50건)만 담는다. 이번 달 통계·직전 카테고리에는 충분하지만
  전체 커버리지 판단에는 Notion DB 또는 사용자 목록을 함께 쓴다.

RSS <category> 는 글이 속한 네이버 카테고리 이름이다. _DECISIONS.md §1 의 categoryNo 표로
정본 번호(category_no)를 찾고, 레거시 카테고리는 '흡수' 매핑으로 통계용 신규 번호(new_category_no)를 붙인다.
표에 없는 이름은 "mapping": "unknown" → 사용자에게 categoryNo 를 물어 --map 으로 넘긴다.

출력: [{date, category_name, category_no, new_category_no, new_category, mapping, keyword, keywords, title, url}]
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recommend import NAVER_CATEGORIES, NAME_TO_NO, classify_category, cat_name  # noqa: E402

DEFAULT_URL = "https://rss.blog.naver.com/didimip.xml"


def parse_rss(xml_text: str, extra_map: dict | None = None):
    """[결정 사항 반영] RSS <category>(네이버 카테고리 이름) → categoryNo(정본) → 통계용 신규 categoryNo."""
    extra_map = extra_map or {}
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    out = []
    for it in items:
        name = (it.findtext("category") or "").replace("\u00a0", " ").strip()
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("guid") or it.findtext("link") or "").strip()
        pub = it.findtext("pubDate") or ""
        try:
            date = parsedate_to_datetime(pub).isoformat()
        except (TypeError, ValueError):
            date = None
        tags = [t.strip() for t in (it.findtext("tag") or "").split(",") if t.strip()]
        rec = {"date": date, "category_name": name or None, "keyword": tags[0] if tags else None,
               "keywords": tags, "title": title, "url": link}
        if name in extra_map:
            rec["category_no"] = int(extra_map[name])
        else:
            rec["category"] = name
        raw, new, how = classify_category(rec)
        rec.update({"category_no": raw, "new_category_no": new,
                    "new_category": cat_name(new) if new else None, "mapping": how})
        rec.pop("category", None)
        out.append(rec)
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description="네이버 블로그 RSS → 발행 이력 JSON")
    p.add_argument("--url", default=DEFAULT_URL, help=f"RSS 주소 (기본 {DEFAULT_URL})")
    p.add_argument("--file", help="이미 받아 둔 RSS XML 파일 (네트워크 불가 시)")
    p.add_argument("--map", help='표에 없는 카테고리 이름 → categoryNo JSON 예: \'{"새 카테고리":25}\'')
    p.add_argument("--timeout", type=int, default=20)
    a = p.parse_args(argv)
    extra = json.loads(a.map) if a.map else {}
    try:
        if a.file:
            with open(a.file, encoding="utf-8") as fp:
                xml_text = fp.read()
        else:
            req = urllib.request.Request(a.url, headers={"User-Agent": "Mozilla/5.0 (didim-blog-planner)"})
            with urllib.request.urlopen(req, timeout=a.timeout) as r:
                xml_text = r.read().decode("utf-8", errors="replace")
        history = parse_rss(xml_text, extra)
    except Exception as e:  # 네트워크 차단·파싱 실패 → 사용자에게 붙여넣기 요청
        json.dump({"error": f"RSS 읽기 실패: {e}",
                   "next": "사용자에게 최근 발행 글 목록(날짜·카테고리·제목)을 붙여넣어 달라고 요청하세요."},
                  sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        sys.exit(2)
    unknown = sorted({h["category_name"] for h in history if h["mapping"] == "unknown" and h["category_name"]})
    json.dump({"source": a.file or a.url, "count": len(history), "unknown_categories": unknown,
               "history": history}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
