# CTA 템플릿 전문과 런타임 사용처

> CTA 문구는 4개 소스에 서로 다르게 존재한다. 이 파일은 전부 원문 그대로 싣고, 어느 것이 실제로 쓰이는지 코드 근거로 정리한다.

## 목차
0. 스킬이 쓰는 CTA 결정표 (신규 구조)
1. 결론: 백오피스 런타임에서 쓰이는 CTA
2. 소스별 비교 표
3. 원문 A: prompts.ts FIELD_CTA / DEFAULT_CTA / getPromptKey / getFieldCta (9-119행)
4. 원문 B: appendCtaAndSignature 의 CTA 블록 (client-generate.ts:1560-1583)
5. 원문 C: supabase/migrations/011_seed_cta_templates.sql
6. 원문 D: publish-prep-client.tsx FALLBACK_CTA · CTA_KEYWORD_MAP · matchCtaForContent (49-210행)
7. 원문 E: seed_data/cta_templates.json
8. 원문 F: docs/UPGRADE_SPEC.md §5.2-5.3

## 0. 스킬이 쓰는 CTA 결정표 (신규 구조, _DECISIONS.md 2절) — 먼저 볼 것
한 글에는 CTA 를 **하나만** 넣는다. 발행본 CTA 블록은 아래 표로 정하고, 초안 작성 단계에서도 같은 블록을 쓴다(백오피스처럼 생성용 FIELD_CTA 블록과 발행용 템플릿을 따로 붙이지 않는다).
계산: `python3 scripts/core_rules.py cta` (입력 {category, target_keyword, title, office_news}).

| 카테고리 (categoryNo) | CTA 블록 | 선택 규칙 | 메일 제목 태그 | 원문 위치 |
|---|---|---|---|---|
| 지원사업·인증과 특허 (25) | 현장수첩_절세 / 현장수첩_인증 / 현장수첩_연구소 | 타깃 키워드 → 제목 순으로 CTA_KEYWORD_MAP 의 절세·인증·연구소 정규식만 위에서부터 검사. 불일치 시 **현장수첩_인증(스킬 기본값)**. 특허인증센터 링크 슬롯은 아직 비워 둔다 | 절세 시뮬레이션 / 인증 진단 / 연구소 진단 | 6절 FALLBACK_CTA(= 5절 migration 011) |
| 출원·심판 실무 (27) | 현장수첩_출원 | 고정 | 출원 상담 | 6절 FALLBACK_CTA |
| 사례 (26) | CTA_KEYWORD_MAP 7개 전체로 매칭된 템플릿 | 타깃 키워드 → 제목 순, 불일치 시 현장수첩_출원 | 해당 템플릿 값 | 6절 |
| 지식재산 경영 (24) | 이웃 추가 CTA = seed_data "IP라운지" 문구 | 고정 | 없음 | 7절(= 8절 UPGRADE_SPEC NEIGHBOR) |
| 디딤 소식 (28) — 뉴스 | 가벼운 이웃 추가: `━×18` + "IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요." + 빈 줄 + 서명 | 고정 | 없음 | 문장: 3절 FIELD_CTA["CAT-B-03"], 모양: 4절 |
| 디딤 소식 (28) — 사무소 소식 | **없음** | - | - | _DECISIONS.md 5절 |
| 디딤 다이어리 (17, 18~20) | **없음 (절대원칙)** | - | - | - |
| 디딤 소개 (7) / 상담 안내 (22) | 대상 아님(고정 페이지) | - | - | - |
| 레거시 (9·13 하위) | 백오피스 원본 규칙: 생성 단계 getFieldCta, 발행 화면 matchCtaForContent(CAT 별칭) | 1절 | - | 3·6절 |

이웃 추가 CTA 원문(24):
````text
━━━━━━━━━━━━━━━━━━
이런 IP 이야기가 도움이 되셨다면 디딤 블로그를 이웃 추가해주세요.
매주 화요일, 중소기업 대표님께 실질적인 IP 정보를 전해드립니다.

IP 관련 상담이 필요하시면: admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사
````
※ "매주 화요일"은 원문 그대로다. 현재 주 1편 운영(_DECISIONS.md 3절)과 발행 요일이 맞는지 **확인 필요** — 다르면 사용자 확인 후 그 줄만 고친다.

가벼운 이웃 추가 CTA(28, 스킬이 기존 문장·모양을 조합):
````text
━━━━━━━━━━━━━━━━━━
IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.

특허그룹 디딤 | 기업을 아는 변리사
````

## 1. 결론: 백오피스 런타임에서 쓰이는 CTA (레거시 코드 동작)

| 경로 | 사용하는 소스 | 코드 근거 |
|---|---|---|
| AI 초안 생성 Phase 3 후처리 → 본문 끝에 CTA·서명·태그 부착 | **FIELD_CTA** (getFieldCta 로 1문장 선택) + appendCtaAndSignature 의 고정 블록(서명·📞·📧 메일 제목) | ai-editor-client.tsx:977-986, client-generate.ts:1496-1583 |
| 서버 초안 생성(레거시) 템플릿 변수 `{{cta_text}}`/`{{email_subject}}` | FIELD_CTA (PROMPT_FIELD 일 때만, 키워드 없이 호출) | actions/ai.ts:434-446, lib/generation-runner.ts:183-195 |
| 발행 준비 화면의 CTA 카드(복사용) | **DB cta_templates**(migration 011 시드, 설정 화면에서 수정 가능) → 없는 key 는 **FALLBACK_CTA** 로 보충. 출력 전 enforceEmail 적용 | publish/page.tsx:42-49, actions/settings.ts:156-182, publish-prep-client.tsx:140-284 |
| seed_data/cta_templates.json | **런타임 미사용**(어떤 코드도 import 하지 않음. schedule-data.ts:72 주석에서 key 이름만 언급) | grep 결과 |
| UPGRADE_SPEC §5.2 CTA_TEMPLATES | **코드에 없음**(기획 문서). 전화번호 자리표시 `000-0000-0000` | docs/UPGRADE_SPEC.md:337-381 |

- DB 템플릿과 FALLBACK_CTA 가 같은 key 면 DB 가 우선(publish-prep-client.tsx:154-157). migration 011 의 4건은 FALLBACK_CTA 의 같은 key 4건과 문자열이 완전히 같다. FALLBACK_CTA 에만 있는 key 는 `현장수첩_출원`.
- DB 를 설정 화면(updateCtaTemplate)에서 고쳤다면 실제 문구는 다를 수 있다 → 현재 DB 값은 **확인 필요**.
- 따라서 같은 글에 서로 다른 CTA 두 개(본문 끝 FIELD_CTA 블록 + 발행 화면 CTA 카드)가 나올 수 있다. 발행 시 하나만 남긴다(publish-prep 스킬 참고).
- 다이어리(CAT-C*)는 어떤 경로에서도 CTA 없음: appendCtaAndSignature 는 PROMPT_DIARY 면 CTA/태그를 붙이지 않고(client-generate.ts:1504-1507), 발행 화면은 null 반환(publish-prep-client.tsx:146-151).

## 2. 소스별 비교 표

| 2차 분류 | FIELD_CTA (생성 시 1문장 / 메일 제목) | DB 011 = FALLBACK (발행 화면) | seed_data JSON | UPGRADE_SPEC §5.2 |
|---|---|---|---|---|
| 절세 시뮬레이션 CAT-A-01 | "재무제표를 보내주세요. 48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)" / 절세 시뮬레이션 | 현장수첩_절세 (📞/📧 형식) | 현장수첩_절세 (Tel:/Mail: 형식) | TAX_SIM (Tel: 000-0000-0000) |
| 인증 가이드 CAT-A-02 | "인증 요건 해당 여부, 무료 진단해드립니다." / 인증 진단 | 현장수첩_인증 | 현장수첩_인증 (+ "아래 연락처로 문의 주시면 무료 진단을 도와드리겠습니다.") | CERT_DIAG |
| 연구소 운영 실무 CAT-A-03 | "연구소 사후관리가 걱정되시면 연락 주세요. 연구활동조사표부터 연차보고까지 도와드립니다." / **연구소 관리** | 현장수첩_연구소 "연구소 운영 상태 점검, 무료 진단 가능합니다." / **연구소 진단** | 현장수첩_연구소 다른 문장 / 연구소 진단 | LAB_MGMT / **연구소 점검** |
| 특허·상표 출원 실무 CAT-A-04 | "출원 전략이 궁금하시면 … 검토해 드립니다." / 출원 상담 | FALLBACK 에만 현장수첩_출원 / 출원 상담 | 없음 | 없음 |
| 특허 전략 노트 | "특허 포트폴리오 전략이 궁금하시면 편하게 연락 주세요." / 상담 문의 (CAT-B-01) | IP라운지 "AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요." / 상담 문의 | IP라운지 = 이웃 추가 유도문 / null | NEIGHBOR (이웃 추가) |
| AI와 IP | "AI 기술의 특허 가능성이 궁금하시면 편하게 연락 주세요." / 상담 문의 (CAT-B-02) | IP라운지 (동일) | IP라운지 (동일) | NEIGHBOR |
| IP 뉴스 한 입 CAT-B-03 | "IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요." / 상담 문의 | IP라운지 (동일) | IP라운지 (동일) | NEIGHBOR |
| 디딤 다이어리 | 없음 | 없음 | text null + note | NONE '' |
| (매칭 실패) | DEFAULT_CTA "궁금하신 점이 있으시면 편하게 연락 주세요." / 상담 문의 | 5순위: 목록 첫 템플릿 | - | NEIGHBOR |

메일 제목 태그 불일치: 연구소 = "연구소 관리"(FIELD_CTA) / "연구소 진단"(DB·JSON) / "연구소 점검"(UPGRADE_SPEC).

## 3. 원문 A: src/lib/constants/prompts.ts:9-119
````ts
// ── 모든 subCategory별 CTA ──

export const FIELD_CTA: Record<string, { cta: string; emailSubject: string }> = {
  // 현장수첩 > 절세 시뮬레이션
  "CAT-A-01": {
    cta: "재무제표를 보내주세요. 48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)",
    emailSubject: "절세 시뮬레이션",
  },
  // 현장수첩 > 인증 가이드
  "CAT-A-02": {
    cta: "인증 요건 해당 여부, 무료 진단해드립니다.",
    emailSubject: "인증 진단",
  },
  // 현장수첩 > 연구소 운영 실무
  "CAT-A-03": {
    cta: "연구소 사후관리가 걱정되시면 연락 주세요. 연구활동조사표부터 연차보고까지 도와드립니다.",
    emailSubject: "연구소 관리",
  },
  // 현장수첩 > 특허·상표 출원 실무
  "CAT-A-04": {
    cta: "출원 전략이 궁금하시면 편하게 연락 주세요. 기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.",
    emailSubject: "출원 상담",
  },
  // IP 라운지 > 특허 전략 노트
  "CAT-B-01": {
    cta: "특허 포트폴리오 전략이 궁금하시면 편하게 연락 주세요.",
    emailSubject: "상담 문의",
  },
  // IP 라운지 > AI와 IP
  "CAT-B-02": {
    cta: "AI 기술의 특허 가능성이 궁금하시면 편하게 연락 주세요.",
    emailSubject: "상담 문의",
  },
  // IP 라운지 > IP 뉴스 한 입
  "CAT-B-03": {
    cta: "IP 이슈에 대해 더 알고 싶으시면 이웃 추가 해주세요.",
    emailSubject: "상담 문의",
  },
};

/** 범용 CTA — 어디에도 매칭 안 될 때 */
const DEFAULT_CTA = {
  cta: "궁금하신 점이 있으시면 편하게 연락 주세요.",
  emailSubject: "상담 문의",
};

// ── getPromptKey: category + subCategory → PromptKey ──

export function getPromptKey(categoryId: string): PromptKey {
  // CAT-A (현장수첩) — subCategory(CAT-A-01/02/03)도 모두 PROMPT_FIELD
  if (categoryId === "CAT-A" || categoryId.startsWith("CAT-A-")) {
    return "PROMPT_FIELD";
  }

  // CAT-B-03 (IP 뉴스 한 입) — 경량 포맷
  if (categoryId === "CAT-B-03") {
    return "PROMPT_LOUNGE_BITE";
  }

  // CAT-B (IP 라운지 일반) — 특허 전략 노트, AI와 IP 등
  if (categoryId === "CAT-B" || categoryId.startsWith("CAT-B-")) {
    return "PROMPT_LOUNGE_GENERAL";
  }

  // CAT-C (디딤 다이어리) — 에세이/일기
  if (categoryId === "CAT-C" || categoryId.startsWith("CAT-C-")) {
    return "PROMPT_DIARY";
  }

  // 기타 (매칭 안 되면 일반 라운지 폴백)
  return "PROMPT_LOUNGE_GENERAL";
}

// ── getFieldCta: 현장수첩 subCategory별 CTA 반환 ──

/**
 * 카테고리 + 키워드 기반 CTA 매칭.
 * 2차 분류 정확 매칭 → 키워드 기반 추론 → 1차 카테고리 폴백 → 범용.
 */
export function getFieldCta(
  categoryId: string,
  targetKeyword?: string
): { cta: string; emailSubject: string } {
  // 1) 2차 분류 정확 매칭
  if (FIELD_CTA[categoryId]) return FIELD_CTA[categoryId];

  // 2) 키워드 기반 추론 (2차 분류 ID가 없을 때)
  const kw = (targetKeyword ?? "").toLowerCase();
  if (kw.includes("절세") || kw.includes("세액공제") || kw.includes("법인세") || kw.includes("보상금")) {
    return FIELD_CTA["CAT-A-01"];
  }
  if (kw.includes("인증") || kw.includes("벤처") || kw.includes("이노비즈")) {
    return FIELD_CTA["CAT-A-02"];
  }
  if (kw.includes("연구소") || kw.includes("연구활동") || kw.includes("사후관리")) {
    return FIELD_CTA["CAT-A-03"];
  }
  if (kw.includes("출원") || kw.includes("상표") || kw.includes("특허출원") || kw.includes("pct")) {
    return FIELD_CTA["CAT-A-04"];
  }
  if (kw.includes("ai") || kw.includes("인공지능") || kw.includes("생성형")) {
    return FIELD_CTA["CAT-B-02"];
  }

  // 3) 1차 카테고리 폴백 — 해당 1차의 첫 번째 2차 CTA
  if (categoryId.startsWith("CAT-A")) return FIELD_CTA["CAT-A-04"]; // 출원 실무 (가장 범용)
  if (categoryId.startsWith("CAT-B")) return FIELD_CTA["CAT-B-01"]; // 전략 노트

  // 4) 범용
  return DEFAULT_CTA;
}
````

## 4. 원문 B: src/lib/client-generate.ts:1560-1583 (appendCtaAndSignature 의 CTA 블록 조립)
````ts
  // Disclaimer 자동 삽입 (before_cta 위치)
  const disclaimerText = params.disclaimerText?.trim() || "";

  const cta = params.ctaText?.trim() ||
    "관련해서 궁금하신 점이 있다면 admin@didimip.com 으로 편하게 연락주세요.";
  const subject = params.emailSubject?.trim() || "상담 문의";

  const disclaimerBlock = disclaimerText
    ? `\n\n${disclaimerText}\n`
    : "";

  const block = `
${disclaimerBlock}
━━━━━━━━━━━━━━━━━━
${cta}

특허그룹 디딤 | 기업을 아는 변리사
📞 02-571-6613
📧 admin@didimip.com (메일 제목: '${subject}')

${tagLine}`;

  return bodyWithoutTagsBlock.trimEnd() + block;
}
````

## 5. 원문 C: supabase/migrations/011_seed_cta_templates.sql
````sql
-- 011: CTA 템플릿 시드 데이터
-- cta_templates 테이블에 기본 4개 CTA 삽입 (없으면)

INSERT INTO cta_templates (key, category_name, text, note, conversion_method, email_subject_tag)
VALUES
  (
    '현장수첩_절세',
    '현장 수첩 · 절세 시뮬레이션',
    '━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''절세 시뮬레이션''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '절세 시뮬레이션'
  ),
  (
    '현장수첩_인증',
    '현장 수첩 · 인증 가이드',
    '━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''인증 진단''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '인증 진단'
  ),
  (
    '현장수첩_연구소',
    '현장 수첩 · 연구소 운영',
    '━━━━━━━━━━━━━━━━━━
연구소 운영 상태 점검, 무료 진단 가능합니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 ''연구소 진단''이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '연구소 진단'
  ),
  (
    'IP라운지',
    'IP 라운지',
    '━━━━━━━━━━━━━━━━━━
AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.

📞 02-571-6613
📧 admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사',
    NULL,
    '이메일',
    '상담 문의'
  )
ON CONFLICT (key) DO UPDATE
SET
  category_name = EXCLUDED.category_name,
  text = EXCLUDED.text,
  conversion_method = EXCLUDED.conversion_method,
  email_subject_tag = EXCLUDED.email_subject_tag;
````

## 6. 원문 D: publish-prep-client.tsx:49-210
````tsx
/**
 * 하드코딩 CTA 폴백 — cta_templates 테이블이 비어있을 때 사용.
 * key 는 categoryName 매칭에 사용 / text 는 실제 CTA 본문.
 */
const FALLBACK_CTA: Record<string, CtaTemplate> = {
  "현장수첩_절세": {
    key: "현장수첩_절세",
    categoryName: "현장 수첩 · 절세 시뮬레이션",
    text: `━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '절세 시뮬레이션'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "절세 시뮬레이션",
  },
  "현장수첩_인증": {
    key: "현장수첩_인증",
    categoryName: "현장 수첩 · 인증 가이드",
    text: `━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '인증 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "인증 진단",
  },
  "현장수첩_출원": {
    key: "현장수첩_출원",
    categoryName: "현장 수첩 · 특허·상표 출원 실무",
    text: `━━━━━━━━━━━━━━━━━━
출원 전략이 궁금하시면 편하게 연락 주세요.
기술 내용을 보내주시면 출원 가능성과 전략을 검토해 드립니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '출원 상담'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "출원 상담",
  },
  "현장수첩_연구소": {
    key: "현장수첩_연구소",
    categoryName: "현장 수첩 · 연구소 운영",
    text: `━━━━━━━━━━━━━━━━━━
연구소 운영 상태 점검, 무료 진단 가능합니다.

📞 02-571-6613
📧 admin@didimip.com (메일 제목에 '연구소 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "연구소 진단",
  },
  "IP라운지": {
    key: "IP라운지",
    categoryName: "IP 라운지",
    text: `━━━━━━━━━━━━━━━━━━
AI·IP 전략이 궁금하신 대표님, 편하게 연락 주세요.

📞 02-571-6613
📧 admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사`,
    note: null,
    conversionMethod: "이메일",
    emailSubjectTag: "상담 문의",
  },
};

/** 키워드 → CTA key 매핑 (정규식 기반) */
const CTA_KEYWORD_MAP: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /절세|세액공제|법인세|직무발명보상|비과세|보상금/i, key: "현장수첩_절세" },
  { pattern: /출원|상표|특허출원|등록|심사|우선심사|pct|디자인출원/i, key: "현장수첩_출원" },
  { pattern: /인증|벤처|이노비즈|메인비즈/i, key: "현장수첩_인증" },
  { pattern: /연구소|연구전담|koita|사후관리|연구활동/i, key: "현장수첩_연구소" },
  { pattern: /ai|인공지능|저작권|생성형/i, key: "IP라운지" },
  { pattern: /특허전략|포트폴리오|ip전략|기술가치/i, key: "IP라운지" },
  { pattern: /뉴스|분쟁|판례|정책변화/i, key: "IP라운지" },
];

/** CTA 매칭: 키워드 → 카테고리 → 범용 순서로 가장 적합한 CTA 선택 */
function matchCtaForContent(
  content: Content,
  categories: Category[],
  ctaTemplates: CtaTemplate[]
): CtaTemplate | null {
  // 디딤 다이어리: CTA 없음
  if (
    content.category_id === "CAT-C" ||
    content.category_id?.startsWith("CAT-C-")
  ) {
    return null;
  }

  // cta_templates + fallback 합산 pool (중복 key 제거, DB 우선)
  const pool: CtaTemplate[] = [...ctaTemplates, ...Object.values(FALLBACK_CTA)];
  const deduped = new Map<string, CtaTemplate>();
  for (const t of pool) deduped.set(t.key, deduped.get(t.key) ?? t);
  const allTemplates = Array.from(deduped.values());

  const kw = (content.target_keyword ?? "").toLowerCase();
  const catId = content.category_id ?? "";

  // 1순위: 키워드 기반 매칭
  if (kw) {
    for (const { pattern, key } of CTA_KEYWORD_MAP) {
      if (pattern.test(kw)) {
        const match = allTemplates.find((t) => t.key === key);
        if (match) {
          console.log("[CTA 매칭] 키워드:", kw, "→", key);
          return match;
        }
      }
    }
  }

  // 2순위: secondary_category ID 정확 매칭
  if (content.secondary_category) {
    const subId = content.secondary_category;
    if (subId === "CAT-A-01") return allTemplates.find((t) => t.key.includes("절세")) ?? null;
    if (subId === "CAT-A-02") return allTemplates.find((t) => t.key.includes("인증")) ?? null;
    if (subId === "CAT-A-03") return allTemplates.find((t) => t.key.includes("연구소")) ?? null;
    if (subId === "CAT-A-04") return allTemplates.find((t) => t.key.includes("출원")) ?? null;
    if (subId.startsWith("CAT-B")) return allTemplates.find((t) => t.key.includes("IP라운지") || t.key.includes("IP 라운지")) ?? null;
  }

  // 3순위: categoryName 부분 매칭 (DB 템플릿의 categoryName 에서 1차 카테고리 포함 검색)
  const category = categories.find((c) => c.id === catId);
  if (category) {
    // "변리사의 현장 수첩" → "현장 수첩" 으로 정규화
    const catName = category.name.replace(/변리사의\s*/, "").trim().toLowerCase();
    const partial = allTemplates.find((t) =>
      t.categoryName.toLowerCase().includes(catName.slice(0, 4))
    );
    if (partial) {
      console.log("[CTA 매칭] 카테고리 부분:", catName, "→", partial.key);
      return partial;
    }
  }

  // 4순위: 1차 카테고리 ID 기반 범용
  if (catId.startsWith("CAT-A")) {
    return allTemplates.find((t) => t.key.includes("출원")) ?? allTemplates[0] ?? null;
  }
  if (catId.startsWith("CAT-B")) {
    return allTemplates.find((t) => t.key.includes("IP라운지")) ?? allTemplates[0] ?? null;
  }

  // 5순위: 아무 템플릿이라도 (CTA 없는 것보다 나음)
  console.log("[CTA 매칭] 범용 폴백");
  return allTemplates[0] ?? null;
}
````

## 7. 원문 E: seed_data/cta_templates.json
````json
{
  "현장수첩_절세": {
    "text": "━━━━━━━━━━━━━━━━━━\n\"우리 회사도 가능할까?\" 궁금하시다면 재무제표를 보내주세요.\n48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)\n\nTel: 02-571-6613\nMail: admin@didimip.com\n(메일 제목에 '절세 시뮬레이션'이라고 적어주세요)\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "conversion_method": "이메일로 재무제표 수신 → 48시간 내 시뮬레이션 회신 → 유선 상담 제안 → 계약",
    "email_subject_tag": "절세 시뮬레이션"
  },
  "현장수첩_인증": {
    "text": "━━━━━━━━━━━━━━━━━━\n우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.\n아래 연락처로 문의 주시면 무료 진단을 도와드리겠습니다.\n\nTel: 02-571-6613\nMail: admin@didimip.com\n(메일 제목에 '인증 진단'이라고 적어주세요)\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "conversion_method": "이메일/전화 문의 → 3일 내 팔로업 → 무료 진단 → 계약",
    "email_subject_tag": "인증 진단"
  },
  "현장수첩_연구소": {
    "text": "━━━━━━━━━━━━━━━━━━\n연구소 운영 상태가 괜찮은지 궁금하시다면, 무료 진단을 도와드리겠습니다.\n아래 연락처로 문의해주세요.\n\nTel: 02-571-6613\nMail: admin@didimip.com\n(메일 제목에 '연구소 진단'이라고 적어주세요)\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "conversion_method": "이메일/전화 문의 → 3일 내 팔로업 → 무료 진단 → 계약",
    "email_subject_tag": "연구소 진단"
  },
  "IP라운지": {
    "text": "━━━━━━━━━━━━━━━━━━\n이런 IP 이야기가 도움이 되셨다면 디딤 블로그를 이웃 추가해주세요.\n매주 화요일, 중소기업 대표님께 실질적인 IP 정보를 전해드립니다.\n\nIP 관련 상담이 필요하시면: admin@didimip.com\n\n특허그룹 디딤 | 기업을 아는 변리사",
    "conversion_method": "이웃 추가 유도 + 이메일 안내 → 장기 관계 유지",
    "email_subject_tag": null
  },
  "디딤다이어리": {
    "text": null,
    "note": "이 카테고리는 CTA를 넣지 않는다. 자연스러운 글에 CTA가 붙으면 진정성이 훼손된다. 사이드바 프로필/공지사항의 상담 안내로 자연 유도.",
    "conversion_method": "사이드바/프로필의 상담 안내로 자연 유도",
    "email_subject_tag": null
  }
}
````

## 8. 원문 F: docs/UPGRADE_SPEC.md:337-402
````md
### 5.2 CTA 템플릿 (카테고리·2차분류별)

```typescript
export const CTA_TEMPLATES = {
  TAX_SIM: `━━━━━━━━━━━━━━━━━━
"우리 회사도 가능할까?" 궁금하시다면 재무제표를 보내주세요.
48시간 안에 절세 시뮬레이션을 만들어 드립니다. (무료)

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '절세 시뮬레이션'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  CERT_DIAG: `━━━━━━━━━━━━━━━━━━
우리 회사가 인증 요건에 해당하는지 5분이면 확인할 수 있습니다.
아래 연락처로 문의 주시면 무료 진단을 도와드리겠습니다.

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '인증 진단'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  LAB_MGMT: `━━━━━━━━━━━━━━━━━━
연구소 운영 상태가 걱정되시나요?
사후관리 점검을 무료로 도와드립니다.

Tel: 000-0000-0000
Mail: admin@didimip.com
(메일 제목에 '연구소 점검'이라고 적어주세요)

특허그룹 디딤 | 기업을 아는 변리사`,

  NEIGHBOR: `━━━━━━━━━━━━━━━━━━
이런 IP 이야기가 도움이 되셨다면 디딤 블로그를 이웃 추가해주세요.
매주 화요일, 중소기업 대표님께 실질적인 IP 정보를 전해드립니다.

IP 관련 상담이 필요하시면: admin@didimip.com

특허그룹 디딤 | 기업을 아는 변리사`,

  NONE: '',  // 디딤 다이어리용
} as const;
```

### 5.3 프롬프트 키 매핑

```typescript
export function getPromptKey(category: string, subCategory: string): string {
  if (category === '변리사의 현장 수첩') return 'PROMPT_FIELD';
  if (category === 'IP 라운지' && subCategory === 'IP 뉴스 한 입') return 'PROMPT_LOUNGE_BITE';
  if (category === 'IP 라운지') return 'PROMPT_LOUNGE_GENERAL';
  if (category === '디딤 다이어리') return 'PROMPT_DIARY';
  return 'PROMPT_FIELD';
}

export function getCTAType(category: string, subCategory: string): string {
  if (category === '디딤 다이어리') return 'NONE';
  if (category === 'IP 라운지') return 'NEIGHBOR';
  if (subCategory === '절세 시뮬레이션') return 'TAX_SIM';
  if (subCategory === '인증 가이드') return 'CERT_DIAG';
  if (subCategory === '연구소 운영 실무') return 'LAB_MGMT';
  return 'NEIGHBOR';
}
```
````
