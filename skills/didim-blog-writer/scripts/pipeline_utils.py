#!/usr/bin/env python3
"""초안 생성 파이프라인 헬퍼 — 프롬프트 조립·파싱을 원본 TS 와 동일하게 수행.

원본: src/lib/constants/prompts.ts (getPromptKey, getFieldCta, 프롬프트 상수)
      src/lib/client-generate.ts (replaceTemplate, parsePhase1Json, clientRunPhase1/2/3, findOverlap)
      src/lib/generation-runner.ts / src/actions/ai.ts (LEGACY 단일 프롬프트 조립)
      src/actions/briefing.ts, src/actions/file-upload.ts (브리핑 프롬프트·JSON 파싱·검증)
프롬프트 원문 데이터: scripts/data/prompts.json (prompts.ts 런타임 값 덤프)

하위 명령 (출력은 모두 JSON)
  prompt-key   --category-id CAT-B-03
  cta          --category-id CAT-A --keyword "직무발명보상금 절세"
  render       --phase phase1|phase1-retry|phase2|continuation|phase3|legacy|briefing|briefing-file|briefing-vision
               [--category-id ..] [--category-name ..] [--topic ..] [--keyword ..]
               [--outline-file outline.json] [--body-file body.md] [--context-file ctx.txt]
               [--audience ..] [--doc-file doc.txt] [--force-category CAT-A]
  parse-phase1 --file raw.txt              (Phase 1 응답 → 아웃라인 JSON, 실패 시 ok=false)
  merge-continuation --accumulated-file a.md --continuation-file c.md
  strip-fence  --file raw.md               (```markdown 펜스 제거, Phase 2/3 응답 정리)
  parse-briefing --file raw.txt --source generate|file [--topic 원래주제]

--context-file 은 원본 Phase 경로에 없는 스킬 전용 확장이다 (docs/skills-spec 8절 참조).
"""

import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from jscompat import WS, from_units, js_trim, js_trim_start, to_units, u16_slice  # noqa: E402

with open(os.path.join(HERE, "data", "prompts.json"), encoding="utf-8") as _f:
    P = json.load(_f)

# ── 시스템 메시지 원문 (client-generate.ts) ──
PHASE1_BASE_SYSTEM = (
    "당신은 JSON 출력 전용 어시스턴트입니다. 마크다운, 코드펜스, 설명, 서문 없이 오직 JSON 객체 한 개만 출력합니다."
)
PHASE1_STRICTER_SYSTEM = (
    PHASE1_BASE_SYSTEM
    + "\n\n위 지시를 어기면 글 전체가 실패합니다. 절대로 마크다운 코드펜스(```) 를 출력하지 마세요. "
    + "반드시 { 로 시작해서 } 로 끝나는 JSON 객체 하나만 출력합니다."
)
PHASE2_SYSTEM = (
    "당신은 한국어 블로그 콘텐츠 작성자입니다. 사용자가 제공한 아웃라인을 그대로 따라 본문을 마크다운으로 작성합니다. "
    "본문 외 메타 설명/코드펜스를 출력하지 마세요."
)
PHASE3_SYSTEM = (
    "당신은 한국어 블로그 SEO 편집자입니다. 사용자가 제공한 초안을 지시 항목만 정확히 수정해 출력합니다. "
    "본문 외 설명을 출력하지 마세요."
)
CONTINUATION_TEMPLATE = """아래 블로그 본문이 토큰 한도로 중간에 끊겼습니다. 중단된 지점부터 이어서 완성해주세요.

규칙:
- 이미 작성된 부분을 반복하지 말고 **정확히 중단된 지점부터 이어가세요**.
- 전체 톤과 구조(1인칭, 구어체, 카테고리 톤)를 그대로 유지하세요.
- 인포그래픽 마커는 아웃라인의 infographic_plan 을 따라 빠진 것을 마저 삽입하세요.
- 응답은 이어쓰기 부분만 출력하세요. 중복 텍스트, 설명, 코드펜스 금지.

[아웃라인 — 참고용]
{phase1Json}

[지금까지 작성된 본문의 마지막 부분 — 여기 바로 다음부터 이어가세요]
{tailContext}"""

# supabase/seed.sql 의 categories.name (getCategoryName 이 DB 에서 읽는 값)
CATEGORY_NAMES = {
    "CAT-INTRO": "디딤 소개",
    "CAT-A": "변리사의 현장 수첩",
    "CAT-A-01": "절세 시뮬레이션",
    "CAT-A-02": "인증 가이드",
    "CAT-A-03": "연구소 운영 실무",
    # CAT-A-04 는 seed.sql 에 없음 — prompts.ts 주석/브리핑 프롬프트의 명칭 (확인 필요)
    "CAT-A-04": "특허·상표 출원 실무",
    "CAT-B": "IP 라운지",
    "CAT-B-01": "AI와 IP",
    "CAT-B-02": "특허 전략 노트",
    "CAT-B-03": "IP 뉴스 한 입",
    "CAT-C": "디딤 다이어리",
    "CAT-C-01": "컨설팅 후기",
    "CAT-C-02": "디딤 일상",
    "CAT-C-03": "대표의 생각",
    "CAT-CONSULT": "상담 안내",
}

CONTEXT_BLOCK_HEADER = "[참고 사항 — 사용자 제공 자료 (스킬 확장: 원본 Phase 경로에는 없음)]"


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


def get_field_cta(category_id: str, target_keyword=None):
    field = P["FIELD_CTA"]
    if category_id in field:
        return field[category_id]
    kw = (target_keyword or "").lower()
    if any(k in kw for k in ("절세", "세액공제", "법인세", "보상금")):
        return field["CAT-A-01"]
    if any(k in kw for k in ("인증", "벤처", "이노비즈")):
        return field["CAT-A-02"]
    if any(k in kw for k in ("연구소", "연구활동", "사후관리")):
        return field["CAT-A-03"]
    if any(k in kw for k in ("출원", "상표", "특허출원", "pct")):
        return field["CAT-A-04"]
    if any(k in kw for k in ("ai", "인공지능", "생성형")):
        return field["CAT-B-02"]
    if category_id.startswith("CAT-A"):
        return field["CAT-A-04"]
    if category_id.startswith("CAT-B"):
        return field["CAT-B-01"]
    return P["DEFAULT_CTA"]


def replace_template(template: str, variables: dict) -> str:
    """client-generate.ts replaceTemplate — split/join 전체 치환, 삽입 순서대로."""
    out = template
    for k, v in variables.items():
        out = v.join(out.split("{{" + k + "}}"))
    return out


def replace_template_variables(template: str, variables: dict) -> str:
    """ai.ts / generation-runner.ts replaceTemplateVariables — replaceAll, 빈 값은 ""."""
    out = template
    for k, v in variables.items():
        out = out.replace("{{" + k + "}}", v or "")
    return out


def js_json_stringify_2(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2)


def strip_fence(text: str) -> str:
    cleaned = js_trim(text)
    m = re.match(r"^```(?:markdown|md)?" + WS + r"*\n([\s\S]*?)\n```\Z", cleaned)
    if m:
        cleaned = js_trim(m.group(1))
    return cleaned


def parse_phase1_json(text: str):
    cleaned = js_trim(text)
    if "```" in cleaned:
        m = re.search(r"```(?:json)?" + WS + r"*\n?([\s\S]*?)\n?```", cleaned)
        if m:
            cleaned = js_trim(m.group(1))
    first = cleaned.find("{")
    last = cleaned.rfind("}")
    if first == -1 or last == -1 or last < first:
        return None
    candidate = cleaned[first:last + 1]
    try:
        parsed = json.loads(candidate)
        if not isinstance(parsed, dict):
            return None
        if not isinstance(parsed.get("title"), str):
            return None
        return parsed
    except ValueError:
        partial = candidate
        ob, cb = partial.count("{"), partial.count("}")
        obr, cbr = partial.count("["), partial.count("]")
        partial += "]" * max(0, obr - cbr)
        partial += "}" * max(0, ob - cb)
        try:
            return json.loads(partial)
        except ValueError:
            return None


def find_overlap_units(a, b) -> int:
    max_len = min(len(a), len(b))
    for ln in range(max_len, 0, -1):
        if a[len(a) - ln:] == b[:ln]:
            return ln
    return 0


def merge_continuation(accumulated: str, continuation: str) -> dict:
    """clientRunPhase2 이어쓰기 병합부 (UTF-16 단위로 원본과 동일 계산)."""
    tail_context = u16_slice(accumulated, -200)
    cleaned = js_trim(continuation)
    overlap_check_len = min(80, len(to_units(tail_context)))
    overlap = 0
    if overlap_check_len > 20:
        last_chunk = to_units(accumulated)[-overlap_check_len:]
        first_chunk = to_units(cleaned)[: overlap_check_len * 2]
        overlap = find_overlap_units(last_chunk, first_chunk)
        if overlap > 15:
            cleaned = js_trim_start(from_units(to_units(cleaned)[overlap:]))
    return {"accumulated": accumulated + cleaned, "overlap_removed": overlap if overlap > 15 else 0}


# ── 브리핑 JSON 파싱 / 검증 ──
VALID_PRIMARY = ["CAT-A", "CAT-B", "CAT-B-03", "CAT-C"]
VALID_SECONDARY_GENERATE = [  # briefing.ts — CAT-A-04 없음 (원본 그대로)
    "CAT-A-01", "CAT-A-02", "CAT-A-03",
    "CAT-B-01", "CAT-B-02", "CAT-B-03",
    "CAT-C-01", "CAT-C-02", "CAT-C-03",
]
VALID_SECONDARY_FILE = [  # file-upload.ts
    "CAT-A-01", "CAT-A-02", "CAT-A-03", "CAT-A-04",
    "CAT-B-01", "CAT-B-02", "CAT-B-03",
    "CAT-C-01", "CAT-C-02", "CAT-C-03",
]


def _js_truthy(v) -> bool:
    if v is None or v is False:
        return False
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return v != 0 and v == v
    if isinstance(v, str):
        return v != ""
    return True  # 배열·객체는 비어 있어도 truthy


def _js_string(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return v
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return ",".join("" if e is None else _js_string(e) for e in v)
    return "[object Object]"


def parse_briefing_generate(text: str):
    cleaned = js_trim(text)
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?" + WS + r"*\n?", "", cleaned, count=1)
        cleaned = re.sub(r"\n?```" + WS + r"*\Z", "", cleaned, count=1)
    try:
        return json.loads(cleaned)
    except ValueError:
        return None


def parse_briefing_file(text: str):
    cleaned = js_trim(text)
    if "```" in cleaned:
        m = re.search(r"```(?:json)?" + WS + r"*\n?([\s\S]*?)\n?```", cleaned)
        if m:
            cleaned = js_trim(m.group(1))
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if m:
        try:
            return json.loads(m.group(0))
        except ValueError:
            pass
    try:
        return json.loads(cleaned)
    except ValueError:
        return None


def build_briefing(parsed: dict, source: str, topic_default: str = "") -> dict:
    def g(k, d=""):
        v = parsed.get(k)
        return _js_string(v) if _js_truthy(v) else d

    b = {
        "categoryId": g("categoryId", "CAT-A"),
        "secondaryCategoryId": g("secondaryCategoryId", ""),
        "topic": g("topic", topic_default if source == "generate" else ""),
        "keyword": g("keyword"),
        "targetAudience": g("targetAudience"),
        "episode": g("episode"),
        "additionalContext": g("additionalContext"),
    }
    valid_secondary = VALID_SECONDARY_GENERATE if source == "generate" else VALID_SECONDARY_FILE
    if b["categoryId"] not in VALID_PRIMARY:
        b["categoryId"] = "CAT-A"
    if b["secondaryCategoryId"] and b["secondaryCategoryId"] not in valid_secondary:
        b["secondaryCategoryId"] = ""
    return b


def briefing_to_draft_input(b: dict) -> dict:
    """ai-draft-dialog.tsx applyBriefingToManual + handleSubmit 의 매핑."""
    parts = []
    if b.get("episode"):
        parts.append(f"[에피소드]\n{b['episode']}")
    if b.get("additionalContext"):
        parts.append(f"[참고사항]\n{b['additionalContext']}")
    return {
        "topic": b["topic"],
        "keyword": b["keyword"],
        # 저장되는 category_id = 2차 분류가 있으면 2차, 없으면 1차
        "category_id": b["secondaryCategoryId"] or b["categoryId"],
        "target_audience": "",  # applyBriefingToManual 이 비움 (원본 그대로)
        "additional_context": "\n\n".join(parts),
    }


# ── 렌더링 ──

def _read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def render(a) -> dict:
    cid = a.category_id or ""
    key = get_prompt_key(cid)
    cname = a.category_name if a.category_name is not None else CATEGORY_NAMES.get(cid, "")
    ctx_raw = _read(a.context_file) if a.context_file else ""
    ctx = ctx_raw.strip()
    ctx_block = f"\n\n{CONTEXT_BLOCK_HEADER}\n{ctx}" if ctx else ""
    out = {"phase": a.phase, "prompt_key": key, "category_name": cname}

    if a.phase in ("phase1", "phase1-retry"):
        user = replace_template(P["PHASE1_PROMPT"], {
            "category_name": cname, "topic": a.topic or "", "target_keyword": a.keyword or "",
        })
        out.update(system=PHASE1_STRICTER_SYSTEM if a.phase == "phase1-retry" else PHASE1_BASE_SYSTEM,
                   user=user + ctx_block, max_tokens=2000, temperature=0.4)
    elif a.phase == "phase2":
        outline = json.loads(_read(a.outline_file))
        user = replace_template(P["PHASE2_PROMPT"], {
            "category_tone_rules": P["CATEGORY_TONE_RULES"][key],
            "common_writing_rules": P["COMMON_WRITING_RULES"],
            "visual_rules": "",
            "phase1_output": js_json_stringify_2(outline),
        })
        out.update(system=PHASE2_SYSTEM, user=user + ctx_block, max_tokens=8000, temperature=0.7)
    elif a.phase == "continuation":
        outline = json.loads(_read(a.outline_file))
        acc = _read(a.body_file)
        user = CONTINUATION_TEMPLATE.replace("{phase1Json}", js_json_stringify_2(outline)).replace(
            "{tailContext}", u16_slice(acc, -200))
        out.update(system=PHASE2_SYSTEM, user=user, max_tokens=8000, temperature=0.7, max_continuations=2)
    elif a.phase == "phase3":
        body = _read(a.body_file)
        user = replace_template(P["PHASE3_PROMPT_BY_KEY"][key], {
            "target_keyword": a.keyword or "", "category_name": cname, "phase2_output": body,
        })
        out.update(system=PHASE3_SYSTEM, user=user, max_tokens=8000, temperature=0.4)
    elif a.phase == "legacy":
        field_cta = get_field_cta(cid) if key == "PROMPT_FIELD" else {"cta": "", "emailSubject": ""}
        tv = {
            "topic": a.topic or "", "keyword": a.keyword or "", "target_audience": a.audience or "",
            "additional_context": ctx_raw, "subcategory": "",
            "cta_text": field_cta["cta"], "email_subject": field_cta["emailSubject"],
        }
        out.update(system=replace_template_variables(P["SYSTEM_PROMPTS"][key], tv),
                   user=replace_template_variables(P["USER_PROMPTS"][key], tv),
                   max_tokens=3000, temperature=0.5)
    elif a.phase in ("briefing", "briefing-file", "briefing-vision"):
        base = P["PROMPT_BRIEFING_GENERATE"] if a.phase == "briefing" else P["PROMPT_BRIEFING_FROM_FILE"]
        system = base + (f"\n\n카테고리는 반드시 {a.force_category}를 사용하세요." if a.force_category else "")
        if a.phase == "briefing":
            user, mt = f"주제: {a.topic or ''}", 1024
        elif a.phase == "briefing-vision":
            user, mt = "이 문서의 내용을 분석하여 블로그 브리핑 양식을 JSON으로 작성해주세요.", 4096
        else:
            doc = _read(a.doc_file)
            units = to_units(doc)
            truncated = len(units) > 8000
            content = from_units(units[:8000]) if truncated else doc
            user = f"[문서 내용]\n{content}" + ("\n\n(파일이 길어 앞부분만 포함되었습니다)" if truncated else "")
            out["truncated"] = truncated
            mt = 4096
        out.update(system=system, user=user, max_tokens=mt, temperature=0.7)
    else:
        raise SystemExit(f"알 수 없는 phase: {a.phase}")
    if ctx and a.phase in ("phase1", "phase1-retry", "phase2"):
        out["skill_extension"] = "additional_context 를 user 메시지 끝에 덧붙임 (원본 Phase 경로는 미사용)"
    return out


def main():
    ap = argparse.ArgumentParser(description="디딤 블로그 초안 파이프라인 헬퍼 (프롬프트 조립·파싱)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("prompt-key"); s.add_argument("--category-id", required=True)
    s = sub.add_parser("cta"); s.add_argument("--category-id", required=True); s.add_argument("--keyword", default="")
    s = sub.add_parser("render")
    s.add_argument("--phase", required=True)
    for opt in ("--category-id", "--category-name", "--topic", "--keyword", "--outline-file", "--body-file",
                "--context-file", "--audience", "--doc-file", "--force-category"):
        s.add_argument(opt, default=None)
    s = sub.add_parser("parse-phase1"); s.add_argument("--file", required=True)
    s = sub.add_parser("merge-continuation")
    s.add_argument("--accumulated-file", required=True); s.add_argument("--continuation-file", required=True)
    s = sub.add_parser("strip-fence"); s.add_argument("--file", required=True)
    s = sub.add_parser("parse-briefing")
    s.add_argument("--file", required=True); s.add_argument("--source", choices=["generate", "file"], required=True)
    s.add_argument("--topic", default="")
    a = ap.parse_args()

    if a.cmd == "prompt-key":
        out = {"prompt_key": get_prompt_key(a.category_id), "category_name": CATEGORY_NAMES.get(a.category_id, "")}
    elif a.cmd == "cta":
        out = get_field_cta(a.category_id, a.keyword)
    elif a.cmd == "render":
        out = render(a)
    elif a.cmd == "parse-phase1":
        o = parse_phase1_json(_read(a.file))
        out = {"ok": o is not None, "outline": o}
        if o is None:
            out["error"] = "Phase 1 JSON 파싱 실패 — phase1-retry 로 1회 재시도"
    elif a.cmd == "merge-continuation":
        out = merge_continuation(_read(a.accumulated_file), _read(a.continuation_file))
    elif a.cmd == "strip-fence":
        out = {"text": strip_fence(_read(a.file))}
    else:
        raw = _read(a.file)
        parsed = parse_briefing_generate(raw) if a.source == "generate" else parse_briefing_file(raw)
        if not isinstance(parsed, dict):
            out = {"ok": False, "error": "브리핑 JSON 파싱 실패 — 직접 입력 받기"}
        else:
            b = build_briefing(parsed, a.source, a.topic)
            out = {"ok": True, "briefing": b, "draft_input": briefing_to_draft_input(b)}
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
