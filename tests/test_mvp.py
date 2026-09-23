from datetime import date, datetime

from app.mvp import (BLACK, CARRY_MAX, KST, TIERS, forecast, grade, need_for, need_now, plan, replay,
                     tier_now, tier_of, today_kst, week_start, weekly_amounts)

T = {t.key: t for t in TIERS}


def test_tier_boundaries():
    assert tier_of(149_999) is None
    assert tier_of(150_000) == T["bronze"]
    assert tier_of(1_499_999) == T["diamond"]
    assert tier_of(2_500_000) == T["black"]


def test_week_starts_on_thursday():
    assert week_start(date(2026, 9, 17)) == date(2026, 9, 17)  # 목
    assert week_start(date(2026, 9, 23)) == date(2026, 9, 17)  # 수
    assert week_start(date(2026, 9, 24)) == date(2026, 9, 24)  # 다음 목


def test_today_kst_crosses_midnight():
    # UTC 15:00 = KST 다음날 00:00
    assert today_kst(datetime.fromisoformat("2026-09-23T15:00:00+00:00")) == date(2026, 9, 24)
    assert today_kst(datetime(2026, 9, 23, 23, 59, tzinfo=KST)) == date(2026, 9, 23)


def test_weekly_amounts_buckets_and_month_boundary():
    this_week = date(2026, 10, 1)  # 목
    rows = [
        {"date": "2026-10-01", "price": 1000},   # 이번 주 첫날
        {"date": "2026-09-30", "price": 200},    # 지난주 마지막 날 (수)
        {"date": "2026-09-24", "price": 30},     # 지난주 첫날
        {"date": "2026-07-02", "price": 5},      # 13주 전 → 범위 밖
        {"date": "2026-07-09", "price": 7},      # 12주 전 목요일 → 첫 칸
    ]
    w = weekly_amounts(rows, this_week, 13)
    assert w[-1] == 1000
    assert w[-2] == 230
    assert w[0] == 7
    assert sum(w) == 1237


def test_grade_from_total():
    assert grade(1_300_000, 0).tier == T["diamond"]
    assert grade(0, 0).tier is None


def test_grade_adds_only_newest_week_excess():
    # 합계 270만, 직전에 끝난 주 결제 30만 → 초과 20만만 이월
    assert grade(2_700_000, 0, 300_000).carry == 200_000
    # 직전 주 결제가 적으면 그만큼만 쌓인다
    assert grade(2_700_000, 0, 50_000).carry == 50_000


def test_grade_uses_carry_like_official_examples():
    # 예시 1: 이월 300만, 100만 부족 → 블랙 유지, 200만 남음
    r = grade(1_500_000, 3_000_000)
    assert r.tier == BLACK and r.carry == 2_000_000 and r.carry_used == 1_000_000
    # 예시 2: 이월 50만, 100만 부족 → 모두 차감, 200만으로 레드
    r = grade(1_500_000, 500_000)
    assert r.tier == T["red"] and r.carry == 0 and r.carry_used == 500_000


def test_carry_is_capped():
    assert grade(20_000_000, 9_000_000, 20_000_000).carry == CARRY_MAX


def test_tier_now_counts_this_week():
    # 이번 주 결제가 바로 합계에 들어가 등급이 오른다
    assert tier_now([20_000] * 12 + [400_000], 0) == T["gold"]
    assert tier_now([20_000] * 12 + [0], 0) == T["bronze"]


def test_replay_grade_at_week_start_excludes_this_week():
    # 이번 주가 시작될 때는 새 주가 0원이라 앞선 12주 합계로 등급이 정해진다
    amounts = [0] + [50_000] * 12 + [400_000]   # 앞선 12주 60만, 이번 주 40만
    tier, carry = replay(amounts)
    assert tier == T["gold"] and carry == 0
    assert tier_now(amounts[-13:], carry) == T["diamond"]   # 100만


def test_replay_big_spend_extends_black_one_week():
    # 500만을 쓴 주는 12번의 갱신 동안 합계에 남고, 빠진 뒤에는 이월 250만이 한 번 메운다
    amounts = [0] * 12 + [5_000_000] + [0] * 12
    tier, carry = replay(amounts)
    assert tier == BLACK and carry == 2_500_000
    tier, carry = replay(amounts + [0])
    assert tier == BLACK and carry == 0
    tier, carry = replay(amounts + [0, 0])
    assert tier is None


def test_forecast_drops_oldest_week_each_time():
    last13 = [100_000] * 13
    f = forecast(last13, 0)
    assert len(f) == 13
    # 다음 목요일에는 가장 오래된 주가 빠진다
    assert [r.sum for r in f[:3]] == [1_200_000, 1_100_000, 1_000_000]
    assert f[-1].sum == 0 and f[-1].tier is None
    f = forecast(last13, 0, extra=300_000)
    assert f[0].sum == 1_500_000 and f[0].tier == T["red"]


def test_forecast_spends_carry():
    f = forecast([0] * 12 + [2_000_000], 1_000_000)
    assert f[0].tier == BLACK and f[0].carry == 500_000   # 200만에 이월 50만을 채워 블랙
    assert f[1].tier == BLACK and f[1].carry == 0         # 남은 이월 50만을 마저 사용
    assert f[2].tier == T["red"] and f[2].carry == 0      # 이월이 없으니 200만 그대로
    assert f[12].sum == 0 and f[12].tier is None          # 200만 주도 빠짐


def test_need_for_next_thursday_drops_oldest_week():
    last13 = [100_000] * 13                      # 지금 130만
    assert need_now(T["red"], last13, 0) == 200_000
    # 다음 목요일에는 가장 오래된 10만이 빠져서 그만큼 더 필요하다
    assert need_for(T["red"], last13, 0) == 300_000
    assert need_for(T["red"], last13, 50_000) == 250_000
    assert need_for(T["gold"], last13, 0) == 0


def test_plan_equal_split_over_remaining_weeks():
    last13 = [0] * 12 + [100_000]          # 이번 주 10만 사용
    p = plan(last13, BLACK, 3, {})         # 3주 뒤까지 (이번 주 포함 4주)
    assert p["base"] == 100_000 and p["required"] == 2_400_000
    assert p["weeksCount"] == 4 and p["equalPer"] == 600_000 and p["autoPer"] == 600_000
    assert p["reached"] == 3 and p["shortfall"] == 0


def test_plan_fixed_weeks_and_shortfall():
    last13 = [0] * 13
    # 4주 모두 20만 고정 → 80만, 블랙까지 170만 부족
    p = plan(last13, BLACK, 3, {o: 200_000 for o in range(4)})
    assert p["shortfall"] == 1_700_000 and p["reached"] is None and p["autoCount"] == 0
    # 두 주만 고정하면 나머지 두 주에 부족분을 나눈다 (1,000원 단위 올림)
    p = plan(last13, BLACK, 3, {0: 200_000, 1: 200_000})
    assert p["autoPer"] == 1_050_000 and p["shortfall"] == 0


def test_plan_counts_weeks_dropping_out():
    # 오래된 주의 결제는 목표 주까지 가면 빠진다
    last13 = [1_000_000] + [0] * 11 + [0]
    p = plan(last13, T["gold"], 0, {})
    assert p["base"] == 1_000_000 and p["required"] == 0
    p = plan(last13, T["gold"], 1, {})
    assert p["base"] == 0 and p["required"] == 600_000
    assert p["timeline"][1]["drop"] == 1_000_000


def test_plan_far_target_ignores_weeks_outside_window():
    p = plan([0] * 13, T["gold"], 14, {0: 5_000_000})
    assert p["weeksCount"] == 13            # 2..14주만 계산에 들어감
    assert p["timeline"][0]["counts"] is False and p["fixedSum"] == 0


def test_plan_skip_this_week():
    last13 = [0] * 12 + [100_000]          # 이번 주 이미 10만
    p = plan(last13, BLACK, 3, {0: 500_000}, skip_this_week=True)
    assert p["weeksCount"] == 3 and p["fixedSum"] == 0          # 이번 주 고정값은 무시
    assert p["equalPer"] == 800_000 and p["autoPer"] == 800_000  # 240만 / 3주
    assert p["timeline"][0]["amount"] == 0 and p["timeline"][0]["skipped"] is True
    assert p["timeline"][0]["sum"] == 100_000
    # 목표가 이번 주인데 이번 주를 건너뛰면 결제할 주가 없다
    p = plan(last13, BLACK, 0, {}, skip_this_week=True)
    assert p["weeksCount"] == 0 and p["shortfall"] == 2_400_000
