// ============================================================
// 디딤 블로그 운영 시스템 — 디자인 토큰
// Universal Component Library v1.0 기반
// Tossface 이모지 + TDS 클론 + 디자인 토큰
// ============================================================

// ── 컬러 팔레트 ──
export const colors = {
  // 브랜드 (TDS 기반)
  brand: {
    DEFAULT: '#1B64DA',
    hover: '#1550B8',
    light: '#EBF3FE',
    mid: '#C9DFFE',
    pale: '#F5F8FF',
  },

  // 시맨틱
  success: {
    DEFAULT: '#0F9D58',
    light: '#EAFBF2',
  },
  warning: {
    DEFAULT: '#E88B00',
    light: '#FFF7EA',
  },
  danger: {
    DEFAULT: '#E5383B',
    light: '#FEF0F0',
  },
  info: {
    DEFAULT: '#3182F6',
    light: '#EBF5FF',
  },

  // 그레이스케일 (12단계)
  g: {
    900: '#191F28',
    800: '#292E37',
    700: '#333D4B',
    600: '#4E5968',
    500: '#6B7685',
    400: '#8B95A1',
    300: '#B0B8C1',
    200: '#D1D6DB',
    150: '#E5E8EB',
    100: '#F2F4F6',
    50: '#F7F8FA',
  },

  white: '#FFFFFF',

  // 카테고리별 색상 (블로그 카테고리 구분)
  category: {
    fieldNote: '#D4740A',
    ipLounge: '#1B64DA',
    diary: '#6B7685',
    intro: '#8B95A1',
    consult: '#3182F6',
  },

  // 상태 색상 (콘텐츠 S0~S5)
  status: {
    s0: '#8B95A1',
    s1: '#3182F6',
    s2: '#8B5CF6',
    s3: '#E88B00',
    s4: '#0F9D58',
    s5: '#6366F1',
  },

  // 품질 등급
  quality: {
    excellent: '#0F9D58',
    good: '#3182F6',
    average: '#E88B00',
    poor: '#E5383B',
    critical: '#7F1D1D',
  },

  // SEO 등급
  seo: {
    required: '#E5383B',
    recommended: '#E88B00',
    optional: '#6B7685',
  },

  // SLA 상태
  sla: {
    onTrack: '#0F9D58',
    warning: '#E88B00',
    overdue: '#E5383B',
    future: '#E5E8EB',
  },
} as const;

// ── 타이포그래피 ──
export const typography = {
  fontFamily: {
    sans: "'Toss Product Sans', 'Pretendard', -apple-system, system-ui, sans-serif",
    mono: "'DM Mono', 'JetBrains Mono', monospace",
    emoji: "'Tossface', sans-serif",
  },
  // TDS 8단계 스케일
  fontSize: {
    micro: '10px',
    xs: '11px',
    sm: '12px',
    md: '13.5px',
    lg: '15px',
    xl: '17px',
    '2xl': '22px',
    '3xl': '28px',
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeight: {
    tight: '1.2',
    snug: '1.3',
    normal: '1.4',
    relaxed: '1.5',
    loose: '1.6',
  },
} as const;

// ── 스페이싱 (4px 기반) ──
export const spacing = {
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  sidebar: '240px',
  sidebarCollapsed: '64px',
  header: '56px',
  pageGutter: '24px',
  cardGap: '16px',
  sectionGap: '16px',
} as const;

// ── 라운드 (Border Radius) — 6단계 ──
export const radius = {
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
} as const;

// ── 그림자 — 3단계 ──
export const shadow = {
  sm: '0 1px 3px rgba(0,0,0,.06)',
  md: '0 4px 14px rgba(0,0,0,.08)',
  lg: '0 10px 36px rgba(0,0,0,.12)',
} as const;

// ── 트랜지션 ──
export const transition = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// ── z-index ──
export const zIndex = {
  base: 1,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
} as const;

// ── 브레이크포인트 ──
export const breakpoint = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

// ── 컴포넌트 사이즈 프리셋 ──
export const componentSize = {
  button: {
    sm: { height: '32px', fontSize: '12px', px: '12px' },
    md: { height: '40px', fontSize: '13.5px', px: '16px' },
    lg: { height: '48px', fontSize: '15px', px: '20px' },
    xl: { height: '56px', fontSize: '15px', px: '24px' },
  },
  input: {
    sm: { height: '32px', fontSize: '12px' },
    md: { height: '40px', fontSize: '13.5px' },
    lg: { height: '48px', fontSize: '15px' },
  },
  badge: {
    sm: { height: '20px', fontSize: '10px', px: '6px' },
    md: { height: '24px', fontSize: '12px', px: '8px' },
  },
  avatar: {
    sm: '24px',
    md: '32px',
    lg: '40px',
    xl: '56px',
  },
  icon: {
    sm: '16px',
    md: '20px',
    lg: '24px',
  },
  kanbanCard: {
    minHeight: '88px',
    width: '100%',
  },
} as const;

// ── 전체 토큰 내보내기 ──
export const tokens = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
  transition,
  zIndex,
  breakpoint,
  componentSize,
} as const;

export default tokens;
