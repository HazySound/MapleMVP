/**
 * 효율표 입력값. 이 브라우저(또는 exe)에만 저장한다.
 *
 * 시세와 상품권 할인은 사람마다·그날그날 다르고 서버에 올릴 이유가 없다.
 * 나중에 계정으로 옮길 일이 생기면 이 한 덩어리만 올리면 된다.
 */
import shop from './core/cashshop.json'
import { MONTHLY, PG_ID, planAll, type BarcodeEvent, type Sellable, type ShopItem, type WeekResult } from './core/efficiency'
import type { PlanResult, State, TierKey } from './types'

export const SHOP = shop as { updated: string; barcode: BarcodeEvent; items: ShopItem[] }

const KEY = 'maplemvp.eff'

/** 한국 시간 기준 이번 달 'YYYY-MM' */
export const thisMonth = () => new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 7)

const CARDS = [
  { key: 'nexon', name: '넥슨카드' },
  { key: 'culture', name: '컬쳐랜드' },
  { key: 'book', name: '도서문화상품권' },
]

interface Saved {
  usePlan: boolean
  amount: number
  held: { cash: number; won: number }
  cards: { key: string; name: string; disc: number; on: boolean }[]
  leftNow: Record<string, number>
  leftMonth: string
  barcodeOn: boolean
  barcodeWant: number | null
  weekBarcode: Record<string, number>
  um: number
  mk: number
  /** 값마다 마지막으로 넣은 때(ms). 오래된 시세로 계산하고 있는지 보여 준다 */
  at: Record<string, number>
  prices: Record<string, number>
  feeOverride: number | null
  want: 'best' | 'count'
  salesN: number
}

function fresh(): Saved {
  return {
    usePlan: true, amount: 0, held: { cash: 0, won: 0 },
    cards: CARDS.map(c => ({ ...c, disc: 0, on: true })),
    leftNow: Object.fromEntries(CARDS.map(c => [c.key, MONTHLY])), leftMonth: thisMonth(),
    barcodeOn: true, barcodeWant: null, weekBarcode: {},
    um: 0, mk: 0, at: {}, prices: {}, feeOverride: null, want: 'best', salesN: 10,
  }
}

function load(): Saved {
  const base = fresh()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const s = { ...base, ...JSON.parse(raw) } as Saved
    // 상품권 한도는 달마다 새로 생긴다. 지난달에 적어 둔 남은 한도는 버린다
    if (s.leftMonth !== thisMonth()) { s.leftNow = base.leftNow; s.leftMonth = base.leftMonth }
    return s
  } catch {
    return base
  }
}

export const eff = $state(load())

let timer: number | undefined
export function saveEff() {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify($state.snapshot(eff))) } catch { /* 막혀 있으면 이번만 */ }
  }, 300)
}

/** 값을 넣은 때를 적는다 */
export const touch = (k: string) => { eff.at[k] = Date.now() }

/** '오늘 넣은 값', '3일 전에 넣은 값' */
export function ageOf(k: string, now = Date.now()): string {
  const t = eff.at[k]
  if (!t) return ''
  const day = (x: number) => Math.floor((x + 9 * 36e5) / 864e5)
  const d = day(now) - day(t)
  return d <= 0 ? '오늘 넣은 값' : d === 1 ? '어제 넣은 값' : `${d}일 전에 넣은 값`
}

/** 판매 기간이 끝난 상품은 살 수 없으니 뺀다 */
export const shopItems = () => SHOP.items.filter(x => !x.until || x.until >= new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10))

export const sellables = (): Sellable[] => shopItems().map(x => ({ ...x, price: eff.prices[x.id] ?? 0 }))

/** 지금 13주 합계로 이 금액을 결제하면 오를 등급 */
export function tierAfter(d: State, amount: number): TierKey | null {
  const sum = d.weeks.reduce((a, w) => a + w.amount, 0) + d.carry + amount
  let t: TierKey | null = null
  for (const x of d.tiers) if (sum >= x.th) t = x.key
  return t
}

export interface EffOut {
  mode: 'plan' | 'amount'
  weeks: WeekResult[] | null
  /** 합계 */
  cost: number
  back: number
  loss: number
  sales: number
  bestLoss: number
  bestSales: number
  target: number
  pay: number
  /** 판매 횟수 막대의 끝. 가장 많이 남는 방법에서 한 주에 가장 많이 파는 횟수 */
  maxSales: number
  /** 비교: 플가만 팔았을 때, 전부 메소마켓으로 했을 때 */
  pgOnly: { loss: number; sales: number } | null
  mkOnly: { loss: number; sales: number } | null
}

/** 계획을 따를 수 있으면 계획대로, 아니면 정한 금액 한 번 */
export function planWeeks(d: State, plan: PlanResult | null) {
  if (!plan || plan.error) return null
  const ws = plan.timeline.filter(w => w.amount > 0 && !w.skipped)
  if (!ws.length) return null
  const now = thisMonth()
  return ws.map(w => ({ start: w.start, amount: w.amount, tier: w.tier as TierKey | null, month: w.offset === 0 ? now : w.start.slice(0, 7) }))
}

export function computeEff(d: State, plan: PlanResult | null): EffOut | null {
  const pw = eff.usePlan ? planWeeks(d, plan) : null
  const mode = pw ? 'plan' : 'amount'
  const weeks = pw ?? (eff.amount > 0 ? [{ start: d.thisWeek, amount: eff.amount, tier: tierAfter(d, eff.amount), month: thisMonth() }] : null)
  if (!weeks) return null
  const all = sellables()
  const run = (items: Sellable[], maxSales?: number) => planAll({
    weeks, held: eff.held, cards: eff.cards, leftNow: eff.leftNow, thisMonth: thisMonth(),
    barcode: SHOP.barcode, barcodeOn: eff.barcodeOn, barcodeWant: eff.barcodeWant, weekBarcode: eff.weekBarcode,
    um: eff.um, mk: eff.mk, items, feeOverride: eff.feeOverride, exact: mode === 'plan', maxSales,
  })
  const res = eff.um > 0 ? run(all, eff.want === 'count' ? eff.salesN : undefined) : null
  if (!res) return { mode, weeks: null, cost: 0, back: 0, loss: 0, sales: 0, bestLoss: 0, bestSales: 0, target: 0, pay: 0, maxSales: 1, pgOnly: null, mkOnly: null }
  const sum = (f: (w: WeekResult) => number) => res.reduce((a, w) => a + f(w), 0)
  const alt = (items: Sellable[]) => {
    const r = run(items)
    return r ? { loss: r.reduce((a, w) => a + w.best.loss, 0), sales: r.reduce((a, w) => a + w.best.sales, 0) } : null
  }
  return {
    mode, weeks: res,
    cost: sum(w => w.route.cost), back: sum(w => w.route.back), loss: sum(w => w.route.loss), sales: sum(w => w.route.sales),
    bestLoss: sum(w => w.best.loss), bestSales: sum(w => w.best.sales),
    target: sum(w => w.amount), pay: sum(w => w.route.pay),
    maxSales: Math.max(1, ...res.map(w => w.best.sales)),
    pgOnly: all.some(x => x.id === PG_ID && x.price > 0) ? alt(all.filter(x => x.id === PG_ID)) : null,
    mkOnly: eff.mk > 0 ? alt([]) : null,
  }
}
