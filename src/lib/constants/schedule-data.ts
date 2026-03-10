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

// 카테고리별 색상
export const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "현장 수첩": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
  "IP 라운지": { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  "디딤 다이어리": { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200" },
};

// ── 프롬프트 키 상수 ──
export const PROMPT_KEYS = {
  PROMPT_DIARY: "PROMPT_DIARY",
  PROMPT_LOUNGE_BITE: "PROMPT_LOUNGE_BITE",
  PROMPT_LOUNGE_GENERAL: "PROMPT_LOUNGE_GENERAL",
  PROMPT_FIELD: "PROMPT_FIELD",
} as const;

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS];

// ── CTA 키 상수 ──
export const CTA_KEYS = {
  현장수첩_절세: "현장수첩_절세",
  현장수첩_인증: "현장수첩_인증",
  현장수첩_연구소: "현장수첩_연구소",
  IP라운지: "IP라운지",
  디딤다이어리: "디딤다이어리",
} as const;

export type CtaKey = (typeof CTA_KEYS)[keyof typeof CTA_KEYS];

/**
 * 카테고리/서브카테고리 → 프롬프트 템플릿 키 매핑
 * - 디딤 다이어리: 브랜딩 톤 (CTA 없음)
 * - IP 라운지 > IP 뉴스 한 입: 뉴스 큐레이션 톤
 * - IP 라운지 (기타): IP 전략/교양 톤
 * - 변리사의 현장 수첩: 실무 사례 톤 (subCategory별 CTA만 다름)
 */
export function getPromptKey(category: string, subCategory: string): PromptKey {
  if (category === "디딤 다이어리") return PROMPT_KEYS.PROMPT_DIARY;
  if (category === "IP 라운지" && subCategory === "IP 뉴스 한 입")
    return PROMPT_KEYS.PROMPT_LOUNGE_BITE;
  if (category === "IP 라운지") return PROMPT_KEYS.PROMPT_LOUNGE_GENERAL;
  return PROMPT_KEYS.PROMPT_FIELD;
}

/**
 * 카테고리/서브카테고리 → CTA 템플릿 키 매핑
 * cta_templates.json 키와 일치
 */
export function getCtaKey(category: string, subCategory: string): CtaKey | null {
  if (category === "디딤 다이어리") return null; // CTA 없음
  if (category === "IP 라운지") return CTA_KEYS.IP라운지;
  // 현장 수첩: subCategory별 CTA 분기
  if (subCategory === "절세 시뮬레이션") return CTA_KEYS.현장수첩_절세;
  if (subCategory === "인증 가이드") return CTA_KEYS.현장수첩_인증;
  if (subCategory === "연구소 운영" || subCategory === "연구소 운영 실무")
    return CTA_KEYS.현장수첩_연구소;
  // 기타 현장 수첩 → 절세 CTA를 기본으로 사용
  return CTA_KEYS.현장수첩_절세;
}

// ── 프롬프트 키 → DB prompt_templates.name 매핑 ──
export const PROMPT_KEY_TO_TEMPLATE_NAME: Record<PromptKey, string> = {
  PROMPT_DIARY: "디딤다이어리_일반",
  PROMPT_LOUNGE_BITE: "IP라운지_뉴스",
  PROMPT_LOUNGE_GENERAL: "IP라운지_일반",
  PROMPT_FIELD: "현장수첩_절세",
};

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
