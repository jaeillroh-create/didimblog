#!/usr/bin/env python3
"""SEO 18항목 체크리스트 — seed_data/seo_checklist.json + seo-items.ts + actions/seo-checks.ts 포팅,
그리고 본문 텍스트만으로 판정 가능한 항목의 자동 1차 판정.

판정(verdict) 규칙은 seo-checks.ts calculateVerdict 그대로:
  필수(required) 통과 수 < 10 → blocked(발행 불가)
  권장(recommended) 미충족 수 > 2 → fix_required(수정 필요)
  그 외 → pass(통과)
등급(grade)은 판정 계산 시 seo-items.ts(SEO_ITEMS, 17개 — 13번 없음, 17번 optional)를 따른다.
표시용 기준(criteria)·이유(reason)는 seed_data/seo_checklist.json(18개)을 쓴다.

자동 판정(--auto)은 basis 필드로 근거를 밝힌다:
  "seo-calculator"   : seo-calculator.ts / seo-rubrics.ts 와 같은 규칙
  "ai-editor"        : ai-editor-client.tsx 간이 체크와 같은 규칙
  "skill-heuristic"  : 원본 코드에 없는 스킬 보조 판정 (사람 확인 권장)
  "human"            : 자동 판정 불가 — passed=null, 사람(또는 Claude 의 정성 검토) 확인 필요

입력(JSON, stdin 또는 --input):
{
  "title": "...", "body": "...", "target_keyword": "...", "tags": [...],     // tags 생략 가능
  "category_id": "CAT-A", "secondary_category": "CAT-A-01",
  "scheduled_at": "2026-10-06T09:00",                                     // 선택: 예약 발행 시각
  "manual": {"4": true, "9": false}                                        // 선택: 사람 판정 덮어쓰기
}
--items-only : 입력 없이 항목 표만 출력
"""

import argparse
import datetime
import json
import re
import sys

from _jscompat import JS_WS, js_len
from seo_editor_check import extract_image_markers, js_substring
from seo_score import (
    SEO_RUBRICS,
    count_images,
    count_keyword,
    count_sub_headings,
    get_rubric_key,
    has_cta,
)

# ── seed_data/seo_checklist.json items (원문) ──
CHECKLIST = [
    {"id": 1, "grade": "required", "category": "제목", "item": "제목 길이", "criteria": "25~30자 이내", "reason": "네이버 검색결과에서 잘리지 않는 최적 길이"},
    {"id": 2, "grade": "required", "category": "제목", "item": "제목 키워드 위치", "criteria": "핵심 키워드가 앞 15자 이내", "reason": "네이버 알고리즘은 제목 앞부분 키워드에 가중치 부여"},
    {"id": 3, "grade": "optional", "category": "제목", "item": "제목 숫자 포함", "criteria": "금액/비율/기간 1개 이상", "reason": "숫자 포함 제목의 클릭률이 2.5배 높음"},
    {"id": 4, "grade": "required", "category": "도입부", "item": "도입부 톤", "criteria": "사람의 상황으로 시작 (제도 설명 시작 금지)", "reason": "스토리텔링 도입부가 체류시간 2배 증가"},
    {"id": 5, "grade": "required", "category": "본문", "item": "본문 키워드 반복", "criteria": "핵심 키워드 3~5회 자연스럽게 등장", "reason": "너무 적으면 SEO 불리, 너무 많으면 어뷰징"},
    {"id": 6, "grade": "recommended", "category": "본문", "item": "소제목 사용", "criteria": "'제목2' 스타일 2개 이상", "reason": "H2 태그가 네이버 알고리즘의 구조 파악에 핵심"},
    {"id": 7, "grade": "recommended", "category": "본문", "item": "소제목 키워드", "criteria": "소제목에 키워드 변형 1개+", "reason": "네이버 스마트블록 노출에 유리"},
    {"id": 8, "grade": "required", "category": "이미지", "item": "이미지 수", "criteria": "최소 3장, 최대 7장", "reason": "이미지 없는 글은 네이버에서 노출 불리"},
    {"id": 9, "grade": "required", "category": "이미지", "item": "첫 이미지", "criteria": "브랜딩 썸네일 (카테고리별 통일 디자인)", "reason": "검색결과 썸네일로 자동 추출됨"},
    {"id": 10, "grade": "optional", "category": "이미지", "item": "이미지 ALT 텍스트", "criteria": "모든 이미지에 키워드 포함 대체텍스트 입력", "reason": "이미지 검색 노출 + 접근성 향상"},
    {"id": 11, "grade": "required", "category": "본문", "item": "본문 분량", "criteria": "1,500~2,500자 (다이어리: 800~1,500자)", "reason": "너무 짧으면 저품질, 너무 길면 이탈률 증가"},
    {"id": 12, "grade": "recommended", "category": "링크", "item": "내부 링크", "criteria": "관련 글 링크 2~3개", "reason": "체류시간 증가 + 크롤링 효율 + 글간 연결"},
    {"id": 13, "grade": "optional", "category": "링크", "item": "외부 링크", "criteria": "최소화 (가급적 0개)", "reason": "외부 URL은 네이버 노출에 불이익 가능"},
    {"id": 14, "grade": "required", "category": "태그", "item": "태그 수", "criteria": "정확히 10개", "reason": "부족하면 노출 기회 감소, 과다는 스팸 판정"},
    {"id": 15, "grade": "recommended", "category": "태그", "item": "태그 구성", "criteria": "핵심(3)+연관(3)+브랜드(2)+롱테일(2)", "reason": "다양한 검색어에 노출되도록 포트폴리오 구성"},
    {"id": 16, "grade": "required", "category": "CTA", "item": "CTA 배치", "criteria": "구분선 아래 + 연락처 포함", "reason": "CTA 누락은 전환 기회의 완전 상실"},
    {"id": 17, "grade": "recommended", "category": "품질", "item": "맞춤법", "criteria": "네이버 맞춤법 검사기 통과", "reason": "오탈자는 전문성 인식을 심각하게 훼손"},
    {"id": 18, "grade": "required", "category": "발행", "item": "예약 시간", "criteria": "화요일 09:00 설정", "reason": "일관된 발행 패턴이 알고리즘 신뢰 신호"},
]

# ── seo-items.ts SEO_ITEMS (판정 계산용 등급, 원문) ──
SEO_ITEMS = [
    {"id": 1, "label": "제목 길이", "description": "25~30자", "grade": "required"},
    {"id": 2, "label": "제목 키워드 위치", "description": "앞 15자 이내", "grade": "required"},
    {"id": 4, "label": "도입부 톤", "description": "사람의 상황으로 시작", "grade": "required"},
    {"id": 5, "label": "본문 키워드 빈도", "description": "3~5회", "grade": "required"},
    {"id": 8, "label": "이미지 개수", "description": "최소 3장", "grade": "required"},
    {"id": 9, "label": "첫 이미지", "description": "브랜딩 썸네일", "grade": "required"},
    {"id": 11, "label": "본문 분량", "description": "1,500~2,500자", "grade": "required"},
    {"id": 14, "label": "태그 개수", "description": "10개", "grade": "required"},
    {"id": 16, "label": "CTA 배치", "description": "구분선 + 연락처", "grade": "required"},
    {"id": 18, "label": "예약 시간", "description": "화요일 09:00", "grade": "required"},
    {"id": 6, "label": "소제목 개수", "description": "'제목2' 2개 이상", "grade": "recommended"},
    {"id": 7, "label": "소제목 키워드", "description": "키워드 변형 포함", "grade": "recommended"},
    {"id": 12, "label": "내부 링크", "description": "2~3개", "grade": "recommended"},
    {"id": 15, "label": "태그 구성", "description": "핵심3+연관3+브랜드2+롱테일2", "grade": "recommended"},
    {"id": 3, "label": "제목 숫자", "description": "숫자 포함 여부", "grade": "optional"},
    {"id": 10, "label": "이미지 ALT", "description": "ALT 텍스트 설정", "grade": "optional"},
    {"id": 17, "label": "맞춤법", "description": "맞춤법 검사 통과", "grade": "optional"},
]
REQUIRED_PASS_COUNT = 10
RECOMMENDED_MAX_FAIL = 2
VERDICT_LABELS = {"pass": "통과", "fix_required": "수정 필요", "blocked": "발행 불가"}


def calculate_verdict(required_pass, recommended_pass):
    if required_pass < REQUIRED_PASS_COUNT:
        return "blocked"
    rec_total = len([i for i in SEO_ITEMS if i["grade"] == "recommended"])
    if rec_total - recommended_pass > RECOMMENDED_MAX_FAIL:
        return "fix_required"
    return "pass"


def summarize(items):
    """saveSeoCheck 의 집계: items = {"<id>": {"passed": bool, "note": str}}"""
    def cnt(grade):
        return len([i for i in SEO_ITEMS if i["grade"] == grade and (items.get(str(i["id"])) or {}).get("passed")])

    rp, rcp, op = cnt("required"), cnt("recommended"), cnt("optional")
    v = calculate_verdict(rp, rcp)
    return {"required_pass_count": rp, "recommended_pass_count": rcp, "optional_pass_count": op, "verdict": v, "verdictLabel": VERDICT_LABELS[v]}


_LINK_RE = re.compile(r"https?://[^\s)\]>\"']+")


def auto_judge(d):
    title = d.get("title") or ""
    body = d.get("body") or ""
    kw = d.get("target_keyword") or ""
    tags = d.get("tags")
    rk = get_rubric_key(d.get("secondary_category") or d.get("category_id"))
    rb = SEO_RUBRICS[rk]
    res = {}

    def put(i, passed, observed, basis, note=""):
        res[str(i)] = {"passed": passed, "observed": observed, "basis": basis, "note": note}

    tl = js_len(title)
    put(1, rb["titleLength"]["min"] <= tl <= rb["titleLength"]["max"], f"{tl}자", "seo-calculator",
        f"루브릭 {rk}: {rb['titleLength']['min']}~{rb['titleLength']['max']}자")
    if kw:
        put(2, kw in js_substring(title, 0, 15), "포함" if kw in js_substring(title, 0, 15) else "미포함", "ai-editor")
    else:
        put(2, None, "키워드 미설정", "human", "타겟 키워드를 정해야 판정 가능")
    has_num = re.search(r"[0-9]", title) is not None
    put(3, has_num, "숫자 있음" if has_num else "숫자 없음", "skill-heuristic", "숫자가 금액/비율/기간인지 사람 확인")
    put(4, None, "", "human", "도입부가 사람의 상황(장면·대화)으로 시작하는지 정성 판단")
    if kw:
        f = count_keyword(body, kw)
        put(5, rb["keywordFreq"]["min"] <= f <= rb["keywordFreq"]["max"], f"{f}회", "seo-calculator",
            f"루브릭 {rk}: {rb['keywordFreq']['min']}~{rb['keywordFreq']['max']}회 (대소문자 무시)")
    else:
        put(5, None, "키워드 미설정", "human")
    h = count_sub_headings(body)
    sh = rb["subHeadings"]
    put(6, sh["weight"] == 0 or sh["min"] <= h <= sh["max"], f"{h}개", "seo-calculator", f"루브릭 {rk}: {sh['min']}~{sh['max']}개 (##·###)")
    heads = re.findall(r"(?m)^#{2,3}" + JS_WS + r"+(.+)$", body)
    hk = [x for x in heads if kw and kw in x]
    put(7, None, f"키워드 그대로 포함한 소제목 {len(hk)}개 / 소제목 {len(heads)}개", "human", "'키워드 변형' 여부는 사람 확인 (skill-heuristic 관찰값)")
    ic_calc = count_images(body)
    ic_all = len(extract_image_markers(body))
    ir = rb["imageCount"]
    put(8, ir["min"] <= ic_all <= ir["max"], f"마커 {ic_all}개 (seo-calculator 정규식 기준 {ic_calc}개)", "seo-calculator",
        f"루브릭 {rk}: {ir['min']}~{ir['max']}개. 개수는 박스형 마커까지 세는 ai-editor 추출 기준")
    put(9, None, "", "human", "첫 이미지가 카테고리 통일 브랜딩 썸네일인지 — 실제 이미지 확인 필요")
    put(10, None, "", "human", "네이버 에디터에서 ALT 입력 여부 확인")
    bl = js_len(re.sub(JS_WS, "", body))
    br = rb["bodyLength"]
    put(11, br["min"] <= bl <= br["max"], f"{bl:,}자(공백 제외)", "seo-calculator", f"루브릭 {rk}: {br['min']:,}~{br['max']:,}자")
    links = _LINK_RE.findall(body)
    internal = [u for u in links if "blog.naver.com/didimip" in u]
    put(12, None, f"본문 내 디딤 블로그 링크 {len(internal)}개", "human", "관련 글 링크는 발행 시 추가하는 경우가 많음 — 사람 확인 (skill-heuristic 관찰값)")
    ext = [u for u in links if u not in internal]
    put(13, len(ext) == 0, f"외부 링크 {len(ext)}개", "skill-heuristic")
    if tags is not None:
        tc = len(tags)
        chars = js_len("".join(tags))
        put(14, tc >= rb["tagCount"]["min"] and chars < 100, f"{tc}개 / {chars}자", "seo-calculator", "10개 이상 + 총 100자 미만")
    else:
        put(14, None, "태그 목록 없음", "human", "tags 를 입력하면 자동 판정")
    put(15, None, "", "human", "핵심3+연관3+브랜드2+롱테일2 분류는 의미 판단")
    c = has_cta(body)
    if rb["ctaRequired"]:
        put(16, c, "있음" if c else "없음", "seo-calculator", "구분선(━━━)·admin@didimip.com·이웃 추가 등 패턴")
    else:
        put(16, not c, "있음 (부적절)" if c else "없음 (적절)", "seo-calculator", "디딤 다이어리: CTA 없어야 통과")
    put(17, None, "", "human", "네이버 맞춤법 검사기 통과 여부")
    sa = d.get("scheduled_at")
    if sa:
        try:
            dt = datetime.datetime.fromisoformat(sa)
            ok = dt.weekday() == 1 and dt.hour == 9 and dt.minute == 0
            put(18, ok, dt.strftime("%Y-%m-%d %H:%M (%a)"), "skill-heuristic", "화요일 09:00 여부")
        except ValueError:
            put(18, None, sa, "human", "시각 형식 해석 불가")
    else:
        put(18, None, "예약 시각 미입력", "human")

    for k, v in (d.get("manual") or {}).items():
        if str(k) in res:
            res[str(k)]["passed"] = bool(v)
            res[str(k)]["basis"] = "manual"
    return rk, res


def main():
    ap = argparse.ArgumentParser(description="SEO 18항목 체크리스트 판정 (seo-checks.ts) + 본문 기반 자동 1차 판정.")
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--items-only", action="store_true", help="항목 표만 출력")
    ap.add_argument("--from-items", action="store_true", help="입력이 {\"items\": {id: {passed, note}}} 일 때 집계만")
    args = ap.parse_args()
    if args.items_only:
        print(json.dumps({"checklist": CHECKLIST, "seo_items": SEO_ITEMS}, ensure_ascii=False, indent=2))
        return
    d = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    if args.from_items:
        print(json.dumps(summarize(d.get("items") or {}), ensure_ascii=False, indent=2))
        return
    rk, judged = auto_judge(d)
    items = {k: {"passed": bool(v["passed"]), "note": v["note"]} for k, v in judged.items()}
    summary = summarize(items)
    pending = [int(k) for k, v in judged.items() if v["passed"] is None]
    rows = []
    for c in CHECKLIST:
        j = judged[str(c["id"])]
        grade_calc = next((i["grade"] for i in SEO_ITEMS if i["id"] == c["id"]), None)
        rows.append({**c, "grade_for_verdict": grade_calc, **j})
    print(json.dumps({
        "rubricKey": rk,
        "items": rows,
        "pending_human": pending,
        "summary_unknown_as_fail": summary,
        "note": "pending_human 항목은 미통과로 집계됨 — 사람 확인 후 manual 로 넣어 다시 실행",
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
