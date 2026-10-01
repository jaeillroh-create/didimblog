#!/usr/bin/env python3
"""디딤 블로그 네이버 발행 준비 — publish-helpers.ts + publish-prep-client.tsx 포팅.

원본:
  src/lib/utils/publish-helpers.ts            (markdownToHtml, extractTablesAsTabSeparated,
                                               formatTagsForNaver, stripMarkdown,
                                               generateFormatGuide, enforceEmail, generateImageGuide)
  src/app/(dashboard)/contents/[id]/publish/publish-prep-client.tsx
                                              (FALLBACK_CTA, CTA_KEYWORD_MAP, matchCtaForContent,
                                               PUBLISH_CHECKLIST, 태그 오버플로 표시)
  src/lib/client-generate.ts                  (determineDisclaimerLevel, getDisclaimerText,
                                               DISCLAIMER_LEVEL_LABELS)
  src/actions/settings.ts getCtaTemplates     (DB cta_templates → key 오름차순)
  supabase/migrations/011_seed_cta_templates.sql (DB CTA 시드)
  supabase/seed.sql                           (categories 이름)

Python 3 표준 라이브러리만 사용. 입력/출력은 JSON (UTF-8).
JS 정규식과 결과를 맞추기 위해 \\s, \\w, \\d, '.', ^/$(m 플래그)를 JS 의미로 명시 구현했다.

사용 예:
  python3 publish_prep.py build --input content.json            # 전체 발행 블록(JSON)
  python3 publish_prep.py build --input content.json --format text   # 붙여넣기용 텍스트
  python3 publish_prep.py strip-markdown --input body.md --raw   # 마크다운 제거만
  echo '{"tags":["a b","#c"]}' | python3 publish_prep.py tags
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

# ─────────────────────────────────────────────────────────────
# JS 정규식 의미 재현용 조각
# ─────────────────────────────────────────────────────────────
# JS \s = [\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]
_JS_WS_CHARS = (
    "\t\n\x0b\x0c\r \u00a0\u1680"
    + "".join(chr(c) for c in range(0x2000, 0x200B))
    + "\u2028\u2029\u202f\u205f\u3000\ufeff"
)
S = "[\t\n\x0b\x0c\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]"
_LT = "\n\r\u2028\u2029"  # JS 줄 종결자
DOT = f"[^{_LT}]"  # JS '.' (s 플래그 없음)
MS = f"(?:(?<=[{_LT}])|^)"  # JS '^' (m 플래그) — re.M 없이 사용
ME = f"(?=[{_LT}]|\\Z)"  # JS '$' (m 플래그)
W = "[A-Za-z0-9_]"  # JS \w
D = "[0-9]"  # JS \d


def js_trim(s: str) -> str:
    return s.strip(_JS_WS_CHARS)


def js_len(s: str) -> int:
    """JS String.length (UTF-16 코드 유닛 수)."""
    return len(s.encode("utf-16-le")) // 2


def js_replace_first(s: str, pattern: str, replacement: str) -> str:
    """JS String.prototype.replace(문자열 패턴, 문자열 치환) — 첫 1회, $ 특수패턴 해석."""
    idx = s.find(pattern)
    if idx < 0:
        return s
    out = []
    i = 0
    while i < len(replacement):
        ch = replacement[i]
        if ch == "$" and i + 1 < len(replacement):
            nx = replacement[i + 1]
            if nx == "$":
                out.append("$")
                i += 2
                continue
            if nx == "&":
                out.append(pattern)
                i += 2
                continue
            if nx == "`":
                out.append(s[:idx])
                i += 2
                continue
            if nx == "'":
                out.append(s[idx + len(pattern):])
                i += 2
                continue
        out.append(ch)
        i += 1
    return s[:idx] + "".join(out) + s[idx + len(pattern):]


# ─────────────────────────────────────────────────────────────
# 상수 (원문 그대로)
# ─────────────────────────────────────────────────────────────
DIDIM_EMAIL = "roh@didimip.com"  # categories.ts:36

H2_OPEN = '<h2 style="font-size:20px;font-weight:bold;color:#1B3A5C;margin:24px 0 12px;">'
H1_OPEN = '<h1 style="font-size:24px;font-weight:bold;color:#1B3A5C;margin:24px 0 12px;">'
STRONG_NUM_OPEN = '<strong style="color:#D4740A;font-weight:bold;">'
STRONG_OPEN = '<strong style="font-weight:bold;">'
BLOCKQUOTE_OPEN = '<blockquote style="border-left:4px solid #D4740A;padding-left:16px;color:#555;margin:16px 0;">'
HR_HTML = '<hr style="border:none;border-top:2px solid #D4740A;margin:24px 0;">'
IMG_PLACEHOLDER = (
    '<div style="background:#FFF3E0;padding:12px;border-radius:8px;margin:20px 0;'
    'text-align:center;border:2px dashed #D4740A;"><strong>📷 이미지 {n} 삽입 위치</strong></div>'
)
TABLE_CARD_DIV = '<div style="background:#F8F9FA;padding:16px 20px;border-radius:8px;margin:20px 0;">'
TABLE_CARD_P = '<p style="margin:6px 0;">'
LI_OPEN = '<li style="margin:4px 0;">'
P_OPEN = '<p style="margin:12px 0;line-height:1.8;color:#333;">'

DIVIDER_18 = "━" * 18  # stripMarkdown 수평선 치환 문자열
IMG_BLOCK_END_14 = "━" * 14

TABLE_RE = re.compile(
    "(?:^|\\n)(\\|" + DOT + "+\\|)\\n\\|[-| :]+\\|\\n((?:\\|" + DOT + "+\\|\\n?)+)"
)

# ─────────────────────────────────────────────────────────────
# publish-helpers.ts 포팅
# ─────────────────────────────────────────────────────────────


def _table_to_cards(m: re.Match) -> str:
    header_line, body_lines = m.group(1), m.group(2)
    headers = [h for h in (js_trim(x) for x in header_line.split("|")) if h]
    rows = [
        [c for c in (js_trim(x) for x in row.split("|")) if c]
        for row in js_trim(body_lines).split("\n")
    ]
    cards = []
    for cells in rows:
        parts = []
        for i, cell in enumerate(cells):
            h = headers[i] if i < len(headers) and headers[i] else ""
            parts.append(f"{h}: {cell}")
        parts = [p for p in parts if not p.startswith(": ")]
        cards.append(f"{TABLE_CARD_P}▸ {' — '.join(parts)}</p>")
    return f"\n{TABLE_CARD_DIV}\n" + "\n".join(cards) + "\n</div>\n"


def _split_long_paragraph(m: re.Match) -> str:
    match, inner = m.group(0), m.group(1)
    sentences = [s for s in re.split("(?<=[.!?])" + S + "+", inner) if s]
    if len(sentences) < 5:
        return match
    chunks = [" ".join(sentences[i:i + 3]) for i in range(0, len(sentences), 3)]
    return js_replace_first(match, inner, "<br><br>".join(chunks))


def markdown_to_html(text: str) -> str:
    """markdownToHtml (publish-helpers.ts:6-91)."""
    if not text:
        return ""
    html = text

    # 짝이 안 맞는 ** 전처리 (줄 단위)
    lines = []
    for line in html.split("\n"):
        count = len(re.findall(r"\*\*", line))
        if count % 2 != 0:
            last = line.rfind("**")
            line = line[:last] + line[last + 2:]
        lines.append(line)
    html = "\n".join(lines)

    # 코드 블록 제거
    html = re.sub(r"```[\s\S]*?```", "", html)

    # 제목
    html = re.sub(MS + "## (" + DOT + "+)" + ME, lambda m: f"{H2_OPEN}{m.group(1)}</h2>", html)
    html = re.sub(MS + "# (" + DOT + "+)" + ME, lambda m: f"{H1_OPEN}{m.group(1)}</h1>", html)

    # 볼드: 숫자 포함 → 오렌지, 나머지 → 검정 볼드
    html = re.sub(r"\*\*([^*\n]*" + D + r"[^*\n]*)\*\*", lambda m: f"{STRONG_NUM_OPEN}{m.group(1)}</strong>", html)
    html = re.sub(r"\*\*([^*\n]+)\*\*", lambda m: f"{STRONG_OPEN}{m.group(1)}</strong>", html)

    # 인용
    html = re.sub(MS + "> (" + DOT + "+)" + ME, lambda m: f"{BLOCKQUOTE_OPEN}{m.group(1)}</blockquote>", html)

    # 구분선
    html = re.sub(MS + "---+" + ME, lambda m: HR_HTML, html)
    html = re.sub(MS + r"\*\*\*+" + ME, lambda m: HR_HTML, html)

    # 이미지 삽입 위치 표시 (━━ 📷 이미지 N ━━ ... ━━━━━━━━━━━━━━)
    html = re.sub(
        "━━ 📷 이미지 (" + D + "+) ━━[\\s\\S]*?" + IMG_BLOCK_END_14,
        lambda m: IMG_PLACEHOLDER.format(n=m.group(1)),
        html,
    )

    # [IMAGE: ...] 마커 폴백 제거
    html = re.sub(r"\[IMAGE:[^\]]+\]", "", html)

    # 마크다운 테이블 → 텍스트 카드
    html = TABLE_RE.sub(_table_to_cards, html)

    # 리스트
    html = re.sub(MS + S + "*[-*+]" + S + "+(" + DOT + "+)" + ME, lambda m: f"{LI_OPEN}{m.group(1)}</li>", html)
    html = re.sub(MS + S + "*(" + D + "+)\\." + S + "+(" + DOT + "+)" + ME, lambda m: f"{LI_OPEN}{m.group(2)}</li>", html)

    # 줄바꿈 → 단락
    html = html.replace("\n\n", "</p>" + P_OPEN)
    html = P_OPEN + html + "</p>"

    # 빈 줄 없는 긴 단락(5문장+)에 시각적 여백 추가
    html = re.sub(r"<p[^>]*>([\s\S]*?)</p>", _split_long_paragraph, html)

    # 닫히지 않은 <strong> 태그 정리
    open_count = len(re.findall(r"<strong[^>]*>", html))
    close_count = len(re.findall(r"</strong>", html))
    for _ in range(open_count - close_count):
        html += "</strong>"
    return html


def extract_tables_as_tsv(markdown: str) -> list[str]:
    """extractTablesAsTabSeparated (publish-helpers.ts:97-121)."""
    if not markdown:
        return []
    tables = []
    for m in TABLE_RE.finditer(markdown):
        header_line = m.group(1)
        body_lines = js_trim(m.group(2))
        headers = [h for h in (js_trim(x) for x in header_line.split("|")) if h]
        rows = [[c for c in (js_trim(x) for x in row.split("|")) if c] for row in body_lines.split("\n")]
        tsv = ["\t".join(headers)] + ["\t".join(r) for r in rows]
        tables.append("\n".join(tsv))
    return tables


def format_tags_for_naver(tags: list[str]) -> str:
    """formatTagsForNaver (publish-helpers.ts:126-136) — #태그, 100자(UTF-16) 이내."""
    result = ""
    for tag in tags:
        cleaned = re.sub(S, "", tag).replace("#", "")
        if not cleaned:
            continue
        nxt = f" #{cleaned}" if result else f"#{cleaned}"
        if js_len(result + nxt) > 100:
            break
        result += nxt
    return result


def _numbered_list(m: re.Match) -> str:
    num = re.sub(r"\.\Z", "", js_trim(m.group(0)))
    return f"{num} "


def strip_markdown(text: str) -> str:
    """stripMarkdown (publish-helpers.ts:142-191)."""
    if not text:
        return ""
    r = text
    r = re.sub(MS + "#{1,6}" + S + "+", "", r)
    r = re.sub(r"\*\*\*(" + DOT + r"+?)\*\*\*", lambda m: m.group(1), r)
    r = re.sub(r"\*\*(" + DOT + r"+?)\*\*", lambda m: m.group(1), r)
    r = re.sub(r"\*(" + DOT + r"+?)\*", lambda m: m.group(1), r)
    r = re.sub("___(" + DOT + "+?)___", lambda m: m.group(1), r)
    r = re.sub("__(" + DOT + "+?)__", lambda m: m.group(1), r)
    r = re.sub("_(" + DOT + "+?)_", lambda m: m.group(1), r)
    r = re.sub("~~(" + DOT + "+?)~~", lambda m: m.group(1), r)
    r = re.sub("`(" + DOT + "+?)`", lambda m: m.group(1), r)
    r = re.sub(r"```[\s\S]*?```", "", r)
    r = re.sub(r"\[([^\]]+)\]\([^)]+\)", lambda m: m.group(1), r)
    # 이미지 마커는 유지
    r = re.sub(MS + "---+" + ME, lambda m: DIVIDER_18, r)
    r = re.sub(MS + r"\*\*\*+" + ME, lambda m: DIVIDER_18, r)
    r = re.sub(MS + S + "*[-*+]" + S + "+", "• ", r)
    r = re.sub(MS + S + "*" + D + "+\\." + S + "+", _numbered_list, r)
    r = re.sub(MS + ">" + S + "?", "", r)
    r = re.sub(r"\n{3,}", "\n\n", r)
    return js_trim(r)


FORMAT_GUIDE_FIELD = """[네이버 블로그 포맷 가이드 — 변리사의 현장 수첩]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 후킹 도입부: 본문 바로 시작 (3~5줄)
3. 소제목: "제목2" 스타일 적용 (2~3개)
4. 이미지: [IMAGE] 위치에 준비된 이미지 삽입 (ALT 텍스트 설정)
5. 요약 박스: "바쁜 대표님을 위한 3줄 요약" → 인용구 스타일
6. CTA: 구분선(━━━) 아래 배치
7. 태그: 10개 입력

※ 글자 수: 1,500~2,000자
※ 문단 간격: 3~4줄마다 줄바꿈
※ 첫 이미지: 브랜딩 썸네일"""

FORMAT_GUIDE_BITE = """[네이버 블로그 포맷 가이드 — IP 뉴스 한 입]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 이슈 소개: 간결하게 (300~400자)
3. 시사점: 한 줄 결론 포함 (500~800자)
4. CTA: 이웃 추가 유도 (2줄 이내)
5. 태그: 10개 입력

※ 글자 수: 800~1,200자 (절대 초과 금지)
※ 소제목: 최대 1개
※ 요약 박스 사용 금지"""

FORMAT_GUIDE_LOUNGE = """[네이버 블로그 포맷 가이드 — IP 라운지]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 후킹 도입부: 이슈/트렌드로 시작 (3~5줄)
3. 소제목: "제목2" 스타일 적용 (2~3개)
4. 이미지: [IMAGE] 위치에 삽입 (ALT 텍스트 설정)
5. 요약 박스: 핵심 포인트 3개 → 인용구 스타일
6. CTA: 이웃 추가 + 상담 안내
7. 태그: 10개 입력

※ 글자 수: 1,500~2,000자
※ 문단 간격: 3~4줄마다 줄바꿈"""

FORMAT_GUIDE_DIARY = """[네이버 블로그 포맷 가이드 — 디딤 다이어리]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 자유 에세이 형식 (소제목 구조화 불필요)
3. 이미지: 자유롭게 배치
4. CTA: ❌ 절대 넣지 않는다

※ 글자 수: 800~1,500자
※ 감정과 생각을 담은 일기 형식
※ 상담 문의, 연락처, 이메일 일체 금지"""

FORMAT_GUIDE_DEFAULT = """[네이버 블로그 포맷 가이드]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 소제목: "제목2" 스타일 적용
3. 이미지: ALT 텍스트 반드시 설정
4. 태그: 10개 입력
5. 문단: 3~4줄마다 줄바꿈"""


def generate_format_guide(category_id: str) -> str:
    """generateFormatGuide (publish-helpers.ts:197-268)."""
    if category_id == "CAT-A" or category_id.startswith("CAT-A-"):
        return FORMAT_GUIDE_FIELD
    if category_id == "CAT-B-03":
        return FORMAT_GUIDE_BITE
    if category_id == "CAT-B" or category_id.startswith("CAT-B-"):
        return FORMAT_GUIDE_LOUNGE
    if category_id == "CAT-C" or category_id.startswith("CAT-C-"):
        return FORMAT_GUIDE_DIARY
    return FORMAT_GUIDE_DEFAULT


EMAIL_RE = re.compile("[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+\\." + W + "+")


def enforce_email(text: str | None) -> str | None:
    """enforceEmail (publish-helpers.ts:273-277)."""
    if not text:
        return None
    return EMAIL_RE.sub(DIDIM_EMAIL, text)


def generate_image_guide(body: str) -> list[dict[str, Any]]:
    """generateImageGuide (publish-helpers.ts:282-297)."""
    markers = []
    index = 1
    for m in re.finditer(r"\[IMAGE:" + S + "*(" + DOT + r"+?)\]", body):
        markers.append({"position": index, "description": js_trim(m.group(1))})
        index += 1
    return markers


# ─────────────────────────────────────────────────────────────
# client-generate.ts — Disclaimer (1585-1697)
# ─────────────────────────────────────────────────────────────
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
LEVEL_B_KEYWORDS = ["인증", "벤처", "연구소", "특허법", "법률", "제도", "규정", "시행령",
                    "조항", "조세특례", "소득세법", "법인세법"]  # 원본에서도 선언만 되고 판정에 쓰이지 않음
DISCLAIMER_LEVEL_LABELS = {
    "A": "강한 면책 (절세 사례)",
    "B": "기본 면책 (법률 해설)",
    "C": "약한 면책 (뉴스 분석)",
    "none": "면책 없음 (다이어리)",
}


def get_disclaimer_text(level: str, is_ai_generated: bool = True) -> str:
    template = DISCLAIMER_TEMPLATES.get(level)
    if not template:
        return ""
    if not is_ai_generated:
        return template.replace(AI_NOTICE + "\n\n", "", 1)
    return template


def determine_disclaimer_level(category_id: str, body: str, is_ai_generated: bool = True) -> dict:
    if category_id.startswith("CAT-C"):
        return {"level": "none", "text": ""}
    body_lower = body.lower()
    has_a_kw = any(kw in body_lower for kw in LEVEL_A_KEYWORDS)
    has_amount = re.search(D + "+[만백천]?" + S + "*[억만원]", body) is not None
    if category_id == "CAT-A-01" or (has_a_kw and has_amount):
        return {"level": "A", "text": get_disclaimer_text("A", is_ai_generated)}
    if category_id == "CAT-B-03":
        return {"level": "C", "text": get_disclaimer_text("C", is_ai_generated)}
    if category_id.startswith("CAT-A") or category_id.startswith("CAT-B"):
        return {"level": "B", "text": get_disclaimer_text("B", is_ai_generated)}
    return {"level": "B", "text": get_disclaimer_text("B", is_ai_generated)}


# ─────────────────────────────────────────────────────────────
# publish-prep-client.tsx — CTA 매칭
# ─────────────────────────────────────────────────────────────
_SIG = "노재일 변리사 | 특허그룹 디딤"
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
         "📞 02-571-6613\n📧 roh@didimip.com (메일 제목에 '절세 시뮬레이션'이라고 적어주세요)",
         "절세 시뮬레이션"),
    _cta("현장수첩_인증", "현장 수첩 · 인증 가이드",
         "우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.\n\n"
         "📞 02-571-6613\n📧 roh@didimip.com (메일 제목에 '인증 진단'이라고 적어주세요)",
         "인증 진단"),
    _cta("현장수첩_출원", "현장 수첩 · 특허·상표 출원 실무",
         "출원 전략이 궁금하시면 편하게 연락 주세요.\n"
         "기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.\n\n"
         "📞 02-571-6613\n📧 roh@didimip.com (메일 제목에 '출원 상담'이라고 적어주세요)",
         "출원 상담"),
    _cta("현장수첩_연구소", "현장 수첩 · 연구소 운영",
         "연구소 운영 상태 점검, 무료 진단 가능합니다.\n\n"
         "📞 02-571-6613\n📧 roh@didimip.com (메일 제목에 '연구소 진단'이라고 적어주세요)",
         "연구소 진단"),
    _cta("IP라운지", "IP 라운지",
         "AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.\n\n"
         "📞 02-571-6613\n📧 roh@didimip.com",
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

# supabase/seed.sql — categories (id → name)
DEFAULT_CATEGORIES = [
    {"id": "CAT-INTRO", "name": "디딤 소개"},
    {"id": "CAT-A", "name": "변리사의 현장 수첩"},
    {"id": "CAT-A-01", "name": "절세 시뮬레이션"},
    {"id": "CAT-A-02", "name": "인증 가이드"},
    {"id": "CAT-A-03", "name": "연구소 운영 실무"},
    {"id": "CAT-B", "name": "IP 라운지"},
    {"id": "CAT-B-01", "name": "AI와 IP"},
    {"id": "CAT-B-02", "name": "특허 전략 노트"},
    {"id": "CAT-B-03", "name": "IP 뉴스 한 입"},
    {"id": "CAT-C", "name": "디딤 다이어리"},
    {"id": "CAT-C-01", "name": "컨설팅 후기"},
    {"id": "CAT-C-02", "name": "디딤 일상"},
    {"id": "CAT-C-03", "name": "대표의 생각"},
    {"id": "CAT-CONSULT", "name": "상담 안내"},
]


def _find(templates, pred):
    for t in templates:
        if pred(t):
            return t
    return None


def match_cta_for_content(content: dict, categories: list[dict], cta_templates: list[dict]) -> dict | None:
    """matchCtaForContent (publish-prep-client.tsx:140-210)."""
    category_id = content.get("category_id")
    if category_id == "CAT-C" or (category_id or "").startswith("CAT-C-"):
        return None

    deduped: dict[str, dict] = {}
    for t in list(cta_templates) + FALLBACK_CTA:
        if t["key"] not in deduped:
            deduped[t["key"]] = t
    all_t = list(deduped.values())

    kw = (content.get("target_keyword") or "").lower()
    cat_id = category_id or ""

    # 1순위: 키워드 기반
    if kw:
        for pattern, key in CTA_KEYWORD_MAP:
            if pattern.search(kw):
                m = _find(all_t, lambda t, k=key: t["key"] == k)
                if m:
                    return {**m, "_matched_by": f"1순위 키워드 ({kw} → {key})"}

    # 2순위: secondary_category
    sub_id = content.get("secondary_category")
    if sub_id:
        def tag(t, why):
            return {**t, "_matched_by": why} if t else None
        if sub_id == "CAT-A-01":
            return tag(_find(all_t, lambda t: "절세" in t["key"]), "2순위 2차분류 CAT-A-01")
        if sub_id == "CAT-A-02":
            return tag(_find(all_t, lambda t: "인증" in t["key"]), "2순위 2차분류 CAT-A-02")
        if sub_id == "CAT-A-03":
            return tag(_find(all_t, lambda t: "연구소" in t["key"]), "2순위 2차분류 CAT-A-03")
        if sub_id == "CAT-A-04":
            return tag(_find(all_t, lambda t: "출원" in t["key"]), "2순위 2차분류 CAT-A-04")
        if sub_id.startswith("CAT-B"):
            return tag(_find(all_t, lambda t: "IP라운지" in t["key"] or "IP 라운지" in t["key"]),
                       "2순위 2차분류 CAT-B-*")

    # 3순위: categoryName 부분 매칭
    category = _find(categories, lambda c: c.get("id") == cat_id)
    if category:
        cat_name = js_trim(re.sub("변리사의" + S + "*", "", category.get("name", ""), count=1)).lower()
        prefix = cat_name[:4]
        partial = _find(all_t, lambda t: prefix in (t.get("categoryName") or "").lower())
        if partial:
            return {**partial, "_matched_by": f"3순위 카테고리명 부분('{prefix}')"}

    # 4순위: 1차 카테고리 ID 기반
    if cat_id.startswith("CAT-A"):
        t = _find(all_t, lambda t: "출원" in t["key"]) or (all_t[0] if all_t else None)
        return {**t, "_matched_by": "4순위 CAT-A 범용"} if t else None
    if cat_id.startswith("CAT-B"):
        t = _find(all_t, lambda t: "IP라운지" in t["key"]) or (all_t[0] if all_t else None)
        return {**t, "_matched_by": "4순위 CAT-B 범용"} if t else None

    # 5순위
    t = all_t[0] if all_t else None
    return {**t, "_matched_by": "5순위 범용 폴백"} if t else None


# publish-prep-client.tsx:213-221
PUBLISH_CHECKLIST = [
    {"id": "title", "label": "제목 복사 완료"},
    {"id": "body", "label": "본문 복사 & 붙여넣기 완료"},
    {"id": "images", "label": "이미지 삽입 완료 (ALT 텍스트 포함)"},
    {"id": "cta", "label": "CTA 복사 & 배치 완료"},
    {"id": "tags", "label": "태그 10개 입력 완료"},
    {"id": "format", "label": "네이버 에디터 포맷 적용 완료"},
    {"id": "preview", "label": "미리보기 확인 완료"},
]


def tag_states(tags: list[str]) -> list[dict]:
    """태그 칩 상태 (publish-prep-client.tsx:635-651)."""
    out = []
    for i, tag in enumerate(tags):
        cleaned = re.sub(S, "", tag).replace("#", "")
        preview = format_tags_for_naver(tags[: i + 1])
        prev = format_tags_for_naver(tags[:i])
        is_overflow = js_len(preview) > 100 and js_len(prev) <= 100
        is_excluded = js_len(prev) >= 100
        state = "excluded" if is_excluded else ("overflow" if is_overflow else "ok")
        out.append({"tag": f"#{cleaned}", "state": state})
    return out


# ─────────────────────────────────────────────────────────────
# [스킬 추가] UPGRADE_SPEC §8.1 서식 가이드(행 번호) — 원본 코드 미구현
# ─────────────────────────────────────────────────────────────
_SENT = "\ue000"  # 소제목(##~######) 표시용 사용자 영역 문자 (출력 전 제거)
_SENT_H1 = "\ue001"  # 본문 안 '# '(H1) 표시용


def line_format_guide(body: str) -> list[str]:
    """복사용 본문(stripMarkdown 결과)의 행 번호 기준 서식 안내.

    UPGRADE_SPEC.md §8.1 '서식 가이드 (참고용, 복사 안 됨)' 예시 형식을 따른다.
    원본 코드에는 없는 기능이므로 결과는 참고용이다.
    """
    if not body:
        return []
    marked = re.sub(MS + "(#{1,6})(" + S + "+)",
                    lambda m: m.group(1) + m.group(2) + (_SENT_H1 if m.group(1) == "#" else _SENT), body)
    stripped = strip_markdown(marked)
    lines = stripped.split("\n")
    guide = []
    in_img = False
    img_no = 0
    for i, line in enumerate(lines, start=1):
        text = line.replace(_SENT, "").replace(_SENT_H1, "")
        if in_img:
            if re.fullmatch("━{14,}", text.strip()):
                in_img = False
            continue
        m = re.match("━━ 📷 이미지 (" + D + "+) ━━", text)
        if m:
            in_img = True
            guide.append(f"• {i}행 \"━━ 📷 이미지 {m.group(1)} ━━\" 블록 → 블록 전체를 지우고 이미지 {m.group(1)} 삽입")
            continue
        if _SENT_H1 in line:
            guide.append(f"• {i}행 \"{text[:20]}\" → 본문 첫머리 H1: 제목 칸과 같으면 이 줄 삭제, 아니면 네이버 제목2")
        elif _SENT in line:
            guide.append(f"• {i}행 \"{text[:20]}\" → 네이버 제목2")
        elif text.strip().startswith("━━━") and set(text.strip()) == {"━"}:
            guide.append(f"• {i}행 \"━━━\" → 네이버 구분선 삽입")
        elif re.search(r"\[IMAGE:", text):
            img_no += 1
            guide.append(f"• {i}행 [IMAGE] 마커 → 마커 줄을 지우고 이미지 삽입 (가이드 #{img_no})")
    return guide


def image_blocks(body: str) -> list[dict]:
    """[스킬 추가] '━━ 📷 이미지 N ━━ … ━━━━━━━━━━━━━━' 블록 추출.

    원본 generateImageGuide 의 정규식은 줄바꿈을 넘지 못해 여러 줄짜리 새 마커를 놓친다.
    ALT 후보로 블록 안 [IMAGE: 첫 '|' 앞 설명]을 돌려준다.
    """
    out = []
    for m in re.finditer("━━ 📷 이미지 (" + D + "+) ━━([\\s\\S]*?)" + IMG_BLOCK_END_14, body):
        inner = m.group(2)
        desc = ""
        mm = re.search(r"\[IMAGE:" + S + "*([^|\]\n]+)", inner)
        if mm:
            desc = js_trim(mm.group(1))
        out.append({"number": int(m.group(1)), "alt_candidate": desc, "block": m.group(0)})
    return out



# ─────────────────────────────────────────────────────────────
# [보조] 태그가 없을 때 — client-generate.ts generateAutoTags (1699-1780) 포팅
# prompts.ts getPromptKey (57-80) 포함
# ─────────────────────────────────────────────────────────────
DEFAULT_TAGS_BY_CATEGORY = {  # client-generate.ts:1320-1349
    "PROMPT_FIELD": ["직무발명보상", "법인세절감", "중소기업절세", "변리사", "특허출원", "기업부설연구소", "벤처기업인증"],
    "PROMPT_LOUNGE_GENERAL": ["지식재산", "특허전략", "IP라운지", "AI특허", "스타트업특허", "기업IP", "변리사칼럼"],
    "PROMPT_LOUNGE_BITE": ["IP뉴스", "특허이슈", "지식재산트렌드", "특허개정", "한입IP", "변리사칼럼", "IP라운지"],
    "PROMPT_DIARY": [],
}


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


def _category_suffixes(category_id: str) -> list[str]:
    if category_id.startswith("CAT-A"):
        return ["절세", "세액공제", "중소기업", "방법"]
    if category_id.startswith("CAT-B"):
        return ["전략", "트렌드", "가이드", "분석"]
    return ["후기", "이야기"]


def generate_auto_tags(prompt_key: str, target_keyword: str | None = None,
                       keyword_positions: list[str] | None = None, category_id: str | None = None) -> list[str]:
    def normalize(t: str) -> str:
        return re.sub("^#", "", re.sub(S + "+", "", t), count=1)

    brand = ["특허그룹디딤", "디딤변리사"]
    if prompt_key == "PROMPT_DIARY":
        return list(brand)
    tags: list[str] = []
    seen: set[str] = set()

    def push(raw: str):
        t = normalize(raw)
        if not t or js_len(t) < 2 or t in seen:
            return
        seen.add(t)
        tags.append(t)

    kw = js_trim(target_keyword or "")
    if kw:
        push(kw)
        words = [w for w in re.split(S + "+", kw) if js_len(w) >= 2]
        if len(words) >= 2:
            push("".join(words[-2:]))
            push("".join(words))
        for suffix in _category_suffixes(category_id or ""):
            push(normalize(kw) + suffix)
            if len(tags) >= 5:
                break
    if keyword_positions:
        for pos in keyword_positions:
            after = ":".join(pos.split(":")[1:]) if ":" in pos else pos
            cleaned = js_trim(re.sub("[,()]", "", after))
            if js_len(cleaned) >= 2:
                push(cleaned)
            if len(tags) >= 8:
                break
    for d in DEFAULT_TAGS_BY_CATEGORY.get(prompt_key, []):
        push(d)
        if len(tags) >= 8:
            break
    for b in brand:
        push(b)
    return tags[:10]


DIARY_CTA_KEYWORDS = ["상담", "문의", "연락", "무료", "진단", "시뮬레이션", "@didimip"]  # prompts.ts:1767


def publish_warnings(body: str, stripped: str, is_diary: bool, has_cta_block: bool,
                     image_markers: list, blocks: list, chips: list) -> list[str]:
    """[스킬 추가] 붙여넣기 전 확인할 점. 원본 화면에는 없는 점검이다."""
    w = []
    no_img = re.sub("━━ 📷 이미지 " + D + "+ ━━[\\s\\S]*?" + IMG_BLOCK_END_14, "", body)
    if has_cta_block and (re.search(MS + "━{3,}" + S + "*" + ME, no_img)
                          or "roh@didimip" in no_img or "02-571-6613" in no_img):
        w.append("본문에 이미 구분선(━━) 또는 roh@didimip 가 있습니다. CTA 블록과 중복되지 않게 하나만 쓰세요.")
    if re.search(MS + r"\|" + DOT + r"+\|" + ME, stripped):
        w.append("복사용 본문에 마크다운 표 줄(| … |)이 남아 있습니다. 표 데이터 블록을 에디터 표에 붙여넣고 본문의 표 줄은 지우세요.")
    if re.search(MS + "`", stripped):
        w.append("코드 블록 잔재(` 로 시작하는 줄)가 남아 있습니다. 붙여넣은 뒤 지우세요.")
    if blocks and not image_markers:
        w.append(f"여러 줄 이미지 블록 {len(blocks)}개는 이미지 가이드에 잡히지 않습니다. '━━ 📷 이미지 N ━━' 블록 자리에 이미지를 넣으세요.")
    dropped = [c["tag"] for c in chips if c["state"] != "ok"]
    if dropped:
        w.append("100자 제한으로 빠진 태그: " + ", ".join(dropped))
    if "특허청" in body:
        w.append("본문에 '특허청'이 있습니다. 현재 시점이면 '지식재산처'로 고치세요(과거 맥락·법령명 제외).")
    bad_emails = [e for e in EMAIL_RE.findall(body) if e != DIDIM_EMAIL]
    if bad_emails:
        w.append("roh@didimip.com 이 아닌 이메일: " + ", ".join(bad_emails))
    if is_diary:
        found = [k for k in DIARY_CTA_KEYWORDS if k in body]
        if found:
            w.append("디딤 다이어리 본문에 CTA 관련 표현: " + ", ".join(found) + " — 삭제를 권합니다.")
    return w


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
            "IP 관련 상담이 필요하시면: roh@didimip.com\n\n노재일 변리사 | 특허그룹 디딤",
    "note": "원문: seed_data/cta_templates.json 'IP라운지' (= UPGRADE_SPEC §5.2 NEIGHBOR). '매주 화요일'은 현재 발행 요일과 맞는지 확인",
    "conversionMethod": "이웃 추가 유도 + 이메일 안내 → 장기 관계 유지",
    "emailSubjectTag": None,
}
BITE_CTA = {
    "key": "디딤소식_이웃추가",
    "categoryName": "디딤 소식 · 가벼운 이웃 추가",
    "text": "━━━━━━━━━━━━━━━━━━\nIP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.\n\n노재일 변리사 | 특허그룹 디딤",
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

# ─────────────────────────────────────────────────────────────
# build — 발행 준비 화면 전체 재현
# ─────────────────────────────────────────────────────────────
STATUS_LABELS = {"S0": "기획중", "S1": "초안완료", "S2": "검토완료", "S3": "발행예정", "S4": "발행완료", "S5": "성과측정"}


def _route(content: dict):
    """입력 카테고리 → (mode, 정본 행, category_id 별칭, secondary 별칭).

    mode: new(신규 구조, _DECISIONS 2절) / legacy(레거시·다이어리 — 원본 로직에 CAT 별칭 전달)
          / fixed(디딤 소개·상담 안내) / code(CAT-* 만 주어진 경우 — 원본과 완전히 동일)
    """
    cat_in = content.get("category_no")
    if cat_in in (None, ""):
        cat_in = content.get("category")
    row = resolve_category(cat_in) if cat_in not in (None, "") else None
    if row is None:
        return "code", None, content.get("category_id") or "", content.get("secondary_category") or ""
    if row["kind"] == "new":
        return "new", row, "", ""
    if row["kind"] == "fixed":
        return "fixed", row, row["alias"], ""
    if row["parent"]:
        parent = resolve_category(row["parent"])
        return "legacy", row, parent["alias"], row["alias"]
    return "legacy", row, row["alias"], ""


def build(content: dict) -> dict:
    title = content.get("title") or ""
    body = content.get("body") or ""
    tags = content.get("tags") or []
    mode, row, category_id, secondary = _route(content)
    is_ai = bool(content.get("is_ai_generated", True))
    status = content.get("status")

    categories = content.get("categories") or DEFAULT_CATEGORIES
    if content.get("use_db_cta_templates", True):
        db_templates = content.get("cta_templates") or DB_CTA_TEMPLATES_DEFAULT
    else:
        db_templates = []

    options: dict[str, dict] = {}
    for t in db_templates:
        options[t["key"]] = t
    for t in FALLBACK_CTA:
        options.setdefault(t["key"], t)
    if mode == "new":
        options.setdefault(NEIGHBOR_CTA["key"], NEIGHBOR_CTA)
        options.setdefault(BITE_CTA["key"], BITE_CTA)

    # CTA + 면책·포맷 가이드용 유효 카테고리(CAT 별칭)
    is_diary = category_id == "CAT-C" or category_id.startswith("CAT-C-")
    cta_none_reason = None
    if mode == "new":
        v2 = cta_for_new_category(row["no"], content.get("target_keyword"), title,
                                  bool(content.get("office_news")), db_templates)
        auto_cta = {**v2["template"], "_matched_by": v2["matched_by"]} if v2["template"] else None
        effective = v2["disclaimer_alias"]
        if auto_cta is None:
            cta_none_reason = v2["matched_by"]
    elif mode == "fixed":
        auto_cta = None
        effective = category_id
        cta_none_reason = "고정 페이지(디딤 소개·상담 안내) — 자동 생성·발행 준비 대상 아님"
    else:
        auto_cta = match_cta_for_content(
            {"category_id": category_id or None, "secondary_category": secondary or None,
             "target_keyword": content.get("target_keyword")},
            categories, db_templates)
        effective = secondary or category_id or ""
        if is_diary:
            cta_none_reason = "디딤 다이어리 — CTA 금지(절대원칙)"

    auto = determine_disclaimer_level(effective, body, is_ai)
    level = content.get("disclaimer_override") or auto["level"]
    disclaimer_text = get_disclaimer_text(level, is_ai)

    override = content.get("cta_override_key")
    if cta_none_reason and (is_diary or mode == "fixed" or (row and row["kind"] == "diary")):
        matched = None  # 다이어리·고정 페이지는 수동 선택도 무시
    elif content.get("cta_none"):
        # [스킬] Notion 'CTA' 열 = 없음 (notion_page.py to-content) — 사용자가 CTA 를 빼기로 한 글
        matched = None
        cta_none_reason = content.get("cta_none_reason") or "Notion 'CTA' 열 = 없음"
    else:
        matched = (options.get(override) or auto_cta) if override else auto_cta
    cta_text = enforce_email(matched.get("text")) if matched and matched.get("text") else None
    no_cta = matched is None and cta_none_reason is not None

    stripped = strip_markdown(body)
    tags_text = format_tags_for_naver(tags) if tags else ""
    markers = generate_image_guide(body)

    preview_mode = status is not None and status not in ("S3", "S4", "S5")
    blocks = image_blocks(body)
    chips = tag_states(tags)
    result = {
        "preview_mode": preview_mode,
        "status": status,
        "status_label": STATUS_LABELS.get(status, status),
        "title": {"text": title, "length": js_len(title)},
        "body": {"text": stripped, "length": js_len(stripped)},
        "body_html": markdown_to_html(body),
        "tables_tsv": extract_tables_as_tsv(body),
        "disclaimer": {
            "auto_level": auto["level"],
            "level": level,
            "label": DISCLAIMER_LEVEL_LABELS.get(level),
            "text": disclaimer_text,
            "show": level != "none" and bool(disclaimer_text),
        },
        "category": {
            "mode": mode,
            "category_no": row["no"] if row else None,
            "name": row["name"] if row else next((c["name"] for c in categories if c.get("id") == category_id), None),
            "kind": row["kind"] if row else "code",
            "maps_to": row["maps_to_name"] if row else None,
            "legacy_alias": effective,
            "prompt_key": row["prompt_key"] if row else get_prompt_key(effective),
        },
        "cta": None if no_cta else {
            "key": matched.get("key") if matched else None,
            "category_name": matched.get("categoryName") if matched else None,
            "matched_by": (matched or {}).get("_matched_by", (content.get("cta_override_label") or "수동 선택") if override else None),
            "text": cta_text,
            "note": matched.get("note") if matched else None,
            "options": [t["key"] for t in options.values()],
        },
        "cta_none_reason": cta_none_reason if no_cta else None,
        "diary_notice": "디딤 다이어리는 CTA를 넣지 않습니다. 상업적 CTA가 진정성을 훼손할 수 있습니다." if (
            is_diary or (row and row["kind"] == "diary")) else None,
        "tags": {"text": tags_text, "length": js_len(tags_text), "count": len(tags), "chips": chips},
        "image_guide": markers,
        "alt_texts": [m["description"] for m in markers],
        "format_guide": generate_format_guide(effective),
        "checklist": PUBLISH_CHECKLIST,
        "info": {
            "category_name": (row["name"] if row else next((c["name"] for c in categories if c.get("id") == category_id), "-")),
            "target_keyword": content.get("target_keyword") or "-",
            "publish_date": content.get("publish_date") or "-",
            "raw_body_length": js_len(body),
        },
        # ── 스킬 추가 정보 (원본 화면에 없음) ──
        "extra": {
            "body_has_cta": ("━━" in body) or ("roh@didimip" in body),  # review-panel.tsx:104 식
            "image_blocks": [{k: v for k, v in b.items() if k != "block"} for b in blocks],
            "warnings": ([f"레거시 카테고리 '{row['name']}' — 사용자가 지정한 경우에만 사용. 신규 구조 대응: {row['maps_to_name']}"]
                         if row and row["kind"] == "legacy" else [])
                        + ([row["warning"]] if row and row.get("warning") else [])
                        + publish_warnings(body, stripped, is_diary or bool(row and row["kind"] == "diary"),
                                           bool(cta_text), markers, blocks, chips),
            "line_format_guide": line_format_guide(body),
        },
    }
    # ── [스킬] Notion 전용 열 값 (_DECISIONS.md 7절) — 계산 결과를 열 선택지로 옮기기만 한다 ──
    ex = result["extra"]
    if override and override not in options and not (cta_none_reason and matched is None):
        ex["warnings"].append(f"CTA '{override}' 는 이 카테고리의 템플릿 목록에 없어 자동 매칭을 사용했습니다")
    for w in (content.get("_notion") or {}).get("warnings") or []:
        ex["warnings"].append(w)
    result["notion_values"] = notion_values(result, tags)
    return result


_NOTION_CTA_BY_KEY = {"현장수첩_절세": "절세 시뮬레이션", "현장수첩_인증": "인증 진단", "현장수첩_연구소": "연구소 진단",
                      "현장수첩_출원": "출원 상담", "이웃추가": "이웃 추가", "디딤소식_이웃추가": "이웃 추가"}


def notion_values(r: dict, tags: list[str]) -> dict:
    """build 결과 → Notion "디딤 블로그 콘텐츠" 전용 열 값(CTA·면책 레벨·태그). 선택지 없는 CTA 는 None."""
    cta = r.get("cta")
    if cta is None:
        cta_v = "없음"
    else:
        cta_v = _NOTION_CTA_BY_KEY.get(cta.get("key"))
    lv = r["disclaimer"]["level"]
    return {"CTA": cta_v, "면책 레벨": {"none": "없음"}.get(lv, lv),
            "태그": ", ".join(re.sub(r"\s+", "", t).lstrip("#") for t in tags if str(t).strip())}


def render_text(r: dict, fence: str = "````", heading: str = "##") -> str:
    """'네이버 에디터에 그대로 붙여넣을 블록' 텍스트 렌더링."""
    F = fence
    out = []
    if r["preview_mode"]:
        out.append(f"⚠️ 미리보기 모드 — 현재 상태가 {r['status_label']}이므로 본문/CTA/태그 확인 및 복사만 가능합니다. "
                   "발행 완료 처리는 S3(발행예정) 이상에서 활성화됩니다.\n")
    if r["extra"]["warnings"]:
        out.append("⚠️ 확인 필요\n" + "\n".join(f"- {x}" for x in r["extra"]["warnings"]) + "\n")
    c0 = r["category"]
    if c0["category_no"] is not None:
        out.append(f"카테고리: {c0['name']} (categoryNo {c0['category_no']}, {c0['kind']}) · 프롬프트 키 {c0['prompt_key']}\n")
    out.append(f"## [1] 제목 → 네이버 '제목' 칸 ({r['title']['length']}자)\n{F}text\n{r['title']['text'] or '제목 없음'}\n{F}\n")
    out.append(f"## [2] 본문 → 본문 영역에 붙여넣기 ({r['body']['length']:,}자)\n{F}text\n{r['body']['text'] or '본문이 없습니다'}\n{F}\n")
    if r["tables_tsv"]:
        out.append(f"## [2-1] 표 데이터 ({len(r['tables_tsv'])}개) → 네이버 에디터에서 표 삽입 후 붙여넣기\n{F}text\n" + "\n\n".join(r["tables_tsv"]) + f"\n{F}\n")
    d = r["disclaimer"]
    if d["show"]:
        out.append(f"## [3] 면책조항 Level {d['level']} — {d['label']} (자동: {d['auto_level']})\n{F}text\n{d['text']}\n{F}\n")
    if r["cta"] is not None:
        c = r["cta"]
        if c["text"]:
            out.append(f"## [4] CTA ({c['category_name']}) — 매칭: {c['matched_by']}\n{F}text\n{c['text']}\n{F}\n")
        else:
            out.append("## [4] CTA\n이 카테고리에 매칭되는 CTA 템플릿이 없습니다.\n")
        if c.get("note"):
            out.append(f"참고: {c['note']}\n")
    else:
        out.append(f"## [4] CTA 없음 — {r['cta_none_reason']}\n" + (f"{r['diary_notice']}\n" if r["diary_notice"] else ""))
    t = r["tags"]
    if t["count"]:
        excluded = [c["tag"] for c in t["chips"] if c["state"] != "ok"]
        extra = f" · 100자 초과로 제외: {', '.join(excluded)}" if excluded else ""
        out.append(f"## [5] 태그 → 태그 입력란 ({t['length']}/100자 · {t['count']}개{extra})\n{F}text\n{t['text']}\n{F}\n")
    else:
        out.append("## [5] 태그\n태그가 없습니다. 콘텐츠 상세에서 추가해주세요.\n")
    if r["image_guide"]:
        lines = "\n".join(f"#{m['position']} {m['description']}\n   ALT: {m['description']}" for m in r["image_guide"])
        out.append(f"## [6] 이미지 가이드 / ALT\n{lines}\n\nALT 텍스트 전체:\n{F}text\n" + "\n".join(r["alt_texts"]) + f"\n{F}\n")
    else:
        out.append("## [6] 이미지 가이드\n본문에 [IMAGE: 설명] 마커가 없습니다.\n")
        if r["extra"]["image_blocks"]:
            ib = "\n".join(f"#{b['number']} ALT 후보: {b['alt_candidate']}" for b in r["extra"]["image_blocks"])
            out.append(f"(스킬 보완) 여러 줄 이미지 블록 감지:\n{ib}\n")
    out.append(f"## [7] 포맷 가이드 (참고용, 복사 안 함)\n{F}text\n{r['format_guide']}\n{F}\n")
    if r["extra"]["line_format_guide"]:
        out.append("## [7-1] 서식 행 가이드 (UPGRADE_SPEC §8.1, 참고용)\n" + "\n".join(r["extra"]["line_format_guide"]) + "\n")
    out.append("## [8] 발행 체크리스트 (7항목 모두 완료해야 발행 완료 S3→S4)\n" + "\n".join(f"☐ {c['label']}" for c in r["checklist"]) + "\n")
    i = r["info"]
    out.append(f"## 콘텐츠 정보\n카테고리: {i['category_name']} · 타겟 키워드: {i['target_keyword']} · 발행예정일: {i['publish_date']} · 본문 글자수: {i['raw_body_length']:,}자\n")
    return "\n".join(out)


def render_notion(r: dict) -> str:
    """[스킬] Notion 글 페이지 `## 발행 블록` 섹션 내용 (_DECISIONS.md 7절).

    render_text 와 같은 블록·순서·문구. 복사 대상은 ```text 코드 블록(원문 그대로 보존), 블록 제목은 ###,
    코드 블록 밖 안내문은 Notion 마크다운 이스케이프만 한다.
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from notion_page import escape_md  # 같은 폴더의 notion_page.py (core 정본 사본)
    text = render_text(r, fence="```")
    out, in_code, broken = [], False, False
    for line in text.split("\n"):
        if line.startswith("```"):
            if not in_code:
                in_code = True
            elif line == "```":
                in_code = False
            else:
                broken = True  # 본문 속 ``` 줄 — Notion 코드 블록을 끊을 수 있다
            out.append(line)
        elif in_code:
            out.append(line)
        else:
            out.append(escape_md("###" + line[2:] if line.startswith("## ") else line))
    res = "\n".join(out).rstrip("\n")
    if broken:
        res = escape_md("⚠️ 본문에 ``` 로 시작하는 줄이 있어 Notion 코드 블록이 끊길 수 있습니다. 해당 줄을 정리한 뒤 다시 만드세요.") + "\n" + res
    return res


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────

def _read_input(path: str | None) -> str:
    if path and path != "-":
        with open(path, encoding="utf-8") as f:
            return f.read()
    return sys.stdin.read()


def _load_json(path):
    raw = _read_input(path)
    return json.loads(raw) if raw.strip() else {}


def main(argv=None):
    p = argparse.ArgumentParser(
        description="디딤 블로그 네이버 발행 준비 (publish-helpers.ts 포팅). 입력은 JSON(또는 --raw 텍스트), 출력은 JSON.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""하위 명령 입력 JSON 키:
  build           {title, body, tags[], category(네이버 이름) 또는 category_no(categoryNo),
                   office_news(디딤 소식 중 사무소 소식이면 true),
                   [레거시 호환] category_id, secondary_category (CAT-*), target_keyword,
                   is_ai_generated(기본 true), status, publish_date,
                   cta_override_key, disclaimer_override(A|B|C|none),
                   use_db_cta_templates(기본 true), cta_templates[], categories[]}
  strip-markdown  {body}  (--raw 이면 표준입력 텍스트 그대로)
  to-html         {body}
  tables          {body}
  tags            {tags[]}
  format-guide    {category_id}
  enforce-email   {text}
  image-guide     {body}
  disclaimer      {category_id, body, is_ai_generated}
  match-cta       {category_id, secondary_category, target_keyword, use_db_cta_templates}
  line-guide      {body}   (스킬 추가 기능, UPGRADE_SPEC §8.1)
  auto-tags       {category 또는 category_id, target_keyword, keyword_positions[]}  (태그가 없을 때, generateAutoTags 포팅)
  resolve-category {category}   categoryNo/이름/CAT-* → 정본 행(구분·레거시 별칭·신규 대응·프롬프트 키)
  match-cta-new   {category, target_keyword, title, office_news}  신규 구조 CTA(_DECISIONS 2절)
  from-notion     -i <notion-fetch 결과 텍스트> [--row <속성 JSON>]  → build 입력 JSON (스킬 추가, _DECISIONS 7절)
                  제목·'## 본문' 섹션·태그·CTA(→cta_override_key, 없음→cta_none)·면책 레벨(→disclaimer_override)·
                  카테고리/categoryNo/2차 분류·디딤 소식 종류(→office_news)·타깃 키워드·상태·발행예정일
  build --format notion   Notion 페이지 '## 발행 블록' 섹션 내용(### 블록 제목 + ```text 코드 블록)
  build 결과의 notion_values = {CTA, 면책 레벨, 태그} Notion 전용 열 값(선택지 없는 CTA 는 null)
""",
    )
    p.add_argument("command", choices=["build", "strip-markdown", "to-html", "tables", "tags", "format-guide",
                                       "enforce-email", "image-guide", "disclaimer", "match-cta", "line-guide",
                                       "auto-tags", "resolve-category", "match-cta-new", "from-notion"])
    p.add_argument("--input", "-i", help="입력 파일 경로 (생략/'-' 이면 표준입력)")
    p.add_argument("--raw", action="store_true", help="입력을 JSON 이 아닌 본문 텍스트로 취급")
    p.add_argument("--format", choices=["json", "text", "notion"], default="json", help="build 출력 형식")
    p.add_argument("--row", help="from-notion: 콘텐츠 DB 행 속성 JSON 파일(없으면 fetch 결과의 <properties> 사용)")
    a = p.parse_args(argv)

    if a.command == "from-notion":
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
        from notion_page import to_content
        row = _load_json(a.row) if a.row else None
        json.dump(to_content(_read_input(a.input), row), sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return
    if a.raw:
        data = {"body": _read_input(a.input), "text": None}
        data["text"] = data["body"]
    else:
        data = _load_json(a.input)

    cmd = a.command
    if cmd == "build":
        r = build(data)
        if a.format == "text":
            sys.stdout.write(render_text(r))
            return
        if a.format == "notion":
            sys.stdout.write(render_notion(r) + "\n")
            return
        result: Any = r
    elif cmd == "strip-markdown":
        result = strip_markdown(data.get("body") or "")
    elif cmd == "to-html":
        result = markdown_to_html(data.get("body") or "")
    elif cmd == "tables":
        result = extract_tables_as_tsv(data.get("body") or "")
    elif cmd == "tags":
        tags = data.get("tags") or []
        result = {"text": format_tags_for_naver(tags), "chips": tag_states(tags)}
    elif cmd == "format-guide":
        result = generate_format_guide(data.get("category_id") or "")
    elif cmd == "enforce-email":
        result = enforce_email(data.get("text"))
    elif cmd == "image-guide":
        result = generate_image_guide(data.get("body") or "")
    elif cmd == "disclaimer":
        result = determine_disclaimer_level(data.get("category_id") or "", data.get("body") or "",
                                            bool(data.get("is_ai_generated", True)))
    elif cmd == "match-cta":
        db = (data.get("cta_templates") or DB_CTA_TEMPLATES_DEFAULT) if data.get("use_db_cta_templates", True) else []
        result = match_cta_for_content(data, data.get("categories") or DEFAULT_CATEGORIES, db)
    elif cmd == "auto-tags":
        cid = data.get("category_id") or ""
        row = resolve_category(data.get("category")) if data.get("category") not in (None, "") else None
        if row:
            cid = row["alias"]
        pk = (row["prompt_key"] if row and row["prompt_key"] else get_prompt_key(cid))
        result = generate_auto_tags(pk, data.get("target_keyword"), data.get("keyword_positions"), cid)
    elif cmd == "resolve-category":
        result = resolve_category(data.get("category"))
    elif cmd == "match-cta-new":
        row = resolve_category(data.get("category"))
        if not row or row["kind"] == "legacy":
            result = {"error": "신규 구조/다이어리/고정 카테고리가 아님 — 레거시는 match-cta(CAT-* 입력)를 쓴다"}
        else:
            r = cta_for_new_category(row["no"], data.get("target_keyword"), data.get("title"),
                                     bool(data.get("office_news")), DB_CTA_TEMPLATES_DEFAULT)
            t = r["template"]
            result = {"key": t["key"] if t else None, "text": enforce_email(t["text"]) if t else None,
                      "email_subject": t.get("emailSubjectTag") if t else None,
                      "matched_by": r["matched_by"], "disclaimer_alias": r["disclaimer_alias"]}
    else:  # line-guide
        result = line_format_guide(data.get("body") or "")
    json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
