# AI 에디터 간이 SEO 체크 원문

원본: `src/app/(dashboard)/contents/ai-editor/[id]/ai-editor-client.tsx` — 로컬 함수 `calculateSeoScore(title, text, keyword)` (L541-614)와 `extractImageMarkers` (L485-538, 함수 본체 L501).
스크립트: `scripts/seo_editor_check.py` (원본과 대조 일치).

## 용도 (코드에서 확인)
- Phase 2 완료 직후 점수(`seoScoreBeforePhase3`)로 Phase 3 전/후 비교에 사용 (L867-868).
- 초안 확정(Finalization) 때 `contents.seo_score` 로 **저장되는 값**이 이 간이 점수다 (L1022-1048). 이후 콘텐츠 상세에서 저장 버튼을 누르면 seo-calculator 의 normalizedScore 로 덮어쓴다.
- 에디터 화면의 SEO 체크 패널 (L1248).

## 규칙 요약
8개 항목, 같은 비중. `score = round(통과 수 / 8 × 100)`. 카테고리 구분 없음(다이어리도 CTA 있어야 통과로 계산됨).

| 항목 | 통과 조건 |
|---|---|
| 제목 길이 25~30자 | 25 ≤ title.length ≤ 30 |
| 키워드 앞 15자 | 제목 앞 15자에 키워드 포함, 또는 키워드가 비어 있음 |
| 본문 키워드 3~5회 | **대소문자 구분** 출현 수 3~5 (seo-calculator 는 대소문자 무시) |
| 소제목(##) 2개 이상 | 줄 맨 앞 `##` + 공백 (`###` 은 세지 않음) |
| 이미지 마커 3개 이상 | 박스형(`[IMAGE: …]` 다음에 `━━` 줄) + 한 줄형 마커 수 |
| 본문 1,500~2,500자 | 공백 제외 글자수 |
| 태그 10개 | 본문의 `#태그` 패턴 수 ≥ **8** (라벨은 10개) |
| CTA 배치 | 본문에 "절세 시뮬레이션" / "연락" / "상담" / "이웃" 중 하나 포함 |

## 원문

```ts
/**
 * 본문에서 이미지 마커를 추출 — 박스 형식과 단순 형식 모두 지원.
 *
 * 박스 형식 (PHASE2/VISUAL_RULES 표준):
 *   ━━ 📷 이미지 N ━━
 *   [IMAGE: 한국어 설명 | 유형(A~H) |
 *   (1) 한국어: ...
 *   (2) English: ...]
 *   ━━━━━━━━━━━━━━
 *
 * 단순 형식 (다이어리 등):
 *   [IMAGE: 분위기 묘사]
 *
 * 기존 정규식 /\[IMAGE:\s*(.+?)\]/g 은 single-line 매칭이라 박스 형식에서
 * description 안에 줄바꿈이 들어가면 매칭 실패 → 마커 0개로 인식되는 버그.
 */
function extractImageMarkers(text: string): ExtractedImageMarker[] {
  const markers: ExtractedImageMarker[] = [];

  // 1) 박스 형식: [IMAGE: ...] 다음에 ━━ 가 오는 multi-line 매칭
  // ([\s\S]*?) 로 줄바꿈 포함 + 닫는 ] 직후 ━━ 구분선이 와야 함
  // (description 안의 임의의 [type] 같은 nested ] 와 충돌하지 않음)
  // ⚠️ description 은 절대 slice 하지 말 것 — 한국어 + 영문 풀 프롬프트가 들어 있고,
  // slice 가 한글/이모지 character boundary 를 깨면 unpaired surrogate 가 생겨
  // PostgREST 가 PGRST102 (Empty or invalid json) 로 INSERT 를 거부함.
  const boxRe = /\[IMAGE:\s*([\s\S]*?)\]\s*\n\s*━━/g;
  let m: RegExpExecArray | null;
  while ((m = boxRe.exec(text)) !== null) {
    markers.push({
      position: m.index,
      description: m[1].trim(),
      // rawText 는 [IMAGE:..] 까지만 (구분선 제외) — 이후 본문에서 indexOf 로 찾기 위함
      rawText: text.slice(m.index, m.index + m[0].length).replace(/\s*\n\s*━━$/, ""),
    });
  }

  // 2) 단순 형식: 한 줄짜리 [IMAGE: ...] (박스 형식과 위치 겹치지 않는 것만)
  const simpleRe = /\[IMAGE:\s*([^\]\n]+?)\]/g;
  while ((m = simpleRe.exec(text)) !== null) {
    const idx = m.index;
    const overlap = markers.some(
      (mk) => idx >= mk.position && idx < mk.position + mk.rawText.length
    );
    if (overlap) continue;
    markers.push({
      position: idx,
      description: m[1].trim(),
      rawText: m[0],
    });
  }

  markers.sort((a, b) => a.position - b.position);
  return markers;
}

// 간이 SEO 체크
function calculateSeoScore(title: string, text: string, keyword: string) {
  const checks: { label: string; passed: boolean; detail: string }[] = [];

  // 제목 길이
  const titleLen = title.length;
  checks.push({
    label: "제목 길이 25~30자",
    passed: titleLen >= 25 && titleLen <= 30,
    detail: `${titleLen}자`,
  });

  // 제목 키워드 앞 15자
  const keywordInFirst15 = title.substring(0, 15).includes(keyword);
  checks.push({
    label: "키워드 앞 15자",
    passed: keywordInFirst15 || keyword.length === 0,
    detail: keywordInFirst15 ? "포함됨" : "미포함",
  });

  // 본문 키워드 횟수
  const keywordCount = keyword
    ? (text.match(new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length
    : 0;
  checks.push({
    label: "본문 키워드 3~5회",
    passed: keywordCount >= 3 && keywordCount <= 5,
    detail: `${keywordCount}회`,
  });

  // 소제목 개수
  const headingCount = (text.match(/^##\s/gm) || []).length;
  checks.push({
    label: "소제목(##) 2개 이상",
    passed: headingCount >= 2,
    detail: `${headingCount}개`,
  });

  // 이미지 마커 — 박스 형식 (multi-line) + 단순 형식 모두 카운트
  const imageMarkers = extractImageMarkers(text).length;
  checks.push({
    label: "이미지 마커 3개 이상",
    passed: imageMarkers >= 3,
    detail: `${imageMarkers}개`,
  });

  // 본문 분량
  const charCount = text.replace(/\s/g, "").length;
  checks.push({
    label: "본문 1,500~2,500자",
    passed: charCount >= 1500 && charCount <= 2500,
    detail: `${charCount.toLocaleString()}자`,
  });

  // 태그 확인 (#태그)
  const tagCount = (text.match(/#[^\s#]+/g) || []).length;
  checks.push({
    label: "태그 10개",
    passed: tagCount >= 8,
    detail: `${tagCount}개`,
  });

  // CTA 존재 여부
  const hasCta = text.includes("절세 시뮬레이션") || text.includes("연락") || text.includes("상담") || text.includes("이웃");
  checks.push({
    label: "CTA 배치",
    passed: hasCta,
    detail: hasCta ? "있음" : "없음",
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const score = Math.round((passedCount / checks.length) * 100);

  return { checks, score, passedCount, totalCount: checks.length };
}
```

### 호출부 발췌 (L860-870, L1015-1050)

```ts

      if (isMounted.current) {
        setGeneratedText(phase2Body);
        setGeneratedTitle(title);
        setEditTitle(title);
        setStatus("completed");
        setPipelinePhase("phase3"); // Phase 3 트리거 가능 상태
        const seoNow = calculateSeoScore(title, phase2Body, targetKeyword || "").score;
        setSeoScoreBeforePhase3(seoNow);
        // 교차검증 전에 본문에 문단 ID 주입
        // ⚠️ phase2Body 를 직접 사용해야 함. editText 는 stale closure 로 아직 이전 값임.
// ...
      console.log("[Finalization] 시작 — 본문/태그/발행일/SEO 자동 저장");
      const finalizationErrors: string[] = [];

      try {
        // 문단 ID 제거한 본문 저장
        const bodyForDb = stripParagraphIds(finalBody);

        // SEO 점수 재계산 (로컬 calculateSeoScore 사용)
        const seoCalc = calculateSeoScore(editTitle, bodyForDb, targetKeyword);
        const seoScore = seoCalc.score;

        // 발행예정일 — 기존에 없으면 다음 화요일 자동 배정
        const { getNextTuesday } = await import("@/lib/utils/date-helpers");
        const nextTue = getNextTuesday().toISOString().slice(0, 10);

        const saveResult = await saveAiDraftToContent(
          currentGenerationId,
          {
            title: editTitle,
            body: bodyForDb,
            tags: autoTags,
            keyword: targetKeyword || undefined,
          }
        );

        if (!saveResult.success || !saveResult.contentId) {
          finalizationErrors.push(`본문 저장: ${saveResult.error ?? "알 수 없는 오류"}`);
          console.error("[Finalization] 본문 저장 실패:", saveResult.error);
        } else {
          // 추가 필드 업데이트 (SEO, 발행일)
          const { updateContent: updateFn } = await import("@/actions/contents");
          const { error: updateErr } = await updateFn(saveResult.contentId, {
            seo_score: seoScore,
            publish_date: nextTue,
          });
          if (updateErr) {
```
