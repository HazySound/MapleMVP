import { describe, expect, it } from 'vitest'
import { fund, minPrice, planAll, rateOf, solve, type FundCtx, type Sellable } from './efficiency'

const nx = { key: 'nexon', name: '넥슨카드', rate: 0.9 }
const ctx = (over: Partial<FundCtx> = {}): FundCtx => ({
  held: { cash: 0, won: 0 }, limits: { nexon: 200_000 }, cards: [nx], barcode: null, ...over,
})
const karma: Sellable = { id: 'karma', name: '플래티넘 카르마의 가위', set: 1, cash: 5900, price: 3 }
const potential: Sellable = { id: 'potential', name: '잠재옵션 전승 스크롤', set: 1, cash: 99000, price: 49 }

describe('할인 칸', () => {
  it('100 이하는 할인율, 넘으면 1만원권이나 5만원권 가격', () => {
    expect(rateOf(8)).toBeCloseTo(0.92)
    expect(rateOf(9200)).toBeCloseTo(0.92)
    expect(rateOf(46000)).toBeCloseTo(0.92)
    expect(rateOf(0)).toBeNull()
    expect(rateOf(100)).toBeNull()
  })
})

describe('충전 단위', () => {
  it('5만원권으로 한도까지, 나머지는 일반 충전', () => {
    const f = fund(250_000, ctx())
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨카드', 200_000], ['일반 충전', 50_000]])
    expect(f.parts[0].big).toBe(4)
    expect(f.cost).toBeCloseTo(230_000)
  })

  it('5만 원이 안 되는 부분은 3천 원 단위, 넘치게 사지 않고 끝자리는 일반 충전', () => {
    const f = fund(120_000, ctx())
    expect(f.parts[0]).toMatchObject({ cash: 118_000, big: 2, small: 18_000 })
    expect(f.parts[1]).toMatchObject({ name: '일반 충전', cash: 2_000 })
    expect(f.cost).toBeCloseTo(118_000 * 0.9 + 2_000)
  })

  it('남은 한도가 5만 원보다 적으면 3천 원 단위로만', () => {
    const f = fund(100_000, ctx({ limits: { nexon: 31_000 } }))
    expect(f.parts[0]).toMatchObject({ cash: 30_000, big: 0, small: 30_000 })
    expect(f.parts[1].cash).toBe(70_000)
  })

  it('바코드 추가분이 한도를 넘으면 그 뒤는 1:1', () => {
    const on = fund(105_000, ctx({ cards: [], barcode: { bonus: 0.05, capLeft: 5_000, want: null } }))
    expect(on.cost).toBeCloseTo(100_000)
    const used = fund(105_000, ctx({ cards: [], barcode: { bonus: 0.05, capLeft: 0, want: null } }))
    expect(used.cost).toBeCloseTo(105_000)
  })
})

describe('조합', () => {
  const base = { costOf: (c: number) => c, fee: 0.03, um: 1500, mk: 2300, exact: true }

  it('플가 기준 가격이면 플가와 효율이 같다', () => {
    expect(minPrice(3, 99_000)).toBeCloseTo(50.339, 2)
  })

  it('가장 많이 남게: 플가로 채우고 끝자리는 메소마켓', () => {
    const r = solve({ ...base, target: 99_000, items: [karma, potential] })!
    expect(r.best.lines).toEqual([{ item: karma, n: 16 }])
    expect(r.best.market).toBe(4_600)
    expect(r.best.sales).toBe(17)
    expect(r.best.back).toBeCloseTo(16 * 3 * 0.97 * 1500 + 4600 / 2300 * 1500)
  })

  it('판매 1회로 정하면 전승 스크롤 한 장이 메소마켓보다 낫다', () => {
    const r = solve({ ...base, target: 99_000, items: [karma, potential], maxSales: 1 })!
    expect(r.route.lines).toEqual([{ item: potential, n: 1 }])
    expect(r.route.sales).toBe(1)
    expect(r.route.loss).toBeGreaterThan(r.best.loss)
  })

  it('계획이 없으면 조금 넘겨 사는 게 더 남을 때 그렇게 한다', () => {
    const r = solve({ ...base, target: 5_000, items: [karma], exact: false })!
    expect(r.best.pay).toBe(5_900)
    expect(r.best.lines[0].n).toBe(1)
  })
})

describe('주별 상품권 한도', () => {
  it('달마다 한도가 새로 생기고 같은 달 앞 주가 쓴 만큼 줄어든다', () => {
    const res = planAll({
      weeks: [
        { start: '2026-09-24', amount: 250_000, tier: 'gold', month: '2026-09' },
        { start: '2026-10-01', amount: 250_000, tier: 'gold', month: '2026-10' },
        { start: '2026-10-08', amount: 250_000, tier: 'gold', month: '2026-10' },
      ],
      held: { cash: 0, won: 0 },
      cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }, { key: 'culture', name: '컬쳐랜드', disc: 6, on: true }],
      leftNow: { nexon: 200_000, culture: 0 },
      thisMonth: '2026-09',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2300, items: [karma], feeOverride: null, exact: true,
    })!
    const cash = (i: number) => res[i].funding.parts.map(p => [p.name, p.cash])
    expect(cash(0)).toEqual([['넥슨카드', 200_000], ['일반 충전', 50_000]])
    expect(cash(1)).toEqual([['넥슨카드', 200_000], ['컬쳐랜드', 50_000]])
    expect(cash(2)).toEqual([['컬쳐랜드', 150_000], ['일반 충전', 100_000]])
    for (const w of res) expect(w.route.pay).toBe(250_000)
  })
})
