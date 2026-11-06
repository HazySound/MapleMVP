// saveEff가 window 타이머를 쓴다. 저장은 안 일어나게 막아 둔다
;(globalThis as any).window = { setTimeout: () => 0 }
import { describe, expect, it, vi } from 'vitest'
import { eff, overMonthly, weeksWithRecords } from './eff.svelte'

const ch = (key: string, cash: number, month: string) => ({ id: `c${key}${cash}${month}`, key, name: key, off: 7, cash, month })

describe('결산 목록·월 한도 경고 (2026-11-05 문의)', () => {
  it('구매내역이 없어도 충전 기록이 있는 주는 결산 목록에 남는다', () => {
    Object.assign(eff, { charges: { '2026-10-29': [ch('nexon', 200_000, '2026-10')] }, creditBuys: {}, mkMeso: {} })
    const rows = [{ date: '2026-10-23', item: 'x', price: 33_000, id: '0320' }]
    expect(weeksWithRecords(rows)).toEqual(['2026-10-29', '2026-10-22'])
  })

  it('같은 충전을 두 주에 적어 그 달 20만을 넘으면 알린다. 딱 20만은 괜찮다', () => {
    vi.useFakeTimers({ now: new Date('2026-11-06T03:00:00Z') })
    Object.assign(eff, {
      outside: {},
      charges: {
        '2026-10-22': [ch('nexon', 200_000, '2026-10'), ch('book', 100_000, '2026-10'), ch('hyundai', 400_000, '2026-10')],
        '2026-10-29': [ch('nexon', 200_000, '2026-10'), ch('book', 100_000, '2026-10'), ch('plain', 5_840, '2026-10')],
      },
    })
    expect(overMonthly().map(o => [o.key, o.month, o.cash, o.weeks])).toEqual([['nexon', '2026-10', 400_000, ['2026-10-22', '2026-10-29']]])
    vi.useRealTimers()
  })
})
