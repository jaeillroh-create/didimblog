#!/usr/bin/env python3
"""인포그래픽 설계 검사기 (인포그래픽 규칙 v2 기준).

1) data_source 검사: 각 data_source 문장이 본문에 그대로 있는지
2) 숫자 검사: headline·texts·footnote 의 모든 숫자 표기가 본문에 같은 표기로 있는지
   (띄어쓰기만 다르면 경고, 없으면 오류) + texts 숫자가 data_source 에 들어 있는지
3) v2 린트: 유형·위치·글자 수·강조·광고 규정·연락처·'특허청'·이모지·사례 주석·ALT
4) 세트 검사: 썸네일 1개, 카테고리별 본문 개수, 유형 중복, B+F 동시 사용, 이미지 간 문단 2개 이상

사용 예:
  python3 check_sources.py --design design.json --body body.md --category "변리사의 현장 수첩" --keyword "직무발명보상금"
출력(stdout JSON): {"ok", "errors": [...], "warnings": [...], "images": [{"index","type","numbers":[...],"missing_sources":[...]}]}
종료 코드: 오류가 있으면 1, 없으면 0.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from design_json import load_designs  # noqa: E402
from categories import BODY_COUNT, resolve as resolve_cat  # noqa: E402

VALID_TYPES = set("TABCDEFGH")
PAIR_TYPES = {"C", "D", "F", "H"}
GUARANTEE = ["무조건", "보장", "반드시", "확실히", "틀림없이", "100% 등록", "100% 승인", "100% 성공",
             "책임지고", "절감합니다", "줄여드립니다", "줄여 드립니다", "돌려받습니다", "승인됩니다", "등록됩니다"]
NUM_RE = re.compile(
    r"\d[\d,]*(?:\.\d+)?(?:\s?(?:천|백|십))?(?:\s?(?:조|억|만))?"
    r"(?:\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:천|백|십))?(?:\s?(?:조|억|만))?)*"
    r"(?:\s?(?:%p|%|원|건|개월|개|명|일|주|년|배|곳|회|위|차|호|항|월|시간|분|초))?"
)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
URL_RE = re.compile(r"(https?://|www\.)\S+|\b[\w-]+\.(?:com|co\.kr|kr|net|org)\b", re.I)
PHONE_RE = re.compile(r"\b0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b|\b1[5-9]\d{2}[-\s]?\d{4}\b")
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⭕✅❌]")


def resolve_category(name):
    r = resolve_cat(name)
    return r["group"] if r else ""


def norm_body(body):
    b = re.sub(r"<!--[\s\S]*?-->", " ", body)
    b = re.sub(r"\*\*|__", "", b)
    b = re.sub(r"^#+\s*", "", b, flags=re.M)
    return re.sub(r"\s+", " ", b).strip()


def nospace(s):
    return re.sub(r"\s+", "", s)


def numbers_in(s):
    out = []
    for m in NUM_RE.finditer(s or ""):
        tok = m.group(0).strip().rstrip(",.")
        if tok:
            out.append(tok)
    return out


def clen(s):
    """글자 수 (공백 포함)."""
    return len((s or "").strip())


def label_items(t, texts):
    """유형별 '라벨'(10자 이내 대상) 목록."""
    if t == "A":
        return [texts[i] for i in (0, 2) if i < len(texts)]
    if t in PAIR_TYPES:
        return [texts[i] for i in range(0, len(texts) - 1, 2)]
    if t == "B":
        return [x.split("|")[0].strip() for x in texts]
    if t == "G":
        return [x.split("|")[0].strip() for x in texts]
    return []


def check(designs, body, category="", keyword=""):
    errors, warnings, images = [], [], []
    nb = norm_body(body)
    nb_ns = nospace(nb)
    pids = {int(x) for x in re.findall(r"<!--\s*p:(\d+)\s*-->", body)}
    cat = resolve_category(category)

    if cat == "diary":
        if designs:
            errors.append("디딤 다이어리는 인포그래픽 설계를 하지 않습니다(v2). 분위기 사진 1~2장만 쓰세요.")
        return {"ok": not errors, "errors": errors, "warnings": warnings, "images": images}

    for i, d in enumerate(designs, 1):
        tag = f"[{i}번 {d.get('type', '?')}]"
        t = (d.get("type") or "").strip().upper()
        texts = [str(x) for x in (d.get("texts") or [])]
        sources = [str(x) for x in (d.get("data_source") or [])]
        emph = [str(x) for x in (d.get("emphasis") or [])]
        hl, fn, alt = d.get("headline") or "", d.get("footnote") or "", d.get("alt") or ""
        pos = str(d.get("position") or "")
        info = {"index": i, "type": t, "numbers": [], "missing_sources": []}
        images.append(info)

        # 필수 항목
        for k in ("type", "position", "headline", "texts", "data_source", "emphasis", "footnote", "alt"):
            if k not in d:
                (errors if k in ("type", "position", "texts", "alt") else warnings).append(f"{tag} '{k}' 항목 없음")
        if t not in VALID_TYPES:
            errors.append(f"{tag} type 은 T 또는 A~H 여야 함")
        # 위치
        if t == "T":
            if pos != "top":
                errors.append(f"{tag} 썸네일 position 은 'top' 이어야 함")
        else:
            m = re.fullmatch(r"p:(\d+)", pos.strip())
            if not m:
                errors.append(f"{tag} position 은 'p:N' 형식이어야 함 (현재 '{pos}')")
            elif pids and int(m.group(1)) not in pids:
                errors.append(f"{tag} 본문에 문단 ID p:{m.group(1)} 이 없음")
        # 글자 수
        if clen(hl) > 20:
            (warnings if t == "T" else errors).append(f"{tag} 헤드라인 {clen(hl)}자 — 20자 이내 (v2 공통 원칙 4)")
        for lab in label_items(t, texts):
            if clen(lab) > 10:
                warnings.append(f"{tag} 라벨 '{lab}' {clen(lab)}자 — 10자 이내 권장")
        if t == "T":
            mains = [x for x in texts[1:] if clen(x) <= 10]
            longs = [x for x in texts[1:] if clen(x) > 10]
            if len(longs) > 1:
                errors.append(f"{tag} 썸네일 한 줄 10자 초과: {longs[1:]} (서브문구는 1줄만)")
            if not 2 <= len(mains) <= 3:
                warnings.append(f"{tag} 썸네일 메인 문구는 2~3줄 (현재 {len(mains)}줄)")
            if longs and not 12 <= clen(longs[0]) <= 18:
                warnings.append(f"{tag} 서브문구는 12~18자 권장 ('{longs[0]}')")
        # 강조
        if t != "T" and not 1 <= len(emph) <= 2:
            errors.append(f"{tag} emphasis 는 1~2개 (현재 {len(emph)}개)")
        if t == "T" and len(emph) > 1:
            warnings.append(f"{tag} 썸네일 강조는 단어·숫자 1개만")
        for e in emph:
            if not any(e in x for x in texts):
                errors.append(f"{tag} emphasis '{e}' 가 texts 안에 없음")
        # 이미지 글자 전체
        img_text = " ".join([hl, fn] + texts)
        # 숫자 검사
        nums = numbers_in(" ".join([hl] + texts)) + numbers_in(fn)
        text_nums = numbers_in(" ".join(texts))
        if len(set(text_nums)) > 5:
            warnings.append(f"{tag} 이미지 속 수치 {len(set(text_nums))}개 — 5개까지 (v2 공통 원칙 4)")
        for tok in dict.fromkeys(nums):
            if tok in nb:
                st = "ok"
            elif nospace(tok) in nb_ns:
                st = "spacing"
                warnings.append(f"{tag} 숫자 '{tok}' 본문과 띄어쓰기만 다름 — 본문 표기로 맞추세요")
            else:
                st = "missing"
                errors.append(f"{tag} 숫자 '{tok}' 가 본문에 없음 (v2 공통 원칙 2)")
            info["numbers"].append({"token": tok, "status": st})
        for tok in dict.fromkeys(text_nums):
            if sources and not any(nospace(tok) in nospace(s) for s in sources):
                warnings.append(f"{tag} 숫자 '{tok}' 가 data_source 문장에 없음 — 출처 문장을 추가하세요")
        if t != "T" and text_nums and not sources:
            errors.append(f"{tag} 수치가 있는데 data_source 가 비어 있음")
        # data_source 원문 검사
        for s in sources:
            ns = re.sub(r"\s+", " ", re.sub(r"\*\*|__", "", s)).strip()
            if ns and ns in nb:
                continue
            if nospace(ns) in nb_ns:
                warnings.append(f"{tag} data_source 띄어쓰기만 본문과 다름: '{s[:40]}…'")
                continue
            errors.append(f"{tag} data_source 가 본문에 그대로 없음: '{s[:60]}'")
            info["missing_sources"].append(s)
        # 광고 규정 / 브랜드 / 기관명 / 이모지
        for g in GUARANTEE:
            if g in img_text:
                errors.append(f"{tag} 결과 보장·단정 표현 '{g}' (변리사 광고 규정)")
        if t != "T" and "사례" in (hl + fn + " ".join(texts)) and "개별 상황에 따라 다름" not in fn:
            errors.append(f"{tag} 사례 수치 → footnote 에 '개별 상황에 따라 다름' 필요")
        if EMAIL_RE.search(img_text) or URL_RE.search(img_text) or PHONE_RE.search(img_text):
            errors.append(f"{tag} 이미지에 이메일·URL·전화번호 금지 (브랜드는 '특허그룹 디딤'만)")
        if "디딤" in re.sub(r"특허그룹 디딤|디딤 소식|디딤 다이어리|디딤 일상", "", img_text):
            warnings.append(f"{tag} '특허그룹 디딤' 외의 디딤 표기가 있음 — 브랜드 표기 통일")
        if re.search(r"특허청(?!\s*\(현 지식재산처\))", img_text):
            errors.append(f"{tag} '특허청' → '지식재산처' (과거 서술은 '당시 특허청(현 지식재산처)')")
        if EMOJI_RE.search(img_text + alt):
            errors.append(f"{tag} 이모지 금지")
        # ALT
        if not alt:
            errors.append(f"{tag} ALT 텍스트 없음")
        elif not 20 <= clen(alt) <= 40:
            warnings.append(f"{tag} ALT {clen(alt)}자 — 20~40자")
        kw = nospace(keyword)
        kw_core = kw[: max(2, (len(kw) + 1) // 2)]  # 변형 표현(앞부분 일치) 허용
        if keyword and alt and kw_core not in nospace(alt)[: len(kw) + 8]:
            warnings.append(f"{tag} ALT 앞부분에 핵심 키워드 '{keyword}' 권장")

    # ── 세트 검사 ──
    types = [(d.get("type") or "").strip().upper() for d in designs]
    tcount = types.count("T")
    if tcount != 1:
        errors.append(f"썸네일(T)은 정확히 1개 (현재 {tcount}개)")
    elif types[0] != "T":
        warnings.append("썸네일(T)을 첫 번째로 두세요")
    body_types = [x for x in types if x != "T"]
    dup = sorted({x for x in body_types if body_types.count(x) > 1})
    if dup:
        errors.append(f"같은 유형 중복 사용: {dup}")
    if "B" in body_types and "F" in body_types:
        errors.append("프로세스(B)와 퍼널(F)은 함께 쓰지 않음")
    if cat in ("field", "lounge", "news"):
        lo, hi, allow = BODY_COUNT[cat]
        nbody = len(body_types)
        if nbody > hi:
            errors.append(f"본문 인포그래픽 {nbody}개 — 이 카테고리는 최대 {hi}개")
        elif nbody < allow:
            errors.append(f"본문 인포그래픽 {nbody}개 — 최소 {allow}개")
        elif nbody < lo:
            warnings.append(f"본문 인포그래픽 {nbody}개 — 권장 {lo}~{hi}개 (후보 데이터 부족 시 허용)")
        if cat == "news" and any(x != "C" for x in body_types):
            errors.append("디딤 소식(IP 뉴스 한 입) 계열은 숫자 카드(C) 1개만")
        pri = (resolve_cat(category) or {}).get("priority", [])
        if body_types and pri and not any(x in pri for x in body_types):
            warnings.append(f"이 카테고리 우선 유형은 {pri} — 데이터가 맞으면 우선 유형을 고려")
    elif not category:
        warnings.append("--category 가 없어 카테고리별 개수 검사를 건너뜀")
    else:
        warnings.append(f"알 수 없는 카테고리 '{category}' — 개수 검사를 건너뜀")
    # 이미지 사이 문단 2개 이상
    ps = sorted(int(m.group(1)) for d in designs if (m := re.fullmatch(r"p:(\d+)", str(d.get("position", "")).strip())))
    prev = 0 if "T" in types else None
    for p in ps:
        if prev is not None and p - prev < 2:
            errors.append(f"이미지 연속 배치: p:{prev} 와 p:{p} 사이 문단 {p - prev}개 — 최소 2개" if prev
                          else f"썸네일 바로 뒤 p:{p} — 사이에 문단 최소 2개")
        prev = p
    # ALT 키워드 반복
    if keyword:
        k = nospace(keyword)
        cnt = sum(nospace(d.get("alt") or "").count(k) for d in designs)
        if cnt > 3:
            warnings.append(f"ALT 에 '{keyword}' {cnt}회 — 3회 넘게 반복하지 말고 변형 표현 사용")

    return {"ok": not errors, "errors": errors, "warnings": warnings, "images": images}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--design", "-d", required=True, help="설계 JSON (객체·배열·{infographics:[...]}·LLM 원문)")
    ap.add_argument("--body", "-b", required=True, help="본문 파일 (마크다운/텍스트, 문단 ID 포함 가능)")
    ap.add_argument("--category", "-c", default="", help="카테고리명 또는 categoryNo (신규·레거시 모두)")
    ap.add_argument("--keyword", "-k", default="", help="핵심 키워드 (ALT 검사용)")
    a = ap.parse_args()
    designs = load_designs(open(a.design, encoding="utf-8").read())
    body = open(a.body, encoding="utf-8").read()
    res = check(designs, body, a.category, a.keyword)
    print(json.dumps(res, ensure_ascii=False, indent=2))
    sys.exit(0 if res["ok"] else 1)


if __name__ == "__main__":
    main()
