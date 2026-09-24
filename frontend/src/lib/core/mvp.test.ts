import { describe, expect, it } from 'vitest'
import {
  BLACK, CARRY_MAX, TIERS, forecast, grade, needFor, needNow, plan, replay,
  tierNow, tierOf, todayKst, weekStart, weeklyAmounts,
} from './mvp'

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
  it('직전에 끝난 주의 초과분만 쌓인다', () => {
    expect(grade(2_700_000, 0, 300_000).carry).toBe(200_000)
    expect(grade(2_700_000, 0, 50_000).carry).toBe(50_000)
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
    expect(grade(20_000_000, 9_000_000, 20_000_000).carry).toBe(CARRY_MAX)
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

  it('크게 쓴 주는 빠진 뒤 이월이 한 번 메운다', () => {
    const amounts = [...Array(12).fill(0), 5_000_000, ...Array(12).fill(0)]
    expect(replay(amounts)).toEqual({ tier: BLACK, carry: 2_500_000 })
    expect(replay([...amounts, 0])).toEqual({ tier: BLACK, carry: 0 })
    expect(replay([...amounts, 0, 0]).tier).toBeNull()
  })
})

describe('예측', () => {
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
    expect(f[1].tier).toBe(BLACK)
    expect(f[1].carry).toBe(0)
    expect(f[2].tier).toBe(T.red)
    expect(f[12].sum).toBe(0)
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
