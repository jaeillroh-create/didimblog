import type { Content, HealthStatus } from "@/lib/types/database";
import { getPrimaryCategoryId } from "@/lib/recommendation-engine";

// ── 헬스체크 임계값 (일수) ──

const THRESHOLDS: Record<string, { check: number; update: number }> = {
  "CAT-A": { check: 60, update: 90 },
  "CAT-B": { check: 90, update: 120 },
  "CAT-C": { check: 120, update: 180 },
};

const DEFAULT_THRESHOLD = { check: 90, update: 120 };

// ── 법률/세무 관련 키워드 (변경 감지용) ──

export const LEGAL_KEYWORDS = [
  "세액공제",
  "연구소",
  "벤처인증",
  "직무발명",
  "특허법",
  "법인세",
  "소득세",
  "R&D",
  "기업부설연구소",
  "세무조사",
  "조세특례제한법",
  "중소기업기본법",
];

// ── 헬스체크 결과 ──

export interface HealthCheckResult {
  contentId: string;
  currentStatus: HealthStatus;
  recommendedStatus: HealthStatus;
  daysSincePublish: number;
  daysSinceLastCheck: number | null;
  reasons: string[];
  hasLegalKeywords: boolean;
  legalKeywordsFound: string[];
}

// ── 단일 콘텐츠 헬스체크 ──

export function checkContentHealth(content: Content): HealthCheckResult {
  const now = new Date();
  const reasons: string[] = [];
  let recommendedStatus: HealthStatus = "HEALTHY";

  // 발행일 기준 경과일
  const publishedAt = content.published_at
    ? new Date(content.published_at)
    : null;
  const daysSincePublish = publishedAt
    ? Math.floor((now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // 마지막 체크일 기준 경과일
  const lastCheck = content.health_checked_at
    ? new Date(content.health_checked_at)
    : null;
  const daysSinceLastCheck = lastCheck
    ? Math.floor((now.getTime() - lastCheck.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // 카테고리별 임계값
  const primaryCat = getPrimaryCategoryId(content.category_id ?? "");
  const threshold = THRESHOLDS[primaryCat] ?? DEFAULT_THRESHOLD;

  // 1. 경과일 기반 상태 판정
  if (daysSincePublish >= threshold.update) {
    recommendedStatus = "UPDATE_NEEDED";
    reasons.push(`발행 후 ${daysSincePublish}일 경과 (업데이트 권장 ${threshold.update}일)`);
  } else if (daysSincePublish >= threshold.check) {
    recommendedStatus = "CHECK_NEEDED";
    reasons.push(`발행 후 ${daysSincePublish}일 경과 (점검 권장 ${threshold.check}일)`);
  }

  // 2. 법률 키워드 검사
  const bodyText = `${content.title ?? ""} ${content.body ?? ""} ${content.target_keyword ?? ""}`;
  const legalKeywordsFound = LEGAL_KEYWORDS.filter((kw) =>
    bodyText.includes(kw)
  );
  const hasLegalKeywords = legalKeywordsFound.length > 0;

  if (hasLegalKeywords && daysSincePublish >= 30) {
    if (recommendedStatus === "HEALTHY") {
      recommendedStatus = "CHECK_NEEDED";
    }
    reasons.push(`법률/세무 키워드 포함: ${legalKeywordsFound.join(", ")}`);
  }

  // 3. 이미 UPDATED면 유지
  if (content.health_status === "UPDATED") {
    recommendedStatus = "HEALTHY";
    reasons.length = 0;
    reasons.push("최근 업데이트 완료");
  }

  return {
    contentId: content.id,
    currentStatus: content.health_status,
    recommendedStatus,
    daysSincePublish,
    daysSinceLastCheck,
    reasons,
    hasLegalKeywords,
    legalKeywordsFound,
  };
}

// ── 헬스 상태 라벨 ──

export const HEALTH_STATUS_LABELS: Record<HealthStatus, string> = {
  HEALTHY: "정상",
  CHECK_NEEDED: "점검 필요",
  UPDATE_NEEDED: "업데이트 필요",
  UPDATED: "업데이트 완료",
};

export const HEALTH_STATUS_COLORS: Record<HealthStatus, string> = {
  HEALTHY: "bg-green-100 text-green-700",
  CHECK_NEEDED: "bg-yellow-100 text-yellow-700",
  UPDATE_NEEDED: "bg-red-100 text-red-700",
  UPDATED: "bg-blue-100 text-blue-700",
};
