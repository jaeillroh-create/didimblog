# 발행 준비 화면 규칙 (publish-prep-client.tsx · page.tsx)

> 출처: src/app/(dashboard)/contents/[id]/publish/page.tsx, publish-prep-client.tsx(829행).

## 목차
1. 화면 구성과 복사 항목 (원문 문구)
2. 발행 전 체크리스트 7개 (원문)
3. CTA 매칭 규칙 (1순위 키워드 → 5순위 범용)
4. 면책조항 선택
5. 태그 칩 상태
6. 상태(S0~S5) 조건
7. 원문: page.tsx
8. 원문: publish-prep-client.tsx 43-379행 (로직 전체)

## 1. 화면 구성과 복사 항목 (왼쪽 메인 → 오른쪽 사이드바 순)
| # | 카드 | 복사 버튼 라벨 → 복사 내용 | 표시·안내 문구(원문) | 근거(행) |
|---|---|---|---|---|
| 1 | 제목 | "제목 복사" → content.title | 제목 + "N자", 없으면 "제목 없음" | 415-438 |
| 2 | 본문 | "서식 포함 복사" → text/html=markdownToHtml(body) + text/plain=stripMarkdown(body) (실패 시 텍스트만, 토스트 "텍스트 복사 완료 (서식 미지원 브라우저)") / "텍스트만 복사" → stripMarkdown(body) | 미리보기 + "N자", 없으면 "본문이 없습니다" | 296-312, 440-482 |
| 2-1 | 표 데이터 | "표 데이터 복사 (N개)" → 표 TSV 들을 빈 줄로 연결 | "네이버 에디터에서 표 삽입 후 붙여넣기하세요" | 468-480 |
| 3 | 면책조항 (level≠none 이고 문구가 있을 때만) | "면책조항 복사" | "Level X" 배지, "면책조항 레벨 변경" 드롭다운 `Level X — 라벨 (자동 선택)` | 484-537 |
| 4 | CTA (다이어리 제외) | "CTA 복사" → enforceEmail(템플릿 text) | 제목 옆 (categoryName), 없으면 "이 카테고리에 매칭되는 CTA 템플릿이 없습니다.", note 있으면 "참고: …", 템플릿 2개 이상이면 "다른 CTA 템플릿 선택" 드롭다운 | 539-603 |
| 4' | 다이어리 안내 | (복사 없음) | "디딤 다이어리는 CTA를 넣지 않습니다. 상업적 CTA가 진정성을 훼손할 수 있습니다." | 605-614 |
| 5 | 태그 | "태그 복사" → formatTagsForNaver(tags) | 칩 목록, 태그 문자열, "N/100자 · M개"(100자 초과면 빨강), 없으면 "태그가 없습니다. 콘텐츠 상세에서 추가해주세요." | 616-667 |
| 6 | 이미지 가이드 | "ALT 텍스트 전체 복사" → 설명들을 줄바꿈으로 연결 | "#N 설명" + "ALT: 설명", 없으면 "본문에 [IMAGE: 설명] 마커가 없습니다." | 669-712 |
| 7 | 포맷 가이드 (사이드바) | "복사" → generateFormatGuide(secondary‖category) | 미리보기 | 717-737 |
| 8 | 발행 체크리스트 (사이드바) | - | 7개 체크박스, "N/7 완료" | 739-791 |
| 9 | 콘텐츠 정보 (사이드바) | - | 카테고리 / 타겟 키워드 / 발행예정일 / 본문 글자수(원본 body 길이) | 793-824 |

모든 단순 복사 버튼은 CopyButton → `navigator.clipboard.writeText` (순수 텍스트), 성공 시 "복사됨" 2초 표시(components/common/copy-button.tsx). 예외는 본문 "서식 포함 복사"(HTML 포함).

## 2. 발행 전 체크리스트 7개 (publish-prep-client.tsx:212-221 원문)
| id | label |
|---|---|
| title | 제목 복사 완료 |
| body | 본문 복사 & 붙여넣기 완료 |
| images | 이미지 삽입 완료 (ALT 텍스트 포함) |
| cta | CTA 복사 & 배치 완료 |
| tags | 태그 10개 입력 완료 |
| format | 네이버 에디터 포맷 적용 완료 |
| preview | 미리보기 확인 완료 |

7개 모두 체크해야 "발행 완료 (S3→S4)" 버튼이 활성화된다. 미완료 클릭 시 "모든 체크리스트를 완료해주세요". 다이어리도 'cta' 항목은 그대로 있다(코드 그대로).
UPGRADE_SPEC §8.1 의 체크리스트 7개는 문구가 다르다 → upgrade-spec-s8.md.

## 3. CTA 매칭 규칙 — matchCtaForContent (140-210행)
0. `category_id`(1차)가 `CAT-C` 또는 `CAT-C-*` → CTA 없음(null).
- 후보 목록 = DB cta_templates(key 오름차순: IP라운지, 현장수첩_연구소, 현장수첩_인증, 현장수첩_절세) 뒤에 FALLBACK_CTA(현장수첩_절세, 현장수첩_인증, 현장수첩_출원, 현장수첩_연구소, IP라운지) — 같은 key 는 앞(DB) 것만 남김 → 실제 순서: IP라운지, 현장수첩_연구소, 현장수첩_인증, 현장수첩_절세, 현장수첩_출원.
1. **1순위 키워드**: target_keyword 를 소문자로 바꿔 아래 정규식을 위에서부터 검사, 처음 맞는 key 의 템플릿.
   | 정규식(대소문자 무시) | key |
   |---|---|
   | `절세\|세액공제\|법인세\|직무발명보상\|비과세\|보상금` | 현장수첩_절세 |
   | `출원\|상표\|특허출원\|등록\|심사\|우선심사\|pct\|디자인출원` | 현장수첩_출원 |
   | `인증\|벤처\|이노비즈\|메인비즈` | 현장수첩_인증 |
   | `연구소\|연구전담\|koita\|사후관리\|연구활동` | 현장수첩_연구소 |
   | `ai\|인공지능\|저작권\|생성형` | IP라운지 |
   | `특허전략\|포트폴리오\|ip전략\|기술가치` | IP라운지 |
   | `뉴스\|분쟁\|판례\|정책변화` | IP라운지 |
   부분 문자열 일치이므로 "등록"·"심사"·"ai" 처럼 짧은 패턴이 넓게 걸린다(예: "벤처인증 등록" → 출원 CTA, 순서상 출원이 인증보다 앞).
2. **2순위 secondary_category**: CAT-A-01 → key 에 "절세", CAT-A-02 → "인증", CAT-A-03 → "연구소", CAT-A-04 → "출원", CAT-B* → "IP라운지"/"IP 라운지" 포함 템플릿. (찾지 못하면 null 로 끝남 — 다음 순위로 넘어가지 않음)
3. **3순위 카테고리 이름 부분 일치**: 1차 카테고리 이름에서 "변리사의 " 제거 → 소문자 → 앞 4글자가 템플릿 categoryName(소문자)에 포함된 첫 템플릿. 예: "현장 수첩"→"현장 수" → DB 가 있으면 **현장수첩_연구소**(목록상 첫 '현장 수…'), DB 가 비면 현장수첩_절세. "IP 라운지"→"ip 라" → IP라운지.
4. **4순위**: category_id 가 CAT-A* → key 에 "출원" 포함(없으면 첫 템플릿), CAT-B* → "IP라운지" 포함.
5. **5순위**: 목록의 첫 템플릿 (DB 있으면 IP라운지, 없으면 현장수첩_절세).
- 사용자가 드롭다운에서 고른 key 가 있으면 그것이 우선. 최종 CTA 텍스트는 enforceEmail 적용.

## 4. 면책조항 선택 (237-252행)
자동 = determineDisclaimerLevel({categoryId: secondary_category‖category_id, body, isAiGenerated: content.is_ai_generated}). 드롭다운으로 바꾸면 getDisclaimerText(선택 레벨, is_ai_generated). 레벨·문구 원문은 didim-blog-core 의 references/disclaimers.md (이 스킬의 scripts 에도 동일 문구 내장).

## 5. 태그 칩 상태 (635-651행)
i번째 태그에 대해 앞 i개까지의 태그 문자열 길이를 비교: 이미 100자 이상이면 "제외(회색 취소선)", 이 태그를 넣는 순간 100자를 넘으면 "초과(빨강)", 나머지 "정상(파랑)".

## 6. 상태 조건
- status 가 S3/S4/S5 가 아니면 상단 배너: "미리보기 모드 — 현재 상태가 {상태 라벨}이므로 본문/CTA/태그 확인 및 복사만 가능합니다. 발행 완료 처리는 S3(발행예정) 이상에서 활성화됩니다." 그리고 체크리스트 아래 "발행 완료 전환은 S3(발행예정) 이상에서만 가능합니다."
- "발행 완료 (S3→S4)" → updateContentStatus(id, "S4") (상태 전이 규칙 검증은 didim-blog-ops). 성공 토스트 "발행 완료! 상태: 발행완료".
- 삭제된 글(is_deleted)·없는 글은 ContentNotFound.

## 7. 원문: page.tsx
````tsx
import { createClient } from "@/lib/supabase/server";
import { getCtaTemplates } from "@/actions/settings";
import type { Content, Category } from "@/lib/types/database";
import { ContentNotFound } from "../content-not-found";
import { PublishPrepClient } from "./publish-prep-client";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PublishPrepPage({ params }: PageProps) {
  const { id } = await params;

  let content: Content | null = null;
  let categories: Category[] = [];

  try {
    const supabase = await createClient();

    const [contentRes, categoriesRes] = await Promise.all([
      supabase.from("contents").select("*").eq("id", id).single(),
      supabase.from("categories").select("*").order("sort_order"),
    ]);

    if (contentRes.data) {
      const c = contentRes.data as Content;
      if (c.is_deleted) {
        content = null;
      } else {
        content = c;
      }
    }
    if (categoriesRes.data) categories = categoriesRes.data as Category[];
  } catch {
    console.log("Supabase 연결 실패");
  }

  if (!content) {
    return <ContentNotFound />;
  }

  // CTA 템플릿 조회 (site_settings 기반)
  const { data: ctaTemplates } = await getCtaTemplates();

  return (
    <PublishPrepClient
      content={content}
      categories={categories}
      ctaTemplates={ctaTemplates}
    />
  );
}
````

## 8. 원문: publish-prep-client.tsx 43-379행
````tsx
interface PublishPrepClientProps {
  content: Content;
  categories: Category[];
  ctaTemplates: CtaTemplate[];
}

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

// 발행 체크리스트 7항목
const PUBLISH_CHECKLIST = [
  { id: "title", label: "제목 복사 완료" },
  { id: "body", label: "본문 복사 & 붙여넣기 완료" },
  { id: "images", label: "이미지 삽입 완료 (ALT 텍스트 포함)" },
  { id: "cta", label: "CTA 복사 & 배치 완료" },
  { id: "tags", label: "태그 10개 입력 완료" },
  { id: "format", label: "네이버 에디터 포맷 적용 완료" },
  { id: "preview", label: "미리보기 확인 완료" },
];

export function PublishPrepClient({
  content,
  categories,
  ctaTemplates,
}: PublishPrepClientProps) {
  const router = useRouter();
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [isTransitioning, setIsTransitioning] = useState(false);

  // 카테고리 정보
  const category = categories.find((c) => c.id === content.category_id);
  const effectiveCategoryId =
    content.secondary_category || content.category_id || "";

  // Disclaimer 자동 매칭
  const autoDisclaimer = useMemo(
    () =>
      determineDisclaimerLevel({
        categoryId: effectiveCategoryId,
        body: content.body ?? "",
        isAiGenerated: content.is_ai_generated,
      }),
    [effectiveCategoryId, content.body, content.is_ai_generated]
  );
  const [disclaimerOverride, setDisclaimerOverride] = useState<DisclaimerLevel | null>(null);
  const activeDisclaimerLevel = disclaimerOverride ?? autoDisclaimer.level;
  const activeDisclaimerText = useMemo(
    () => getDisclaimerText(activeDisclaimerLevel, content.is_ai_generated),
    [activeDisclaimerLevel, content.is_ai_generated]
  );

  // CTA 매칭: 카테고리 기반 + 하드코딩 폴백
  const autoMatchedCta = useMemo(
    () => matchCtaForContent(content, categories, ctaTemplates),
    [content, categories, ctaTemplates]
  );

  // CTA 수동 선택 오버라이드
  const [ctaOverrideKey, setCtaOverrideKey] = useState<string | null>(null);

  // 전체 사용 가능한 CTA 목록 (DB + fallback, 중복 제거)
  const allCtaOptions = useMemo(() => {
    const map = new Map<string, CtaTemplate>();
    for (const t of ctaTemplates) map.set(t.key, t);
    for (const [k, v] of Object.entries(FALLBACK_CTA)) {
      if (!map.has(k)) map.set(k, v);
    }
    return Array.from(map.values());
  }, [ctaTemplates]);

  const matchedCta = useMemo(() => {
    if (ctaOverrideKey) {
      return allCtaOptions.find((t) => t.key === ctaOverrideKey) ?? autoMatchedCta;
    }
    return autoMatchedCta;
  }, [ctaOverrideKey, allCtaOptions, autoMatchedCta]);

  // CTA 텍스트 (이메일 강제 치환 적용)
  const ctaText = useMemo(() => {
    if (!matchedCta?.text) return null;
    return enforceEmail(matchedCta.text);
  }, [matchedCta]);

  // 본문 → 네이버용 텍스트 + HTML
  const strippedBody = useMemo(
    () => stripMarkdown(content.body ?? ""),
    [content.body]
  );
  const htmlBody = useMemo(
    () => markdownToHtml(content.body ?? ""),
    [content.body]
  );

  // 리치 텍스트(HTML) 클립보드 복사
  const copyRichText = useCallback(async () => {
    try {
      const htmlBlob = new Blob([htmlBody], { type: "text/html" });
      const textBlob = new Blob([strippedBody], { type: "text/plain" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      toast.success("서식 포함 복사 완료");
    } catch {
      await navigator.clipboard.writeText(strippedBody);
      toast.success("텍스트 복사 완료 (서식 미지원 브라우저)");
    }
  }, [htmlBody, strippedBody]);

  // 표 데이터 (탭 구분)
  const tableTsvs = useMemo(
    () => extractTablesAsTabSeparated(content.body ?? ""),
    [content.body]
  );

  // 포맷 가이드
  const formatGuide = useMemo(
    () => generateFormatGuide(effectiveCategoryId),
    [effectiveCategoryId]
  );

  // 이미지 가이드
  const imageMarkers = useMemo(
    () => generateImageGuide(content.body ?? ""),
    [content.body]
  );

  // 태그 텍스트 (네이버 #태그 형식, 100자 이내)
  const tagsText = useMemo(() => {
    if (!content.tags || content.tags.length === 0) return "";
    return formatTagsForNaver(content.tags);
  }, [content.tags]);

  // ALT 텍스트 (이미지 마커 기반)
  const altTexts = useMemo(() => {
    return imageMarkers.map((m) => m.description);
  }, [imageMarkers]);

  // 체크리스트 핸들러
  const handleCheckToggle = useCallback((id: string, checked: boolean) => {
    setChecklist((prev) => ({ ...prev, [id]: checked }));
  }, []);

  const allChecked = PUBLISH_CHECKLIST.every(
    (item) => checklist[item.id] === true
  );

  // "발행 완료" 상태 전이 (S3→S4)
  const handlePublishComplete = useCallback(async () => {
    if (!allChecked) {
      toast.error("모든 체크리스트를 완료해주세요");
      return;
    }
    setIsTransitioning(true);
    try {
      const newStatus: ContentStatus = "S4";
      const { error } = await updateContentStatus(content.id, newStatus);
      if (error) {
        toast.error(error, { duration: 8000 });
        return;
      }
      toast.success(
        `발행 완료! 상태: ${CONTENT_STATES[newStatus]?.label ?? newStatus}`
      );
      router.push(`/contents/${content.id}`);
    } catch {
      toast.error("상태 변경에 실패했습니다");
    } finally {
      setIsTransitioning(false);
    }
  }, [allChecked, content.id, router]);

  const isDiary =
    content.category_id === "CAT-C" ||
    content.category_id?.startsWith("CAT-C-");
````
