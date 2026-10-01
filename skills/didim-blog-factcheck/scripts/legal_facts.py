#!/usr/bin/env python3
"""Known Facts Table — src/lib/constants/legal-facts.ts 포팅.

본문에 등장하는 키워드로 관련 법령·제도 고정 사실만 골라(filterRelevantFacts)
교차검증 프롬프트의 {{legal_facts}} 블록 텍스트(formatFactsForPrompt)로 만든다.

사용 예:
  python3 legal_facts.py --body-file draft.md
  echo '{"body": "직무발명보상금 25% ..."}' | python3 legal_facts.py
  python3 legal_facts.py --all

출력(JSON): {"meta": {...}, "facts": [...], "prompt_block": "..."}
"""

import argparse
import json
import sys

# ── LEGAL_FACTS (legal-facts.ts 원문 순서·값 그대로) ──
LEGAL_FACTS = [
    # ── 직무발명보상금 세액공제 ──
    {
        "value": "25%",
        "description": "직무발명보상금 세액공제율 (기본공제)",
        "source": "조세특례제한법 제10조",
        "effectiveDate": "2024-01-01",
        "keywords": ["직무발명보상금", "직무발명", "보상금 세액공제"],
    },
    {
        "value": "50%",
        "description": "직무발명보상금 증가분 가산공제율 (직전연도 보상액 없거나 직전연도보다 증가분)",
        "source": "조세특례제한법 제10조",
        "effectiveDate": "2024-01-01",
        "keywords": ["직무발명보상금", "증가분", "가산공제"],
    },
    # ── 기업부설연구소 세액공제 ──
    {
        "value": "25%",
        "description": "기업부설연구소 연구개발비 세액공제 (중소기업)",
        "source": "조세특례제한법 제10조",
        "effectiveDate": "2024-01-01",
        "keywords": ["기업부설연구소", "연구개발비", "R&D 세액공제"],
    },
    {
        "value": "60%",
        "description": "기업부설연구소 취득세 감면율",
        "source": "지방세특례제한법 제46조",
        "effectiveDate": "2024-01-01",
        "keywords": ["기업부설연구소", "취득세", "지방세"],
    },
    {
        "value": "50%",
        "description": "기업부설연구소 재산세 감면율",
        "source": "지방세특례제한법 제46조",
        "effectiveDate": "2024-01-01",
        "keywords": ["기업부설연구소", "재산세", "지방세"],
    },
    # ── 법인세 구간 ──
    {
        "value": "9%",
        "description": "법인세율 — 과세표준 2억원 이하",
        "source": "법인세법 제55조",
        "effectiveDate": "2023-01-01",
        "keywords": ["법인세", "법인세율", "과세표준"],
    },
    {
        "value": "19%",
        "description": "법인세율 — 과세표준 2억원 초과 200억원 이하",
        "source": "법인세법 제55조",
        "effectiveDate": "2023-01-01",
        "keywords": ["법인세", "법인세율", "과세표준"],
    },
    {
        "value": "21%",
        "description": "법인세율 — 과세표준 200억원 초과 3,000억원 이하",
        "source": "법인세법 제55조",
        "effectiveDate": "2023-01-01",
        "keywords": ["법인세", "법인세율", "과세표준"],
    },
    {
        "value": "24%",
        "description": "법인세율 — 과세표준 3,000억원 초과",
        "source": "법인세법 제55조",
        "effectiveDate": "2023-01-01",
        "keywords": ["법인세", "법인세율", "대기업"],
    },
    # ── 벤처기업 연구개발유형 요건 ──
    {
        "value": "5천만원",
        "description": "벤처기업 연구개발유형 — 연간 연구개발비 최소 기준",
        "source": "벤처기업법 제25조",
        "effectiveDate": "2024-01-01",
        "keywords": ["벤처기업", "연구개발유형", "연구개발비"],
    },
    {
        "value": "5%",
        "description": "벤처기업 연구개발유형 — 매출 대비 연구개발비 비율 최소 기준",
        "source": "벤처기업법 제25조",
        "effectiveDate": "2024-01-01",
        "keywords": ["벤처기업", "연구개발유형", "매출"],
    },
    # ── 기업부설연구소 연구전담요원 요건 ──
    {
        "value": "10인",
        "description": "기업부설연구소 연구전담요원 최소 인원 (대기업)",
        "source": "한국산업기술진흥협회 인정 기준",
        "effectiveDate": "2024-01-01",
        "keywords": ["연구전담요원", "기업부설연구소", "대기업"],
    },
    {
        "value": "7인",
        "description": "기업부설연구소 연구전담요원 최소 인원 (중견기업)",
        "source": "한국산업기술진흥협회 인정 기준",
        "effectiveDate": "2024-01-01",
        "keywords": ["연구전담요원", "기업부설연구소", "중견기업"],
    },
    {
        "value": "3인",
        "description": "기업부설연구소 연구전담요원 최소 인원 (중소기업, 예외 有)",
        "source": "한국산업기술진흥협회 인정 기준",
        "effectiveDate": "2024-01-01",
        "keywords": ["연구전담요원", "기업부설연구소", "중소기업"],
    },
    {
        "value": "1인",
        "description": "연구개발전담부서 연구전담요원 최소 인원 (기업규모 불문)",
        "source": "한국산업기술진흥협회 인정 기준",
        "effectiveDate": "2024-01-01",
        "keywords": ["연구개발전담부서", "연구전담요원"],
    },
]

LEGAL_FACTS_META = {
    "last_updated": "2026-01-15",
    "note": "2026년 기준. 법 개정 시 즉시 업데이트 필요.",
}


def filter_relevant_facts(body: str):
    """본문에 팩트의 keywords 중 하나라도 포함되면 해당 팩트 반환 (대소문자 무시)."""
    if not body:
        return []
    body_lower = body.lower()
    return [f for f in LEGAL_FACTS if any(kw.lower() in body_lower for kw in f["keywords"])]


def format_facts_for_prompt(facts) -> str:
    """팩트 배열 → LLM 프롬프트 주입용 텍스트 블록."""
    if len(facts) == 0:
        return "(관련 고정 사실 없음)"
    return "\n".join(
        f"- {f['description']}: **{f['value']}** ({f['source']}, {f['effectiveDate']})" for f in facts
    )


def main():
    ap = argparse.ArgumentParser(
        description="본문과 관련된 Known Facts(법령 고정 사실)를 골라 {{legal_facts}} 블록을 만든다. "
        "입력: --body-file 또는 stdin JSON {\"body\": \"...\"}. 출력: JSON."
    )
    ap.add_argument("--body-file", help="본문 텍스트 파일 경로 (UTF-8)")
    ap.add_argument("--all", action="store_true", help="필터 없이 전체 표 출력")
    args = ap.parse_args()

    if args.all:
        facts = LEGAL_FACTS
    else:
        if args.body_file:
            with open(args.body_file, encoding="utf-8") as fh:
                body = fh.read()
        else:
            raw = sys.stdin.read()
            try:
                body = json.loads(raw).get("body", "")
            except (json.JSONDecodeError, AttributeError):
                body = raw
        facts = filter_relevant_facts(body)

    print(
        json.dumps(
            {"meta": LEGAL_FACTS_META, "facts": facts, "prompt_block": format_facts_for_prompt(facts)},
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
