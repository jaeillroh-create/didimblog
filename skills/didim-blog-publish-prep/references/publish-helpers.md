# publish-helpers.ts 전체 원문과 규칙 해설

> 출처: src/lib/utils/publish-helpers.ts (297행 전체). Python 포팅: scripts/publish_prep.py (같은 입력에 같은 출력 — node 로 원본과 대조 검증).

## 목차
1. 함수별 규칙 요약 (적용 순서 그대로)
2. 원본 동작의 알려진 특이점 (포팅에서도 그대로 재현)
3. 원문 전체

## 1. 함수별 규칙 요약

### stripMarkdown(text) → 복사용 순수 텍스트 (142-191행)
순서대로 적용한다. 순서가 결과를 바꾸므로 바꾸지 않는다.
1. 줄 머리 `#`~`######` + 공백 제거 (제목 기호 삭제)
2. `***x***` → x, `**x**` → x, `*x*` → x, `___x___` → x, `__x__` → x, `_x_` → x (한 줄 안에서만, 최소 일치)
3. `~~x~~` → x (취소선)
4. `` `x` `` → x (인라인 코드)
5. ```` ```…``` ```` 코드 블록 삭제
6. `[텍스트](url)` → 텍스트
7. `[IMAGE: …]` 마커와 `━━ 📷 이미지 N ━━` 블록은 **유지**(발행 시 참고용)
8. 줄 전체가 `---…` 또는 `***…` → `━━━━━━━━━━━━━━━━━━`(━ 18개)
9. 줄 머리(앞 공백 포함) `-`/`*`/`+` + 공백 → `• `
10. 줄 머리 `숫자.` + 공백 → `숫자 ` (예: `1. 요건` → `1 요건`)
11. 줄 머리 `>` + 공백 1개 제거
12. 빈 줄 3개 이상 → 2개
13. 앞뒤 공백 제거
- 마크다운 표(`| … |`)는 그대로 남는다 → 표는 extractTablesAsTabSeparated 로 따로 복사한다.

### markdownToHtml(text) → "서식 포함 복사"용 HTML (6-91행)
줄 단위 홀수 `**` 마지막 것 제거 → 코드 블록 삭제 → `## `→h2(20px, #1B3A5C) / `# `→h1(24px) → 숫자 포함 볼드는 오렌지(#D4740A) strong, 나머지 검정 strong → `> `→blockquote(왼쪽 오렌지 선) → `---`/`***` 줄→hr(오렌지) → `━━ 📷 이미지 N ━━…━━━━━━━━━━━━━━` 블록 → "📷 이미지 N 삽입 위치" 점선 박스 → 남은 `[IMAGE:…]` 삭제 → 마크다운 표 → 회색 카드(행마다 `▸ 헤더: 값 — 헤더: 값`) → 목록 → li → 빈 줄(`\n\n`) 기준 p 단락 → 5문장 이상 단락은 3문장마다 `<br><br>` → 닫히지 않은 strong 보충.

### extractTablesAsTabSeparated(markdown) → 표마다 TSV 문자열 (97-121행)
헤더 줄 + `|---|` 구분 줄 + 본문 줄이 있는 표만 인식. 셀은 trim 후 **빈 셀 제거**(열이 밀릴 수 있음). 화면에서는 여러 표를 빈 줄로 이어 "표 데이터 복사 (N개)" 버튼 하나로 복사하고 "네이버 에디터에서 표 삽입 후 붙여넣기하세요" 안내.

### formatTagsForNaver(tags) → `#태그 #태그` (126-136행)
각 태그에서 모든 공백과 `#` 제거 → 빈 값은 건너뜀 → `#태그`를 공백으로 이어 붙이되 **전체 100자(JS length) 초과 직전에서 중단**(뒤 태그는 모두 버림).

### generateFormatGuide(categoryId) → 포맷 가이드 문자열 (197-268행)
판정 순서: CAT-A/CAT-A-* → 현장 수첩, CAT-B-03 → IP 뉴스 한 입, CAT-B/CAT-B-* → IP 라운지, CAT-C/CAT-C-* → 디딤 다이어리, 그 외 → 기본. 입력은 `secondary_category || category_id`.

### enforceEmail(text) (273-277행)
`/[\w.-]+@[\w.-]+\.\w+/g` 에 맞는 모든 이메일을 `admin@didimip.com` 으로 바꾼다. 빈 값이면 null.

### generateImageGuide(body) (282-297행)
`/\[IMAGE:\s*(.+?)\]/g` — **한 줄 안에서** 닫는 `]`까지. 순번 1부터, 설명은 trim. 화면의 ALT 텍스트 = 이 설명 그대로.

## 2. 원본 동작의 알려진 특이점 (포팅도 동일하게 재현, 결과물 점검 때 주의)
| 현상 | 원인 | 대응(스킬 절차) |
|---|---|---|
| 코드 블록(```` ``` ````)이 완전히 지워지지 않고 `` `언어 … ` `` 형태로 남음 | 인라인 코드 치환(4)이 코드 블록 삭제(5)보다 먼저 실행 | 본문에 코드 블록이 있으면 결과를 눈으로 확인하고 수동 삭제 안내 |
| 줄 전체 `***` 가 구분선이 아니라 `• ` 글머리로 바뀌고 다음 문단과 붙음 | `*x*` 치환(2)이 `***` → `*` 로 먼저 바꾸고, 목록 치환(9)이 `*`+빈 줄을 삼킴 | 구분선은 `---` 만 쓰라고 안내 |
| 여러 줄짜리 새 이미지 마커(`━━ 📷 이미지 N ━━` 블록 안 `[IMAGE: …` 가 여러 줄)는 이미지 가이드·ALT 에 잡히지 않음 | generateImageGuide 정규식 `.`이 줄바꿈을 넘지 못함 | scripts 의 `extra.image_blocks`(스킬 추가)로 블록 번호·ALT 후보를 따로 보여 줌 |
| 마크다운 표가 복사용 본문에 `| … |` 그대로 남음 | stripMarkdown 에 표 처리 없음 | 표 데이터(TSV)를 따로 붙여넣고 본문의 표 줄은 지우라고 안내 |
| 빈 셀이 있으면 TSV/카드에서 열이 왼쪽으로 밀림 | `.filter(Boolean)` | 결과 확인 안내 |
| 태그 100자 초과분은 조용히 버려짐 | formatTagsForNaver 중단 로직 | 화면처럼 제외 태그를 표시 |

## 3. 원문 전체: src/lib/utils/publish-helpers.ts
````ts
import { DIDIM_EMAIL } from "@/lib/constants/categories";

/**
 * 마크다운 → HTML 변환 (네이버 에디터 리치 텍스트 붙여넣기용)
 */
export function markdownToHtml(text: string): string {
  if (!text) return "";

  let html = text;

  // 짝이 안 맞는 ** 전처리 (줄 단위)
  html = html.split("\n").map((line) => {
    const count = (line.match(/\*\*/g) || []).length;
    if (count % 2 !== 0) {
      const lastIdx = line.lastIndexOf("**");
      return line.substring(0, lastIdx) + line.substring(lastIdx + 2);
    }
    return line;
  }).join("\n");

  // 코드 블록 제거
  html = html.replace(/```[\s\S]*?```/g, "");

  // 제목
  html = html.replace(/^## (.+)$/gm, '<h2 style="font-size:20px;font-weight:bold;color:#1B3A5C;margin:24px 0 12px;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="font-size:24px;font-weight:bold;color:#1B3A5C;margin:24px 0 12px;">$1</h1>');

  // 볼드: 숫자 포함 → 오렌지, 나머지 → 검정 볼드
  html = html.replace(/\*\*([^*\n]*\d[^*\n]*)\*\*/g, '<strong style="color:#D4740A;font-weight:bold;">$1</strong>');
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong style="font-weight:bold;">$1</strong>');

  // 인용
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #D4740A;padding-left:16px;color:#555;margin:16px 0;">$1</blockquote>');

  // 구분선
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:2px solid #D4740A;margin:24px 0;">');
  html = html.replace(/^\*\*\*+$/gm, '<hr style="border:none;border-top:2px solid #D4740A;margin:24px 0;">');

  // 이미지 삽입 위치 표시 (새 형식: ━━ 📷 이미지 N ━━ ... ━━━━━━)
  html = html.replace(
    /━━ 📷 이미지 (\d+) ━━[\s\S]*?━━━━━━━━━━━━━━/g,
    '<div style="background:#FFF3E0;padding:12px;border-radius:8px;margin:20px 0;text-align:center;border:2px dashed #D4740A;"><strong>📷 이미지 $1 삽입 위치</strong></div>'
  );

  // [IMAGE: ...] 마커 폴백 제거
  html = html.replace(/\[IMAGE:[^\]]+\]/g, "");

  // 마크다운 테이블 → 텍스트 카드
  html = html.replace(
    /(?:^|\n)(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g,
    (_match, headerLine: string, bodyLines: string) => {
      const headers = headerLine.split("|").map((h: string) => h.trim()).filter(Boolean);
      const rows = bodyLines.trim().split("\n").map((row: string) =>
        row.split("|").map((c: string) => c.trim()).filter(Boolean)
      );
      const cards = rows.map((cells: string[]) => {
        const parts = cells.map((cell, i) => `${headers[i] || ""}: ${cell}`).filter((p) => !p.startsWith(": "));
        return `<p style="margin:6px 0;">▸ ${parts.join(" — ")}</p>`;
      }).join("\n");
      return `\n<div style="background:#F8F9FA;padding:16px 20px;border-radius:8px;margin:20px 0;">\n${cards}\n</div>\n`;
    }
  );

  // 리스트
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>');
  html = html.replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<li style="margin:4px 0;">$2</li>');

  // 줄바꿈 → 단락 (원본 빈 줄 충실히 반영)
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.8;color:#333;">');
  html = '<p style="margin:12px 0;line-height:1.8;color:#333;">' + html + "</p>";

  // 빈 줄 없는 긴 단락(5문장+)에 시각적 여백 추가
  html = html.replace(/<p[^>]*>([\s\S]*?)<\/p>/g, (match, inner: string) => {
    const sentences = inner.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length < 5) return match;
    const chunks: string[] = [];
    for (let i = 0; i < sentences.length; i += 3) {
      chunks.push(sentences.slice(i, i + 3).join(" "));
    }
    return match.replace(inner, chunks.join("<br><br>"));
  });

  // 닫히지 않은 <strong> 태그 정리
  const openCount = (html.match(/<strong[^>]*>/g) || []).length;
  const closeCount = (html.match(/<\/strong>/g) || []).length;
  for (let i = 0; i < openCount - closeCount; i++) {
    html += "</strong>";
  }

  return html;
}

/**
 * 마크다운에서 테이블을 추출하여 탭 구분 텍스트로 변환
 * 네이버 에디터 표에 붙여넣기 가능한 형태
 */
export function extractTablesAsTabSeparated(markdown: string): string[] {
  if (!markdown) return [];

  const tables: string[] = [];
  const tableRegex = /(?:^|\n)(\|.+\|)\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g;
  let match;

  while ((match = tableRegex.exec(markdown)) !== null) {
    const headerLine = match[1];
    const bodyLines = match[2].trim();

    const headers = headerLine.split("|").map((h) => h.trim()).filter(Boolean);
    const rows = bodyLines.split("\n").map((row) =>
      row.split("|").map((c) => c.trim()).filter(Boolean)
    );

    const tsvLines = [headers.join("\t")];
    for (const row of rows) {
      tsvLines.push(row.join("\t"));
    }
    tables.push(tsvLines.join("\n"));
  }

  return tables;
}

/**
 * 태그를 네이버 블로그 형식(#태그)으로 변환, 100자 이내
 */
export function formatTagsForNaver(tags: string[]): string {
  let result = "";
  for (const tag of tags) {
    const cleaned = tag.replace(/\s/g, "").replace(/#/g, "");
    if (!cleaned) continue;
    const next = result ? ` #${cleaned}` : `#${cleaned}`;
    if ((result + next).length > 100) break;
    result += next;
  }
  return result;
}

/**
 * 마크다운 → 네이버 블로그 일반 텍스트 변환
 * 네이버 에디터는 마크다운을 지원하지 않으므로 순수 텍스트로 변환
 */
export function stripMarkdown(text: string): string {
  if (!text) return "";

  let result = text;

  // 제목 마크다운 제거 (## 제목 → 제목)
  result = result.replace(/^#{1,6}\s+/gm, "");

  // 볼드/이탤릭 제거
  result = result.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  result = result.replace(/\*\*(.+?)\*\*/g, "$1");
  result = result.replace(/\*(.+?)\*/g, "$1");
  result = result.replace(/___(.+?)___/g, "$1");
  result = result.replace(/__(.+?)__/g, "$1");
  result = result.replace(/_(.+?)_/g, "$1");

  // 취소선 제거
  result = result.replace(/~~(.+?)~~/g, "$1");

  // 인라인 코드 제거
  result = result.replace(/`(.+?)`/g, "$1");

  // 코드 블록 제거
  result = result.replace(/```[\s\S]*?```/g, "");

  // 링크 → 텍스트만 남김
  result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 이미지 마커는 유지 (발행 준비에서 참고용)
  // [IMAGE: 설명] 형태 유지

  // 수평선 → 구분선 문자
  result = result.replace(/^---+$/gm, "━━━━━━━━━━━━━━━━━━");
  result = result.replace(/^\*\*\*+$/gm, "━━━━━━━━━━━━━━━━━━");

  // 리스트 기호 정리
  result = result.replace(/^[\s]*[-*+]\s+/gm, "• ");
  result = result.replace(/^[\s]*\d+\.\s+/gm, (match) => {
    const num = match.trim().replace(/\.$/, "");
    return `${num} `;
  });

  // 블록 인용 제거
  result = result.replace(/^>\s?/gm, "");

  // 연속 빈 줄 2개로 제한
  result = result.replace(/\n{3,}/g, "\n\n");

  return result.trim();
}

/**
 * 네이버 블로그 포맷 가이드 생성
 * 카테고리에 따라 다른 포맷 안내
 */
export function generateFormatGuide(categoryId: string): string {
  // CAT-A: 현장수첩 (7단계)
  if (categoryId === "CAT-A" || categoryId.startsWith("CAT-A-")) {
    return `[네이버 블로그 포맷 가이드 — 변리사의 현장 수첩]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 후킹 도입부: 본문 바로 시작 (3~5줄)
3. 소제목: "제목2" 스타일 적용 (2~3개)
4. 이미지: [IMAGE] 위치에 준비된 이미지 삽입 (ALT 텍스트 설정)
5. 요약 박스: "바쁜 대표님을 위한 3줄 요약" → 인용구 스타일
6. CTA: 구분선(━━━) 아래 배치
7. 태그: 10개 입력

※ 글자 수: 1,500~2,000자
※ 문단 간격: 3~4줄마다 줄바꿈
※ 첫 이미지: 브랜딩 썸네일`;
  }

  // CAT-B-03: IP 뉴스 한 입 (5단계 경량)
  if (categoryId === "CAT-B-03") {
    return `[네이버 블로그 포맷 가이드 — IP 뉴스 한 입]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 이슈 소개: 간결하게 (300~400자)
3. 시사점: 한 줄 결론 포함 (500~800자)
4. CTA: 이웃 추가 유도 (2줄 이내)
5. 태그: 10개 입력

※ 글자 수: 800~1,200자 (절대 초과 금지)
※ 소제목: 최대 1개
※ 요약 박스 사용 금지`;
  }

  // CAT-B: IP 라운지 일반 (7단계)
  if (categoryId === "CAT-B" || categoryId.startsWith("CAT-B-")) {
    return `[네이버 블로그 포맷 가이드 — IP 라운지]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 후킹 도입부: 이슈/트렌드로 시작 (3~5줄)
3. 소제목: "제목2" 스타일 적용 (2~3개)
4. 이미지: [IMAGE] 위치에 삽입 (ALT 텍스트 설정)
5. 요약 박스: 핵심 포인트 3개 → 인용구 스타일
6. CTA: 이웃 추가 + 상담 안내
7. 태그: 10개 입력

※ 글자 수: 1,500~2,000자
※ 문단 간격: 3~4줄마다 줄바꿈`;
  }

  // CAT-C: 디딤 다이어리 (자유 에세이)
  if (categoryId === "CAT-C" || categoryId.startsWith("CAT-C-")) {
    return `[네이버 블로그 포맷 가이드 — 디딤 다이어리]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 자유 에세이 형식 (소제목 구조화 불필요)
3. 이미지: 자유롭게 배치
4. CTA: ❌ 절대 넣지 않는다

※ 글자 수: 800~1,500자
※ 감정과 생각을 담은 일기 형식
※ 상담 문의, 연락처, 이메일 일체 금지`;
  }

  // 기본
  return `[네이버 블로그 포맷 가이드]

1. 제목: 네이버 에디터에서 "제목" 스타일 적용
2. 소제목: "제목2" 스타일 적용
3. 이미지: ALT 텍스트 반드시 설정
4. 태그: 10개 입력
5. 문단: 3~4줄마다 줄바꿈`;
}

/**
 * CTA 텍스트의 이메일을 DIDIM_EMAIL로 강제 치환
 */
export function enforceEmail(text: string | null): string | null {
  if (!text) return null;
  // 이메일 패턴을 찾아서 admin@didimip.com으로 치환
  return text.replace(/[\w.-]+@[\w.-]+\.\w+/g, DIDIM_EMAIL);
}

/**
 * 이미지 가이드 생성 — [IMAGE: 설명] 마커 기반
 */
export function generateImageGuide(body: string): {
  position: number;
  description: string;
}[] {
  const markers: { position: number; description: string }[] = [];
  const regex = /\[IMAGE:\s*(.+?)\]/g;
  let match;
  let index = 1;
  while ((match = regex.exec(body)) !== null) {
    markers.push({
      position: index++,
      description: match[1].trim(),
    });
  }
  return markers;
}
````
