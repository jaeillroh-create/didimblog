#!/usr/bin/env python3
"""AI 에디터 간이 SEO 체크 — ai-editor-client.tsx 의 로컬 calculateSeoScore + extractImageMarkers 포팅.

원본에서 이 간이 점수는 ① Phase 3 전/후 점수 비교 ② 초안 확정(Finalization) 때
contents.seo_score 로 저장되는 값이다. 8개 항목을 같은 비중(통과 개수/8×100)으로 계산한다.
카테고리 구분이 없다(다이어리도 같은 기준) — 정식 점수는 seo_score.py 를 쓴다.

입력(JSON, stdin 또는 --input): {"title": "...", "body": "...", "target_keyword": "..."}
출력(JSON): {"checks": [{label, passed, detail}], "score", "passedCount", "totalCount", "imageMarkers": [...]}
"""

import argparse
import json
import re
import sys

from _jscompat import JS_WS, JS_WS_CHARS, js_len, js_round, js_trim


def js_substring(s, start, end):
    """UTF-16 단위 substring (서로게이트 반쪽은 버림)."""
    b = s.encode("utf-16-le")[start * 2: end * 2]
    return b.decode("utf-16-le", errors="ignore")


_BOX_RE = re.compile(r"\[IMAGE:" + JS_WS + r"*([\s\S]*?)\]" + JS_WS + r"*\n" + JS_WS + r"*━━")
_BOX_TAIL_RE = re.compile(JS_WS + r"*\n" + JS_WS + r"*━━\Z")
_SIMPLE_RE = re.compile(r"\[IMAGE:" + JS_WS + r"*([^\]\n]+?)\]")


def extract_image_markers(text):
    markers = []
    for m in _BOX_RE.finditer(text):
        raw = text[m.start(): m.end()]
        markers.append({
            "position": m.start(),
            "description": js_trim(m.group(1)),
            "rawText": _BOX_TAIL_RE.sub("", raw),
        })
    for m in _SIMPLE_RE.finditer(text):
        idx = m.start()
        if any(idx >= mk["position"] and idx < mk["position"] + len(mk["rawText"]) for mk in markers):
            continue
        markers.append({"position": idx, "description": js_trim(m.group(1)), "rawText": m.group(0)})
    markers.sort(key=lambda x: x["position"])
    return markers


_HEADING_RE = re.compile(r"(?:^|(?<=[\n\r  ]))##" + JS_WS)  # /^##\s/gm
_HASHTAG_RE = re.compile("#[^" + re.escape(JS_WS_CHARS) + "#]+")  # /#[^\s#]+/g


def calculate_editor_seo_score(title, text, keyword):
    checks = []
    title_len = js_len(title)
    checks.append({"label": "제목 길이 25~30자", "passed": 25 <= title_len <= 30, "detail": f"{title_len}자"})

    in15 = keyword in js_substring(title, 0, 15)
    checks.append({"label": "키워드 앞 15자", "passed": in15 or len(keyword) == 0, "detail": "포함됨" if in15 else "미포함"})

    kc = len(re.findall(re.escape(keyword), text)) if keyword else 0
    checks.append({"label": "본문 키워드 3~5회", "passed": 3 <= kc <= 5, "detail": f"{kc}회"})

    hc = len(_HEADING_RE.findall(text))
    checks.append({"label": "소제목(##) 2개 이상", "passed": hc >= 2, "detail": f"{hc}개"})

    markers = extract_image_markers(text)
    checks.append({"label": "이미지 마커 3개 이상", "passed": len(markers) >= 3, "detail": f"{len(markers)}개"})

    cc = js_len(re.sub(JS_WS, "", text))
    checks.append({"label": "본문 1,500~2,500자", "passed": 1500 <= cc <= 2500, "detail": f"{cc:,}자"})

    tc = len(_HASHTAG_RE.findall(text))
    checks.append({"label": "태그 10개", "passed": tc >= 8, "detail": f"{tc}개"})

    cta = ("절세 시뮬레이션" in text) or ("연락" in text) or ("상담" in text) or ("이웃" in text)
    checks.append({"label": "CTA 배치", "passed": cta, "detail": "있음" if cta else "없음"})

    passed = sum(1 for c in checks if c["passed"])
    return {
        "checks": checks,
        "score": js_round(passed / len(checks) * 100),
        "passedCount": passed,
        "totalCount": len(checks),
        "imageMarkers": markers,
    }


def main():
    ap = argparse.ArgumentParser(description="AI 에디터의 8항목 간이 SEO 점수를 계산한다 (저장되는 seo_score 의 원천).")
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--body-file", help="본문 파일 (JSON 의 body 를 덮어씀)")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    if args.body_file:
        data["body"] = open(args.body_file, encoding="utf-8").read()
    res = calculate_editor_seo_score(data.get("title") or "", data.get("body") or "", data.get("target_keyword") or "")
    print(json.dumps(res, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
