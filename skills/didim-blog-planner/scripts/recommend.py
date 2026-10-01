#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""디딤 블로그 주제 추천 엔진 (Python 포팅, 표준 라이브러리만 사용).

원본:
  src/lib/recommendation-engine.ts        (카테고리 균형, 제목 템플릿, 뉴스 관련성)
  src/actions/recommendations.ts          (hard/soft 필터, 2차 분류 로테이션, 카테고리별 카드)
  src/lib/constants/sub-category-pool.ts  (2차 분류 키워드 풀, 다이어리 주제 풀)
  src/lib/constants/schedule-data.ts      (12주 스케줄, 주차 계산)
  src/actions/news-search.ts              (비뉴스 제외 패턴, 폴백 관련성)

하위 명령:
  plan             발행 이력 등 JSON → 이번 주 추천 카드 + 카테고리 균형 + 표
  reject-keywords  부적합 처리한 추천(제목·키워드) → rejection_keywords 추출
  news-check       웹 검색으로 모은 기사 목록 → 규칙 기반 1차 필터(비뉴스 제외·관련성 점수)
  week             블로그 시작일 기준 현재 주차·4주 묶음 계산

난수: 원본은 Math.random 을 쓴다. 재현성을 위해 mulberry32 PRNG 를 쓰며 --seed 로 고정 가능.
(검증 시 JS 쪽 Math.random 도 같은 mulberry32 로 바꿔 같은 결과가 나오는지 확인했다.)

입출력은 모두 JSON(UTF-8). 입력 파일 대신 '-' 를 주면 stdin 에서 읽는다.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))

# ─────────────────────────────────────────────────────────────
# 상수 (원문 그대로)
# ─────────────────────────────────────────────────────────────

# recommendation-engine.ts:44
MONTHLY_TARGETS = {"CAT-A": 2, "CAT-B": 1, "CAT-C": 1}

# recommendation-engine.ts:50
CATEGORY_NAMES = {
    "CAT-A": "변리사의 현장 수첩",
    "CAT-B": "IP 라운지",
    "CAT-C": "디딤 다이어리",
}

# recommendation-engine.ts:119
DIARY_SUBS = [
    {"id": "CAT-C-01", "name": "컨설팅 후기"},
    {"id": "CAT-C-02", "name": "디딤 일상"},
    {"id": "CAT-C-03", "name": "대표의 생각"},
]

# recommendation-engine.ts:142
URGENT_NEWS_KEYWORDS = [
    "특허법 개정",
    "직무발명 판례",
    "AI 기본법",
    "세액공제 변경",
    "벤처인증 요건",
]

# recommendation-engine.ts:153
DOMAIN_POSITIVE_KEYWORDS = [
    "특허", "발명", "IP", "지식재산", "지재권",
    "세액공제", "절세", "조세", "세금",
    "벤처", "벤처인증", "벤처기업",
    "연구소", "기업부설", "R&D", "연구개발",
    "AI 특허", "인공지능", "AI 기본법", "AI 규제",
    "영업비밀", "직무발명", "보상금",
    "기술이전", "라이선싱",
    "중소기업", "스타트업", "창업",
]

# recommendation-engine.ts:168
DOMAIN_NEGATIVE_KEYWORDS = [
    "방산", "방위", "군사", "국방", "무기", "미사일", "전투기", "잠수함", "K-방산",
    "아이돌", "드라마", "영화", "축구", "야구", "농구", "올림픽",
    "아파트", "분양", "재건축", "부동산",
    "대선", "총선", "여당", "야당", "탄핵",
    "주가", "증시", "코스피", "코스닥", "환율",
]

# recommendation-engine.ts:251 (순서 유지 — 첫 매칭이 채택됨)
KEYWORD_REASON_MAP = {
    "조세특례제한법": {
        "reason": "디딤의 핵심 서비스인 직무발명보상 절세 컨설팅에 직접 영향",
        "audience": "법인세 부담이 큰 중소기업 대표",
        "angle": "법 개정이 우리 회사 절세에 어떤 영향을 미치는지 실제 시뮬레이션으로 보여주기",
    },
    "세액공제": {
        "reason": "기업부설연구소 세액공제 및 R&D 비용 처리에 직접 관련",
        "audience": "기업부설연구소를 운영 중인 기업의 경영지원팀",
        "angle": "세액공제 기준 변경 시 우리 연구소는 어떻게 대응해야 하는지",
    },
    "벤처기업인증": {
        "reason": "디딤의 벤처인증 컨설팅 서비스와 직접 연결",
        "audience": "벤처인증을 준비 중인 스타트업 대표",
        "angle": "변경된 요건이 우리 회사 인증에 유리한지 불리한지 분석",
    },
    "벤처인증": {
        "reason": "디딤의 벤처인증 컨설팅 서비스와 직접 연결",
        "audience": "벤처인증을 준비 중이거나 갱신 예정인 기업 대표",
        "angle": "인증 요건 변화가 우리 회사에 미치는 영향과 대응 전략",
    },
    "직무발명": {
        "reason": "디딤 최고 마진 서비스(직무발명보상 절세)의 핵심 주제",
        "audience": "연구개발 인력이 있는 기업의 대표 또는 CTO",
        "angle": "판례/제도 변화가 보상금 설계에 미치는 실무 영향",
    },
    "특허법": {
        "reason": "특허 출원 전략 및 IP 보호 서비스와 관련",
        "audience": "기술 기반 기업의 CTO, 경영지원팀",
        "angle": "법 개정이 우리 회사 특허 포트폴리오에 미치는 영향",
    },
    "AI 기본법": {
        "reason": "2026년 시행 예정인 핵심 법안, IP 라운지 5대 이슈축",
        "audience": "AI 기술 활용 기업 전체",
        "angle": "기본법 시행 전 AI 특허/저작권 대비 체크리스트",
    },
    "AI": {
        "reason": "AI 특허 전략 서비스 및 IP 라운지 콘텐츠 축과 관련",
        "audience": "AI/기술 스타트업 대표",
        "angle": "AI 규제 변화가 기술기업의 IP 전략에 미치는 영향",
    },
    "인공지능": {
        "reason": "AI 특허 전략 서비스 및 IP 라운지 콘텐츠 축과 관련",
        "audience": "AI/기술 스타트업 대표",
        "angle": "AI 규제 변화가 기술기업의 IP 전략에 미치는 영향",
    },
    "연구소": {
        "reason": "기업부설연구소 설립/사후관리 서비스와 직접 연결",
        "audience": "연구소를 운영 중이거나 설립 예정인 기업",
        "angle": "제도 변화에 따른 연구소 운영 실무 대응 방법",
    },
}

# recommendations.ts:727-747
REJECT_LOOKBACK_DAYS = 30
BLACKLIST_REJECT_COUNT = 3
TITLE_STOPWORDS = {
    "실무에서", "대표님이", "확인해야", "알아야", "완벽", "가이드",
    "최신", "핵심", "정리", "이유", "직접", "후속편",
}

# recommendations.ts:818-820
RECENT_SHOWN_WINDOW_HOURS = 48
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)

# recommendations.ts:1226
CARDS_PER_CATEGORY = {"CAT-A": 2, "CAT-B": 2, "CAT-C": 1}

# news-search.ts:542
FIXED_KEYWORDS = [
    "직무발명보상금",
    "직무발명보상 세액공제",
    "기업부설연구소",
    "연구개발비 세액공제",
    "벤처기업인증",
    "벤처기업 혜택",
    "중소기업 특허",
    "중소기업 법인세 감면",
    "지식재산 중소기업",
    "조세특례제한법 연구개발",
]

# news-search.ts:567
EXCLUDE_PATTERNS = [
    "[칼럼]", "[기고]", "[시론]", "[사설]", "[논단]", "[기자수첩]",
    "[특별기고]", "[전문가칼럼]", "[CEO칼럼]", "[변호사칼럼]",
    "[인터뷰]", "[Who Is", "[피플]", "[人사이드]", "[만나보니]",
    "Q&A", "인터뷰", "를 만나다", "에게 듣다", "에게 묻다",
    "[광고]", "[후원]", "[브랜디드]", "[스폰서]", "[협찬]",
    "[독자투고]", "[서평]", "[리뷰]", "[체험기]",
]

# sub-category-pool.ts:23
SUB_CATEGORY_POOL = [
    {"id": "CAT-A-01", "name": "절세 시뮬레이션", "parentId": "CAT-A", "keywords": [
        "직무발명보상금", "법인세 절세", "연구인력개발비 세액공제", "대표이사 직무발명보상금",
        "중소기업 세액공제", "R&D 세액공제", "조세특례 절세"]},
    {"id": "CAT-A-02", "name": "인증 가이드", "parentId": "CAT-A", "keywords": [
        "벤처기업인증", "이노비즈인증", "기업부설연구소 설립", "연구전담부서", "메인비즈인증",
        "이노비즈 조건", "벤처인증 혁신성장"]},
    {"id": "CAT-A-03", "name": "연구소 운영 실무", "parentId": "CAT-A", "keywords": [
        "연구활동조사표", "연구과제관리", "연구노트 작성", "연구개발활동 기록", "연구소 사후관리",
        "기업부설연구소 세무조사", "R&D 환수"]},
    {"id": "CAT-A-04", "name": "특허·상표 출원 실무", "parentId": "CAT-A", "keywords": [
        "특허출원 절차", "상표등록 방법", "디자인출원", "해외특허출원", "PCT 출원", "우선심사 청구",
        "특허 명세서"]},
    {"id": "CAT-B-01", "name": "특허 전략 노트", "parentId": "CAT-B", "keywords": [
        "특허 포트폴리오", "IP 전략", "특허 분석", "기술 가치평가", "특허맵", "스타트업 특허 전략",
        "벤처인증 특허"], "newsKeywords": ["특허 포트폴리오", "IP 전략", "특허 분쟁"]},
    {"id": "CAT-B-02", "name": "AI와 IP", "parentId": "CAT-B", "keywords": [
        "AI 특허", "AI 저작권", "AI 기본법", "생성형 AI 특허", "AI 발명자", "ChatGPT 특허",
        "AI 상표등록"], "newsKeywords": ["AI 특허", "AI 저작권", "AI 기본법", "생성형 AI"]},
    {"id": "CAT-B-03", "name": "IP 뉴스 한 입", "parentId": "CAT-B", "keywords": [
        "직무발명 소송", "특허 분쟁", "IP 정책 변화", "지식재산 동향", "특허법 개정", "상표 분쟁"],
     "newsKeywords": ["직무발명 판례", "특허법 개정", "지식재산 정책"]},
    {"id": "CAT-C-01", "name": "컨설팅 후기", "parentId": "CAT-C", "keywords": [], "useTopicPool": True},
    {"id": "CAT-C-02", "name": "디딤 일상", "parentId": "CAT-C", "keywords": [], "useTopicPool": True},
    {"id": "CAT-C-03", "name": "대표의 생각", "parentId": "CAT-C", "keywords": [], "useTopicPool": True},
]

# sub-category-pool.ts:153
DIARY_TOPIC_POOL = [
    {"subCategoryId": "CAT-C-01", "title": "이번 달 벤처인증 N건 완료 — 각 회사 다른 전략", "keywords": ["벤처인증 컨설팅"]},
    {"subCategoryId": "CAT-C-01", "title": "연구소 설립 컨설팅 후기 — 2명 직원으로 인증받은 회사", "keywords": ["연구소 설립 컨설팅"]},
    {"subCategoryId": "CAT-C-01", "title": "직무발명 절세 컨설팅 사례 — 법인세 절감 실화", "keywords": ["절세 컨설팅 사례"]},
    {"subCategoryId": "CAT-C-01", "title": "이번 분기 가장 기억에 남는 컨설팅 현장", "keywords": ["컨설팅 후기"]},
    {"subCategoryId": "CAT-C-02", "title": "변리사가 서울대 AI 과정을 듣는 이유", "keywords": ["변리사 AI"]},
    {"subCategoryId": "CAT-C-02", "title": "디딤 사무실 이야기 — 작은 팀이 만드는 변화", "keywords": ["디딤 일상"]},
    {"subCategoryId": "CAT-C-02", "title": "변리사의 하루 — 오전 상담부터 저녁 세미나까지", "keywords": ["변리사 일상"]},
    {"subCategoryId": "CAT-C-03", "title": "KAIST 석사 → 기업 CIPO → 변리사, 디딤을 만든 이유", "keywords": ["특허그룹디딤"]},
    {"subCategoryId": "CAT-C-03", "title": "AI 시대 변리사의 역할이 바뀌고 있다", "keywords": ["변리사 AI 시대"]},
    {"subCategoryId": "CAT-C-03", "title": "중소기업이 특허를 대하는 3가지 오해", "keywords": ["중소기업 특허"]},
]

# schedule-data.ts:12 (추천 엔진이 실제로 읽는 쪽. seed_data/schedule_12weeks.json 과 일부 다름 — references 참조)
SCHEDULE_DATA = [
    {"week": 1, "category": "현장 수첩", "subCategory": "절세 시뮬레이션", "title": "법인세 2억 내던 대표님, 지금은 5천만원입니다", "keywords": ["직무발명보상금 절세", "법인세 줄이는 방법"], "cta": "절세 시뮬레이션 무료 신청"},
    {"week": 2, "category": "IP 라운지", "subCategory": "특허 전략 노트", "title": "특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼", "keywords": ["스타트업 특허 전략", "벤처인증 특허"], "cta": "이웃 추가"},
    {"week": 3, "category": "현장 수첩", "subCategory": "연구소 운영", "title": "연구소 세무조사 통지서 받고 전화 온 대표님", "keywords": ["기업부설연구소 세무조사", "R&D 환수"], "cta": "사후관리 서비스 안내"},
    {"week": 4, "category": "디딤 다이어리", "subCategory": "대표의 생각", "title": "KAIST → CIPO → 변리사, 디딤을 만든 이유", "keywords": ["특허그룹디딤"], "cta": "없음"},
    {"week": 5, "category": "현장 수첩", "subCategory": "절세 시뮬레이션", "title": "대표이사에게 보상금, 가능한가요? (가능합니다)", "keywords": ["대표이사 직무발명보상금"], "cta": "절세 시뮬레이션 무료 신청"},
    {"week": 6, "category": "IP 라운지", "subCategory": "AI와 IP", "title": "ChatGPT로 만든 로고, 상표등록 될까?", "keywords": ["AI 상표등록"], "cta": "이웃 추가"},
    {"week": 7, "category": "현장 수첩", "subCategory": "인증 가이드", "title": "벤처인증 3번 떨어진 회사, 4번째에 성공한 비결", "keywords": ["벤처기업인증 방법", "벤처인증 혁신성장"], "cta": "인증 요건 무료 진단"},
    {"week": 8, "category": "디딤 다이어리", "subCategory": "컨설팅 후기", "title": "이번 달 벤처인증 3건 완료 — 세 회사 세 가지 다른 전략", "keywords": ["벤처인증 컨설팅"], "cta": "없음"},
    {"week": 9, "category": "현장 수첩", "subCategory": "절세 시뮬레이션", "title": "상여금으로 줬으면 6,600만원 더 나갔습니다", "keywords": ["직무발명보상금 vs 상여금", "보상금 절세"], "cta": "절세 시뮬레이션 무료 신청"},
    {"week": 10, "category": "IP 라운지", "subCategory": "IP 뉴스 한 입", "title": "직무발명보상 5만원 줬다가 2조 소송당한 회사", "keywords": ["직무발명 소송", "보상규정"], "cta": "이웃 추가"},
    {"week": 11, "category": "현장 수첩", "subCategory": "인증 가이드", "title": "직원 2명이면 연구소 됩니다 — 설립한 대표님 후기", "keywords": ["기업부설연구소 설립 방법", "연구소 설립 요건"], "cta": "설립 요건 무료 진단"},
    {"week": 12, "category": "디딤 다이어리", "subCategory": "디딤 일상", "title": "변리사가 서울대 AI 과정을 듣는 이유", "keywords": ["변리사 AI"], "cta": "없음"},
]

# schedule-data.ts:95
DEFAULT_BLOG_START_DATE = "2026-01-06"

# 2차 분류 이름 → (1차 ID, 2차 ID). 이름이 정본(네이버 문자열). ID 는 sub-category-pool.ts 기준.
# (seed.sql·PROMPT_BRIEFING_GENERATE 는 CAT-B-01/02 를 반대로 정의 — references/recommendation-rules.md 주의 참조)
SUB_NAME_TO_IDS = {s["name"]: (s["parentId"], s["id"]) for s in SUB_CATEGORY_POOL}
SUB_NAME_TO_IDS["연구소 운영"] = ("CAT-A", "CAT-A-03")  # schedule-data.ts W3 표기
PRIMARY_NAME_TO_ID = {
    "변리사의 현장 수첩": "CAT-A", "현장 수첩": "CAT-A",
    "IP 라운지": "CAT-B", "디딤 다이어리": "CAT-C",
}

# ─────────────────────────────────────────────────────────────
# 난수 (mulberry32) — Math.random 대체
# ─────────────────────────────────────────────────────────────


class Mulberry32:
    def __init__(self, seed: int):
        self.a = seed & 0xFFFFFFFF

    def random(self) -> float:
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def rand_index(rng: Mulberry32, n: int) -> int:
    """Math.floor(Math.random() * n)"""
    return int(math.floor(rng.random() * n))


def shuffle(arr, rng):
    """Fisher-Yates 셔플 (recommendations.ts:843) — 원본 불변"""
    out = list(arr)
    for i in range(len(out) - 1, 0, -1):
        j = int(math.floor(rng.random() * (i + 1)))
        out[i], out[j] = out[j], out[i]
    return out


# ─────────────────────────────────────────────────────────────
# 날짜 유틸
# ─────────────────────────────────────────────────────────────


def parse_dt(value, default_tz=KST):
    """ISO 문자열 → aware datetime. 날짜만 있으면 KST 00:00. RFC822(RSS pubDate)도 허용."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=default_tz)
    s = str(value).strip()
    try:
        if len(s) == 10 and s[4] == "-":
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=default_tz)
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=default_tz)
    except ValueError:
        pass
    from email.utils import parsedate_to_datetime
    try:
        dt = parsedate_to_datetime(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=default_tz)
    except (TypeError, ValueError):
        return None


def get_current_week(now: datetime, start_date_str: str = DEFAULT_BLOG_START_DATE) -> int:
    """schedule-data.ts:100 — new Date('YYYY-MM-DD') 는 UTC 자정으로 해석된다."""
    start = datetime.strptime(start_date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    diff_days = (now - start).total_seconds() / 86400
    return math.ceil(diff_days / 7)


def get_month_weeks(current_week: int):
    """schedule-data.ts:112"""
    month_index = math.ceil(current_week / 4)
    start = (month_index - 1) * 4 + 1
    return [w for w in (start, start + 1, start + 2, start + 3) if w <= 12]


# ─────────────────────────────────────────────────────────────
# recommendation-engine.ts 포팅
# ─────────────────────────────────────────────────────────────


def get_primary_category_id(category_id: str) -> str:
    """recommendation-engine.ts:92"""
    if category_id in ("CAT-A", "CAT-B", "CAT-C"):
        return category_id
    parts = category_id.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return category_id


def calc_monthly_stats(category_ids):
    """recommendation-engine.ts:102"""
    stats = {"field": 0, "lounge": 0, "diary": 0}
    for cid in category_ids:
        primary = get_primary_category_id(cid or "")
        if primary == "CAT-A":
            stats["field"] += 1
        elif primary == "CAT-B":
            stats["lounge"] += 1
        elif primary == "CAT-C":
            stats["diary"] += 1
    return stats


def determine_needed_category(stats, last_published_category_id):
    """recommendation-engine.ts:58 — 2:1:1 부족분이 큰 순, 전주와 같으면 차순위."""
    gaps = [
        {"categoryId": "CAT-A", "gap": MONTHLY_TARGETS["CAT-A"] - stats["field"]},
        {"categoryId": "CAT-B", "gap": MONTHLY_TARGETS["CAT-B"] - stats["lounge"]},
        {"categoryId": "CAT-C", "gap": MONTHLY_TARGETS["CAT-C"] - stats["diary"]},
    ]
    gaps = sorted([g for g in gaps if g["gap"] > 0], key=lambda g: -g["gap"])  # stable
    if not gaps:
        return {"categoryId": "CAT-A", "categoryName": CATEGORY_NAMES["CAT-A"], "gaps": []}
    if gaps[0]["categoryId"] == last_published_category_id and len(gaps) > 1:
        nxt = gaps[1]
        return {"categoryId": nxt["categoryId"], "categoryName": CATEGORY_NAMES[nxt["categoryId"]], "gaps": gaps}
    return {"categoryId": gaps[0]["categoryId"], "categoryName": CATEGORY_NAMES[gaps[0]["categoryId"]], "gaps": gaps}


def suggest_diary_sub(rng):
    """recommendation-engine.ts:125"""
    return DIARY_SUBS[rand_index(rng, len(DIARY_SUBS))]


def generate_title_suggestion(keyword: str, rng) -> str:
    """recommendation-engine.ts:131"""
    templates = [
        f"{keyword} — 실무에서 꼭 알아야 할 핵심 정리",
        f"{keyword}, 대표님이 직접 확인해야 하는 이유",
        f"{keyword} 완벽 가이드 (2026년 최신)",
    ]
    return templates[rand_index(rng, len(templates))]


_TAG_RE = re.compile(r"<[^>]*>")


def validate_news_relevance(article_title: str, search_keyword: str):
    """recommendation-engine.ts:195"""
    title = _TAG_RE.sub("", article_title).lower()
    search_kw = search_keyword.lower()
    negative = [kw for kw in DOMAIN_NEGATIVE_KEYWORDS if kw.lower() in title]
    if negative:
        return {"isRelevant": False, "score": -1, "positiveMatches": [], "negativeMatches": negative,
                "reason": f"무관 분야 키워드 감지: {', '.join(negative)}"}
    positive = [kw for kw in DOMAIN_POSITIVE_KEYWORDS if kw.lower() in title]
    in_title = search_kw in title
    score = len(positive) * 10 + (20 if in_title else 0)
    is_relevant = score >= 10
    if not is_relevant:
        reason = "제목에 디딤 도메인 관련 키워드가 없습니다"
    elif in_title:
        reason = f"검색 키워드 '{search_keyword}' 제목 포함, 관련 키워드: {', '.join(positive) or '없음'}"
    else:
        reason = f"관련 키워드 감지: {', '.join(positive)}"
    return {"isRelevant": is_relevant, "score": score, "positiveMatches": positive,
            "negativeMatches": negative, "reason": reason}


def generate_news_recommendation_reason(matched_keywords):
    """recommendation-engine.ts:304"""
    for keyword in matched_keywords:
        for watch_key, info in KEYWORD_REASON_MAP.items():
            if watch_key in keyword or keyword in watch_key:
                return {"relevanceReason": info["reason"], "targetAudience": info["audience"],
                        "suggestedAngle": info["angle"]}
    return {
        "relevanceReason": "IP 업계 동향으로, 디딤 블로그 독자에게 유용한 정보",
        "targetAudience": "중소기업 대표 및 경영지원 담당자",
        "suggestedAngle": "이 이슈가 중소기업에 미치는 실질적 영향 분석",
    }


# ─────────────────────────────────────────────────────────────
# news-search.ts 포팅 (규칙 부분)
# ─────────────────────────────────────────────────────────────


def decode_html_entities(text: str) -> str:
    """news-search.ts:556"""
    return (text.replace("&quot;", '"').replace("&amp;", "&").replace("&lt;", "<")
            .replace("&gt;", ">").replace("&#39;", "'").replace("<b>", "").replace("</b>", ""))


def is_excluded_content(title: str) -> bool:
    """news-search.ts:576"""
    t = title.lower()
    return any(p.lower() in t for p in EXCLUDE_PATTERNS)


def is_relevant_news_fallback(title: str, description: str, search_keyword: str) -> bool:
    """news-search.ts:582"""
    text = re.sub(r"</?b>", "", title + " " + (description or ""))
    parts = [w for w in re.split(r"\s+", search_keyword) if len(w) >= 2]
    return any(p in text for p in parts)


# ─────────────────────────────────────────────────────────────
# recommendations.ts 포팅 — 필터
# ─────────────────────────────────────────────────────────────


def _norm_nospace(s: str) -> str:
    return re.sub(r"\s+", "", (s or "")).lower()


class RecoFilters:
    """recommendations.ts:809 — avoid(soft) / rejected(hard) / blacklist(hard)
    + 스킬 추가: covered(soft) — 발행 이력에 이미 있는 키워드·제목(공백 무시 포함 비교)."""

    def __init__(self):
        self.avoid = set()
        self.rejected = set()
        self.blacklist = set()
        self.covered_texts = []  # 스킬 추가 (원본 keyword_pool.covered_content_id 대체)

    def copy(self):
        f = RecoFilters()
        f.avoid = set(self.avoid)
        f.rejected = set(self.rejected)
        f.blacklist = set(self.blacklist)
        f.covered_texts = list(self.covered_texts)
        return f


def contains_any(text: str, s) -> bool:
    """recommendations.ts:823"""
    if not s:
        return False
    lower = text.lower()
    return any(k and k in lower for k in s)


def is_hard_blocked(text: str, f: RecoFilters) -> bool:
    """recommendations.ts:833"""
    return contains_any(text, f.blacklist) or contains_any(text, f.rejected)


def is_covered(text: str, f: RecoFilters) -> bool:
    """스킬 추가: 후보 텍스트(공백 제거)가 발행 이력 제목/키워드(공백 제거)에 포함되면 '이미 다룸'."""
    n = _norm_nospace(text)
    if not n:
        return False
    return any(n in c for c in f.covered_texts)


def is_soft_avoided(text: str, f: RecoFilters) -> bool:
    """recommendations.ts:838 (+ 스킬 추가 covered)"""
    return contains_any(text, f.avoid) or is_covered(text, f)


def extract_rejection_keywords(topic: str, keywords) -> list:
    """recommendations.ts:1458-1477 — 부적합 처리 시 저장할 rejection_keywords."""
    kws = []
    seen = set()

    def add(k):
        if k not in seen:
            seen.add(k)
            kws.append(k)

    for k in keywords or []:
        if k and k.strip():
            add(k.strip())
    for chunk in re.split(r"\s+", topic or ""):
        # JS: chunk.replace(/[^\w가-힣]/g, "") — \w 는 ASCII [A-Za-z0-9_]
        cleaned = re.sub(r"[^A-Za-z0-9_가-힣]", "", chunk)
        if len(cleaned) >= 4 and not re.fullmatch(r"[0-9]+", cleaned) and cleaned not in TITLE_STOPWORDS:
            add(cleaned)
    return kws[:8]


def load_reco_filters(data, now: datetime, exclude=None) -> RecoFilters:
    """recommendations.ts:756 getRejectedKeywordStats + 858 getRecentlyShownTopics + 889 loadRecoFilters"""
    f = RecoFilters()
    # 1) 부적합 이력 (30일)
    since_rej = now - timedelta(days=REJECT_LOOKBACK_DAYS)
    counts = {}
    for row in data.get("rejected", []) or []:
        dt = parse_dt(row.get("date") or row.get("created_at"))
        if dt is not None and dt < since_rej:
            continue
        kws = row.get("rejection_keywords") or row.get("keywords_extracted")
        if kws is None:
            kws = extract_rejection_keywords(row.get("title", ""), row.get("keywords"))
        for k in kws:
            norm = (k or "").strip().lower()
            if not norm:
                continue
            counts[norm] = counts.get(norm, 0) + 1
    f.rejected = set(counts.keys())
    f.blacklist = {k for k, c in counts.items() if c >= BLACKLIST_REJECT_COUNT}
    # 2) 최근 48시간 노출
    since_shown = now - timedelta(hours=RECENT_SHOWN_WINDOW_HOURS)
    # 원본 getRecentlyShownTopics 는 status 무관 — 48시간 내 부적합 처리한 추천도 노출 이력에 포함된다.
    for row in (data.get("recently_shown", []) or []) + (data.get("rejected", []) or []):
        dt = parse_dt(row.get("date") or row.get("created_at"))
        if dt is not None and dt < since_shown:
            continue
        topic = (row.get("title") or row.get("recommended_topic") or "").strip().lower()
        if topic:
            f.avoid.add(topic)
        for k in row.get("keywords") or row.get("recommended_keywords") or []:
            nk = (k or "").strip().lower()
            if nk:
                f.avoid.add(nk)
    # 3) 명시 제외 (UUID 아닌 값 = 제목 폴백 → avoid)
    for i in exclude or []:
        if i and not UUID_RE.match(i):
            f.avoid.add(i.strip().lower())
    # 4) 스킬 추가: 발행 이력 커버리지
    if data.get("use_history_coverage", True):
        for h in data.get("history", []) or []:
            for t in [h.get("title", "")] + _as_list(h.get("keyword")) + _as_list(h.get("keywords")):
                n = _norm_nospace(t)
                if n:
                    f.covered_texts.append(n)
    return f


def _as_list(v):
    if v is None:
        return []
    if isinstance(v, list):
        return [x for x in v if x]
    return [x.strip() for x in str(v).split(",") if x.strip()]


# ─────────────────────────────────────────────────────────────
# recommendations.ts 포팅 — 카드 빌더
# ─────────────────────────────────────────────────────────────


def get_sub_categories_for(parent_id):
    return [s for s in SUB_CATEGORY_POOL if s["parentId"] == parent_id]


def get_sub_category_meta(sub_id):
    for s in SUB_CATEGORY_POOL:
        if s["id"] == sub_id:
            return s
    return None


def pick_sub_category_keyword(parent_id, filters, exclude_keywords, exclude_sub_ids, rng):
    """recommendations.ts:1236"""
    all_subs = [s for s in get_sub_categories_for(parent_id) if len(s["keywords"]) > 0]
    if not all_subs:
        return None
    fresh = [s for s in all_subs if s["id"] not in exclude_sub_ids]
    order = shuffle(fresh if fresh else all_subs, rng)
    for sub in order:
        hard = [k for k in sub["keywords"] if k.lower() not in exclude_keywords and not is_hard_blocked(k, filters)]
        soft = [k for k in hard if not is_soft_avoided(k, filters)]
        pool = soft if soft else hard
        if not pool:
            continue
        keyword = pool[rand_index(rng, len(pool))]
        return {"sub": sub, "keyword": keyword}
    return None


def build_sub_category_keyword_card(parent_id, filters, exclude_keywords, exclude_sub_ids, rng):
    """recommendations.ts:1265"""
    picked = pick_sub_category_keyword(parent_id, filters, exclude_keywords, exclude_sub_ids, rng)
    if not picked:
        return None
    sub, keyword = picked["sub"], picked["keyword"]
    return {
        "priority": "PRIMARY",
        "category": CATEGORY_NAMES[parent_id],
        "categoryId": parent_id,
        "subCategory": sub["name"],
        "subCategoryId": sub["id"],
        "title": generate_title_suggestion(keyword, rng),
        "reason": f"{sub['name']} — '{keyword}' 키워드 기반 추천",
        "keywords": [keyword],
        "source": "keyword_pool",
    }


def build_diary_topic_card(filters, exclude_titles, rng):
    """recommendations.ts:1301"""
    usable = [t for t in DIARY_TOPIC_POOL
              if t["title"] not in exclude_titles and not is_hard_blocked(t["title"], filters)
              and not any(is_hard_blocked(k, filters) for k in t["keywords"])]
    preferred = [t for t in usable
                 if not is_soft_avoided(t["title"], filters)
                 and not any(is_soft_avoided(k, filters) for k in t["keywords"])]
    pool = preferred if preferred else usable
    if not pool:
        return None
    picked = pool[rand_index(rng, len(pool))]
    meta = get_sub_category_meta(picked["subCategoryId"])
    return {
        "priority": "PRIMARY",
        "category": "디딤 다이어리",
        "categoryId": "CAT-C",
        "subCategory": meta["name"] if meta else picked["subCategoryId"],
        "subCategoryId": picked["subCategoryId"],
        "title": picked["title"],
        "reason": f"디딤 다이어리 — {meta['name'] if meta else ''} 주제 풀에서 샘플링",
        "keywords": list(picked["keywords"]),
        "source": "schedule",  # 원본도 'schedule' 로 저장 (recommendations.ts:1331)
        "origin": "diary_topic_pool",
    }


def schedule_category_to_id(category):
    """recommendations.ts:1118"""
    if category in ("변리사의 현장 수첩", "현장 수첩"):
        return "CAT-A"
    if category == "IP 라운지":
        return "CAT-B"
    return "CAT-C"


def build_schedule_card(filters, category_id, exclude_titles, current_week, rng):
    """recommendations.ts:1124"""
    pool = [it for it in SCHEDULE_DATA if current_week <= it["week"] <= current_week + 1]
    if category_id:
        pool = [it for it in pool if schedule_category_to_id(it["category"]) == category_id]
    if not pool:
        pool = ([it for it in SCHEDULE_DATA if schedule_category_to_id(it["category"]) == category_id]
                if category_id else list(SCHEDULE_DATA))
    if not pool:
        return None
    usable = [it for it in pool
              if it["title"] not in exclude_titles and not is_hard_blocked(it["title"], filters)
              and not any(is_hard_blocked(k, filters) for k in it["keywords"])]
    preferred = [it for it in usable
                 if not is_soft_avoided(it["title"], filters)
                 and not any(is_soft_avoided(k, filters) for k in it["keywords"])]
    final_pool = preferred if preferred else usable
    if not final_pool:
        return None
    item = final_pool[rand_index(rng, len(final_pool))]
    return {
        "priority": "PRIMARY",
        "category": item["category"],
        "categoryId": schedule_category_to_id(item["category"]),
        "subCategory": item["subCategory"],
        "title": item["title"],
        "reason": f"12주 발행 스케줄 W{item['week']} — {item['subCategory']}",
        "keywords": list(item["keywords"]),
        "source": "schedule",
        "scheduleWeek": item["week"],
        "scheduleCta": item["cta"],
    }


def build_news_card(filters, news_items, now, rng):
    """recommendations.ts:1056 — news_items: 최근 7일, is_used=false, created_at 내림차순 15건."""
    since = now - timedelta(days=7)
    items = []
    for it in news_items or []:
        if it.get("is_used"):
            continue
        dt = parse_dt(it.get("created_at") or it.get("pub_date") or it.get("pubDate"))
        if dt is None or dt < since:
            continue
        items.append((dt, it))
    items.sort(key=lambda x: x[0], reverse=True)  # stable
    items = [it for _, it in items[:15]]
    usable = [it for it in items
              if not is_hard_blocked(it["title"], filters)
              and not is_hard_blocked(it.get("search_keyword") or "", filters)]
    preferred = [it for it in usable
                 if not is_soft_avoided(it["title"], filters)
                 and not is_soft_avoided(it.get("search_keyword") or "", filters)]
    pool = shuffle(preferred if preferred else usable, rng)
    if not pool:
        return None
    item = pool[0]
    clean_title = re.sub(r"</?b>", "", item["title"])
    reason = item.get("blog_angle") or item.get("ai_summary") or f"최근 7일 뉴스 — 검색 키워드: {item.get('search_keyword')}"
    rec = {
        "priority": "URGENT",
        "category": "IP 라운지",
        "categoryId": "CAT-B",
        "subCategory": "IP 뉴스 한 입",
        "subCategoryId": "CAT-B-03",
        "title": clean_title,
        "reason": reason,
        "keywords": [item.get("search_keyword")],
        "newsUrl": item.get("link"),
        "source": "news_api",
    }
    if item.get("ai_summary"):
        rec["relevanceReason"] = item["ai_summary"]
    if item.get("blog_angle"):
        rec["suggestedAngle"] = item["blog_angle"]
    return rec


def get_category_recommendations(category_id, base_filters, news_items, current_week, now, rng, preferred_sub_id=None):
    """recommendations.ts:1349 — 카테고리별 카드 (A:2, B:2, C:1)."""
    cards = []
    filters = base_filters.copy()
    max_cards = CARDS_PER_CATEGORY[category_id]
    if preferred_sub_id:
        filters.avoid.add(preferred_sub_id.lower())
    used_titles = set()
    used_keywords = set()
    used_sub_ids = {preferred_sub_id} if preferred_sub_id else set()

    def add_if_new(rec):
        if not rec:
            return False
        if rec["title"] in used_titles:
            return False
        cards.append(rec)
        used_titles.add(rec["title"])
        for k in rec.get("keywords") or []:
            used_keywords.add((k or "").lower())
        if rec.get("subCategoryId"):
            used_sub_ids.add(rec["subCategoryId"])
        filters.avoid.add(rec["title"].lower())
        for k in rec.get("keywords") or []:
            filters.avoid.add((k or "").lower())
        return True

    if category_id == "CAT-A":
        while len(cards) < max_cards:
            kw = build_sub_category_keyword_card("CAT-A", filters, used_keywords, used_sub_ids, rng)
            if not add_if_new(kw):
                break
        if len(cards) < max_cards:
            add_if_new(build_schedule_card(filters, "CAT-A", used_titles, current_week, rng))
    elif category_id == "CAT-B":
        if len(cards) < max_cards:
            news = build_news_card(filters, news_items, now, rng)
            if news and news["categoryId"] == "CAT-B":
                add_if_new(news)
        if len(cards) < max_cards:
            add_if_new(build_sub_category_keyword_card("CAT-B", filters, used_keywords, used_sub_ids, rng))
        if len(cards) < max_cards:
            add_if_new(build_schedule_card(filters, "CAT-B", used_titles, current_week, rng))
    elif category_id == "CAT-C":
        if len(cards) < max_cards:
            add_if_new(build_diary_topic_card(filters, used_titles, rng))
        if len(cards) < max_cards:
            add_if_new(build_schedule_card(filters, "CAT-C", used_titles, current_week, rng))
    return cards



def pick_weighted_keyword(category_id, keyword_pool, filters, rng):
    """recommendations.ts:905 — HIGH 50 / MEDIUM 30 / LOW 20 (keyword_pool 입력이 있을 때만)."""
    roll = rng.random()
    if roll < 0.5:
        try_order = ["HIGH", "MEDIUM", "LOW"]
    elif roll < 0.8:
        try_order = ["MEDIUM", "HIGH", "LOW"]
    else:
        try_order = ["LOW", "MEDIUM", "HIGH"]
    for priority in try_order:
        data = [k for k in keyword_pool
                if k.get("category_id") == category_id and k.get("priority", "MEDIUM") == priority
                and not k.get("covered") and not k.get("covered_content_id")][:30]
        hard = [k for k in data if not is_hard_blocked(k["keyword"], filters)]
        soft = [k for k in hard if not is_soft_avoided(k["keyword"], filters)]
        pool = soft if soft else hard
        if pool:
            return pool[rand_index(rng, len(pool))]
    return None


def build_keyword_card(filters, keyword_pool, rng):
    """recommendations.ts:1024 — CAT-A 우선 → CAT-B 폴백."""
    for cat_id in ("CAT-A", "CAT-B"):
        kw = pick_weighted_keyword(cat_id, keyword_pool, filters, rng)
        if not kw:
            continue
        sub_id = kw.get("sub_category_id")
        meta = get_sub_category_meta(sub_id) if sub_id else None
        return {
            "priority": "PRIMARY",
            "category": CATEGORY_NAMES[cat_id],
            "categoryId": cat_id,
            "subCategoryId": sub_id,
            "subCategory": meta["name"] if meta else kw.get("sub_category"),
            "title": generate_title_suggestion(kw["keyword"], rng),
            "reason": f"키워드 풀에서 자동 추출 — {kw.get('priority', 'MEDIUM')} 가중치 / 미발행 / 랜덤 샘플링",
            "keywords": [kw["keyword"]],
            "source": "keyword_pool",
        }
    return None


def build_followup_card(category_id, history):
    """recommendations.ts:215-265 — 성과 기반 후속편. 점수 = 조회수 + 상담건수×500.
    원본은 조회수 상위 10건을 먼저 자른 뒤 카테고리로 거른다."""
    posts = [h for h in history if h.get("views") is not None]
    posts.sort(key=lambda h: -(h.get("views") or 0))
    posts = posts[:10]
    cat_posts = []
    for p in posts:
        if get_primary_category_id(p.get("category_id") or "") != category_id:
            continue
        leads = int(p.get("leads") or 0)
        cat_posts.append((p, (p.get("views") or 0) + leads * 500, leads))
    cat_posts.sort(key=lambda x: -x[1])
    if not cat_posts:
        return None
    post, _, leads = cat_posts[0]
    keyword = post.get("keyword") or post.get("title") or ""
    if isinstance(keyword, list):
        keyword = keyword[0] if keyword else ""
    consult = f", 상담 {leads}건 유입" if leads > 0 else ""
    return {
        "priority": "SECONDARY",
        "category": CATEGORY_NAMES[category_id],
        "categoryId": category_id,
        "title": f"\"{post.get('title')}\" 후속편",
        "reason": f"원글 조회수 {int(post.get('views') or 0):,}회{consult} — 후속편 추천",
        "keywords": [keyword] if keyword else None,
        "source": "performance",
        "sourcePostUrl": post.get("url"),
    }


# ─────────────────────────────────────────────────────────────
# 발행 이력 정규화
# ─────────────────────────────────────────────────────────────


def normalize_history_item(h):
    """이력 1건의 category_id / sub_category_id 를 이름에서 보완."""
    item = dict(h)
    sub_name = (item.get("sub_category") or item.get("subCategory") or "").replace(" ", " ").strip()
    cat_name = (item.get("category") or "").replace(" ", " ").strip()
    if sub_name:
        item["sub_category"] = sub_name
    if cat_name:
        item["category"] = cat_name
    if not item.get("sub_category_id") and sub_name in SUB_NAME_TO_IDS:
        item["sub_category_id"] = SUB_NAME_TO_IDS[sub_name][1]
    if not item.get("category_id"):
        if cat_name in PRIMARY_NAME_TO_ID:
            item["category_id"] = PRIMARY_NAME_TO_ID[cat_name]
        elif sub_name in SUB_NAME_TO_IDS:
            item["category_id"] = SUB_NAME_TO_IDS[sub_name][0]
        elif item.get("sub_category_id"):
            item["category_id"] = get_primary_category_id(item["sub_category_id"])
    return item


def display_names(rec):
    """표 출력용 이름 정규화(네이버 문자열과 일치): '현장 수첩'→'변리사의 현장 수첩', '연구소 운영'→'연구소 운영 실무'."""
    cat = CATEGORY_NAMES.get(rec.get("categoryId"), rec.get("category"))
    sub = rec.get("subCategory") or ""
    if sub == "연구소 운영":
        sub = "연구소 운영 실무"
    sub_id = rec.get("subCategoryId") or (SUB_NAME_TO_IDS.get(sub, (None, None))[1] if sub else None)
    return cat, sub, sub_id


# ─────────────────────────────────────────────────────────────
# plan
# ─────────────────────────────────────────────────────────────

SOURCE_LABEL = {"keyword_pool": "키워드 풀", "news_api": "뉴스", "schedule": "스케줄",
                "manual": "수동", "performance": "성과(후속편)"}
PRIORITY_ORDER = {"URGENT": 0, "PRIMARY": 1, "SECONDARY": 2}


def run_plan(data, seed=None, verify_mode=False):
    now = parse_dt(data.get("now")) or datetime.now(KST)
    if seed is None:
        seed = data.get("seed")
    if seed is None:
        seed = int(time.time() * 1000) & 0xFFFFFFFF
    rng = Mulberry32(int(seed))

    history = [normalize_history_item(h) for h in data.get("history", []) or []]
    data = dict(data)
    data["history"] = history
    start_date = data.get("blog_start_date") or DEFAULT_BLOG_START_DATE
    current_week = get_current_week(now, start_date)

    # 1) 월간 통계 (이번 달 1일 KST 이후 발행)
    first_day = now.astimezone(KST).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    this_month = [h for h in history if (parse_dt(h.get("date")) or datetime.min.replace(tzinfo=KST)) >= first_day]
    stats = calc_monthly_stats([h.get("category_id") for h in this_month])
    progress = [
        {"categoryId": "CAT-A", "categoryName": CATEGORY_NAMES["CAT-A"], "published": stats["field"], "target": 2},
        {"categoryId": "CAT-B", "categoryName": CATEGORY_NAMES["CAT-B"], "published": stats["lounge"], "target": 1},
        {"categoryId": "CAT-C", "categoryName": CATEGORY_NAMES["CAT-C"], "published": stats["diary"], "target": 1},
    ]

    # 2) 직전 발행 카테고리
    dated = [(parse_dt(h.get("date")), h) for h in history if parse_dt(h.get("date"))]
    dated.sort(key=lambda x: x[0], reverse=True)
    last = dated[0][1] if dated else None
    last_cat = get_primary_category_id(last["category_id"]) if last and last.get("category_id") else None
    needed = determine_needed_category(stats, last_cat)
    warnings = []
    if last_cat and needed["categoryId"] == last_cat:
        warnings.append(f"직전 발행 글과 같은 카테고리({CATEGORY_NAMES[last_cat]})가 이번 주 메인입니다 — "
                        "연속 2주 같은 카테고리가 되지 않도록 다른 카테고리 후보를 검토하세요.")
    if len(dated) >= 2:
        c0 = get_primary_category_id(dated[0][1].get("category_id") or "")
        c1 = get_primary_category_id(dated[1][1].get("category_id") or "")
        if c0 and c0 == c1:
            warnings.append(f"최근 2건이 연속으로 {CATEGORY_NAMES.get(c0, c0)}입니다.")
    unmapped = [h.get("title") for h in history if not h.get("category_id")]
    if unmapped:
        warnings.append(f"카테고리를 알 수 없는 이력 {len(unmapped)}건(통계 제외): " + " / ".join(unmapped[:5]))

    # 3) 필터
    filters = load_reco_filters(data, now, data.get("exclude"))

    # 4) 2차 분류 로테이션 기준 (명시값 > 스킬 기본: 해당 카테고리 최근 발행 2차 분류)
    preferred = dict(data.get("preferred_sub") or {})
    if data.get("rotate_from_history", True):
        for cat in ("CAT-A", "CAT-B"):
            if cat in preferred:
                continue
            for _, h in dated:
                if get_primary_category_id(h.get("category_id") or "") == cat and h.get("sub_category_id"):
                    preferred[cat] = h["sub_category_id"]
                    break

    # 5) 카테고리별 카드 (원본 순서 A → B → C)
    cards = {}
    for cat in ("CAT-A", "CAT-B", "CAT-C"):
        cards[cat] = get_category_recommendations(cat, filters, data.get("news_items"), current_week, now, rng,
                                                  preferred.get(cat))

    result = {
        "now": now.isoformat(),
        "seed": int(seed),
        "current_week": current_week,
        "month_weeks": get_month_weeks(current_week),
        "schedule_in_range": current_week <= 12,
        "monthly_progress": progress,
        "last_published": ({"date": last.get("date"), "title": last.get("title"), "category_id": last.get("category_id"),
                            "sub_category": last.get("sub_category")} if last else None),
        "needed_category": {"categoryId": needed["categoryId"], "categoryName": needed["categoryName"]},
        "warnings": warnings,
        "filters": {"rejected": sorted(filters.rejected), "blacklist": sorted(filters.blacklist),
                    "avoid_count": len(filters.avoid), "covered_count": len(filters.covered_texts),
                    "preferred_sub": preferred},
        "cards": cards,
    }
    if verify_mode:
        return result

    # 6) 선택 소스
    extras = []
    if data.get("keyword_pool"):
        kc = build_keyword_card(filters, data["keyword_pool"], rng)
        if kc:
            extras.append(kc)
    if any(h.get("views") is not None for h in history):
        fc = build_followup_card(needed["categoryId"], history)
        if fc:
            extras.append(fc)
    for m in data.get("manual_topics") or []:
        cid = m.get("category_id") or PRIMARY_NAME_TO_ID.get(m.get("category", ""), "CAT-A")
        extras.append({"priority": m.get("priority", "PRIMARY"), "category": CATEGORY_NAMES.get(cid, m.get("category")),
                       "categoryId": cid, "subCategory": m.get("sub_category"), "title": m.get("title", ""),
                       "reason": m.get("reason", "사용자 지정 주제"), "keywords": _as_list(m.get("keywords")),
                       "source": "manual"})
    result["extras"] = extras
    if data.get("grant_items"):
        result["grant_items_note"] = (f"지원사업 공고 {len(data['grant_items'])}건 입력됨 — 신규 선택 입력. "
                                      "references/grant-source-draft.md 규칙으로 Claude 가 직접 주제화한다(스크립트 미판정).")

    # 7) 표 (표시 우선순위: URGENT 유지, 이번 주 필요 카테고리=PRIMARY, 그 외=SECONDARY)
    rows = []
    all_cards = [c for cat in ("CAT-A", "CAT-B", "CAT-C") for c in cards[cat]] + extras
    for c in all_cards:
        cat, sub, sub_id = display_names(c)
        if c["priority"] == "URGENT":
            disp = "URGENT"
        elif c.get("source") == "manual":
            disp = c["priority"]
        elif c["categoryId"] == needed["categoryId"] and c["priority"] == "PRIMARY":
            disp = "PRIMARY"
        else:
            disp = "SECONDARY"
        rows.append({"priority": disp, "category": cat, "categoryId": c["categoryId"], "subCategory": sub,
                     "subCategoryId": sub_id, "title": c["title"], "keywords": [k for k in (c.get("keywords") or []) if k],
                     "source": c.get("source"),
                     "sourceLabel": ("스케줄(다이어리 주제 풀)" if c.get("origin") == "diary_topic_pool"
                                     else SOURCE_LABEL.get(c.get("source"), c.get("source"))),
                     "reason": c.get("reason"), "newsUrl": c.get("newsUrl")})
    rows.sort(key=lambda r: (PRIORITY_ORDER.get(r["priority"], 9), 0 if r["categoryId"] == needed["categoryId"] else 1))
    if rows:
        for r in rows:
            if r["categoryId"] == needed["categoryId"] and r["priority"] in ("URGENT", "PRIMARY"):
                r["main"] = True
                break
    result["table"] = rows
    result["news_search_plan"] = {
        "urgent_keywords_pick3": shuffle(URGENT_NEWS_KEYWORDS, rng)[:3],
        "fixed_keywords": FIXED_KEYWORDS,
        "sub_category_news_keywords": {s["id"]: s["newsKeywords"] for s in SUB_CATEGORY_POOL if s.get("newsKeywords")},
    }
    return result


def to_markdown(result):
    lines = []
    prog = " · ".join(f"{p['categoryName']} {p['published']}/{p['target']}" for p in result["monthly_progress"])
    lines.append(f"**월간 발행 현황**: {prog}  ")
    lines.append(f"**이번 주 필요 카테고리**: {result['needed_category']['categoryName']} "
                 f"(W{result['current_week']}{'' if result['schedule_in_range'] else ', 12주 스케줄 범위 밖'})")
    for w in result.get("warnings", []):
        lines.append(f"> 주의: {w}")
    lines.append("")
    lines.append("| # | 우선순위 | 카테고리 | 2차분류 | 제목안 | 타깃 키워드 | 근거 소스 |")
    lines.append("|---|---|---|---|---|---|---|")
    for i, r in enumerate(result.get("table", []), 1):
        mark = " (메인)" if r.get("main") else ""
        src = r["sourceLabel"] or ""
        if r.get("newsUrl"):
            src += f" [{r['newsUrl']}]"
        lines.append(f"| {i} | {r['priority']}{mark} | {r['category']} | {r['subCategory'] or '-'} | {r['title']} | "
                     f"{', '.join(r['keywords']) or '-'} | {src} — {r['reason']} |")
    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# news-check
# ─────────────────────────────────────────────────────────────


def run_news_check(data):
    """웹 검색 결과 → 비뉴스 제외(news-search.ts:576) → 관련성 점수(recommendation-engine.ts:195)
    → 3일 이내·관련=긴급 후보, 7일 이내=뉴스 카드 후보. 링크 중복 제거(news-search.ts:705-724)."""
    now = parse_dt(data.get("now")) or datetime.now(KST)
    seen = set(data.get("existing_links") or [])
    out = {"urgent_candidates": [], "candidates": [], "excluded": []}
    for a in data.get("articles") or []:
        title = decode_html_entities(a.get("title", ""))
        desc = decode_html_entities(a.get("description", "") or "")
        link = a.get("link", "")
        kw = a.get("keyword") or a.get("search_keyword") or ""
        if link in seen:
            out["excluded"].append({"title": title, "why": "중복 링크"})
            continue
        dt = parse_dt(a.get("pubDate") or a.get("pub_date"))
        if dt is not None and dt < now - timedelta(days=7):
            out["excluded"].append({"title": title, "why": "7일 초과"})
            continue
        if is_excluded_content(title):
            out["excluded"].append({"title": title, "why": "칼럼/인터뷰/광고 등 비뉴스"})
            continue
        seen.add(link)
        rel = validate_news_relevance(title, kw)
        item = {"title": title, "description": desc, "link": link, "search_keyword": kw,
                "pub_date": dt.isoformat() if dt else None, "created_at": now.isoformat(),
                "relevance": rel, "fallback_relevant": is_relevant_news_fallback(title, desc, kw)}
        out["candidates"].append(item)
        if rel["isRelevant"] and dt is not None and dt >= now - timedelta(days=3):
            reason = generate_news_recommendation_reason([kw])
            out["urgent_candidates"].append({**item, **reason})
    out["urgent_candidates"].sort(key=lambda x: -x["relevance"]["score"])  # stable
    return out


# ─────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────


def _load(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)


def _dump(obj):
    json.dump(obj, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")


def main(argv=None):
    p = argparse.ArgumentParser(
        description="디딤 블로그 주제 추천 엔진 (recommendations.ts 포팅). JSON 입출력.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "예)\n"
            "  python3 recommend.py plan input.json --seed 42 --format md\n"
            "  python3 recommend.py reject-keywords --title '연구노트 작성 완벽 가이드 (2026년 최신)' --keywords 연구노트 작성\n"
            "  python3 recommend.py news-check articles.json\n"
            "  python3 recommend.py week --now 2026-02-10\n"
            "입력 스키마는 references/history-input.md 참조."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("plan", help="이번 주 추천 생성")
    sp.add_argument("input", help="입력 JSON 경로 또는 '-'(stdin)")
    sp.add_argument("--seed", type=int, default=None, help="난수 시드(재현용)")
    sp.add_argument("--format", choices=["json", "md"], default="json")
    sp.add_argument("--verify", action="store_true", help="원본 비교용: 카테고리 카드까지만 출력")
    sr = sub.add_parser("reject-keywords", help="부적합 처리 시 rejection_keywords 추출")
    sr.add_argument("--title", required=True)
    sr.add_argument("--keywords", nargs="*", default=[])
    sn = sub.add_parser("news-check", help="검색 기사 규칙 필터")
    sn.add_argument("input", help="{now, articles:[{title,description,link,pubDate,keyword}], existing_links?}")
    sw = sub.add_parser("week", help="주차 계산")
    sw.add_argument("--now", default=None)
    sw.add_argument("--start", default=DEFAULT_BLOG_START_DATE)
    a = p.parse_args(argv)

    if a.cmd == "plan":
        data = _load(a.input)
        if isinstance(data, list):
            data = {"history": data}
        res = run_plan(data, a.seed, a.verify)
        if a.format == "md" and not a.verify:
            print(to_markdown(res))
        else:
            _dump(res)
    elif a.cmd == "reject-keywords":
        _dump({"rejection_keywords": extract_rejection_keywords(a.title, a.keywords)})
    elif a.cmd == "news-check":
        _dump(run_news_check(_load(a.input)))
    elif a.cmd == "week":
        now = parse_dt(a.now) or datetime.now(KST)
        w = get_current_week(now, a.start)
        _dump({"now": now.isoformat(), "blog_start_date": a.start, "current_week": w,
               "month_weeks": get_month_weeks(w), "schedule_in_range": w <= 12})


if __name__ == "__main__":
    main()
