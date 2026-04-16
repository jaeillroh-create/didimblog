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

  const trimmedText = text.trim();
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
