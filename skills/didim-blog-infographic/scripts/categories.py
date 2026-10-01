#!/usr/bin/env python3
"""카테고리 → 인포그래픽 팔레트·개수·우선 유형 매핑 (skills/_DECISIONS.md §1·§2 + 인포그래픽 규칙 v2).

신규 구조(네이버 categoryNo)와 레거시 이름을 모두 받는다. 단독 실행:
  python3 categories.py "출원·심판 실무"   → 매핑 결과 JSON
  python3 categories.py --list            → 전체 표

group:
  field  = v2 '변리사의 현장 수첩' 규칙 (오렌지 팔레트, 본문 2~3개, 부족하면 1개 허용)
  lounge = v2 'IP 라운지' 규칙 (네이비 팔레트, 본문 1~2개)
  news   = v2 'IP 뉴스 한 입' 규칙 (차콜 팔레트, 본문 0~1개, C만)
  diary  = 인포그래픽 없음, 분위기 사진만
"""
import argparse
import json
import sys

# (categoryNo, 이름, group, 우선 유형, 구분)
CATEGORY_TABLE = [
    (25, "지원사업·인증과 특허", "field", ["A", "C", "E"], "신규"),
    (27, "출원·심판 실무", "field", ["B", "D", "E"], "신규"),
    (26, "사례", "field", ["A", "D", "C"], "신규"),
    (24, "지식재산 경영", "lounge", ["G", "D", "H"], "신규"),
    (28, "디딤 소식", "news", ["C"], "신규"),
    (17, "디딤 다이어리", "diary", [], "유지"),
    (18, "컨설팅 후기", "diary", [], "유지(다이어리 하위)"),
    (19, "디딤 일상", "diary", [], "유지(다이어리 하위)"),
    (20, "대표의 생각", "diary", [], "유지(다이어리 하위)"),
    (9, "변리사의 현장 수첩", "field", ["A", "C", "B"], "레거시"),
    (10, "절세 시뮬레이션", "field", ["A", "C"], "레거시(현장 수첩 하위)"),
    (11, "인증 가이드", "field", ["A", "E", "B"], "레거시(현장 수첩 하위)"),
    (12, "연구소 운영 실무", "field", ["A", "B", "E"], "레거시(현장 수첩 하위)"),
    (23, "특허·상표 출원 실무", "field", ["B", "D", "E"], "레거시(현장 수첩 하위)"),
    (13, "IP 라운지", "lounge", ["G", "D", "H"], "레거시"),
    (14, "특허 전략 노트", "lounge", ["G", "D", "H"], "레거시(IP 라운지 하위)"),
    (15, "AI와 IP", "lounge", ["G", "D", "H"], "레거시(IP 라운지 하위)"),
    (16, "IP 뉴스 한 입", "news", ["C"], "레거시(IP 라운지 하위)"),
]
# v2 '개수와 배치' 표: (권장 최소, 최대, 허용 최소)
BODY_COUNT = {"field": (2, 3, 1), "lounge": (1, 2, 1), "news": (0, 1, 0), "diary": (0, 0, 0)}
# 이름 표기 흔들림 대응 (공백·가운뎃점 제거 후 비교)
ALIASES = {
    "현장수첩": 9, "라운지": 13, "뉴스한입": 16, "다이어리": 17, "지원사업": 25, "인증과특허": 25,
    "출원심판": 27, "출원실무": 27, "심판실무": 27, "지식재산경영": 24, "ip경영": 24, "디딤소식": 28,
    "사무소소식": 28, "field": 9, "lounge": 13, "news": 16, "diary": 17,
}


def _key(s):
    return "".join(ch for ch in str(s).lower() if ch not in " ·・.,/-_")


def resolve(name):
    """이름·categoryNo·별칭 → {'categoryNo','name','group','priority','status','count'}. 모르면 None."""
    raw = str(name or "").strip()
    if not raw:
        return None
    if raw.isdigit():
        for no, nm, g, pr, st in CATEGORY_TABLE:
            if no == int(raw):
                return _row(no, nm, g, pr, st)
    k = _key(raw)
    for no, nm, g, pr, st in CATEGORY_TABLE:  # 정확히 일치
        if _key(nm) == k:
            return _row(no, nm, g, pr, st)
    # "IP 라운지 > 특허 전략 노트" 같은 경로: 가장 구체적인(긴) 이름 우선
    hits = [(len(_key(nm)), no, nm, g, pr, st) for no, nm, g, pr, st in CATEGORY_TABLE if _key(nm) in k and nm != "사례"]
    if hits:
        _, no, nm, g, pr, st = max(hits)
        return _row(no, nm, g, pr, st)
    for alias, no in ALIASES.items():
        if alias in k:
            return resolve(str(no))
    return None


def _row(no, nm, g, pr, st):
    return {"categoryNo": no, "name": nm, "group": g, "priority": pr, "status": st, "count": BODY_COUNT[g]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("name", nargs="?", help="카테고리 이름 또는 categoryNo")
    ap.add_argument("--list", action="store_true", help="전체 매핑 표 출력")
    a = ap.parse_args()
    if a.list or not a.name:
        print(json.dumps([_row(*r) for r in CATEGORY_TABLE], ensure_ascii=False, indent=2))
        return
    r = resolve(a.name)
    print(json.dumps(r, ensure_ascii=False, indent=2))
    sys.exit(0 if r else 1)


if __name__ == "__main__":
    main()
