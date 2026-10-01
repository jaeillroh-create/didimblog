#!/usr/bin/env python3
"""Phase 3 이후 자동 마무리 — 원본 TS 충실 포팅.

원본
  src/lib/client-generate.ts : cleanFinalText, appendCtaAndSignature, DEFAULT_TAGS_BY_CATEGORY,
                               determineDisclaimerLevel, getDisclaimerText, generateAutoTags
  src/lib/constants/name-mappings.ts : replaceDeprecatedNames ('특허청'→'지식재산처')
  src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx : runPhase3 후처리
     (Phase 3 결과 200자 미만 폴백, 이미지 마커 손실 복원, 마무리 저장값 계산)

하위 명령 (출력 JSON)
  finalize  --phase2-file p2.md --phase3-file p3.md --category-id CAT-A-01 --keyword "..." --title "..."
            [--outline-file outline.json] [--keep-edit-comments] [--today 2026-10-01]
  clean     --body-file body.md                       (cleanFinalText)
  disclaimer --body-file body.md --category-id CAT-B   [--not-ai]
  tags      --category-id CAT-A-01 --keyword "..." [--outline-file outline.json]
  edit-comments --body-file body.md                   (<!-- 수정: --> 주석 분리 — 스킬 확장)

finalize 는 runPhase3 의 순서를 그대로 따른다. 단, (1) Phase 3 의 `<!-- 수정: ... -->` 주석을
본문에서 분리해 edit_notes 로 돌려주는 것과 (2) 발행예정일을 UTC 변환 없이 계산하는 것은
스킬 쪽 변경이다(--keep-edit-comments 로 (1)을 끌 수 있음). docs/skills-spec 8절 참조.
"""

import argparse
import datetime as dt
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from jscompat import (  # noqa: E402
    DIGIT, WS, js_replace_first, js_split_ws, js_trim, js_trim_end, u16_slice_prefix, u16_to_index, u16len,
)
from paragraph_ids import strip_paragraph_ids  # noqa: E402
from pipeline_utils import get_field_cta, get_prompt_key  # noqa: E402

# ── name-mappings.ts ──
DEPRECATED_NAMES = [{
    "old": "특허청",
    "current": "지식재산처",
    "protected": [
        r"특허청장이" + WS + r"*정하는",
        r"구" + WS + r"*특허청",
        r"당시" + WS + r"*특허청",
        r"특허청" + WS + r"*\(현",
        r"「[^」]*특허청[^」]*」",
    ],
}]


def replace_deprecated_names(body: str) -> str:
    result = body
    for entry in DEPRECATED_NAMES:
        tokens = []
        for pat in entry["protected"]:
            def _tok(m):
                tokens.append(m.group(0))
                return f"__PROTECTED_NAME_{len(tokens) - 1}__"
            result = re.sub(pat, _tok, result)
        result = result.replace(entry["old"], entry["current"])
        for i, t in enumerate(tokens):
            result = js_replace_first(result, f"__PROTECTED_NAME_{i}__", t)
    return result


# ── cleanFinalText ──
def clean_final_text(body: str) -> str:
    t = replace_deprecated_names(body)
    s, d = WS, DIGIT
    t = re.sub(rf"조{s}*특{s}*법{s}*제{s}*{d}+{s}*조(?:{s}*의{s}*{d}+)?{s}*\({s}*확인{s}*필요[^)]*\)",
               "조세특례제한법 관련 규정", t)
    t = re.sub(rf"조세{s}*특례{s}*제한{s}*법{s}*제{s}*{d}+{s}*조(?:{s}*의{s}*{d}+)?{s}*\({s}*확인{s}*필요[^)]*\)",
               "조세특례제한법 관련 규정", t)
    t = re.sub(rf"시행령{s}*제{s}*{d}+{s}*조(?:{s}*의{s}*{d}+)?{s}*\({s}*확인{s}*필요[^)]*\)",
               "관련 시행령 규정", t)
    t = re.sub(rf"시행규칙{s}*제{s}*{d}+{s}*조(?:{s}*의{s}*{d}+)?{s}*\({s}*확인{s}*필요[^)]*\)",
               "관련 시행규칙", t)
    t = re.sub(rf"별지{s}*제{s}*[0-9]+{s}*호{s}*서식{s}*\({s}*확인{s}*필요[^)]*\)",
               "관련 별지 서식 (관할 세무서/홈택스에서 최신본 확인 권장)", t)
    t = re.sub(rf"{s}*\({s}*확인{s}*필요[^)]*\){s}*", " ", t)
    t = re.sub(rf"{s}*\({s}*미확인[^)]*\){s}*", " ", t)
    t = re.sub(rf"{s}*\({s}*확정{s}*아님[^)]*\){s}*", " ", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t


DEFAULT_TAGS_BY_CATEGORY = {
    "PROMPT_FIELD": ["직무발명보상", "법인세절감", "중소기업절세", "변리사", "특허출원", "기업부설연구소", "벤처기업인증"],
    "PROMPT_LOUNGE_GENERAL": ["지식재산", "특허전략", "IP라운지", "AI특허", "스타트업특허", "기업IP", "변리사칼럼"],
    "PROMPT_LOUNGE_BITE": ["IP뉴스", "특허이슈", "지식재산트렌드", "특허개정", "한입IP", "변리사칼럼", "IP라운지"],
    "PROMPT_DIARY": [],
}
BRAND_TAGS = ["특허그룹디딤", "디딤변리사"]


def _norm_tag(t: str) -> str:
    return re.sub(r"^#", "", re.sub(WS + "+", "", t), count=1)


def append_cta_and_signature(body, prompt_key, cta_text=None, email_subject=None,
                             target_keyword=None, disclaimer_text=None) -> str:
    if prompt_key == "PROMPT_DIARY":
        return clean_final_text(body)
    if not body or u16len(re.sub(WS, "", body)) < 50:
        return body or ""
    cleaned = clean_final_text(body)

    llm_tags = []
    m = re.search(r"\[TAGS\]([\s\S]*?)\[/TAGS\]", cleaned)
    body_wo = cleaned
    if m:
        llm_tags = [js_trim(re.sub(r"^" + DIGIT + r"+\." + WS + "*", "", x, count=1))
                    for x in re.split(r"[,\n#]", m.group(1))]
        llm_tags = [x for x in llm_tags if x]
        body_wo = js_trim_end(js_replace_first(cleaned, m.group(0), ""))

    keyword = _norm_tag(target_keyword or "")
    ordered, seen = [], set()

    def push(t):
        n = _norm_tag(t)
        if not n or n in seen:
            return
        seen.add(n)
        ordered.append(n)

    if keyword:
        push(keyword)
    for t in llm_tags:
        push(t)
    for t in DEFAULT_TAGS_BY_CATEGORY.get(prompt_key, []):
        push(t)
    for t in BRAND_TAGS:
        push(t)

    merged = ordered[:10]
    for b in BRAND_TAGS:
        if _norm_tag(b) not in merged:
            merged = merged[:9] + [_norm_tag(b)]
    tag_line = " ".join(f"#{t}" for t in merged)

    disclaimer = js_trim(disclaimer_text or "") if disclaimer_text else ""
    cta = js_trim(cta_text) if cta_text and js_trim(cta_text) else \
        "관련해서 궁금하신 점이 있다면 admin@didimip.com 으로 편하게 연락주세요."
    subject = js_trim(email_subject) if email_subject and js_trim(email_subject) else "상담 문의"
    disclaimer_block = f"\n\n{disclaimer}\n" if disclaimer else ""
    block = (
        f"\n{disclaimer_block}\n━━━━━━━━━━━━━━━━━━\n{cta}\n\n"
        "특허그룹 디딤 | 기업을 아는 변리사\n📞 02-571-6613\n"
        f"📧 admin@didimip.com (메일 제목: '{subject}')\n\n{tag_line}"
    )
    return js_trim_end(body_wo) + block


# ── Disclaimer ──
AI_NOTICE = "* 본 글은 AI 도구의 도움을 받아 작성되었으며, 변리사가 검수하였습니다."
DISCLAIMER_TEMPLATES = {
    "A": AI_NOTICE + "\n\n※ 본 글에 제시된 사례와 수치는 특정 조건의 개별 기업 상황을 기반으로 하며, 모든 기업에 동일하게 적용되지 않습니다. "
         "직무발명보상 제도의 세제 혜택은 기업의 매출, 비용 구조, 연구개발 실태, 직무발명 규정의 정비 수준 등에 따라 달라집니다.\n\n"
         "실제 세무 신고는 귀사의 세무사와 협의하여 진행하시기 바라며, 본 글은 제도 이해를 위한 일반적인 정보 제공 목적입니다. "
         "구체적인 절세 설계는 개별 상담을 통해 확인 가능합니다.",
    "B": AI_NOTICE + "\n\n※ 본 내용은 작성 시점의 법령 및 제도를 기준으로 합니다. 법령 개정이나 제도 운영 변경에 따라 내용이 달라질 수 있으며, "
         "개별 기업의 상황에 따라 적용 결과가 다를 수 있습니다. 실제 적용 전 전문가 상담을 권장합니다.",
    "C": AI_NOTICE + "\n\n※ 본 글은 공개 보도자료 및 공식 통계를 참고하여 작성되었으며, 개별 해석과 전망은 필자의 견해입니다.",
    "none": "",
}
LEVEL_A_KEYWORDS = ["절세", "세액공제", "법인세", "직무발명보상금", "보상금", "절감", "환급", "만원", "억원", "천만원", "백만원"]


def _disc(level, is_ai):
    t = DISCLAIMER_TEMPLATES[level]
    return t if is_ai else js_replace_first(t, AI_NOTICE + "\n\n", "")


def determine_disclaimer_level(category_id: str, body: str, is_ai_generated: bool = True):
    if category_id.startswith("CAT-C"):
        return {"level": "none", "text": ""}
    body_lower = body.lower()
    has_a = any(kw in body_lower for kw in LEVEL_A_KEYWORDS)
    has_amount = re.search(DIGIT + r"+[만백천]?" + WS + r"*[억만원]", body) is not None
    if category_id == "CAT-A-01" or (has_a and has_amount):
        return {"level": "A", "text": _disc("A", is_ai_generated)}
    if category_id == "CAT-B-03":
        return {"level": "C", "text": _disc("C", is_ai_generated)}
    return {"level": "B", "text": _disc("B", is_ai_generated)}


def _category_suffixes(category_id: str):
    if category_id.startswith("CAT-A"):
        return ["절세", "세액공제", "중소기업", "방법"]
    if category_id.startswith("CAT-B"):
        return ["전략", "트렌드", "가이드", "분석"]
    return ["후기", "이야기"]


def generate_auto_tags(prompt_key, target_keyword=None, phase1_outline=None, category_id=None):
    if prompt_key == "PROMPT_DIARY":
        return list(BRAND_TAGS)
    tags, seen = [], set()

    def push(raw):
        t = _norm_tag(raw)
        if not t or u16len(t) < 2 or t in seen:
            return
        seen.add(t)
        tags.append(t)

    kw = js_trim(target_keyword or "")
    if kw:
        push(kw)
        words = [w for w in js_split_ws(kw) if u16len(w) >= 2]
        if len(words) >= 2:
            push("".join(words[-2:]))
            push("".join(words))
        for suffix in _category_suffixes(category_id or ""):
            push(_norm_tag(kw) + suffix)
            if len(tags) >= 5:
                break
    if phase1_outline and phase1_outline.get("keyword_plan"):
        positions = phase1_outline["keyword_plan"].get("positions") or []
        for pos in positions:
            after = ":".join(pos.split(":")[1:]) if ":" in pos else pos
            cleaned = js_trim(re.sub(r"[,()]", "", after))
            if u16len(cleaned) >= 2:
                push(cleaned)
            if len(tags) >= 8:
                break
    for d in DEFAULT_TAGS_BY_CATEGORY.get(prompt_key, []):
        push(d)
        if len(tags) >= 8:
            break
    for b in BRAND_TAGS:
        push(b)
    return tags[:10]


# ── 에디터 runPhase3 후처리 ──
MARKER_BLOCK_RE = re.compile(r"━━ 📷 이미지[^\n]*━━[\s\S]*?━━━━━━━━━━━━━━")


def restore_lost_markers(pre_body: str, phase3_body: str):
    """Phase 3 가 이미지 마커 블록을 잃으면 Phase 2.5 마커를 균등 위치에 재삽입."""
    pre = MARKER_BLOCK_RE.findall(pre_body)
    if not pre:
        return phase3_body, 0
    post_count = len(MARKER_BLOCK_RE.findall(phase3_body))
    if post_count >= len(pre):
        return phase3_body, 0
    restored = phase3_body
    for i in range(len(pre) - 1, -1, -1):
        block = pre[i]
        if u16_slice_prefix(block, 30) in restored:
            continue
        fraction = (i + 1) / (len(pre) + 1)
        approx_u16 = int((u16len(restored) * fraction) // 1)
        start = u16_to_index(restored, approx_u16)
        near = restored.find("\n\n", start)
        if near != -1 and u16len(restored[:near]) < u16len(restored) - 100:
            restored = restored[:near] + "\n\n" + block + restored[near:]
        else:
            restored += "\n\n" + block
    return restored, len(pre) - post_count


EDIT_COMMENT_RE = re.compile(r"<!--" + WS + r"*수정" + WS + r"*:([\s\S]*?)-->")


def extract_edit_comments(body: str):
    notes = [js_trim(m.group(1)) for m in EDIT_COMMENT_RE.finditer(body)]
    out = EDIT_COMMENT_RE.sub("", body)
    out = re.sub(r"[ \t]+\n", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out, notes


def next_tuesday(today: dt.date) -> dt.date:
    delta = (1 - today.weekday()) % 7  # Monday=0, Tuesday=1
    return today + dt.timedelta(days=delta or 7)


def finalize(phase2_body, phase3_body, category_id, keyword, title, outline=None,
             keep_edit_comments=False, today=None):
    warnings = []
    prompt_key = get_prompt_key(category_id)
    clean_body = strip_paragraph_ids(phase2_body)
    body = phase3_body
    if u16len(re.sub(WS, "", body)) < 200:
        body = clean_body
        warnings.append("Phase 3 결과가 너무 짧아 Phase 2 원본을 사용합니다")
    body, restored = restore_lost_markers(clean_body, body)
    if restored:
        warnings.append(f"Phase 3에서 손실된 인포그래픽 마커 {restored}개를 복원했습니다")
    edit_notes = []
    if not keep_edit_comments:
        body, edit_notes = extract_edit_comments(body)
    disclaimer = determine_disclaimer_level(category_id, body, True)
    cta = get_field_cta(category_id, keyword)
    final_body = append_cta_and_signature(body, prompt_key, cta["cta"], cta["emailSubject"], keyword,
                                          disclaimer["text"])
    tags = generate_auto_tags(prompt_key, keyword, outline, category_id)
    body_for_save = strip_paragraph_ids(final_body)
    if u16len(re.sub(WS, "", body_for_save)) < 200:
        warnings.append(f"본문이 너무 짧습니다 ({u16len(re.sub(WS, '', body_for_save))}자). 저장을 중단합니다.")
    return {
        "prompt_key": prompt_key,
        "title": title,
        "final_body": final_body,
        "body_for_save": body_for_save,
        "tags": tags,
        "disclaimer_level": disclaimer["level"],
        "cta": cta,
        "edit_notes": edit_notes,
        "markers_restored": restored,
        "publish_date": next_tuesday(today or dt.date.today()).isoformat(),
        "status_after_save": "S1",
        "warnings": warnings,
    }


def _read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser(description="Phase 3 이후 자동 마무리 (CTA·서명·면책·태그·마커 복원)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("finalize")
    s.add_argument("--phase2-file", required=True, help="Phase 3 직전 본문(문단 ID 포함 가능)")
    s.add_argument("--phase3-file", required=True, help="Phase 3 결과 본문")
    s.add_argument("--category-id", required=True)
    s.add_argument("--keyword", default="")
    s.add_argument("--title", default="")
    s.add_argument("--outline-file")
    s.add_argument("--keep-edit-comments", action="store_true")
    s.add_argument("--today", help="YYYY-MM-DD (발행예정일 계산 기준, 기본 오늘)")
    s = sub.add_parser("clean"); s.add_argument("--body-file", required=True)
    s = sub.add_parser("disclaimer")
    s.add_argument("--body-file", required=True); s.add_argument("--category-id", required=True)
    s.add_argument("--not-ai", action="store_true")
    s = sub.add_parser("tags")
    s.add_argument("--category-id", required=True); s.add_argument("--keyword", default="")
    s.add_argument("--outline-file")
    s = sub.add_parser("edit-comments"); s.add_argument("--body-file", required=True)
    a = ap.parse_args()

    if a.cmd == "finalize":
        outline = json.loads(_read(a.outline_file)) if a.outline_file else None
        today = dt.date.fromisoformat(a.today) if a.today else None
        out = finalize(_read(a.phase2_file), _read(a.phase3_file), a.category_id, a.keyword, a.title,
                       outline, a.keep_edit_comments, today)
    elif a.cmd == "clean":
        out = {"body": clean_final_text(_read(a.body_file))}
    elif a.cmd == "disclaimer":
        out = determine_disclaimer_level(a.category_id, _read(a.body_file), not a.not_ai)
    elif a.cmd == "tags":
        outline = json.loads(_read(a.outline_file)) if a.outline_file else None
        out = {"tags": generate_auto_tags(get_prompt_key(a.category_id), a.keyword, outline, a.category_id)}
    else:
        body, notes = extract_edit_comments(_read(a.body_file))
        out = {"body": body, "edit_notes": notes}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
