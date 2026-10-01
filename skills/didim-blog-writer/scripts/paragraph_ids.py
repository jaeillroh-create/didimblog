#!/usr/bin/env python3
"""문단 ID 유틸 — src/lib/utils/paragraph-ids.ts 충실 포팅.

본문을 빈 줄(\\n\\n+)로 나눠 각 문단 앞에 `<!-- p:N -->` 주석을 넣고/빼고/찾는다.
Phase 2.5(인포그래픽 위치 지정)와 교차검증(문단 매칭) 전에 주입하고,
Phase 3 입력·저장·발행 전에는 제거한다.

사용법 (모든 출력은 JSON)
  python3 paragraph_ids.py inject  --body-file body.md
  python3 paragraph_ids.py strip   --body-file body.md
  python3 paragraph_ids.py has     --body-file body.md
  python3 paragraph_ids.py map     --body-file body.md
  python3 paragraph_ids.py find    --body-file body.md --text "찾을 문장"
  python3 paragraph_ids.py get     --body-file body.md --id 3
  python3 paragraph_ids.py replace --body-file body.md --id 3 --new-file new.md
  (--body-file 대신 --stdin 으로 본문 원문을 표준입력에 넣을 수 있음)

원본과의 차이: TS 의 hasParagraphIds 는 전역(g) 정규식의 lastIndex 가 호출 사이에 남는 버그가
있어 연속 호출 시 false 를 낼 수 있다. 이 포팅은 상태가 없다(항상 올바른 결과).
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jscompat import WS, js_replace_first, js_trim, u16len  # noqa: E402

PARAGRAPH_ID_RE = re.compile(r"<!-- p:([0-9]+) -->\n?")
PARAGRAPH_ID_LINE_RE = re.compile(r"^<!-- p:[0-9]+ -->$")


def has_paragraph_ids(body: str) -> bool:
    return PARAGRAPH_ID_RE.search(body) is not None


def strip_paragraph_ids(body: str) -> str:
    out = PARAGRAPH_ID_RE.sub("", body)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return js_trim(out)


def inject_paragraph_ids(body: str) -> str:
    stripped = strip_paragraph_ids(body)
    paragraphs = re.split(r"\n\n+", stripped)
    pid = 1
    result = []
    for p in paragraphs:
        trimmed = js_trim(p)
        if not trimmed:
            continue
        # 이미지 마커나 구분선은 ID 부여 건너뛰기
        if trimmed.startswith("━━") or trimmed.startswith("---"):
            result.append(trimmed)
            continue
        result.append(f"<!-- p:{pid} -->\n{trimmed}")
        pid += 1
    return "\n\n".join(result)


def extract_paragraph_map(body: str):
    """dict[int, str] — 삽입 순서 유지 (JS Map 과 동일)."""
    mp = {}
    lines = body.split("\n")
    state = {"id": None, "lines": []}

    def flush():
        if state["id"] is not None and len(state["lines"]) > 0:
            mp[state["id"]] = js_trim("\n".join(state["lines"]))
        state["lines"] = []
        state["id"] = None

    for line in lines:
        m = re.fullmatch(r"<!-- p:([0-9]+) -->", line)
        if m:
            flush()
            state["id"] = int(m.group(1))
            continue
        cur = state["lines"]
        if js_trim(line) == "" and len(cur) > 0 and js_trim(cur[-1]) == "":
            flush()
            continue
        # ID 유무와 무관하게 줄을 쌓는다 (원본과 동일; ID 없으면 flush 시 버려짐)
        state["lines"].append(line)
    flush()
    return mp


def _normalize(s: str) -> str:
    s = re.sub(r"[#*>_`~]", "", s)
    s = re.sub(WS + "+", " ", s)
    return js_trim(s).lower()


def find_paragraph_id_for_text(body: str, text: str):
    mp = extract_paragraph_map(body)
    if len(mp) == 0:
        return None
    cleaned = js_trim(re.sub(r"<!--" + WS + r"*p:[0-9]+" + WS + r"*-->\n?", "", text))
    if not cleaned:
        return None
    # 1) 정확 포함
    for pid, content in mp.items():
        if cleaned in content:
            return pid
    # 2) 정규화 포함
    norm_text = _normalize(cleaned)
    if u16len(norm_text) >= 5:
        for pid, content in mp.items():
            if norm_text in _normalize(content):
                return pid
    # 3) 첫 문장(15자 이상) 포함
    parts = re.split(r"[.!?。]" + WS, cleaned)
    first = js_trim(parts[0]) if parts else ""
    if first and u16len(first) >= 15:
        for pid, content in mp.items():
            if first in content:
                return pid
    return None


def get_paragraph_by_id(body: str, paragraph_id: int):
    return extract_paragraph_map(body).get(paragraph_id)


def replace_paragraph_by_id(body: str, paragraph_id: int, new_content: str):
    p_text = get_paragraph_by_id(body, paragraph_id)
    if not p_text:
        return None
    return js_replace_first(body, p_text, new_content)


def _read_body(a):
    if a.stdin:
        return sys.stdin.read()
    if not a.body_file:
        raise SystemExit("--body-file 또는 --stdin 이 필요합니다")
    with open(a.body_file, encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description="문단 ID(<!-- p:N -->) 주입/제거/조회 — paragraph-ids.ts 포팅")
    ap.add_argument("command", choices=["inject", "strip", "has", "map", "find", "get", "replace"])
    ap.add_argument("--body-file")
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--text", help="find: 찾을 텍스트")
    ap.add_argument("--id", type=int, help="get/replace: 문단 ID")
    ap.add_argument("--new-file", help="replace: 교체할 문단 내용 파일")
    a = ap.parse_args()
    body = _read_body(a)

    if a.command == "inject":
        out = {"body": inject_paragraph_ids(body)}
        out["paragraph_count"] = len(re.findall(r"<!-- p:[0-9]+ -->", out["body"]))
    elif a.command == "strip":
        out = {"body": strip_paragraph_ids(body)}
    elif a.command == "has":
        out = {"has_paragraph_ids": has_paragraph_ids(body)}
    elif a.command == "map":
        out = {"paragraphs": {str(k): v for k, v in extract_paragraph_map(body).items()}}
    elif a.command == "find":
        out = {"paragraph_id": find_paragraph_id_for_text(body, a.text or "")}
    elif a.command == "get":
        out = {"paragraph": get_paragraph_by_id(body, a.id)}
    else:
        with open(a.new_file, encoding="utf-8") as f:
            new = f.read()
        out = {"body": replace_paragraph_by_id(body, a.id, new)}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
