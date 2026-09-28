/**
 * 효율표 입력값. 이 브라우저(또는 exe)에만 저장한다.
 *
 * 시세와 상품권 할인은 사람마다·그날그날 다르고 서버에 올릴 이유가 없다.
 * 나중에 계정으로 옮길 일이 생기면 이 한 덩어리만 올리면 된다.
 */
import shop from './core/cashshop.json'
import { MONTHLY, PG_ID, isShort, pickAt, planAll, plainRateOf, routesOf, type BarcodeEvent, type PlainMode, type CreditItem, type RoutePick as Pick, type Sellable, type ShopItem, type WeekResult } from './core/efficiency'
export type { RoutePick as Pick, WeekPick } from './core/efficiency'
import type { PlanResult, State, TierKey } from './types'

export const SHOP = shop as { updated: string; barcode: BarcodeEvent; items: ShopItem[]; credit: Omit<CreditItem, 'price'>[] }

const KEY = 'maplemvp.eff'

/** 처음 목록. 나머지는 '아이템 추가'에서 골라 넣는다 */
export const DEFAULT_PICK = [PG_ID, 'wonder1', 'wonder11', 'tiniping1', 'tiniping10', 'royal1', 'royal10', 'royal20']

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
  /**
   * 직접 추가한 결제수단(넥슨팩 쿠폰 등). 할인을 적는 방식과 값, 달마다 한도(null이면 없음).
   * 할인이 큰 것부터 쓰고, 딱 맞지 않는 끝자리만 일반 충전(1:1)
   */
  methods: PayMethod[]
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
  /** 효율 칸: 플가 몇 개(1.04플가), 플가 가격으로(3.12억), 회수율(82.4%) */
  pgView: 'ratio' | 'price' | 'rate'
  /** 가격표에 올려 둔 아이템. 여기 없는 아이템은 계산에서도 빠진다. 플가는 기준이라 늘 들어간다 */
  picked: string[]
  /** 목록 빼기가 생기기 전부터 쓰던 사람에게 한 번 알려 준다 */
  listNews: boolean
  /** 사용자가 직접 추가한 아이템. 기본 목록에 없는 걸로 작하는 사람을 위해 */
  custom: ShopItem[]
  /** 가격표에서 플가보다 손해인 아이템을 접어 둔다 */
  hideLoss: boolean
  /** 메이플 크레딧: 쓸지, 남아 있는 크레딧, 크레딧샵 물건 경매장 가격(억), 직접 추가한 물건 */
  creditOn: boolean
  creditBalance: number
  creditPrices: Record<string, number>
  creditCustom: Omit<CreditItem, 'price'>[]
  /** 끝에 남는 크레딧을 털지 않고 모아 둘지 */
  creditKeep: boolean
  /**
   * 판매 1회 수고비. 최적화 루트는 한 번 덜 팔 때 이보다 더 내야 하면 줄이지 않는다.
   * 기본값을 1,000원에서 2,000원으로 바꾸며 이름도 바꿨다. 옛 이름에 남은 1,000원은 버리고 새 기본값에서 시작한다
   */
  sellCost: number
}

function fresh(): Saved {
  return {
    usePlan: true, amount: 0, balance: 0,
    cards: CARDS.map(c => ({ ...c, disc: 0, on: true })), methods: [],
    leftNow: Object.fromEntries(CARDS.map(c => [c.key, MONTHLY])), leftMonth: thisMonth(),
    barcodeOn: true, barcodeWant: null, weekBarcode: {},
    um: 0, mk: 0, at: {}, prices: {}, feeOverride: null, want: 'best', salesN: 10, pgView: 'ratio', picked: [...DEFAULT_PICK], listNews: false, custom: [], hideLoss: false,
    creditOn: true, creditBalance: 0, creditPrices: { prime: 6, primeadd: 16 }, creditCustom: [], creditKeep: false, sellCost: 2000,
  }
}

function load(): Saved {
  const base = fresh()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const got = JSON.parse(raw) as Partial<Saved>
    const s = { ...base, ...got } as Saved & { held?: { cash: number }; saleCost?: number; plainMode?: PlainMode; plainVal?: number }
    // 잠깐 있었던 '일반 충전 할인'은 한도 없는 결제수단 하나로 옮긴다
    if (s.plainVal && plainRateOf(s.plainMode ?? 'off', s.plainVal) < 1 && !s.methods.length)
      s.methods = [{ id: 'm-plain', name: '할인 충전', mode: s.plainMode ?? 'off', val: s.plainVal, monthly: null, on: true }]
    delete s.plainMode; delete s.plainVal
    // 목록 고르기가 생기기 전부터 쓰던 사람: 갑자기 아이템이 빠지면 헷갈리니 그때 보던 목록을 그대로 둔다.
    // 기본 4종으로 시작하는 건 처음 쓰는 사람만
    if (!got.picked) {
      s.picked = [...SHOP.items.map(x => x.id), ...(s.custom ?? []).map(c => c.id)]
      s.listNews = true
    }
    delete s.saleCost
    // 크레딧이 생기기 전에 저장한 값에는 큐브 가격이 없다. 기본값을 채워 둔다
    s.creditPrices = { ...base.creditPrices, ...s.creditPrices }
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

/** 고를 수 있는 아이템 전부: 프리셋 + 직접 만든 것. 판매 기간이 끝난 상품은 살 수 없으니 뺀다 */
export const catalog = (): ShopItem[] => [
  ...SHOP.items.filter(x => !x.until || x.until >= new Date(Date.now() + 9 * 36e5).toISOString().slice(0, 10)),
  ...eff.custom,
]

/** 가격표에 올려 둔 아이템. 계산도 이것만 한다 */
export const shopItems = (): ShopItem[] => catalog().filter(x => x.id === PG_ID || eff.picked.includes(x.id))

/** 목록에 넣는다 */
export function pickItem(id: string) {
  if (!eff.picked.includes(id)) eff.picked.push(id)
  saveEff()
}

/** 목록에서 뺀다. 넣어 둔 가격은 남겨 둬서 다시 넣으면 그대로 돌아온다 */
export function unpickItem(id: string) {
  if (id === PG_ID) return
  eff.picked = eff.picked.filter(x => x !== id)
  saveEff()
}

/** 직접 만든 아이템을 넣거나 고친다. 새로 만들면 목록에도 넣는다 */
export function saveCustom(x: Omit<ShopItem, 'id' | 'custom'>, id?: string) {
  const item: ShopItem = { ...x, id: id ?? `c${Date.now().toString(36)}`, custom: true }
  const i = eff.custom.findIndex(c => c.id === item.id)
  if (i >= 0) eff.custom[i] = item
  else eff.custom.push(item)
  if (!eff.picked.includes(item.id)) eff.picked.push(item.id)
  saveEff()
  return item.id
}

/** 크레딧샵 물건을 직접 추가한다. 거의 쓸 일은 없지만 새 물건이 나올 때를 위해 */
export interface PayMethod { id: string; name: string; mode: PlainMode; val: number; monthly: number | null; on: boolean }

export function addMethod(x: Omit<PayMethod, 'id' | 'on'>) {
  eff.methods.push({ ...x, id: `pm${Date.now().toString(36)}`, on: true })
  saveEff()
}

export function removeMethod(id: string) {
  eff.methods = eff.methods.filter(m => m.id !== id)
  delete eff.leftNow[id]
  saveEff()
}

export function addCreditItem(x: { name: string; credits: number; days?: number }) {
  eff.creditCustom.push({ ...x, id: `cc${Date.now().toString(36)}`, custom: true })
  saveEff()
}

export function removeCreditItem(id: string) {
  eff.creditCustom = eff.creditCustom.filter(c => c.id !== id)
  delete eff.creditPrices[id]
  saveEff()
}

/** 직접 만든 아이템을 아예 지운다(추가 후보에서도 빠진다). 되돌리기용으로 지운 것을 돌려준다 */
export function removeCustom(id: string) {
  const item = eff.custom.find(c => c.id === id)
  const price = eff.prices[id]
  eff.custom = eff.custom.filter(c => c.id !== id)
  eff.picked = eff.picked.filter(x => x !== id)
  delete eff.prices[id]
  saveEff()
  return item ? { item, price } : null
}

/** 지운 직접 만든 아이템을 되살린다 */
export function restoreCustom(x: { item: ShopItem; price?: number }, picked: boolean) {
  if (!eff.custom.some(c => c.id === x.item.id)) eff.custom.push(x.item)
  if (x.price) eff.prices[x.item.id] = x.price
  if (picked && !eff.picked.includes(x.item.id)) eff.picked.push(x.item.id)
  saveEff()
}

export const sellables = (): Sellable[] => shopItems().map(x => ({ ...x, price: eff.prices[x.id] ?? 0 }))

/** 크레딧샵 물건(기본 + 직접 추가)과 넣어 둔 경매장 가격 */
export const creditItems = (): CreditItem[] =>
  [...SHOP.credit, ...eff.creditCustom].map(x => ({ ...x, price: eff.creditPrices[x.id] ?? 0 }))

/** 한 번에 큰 금액을 채우는 아이템. 판매 횟수가 확 준다. 사용 기간은 따지지 않는다(원더베리 11개도 작에 많이 쓴다) */
export const isBig = (x: ShopItem) => x.cash >= 40_000

/** 지금 13주 합계로 이 금액을 결제하면 오를 등급 */
export function tierAfter(d: State, amount: number): TierKey | null {
  const sum = d.weeks.reduce((a, w) => a + w.amount, 0) + d.carry + amount
  let t: TierKey | null = null
  for (const x of d.tiers) if (sum >= x.th) t = x.key
  return t
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
  /** 크레딧을 쓸 때 그 조건. 안 쓰면 null */
  credit: { balance: number; items: CreditItem[]; keepRest: boolean } | null
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

export function computeEff(d: State, plan: PlanResult | null): EffOut | null {
  const pw = eff.usePlan ? planWeeks(d, plan) : null
  const mode = pw ? 'plan' : 'amount'
  const weeks = pw ?? (eff.amount > 0 ? [{ start: d.thisWeek, amount: eff.amount, tier: tierAfter(d, eff.amount), month: thisMonth() }] : null)
  if (!weeks || !eff.um) return null
  // 금액 직접일 때는 수수료를 사용자가 정한다. 안 건드렸으면 오를 등급으로 먼저 채워 둔다
  const fee = mode === 'amount' ? (eff.feeOverride ?? (weeks[0].tier && weeks[0].tier !== 'bronze' ? 0.03 : 0.05)) : eff.feeOverride
  const all = sellables()
  const credit = eff.creditOn ? { balance: eff.creditBalance, items: creditItems(), keepRest: eff.creditKeep } : null
  const run = (items: Sellable[]) => planAll({
    weeks, balance: eff.balance, cards: eff.cards, methods: eff.methods.map(m => ({ key: m.id, name: m.name, rate: plainRateOf(m.mode, m.val), monthly: m.monthly, on: m.on })), leftNow: eff.leftNow, thisMonth: thisMonth(),
    barcode: SHOP.barcode, barcodeOn: eff.barcodeOn, barcodeWant: eff.barcodeWant, weekBarcode: eff.weekBarcode,
    um: eff.um, mk: eff.mk, items, fee, exact: mode === 'plan', credit,
  })
  const res = run(all)
  if (!res) return null

  // 판매 횟수별 전체 손실. 주마다 같은 상한을 건다
  const { curve, lo, hi, best, knee: kp, count: cp } = routesOf(res, eff.salesN, credit, eff.sellCost)

  const alt = (items: Sellable[]): Summary | null => {
    if (!items.some(x => x.price > 0) && !eff.mk) return null
    const r = run(items)
    if (!r) return null
    const p = pickAt(r, null, credit)
    return { loss: p.loss, sales: p.sales }
  }
  const priced = all.filter(x => x.price > 0)
  const wait = priced.filter(x => !x.days), fast = priced.filter(isShort), big = priced.filter(isBig)
  return {
    mode, target: weeks.reduce((a, w) => a + w.amount, 0), weeks: res, curve, lo, hi, credit,
    best, knee: kp, count: cp, sel: eff.want === 'knee' ? kp : eff.want === 'count' ? cp : best,
    pgOnly: priced.some(x => x.id === PG_ID) ? alt(priced.filter(x => x.id === PG_ID)) : null,
    mkOnly: eff.mk > 0 ? alt([]) : null,
    waitOnly: wait.length ? alt(wait) : null,
    fastOnly: fast.length ? alt(fast) : null,
    bigOnly: big.length ? alt(big) : null,
  }
}
