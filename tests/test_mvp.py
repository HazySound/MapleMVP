from datetime import date, datetime

from app.mvp import KST, today_kst, week_start

# 등급·이월·13주 계산 테스트는 frontend/src/lib/core/*.test.ts 로 옮겼다.
# 여기에는 수집 범위를 정하는 데 쓰는 주차 경계만 남긴다.


def test_week_starts_on_thursday():
    assert week_start(date(2026, 9, 17)) == date(2026, 9, 17)  # 목
    assert week_start(date(2026, 9, 23)) == date(2026, 9, 17)  # 수
    assert week_start(date(2026, 9, 24)) == date(2026, 9, 24)  # 다음 목


def test_today_kst_crosses_midnight():
    # UTC 15:00 = KST 다음날 00:00
    assert today_kst(datetime.fromisoformat("2026-09-23T15:00:00+00:00")) == date(2026, 9, 24)
    assert today_kst(datetime(2026, 9, 23, 23, 59, tzinfo=KST)) == date(2026, 9, 23)
