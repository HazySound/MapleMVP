/**
 * 효율표 입력값. 이 브라우저(또는 exe)에만 저장한다.
 *
 * 시세와 상품권 할인은 사람마다·그날그날 다르고 서버에 올릴 이유가 없다.
 * 나중에 계정으로 옮길 일이 생기면 이 한 덩어리만 올리면 된다.
 */
import shop from './core/cashshop.json'
import { MONTHLY, PG_ID, fund, isShort, knee, planAll, type BarcodeEvent, type Funding, type Route, type Sellable, type ShopItem, type WeekResult } from './core/efficiency'
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

export type Want = 'best' | 'knee' | 'count'

interface Saved {
  usePlan: boolean
  amount: number
  /** 캐시 잔액. 이미 낸 돈이라 1:1로 센다 */
  balance: number
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
  /** 수수료를 직접 정한 값. null이면 자동(계획을 따를 때만) */
  feeOverride: number | null
  want: Want
  salesN: number
  /** 플가 대비를 개수로 볼지(1.04플가), 플가 가격으로 볼지(3.12억) */
  pgView: 'ratio' | 'price'
  /** 사용자가 직접 추가한 아이템. 기본 목록에 없는 걸로 작하는 사람을 위해 */
  custom: ShopItem[]
  /** 가격표에서 플가보다 손해인 아이템을 접어 둔다 */
  hideLoss: boolean
}

function fresh(): Saved {
  return {
    usePlan: true, amount: 0, balance: 0,
    cards: CARDS.map(c => ({ ...c, disc: 0, on: true })),
    leftNow: Object.fromEntries(CARDS.map(c => [c.key, MONTHLY])), leftMonth: thisMonth(),
    barcodeOn: true, barcodeWant: null, weekBarcode: {},
    um: 0, mk: 0, at: {}, prices: {}, feeOverride: null, want: 'best', salesN: 10, pgView: 'ratio', custom: [], hideLoss: false,
  }
}

function load(): Saved {
  const base = fresh()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const s = { ...base, ...JSON.parse(raw) } as Saved & { held?: { cash: number } }
    // 예전 '이미 충전한 캐시'는 캐시 잔액으로 옮긴다
    if (s.held && !s.balance) s.balance = s.held.cash ?? 0
    delete s.held
    // 상품권 한도는 달마다 새로 생긴다. 지난달에 적어 둔 남은 한도는 버린다
    if (s.leftMonth !== thisMonth()) { s.leftNow = base.leftNow; s.leftMonth = base.leftMonth }
    return s
  } catch {
    return base
  }
}

export const eff = $state(load())

/** 계정에서 더 새것을 받아 왔을 때 다시 읽는다 */
export function reloadEff() {
  Object.assign(eff, load())
}

let timer: number | undefined
let upTimer: number | undefined
/**
 * 이 브라우저에 저장하고, 로그인해 있으면 계정에도 올린다.
 * 계정은 쓰기 횟수에 제한이 있어서, 마지막으로 고친 뒤 잠깐 기다렸다가 한 번에 올린다.
 */
export function saveEff() {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify($state.snapshot(eff)))
      localStorage.setItem(`${KEY}At`, String(Date.now()))
    } catch { /* 막혀 있으면 이번만 */ }
    clearTimeout(upTimer)
    upTimer = window.setTimeout(pushNow, 15_000)
  }, 300)
}

async function pushNow() {
  clearTimeout(upTimer)
  upTimer = undefined
  const { app, pushUp } = await import('./store.svelte')
  if (app.web && app.user) await pushUp()
}

// 올리기를 기다리는 중에 탭을 떠나면 그때 바로 올린다
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && upTimer !== undefined) void pushNow()
  })
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

/** 기본 목록 + 직접 추가한 것. 판매 기간이 끝난 상품은 살 수 없으니 뺀다 */
export const shopItems = (): ShopItem[] => [
  ...SHOP.items.filter(x => !x.until || x.until >= new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10)),
  ...eff.custom,
]

/** 직접 추가한 아이템을 넣거나 고친다 */
export function saveCustom(x: Omit<ShopItem, 'id' | 'custom'>, id?: string) {
  const item: ShopItem = { ...x, id: id ?? `c${Date.now().toString(36)}`, custom: true }
  const i = eff.custom.findIndex(c => c.id === item.id)
  if (i >= 0) eff.custom[i] = item
  else eff.custom.push(item)
  saveEff()
  return item.id
}

export function removeCustom(id: string) {
  eff.custom = eff.custom.filter(c => c.id !== id)
  delete eff.prices[id]
  saveEff()
}

export const sellables = (): Sellable[] => shopItems().map(x => ({ ...x, price: eff.prices[x.id] ?? 0 }))

/** 한 번에 큰 금액을 채우는 아이템. 판매 횟수가 확 준다. 사용 기간은 따지지 않는다(원더베리 11개도 작에 많이 쓴다) */
export const isBig = (x: ShopItem) => x.cash >= 40_000

/** 지금 13주 합계로 이 금액을 결제하면 오를 등급 */
export function tierAfter(d: State, amount: number): TierKey | null {
  const sum = d.weeks.reduce((a, w) => a + w.amount, 0) + d.carry + amount
  let t: TierKey | null = null
  for (const x of d.tiers) if (sum >= x.th) t = x.key
  return t
}

/** 한 주에 고른 조합과 그 충전 내역 */
export interface WeekPick { w: WeekResult; route: Route; funding: Funding }
/** 루트 하나: 주마다 판매 n회까지(null이면 제한 없음) */
export interface Pick {
  n: number | null
  weeks: WeekPick[]
  cost: number
  back: number
  loss: number
  sales: number
  pay: number
}
export interface Summary { loss: number; sales: number }

export interface EffOut {
  mode: 'plan' | 'amount'
  target: number
  weeks: WeekResult[]
  /** curve[n] = 주마다 판매 n회까지로 할 때 전체 잃는 돈 (n은 lo..hi) */
  curve: number[]
  lo: number
  hi: number
  best: Pick
  knee: Pick
  count: Pick
  /** 지금 고른 루트 */
  sel: Pick
  pgOnly: Summary | null
  mkOnly: Summary | null
  /** 성향별: 무기한 아이템만, 7일 아이템만, 비싼 아이템만 */
  waitOnly: Summary | null
  fastOnly: Summary | null
  bigOnly: Summary | null
}

/** 계획을 따를 수 있으면 계획대로, 아니면 정한 금액 한 번 */
export function planWeeks(d: State, plan: PlanResult | null) {
  if (!plan || plan.error) return null
  const ws = plan.timeline.filter(w => w.amount > 0 && !w.skipped)
  if (!ws.length) return null
  const now = thisMonth()
  return ws.map(w => ({ start: w.start, amount: w.amount, tier: w.tier as TierKey | null, month: w.offset === 0 ? now : w.start.slice(0, 7) }))
}

/** 판매 횟수 제한(주마다 n회)으로 루트를 고른다 */
function pickAt(weeks: WeekResult[], n: number | null): Pick {
  const ps = weeks.map(w => {
    const route = n == null ? w.solved.best : w.solved.routeAt(n)
    return { w, route, funding: fund(route.pay, w.ctx) }
  })
  const sum = (f: (p: WeekPick) => number) => ps.reduce((a, p) => a + f(p), 0)
  return { n, weeks: ps, cost: sum(p => p.route.cost), back: sum(p => p.route.back), loss: sum(p => p.route.loss), sales: sum(p => p.route.sales), pay: sum(p => p.route.pay) }
}

export function computeEff(d: State, plan: PlanResult | null): EffOut | null {
  const pw = eff.usePlan ? planWeeks(d, plan) : null
  const mode = pw ? 'plan' : 'amount'
  const weeks = pw ?? (eff.amount > 0 ? [{ start: d.thisWeek, amount: eff.amount, tier: tierAfter(d, eff.amount), month: thisMonth() }] : null)
  if (!weeks || !eff.um) return null
  // 금액 직접일 때는 수수료를 사용자가 정한다. 안 건드렸으면 오를 등급으로 먼저 채워 둔다
  const fee = mode === 'amount' ? (eff.feeOverride ?? (weeks[0].tier && weeks[0].tier !== 'bronze' ? 0.03 : 0.05)) : eff.feeOverride
  const all = sellables()
  const run = (items: Sellable[]) => planAll({
    weeks, balance: eff.balance, cards: eff.cards, leftNow: eff.leftNow, thisMonth: thisMonth(),
    barcode: SHOP.barcode, barcodeOn: eff.barcodeOn, barcodeWant: eff.barcodeWant, weekBarcode: eff.weekBarcode,
    um: eff.um, mk: eff.mk, items, fee, exact: mode === 'plan',
  })
  const res = run(all)
  if (!res) return null

  // 판매 횟수별 전체 손실. 주마다 같은 상한을 건다
  const hi = Math.max(1, ...res.map(w => w.solved.best.sales))
  const curve: number[] = [Infinity]
  for (let n = 1; n <= hi; n++) curve.push(res.reduce((a, w) => a + w.solved.lossAt[Math.min(n, w.solved.lossAt.length - 1)], 0))
  let lo = 1
  while (lo < hi && !Number.isFinite(curve[lo])) lo++
  const kn = knee(curve, lo, hi)
  const n = Math.max(lo, Math.min(eff.salesN, hi))
  const best = pickAt(res, null), kp = pickAt(res, kn), cp = pickAt(res, n)

  const alt = (items: Sellable[]): Summary | null => {
    if (!items.some(x => x.price > 0) && !eff.mk) return null
    const r = run(items)
    return r ? { loss: r.reduce((a, w) => a + w.solved.best.loss, 0), sales: r.reduce((a, w) => a + w.solved.best.sales, 0) } : null
  }
  const priced = all.filter(x => x.price > 0)
  const wait = priced.filter(x => !x.days), fast = priced.filter(isShort), big = priced.filter(isBig)
  return {
    mode, target: weeks.reduce((a, w) => a + w.amount, 0), weeks: res, curve, lo, hi,
    best, knee: kp, count: cp, sel: eff.want === 'knee' ? kp : eff.want === 'count' ? cp : best,
    pgOnly: priced.some(x => x.id === PG_ID) ? alt(priced.filter(x => x.id === PG_ID)) : null,
    mkOnly: eff.mk > 0 ? alt([]) : null,
    waitOnly: wait.length ? alt(wait) : null,
    fastOnly: fast.length ? alt(fast) : null,
    bigOnly: big.length ? alt(big) : null,
  }
}
