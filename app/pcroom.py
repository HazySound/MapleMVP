"""프리미엄 PC방 반영액 보정. 입출력 없는 순수 함수만 둔다.

PC방 접속은 6분마다 100캐시씩 MVP 금액에 반영되는데, 구매내역에는 절대 잡히지 않는다.
그래서 수집만으로는 인게임 금액과 항상 어긋난다.

인게임 등급 툴팁은 '앞으로 N주 뒤 현재 등급 유지까지 얼마'를 12줄 보여준다.
이 표는 "앞으로 결제를 하나도 안 한다"는 가정이라, 매주 달라지는 것은
13주 창에서 빠져나가는 과거 한 주뿐이다. 그래서 이웃한 두 줄의 차이가
그 주에 탈락하는 주의 금액이 된다. 넥슨이 주차별 금액을 간접적으로 공개하는 셈이다.

    그 주 PC방 반영액 = (툴팁에서 역산한 넥슨 금액) - (우리가 수집한 구매액)

보정값은 주 시작일(ISO)을 키로 저장한다. 그래야 주가 지날 때 오래된 주가
13주 창 밖으로 자연히 빠지고, 새로 들어온 주만 빈칸으로 남는다.
"""
from __future__ import annotations

from dataclasses import dataclass, field

TOOLTIP_ROWS = 12       # 인게임 툴팁이 보여주는 줄 수 (1주 뒤 ~ 12주 뒤)
WEEKS = TOOLTIP_ROWS + 1  # 복원되는 주 수 (= 13주 창)
UNIT = 100              # PC방은 100캐시 단위로 반영된다
MINUTES_PER_UNIT = 6    # 6분마다 100캐시


def minutes_of(amount: int) -> int:
    """PC방 반영액을 접속 시간(분)으로 환산한다."""
    return amount // UNIT * MINUTES_PER_UNIT


def anchor(ths: list[int], next_index: int, remaining: int) -> tuple[int, int]:
    """상단 '○○ 등급까지 N 캐시' 한 줄에서 (지금 등급 기준, 지금 13주 합계)를 뽑는다.

    ths:        등급별 기준 금액 (낮은 등급 → 높은 등급)
    next_index: 화면에 적힌 등급의 자리 ('레드 등급까지'면 레드의 자리)
    remaining:  그 등급까지 남은 금액

    '레드 등급까지'라고 적혀 있으면 지금 등급은 그 바로 아래(다이아)다.
    """
    total = ths[next_index] - remaining
    return (ths[next_index - 1] if next_index > 0 else 0), total


@dataclass(frozen=True)
class Restored:
    weeks: list[int]              # 13주 금액 (가장 오래된 주 → 이번 주)
    issues: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.issues


def restore(needs: list[int], tier_th: int, total: int, keep_need: int | None = None) -> Restored:
    """툴팁 12줄을 넥슨 기준 주차별 금액 13개로 되돌린다.

    needs:     '현재 등급 유지까지' 12개 (1주 뒤 → 12주 뒤 순서)
    tier_th:   지금 등급의 기준 금액 (다이아면 900_000)
    total:     지금 13주 합계 (상단 '○○ 등급까지'에서 구한다)
    keep_need: 상단 '유지를 위해 필요한 금액'. 있으면 needs[0]과 대조만 한다.

    가운데 11주는 이웃한 줄의 차이라서 tier_th가 상쇄된다. 양 끝 두 주만
    tier_th와 total이 필요하다.
    """
    issues: list[str] = []
    if len(needs) != TOOLTIP_ROWS:
        return Restored([], [f"툴팁 값이 {TOOLTIP_ROWS}개여야 하는데 {len(needs)}개예요."])
    if tier_th <= 0:
        return Restored([], ["지금 등급을 알 수 없어요."])

    weeks = [total - tier_th + needs[0]]                       # 가장 오래된 주
    weeks += [needs[k] - needs[k - 1] for k in range(1, TOOLTIP_ROWS)]   # 가운데 11주
    weeks.append(tier_th - needs[-1])                           # 이번 주

    for i, v in enumerate(weeks):
        if v < 0:
            issues.append(f"{i + 1}번째 주 금액이 음수({v:,}원)예요. 툴팁 숫자를 잘못 읽은 것 같아요.")
    for k in range(1, TOOLTIP_ROWS):
        if needs[k] < needs[k - 1]:
            issues.append(f"{k}주 뒤({needs[k - 1]:,})보다 {k + 1}주 뒤({needs[k]:,})가 작아요. "
                          "유지까지 필요한 금액은 줄어들 수 없어요.")
    if keep_need is not None and keep_need != needs[0]:
        issues.append(f"상단의 유지 필요 금액({keep_need:,})과 툴팁 1주 뒤({needs[0]:,})가 달라요.")
    return Restored(weeks, issues)


@dataclass(frozen=True)
class Gap:
    start: str      # 주 시작일 (목요일, ISO)
    nexon: int      # 툴팁에서 역산한 금액
    collected: int  # 우리가 수집한 구매액
    amount: int     # PC방으로 볼 금액 = nexon - collected
    note: str = ""  # 확실히 잘못된 값이면 그 이유
    warn: str = ""  # 틀렸다고 단정할 수는 없지만 확인해 볼 값

    @property
    def minutes(self) -> int:
        return minutes_of(self.amount)

    @property
    def ok(self) -> bool:
        return not self.note


MAX_WEEK_MINUTES = 7 * 24 * 60    # 한 주를 넘는 접속 시간은 있을 수 없다
HIGH_WEEK_MINUTES = 20 * 60       # 주 20시간을 넘으면 PC방치고는 이례적이다


def compare(nexon: list[int], collected: list[int], starts: list[str]) -> list[Gap]:
    """넥슨 기준 주차별 금액과 수집한 금액을 견줘서 주별 PC방 반영액을 낸다.

    차이가 PC방이 아니라 '수집 누락'일 수도 있다. PC방은 반드시 100의 배수라
    그걸로 한 번 거르고, 접속 시간으로 환산해서 말이 되는지로 한 번 더 거른다.
    (실제로 이 방법으로 29,800원짜리 수집 누락을 찾아냈다. 100의 배수였지만
     한 주에 29시간 48분 접속이라는 뜻이어서 걸렸다.)
    """
    out = []
    for n, c, s in zip(nexon, collected, starts):
        gap = n - c
        note = warn = ""
        if gap < 0:
            note = "수집한 금액이 인게임보다 많아요. 툴팁 숫자를 잘못 읽었을 수 있어요."
        elif gap % UNIT:
            note = "100원 단위가 아니에요. PC방이 아니라 수집하지 못한 결제일 수 있어요."
        elif minutes_of(gap) > MAX_WEEK_MINUTES:
            note = "한 주에 들어갈 수 없는 접속 시간이에요. 수집하지 못한 결제일 수 있어요."
        elif minutes_of(gap) > HIGH_WEEK_MINUTES:
            m = minutes_of(gap)
            warn = (f"이 주에 {m // 60}시간 {m % 60}분 PC방 접속이라는 뜻이에요. "
                    "맞는지 확인해 보세요. 수집하지 못한 결제일 수도 있어요.")
        out.append(Gap(s, n, c, gap, note, warn))
    return out


def merge_saved(saved: dict[str, int], gaps: list[Gap]) -> dict[str, int]:
    """확인한 보정값을 기존 저장분에 얹는다. 0원인 주도 '확인했다'는 뜻이라 남긴다.

    note가 붙은 주를 넣을지 말지는 부르는 쪽이 정한다 (화면에서 고치게 한 뒤 넣는다).
    """
    out = dict(saved)
    for g in gaps:
        out[g.start] = g.amount
    return out


def missing(starts: list[str], saved: dict[str, int]) -> list[str]:
    """13주 창 안에서 아직 보정값을 모르는 주. 주가 지나면 최근 주부터 여기 쌓인다."""
    return [s for s in starts if s not in saved]


def apply(amounts: list[int], starts: list[str], saved: dict[str, int]) -> list[int]:
    """주별 금액에 저장된 보정값을 더한다. 모르는 주는 0으로 둔다."""
    return [a + saved.get(s, 0) for a, s in zip(amounts, starts)]


def prune(saved: dict[str, int], oldest: str) -> dict[str, int]:
    """13주 창을 한참 벗어난 오래된 보정값을 버린다."""
    return {k: v for k, v in saved.items() if k >= oldest}
