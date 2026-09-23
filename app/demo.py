"""--demo 실행용 예시 결제내역 (설계안 프로토타입과 같은 숫자)."""
from datetime import date, timedelta

from .mvp import week_start

# 이번 주를 마지막으로 하는 최근 14주
RECENT = [150000, 180000, 0, 330000, 55000, 0, 210000, 99000, 0, 385000, 33000, 0, 88000, 61000]
ITEMS = ["로얄 스타일 쿠폰 11+1", "원더베리 11+1", "골드 애플 11+1", "루나 크리스탈 스위트 11+1", "스페셜 패키지"]


def rows(today: date) -> list[dict]:
    this_week = week_start(today)
    # 더 오래된 주는 규칙적인 패턴으로 채운다 (이월 재현용)
    older = [(i * 37_000) % 160_000 for i in range(52)]
    amounts = older + RECENT
    first = this_week - timedelta(weeks=len(amounts) - 1)
    out = []
    for i, amount in enumerate(amounts):
        # 한 주 금액을 최대 3건으로 나눠 기록
        parts = [amount] if amount < 50_000 else [amount - amount // 3 - amount // 4, amount // 3, amount // 4]
        for j, p in enumerate(p for p in parts if p):
            d = first + timedelta(weeks=i, days=(j * 2) % 7)
            if d > today:
                d = today
            out.append({"date": d.isoformat(), "item": ITEMS[(i + j) % len(ITEMS)], "price": p})
    return out
