"""MVP 주차 경계와 한국 날짜.

등급·이월·13주 창 계산은 여기 없다. exe와 웹이 같은 규칙을 써야 해서
frontend/src/lib/core/ 로 옮겼다 (mvp.ts, pcroom.ts, engine.ts).
파이썬은 넥슨 수집과 저장, 캡처 인식만 하고 판단은 화면 쪽에서 한다.

주차 경계는 수집 범위를 정하는 데 필요해서 이것만 남긴다.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
WINDOW = 13     # 등급 기준이 되는 주 수 ('이번 주 포함 최근 13주')


def week_start(d: date) -> date:
    """d가 속한 MVP 주의 시작일(목요일). 주 단위는 목 00:00 ~ 다음 수 23:59다."""
    return d - timedelta(days=(d.weekday() - 3) % 7)


def today_kst(now: datetime | None = None) -> date:
    return (now or datetime.now(KST)).astimezone(KST).date()
