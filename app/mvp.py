"""MVP 주차·등급·이월 계산. 입출력 없는 순수 함수만 둔다."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))
WINDOW = 13
CARRY_MAX = 10_000_000


@dataclass(frozen=True)
class Tier:
    key: str
    name: str
    th: int


TIERS = [
    Tier("bronze", "브론즈", 150_000),
    Tier("silver", "실버", 300_000),
    Tier("gold", "골드", 600_000),
    Tier("diamond", "다이아", 900_000),
    Tier("red", "레드", 1_500_000),
    Tier("black", "블랙", 2_500_000),
]
BLACK = TIERS[-1]


def tier_of(amount: int) -> Tier | None:
    found = None
    for t in TIERS:
        if amount >= t.th:
            found = t
    return found


def tier_index(t: Tier | None) -> int:
    return TIERS.index(t) if t else -1


def week_start(d: date) -> date:
    """d가 속한 MVP 주의 시작일(목요일)."""
    return d - timedelta(days=(d.weekday() - 3) % 7)


def today_kst(now: datetime | None = None) -> date:
    return (now or datetime.now(KST)).astimezone(KST).date()


def weekly_amounts(rows: list[dict], this_week: date, n_weeks: int) -> list[int]:
    """이번 주를 마지막으로 하는 n_weeks개 주의 결제 합계 (오래된 주 → 이번 주)."""
    first = this_week - timedelta(weeks=n_weeks - 1)
    out = [0] * n_weeks
    for r in rows:
        d = date.fromisoformat(r["date"])
        if d < first:
            continue
        i = (d - first).days // 7
        if i < n_weeks:
            out[i] += r["price"]
    return out


@dataclass(frozen=True)
class Refresh:
    sum: int            # 그 시점의 13주 합계
    tier: Tier | None   # 갱신 결과 등급
    carry: int          # 갱신 후 이월 잔액
    carry_used: int
    carry_added: int


def grade(total: int, carry: int, newest: int = 0) -> Refresh:
    """13주 합계(total)와 이월 잔액으로 등급을 정한다.

    - 블랙 기준을 넘으면 초과분이 이월된다. newest(직전에 끝난 주의 결제)를 넘겨받으면 그 주 결제분까지만 쌓는다.
    - 기준에 못 미치면 이월 잔액으로 부족분을 메우고, 모자라면 잔액을 모두 써서 합친 금액으로 등급을 정한다.
    """
    if total >= BLACK.th:
        new_carry = min(CARRY_MAX, carry + min(newest, total - BLACK.th))
        return Refresh(total, BLACK, new_carry, 0, new_carry - carry)
    shortage = BLACK.th - total
    if carry >= shortage:
        return Refresh(total, BLACK, carry - shortage, shortage, 0)
    return Refresh(total, tier_of(total + carry), 0, carry, 0)


def replay(amounts: list[int]) -> tuple[Tier | None, int]:
    """amounts(오래된 주 → 이번 주)로 지난 목요일 갱신들을 재현한다.

    등급 기준은 "이번 주 포함 최근 13주"라서, 목요일 0시에는 새 주가 0원이므로 앞선 12주 합계로 등급이 정해진다.
    반환: (이번 주가 시작될 때 정해진 등급, 지금 이월 잔액). 이월은 데이터 시작 시점에 0이었다고 가정한다.
    """
    assert len(amounts) >= WINDOW
    carry, tier = 0, None
    # 주 k가 시작되는 목요일마다 갱신. 그 순간의 13주 창은 k-12 ~ k 이고 k는 아직 0원이다.
    for k in range(WINDOW - 1, len(amounts)):
        prev12 = amounts[k - WINDOW + 1:k]
        r = grade(sum(prev12), carry, prev12[-1] if prev12 else 0)
        carry, tier = r.carry, r.tier
    return tier, carry


def tier_now(last13: list[int], carry: int) -> Tier | None:
    """지금 등급. 이번 주 결제까지 더한 13주 합계로 바로 정해진다."""
    return grade(sum(last13), carry, last13[-1]).tier


def forecast(last13: list[int], carry: int, extra: int = 0) -> list[Refresh]:
    """이번 주에 extra를 더 쓰고 그 뒤로 결제가 없을 때, 다음 목요일부터 13번의 갱신 결과.

    갱신 때마다 가장 오래된 주가 빠지고 새 주는 0원으로 들어온다.
    """
    w = last13[:-1] + [last13[-1] + extra]
    out = []
    for k in range(WINDOW):
        # 직전에 끝난 주는 첫 갱신에서만 결제가 있다 (그 뒤 주들은 0원)
        r = grade(sum(w[k + 1:]), carry, w[-1] if k == 0 else 0)
        carry = r.carry
        out.append(r)
    return out


def need_for(target: Tier, last13: list[int], carry: int) -> int:
    """다음 목요일에 target 이상이 되려면 이번 주에 더 결제해야 하는 금액.

    다음 목요일의 13주 창에서는 가장 오래된 주가 빠지므로 그만큼 기준이 높아진다.
    """
    return max(0, target.th - sum(last13[1:]) - carry)


def need_now(target: Tier, last13: list[int], carry: int) -> int:
    """지금 당장 target으로 올리려면 더 결제해야 하는 금액."""
    return max(0, target.th - sum(last13) - carry)


def _ceil_unit(v: int, unit: int) -> int:
    return -(-v // unit) * unit


def plan(last13: list[int], target: Tier, t: int, fixed: dict[int, int],
         skip_this_week: bool = False, unit: int = 1000) -> dict:
    """t주 뒤(0 = 이번 주) 그 주의 13주 합계가 target 기준에 닿도록 결제 계획을 세운다.

    last13: 이번 주를 마지막으로 하는 13주 결제 (이번 주는 지금까지 쓴 금액)
    fixed:  주 오프셋 → 직접 정한 추가 결제 금액. 나머지 주에는 부족분을 균등하게 나눈다.
    skip_this_week: 이번 주는 더 결제하지 않는다 (이미 쓴 금액만 반영).
    이월은 목요일 갱신 때 부족분을 메우는 데만 쓰여서 여기서는 넣지 않는다.
    """
    assert t >= 0
    first = max(0, t - (WINDOW - 1))          # 목표 주의 13주 안에 드는 첫 계획 주
    weeks = [o for o in range(first, t + 1) if not (skip_this_week and o == 0)]

    def past(o: int) -> int:
        """o주 뒤의 13주 안에 드는 이미 끝난(또는 진행 중인) 주 결제 합."""
        return sum(last13[WINDOW - 1 + k] for k in range(o - (WINDOW - 1), 1) if WINDOW - 1 + k >= 0)

    base = past(t)
    required = max(0, target.th - base)
    fixed = {o: max(0, a) for o, a in fixed.items() if o in weeks}
    fixed_sum = sum(fixed.values())
    free = [o for o in weeks if o not in fixed]
    remaining = required - fixed_sum
    auto = _ceil_unit(max(0, remaining), unit * len(free)) // len(free) if free else 0
    amounts = {o: fixed.get(o, auto) for o in weeks}

    timeline = []
    for o in range(t + 1):
        s = past(o) + sum(amounts.get(k, 0) for k in range(max(0, o - (WINDOW - 1)), o + 1))
        # 이 주 목요일에 13주 밖으로 밀려나는 주의 결제
        drop = last13[o - 1] if 1 <= o <= WINDOW else amounts.get(o - WINDOW, 0)
        timeline.append({"offset": o, "amount": amounts.get(o, 0), "fixed": o in fixed,
                         "counts": o in weeks, "skipped": skip_this_week and o == 0,
                         "sum": s, "tier": tier_of(s), "drop": drop})
    reached = next((w["offset"] for w in timeline if w["sum"] >= target.th), None)
    planned = sum(amounts.values())
    return {
        "base": base,
        "required": required,
        "equalPer": _ceil_unit(required, unit * len(weeks)) // len(weeks) if weeks else 0,
        "weeksCount": len(weeks),
        "fixedSum": fixed_sum,
        "autoPer": auto,
        "autoCount": len(free),
        "shortfall": max(0, remaining) if not free else 0,
        "surplus": max(0, planned - required),
        "planned": planned,
        "reached": reached,
        "timeline": timeline,
    }
