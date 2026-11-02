// saveEff가 window 타이머를 쓴다. 저장은 안 일어나게 막아 둔다
;(globalThis as any).window = { setTimeout: () => 0 }
import { describe, expect, it, vi } from 'vitest'
import { cashFlow, eff, pointFlow, setPointNow, setWeekCharge, weekCharged } from './eff.svelte'
import { HD_KEY, PT_KEY } from './core/efficiency'

describe('현대카드 포인트 흐름', () => {
  it('현대카드 결제는 달마다 2만 P까지 쌓이고, 포인트 충전은 빠지며 현금 0원 캐시가 된다', () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T03:00:00Z') })
    const W = '2026-11-05'
    Object.assign(eff, { charges: {}, outside: { [HD_KEY]: 150_000 }, ptBalance: 0, ptFrom: W, balance: 0 })
    setPointNow(W, 58_000)
    expect(pointFlow(W).left).toBe(58_000)
    // 이번 달 이미 15만 결제 → 이번 주 10만 중 5만 몫(5,000P)만 쌓인다
    setWeekCharge(HD_KEY, 100_000)
    setWeekCharge(PT_KEY, 50_000)
    expect(weekCharged(PT_KEY)).toBe(50_000)
    expect(pointFlow(W).weeks[W]).toMatchObject({ start: 58_000, earned: 5_000, used: 50_000, left: 13_000 })
    // 지금 포인트를 고치면 시작값만 맞춘다
    setPointNow(W, 20_000)
    expect([eff.ptBalance, pointFlow(W).left]).toEqual([65_000, 20_000])
    // 캐시: 현대카드 10만(1:1) + 포인트 5만(0원)
    const f = cashFlow([], W)!
    expect([f.left, f.leftWon]).toEqual([150_000, 100_000])
    vi.useRealTimers()
  })
})
