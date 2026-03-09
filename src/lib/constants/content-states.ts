// S0~S5 콘텐츠 상태 정의
export const CONTENT_STATES = {
  S0: { label: "기획중", color: "#94A3B8" },
  S1: { label: "초안완료", color: "#3B82F6" },
  S2: { label: "검토완료", color: "#F59E0B" },
  S3: { label: "발행예정", color: "#8B5CF6" },
  S4: { label: "발행완료", color: "#10B981" },
  S5: { label: "성과측정", color: "#EC4899" },
} as const;

export type ContentStatus = keyof typeof CONTENT_STATES;

export const CONTENT_STATUS_OPTIONS: ContentStatus[] = [
  "S0",
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
];
