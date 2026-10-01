#!/usr/bin/env python3
"""초안 자동 검증 — 원본 TS 충실 포팅.

- validate_draft / calc_draft_score  ← src/lib/draft-validator.ts (validateDraft, calcDraftScore)
- validate_generated_draft           ← src/lib/constants/prompts.ts (validateGeneratedDraft)

사용법
  python3 draft_checks.py --title "제목" --body-file body.md --category-id CAT-A-01 [--prompt-key PROMPT_FIELD]
  echo '{"title":"...","body":"...","category_id":"CAT-A-01"}' | python3 draft_checks.py --stdin

출력(JSON)
  {"draft_checks":[...], "score":{...}, "generated_draft_warnings":[...], "prompt_key":"..."}

주의: 원본 에디터는 categoryId 로 "" 를 넘겨 CTA/서명 검사를 다이어리에도 적용한다.
      원본 동작을 그대로 재현하려면 --category-id "" 로 실행한다.
"""

import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from jscompat import DIGIT, DOT, WS, js_round, to_locale_string, u16len  # noqa: E402


def _has_digit(s: str) -> bool:
    return re.search(DIGIT, s) is not None


def validate_draft(title: str, body: str, category_id: str):
    checks = []

    # ── 제목 ──
    tlen = u16len(title)
    checks.append({
        "id": "title-length", "category": "제목", "rule": "25~30자 이내",
        "passed": 25 <= tlen <= 30, "detail": f"현재 {tlen}자",
    })
    checks.append({
        "id": "title-number", "category": "제목", "rule": "숫자(금액/비율/기간) 1개 이상 포함",
        "passed": _has_digit(title), "detail": "포함됨" if _has_digit(title) else "숫자 없음",
    })
    checks.append({
        "id": "title-keyword-front", "category": "제목", "rule": "핵심 키워드가 앞 15자 안에 배치",
        "passed": True, "detail": "AI 검증 필요",
    })

    # ── 도입부 ──
    parts = re.split(r"[.!?]" + WS, body)
    first_sentence = parts[0] if parts and parts[0] else ""
    first_two = ". ".join(parts[:2])
    checks.append({
        "id": "hook-result-first", "category": "도입부", "rule": "첫 문장이 결과/숫자로 시작 (훅 패턴)",
        "passed": _has_digit(first_sentence),
        "detail": "숫자 포함됨" if _has_digit(first_sentence) else "첫 문장에 숫자/결과 없음",
    })
    checks.append({
        "id": "first-2-sentences-keyword", "category": "도입부", "rule": "첫 2문장에 핵심 키워드 + 숫자 포함",
        "passed": _has_digit(first_two), "detail": "검색결과 요약문으로 활용됨",
    })

    # ── 본문 구조 ──
    heading_count = len(re.findall(r"^##" + WS, body, flags=re.M))
    checks.append({
        "id": "subheadings", "category": "본문구조", "rule": "소제목(##) 2~3개",
        "passed": 2 <= heading_count <= 4, "detail": f"현재 {heading_count}개",
    })
    body_chars = u16len(re.sub(WS, "", body))
    checks.append({
        "id": "body-length", "category": "본문구조", "rule": "본문 1,500~2,500자 (공백 제외)",
        "passed": 1500 <= body_chars <= 2500, "detail": f"현재 {to_locale_string(body_chars)}자",
    })
    has_summary = (
        "📌" in body or "바쁜 대표님" in body or "3줄 요약" in body or "핵심 요약" in body
        or ("1." in body and "2." in body and "3." in body)
    )
    checks.append({
        "id": "summary-box", "category": "본문구조", "rule": "3줄 요약 포함",
        "passed": has_summary, "detail": "포함됨" if has_summary else "요약 박스 없음",
    })
    legal_direct = re.search(
        r"(?:^|" + WS + r")(?:Lanham Act|Patent Act|35 U\.S\.C|§" + DIGIT + r"+)" + WS, body, flags=re.M
    ) is not None
    legal_in_parens = re.search(r"\(" + DOT + r"*?(?:Lanham|Act|§)" + DOT + r"*?\)", body) is not None
    checks.append({
        "id": "legal-terms", "category": "본문구조", "rule": "법조문은 괄호 안에 표기",
        "passed": (not legal_direct) or legal_in_parens,
        "detail": "본문에 법조문 직접 인용됨" if (legal_direct and not legal_in_parens) else "정상",
    })

    # ── 서식 ──
    bold_count = len(re.findall(r"\*\*[^*]+\*\*", body))
    checks.append({
        "id": "bold-emphasis", "category": "서식", "rule": "볼드(**) 강조 3개 이상",
        "passed": bold_count >= 3, "detail": f"현재 {bold_count}개",
    })
    quote_count = len(re.findall(r"^>" + WS, body, flags=re.M))
    checks.append({
        "id": "quote-block", "category": "서식", "rule": "인용 블록(>) 1개 이상",
        "passed": quote_count >= 1, "detail": f"현재 {quote_count}개",
    })
    divider_count = len(re.findall(r"^[━─]{3,}$", body, flags=re.M))
    checks.append({
        "id": "dividers", "category": "서식", "rule": "구분선(━━━) 사용",
        "passed": divider_count >= 1, "detail": f"현재 {divider_count}개",
    })

    # ── 본문구조: 마크다운 표 금지 ──
    has_table = re.search(
        r"\|" + DOT + r"+\|" + DOT + r"*\n\|[-:\t\n\x0b\x0c\r    -     　﻿|]+\|",
        body,
    ) is not None
    checks.append({
        "id": "no-markdown-table", "category": "본문구조", "rule": "마크다운 표 미사용 (인포그래픽으로 대체)",
        "passed": not has_table,
        "detail": "마크다운 표 감지됨 — 인포그래픽으로 대체 필요" if has_table else "정상",
    })

    # ── 이미지 ──
    image_markers = len(re.findall(r"\[IMAGE:", body))
    checks.append({
        "id": "image-count", "category": "이미지", "rule": "이미지 마커 1~5개",
        "passed": 1 <= image_markers <= 5, "detail": f"현재 {image_markers}개 (1~5개 권장)",
    })
    checks.append({
        "id": "image-headline", "category": "이미지", "rule": "이미지 마커에 임팩트 헤드라인 포함",
        "passed": image_markers > 0, "detail": "AI 검증에서 상세 확인",
    })

    # ── CTA + 서명 (디딤 다이어리 제외) ──
    if not category_id.startswith("CAT-C"):
        checks.append({
            "id": "cta-present", "category": "CTA", "rule": "CTA 영역 포함",
            "passed": ("admin@didimip.com" in body) or ("02-571-6613" in body),
            "detail": "이메일 포함됨" if "admin@didimip.com" in body else "CTA 없음",
        })
        checks.append({
            "id": "signature-block", "category": "서명", "rule": "디딤 서명 블록 포함",
            "passed": ("특허그룹 디딤" in body) and ("기업을 아는 변리사" in body),
            "detail": "포함됨" if "특허그룹 디딤" in body else "서명 블록 없음",
        })

    return checks


def calc_draft_score(checks):
    total = len(checks)
    passed_count = len([c for c in checks if c["passed"]])
    score = js_round((passed_count / total) * 100) if total > 0 else 0
    failed = [c for c in checks if not c["passed"]]
    return {"score": score, "total": total, "passedCount": passed_count, "failedItems": failed}


DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@"]
EMAIL_RE = re.compile(r"[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+\.[A-Za-z0-9_]+")


def validate_generated_draft(text: str, prompt_key: str):
    warnings = []
    char_count = u16len(re.sub(WS, "", text))

    if prompt_key == "PROMPT_LOUNGE_BITE" and char_count > 1200:
        warnings.append({
            "type": "char_count",
            "message": f"IP 뉴스 한 입은 1,200자 이내여야 합니다. 현재 {char_count}자입니다.",
        })

    if prompt_key == "PROMPT_DIARY":
        found = [kw for kw in DIARY_CTA_KEYWORDS if kw in text]
        if found:
            warnings.append({
                "type": "cta_keyword",
                "message": f"디딤 다이어리에 CTA 관련 키워드가 감지되었습니다: {', '.join(found)}",
            })

    emails = EMAIL_RE.findall(text)
    invalid = [e for e in emails if e != "admin@didimip.com"]
    if invalid:
        warnings.append({
            "type": "email_mismatch",
            "message": f"허용되지 않은 이메일 주소가 감지되었습니다: {', '.join(invalid)} (admin@didimip.com만 사용 가능)",
        })
    return warnings


def get_prompt_key(category_id: str) -> str:
    """prompts.ts getPromptKey 포팅 (pipeline_utils.py 와 동일)."""
    if category_id == "CAT-A" or category_id.startswith("CAT-A-"):
        return "PROMPT_FIELD"
    if category_id == "CAT-B-03":
        return "PROMPT_LOUNGE_BITE"
    if category_id == "CAT-B" or category_id.startswith("CAT-B-"):
        return "PROMPT_LOUNGE_GENERAL"
    if category_id == "CAT-C" or category_id.startswith("CAT-C-"):
        return "PROMPT_DIARY"
    return "PROMPT_LOUNGE_GENERAL"


def main():
    ap = argparse.ArgumentParser(description="디딤 블로그 초안 자동 검증 (validateDraft + validateGeneratedDraft 포팅)")
    ap.add_argument("--title", default=None, help="제목 문자열")
    ap.add_argument("--body-file", default=None, help="본문 파일 경로 (UTF-8)")
    ap.add_argument("--category-id", default=None, help="카테고리 ID (예: CAT-A-01). 원본 에디터 재현은 \"\"")
    ap.add_argument("--prompt-key", default=None, help="PROMPT_FIELD|PROMPT_LOUNGE_GENERAL|PROMPT_LOUNGE_BITE|PROMPT_DIARY (생략 시 category-id 로 결정)")
    ap.add_argument("--stdin", action="store_true", help="표준입력 JSON {title, body, category_id, prompt_key}")
    a = ap.parse_args()

    if a.stdin:
        data = json.load(sys.stdin)
        title = data.get("title", "")
        body = data.get("body", "")
        category_id = data.get("category_id", "") or ""
        prompt_key = data.get("prompt_key")
    else:
        if a.title is None or a.body_file is None:
            ap.error("--title 과 --body-file 이 필요합니다 (또는 --stdin)")
        title = a.title
        with open(a.body_file, encoding="utf-8") as f:
            body = f.read()
        category_id = a.category_id or ""
        prompt_key = a.prompt_key
    if not prompt_key:
        prompt_key = get_prompt_key(category_id) if category_id else None

    checks = validate_draft(title, body, category_id)
    out = {
        "draft_checks": checks,
        "score": calc_draft_score(checks),
        "prompt_key": prompt_key,
        "generated_draft_warnings": validate_generated_draft(body, prompt_key) if prompt_key else [],
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
