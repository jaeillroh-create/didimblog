#!/usr/bin/env python3
"""디딤 블로그 Notion 저장 형식 도우미 — skills/_DECISIONS.md 6·7절 (2026-10-01).

이미 계산된 값(CTA·면책 레벨·태그·카테고리·설계 JSON·발행 블록)을 Notion "디딤 블로그 콘텐츠" 열 형식으로
바꾸고, 글 페이지 본문 5개 섹션(## 브리핑 / ## 본문 / ## 인포그래픽 / ## 발행 블록 / ## 검수 기록)을
만들고 읽는다. CTA 선택·면책 판정·태그 생성 같은 계산은 하지 않는다(각 스킬 스크립트의 몫).

같은 파일이 4개 스킬에 있다: didim-blog-core(정본)·didim-blog-writer·didim-blog-publish-prep·didim-blog-infographic
의 scripts/notion_page.py. 고칠 때는 4벌을 똑같이 바꾼다. Python 3 표준 라이브러리만 쓴다.

하위 명령 (출력 JSON, 'page'·'infographic-section' 은 마크다운 텍스트)
  page        [--briefing-file F] [--body-file F] [--infographic-file F] [--publish-file F] [--log-file F]
              → 새 글 페이지 본문(5개 섹션). 본문은 ```markdown 코드 블록에 원문 그대로 넣는다.
  split       --page-file F            fetch 결과(또는 페이지 본문) → 섹션별 내용(코드 블록은 원문, 나머지는 이스케이프 해제)
  section     --page-file F --name 본문 --content-file F [--append] [--code markdown|text|none]
              → notion-update-page 에 그대로 넘길 {command, content_updates | content}
  writer-props --finalize-file F [--checks-file F] [--recommend-source S] [--series S] [--series-no N]
              [--case-memo URL ...] [--notice URL ...] [--keyword-page URL ...] [--new] [--today YYYY-MM-DD]
              → 콘텐츠 DB 속성(Notion SQLite 형식) + 검수 기록 줄
  case-memo   --row-file F             사례 메모 행(1개 또는 배열) → 사용 가능 여부 + 작성용 참고 사항(출처 사건번호 제외)
  leak-check  --body-file F [--case-no X ...]   본문에 출처 사건번호·사건번호 형식 문자열이 있는지
  infographic-section --design F       설계 JSON → `## 인포그래픽` 섹션 내용(설계 요약 표: 번호·유형·위치·헤드라인·ALT)
  to-content  --page-file F [--row-file F]   페이지(fetch 결과) → publish_prep.py build 입력 JSON
  publish-props --url URL --date YYYY-MM-DD [--build-file F] [--from-status S3]
              → 발행 후 S4 갱신 속성 + 검수 기록 줄 (+ 비어 있던 CTA·면책 레벨·태그 채움 값)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys

# ── 위치 (_DECISIONS.md 6·7절) ──
DATA_SOURCES = {
    "콘텐츠": "collection://463bc815-11ab-4290-9d86-22bd1aa9cfed",
    "상담": "collection://e1272822-7efd-4850-b8c8-cfce02db7d00",
    "사례 메모": "collection://d0dc583f-9a93-482c-af24-fede97f446a0",
    "공고 후보": "collection://22228030-8382-4930-926e-fd46dc2f0bac",
    "키워드": "collection://4e0fae54-aeb3-48dd-b948-b78886a8e859",
}

# ── 페이지 본문 구조 (_DECISIONS.md 7절) ──
SECTIONS = ["브리핑", "본문", "인포그래픽", "발행 블록", "검수 기록"]
PLACEHOLDER = "(작성 전)"
SECTION_OWNER = {
    "브리핑": "planner(→writer 입력). 비어 있으면 writer 가 쓴 브리핑",
    "본문": "writer (최종 원고, ```markdown 코드 블록)",
    "인포그래픽": "infographic (설계 요약 표)",
    "발행 블록": "publish-prep (build --format notion 출력 그대로)",
    "검수 기록": "factcheck·seo·ops·writer·publish-prep 가 줄을 덧붙임",
}

# ── 선택지 (2026-10-01 data source fetch) ──
STATUS = {"S0": "S0 기획중", "S1": "S1 초안완료", "S2": "S2 검토완료", "S3": "S3 발행예정",
          "S4": "S4 발행완료", "S5": "S5 성과측정"}
CTA_OPTIONS = ["절세 시뮬레이션", "인증 진단", "연구소 진단", "출원 상담", "이웃 추가", "없음"]
# CTA 템플릿 key(코어·publish-prep FALLBACK_CTA / 신규 구조) → Notion "CTA"
CTA_KEY_TO_NOTION = {
    "현장수첩_절세": "절세 시뮬레이션",
    "현장수첩_인증": "인증 진단",
    "현장수첩_연구소": "연구소 진단",
    "현장수첩_출원": "출원 상담",
    "이웃추가": "이웃 추가",
    "디딤소식_이웃추가": "이웃 추가",
    "IP라운지": None,  # "AI·IP 전략이 궁금하신 대표님…" — 맞는 선택지 없음
}
# writer FIELD_CTA 의 emailSubject → Notion "CTA" ("상담 문의" 계열은 맞는 선택지 없음)
CTA_SUBJECT_TO_NOTION = {
    "절세 시뮬레이션": "절세 시뮬레이션",
    "인증 진단": "인증 진단",
    "연구소 관리": "연구소 진단",
    "연구소 진단": "연구소 진단",
    "출원 상담": "출원 상담",
}
NOTION_CTA_TO_KEY = {
    "절세 시뮬레이션": "현장수첩_절세",
    "인증 진단": "현장수첩_인증",
    "연구소 진단": "현장수첩_연구소",
    "출원 상담": "현장수첩_출원",
    "이웃 추가": "이웃추가",  # 디딤 소식(28)이면 디딤소식_이웃추가
}
DISCLAIMER_TO_NOTION = {"A": "A", "B": "B", "C": "C", "none": "없음"}
NOTION_TO_DISCLAIMER = {v: k for k, v in DISCLAIMER_TO_NOTION.items()}
NEWS_KIND_TO_NOTION = {"ip": "IP 뉴스", "office": "사무소 소식"}

NEW_CATEGORIES = {25: "지원사업·인증과 특허", 27: "출원·심판 실무", 26: "사례", 24: "지식재산 경영",
                  28: "디딤 소식", 17: "디딤 다이어리"}
DIARY_SUB = {18: "컨설팅 후기", 19: "디딤 일상", 20: "대표의 생각"}
LEGACY = {9: "변리사의 현장 수첩", 10: "절세 시뮬레이션", 11: "인증 가이드", 12: "연구소 운영 실무",
          23: "특허·상표 출원 실무", 13: "IP 라운지", 14: "특허 전략 노트", 15: "AI와 IP", 16: "IP 뉴스 한 입"}
SECOND_CLASS = ["절세 시뮬레이션", "인증 가이드", "연구소 운영 실무", "특허·상표 출원 실무", "특허 전략 노트",
                "AI와 IP", "IP 뉴스 한 입", "컨설팅 후기", "디딤 일상", "대표의 생각"]
CASE_CONSENT_OK = ("불필요(완전 익명)", "받음")
INFOGRAPHIC_TYPE_NAMES = {"T": "썸네일", "A": "비교", "B": "프로세스", "C": "숫자 카드", "D": "타임라인",
                          "E": "체크리스트", "F": "퍼널", "G": "구조도", "H": "수평 막대"}
# DIDIM 사건번호 형식 (예: 26T1002-1, 26P1003, 25TO2003MD-1, 26AT1001) — 본문 노출 금지 검사용
CASE_NO_RE = re.compile(r"(?<![0-9A-Za-z])\d{2}[A-Z]{1,3}\d{4}(?:[A-Z]{1,3})?(?:-\d+)?(?![0-9A-Za-z])")

KST = dt.timezone(dt.timedelta(hours=9))
_ESC = "\\[]<>{}|^$~"
_FENCE = re.compile(r"^\s*```")


def kst_now() -> str:
    return dt.datetime.now(KST).strftime("%Y-%m-%d %H:%M")


# ─────────────────────────────────────────────────────────────
# Notion 마크다운 이스케이프 (코드 블록 밖에서만)
# ─────────────────────────────────────────────────────────────
def _map_outside_code(text: str, fn) -> str:
    out, in_code = [], False
    for line in text.split("\n"):
        if _FENCE.match(line):
            in_code = not in_code
            out.append(line)
        else:
            out.append(line if in_code else fn(line))
    return "\n".join(out)


def escape_md(text: str) -> str:
    """일반 텍스트를 Notion 마크다운에 넣을 때. **볼드**·`코드`는 살리고 [ ] < > { } | ^ $ ~ \\ 만 이스케이프."""
    return _map_outside_code(text or "", lambda s: "".join("\\" + c if c in _ESC else c for c in s))


def unescape_md(text: str) -> str:
    """fetch 결과의 백슬래시 이스케이프와 <empty-block/> 을 일반 마크다운으로 되돌린다."""
    def f(s):
        if s.strip() == "<empty-block/>":
            return ""
        return re.sub(r"\\([\\*~`$\[\]<>{}|^_#])", r"\1", s)
    return _map_outside_code(text or "", f)


def code_block(text: str, lang: str = "markdown") -> str:
    """원문을 그대로 보존하는 코드 블록. 내용 속 ``` 로 시작하는 줄은 블록을 깨므로 경고 대상."""
    return f"```{lang}\n{(text or '').rstrip(chr(10))}\n```"


# ─────────────────────────────────────────────────────────────
# 페이지 본문 5개 섹션
# ─────────────────────────────────────────────────────────────
_HEAD = re.compile(r"^##\s+(" + "|".join(re.escape(s) for s in SECTIONS) + r")\s*(\{[^}]*\})?\s*$")


def page_content(fetched: str) -> str:
    """notion-fetch 결과 전체가 오면 <content> 안만, 아니면 그대로."""
    m = re.search(r"<content>\n?([\s\S]*?)\n?</content>", fetched or "")
    return m.group(1) if m else (fetched or "")


def page_properties(fetched: str) -> dict:
    m = re.search(r"<properties>\s*([\s\S]*?)\s*</properties>", fetched or "")
    if not m:
        return {}
    try:
        return json.loads(m.group(1))
    except json.JSONDecodeError:
        return {}


def split_sections(fetched: str) -> dict:
    """섹션 이름 → {raw(제목 줄 포함 원문), body(제목 다음 원문)}. 코드 블록 안의 '## …' 줄은 섹션으로 보지 않는다."""
    text = page_content(fetched)
    lines = text.split("\n")
    marks, in_code = [], False
    for i, line in enumerate(lines):
        if _FENCE.match(line):
            in_code = not in_code
            continue
        if not in_code:
            m = _HEAD.match(line)
            if m:
                marks.append((i, m.group(1)))
    out: dict = {"_preamble": "\n".join(lines[: marks[0][0]]) if marks else text, "_order": [n for _, n in marks]}
    for k, (i, name) in enumerate(marks):
        end = marks[k + 1][0] if k + 1 < len(marks) else len(lines)
        raw = "\n".join(lines[i:end]).rstrip("\n")
        if name in out:  # 같은 이름이 두 번이면 첫 번째만 쓴다
            out.setdefault("_duplicates", []).append(name)
            continue
        out[name] = {"raw": raw, "body": "\n".join(lines[i + 1:end]).strip("\n")}
    out["_missing"] = [s for s in SECTIONS if s not in out]
    return out


def section_text(body: str) -> str:
    """섹션 원문 → 사람이 읽는 텍스트. 내용 전체가 코드 블록 하나면 그 안을 원문 그대로, 아니면 이스케이프 해제."""
    b = (body or "").strip("\n")
    if b.strip() in ("", PLACEHOLDER):
        return ""
    m = re.fullmatch(r"\s*```[^\n]*\n([\s\S]*?)\n?```\s*", b)
    if m and "\n```" not in m.group(1):
        return m.group(1)
    return unescape_md(b)


def build_page(sections: dict) -> str:
    """새 글 페이지 본문. 없는 섹션은 '(작성 전)'."""
    parts = []
    for s in SECTIONS:
        c = (sections.get(s) or "").strip("\n")
        parts.append(f"## {s}\n{c or PLACEHOLDER}")
    return "\n".join(parts) + "\n"


def section_update(fetched: str, name: str, new_body: str, append: bool = False) -> dict:
    """한 섹션만 바꾸는 notion-update-page 인자. 다른 섹션(사람·다른 스킬 기록)은 건드리지 않는다."""
    if name not in SECTIONS:
        raise ValueError(f"알 수 없는 섹션: {name} (가능: {', '.join(SECTIONS)})")
    sec = split_sections(fetched)
    new_body = (new_body or "").strip("\n")
    if name in sec:
        old_raw = sec[name]["raw"]
        old_body = sec[name]["body"].strip("\n")
        if append and old_body and old_body.strip() != PLACEHOLDER:
            body = old_body + "\n" + new_body
        else:
            body = new_body or PLACEHOLDER
        return {"command": "update_content",
                "content_updates": [{"old_str": old_raw, "new_str": f"## {name}\n{body}"}]}
    # 섹션이 없으면 순서상 다음에 오는 기존 섹션 앞에 끼워 넣고, 없으면 페이지 끝에 붙인다
    block = f"## {name}\n{new_body or PLACEHOLDER}"
    for nxt in SECTIONS[SECTIONS.index(name) + 1:]:
        if nxt in sec:
            head = sec[nxt]["raw"].split("\n", 1)[0]
            return {"command": "update_content",
                    "content_updates": [{"old_str": head, "new_str": block + "\n" + head}]}
    return {"command": "insert_content", "position": {"type": "end"}, "content": block}


# ─────────────────────────────────────────────────────────────
# 값 → Notion 열 형식
# ─────────────────────────────────────────────────────────────
def cta_to_notion(cta) -> tuple[str | None, str | None]:
    """CTA(템플릿 dict/key, writer FIELD_CTA dict, None) → (Notion CTA 선택지, 경고)."""
    if cta is None or cta == "" or cta == {}:
        return "없음", None
    if isinstance(cta, str):
        key = cta
        if key in CTA_OPTIONS:
            return key, None
        v = CTA_KEY_TO_NOTION.get(key)
        return (v, None) if v else (None, f"CTA '{key}' 에 맞는 Notion 선택지가 없음 — 'CTA' 열은 비워 두고 사용자에게 확인")
    key = cta.get("key")
    if key:
        return cta_to_notion(key)
    subj = cta.get("emailSubject") or cta.get("email_subject") or cta.get("emailSubjectTag")
    if subj in CTA_SUBJECT_TO_NOTION:
        return CTA_SUBJECT_TO_NOTION[subj], None
    text = cta.get("cta") or cta.get("text") or ""
    if "이웃 추가" in text or "이웃추가" in text:
        return "이웃 추가", None
    return None, f"CTA('{(text or subj or '')[:30]}…')에 맞는 Notion 선택지가 없음 — 'CTA' 열은 비워 두고 사용자에게 확인"


def notion_to_cta_key(value: str | None, category_no=None) -> tuple[str | None, bool]:
    """Notion CTA → (publish-prep cta_override_key, cta_none). 값이 없으면 (None, False) = 자동 매칭."""
    v = (value or "").strip()
    if not v:
        return None, False
    if v == "없음":
        return None, True
    key = NOTION_CTA_TO_KEY.get(v)
    if v == "이웃 추가" and str(category_no) == "28":
        key = "디딤소식_이웃추가"
    return key, False


def tags_to_notion(tags) -> str:
    if isinstance(tags, str):
        tags = notion_to_tags(tags)
    clean = [re.sub(r"\s+", "", str(t)).lstrip("#") for t in (tags or [])]
    return ", ".join(t for t in clean if t)


def notion_to_tags(text: str | None) -> list[str]:
    return [t.strip() for t in (text or "").replace("#", ",").split(",") if t.strip()]


def category_props(category_no, news_kind: str | None = None) -> dict:
    """categoryNo → 카테고리·categoryNo·2차 분류(·디딤 소식 종류)."""
    no = int(category_no)
    if no in NEW_CATEGORIES:
        p = {"카테고리": NEW_CATEGORIES[no], "categoryNo": no}
    elif no in DIARY_SUB:
        p = {"카테고리": "디딤 다이어리", "categoryNo": no, "2차 분류": DIARY_SUB[no]}
    elif no in LEGACY:
        p = {"카테고리": "레거시", "categoryNo": no}
        if LEGACY[no] in SECOND_CLASS:
            p["2차 분류"] = LEGACY[no]
    else:
        raise ValueError(f"기록 대상 categoryNo 가 아님: {no}")
    if no == 28:
        p["디딤 소식 종류"] = NEWS_KIND_TO_NOTION.get(news_kind or "ip", "IP 뉴스")
    return p


def _num(v):
    if v in (None, ""):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def notion_to_category(row: dict) -> tuple[str | int | None, bool]:
    """콘텐츠 DB 행 → (publish-prep category 입력, office_news)."""
    no = _num(row.get("categoryNo"))
    cat = (row.get("카테고리") or "").strip()
    sub = (row.get("2차 분류") or "").strip()
    office = (row.get("디딤 소식 종류") or "").strip() == "사무소 소식"
    if cat == "레거시":
        return (sub or no), office
    if cat == "디딤 다이어리" and sub:
        return sub, office
    if no is not None:
        return no, office
    return (cat or None), office


def date_prop(name: str, iso: str) -> dict:
    return {f"date:{name}:start": iso, f"date:{name}:is_datetime": 0}


def _get(row: dict, name: str):
    for k in (name, f"date:{name}:start"):
        if row.get(k) not in (None, ""):
            return row[k]
    v = row.get(name)
    if isinstance(v, dict):
        return v.get("start")
    return None


# ─────────────────────────────────────────────────────────────
# writer — 콘텐츠 DB 속성
# ─────────────────────────────────────────────────────────────
def writer_properties(fin: dict, checks: dict | None = None, recommend_source: str | None = None,
                      series: str | None = None, series_no=None, case_memos=(), notices=(), keyword_pages=(),
                      new: bool = False, today: str | None = None) -> dict:
    warnings = []
    cat = fin.get("category") or {}
    props: dict = {"제목": fin.get("title") or "", "상태": fin.get("status_after_save") or STATUS["S1"]}
    no = cat.get("category_no")
    if no is not None:
        props.update(category_props(no, "office" if (no == 28 and cat.get("no_cta")) else "ip"))
    else:
        warnings.append("categoryNo 를 알 수 없음 — 카테고리·categoryNo 열을 사용자에게 확인")
    if fin.get("keyword") is not None:
        props["타깃 키워드"] = fin["keyword"]
    if fin.get("publish_date"):
        props.update(date_prop("발행예정일", fin["publish_date"]))
    props["태그"] = tags_to_notion(fin.get("tags") or [])
    cta_v, w = cta_to_notion(None if cat.get("no_cta") else fin.get("cta"))
    if cta_v:
        props["CTA"] = cta_v
    if w:
        warnings.append(w)
    lv = fin.get("disclaimer_level")
    if lv in DISCLAIMER_TO_NOTION:
        props["면책 레벨"] = DISCLAIMER_TO_NOTION[lv]
    props.update(date_prop("마지막 업데이트일", today or dt.datetime.now(KST).date().isoformat()))
    if recommend_source or new:
        props["추천 소스"] = recommend_source or "직접 입력"
    if series:
        props["시리즈"] = series
    if series_no not in (None, ""):
        props["시리즈 회차"] = int(series_no)
    if case_memos:
        props["사례 메모"] = list(case_memos)
    if notices:
        props["공고"] = list(notices)
    if keyword_pages:
        props["키워드"] = list(keyword_pages)
    if cat.get("category_no") == 26 and not case_memos:
        warnings.append("사례(26) 글인데 '사례 메모' 관계가 없음 — 사용한 사례 메모 페이지를 연결")
    # 검수 기록 줄 (KST)
    parts = [f"- {kst_now()} 초안 작성 → {props['상태'].split()[0]}"]
    if checks and checks.get("score"):
        sc = checks["score"]
        parts.append(f"품질 체크 {sc.get('passedCount')}/{sc.get('total')}({sc.get('score')}점)")
        failed = [f.get("rule") for f in sc.get("failedItems") or []]
        if failed:
            parts.append("미통과: " + ", ".join(failed))
    gw = (checks or {}).get("generated_draft_warnings") or []
    if gw:
        parts.append("생성 경고: " + ", ".join(str(x.get("message", x)) if isinstance(x, dict) else str(x) for x in gw))
    if fin.get("warnings"):
        parts.append("마무리 경고: " + ", ".join(fin["warnings"]))
    if fin.get("edit_notes"):
        parts.append(f"Phase 3 수정 {len(fin['edit_notes'])}건: " + "; ".join(fin["edit_notes"]))
    return {"data_source": DATA_SOURCES["콘텐츠"], "properties": props, "log_line": escape_md(" · ".join(parts)),
            "warnings": warnings, "not_written": ["메모(사람 전용)", "발행일", "발행 URL"]}


# ─────────────────────────────────────────────────────────────
# writer — 사례 메모 (사례 26)
# ─────────────────────────────────────────────────────────────
CASE_FIELDS = ["사례명", "유형", "고객 업종·규모", "상황", "대응", "결과", "핵심 수치", "메모 일자"]


def _checked(v) -> bool:
    return v is True or str(v).strip() in ("__YES__", "true", "True", "Yes", "예", "체크")


def case_memo(rows) -> dict:
    """사례 메모 행 → 사용 가능 여부와 참고 사항 텍스트. '출처 사건번호'는 참고 사항에 넣지 않는다."""
    if isinstance(rows, dict):
        rows = [rows]
    items, ok_text, case_nos = [], [], []
    for r in rows:
        reasons = []
        if not _checked(r.get("익명화 확인")):
            reasons.append("익명화 확인이 체크되지 않음")
        consent = (r.get("고객 공개 동의") or "").strip()
        if consent not in CASE_CONSENT_OK:
            reasons.append(f"고객 공개 동의 = '{consent or '비어 있음'}' (불필요(완전 익명) 또는 받음이어야 함)")
        use = (r.get("사용 상태") or "").strip()
        if use == "사용 불가":
            reasons.append("사용 상태 = 사용 불가")
        cn = (r.get("출처 사건번호") or "").strip()
        if cn:
            case_nos.append(cn)
        item = {"사례명": r.get("사례명"), "url": r.get("url"), "eligible": not reasons, "reasons": reasons,
                "already_used": use == "사용함"}
        items.append(item)
        if not reasons:
            lines = [f"[사례 메모] {r.get('사례명') or ''}".rstrip()]
            for f in CASE_FIELDS[1:]:
                v = _get(r, f) if f == "메모 일자" else r.get(f)
                if isinstance(v, list):
                    v = ", ".join(v)
                if v not in (None, ""):
                    lines.append(f"- {f}: {v}")
            ok_text.append("\n".join(lines))
    context = ""
    if ok_text:
        context = ("[에피소드]\n" + "\n\n".join(ok_text) +
                   "\n\n[참고사항]\n익명화된 실제 사례다. 고객이 특정될 수 있는 회사명·지역·사건번호·날짜는 쓰지 않는다. "
                   "수치는 메모에 있는 값만 쓰고 전제 조건(업종·규모·기간)을 붙인다. 결과를 보장하는 표현을 쓰지 않는다.")
    leaked = sorted(set([c for c in case_nos if c and c in context] + CASE_NO_RE.findall(context)))
    return {"items": items, "eligible_count": sum(1 for i in items if i["eligible"]), "context": context,
            "case_numbers_do_not_publish": case_nos, "context_leak": leaked}


def leak_check(body: str, case_nos=()) -> dict:
    hits = [c for c in case_nos if c and c in (body or "")]
    pattern_hits = sorted(set(CASE_NO_RE.findall(body or "")))
    return {"ok": not hits and not pattern_hits, "exact_hits": hits, "pattern_hits": pattern_hits,
            "note": "출처 사건번호는 본문·제목·태그·이미지·ALT 어디에도 쓰지 않는다. pattern_hits 는 사건번호 형식 문자열(오탐 가능)."}


# ─────────────────────────────────────────────────────────────
# infographic — `## 인포그래픽` 설계 요약 표
# ─────────────────────────────────────────────────────────────
def _cell(s) -> str:
    return escape_md(re.sub(r"\s+", " ", str(s if s is not None else "")).strip())


def infographic_section(designs, note: str | None = None) -> str:
    if isinstance(designs, dict):
        designs = designs.get("infographics") or designs.get("designs") or []
    rows = ['<table header-row="true">', "\t<tr>", "\t\t<td>번호</td>", "\t\t<td>유형</td>", "\t\t<td>위치</td>",
            "\t\t<td>헤드라인</td>", "\t\t<td>ALT</td>", "\t</tr>"]
    for i, d in enumerate(designs or [], 1):
        t = (d.get("type") or "").strip()
        typ = f"{t} {INFOGRAPHIC_TYPE_NAMES.get(t, d.get('type_name') or '')}".strip()
        rows += ["\t<tr>", f"\t\t<td>{i}</td>", f"\t\t<td>{_cell(typ)}</td>", f"\t\t<td>{_cell(d.get('position'))}</td>",
                 f"\t\t<td>{_cell(d.get('headline') or d.get('scene') or '')}</td>", f"\t\t<td>{_cell(d.get('alt'))}</td>",
                 "\t</tr>"]
    rows.append("</table>")
    out = "\n".join(rows)
    if note:
        out += "\n" + escape_md(note)
    return out


# ─────────────────────────────────────────────────────────────
# publish-prep — 페이지 → build 입력, 발행 후 속성
# ─────────────────────────────────────────────────────────────
def to_content(fetched: str, row: dict | None = None) -> dict:
    row = dict(row or page_properties(fetched))
    sec = split_sections(fetched)
    body = section_text(sec["본문"]["body"]) if "본문" in sec else ""
    warnings = []
    if not body:
        warnings.append("페이지에 '## 본문' 섹션이 없거나 비어 있음 — 본문을 사용자에게 받는다")
    category, office = notion_to_category(row)
    status = (row.get("상태") or "").strip()[:2] or None
    cta_key, cta_none = notion_to_cta_key(row.get("CTA"), _num(row.get("categoryNo")))
    lv = NOTION_TO_DISCLAIMER.get((row.get("면책 레벨") or "").strip())
    tags = notion_to_tags(row.get("태그"))
    all_text = "\n".join(section_text(sec[s]["body"]) for s in SECTIONS if s in sec)
    content = {
        "title": row.get("제목") or row.get("title") or "",
        "body": body,
        "tags": tags,
        "category": category,
        "office_news": office,
        "target_keyword": row.get("타깃 키워드") or "",
        "status": status,
        "publish_date": _get(row, "발행예정일"),
        "is_ai_generated": not re.search(r"AI\s*도움\s*[:：]\s*아니오", all_text),
    }
    if cta_key:
        content["cta_override_key"] = cta_key
    if cta_none:
        content["cta_none"] = True
    if lv:
        content["disclaimer_override"] = lv
    if row.get("CTA") and not cta_key and not cta_none:
        warnings.append(f"Notion CTA '{row.get('CTA')}' 를 템플릿으로 바꿀 수 없음 — 자동 매칭 사용")
    if len(tags) and len(tags) != 10:
        warnings.append(f"태그 {len(tags)}개 (10개 권장)")
    if not category:
        warnings.append("카테고리·categoryNo 가 비어 있음 — 사용자에게 확인")
    content["_notion"] = {"filled": {k: bool(row.get(k)) for k in ("태그", "CTA", "면책 레벨")},
                          "missing_sections": sec["_missing"], "warnings": warnings}
    return content


def publish_props(url: str, date: str, build: dict | None = None, row: dict | None = None,
                  from_status: str = "S3") -> dict:
    props = {"상태": STATUS["S4"], **date_prop("발행일", date), "발행 URL": url}
    fill = {}
    if build:
        row = row or {}
        cta = build.get("cta")
        cta_v, _ = cta_to_notion((cta or {}).get("key") if cta else None)
        lv = DISCLAIMER_TO_NOTION.get((build.get("disclaimer") or {}).get("level"))
        if not row.get("CTA") and cta_v:
            fill["CTA"] = cta_v
        if not row.get("면책 레벨") and lv:
            fill["면책 레벨"] = lv
        if not row.get("태그") and (build.get("tags") or {}).get("text"):
            fill["태그"] = tags_to_notion(build["tags"]["text"])
    return {"properties": props, "fill_if_empty": fill,
            "log_line": escape_md(f"- {kst_now()} {from_status}→S4 발행 URL {url}"),
            "note": "사용자 확인 후에만 쓴다. 발행예정일은 그대로 둔다. 상태 전이 조건 검증은 didim-blog-ops."}


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────
def _read(p):
    if p in (None, "-"):
        return sys.stdin.read()
    with open(p, encoding="utf-8") as f:
        return f.read()


def _json(p):
    return json.loads(_read(p))


def main(argv=None):
    ap = argparse.ArgumentParser(description="디딤 블로그 Notion 저장 형식 도우미 (열 값 변환·페이지 5개 섹션)",
                                 formatter_class=argparse.RawDescriptionHelpFormatter, epilog=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("page")
    for k in ("briefing", "body", "infographic", "publish", "log"):
        s.add_argument(f"--{k}-file")
    s = sub.add_parser("split"); s.add_argument("--page-file", required=True)
    s = sub.add_parser("section")
    s.add_argument("--page-file", required=True); s.add_argument("--name", required=True, choices=SECTIONS)
    s.add_argument("--content-file", required=True); s.add_argument("--append", action="store_true")
    s.add_argument("--code", choices=["markdown", "text", "none"], default="none",
                   help="내용을 코드 블록으로 감쌀지(본문은 markdown)")
    s = sub.add_parser("writer-props")
    s.add_argument("--finalize-file", required=True); s.add_argument("--checks-file")
    s.add_argument("--keyword", help="finalize 결과에 키워드가 없을 때")
    s.add_argument("--recommend-source"); s.add_argument("--series"); s.add_argument("--series-no")
    s.add_argument("--case-memo", action="append", default=[]); s.add_argument("--notice", action="append", default=[])
    s.add_argument("--keyword-page", action="append", default=[]); s.add_argument("--new", action="store_true")
    s.add_argument("--today")
    s = sub.add_parser("case-memo"); s.add_argument("--row-file", required=True)
    s = sub.add_parser("leak-check"); s.add_argument("--body-file", required=True)
    s.add_argument("--case-no", action="append", default=[])
    s = sub.add_parser("infographic-section"); s.add_argument("--design", required=True); s.add_argument("--note")
    s = sub.add_parser("to-content"); s.add_argument("--page-file", required=True); s.add_argument("--row-file")
    s = sub.add_parser("publish-props")
    s.add_argument("--url", required=True); s.add_argument("--date", required=True)
    s.add_argument("--build-file"); s.add_argument("--row-file"); s.add_argument("--from-status", default="S3")
    a = ap.parse_args(argv)

    if a.cmd == "page":
        secs = {}
        if a.briefing_file:
            secs["브리핑"] = escape_md(_read(a.briefing_file).strip("\n"))
        if a.body_file:
            secs["본문"] = code_block(_read(a.body_file), "markdown")
        if a.infographic_file:
            secs["인포그래픽"] = _read(a.infographic_file).strip("\n")
        if a.publish_file:
            secs["발행 블록"] = _read(a.publish_file).strip("\n")
        if a.log_file:
            secs["검수 기록"] = _read(a.log_file).strip("\n")
        sys.stdout.write(build_page(secs))
        return
    if a.cmd == "infographic-section":
        sys.stdout.write(infographic_section(_json(a.design), a.note) + "\n")
        return
    if a.cmd == "split":
        sec = split_sections(_read(a.page_file))
        out = {"sections": {s: section_text(sec[s]["body"]) for s in SECTIONS if s in sec},
               "missing": sec["_missing"], "order": sec["_order"], "properties": page_properties(_read(a.page_file))}
    elif a.cmd == "section":
        body = _read(a.content_file)
        if a.code != "none":
            body = code_block(body, a.code)
        out = section_update(_read(a.page_file), a.name, body, a.append)
    elif a.cmd == "writer-props":
        fin = _json(a.finalize_file)
        if a.keyword is not None:
            fin["keyword"] = a.keyword
        out = writer_properties(fin, _json(a.checks_file) if a.checks_file else None, a.recommend_source,
                                a.series, a.series_no, a.case_memo, a.notice, a.keyword_page, a.new, a.today)
    elif a.cmd == "case-memo":
        out = case_memo(_json(a.row_file))
    elif a.cmd == "leak-check":
        out = leak_check(_read(a.body_file), a.case_no)
    elif a.cmd == "to-content":
        out = to_content(_read(a.page_file), _json(a.row_file) if a.row_file else None)
    else:
        out = publish_props(a.url, a.date, _json(a.build_file) if a.build_file else None,
                            _json(a.row_file) if a.row_file else None, a.from_status)
    json.dump(out, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
