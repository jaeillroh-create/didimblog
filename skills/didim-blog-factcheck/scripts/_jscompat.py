"""JavaScript 문자열/정규식 동작을 Python 에서 재현하기 위한 보조 함수 (표준 라이브러리만 사용).

원본 TS 는 브라우저(V8)에서 실행되므로 다음 차이를 맞춘다.
- JS 의 \\s / trim() 이 인식하는 공백 집합 (Python 의 str.isspace 와 다름)
- String.prototype.replace(문자열, 문자열) 은 첫 번째 일치만 바꾸고, 교체 문자열의
  $$, $&, $`, $' 를 특수 패턴으로 해석한다.
"""

import re

# ECMAScript WhiteSpace + LineTerminator (\s 및 trim() 대상)
JS_WS_CHARS = (
    "\t\n\v\f\r          "
    "        　﻿"
)
JS_WS = "[" + re.escape(JS_WS_CHARS) + "]"
# JS 의 '.' (s 플래그 없음) — 줄 종결자 제외
JS_DOT = "[^\n\r  ]"

_WS_RUN_RE = re.compile(JS_WS + "+")
_TRIM_RE = re.compile("^" + JS_WS + "+|" + JS_WS + "+$")


def js_trim(s: str) -> str:
    return _TRIM_RE.sub("", s)


def js_collapse_ws(s: str, repl: str = " ") -> str:
    """s.replace(/\\s+/g, repl)"""
    return _WS_RUN_RE.sub(repl, s)


def js_is_ws(ch: str) -> bool:
    return ch in JS_WS_CHARS


def js_ws_fuzzy_pattern(text: str) -> str:
    """escapeRegex(text).replace(/\\s+/g, "\\\\s+") 와 동등한 Python 정규식."""
    parts = _WS_RUN_RE.split(text)
    # 공백 위치마다 JS \\s+ 로 치환
    return (JS_WS + "+").join(re.escape(p) for p in parts)


def _expand_js_replacement(repl: str, matched: str, before: str, after: str) -> str:
    out = []
    i = 0
    n = len(repl)
    while i < n:
        ch = repl[i]
        if ch == "$" and i + 1 < n:
            nxt = repl[i + 1]
            if nxt == "$":
                out.append("$")
                i += 2
                continue
            if nxt == "&":
                out.append(matched)
                i += 2
                continue
            if nxt == "`":
                out.append(before)
                i += 2
                continue
            if nxt == "'":
                out.append(after)
                i += 2
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def js_replace_first(s: str, pattern: str, repl: str) -> str:
    """JS: s.replace(pattern(문자열), repl(문자열)). 첫 일치만, $-패턴 해석."""
    idx = s.find(pattern)
    if idx == -1:
        return s
    before = s[:idx]
    after = s[idx + len(pattern):]
    return before + _expand_js_replacement(repl, pattern, before, after) + after


def js_len(s: str) -> int:
    """JS string.length (UTF-16 코드 유닛 수)."""
    return len(s.encode("utf-16-le")) // 2


def js_round(x: float) -> int:
    """Math.round — .5 는 +무한대 방향으로 올림."""
    import math

    return int(math.floor(x + 0.5))
