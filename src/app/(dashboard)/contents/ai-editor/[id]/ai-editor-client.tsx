"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/common/page-header";
import { CopyButton } from "@/components/common/copy-button";
import { toast } from "sonner";
import { DraftQualityPanel } from "@/components/contents/draft-quality-panel";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { calcDraftScore, validateDraft } from "@/lib/draft-validator";
import { CrossLLMValidationPanel } from "@/components/contents/cross-llm-validation-panel";
import {
  saveGenerationResult,
  markGenerationFailed,
  saveAiDraftToContent,
  savePhase1Output,
  savePhase2Output,
  getCategoryName,
  getGenerationMeta,
} from "@/actions/ai";
import {
  clientRunPhase1,
  clientRunPhase2,
  clientRunPhase3,
  clientRunPhase25,
  insertInfographicMarkers,
  appendCtaAndSignature,
  generateAutoTags,
  determineDisclaimerLevel,
  type ClientLLMProvider,
} from "@/lib/client-generate";
import {
  PHASE1_PROMPT,
  PHASE2_PROMPT,
  PHASE25_INFOGRAPHIC_PROMPT,
  PHASE3_PROMPT_BY_KEY,
  CATEGORY_TONE_RULES,
  COMMON_WRITING_RULES,
  FIELD_CTA,
  getPromptKey,
  getFieldCta,
} from "@/lib/constants/prompts";
import {
  hasParagraphIds,
  injectParagraphIds,
  stripParagraphIds,
  findParagraphIdForText,
  getParagraphById,
} from "@/lib/utils/paragraph-ids";
import { checkImageGenAvailable, generateAllInfographics, getGeneratedImages } from "@/actions/image-gen";
import { ImageGenPanel } from "@/components/contents/image-gen-panel";
import type { GenerationStatus, ImageMarker, Phase1Outline, PipelinePhase } from "@/lib/types/database";
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Sparkles,
  Clock,
  Cpu,
  Hash,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Image as ImageIcon,
  ExternalLink,
  X,
} from "lucide-react";

interface AiEditorClientProps {
  generationId: number;
}

/**
 * 카테고리 (promptKey) 별 본문 글자수 목표 범위 (공백 제외).
 * 생성 중 화면에서 현재 글자수의 색상 (초록/회색/주황) 분기에 사용.
 */
const TARGET_RANGE_BY_PROMPT: Record<
  import("@/lib/constants/prompts").PromptKey,
  { min: number; max: number }
> = {
  PROMPT_FIELD: { min: 1500, max: 2500 },
  PROMPT_LOUNGE_GENERAL: { min: 1500, max: 2500 },
  PROMPT_LOUNGE_BITE: { min: 800, max: 1200 },
  PROMPT_DIARY: { min: 800, max: 1500 },
};

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
      if (pText) {
        // 문단 내에서 정확 매칭
        if (pText.includes(originalText)) {
          const newP = pText.replace(originalText, replacementText);
          return { body: body.replace(pText, newP), matched: true, mode: "exact" };
        }
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
              return { body: body.replace(pText, newP), matched: true, mode: "whitespace" };
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
 */
function extractKoreanInfographic(rawTextOrDescription: string): string {
  // (1) 한국어: 다음부터 (2) English 또는 끝까지
  const m = rawTextOrDescription.match(/\(1\)\s*한국어\s*:\s*([\s\S]*?)(?=\n\s*\(2\)\s*English|$)/);
  if (m) return m[1].trim().replace(/\]$/, "").trim();
  return rawTextOrDescription;
}

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
        return {
          body: body.replace(pText, rewrittenParagraph),
          matched: true,
          mode: "paragraph-id",
          matchedText: pText,
        };
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

export function AiEditorClient({ generationId }: AiEditorClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // 생성 상태
  const [status, setStatus] = useState<GenerationStatus>("pending");
  const [generatedText, setGeneratedText] = useState("");
  const [generatedTitle, setGeneratedTitle] = useState("");
  const [generatedTags, setGeneratedTags] = useState<string[]>([]);
  const [genError, setGenError] = useState<string | null>(null);

  // 편집 상태
  const [editTitle, setEditTitle] = useState("");
  const [editText, setEditText] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [keyword, setKeyword] = useState("");

  // 생성 메타
  const [llmInfo, setLlmInfo] = useState<string>("");
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [genTimeMs, setGenTimeMs] = useState<number | null>(null);

  // 교차검증
  const [showValidation, setShowValidation] = useState(false);
  const [currentGenerationId, setCurrentGenerationId] = useState(generationId);

  // 이미지 생성
  const [imageGenAvailable, setImageGenAvailable] = useState(false);
  const [generatedImageUrls, setGeneratedImageUrls] = useState<Record<number, string>>({});
  const [bulkGenerating, setBulkGenerating] = useState(false);

  // 교차검증 — 베이스 LLM 정보 (생성에 사용된 LLM. 나중에 재작성 시에도 사용)
  const baseLLMRef = useRef<{ apiKey: string; model: string; provider: ClientLLMProvider } | null>(null);

  // 본문 textarea hydration mismatch 방지용 highlight (교차검증 반영 시 잠깐 강조)
  const [bodyHighlight, setBodyHighlight] = useState(false);

  // 3-Phase 파이프라인 상태
  const [pipelinePhase, setPipelinePhase] = useState<PipelinePhase>("phase1");
  const [phase1Outline, setPhase1Outline] = useState<Phase1Outline | null>(null);
  const [phase3Loading, setPhase3Loading] = useState(false);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);
  const [pipelineCategoryName, setPipelineCategoryName] = useState<string>("");
  // Phase 1/2 실행 중 계산된 promptKey — categoryToneRules 주입용
  const [pipelinePromptKey, setPipelinePromptKey] = useState<import("@/lib/constants/prompts").PromptKey>("PROMPT_FIELD");
  // 교차검증 단계 — stepper 의 ✅ 표시용
  const [crossValidationDone, setCrossValidationDone] = useState(false);
  // Phase 2 직후 SEO 점수 (Phase 3 와 비교하기 위해 보존)
  const [seoScoreBeforePhase3, setSeoScoreBeforePhase3] = useState<number | null>(null);
  // Phase 2 이어쓰기 중 상태 (finish_reason=length 감지 시 1, 2 로 증가)
  const [continuationAttempt, setContinuationAttempt] = useState(0);

  // 클라이언트 사이드 생성 — useRef로 한 번만 트리거
  const generationTriggered = useRef(false);
  const isMounted = useRef(true);
  const [streamingText, setStreamingText] = useState("");

  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // LLM 모델 선택
  interface LLMModelOption {
    id: number;
    displayName: string;
    model: string;
    provider: string;
    apiKey: string;
    isDefault: boolean;
  }
  const [availableModels, setAvailableModels] = useState<LLMModelOption[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  console.log("[AI Editor] 마운트됨, generationId:", currentGenerationId, "status:", status);

  // pending 감지 → 생성 시작 (한 번만)
  useEffect(() => {
    if (status === "pending" && !generationTriggered.current) {
      generationTriggered.current = true;
      startClientGeneration(currentGenerationId);
    }
  }, [status, currentGenerationId]);

  async function startClientGeneration(genId: number) {
    console.log("[AI Editor] 3-Phase 파이프라인 시작, genId:", genId);
    setStatus("generating");
    setPipelinePhase("phase1");
    setPhase1Outline(null);

    const startTime = Date.now();

    try {
      // ── 0. LLM 설정 + 생성 메타 조회 ──
      const configRes = await fetch("/api/llm-config");
      if (!configRes.ok) throw new Error("LLM 설정을 가져올 수 없습니다.");
      const configData = await configRes.json();

      if (configData.models && isMounted.current) {
        setAvailableModels(configData.models);
        if (!selectedModelId) {
          const def = configData.models.find((m: LLMModelOption) => m.isDefault) ?? configData.models[0];
          if (def) setSelectedModelId(String(def.id));
        }
      }

      const selected = configData.models?.find((m: LLMModelOption) => String(m.id) === selectedModelId);
      const apiKey = selected?.apiKey ?? configData.apiKey;
      const model = selected?.model ?? configData.model;
      const provider = (selected?.provider ?? configData.provider ?? "claude") as ClientLLMProvider;
      baseLLMRef.current = { apiKey, model, provider };
      const llm = { apiKey, model, provider };

      // 생성 메타 (topic, category_id, target_keyword) 조회
      const meta = await getGenerationMeta(genId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "생성 메타 조회 실패");

      const topic = meta.data.topic ?? "";
      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);

      if (targetKeyword && isMounted.current) {
        setKeyword(targetKeyword);
      }
      if (isMounted.current) {
        setPipelineCategoryName(categoryName);
        setPipelinePromptKey(promptKey);
      }

      // ── Phase 1: 구조 설계 ──
      console.log("[Phase 1] 시작 — provider:", provider, "model:", model);
      if (isMounted.current) setStreamingText("📋 구조 설계 중...");
      const phase1Result = await clientRunPhase1({
        llm,
        phase1Prompt: PHASE1_PROMPT,
        categoryName,
        topic,
        targetKeyword,
      });

      if (!phase1Result.success || !phase1Result.outline) {
        throw new Error(phase1Result.error || "Phase 1 실패");
      }

      console.log("[Phase 1] 완료 — 제목:", phase1Result.outline.title);
      await savePhase1Output(genId, phase1Result.outline);
      if (isMounted.current) {
        setPhase1Outline(phase1Result.outline);
        setPipelinePhase("phase2");
      }

      // ── Phase 2: 본문 생성 (스트리밍) ──
      console.log("[Phase 2] 시작");
      if (isMounted.current) {
        setStreamingText("");
        setContinuationAttempt(0);
      }

      const phase2Result = await clientRunPhase2({
        llm,
        phase2Prompt: PHASE2_PROMPT,
        categoryToneRules: CATEGORY_TONE_RULES[promptKey],
        commonWritingRules: COMMON_WRITING_RULES,
        visualRules: "",
        phase1Outline: phase1Result.outline,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
        onContinuationStart: (attempt) => {
          if (isMounted.current) setContinuationAttempt(attempt);
        },
      });

      if (!phase2Result.success || !phase2Result.body) {
        throw new Error(phase2Result.error || "Phase 2 실패");
      }

      console.log("[Phase 2] 완료, 길이:", phase2Result.body.length);
      let phase2Body = phase2Result.body;
      await savePhase2Output(genId, phase2Body);

      // ── Phase 2.5: 인포그래픽 설계 (본문 완성 후 별도 LLM 분석) ──
      console.log("[Phase 2.5] 인포그래픽 설계 시작");
      if (isMounted.current) {
        setPipelinePhase("phase25");
        setStreamingText("📊 인포그래픽 설계 중...");
      }

      try {
        const phase25Result = await clientRunPhase25({
          llm,
          phase25Prompt: PHASE25_INFOGRAPHIC_PROMPT,
          phase2Body,
          categoryName,
          targetKeyword,
        });

        if (phase25Result.success && phase25Result.infographics && phase25Result.infographics.length > 0) {
          console.log("[Phase 2.5] 완료, 인포그래픽:", phase25Result.infographics.length, "개");
          phase2Body = insertInfographicMarkers(phase2Body, phase25Result.infographics);
          await savePhase2Output(genId, phase2Body);
        } else {
          console.warn("[Phase 2.5] 인포그래픽 설계 실패 (본문은 유지):", phase25Result.error);
        }
      } catch (err) {
        console.warn("[Phase 2.5] 예외 (본문은 유지):", err);
      }

      // 본문에서 이미지 마커 추출 (Phase 2.5 결과 포함)
      const imageMarkers = extractImageMarkers(phase2Body).map((mk) => ({
        position: mk.position,
        description: mk.description,
      }));

      // 제목은 Phase 1 outline 의 title 을 신뢰
      const title = phase1Result.outline.title;
      const generationTimeMs = Date.now() - startTime;

      // 저장
      await saveGenerationResult(genId, {
        generatedText: phase2Body,
        generatedTitle: title,
        generatedTags: [],
        imageMarkers,
        generationTimeMs,
      });

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
        const bodyWithIds = hasParagraphIds(phase2Body) ? phase2Body : injectParagraphIds(phase2Body);
        setEditText(bodyWithIds);
        console.log("[Phase 2] editText 설정 완료, 길이:", bodyWithIds.length);
        // Phase 2 완료 직후 교차검증 모달 자동 오픈
        setShowValidation(true);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "생성 중 오류가 발생했습니다.";
      console.error("[AI Editor] 파이프라인 에러:", err);
      await markGenerationFailed(genId, errorMessage);
      if (isMounted.current) {
        setGenError(errorMessage);
        setStatus("failed");
        setPipelinePhase("failed");
      }
    }
  }

  /**
   * Phase 3 — SEO 정량 체크 + CTA/서명/태그 append
   * 사용자가 헤더의 "SEO 최적화 (Phase 3)" 버튼을 누르면 실행.
   * Phase 2 결과를 입력으로 받아 새 본문을 생성하고 editText 로 교체.
   */
  async function runPhase3() {
    if (!baseLLMRef.current) return;
    if (phase3Loading) return;

    setPhase3Loading(true);
    setPhase3Error(null);

    try {
      const meta = await getGenerationMeta(currentGenerationId);
      if (!meta.success || !meta.data) throw new Error(meta.error || "메타 조회 실패");

      const categoryId = meta.data.category_id ?? "";
      const targetKeyword = meta.data.target_keyword ?? "";
      const promptKey = getPromptKey(categoryId);
      const categoryName = await getCategoryName(categoryId);
      const phase3Prompt = PHASE3_PROMPT_BY_KEY[promptKey];

      // Phase 3 에 보내기 전 문단 ID 주석 제거 (LLM 이 깨트릴 수 있음)
      const cleanBody = stripParagraphIds(editText);

      const result = await clientRunPhase3({
        llm: baseLLMRef.current,
        phase3Prompt,
        targetKeyword,
        categoryName,
        phase2Body: cleanBody,
        onProgress: (text) => {
          if (isMounted.current) setStreamingText(text);
        },
      });

      if (!result.success || !result.body) {
        throw new Error(result.error || "Phase 3 실패");
      }

      // Phase 3 본문 검증 — 빈 body 방지
      const phase3BodyLength = result.body.replace(/\s/g, "").length;
      console.log("[Phase 3] 완료, 원본 길이:", result.body.length, "공백 제외:", phase3BodyLength);
      if (phase3BodyLength < 200) {
        console.error("[Phase 3] 본문이 너무 짧음 — Phase 2 본문으로 폴백");
        // Phase 3 가 본문을 깨트린 경우 Phase 2 원본(cleanBody)으로 폴백
        result.body = cleanBody;
        toast.error("Phase 3 결과가 너무 짧아 Phase 2 원본을 사용합니다");
      }

      // Disclaimer 자동 매칭 + CTA / 서명 / 태그 한 줄 append
      const disclaimer = determineDisclaimerLevel({
        categoryId,
        body: result.body,
        isAiGenerated: true,
      });
      const cta = promptKey === "PROMPT_FIELD" ? getFieldCta(categoryId) : { cta: "", emailSubject: "" };
      const finalBody = appendCtaAndSignature({
        body: result.body,
        promptKey,
        ctaText: cta.cta || FIELD_CTA["CAT-A-01"]?.cta,
        emailSubject: cta.emailSubject || FIELD_CTA["CAT-A-01"]?.emailSubject,
        targetKeyword,
        disclaimerText: disclaimer.text,
      });

      // 태그 자동 생성 (코드 기반, LLM 호출 없음)
      const autoTags = generateAutoTags({
        promptKey,
        targetKeyword,
        phase1Outline,
        categoryId,
      });

      if (isMounted.current) {
        setEditText(finalBody);
        setEditTags(autoTags);
        setBodyHighlight(true);
        setTimeout(() => setBodyHighlight(false), 3000);
        setPipelinePhase("completed");
        setStreamingText("");
      }

      // DB 저장 — ai_generations 테이블
      await saveGenerationResult(currentGenerationId, {
        generatedText: finalBody,
        generatedTitle: editTitle,
        generatedTags: autoTags,
        imageMarkers: [],
        generationTimeMs: 0,
      });

      // ── 마무리 단계 (Finalization) — contents 테이블 자동 업데이트 ──
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
            finalizationErrors.push(`SEO/발행일: ${updateErr}`);
          }
          console.log("[Finalization] 완료 — 본문:", bodyForDb.length, "자, SEO:", seoScore, "점, 발행일:", nextTue);
        }
      } catch (finErr) {
        const msg = finErr instanceof Error ? finErr.message : "마무리 단계 실패";
        finalizationErrors.push(msg);
        console.error("[Finalization] 예외:", finErr);
      }

      if (finalizationErrors.length > 0) {
        toast.error(`자동 처리 일부 실패: ${finalizationErrors.join("; ")}`, { duration: 8000 });
      } else {
        toast.success("Phase 3 완료 · 본문/태그/발행일 자동 저장됨 · 대표 검수를 기다리고 있습니다");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Phase 3 실패";
      console.error("[Phase 3] 에러:", err);
      setPhase3Error(msg);
      toast.error(msg);
    } finally {
      setPhase3Loading(false);
    }
  }

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
    checkImageGenAvailable().then(setImageGenAvailable);
  }, []);

  useEffect(() => {
    if (status === "completed") {
      getGeneratedImages(currentGenerationId).then((result) => {
        if (result.success && result.images) {
          const urls: Record<number, string> = {};
          for (const img of result.images) {
            if (img.public_url) {
              urls[img.marker_index] = img.public_url;
            }
          }
          setGeneratedImageUrls(urls);
        }
      });
    }
  }, [status, currentGenerationId]);

  // 이미지 마커 추출 — 박스 형식(multi-line)과 단순 형식 모두 지원
  const imageMarkers: (ImageMarker & { rawText: string })[] = extractImageMarkers(editText).map(
    (m, idx) => ({
      position: m.position,
      description: m.description,
      rawText: m.rawText,
      imageUrl: generatedImageUrls[idx] || undefined,
    })
  );

  function handleImageGenerated(markerIndex: number, imageUrl: string) {
    setGeneratedImageUrls((prev) => ({ ...prev, [markerIndex]: imageUrl }));
  }

  async function handleBulkGenerate() {
    if (imageMarkers.length === 0) return;
    setBulkGenerating(true);

    const markers = imageMarkers.map((m, i) => ({
      index: i,
      description: m.description,
    }));

    const result = await generateAllInfographics({
      generationId: currentGenerationId,
      blogTopic: editTitle,
      markers,
    });

    if (result.success) {
      const urls: Record<number, string> = { ...generatedImageUrls };
      for (const img of result.images) {
        if (img.imageUrl) {
          urls[img.markerIndex] = img.imageUrl;
        }
      }
      setGeneratedImageUrls(urls);
    }

    setBulkGenerating(false);
  }

  // SEO 점수 계산
  const seoResult = calculateSeoScore(editTitle, editText, keyword);

  // [IMAGE: ...] 마커 하이라이트된 텍스트
  const highlightedText = editText.replace(
    /\[IMAGE:\s*(.+?)\]/g,
    "<<IMAGE_MARKER>>$1<<END_MARKER>>"
  );

  // 저장 경고 다이얼로그
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  // 저장 실행
  function doSave() {
    startTransition(async () => {
      // 저장 시 문단 ID 주석 제거 (네이버 블로그에 불필요)
      const bodyForSave = stripParagraphIds(editText);

      // ⚠️ 본문 비어있음 방어 — 빈 본문 저장 방지
      const bodyContentLength = bodyForSave.replace(/\s/g, "").length;
      if (bodyContentLength < 200) {
        toast.error(
          `본문이 너무 짧습니다 (${bodyContentLength}자). 저장을 중단합니다. Phase 2/3 가 정상 완료되었는지 확인하세요.`,
          { duration: 8000 }
        );
        console.error("[저장 중단] 본문 길이:", bodyContentLength, "원본 editText 길이:", editText.length);
        return;
      }
      console.log("[저장] body 길이:", bodyForSave.length, "공백 제외:", bodyContentLength);

      const result = await saveAiDraftToContent(currentGenerationId, {
        title: editTitle,
        body: bodyForSave,
        tags: editTags,
        keyword: keyword || undefined,
      });

      if (!result.success) {
        setGenError(result.error || "저장에 실패했습니다.");
        return;
      }

      router.push("/contents");
    });
  }

  // 저장 버튼 클릭: 미통과 3개 이상이면 확인 모달
  function handleSave() {
    const draftChecks = validateDraft(editTitle, editText, "");
    const { failedItems } = calcDraftScore(draftChecks);
    if (failedItems.length >= 3) {
      setSaveConfirmOpen(true);
    } else {
      doSave();
    }
  }

  function handleRegenerate(newGenId: number) {
    setCurrentGenerationId(newGenId);
    setStatus("pending");
    generationTriggered.current = false;
    setStreamingText("");
    setShowValidation(false);
    setGenError(null);
  }

  function removeTag(index: number) {
    setEditTags((prev) => prev.filter((_, i) => i !== index));
  }

  function addTag() {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags((prev) => [...prev, newTag.trim()]);
      setNewTag("");
    }
  }

  // 로딩 / 생성 중 상태
  if (status === "pending" || status === "generating") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI 초안 생성 중"
          description="AI가 초안을 작성하고 있습니다. 잠시만 기다려주세요."
          actions={
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
          }
        />
        {/* 모델 선택 (생성 시작 전에만 변경 가능) */}
        {availableModels.length > 1 && !streamingText && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">LLM 모델:</span>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger className="w-[280px] h-8 text-sm">
                <SelectValue placeholder="모델 선택" />
              </SelectTrigger>
              <SelectContent>
                {availableModels.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.displayName}{m.isDefault ? " (기본)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {/* 4단계 진행 인디케이터 */}
        <PipelineStepper
          phase={pipelinePhase}
          crossValidationDone={crossValidationDone}
          phase3Loading={phase3Loading}
        />
        {streamingText ? (
          (() => {
            const charCount = streamingText.replace(/\s/g, "").length;
            const target = TARGET_RANGE_BY_PROMPT[pipelinePromptKey] ?? {
              min: 1500,
              max: 2500,
            };
            const inRange = charCount >= target.min && charCount <= target.max;
            const overRange = charCount > target.max;
            const countColor = inRange
              ? "var(--quality-excellent)"
              : overRange
                ? "#d97706"
                : "var(--neutral-text-muted)";
            const progress = Math.min(100, Math.round((charCount / target.max) * 100));
            return (
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      style={{ color: "var(--brand-accent)" }}
                    />
                    <span className="text-sm font-medium">
                      {continuationAttempt > 0 ? (
                        <>
                          ✍️ 본문 이어서 작성 중...{" "}
                          <span className="text-xs text-muted-foreground">
                            (이어쓰기 {continuationAttempt}회차)
                          </span>
                        </>
                      ) : (
                        "초안 작성 중..."
                      )}
                    </span>
                    <span className="ml-auto text-sm font-semibold" style={{ color: countColor }}>
                      {charCount.toLocaleString()}자
                      <span className="text-xs text-muted-foreground ml-1">
                        / 목표 {target.min.toLocaleString()}~{target.max.toLocaleString()}자
                      </span>
                    </span>
                  </div>
                  {/* 진행 표시줄 */}
                  <div className="mb-3 h-1 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full transition-all duration-200"
                      style={{
                        width: `${progress}%`,
                        backgroundColor: countColor,
                      }}
                    />
                  </div>
                  <div
                    className="w-full min-h-[300px] max-h-[500px] overflow-y-auto rounded-md border border-input bg-muted/30 px-4 py-3 text-sm leading-relaxed font-mono whitespace-pre-wrap"
                  >
                    {streamingText}
                    <span className="inline-block w-1.5 h-4 bg-[var(--brand-accent)] animate-pulse ml-0.5" />
                  </div>
                </CardContent>
              </Card>
            );
          })()
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Loader2
                className="h-12 w-12 animate-spin mb-4"
                style={{ color: "var(--brand-accent)" }}
              />
              <p className="text-lg font-medium mb-2">
                {status === "pending" ? "생성 준비 중..." : "초안 작성 중..."}
              </p>
              <p className="text-sm text-[var(--neutral-text-muted)]">
                카테고리별 톤과 SEO를 고려하여 초안을 생성합니다
              </p>
              <div className="mt-6 flex gap-2">
                <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="h-2 w-2 rounded-full bg-[var(--brand-accent)] animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // 실패 상태
  if (status === "failed") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="AI 초안 생성 실패"
          actions={
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
          }
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <XCircle className="h-12 w-12 mb-4" style={{ color: "var(--quality-critical)" }} />
            <p className="text-lg font-medium mb-2">생성에 실패했습니다</p>
            <p className="text-sm text-[var(--neutral-text-muted)]">
              {genError || "알 수 없는 오류가 발생했습니다."}
            </p>
            <Button
              variant="outline"
              className="mt-6"
              onClick={() => router.push("/contents")}
            >
              콘텐츠 관리로 돌아가기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 완료 → 에디터 표시
  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <PageHeader
        title="초안 편집"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => router.push("/contents")}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              콘텐츠 관리
            </Button>
            {pipelinePhase === "phase3" && (
              <Button
                variant="outline"
                onClick={runPhase3}
                disabled={phase3Loading}
                title="Phase 3 — 키워드 빈도/볼드/구분선 등 SEO 정량 체크 + CTA·서명·태그 추가"
              >
                {phase3Loading ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-4 w-4" />
                )}
                {phase3Loading ? "SEO 최적화 중..." : "🔍 SEO 최적화 (Phase 3)"}
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowValidation(!showValidation)}
            >
              <Sparkles className="mr-1 h-4 w-4" />
              교차검증
            </Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              style={{ backgroundColor: "var(--brand-accent)" }}
            >
              <Save className="mr-1 h-4 w-4" />
              {isPending ? "저장 중..." : "저장 (S1 전이)"}
            </Button>
          </div>
        }
      />

      {/* 4단계 진행 표시 — Phase 3 완료 후 자동 숨김 */}
      {pipelinePhase !== "completed" && pipelinePhase !== "failed" && (
        <PipelineStepper
          phase={pipelinePhase}
          crossValidationDone={crossValidationDone}
          phase3Loading={phase3Loading}
        />
      )}

      {/* Phase 3 에러 표시 */}
      {phase3Error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Phase 3 SEO 최적화 실패: {phase3Error}
          <span className="block text-xs text-red-600 mt-1">
            현재 본문(Phase 2 결과)을 그대로 사용할 수 있습니다.
          </span>
        </div>
      )}

      {/* Phase 1 outline 미리보기 (collapsed) */}
      {phase1Outline && (
        <details className="rounded-md border border-dashed p-2 bg-muted/20">
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
            📋 Phase 1 구조 ({phase1Outline.sections?.length ?? 0}개 섹션 · 키워드 {phase1Outline.keyword_plan?.total_count ?? "?"}회 · {phase1Outline.legal_references?.length ?? 0}개 법령)
          </summary>
          <pre className="mt-2 text-[10px] overflow-x-auto whitespace-pre-wrap text-muted-foreground font-mono">
            {JSON.stringify(phase1Outline, null, 2)}
          </pre>
        </details>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 에디터 영역 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 제목 편집 */}
          <Card>
            <CardContent className="pt-6">
              <label className="text-sm font-medium mb-2 block">제목</label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--neutral-text-muted)]">
                {editTitle.length}자 (권장 25~30자)
              </p>
            </CardContent>
          </Card>

          {/* 본문 편집 */}
          <Card>
            <CardContent className="pt-6">
              <label className="text-sm font-medium mb-2 block flex items-center gap-2">
                본문
                {bodyHighlight && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: "#dcfce7", color: "var(--quality-excellent)" }}>
                    ✓ 본문에 반영됨
                  </span>
                )}
              </label>
              <textarea
                className={`w-full min-h-[500px] rounded-md border bg-background px-4 py-3 text-sm leading-relaxed font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring whitespace-pre-wrap transition-all duration-300 ${
                  bodyHighlight
                    ? "border-[var(--quality-excellent)] shadow-[0_0_0_3px_rgba(34,197,94,0.15)]"
                    : "border-input"
                }`}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
              />
              <p className="mt-1 text-xs text-[var(--neutral-text-muted)]">
                {editText.replace(/\s/g, "").length.toLocaleString()}자 (공백 제외)
              </p>
            </CardContent>
          </Card>

          {/* 이미지 마커 목록 + 이미지 생성 */}
          {imageMarkers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    이미지 마커 ({imageMarkers.length}개)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // 1) 본문에서 박스 형식 마커를 정확히 제거 (extractImageMarkers 의 rawText 사용)
                        let cleanBody = editText;
                        for (const mk of imageMarkers) {
                          cleanBody = cleanBody.split(mk.rawText).join("");
                        }
                        // 박스 구분선 (━━ 📷 이미지 N ━━ / ━━━━━━━━━━━━━━) 도 같이 제거
                        cleanBody = cleanBody
                          .replace(/━━\s*📷[^\n]*\n?/g, "")
                          .replace(/━━━━+\n?/g, "")
                          .replace(/\n{3,}/g, "\n\n")
                          .trim();

                        // 2) 각 마커의 한국어 프롬프트만 추출
                        const koreanInfographics = imageMarkers
                          .map((m, i) => {
                            const ko = extractKoreanInfographic(m.rawText || m.description);
                            return `── 인포그래픽 ${i + 1} ──\n${ko}`;
                          })
                          .join("\n\n");

                        const fullCopy = `다음 블로그 본문을 참고해서 아래 ${imageMarkers.length}개의 한국어 인포그래픽을 생성해주세요.

[블로그 본문]
${cleanBody}

────────────────────

[인포그래픽 작성 지침]
- 모든 텍스트는 반드시 한국어로 작성 (영문 일절 금지)
- Clean modern flat design, 흰색 배경, 16:9
- 각 인포그래픽 최상단에 임팩트 헤드라인 (24pt 볼드, 데이터가 아닌 메시지)
- 감정 톤에 어울리는 색상 자유 선택 (성취감 / 위기감 / 자신감 / 긴급함)
- 핵심 데이터 1~2개만 색상/크기/볼드로 강조
- 하단에 출처(법률 근거 / 기관명) + 단위 / 기준일 표기
- 세련되고 전문적인 비즈니스 톤 유지

────────────────────

[생성할 인포그래픽 ${imageMarkers.length}개]

${koreanInfographics}`;

                        navigator.clipboard.writeText(fullCopy).then(
                          () =>
                            toast.success(
                              `본문 + ${imageMarkers.length}개 인포그래픽 한국어 프롬프트가 복사되었습니다 — LLM에 바로 붙여넣으세요`
                            ),
                          () => toast.error("클립보드 복사에 실패했습니다")
                        );
                      }}
                    >
                      전체 복사 (본문+한국어 지침)
                    </Button>
                    <a
                      href="https://www.genspark.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border hover:bg-muted/50 transition-colors"
                    >
                      Genspark.ai
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  {imageGenAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleBulkGenerate}
                      disabled={bulkGenerating}
                    >
                      {bulkGenerating ? (
                        <>
                          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          일괄 생성 중...
                        </>
                      ) : (
                        <>
                          <ImageIcon className="mr-1 h-3.5 w-3.5" />
                          전체 이미지 일괄 생성
                        </>
                      )}
                    </Button>
                  )}
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {imageMarkers.map((marker, i) =>
                    imageGenAvailable ? (
                      <ImageGenPanel
                        key={i}
                        marker={{ ...marker, imageUrl: generatedImageUrls[i] }}
                        markerIndex={i}
                        generationId={currentGenerationId}
                        blogTopic={editTitle}
                        rawText={marker.rawText}
                        onImageGenerated={handleImageGenerated}
                      />
                    ) : (
                      <div
                        key={i}
                        className="flex items-center gap-2 rounded-md p-2 text-sm"
                        style={{ backgroundColor: "var(--neutral-surface)" }}
                      >
                        <Badge
                          variant="outline"
                          className="shrink-0"
                          style={{ borderColor: "var(--brand-accent)", color: "var(--brand-accent)" }}
                        >
                          IMG {i + 1}
                        </Badge>
                        <span className="flex-1">{marker.description}</span>
                        <CopyButton
                          text={marker.rawText}
                          label="복사"
                          toastMessage="이미지 프롬프트가 복사되었습니다"
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs shrink-0"
                        />
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* 우측: 사이드 패널 */}
        <div className="space-y-4">
          {/* SEO 점수 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center justify-between">
                <span className="flex items-center gap-2">
                  SEO 점수
                  {/* Phase 3 완료 후 변화량 표시 — Phase 2 직후 점수와 비교 */}
                  {seoScoreBeforePhase3 !== null && pipelinePhase === "completed" && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                      style={{
                        backgroundColor:
                          seoResult.score - seoScoreBeforePhase3 >= 0 ? "#dcfce7" : "#fee2e2",
                        color:
                          seoResult.score - seoScoreBeforePhase3 >= 0
                            ? "var(--quality-excellent)"
                            : "var(--quality-critical)",
                      }}
                      title="Phase 2 → Phase 3 변화"
                    >
                      {seoScoreBeforePhase3} → {seoResult.score} (
                      {seoResult.score - seoScoreBeforePhase3 >= 0 ? "+" : ""}
                      {seoResult.score - seoScoreBeforePhase3})
                    </span>
                  )}
                </span>
                <span
                  className="text-lg font-bold"
                  style={{
                    color:
                      seoResult.score >= 80
                        ? "var(--quality-excellent)"
                        : seoResult.score >= 60
                          ? "var(--quality-good)"
                          : "var(--quality-average)",
                  }}
                >
                  {seoResult.score}/100
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {seoResult.checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    {check.passed ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--quality-excellent)" }}
                      />
                    ) : (
                      <AlertTriangle
                        className="h-4 w-4 shrink-0"
                        style={{ color: "var(--quality-average)" }}
                      />
                    )}
                    <span>{check.label}</span>
                  </div>
                  <span className="text-xs text-[var(--neutral-text-muted)]">
                    {check.detail}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 초안 품질 체크 */}
          <DraftQualityPanel
            title={editTitle}
            body={editText}
            categoryId=""
          />

          {/* 생성 정보 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">생성 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                  <Cpu className="h-4 w-4" />
                  LLM
                </span>
                <span>AI 생성</span>
              </div>
              {tokensUsed !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                    <Hash className="h-4 w-4" />
                    토큰
                  </span>
                  <span>{tokensUsed.toLocaleString()}</span>
                </div>
              )}
              {genTimeMs !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                    <Clock className="h-4 w-4" />
                    생성시간
                  </span>
                  <span>{Math.round(genTimeMs / 1000)}초</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-[var(--neutral-text-muted)]">
                  <Sparkles className="h-4 w-4" />
                  생성 ID
                </span>
                <span>#{currentGenerationId}</span>
              </div>
            </CardContent>
          </Card>

          {/* 태그 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">태그</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {editTags.map((tag, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {tag}
                    <button
                      onClick={() => removeTag(i)}
                      className="ml-1 hover:text-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="태그 추가"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                />
                <Button size="sm" variant="outline" onClick={addTag}>
                  추가
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 키워드 입력 (SEO 점수용) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">SEO 키워드</CardTitle>
            </CardHeader>
            <CardContent>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="SEO 분석용 키워드"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 교차검증 모달 — 헤더 "교차검증" 버튼 또는 Phase 2 자동 트리거로 열림 */}
      <Dialog open={showValidation} onOpenChange={setShowValidation}>
        <DialogContent className="w-[95vw] max-w-[1100px] max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="h-5 w-5" style={{ color: "var(--brand-accent)" }} />
              교차검증 (Phase 2 → Phase 3)
            </DialogTitle>
            <DialogDescription className="text-sm">
              초안 생성 LLM을 제외한 다른 LLM들이 사실/논리만 검증합니다. SEO/CTA는 Phase 3에서 처리됩니다.
            </DialogDescription>
          </DialogHeader>
          {baseLLMRef.current && (
            <CrossLLMValidationPanel
              title={editTitle}
              body={editText}
              availableModels={availableModels}
              baseLLM={baseLLMRef.current}
              legalReferences={phase1Outline?.legal_references ?? []}
              categoryName={pipelineCategoryName}
              categoryToneRules={CATEGORY_TONE_RULES[pipelinePromptKey] ?? ""}
              targetKeyword={keyword}
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
                setCrossValidationDone(true);
                setShowValidation(false);
                runPhase3();
              }}
              onClose={() => setShowValidation(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 저장 경고 다이얼로그 */}
      <ConfirmDialog
        open={saveConfirmOpen}
        onOpenChange={setSaveConfirmOpen}
        title="품질 체크 미통과 항목 있음"
        description={`품질 체크 미통과 항목이 ${validateDraft(editTitle, editText, "").filter((c) => !c.passed).length}개 있습니다. 그래도 저장하시겠습니까?`}
        confirmLabel="저장"
        onConfirm={() => {
          setSaveConfirmOpen(false);
          doSave();
        }}
      />
    </div>
  );
}

/**
 * 4단계 파이프라인 진행 인디케이터:
 *   Phase 1 → Phase 2 → 📊 인포그래픽 → 교차검증 → Phase 3: SEO
 *
 * - 현재 단계: 🔄 (애니메이션 pulse + 브랜드 컬러)
 * - 완료 단계: ✅
 * - 미진행: ⬜
 * - Phase 3 완료(pipelinePhase === 'completed') 시 상위에서 렌더링 자체를 숨김
 */
function PipelineStepper({
  phase,
  crossValidationDone,
  phase3Loading,
}: {
  phase: PipelinePhase;
  crossValidationDone: boolean;
  phase3Loading: boolean;
}) {
  type StepKey = "phase1" | "phase2" | "phase25" | "crossValidation" | "phase3";
  const steps: { key: StepKey; label: string }[] = [
    { key: "phase1", label: "구조 설계" },
    { key: "phase2", label: "본문 작성" },
    { key: "phase25", label: "📊 인포그래픽" },
    { key: "crossValidation", label: "교차검증" },
    { key: "phase3", label: "SEO" },
  ];

  const phaseOrder = ["phase1", "phase2", "phase25", "phase3"];
  const currentIdx = phaseOrder.indexOf(phase);

  function statusFor(key: StepKey): "done" | "active" | "pending" {
    if (phase === "failed") return "pending";

    if (key === "phase1") {
      return phase === "phase1" ? "active" : "done";
    }
    if (key === "phase2") {
      if (phase === "phase1") return "pending";
      return phase === "phase2" ? "active" : "done";
    }
    if (key === "phase25") {
      if (currentIdx < 2) return "pending";
      return (phase as string) === "phase25" ? "active" : "done";
    }
    if (key === "crossValidation") {
      if (currentIdx < 2) return "pending";
      if (phase3Loading) return "done";
      return crossValidationDone ? "done" : "active";
    }
    // phase3
    if (currentIdx < 2) return "pending";
    if (phase === "phase3") {
      return phase3Loading ? "active" : "pending";
    }
    return "pending";
  }

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2 text-xs flex-wrap">
        {steps.map((s, i) => {
          const st = statusFor(s.key);
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium ${
                  st === "done"
                    ? "bg-[var(--quality-excellent)]/10 border-[var(--quality-excellent)] text-[var(--quality-excellent)]"
                    : st === "active"
                      ? "bg-[var(--brand-accent)]/10 border-[var(--brand-accent)] text-[var(--brand-accent)] animate-pulse"
                      : "bg-background border-input text-muted-foreground"
                }`}
              >
                <span className="text-[13px] leading-none">
                  {st === "done" ? "✅" : st === "active" ? "🔄" : "⬜"}
                </span>
                {s.label}
              </span>
              {i < steps.length - 1 && (
                <span className="text-muted-foreground text-[10px]">→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
