import { describe, expect, it } from 'vitest'
import { groupRows, guessUse, serverOf, settle, type Prices } from './ledger'

const items = [
  { id: 'karma', name: '플래티넘 카르마의 가위', cash: 5900 },
  { id: 'wonder1', name: '위습의 원더베리', cash: 5400 },
  { id: 'wonder11', name: '위습의 원더베리', cash: 54000 },
]
const row = (item: string, price: number, id: string) => ({ date: '2026-10-15', item, price, id })

describe('구매내역 결산', () => {
  it('구매번호 앞 두 자리는 서버, 넥슨쇼핑 쿠폰은 서버 없음', () => {
    expect(serverOf('05202610150055430000483064')).toBe('05')
    expect(serverOf('00202610121609290000968066')).toBe('00')
    expect(serverOf('shop:123')).toBeNull()
  })
  it('가격표에 있으면 작용(묶음은 가격으로), 엘릭서는 선물식(시세 없으면 메소마켓), 나머지는 회수 없음', () => {
    expect(guessUse(row('플래티넘 카르마의 가위', 5900, 'a'), items, true)).toBe('sell')
    expect(groupRows([row('위습의 원더베리 11개', 54000, 'a')], {}, items, true)[0].itemId).toBe('wonder11')
    expect(guessUse(row('파워엘릭서 100개', 10000, 'a'), items, true)).toBe('gift')
    expect(guessUse(row('파워엘릭서 100개', 10000, 'a'), items, false)).toBe('mk')
    expect(guessUse(row('프리미엄 모멘텀 패스', 29800, 'a'), items, true)).toBe('none')
  })
  it('같은 이름·가격·서버·용도는 묶고, 사용자가 고친 용도를 먼저 쓴다', () => {
    const rows = [
      row('플래티넘 카르마의 가위', 5900, '05a'), row('플래티넘 카르마의 가위', 5900, '05b'),
      { ...row('플래티넘 카르마의 가위', 5900, '00202610121609290000968066') },
    ]
    const g = groupRows(rows, { '00202610121609290000968066': 'none' }, items, true)
    expect(g.map(l => [l.n, l.use])).toEqual([[2, 'sell'], [1, 'none']])
  })
  it('회수: 경매장은 가격×(1−수수료)×엄, 선물식은 비율, 메소마켓은 메포÷시세×엄, 회수 없음은 작 현금에서 뺀다', () => {
    const p: Prices = { items: [{ id: 'karma', name: '플가', set: 1, cash: 5900, price: 3 }], um: 2000, mk: 2500, giftRate: 0.7, fee: 0.03, creditPer: 0 }
    const rows = [
      ...Array.from({ length: 10 }, (_, i) => row('플래티넘 카르마의 가위', 5900, `k${i}`)),
      row('파워엘릭서 100개', 100000, 'e'),
      row('프리미엄 모멘텀 패스', 41000, 'm'),
    ]
    const s = settle(groupRows(rows, {}, items, true), p, { cost: 200_000 * 0.9 })
    expect(s.sell).toBe(59000); expect(s.gift).toBe(100000); expect(s.none).toBe(41000)
    expect(s.back).toBeCloseTo(10 * 3 * 0.97 * 2000 + 100000 * 0.7)
    expect(s.cost).toBeCloseTo(180_000 * 159_000 / 200_000)
    expect(s.sales).toBe(11)
  })
  it('회수 없음만 산 주는 크레딧을 돌려받은 돈으로 치지 않는다', () => {
    const p: Prices = { items: [], um: 2000, mk: 2500, giftRate: 0.7, fee: 0.03, creditPer: 1.05 }
    const s = settle(groupRows([row('컬러링 프리즘', 4130, 'a')], {}, items, true), p, { cost: 4130 })
    expect(s.back).toBe(0); expect(s.loss).toBe(0); expect(s.cost).toBe(0)
  })
  it('묶음 수만 다르고 개당 가격이 같은 것은 한 줄로(작용은 합치지 않는다)', () => {
    const rows = [row('파워엘릭서 10개', 1000, 'a'), row('파워엘릭서 100개', 10000, 'b'), row('파워 엘릭서 1000개', 100000, 'c')]
    const g = groupRows(rows, {}, items, true)
    expect(g.length).toBe(1); expect(g[0].n).toBe(1110); expect(g[0].cash).toBe(111000); expect(g[0].price).toBe(100)
  })
  it('메소마켓은 적은 메소만큼만 작으로 치고 남는 메포는 회수 없음, 최대보다 많이 적으면 최대까지만', () => {
    const p: Prices = { items: [], um: 2000, mk: 2000, giftRate: 0, fee: 0.03, creditPer: 0 }
    const g = groupRows([row('파워엘릭서 100개', 10000, 'a')], {}, items, false)
    const part = settle(g, p, { cost: 10000 }, { [g[0].key]: 3 })
    expect(part.mk).toBe(6000); expect(part.none).toBe(4000); expect(part.back).toBe(6000)
    const over = settle(g, p, { cost: 10000 }, { [g[0].key]: 9 })
    expect(over.lines[0].meso).toBe(5); expect(over.none).toBe(0)
  })
  it('메소마켓은 1억 단위: 141,000메포 ÷ 2,250 → 62억, 남는 1,500메포는 회수 없음', () => {
    const p: Prices = { items: [], um: 1500, mk: 2250, giftRate: 0, fee: 0.03, creditPer: 0 }
    const g = groupRows([row('파워 엘릭서 1000개', 100000, 'a'), row('파워엘릭서 410개', 41000, 'b')], { a: 'mk', b: 'mk' }, items, false)
    const s = settle(g, p, { cost: 141000 })
    expect(s.lines[0].meso).toBe(62); expect(s.mk).toBe(139500); expect(s.none).toBe(1500)
  })
})
