#!/usr/bin/env python3
"""디딤 블로그 공통 규칙 계산기 — 코드의 결정적 로직을 Python 표준 라이브러리로 포팅.

원본:
  src/lib/constants/name-mappings.ts   DEPRECATED_NAMES, replaceDeprecatedNames
  src/lib/constants/prompts.ts         getPromptKey(57-80), FIELD_CTA/DEFAULT_CTA/getFieldCta(11-119),
                                       validateGeneratedDraft(1760-1807)
  src/lib/client-generate.ts           determineDisclaimerLevel / getDisclaimerText (1585-1697)
  src/lib/utils/publish-helpers.ts     enforceEmail (273-277)
  src/lib/constants/categories.ts      DIDIM_* 상수, CATEGORY_HIERARCHY

입력·출력은 JSON(UTF-8). `python3 core_rules.py --help` 참고.
"""

from __future__ import annotations

import argparse
import json
import re
import sys

# JS 정규식 의미 재현 (\\s, \\w, \\d)
_JS_WS_CHARS = (
    "\t\n\x0b\x0c\r \u00a0\u1680"
    + "".join(chr(c) for c in range(0x2000, 0x200B))
    + "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
S = "[\t\n\x0b\x0c\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"
D = "[0-9]"

# ── categories.ts:36-40 ──
DIDIM_EMAIL = "admin@didimip.com"
DIDIM_PHONE = "02-571-6613"
DIDIM_SIGNATURE = "특허그룹 디딤 | 기업을 아는 변리사"
DIDIM_PROFILE_NOH = "KAIST 출신 | 前 NHN에듀 최고지식재산책임자(CIPO) | 기업기술가치평가사"
DIDIM_PROFILE_LEE = "경희대 겸임교수 | 서울대 AI 최고위과정 | 반도체·디스플레이 IP 전문"

# ── name-mappings.ts:17-31 ──
DEPRECATED_NAMES = [
    {
        "old": "특허청",
        "current": "지식재산처",
        "effectiveDate": "2025-10-01",
        "note": "국무총리실 소속 승격",
        "protectedPatterns": [
            "특허청장이" + S + "*정하는",
            "구" + S + "*특허청",
            "당시" + S + "*특허청",
            "특허청" + S + "*\\(현",
            "「[^」]*특허청[^」]*」",
        ],
    },
]


def replace_deprecated_names(body: str) -> str:
    """replaceDeprecatedNames (name-mappings.ts:37-62)."""
    result = body
    for entry in DEPRECATED_NAMES:
        tokens: list[str] = []
        for pat in entry["protectedPatterns"]:
            def _tok(m, tokens=tokens):
                tokens.append(m.group(0))
                return f"__PROTECTED_NAME_{len(tokens) - 1}__"
            result = re.sub(pat, _tok, result)
        result = result.replace(entry["old"], entry["current"])
        for i, tok in enumerate(tokens):
            result = result.replace(f"__PROTECTED_NAME_{i}__", tok, 1)
    return result


# ── prompts.ts:57-80 ──
def get_prompt_key(category_id: str) -> str:
    if category_id == "CAT-A" or category_id.startswith("CAT-A-"):
        return "PROMPT_FIELD"
    if category_id == "CAT-B-03":
        return "PROMPT_LOUNGE_BITE"
    if category_id == "CAT-B" or category_id.startswith("CAT-B-"):
        return "PROMPT_LOUNGE_GENERAL"
    if category_id == "CAT-C" or category_id.startswith("CAT-C-"):
        return "PROMPT_DIARY"
    return "PROMPT_LOUNGE_GENERAL"


# ── prompts.ts:11-53 ──
FIELD_CTA = {
    "CAT-A-01": {"cta": "재무제표를 보내주세요. 48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)", "emailSubject": "절세 시뮬레이션"},
    "CAT-A-02": {"cta": "인증 요건 해당 여부, 무료 진단해드립니다.", "emailSubject": "인증 진단"},
    "CAT-A-03": {"cta": "연구소 사후관리가 걱정되시면 연락 주세요. 연구활동조사표부터 연차보고까지 도와드립니다.", "emailSubject": "연구소 관리"},
    "CAT-A-04": {"cta": "출원 전략이 궁금하시면 편하게 연락 주세요. 기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.", "emailSubject": "출원 상담"},
    "CAT-B-01": {"cta": "특허 포트폴리오 전략이 궁금하시면 편하게 연락 주세요.", "emailSubject": "상담 문의"},
    "CAT-B-02": {"cta": "AI 기술의 특허 가능성이 궁금하시면 편하게 연락 주세요.", "emailSubject": "상담 문의"},
    "CAT-B-03": {"cta": "IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.", "emailSubject": "상담 문의"},
}
DEFAULT_CTA = {"cta": "궁금하신 점이 있으시면 편하게 연락 주세요.", "emailSubject": "상담 문의"}


def get_field_cta(category_id: str, target_keyword: str | None = None) -> dict:
    """getFieldCta (prompts.ts:88-119)."""
    if category_id in FIELD_CTA:
        return {**FIELD_CTA[category_id], "_rule": "1) 2차 분류 정확 매칭"}
    kw = (target_keyword or "").lower()
    if any(k in kw for k in ("절세", "세액공제", "법인세", "보상금")):
        return {**FIELD_CTA["CAT-A-01"], "_rule": "2) 키워드 → CAT-A-01"}
    if any(k in kw for k in ("인증", "벤처", "이노비즈")):
        return {**FIELD_CTA["CAT-A-02"], "_rule": "2) 키워드 → CAT-A-02"}
    if any(k in kw for k in ("연구소", "연구활동", "사후관리")):
        return {**FIELD_CTA["CAT-A-03"], "_rule": "2) 키워드 → CAT-A-03"}
    if any(k in kw for k in ("출원", "상표", "특허출원", "pct")):
        return {**FIELD_CTA["CAT-A-04"], "_rule": "2) 키워드 → CAT-A-04"}
    if any(k in kw for k in ("ai", "인공지능", "생성형")):
        return {**FIELD_CTA["CAT-B-02"], "_rule": "2) 키워드 → CAT-B-02"}
    if category_id.startswith("CAT-A"):
        return {**FIELD_CTA["CAT-A-04"], "_rule": "3) 1차 CAT-A 폴백"}
    if category_id.startswith("CAT-B"):
        return {**FIELD_CTA["CAT-B-01"], "_rule": "3) 1차 CAT-B 폴백"}
    return {**DEFAULT_CTA, "_rule": "4) 범용"}


def append_cta_block(cta: str, subject: str) -> str:
    """appendCtaAndSignature 가 본문 끝에 붙이는 CTA 블록 모양 (client-generate.ts:1571-1580, 태그 줄 제외)."""
    return (f"━━━━━━━━━━━━━━━━━━\n{cta}\n\n{DIDIM_SIGNATURE}\n📞 {DIDIM_PHONE}\n"
            f"📧 {DIDIM_EMAIL} (메일 제목: '{subject}')")


# ── client-generate.ts:1587-1697 ──
AI_NOTICE = "* 본 글은 AI 도구의 도움을 받아 작성되었으며, 변리사가 검수하였습니다."
DISCLAIMER_TEMPLATES = {
    "A": AI_NOTICE + "\n\n"
    "※ 본 글에 제시된 사례와 수치는 특정 조건의 개별 기업 상황을 기반으로 하며, 모든 기업에 동일하게 적용되지 않습니다. "
    "직무발명보상 제도의 세제 혜택은 기업의 매출, 비용 구조, 연구개발 실태, 직무발명 규정의 정비 수준 등에 따라 달라집니다.\n\n"
    "실제 세무 신고는 귀사의 세무사와 협의하여 진행하시기 바라며, 본 글은 제도 이해를 위한 일반적인 정보 제공 목적입니다. "
    "구체적인 절세 설계는 개별 상담을 통해 확인 가능합니다.",
    "B": AI_NOTICE + "\n\n"
    "※ 본 내용은 작성 시점의 법령 및 제도를 기준으로 합니다. 법령 개정이나 제도 운영 변경에 따라 내용이 달라질 수 있으며, "
    "개별 기업의 상황에 따라 적용 결과가 다를 수 있습니다. 실제 적용 전 전문가 상담을 권장합니다.",
    "C": AI_NOTICE + "\n\n"
    "※ 본 글은 공개 보도자료 및 공식 통계를 참고하여 작성되었으며, 개별 해석과 전망은 필자의 견해입니다.",
    "none": "",
}
LEVEL_A_KEYWORDS = ["절세", "세액공제", "법인세", "직무발명보상금", "보상금", "절감", "환급",
                    "만원", "억원", "천만원", "백만원"]
DISCLAIMER_LEVEL_LABELS = {
    "A": "강한 면책 (절세 사례)",
    "B": "기본 면책 (법률 해설)",
    "C": "약한 면책 (뉴스 분석)",
    "none": "면책 없음 (다이어리)",
}


def get_disclaimer_text(level: str, is_ai_generated: bool = True) -> str:
    t = DISCLAIMER_TEMPLATES.get(level)
    if not t:
        return ""
    return t if is_ai_generated else t.replace(AI_NOTICE + "\n\n", "", 1)


def determine_disclaimer_level(category_id: str, body: str, is_ai_generated: bool = True) -> dict:
    if category_id.startswith("CAT-C"):
        return {"level": "none", "text": ""}
    has_kw = any(k in body.lower() for k in LEVEL_A_KEYWORDS)
    has_amount = re.search(D + "+[만백천]?" + S + "*[억만원]", body) is not None
    if category_id == "CAT-A-01" or (has_kw and has_amount):
        lv = "A"
    elif category_id == "CAT-B-03":
        lv = "C"
    else:
        lv = "B"
    return {"level": lv, "label": DISCLAIMER_LEVEL_LABELS[lv], "text": get_disclaimer_text(lv, is_ai_generated)}


# ── publish-helpers.ts:273-277 / prompts.ts:1760-1807 ──
EMAIL_RE = re.compile("[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+\\.[A-Za-z0-9_]+")
DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "admin@"]


def enforce_email(text: str | None) -> str | None:
    if not text:
        return None
    return EMAIL_RE.sub(DIDIM_EMAIL, text)


def validate_generated_draft(text: str, prompt_key: str) -> list[dict]:
    warnings = []
    char_count = len(re.sub(S, "", text).encode("utf-16-le")) // 2
    if prompt_key == "PROMPT_LOUNGE_BITE" and char_count > 1200:
        warnings.append({"type": "char_count",
                         "message": f"IP 뉴스 한 입은 1,200자 이내여야 합니다. 현재 {char_count}자입니다."})
    if prompt_key == "PROMPT_DIARY":
        found = [k for k in DIARY_CTA_KEYWORDS if k in text]
        if found:
            warnings.append({"type": "cta_keyword",
                             "message": f"디딤 다이어리에 CTA 관련 키워드가 감지되었습니다: {', '.join(found)}"})
    emails = EMAIL_RE.findall(text)
    invalid = [e for e in emails if e != DIDIM_EMAIL]
    if invalid:
        warnings.append({"type": "email_mismatch",
                         "message": f"허용되지 않은 이메일 주소가 감지되었습니다: {', '.join(invalid)} (admin@didimip.com만 사용 가능)"})
    return warnings


# ── 카테고리 정본 (references/categories.md 와 동일) ──
CATEGORIES = [
    # id, 이름(네이버 표기), tier, parent, role_type, funnel_stage, cta_type, 비고
    ("CAT-INTRO", "디딤 소개", "primary", None, "fixed", "MULTI", "none", None),
    ("CAT-A", "변리사의 현장 수첩", "primary", None, "conversion", "ATTRACT", "direct", None),
    ("CAT-A-01", "절세 시뮬레이션", "secondary", "CAT-A", "conversion", "CONVERT", "direct", None),
    ("CAT-A-02", "인증 가이드", "secondary", "CAT-A", "conversion", "CONVERT", "direct", None),
    ("CAT-A-03", "연구소 운영 실무", "secondary", "CAT-A", "conversion", "CONVERT", "direct", None),
    ("CAT-A-04", "특허·상표 출원 실무", "secondary", "CAT-A", "conversion", None, "direct",
     "DB 시드(seed.sql)·UPGRADE_SPEC §5.1·briefing.ts 에 없음. role/cta 는 상위 CAT-A 와 FIELD_CTA 기준, funnel_stage 미정의"),
    ("CAT-B", "IP 라운지", "primary", None, "traffic_branding", "ATTRACT", "neighbor", None),
    ("CAT-B-01", "특허 전략 노트", "secondary", "CAT-B", "traffic_branding", "TRUST", "neighbor",
     "ID 충돌: 코드(FIELD_CTA·sub-category-pool)는 CAT-B-01=특허 전략 노트, DB 시드·브리핑 프롬프트는 CAT-B-01=AI와 IP. 이름으로 판단할 것"),
    ("CAT-B-02", "AI와 IP", "secondary", "CAT-B", "traffic_branding", "ATTRACT", "neighbor",
     "ID 충돌: 코드는 CAT-B-02=AI와 IP, DB 시드·브리핑 프롬프트는 CAT-B-02=특허 전략 노트. 이름으로 판단할 것"),
    ("CAT-B-03", "IP 뉴스 한 입", "secondary", "CAT-B", "traffic_branding", "ATTRACT", "neighbor", None),
    ("CAT-C", "디딤 다이어리", "primary", None, "trust", "TRUST", "none", None),
    ("CAT-C-01", "컨설팅 후기", "secondary", "CAT-C", "trust", "TRUST", "none", None),
    ("CAT-C-02", "디딤 일상", "secondary", "CAT-C", "trust", "TRUST", "none", None),
    ("CAT-C-03", "대표의 생각", "secondary", "CAT-C", "trust", "TRUST", "none", None),
    ("CAT-CONSULT", "상담 안내", "primary", None, "fixed", "CONVERT", "direct", None),
]
ROLE_LABELS = {"conversion": "전환형", "traffic_branding": "트래픽/브랜딩형", "trust": "신뢰형", "fixed": "고정"}
FUNNEL_LABELS = {"ATTRACT": "유입", "TRUST": "신뢰", "CONVERT": "전환", "MULTI": "복합"}
CTA_TYPE_LABELS = {"direct": "직접 CTA", "neighbor": "이웃 CTA", "none": "없음"}


def category_info(key: str) -> dict | None:
    rows = [r for r in CATEGORIES if key in (r[0], r[1])] or [r for r in CATEGORIES if key and key in r[1]]
    for cid, name, tier, parent, role, funnel, cta, note in rows[:1]:
        return {
            "id": cid, "name": name, "tier": tier, "parent_id": parent,
            "role_type": role, "role_label": ROLE_LABELS.get(role),
            "funnel_stage": funnel, "funnel_label": FUNNEL_LABELS.get(funnel),
            "cta_type": cta, "cta_type_label": CTA_TYPE_LABELS.get(cta), "note": note,
            "prompt_key": get_prompt_key(cid),
            "cta_allowed": not cid.startswith("CAT-C"),
            "field_cta": get_field_cta(cid) if not cid.startswith("CAT-C") else None,
            "disclaimer_default": determine_disclaimer_level(cid, "")["level"],
        }
    return None


def _read(path):
    if path and path != "-":
        with open(path, encoding="utf-8") as f:
            return f.read()
    return sys.stdin.read()


def main(argv=None):
    p = argparse.ArgumentParser(
        description="디딤 블로그 공통 규칙 계산기 (JSON 입출력).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""하위 명령과 입력 JSON:
  replace-names  {body}                         특허청 → 지식재산처 (보호 패턴 제외)
  prompt-key     {category_id}                  PROMPT_FIELD / LOUNGE_GENERAL / LOUNGE_BITE / DIARY
  field-cta      {category_id, target_keyword}  getFieldCta (초안 생성 시 CTA 문구)
  disclaimer     {category_id, body, is_ai_generated}  면책 레벨 A/B/C/none + 문구
  enforce-email  {text}                         이메일을 admin@didimip.com 으로 강제 치환
  check          {text, category_id}            validateGeneratedDraft (분량·다이어리 CTA·이메일)
  category       {key}                          카테고리 ID/이름으로 역할·퍼널·CTA 조회
  constants      {}                             디딤 상수 출력
--raw 를 주면 표준입력 텍스트를 body/text 로 사용한다.""",
    )
    p.add_argument("command", choices=["replace-names", "prompt-key", "field-cta", "disclaimer",
                                       "enforce-email", "check", "category", "constants"])
    p.add_argument("--input", "-i")
    p.add_argument("--raw", action="store_true")
    a = p.parse_args(argv)
    if a.raw:
        t = _read(a.input)
        d = {"body": t, "text": t}
    elif a.command == "constants":
        d = {}
    else:
        raw = _read(a.input)
        d = json.loads(raw) if raw.strip() else {}
    c = a.command
    cid = d.get("category_id") or ""
    if c == "replace-names":
        r = replace_deprecated_names(d.get("body") or "")
    elif c == "prompt-key":
        r = get_prompt_key(cid)
    elif c == "field-cta":
        r = get_field_cta(cid, d.get("target_keyword"))
    elif c == "disclaimer":
        r = determine_disclaimer_level(cid, d.get("body") or "", bool(d.get("is_ai_generated", True)))
    elif c == "enforce-email":
        r = enforce_email(d.get("text"))
    elif c == "check":
        r = validate_generated_draft(d.get("text") or d.get("body") or "", get_prompt_key(cid))
    elif c == "category":
        r = category_info(d.get("key") or cid)
    else:
        r = {"DIDIM_EMAIL": DIDIM_EMAIL, "DIDIM_PHONE": DIDIM_PHONE, "DIDIM_SIGNATURE": DIDIM_SIGNATURE,
             "DIDIM_PROFILE_NOH": DIDIM_PROFILE_NOH, "DIDIM_PROFILE_LEE": DIDIM_PROFILE_LEE}
    json.dump(r, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
