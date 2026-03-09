// ============================================================
// 디딤 블로그 운영 시스템 — 디자인 토큰
// 이 파일을 src/lib/constants/design-tokens.ts에 배치
// ============================================================

// ── 컬러 팔레트 ──
export const colors = {
  // 브랜드
  brand: {
    primary: '#1B3A5C',      // 네이비 — 사이드바, 헤더, 주요 텍스트
    accent: '#2E75B6',       // 블루 — 링크, 활성 상태, 강조
    cta: '#D4740A',          // 오렌지 — CTA 버튼, 디딤 CI
    ctaHover: '#B8620A',     // CTA 호버
  },

  // 카테고리별 색상 (블로그 카테고리 구분)
  category: {
    fieldNote: '#D4740A',    // 현장 수첩 — 오렌지
    ipLounge: '#1B3A5C',     // IP 라운지 — 네이비
    diary: '#6B7280',        // 디딤 다이어리 — 그레이
    intro: '#94A3B8',        // 디딤 소개 — 라이트그레이
    consult: '#2E75B6',      // 상담 안내 — 블루
  },

  // 상태 색상 (콘텐츠 S0~S5, 품질 등급)
  status: {
    s0: '#94A3B8',           // 기획중 — 슬레이트
    s1: '#3B82F6',           // 초안완료 — 블루
    s2: '#8B5CF6',           // 검토완료 — 퍼플
    s3: '#F59E0B',           // 발행예정 — 앰버
    s4: '#10B981',           // 발행완료 — 에메랄드
    s5: '#6366F1',           // 성과측정 — 인디고
  },

  // 품질 등급
  quality: {
    excellent: '#059669',    // 우수 80+ — 그린
    good: '#2563EB',         // 양호 60~79 — 블루
    average: '#D97706',      // 보통 40~59 — 앰버
    poor: '#DC2626',         // 부진 20~39 — 레드
    critical: '#7F1D1D',     // 위험 ~19 — 다크레드
  },

  // SEO 등급
  seo: {
    required: '#DC2626',     // 필수 — 레드
    recommended: '#EA580C',  // 권장 — 오렌지
    optional: '#6B7280',     // 선택 — 그레이
  },

  // SLA 상태
  sla: {
    onTrack: '#10B981',      // 정상 — 그린
    warning: '#F59E0B',      // 주의 (1일 이내) — 앰버
    overdue: '#DC2626',      // 초과 — 레드
    future: '#E2E8F0',       // 미래 — 라이트그레이
  },

  // 시맨틱
  semantic: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },

  // 뉴트럴 (배경/텍스트/보더)
  neutral: {
    bg: '#F8FAFC',           // 페이지 배경
    card: '#FFFFFF',         // 카드 배경
    sidebar: '#1B3A5C',      // 사이드바 배경
    sidebarHover: '#24476E', // 사이드바 호버
    border: '#E2E8F0',       // 기본 보더
    borderHover: '#CBD5E1',  // 호버 보더
    text: '#0F172A',         // 기본 텍스트
    textSecondary: '#64748B',// 보조 텍스트
    textMuted: '#94A3B8',    // 뮤트 텍스트
    textOnDark: '#F8FAFC',   // 다크 위 텍스트
    placeholder: '#CBD5E1',  // 플레이스홀더
  },
} as const;

// ── 타이포그래피 ──
export const typography = {
  fontFamily: {
    sans: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", Consolas, monospace',
  },
  fontSize: {
    xs: '0.75rem',     // 12px — 태그, 뱃지
    sm: '0.8125rem',   // 13px — 보조 텍스트, 캡션
    base: '0.875rem',  // 14px — 기본 본문 (대시보드 특성상 14px)
    md: '1rem',        // 16px — 강조 본문
    lg: '1.125rem',    // 18px — 서브 타이틀
    xl: '1.25rem',     // 20px — 섹션 타이틀
    '2xl': '1.5rem',   // 24px — 페이지 타이틀
    '3xl': '1.875rem', // 30px — 대형 타이틀
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
    extrabold: '800',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.75',
  },
} as const;

// ── 스페이싱 ──
export const spacing = {
  px: '1px',
  0.5: '0.125rem',  // 2px
  1: '0.25rem',     // 4px
  1.5: '0.375rem',  // 6px
  2: '0.5rem',      // 8px
  3: '0.75rem',     // 12px
  4: '1rem',        // 16px
  5: '1.25rem',     // 20px
  6: '1.5rem',      // 24px
  8: '2rem',        // 32px
  10: '2.5rem',     // 40px
  12: '3rem',       // 48px
  16: '4rem',       // 64px
  // 레이아웃
  sidebar: '240px',       // 사이드바 너비
  sidebarCollapsed: '64px', // 접힌 사이드바
  header: '56px',         // 헤더 높이
  pageGutter: '24px',     // 페이지 좌우 여백
  cardGap: '16px',        // 카드 간 간격
  sectionGap: '32px',     // 섹션 간 간격
} as const;

// ── 라운드 (Border Radius) ──
export const radius = {
  none: '0',
  sm: '0.25rem',    // 4px — 입력, 뱃지
  md: '0.375rem',   // 6px — 버튼, 카드 내부
  lg: '0.5rem',     // 8px — 카드
  xl: '0.75rem',    // 12px — 모달, 큰 카드
  '2xl': '1rem',    // 16px — 대형 컨테이너
  full: '9999px',   // 원형 — 아바타
} as const;

// ── 그림자 ──
export const shadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.07), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08), 0 4px 6px -4px rgba(0, 0, 0, 0.05)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
  card: '0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.03)',
  cardHover: '0 4px 12px 0 rgba(0, 0, 0, 0.08)',
  dropdown: '0 4px 16px 0 rgba(0, 0, 0, 0.12)',
  modal: '0 20px 60px 0 rgba(0, 0, 0, 0.15)',
} as const;

// ── 트랜지션 ──
export const transition = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  spring: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

// ── z-index ──
export const zIndex = {
  base: 0,
  dropdown: 1000,
  sticky: 1100,
  overlay: 1200,
  modal: 1300,
  popover: 1400,
  tooltip: 1500,
  toast: 1600,
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
    sm: { height: '32px', fontSize: '13px', px: '12px' },
    md: { height: '36px', fontSize: '14px', px: '16px' },
    lg: { height: '40px', fontSize: '14px', px: '20px' },
  },
  input: {
    sm: { height: '32px', fontSize: '13px' },
    md: { height: '36px', fontSize: '14px' },
    lg: { height: '40px', fontSize: '14px' },
  },
  badge: {
    sm: { height: '20px', fontSize: '11px', px: '6px' },
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
