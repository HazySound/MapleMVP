import { describe, expect, it } from 'vitest'
import { balancePoint, creditWonPer, fund, minPrice, pickAt, planAll, plainRateOf, rateOf, solve, spendCredits, type CreditItem, type FundCtx, type Sellable } from './efficiency'

const near = (a: number, b: number, eps = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps)

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

describe('일반 충전 비율 칸', () => {
  it('할인율·실제 비율·1만 캐시당 가격 어느 쪽으로 적어도 같다', () => {
    expect(plainRateOf('off', 7)).toBeCloseTo(0.93)
    expect(plainRateOf('ratio', 93)).toBeCloseTo(0.93)
    expect(plainRateOf('ratio', 0.93)).toBeCloseTo(0.93)
    expect(plainRateOf('per10k', 9300)).toBeCloseTo(0.93)
  })
  it('비었거나 말이 안 되면 1:1', () => {
    expect(plainRateOf('off', 0)).toBe(1)
    expect(plainRateOf('off', 100)).toBe(1)
    expect(plainRateOf('ratio', 120)).toBe(1)
    expect(plainRateOf('per10k', 12000)).toBe(1)
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

  it('일반 충전에 할인을 넣으면 한도 없이 그 비율로 센다', () => {
    const f = fund(250_000, ctx({ plain: 0.95 }))
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨카드', 200_000], ['일반 충전', 50_000]])
    expect(f.cost).toBeCloseTo(180_000 + 47_500)
  })

  it('나머지 전부를 바코드로 두었어도 일반 충전이 더 싸면 일반 충전', () => {
    const f = fund(105_000, ctx({ cards: [], plain: 0.9, barcode: { bonus: 0.05, capLeft: 5_000, want: null } }))
    expect(f.parts.map(p => p.name)).toEqual(['일반 충전'])
    expect(f.cost).toBeCloseTo(94_500)
  })
})

describe('조합', () => {
  const base = { costOf: (c: number) => c, fee: 0.03, um: 1500, mk: 2300, exact: true }

  it('플가 기준 가격이면 플가와 효율이 같다', () => {
    expect(minPrice(3, 99_000)).toBeCloseTo(50.339, 2)
  })

  it('계획: 계획 금액에 딱 맞는 조합 중에서 고른다(메포는 1,000원 단위)', () => {
    // 99,000원에 딱 맞는 건 전승 1장, 플가 10개 + 메포 4만, 메포 9.9만뿐. 플가 16개 + 메포 4,600원은 메포 단위가 안 맞는다
    const r = solve({ ...base, target: 99_000, items: [karma, potential] })!
    expect(r.best.pay).toBe(99_000)
    expect(r.best.lines).toEqual([{ item: potential, n: 1 }])
    expect(r.best.market % 1000).toBe(0)
  })

  it('금액 직접: 조금 넘겨 사는 게 더 남으면 그렇게 한다', () => {
    const r = solve({ ...base, target: 99_000, items: [karma, potential], exact: false })!
    expect(r.best.lines).toEqual([{ item: karma, n: 17 }])
    expect(r.best.pay).toBe(100_300)
  })

  it('메포로 끝자리를 채울 때는 1,000원 단위로 올려 산다', () => {
    const r = solve({ ...base, target: 99_000, items: [karma], exact: false })!
    expect(r.best.market % 1000).toBe(0)
    expect(r.best.pay).toBe(r.best.lines.reduce((a, l) => a + l.n * l.item.cash, 0) + r.best.market)
  })

  it('판매 1회로 정하면 전승 스크롤 한 장이 메소마켓보다 낫다', () => {
    const r = solve({ ...base, target: 99_000, items: [karma, potential] })!
    const one = r.routeAt(1)
    expect(one.lines).toEqual([{ item: potential, n: 1 }])
    expect(one.sales).toBe(1)
    expect(one.loss).toBeGreaterThanOrEqual(r.best.loss)
    expect(r.lossAt[1]).toBeCloseTo(one.loss)
    // 횟수가 늘면 잃는 돈은 줄거나 같다
    for (let k = 2; k < r.lossAt.length; k++) expect(r.lossAt[k]).toBeLessThanOrEqual(r.lossAt[k - 1] + 1e-6)
    expect(r.lossAt.at(-1)).toBeCloseTo(r.best.loss)
  })

  it('최적화 지점: 한 번 덜 팔 때 수고비보다 더 들면 줄이지 않는다', () => {
    const idx = [0, 1, 2, 3, 4, 5, 6, 7]
    // 한 번 줄일 때마다 5~6천 원씩 더 든다 → 수고비 1,000원이면 최저가(7회) 그대로
    expect(balancePoint([Infinity, 68_000, 41_504, 36_000, 30_000, 24_000, 19_000, 15_222], idx, 1, 7, 1000)).toBe(7)
    // 40회를 10회로 줄이는 데 2만 원(한 번에 약 670원) → 수고비 1,000원이면 10회
    const sales = [0, 10, 20, 30, 40], loss = [Infinity, 50_000, 43_000, 36_500, 30_000]
    expect(balancePoint(loss, sales, 1, 4, 1000)).toBe(1)
    // 수고비 0이면 최저가
    expect(balancePoint(loss, sales, 1, 4, 0)).toBe(4)
    // 잃는 돈이 같으면 적게 파는 쪽
    expect(balancePoint([Infinity, 10, 10, 10], [0, 1, 2, 3], 1, 3, 0)).toBe(1)
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
      balance: 0,
      cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }, { key: 'culture', name: '컬쳐랜드', disc: 6, on: true }],
      leftNow: { nexon: 200_000, culture: 0 },
      thisMonth: '2026-09',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2300, items: [karma], fee: null, exact: true,
    })!
    const cash = (i: number) => fund(res[i].solved.best.pay, res[i].ctx).parts.map(p => [p.name, p.cash])
    expect(cash(0)).toEqual([['넥슨카드', 200_000], ['일반 충전', 50_000]])
    expect(cash(1)).toEqual([['넥슨카드', 200_000], ['컬쳐랜드', 50_000]])
    expect(cash(2)).toEqual([['컬쳐랜드', 150_000], ['일반 충전', 100_000]])
    for (const w of res) expect(w.solved.best.pay).toBe(250_000)
  })
  it('한 달 한도는 5만원권으로 먼저 나눠 쓰고, 3천 원 단위가 뒤 주의 5만원권을 막지 않게 한다', () => {
    // 첫 주에 도서 5만원권 1장 + 3천 원 1장을 사면 한도가 3천 원 깎여 둘째 주에 5만원권 한 장이 안 들어간다
    const res = planAll({
      weeks: [
        { start: '2026-10-01', amount: 255_000, tier: 'gold', month: '2026-10' },
        { start: '2026-10-08', amount: 400_000, tier: 'gold', month: '2026-10' },
      ],
      balance: 0,
      cards: [
        { key: 'nexon', name: '넥슨카드', disc: 5.6, on: true },
        { key: 'culture', name: '컬쳐랜드', disc: 6, on: true },
        { key: 'book', name: '도서문화상품권', disc: 6, on: true },
      ],
      leftNow: { nexon: 200_000, culture: 200_000, book: 200_000 },
      thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [], fee: null, exact: true,
    })!
    const cash = (i: number) => fund(res[i].solved.best.pay, res[i].ctx).parts.map(p => [p.name, p.cash])
    expect(cash(0)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000], ['일반 충전', 5_000]])
    expect(cash(1)).toEqual([['도서문화상품권', 150_000], ['넥슨카드', 200_000], ['일반 충전', 50_000]])
  })
  it('일반 충전보다 할인이 작은 상품권은 쓰지 않는다', () => {
    const res = planAll({
      weeks: [{ start: '2026-10-01', amount: 250_000, tier: 'gold', month: '2026-10' }],
      balance: 0,
      cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }, { key: 'culture', name: '컬쳐랜드', disc: 4, on: true }],
      plainRate: 0.95,
      leftNow: { nexon: 100_000, culture: 200_000 },
      thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [], fee: null, exact: true,
    })!
    const f = fund(res[0].solved.best.pay, res[0].ctx)
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨카드', 100_000], ['일반 충전', 150_000]])
    expect(f.cost).toBeCloseTo(90_000 + 142_500)
  })
})

describe('모든 조합을 다 따져 본 답과 같다', () => {
  // 작은 문제를 무작위로 만들어, 살 수 있는 개수를 전부 대입해 본 답과 맞춰 본다
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  const pickInt = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))

  it('최저가 손실과 판매 횟수별 손실', () => {
    for (let t = 0; t < 250; t++) {
      const n = pickInt(1, 3)
      const items: Sellable[] = Array.from({ length: n }, (_, i) => {
        const cash = pickInt(10, 90) * 100
        return { id: `i${i}`, name: `i${i}`, set: 1, cash, price: Math.round(cash / 5900 * 3 * (0.8 + rnd() * 0.4) * 100) / 100 }
      })
      const mk = rnd() < 0.2 ? 0 : pickInt(2000, 2600)
      const rate = [1, 0.95, 0.9][pickInt(0, 2)]
      const target = pickInt(5, 250) * 100
      const exact = rnd() < 0.5
      const o = { target, costOf: (c: number) => c * rate, fee: 0.03, um: 1500, mk, items, exact }
      const r = solve(o)

      // 다 대입: 아이템 개수 조합 + 남는 금액은 메소마켓(있으면 1회)
      const keep = 0.97 * 1500, mk1 = mk ? 1500 / mk : 0
      const T100 = Math.ceil(target / 100) * 100
      const top = T100 + Math.max(900, ...items.map(x => x.cash))
      let bySales = new Map<number, number>()
      let bestLoss = Infinity
      // 앱과 같은 순서: 계획이면 딱 맞게 → 1,000원 안쪽 → 자유롭게
      let tier = exact ? 0 : 2
      const walk = (j: number, cash: number, back: number, sales: number) => {
        if (j === items.length) {
          const cands: [number, number, number][] = []
          const limit = tier === 0 ? T100 : tier === 1 ? T100 + 900 : top
          if (cash >= T100 && cash <= limit) cands.push([cash, back, sales])
          if (mk1 && cash < T100) {
            const m = Math.ceil((T100 - cash) / 1000) * 1000
            if (cash + m <= limit) cands.push([cash + m, back + m * mk1, sales + 1])
          }
          for (const [pay, b, s] of cands) {
            const loss = pay * rate - b
            bestLoss = Math.min(bestLoss, loss)
            bySales.set(s, Math.min(bySales.get(s) ?? Infinity, loss))
          }
          return
        }
        for (let k = 0; cash + k * items[j].cash <= top; k++) walk(j + 1, cash + k * items[j].cash, back + k * items[j].price * keep, sales + k)
      }
      walk(0, 0, 0, 0)
      // 계획처럼 딱 맞춰야 하는데 안 되면 앱은 넘겨 사는 쪽으로 물러선다. 정답도 똑같이 다시 구한다
      while (!Number.isFinite(bestLoss) && tier < 2) { tier++; bySales = new Map(); walk(0, 0, 0, 0) }
      if (!Number.isFinite(bestLoss)) { expect(r).toBeNull(); continue }
      expect(r).not.toBeNull()
      if (!r) continue
      expect(r.best.loss).toBeCloseTo(bestLoss, 0)
      // k회 이하에서 가장 적게 잃는 값
      let run = Infinity
      for (let k = 0; k < r.lossAt.length; k++) {
        run = Math.min(run, bySales.get(k) ?? Infinity)
        if (Number.isFinite(run)) expect(r.lossAt[k]).toBeCloseTo(run, 0)
        const route = r.routeAt(k)
        if (Number.isFinite(run) && k < r.lossAt.length - 1) {
          expect(route.sales).toBeLessThanOrEqual(k)
          expect(route.loss).toBeCloseTo(run, 0)
        }
      }
    }
  })
})

describe('메이플 크레딧', () => {
  const prime: CreditItem = { id: 'prime', name: '프라임 큐브', credits: 10_000, price: 6, days: 30 }
  const add: CreditItem = { id: 'primeadd', name: '프라임 에디셔널 큐브', credits: 20_000, price: 16, days: 30 }

  it('가진 크레딧으로 가장 많이 받는 조합, 딱 안 떨어지면 남긴다', () => {
    const a = spendCredits(50_000, 50_000, [prime, add], 0.03, 1500)
    expect(a.buys.map(b => [b.item.id, b.n])).toEqual([['primeadd', 2], ['prime', 1]])
    expect(a.left).toBe(0)
    near(a.back, (2 * 16 + 6) * 0.97 * 1500)
    const b = spendCredits(35_000, 35_000, [prime, add], 0.03, 1500)
    expect(b.buys.map(x => [x.item.id, x.n])).toEqual([['primeadd', 1], ['prime', 1]])
    expect(b.left).toBe(5_000)
    expect(spendCredits(9_000, 9_000, [prime, add], 0.03, 1500).buys).toEqual([])
  })

  it('크레딧 1개의 값은 크레딧당 가장 많이 받는 물건 기준', () => {
    near(creditWonPer([prime, add], 0.03, 1500), 16 * 0.97 * 1500 / 20_000, 1e-9)
  })

  it('메이플포인트를 사서 메소마켓에 팔아도 크레딧이 쌓인다', () => {
    const base = { target: 99_000, costOf: (c: number) => c, fee: 0.03, um: 1500, mk: 2250, items: [], exact: true }
    const r = solve({ ...base, creditPer: creditWonPer([prime, add], 0.03, 1500) })!.best
    expect(r.market).toBe(99_000)
    expect(r.credits).toBe(4_950)
  })

  it('크레딧은 캐시템과 메포에 똑같이 붙으니 둘 사이 순서를 바꾸지 않는다', () => {
    const scroll: Sellable = { id: 'potential', name: '잠재옵션 전승 스크롤', set: 1, cash: 99_000, price: 45 }
    const base = { target: 99_000, costOf: (c: number) => c, fee: 0.03, um: 1500, mk: 2250, items: [scroll], exact: true }
    expect(solve(base)!.best.lines).toEqual([])
    expect(solve({ ...base, creditPer: creditWonPer([prime, add], 0.03, 1500) })!.best.lines).toEqual([])
  })

  it('계획: 중간 주에는 효율 좋은 큐브만, 모자라면 모아 뒀다가 마지막에 턴다', () => {
    const res = planAll({
      weeks: [
        { start: '2026-10-01', amount: 250_000, tier: 'gold', month: '2026-10' },
        { start: '2026-10-08', amount: 250_000, tier: 'gold', month: '2026-10' },
      ],
      balance: 0, cards: [], leftNow: {}, thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 0 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [karma], fee: 0.03, exact: true, credit: { items: [prime, add] },
    })!
    const p = pickAt(res, null, { balance: 0, items: [prime, add] })
    // 한 주에 25만 원어치(플가 + 메포) = 12,500크레딧: 첫 주에는 에디(2만)를 못 사서 모아 두고, 둘째 주에 에디 1개
    expect(p.weeks[0].credit!.buys).toEqual([])
    expect(p.weeks[1].credit!.buys.map(b => [b.item.id, b.n])).toEqual([['primeadd', 1]])
    expect(p.creditLeft).toBe(2 * 250_000 * 0.05 - 20_000)
    near(p.creditBack, 16 * 0.97 * 1500)
    near(p.loss, p.cost - p.back)
  })

  it('남아 있던 크레딧도 같이 턴다', () => {
    const res = planAll({
      weeks: [{ start: '2026-10-01', amount: 5_900, tier: 'gold', month: '2026-10' }],
      balance: 0, cards: [], leftNow: {}, thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 0 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [karma], fee: 0.03, exact: true, credit: { items: [prime, add] },
    })!
    const p = pickAt(res, null, { balance: 19_800, items: [prime, add] })
    // 19,800 + 295 = 20,095 → 에디 1개
    expect(p.weeks[0].credit!.buys.map(b => [b.item.id, b.n])).toEqual([['primeadd', 1]])
    near(p.creditLeft, 95)
  })
})
