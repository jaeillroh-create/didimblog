# CLAUDE.md — Claude Code 프로젝트 지시사항

## 프로젝트 개요
디딤 블로그 운영 백오피스 시스템. Next.js 15 + Supabase + Vercel.
상세 스펙은 SPEC.md, 기획 상세는 docs/ 폴더, 초기 데이터는 seed_data/ 참조.

## 문서 참조 우선순위
1. **SPEC.md** — 기술 스펙 (DB 스키마, 페이지 스펙, 비즈니스 로직)
2. **docs/** — 기획 상세 원문 (각 섹션별 전체 내용)
3. **seed_data/** — 초기 데이터 (12주 스케줄, CTA 문구, SEO 체크리스트)
4. **design-tokens.ts** — 디자인 토큰 (색상/타이포/스페이싱/라운드 등)

## 디자인 토큰 적용 규칙
- design-tokens.ts를 src/lib/constants/design-tokens.ts에 배치
- Tailwind CSS 커스텀 테마에 디자인 토큰 매핑
- 하드코딩된 색상값(#1B3A5C 등) 대신 반드시 토큰 변수 사용
- globals.css에 CSS 변수로 변환하여 shadcn/ui 컴포넌트에도 적용

## 재사용 가능 컴포넌트 구조

### 기본 UI 컴포넌트 (src/components/ui/) — shadcn/ui 기반
button, card, badge, dialog, input, select, table, tabs, toast,
dropdown-menu, popover, calendar, checkbox, label, separator, sheet, avatar

### 공통 컴포넌트 (src/components/common/)
| 컴포넌트 | 파일명 | 용도 | 재사용 위치 |
|---------|--------|------|-----------|
| StatusBadge | status-badge.tsx | S0~S5 상태 뱃지 (색상 자동) | 칸반, 테이블, 상세 |
| QualityBadge | quality-badge.tsx | 품질 등급 뱃지 | 테이블, 상세, 분석 |
| CategoryBadge | category-badge.tsx | 카테고리 컬러 뱃지 | 칸반, 캘린더, 테이블 |
| SLAIndicator | sla-indicator.tsx | SLA 진행 인디케이터 | 대시보드, 칸반카드, 상세 |
| KPICard | kpi-card.tsx | KPI 수치+증감 카드 | 대시보드, 분석 |
| EmptyState | empty-state.tsx | 빈 상태 안내 | 모든 리스트 페이지 |
| LoadingSkeleton | loading-skeleton.tsx | 로딩 스켈레톤 | 모든 페이지 |
| ConfirmDialog | confirm-dialog.tsx | 확인 다이얼로그 | 삭제/상태변경 시 |
| SearchInput | search-input.tsx | 검색+필터 입력 | 콘텐츠, 리드, 카테고리 |
| DataTable | data-table.tsx | TanStack Table 래퍼 | 리드, 콘텐츠 목록, 분석 |
| TimelineStep | timeline-step.tsx | 타임라인 스텝 | SLA 타임라인, 리드 파이프라인 |
| PageHeader | page-header.tsx | 페이지 헤더 (제목+액션) | 모든 페이지 |

### 도메인 컴포넌트 (src/components/{도메인}/)
각 도메인(contents, leads, analytics 등)에 특화된 컴포넌트.
공통 컴포넌트를 조합하여 구성.

## 코딩 컨벤션

### 언어/프레임워크
- TypeScript strict mode
- Next.js 15 App Router (app/ 디렉토리)
- Server Components 기본, 클라이언트 필요 시에만 "use client"
- Server Actions (actions/ 디렉토리)로 데이터 변경

### 스타일링
- Tailwind CSS + shadcn/ui + 디자인 토큰
- 하드코딩된 색상값 사용 금지 → 토큰 또는 CSS 변수 사용
- globals.css에 CSS 변수 정의, tailwind.config.ts에서 참조

### 파일 구조
- 공통 컴포넌트: src/components/common/{컴포넌트명}.tsx
- 도메인 컴포넌트: src/components/{도메인}/{컴포넌트명}.tsx
- UI 컴포넌트: src/components/ui/ (shadcn/ui)
- 서버 액션: src/actions/{도메인}.ts
- 디자인 토큰: src/lib/constants/design-tokens.ts
- 타입: src/lib/types/database.ts
- 상수: src/lib/constants/

### 네이밍
- 컴포넌트: PascalCase (KanbanBoard, StatusBadge)
- 파일명: kebab-case (kanban-board.tsx, status-badge.tsx)
- 함수: camelCase
- 상수: UPPER_SNAKE_CASE
- DB 테이블/필드: snake_case
- 타입: PascalCase, 접두사 없음

### 에러 처리
- Server Actions에서 try/catch + 구조화된 에러 반환
- 클라이언트에서 toast로 에러 표시 (sonner)
- 모든 Supabase 에러 로깅

### 한국어
- UI 텍스트, 에러 메시지, 주석 모두 한국어
- 변수/함수명은 영어

## 작업 순서 (스프린트)

### Sprint 1 (기반 구축)
1. Next.js 프로젝트 + 의존성 설치
2. 디자인 토큰 → globals.css + tailwind.config.ts 매핑
3. 공통 컴포넌트 12개 생성
4. Supabase 클라이언트 + 미들웨어
5. 로그인 페이지 + 루트 레이아웃 + 사이드바
6. 대시보드 페이지

### Sprint 2 (핵심 기능)
7. 콘텐츠 칸반보드 + 상태 전이 로직
8. 콘텐츠 상세 + SEO 체크리스트
9. 발행 캘린더
10. 카테고리 관리

### Sprint 3 (분석+연동)
11. 리드 추적 CRM
12. KPI 대시보드 (Recharts)
13. 성과 분석
14. 설정 페이지

## Supabase 환경변수
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## 핵심 참고사항
- 칸반보드가 가장 중요한 화면 — UX에 가장 많은 공을 들일 것
- 상태 전이 규칙은 state_transitions 테이블에서 읽어올 것 (하드코딩 금지)
- SEO 18항목 상세는 seed_data/seo_checklist.json 참조
- CTA 문구 원문은 seed_data/cta_templates.json 참조
- 12주 스케줄 데이터는 seed_data/schedule_12weeks.json 참조
- 디자인: 전문적이고 깔끔한 B2B 백오피스, 디자인 토큰 일관 적용
