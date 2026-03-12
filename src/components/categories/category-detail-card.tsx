"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/lib/types/database";
import {
  CATEGORY_ROLE_TYPES,
  FUNNEL_STAGES,
  CATEGORY_STATUSES,
} from "@/lib/constants/categories";
import { updateCategory } from "@/actions/categories";
import { Save } from "lucide-react";

interface CategoryDetailCardProps {
  category: Category;
  onUpdated?: () => void;
}

const CTA_TYPES = {
  direct: "직접 CTA",
  neighbor: "이웃 CTA",
  none: "없음",
} as const;

const PROLOGUE_LABELS = {
  area1: "영역 1",
  area2: "영역 2",
  area3: "영역 3",
} as const;

export function CategoryDetailCard({
  category,
  onUpdated,
}: CategoryDetailCardProps) {
  const [monthlyTarget, setMonthlyTarget] = useState(
    category.monthly_target.toString()
  );
  const [status, setStatus] = useState(category.status);
  const [ctaType, setCtaType] = useState(category.cta_type);
  const [saving, setSaving] = useState(false);

  const statusInfo = CATEGORY_STATUSES[category.status] ?? { label: category.status, color: "#6B7280" };
  const connectedServices = category.connected_services ?? [];
  const targetKeywords = category.target_keywords ?? [];

  const statusBadgeClass = (): string => {
    if (statusInfo.color.includes("0F9D58") || statusInfo.color.includes("success")) return "badge-success";
    if (statusInfo.color.includes("E88B00") || statusInfo.color.includes("warning")) return "badge-warning";
    if (statusInfo.color.includes("E5383B") || statusInfo.color.includes("danger")) return "badge-danger";
    return "badge-neutral";
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateCategory(category.id, {
        monthly_target: parseInt(monthlyTarget, 10) || 0,
        status,
        cta_type: ctaType,
      });
      if (result.success) {
        onUpdated?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scard">
      {/* 헤더 */}
      <div className="scard-head">
        <div className="scard-head-left">
          <span className="scard-head-title">{category.name}</span>
        </div>
        <span className={`ucl-badge ${statusBadgeClass()}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="scard-body space-y-5">
        <p className="t-sm" style={{ color: "var(--g500)" }}>
          {category.tier === "primary" ? "1차 카테고리" : "2차 카테고리"} /{" "}
          {category.id}
        </p>

        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>
              역할 유형
            </label>
            <p className="t-sm mt-0.5" style={{ color: "var(--g900)" }}>
              {CATEGORY_ROLE_TYPES[category.role_type]}
            </p>
          </div>
          <div>
            <label className="t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>
              퍼널 단계
            </label>
            <p className="t-sm mt-0.5" style={{ color: "var(--g900)" }}>
              {FUNNEL_STAGES[category.funnel_stage] ?? category.funnel_stage}
            </p>
          </div>
          <div>
            <label className="t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>
              CTA 유형
            </label>
            <p className="t-sm mt-0.5" style={{ color: "var(--g900)" }}>{CTA_TYPES[category.cta_type] ?? category.cta_type}</p>
          </div>
          {category.prologue_position && (
            <div>
              <label className="t-xs" style={{ fontWeight: 600, color: "var(--g500)" }}>
                프롤로그 위치
              </label>
              <p className="t-sm mt-0.5" style={{ color: "var(--g900)" }}>
                {PROLOGUE_LABELS[category.prologue_position]}
              </p>
            </div>
          )}
        </div>

        <div className="divider" />

        {/* 연결 서비스 */}
        {connectedServices.length > 0 && (
          <div>
            <label className="t-xs block mb-2" style={{ fontWeight: 600, color: "var(--g500)" }}>
              연결 서비스
            </label>
            <div className="flex flex-wrap gap-1.5">
              {connectedServices.map((service) => (
                <span key={service} className="ucl-badge ucl-badge-sm badge-brand">
                  {service}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 타겟 키워드 */}
        {targetKeywords.length > 0 && (
          <div>
            <label className="t-xs block mb-2" style={{ fontWeight: 600, color: "var(--g500)" }}>
              타겟 키워드
            </label>
            <div className="flex flex-wrap gap-1.5">
              {targetKeywords.map((keyword) => (
                <span key={keyword} className="ucl-badge ucl-badge-sm badge-neutral">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="divider" />

        {/* 수정 가능 필드 */}
        <div className="space-y-3">
          <h4 className="t-md" style={{ fontWeight: 700, color: "var(--g900)" }}>설정 변경</h4>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="input-label">
                월간 목표 (건)
              </label>
              <div className="input-wrap input-wrap-sm">
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={monthlyTarget}
                  onChange={(e) => setMonthlyTarget(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="input-label">
                상태
              </label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setStatus(v as Category["status"])
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_STATUSES).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      {info.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2">
              <label className="input-label">
                CTA 유형
              </label>
              <Select
                value={ctaType}
                onValueChange={(v) =>
                  setCtaType(v as Category["cta_type"])
                }
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CTA_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm btn-full"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4" />
            {saving ? "저장 중..." : "변경사항 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
