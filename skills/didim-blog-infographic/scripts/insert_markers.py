#!/usr/bin/env python3
"""본문에 이미지 마커 삽입 — client-generate.ts insertInfographicMarkers 포팅 (+ paragraph-ids.ts injectParagraphIds).

원본 규칙 (src/lib/client-generate.ts:984-1086):
  - 설계 목록을 뒤에서부터 처리 (앞쪽 삽입 위치가 밀리지 않게)
  - T 타입 또는 position "top" → 제목(# …) 줄 바로 다음, 제목이 없으면 맨 앞
  - "p:N" → <!-- p:N --> 다음의 "\\n\\n<!-- p:" 직전(다음 문단 앞), 없으면 본문 끝
  - "## 소제목" → 그 소제목 다음 첫 빈 줄 앞
  - 숫자만 → p:N 과 같게
  - 실패 → 균등 분배(전체 길이 × (idx+1)/(n+1) 이후 첫 빈 줄, 끝 100자 이내면 본문 끝)
마커 형식 (레거시 extractImageMarkers 정규식 /\\[IMAGE:\\s*([\\s\\S]*?)\\]\\s*\\n\\s*━━/ 호환):
  ━━ 📷 이미지 N ━━
  [IMAGE: <설명> | <type>(<type_name>)
  (1) 한국어: <설명>
  (2) English: <영문 프롬프트>]      ← v2 모드에서는 "(2) 파일: <파일명>"
  ━━━━━━━━━━━━━━

모드:
  --mode v2 (기본): 설계 v2 항목(alt, headline, texts, file)으로 마커를 만든다. 설명 = alt, 한국어 = headline + texts.
  --mode legacy : 레거시 항목(korean_prompt, english_prompt, type_name)을 그대로 쓴다(원본과 동일 출력).
옵션:
  --inject-ids  : 본문에 문단 ID 를 먼저 주입(injectParagraphIds 포팅, 기존 ID 는 재번호)
  --fix-top-double : (스킬 보정) T 타입이 p:N position 을 함께 가져도 한 번만 삽입. 원본은 두 번 삽입될 수 있음.

사용 예:
  python3 insert_markers.py --body body.md --design design.json > body_with_markers.md
  python3 insert_markers.py --body body.md --design design.json --mode legacy
"""
import argparse
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from design_json import load_designs  # noqa: E402

TYPE_NAMES = {"T": "타이포그래피 썸네일", "A": "비교 차트", "B": "프로세스 플로우", "C": "숫자 카드",
              "D": "타임라인", "E": "체크리스트", "F": "퍼널", "G": "구조도", "H": "수평 막대"}

_PID_RE = re.compile(r"<!-- p:(\d+) -->\n?")


def strip_paragraph_ids(body):
    return re.sub(r"\n{3,}", "\n\n", _PID_RE.sub("", body)).strip()


def inject_paragraph_ids(body):
    """paragraph-ids.ts injectParagraphIds 포팅."""
    stripped = strip_paragraph_ids(body)
    out, pid = [], 1
    for p in re.split(r"\n\n+", stripped):
        t = p.strip()
        if not t:
            continue
        if t.startswith("━━") or t.startswith("---"):
            out.append(t)
            continue
        out.append(f"<!-- p:{pid} -->\n{t}")
        pid += 1
    return "\n\n".join(out)


def _js_index_of(s, sub, start=0):
    return s.find(sub, start)


def marker_fields(info, mode):
    t = (info.get("type") or "").strip()
    if mode == "legacy":
        return (info.get("korean_prompt", ""), t, info.get("type_name", ""),
                info.get("korean_prompt", ""), "(2) English: " + info.get("english_prompt", ""))
    desc = info.get("alt") or info.get("headline") or ""
    texts = [str(x).replace("|", " — ") for x in (info.get("texts") or [])]
    ko = (info.get("headline") or "") + (" / " + " · ".join(texts) if texts else "")
    return desc, t, TYPE_NAMES.get(t, info.get("type_name", "")), ko, "(2) 파일: " + (info.get("file") or "-")


def insert_markers(body, infographics, mode="v2", fix_top_double=False, log=None):
    log = log or (lambda m: None)
    result = body
    n_all = len(infographics)
    for idx in range(n_all - 1, -1, -1):
        info = infographics[idx]
        num = idx + 1
        desc, t, tname, ko, line2 = marker_fields(info, mode)
        marker = "\n".join(["", f"━━ 📷 이미지 {num} ━━", f"[IMAGE: {desc} | {t}({tname})",
                            f"(1) 한국어: {ko}", f"{line2}]", "━━━━━━━━━━━━━━", ""])
        position = str(info.get("position") or "")
        inserted = False

        # 0) T 타입 / top → 제목 줄 다음
        if t == "T" or position == "top":
            m = re.match(r"#[^\n]*\n", result)  # JS /^#[^\n]*\n/ (multiline 아님 → 문자열 맨 앞)
            if m:
                at = m.end()
                result = result[:at] + marker + "\n" + result[at:]
            else:
                result = marker + "\n" + result
            inserted = True
            log(f"#{num} → T타입(썸네일) 본문 최상단 삽입")

        # 1) p:N
        pm = re.search(r"p:(\d+)", position)
        if pm and not (fix_top_double and inserted):
            tag = f"<!-- p:{int(pm.group(1))} -->"
            pi = _js_index_of(result, tag)
            if pi != -1:
                after = pi + len(tag)
                nxt = _js_index_of(result, "\n\n<!-- p:", after)
                at = nxt if nxt != -1 else len(result)
                result = result[:at] + "\n" + marker + result[at:]
                inserted = True
                log(f"#{num} → p:{pm.group(1)} 뒤 삽입 (위치 {at})")

        # 2) ## 소제목
        if not inserted:
            hm = re.search(r"##\s*(.+)", position)
            if hm:
                heading = hm.group(1).strip()
                hi = _js_index_of(result, heading)
                if hi != -1:
                    nb = _js_index_of(result, "\n\n", hi)
                    if nb != -1:
                        result = result[:nb] + "\n" + marker + result[nb:]
                        inserted = True
                        log(f'#{num} → "##{heading}" 뒤 삽입')

        # 3) 숫자만
        if not inserted and re.fullmatch(r"\d+", position.strip() or "x"):
            tag = f"<!-- p:{int(position.strip())} -->"
            pi = _js_index_of(result, tag)
            if pi != -1:
                after = pi + len(tag)
                nxt = _js_index_of(result, "\n\n<!-- p:", after)
                at = nxt if nxt != -1 else len(result)
                result = result[:at] + "\n" + marker + result[at:]
                inserted = True
                log(f"#{num} → p:{position.strip()} (숫자) 뒤 삽입")

        # 4) 균등 분배
        if not inserted:
            fraction = (idx + 1) / (n_all + 1)
            approx = math.floor(len(result) * fraction)
            nb = _js_index_of(result, "\n\n", approx)
            if nb != -1 and nb < len(result) - 100:
                result = result[:nb] + "\n" + marker + result[nb:]
                log(f"#{num} → 균등 분배 위치 ({round(fraction * 100)}%)")
            else:
                result += "\n" + marker
                log(f"#{num} → 본문 끝 (폴백)")
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--body", "-b", required=True, help="본문 파일")
    ap.add_argument("--design", "-d", required=True, help="설계 JSON")
    ap.add_argument("--mode", choices=["v2", "legacy"], default="v2")
    ap.add_argument("--inject-ids", action="store_true", help="문단 ID 를 먼저 주입")
    ap.add_argument("--fix-top-double", action="store_true", help="T 타입 이중 삽입 방지(스킬 보정)")
    ap.add_argument("--verbose", "-v", action="store_true", help="삽입 로그를 stderr 로")
    a = ap.parse_args()
    # 원본(JS) 문자열 인덱스는 UTF-16 기준이지만, 위치 계산은 모두 같은 문자열 안의 상대 위치라
    # 균등 분배(4단계)에서 이모지 등 BMP 밖 문자가 있을 때만 결과가 달라질 수 있다.
    body = open(a.body, encoding="utf-8").read()
    if a.inject_ids:
        body = inject_paragraph_ids(body)
    designs = load_designs(open(a.design, encoding="utf-8").read())
    log = (lambda m: sys.stderr.write(f"[insertMarker] {m}\n")) if a.verbose else None
    sys.stdout.write(insert_markers(body, designs, a.mode, a.fix_top_double, log))


if __name__ == "__main__":
    main()
