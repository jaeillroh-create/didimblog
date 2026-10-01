# [폐기] 12주 발행 스케줄 (verbatim 기록)

> **결정 사항(skills/_DECISIONS.md §3, 2026-10-01): 12주 스케줄(2026-03-31 종료)은 폐기했다.** 대체 = 주 1편 + 4주 로테이션(지원사업·인증과 특허 → 출원·심판 실무 → 지식재산 경영 → 사례). 아래는 원본 코드와 두 버전 차이의 기록일 뿐이며 `recommend.py plan` 기본 모드는 쓰지 않는다(`--legacy`/`--verify` 에서만 사용). 스케줄 항목의 seed_data `target`·`legal_basis` 는 같은 주제를 다시 쓸 때 참고 자료로만 쓴다.

추천 엔진(`buildScheduleCard`)은 **schedule-data.ts** 를 읽는다. seed_data JSON 은 기획 원본이며 일부 문구가 다르다(아래 §4).

## 1. schedule-data.ts — 스케줄·주차 계산

원문: `src/lib/constants/schedule-data.ts:1-25`

```typescript
// 12주 콘텐츠 스케줄 데이터 (Phase 1)

export interface ScheduleItem {
  week: number;
  category: string;
  subCategory: string;
  title: string;
  keywords: string[];
  cta: string;
}

export const SCHEDULE_DATA: ScheduleItem[] = [
  { week: 1, category: "현장 수첩", subCategory: "절세 시뮬레이션", title: "법인세 2억 내던 대표님, 지금은 5천만원입니다", keywords: ["직무발명보상금 절세", "법인세 줄이는 방법"], cta: "절세 시뮬레이션 무료 신청" },
  { week: 2, category: "IP 라운지", subCategory: "특허 전략 노트", title: "특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼", keywords: ["스타트업 특허 전략", "벤처인증 특허"], cta: "이웃 추가" },
  { week: 3, category: "현장 수첩", subCategory: "연구소 운영", title: "연구소 세무조사 통지서 받고 전화 온 대표님", keywords: ["기업부설연구소 세무조사", "R&D 환수"], cta: "사후관리 서비스 안내" },
  { week: 4, category: "디딤 다이어리", subCategory: "대표의 생각", title: "KAIST → CIPO → 변리사, 디딤을 만든 이유", keywords: ["특허그룹디딤"], cta: "없음" },
  { week: 5, category: "현장 수첩", subCategory: "절세 시뮬레이션", title: "대표이사에게 보상금, 가능한가요? (가능합니다)", keywords: ["대표이사 직무발명보상금"], cta: "절세 시뮬레이션 무료 신청" },
  { week: 6, category: "IP 라운지", subCategory: "AI와 IP", title: "ChatGPT로 만든 로고, 상표등록 될까?", keywords: ["AI 상표등록"], cta: "이웃 추가" },
  { week: 7, category: "현장 수첩", subCategory: "인증 가이드", title: "벤처인증 3번 떨어진 회사, 4번째에 성공한 비결", keywords: ["벤처기업인증 방법", "벤처인증 혁신성장"], cta: "인증 요건 무료 진단" },
  { week: 8, category: "디딤 다이어리", subCategory: "컨설팅 후기", title: "이번 달 벤처인증 3건 완료 — 세 회사 세 가지 다른 전략", keywords: ["벤처인증 컨설팅"], cta: "없음" },
  { week: 9, category: "현장 수첩", subCategory: "절세 시뮬레이션", title: "상여금으로 줬으면 6,600만원 더 나갔습니다", keywords: ["직무발명보상금 vs 상여금", "보상금 절세"], cta: "절세 시뮬레이션 무료 신청" },
  { week: 10, category: "IP 라운지", subCategory: "IP 뉴스 한 입", title: "직무발명보상 5만원 줬다가 2조 소송당한 회사", keywords: ["직무발명 소송", "보상규정"], cta: "이웃 추가" },
  { week: 11, category: "현장 수첩", subCategory: "인증 가이드", title: "직원 2명이면 연구소 됩니다 — 설립한 대표님 후기", keywords: ["기업부설연구소 설립 방법", "연구소 설립 요건"], cta: "설립 요건 무료 진단" },
  { week: 12, category: "디딤 다이어리", subCategory: "디딤 일상", title: "변리사가 서울대 AI 과정을 듣는 이유", keywords: ["변리사 AI"], cta: "없음" },
];
```

원문: `src/lib/constants/schedule-data.ts:94-116`

```typescript
/** 기본 블로그 시작일 */
export const DEFAULT_BLOG_START_DATE = "2026-01-06";

/**
 * 현재 주차 계산 (블로그 시작일 기준)
 */
export function getCurrentWeek(startDateStr: string = DEFAULT_BLOG_START_DATE): number {
  const startDate = new Date(startDateStr);
  const today = new Date();
  const diffMs = today.getTime() - startDate.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return Math.ceil(diffDays / 7);
}

/**
 * 현재 주차가 속한 4주 묶음(=월) 가져오기
 * W1-W4 → month 1, W5-W8 → month 2, W9-W12 → month 3
 */
export function getMonthWeeks(currentWeek: number): number[] {
  const monthIndex = Math.ceil(currentWeek / 4);
  const start = (monthIndex - 1) * 4 + 1;
  return [start, start + 1, start + 2, start + 3].filter((w) => w <= 12);
}
```

## 2. seed_data/schedule_12weeks.json 전체

원문: `seed_data/schedule_12weeks.json`

```json
[
  {
    "week": 1,
    "category": "현장 수첩",
    "sub": "절세 시뮬레이션",
    "title": "법인세 2억 내던 대표님, 지금은 5천만원입니다",
    "keyword": "직무발명보상금 절세, 법인세 줄이는 방법",
    "cta": "절세 시뮬레이션 무료 신청",
    "target": "2차 타깃 (중소기업 대표)",
    "legal_basis": "조특법 제10조, 시행령 제9조, 소득세법 제12조"
  },
  {
    "week": 2,
    "category": "IP 라운지",
    "sub": "특허 전략 노트",
    "title": "특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼",
    "keyword": "스타트업 특허 전략, 벤처인증 특허",
    "cta": "이웃 추가",
    "target": "1차 타깃 (스타트업 대표)",
    "legal_basis": "벤처기업육성법"
  },
  {
    "week": 3,
    "category": "현장 수첩",
    "sub": "연구소 운영 실무",
    "title": "연구소 세무조사 통지서 받고 전화 온 대표님",
    "keyword": "기업부설연구소 세무조사, R&D 세액공제 환수",
    "cta": "사후관리 서비스 안내",
    "target": "2차+3차 타깃",
    "legal_basis": "기초연구진흥법 제14조"
  },
  {
    "week": 4,
    "category": "디딤 다이어리",
    "sub": "대표의 생각",
    "title": "KAIST → CIPO → 변리사, 디딤을 만든 이유",
    "keyword": "특허그룹디딤",
    "cta": "없음",
    "target": "전체",
    "legal_basis": "—"
  },
  {
    "week": 5,
    "category": "현장 수첩",
    "sub": "절세 시뮬레이션",
    "title": "대표이사에게 보상금 지급, 가능한가요? (가능합니다)",
    "keyword": "대표이사 직무발명보상금",
    "cta": "절세 시뮬레이션 무료 신청",
    "target": "2차 타깃",
    "legal_basis": "조특법 제10조, 발명진흥법 제17조"
  },
  {
    "week": 6,
    "category": "IP 라운지",
    "sub": "AI와 IP",
    "title": "ChatGPT로 만든 로고, 상표등록 될까?",
    "keyword": "AI 상표등록, ChatGPT 저작권",
    "cta": "이웃 추가",
    "target": "3차 타깃 (CTO)",
    "legal_basis": "상표법, 저작권법"
  },
  {
    "week": 7,
    "category": "현장 수첩",
    "sub": "인증 가이드",
    "title": "벤처인증 3번 떨어진 회사, 4번째에 성공한 비결",
    "keyword": "벤처기업인증 방법",
    "cta": "인증 요건 무료 진단",
    "target": "1차 타깃",
    "legal_basis": "벤처기업육성법 제2조의2"
  },
  {
    "week": 8,
    "category": "디딤 다이어리",
    "sub": "컨설팅 후기",
    "title": "이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략",
    "keyword": "벤처인증 컨설팅",
    "cta": "없음",
    "target": "전체",
    "legal_basis": "—"
  },
  {
    "week": 9,
    "category": "현장 수첩",
    "sub": "절세 시뮬레이션",
    "title": "상여금으로 줬으면 6,600만원 더 나갔습니다",
    "keyword": "직무발명보상금 vs 상여금",
    "cta": "절세 시뮬레이션 무료 신청",
    "target": "2차 타깃",
    "legal_basis": "조특법 제10조, 소득세법 제12조 제3호"
  },
  {
    "week": 10,
    "category": "IP 라운지",
    "sub": "IP 뉴스 한 입",
    "title": "직무발명보상 5만원 줬다가 2조 소송당한 회사",
    "keyword": "직무발명 소송 사례",
    "cta": "보상규정 컨설팅 안내",
    "target": "2차+3차 타깃",
    "legal_basis": "발명진흥법"
  },
  {
    "week": 11,
    "category": "현장 수첩",
    "sub": "인증 가이드",
    "title": "직원 2명이면 연구소 됩니다 — 설립한 대표님 후기",
    "keyword": "기업부설연구소 설립, 연구전담요원 2인",
    "cta": "설립 요건 무료 진단",
    "target": "1차+2차 타깃",
    "legal_basis": "기초연구진흥법 제14조"
  },
  {
    "week": 12,
    "category": "디딤 다이어리",
    "sub": "디딤 일상",
    "title": "변리사가 서울대 AI 과정을 듣는 이유",
    "keyword": "AI 특허 전문가",
    "cta": "없음",
    "target": "전체",
    "legal_basis": "—"
  }
]
```

## 3. 기획서 스케줄 템플릿 (docs/UPGRADE_SPEC.md §4.7)

원문: `docs/UPGRADE_SPEC.md:275-306`

```markdown
### 4.7 신규 테이블: schedule_templates (스케줄 템플릿)

```sql
CREATE TABLE schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week INTEGER NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  title TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  cta_type TEXT NOT NULL,  -- 'TAX_SIM', 'CERT_DIAG', 'LAB_MGMT', 'NEIGHBOR', 'NONE'
  phase INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12주 스케줄 시드 데이터
INSERT INTO schedule_templates (week, category, sub_category, title, keywords, cta_type, phase) VALUES
  (1, '변리사의 현장 수첩', '절세 시뮬레이션', '법인세 2억 내던 대표님, 지금은 5천만원입니다', ARRAY['직무발명보상금 절세', '법인세 줄이는 방법'], 'TAX_SIM', 1),
  (2, 'IP 라운지', '특허 전략 노트', '특허 1건으로 벤처인증 + 투자유치 + 정부과제 3마리 토끼', ARRAY['스타트업 특허 전략', '벤처인증 특허'], 'NEIGHBOR', 1),
  (3, '변리사의 현장 수첩', '연구소 운영 실무', '연구소 세무조사 통지서 받고 전화 온 대표님', ARRAY['기업부설연구소 세무조사', 'R&D 환수'], 'LAB_MGMT', 1),
  (4, '디딤 다이어리', '대표의 생각', 'KAIST → CIPO → 변리사, 디딤을 만든 이유', ARRAY['특허그룹디딤'], 'NONE', 1),
  (5, '변리사의 현장 수첩', '절세 시뮬레이션', '대표이사에게 보상금, 가능한가요? (가능합니다)', ARRAY['대표이사 직무발명보상금'], 'TAX_SIM', 1),
  (6, 'IP 라운지', 'AI와 IP', 'ChatGPT로 만든 로고, 상표등록 될까?', ARRAY['AI 상표등록', 'ChatGPT 저작권'], 'NEIGHBOR', 1),
  (7, '변리사의 현장 수첩', '인증 가이드', '벤처인증 3번 떨어진 회사, 4번째에 성공한 비결', ARRAY['벤처기업인증 방법'], 'CERT_DIAG', 1),
  (8, '디딤 다이어리', '컨설팅 후기', '이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략', ARRAY['벤처인증 컨설팅'], 'NONE', 1),
  (9, '변리사의 현장 수첩', '절세 시뮬레이션', '상여금으로 줬으면 6,600만원 더 나갔습니다', ARRAY['직무발명보상금 vs 상여금'], 'TAX_SIM', 1),
  (10, 'IP 라운지', 'IP 뉴스 한 입', '직무발명보상 5만원 줬다가 2조 소송당한 회사', ARRAY['직무발명 소송 사례'], 'NEIGHBOR', 1),
  (11, '변리사의 현장 수첩', '인증 가이드', '직원 2명이면 연구소 됩니다 — 설립한 대표님 후기', ARRAY['기업부설연구소 설립', '연구전담요원 2인'], 'CERT_DIAG', 1),
  (12, '디딤 다이어리', '디딤 일상', '변리사가 서울대 AI 과정을 듣는 이유', ARRAY['AI 특허 전문가'], 'NONE', 1);
```

---
```

## 4. schedule-data.ts 와 seed_data 차이 (비교 결과)

| 주 | 항목 | schedule-data.ts | seed_data JSON |
|---|---|---|---|
| W3 | 2차분류 | 연구소 운영 | 연구소 운영 실무 |
| W3 | 키워드 | 기업부설연구소 세무조사, R&D 환수 | 기업부설연구소 세무조사, R&D 세액공제 환수 |
| W5 | 제목 | 대표이사에게 보상금, 가능한가요? (가능합니다) | 대표이사에게 보상금 지급, 가능한가요? (가능합니다) |
| W6 | 키워드 | AI 상표등록 | AI 상표등록, ChatGPT 저작권 |
| W7 | 키워드 | 벤처기업인증 방법, 벤처인증 혁신성장 | 벤처기업인증 방법 |
| W8 | 제목 | 이번 달 벤처인증 3건 완료 — 세 회사 세 가지 다른 전략 | 이번 달 벤처인증 3건 완료 — 세 회사 세 가지 전략 |
| W9 | 키워드 | 직무발명보상금 vs 상여금, 보상금 절세 | 직무발명보상금 vs 상여금 |
| W10 | 키워드 | 직무발명 소송, 보상규정 | 직무발명 소송 사례 |
| W10 | CTA | 이웃 추가 | 보상규정 컨설팅 안내 |
| W11 | 키워드 | 기업부설연구소 설립 방법, 연구소 설립 요건 | 기업부설연구소 설립, 연구전담요원 2인 |
| W12 | 키워드 | 변리사 AI | AI 특허 전문가 |

- 1차 카테고리 표기: 두 곳 모두 `현장 수첩` 약칭을 쓴다(네이버 정식 명칭은 `변리사의 현장 수첩`). 스킬 출력은 정식 명칭으로 바꾼다.
- seed_data 에만 있는 필드: `target`(타깃 독자), `legal_basis`(법적 근거). 브리핑 작성 시 참고한다.
