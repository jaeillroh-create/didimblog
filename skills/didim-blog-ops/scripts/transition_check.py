#!/usr/bin/env python3
"""디딤 블로그 콘텐츠 상태 전이(S0~S5) 검증기 — 원본 TS 포팅.

원본:
  - src/actions/contents.ts : validateTransition(), updateContentStatusWithMeta() 타임스탬프 규칙,
                              approveReview()/requestRevision()/resetReviewStatus()
  - src/components/contents/status-transition-panel.tsx : buildChecks() (필수/권장 조건)
  - src/components/contents/review-panel.tsx : 검수 체크리스트(최소 3개) + 승인 후 연쇄 전이
  - src/app/(dashboard)/contents/[id]/content-detail-client.tsx : countImageMarkers()
  - supabase/seed.sql : state_transitions 시드 7행
  - skills/_DECISIONS.md : 카테고리 정본(네이버 categoryNo), Notion 속성명(§4)

콘텐츠 JSON 은 contents 컬럼명 또는 Notion "디딤 블로그 콘텐츠" 한글 속성명(제목·상태·카테고리·categoryNo·
발행일·메모·본문·태그 …) 모두 받는다. Notion 에 검수 상태 속성이 없으면 메모의 [검수 승인]/[수정 요청]/
[재검수 요청] 기록으로 복원한다.

표준 라이브러리만 사용. 입력·출력은 JSON.

사용 예:
  python3 transition_check.py check --content content.json --to S2 --seo-score 72 --cross-validation-run
  python3 transition_check.py review approve --content content.json --checked numbers,law,tone
  python3 transition_check.py review revision --content content.json --memo "3문단 숫자 확인"
  python3 transition_check.py rules
"""
import argparse
import json
import math
import re
import sys
from datetime import datetime, timezone, timedelta

# ── 카테고리 정본 (skills/_DECISIONS.md §1·§2: 네이버 categoryNo = 정본 ID) ──
CATEGORY_TABLE = {
    25: {"name": "지원사업·인증과 특허", "parent": None, "group": "new", "role": "전환형"},
    27: {"name": "출원·심판 실무", "parent": None, "group": "new", "role": "전환형"},
    26: {"name": "사례", "parent": None, "group": "new", "role": "전환형"},
    24: {"name": "지식재산 경영", "parent": None, "group": "new", "role": "브랜딩"},
    28: {"name": "디딤 소식", "parent": None, "group": "new", "role": "트래픽"},
    17: {"name": "디딤 다이어리", "parent": None, "group": "keep", "role": "신뢰"},
    18: {"name": "컨설팅 후기", "parent": 17, "group": "keep", "role": "신뢰"},
    19: {"name": "디딤 일상", "parent": 17, "group": "keep", "role": "신뢰"},
    20: {"name": "대표의 생각", "parent": 17, "group": "keep", "role": "신뢰"},
    7: {"name": "디딤 소개", "parent": None, "group": "fixed", "role": "고정"},
    22: {"name": "상담 안내", "parent": None, "group": "fixed", "role": "고정"},
    9: {"name": "변리사의 현장 수첩", "parent": None, "group": "legacy", "role": "전환형"},
    10: {"name": "절세 시뮬레이션", "parent": 9, "group": "legacy", "role": "전환형"},
    11: {"name": "인증 가이드", "parent": 9, "group": "legacy", "role": "전환형"},
    12: {"name": "연구소 운영 실무", "parent": 9, "group": "legacy", "role": "전환형"},
    23: {"name": "특허·상표 출원 실무", "parent": 9, "group": "legacy", "role": "전환형"},
    13: {"name": "IP 라운지", "parent": None, "group": "legacy", "role": "트래픽"},
    14: {"name": "특허 전략 노트", "parent": 13, "group": "legacy", "role": "트래픽"},
    15: {"name": "AI와 IP", "parent": 13, "group": "legacy", "role": "트래픽"},
    16: {"name": "IP 뉴스 한 입", "parent": 13, "group": "legacy", "role": "트래픽"},
}
# 통계·추천 합산용 신규 카테고리 (DECISIONS §2 '레거시에서 흡수' 열)
STAT_CATEGORY = {9: 25, 10: 25, 11: 25, 12: 25, 23: 27, 18: 26, 13: 24, 14: 24, 15: 24, 16: 28, 19: 17, 20: 17}
# 레거시 별칭(백오피스 CAT-*, supabase/seed.sql 기준) → categoryNo
LEGACY_ALIAS = {"CAT-A": 9, "CAT-A-01": 10, "CAT-A-02": 11, "CAT-A-03": 12, "CAT-A-04": 23,
                "CAT-B": 13, "CAT-B-01": 15, "CAT-B-02": 14, "CAT-B-03": 16,
                "CAT-C": 17, "CAT-C-01": 18, "CAT-C-02": 19, "CAT-C-03": 20,
                "CAT-INTRO": 7, "CAT-CONSULT": 22}
NAME_ALIAS = {"현장 수첩": 9, "현장수첩": 9, "연구소 운영": 12, "IP라운지": 13, "디딤다이어리": 17}
CONVERSION_STATS = {25, 27, 26}  # 전환형 3개 (DECISIONS: 업데이트 주기 60일)


def resolve_category(value):
    """categoryNo(정수/문자열)·이름·CAT-* 별칭 → 카테고리 정보 dict (모르면 None)."""
    if value is None or value == "":
        return None
    no = None
    if isinstance(value, int) or (isinstance(value, str) and value.strip().isdigit()):
        no = int(value)
    elif isinstance(value, str):
        v = value.strip()
        if v.upper().startswith("CAT-"):
            no = LEGACY_ALIAS.get(v.upper())
        else:
            no = next((k for k, c in CATEGORY_TABLE.items() if c["name"] == v), None) or NAME_ALIAS.get(v)
    if no is None or no not in CATEGORY_TABLE:
        return None
    c = CATEGORY_TABLE[no]
    top = c["parent"] or no
    stat = STAT_CATEGORY.get(no, no if c["group"] in ("new", "keep") else None)
    return {"no": no, "name": c["name"], "top": top, "top_name": CATEGORY_TABLE[top]["name"],
            "stat": stat, "stat_name": CATEGORY_TABLE[stat]["name"] if stat else None,
            "group": c["group"], "is_diary": top == 17, "is_fixed": c["group"] == "fixed",
            "is_sub": c["parent"] is not None}


def content_category(c):
    # Notion: 카테고리="레거시" 이면 "레거시 2차 분류" 값(원래 이름)으로 판정
    if c.get("category_name") == "레거시" or c.get("카테고리") == "레거시":
        r = resolve_category(c.get("legacy_sub") or c.get("레거시 2차 분류"))
        if r:
            return r
    for key in ("category_no", "categoryNo", "category_id", "category_name", "category", "카테고리"):
        r = resolve_category(c.get(key))
        if r:
            return r
    return None


# ── Notion "디딤 블로그 콘텐츠" (data source collection://463bc815-11ab-4290-9d86-22bd1aa9cfed) 속성 → 내부 키 ──
# 본문·태그·콘텐츠 ID 는 DB 속성이 아니다(본문=페이지 내용). 대화에서 받은 값을 같은 키로 넣으면 된다.
NOTION_KEYS = {
    "콘텐츠 ID": "id", "제목": "title", "레거시 2차 분류": "legacy_sub", "상담": "consultations", "상태": "status", "카테고리": "category_name",
    "categoryNo": "category_no", "타깃 키워드": "target_keyword", "발행일": "publish_date",
    "발행 URL": "naver_url", "추천 소스": "rec_source", "추천 피드백": "rec_feedback",
    "부적합 사유": "rec_reject_reason", "조회수(최근)": "views_recent", "유입 키워드 TOP3": "top_keywords",
    "댓글 수": "comments", "성과 갱신일": "metrics_updated_at", "시리즈": "series_name",
    "시리즈 회차": "series_order", "마지막 업데이트일": "last_updated_at", "메모": "notes",
    "본문": "body", "태그": "tags", "삭제됨": "is_deleted",
}
STATUS_FULL = {"S0": "S0 기획중", "S1": "S1 초안완료", "S2": "S2 검토완료", "S3": "S3 발행예정",
               "S4": "S4 발행완료", "S5": "S5 성과측정"}  # Notion "상태" 선택지 값 그대로
STATUS_NAMES = {"기획중": "S0", "초안완료": "S1", "검토완료": "S2", "발행예정": "S3", "발행완료": "S4", "성과측정": "S5"}


def normalize_content(c):
    """Notion 한글 속성명 행도 받아 contents 컬럼명으로 맞춘다(원래 키가 있으면 유지)."""
    out = dict(c)
    for k, v in c.items():
        if k in NOTION_KEYS and NOTION_KEYS[k] not in c:
            out[NOTION_KEYS[k]] = v
    st = out.get("status")
    if isinstance(st, str):
        s = st.strip()
        if len(s) >= 2 and s[0] in "Ss" and s[1].isdigit():
            out["status"] = "S" + s[1]
        elif s in STATUS_NAMES:
            out["status"] = STATUS_NAMES[s]
    if isinstance(out.get("tags"), str):
        out["tags"] = [t.strip() for t in out["tags"].replace("#", ",").split(",") if t.strip()]
    if out.get("status") in ("S4", "S5") and not out.get("published_at") and out.get("publish_date"):
        out["published_at"] = out["publish_date"]  # Notion 은 발행일만 기록
    if out.get("views_1m") is None and out.get("views_recent") is not None:
        out["views_1m"] = out["views_recent"]
    return out


STATUS_ORDER = ["S0", "S1", "S2", "S3", "S4", "S5"]

CONTENT_STATES = {
    "S0": "기획중",
    "S1": "초안완료",
    "S2": "검토완료",
    "S3": "발행예정",
    "S4": "발행완료",
    "S5": "성과측정",
}

# supabase/seed.sql 19~26행 (id 는 insert 순서대로 1부터 부여된다고 가정)
SEED_TRANSITIONS = [
    {"id": 1, "entity_type": "content", "from_status": "S0", "to_status": "S1",
     "conditions": {"briefing_done": True}, "auto_checks": ["briefing_exists"],
     "description": "기획→초안: 브리핑 완료 필요", "is_reversible": False},
    {"id": 2, "entity_type": "content", "from_status": "S1", "to_status": "S2",
     "conditions": {"review_done": True, "seo_required_pass": True},
     "auto_checks": ["seo_required_check", "fact_check_done"],
     "description": "초안→검토: 팩트체크+SEO필수 통과", "is_reversible": True},
    {"id": 3, "entity_type": "content", "from_status": "S2", "to_status": "S3",
     "conditions": {"image_done": True, "final_edit_done": True},
     "auto_checks": ["image_uploaded", "publish_date_set"],
     "description": "검토→발행예정: 이미지+최종편집 완료", "is_reversible": False},
    {"id": 4, "entity_type": "content", "from_status": "S3", "to_status": "S4",
     "conditions": {"scheduled_time_reached": True}, "auto_checks": [],
     "description": "발행예정→발행완료: 예약 시간 도래 (자동)", "is_reversible": False},
    {"id": 5, "entity_type": "content", "from_status": "S4", "to_status": "S5",
     "conditions": {"quality_measured": True}, "auto_checks": ["quality_score_calculated"],
     "description": "발행→성과측정: 품질점수 입력 완료", "is_reversible": False},
    {"id": 6, "entity_type": "content", "from_status": "S1", "to_status": "S0",
     "conditions": {"major_revision": True}, "auto_checks": [],
     "description": "초안→기획: 전면 변경 시 역행", "is_reversible": True},
    {"id": 7, "entity_type": "content", "from_status": "S2", "to_status": "S1",
     "conditions": {"minor_revision": True, "revision_count_lt_3": True}, "auto_checks": [],
     "description": "검토→초안: 수정 필요 시 역행 (최대2회)", "is_reversible": True},
]

# validateTransition 이 실제로 평가하는 조건 키 (contents.ts 274~288행)
CHECKED_CONDITION_KEYS = {
    "ai_generation_done", "review_done", "image_done", "revision_count_lt_3", "quality_measured",
}

# review-panel.tsx 39~45행
REVIEW_CHECKLIST = [
    {"id": "numbers", "label": "숫자/금액이 정확한가?"},
    {"id": "law", "label": "법률 조항 번호가 맞는가?"},
    {"id": "cases", "label": "고객 사례가 사실에 기반하는가?"},
    {"id": "tone", "label": "톤이 카테고리에 적합한가?"},
    {"id": "privacy", "label": "공개해도 되는 내용인가?"},
]


# ── 공통 유틸 ──

def js_len(s):
    """JS String.length (UTF-16 코드 유닛 수)."""
    return len(s.encode("utf-16-le")) // 2


def parse_js_date(value):
    """JS new Date(value) 근사: 'YYYY-MM-DD' 는 UTC 자정, 오프셋 없는 일시는 UTC 로 취급."""
    if value is None or value == "":
        return None
    v = str(value).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
        return datetime.fromisoformat(v).replace(tzinfo=timezone.utc)
    v = v.replace("Z", "+00:00").replace(" ", "T", 1)
    dt = datetime.fromisoformat(v)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def now_from_arg(value):
    if value:
        return parse_js_date(value)
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def count_image_markers(text):
    """content-detail-client.tsx countImageMarkers() 포팅."""
    if not text:
        return 0
    count = 0
    positions = []
    for m in re.finditer(r"\[IMAGE:\s*([\s\S]*?)\]\s*\n\s*━━", text):
        positions.append(m.start())
        count += 1
    for m in re.finditer(r"\[IMAGE:\s*([^\]\n]+?)\]", text):
        idx = m.start()
        if any(p <= idx < p + 200 for p in positions):
            continue
        count += 1
    return count


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def cta_exempt(content):
    """원본: category_id.startsWith("CAT-C") (다이어리). 스킬: 디딤 다이어리(17~20) 또는
    디딤 소식의 '사무소 소식'(DECISIONS §5, content.no_cta=true) 이면 CTA 면제."""
    if content.get("no_cta"):
        return True
    if (content.get("category_id") or "").startswith("CAT-C"):
        return True
    cat = content_category(content)
    return bool(cat and cat["is_diary"])


def derive_review_fields(content):
    """Notion 에는 검수 상태 속성이 없으므로 메모의 기록에서 복원한다(스킬 보완)."""
    c = dict(content)
    notes = c.get("notes") or ""
    if not c.get("review_status"):
        marks = [(notes.rfind("[검수 승인]"), "approved"), (notes.rfind("[수정 요청]"), "revision_requested"),
                 (notes.rfind("[재검수 요청]"), "pending")]
        pos, st = max(marks)
        c["review_status"] = st if pos >= 0 else "pending"
    if c.get("revision_count") is None:
        c["revision_count"] = notes.count("[수정 요청]")
    return c


# ── buildChecks (status-transition-panel.tsx 65~204행) ──

def build_checks(content, seo_score, cv_run, cv_critical, image_markers, now):
    status = content.get("status")
    body = content.get("body") or ""
    body_char_count = js_len(re.sub(r"\s", "", body))
    tag_count = len(content.get("tags") or [])
    is_diary = cta_exempt(content)

    if status == "S1":
        review_status = content.get("review_status")
        return [
            {"id": "body-500", "label": "본문 500자 이상", "passed": body_char_count >= 500,
             "detail": f"{body_char_count:,}자", "required": True},
            {"id": "tags-10", "label": "태그 10개", "passed": tag_count >= 10,
             "detail": f"현재 {tag_count}개", "required": True},
            {"id": "cta-exists", "label": "CTA 불필요 (다이어리)" if is_diary else "CTA 블록 존재",
             "passed": is_diary or ("━━" in body) or ("admin@didimip" in body),
             "detail": "면제" if is_diary else ("있음" if "━━" in body else "없음"),
             "required": not is_diary},
            {"id": "review-approved", "label": "대표 검수 승인", "passed": review_status == "approved",
             "detail": "승인됨" if review_status == "approved"
             else ("수정 요청됨" if review_status == "revision_requested" else "미검수"),
             "required": True},
            {"id": "seo-70", "label": "SEO 점수 70점 이상 (권장)", "passed": seo_score >= 70,
             "detail": f"현재 {seo_score}점", "required": False},
            {"id": "cross-validation", "label": "교차검증 완료 (권장)",
             "passed": bool(cv_run) and cv_critical == 0,
             "detail": f"심각 {cv_critical}건" if cv_run else "미수행", "required": False},
            {"id": "images-3", "label": "이미지 마커 3개 이상 (권장)", "passed": image_markers >= 3,
             "detail": f"현재 {image_markers}개", "required": False},
        ]

    if status == "S2":
        pd = content.get("publish_date") or content.get("publish_due")
        has_date = bool(pd)
        return [
            {"id": "publish-date", "label": "발행예정일 설정", "passed": has_date,
             "detail": str(pd)[:10] if has_date else "미설정", "required": True},
            {"id": "images-ready", "label": "이미지 준비 (권장)", "passed": image_markers >= 1,
             "detail": f"이미지 {image_markers}개", "required": False},
        ]

    if status == "S3":
        return []  # S3 → S4: 조건 없음 (모달에서 URL/일시 입력)

    if status == "S4":
        published = parse_js_date(content.get("published_at"))
        if published is None:
            return [{"id": "published-at", "label": "발행일시 필요", "passed": False,
                     "detail": "발행일시가 기록되지 않음", "required": True}]
        days_since = math.floor((now - published).total_seconds() * 1000 / (24 * 60 * 60 * 1000))
        return [{"id": "d-plus-7", "label": "발행 후 7일 경과", "passed": days_since >= 7,
                 "detail": f"D+{days_since}일", "required": True}]

    return []


# ── validateTransition (contents.ts 238~304행) ──

def validate_db_conditions(content, transition):
    failed = []
    conditions = transition.get("conditions") or {}
    if conditions.get("ai_generation_done") and not content.get("ai_generation_id"):
        failed.append("AI 초안 생성이 완료되지 않았습니다.")
    if conditions.get("review_done") and not content.get("review_done_at"):
        failed.append("검토가 완료되지 않았습니다.")
    if conditions.get("image_done") and not content.get("image_done_at"):
        failed.append("이미지가 준비되지 않았습니다.")
    if conditions.get("revision_count_lt_3") and (content.get("revision_count") or 0) >= 3:
        failed.append("수정 횟수가 최대치(2회)를 초과했습니다.")
    if conditions.get("quality_measured") and not content.get("quality_score_final"):
        failed.append("품질 점수가 입력되지 않았습니다.")
    unchecked = [k for k in conditions.keys() if k not in CHECKED_CONDITION_KEYS]
    return failed, unchecked


def status_timestamps(new_status, now, published_at_override=None):
    """updateContentStatusWithMeta() 상태별 타임스탬프 (contents.ts 445~454행)."""
    ts = {"status": new_status, "updated_at": iso(now)}
    if new_status == "S1":
        ts["draft_done_at"] = iso(now)
    elif new_status == "S2":
        ts["review_done_at"] = iso(now)
    elif new_status == "S3":
        ts["image_done_at"] = iso(now)
    elif new_status == "S4":
        ts["published_at"] = published_at_override or iso(now)
    return ts


def cmd_check(args):
    content = derive_review_fields(normalize_content(load_json(args.content)))
    if args.no_cta:
        content["no_cta"] = True
    transitions = load_json(args.transitions) if args.transitions else SEED_TRANSITIONS
    transitions = [t for t in transitions if t.get("entity_type", "content") == "content"]
    now = now_from_arg(args.now)
    from_status = args.from_status or content.get("status")
    to_status = args.to
    content = dict(content, status=from_status)

    image_markers = args.image_markers
    if image_markers is None:
        image_markers = count_image_markers(content.get("body") or "")
    seo_score = args.seo_score if args.seo_score is not None else (content.get("seo_score") or 0)
    if isinstance(seo_score, float) and seo_score.is_integer():
        seo_score = int(seo_score)  # JS 숫자 표기와 동일하게 (72.0 → 72)

    rule = next((t for t in transitions
                 if t["from_status"] == from_status and t["to_status"] == to_status), None)
    out = {
        "from": from_status, "to": to_status,
        "from_label": CONTENT_STATES.get(from_status), "to_label": CONTENT_STATES.get(to_status),
        "rule": rule,
    }
    if rule is None:
        out.update({
            "allowed": False, "kind": "blocked",
            "message": f"{from_status}에서 {to_status}로의 전이는 허용되지 않습니다.",
            "kanban_message": f"{CONTENT_STATES.get(from_status)}에서 {CONTENT_STATES.get(to_status)}(으)로 "
                              f"이동할 수 없습니다 — 허용되지 않은 전이입니다.",
        })
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return

    direction = "forward" if STATUS_ORDER.index(to_status) > STATUS_ORDER.index(from_status) else "reverse"
    warnings = []
    if (direction == "forward") == bool(rule.get("is_reversible")):
        warnings.append(
            f"시드의 is_reversible={rule.get('is_reversible')} 가 상태 순서상 방향({direction})과 다릅니다. "
            "원본 상세 패널은 is_reversible=false 행만 '다음 단계' 버튼으로 보여주므로, 이 행은 원본 UI 에서 "
            + ("'되돌리기' 버튼으로 표시됩니다." if rule.get("is_reversible") else "'다음 단계' 로 표시됩니다.")
        )

    db_failed, db_unchecked = validate_db_conditions(content, rule)
    checks = []
    if direction == "forward":
        checks = build_checks(content, seo_score, args.cross_validation_run,
                              args.cross_validation_critical, image_markers, now)
    required = [c for c in checks if c["required"]]
    recommended = [c for c in checks if not c["required"]]
    req_failed = [c for c in required if not c["passed"]]
    rec_failed = [c for c in recommended if not c["passed"]]

    needs_input = []
    if direction == "reverse":
        kind = "needs_reason"
        needs_input.append("되돌리기 사유(필수) — notes 에 '[역행 전이 사유] …' 로 기록")
    elif req_failed:
        kind = "blocked_required"
    elif rec_failed:
        kind = "confirm_recommended"
    else:
        kind = "ok"
    if direction == "forward" and to_status == "S4":
        needs_input.append("네이버 블로그 URL(선택), 발행일시(기본 현재 시각)")
    if direction == "forward" and to_status == "S5":
        needs_input.append("1주차 성과: 조회수, 댓글 수, 이웃 추가 수, 상담 문의 여부 (didim-blog-performance)")

    out.update({
        "allowed": kind in ("ok", "confirm_recommended", "needs_reason"),
        "direction": direction,
        "kind": kind,
        "required_checks": required,
        "recommended_checks": recommended,
        "required_met": f"{len(required) - len(req_failed)}/{len(required)}",
        "recommended_met": f"{len(recommended) - len(rec_failed)}/{len(recommended)}",
        "admin_force_possible": kind == "blocked_required",
        "kanban_db_condition_warnings": db_failed,
        "db_conditions_not_evaluated_by_code": db_unchecked,
        "needs_input": needs_input,
        "updates_on_transition": status_timestamps(to_status, now, args.published_at),
        "image_marker_count": image_markers,
        "seo_score_used": seo_score,
        "warnings": warnings,
    })
    print(json.dumps(out, ensure_ascii=False, indent=2))


# ── 대표 검수 (contents.ts approveReview/requestRevision/resetReviewStatus + review-panel.tsx) ──

def chain_after_approve(content, now):
    """review-panel.tsx 99~132행: 승인 후 S1→S2, S2→S3 연쇄 자동 전이."""
    latest = dict(content)
    steps = []
    if latest.get("status") == "S1":
        body = latest.get("body") or ""
        body_len = js_len(re.sub(r"\s", "", body))
        tag_count = len(latest.get("tags") or [])
        has_cta = ("━━" in body) or ("admin@didimip" in body)
        is_diary = cta_exempt(latest)
        if body_len >= 500 and tag_count >= 10 and (is_diary or has_cta):
            latest.update(status_timestamps("S2", now))
            steps.append({"to": "S2", "toast": "→ 검토완료(S2) 자동 전이"})
        else:
            steps.append({"to": None, "stopped_at": "S1",
                          "reason": {"body_len": body_len, "tag_count": tag_count,
                                     "has_cta": has_cta, "is_diary": is_diary}})
    if latest.get("status") == "S2":
        if latest.get("publish_date") or latest.get("publish_due"):
            latest.update(status_timestamps("S3", now))
            steps.append({"to": "S3", "toast": "→ 발행예정(S3) 자동 전이"})
        else:
            steps.append({"to": None, "stopped_at": "S2", "reason": "발행예정일(publish_date/publish_due) 없음"})
    return latest, steps


def cmd_review(args):
    content = derive_review_fields(normalize_content(load_json(args.content)))
    now = now_from_arg(args.now)
    out = {"action": args.action}
    if args.action == "approve":
        checked = [c for c in (args.checked or "").split(",") if c]
        valid_ids = {c["id"] for c in REVIEW_CHECKLIST}
        unknown = [c for c in checked if c not in valid_ids]
        if len(checked) < 3:
            out.update({"ok": False, "error": "최소 3개 항목을 체크해야 승인할 수 있습니다.",
                        "checklist": REVIEW_CHECKLIST})
        else:
            updated = dict(content)
            updated.update({
                "review_status": "approved",
                "reviewer_id": args.reviewer or content.get("reviewer_id"),
                "review_done_at": iso(now),
                "review_memo": f"[검수 승인] 체크: {', '.join(checked)}",
                "updated_at": iso(now),
            })
            latest, steps = chain_after_approve(updated, now)
            out.update({"ok": True, "toast": "검수 승인 완료", "unknown_check_ids": unknown,
                        "chain": steps, "content_after": latest,
                        "notion_memo_append": f"[검수 승인] 체크: {', '.join(checked)} ({iso(now)[:10]})",
                        "notion_status_after": latest.get("status")})
    elif args.action == "revision":
        memo = (args.memo or "").strip()
        if not memo:
            out.update({"ok": False, "error": "수정 사항을 입력해주세요."})
        else:
            updated = dict(content)
            updated.update({
                "review_status": "revision_requested",
                "reviewer_id": args.reviewer or content.get("reviewer_id"),
                "review_memo": memo,
                "revision_count": (content.get("revision_count") or 0) + 1,
                "updated_at": iso(now),
            })
            out.update({"ok": True, "toast": "수정 요청이 등록되었습니다.", "content_after": updated,
                        "notion_memo_append": f"[수정 요청] {memo} ({updated['revision_count']}회차, {iso(now)[:10]})"})
    elif args.action == "reset":
        updated = dict(content)
        updated.update({"review_status": "pending", "review_memo": None, "updated_at": iso(now)})
        out.update({"ok": True, "toast": "검수 상태가 초기화되었습니다. 다시 검수를 요청하세요.",
                    "content_after": updated,
                    "notion_memo_append": f"[재검수 요청] ({iso(now)[:10]})"})
    if content.get("status") != "S1":
        out["note"] = "원본 UI 의 검수 패널은 status=S1 일 때만 표시됩니다."
    print(json.dumps(out, ensure_ascii=False, indent=2))


def cmd_rules(args):
    transitions = load_json(args.transitions) if args.transitions else SEED_TRANSITIONS
    print(json.dumps({"states": CONTENT_STATES, "transitions": transitions,
                      "review_checklist": REVIEW_CHECKLIST}, ensure_ascii=False, indent=2))


def cmd_markers(args):
    body = open(args.body, encoding="utf-8").read() if args.body != "-" else sys.stdin.read()
    print(json.dumps({"image_marker_count": count_image_markers(body),
                      "body_char_count_no_space": js_len(re.sub(r"\s", "", body))},
                     ensure_ascii=False, indent=2))


def main():
    p = argparse.ArgumentParser(description="디딤 블로그 콘텐츠 상태 전이(S0~S5) 검증 — JSON 입출력")
    sub = p.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("check", help="전이 가능 여부·필수/권장 조건·DB 조건·기록할 필드 계산")
    c.add_argument("--content", required=True, help="콘텐츠 JSON 파일 경로('-'=stdin). contents 테이블 컬럼명 사용")
    c.add_argument("--to", required=True, choices=STATUS_ORDER, help="목표 상태")
    c.add_argument("--from", dest="from_status", choices=STATUS_ORDER, help="현재 상태(생략 시 content.status)")
    c.add_argument("--transitions", help="state_transitions 행 JSON 배열(생략 시 seed.sql 7행)")
    c.add_argument("--seo-score", type=float, help="SEO 정규화 점수 0~100 (생략 시 content.seo_score 또는 0)")
    c.add_argument("--cross-validation-run", action="store_true", help="교차검증 수행 여부")
    c.add_argument("--cross-validation-critical", type=int, default=0, help="교차검증 심각 이슈 수")
    c.add_argument("--image-markers", type=int, help="이미지 마커 수(생략 시 본문에서 계산)")
    c.add_argument("--published-at", help="S4 전이 시 발행일시 override (ISO)")
    c.add_argument("--no-cta", action="store_true", help="CTA 면제 글(디딤 소식의 사무소 소식 등)")
    c.add_argument("--now", help="기준 시각 ISO (기본: 현재 UTC)")
    c.set_defaults(func=cmd_check)

    r = sub.add_parser("review", help="대표 검수: approve / revision / reset")
    r.add_argument("action", choices=["approve", "revision", "reset"])
    r.add_argument("--content", required=True)
    r.add_argument("--checked", help="approve: 체크한 항목 id 콤마목록 (numbers,law,cases,tone,privacy)")
    r.add_argument("--memo", help="revision: 수정 요청 메모(필수)")
    r.add_argument("--reviewer", help="검수자 식별자")
    r.add_argument("--now")
    r.set_defaults(func=cmd_review)

    ru = sub.add_parser("rules", help="상태 정의·전이 규칙·검수 체크리스트 출력")
    ru.add_argument("--transitions")
    ru.set_defaults(func=cmd_rules)

    m = sub.add_parser("markers", help="본문 텍스트 파일의 이미지 마커 수·공백 제외 글자수")
    m.add_argument("--body", required=True, help="본문 텍스트 파일('-'=stdin)")
    m.set_defaults(func=cmd_markers)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
