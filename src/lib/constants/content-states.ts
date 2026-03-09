import { colors } from "./design-tokens";

// S0~S5 콘텐츠 상태 정의 — 디자인 토큰 참조
export const CONTENT_STATES = {
  S0: { label: "기획중", color: colors.status.s0 },
  S1: { label: "초안완료", color: colors.status.s1 },
  S2: { label: "검토완료", color: colors.status.s2 },
  S3: { label: "발행예정", color: colors.status.s3 },
  S4: { label: "발행완료", color: colors.status.s4 },
  S5: { label: "성과측정", color: colors.status.s5 },
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
