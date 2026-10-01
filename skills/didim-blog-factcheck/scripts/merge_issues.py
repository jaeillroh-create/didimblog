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
  "is_validating": false,                              // 선택
  "checked_date": "2026-10-01",                        // 선택(기본: 오늘 KST) — Notion '교차검증일'
  "title": "글 제목"                                     // 선택 — 검수 기록 머리줄
}
issue 는 parse_result.py 가 만든 형태(category, severity=high|medium|low, description,
suggestion, original_text, replacement_text).

출력(JSON): groups[], counts, all_handled, has_no_issues, proceed_label, critical_count_raw,
            notion_record{교차검증·교차검증일 열 값, 남은 심각 수, '## 검수 기록' 에 붙일 마크다운}

[결정 사항 §7] Notion "디딤 블로그 콘텐츠" 기록: '교차검증' = 미실시 / 통과 / 심각 이슈 남음, '교차검증일' = 날짜.
통과 기준 = 반영 후 남은 심각 이슈 0건(표시 심각도 effectiveSeverity=high 인 그룹 중 '반영'되지 않은 것 — 대기·무시 포함).
성공한 검토 패스가 하나도 없으면 미실시. 요약은 페이지 본문 '## 검수 기록' 섹션에 붙이고 '메모' 열은 쓰지 않는다.
"""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone

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

    result = {
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
    result["notion_record"] = notion_record(result, data.get("checked_date"), data.get("title"))
    return result


NOTION_CONTENT_DS = "collection://463bc815-11ab-4290-9d86-22bd1aa9cfed"
KST = timezone(timedelta(hours=9))


def _short(text, n=40):
    t = js_trim(js_collapse_ws(text or "", " "))
    return t if len(t) <= n else t[:n] + "…"


def notion_record(merged, checked_date=None, title=None):
    """[결정 §7] 콘텐츠 DB '교차검증'·'교차검증일' 값과 '## 검수 기록' 마크다운.

    통과 = 성공한 검토 패스가 1개 이상이고, 표시 심각도 '심각'(effectiveSeverity=high) 그룹 중
    '반영'되지 않은 것(대기·무시)이 0건. 패스가 모두 실패했거나 없으면 미실시.
    """
    date = checked_date or datetime.now(KST).date().isoformat()
    passes = [p for p in merged["provider_summary"] if p["success"]]
    remaining = [g for g in merged["groups"] if g["effectiveSeverity"] == "high" and g["status"] != "applied"]
    if not passes:
        verdict = "미실시"
    elif remaining:
        verdict = "심각 이슈 남음"
    else:
        verdict = "통과"
    c = merged["counts"]
    scores = ", ".join(f"{p['displayName']} {p['overall_score']}점" if p.get("overall_score") is not None
                       else f"{p['displayName']}" for p in passes) or "성공한 패스 없음"
    lines = [f"### 교차검증 {date} — {verdict}" + (f" ({title})" if title else ""),
             f"- 검토 패스 {len(passes)}개({scores}) · 지적 그룹 {len(merged['groups'])}건: "
             f"반영 {c['applied']} · 무시 {c['ignored']} · 대기 {c['pending']}",
             f"- 남은 심각 이슈 {len(remaining)}건 (그룹화 전 심각 지적 {merged['critical_count_raw']}건)"]
    for g in remaining:
        st = "무시" if g["status"] == "ignored" else "대기"
        lines.append(f"  - [{g['severityLabel']} · {g['categoryDisplay']['label']} · {st}] "
                     f"\"{_short(g['primaryIssue'].get('original_text'))}\" — {_short(g['primaryIssue'].get('description'), 60)}")
    applied = [g for g in merged["groups"] if g["status"] == "applied"]
    if applied:
        lines.append("- 반영: " + " / ".join(f"[{g['severityLabel']} {g['categoryDisplay']['label']}] "
                                               f"\"{_short(g['primaryIssue'].get('original_text'), 24)}\"" for g in applied))
    return {
        "data_source": NOTION_CONTENT_DS,
        "properties": {"교차검증": verdict, "date:교차검증일:start": date},
        "remaining_critical": len(remaining),
        "review_log_section": "## 검수 기록",
        "review_log_md": "\n".join(lines),
    }


def main():
    ap = argparse.ArgumentParser(
        description="여러 검증 패스의 issue 를 original_text 기준으로 묶고 severity 상향·재작성 필요 여부를 계산한다."
    )
    ap.add_argument("--input", help="입력 JSON 파일. 없으면 stdin")
    ap.add_argument("--date", help="교차검증일(YYYY-MM-DD). 기본: 입력 checked_date 또는 오늘(KST)")
    args = ap.parse_args()
    data = json.load(open(args.input, encoding="utf-8")) if args.input else json.load(sys.stdin)
    if args.date:
        data["checked_date"] = args.date
    print(json.dumps(merge(data), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
