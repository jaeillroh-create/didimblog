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



# ── 발행 단계 CTA 템플릿 (publish-prep-client.tsx FALLBACK_CTA = migration 011) ──
_SIG = "특허그룹 디딤 | 기업을 아는 변리사"
_BAR = "━" * 18


def _cta(key, category_name, body_lines, subject):
    return {
        "key": key,
        "categoryName": category_name,
        "text": _BAR + "\n" + body_lines + "\n\n" + _SIG,
        "note": None,
        "conversionMethod": "이메일",
        "emailSubjectTag": subject,
    }


# publish-prep-client.tsx:53-126 (선언 순서 유지)
FALLBACK_CTA = [
    _cta("현장수첩_절세", "현장 수첩 · 절세 시뮬레이션",
         "\"우리 회사도 가능할까?\" 궁금하시다면 재무제표를 보내주세요.\n"
         "48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)\n\n"
         "📞 02-571-6613\n📧 admin@didimip.com (메일 제목에 '절세 시뮬레이션'이라고 적어주세요)",
         "절세 시뮬레이션"),
    _cta("현장수첩_인증", "현장 수첩 · 인증 가이드",
         "우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.\n\n"
         "📞 02-571-6613\n📧 admin@didimip.com (메일 제목에 '인증 진단'이라고 적어주세요)",
         "인증 진단"),
    _cta("현장수첩_출원", "현장 수첩 · 특허·상표 출원 실무",
         "출원 전략이 궁금하시면 편하게 연락 주세요.\n"
         "기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.\n\n"
         "📞 02-571-6613\n📧 admin@didimip.com (메일 제목에 '출원 상담'이라고 적어주세요)",
         "출원 상담"),
    _cta("현장수첩_연구소", "현장 수첩 · 연구소 운영",
         "연구소 운영 상태 점검, 무료 진단 가능합니다.\n\n"
         "📞 02-571-6613\n📧 admin@didimip.com (메일 제목에 '연구소 진단'이라고 적어주세요)",
         "연구소 진단"),
    _cta("IP라운지", "IP 라운지",
         "AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.\n\n"
         "📞 02-571-6613\n📧 admin@didimip.com",
         "상담 문의"),
]

# migration 011 시드 4건 = FALLBACK_CTA 의 동일 key 4건과 문자열 동일.
# getCtaTemplates()가 key 오름차순으로 읽으므로 런타임 DB 순서는 아래와 같다.
_FB = {t["key"]: t for t in FALLBACK_CTA}
DB_CTA_TEMPLATES_DEFAULT = [dict(_FB[k]) for k in ["IP라운지", "현장수첩_연구소", "현장수첩_인증", "현장수첩_절세"]]

# publish-prep-client.tsx:129-137
CTA_KEYWORD_MAP = [
    (re.compile("절세|세액공제|법인세|직무발명보상|비과세|보상금", re.I), "현장수첩_절세"),
    (re.compile("출원|상표|특허출원|등록|심사|우선심사|pct|디자인출원", re.I), "현장수첩_출원"),
    (re.compile("인증|벤처|이노비즈|메인비즈", re.I), "현장수첩_인증"),
    (re.compile("연구소|연구전담|koita|사후관리|연구활동", re.I), "현장수첩_연구소"),
    (re.compile("ai|인공지능|저작권|생성형", re.I), "IP라운지"),
    (re.compile("특허전략|포트폴리오|ip전략|기술가치", re.I), "IP라운지"),
    (re.compile("뉴스|분쟁|판례|정책변화", re.I), "IP라운지"),
]




# ─────────────────────────────────────────────────────────────
# 카테고리 정본 = 네이버 categoryNo (skills/_DECISIONS.md 1·2절, 2026-10-01 확정)
# CAT-* 는 코드(레거시) 별칭으로만 쓴다. legacy_alias 는 원본 함수(면책·포맷 가이드·
# 태그 접미사 등)에 넘길 때 쓰는 CAT-* 값이다.
# ─────────────────────────────────────────────────────────────
NAVER_CATEGORIES = [
    # categoryNo, 이름(네이버 문자열), 상위 categoryNo, 구분, 레거시 별칭(CAT-*), 신규 대응 categoryNo, 프롬프트 키, 역할, 퍼널
    {"no": 25, "name": "지원사업·인증과 특허", "parent": None, "kind": "new", "alias": "CAT-A", "maps_to": 25,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "유입+전환"},
    {"no": 27, "name": "출원·심판 실무", "parent": None, "kind": "new", "alias": "CAT-A-04", "maps_to": 27,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "전환"},
    {"no": 26, "name": "사례", "parent": None, "kind": "new", "alias": "CAT-A", "maps_to": 26,
     "prompt_key": "PROMPT_FIELD", "role": "신뢰+전환", "funnel": "신뢰+전환"},
    {"no": 24, "name": "지식재산 경영", "parent": None, "kind": "new", "alias": "CAT-B", "maps_to": 24,
     "prompt_key": "PROMPT_LOUNGE_GENERAL", "role": "트래픽/브랜딩형", "funnel": "유입"},
    {"no": 28, "name": "디딤 소식", "parent": None, "kind": "new", "alias": "CAT-B-03", "maps_to": 28,
     "prompt_key": "PROMPT_LOUNGE_BITE", "role": "트래픽", "funnel": "유입"},
    {"no": 17, "name": "디딤 다이어리", "parent": None, "kind": "diary", "alias": "CAT-C", "maps_to": 17,
     "prompt_key": "PROMPT_DIARY", "role": "신뢰형", "funnel": "신뢰"},
    {"no": 18, "name": "컨설팅 후기", "parent": 17, "kind": "diary", "alias": "CAT-C-01", "maps_to": 17,
     "prompt_key": "PROMPT_DIARY", "role": "신뢰형", "funnel": "신뢰"},
    {"no": 19, "name": "디딤 일상", "parent": 17, "kind": "diary", "alias": "CAT-C-02", "maps_to": 17,
     "prompt_key": "PROMPT_DIARY", "role": "신뢰형", "funnel": "신뢰"},
    {"no": 20, "name": "대표의 생각", "parent": 17, "kind": "diary", "alias": "CAT-C-03", "maps_to": 17,
     "prompt_key": "PROMPT_DIARY", "role": "신뢰형", "funnel": "신뢰"},
    {"no": 7, "name": "디딤 소개", "parent": None, "kind": "fixed", "alias": "CAT-INTRO", "maps_to": 7,
     "prompt_key": None, "role": "고정", "funnel": "복합"},
    {"no": 22, "name": "상담 안내", "parent": None, "kind": "fixed", "alias": "CAT-CONSULT", "maps_to": 22,
     "prompt_key": None, "role": "고정", "funnel": "전환"},
    {"no": 9, "name": "변리사의 현장 수첩", "parent": None, "kind": "legacy", "alias": "CAT-A", "maps_to": 25,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "유입"},
    {"no": 10, "name": "절세 시뮬레이션", "parent": 9, "kind": "legacy", "alias": "CAT-A-01", "maps_to": 25,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "전환"},
    {"no": 11, "name": "인증 가이드", "parent": 9, "kind": "legacy", "alias": "CAT-A-02", "maps_to": 25,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "전환"},
    {"no": 12, "name": "연구소 운영 실무", "parent": 9, "kind": "legacy", "alias": "CAT-A-03", "maps_to": 25,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "전환"},
    {"no": 23, "name": "특허·상표 출원 실무", "parent": 9, "kind": "legacy", "alias": "CAT-A-04", "maps_to": 27,
     "prompt_key": "PROMPT_FIELD", "role": "전환형", "funnel": "전환"},
    {"no": 13, "name": "IP 라운지", "parent": None, "kind": "legacy", "alias": "CAT-B", "maps_to": 24,
     "prompt_key": "PROMPT_LOUNGE_GENERAL", "role": "트래픽/브랜딩형", "funnel": "유입"},
    {"no": 14, "name": "특허 전략 노트", "parent": 13, "kind": "legacy", "alias": "CAT-B-01", "maps_to": 24,
     "prompt_key": "PROMPT_LOUNGE_GENERAL", "role": "트래픽/브랜딩형", "funnel": "신뢰"},
    {"no": 15, "name": "AI와 IP", "parent": 13, "kind": "legacy", "alias": "CAT-B-02", "maps_to": 24,
     "prompt_key": "PROMPT_LOUNGE_GENERAL", "role": "트래픽/브랜딩형", "funnel": "유입"},
    {"no": 16, "name": "IP 뉴스 한 입", "parent": 13, "kind": "legacy", "alias": "CAT-B-03", "maps_to": 28,
     "prompt_key": "PROMPT_LOUNGE_BITE", "role": "트래픽/브랜딩형", "funnel": "유입"},
]
# 코드 CAT-* → categoryNo (CAT-B-01/02 는 코드 런타임 기준 이름: B-01=특허 전략 노트, B-02=AI와 IP.
# DB 시드(seed.sql)는 반대이므로 CAT-B-01/02 단독 입력은 이름 확인이 필요하다.)
LEGACY_ID_TO_NO = {
    "CAT-INTRO": 7, "CAT-A": 9, "CAT-A-01": 10, "CAT-A-02": 11, "CAT-A-03": 12, "CAT-A-04": 23,
    "CAT-B": 13, "CAT-B-01": 14, "CAT-B-02": 15, "CAT-B-03": 16,
    "CAT-C": 17, "CAT-C-01": 18, "CAT-C-02": 19, "CAT-C-03": 20, "CAT-CONSULT": 22,
}
AMBIGUOUS_LEGACY_IDS = {"CAT-B-01", "CAT-B-02"}


def resolve_category(value) -> dict | None:
    """categoryNo(정수/숫자 문자열) · 네이버 이름 · CAT-* 별칭 → 정본 행(dict)."""
    if value is None or value == "":
        return None
    row = None
    s = str(value).strip()
    if s.isdigit():
        row = next((c for c in NAVER_CATEGORIES if c["no"] == int(s)), None)
    elif s in LEGACY_ID_TO_NO:
        row = next((c for c in NAVER_CATEGORIES if c["no"] == LEGACY_ID_TO_NO[s]), None)
        if row is not None:
            row = {**row, "warning": "CAT-B-01/02 는 소스마다 이름이 뒤바뀌어 있음 — 이름으로 확인 필요"} \
                if s in AMBIGUOUS_LEGACY_IDS else dict(row)
    else:
        row = next((c for c in NAVER_CATEGORIES if c["name"] == s), None)
        if row is None:
            norm = re.sub(r"\s+", "", s)
            row = next((c for c in NAVER_CATEGORIES if re.sub(r"\s+", "", c["name"]) == norm), None)
    if row is None:
        return None
    row = dict(row)
    row["cta_allowed"] = row["kind"] not in ("diary", "fixed")
    parent = next((c for c in NAVER_CATEGORIES if c["no"] == row["parent"]), None) if row["parent"] else None
    row["parent_name"] = parent["name"] if parent else None
    target = next(c for c in NAVER_CATEGORIES if c["no"] == row["maps_to"])
    row["maps_to_name"] = target["name"]
    return row


# ─────────────────────────────────────────────────────────────
# 신규 구조 CTA (skills/_DECISIONS.md 2절) — 원본 코드에 없는 스킬 규칙.
# 문구는 모두 기존 원문(FALLBACK_CTA = migration 011, seed_data/cta_templates.json
# "IP라운지" = UPGRADE_SPEC §5.2 NEIGHBOR, prompts.ts FIELD_CTA["CAT-B-03"])을 그대로 쓴다.
# ─────────────────────────────────────────────────────────────
NEIGHBOR_CTA = {
    "key": "이웃추가",
    "categoryName": "지식재산 경영 · 이웃 추가",
    "text": "━━━━━━━━━━━━━━━━━━\n이런 IP 이야기가 도움이 되셨다면 디딤 블로그를 이웃 추가해주세요.\n"
            "매주 화요일, 중소기업 대표님께 실질적인 IP 정보를 전해드립니다.\n\n"
            "IP 관련 상담이 필요하시면: admin@didimip.com\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "note": "원문: seed_data/cta_templates.json 'IP라운지' (= UPGRADE_SPEC §5.2 NEIGHBOR). '매주 화요일'은 현재 발행 요일과 맞는지 확인",
    "conversionMethod": "이웃 추가 유도 + 이메일 안내 → 장기 관계 유지",
    "emailSubjectTag": None,
}
BITE_CTA = {
    "key": "디딤소식_이웃추가",
    "categoryName": "디딤 소식 · 가벼운 이웃 추가",
    "text": "━━━━━━━━━━━━━━━━━━\nIP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "note": "문장 원문: prompts.ts FIELD_CTA['CAT-B-03'] + 구분선·서명(appendCtaAndSignature 모양). 포맷 가이드 '이웃 추가 유도 (2줄 이내)'",
    "conversionMethod": "이웃 추가",
    "emailSubjectTag": None,
}
_KEYS_25 = ["현장수첩_절세", "현장수첩_인증", "현장수첩_연구소"]
_DISCLAIMER_ALIAS_25 = {"현장수첩_절세": "CAT-A-01", "현장수첩_인증": "CAT-A-02", "현장수첩_연구소": "CAT-A-03"}


def cta_for_new_category(no: int, target_keyword: str | None, title: str | None = None,
                         office_news: bool = False, cta_templates: list[dict] | None = None) -> dict:
    """신규 구조 categoryNo 별 CTA. 반환: {template|None, matched_by, disclaimer_alias}."""
    pool: dict[str, dict] = {}
    for t in list(cta_templates or []) + FALLBACK_CTA:
        pool.setdefault(t["key"], t)
    texts = [(target_keyword or "").lower(), (title or "").lower()]
    if no in (17, 18, 19, 20):
        return {"template": None, "matched_by": "디딤 다이어리 — CTA 금지(절대원칙)", "disclaimer_alias": "CAT-C"}
    if no in (7, 22):
        return {"template": None, "matched_by": "고정 페이지 — 자동 생성 대상 아님", "disclaimer_alias": "CAT-INTRO"}
    if no == 25:
        for label, txt in zip(("타깃 키워드", "제목"), texts):
            if not txt:
                continue
            for pattern, key in CTA_KEYWORD_MAP:
                if key in _KEYS_25 and pattern.search(txt):
                    return {"template": pool[key], "matched_by": f"25 키워드 매칭({label}) → {key}",
                            "disclaimer_alias": _DISCLAIMER_ALIAS_25[key]}
        return {"template": pool["현장수첩_인증"], "matched_by": "25 기본값(키워드 불일치) → 현장수첩_인증",
                "disclaimer_alias": "CAT-A"}
    if no == 27:
        return {"template": pool["현장수첩_출원"], "matched_by": "27 출원 CTA", "disclaimer_alias": "CAT-A-04"}
    if no == 26:
        for label, txt in zip(("타깃 키워드", "제목"), texts):
            if not txt:
                continue
            for pattern, key in CTA_KEYWORD_MAP:
                if pattern.search(txt) and key in pool:
                    return {"template": pool[key], "matched_by": f"26 주제 키워드 매칭({label}) → {key}",
                            "disclaimer_alias": "CAT-A"}
        return {"template": pool["현장수첩_출원"], "matched_by": "26 기본값 → 현장수첩_출원", "disclaimer_alias": "CAT-A"}
    if no == 24:
        return {"template": NEIGHBOR_CTA, "matched_by": "24 이웃 추가 CTA", "disclaimer_alias": "CAT-B"}
    if no == 28:
        if office_news:
            return {"template": None, "matched_by": "28 사무소 소식 — CTA 없음", "disclaimer_alias": "CAT-B-03"}
        return {"template": BITE_CTA, "matched_by": "28 가벼운 이웃 추가 CTA", "disclaimer_alias": "CAT-B-03"}
    raise ValueError(f"신규 구조 categoryNo 가 아님: {no}")


def category_info(key) -> dict | None:
    """categoryNo / 네이버 이름 / CAT-* → 정본 행 + 프롬프트 키·CTA·면책 기본값."""
    row = resolve_category(key)
    if row is None:
        return None
    out = dict(row)
    if row["kind"] in ("new", "diary", "fixed"):
        v2 = cta_for_new_category(row["no"] if row["kind"] != "diary" else 17, None)
        out["cta_policy"] = v2["matched_by"]
        out["cta_default_key"] = v2["template"]["key"] if v2["template"] else None
        alias = v2["disclaimer_alias"]
    else:
        out["cta_policy"] = "레거시 — 원본 규칙(field-cta / 발행 화면 matchCtaForContent)에 CAT 별칭 사용"
        alias = row["alias"]
    out["disclaimer_default"] = determine_disclaimer_level(alias, "")["level"] if row["kind"] != "fixed" else None
    return out


def cta_for(category, target_keyword=None, title=None, office_news=False) -> dict:
    """[스킬 규칙] 카테고리별 발행본 CTA 1개를 고른다(_DECISIONS.md 2절)."""
    row = resolve_category(category)
    if row is None:
        return {"error": "카테고리를 찾을 수 없음"}
    if row["kind"] == "legacy":
        alias = row["alias"]
        f = get_field_cta(alias, target_keyword)
        return {"category": row["name"], "kind": "legacy", "generation_cta": f,
                "note": "레거시: 생성 단계 FIELD_CTA. 발행 화면 CTA 는 didim-blog-publish-prep match-cta(CAT 별칭)"}
    no = 17 if row["kind"] == "diary" else row["no"]
    r = cta_for_new_category(no, target_keyword, title, office_news)
    t = r["template"]
    return {"category": row["name"], "kind": row["kind"], "key": t["key"] if t else None,
            "text": enforce_email(t["text"]) if t else None,
            "email_subject": t.get("emailSubjectTag") if t else None,
            "matched_by": r["matched_by"], "disclaimer_alias": r["disclaimer_alias"]}


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
  category       {key}                          categoryNo/네이버 이름/CAT-* → 정본 행(구분·레거시 별칭·신규 대응·프롬프트 키·CTA 정책)
  cta            {category, target_keyword, title, office_news}  카테고리별 발행본 CTA(신규 구조 _DECISIONS 2절, 레거시는 FIELD_CTA)
  (disclaimer·prompt-key·field-cta 의 category_id 자리에 네이버 이름/categoryNo 를 넣으면 레거시 별칭으로 바꿔 계산)
  constants      {}                             디딤 상수 출력
--raw 를 주면 표준입력 텍스트를 body/text 로 사용한다.""",
    )
    p.add_argument("command", choices=["replace-names", "prompt-key", "field-cta", "disclaimer",
                                       "enforce-email", "check", "category", "cta", "constants"])
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
    raw_cat = d.get("category") if d.get("category") not in (None, "") else (cid if cid and not cid.startswith("CAT-") else None)
    row = resolve_category(raw_cat) if raw_cat is not None else None
    if row is not None and c in ("disclaimer", "prompt-key", "field-cta", "check"):
        if row["kind"] in ("new",):
            cid = cta_for_new_category(row["no"], d.get("target_keyword"), d.get("title"),
                                       bool(d.get("office_news")))["disclaimer_alias"]
        else:
            cid = row["alias"]
    if c == "replace-names":
        r = replace_deprecated_names(d.get("body") or "")
    elif c == "prompt-key":
        r = row["prompt_key"] if row is not None else get_prompt_key(cid)
    elif c == "field-cta":
        r = get_field_cta(cid, d.get("target_keyword"))
    elif c == "disclaimer":
        r = determine_disclaimer_level(cid, d.get("body") or "", bool(d.get("is_ai_generated", True)))
    elif c == "enforce-email":
        r = enforce_email(d.get("text"))
    elif c == "check":
        pk = row["prompt_key"] if row is not None and row["prompt_key"] else get_prompt_key(cid)
        r = validate_generated_draft(d.get("text") or d.get("body") or "", pk)
    elif c == "category":
        r = category_info(d.get("key") or d.get("category") or cid)
    elif c == "cta":
        r = cta_for(d.get("category") or cid, d.get("target_keyword"), d.get("title"), bool(d.get("office_news")))
    else:
        r = {"DIDIM_EMAIL": DIDIM_EMAIL, "DIDIM_PHONE": DIDIM_PHONE, "DIDIM_SIGNATURE": DIDIM_SIGNATURE,
             "DIDIM_PROFILE_NOH": DIDIM_PROFILE_NOH, "DIDIM_PROFILE_LEE": DIDIM_PROFILE_LEE}
    json.dump(r, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
