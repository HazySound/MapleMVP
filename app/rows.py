"""구매내역 행 정규화와 두 수집 경로의 병합. 입출력 없는 순수 함수만 둔다.

수집 경로가 둘이다.
  - 메이플 아이템 구매내역 (maplestory.nexon.com)  : 10년치까지 거슬러 갈 수 있지만 빠지는 결제가 있다
  - 넥슨 통합 캐시 사용내역 (public.api.nexon.com) : 메이플 쪽에 안 뜨는 결제까지 다 있다

같은 달을 둘 다 받았으면 통합 내역이 상위집합이라 그쪽을 정본으로 쓴다.
"""
from __future__ import annotations

import re

MAPLE = "메이플스토리"
USED = "사용"
DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def normalize_usage(raw: list[dict]) -> tuple[list[dict], dict[str, int]]:
    """통합 사용내역 응답을 {date, item, price} 행으로 바꾼다.

    메이플 결제 중 '사용' 상태인 것만 남긴다. 반환: (행, 걸러낸 상태값별 건수).
    """
    rows: list[dict] = []
    skipped: dict[str, int] = {}
    for r in raw:
        if (r.get("gameName") or "").strip() != MAPLE:
            continue
        status = (r.get("purchaseStatus") or "").strip()
        if status != USED:
            skipped[status] = skipped.get(status, 0) + 1
            continue
        m = DATE_RE.match(str(r.get("purchaseDate") or ""))
        if not m:
            continue
        rows.append({
            "date": "-".join(m.groups()),
            "item": re.sub(r"\s+", " ", str(r.get("purchaseItem") or "")).strip(),
            "price": int(r.get("purchaseAmount") or 0),
        })
    return rows, skipped


def merge_months(months: dict, usage: dict) -> list[dict]:
    """달마다 정본을 골라 전체 행을 만든다.

    통합 내역이 있고 비어 있지 않으면 그쪽을 쓴다. 세션이 풀려 빈 응답이 왔을 때
    멀쩡한 메이플 데이터를 덮어쓰지 않도록 '비어 있지 않으면'이라는 조건을 둔다.
    """
    out: list[dict] = []
    for key in sorted(set(months) | set(usage)):
        rows = (usage.get(key) or {}).get("rows") or (months.get(key) or {}).get("rows") or []
        out.extend(rows)
    return out
