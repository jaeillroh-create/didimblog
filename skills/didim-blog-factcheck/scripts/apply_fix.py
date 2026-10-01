#!/usr/bin/env python3
"""본문 교체 로직 — ai-editor-client.tsx(fuzzyApplyFix, fuzzyApplyParagraph),
cross-llm-validation-panel.tsx(findParagraphContaining), utils/paragraph-ids.ts 포팅.

하위 명령:
  fix             original_text → replacement_text (4단계+문단ID fallback). applyFixToBody 규칙 포함
  undo-fix        replacement_text → original_text 역치환 (undoFixInBody)
  paragraph       original_paragraph → rewritten_paragraph (applyParagraphToBody)
  undo-paragraph  rewritten_paragraph → original_paragraph (undoParagraphInBody)
  find-paragraph  original_text 가 들어 있는 문단 찾기 (findParagraphContaining, 문단 재작성 입력용)
  inject-ids      <!-- p:N --> 문단 ID 주입(기존 ID 제거 후 1부터 재번호)
  strip-ids       문단 ID 제거 (발행·저장 전 정리)
  find-id         text 가 속한 문단 ID 찾기 (findParagraphIdForText)

입력(JSON, stdin 또는 --input):
  {"body": "...", "original_text": "...", "replacement_text": "...",
   "original_paragraph": "...", "rewritten_paragraph": "...", "text": "..."}
출력(JSON): {"matched": bool, "mode": "...", "changed": bool, "body": "...", ...}

--retry-with-ids (fix/paragraph): 매칭 실패 시 본문에 문단 ID 가 없으면 주입한 본문으로 한 번 더 시도.
  원본 패널의 의도(onEnsureParagraphIds 후 재시도)를 구현한 것. 원본은 React stale closure 때문에
  재시도가 같은 본문으로 실행된다(명세 8절 참고). 기본값은 끔(원본 실제 동작).
"""

import argparse
import json
import math
import re
import sys

from _jscompat import (
    JS_WS,
    js_collapse_ws,
    js_is_ws,
    js_len,
    js_replace_first,
    js_round,
    js_trim,
    js_ws_fuzzy_pattern,
)

# ── paragraph-ids.ts ──
PARAGRAPH_ID_RE = re.compile(r"<!-- p:([0-9]+) -->\n?")
LOOSE_PARA_ID_RE = re.compile(r"<!--" + JS_WS + r"*p:[0-9]+" + JS_WS + r"*-->\n?")  # /<!--\s*p:\d+\s*-->\n?/g


def has_paragraph_ids(body: str) -> bool:
    # 원본은 전역(/g) 정규식 .test() 라 호출 간 lastIndex 가 남는 버그가 있음 — 여기서는 상태 없이 판정
    return PARAGRAPH_ID_RE.search(body) is not None


def strip_paragraph_ids(body: str) -> str:
    s = PARAGRAPH_ID_RE.sub("", body)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return js_trim(s)


def inject_paragraph_ids(body: str) -> str:
    stripped = strip_paragraph_ids(body)
    paragraphs = re.split(r"\n\n+", stripped)
    pid = 1
    result = []
    for p in paragraphs:
        trimmed = js_trim(p)
        if not trimmed:
            continue
        if trimmed.startswith("━━") or trimmed.startswith("---"):
            result.append(trimmed)
            continue
        result.append(f"<!-- p:{pid} -->\n{trimmed}")
        pid += 1
    return "\n\n".join(result)


def extract_paragraph_map(body: str):
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
        if js_trim(line) == "" and len(state["lines"]) > 0 and js_trim(state["lines"][-1]) == "":
            flush()
            continue
        state["lines"].append(line)
    flush()
    return mp


def find_paragraph_id_for_text(body: str, text: str):
    mp = extract_paragraph_map(body)
    if len(mp) == 0:
        return None
    trimmed = js_trim(LOOSE_PARA_ID_RE.sub("", text))
    if not trimmed:
        return None
    for pid, content in mp.items():
        if trimmed in content:
            return pid

    def norm(s):
        return js_trim(js_collapse_ws(re.sub(r"[#*>_`~]", "", s), " ")).lower()

    nt = norm(trimmed)
    if js_len(nt) >= 5:
        for pid, content in mp.items():
            if nt in norm(content):
                return pid
    first = re.split(r"[.!?。]" + JS_WS, trimmed)[0]
    first = js_trim(first) if first is not None else ""
    if first and js_len(first) >= 15:
        for pid, content in mp.items():
            if first in content:
                return pid
    return None


def get_paragraph_by_id(body: str, pid: int):
    return extract_paragraph_map(body).get(pid)


# ── fuzzyApplyFix (ai-editor-client.tsx) ──
def _is_md_noise(ch):
    return ch in "#*>_`~"


def fuzzy_apply_fix(body: str, original_text: str, replacement_text: str):
    if not original_text:
        return {"body": body, "matched": False}
    original_text = js_trim(LOOSE_PARA_ID_RE.sub("", original_text))
    replacement_text = LOOSE_PARA_ID_RE.sub("", replacement_text)
    if not original_text:
        return {"body": body, "matched": False}

    # 1) 정확 매칭
    if original_text in body:
        return {"body": js_replace_first(body, original_text, replacement_text), "matched": True, "mode": "exact"}

    # 1.5) 문단 ID 기반
    if has_paragraph_ids(body):
        pid = find_paragraph_id_for_text(body, original_text)
        if pid is not None:
            p_text = get_paragraph_by_id(body, pid)
            if p_text and original_text in p_text:
                new_p = js_replace_first(p_text, original_text, replacement_text)
                p_idx = body.find(p_text)
                if p_idx != -1:
                    return {
                        "body": body[:p_idx] + new_p + body[p_idx + len(p_text):],
                        "matched": True,
                        "mode": "exact",
                    }
            if p_text:
                trimmed_o = js_trim(original_text)
                if js_len(trimmed_o) >= 5:
                    m = re.search(js_ws_fuzzy_pattern(trimmed_o), p_text)
                    if m and m.group(0):
                        new_p = js_replace_first(p_text, m.group(0), replacement_text)
                        p_idx = body.find(p_text)
                        if p_idx != -1:
                            return {
                                "body": body[:p_idx] + new_p + body[p_idx + len(p_text):],
                                "matched": True,
                                "mode": "whitespace",
                            }

    # 2) 공백 정규화 매칭
    trimmed = js_trim(original_text)
    if js_len(trimmed) >= 5:
        m = re.search(js_ws_fuzzy_pattern(trimmed), body)
        if m and m.group(0):
            return {"body": js_replace_first(body, m.group(0), replacement_text), "matched": True, "mode": "whitespace"}

    # 3) 마크다운 기호 제거 매칭 (stripped → 원본 위치 매핑 후 slice 교체)
    if js_len(trimmed) >= 5:
        chars = []
        to_orig = []
        last_space = False
        for i, ch in enumerate(body):
            if _is_md_noise(ch):
                continue
            if js_is_ws(ch):
                if last_space:
                    continue
                chars.append(" ")
                to_orig.append(i)
                last_space = True
            else:
                chars.append(ch)
                to_orig.append(i)
                last_space = False
        stripped_body = "".join(chars)
        stripped_orig = js_trim(js_collapse_ws(re.sub(r"[#*>_`~]", "", trimmed), " "))
        if js_len(stripped_orig) >= 5:
            s_idx = stripped_body.find(stripped_orig)
            if s_idx != -1:
                start = to_orig[s_idx]
                end_strip = s_idx + len(stripped_orig) - 1
                end = to_orig[end_strip] + 1 if end_strip < len(to_orig) else len(body)
                if end > start:
                    return {
                        "body": body[:start] + replacement_text + body[end:],
                        "matched": True,
                        "mode": "markdown",
                    }

    # 4) 접두(첫 20자) 매칭 → 문장 종결자까지 교체
    prefix = trimmed[:20]
    if js_len(prefix) >= 8:
        idx = body.find(prefix)
        if idx != -1:
            end_idx = len(body)
            for i in range(idx + len(prefix), len(body)):
                if body[i] in (".", "!", "?", "。", "\n"):
                    end_idx = i + 1
                    break
            max_end = idx + math.floor(len(original_text) * 1.8) + 80
            if end_idx > max_end:
                end_idx = max_end
            return {"body": body[:idx] + replacement_text + body[end_idx:], "matched": True, "mode": "prefix"}

    return {"body": body, "matched": False}


# ── fuzzyApplyParagraph (ai-editor-client.tsx) ──
def normalize_paragraph(s: str) -> str:
    s = s.replace("\r\n", "\n")
    s = re.sub(r"[#*>`_~]+", "", s)
    s = re.sub(r"━+", "", s)
    return js_trim(js_collapse_ws(s, " "))


def tokenize_paragraph(s: str):
    toks = re.split(JS_WS + "+", normalize_paragraph(s))
    toks = [re.sub(r"[.,!?。:;()\[\]{}\"'「」『』]", "", t) for t in toks]
    return [t for t in toks if js_len(t) >= 2]


def fuzzy_apply_paragraph(body: str, original_paragraph: str, rewritten_paragraph: str):
    if not original_paragraph:
        return {"body": body, "matched": False}
    original_paragraph = js_trim(LOOSE_PARA_ID_RE.sub("", original_paragraph))
    rewritten_paragraph = js_trim(LOOSE_PARA_ID_RE.sub("", rewritten_paragraph))
    if not original_paragraph:
        return {"body": body, "matched": False}

    if original_paragraph in body:
        return {
            "body": js_replace_first(body, original_paragraph, rewritten_paragraph),
            "matched": True,
            "mode": "exact",
            "matchedText": original_paragraph,
        }

    if has_paragraph_ids(body):
        pid = find_paragraph_id_for_text(body, original_paragraph)
        if pid is not None:
            p_text = get_paragraph_by_id(body, pid)
            if p_text:
                p_idx = body.find(p_text)
                if p_idx != -1:
                    return {
                        "body": body[:p_idx] + rewritten_paragraph + body[p_idx + len(p_text):],
                        "matched": True,
                        "mode": "paragraph-id",
                        "matchedText": p_text,
                    }

    paragraphs = re.split(r"\n\n+", body)

    norm_orig = normalize_paragraph(original_paragraph)
    if js_len(norm_orig) >= 5:
        for p in paragraphs:
            if normalize_paragraph(p) == norm_orig:
                return {"body": js_replace_first(body, p, rewritten_paragraph), "matched": True, "mode": "normalized", "matchedText": p}

    sentences = [js_trim(s) for s in re.split(r"(?<=[.!?。])" + JS_WS + r"+|\n+", original_paragraph)]
    sentences = [s for s in sentences if js_len(s) >= 6]
    if sentences:
        first, last = sentences[0], sentences[-1]
        if first != last:
            for p in paragraphs:
                if first in p and last in p:
                    return {"body": js_replace_first(body, p, rewritten_paragraph), "matched": True, "mode": "sentence", "matchedText": p}
        for p in paragraphs:
            if first in p:
                return {"body": js_replace_first(body, p, rewritten_paragraph), "matched": True, "mode": "first-sentence", "matchedText": p}

    orig_tokens = set(tokenize_paragraph(original_paragraph))
    if len(orig_tokens) >= 3:
        best = None
        for p in paragraphs:
            pt = tokenize_paragraph(p)
            if len(pt) == 0:
                continue
            ps = set(pt)
            inter = sum(1 for t in ps if t in orig_tokens)
            union = len(orig_tokens) + len(ps) - inter
            ratio = inter / union if union > 0 else 0
            if best is None or ratio > best[1]:
                best = (p, ratio)
        if best and best[1] >= 0.7:
            return {
                "body": js_replace_first(body, best[0], rewritten_paragraph),
                "matched": True,
                "mode": "similarity",
                "matchedText": best[0],
                "similarityRatio": best[1],
            }

    return {"body": body, "matched": False}


# ── findParagraphContaining (cross-llm-validation-panel.tsx) ──
def find_paragraph_containing(body: str, original_text: str):
    if not original_text:
        return None
    original_text = js_trim(LOOSE_PARA_ID_RE.sub("", original_text))
    if not original_text:
        return None
    paragraphs = re.split(r"\n\n+", body)
    for p in paragraphs:
        if original_text in p:
            return {"paragraph": p}

    def norm(s):
        return js_trim(js_collapse_ws(s, " "))

    no = norm(original_text)
    if js_len(no) >= 5:
        for p in paragraphs:
            if no in norm(p):
                return {"paragraph": p}
    prefix = js_trim(original_text)[:20]
    if js_len(prefix) >= 8:
        for p in paragraphs:
            if prefix in p:
                return {"paragraph": p}
    return None


# ── 호출 측 규칙 (applyFixToBody 등) ──
MODE_NOTICE_FIX = {
    "whitespace": "공백 차이를 흡수해서 반영했습니다 — 본문을 한 번 확인해주세요",
}
MODE_NOTICE_PARAGRAPH = {
    "normalized": "공백/마크다운 차이 흡수",
    "sentence": "첫+마지막 문장 매칭",
    "first-sentence": "첫 문장 매칭",
}


def apply_fix_to_body(body, original, replacement, retry_with_ids=False):
    res = fuzzy_apply_fix(body, original, replacement)
    if not res["matched"] and retry_with_ids and not has_paragraph_ids(body):
        body = inject_paragraph_ids(body)
        res = fuzzy_apply_fix(body, original, replacement)
        res["retried_with_ids"] = True
    if not res["matched"]:
        res.update(
            changed=False,
            error="본문에서 원문을 자동 매칭하지 못했습니다. 원문/교체안을 사용자에게 보여주고 직접 수정하게 하세요.",
            recovery=f"[원문 — 본문에서 찾아 선택하세요]\n{original}\n\n[교체할 내용]\n{replacement}",
        )
        return res
    if res["body"] == body:
        res.update(matched=False, changed=False, error="matched=true 이지만 body 변경 없음 — replace 실패")
        return res
    res["changed"] = True
    if res.get("mode") and res["mode"] != "exact":
        res["notice"] = MODE_NOTICE_FIX.get(
            res["mode"], "원문이 정확히 일치하지 않아 근사 위치로 반영했습니다 — 본문을 확인해주세요"
        )
    return res


def apply_paragraph_to_body(body, original_p, rewritten_p, retry_with_ids=False):
    if not original_p or not rewritten_p:
        return {"body": body, "matched": False, "changed": False}
    res = fuzzy_apply_paragraph(body, original_p, rewritten_p)
    if not res["matched"] and retry_with_ids and not has_paragraph_ids(body):
        body = inject_paragraph_ids(body)
        res = fuzzy_apply_paragraph(body, original_p, rewritten_p)
        res["retried_with_ids"] = True
    if not res["matched"]:
        res.update(
            changed=False,
            error="자동 매칭에 실패했습니다.",
            recovery=f"[다듬어진 문단 — 본문 편집기에 직접 붙여넣으세요]\n\n{rewritten_p}\n\n[원본 문단 — 이 위치를 Ctrl+F 로 찾으세요]\n\n{original_p}",
        )
        return res
    if res["body"] == body:
        res.update(matched=False, changed=False, error="matched=true 이지만 body 변경 없음 — replace 실패")
        return res
    res["changed"] = True
    mode = res.get("mode")
    if mode and mode != "exact":
        if mode == "similarity":
            label = f"유사도 매칭 ({js_round((res.get('similarityRatio') or 0) * 100)}%)"
        else:
            label = MODE_NOTICE_PARAGRAPH.get(mode, "근사 매칭")
        res["notice"] = f"{label}으로 문단을 반영했습니다 — 본문을 확인해주세요"
    return res


def main():
    ap = argparse.ArgumentParser(description="교차검증 지적 사항을 본문에 반영/되돌리기, 문단 ID 처리.")
    ap.add_argument(
        "command",
        choices=["fix", "undo-fix", "paragraph", "undo-paragraph", "find-paragraph", "inject-ids", "strip-ids", "find-id"],
    )
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--retry-with-ids", action="store_true", help="매칭 실패 시 문단 ID 주입 후 재시도")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    body = data.get("body", "")
    c = args.command

    if c == "fix":
        out = apply_fix_to_body(body, data.get("original_text", ""), data.get("replacement_text", ""), args.retry_with_ids)
    elif c == "undo-fix":
        r = fuzzy_apply_fix(body, data.get("replacement_text", ""), data.get("original_text", ""))
        r["changed"] = r["matched"]
        if not r["matched"]:
            r["error"] = "본문에서 교체된 문장을 찾지 못했습니다 (수동 편집됨?)"
        out = r
    elif c == "paragraph":
        out = apply_paragraph_to_body(
            body, data.get("original_paragraph", ""), data.get("rewritten_paragraph", ""), args.retry_with_ids
        )
    elif c == "undo-paragraph":
        op, rp = data.get("original_paragraph", ""), data.get("rewritten_paragraph", "")
        if not op or not rp:
            out = {"body": body, "matched": False, "changed": False}
        else:
            r = fuzzy_apply_paragraph(body, rp, op)
            r["changed"] = r["matched"]
            out = r
    elif c == "find-paragraph":
        found = find_paragraph_containing(body, data.get("original_text", ""))
        out = found or {"paragraph": None, "error": "본문에서 원문이 포함된 문단을 찾지 못했습니다 — 수동 확인 필요"}
    elif c == "inject-ids":
        out = {"body": inject_paragraph_ids(body)}
    elif c == "strip-ids":
        out = {"body": strip_paragraph_ids(body)}
    else:
        out = {"paragraph_id": find_paragraph_id_for_text(body, data.get("text", ""))}
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
