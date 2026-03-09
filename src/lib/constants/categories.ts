// 카테고리 색상 코드
export const CATEGORY_COLORS = {
  "CAT-A": "#D4740A", // 현장수첩 = 오렌지
  "CAT-B": "#1B3A5C", // IP라운지 = 네이비
  "CAT-C": "#6B7280", // 다이어리 = 그레이
  "CAT-INTRO": "#94A3B8",
  "CAT-CONSULT": "#2E75B6",
} as const;

// 카테고리 역할 타입
export const CATEGORY_ROLE_TYPES = {
  conversion: "전환형",
  traffic_branding: "트래픽/브랜딩형",
  trust: "신뢰형",
  fixed: "고정",
} as const;

// 퍼널 단계
export const FUNNEL_STAGES = {
  ATTRACT: "유입",
  TRUST: "신뢰",
  CONVERT: "전환",
  MULTI: "복합",
} as const;

// 카테고리 생애주기 상태
export const CATEGORY_STATUSES = {
  NEW: { label: "신규", color: "#3B82F6" },
  GROW: { label: "성장", color: "#10B981" },
  MATURE: { label: "안정", color: "#6B7280" },
  ADJUST: { label: "조정", color: "#F59E0B" },
} as const;
