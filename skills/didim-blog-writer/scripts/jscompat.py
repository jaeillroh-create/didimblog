"""JS(TypeScript) 문자열·정규식 동작을 Python 표준 라이브러리로 흉내 내는 공용 헬퍼.

원본 TS 코드와 같은 입력에 같은 결과를 내기 위해 다음 차이를 보정한다.
- JS `\\s` 집합(유니코드 공백 + 줄 종결자 + BOM)과 Python `\\s` 의 차이
- JS `\\d`, `\\w` 는 ASCII 전용
- JS `String.length` 는 UTF-16 코드 유닛 수 (이모지 등 BMP 밖 문자는 2)
- JS `String.prototype.replace(문자열, 문자열)` 은 첫 1회만 치환 + `$&`, `$$` 등 치환 패턴 해석
- JS `trim()` / `trimEnd()` / `trimStart()` 는 JS 공백 집합 기준
"""

import math
import re

# JS 의 \s 와 동일한 문자 집합
JS_WS_CHARS = (
    "\t\n\x0b\x0c\r   "
    "           "
    "    　﻿"
)
WS = r"[\t\n\x0b\x0c\r    -     　﻿]"
NOT_WS = r"[^\t\n\x0b\x0c\r    -     　﻿]"
# JS 의 . (줄 종결자 제외 모든 문자)
DOT = r"[^\n\r  ]"
DIGIT = r"[0-9]"
WORD = r"[A-Za-z0-9_]"


def u16len(s: str) -> int:
    """JS String.length (UTF-16 코드 유닛 수)."""
    return sum(2 if ord(c) > 0xFFFF else 1 for c in s)


def u16_to_index(s: str, u16pos: int) -> int:
    """UTF-16 위치를 Python 인덱스로 변환. 서로게이트 쌍 중간이면 다음 문자 경계로 올림."""
    if u16pos <= 0:
        return 0
    units = 0
    for i, c in enumerate(s):
        if units >= u16pos:
            return i
        units += 2 if ord(c) > 0xFFFF else 1
    return len(s)


def u16_slice_prefix(s: str, n_units: int) -> str:
    """JS s.slice(0, n) 근사 — 서로게이트 쌍이 경계에 걸리면 그 문자를 포함."""
    out = []
    units = 0
    for c in s:
        if units >= n_units:
            break
        out.append(c)
        units += 2 if ord(c) > 0xFFFF else 1
    return "".join(out)


def js_trim(s: str) -> str:
    return s.strip(JS_WS_CHARS)


def js_trim_end(s: str) -> str:
    return s.rstrip(JS_WS_CHARS)


def js_trim_start(s: str) -> str:
    return s.lstrip(JS_WS_CHARS)


def js_round(x: float) -> int:
    """JS Math.round (0.5 는 +무한대 방향)."""
    return int(math.floor(x + 0.5))


def _expand_js_replacement(replacement: str, matched: str, before: str, after: str) -> str:
    """문자열 패턴 replace 의 치환 패턴($$, $&, $`, $') 해석. 캡처 그룹 없음."""
    out = []
    i = 0
    while i < len(replacement):
        c = replacement[i]
        if c == "$" and i + 1 < len(replacement):
            n = replacement[i + 1]
            if n == "$":
                out.append("$")
                i += 2
                continue
            if n == "&":
                out.append(matched)
                i += 2
                continue
            if n == "`":
                out.append(before)
                i += 2
                continue
            if n == "'":
                out.append(after)
                i += 2
                continue
        out.append(c)
        i += 1
    return "".join(out)


def js_replace_first(s: str, pattern: str, replacement: str) -> str:
    """JS s.replace("문자열", "문자열") — 첫 1회만, 치환 패턴 해석."""
    idx = s.find(pattern)
    if idx == -1:
        return s
    before = s[:idx]
    after = s[idx + len(pattern):]
    rep = _expand_js_replacement(replacement, pattern, before, after)
    return before + rep + after


def js_split_ws(s: str):
    """JS s.split(/\\s+/)"""
    return re.split(WS + "+", s)


def to_locale_string(n: int) -> str:
    """JS Number.prototype.toLocaleString() (ko-KR/en-US 천 단위 콤마)."""
    return f"{n:,}"


# ── UTF-16 코드 유닛 단위 조작 (JS slice/indexOf 와 정확히 같은 위치 계산용) ──
import struct  # noqa: E402


def to_units(s: str):
    b = s.encode("utf-16-le", "surrogatepass")
    return list(struct.unpack("<%dH" % (len(b) // 2), b))


def from_units(units) -> str:
    return struct.pack("<%dH" % len(units), *units).decode("utf-16-le", "surrogatepass")


def u16_slice(s: str, start=None, end=None) -> str:
    """JS s.slice(start, end) — 음수 인덱스 포함, UTF-16 단위."""
    return from_units(to_units(s)[slice(start, end)])


if __name__ == "__main__":
    import argparse
    import json
    import sys

    ap = argparse.ArgumentParser(description="JS 호환 헬퍼 모듈 (다른 스크립트가 import). 단독 실행 시 UTF-16 길이를 JSON 으로 출력")
    ap.add_argument("--text", default="", help="길이를 잴 문자열")
    a = ap.parse_args()
    json.dump({"js_length": u16len(a.text), "py_length": len(a.text)}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
