import { describe, expect, it } from 'vitest'
import {
  BLACK, CARRY_MAX, TIERS, accrue, forecast, grade, needFor, needNow, plan, replay,
  tierNow, tierOf, todayKst, weekStart, weeklyAmounts,
} from './mvp'
import { real } from '../../../test/private'

// tests/test_mvp.py와 같은 경우를 쓴다. 파이썬과 결과가 갈리면 여기서 걸린다.
const T = Object.fromEntries(TIERS.map(t => [t.key, t]))

describe('등급 판정', () => {
  it('기준 경계', () => {
    expect(tierOf(149_999)).toBeNull()
    expect(tierOf(150_000)).toBe(T.bronze)
    expect(tierOf(1_499_999)).toBe(T.diamond)
    expect(tierOf(2_500_000)).toBe(T.black)
  })

  it('13주 합계로 등급이 정해진다', () => {
    expect(grade(1_300_000, 0).tier).toBe(T.diamond)
    expect(grade(0, 0).tier).toBeNull()
  })
})

describe('주차', () => {
  it('목요일에 시작한다', () => {
    expect(weekStart('2026-09-17')).toBe('2026-09-17') // 목
    expect(weekStart('2026-09-23')).toBe('2026-09-17') // 수
    expect(weekStart('2026-09-24')).toBe('2026-09-24') // 다음 목
  })

  it('한국 날짜는 자정을 넘겨서 바뀐다', () => {
    expect(todayKst(new Date('2026-09-23T15:00:00Z'))).toBe('2026-09-24')
    expect(todayKst(new Date('2026-09-23T14:59:00Z'))).toBe('2026-09-23')
  })

  it('주별로 나눠 담고 달 경계를 넘는다', () => {
    const rows = [
      { date: '2026-10-01', item: '', price: 1000 },  // 이번 주 첫날
      { date: '2026-09-30', item: '', price: 200 },   // 지난주 마지막 날 (수)
      { date: '2026-09-24', item: '', price: 30 },    // 지난주 첫날
      { date: '2026-07-02', item: '', price: 5 },     // 13주 전 → 범위 밖
      { date: '2026-07-09', item: '', price: 7 },     // 12주 전 목요일 → 첫 칸
    ]
    const w = weeklyAmounts(rows, '2026-10-01', 13)
    expect(w[12]).toBe(1000)
    expect(w[11]).toBe(230)
    expect(w[0]).toBe(7)
    expect(w.reduce((a, b) => a + b, 0)).toBe(1237)
  })
})

describe('이월', () => {
  it('기준을 넘긴 만큼, 그 주 결제 안에서만 쌓인다', () => {
    expect(accrue(2_700_000, 300_000, 0)).toBe(200_000)
    expect(accrue(2_700_000, 50_000, 0)).toBe(50_000)
    expect(accrue(2_400_000, 300_000, 0)).toBe(0)
  })

  it('공식 예시대로 쓰인다', () => {
    // 예시 1: 이월 300만, 100만 부족 → 블랙 유지, 200만 남음
    let r = grade(1_500_000, 3_000_000)
    expect(r.tier).toBe(BLACK)
    expect(r.carry).toBe(2_000_000)
    expect(r.carryUsed).toBe(1_000_000)
    // 예시 2: 이월 50만, 100만 부족 → 모두 차감, 200만으로 레드
    r = grade(1_500_000, 500_000)
    expect(r.tier).toBe(T.red)
    expect(r.carry).toBe(0)
    expect(r.carryUsed).toBe(500_000)
  })

  it('상한이 있다', () => {
    expect(9_000_000 + accrue(20_000_000, 20_000_000, 9_000_000)).toBe(CARRY_MAX)
  })
})

describe('지금 등급과 지난 갱신 재현', () => {
  it('이번 주 결제가 바로 반영된다', () => {
    expect(tierNow([...Array(12).fill(20_000), 400_000], 0)).toBe(T.gold)
    expect(tierNow([...Array(12).fill(20_000), 0], 0)).toBe(T.bronze)
  })

  it('주가 시작될 때는 앞선 12주로 정해진다', () => {
    const amounts = [0, ...Array(12).fill(50_000), 400_000]
    const { tier, carry } = replay(amounts)
    expect(tier).toBe(T.gold)
    expect(carry).toBe(0)
    expect(tierNow(amounts.slice(-13), carry)).toBe(T.diamond)
  })

  it('크게 쓴 주가 빠지면 이월이 메우고, 메운 금액은 13주 동안 남는다', () => {
    const amounts = [...Array(12).fill(0), 5_000_000, ...Array(12).fill(0)]
    expect(replay(amounts)).toMatchObject({ tier: BLACK, carry: 2_500_000 })
    const r = replay([...amounts, 0])
    expect(r).toMatchObject({ tier: BLACK, carry: 0 })
    expect(r.weeks.at(-1)).toBe(2_500_000)            // 꺼내 쓴 이월이 새 주에 채워진다
    expect(replay([...amounts, 0, 0]).tier).toBe(BLACK)
    expect(replay([...amounts, ...Array(13).fill(0)]).tier).toBe(BLACK)
    expect(replay([...amounts, ...Array(14).fill(0)]).tier).toBeNull()
  })

  /**
   * 주중에 결제로 250만을 넘기면 그 순간 넘친 만큼 쌓인다. 다음 목요일에 가장 오래된 주가
   * 빠져 모자라지면 그 이월로 메운다. 목요일에만 쌓는다고 보면 그사이 빠진 주 몫을 놓쳐
   * 여기서 레드로 떨어진다. (2026-09 블랙 제보에서 확인한 규칙)
   */
  it('주중에 기준을 넘긴 초과분도 쌓인다', () => {
    const r = replay([100_000, 2_000_000, ...Array(10).fill(0), 460_000, 0])
    // 넷째 줄 결제로 256만 → 6만 적립. 갱신 때 246만이라 4만을 꺼내 쓰고 2만 남는다
    expect(r).toMatchObject({ tier: BLACK, carry: 20_000 })
    expect(r.weeks.at(-1)).toBe(40_000)
  })

  /** 블랙 제보자의 실제 숫자로 인게임 툴팁과 원 단위까지 맞는지 (test/private, git 제외) */
  it.skipIf(!real)('제보자 캡처와 같은 이월과 유지 금액이 나온다', () => {
    const { nexon13, outsideWeek, tip, carry } = real!.reporter
    const r = replay([outsideWeek, ...nexon13], [false, ...nexon13.map(() => true)])
    expect(r).toMatchObject({ tier: BLACK, carry: carry[0] })
    const f = forecast(r.weeks.slice(-13), r.carry)
    expect(f[0].carryUsed).toBe(carry[0])
    expect(BLACK.th - f[0].sum - f[0].carryUsed).toBe(tip[0])   // 인게임 1주 뒤 '유지까지'
  })
})

describe('예측', () => {
  it('기준을 넘긴 결제는 이월로만 간다(9/24 수정): 합계는 250만, 넘친 몫은 이월', () => {
    const last13 = [...Array(12).fill(0), 2_500_000]
    const f = forecast(last13, 0, 100_000)
    expect(f[0].carryAdded).toBe(100_000)
    expect(f[0].sum).toBe(2_500_000)
    // 250만 주가 빠지는 13번째 갱신에 이월 10만을 꺼내 쓴다
    expect(f[12].carryUsed).toBe(100_000)
  })

  it('갱신마다 가장 오래된 주가 빠진다', () => {
    const last13 = Array(13).fill(100_000)
    const f = forecast(last13, 0)
    expect(f.length).toBe(13)
    expect(f.slice(0, 3).map(r => r.sum)).toEqual([1_200_000, 1_100_000, 1_000_000])
    expect(f[12].sum).toBe(0)
    expect(f[12].tier).toBeNull()
    const g = forecast(last13, 0, 300_000)
    expect(g[0].sum).toBe(1_500_000)
    expect(g[0].tier).toBe(T.red)
  })

  it('이월을 써 가며 버틴다', () => {
    const f = forecast([...Array(12).fill(0), 2_000_000], 1_000_000)
    expect(f[0].tier).toBe(BLACK)
    expect(f[0].carry).toBe(500_000)
    // 첫 갱신에서 쓴 50만이 새 주에 채워져 2,000,000 + 500,000으로 버틴다
    expect(f[1].tier).toBe(BLACK)
    expect(f[1].carry).toBe(500_000)
    expect(f[11].tier).toBe(BLACK)
    // 2,000,000이 빠지면 채운 50만과 남은 이월 50만뿐이다
    expect(f[12].sum).toBe(500_000)
    expect(f[12].carryUsed).toBe(500_000)
    expect(f[12].tier).toBe(T.diamond)
  })

  it('다음 목요일 기준은 가장 오래된 주가 빠진 뒤다', () => {
    const last13 = Array(13).fill(100_000)
    expect(needNow(T.red, last13, 0)).toBe(200_000)
    expect(needFor(T.red, last13, 0)).toBe(300_000)
    expect(needFor(T.red, last13, 50_000)).toBe(250_000)
    expect(needFor(T.gold, last13, 0)).toBe(0)
  })
})

describe('목표 계획', () => {
  describe('달성 뒤 유지', () => {
    // 지난 13주에 90만, 다음 주에 블랙을 찍고 유지
    const last13 = [...Array(6).fill(0), 900_000, ...Array(6).fill(0)]
    /** 유지 기간 내내 기준 이상이고, 자동 유지 금액을 1,000원만 줄여도 어딘가 끊긴다 */
    const tight = (p: ReturnType<typeof plan>, unit: number, carry: number, every: number) => {
      expect(p.keep!.blocked).toEqual([])
      for (const w of p.timeline.slice(1)) expect(w.sum).toBeGreaterThanOrEqual(BLACK.th)
      for (const w of p.timeline) expect(w.amount % unit).toBe(0)
      if (p.keep!.per > 0) {
        const pays = p.timeline.filter(w => w.keepPay).map(w => w.offset)
        const fixed = Object.fromEntries([[1, p.timeline[1].amount], ...pays.map(o => [o, p.keep!.per - unit])])
        const q = plan(last13, BLACK, 1, fixed, true, unit, { every, weeks: 26 }, carry)
        expect(q.timeline.slice(1).some(w => w.sum < BLACK.th)).toBe(true)
      }
    }

    it('어떤 주기·단위든 유지 기간 내내 블랙이고 더 줄일 수 없다', () => {
      for (const unit of [1000, 50_000]) for (let every = 1; every <= 12; every++)
        tight(plan(last13, BLACK, 1, {}, true, unit, { every, weeks: 26 }), unit, 0, every)
    })

    it('기준을 넘긴 결제는 이월로만 가서(9/24 수정) 매주 유지는 250만/13쯤 든다', () => {
      // 버그 기간처럼 합계와 이월에 두 번 들면 절반으로 줄어 보인다. 고친 규칙에서는 그렇지 않다
      const p = plan(last13, BLACK, 1, {}, true, 1000, { every: 1, weeks: 26 })
      expect(p.keep!.per).toBeGreaterThanOrEqual(185_000)
      expect(p.keep!.per).toBeLessThanOrEqual(200_000)
    })

    it('유지 계획의 13주 합계에는 기준을 넘긴 몫이 들지 않는다', () => {
      const p = plan(last13, BLACK, 1, { 1: 2_000_000 }, true, 1000, { every: 1, weeks: 26 })
      // 1주 뒤 90만 + 200만 = 290만이지만 넘긴 40만은 이월로 가서 합계는 250만
      expect(p.timeline[1].sum).toBe(BLACK.th)
    })

    it('지금 가진 이월이 있으면 그만큼 덜 낸다', () => {
      const a = plan(last13, BLACK, 1, {}, true, 1000, { every: 1, weeks: 26 }, 0)
      const b = plan(last13, BLACK, 1, {}, true, 1000, { every: 1, weeks: 26 }, 1_000_000)
      expect(b.planned).toBeLessThan(a.planned)
      tight(b, 1000, 1_000_000, 1)
    })

    it('유지를 끄면 이월 없이 예전 그대로', () => {
      const p = plan(last13, BLACK, 1, {}, true, 1000, null, 5_000_000)
      expect(p.timeline[1].amount).toBe(1_600_000)
      expect(p.keep).toBeNull()
    })

    it('고정 금액 때문에 못 지키는 주를 알려 준다', () => {
      const fixed: Record<number, number> = { 1: 1_600_000 }
      for (let o = 2; o <= 27; o++) fixed[o] = 0
      const p = plan(last13, BLACK, 1, fixed, true, 1000, { every: 1, weeks: 26 })
      expect(p.keep!.blocked[0].offset).toBe(7)
      expect(p.keep!.blocked[0].missing).toBe(900_000)
    })
  })

  it('남은 주에 균등하게 나눈다', () => {
    const last13 = [...Array(12).fill(0), 100_000]
    const p = plan(last13, BLACK, 3, {})
    expect(p.base).toBe(100_000)
    expect(p.required).toBe(2_400_000)
    expect(p.weeksCount).toBe(4)
    expect(p.equalPer).toBe(600_000)
    expect(p.autoPer).toBe(600_000)
    expect(p.reached).toBe(3)
    expect(p.shortfall).toBe(0)
  })

  it('고정한 주와 부족분', () => {
    const last13 = Array(13).fill(0)
    let p = plan(last13, BLACK, 3, { 0: 200_000, 1: 200_000, 2: 200_000, 3: 200_000 })
    expect(p.shortfall).toBe(1_700_000)
    expect(p.reached).toBeNull()
    expect(p.autoCount).toBe(0)
    p = plan(last13, BLACK, 3, { 0: 200_000, 1: 200_000 })
    expect(p.autoPer).toBe(1_050_000)
    expect(p.shortfall).toBe(0)
  })

  it('목표 주까지 가면 오래된 주는 빠진다', () => {
    const last13 = [1_000_000, ...Array(12).fill(0)]
    let p = plan(last13, T.gold, 0, {})
    expect(p.base).toBe(1_000_000)
    expect(p.required).toBe(0)
    p = plan(last13, T.gold, 1, {})
    expect(p.base).toBe(0)
    expect(p.required).toBe(600_000)
    expect(p.timeline[1].drop).toBe(1_000_000)
  })

  it('13주 밖의 주는 계산에 안 든다', () => {
    const p = plan(Array(13).fill(0), T.gold, 14, { 0: 5_000_000 })
    expect(p.weeksCount).toBe(13)
    expect(p.timeline[0].counts).toBe(false)
    expect(p.fixedSum).toBe(0)
  })

  it('이번 주를 건너뛸 수 있다', () => {
    const last13 = [...Array(12).fill(0), 100_000]
    let p = plan(last13, BLACK, 3, { 0: 500_000 }, true)
    expect(p.weeksCount).toBe(3)
    expect(p.fixedSum).toBe(0)
    expect(p.equalPer).toBe(800_000)
    expect(p.autoPer).toBe(800_000)
    expect(p.timeline[0].amount).toBe(0)
    expect(p.timeline[0].skipped).toBe(true)
    expect(p.timeline[0].sum).toBe(100_000)
    p = plan(last13, BLACK, 0, {}, true)
    expect(p.weeksCount).toBe(0)
    expect(p.shortfall).toBe(2_400_000)
  })
})
