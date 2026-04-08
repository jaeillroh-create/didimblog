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

  // [IMAGE: ...] 마커 제거 (사용자가 직접 이미지 삽입)
  html = html.replace(/\[IMAGE:[^\]]+\]/g, "");

  // 리스트
  html = html.replace(/^[\s]*[-*+]\s+(.+)$/gm, '<li style="margin:4px 0;">$1</li>');
  html = html.replace(/^[\s]*(\d+)\.\s+(.+)$/gm, '<li style="margin:4px 0;">$2</li>');

  // 줄바꿈 → 단락
  html = html.replace(/\n\n/g, '</p><p style="margin:12px 0;line-height:1.8;color:#333;">');
  html = '<p style="margin:12px 0;line-height:1.8;color:#333;">' + html + "</p>";

  // 닫히지 않은 <strong> 태그 정리
  const openCount = (html.match(/<strong[^>]*>/g) || []).length;
  const closeCount = (html.match(/<\/strong>/g) || []).length;
  for (let i = 0; i < openCount - closeCount; i++) {
    html += "</strong>";
  }

  return html;
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
