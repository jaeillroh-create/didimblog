// LEGACY: seo-rubrics.ts (카테고리별 루브릭)로 대체됨. 설정 페이지 호환용으로 보존.
// SEO 체크리스트 18항목 정의
export type SeoGrade = "required" | "recommended" | "optional";

export interface SeoItem {
  id: number;
  label: string;
  description: string;
  grade: SeoGrade;
}

export const SEO_ITEMS: SeoItem[] = [
  // 필수 (10개) — 모두 통과해야 발행 가능
  { id: 1, label: "제목 길이", description: "25~30자", grade: "required" },
  { id: 2, label: "제목 키워드 위치", description: "앞 15자 이내", grade: "required" },
  { id: 4, label: "도입부 톤", description: "사람의 상황으로 시작", grade: "required" },
  { id: 5, label: "본문 키워드 빈도", description: "3~5회", grade: "required" },
  { id: 8, label: "이미지 개수", description: "최소 3장", grade: "required" },
  { id: 9, label: "첫 이미지", description: "브랜딩 썸네일", grade: "required" },
  { id: 11, label: "본문 분량", description: "1,500~2,500자", grade: "required" },
  { id: 14, label: "태그 개수", description: "10개", grade: "required" },
  { id: 16, label: "CTA 배치", description: "구분선 + 연락처", grade: "required" },
  { id: 18, label: "예약 시간", description: "화요일 09:00", grade: "required" },

  // 권장 (5개) — 2개까지 미충족 허용
  { id: 6, label: "소제목 개수", description: "'제목2' 2개 이상", grade: "recommended" },
  { id: 7, label: "소제목 키워드", description: "키워드 변형 포함", grade: "recommended" },
  { id: 12, label: "내부 링크", description: "2~3개", grade: "recommended" },
  { id: 15, label: "태그 구성", description: "핵심3+연관3+브랜드2+롱테일2", grade: "recommended" },

  // 선택 (3개) — 미충족 허용
  { id: 3, label: "제목 숫자", description: "숫자 포함 여부", grade: "optional" },
  { id: 10, label: "이미지 ALT", description: "ALT 텍스트 설정", grade: "optional" },
  { id: 17, label: "맞춤법", description: "맞춤법 검사 통과", grade: "optional" },
];

export const REQUIRED_PASS_COUNT = 10;
export const RECOMMENDED_MAX_FAIL = 2;
