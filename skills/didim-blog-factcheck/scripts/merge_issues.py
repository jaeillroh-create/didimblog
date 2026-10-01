#!/usr/bin/env python3
"""교차검증 결과 병합 — src/components/contents/cross-llm-validation-panel.tsx 포팅.

여러 검증 패스(원본: 여러 외부 LLM, 스킬: 독립 서브에이전트/별도 패스)의 결과를
같은 original_text 기준으로 묶고(groupRows), 2개 이상 패스가 같은 이슈를 지적하면
severity 를 1단계 올린다(upgradeSeverity). 각 그룹에 대해
needsParagraphRewrite(단순 치환 vs 문단 재작성)와 normalizeCategoryDisplay(표시 라벨)를 붙인다.

입력(JSON, stdin 또는 --input):
{
  "providers": [
    {"provider": "pass-a", "displayName": "독립 검토 A", "success": true,
     "result": {"overall_score": 82, "verdict": "pass", "issues": [...정규화된 issue...]}},
    {"provider": "pass-b", "displayName": "독립 검토 B", "success": false, "error": "응답 JSON 파싱 실패"}
  ],
  "status": {"<groupKey>": "applied" | "ignored"},   // 선택
  "is_validating": false                               // 선택
}
issue 는 parse_result.py 가 만든 형태(category, severity=high|medium|low, description,
suggestion, original_text, replacement_text).

출력(JSON): groups[], counts, all_handled, has_no_issues, proceed_label, critical_count_raw
"""

import argparse
import json
import sys

from _jscompat import js_collapse_ws, js_len, js_trim

SEVERITY_STYLES = {
    "high": {"label": "심각", "weight": 3},
    "medium": {"label": "주의", "weight": 2},
    "low": {"label": "경미", "weight": 1},
}


def normalize_category_display(category):
    """내부 분류(숫자팩트/숫자일관/숫자완화)를 UI 라벨로 통합. 원본 색상값도 함께 반환."""
    c = category if category is not None else ""
    if c in ("숫자팩트", "숫자일관", "숫자"):
        return {"label": "숫자 오류", "color": "#dc2626", "bg": "#fee2e2"}
    if c == "숫자완화":
        return {"label": "표현 완화", "color": "#d97706", "bg": "#fef3c7"}
    if c == "법률팩트":
        return {"label": "법률팩트", "color": "#7c3aed", "bg": "#ede9fe"}
    if c == "광고규정":
        return {"label": "광고규정", "color": "#dc2626", "bg": "#fee2e2"}
    if c == "기관명":
        return {"label": "기관명", "color": "#2563eb", "bg": "#dbeafe"}
    return {"label": c, "color": "#374151", "bg": "#f3f4f6"}


def upgrade_severity(s):
    if s == "low":
        return "medium"
    if s == "medium":
        return "high"
    return "high"


def needs_paragraph_rewrite(issue) -> bool:
    cat = issue.get("category") or ""
    if cat in ("숫자팩트", "숫자일관", "숫자완화", "숫자", "법률팩트", "기관명"):
        return False
    if issue.get("severity") in ("high", "medium"):
        return True
    if "논리" in cat or "단정" in cat or "출처" in cat or "광고규정" in cat:
        return True
    orig = issue.get("original_text") or ""
    repl = issue.get("replacement_text") or ""
    if js_len(orig) > 0:
        ratio = abs(js_len(repl) - js_len(orig)) / js_len(orig)
        if ratio >= 0.5:
            return True
    return False


def normalize_key(text):
    if not text:
        return ""
    return js_trim(js_collapse_ws(text, " "))[:60].lower()


def group_rows(rows):
    groups = {}
    for r in rows:
        k = normalize_key(r["issue"].get("original_text")) or f"noref-{r['key']}"
        groups.setdefault(k, []).append(r)
    out = []
    for k, arr in groups.items():
        # 안정 정렬: severity weight 내림차순
        sorted_rows = sorted(arr, key=lambda x: -SEVERITY_STYLES[x["issue"]["severity"]]["weight"])
        primary = sorted_rows[0]
        base = primary["issue"]["severity"]
        eff = upgrade_severity(base) if len(arr) >= 2 else base
        providers = list(dict.fromkeys(r["providerLabel"] for r in arr))
        out.append(
            {
                "groupKey": k,
                "primary": primary,
                "rows": arr,
                "effectiveSeverity": eff,
                "providers": providers,
            }
        )
    return out


def merge(data):
    results = data.get("providers")
    status = data.get("status") or {}
    is_validating = bool(data.get("is_validating", False))

    rows = []
    if results:
        for pr in results:
            if not pr.get("success") or not (pr.get("result") or {}).get("issues"):
                continue
            for idx, iss in enumerate(pr["result"]["issues"]):
                rows.append(
                    {
                        "key": f"{pr.get('provider')}:{idx}",
                        "provider": pr.get("provider"),
                        "providerLabel": pr.get("displayName"),
                        "index": idx,
                        "issue": iss,
                    }
                )
    groups = group_rows(rows)

    counts = {"high": 0, "medium": 0, "low": 0, "applied": 0, "ignored": 0, "pending": 0}
    for g in groups:
        s = status.get(g["groupKey"], "pending")
        if s == "applied":
            counts["applied"] += 1
        elif s == "ignored":
            counts["ignored"] += 1
        else:
            counts["pending"] += 1
            counts[g["effectiveSeverity"] if g["effectiveSeverity"] in ("high", "medium") else "low"] += 1

    all_handled = len(groups) > 0 and counts["pending"] == 0
    has_no_issues = (not is_validating) and len(groups) == 0 and results is not None

    if has_no_issues:
        proceed_label = "Phase 3 진행 (지적 사항 없음)"
    elif all_handled:
        proceed_label = "선택 반영 후 Phase 3 진행"
    else:
        proceed_label = f"{counts['pending']}건 처리 후 Phase 3 진행"

    out_groups = []
    for g in groups:
        iss = g["primary"]["issue"]
        out_groups.append(
            {
                "groupKey": g["groupKey"],
                "status": status.get(g["groupKey"], "pending"),
                "effectiveSeverity": g["effectiveSeverity"],
                "severityLabel": SEVERITY_STYLES[g["effectiveSeverity"]]["label"]
                + (" ⬆" if len(g["providers"]) >= 2 else ""),
                "isMultiPass": len(g["providers"]) >= 2,
                "providers": g["providers"],
                "categoryDisplay": normalize_category_display(iss.get("category")),
                "needsParagraphRewrite": needs_paragraph_rewrite(iss),
                "canApply": bool(iss.get("original_text")) and bool(iss.get("replacement_text")),
                "primaryIssue": iss,
                "rows": [{"provider": r["provider"], "providerLabel": r["providerLabel"], "issue": r["issue"]} for r in g["rows"]],
            }
        )

    # 콘텐츠 상세 '교차검증 완료(권장)' 체크: 그룹화 전 severity=high 이슈 총합
    critical_raw = 0
    for pr in results or []:
        if pr.get("success") and pr.get("result"):
            critical_raw += sum(1 for i in pr["result"].get("issues") or [] if i.get("severity") == "high")

    return {
        "groups": out_groups,
        "counts": counts,
        "all_handled": all_handled,
        "has_no_issues": has_no_issues,
        "can_proceed": (not is_validating) and (all_handled or has_no_issues),
        "proceed_label": proceed_label,
        "critical_count_raw": critical_raw,
        "provider_summary": [
            {
                "displayName": pr.get("displayName"),
                "success": bool(pr.get("success")),
                "overall_score": (pr.get("result") or {}).get("overall_score"),
                "error": pr.get("error"),
            }
            for pr in (results or [])
        ],
    }


def main():
    ap = argparse.ArgumentParser(
        description="여러 검증 패스의 issue 를 original_text 기준으로 묶고 severity 상향·재작성 필요 여부를 계산한다."
    )
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    print(json.dumps(merge(data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
