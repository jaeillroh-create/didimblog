#!/usr/bin/env python3
"""디딤 블로그 인포그래픽 렌더러 (인포그래픽 규칙 v2 기준).

설계 JSON(type, position, headline, texts, data_source, emphasis, footnote, alt)을 받아
썸네일(T) + 본문 인포그래픽 A~H 를 SVG 로 그린다. 표준 라이브러리만 사용한다.
PNG 는 가능한 경우에만 만든다(cairosvg → Python playwright → Node playwright 순서로 시도).

texts 배치 규칙 (유형별) — texts 에 없는 글자는 그리지 않는다(썸네일 브랜드 라인 "특허그룹 디딤"만 고정 예외):
  T  썸네일   : [카테고리 태그(빈 문자열 가능), 메인 줄1, 메인 줄2, (메인 줄3), (서브문구 11자 이상)]
  A  비교     : [라벨A, 값A, 라벨B, 값B, (차이 표시)]          예) ["적용 전","법인세 2억 원","적용 후","법인세 약 5,000만 원","약 75% 감소"]
  B  프로세스 : [단계1, 단계2, ...] 3~5개. 단계에 설명을 붙이려면 "제목|설명"
  C  숫자 카드: [라벨1, 값1, 라벨2, 값2, ...] 3~4쌍 (3쌍=세로 3칸, 4쌍=2×2)
  D  타임라인 : [시점1, 내용1, 시점2, 내용2, ...] 3쌍 이상, 시간 순
  E  체크리스트: [항목1, ...] 5~7개
  F  퍼널     : [단계 라벨1, 수치1, ...] 3쌍 이상, 위가 넓은 단부터
  G  구조도   : [중심 주체, "주체2|관계", "주체3|관계", ...] 주체 3개 이상
  H  수평 막대: [라벨1, 값1, ...] 같은 단위 3~6쌍 (큰 값부터 자동 정렬)
  쌍(pair) 유형(A 제외)에서 홀수로 남는 마지막 항목은 하단 요약 문구로 그린다.
  "|" 는 구분자이며 이미지에 그리지 않는다.

사용 예:
  python3 render.py --input design.json --category "변리사의 현장 수첩" --out out/ --png auto
  python3 render.py --input design.json --out out/ --png off   # SVG + preview.html 만
입력: 설계 객체 1개, 배열, 또는 {"infographics": [...]} . 객체별 "category" 키가 있으면 --category 보다 우선.
출력(stdout JSON): {"outputs":[{"index","type","svg","png","width","height","warnings"}], "png_engine", "preview", "font_note"}
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from design_json import load_designs  # noqa: E402
from categories import resolve as resolve_cat  # noqa: E402

# ── 블로그 이미지 팔레트 (v2 "블로그 이미지 팔레트" 표) ──
BLOG_IMAGE_PALETTE = {
    "field": {"name": "변리사의 현장 수첩", "main": "#D4740A", "accent": "#1B3A5C", "on_main": "#FFFFFF"},
    "lounge": {"name": "IP 라운지", "main": "#1B3A5C", "accent": "#C28B2E", "on_main": "#FFFFFF"},
    "news": {"name": "IP 뉴스 한 입", "main": "#3A3A3A", "accent": "#C5302B", "on_main": "#FFFFFF"},
    # 본문 인포그래픽(공통): 흰색 배경 + 해당 카테고리 대표색 강조 + 진한 회색 글자
    "body": {"bg": "#FFFFFF", "text": "#191F28"},
    # v2: "보조 회색 1색까지" — hex 값은 v2에 없음. 스킬에서 정한 값(확인 필요).
    "support_gray": "#8B95A1",
}
BRAND = "특허그룹 디딤"
FONT_FAMILY = "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif"
MIN_FONT = 28  # v2: 가장 작은 글자도 폭의 2.5% 이상 (1080px 기준 약 28px)
SIZE_THUMB = (1080, 1080)
SIZE_BODY = (1080, 1350)
TYPE_NAMES = {
    "T": "썸네일", "A": "비교", "B": "프로세스", "C": "숫자 카드", "D": "타임라인",
    "E": "체크리스트", "F": "퍼널", "G": "구조도", "H": "수평 막대",
}


def resolve_category(name):
    """카테고리명(신규·레거시)·categoryNo → 팔레트 키 field/lounge/news, 다이어리는 'diary'.
    매핑은 categories.py (skills/_DECISIONS.md). 모르는 이름이면 field + 경고."""
    r = resolve_cat(name)
    if r is None:
        if (name or "").strip():
            sys.stderr.write(f"[render] 알 수 없는 카테고리 '{name}' — 현장 수첩 팔레트로 그립니다\n")
        return "field"
    return r["group"]


# ── 글자 폭 추정 (Noto Sans KR 기준 근사, 보수적으로 넉넉하게) ──
def char_em(ch):
    o = ord(ch)
    if ch == " ":
        return 0.33  # Noto Sans KR 0.25em, CJK 대체 폰트는 0.5em 까지 — 중간값
    if ch.isdigit():
        return 0.58
    if "A" <= ch <= "Z":
        return 0.68
    if "a" <= ch <= "z":
        return 0.55
    if ch in ",.:;'\"!|":
        return 0.3
    if ch in "()[]/-·":
        return 0.4
    if ch == "%":
        return 0.9
    if ch in "~+=<>":
        return 0.6
    if o < 0x2E80 and ch not in "→←↑↓—…":
        return 0.6
    return 1.0  # 한글·한자·전각·화살표


def text_w(s, size, bold=False):
    return sum(char_em(c) for c in s) * size * (1.05 if bold else 1.0)


def wrap_idx(s, maxw, size, bold=False):
    """s 를 maxw 안에 들어가게 줄바꿈. 원문 인덱스 (start, end) 목록 반환. 공백 기준, 긴 단어는 글자 단위."""
    lines = []
    for para in re.finditer(r"[^\n]+", s):
        p0 = para.start()
        cur = None  # (start, end)
        for tok in re.finditer(r"\S+", para.group(0)):
            ts, te = p0 + tok.start(), p0 + tok.end()
            if cur is not None and text_w(s[cur[0]:te], size, bold) <= maxw:
                cur = (cur[0], te)
                continue
            if cur is not None:
                lines.append(cur)
                cur = None
            if text_w(s[ts:te], size, bold) <= maxw:
                cur = (ts, te)
            else:  # 글자 단위로 끊기
                st = ts
                for i in range(ts, te):
                    if i > st and text_w(s[st:i + 1], size, bold) > maxw:
                        lines.append((st, i))
                        st = i
                cur = (st, te)
        if cur is not None:
            lines.append(cur)
    return lines or [(0, 0)]


def fit(s, maxw, size, min_size, max_lines, bold=False):
    """글자 크기를 줄여 가며 max_lines 안에 맞춘다. (size, lines, overflow)."""
    min_size = max(min_size, MIN_FONT)
    sz = max(size, min_size)
    while True:
        lines = wrap_idx(s, maxw, sz, bold)
        if len(lines) <= max_lines:
            return sz, balance(s, lines, maxw, sz, bold), False
        if sz <= min_size:
            return sz, lines, True
        sz = max(min_size, sz - 2)


def balance(s, lines, maxw, size, bold=False):
    """여러 줄이면 줄 길이가 비슷해지도록 폭을 좁혀 다시 줄바꿈(외톨이 단어 방지)."""
    n = len(lines)
    if n < 2:
        return lines
    lo, hi = maxw * 0.4, maxw
    best = lines
    for _ in range(14):
        mid = (lo + hi) / 2
        cand = wrap_idx(s, mid, size, bold)
        clean = all((b >= len(s) or s[b] in " \n") for _, b in cand[:-1]) and \
            all(s[a:a + 1] not in "·,.)" for a, _ in cand[1:])
        if len(cand) <= n and clean:
            best, hi = cand, mid
        else:
            lo = mid
    return best


def fit_pref(s, maxw, size, one_line_min, min_size, max_lines, bold=False):
    """먼저 1줄로(one_line_min 까지) 맞춰 보고, 안 되면 max_lines 줄로 맞춘다."""
    sz, lines, ov = fit(s, maxw, size, one_line_min, 1, bold)
    if not ov:
        return sz, lines, ov
    return fit(s, maxw, size, min_size, max_lines, bold)


def emph_mask(s, emphasis):
    mask = [False] * len(s)
    for e in emphasis or []:
        e = (e or "").strip()
        if not e:
            continue
        start = 0
        while True:
            i = s.find(e, start)
            if i < 0:
                break
            for k in range(i, i + len(e)):
                mask[k] = True
            start = i + len(e)
    return mask


def esc(s):
    return html.escape(s, quote=True)


class Svg:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.el = []
        self.warnings = []

    def rect(self, x, y, w, h, fill="none", r=0, stroke=None, sw=0, op=None):
        a = f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{r}" fill="{fill}"'
        if op is not None:
            a += f' fill-opacity="{op}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}"'
        self.el.append(a + "/>")

    def line(self, x1, y1, x2, y2, stroke, sw=2, op=None):
        a = f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round"'
        if op is not None:
            a += f' stroke-opacity="{op}"'
        self.el.append(a + "/>")

    def circle(self, cx, cy, r, fill="none", stroke=None, sw=0, op=None):
        a = f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}"'
        if op is not None:
            a += f' fill-opacity="{op}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}"'
        self.el.append(a + "/>")

    def path(self, d, fill="none", stroke=None, sw=0, op=None):
        a = f'<path d="{d}" fill="{fill}"'
        if op is not None:
            a += f' fill-opacity="{op}"'
        if stroke:
            a += f' stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"'
        self.el.append(a + "/>")

    def text(self, x, y_top, s, lines, size, fill, weight=400, anchor="start", lh=1.3,
             emphasis=None, emph_fill=None, op=None):
        """줄 목록을 y_top 부터 줄높이 lh 로 그린다. 그린 높이를 반환."""
        mask = emph_mask(s, emphasis) if emph_fill else [False] * len(s)
        for i, (a, b) in enumerate(lines):
            box_top = y_top + i * size * lh
            base = box_top + size * lh / 2 + size * 0.35
            seg = s[a:b]
            m = mask[a:b]
            parts, cur, curm = [], "", None
            for ch, mk in zip(seg, m):
                if curm is None or mk == curm:
                    cur += ch
                else:
                    parts.append((cur, curm))
                    cur = ch
                curm = mk
            if cur:
                parts.append((cur, curm))
            inner = "".join(
                f'<tspan fill="{emph_fill}">{esc(t)}</tspan>' if mk else esc(t) for t, mk in parts
            )
            o = f' fill-opacity="{op}"' if op is not None else ""
            self.el.append(
                f'<text x="{x:.1f}" y="{base:.1f}" font-size="{size}" font-weight="{weight}" '
                f'fill="{fill}"{o} text-anchor="{anchor}" xml:space="preserve">{inner}</text>'
            )
        return len(lines) * size * lh

    def render(self, title=""):
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
            f'viewBox="0 0 {self.w} {self.h}" font-family="{esc(FONT_FAMILY)}" '
            f'style="white-space:pre" role="img" aria-label="{esc(title)}">'
        )
        return head + "<title>" + esc(title) + "</title>" + "".join(self.el) + "</svg>\n"


def block_h(n, size, lh=1.3):
    return n * size * lh


def split_pipe(t):
    if "|" in t:
        a, b = t.split("|", 1)
        return a.strip(), b.strip()
    return t.strip(), ""


def pairs_and_rest(texts):
    n = len(texts) // 2
    pairs = [(texts[2 * i], texts[2 * i + 1]) for i in range(n)]
    rest = texts[2 * n:]
    return pairs, rest


# ── 숫자 해석 (막대 길이 계산용) ──
_NUM_RE = re.compile(r"(\d+(?:\.\d+)?)(천|백|십)?(조|억|만)?")
_SMALL = {"천": 1000, "백": 100, "십": 10}
_BIG = {"조": 10 ** 12, "억": 10 ** 8, "만": 10 ** 4}


def parse_amount(s):
    """'법인세 약 5,000만 원' → (50000000.0, '원'). 해석 불가면 None."""
    t = re.sub(r"\(E\)|약|[\s,]", "", s or "")
    m0 = re.search(r"\d", t)
    if not m0:
        return None
    pos, total, group, matched = m0.start(), 0.0, 0.0, False
    while pos < len(t):
        m = _NUM_RE.match(t, pos)
        if not m or m.end() == pos:
            break
        matched = True
        v = float(m.group(1)) * _SMALL.get(m.group(2), 1)
        if m.group(3):
            total += (group + v) * _BIG[m.group(3)]
            group = 0.0
        else:
            group += v
        pos = m.end()
    if not matched:
        return None
    unit = re.match(r"[^\d]*", t[pos:]).group(0)[:4]
    return total + group, unit


# ── 공통 프레임 (본문 4:5) ──
def body_frame(svg, d, pal, caption=None):
    W, H, PAD = svg.w, svg.h, 80
    CW = W - 2 * PAD
    text = BLOG_IMAGE_PALETTE["body"]["text"]
    gray = BLOG_IMAGE_PALETTE["support_gray"]
    main = pal["main"]
    svg.rect(0, 0, W, H, fill=BLOG_IMAGE_PALETTE["body"]["bg"])
    svg.rect(PAD, 80, 64, 10, fill=main, r=5)
    hl = d.get("headline", "") or ""
    y = 112
    if hl:
        sz, lines, ov = fit_pref(hl, CW, 64, 56, 44, 2, bold=True)
        if ov:
            svg.warnings.append("헤드라인이 2줄을 넘음 — 20자 이내로 줄이세요")
        y += svg.text(PAD, y, hl, lines, sz, text, weight=800, lh=1.28,
                      emphasis=d.get("emphasis"), emph_fill=main)
    top = y + 56
    bottom = H - 72
    fn = d.get("footnote", "") or ""
    if fn:
        sz, lines, ov = fit(fn, CW, 30, MIN_FONT, 3)
        if ov:
            svg.warnings.append("주석이 3줄을 넘음 — 줄이세요")
        fh = block_h(len(lines), sz, 1.35)
        ftop = H - 64 - fh
        svg.line(PAD, ftop - 26, W - PAD, ftop - 26, gray, 2, op=0.5)
        svg.text(PAD, ftop, fn, lines, sz, text, weight=400, lh=1.35, op=0.72)
        bottom = ftop - 26 - 44
    if caption:
        sz, lines, ov = fit(caption, CW, 36, 30, 2, bold=True)
        ch = block_h(len(lines), sz, 1.3)
        svg.text(W / 2, bottom - ch, caption, [(a, b) for a, b in lines], sz, text, weight=700,
                 anchor="middle", emphasis=d.get("emphasis"), emph_fill=main)
        bottom = bottom - ch - 32
    return PAD, top, CW, bottom - top


def is_emph(s, d):
    return any((e or "").strip() and (e.strip() == s.strip() or e.strip() in s) for e in d.get("emphasis") or [])


# ── T. 썸네일 ──
def render_T(d, pal):
    W, H = SIZE_THUMB
    svg = Svg(W, H)
    on, accent = pal["on_main"], pal["accent"]
    svg.rect(0, 0, W, H, fill=pal["main"])
    texts = list(d.get("texts") or [])
    tag = texts[0].strip() if texts else ""
    main_lines, sub = [], None
    for t in texts[1:]:
        if len(t.strip()) > 10 and sub is None and main_lines:
            sub = t.strip()
        else:
            main_lines.append(t.strip())
    if not main_lines:
        svg.warnings.append("썸네일 메인 문구가 없음 — texts[1:] 에 2~3줄을 넣으세요")
        main_lines = [d.get("headline", "")]
    for ml in main_lines:
        if len(ml) > 10:
            svg.warnings.append(f"썸네일 한 줄이 10자를 넘음: '{ml}'")
    if len(main_lines) > 3:
        svg.warnings.append("썸네일 메인 문구는 2~3줄 권장")
    # 상단 태그 (0~15%)
    if tag:
        tsz = 34
        tw = text_w(tag, tsz, True) + 56
        svg.rect((W - tw) / 2, 70, tw, 62, r=31, stroke=on, sw=2.5)
        svg.text(W / 2, 70 + 31 - tsz * 0.65, tag, [(0, len(tag))], tsz, on, weight=700, anchor="middle")
    # 하단 브랜드 (82~100%)
    brand_y = H * 0.82
    # 중앙 메인 문구 (16~78%)
    area_top, area_bot = H * 0.16, H * 0.77
    sub_sz = 40
    sub_h = block_h(1, sub_sz, 1.3) + 36 if sub else 0
    longest = max(sum(char_em(c) for c in ml) * 1.05 for ml in main_lines) or 1
    lh = 1.2
    size = min(0.82 * W / longest, (area_bot - area_top - sub_h) / (len(main_lines) * lh), 210)
    size = int(max(size, 56))
    if longest * size > 0.92 * W:
        svg.warnings.append("썸네일 한 줄이 너무 길어 폭을 넘을 수 있음")
    if longest * size < 0.8 * W:
        svg.warnings.append("메인 문구 폭이 이미지 폭의 80% 미만(줄 수가 많거나 줄이 짧음)")
    total = block_h(len(main_lines), size, lh) + sub_h
    y = area_top + (area_bot - area_top - total) / 2
    for ml in main_lines:
        y += svg.text(W / 2, y, ml, [(0, len(ml))], size, on, weight=900, anchor="middle", lh=lh,
                      emphasis=d.get("emphasis"), emph_fill=accent)
    if sub:
        ssz, slines, _ = fit(sub, 0.82 * W, sub_sz, 32, 1)
        svg.text(W / 2, y + 36, sub, slines, ssz, on, weight=500, anchor="middle", op=0.92)
    bsz = int(min(max(size * 0.2, 34), 52))
    svg.line(W / 2 - 90, brand_y + 4, W / 2 + 90, brand_y + 4, on, 2, op=0.7)
    svg.text(W / 2, brand_y + 34, BRAND, [(0, len(BRAND))], bsz, on, weight=700, anchor="middle")
    return svg


# ── A. 비교 (위아래 2단 + 가운데 차이) ──
def render_A(d, pal):
    svg = Svg(*SIZE_BODY)
    t = list(d.get("texts") or [])
    if len(t) < 4:
        svg.warnings.append("A 유형은 texts 4개 이상 필요 [라벨A, 값A, 라벨B, 값B, (차이)]")
        t += [""] * (4 - len(t))
    la, va, lb, vb = t[:4]
    diff = t[4] if len(t) > 4 else None
    rest = " · ".join(t[5:]) if len(t) > 5 else None
    x, y, w, h = body_frame(svg, d, pal, caption=rest)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    pa, pb = parse_amount(va), parse_amount(vb)
    bars = pa and pb and pa[1] == pb[1] and max(pa[0], pb[0]) > 0
    mid = 150 if diff else 96
    ch = (h - mid) / 2

    def card(cy, label, value, tint, side_emph):
        svg.rect(x, cy, w, ch, fill=tint, r=28, op=0.10 if tint == gray else 0.08)
        lsz, ll, _ = fit(label, w - 112, 38, 30, 1, bold=True)
        vsz, vl, ov = fit_pref(value, w - 112, 84, 56, 44, 2, bold=True)
        if ov:
            svg.warnings.append(f"값이 길어 줄어듦: '{value}'")
        gh = block_h(1, lsz) + 18 + block_h(len(vl), vsz, 1.18) + (54 if bars else 0)
        gy = cy + (ch - gh) / 2
        svg.text(x + 56, gy, label, ll, lsz, text, weight=700, op=0.75)
        gy += block_h(1, lsz) + 18
        vfill = main if is_emph(value, d) else text
        gy += svg.text(x + 56, gy, value, vl, vsz, vfill, weight=800, lh=1.18,
                       emphasis=d.get("emphasis"), emph_fill=main)
        return gy

    ya = y
    yb = y + ch + mid
    by_a = card(ya, la, va, gray, False)
    by_b = card(yb, lb, vb, main, True)
    if bars:
        mx = max(pa[0], pb[0])
        for (by, v, val) in ((by_a, pa[0], va), (by_b, pb[0], vb)):
            bw = w - 112
            svg.rect(x + 56, by + 22, bw, 26, fill=gray, r=13, op=0.22)
            svg.rect(x + 56, by + 22, max(26, bw * v / mx), 26, fill=main if is_emph(val, d) else gray, r=13)
    # 가운데 화살표 + 차이
    cx = x + w / 2
    m_top, m_bot = ya + ch, yb
    svg.line(cx, m_top + 14, cx, m_bot - 30, gray, 4)
    svg.path(f"M{cx - 20:.1f},{m_bot - 34:.1f} L{cx + 20:.1f},{m_bot - 34:.1f} L{cx:.1f},{m_bot - 10:.1f} Z", fill=gray)
    if diff:
        dsz, dl, _ = fit(diff, w - 200, 40, 30, 1, bold=True)
        pw = text_w(diff, dsz, True) + 80
        ph = dsz * 1.3 + 28
        pcy = (m_top + m_bot) / 2 - 10
        fill = main if is_emph(diff, d) else text
        svg.rect(cx - pw / 2, pcy - ph / 2, pw, ph, fill=fill, r=ph / 2)
        svg.text(cx, pcy - dsz * 1.3 / 2, diff, dl, dsz, "#FFFFFF", weight=800, anchor="middle")
    return svg


# ── B. 프로세스 (위→아래 단계 박스 + 화살표) ──
def render_B(d, pal):
    svg = Svg(*SIZE_BODY)
    steps = [split_pipe(s) for s in (d.get("texts") or [])]
    if not 3 <= len(steps) <= 5:
        svg.warnings.append(f"B 유형 단계는 3~5개 권장 (현재 {len(steps)}개)")
    x, y, w, h = body_frame(svg, d, pal)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(steps), 1)
    tx_off = 118
    tw = w - tx_off - 44
    # 내용에 맞춰 상자 높이를 정하고, 넘치면 간격 → 글자 크기 순으로 줄인다
    for gap, t_size, d_size in ((64, 46, 34), (48, 42, 32), (40, 38, 30), (34, 34, 28)):
        laid = []
        for title, desc in steps:
            tsz, tl, _ = fit(title, tw, t_size, 30, 1, bold=True)
            if desc:
                dsz, dl, dov = fit(desc, tw, d_size, MIN_FONT, 2)
            else:
                dsz, dl, dov = 0, [], False
            ch = block_h(len(tl), tsz, 1.2) + (8 + block_h(len(dl), dsz, 1.3) if desc else 0)
            laid.append((title, desc, tsz, tl, dsz, dl, ch, dov))
        bh = min(max(l[6] for l in laid) + 52, 230)
        total = n * bh + (n - 1) * gap
        if total <= h:
            break
    if total > h:
        svg.warnings.append("B 유형 단계가 많거나 설명이 길어 영역을 넘침 — 단계 수나 설명을 줄이세요")
    if any(l[7] for l in laid):
        svg.warnings.append("단계 설명이 2줄을 넘음 — 설명을 줄이세요")
    cy = y + (h - total) / 2
    for i, (title, desc, tsz, tl, dsz, dl, ch, _) in enumerate(laid):
        em = is_emph(title, d) or bool(desc and is_emph(desc, d))
        svg.rect(x, cy, w, bh, fill=main if em else gray, r=24, op=0.10 if em else 0.09,
                 stroke=main if em else None, sw=3)
        svg.circle(x + 66, cy + bh / 2, 20, fill=main if em else gray)
        gy = cy + (bh - ch) / 2
        gy += svg.text(x + tx_off, gy, title, tl, tsz, main if em else text, weight=800, lh=1.2)
        if desc:
            svg.text(x + tx_off, gy + 8, desc, dl, dsz, text, weight=400, op=0.75,
                     emphasis=d.get("emphasis"), emph_fill=main)
        if i < n - 1:
            ay = cy + bh + gap / 2
            svg.path(f"M{x + w / 2 - 20:.1f},{ay - 11:.1f} L{x + w / 2 + 20:.1f},{ay - 11:.1f} "
                     f"L{x + w / 2:.1f},{ay + 12:.1f} Z", fill=gray)
        cy += bh + gap
    return svg


# ── C. 숫자 카드 (세로 3칸 / 2×2) ──
def render_C(d, pal):
    svg = Svg(*SIZE_BODY)
    pairs, rest = pairs_and_rest(list(d.get("texts") or []))
    if not 3 <= len(pairs) <= 4:
        svg.warnings.append(f"C 유형 수치는 3~4개 권장 (현재 {len(pairs)}개)")
    x, y, w, h = body_frame(svg, d, pal, caption=" · ".join(rest) if rest else None)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(pairs), 1)
    cols = 1 if n <= 3 else 2
    rows = (n + cols - 1) // cols
    g = 28
    cw = (w - (cols - 1) * g) / cols
    chh = min((h - (rows - 1) * g) / rows, 300)
    oy = y + (h - (rows * chh + (rows - 1) * g)) / 2
    for i, (label, value) in enumerate(pairs):
        r, c = divmod(i, cols)
        cx0, cy0 = x + c * (cw + g), oy + r * (chh + g)
        em = is_emph(value, d) or is_emph(label, d)
        svg.rect(cx0, cy0, cw, chh, fill=main if em else gray, r=24, op=1 if em else 0.08)
        vsz, vl, ov = fit_pref(value, cw - 64, 92 if cols == 1 else 72, 48, 40, 2, bold=True)
        if ov:
            svg.warnings.append(f"수치가 길어 줄어듦: '{value}'")
        lsz, ll, _ = fit(label, cw - 64, 38, 30, 2)
        gh = block_h(len(vl), vsz, 1.15) + 14 + block_h(len(ll), lsz, 1.3)
        gy = cy0 + (chh - gh) / 2
        vc = "#FFFFFF" if em else text
        gy += svg.text(cx0 + cw / 2, gy, value, vl, vsz, vc, weight=900, anchor="middle", lh=1.15)
        svg.text(cx0 + cw / 2, gy + 14, label, ll, lsz, vc, weight=500, anchor="middle", op=0.9 if em else 0.75)
    return svg


# ── D. 타임라인 (세로 축, 시간 순 아래로) ──
def render_D(d, pal):
    svg = Svg(*SIZE_BODY)
    pairs, rest = pairs_and_rest(list(d.get("texts") or []))
    if len(pairs) < 3:
        svg.warnings.append(f"D 유형은 시점 3개 이상 필요 (현재 {len(pairs)}개)")
    x, y, w, h = body_frame(svg, d, pal, caption=" · ".join(rest) if rest else None)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(pairs), 1)
    rh = min(h / n, 240)
    oy = y + (h - rh * n) / 2
    ax = x + 40
    tx, tw = x + 104, w - 104
    centers = []
    blocks = []
    for i, (when, what) in enumerate(pairs):
        wsz, wl, _ = fit(when, tw, 46, 32, 1, bold=True)
        ssz, sl, ov = fit(what, tw, 40, 30, 2)
        if ov:
            svg.warnings.append(f"타임라인 내용이 길어 줄어듦: '{what}'")
        gh = block_h(len(wl), wsz, 1.2) + 8 + block_h(len(sl), ssz, 1.3)
        top = oy + i * rh + (rh - gh) / 2
        centers.append(top + block_h(1, wsz, 1.2) / 2)
        blocks.append((top, when, wl, wsz, what, sl, ssz))
    if len(centers) > 1:
        svg.line(ax, centers[0], ax, centers[-1], gray, 4, op=0.6)
    for (top, when, wl, wsz, what, sl, ssz), c in zip(blocks, centers):
        em = is_emph(when, d) or is_emph(what, d)
        if em:
            svg.circle(ax, c, 18, fill=main)
        else:
            svg.circle(ax, c, 16, fill="#FFFFFF", stroke=gray, sw=5)
        gy = top + svg.text(tx, top, when, wl, wsz, main if em else text, weight=800, lh=1.2)
        svg.text(tx, gy + 8, what, sl, ssz, text, weight=400, op=0.8,
                 emphasis=d.get("emphasis"), emph_fill=main)
    return svg


# ── E. 체크리스트 ──
def render_E(d, pal):
    svg = Svg(*SIZE_BODY)
    items = [t for t in (d.get("texts") or [])]
    if not 5 <= len(items) <= 7:
        svg.warnings.append(f"E 유형 항목은 5~7개 권장 (현재 {len(items)}개)")
    x, y, w, h = body_frame(svg, d, pal)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(items), 1)
    rh = min(h / n, 175)
    oy = y + (h - rh * n) / 2
    for i, it in enumerate(items):
        ry = oy + i * rh
        cy = ry + rh / 2
        em = is_emph(it, d)
        col = main if em else text
        svg.circle(x + 30, cy, 26, fill=main if em else gray, op=1 if em else 0.18)
        svg.path(f"M{x + 17:.1f},{cy + 1:.1f} L{x + 27:.1f},{cy + 11:.1f} L{x + 44:.1f},{cy - 10:.1f}",
                 stroke="#FFFFFF" if em else text, sw=5)
        isz, il, ov = fit(it, w - 96, 44, 30, 2, bold=em)
        if ov:
            svg.warnings.append(f"체크 항목이 길어 줄어듦: '{it}'")
        ih = block_h(len(il), isz, 1.25)
        svg.text(x + 86, cy - ih / 2, it, il, isz, col, weight=700 if em else 500, lh=1.25)
        if i < n - 1:
            svg.line(x + 86, ry + rh, x + w, ry + rh, gray, 1.5, op=0.35)
    return svg


# ── F. 퍼널 (위가 넓고 아래가 좁은 단) ──
def render_F(d, pal):
    svg = Svg(*SIZE_BODY)
    pairs, rest = pairs_and_rest(list(d.get("texts") or []))
    if len(pairs) < 3:
        svg.warnings.append(f"F 유형은 단계별 수치 3개 이상 필요 (현재 {len(pairs)}개)")
    x, y, w, h = body_frame(svg, d, pal, caption=" · ".join(rest) if rest else None)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(pairs), 1)
    g = 14
    lh_ = min((h - (n - 1) * g) / n, 210)
    oy = y + (h - (n * lh_ + (n - 1) * g)) / 2
    cx = x + w / 2
    minw = 0.46
    for i, (label, value) in enumerate(pairs):
        wt = w * (1 - (1 - minw) * i / n)
        wb = w * (1 - (1 - minw) * (i + 1) / n)
        ty = oy + i * (lh_ + g)
        em = is_emph(value, d) or is_emph(label, d)
        svg.path(f"M{cx - wt / 2:.1f},{ty:.1f} L{cx + wt / 2:.1f},{ty:.1f} L{cx + wb / 2:.1f},{ty + lh_:.1f} "
                 f"L{cx - wb / 2:.1f},{ty + lh_:.1f} Z",
                 fill=main if em else gray, op=1 if em else 0.12 + 0.06 * i)
        col = "#FFFFFF" if em else text
        inner = wb - 80
        lsz, ll, _ = fit(label, inner, 34, 28, 1)
        vsz, vl, ov = fit(value, inner, 50, 32, 1, bold=True)
        if ov:
            svg.warnings.append(f"퍼널 수치가 길어 줄어듦: '{value}'")
        gh = block_h(1, lsz, 1.25) + block_h(1, vsz, 1.15)
        gy = ty + (lh_ - gh) / 2
        gy += svg.text(cx, gy, label, ll, lsz, col, weight=500, anchor="middle", lh=1.25)
        svg.text(cx, gy, value, vl, vsz, col, weight=900, anchor="middle", lh=1.15)
    return svg


# ── G. 구조도 (중심 주체 가운데 + 연결선) ──
def render_G(d, pal):
    svg = Svg(*SIZE_BODY)
    t = list(d.get("texts") or [])
    if len(t) < 3:
        svg.warnings.append("G 유형은 주체 3개 이상 필요 [중심, '주체|관계', ...]")
    center = t[0] if t else ""
    nodes = [split_pipe(s) for s in t[1:]]
    if len(nodes) > 6:
        svg.warnings.append("G 유형 주변 주체는 6개까지 권장 — 7번째부터 생략")
        nodes = nodes[:6]
    x, y, w, h = body_frame(svg, d, pal)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    m = len(nodes)
    top_n = (m + 1) // 2
    rows = [nodes[:top_n], nodes[top_n:]]
    nh = 140
    cw_, chh = 420, 170
    ccx, ccy = x + w / 2, y + h / 2
    row_y = [y + 10, y + h - 10 - nh]
    anchors = []
    for ri, row in enumerate(rows):
        k = len(row)
        if not k:
            continue
        g = 28
        nw = min(300, (w - (k - 1) * g) / k)
        for j, (name, rel) in enumerate(row):
            ncx = x + w * (j + 0.5) / k  # 폭 전체에 고르게 분산
            nx = min(max(ncx - nw / 2, x), x + w - nw)
            anchors.append((ri, nx, row_y[ri], nw, name, rel))
    # 연결선 먼저
    for ri, nx, ny, nw, name, rel in anchors:
        sx, sy = ccx, (ccy - chh / 2) if ri == 0 else (ccy + chh / 2)
        ex, ey = nx + nw / 2, (ny + nh) if ri == 0 else ny
        svg.line(sx, sy, ex, ey, gray, 3, op=0.7)
    # 관계 라벨
    for ri, nx, ny, nw, name, rel in anchors:
        if not rel:
            continue
        sx, sy = ccx, (ccy - chh / 2) if ri == 0 else (ccy + chh / 2)
        ex, ey = nx + nw / 2, (ny + nh) if ri == 0 else ny
        k_row = len(rows[ri])
        # 같은 줄 라벨끼리 겹치지 않게: 3개면 가운데 라벨을 중심 쪽으로 올려 엇갈리게 배치
        t_ = 0.6 if k_row <= 2 else (0.38 if abs(ex - sx) < 1 else 0.7)
        lx, ly = sx + (ex - sx) * t_, sy + (ey - sy) * t_
        lab_w = 240 if k_row <= 2 else 190
        rsz, rl, ov = fit_pref(rel, lab_w, 30, MIN_FONT, MIN_FONT, 2)
        if ov:
            svg.warnings.append(f"관계 라벨이 길어 넘침: '{rel}'")
        rw = max(text_w(rel[a:b], rsz) for a, b in rl) + 28
        rh = block_h(len(rl), rsz, 1.25) + 10
        em = is_emph(rel, d)
        svg.rect(lx - rw / 2, ly - rh / 2, rw, rh, fill="#FFFFFF", r=10, stroke=main if em else gray, sw=2)
        svg.text(lx, ly - rh / 2 + 5, rel, rl, rsz, main if em else text, weight=600 if em else 500,
                 anchor="middle", lh=1.25)
    # 주변 주체 상자
    for ri, nx, ny, nw, name, rel in anchors:
        em = is_emph(name, d)
        svg.rect(nx, ny, nw, nh, fill="#FFFFFF", r=20)
        svg.rect(nx, ny, nw, nh, fill=main if em else gray, r=20, op=0.10 if em else 0.04,
                 stroke=main if em else gray, sw=4 if em else 3)
        nsz, nl, ov = fit_pref(name, nw - 36, 38, 30, 30, 2, bold=True)
        if ov:
            svg.warnings.append(f"주체 이름이 길어 넘침: '{name}'")
        bh_ = block_h(len(nl), nsz, 1.22)
        svg.text(nx + nw / 2, ny + (nh - bh_) / 2, name, nl, nsz, main if em else text, weight=800,
                 anchor="middle", lh=1.22)
    # 중심 주체
    svg.rect(ccx - cw_ / 2, ccy - chh / 2, cw_, chh, fill=main, r=26)
    csz, cl, _ = fit(center, cw_ - 48, 50, 34, 2, bold=True)
    bh_ = block_h(len(cl), csz, 1.2)
    svg.text(ccx, ccy - bh_ / 2, center, cl, csz, "#FFFFFF", weight=900, anchor="middle", lh=1.2)
    return svg


# ── H. 수평 막대 (큰 값부터 아래로) ──
def render_H(d, pal):
    svg = Svg(*SIZE_BODY)
    pairs, rest = pairs_and_rest(list(d.get("texts") or []))
    if not 3 <= len(pairs) <= 6:
        svg.warnings.append(f"H 유형은 같은 단위 수치 3~6개 권장 (현재 {len(pairs)}개)")
    parsed = [(lab, val, parse_amount(val)) for lab, val in pairs]
    if any(p is None for _, _, p in parsed):
        svg.warnings.append("H 유형 수치 일부를 해석하지 못함 — 막대 없이 표시")
    units = {p[1] for _, _, p in parsed if p}
    if len(units) > 1:
        svg.warnings.append(f"H 유형 단위가 섞임: {sorted(units)}")
    parsed.sort(key=lambda r: -(r[2][0] if r[2] else -1))
    x, y, w, h = body_frame(svg, d, pal, caption=" · ".join(rest) if rest else None)
    text, gray, main = BLOG_IMAGE_PALETTE["body"]["text"], BLOG_IMAGE_PALETTE["support_gray"], pal["main"]
    n = max(len(parsed), 1)
    rh = min(h / n, 210)
    oy = y + (h - rh * n) / 2
    mx = max([p[0] for _, _, p in parsed if p] or [1]) or 1
    vsz = 42
    vw = max([text_w(v, vsz, True) for _, v, _ in parsed] or [0])
    barmax = max(200, w - vw - 28)
    if vw + 28 > w - 200:
        svg.warnings.append("H 유형 수치 문자열이 너무 김")
    for i, (lab, val, p) in enumerate(parsed):
        ry = oy + i * rh
        em = is_emph(val, d) or is_emph(lab, d)
        lsz, ll, _ = fit(lab, w, 40, 30, 1, bold=True)
        bar_h = 56
        gh = block_h(1, lsz, 1.25) + 12 + bar_h
        gy = ry + (rh - gh) / 2
        svg.text(x, gy, lab, ll, lsz, main if em else text, weight=700, lh=1.25)
        by = gy + block_h(1, lsz, 1.25) + 12
        bl = barmax * (p[0] / mx) if p else 0
        if p:
            svg.rect(x, by, max(bl, 12), bar_h, fill=main if em else gray, r=10, op=1 if em else 0.45)
        svg.text(x + max(bl, 12) + 18, by + bar_h / 2 - vsz * 1.2 / 2, val, [(0, len(val))], vsz,
                 main if em else text, weight=800, lh=1.2)
    return svg


RENDERERS = {"T": render_T, "A": render_A, "B": render_B, "C": render_C, "D": render_D,
             "E": render_E, "F": render_F, "G": render_G, "H": render_H}


# ── PNG 변환 ──
def _node_playwright_dir():
    node = shutil.which("node")
    npm = shutil.which("npm")
    if not node:
        return None, None
    roots = []
    if npm:
        try:
            roots.append(subprocess.run([npm, "root", "-g"], capture_output=True, text=True, timeout=20).stdout.strip())
        except Exception:
            pass
    roots.append(os.path.join(os.getcwd(), "node_modules"))
    for r in roots:
        if r and os.path.isdir(os.path.join(r, "playwright")):
            return node, r
    return node, None


def to_png(items, mode="auto"):
    """items: [(svg_path, png_path, w, h)]. 성공한 엔진 이름 반환, 실패 시 None."""
    if mode == "off" or not items:
        return None
    try:  # 1) cairosvg
        import cairosvg  # type: ignore
        for s, p, w, h in items:
            cairosvg.svg2png(url=s, write_to=p, output_width=w, output_height=h)
        return "cairosvg"
    except ImportError:
        pass
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"[render] cairosvg 실패: {e}\n")
    try:  # 2) Python playwright
        from playwright.sync_api import sync_playwright  # type: ignore
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            pg = b.new_page()
            for s, p, w, h in items:
                pg.set_viewport_size({"width": w, "height": h})
                pg.set_content('<html><body style="margin:0">' + open(s, encoding="utf-8").read() + "</body></html>")
                pg.evaluate("document.fonts.ready")
                pg.screenshot(path=p, clip={"x": 0, "y": 0, "width": w, "height": h})
            b.close()
        return "playwright-python"
    except ImportError:
        pass
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"[render] Python playwright 실패: {e}\n")
    node, root = _node_playwright_dir()  # 3) Node playwright
    if node and root:
        js = r"""
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const items = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch();
  const pg = await b.newPage();
  for (const it of items) {
    await pg.setViewportSize({ width: it.w, height: it.h });
    await pg.setContent('<html><body style="margin:0">' + fs.readFileSync(it.svg, 'utf8') + '</body></html>');
    await pg.evaluate(() => document.fonts.ready);
    await pg.screenshot({ path: it.png, clip: { x: 0, y: 0, width: it.w, height: it.h } });
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
"""
        with tempfile.TemporaryDirectory() as td:
            jp, ip = os.path.join(td, "r.js"), os.path.join(td, "items.json")
            open(jp, "w").write(js)
            json.dump([{"svg": os.path.abspath(s), "png": os.path.abspath(p), "w": w, "h": h} for s, p, w, h in items],
                      open(ip, "w"))
            env = dict(os.environ, NODE_PATH=root)
            r = subprocess.run([node, jp, ip], capture_output=True, text=True, env=env, timeout=300)
            if r.returncode == 0:
                return "playwright-node"
            sys.stderr.write(f"[render] Node playwright 실패: {r.stderr[-800:]}\n")
    if mode == "force":
        raise SystemExit("PNG 변환 도구가 없습니다 (cairosvg / playwright). --png off 로 SVG 만 만드세요.")
    return None


def font_note():
    fc = shutil.which("fc-list")
    if not fc:
        return "fc-list 없음 — 한글 폰트 설치 여부 확인 불가"
    try:
        fam = subprocess.run([fc, ":lang=ko", "family"], capture_output=True, text=True, timeout=20).stdout
    except Exception:
        return "fc-list 실행 실패"
    names = sorted({l.split(",")[0].strip() for l in fam.splitlines() if l.strip()})
    if any("Noto Sans KR" in n or "Noto Sans CJK" in n for n in names):
        return "Noto Sans KR/CJK 설치됨"
    if not names:
        return "한글 폰트 없음 — PNG 의 한글이 깨질 수 있음. SVG 를 한글 폰트가 있는 PC 에서 열거나 변환하세요"
    return "Noto Sans KR 없음 — 대체 폰트로 렌더링: " + ", ".join(names[:4]) + " (글자 폭이 달라 줄바꿈이 조금 다를 수 있음)"


def write_preview(path, outputs):
    cards = []
    for o in outputs:
        src = os.path.basename(o["png"] or o["svg"])
        warn = "".join(f"<li>{esc(w)}</li>" for w in o["warnings"]) or "<li>경고 없음</li>"
        cards.append(
            f'<figure><img src="{esc(src)}" alt="{esc(o["alt"])}" width="{o["width"] // 3}">'
            f'<figcaption><b>{esc(o["type"])} · {esc(TYPE_NAMES.get(o["type"], ""))}</b> — {esc(o["position"])}<br>'
            f'ALT: {esc(o["alt"])}<ul>{warn}</ul></figcaption></figure>'
        )
    doc = (
        '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>인포그래픽 미리보기</title>'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<style>body{font-family:" + FONT_FAMILY + ";margin:24px;background:#f4f5f7;color:#191F28}"
        "main{display:flex;flex-wrap:wrap;gap:24px}figure{margin:0;background:#fff;padding:12px;border-radius:12px;"
        "max-width:380px}img{max-width:100%;height:auto;display:block;border:1px solid #e5e8eb}"
        "figcaption{font-size:13px;margin-top:8px;line-height:1.5}ul{padding-left:18px;margin:4px 0}</style>"
        "</head><body><h1>인포그래픽 미리보기</h1><main>" + "".join(cards) + "</main></body></html>"
    )
    open(path, "w", encoding="utf-8").write(doc)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", "-i", required=True, help="설계 JSON 파일 경로 (- 는 stdin)")
    ap.add_argument("--category", "-c", default="",
                    help="카테고리명 또는 categoryNo (신규: 지원사업·인증과 특허/출원·심판 실무/사례/지식재산 경영/디딤 소식, 레거시 이름도 가능)")
    ap.add_argument("--out", "-o", default="infographics_out", help="출력 폴더")
    ap.add_argument("--prefix", default="", help="파일명 접두사")
    ap.add_argument("--png", choices=["auto", "off", "force"], default="auto", help="PNG 변환 (기본 auto)")
    args = ap.parse_args()

    raw = sys.stdin.read() if args.input == "-" else open(args.input, encoding="utf-8").read()
    designs = load_designs(raw)
    os.makedirs(args.out, exist_ok=True)
    outputs, png_items = [], []
    for i, d in enumerate(designs, 1):
        t = (d.get("type") or "").strip().upper()[:1]
        cat_name = d.get("category") or args.category
        cat = resolve_category(cat_name)
        if cat == "diary":
            raise SystemExit("디딤 다이어리는 인포그래픽을 만들지 않습니다(v2). 분위기 사진 프롬프트만 작성하세요.")
        if t not in RENDERERS:
            raise SystemExit(f"{i}번째 설계의 type '{d.get('type')}' 는 T 또는 A~H 여야 합니다.")
        pal = BLOG_IMAGE_PALETTE[cat]
        svg = RENDERERS[t](d, pal)
        base = f"{args.prefix}{i:02d}_{t}"
        sp = os.path.join(args.out, base + ".svg")
        open(sp, "w", encoding="utf-8").write(svg.render(d.get("alt") or d.get("headline") or ""))
        pp = os.path.join(args.out, base + ".png")
        png_items.append((sp, pp, svg.w, svg.h))
        outputs.append({"index": i, "type": t, "position": d.get("position", ""), "alt": d.get("alt", ""),
                        "category": (resolve_cat(cat_name) or {}).get("name", cat_name),
                        "palette": pal["name"], "svg": sp, "png": None, "width": svg.w, "height": svg.h,
                        "warnings": svg.warnings})
    engine = to_png(png_items, args.png)
    if engine:
        for o, (_, pp, _, _) in zip(outputs, png_items):
            o["png"] = pp if os.path.exists(pp) else None
    prev = os.path.join(args.out, f"{args.prefix}preview.html")
    write_preview(prev, outputs)
    print(json.dumps({"outputs": outputs, "png_engine": engine, "preview": prev, "font_note": font_note()},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
