# CLAUDE.md — Claude Code 프로젝트 지시사항

## 프로젝트 개요
디딤 블로그 운영 백오피스 시스템. Next.js 15 + Supabase + Vercel.
상세 스펙은 SPEC.md 참조.

## 코딩 컨벤션

### 언어/프레임워크
- TypeScript strict mode
- Next.js 15 App Router (app/ 디렉토리)
- Server Components 기본, 클라이언트 필요 시에만 "use client"
- Server Actions (actions/ 디렉토리)로 데이터 변경
- Supabase 서버 클라이언트는 서버 컴포넌트/액션에서만, 브라우저 클라이언트는 클라이언트 컴포넌트에서만

### 스타일링
- Tailwind CSS + shadcn/ui
- CSS 변수는 globals.css에 정의
- 컴포넌트별 스타일은 Tailwind 클래스만 사용 (CSS 모듈 사용 금지)

### 파일 구조
- 컴포넌트: src/components/{도메인}/{컴포넌트명}.tsx
- 서버 액션: src/actions/{도메인}.ts
- Supabase 클라이언트: src/lib/supabase/{client|server}.ts
- 타입: src/lib/types/database.ts
- 상수: src/lib/constants/{파일명}.ts

### 네이밍
- 컴포넌트: PascalCase (KanbanBoard, ContentCard)
- 파일명: kebab-case (kanban-board.tsx, content-card.tsx)
- 함수: camelCase
- 상수: UPPER_SNAKE_CASE
- DB 테이블/필드: snake_case
- 타입/인터페이스: PascalCase, 접두사 없음 (IContent 아닌 Content)

### 에러 처리
- Server Actions에서 try/catch + 구조화된 에러 반환
- 클라이언트에서 toast로 에러 표시 (sonner 사용)
- Supabase 에러는 항상 로깅

### 한국어
- UI 텍스트, 에러 메시지, 주석 모두 한국어
- 변수/함수명은 영어

## 작업 순서 (스프린트)

### Sprint 1 (기반 구축) — 먼저 이것부터
1. Next.js 프로젝트 생성 + 의존성 설치
2. Tailwind + shadcn/ui 설정
3. Supabase 클라이언트 설정 (client.ts, server.ts)
4. 인증 미들웨어 (middleware.ts)
5. 로그인 페이지
6. 루트 레이아웃 + 사이드바
7. 대시보드 페이지 (더미 데이터)

### Sprint 2 (핵심 기능)
8. 콘텐츠 칸반보드
9. 콘텐츠 상세 페이지 + CRUD
10. SEO 체크리스트 엔진
11. 상태 전이 로직 (Server Actions)
12. 발행 캘린더
13. 카테고리 관리

### Sprint 3 (분석+연동)
14. 리드 추적 CRM
15. KPI 대시보드 (Recharts)
16. 품질점수 자동 계산
17. 성과 분석 페이지
18. 설정 페이지

## Supabase 환경변수
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## 참고 사항
- 칸반보드가 가장 핵심 화면 — UX에 가장 많은 공을 들일 것
- 상태 전이 규칙은 하드코딩하지 말고 state_transitions 테이블에서 읽어올 것
- SEO 체크리스트 18항목의 등급(필수/권장/선택)은 SPEC.md 5.2절 참조
- 디자인 톤: 전문적이고 깔끔한 B2B 백오피스. 디딤 CI 색상(네이비 #1B3A5C + 오렌지 #D4740A) 활용
