#!/usr/bin/env python3
"""검증 프롬프트 렌더링 — clientCrossValidateV2 / clientFactCheck 의 메시지 조립 포팅.

템플릿 원문은 ../references/prompts.md 의 <!-- BEGIN:NAME --> ~ <!-- END:NAME --> 블록에서 읽는다.

--template cross       : 스킬 적용본(PROMPT_CROSS_VALIDATION_SKILL, 기준 시점 포함) [기본값]
--template cross-main  : main 원문(PROMPT_CROSS_VALIDATION, 기준 시점 없음)
--template fact-check  : PROMPT_FACT_CHECK (system) + "제목: ...\\n\\n본문:\\n..." (user)
--template fact-check-quick : PROMPT_FACT_CHECK_QUICK

입력(JSON, stdin 또는 --input):
  {"title": "...", "body": "...", "legal_references": ["조세특례제한법 제10조", ...],
   "category_name": "변리사의 현장 수첩", "target_keyword": "직무발명보상금",
   "date": "2026-10-01"}   // date 생략 시 Asia/Seoul 오늘
출력(JSON): {"system": "...", "user": "...", "legal_facts_block": "...", "current_date": "..."}
"""

import argparse
import datetime
import json
import os
import re
import sys

from legal_facts import filter_relevant_facts, format_facts_for_prompt

HERE = os.path.dirname(os.path.abspath(__file__))
PROMPTS_MD = os.path.join(HERE, "..", "references", "prompts.md")

CROSS_SYSTEM = "당신은 JSON 출력 전용 팩트체커입니다. 마크다운/설명/코드펜스 없이 오직 JSON 객체 한 개만 출력합니다."


def load_template(name: str) -> str:
    text = open(PROMPTS_MD, encoding="utf-8").read()
    m = re.search(
        r"<!-- BEGIN:" + re.escape(name) + r" -->\n```text\n([\s\S]*?)\n```\n<!-- END:" + re.escape(name) + " -->",
        text,
    )
    if not m:
        raise SystemExit(f"템플릿 {name} 을 {PROMPTS_MD} 에서 찾지 못했습니다")
    return m.group(1)


def today_kst() -> datetime.date:
    try:
        from zoneinfo import ZoneInfo

        return datetime.datetime.now(ZoneInfo("Asia/Seoul")).date()
    except Exception:  # tzdata 없음 → UTC+9 고정
        return (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).date()


def render_cross(template: str, data: dict, current_date: str) -> str:
    refs = data.get("legal_references") or []
    legal_ref_block = "\n".join(f"- {r}" for r in refs) if len(refs) > 0 else "(Phase 1 에서 legal_references 가 추출되지 않음)"
    body = data.get("body", "")
    legal_facts_block = format_facts_for_prompt(filter_relevant_facts(body))
    s = template
    s = legal_ref_block.join(s.split("{{legal_references}}"))
    s = legal_facts_block.join(s.split("{{legal_facts}}"))
    s = (data.get("category_name") or "").join(s.split("{{category_name}}"))
    s = (data.get("target_keyword") or "").join(s.split("{{target_keyword}}"))
    s = current_date[:4].join(s.split("{{current_year}}"))
    s = current_date.join(s.split("{{current_date}}"))
    s = body.join(s.split("{{phase2_output}}"))
    return s, legal_facts_block


def main():
    ap = argparse.ArgumentParser(description="교차검증/팩트체크 프롬프트를 실제 값으로 채워 출력한다.")
    ap.add_argument("--template", choices=["cross", "cross-main", "fact-check", "fact-check-quick"], default="cross")
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--text", action="store_true", help="JSON 대신 user 메시지 원문만 출력")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    current_date = data.get("date") or today_kst().isoformat()

    if args.template in ("cross", "cross-main"):
        name = "PROMPT_CROSS_VALIDATION_SKILL" if args.template == "cross" else "PROMPT_CROSS_VALIDATION"
        user, facts_block = render_cross(load_template(name), data, current_date)
        out = {"system": CROSS_SYSTEM, "user": user, "legal_facts_block": facts_block, "current_date": current_date}
    else:
        name = "PROMPT_FACT_CHECK" if args.template == "fact-check" else "PROMPT_FACT_CHECK_QUICK"
        user = f"제목: {data.get('title', '')}\n\n본문:\n{data.get('body', '')}"
        out = {"system": load_template(name), "user": user, "current_date": current_date}

    if args.text:
        print(out["user"])
    else:
        print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
