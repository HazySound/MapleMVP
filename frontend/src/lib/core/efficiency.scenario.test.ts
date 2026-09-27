/**
 * 효율표를 실제로 쓸 법한 상황마다 돌려 보고, 결과가 규칙대로인지 전부 검사한다.
 *
 * 시세는 2026-09-27 즈음 실제로 넣어 본 값(플가 3.1억, 엄 1,500원, 메소마켓 2,250메포)을
 * 기준으로 삼고, 거기서 오르내리게 흔든다. 아이템은 앱이 쓰는 목록 그대로다.
 */
import { describe, expect, it } from 'vitest'
import shop from './cashshop.json'
import {
  BIG, MONTHLY, PG_ID, SMALL, feeOf, fund, planAll, routesOf,
  type CardSetting, type CreditItem, type Plan, type RoutePick, type Sellable, type ShopItem, type WeekResult,
} from './efficiency'

const ITEMS = shop.items as ShopItem[]
/** 2026-09-27 로컬에서 넣어 본 경매장 가격(억) */
const PRICES: Record<string, number> = {
  karma: 3.1, potential: 47.8, additional: 24.2, wonder1: 2.8, wonder11: 27, royal1: 1.04, royal10: 10.3,
  royal20: 21, hair: 2.55, face: 1.6, customdye: 26, balancedye: 13, customlens: 12.5, luna: 1.7,
  specialluna: 1.8, tiniping1: 4.5, tiniping10: 47, prism: 3, prismpro: 12,
}
const CARDS: CardSetting[] = [
  { key: 'nexon', name: '넥슨카드', disc: 5.6, on: true },
  { key: 'culture', name: '컬쳐랜드', disc: 6, on: true },
  { key: 'book', name: '도서문화상품권', disc: 6, on: true },
]
const FULL = { nexon: MONTHLY, culture: MONTHLY, book: MONTHLY }
const once = (amount: number, tier: Plan['weeks'][number]['tier'] = 'diamond') => [{ start: '2026-09-24', amount, tier, month: '2026-09' }]
/** 이번 주(9월)부터 11월 둘째 주까지 매주 같은 금액 */
const weekly = (amount: number) => ['2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22', '2026-10-29', '2026-11-05', '2026-11-12']
  .map((start, i) => ({ start, amount, tier: 'diamond' as const, month: i === 0 ? '2026-09' : start.slice(0, 7) }))

const sell = (prices: Record<string, number>, extra: Sellable[] = []): Sellable[] =>
  [...ITEMS.map(x => ({ ...x, price: prices[x.id] ?? 0 })), ...extra]

interface Case extends Partial<Plan> { weeks: Plan['weeks']; salesN?: number }

function plan(c: Case): Plan {
  return {
    balance: 0, cards: CARDS, leftNow: FULL, thisMonth: '2026-09',
    barcode: { on: false, bonus: 0.05, cap: 500_000 }, barcodeOn: true, barcodeWant: null, weekBarcode: {},
    um: 1500, mk: 2250, items: sell(PRICES), fee: null, exact: false, ...c,
  }
}

const near = (a: number, b: number, eps = 0.5) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps)

/** 한 루트가 규칙대로인지 */
function checkPick(p: RoutePick, res: WeekResult[], c: Plan) {
  let cost = 0, back = 0, sales = 0
  for (const { w, route, funding } of p.weeks) {
    const target = Math.ceil(w.amount / 100) * 100
    expect(route.pay).toBeGreaterThanOrEqual(target)
    if (c.exact && c.mk > 0) expect(route.pay).toBe(target)
    // 충전: 합이 결제액, 상품권은 5만원권 + 3천 원 단위, 그 주 한도 안
    near(funding.parts.reduce((a, q) => a + q.cash, 0), route.pay)
    for (const q of funding.parts) {
      expect(q.cash).toBeGreaterThan(0)
      if (q.card) {
        expect(q.cash).toBe((q.big ?? 0) * BIG + (q.small ?? 0))
        expect((q.small ?? 0) % SMALL).toBe(0)
        const key = c.cards.find(k => k.name === q.name)!.key
        expect(q.cash).toBeLessThanOrEqual(w.ctx.limits[key] ?? 0)
      }
      if (q.name === '바코드') expect(c.barcode.on).toBe(true)
    }
    near(funding.cost, route.cost)
    // 돌려받는 돈·판매 횟수를 처음부터 다시 센다
    const keep = (1 - w.fee) * c.um
    const b = route.lines.reduce((a, l) => a + l.n * l.item.price * keep, 0) + (route.market && c.mk ? route.market / c.mk * c.um : 0)
    near(route.back, b)
    near(route.loss, route.cost - route.back)
    expect(route.sales).toBe(route.lines.reduce((a, l) => a + l.n, 0) + (route.market ? 1 : 0))
    near(route.meso, route.lines.reduce((a, l) => a + l.n * l.item.price * (1 - w.fee), 0), 1e-6)
    for (const l of route.lines) { expect(l.item.price).toBeGreaterThan(0); expect(l.n).toBeGreaterThan(0) }
    if (!c.mk) expect(route.market).toBe(0)
    expect(route.pay).toBe(route.lines.reduce((a, l) => a + l.n * l.item.cash, 0) + route.market)
    // 수수료: 직접 정하지 않았으면 그 주에 오를 등급으로
    expect(w.fee).toBe(c.fee ?? feeOf(w.tier))
    cost += route.cost; back += route.back; sales += route.sales
  }
  near(p.cost, cost, 1); near(p.back, back, 1); expect(p.sales).toBe(sales)
  // 달별 상품권 한도: 같은 달 여러 주가 쓴 합이 한도를 넘지 않는다
  const used: Record<string, number> = {}
  for (const { w, funding } of p.weeks) for (const q of funding.parts) if (q.card) {
    const key = c.cards.find(k => k.name === q.name)!.key
    used[`${w.month}:${key}`] = (used[`${w.month}:${key}`] ?? 0) + q.cash
  }
  for (const [mk, v] of Object.entries(used)) {
    const [month, key] = mk.split(':')
    expect(v).toBeLessThanOrEqual(month === c.thisMonth ? c.leftNow[key] ?? MONTHLY : MONTHLY)
  }
  void res
}

function run(c: Case) {
  const p = plan(c)
  const res = planAll(p)
  expect(res).not.toBeNull()
  const r = routesOf(res!, c.salesN ?? 10)
  for (const pick of [r.best, r.knee, r.count]) checkPick(pick, res!, p)
  // 최저가가 가장 적게 잃는다. 곡선은 판매 횟수가 늘수록 내려가거나 같다
  expect(r.best.loss).toBeLessThanOrEqual(r.knee.loss + 0.5)
  expect(r.best.loss).toBeLessThanOrEqual(r.count.loss + 0.5)
  for (let n = r.lo + 1; n <= r.hi; n++) expect(r.curve[n]).toBeLessThanOrEqual(r.curve[n - 1] + 0.5)
  near(r.curve[r.hi], r.best.loss, 1)
  expect(r.knee.n!).toBeGreaterThanOrEqual(r.lo)
  expect(r.knee.n!).toBeLessThanOrEqual(r.hi)
  near(r.knee.loss, r.curve[r.knee.n!], 1)
  near(r.count.loss, r.curve[r.count.n!], 1)
  expect(r.knee.sales).toBeLessThanOrEqual(r.best.sales)
  // 주마다 판매 n회 제한을 지킨다
  for (const { route } of r.count.weeks) expect(route.sales).toBeLessThanOrEqual(Math.max(r.count.n!, r.lo))
  return { p, res: res!, r }
}
const fundOf = (x: ReturnType<typeof run>, i = 0) => x.r.best.weeks[i].funding.parts.map(q => [q.name, q.cash])

describe('금액 직접: 자주 쓸 금액들', () => {
  it('다이아까지 12,400원: 5만 원이 안 돼 3천 원 단위, 끝자리는 일반 충전', () => {
    const x = run({ weeks: once(12_400) })
    // 계획이 없으면 조금 넘겨 사는 게 더 남을 수 있어 결제액이 늘 수 있다. 그래도 상품권은 3천 원 단위
    const parts = x.r.best.weeks[0].funding.parts
    expect(parts[0]).toMatchObject({ name: '컬쳐랜드', big: 0 })
    expect(parts[0].cash % SMALL).toBe(0)
  })

  it('25만 원: 할인 큰 컬쳐랜드 20만 + 도서문화 5만', () => {
    const x = run({ weeks: once(250_000), exact: true })
    expect(fundOf(x)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000]])
    near(x.r.best.cost, 250_000 * 0.94)
  })

  it('레드까지 612,400원: 상품권 셋 다 쓰고 나머지 일반 충전', () => {
    const x = run({ weeks: once(612_400, 'red'), exact: true })
    expect(fundOf(x)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 200_000], ['넥슨카드', 200_000], ['일반 충전', 12_400]])
  })

  it('블랙까지 1,612,400원: 한도가 모자라 대부분 일반 충전', () => {
    const x = run({ weeks: once(1_612_400, 'black'), exact: true })
    expect(fundOf(x).at(-1)).toEqual(['일반 충전', 1_012_400])
  })
})

describe('계획: 여러 주, 달이 바뀔 때', () => {
  it('매주 25만 × 8주: 9월 한도는 이번 주, 10월·11월은 새 한도를 앞 주부터', () => {
    const x = run({ weeks: weekly(250_000), exact: true })
    const card = (i: number) => fundOf(x, i).filter(([n]) => n !== '일반 충전')
    expect(card(0)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000]])
    expect(card(1)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000]])
    expect(card(2)).toEqual([['도서문화상품권', 150_000], ['넥슨카드', 100_000]])
    expect(card(3)).toEqual([['넥슨카드', 100_000]])
    expect(card(4)).toEqual([])
    expect(card(6)).toEqual([['컬쳐랜드', 200_000], ['도서문화상품권', 50_000]])
  })

  it('이번 달 한도를 이미 다 썼으면 이번 주는 일반 충전만', () => {
    const x = run({ weeks: weekly(250_000), exact: true, leftNow: { nexon: 0, culture: 0, book: 0 } })
    expect(fundOf(x, 0)).toEqual([['일반 충전', 250_000]])
    expect(fundOf(x, 1)[0]).toEqual(['컬쳐랜드', 200_000])
  })

  it('주마다 금액이 다른 계획(목표 직전에 몰아서)', () => {
    const weeks = weekly(0).map((w, i) => ({ ...w, amount: [50_000, 80_000, 120_000, 300_000, 450_000, 90_000, 30_000, 12_300][i] }))
    run({ weeks, exact: true })
  })

  it('판매 횟수를 주마다 1회로 묶어도 계획 금액은 그대로 맞춘다', () => {
    const x = run({ weeks: weekly(250_000), exact: true, salesN: 1 })
    for (const { route } of x.r.count.weeks) { expect(route.pay).toBe(250_000); expect(route.sales).toBeLessThanOrEqual(1) }
  })
})

describe('캐시 잔액·결제수단', () => {
  it('잔액을 먼저 1:1로 쓰고 모자라는 만큼 상품권', () => {
    const x = run({ weeks: once(250_000), exact: true, balance: 100_000 })
    expect(fundOf(x)).toEqual([['가진 캐시', 100_000], ['컬쳐랜드', 150_000]])
  })

  it('잔액이 결제보다 많으면 잔액만, 계획이면 다음 주로 남은 잔액을 넘긴다', () => {
    const x = run({ weeks: weekly(250_000).slice(0, 3), exact: true, balance: 300_000 })
    expect(fundOf(x, 0)).toEqual([['가진 캐시', 250_000]])
    expect(fundOf(x, 1)[0]).toEqual(['가진 캐시', 50_000])
  })

  it('상품권을 모두 끄면 일반 충전만, 넣은 현금 = 결제액', () => {
    const x = run({ weeks: once(250_000), exact: true, cards: CARDS.map(c => ({ ...c, on: false })) })
    expect(fundOf(x)).toEqual([['일반 충전', 250_000]])
    near(x.r.best.cost, 250_000)
  })

  it('할인 칸에 5만원권 가격(47,200)을 넣으면 5.6% 할인과 같다', () => {
    const a = run({ weeks: once(250_000), exact: true, cards: [{ key: 'nexon', name: '넥슨카드', disc: 47_200, on: true }] })
    const b = run({ weeks: once(250_000), exact: true, cards: [{ key: 'nexon', name: '넥슨카드', disc: 5.6, on: true }] })
    near(a.r.best.cost, b.r.best.cost)
  })

  it('남은 한도가 31,000원이면 3천 원 단위로 30,000원만', () => {
    const x = run({ weeks: once(100_000), exact: true, cards: [CARDS[0]], leftNow: { nexon: 31_000 } })
    expect(fundOf(x)).toEqual([['넥슨카드', 30_000], ['일반 충전', 70_000]])
  })

  it('바코드 이벤트: 추가분 한도에 닿으면 그 뒤는 1:1', () => {
    const x = run({ weeks: weekly(250_000).slice(0, 2), exact: true, cards: [], barcode: { on: true, bonus: 0.05, cap: 15_000 } })
    const bc = x.r.best.weeks.map(w => w.funding.parts.find(q => q.name === '바코드')!)
    near(bc[0].bonus!, 250_000 * 0.05 / 1.05)
    near(bc[1].bonus!, 15_000 - 250_000 * 0.05 / 1.05)
  })
})

describe('시세·아이템', () => {
  it('아이템 가격이 하나도 없으면 전부 메소마켓 한 번: 잃는 돈 = 현금 − 결제/메소마켓×엄', () => {
    const x = run({ weeks: once(250_000), exact: true, items: sell({}), cards: [] })
    expect(x.r.best.weeks[0].route.lines).toEqual([])
    expect(x.r.best.sales).toBe(1)
    near(x.r.best.loss, 250_000 - 250_000 / 2250 * 1500)
  })

  it('플가만 가격을 넣으면 플가 + 끝자리 메소마켓', () => {
    const x = run({ weeks: once(250_000), exact: true, items: sell({ karma: 3.1 }) })
    const l = x.r.best.weeks[0].route
    expect(l.lines.map(v => v.item.id)).toEqual([PG_ID])
    expect(l.lines[0].n).toBe(Math.floor(250_000 / 5900))
    expect(l.market).toBe(250_000 - l.lines[0].n * 5900)
  })

  it('메소마켓 시세를 비우면 끝자리를 못 맞춰 조금 넘겨 산다', () => {
    const x = run({ weeks: weekly(250_000).slice(0, 2), exact: true, mk: 0 })
    for (const { route } of x.r.best.weeks) expect(route.pay).toBeGreaterThanOrEqual(250_000)
  })

  it('수수료 5%면 3%보다 더 나간다', () => {
    const a = run({ weeks: once(250_000), exact: true, fee: 0.03 })
    const b = run({ weeks: once(250_000), exact: true, fee: 0.05 })
    expect(b.r.best.loss).toBeGreaterThan(a.r.best.loss)
  })

  it('플가 기준보다 싸도 메소마켓보다 나으면, 판매 횟수를 줄일 때 쓴다', () => {
    // 99,000캐시짜리: 플가 기준 52.0억, 메소마켓과 같아지는 가격 99,000/2,250/0.97 = 45.4억
    const prices = { karma: 3.1, potential: 50, tiniping10: 49 }
    const x = run({ weeks: once(250_000), exact: true, items: sell(prices), salesN: 3 })
    expect(x.r.best.weeks[0].route.lines.every(l => l.item.id === PG_ID)).toBe(true)
    expect(x.r.count.weeks[0].route.lines.some(l => l.item.id !== PG_ID)).toBe(true)
  })

  it('메소마켓보다도 못한 가격이면 판매 횟수를 줄일 때도 안 쓰고 메소마켓 한 번이 낫다', () => {
    const prices = { karma: 3.1, potential: 45, tiniping10: 44 }
    const x = run({ weeks: once(250_000), exact: true, items: sell(prices), salesN: 3 })
    const r = x.r.count.weeks[0].route
    expect(r.lines.some(l => l.item.id === 'potential' || l.item.id === 'tiniping10')).toBe(false)
  })

  it('직접 추가한 묶음 아이템도 같은 규칙으로 계산된다', () => {
    const mine: Sellable = { id: 'c1', name: '골드 애플', set: 10, cash: 49_000, days: 7, custom: true, price: 27 }
    const x = run({ weeks: once(250_000), exact: true, items: sell({ karma: 3.1 }, [mine]) })
    expect(x.r.best.weeks[0].route.lines.some(l => l.item.id === 'c1')).toBe(true)
  })

  it('시세가 오르내릴 때: 엄·플가가 오르면 덜 나가고, 메소마켓(메포)이 비싸지면 더 나간다', () => {
    const loss = (o: Partial<Plan>) => run({ weeks: once(250_000), exact: true, ...o }).r.best.loss
    for (const pg of [2.5, 2.8, 3.1, 3.4]) {
      const prices = { ...PRICES, karma: pg }
      const byUm = [1400, 1500, 1650].map(um => loss({ um, items: sell(prices) }))
      expect(byUm[1]).toBeLessThanOrEqual(byUm[0] + 0.5)
      expect(byUm[2]).toBeLessThanOrEqual(byUm[1] + 0.5)
      const byMk = [2100, 2250, 2500].map(mk => loss({ mk, items: sell(prices) }))
      expect(byMk[1]).toBeGreaterThanOrEqual(byMk[0] - 0.5)
      expect(byMk[2]).toBeGreaterThanOrEqual(byMk[1] - 0.5)
    }
    const byPg = [2.5, 2.8, 3.1, 3.4].map(pg => loss({ items: sell({ ...PRICES, karma: pg }) }))
    for (let i = 1; i < byPg.length; i++) expect(byPg[i]).toBeLessThanOrEqual(byPg[i - 1] + 0.5)
  })

  it('계획 × 시세 흔들기: 모든 조합에서 규칙이 지켜진다', () => {
    for (const pg of [2.6, 3.1, 3.5]) for (const um of [1400, 1600]) for (const mk of [2150, 2400]) for (const salesN of [1, 4, 30]) {
      run({ weeks: weekly(250_000), exact: true, um, mk, salesN, items: sell({ ...PRICES, karma: pg }) })
    }
  })
})

describe('메이플 크레딧까지 넣었을 때', () => {
  const cubes = (add = 16, prime = 6): CreditItem[] => [
    { id: 'prime', name: '프라임 큐브', credits: 10_000, price: prime, days: 30 },
    { id: 'primeadd', name: '프라임 에디셔널 큐브', credits: 20_000, price: add, days: 30 },
  ]
  function withCredit(c: Case, balance = 0, items = cubes()) {
    const p = plan({ ...c, credit: { items } })
    const res = planAll(p)!
    const r = routesOf(res, c.salesN ?? 10, { balance, items })
    for (const pick of [r.best, r.knee, r.count]) {
      // 쌓인 크레딧 = 산 캐시템 금액의 5%, 쓴 것 + 남은 것 = 남아 있던 것 + 쌓인 것
      const earned = pick.weeks.reduce((a, w) => a + w.credit!.earned, 0)
      near(earned, pick.weeks.reduce((a, w) => a + w.route.lines.reduce((s, l) => s + l.n * l.item.cash, 0) * 0.05, 0), 1e-6)
      const used = pick.weeks.reduce((a, w) => a + w.credit!.used, 0)
      near(used + pick.creditLeft, balance + earned, 1e-6)
      expect(pick.creditLeft).toBeGreaterThanOrEqual(0)
      // 크레딧 판 돈까지 넣어도 잃는 돈 = 넣은 현금 − 돌려받는 돈
      near(pick.loss, pick.cost - pick.back, 1)
      for (const w of pick.weeks) near(w.credit!.back, w.credit!.meso * p.um, 1e-6)
    }
    // 그래프와 카드가 같은 숫자: 곡선의 각 점이 그 횟수 루트의 실제 값이고, 최저가는 곡선의 가장 낮은 점
    near(r.curve[r.best.n!], r.best.loss, 1)
    near(r.curve[r.knee.n!], r.knee.loss, 1)
    near(r.curve[r.count.n!], r.count.loss, 1)
    for (let k = r.lo; k <= r.hi; k++) expect(r.best.loss).toBeLessThanOrEqual(r.curve[k] + 0.5)
    expect(r.knee.n!).toBeLessThanOrEqual(r.best.n!)
    return { p, res, r }
  }

  it('25만 원: 크레딧을 쓰면 안 쓸 때보다 덜 나간다', () => {
    const off = run({ weeks: once(250_000), exact: true }).r.best.loss
    const on = withCredit({ weeks: once(250_000), exact: true }).r.best.loss
    expect(on).toBeLessThanOrEqual(off + 0.5)
  })

  it('8주 계획: 모아 뒀다가 에디 위주로 턴다. 남는 크레딧은 1만(프라임 한 개)보다 적다', () => {
    const x = withCredit({ weeks: weekly(250_000), exact: true })
    for (const pick of [x.r.best, x.r.knee]) {
      expect(pick.creditLeft).toBeLessThan(10_000)
      for (const w of pick.weeks.slice(0, -1)) for (const b of w.credit!.buys) expect(b.item.id).toBe('primeadd')
    }
  })

  it('남아 있던 크레딧 5만: 첫 주에 에디 2개부터 턴다', () => {
    const x = withCredit({ weeks: weekly(250_000), exact: true }, 50_000)
    expect(x.r.best.weeks[0].credit!.buys.find(b => b.item.id === 'primeadd')!.n).toBeGreaterThanOrEqual(2)
  })

  it('큐브 시세가 오르내려도 규칙이 지켜지고, 비쌀수록 덜 나간다', () => {
    const losses = [10, 13, 16, 20].map(add => withCredit({ weeks: once(250_000), exact: true }, 0, cubes(add)).r.best.loss)
    for (let i = 1; i < losses.length; i++) expect(losses[i]).toBeLessThanOrEqual(losses[i - 1] + 0.5)
  })

  it('크레딧샵 가격을 비우면 크레딧은 계산에 안 들어간다', () => {
    const off = run({ weeks: once(250_000), exact: true }).r.best.loss
    const empty = withCredit({ weeks: once(250_000), exact: true }, 0, cubes(0, 0)).r.best.loss
    near(empty, off)
  })
})

describe('끝에 남는 크레딧 모아 두기', () => {
  it('모아 두면 마지막 주에도 에디만 사고, 남는 크레딧은 2만 미만', () => {
    const items: CreditItem[] = [
      { id: 'prime', name: '프라임 큐브', credits: 10_000, price: 6, days: 30 },
      { id: 'primeadd', name: '프라임 에디셔널 큐브', credits: 20_000, price: 16, days: 30 },
    ]
    for (const weeks of [weekly(250_000), once(250_000)]) {
      const p = plan({ weeks, exact: true, credit: { items } })
      const res = planAll(p)!
      const keep = routesOf(res, 10, { balance: 0, items, keepRest: true })
      const spend = routesOf(res, 10, { balance: 0, items, keepRest: false })
      for (const w of keep.best.weeks) for (const b of w.credit!.buys) expect(b.item.id).toBe('primeadd')
      expect(keep.best.creditLeft).toBeLessThan(20_000)
      expect(spend.best.creditLeft).toBeLessThan(10_000)
      // 모아 둔 만큼은 이번 계산에서 돌려받지 않은 돈이다
      expect(keep.best.creditBack).toBeLessThanOrEqual(spend.best.creditBack + 0.5)
    }
  })
})
