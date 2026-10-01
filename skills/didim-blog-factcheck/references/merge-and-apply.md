# 결과 병합·본문 교체 규칙 원문

교차검증 결과를 묶고(병합), 카드별로 단순 치환/문단 재작성 경로를 고르고, 본문에 정밀 교체하는 코드 원문.
스크립트 포팅: `scripts/merge_issues.py`(병합·분류), `scripts/apply_fix.py`(교체·문단 ID).

## 목차
1. 요약 규칙 (먼저 읽기)
2. cross-llm-validation-panel.tsx — severity 스타일·카테고리 표시·재작성 판정·문단 찾기·그룹화 (L70-243)
3. cross-llm-validation-panel.tsx — 반영/재작성/무시/되돌리기 핸들러 (L393-555)
4. ai-editor-client.tsx — fuzzyApplyFix (L106-298)
5. ai-editor-client.tsx — fuzzyApplyParagraph (L307-483)
6. ai-editor-client.tsx — applyFixToBody / applyParagraphToBody / undo (L1075-1185)
7. utils/paragraph-ids.ts (전체)

## 1. 요약 규칙

**병합 (groupRows)**
- 성공한 패스의 issue 를 모두 평탄화 → `original_text` 를 공백 정규화·trim·앞 60자·소문자화한 키로 묶는다. original_text 가 없으면 `noref-{provider}:{index}` 로 단독 그룹.
- 그룹 대표(primary) = severity weight(high 3 > medium 2 > low 1)가 가장 높은 행(동률이면 먼저 나온 행).
- 서로 다른 패스 2개 이상이 같은 키를 지적하면(정확히는 행이 2개 이상이면) effectiveSeverity 를 한 단계 상향(low→medium→high, high 유지). 라벨 옆에 ⬆ 표시.
- 카운트는 pending 그룹만 effectiveSeverity 로 집계. 모든 그룹이 반영/무시되어야(또는 지적 0건이어야) "Phase 3 진행" 가능.

**카테고리 표시 (normalizeCategoryDisplay)**

| 내부 category | 표시 라벨 |
|---|---|
| 숫자팩트, 숫자일관, 숫자(구) | 숫자 오류 |
| 숫자완화 | 표현 완화 |
| 법률팩트 | 법률팩트 |
| 광고규정 | 광고규정 |
| 기관명 | 기관명 |
| 그 외(단정·출처·논리 등) | category 그대로 |

**단순 치환 vs 문단 재작성 (needsParagraphRewrite)** — 위에서부터 순서대로 판정
1. category ∈ {숫자팩트, 숫자일관, 숫자완화, 숫자, 법률팩트, 기관명} → 단순 치환(false)
2. severity 가 high 또는 medium → 재작성(true)
3. category 에 논리/단정/출처/광고규정 포함 → 재작성
4. original_text 길이 대비 replacement_text 길이 차이 비율 ≥ 0.5 → 재작성
5. 그 외 → 단순 치환
- 판정은 **primary issue 의 원래 severity** 로 한다(상향된 effectiveSeverity 아님).

**단순 치환 (fuzzyApplyFix)** — original_text 와 replacement_text 에서 먼저 `<!--\s*p:\d+\s*-->\n?`(가짜 문단 ID 포함)를 모두 지운다.
1. exact: 본문에 그대로 있으면 첫 출현만 교체
2. (본문에 문단 ID 가 있으면) 문단 ID 로 문단을 찾고 그 문단 안에서 exact → 공백 유연 매칭. 교체한 문단을 `indexOf` 위치에 **slice 로** 끼워 넣는다
3. whitespace: original 의 공백 덩어리를 `\s+` 로 바꾼 정규식으로 본문 검색 (original 5자 이상)
4. markdown: 본문·original 모두 `# * > _ \` ~` 제거 + 공백 1칸 정규화 후 검색, 찾으면 원본 인덱스로 역매핑해 `body.slice(0,start) + replacement + body.slice(end)` 로 교체
5. prefix: original 앞 20자(8자 이상일 때)를 찾고, 그 뒤 첫 문장 종결자(`. ! ? 。 \n`)까지(최대 original 길이×1.8+80자) 교체
6. 모두 실패 → matched=false. 호출 측은 원문/교체안을 사용자에게 주고 수동 수정 안내. matched 인데 본문이 안 바뀌면 실패로 처리.
- exact 외 모드로 반영되면 "본문을 확인해주세요" 안내를 띄운다.

**문단 재작성 반영 (fuzzyApplyParagraph)** — 원본/재작성 문단 모두 문단 ID 제거·trim 후
exact → paragraph-id → normalized(마크다운·━·공백 정규화 후 문단 동일) → sentence(첫·마지막 문장 모두 포함) → first-sentence → similarity(2자 이상 토큰 Jaccard ≥ 0.7). 실패 시 재작성 문단과 원본 문단을 사용자에게 주고 수동 붙여넣기 안내.

**되돌리기**: 단순 치환은 replacement→original 로 같은 fuzzyApplyFix 를, 문단은 rewritten→original 로 fuzzyApplyParagraph 를 다시 적용.

**문단 ID**: Phase 2 직후 본문에 `<!-- p:N -->\n` 를 각 문단 앞에 주입(━━·--- 로 시작하는 문단 제외). 검증자는 ID 가 붙은 본문을 받는다. 저장·Phase 3 전에는 반드시 제거(stripParagraphIds).

## 2. 패널 — 스타일·분류·그룹화 (cross-llm-validation-panel.tsx L70-243)

````tsx
const SEVERITY_STYLES: Record<string, { color: string; bg: string; label: string; weight: number }> = {
  high: { color: "#dc2626", bg: "#fee2e2", label: "심각", weight: 3 },
  medium: { color: "#d97706", bg: "#fef3c7", label: "주의", weight: 2 },
  low: { color: "#6b7280", bg: "#f3f4f6", label: "경미", weight: 1 },
};

/**
 * 카테고리 표시 정규화 — 내부 분류(숫자팩트/숫자일관/숫자완화)를 UI 그룹으로 통합.
 * 기존 "숫자" 카테고리와 하위 호환 유지 (모두 "숫자 오류" 로 표시).
 */
function normalizeCategoryDisplay(category: string): {
  label: string;
  color: string;
  bg: string;
} {
  const c = category ?? "";
  if (c === "숫자팩트" || c === "숫자일관" || c === "숫자") {
    return { label: "숫자 오류", color: "#dc2626", bg: "#fee2e2" };
  }
  if (c === "숫자완화") {
    return { label: "표현 완화", color: "#d97706", bg: "#fef3c7" };
  }
  if (c === "법률팩트") {
    return { label: "법률팩트", color: "#7c3aed", bg: "#ede9fe" };
  }
  if (c === "광고규정") {
    return { label: "광고규정", color: "#dc2626", bg: "#fee2e2" };
  }
  if (c === "기관명") {
    return { label: "기관명", color: "#2563eb", bg: "#dbeafe" };
  }
  // 논리/단정/출처 등 기타
  return { label: c, color: "#374151", bg: "#f3f4f6" };
}

type SeverityLevel = "high" | "medium" | "low";

function upgradeSeverity(s: SeverityLevel): SeverityLevel {
  if (s === "low") return "medium";
  if (s === "medium") return "high";
  return "high";
}

/** issue 한 건 (한 LLM 의 지적) */
interface IssueRow {
  key: string;
  provider: ClientLLMProvider;
  providerLabel: string;
  index: number;
  issue: FactCheckIssue;
}

/** 같은 original_text 를 여러 LLM 이 지적한 묶음 */
interface IssueGroup {
  groupKey: string;
  primary: IssueRow; // 그룹의 대표 행 (가장 높은 severity)
  rows: IssueRow[]; // 같은 이슈를 지적한 모든 LLM
  effectiveSeverity: SeverityLevel; // 중복 지적 시 1단계 상향
  providers: string[]; // 지적한 LLM 표시명 목록
}

type ItemStatus = "pending" | "applied" | "ignored";

/**
 * 이 이슈가 "단순 치환" 이 아니라 "문단 재작성" 을 필요로 하는지 결정.
 *
 * 단순 치환 조건:
 *   - 숫자팩트 / 숫자일관 / 숫자완화 / 법률팩트 / 기관명: 항상 단순 치환
 *     (값 교정 또는 단어 대체만 필요)
 *   - 기타 카테고리 + severity=low: 단순 치환
 *
 * 그 외에는 재작성 필요:
 *   - severity 가 high 또는 medium AND 숫자 계열이 아님
 *   - category 가 논리 / 단정 / 출처 / 광고규정
 *   - suggested_text 길이가 original_text 대비 50% 이상 차이
 */
function needsParagraphRewrite(issue: FactCheckIssue): boolean {
  const cat = issue.category ?? "";
  // 숫자 계열 / 법률팩트 / 기관명 은 항상 단순 치환
  if (
    cat === "숫자팩트" ||
    cat === "숫자일관" ||
    cat === "숫자완화" ||
    cat === "숫자" ||
    cat === "법률팩트" ||
    cat === "기관명"
  ) {
    return false;
  }
  if (issue.severity === "high" || issue.severity === "medium") return true;
  if (cat.includes("논리") || cat.includes("단정") || cat.includes("출처") || cat.includes("광고규정")) return true;
  const orig = issue.original_text ?? "";
  const repl = issue.replacement_text ?? "";
  if (orig.length > 0) {
    const ratio = Math.abs(repl.length - orig.length) / orig.length;
    if (ratio >= 0.5) return true;
  }
  return false;
}

/**
 * 본문에서 originalText 를 포함하는 문단을 찾는다.
 * 본문을 \n\n 단위로 split 후, original 이 속한 문단을 반환.
 * 정확 매칭 실패 시 whitespace 정규화 / prefix(첫 20자) 매칭으로 fallback.
 */
function findParagraphContaining(
  body: string,
  originalText: string
): { paragraph: string } | null {
  if (!originalText) return null;
  // LLM 이 <!-- p:N --> 주석을 섞어 보내는 경우 제거 (가짜 ID 포함)
  const PARA_ID_RE = /<!--\s*p:\d+\s*-->\n?/g;
  originalText = originalText.replace(PARA_ID_RE, "").trim();
  if (!originalText) return null;
  const paragraphs = body.split(/\n\n+/);

  // 1) 정확 매칭
  for (const p of paragraphs) {
    if (p.includes(originalText)) return { paragraph: p };
  }

  // 2) whitespace 정규화
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normOrig = normalize(originalText);
  if (normOrig.length >= 5) {
    for (const p of paragraphs) {
      if (normalize(p).includes(normOrig)) return { paragraph: p };
    }
  }

  // 3) prefix 매칭
  const prefix = originalText.trim().slice(0, 20);
  if (prefix.length >= 8) {
    for (const p of paragraphs) {
      if (p.includes(prefix)) return { paragraph: p };
    }
  }

  return null;
}

function normalizeKey(text: string | undefined): string {
  if (!text) return "";
  // 화이트스페이스 정규화 + 처음 60자 — 같은 이슈를 다른 표현으로 지적해도 어느 정도 묶음
  return text.replace(/\s+/g, " ").trim().slice(0, 60).toLowerCase();
}

function groupRows(rows: IssueRow[]): IssueGroup[] {
  const map = new Map<string, IssueRow[]>();
  for (const r of rows) {
    const k = normalizeKey(r.issue.original_text) || `noref-${r.key}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }

  return Array.from(map.entries()).map(([k, arr]) => {
    // primary = 가장 높은 severity 의 행
    const sorted = [...arr].sort(
      (a, b) =>
        SEVERITY_STYLES[b.issue.severity].weight - SEVERITY_STYLES[a.issue.severity].weight
    );
    const primary = sorted[0];
    const baseSeverity = primary.issue.severity as SeverityLevel;
    const effectiveSeverity: SeverityLevel = arr.length >= 2 ? upgradeSeverity(baseSeverity) : baseSeverity;
    const providers = Array.from(new Set(arr.map((r) => r.providerLabel)));
    return {
      groupKey: k,
      primary,
      rows: arr,
      effectiveSeverity,
      providers,
    };
  });
}
````

## 3. 패널 — 핸들러 (L393-555)

````tsx
  /**
   * 단순 반영 경로 — original_text → replacement_text 치환.
   * 카드가 needsParagraphRewrite === false 일 때만 사용.
   */
  function handleApplyGroup(group: IssueGroup) {
    const iss = group.primary.issue;
    if (!iss.original_text || !iss.replacement_text) {
      toast.error("원문/교체문이 누락된 항목입니다 — 수동 확인 필요");
      return;
    }
    let ok = onApplyFix(iss.original_text, iss.replacement_text);

    // 매칭 실패 시 문단 ID 자동 부여 후 재시도
    if (!ok && onEnsureParagraphIds) {
      onEnsureParagraphIds();
      ok = onApplyFix(iss.original_text, iss.replacement_text);
    }

    if (!ok) {
      // 모든 매칭 실패 → 클립보드 폴백
      const recoveryPayload = `[원문 — 본문에서 찾아 선택하세요]\n${iss.original_text}\n\n[교체할 내용]\n${iss.replacement_text}`;
      navigator.clipboard.writeText(recoveryPayload).then(
        () => {
          toast.error(
            "본문에서 원문을 자동 매칭하지 못했습니다. 원문/교체안이 클립보드에 복사되었습니다 — Ctrl+F 로 원문을 찾아 직접 수정해주세요.",
            { duration: 6000 }
          );
        },
        () => {
          toast.error("본문에서 원문을 찾지 못했습니다 — 수동 확인 필요");
        }
      );
      return;
    }
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "applied" }));
    toast.success(`${normalizeCategoryDisplay(iss.category).label} 반영 완료`);
  }

  /**
   * 문단 재작성 경로 — IssueCard 의 [반영 + 다듬기] 버튼이 호출.
   * 1) 본문에서 original_text 를 포함하는 문단을 찾음
   * 2) 베이스 LLM 에게 문단 + 수정사항을 보내 다듬어진 문단 받기
   * 3) IssueCard 는 이 결과를 preview 로 표시
   *
   * 실제 본문 교체는 사용자가 preview 에서 [적용] 누를 때 handleConfirmParagraph 가 처리.
   */
  async function handleRewriteParagraph(
    issue: FactCheckIssue
  ): Promise<{ originalParagraph: string; rewrittenParagraph: string } | { error: string }> {
    if (!issue.original_text) {
      return { error: "원문이 누락되었습니다" };
    }
    const found = findParagraphContaining(body, issue.original_text);
    if (!found) {
      return { error: "본문에서 원문이 포함된 문단을 찾지 못했습니다 — 수동 확인 필요" };
    }

    const res = await clientRewriteParagraph({
      llm: baseLLM,
      categoryTone: categoryToneRules,
      originalParagraph: found.paragraph,
      originalText: issue.original_text,
      suggestedText: issue.replacement_text ?? issue.suggestion ?? "",
      problem: issue.description ?? "",
    });

    if (!res.success || !res.rewrittenParagraph) {
      return { error: res.error ?? "문단 재작성 실패" };
    }
    return {
      originalParagraph: found.paragraph,
      rewrittenParagraph: res.rewrittenParagraph,
    };
  }

  /**
   * 문단 재작성 [적용] — preview 의 rewrittenParagraph 를 본문에 실제 반영.
   * 3단계 fuzzy 매칭 모두 실패하면 클립보드에 rewritten 을 복사하고 사용자에게
   * 수동 모드 안내.
   */
  function handleConfirmParagraph(group: IssueGroup, originalParagraph: string, rewrittenParagraph: string) {
    if (!onApplyParagraph) {
      toast.error("문단 재작성 기능이 활성화되지 않았습니다");
      return false;
    }
    let ok = onApplyParagraph(originalParagraph, rewrittenParagraph);

    // 매칭 실패 시 문단 ID 자동 부여 후 재시도
    if (!ok && onEnsureParagraphIds) {
      onEnsureParagraphIds();
      ok = onApplyParagraph(originalParagraph, rewrittenParagraph);
    }

    if (!ok) {
      const recoveryPayload = `[다듬어진 문단 — 본문 편집기에 직접 붙여넣으세요]\n\n${rewrittenParagraph}\n\n[원본 문단 — 이 위치를 Ctrl+F 로 찾으세요]\n\n${originalParagraph}`;
      navigator.clipboard.writeText(recoveryPayload).then(
        () => {
          toast.error(
            "자동 매칭에 실패했습니다. 다듬어진 문단과 원본이 클립보드에 복사되었습니다 — Ctrl+F 로 원본 문단을 찾아 직접 붙여넣으세요.",
            { duration: 8000 }
          );
        },
        () => {
          toast.error("본문에서 원본 문단을 찾지 못했습니다 — 수동 확인 필요");
        }
      );
      return false;
    }
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "applied" }));
    toast.success(`${normalizeCategoryDisplay(group.primary.issue.category).label} 반영 + 다듬기 완료`);
    return true;
  }

  function handleIgnoreGroup(group: IssueGroup) {
    setGroupStatus((prev) => ({ ...prev, [group.groupKey]: "ignored" }));
  }

  /**
   * 처리된 항목(반영됨/무시됨) 을 다시 pending 으로 되돌림.
   * - 무시됨 → 단순히 status 만 pending 으로 (본문 변경 없음)
   * - 반영됨 → 본문에서도 replacement_text → original_text 로 역치환
   */
  function handleUndoGroup(group: IssueGroup) {
    const current = groupStatus[group.groupKey];
    if (current === "applied") {
      const iss = group.primary.issue;
      if (!iss.original_text || !iss.replacement_text) {
        toast.error("원문/교체문이 없어 되돌릴 수 없습니다");
        return;
      }
      if (!onUndoFix) {
        toast.error("되돌리기 기능이 활성화되지 않았습니다");
        return;
      }
      const ok = onUndoFix(iss.original_text, iss.replacement_text);
      if (!ok) {
        toast.error("본문에서 교체된 문장을 찾지 못했습니다 (수동 편집됨?)");
        return;
      }
      setGroupStatus((prev) => {
        const next = { ...prev };
        delete next[group.groupKey];
        return next;
      });
      toast.success("반영 취소 — 본문이 되돌려졌습니다");
      return;
    }
    if (current === "ignored") {
      setGroupStatus((prev) => {
        const next = { ...prev };
        delete next[group.groupKey];
        return next;
      });
      toast.success("무시 취소 — 다시 처리할 수 있습니다");
    }
  }

  function handleProceed() {
    startTransition(() => {
      onProceedToPhase3();
    });
  }

````

## 4. fuzzyApplyFix (ai-editor-client.tsx L106-298)

````ts
interface ExtractedImageMarker {
  position: number;
  description: string;
  rawText: string;
}

type FuzzyMode = "exact" | "whitespace" | "markdown" | "prefix";

interface FuzzyApplyResult {
  body: string;
  matched: boolean;
  mode?: FuzzyMode;
}

/**
 * 본문에서 originalText 를 찾아 replacementText 로 교체.
 * LLM 이 반환한 original_text 가 본문과 정확히 일치하지 않는 경우가 잦아서
 * 다음 4단계 fallback 으로 매칭 성공률을 올린다.
 *
 *   1. 정확 매칭 (현재 기존 동작)
 *   2. whitespace 정규화 매칭 — original 의 모든 \s+ 시퀀스를 \s+ 로 매칭하는
 *      정규식을 만들어 본문에서 검색 (줄바꿈/탭/이중 공백 차이 흡수)
 *   3. markdown strip 매칭 — 본문과 original 모두 마크다운 기호(## ** > * _ ` ~)
 *      를 제거하고 정규화한 뒤 본문에서 original 을 찾음. 찾으면 stripped 본문의
 *      위치를 원본 본문 위치로 매핑하여 교체.
 *   4. prefix 매칭 — original 의 첫 20자가 본문 어딘가에 있으면, 그 위치부터
 *      가장 가까운 문장 종결자(. ! ? 。 \n) 또는 최대 1.8배 길이까지를 한
 *      덩어리로 보고 replacementText 로 교체
 *
 * 모두 실패 시 matched=false 반환 → 호출 측이 수동 확인 안내.
 */
function fuzzyApplyFix(
  body: string,
  originalText: string,
  replacementText: string
): FuzzyApplyResult {
  if (!originalText) return { body, matched: false };

  // ⚠️ LLM 이 <!-- p:N --> 주석을 포함해서 original_text 를 보내거나, 존재하지 않는
  // 가짜 ID (예: p:55) 를 섞어 보내는 경우가 많다. 매칭 전에 모두 제거.
  const PARA_ID_RE = /<!--\s*p:\d+\s*-->\n?/g;
  originalText = originalText.replace(PARA_ID_RE, "").trim();
  replacementText = replacementText.replace(PARA_ID_RE, "");
  if (!originalText) return { body, matched: false };

  // 1) 정확 매칭
  if (body.includes(originalText)) {
    return { body: body.replace(originalText, replacementText), matched: true, mode: "exact" };
  }

  // 1.5) paragraph ID 기반 — 문단 내 정확/정규화 매칭
  if (hasParagraphIds(body)) {
    const pId = findParagraphIdForText(body, originalText);
    if (pId !== null) {
      const pText = getParagraphById(body, pId);
      if (pText && pText.includes(originalText)) {
        // 문단 내에서 원문을 교체한 뒤, 교체된 문단으로 본문 내 문단을 치환
        const newP = pText.replace(originalText, replacementText);
        // ⚠️ pText 가 trim 되어 body 에서 못 찾을 수 있으므로 indexOf 확인
        const pIdx = body.indexOf(pText);
        if (pIdx !== -1) {
          return {
            body: body.slice(0, pIdx) + newP + body.slice(pIdx + pText.length),
            matched: true,
            mode: "exact",
          };
        }
      }
      if (pText) {
        // 문단 내 정규화 매칭
        const trimmedO = originalText.trim();
        if (trimmedO.length >= 5) {
          const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const fuzzyPat = escapeRe(trimmedO).replace(/\s+/g, "\\s+");
          try {
            const re = new RegExp(fuzzyPat);
            const m = pText.match(re);
            if (m && m[0]) {
              const newP = pText.replace(m[0], replacementText);
              const pIdx = body.indexOf(pText);
              if (pIdx !== -1) {
                return {
                  body: body.slice(0, pIdx) + newP + body.slice(pIdx + pText.length),
                  matched: true,
                  mode: "whitespace",
                };
              }
            }
          } catch { /* 다음 단계 */ }
        }
      }
    }
  }

  // 2) whitespace 정규화 매칭
  const trimmed = originalText.trim();
  if (trimmed.length >= 5) {
    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const fuzzyPattern = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
    try {
      const re = new RegExp(fuzzyPattern);
      const m = body.match(re);
      if (m && m[0]) {
        return { body: body.replace(m[0], replacementText), matched: true, mode: "whitespace" };
      }
    } catch {
      // 정규식 컴파일 실패 → 다음 단계로
    }
  }

  // 3) markdown strip 매칭 — 마크다운 기호와 공백 차이 동시 흡수
  // 본문의 매 문자가 stripped 본문의 어느 위치에 매핑되는지 추적해서 원본 위치 복원
  if (trimmed.length >= 5) {
    const isMarkdownNoise = (ch: string) =>
      ch === "#" || ch === "*" || ch === ">" || ch === "_" || ch === "`" || ch === "~";

    // 본문을 stripped 형태로 변환하면서 stripped 인덱스 → 원본 인덱스 매핑 작성
    const strippedBodyChars: string[] = [];
    const strippedToOriginal: number[] = [];
    let lastWasSpace = false;
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (isMarkdownNoise(ch)) continue;
      if (/\s/.test(ch)) {
        if (lastWasSpace) continue;
        strippedBodyChars.push(" ");
        strippedToOriginal.push(i);
        lastWasSpace = true;
      } else {
        strippedBodyChars.push(ch);
        strippedToOriginal.push(i);
        lastWasSpace = false;
      }
    }
    const strippedBody = strippedBodyChars.join("");

    // original 도 동일 방식으로 strip
    const strippedOriginal = trimmed
      .replace(/[#*>_`~]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (strippedOriginal.length >= 5) {
      const sIdx = strippedBody.indexOf(strippedOriginal);
      if (sIdx !== -1) {
        // stripped 위치를 원본 본문 위치로 매핑
        const startInBody = strippedToOriginal[sIdx];
        const endStripIdx = sIdx + strippedOriginal.length - 1;
        const endInBody =
          endStripIdx < strippedToOriginal.length
            ? strippedToOriginal[endStripIdx] + 1
            : body.length;
        if (startInBody !== undefined && endInBody !== undefined && endInBody > startInBody) {
          return {
            body: body.slice(0, startInBody) + replacementText + body.slice(endInBody),
            matched: true,
            mode: "markdown",
          };
        }
      }
    }
  }

  // 4) prefix 매칭 — 첫 20자만으로 위치 잡고 문장 종결까지 교체
  const prefix = trimmed.slice(0, 20);
  if (prefix.length >= 8) {
    const idx = body.indexOf(prefix);
    if (idx !== -1) {
      let endIdx = body.length;
      for (let i = idx + prefix.length; i < body.length; i++) {
        const ch = body[i];
        if (ch === "." || ch === "!" || ch === "?" || ch === "。" || ch === "\n") {
          endIdx = i + 1;
          break;
        }
      }
      // 폭주 방지: 원본 길이의 1.8배 + 80자 이내로 제한
      const maxEnd = idx + Math.floor(originalText.length * 1.8) + 80;
      if (endIdx > maxEnd) endIdx = maxEnd;
      return {
        body: body.slice(0, idx) + replacementText + body.slice(endIdx),
        matched: true,
        mode: "prefix",
      };
    }
  }

  return { body, matched: false };
}

/**
 * 박스 형식 인포그래픽 마커 [IMAGE: ... | (1) 한국어: ... (2) English: ...] 에서
 * (1) 한국어 부분만 추출. (2) English 가 없거나 형식이 다르면 description 반환.
````

## 5. fuzzyApplyParagraph (ai-editor-client.tsx L307-483)

````ts
// ── 문단 단위 fuzzy 매칭 (교차검증 [반영 + 다듬기] 전용) ──

type ParagraphMatchMode = "exact" | "normalized" | "sentence" | "first-sentence" | "similarity" | "paragraph-id";

interface ParagraphMatchResult {
  body: string;
  matched: boolean;
  mode?: ParagraphMatchMode;
  /** 실제로 본문에서 매칭된 원본 텍스트 (Phase 3 변경 등으로 원래 전달받은 것과 다를 수 있음) */
  matchedText?: string;
  /** similarity 모드의 단어 겹침 비율 (0-1) */
  similarityRatio?: number;
}

/**
 * 본문 정규화 — 마크다운 기호/연속 공백/줄바꿈 차이 흡수.
 */
function normalizeParagraph(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[#*>`_~]+/g, "") // markdown emphasis chars
    .replace(/━+/g, "") // 박스 구분선
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 한국어/영문 혼합 텍스트를 단어 토큰으로 분리 (2자 이상만).
 */
function tokenizeParagraph(s: string): string[] {
  return normalizeParagraph(s)
    .split(/\s+/)
    .map((t) => t.replace(/[.,!?。:;()[\]{}"'「」『』]/g, ""))
    .filter((t) => t.length >= 2);
}

/**
 * 문단 재작성 후 [적용] 클릭 시 본문에서 original 문단을 찾아 rewritten 으로 교체.
 *
 * 3단계 fallback:
 *   1. 정확 매칭 (기존 editText.includes)
 *   2. 정규화 매칭 — 본문을 \n\n 로 split 후 각 문단을 normalizeParagraph 로
 *      정규화해서 original 과 비교. 일치하면 원본 조각을 rewritten 으로 교체.
 *   3. 첫·마지막 문장 매칭 — original 의 첫 문장과 마지막 문장이 모두 한 문단에
 *      있으면 그 문단 전체를 교체. 첫 문장만 있어도 보조 매칭으로 인정.
 *   4. 유사도 매칭 — 각 문단과 original 의 단어 겹침 비율(Jaccard 유사)을 계산,
 *      가장 높은 것이 70% 이상이면 그 문단을 교체.
 *
 * 3단계 모두 실패 시 { matched: false } 반환 → 호출 측이 클립보드 fallback 표시.
 */
function fuzzyApplyParagraph(
  body: string,
  originalParagraph: string,
  rewrittenParagraph: string
): ParagraphMatchResult {
  if (!originalParagraph) return { body, matched: false };

  // ⚠️ LLM 이 <!-- p:N --> 주석을 섞어 보내는 경우 (존재하지 않는 ID 포함) 대비
  const PARA_ID_RE = /<!--\s*p:\d+\s*-->\n?/g;
  originalParagraph = originalParagraph.replace(PARA_ID_RE, "").trim();
  rewrittenParagraph = rewrittenParagraph.replace(PARA_ID_RE, "").trim();
  if (!originalParagraph) return { body, matched: false };

  // ── 0) 정확 매칭 ──
  if (body.includes(originalParagraph)) {
    return {
      body: body.replace(originalParagraph, rewrittenParagraph),
      matched: true,
      mode: "exact",
      matchedText: originalParagraph,
    };
  }

  // ── 0.5) paragraph ID 기반 매칭 ──
  if (hasParagraphIds(body)) {
    const pId = findParagraphIdForText(body, originalParagraph);
    if (pId !== null) {
      const pText = getParagraphById(body, pId);
      if (pText) {
        // ⚠️ pText 가 trim 되어 body.replace 가 실패할 수 있으므로 indexOf 확인
        const pIdx = body.indexOf(pText);
        if (pIdx !== -1) {
          return {
            body: body.slice(0, pIdx) + rewrittenParagraph + body.slice(pIdx + pText.length),
            matched: true,
            mode: "paragraph-id",
            matchedText: pText,
          };
        }
      }
    }
  }

  const paragraphs = body.split(/\n\n+/);

  // ── 1) 정규화 매칭 ──
  const normOriginal = normalizeParagraph(originalParagraph);
  if (normOriginal.length >= 5) {
    for (const p of paragraphs) {
      if (normalizeParagraph(p) === normOriginal) {
        return {
          body: body.replace(p, rewrittenParagraph),
          matched: true,
          mode: "normalized",
          matchedText: p,
        };
      }
    }
  }

  // ── 2) 첫·마지막 문장 기반 매칭 ──
  const sentences = originalParagraph
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);

  if (sentences.length > 0) {
    const firstSentence = sentences[0];
    const lastSentence = sentences[sentences.length - 1];

    // 첫 + 마지막 둘 다 포함
    if (firstSentence !== lastSentence) {
      for (const p of paragraphs) {
        if (p.includes(firstSentence) && p.includes(lastSentence)) {
          return {
            body: body.replace(p, rewrittenParagraph),
            matched: true,
            mode: "sentence",
            matchedText: p,
          };
        }
      }
    }

    // 첫 문장만이라도 매칭
    for (const p of paragraphs) {
      if (p.includes(firstSentence)) {
        return {
          body: body.replace(p, rewrittenParagraph),
          matched: true,
          mode: "first-sentence",
          matchedText: p,
        };
      }
    }
  }

  // ── 3) 유사도 매칭 (Jaccard) — 단어 겹침 70% 이상 ──
  const origTokens = new Set(tokenizeParagraph(originalParagraph));
  if (origTokens.size >= 3) {
    let bestMatch: { p: string; ratio: number } | null = null;
    for (const p of paragraphs) {
      const pTokens = tokenizeParagraph(p);
      if (pTokens.length === 0) continue;
      const pSet = new Set(pTokens);
      // Jaccard = |A ∩ B| / |A ∪ B|
      let inter = 0;
      for (const t of pSet) if (origTokens.has(t)) inter++;
      const union = origTokens.size + pSet.size - inter;
      const ratio = union > 0 ? inter / union : 0;
      if (!bestMatch || ratio > bestMatch.ratio) {
        bestMatch = { p, ratio };
      }
    }
    if (bestMatch && bestMatch.ratio >= 0.7) {
      return {
        body: body.replace(bestMatch.p, rewrittenParagraph),
        matched: true,
        mode: "similarity",
        matchedText: bestMatch.p,
        similarityRatio: bestMatch.ratio,
      };
    }
  }

  return { body, matched: false };
}
````

## 6. 호출 측 (ai-editor-client.tsx L1075-1185, L2007-2016)

````tsx

  /**
   * 교차검증 패널에서 개별 issue 반영 시 호출.
   * fuzzyApplyFix 로 정확/근사 매칭 fallback. setEditText 는 새 body 로 직접 교체
   * (prev 기반 update 의 stale closure 문제 회피).
   */
  function applyFixToBody(originalText: string, replacementText: string): boolean {
    const result = fuzzyApplyFix(editText, originalText, replacementText);
    if (!result.matched) {
      console.warn("[applyFixToBody] 본문에서 원문 매칭 실패", {
        originalLen: originalText.length,
        bodyLen: editText.length,
      });
      return false;
    }
    // 교체 검증: body 가 실제로 변경되었는지 확인
    if (result.body === editText) {
      console.warn("[applyFixToBody] matched=true 이지만 body 변경 없음 — replace 실패");
      return false;
    }
    setEditText(result.body);
    setBodyHighlight(true);
    setTimeout(() => setBodyHighlight(false), 3000);
    if (result.mode && result.mode !== "exact") {
      toast.info(
        result.mode === "whitespace"
          ? "공백 차이를 흡수해서 반영했습니다 — 본문을 한 번 확인해주세요"
          : "원문이 정확히 일치하지 않아 근사 위치로 반영했습니다 — 본문을 확인해주세요"
      );
    }
    return true;
  }

  /**
   * 문단 재작성 반영 — originalParagraph 를 rewrittenParagraph 로 교체.
   * fuzzyApplyParagraph 의 3단계 매칭 (정확 → 정규화 → 첫·마지막 문장 → 유사도)
   * 으로 Phase 3 중간 변경이나 마크다운 서식 차이가 있어도 매칭 성공률을 높임.
   */
  function applyParagraphToBody(originalParagraph: string, rewrittenParagraph: string): boolean {
    if (!originalParagraph || !rewrittenParagraph) return false;
    const result = fuzzyApplyParagraph(editText, originalParagraph, rewrittenParagraph);
    if (!result.matched) {
      console.warn("[applyParagraphToBody] 본문에서 원본 문단 매칭 실패", {
        originalLen: originalParagraph.length,
        bodyLen: editText.length,
      });
      return false;
    }
    // 교체 검증
    if (result.body === editText) {
      console.warn("[applyParagraphToBody] matched=true 이지만 body 변경 없음 — replace 실패");
      return false;
    }
    setEditText(result.body);
    setBodyHighlight(true);
    setTimeout(() => setBodyHighlight(false), 3000);
    if (result.mode && result.mode !== "exact") {
      const modeLabel =
        result.mode === "normalized"
          ? "공백/마크다운 차이 흡수"
          : result.mode === "sentence"
            ? "첫+마지막 문장 매칭"
            : result.mode === "first-sentence"
              ? "첫 문장 매칭"
              : result.mode === "similarity"
                ? `유사도 매칭 (${Math.round((result.similarityRatio ?? 0) * 100)}%)`
                : "근사 매칭";
      toast.info(`${modeLabel}으로 문단을 반영했습니다 — 본문을 확인해주세요`);
    }
    return true;
  }

  /**
   * 문단 재작성 [원래대로] 버튼 — rewritten 을 다시 original 로 되돌림.
   * 동일한 3단계 fuzzy 매칭으로 역치환.
   */
  function undoParagraphInBody(originalParagraph: string, rewrittenParagraph: string): boolean {
    if (!originalParagraph || !rewrittenParagraph) return false;
    // rewritten → original 로 역치환 (fuzzy 적용)
    const result = fuzzyApplyParagraph(editText, rewrittenParagraph, originalParagraph);
    if (!result.matched) {
      console.warn("[undoParagraphInBody] 본문에서 재작성 문단 매칭 실패");
      return false;
    }
    setEditText(result.body);
    setBodyHighlight(true);
    setTimeout(() => setBodyHighlight(false), 3000);
    return true;
  }

  /**
   * "반영됨" 항목을 되돌릴 때 호출되는 역치환.
   * fuzzyApplyFix 로 replacement → original 역치환. fuzzy fallback 동일.
   */
  function undoFixInBody(originalText: string, replacementText: string): boolean {
    const result = fuzzyApplyFix(editText, replacementText, originalText);
    if (!result.matched) {
      console.warn("[undoFixInBody] 본문에서 교체된 문장 매칭 실패", {
        replacementLen: replacementText.length,
        bodyLen: editText.length,
      });
      return false;
    }
    setEditText(result.body);
    setBodyHighlight(true);
    setTimeout(() => setBodyHighlight(false), 3000);
    return true;
  }

  // 이미지 생성 가능 여부 + 기존 이미지 로드
  useEffect(() => {
// ...(중략)...
              onApplyFix={applyFixToBody}
              onApplyParagraph={applyParagraphToBody}
              onUndoParagraph={undoParagraphInBody}
              onUndoFix={undoFixInBody}
              onEnsureParagraphIds={() => {
                if (!hasParagraphIds(editText)) {
                  setEditText(injectParagraphIds(editText));
                }
              }}
              onProceedToPhase3={() => {
````

## 7. paragraph-ids.ts (전체)

````ts
/**
 * 문단 ID 유틸리티 — 본문의 각 문단에 <!-- p:N --> 주석을 삽입/추출/제거.
 *
 * 교차검증 시 LLM 이 original_text 를 정확히 복사하지 못하는 문제를 해결하기 위해
 * 문단 단위로 ID 를 부여해서 매칭 정확도를 높인다.
 *
 * 구조: 본문을 \n\n 으로 분할해 각 문단 앞에 `<!-- p:1 -->\n` 주석을 삽입.
 * 네이버 블로그 에디터에서는 HTML 주석이 보이지 않으므로 발행에 영향 없음.
 */

const PARAGRAPH_ID_RE = /<!-- p:(\d+) -->\n?/g;
const PARAGRAPH_ID_LINE_RE = /^<!-- p:\d+ -->$/;

/** 본문에 문단 ID 가 하나라도 있는지 확인 */
export function hasParagraphIds(body: string): boolean {
  return PARAGRAPH_ID_RE.test(body);
}

/**
 * 본문에 문단 ID 를 주입. 이미 있으면 재번호(1부터).
 * 빈 줄(\n\n)로 분할된 각 비어있지 않은 문단에 <!-- p:N --> 삽입.
 */
export function injectParagraphIds(body: string): string {
  // 기존 ID 제거 후 재삽입 (일관성 보장)
  const stripped = stripParagraphIds(body);
  const paragraphs = stripped.split(/\n\n+/);
  let id = 1;
  const result: string[] = [];

  for (const p of paragraphs) {
    const trimmed = p.trim();
    if (!trimmed) continue;
    // 이미지 마커나 구분선은 ID 부여 건너뛰기
    if (trimmed.startsWith("━━") || trimmed.startsWith("---")) {
      result.push(trimmed);
      continue;
    }
    result.push(`<!-- p:${id} -->\n${trimmed}`);
    id++;
  }

  return result.join("\n\n");
}

/** 본문에서 모든 문단 ID 주석을 제거 — 발행 전 정리용 */
export function stripParagraphIds(body: string): string {
  return body
    .replace(PARAGRAPH_ID_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 문단 ID → 해당 문단 텍스트 매핑 추출 */
export function extractParagraphMap(body: string): Map<number, string> {
  const map = new Map<number, string>();
  const lines = body.split("\n");
  let currentId: number | null = null;
  let currentLines: string[] = [];

  function flush() {
    if (currentId !== null && currentLines.length > 0) {
      map.set(currentId, currentLines.join("\n").trim());
    }
    currentLines = [];
    currentId = null;
  }

  for (const line of lines) {
    const idMatch = line.match(/^<!-- p:(\d+) -->$/);
    if (idMatch) {
      flush();
      currentId = parseInt(idMatch[1], 10);
      continue;
    }
    // 빈 줄이 두 번 이상 → 문단 경계
    if (line.trim() === "" && currentLines.length > 0 && currentLines[currentLines.length - 1]?.trim() === "") {
      flush();
      continue;
    }
    if (currentId !== null) {
      currentLines.push(line);
    } else {
      // ID 없는 문단 — flush 안하고 무시 (ID 부여 전 텍스트)
      currentLines.push(line);
    }
  }
  flush();

  return map;
}

/**
 * 텍스트가 속한 문단 ID 를 찾기.
 * body 에 paragraph ID 가 있을 때, text 가 어느 문단에 포함되는지 탐색.
 * 정확 매칭 → 정규화 매칭 → 첫 문장 매칭 순서로 시도.
 */
export function findParagraphIdForText(body: string, text: string): number | null {
  const map = extractParagraphMap(body);
  if (map.size === 0) return null;

  // LLM 이 응답에 <!-- p:N --> 주석을 포함시키는 경우 (종종 가짜 ID) 제거
  const cleanedText = text.replace(/<!--\s*p:\d+\s*-->\n?/g, "").trim();
  const trimmedText = cleanedText;
  if (!trimmedText) return null;

  // 1) 정확 포함
  for (const [id, content] of map) {
    if (content.includes(trimmedText)) return id;
  }

  // 2) 정규화 포함 (공백/마크다운 무시)
  const normalize = (s: string) =>
    s.replace(/[#*>_`~]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  const normText = normalize(trimmedText);
  if (normText.length >= 5) {
    for (const [id, content] of map) {
      if (normalize(content).includes(normText)) return id;
    }
  }

  // 3) 첫 문장(15자 이상) 포함
  const firstSentence = trimmedText.split(/[.!?。]\s/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 15) {
    for (const [id, content] of map) {
      if (content.includes(firstSentence)) return id;
    }
  }

  return null;
}

/**
 * paragraph_id 기반으로 해당 문단의 텍스트를 반환.
 * 문단 ID 가 없거나 매칭되지 않으면 null.
 */
export function getParagraphById(body: string, paragraphId: number): string | null {
  const map = extractParagraphMap(body);
  return map.get(paragraphId) ?? null;
}

/**
 * 특정 문단을 교체. paragraph_id 기반.
 * 성공 시 교체된 본문 반환, 실패 시 null.
 */
export function replaceParagraphById(
  body: string,
  paragraphId: number,
  newContent: string
): string | null {
  const pText = getParagraphById(body, paragraphId);
  if (!pText) return null;
  return body.replace(pText, newContent);
}
````
