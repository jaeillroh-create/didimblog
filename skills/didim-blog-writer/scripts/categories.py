#!/usr/bin/env python3
"""발행 카테고리 해석기 — skills/_DECISIONS.md (2026-10-01) 1·2절 반영.

정본 ID = 네이버 categoryNo. 코드의 CAT-* 는 '레거시 별칭'으로만 쓴다.
입력은 categoryNo("25"), 네이버 카테고리 이름("지원사업·인증과 특허"), 코드 ID("CAT-A-01") 모두 받는다.

반환(dict)
  category_no      네이버 categoryNo (코드 ID 입력이면 대응 번호, 없으면 None)
  name             실제 발행 카테고리 이름 (프롬프트 {{category_name}} 과 이름 치환에 사용)
  structure        "new" | "legacy" | "code"(CAT-* 직접 입력 — 원본 코드 동작 그대로)
  prompt_key       PROMPT_FIELD | PROMPT_LOUNGE_GENERAL | PROMPT_LOUNGE_BITE | PROMPT_DIARY
  alias            원본 코드 함수(면책 레벨·태그 접미사·validateDraft)에 넘길 CAT-* 별칭
  cta_mode         "field"(getFieldCta(alias, 키워드)) | "fixed"(cta 고정) | "support"(지원사업 허브 키워드 매칭) | "none"
  cta              cta_mode 가 fixed 일 때의 {cta, emailSubject}
  requires_case_memo  사례(26) — 사용자 사건 메모 없이는 작성 금지
  no_cta           CTA·서명 금지 (다이어리, 디딤 소식의 사무소 소식)

사용법
  python3 categories.py --category 25
  python3 categories.py --category "디딤 소식" --news-kind office
"""

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "data", "prompts.json"), encoding="utf-8") as _f:
    _P = json.load(_f)
FIELD_CTA = _P["FIELD_CTA"]

# USER_PROMPTS.PROMPT_LOUNGE_GENERAL 의 이웃 추가 CTA 문구 (prompts.ts:1362) — 지식재산 경영용
NEIGHBOR_CTA_LOUNGE = {
    "cta": "이웃 추가 해두시면 매주 대표님의 IP 리스크를 줄여주는 실전 칼럼을 받아보실 수 있습니다.",
    "emailSubject": "상담 문의",
}

# categoryNo → 정의 (_DECISIONS.md 1·2절)
CATEGORIES = {
    # ── 신규 구조 (우선) ──
    25: dict(name="지원사업·인증과 특허", structure="new", prompt_key="PROMPT_FIELD", alias="CAT-A", cta_mode="support"),
    27: dict(name="출원·심판 실무", structure="new", prompt_key="PROMPT_FIELD", alias="CAT-A",
             cta_mode="fixed", cta=FIELD_CTA["CAT-A-04"]),
    26: dict(name="사례", structure="new", prompt_key="PROMPT_FIELD", alias="CAT-A", cta_mode="field",
             requires_case_memo=True),
    24: dict(name="지식재산 경영", structure="new", prompt_key="PROMPT_LOUNGE_GENERAL", alias="CAT-B",
             cta_mode="fixed", cta=NEIGHBOR_CTA_LOUNGE),
    28: dict(name="디딤 소식", structure="new", prompt_key="PROMPT_LOUNGE_BITE", alias="CAT-B-03",
             cta_mode="fixed", cta=FIELD_CTA["CAT-B-03"]),
    17: dict(name="디딤 다이어리", structure="new", prompt_key="PROMPT_DIARY", alias="CAT-C", cta_mode="none"),
    18: dict(name="컨설팅 후기", structure="new", prompt_key="PROMPT_DIARY", alias="CAT-C-01", cta_mode="none"),
    19: dict(name="디딤 일상", structure="new", prompt_key="PROMPT_DIARY", alias="CAT-C-02", cta_mode="none"),
    20: dict(name="대표의 생각", structure="new", prompt_key="PROMPT_DIARY", alias="CAT-C-03", cta_mode="none"),
    # ── 레거시 (사용자가 지정하면 그대로) ──
    9: dict(name="변리사의 현장 수첩", structure="legacy", prompt_key="PROMPT_FIELD", alias="CAT-A", cta_mode="field"),
    10: dict(name="절세 시뮬레이션", structure="legacy", prompt_key="PROMPT_FIELD", alias="CAT-A-01", cta_mode="field"),
    11: dict(name="인증 가이드", structure="legacy", prompt_key="PROMPT_FIELD", alias="CAT-A-02", cta_mode="field"),
    12: dict(name="연구소 운영 실무", structure="legacy", prompt_key="PROMPT_FIELD", alias="CAT-A-03", cta_mode="field"),
    23: dict(name="특허·상표 출원 실무", structure="legacy", prompt_key="PROMPT_FIELD", alias="CAT-A-04", cta_mode="field"),
    13: dict(name="IP 라운지", structure="legacy", prompt_key="PROMPT_LOUNGE_GENERAL", alias="CAT-B", cta_mode="field"),
    # 코드의 CAT-B-01/02 는 seed.sql 과 FIELD_CTA 주석이 뒤바뀌어 있어, CTA 는 이름의 의미로 고정한다
    14: dict(name="특허 전략 노트", structure="legacy", prompt_key="PROMPT_LOUNGE_GENERAL", alias="CAT-B",
             cta_mode="fixed", cta=FIELD_CTA["CAT-B-01"]),
    15: dict(name="AI와 IP", structure="legacy", prompt_key="PROMPT_LOUNGE_GENERAL", alias="CAT-B",
             cta_mode="fixed", cta=FIELD_CTA["CAT-B-02"]),
    16: dict(name="IP 뉴스 한 입", structure="legacy", prompt_key="PROMPT_LOUNGE_BITE", alias="CAT-B-03", cta_mode="field"),
    # 고정 페이지 — 자동 생성 대상 아님
    7: dict(name="디딤 소개", structure="fixed_page"),
    22: dict(name="상담 안내", structure="fixed_page"),
}

# 코드 CAT-* → categoryNo (seed.sql 이름 기준)
CODE_TO_NO = {
    "CAT-INTRO": 7, "CAT-CONSULT": 22,
    "CAT-A": 9, "CAT-A-01": 10, "CAT-A-02": 11, "CAT-A-03": 12, "CAT-A-04": 23,
    "CAT-B": 13, "CAT-B-01": 15, "CAT-B-02": 14, "CAT-B-03": 16,
    "CAT-C": 17, "CAT-C-01": 18, "CAT-C-02": 19, "CAT-C-03": 20,
}


def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "")


def _code_prompt_key(cid: str) -> str:
    # prompts.ts getPromptKey 와 동일
    if cid == "CAT-A" or cid.startswith("CAT-A-"):
        return "PROMPT_FIELD"
    if cid == "CAT-B-03":
        return "PROMPT_LOUNGE_BITE"
    if cid == "CAT-B" or cid.startswith("CAT-B-"):
        return "PROMPT_LOUNGE_GENERAL"
    if cid == "CAT-C" or cid.startswith("CAT-C-"):
        return "PROMPT_DIARY"
    return "PROMPT_LOUNGE_GENERAL"


def resolve(value: str, news_kind: str = "ip") -> dict:
    v = (value or "").strip()
    if v.upper().startswith("CAT-"):
        cid = v.upper()
        no = CODE_TO_NO.get(cid)
        name = CATEGORIES[no]["name"] if no in CATEGORIES else ""
        key = _code_prompt_key(cid)
        return dict(input=v, category_no=no, name=name, structure="code", prompt_key=key, alias=cid,
                    cta_mode="none" if key == "PROMPT_DIARY" else "field", cta=None,
                    requires_case_memo=False, no_cta=key == "PROMPT_DIARY")
    no = None
    if v.isdigit():
        no = int(v)
    else:
        for k, d in CATEGORIES.items():
            if _norm(d["name"]) == _norm(v):
                no = k
                break
    if no not in CATEGORIES:
        raise ValueError(f"알 수 없는 카테고리: {value!r} (categoryNo, 네이버 카테고리 이름, CAT-* 중 하나)")
    d = dict(CATEGORIES[no])
    if d["structure"] == "fixed_page":
        raise ValueError(f"'{d['name']}'은(는) 고정 페이지라 자동 생성 대상이 아닙니다")
    out = dict(input=v, category_no=no, name=d["name"], structure=d["structure"], prompt_key=d["prompt_key"],
               alias=d["alias"], cta_mode=d["cta_mode"], cta=d.get("cta"),
               requires_case_memo=d.get("requires_case_memo", False), no_cta=d["cta_mode"] == "none")
    if no == 28 and news_kind == "office":
        # 디딤 소식의 사무소 소식 — 다이어리처럼 CTA 없음 (_DECISIONS.md 5절)
        out.update(cta_mode="none", cta=None, no_cta=True, news_kind="office")
    elif no == 28:
        out["news_kind"] = "ip"
    return out


def resolve_cta(cat: dict, keyword: str = ""):
    """카테고리별 CTA. field 모드는 원본 getFieldCta(alias, keyword)."""
    mode = cat["cta_mode"]
    if mode == "none":
        return None
    if mode == "fixed":
        return cat["cta"]
    kw = (keyword or "").lower()
    if mode == "support":
        # 지원사업·인증과 특허: 인증 진단·연구소 진단·절세 시뮬레이션 중 키워드 매칭 (기본: 인증 진단)
        if any(k in kw for k in ("절세", "세액공제", "법인세", "보상금")):
            return FIELD_CTA["CAT-A-01"]
        if any(k in kw for k in ("연구소", "연구활동", "사후관리")):
            return FIELD_CTA["CAT-A-03"]
        return FIELD_CTA["CAT-A-02"]
    sys.path.insert(0, HERE)
    from pipeline_utils import get_field_cta  # 순환 import 방지용 지연 import
    return get_field_cta(cat["alias"], keyword)


# ── 프롬프트 속 카테고리 이름 치환 (신규 구조일 때만) ──
def name_substitutions(cat: dict):
    """원본 프롬프트의 '자기 카테고리 정체성' 문구만 실제 발행 이름으로 바꾸는 (원문, 치환) 목록."""
    if cat["structure"] != "new":
        return []
    n = cat["name"]
    key = cat["prompt_key"]
    if key == "PROMPT_FIELD":
        return [('"변리사의 현장 수첩" 카테고리', f'"{n}" 카테고리'), ("변리사의 현장 수첩 — ", f"{n} — ")]
    if key == "PROMPT_LOUNGE_GENERAL":
        return [('"IP 라운지" 카테고리', f'"{n}" 카테고리'), ("IP 라운지 — ", f"{n} — ")]
    if key == "PROMPT_LOUNGE_BITE":
        return [('"IP 라운지" 카테고리', f'"{n}" 카테고리'), ("IP 뉴스 한 입 — ", f"{n}(IP 뉴스 한 입) — ")]
    return []  # 디딤 다이어리는 이름이 같다


def apply_name_substitutions(text: str, subs) -> str:
    for old, new in subs:
        text = text.replace(old, new)
    return text


def main():
    ap = argparse.ArgumentParser(description="발행 카테고리 해석 (_DECISIONS.md 기준: categoryNo 정본, CAT-* 레거시 별칭)")
    ap.add_argument("--category", required=True, help='categoryNo(예: 25) / 이름(예: "출원·심판 실무") / CAT-* ')
    ap.add_argument("--news-kind", choices=["ip", "office"], default="ip", help="디딤 소식(28): ip=IP 뉴스 한 입, office=사무소 소식")
    ap.add_argument("--keyword", default="")
    a = ap.parse_args()
    try:
        cat = resolve(a.category, a.news_kind)
    except ValueError as e:
        json.dump({"ok": False, "error": str(e)}, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        sys.exit(2)
    cat["resolved_cta"] = resolve_cta(cat, a.keyword)
    cat["name_substitutions"] = name_substitutions(cat)
    json.dump({"ok": True, **cat}, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
