#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""네이버 블로그 RSS → 발행 이력 JSON (recommend.py plan 의 history 입력).

기본 RSS: https://rss.blog.naver.com/didimip.xml
- 네트워크가 막힌 환경이면 브라우저 등으로 받은 XML 파일을 --file 로 넘긴다.
- RSS 는 최근 글 일부(보통 15~50건)만 담는다. 이번 달 통계·직전 카테고리에는 충분하지만
  전체 커버리지 판단에는 Notion DB 또는 사용자 목록을 함께 쓴다.

RSS <category> 는 네이버 '2차 분류' 이름이다. 코드(sub-category-pool.ts)에 있는 이름이면
1차 카테고리·2차 ID 를 채우고, 모르는 이름(예: 네이버에서 새로 만든 분류)은 category_id 를 비워
"mapping": "unknown" 으로 표시한다 → 사용자에게 어느 1차 카테고리인지 물어 --map 으로 넘긴다.

출력: [{date, category, category_id, sub_category, sub_category_id, keyword, keywords, title, url, mapping}]
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
from recommend import CATEGORY_NAMES, SUB_NAME_TO_IDS  # noqa: E402

DEFAULT_URL = "https://rss.blog.naver.com/didimip.xml"


def parse_rss(xml_text: str, extra_map: dict | None = None):
    extra_map = extra_map or {}
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    items = channel.findall("item") if channel is not None else []
    out = []
    for it in items:
        sub = (it.findtext("category") or "").replace(" ", " ").strip()
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("guid") or it.findtext("link") or "").strip()
        pub = it.findtext("pubDate") or ""
        try:
            date = parsedate_to_datetime(pub).isoformat()
        except (TypeError, ValueError):
            date = None
        tags = [t.strip() for t in (it.findtext("tag") or "").split(",") if t.strip()]
        rec = {"date": date, "category": None, "category_id": None, "sub_category": sub or None,
               "sub_category_id": None, "keyword": tags[0] if tags else None, "keywords": tags,
               "title": title, "url": link, "mapping": "unknown"}
        if sub in extra_map:
            cid = extra_map[sub]
            if "-" in cid and cid.count("-") >= 2:  # 2차 ID 를 준 경우
                rec["sub_category_id"] = cid
                cid = "-".join(cid.split("-")[:2])
            rec["category_id"] = cid
            rec["category"] = CATEGORY_NAMES.get(cid)
            rec["mapping"] = "user"
        elif sub in SUB_NAME_TO_IDS:
            cid, sid = SUB_NAME_TO_IDS[sub]
            rec.update({"category_id": cid, "category": CATEGORY_NAMES[cid], "sub_category_id": sid, "mapping": "code"})
        out.append(rec)
    return out


def main(argv=None):
    p = argparse.ArgumentParser(description="네이버 블로그 RSS → 발행 이력 JSON")
    p.add_argument("--url", default=DEFAULT_URL, help=f"RSS 주소 (기본 {DEFAULT_URL})")
    p.add_argument("--file", help="이미 받아 둔 RSS XML 파일 (네트워크 불가 시)")
    p.add_argument("--map", help='모르는 2차 분류 매핑 JSON 예: \'{"지식재산 경영":"CAT-B","출원·심판 실무":"CAT-A"}\'')
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
    unknown = sorted({h["sub_category"] for h in history if h["mapping"] == "unknown" and h["sub_category"]})
    json.dump({"source": a.file or a.url, "count": len(history), "unknown_sub_categories": unknown,
               "history": history}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
