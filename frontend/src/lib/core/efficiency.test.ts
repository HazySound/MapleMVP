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

  it('상품권은 5만원권만, 넘치게 사지 않고 끝자리는 일반 충전', () => {
    const f = fund(120_000, ctx())
    expect(f.parts[0]).toMatchObject({ cash: 100_000, big: 2 })
    expect(f.parts[1]).toMatchObject({ name: '일반 충전', cash: 20_000 })
    expect(f.cost).toBeCloseTo(100_000 * 0.9 + 20_000)
  })

  it('남은 한도가 5만 원보다 적으면 상품권은 못 쓴다', () => {
    const f = fund(100_000, ctx({ limits: { nexon: 31_000 } }))
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['일반 충전', 100_000]])
  })

  it('바코드 추가분이 한도를 넘으면 그 뒤는 1:1', () => {
    const on = fund(105_000, ctx({ cards: [], barcode: { bonus: 0.05, capLeft: 5_000, want: null } }))
    expect(on.cost).toBeCloseTo(100_000)
    const used = fund(105_000, ctx({ cards: [], barcode: { bonus: 0.05, capLeft: 0, want: null } }))
    expect(used.cost).toBeCloseTo(105_000)
  })

  it('직접 추가한 결제수단은 정한 판매 단위로만 쓰고, 끝자리는 다음 결제수단이나 일반 충전', () => {
    const pack = { key: 'pack', name: '넥슨팩', rate: 0.93, unit: 10_000 }
    const f = fund(263_400, ctx({ cards: [pack, nx], limits: { nexon: 200_000, pack: Infinity } }))
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨팩', 260_000], ['일반 충전', 3_400]])
    expect(f.parts[0].unit).toBe(10_000)
  })

  it('직접 추가한 결제수단은 100원 단위로 쓴다', () => {
    const pack = { key: 'pack', name: '넥슨팩', rate: 0.95, unit: 100 }
    const f = fund(263_400, ctx({ cards: [nx, pack], limits: { nexon: 200_000, pack: Infinity } }))
    expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨카드', 200_000], ['넥슨팩', 63_400]])
    expect(f.parts[1].big).toBeUndefined()
    expect(f.cost).toBeCloseTo(180_000 + 60_230)
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

  it('최적화 회수율 하한: 판매를 줄이다 회수율이 하한 아래로 떨어지는 곳은 고르지 않는다', () => {
    const sales = [0, 10, 20, 30, 40], loss = [Infinity, 50_000, 43_000, 36_500, 30_000]
    const rate = [0, 0.80, 0.83, 0.86, 0.88]
    expect(balancePoint(loss, sales, 1, 4, 1000)).toBe(1)
    expect(balancePoint(loss, sales, 1, 4, 1000, rate, 85)).toBe(3)
    expect(balancePoint(loss, sales, 1, 4, 1000, rate, 0)).toBe(1)
    // 어디도 하한을 못 넘으면 회수율이 가장 높은 곳
    expect(balancePoint(loss, sales, 1, 4, 1000, rate, 95)).toBe(4)
  })

  it('계획이 없으면 조금 넘겨 사는 게 더 남을 때 그렇게 한다', () => {
    const r = solve({ ...base, target: 5_000, items: [karma], exact: false })!
    expect(r.best.pay).toBe(5_900)
    expect(r.best.lines[0].n).toBe(1)
  })
})

/**
 * 구매용(실제로 쓸 아이템)이 섞인 결제(2026-10-04 건의: 60 충전해 모멘텀패스 사고 나머지로 MVP작).
 * MVP작 조합은 결제 − 구매용으로, 충전과 한도는 결제 전체로 센다. 효율은 MVP작 몫만이다
 */
describe('구매용 아이템이 섞인 결제', () => {
  const run = (use: number | undefined, amount = 60_000) => planAll({
    weeks: [{ start: '2026-10-08', amount, tier: 'silver', month: '2026-10', ...(use == null ? {} : { use }) }],
    balance: 0, cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }], leftNow: { nexon: 200_000 }, thisMonth: '2026-10',
    barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
    um: 1500, mk: 0, items: [karma], fee: null, exact: true, nexonLast: false,
  })!

  it('MVP작 조합은 결제에서 구매용을 뺀 금액으로 짠다', () => {
    const [w] = run(24_600)                       // 60,000 − 24,600 = 35,400 = 플가 6개
    expect(w.use).toBe(24_600)
    expect(w.solved.best.pay).toBe(35_400)
    expect(w.solved.best.lines).toEqual([{ item: karma, n: 6 }])
  })

  it('충전은 결제 전체로 하고, MVP작 몫의 현금은 금액 비율로 나눈다', () => {
    const [w] = run(24_600)
    const p = pickAt([w], null).weeks[0]
    expect(p.funding.parts.reduce((a, q) => a + q.cash, 0)).toBe(60_000)
    const whole = fund(60_000, w.ctx).cost
    expect(w.solved.best.cost).toBeCloseTo(whole * 35_400 / 60_000, 0)
  })

  it('구매용이 결제액 전부면 사고팔 것이 없다', () => {
    const [w] = run(60_000)
    expect(w.solved.best.pay).toBe(0)
    expect(w.solved.best.lines).toEqual([])
    const p = pickAt([w], null)
    expect(p.loss).toBe(0)
    expect(p.weeks[0].funding.parts.reduce((a, q) => a + q.cash, 0)).toBe(60_000)
  })

  it('구매용이 없으면 전과 같다', () => {
    expect(run(0)[0].solved.best.pay).toBe(run(undefined)[0].solved.best.pay)
  })
})

describe('주별 상품권 한도', () => {
  it('달마다 한도가 새로 생기고 같은 달 앞 주가 쓴 만큼 줄어든다(넥슨카드는 그 달 마지막 주에)', () => {
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
    expect(cash(1)).toEqual([['컬쳐랜드', 200_000], ['일반 충전', 50_000]])
    expect(cash(2)).toEqual([['넥슨카드', 200_000], ['일반 충전', 50_000]])
    for (const w of res) expect(w.solved.best.pay).toBe(250_000)
  })
  it('넥슨카드를 마지막에만 쓰기를 끄면 할인이 큰 순서대로 먼저 쓴다', () => {
    const res = planAll({
      weeks: [
        { start: '2026-10-01', amount: 200_000, tier: 'gold', month: '2026-10' },
        { start: '2026-10-08', amount: 200_000, tier: 'gold', month: '2026-10' },
      ],
      balance: 0,
      cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }, { key: 'culture', name: '컬쳐랜드', disc: 6, on: true }],
      leftNow: { nexon: 200_000, culture: 200_000 }, thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2300, items: [karma], fee: null, exact: true, nexonLast: false,
    })!
    const cash = (i: number) => fund(res[i].solved.best.pay, res[i].ctx).parts.map(p => [p.name, p.cash])
    expect(cash(0)).toEqual([['넥슨카드', 200_000]])
    expect(cash(1)).toEqual([['컬쳐랜드', 200_000]])
  })
  it('한 권 더 사도 뒤 주 한도를 앞당겨 쓸 뿐이면(일반 충전이 안 줄면) 끝자리는 일반 충전으로 딱 맞춘다', () => {
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
    // 첫 주 255,000: 도서를 한 장 더 사서 45,000을 남겨도 둘째 주 도서 한도가 그만큼 줄어 일반 충전은 똑같이 55,000이다.
    // 이득이 없으니 끝자리 5,000은 일반 충전
    expect(cash(0)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000], ['일반 충전', 5_000]])
    expect(res[1].ctx.held).toEqual({ cash: 0, won: 0 })
    // 둘째 주 400,000: 그 달 마지막 주라 넥슨카드 200,000, 도서 남은 한도 150,000, 끝자리 50,000은 일반 충전
    expect(cash(1)).toEqual([['넥슨카드', 200_000], ['도서문화상품권', 150_000], ['일반 충전', 50_000]])
  })

  // 첫 주 163만 원 뒤 매주 20만 원(5만원 단위 할인 수단, 한도 없음)
  const bigThenWeekly = (plainOn?: boolean) => planAll({
    weeks: [1_630_000, ...Array(8).fill(200_000)].map((amount, i) => ({ start: `2026-10-${String(1 + i).padStart(2, '0')}`, amount, tier: 'black' as const, month: '2026-10' })),
    balance: 0, cards: [],
    methods: [{ key: 'pack', name: '넥슨팩', rate: 0.95, monthly: null, on: true, unit: 50_000 }],
    leftNow: {}, thisMonth: '2026-10',
    barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
    um: 1500, mk: 2250, items: [], fee: null, exact: true, plainOn,
  })!
  it('남긴 캐시가 매주 그대로 굴러가기만 하면 남기지 않는다(2026-09-30 제보: 2만 원이 계속 남던 것)', () => {
    const fs = bigThenWeekly().map(w => fund(w.solved.best.pay, w.ctx))
    expect(fs.map(f => f.spare?.cash ?? 0)).toEqual(Array(9).fill(0))
    expect(fs[0].parts.map(p => [p.name, p.cash])).toEqual([['넥슨팩', 1_600_000], ['일반 충전', 30_000]])
    for (const f of fs.slice(1)) expect(f.parts.map(p => [p.name, p.cash])).toEqual([['넥슨팩', 200_000]])
  })
  it('일반 충전을 끄면 끝자리도 할인 수단으로 한 권 더 사서 남긴다(마지막 주도)', () => {
    const fs = bigThenWeekly(false).map(w => fund(w.solved.best.pay, w.ctx))
    expect(fs.map(f => f.spare?.cash ?? 0)).toEqual(Array(9).fill(20_000))
    for (const f of fs) expect(f.parts.some(p => p.name === '일반 충전')).toBe(false)
  })
  it('일반 충전을 꺼도 할인 한도가 다 차면 일반 충전', () => {
    const res = planAll({
      weeks: [{ start: '2026-10-01', amount: 230_000, tier: 'gold', month: '2026-10' }],
      balance: 0, cards: [{ key: 'culture', name: '컬쳐랜드', disc: 6, on: true }], leftNow: { culture: 200_000 }, thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [], fee: null, exact: true, plainOn: false,
    })!
    expect(fund(res[0].solved.best.pay, res[0].ctx).parts.map(p => [p.name, p.cash])).toEqual([['컬쳐랜드', 200_000], ['일반 충전', 30_000]])
  })
  it('매주 193,000원을 5만원 단위 할인으로: 남긴 캐시가 불어나 뒤에서 쓰이니(일반 충전이 준다) 한 권 더 사서 넘기고, 마지막 주만 일반 충전', () => {
    const res = planAll({
      weeks: ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].map(start => ({ start, amount: 193_000, tier: 'black' as const, month: '2026-10' })),
      balance: 0, cards: [],
      methods: [{ key: 'pack', name: '넥슨팩', rate: 0.93, monthly: null, on: true, unit: 50_000 }],
      leftNow: {}, thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [], fee: null, exact: true,
    })!
    const fs = res.map(w => fund(w.solved.best.pay, w.ctx))
    expect(fs.map(f => f.spare?.cash ?? 0)).toEqual([7_000, 14_000, 21_000, 0])
    expect(fs[3].parts.map(p => [p.name, p.cash])).toEqual([['가진 캐시', 21_000], ['넥슨팩', 150_000], ['일반 충전', 22_000]])
    // 낸 현금 합 = 주마다 센 비용의 합(남긴 캐시는 다음 주에서 센다). 끝자리를 매주 1:1로 채우는 것(730,000)보다 싸다
    const paid = fs.reduce((a, f) => a + f.parts.filter(p => !p.held).reduce((b, p) => b + p.won, 0), 0)
    expect(paid).toBeCloseTo(719_500)
    expect(fs.reduce((a, f) => a + f.cost, 0)).toBeCloseTo(719_500)
  })

  it('직접 추가한 결제수단도 할인이 큰 것부터, 달 한도는 달마다 새로', () => {
    const res = planAll({
      weeks: [
        { start: '2026-10-22', amount: 250_000, tier: 'gold', month: '2026-10' },
        { start: '2026-11-05', amount: 250_000, tier: 'gold', month: '2026-11' },
      ],
      balance: 0,
      cards: [{ key: 'nexon', name: '넥슨카드', disc: 10, on: true }, { key: 'culture', name: '컬쳐랜드', disc: 4, on: true }],
      methods: [
        { key: 'a', name: '카드 할인', rate: 0.93, monthly: 30_000, on: true },
        { key: 'b', name: '넥슨팩', rate: 0.95, monthly: null, on: true },
        { key: 'c', name: '꺼 둔 것', rate: 0.5, monthly: null, on: false },
      ],
      leftNow: { nexon: 100_000, culture: 200_000, a: 20_000 },
      thisMonth: '2026-10',
      barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: false, barcodeWant: null, weekBarcode: {},
      um: 1500, mk: 2250, items: [], fee: null, exact: true,
    })!
    const cash = (i: number) => fund(res[i].solved.best.pay, res[i].ctx).parts.map(p => [p.name, p.cash])
    expect(cash(0)).toEqual([['넥슨카드', 100_000], ['카드 할인', 20_000], ['넥슨팩', 130_000]])
    expect(cash(1)).toEqual([['넥슨카드', 200_000], ['카드 할인', 30_000], ['넥슨팩', 20_000]])
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

  it('아이템마다 주당 최대 개수가 있어도 같다', () => {
      seed = 11
    for (let t = 0; t < 250; t++) {
      const n = pickInt(1, 3)
      const items: Sellable[] = Array.from({ length: n }, (_, i) => {
        const cash = pickInt(10, 90) * 100
        return { id: `i${i}`, name: `i${i}`, set: 1, cash, price: Math.round(cash / 5900 * 3 * (0.8 + rnd() * 0.4) * 100) / 100, ...(rnd() < 0.6 ? { cap: pickInt(0, 3) } : {}) }
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
        for (let k = 0; cash + k * items[j].cash <= top && k <= (items[j].cap ?? Infinity); k++) walk(j + 1, cash + k * items[j].cash, back + k * items[j].price * keep, sales + k)
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

  it('주당 최대 조합이 아주 많아도(예전엔 400개에서 잘랐다) 전부 보고, 충전 비용이 계단이어도 같다', () => {
    seed = 47
    // 5만원권만 할인되는 충전: 비용이 금액에 비례하지 않는다
    const costOf = (c: number) => Math.floor(c / 50_000) * 50_000 * 0.92 + c % 50_000
    for (let t = 0; t < 40; t++) {
      const items: Sellable[] = Array.from({ length: 5 }, (_, i) => {
        const cash = pickInt(10, 120) * 100
        return { id: `i${i}`, name: `i${i}`, set: 1, cash, price: Math.round(cash / 5900 * 3 * (0.8 + rnd() * 0.4) * 100) / 100, ...(i < 4 ? { cap: pickInt(4, 8) } : {}) }
      })
      const mk = rnd() < 0.2 ? 0 : pickInt(2000, 2600)
      const target = pickInt(50, 1500) * 100
      const exact = rnd() < 0.5
      const r = solve({ target, costOf, fee: 0.03, um: 1500, mk, items, exact })

      const keep = 0.97 * 1500, mk1 = mk ? 1500 / mk : 0
      const T100 = Math.ceil(target / 100) * 100
      const top = T100 + Math.max(900, ...items.map(x => x.cash))
      let bySales = new Map<number, number>(), bestLoss = Infinity
      let tier = exact ? 0 : 2
      const walk = (j: number, cash: number, back: number, sales: number) => {
        if (j === items.length) {
          const limit = tier === 0 ? T100 : tier === 1 ? T100 + 900 : top
          const cands: [number, number, number][] = []
          if (cash >= T100 && cash <= limit) cands.push([cash, back, sales])
          if (mk1 && cash < T100) {
            const m = Math.ceil((T100 - cash) / 1000) * 1000
            if (cash + m <= limit) cands.push([cash + m, back + m * mk1, sales + 1])
          }
          for (const [pay, b, s] of cands) {
            const loss = costOf(pay) - b
            bestLoss = Math.min(bestLoss, loss)
            bySales.set(s, Math.min(bySales.get(s) ?? Infinity, loss))
          }
          return
        }
        for (let k = 0; cash + k * items[j].cash <= top && k <= (items[j].cap ?? Infinity); k++) walk(j + 1, cash + k * items[j].cash, back + k * items[j].price * keep, sales + k)
      }
      walk(0, 0, 0, 0)
      while (!Number.isFinite(bestLoss) && tier < 2) { tier++; bySales = new Map(); walk(0, 0, 0, 0) }
      if (!Number.isFinite(bestLoss)) { expect(r).toBeNull(); continue }
      expect(r).not.toBeNull()
      if (!r) continue
      expect(r.best.loss).toBeCloseTo(bestLoss, 0)
      let run = Infinity
      for (let k = 0; k < r.lossAt.length; k++) {
        run = Math.min(run, bySales.get(k) ?? Infinity)
        if (Number.isFinite(run)) expect(r.lossAt[k]).toBeCloseTo(run, 0)
        if (Number.isFinite(run) && k < r.lossAt.length - 1) {
          const route = r.routeAt(k)
          expect(route.sales).toBeLessThanOrEqual(k)
          expect(route.loss).toBeCloseTo(run, 0)
        }
      }
    }
  })

  it('직접 짜기: 개수를 적은 건 그대로, 비워 둔 건 상한 안에서 알아서', () => {
    seed = 31
    for (let t = 0; t < 200; t++) {
      const n = pickInt(2, 3)
      const items: Sellable[] = Array.from({ length: n }, (_, i) => {
        const cash = pickInt(10, 300) * 100
        return { id: `i${i}`, name: `i${i}`, set: 1, cash, price: Math.round(cash / 5900 * 3 * (0.8 + rnd() * 0.4) * 100) / 100, ...(rnd() < 0.5 ? { cap: pickInt(1, 3) } : {}) }
      })
      const fixed: Record<string, number> = { i0: pickInt(0, 2) }
      const mk = pickInt(2000, 2600)
      const target = pickInt(5, 900) * 100
      const r = solve({ target, costOf: (c: number) => c * 0.95, fee: 0.03, um: 1500, mk, items, exact: false, fixed })
      const keep = 0.97 * 1500, mk1 = 1500 / mk, T100 = Math.ceil(target / 100) * 100
      const top = Math.max(T100, fixed.i0 * items[0].cash) + Math.max(900, ...items.map(x => x.cash))
      let bestLoss = Infinity
      const walk = (j: number, cash: number, back: number) => {
        if (j === items.length) {
          if (cash >= T100 && cash <= top) bestLoss = Math.min(bestLoss, cash * 0.95 - back)
          if (cash < T100) { const m = Math.ceil((T100 - cash) / 1000) * 1000; if (cash + m <= top) bestLoss = Math.min(bestLoss, (cash + m) * 0.95 - back - m * mk1) }
          return
        }
        const lo = j === 0 ? fixed.i0 : 0, hi = j === 0 ? fixed.i0 : (items[j].cap ?? Infinity)
        for (let k = lo; k <= hi && cash + k * items[j].cash <= top; k++) walk(j + 1, cash + k * items[j].cash, back + k * items[j].price * keep)
      }
      walk(0, 0, 0)
      expect(r).not.toBeNull()
      expect(r!.best.loss).toBeCloseTo(bestLoss, 0)
      expect(r!.best.lines.find(l => l.item.id === 'i0')?.n ?? 0).toBe(fixed.i0)
    }
  })

  it('직접 짠 조합은 그대로 사고 모자라는 만큼만 메소마켓', () => {
    seed = 23
    for (let t = 0; t < 200; t++) {
      const n = pickInt(1, 3)
      const items: Sellable[] = Array.from({ length: n }, (_, i) => {
        const cash = pickInt(10, 900) * 100
        return { id: `i${i}`, name: `i${i}`, set: 1, cash, price: Math.round(cash / 5900 * 3 * (0.8 + rnd() * 0.4) * 100) / 100 }
      })
      const fixed = Object.fromEntries(items.map(x => [x.id, pickInt(0, 2)]))
      const mk = rnd() < 0.2 ? 0 : pickInt(2000, 2600)
      const target = pickInt(5, 2500) * 100
      const r = solve({ target, costOf: (c: number) => c * 0.95, fee: 0.03, um: 1500, mk, items, exact: rnd() < 0.5, fixed })
      const keep = 0.97 * 1500, T100 = Math.ceil(target / 100) * 100
      const C = items.reduce((a, x) => a + fixed[x.id] * x.cash, 0)
      const B = items.reduce((a, x) => a + fixed[x.id] * x.price * keep, 0)
      const S = items.reduce((a, x) => a + fixed[x.id], 0)
      if (C < T100 && !mk) { expect(r).toBeNull(); continue }
      expect(r).not.toBeNull()
      if (!r) continue
      const m = C >= T100 ? 0 : Math.ceil((T100 - C) / 1000) * 1000
      expect(r.best.market).toBe(m)
      expect(r.best.pay).toBe(C + m)
      expect(r.best.sales).toBe(S + (m ? 1 : 0))
      expect(r.best.loss).toBeCloseTo((C + m) * 0.95 - B - (m ? m / mk * 1500 : 0), 0)
      for (const l of r.best.lines) expect(l.n).toBe(fixed[l.item.id])
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

describe('선물식', () => {
  // 엄 1,500원, 메소마켓 1억 = 2,250메포 → 캐시 1원에 0.667원. 선물식 1만 캐시당 7,000원 → 0.7원
  const base = { costOf: (c: number) => c * 0.9, fee: 0.03, um: 1500, mk: 2250, items: [], exact: true, bestOnly: true }
  it('메소마켓보다 더 받으면 남는 금액을 선물식으로 채우고, 현금을 그대로 받는다', () => {
    const s = solve({ ...base, target: 100_000, gift: 0.7 })!
    expect(s.best.gift).toBe(100_000)
    expect(s.best.market).toBe(0)
    near(s.best.back, 70_000)
    expect(s.best.sales).toBe(1)
  })
  it('메소마켓이 더 받으면 메소마켓을 쓴다', () => {
    const s = solve({ ...base, target: 100_000, gift: 0.6 })!
    expect(s.best.market).toBe(100_000)
    expect(s.best.gift).toBe(0)
  })
  it('플가가 더 남으면 플가를 사고 나머지만 선물식', () => {
    // 플가 3억 × 0.97 × 1,500원 = 4,365원 / 5,900캐시 = 캐시 1원에 0.74원 > 선물식 0.7원.
    // 10만 원에 딱 맞추려면(선물식은 1,000원 단위) 플가 10개 + 선물식 41,000이 가장 많이 남는다
    const s = solve({ ...base, target: 100_000, gift: 0.7, items: [karma] })!
    expect(s.best.lines[0].item.id).toBe('karma')
    expect(s.best.gift % 1000).toBe(0)
    expect(s.best.lines[0].n * 5900 + s.best.gift).toBe(100_000)
    near(s.best.back, s.best.lines[0].n * 3 * 0.97 * 1500 + s.best.gift * 0.7)
  })
})
