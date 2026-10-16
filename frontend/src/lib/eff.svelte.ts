/**
 * 효율표 입력값. 이 브라우저(또는 exe)에만 저장한다.
 *
 * 시세와 상품권 할인은 사람마다·그날그날 다르고 서버에 올릴 이유가 없다.
 * 나중에 계정으로 옮길 일이 생기면 이 한 덩어리만 올리면 된다.
 */
import shop from './core/cashshop.json'
import { CREDIT_RATE, MONTHLY, PG_ID, rateOf, creditWonPer, feeOf, fund, isShort, kneeFit, perWeek, pickAt, planAll, plainRateOf, routesOf, type BarcodeEvent, type PlainMode, type CreditItem, type Route, type RoutePick as Pick, type Sellable, type ShopItem, type WeekResult } from './core/efficiency'
export type { RoutePick as Pick, WeekPick } from './core/efficiency'
import type { PlanResult, State, TierKey } from './types'
import { groupRows, settle, type Prices, type Use } from './core/ledger'
import { addDays, todayKst, weekStart, type Row } from './core/mvp'

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

/** 직접 짜기 조합: 아이템 id → 한 주에 살 개수(null이면 개수는 알아서). 조합에 없는 아이템은 안 쓴다 */
export type Combo = Record<string, number | null>

/** 실제로 쓰려고 사는 아이템. 이름과 캐시 가격(한 개), 개수(없으면 1) */
export interface BuyItem { id: string; name: string; cash: number; n?: number }

/** 충전 한 번: 결제수단(상품권 키·직접 추가한 결제수단 id·일반 충전), 할인율(%), 충전한 캐시, 상품권 한도를 깎는 달 */
export interface Charge { id: string; key: string; name: string; off: number; cash: number; month: string }

/** 이번 주(목요일 시작) */
const weekNow = () => weekStart(todayKst())

/** 지난 주 결산을 그 주 시세로 다시 세려고 주마다 떠 두는 값. planned: 그 주에 효율표가 짠 루트(남은 금액 기준) */
export interface Snap {
  at: number
  prices: Prices
  fund: { cards: Saved['cards']; methods: PayMethod[]; barcodeOn: boolean; barcodeWant: number | null; plainOn: boolean; nexonLast: boolean }
  planned?: { label: string; what: string; pay: number; cost: number; back: number; loss: number }
}

/** 계산 결과 재사용(입력 → 결과). 최근 것만 둔다 */
/** 선물식 단위 고르기(캐시) */
export const GIFT_UNITS = [10_000, 30_000, 50_000, 100_000]

/** 계산에 넘길 선물식. 비율이 없으면 안 쓴다 */
export const giftOf = (rate = eff.gift) => rate > 0 ? { rate: rate / 10_000, unit: eff.giftUnit, min: Math.max(eff.giftMin, eff.giftUnit) } : null

/**
 * 단위를 바꾼다. 최소 금액은 비었거나 단위 기본값(전에 고른 단위 금액) 그대로일 때만 새 단위로 맞춘다.
 * 직접 적어 둔 최소 금액은 건드리지 않는다
 */
export function setGiftUnit(u: number) {
  if (!eff.giftMin || eff.giftMin === eff.giftUnit) eff.giftMin = u
  eff.giftUnit = u
  saveEff()
}

const runs = new Map<string, WeekResult[] | null>()

/** 최저가 · 최적화 · 횟수 정하기 · 직접 짜기 */
export type Want = 'best' | 'knee' | 'count' | 'custom'
/**
 * 주마다 바꿔 끼우는 루트 종류(2026-10-12 사용자: 최적화가 고른 것과 회수율이 비슷한 다른 루트로 그 주만 바꿔 보고 싶다).
 * 개수가 아니라 종류로 저장한다. 목표 계획이 바뀌어 그 주 금액이 달라져도 그 방식대로 다시 짠다.
 * best: 아이템까지 다 쓰는 최저가 조합 · gift: 선물식만 · mk: 메소마켓만 · item:아이디: 그 아이템 위주(끝자리는 메소마켓) · sales:n: 판매 n회까지
 */
export type RouteKind = 'best' | 'gift' | 'mk' | `item:${string}` | `sales:${number}`

/** 루트 설정 한 벌. 달성·유지를 따로 정하면 두 벌을 쓴다 */
/** minRate: 최적화의 회수율 하한(%). 0이면 없음 */
export interface RouteSet { want: Want; salesN: number; sellCost: number; minRate?: number; combo: Combo }

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
  /**
   * 일반 충전(1:1)을 쓸지. 켜면 끝자리는 일반 충전으로 딱 맞추고, 남기는 게 이득일 때만 할인 수단으로 한 권 더 산다.
   * 끄면 끝자리도 늘 할인 수단으로 한 권 더 사서 남는 캐시를 다음에 쓴다(할인 한도가 없을 때만 일반 충전)
   */
  plainOn: boolean
  /** 예전 넥슨카드 '그 달 마지막 20만원에만 쓰기'. 이번 주 충전을 사용자가 적게 되며 쓰지 않는다(2026-10-16 사용자) */
  nexonLast: boolean
  leftNow: Record<string, number>
  leftMonth: string
  barcodeOn: boolean
  barcodeWant: number | null
  weekBarcode: Record<string, number>
  um: number
  /** 메소를 현금으로 팔 때 붙는 수수료(%). 엄 시세에서 이만큼 빼고 받는다 */
  umFee: number
  mk: number
  /**
   * 선물식: 1만 캐시어치를 선물해 주고 받는 현금(원). 0이면 안 쓴다.
   * 할인 충전한 캐시로 남에게 캐시템(메이플포인트 상품)을 선물하고 돈을 바로 받는다. 메소를 거치지 않는다(2026-10-05 건의)
   */
  gift: number
  /** 선물식을 사고파는 단위(캐시: 1만·3만·5만·10만)와 한 번에 거래하는 최소 금액(캐시) */
  giftUnit: number
  giftMin: number
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
  /**
   * MVP작이 아니라 실제로 쓰려고 사는 아이템(모멘텀패스 등). 결제액에는 들지만 팔지 않으니 회수가 없다.
   * 첫 결제 주부터 차례로 빼고 남은 금액으로만 MVP작 조합을 짠다(2026-10-04 건의: 60 충전해 모멘텀패스 사고 나머지로 MVP작)
   */
  buys: BuyItem[]
  /** 구매용 아이템을 넣은 주. 주가 바뀌면 구매용은 비운다(그 주에 산 것은 구매내역 결산에 남는다, 2026-10-16 사용자) */
  buysWeek: string
  /** 구매내역 한 건(구매번호) → 용도. 사용자가 고친 것만 */
  tags: Record<string, Use>
  /** 주 시작일 → 그 주 시세 */
  snaps: Record<string, Snap>
  /** 모르는 서버 번호에 사용자가 붙인 이름 */
  serverNames: Record<string, string>
  /**
   * 주 시작일 → 그 주에 실제로 한 충전. 추천만으로는 어떻게 충전했는지 알 수 없어 사용자가 적는다(2026-10-16 사용자).
   * 상품권 남은 한도와 캐시 잔액은 이 기록으로 센다
   */
  charges: Record<string, Charge[]>
  /**
   * 상품권별로 이번 달(leftMonth)에 충전 기록 밖에서 이미 쓴 금액. 기록을 시작하기 전에 한도를 써 버린 경우(2026-10-16 사용자:
   * 컬쳐랜드·도서문화상품권을 이미 끝까지 씀). 달이 바뀌면 비운다
   */
  outside: Record<string, number>
  /** '주 시작일|결산 줄' → 메소마켓에서 실제로 산 메소(억). 없으면 그 메포로 살 수 있는 최대 */
  mkMeso: Record<string, number>
  /** 주 시작일 → 그 주에 크레딧샵에서 산 것(사용자가 적는다) */
  creditBuys: Record<string, CreditBuy[]>
  /** 크레딧 흐름을 잇기 시작한 주. creditBalance는 그 주를 시작할 때 크레딧이다(업데이트한 주부터) */
  creditFrom: string
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
  /** 최적화 루트의 회수율 하한(%). 판매를 줄이다 회수율이 이 아래로 떨어지면 멈춘다. 0이면 없음 */
  minRate: number
  /** 직접 짜기: 아이템 id → 한 주에 살 개수(null이면 알아서) */
  combo: Combo
  /** 아이템 id → 한 주에 팔 수 있는(그래서 살) 최대 개수. 회전율. 없으면 제한 없음 */
  caps: Record<string, number>
  /** 목표 계획에서 유지를 켰을 때, 달성과 유지를 따로 정할지. 위 want·salesN·sellCost·combo가 달성용이 된다 */
  split: boolean
  keep: RouteSet
  /** 주 시작일 → 그 주에만 바꿔 끼운 루트 종류 */
  weekRoute: Record<string, RouteKind>
}

function fresh(): Saved {
  return {
    usePlan: true, amount: 0, balance: 0,
    cards: CARDS.map(c => ({ ...c, disc: 0, on: true })), methods: [], plainOn: true, nexonLast: true,
    leftNow: Object.fromEntries(CARDS.map(c => [c.key, MONTHLY])), leftMonth: thisMonth(),
    barcodeOn: true, barcodeWant: null, weekBarcode: {},
    um: 0, umFee: 5, mk: 0, gift: 0, giftUnit: 10_000, giftMin: 10_000, at: {}, prices: {}, feeOverride: null, want: 'best', salesN: 10, pgView: 'ratio', picked: [...DEFAULT_PICK], listNews: false, custom: [], buys: [], buysWeek: weekNow(), tags: {}, snaps: {}, serverNames: {}, charges: {}, outside: {}, mkMeso: {}, creditBuys: {}, creditFrom: weekNow(), hideLoss: false,
    creditOn: true, creditBalance: 0, creditPrices: { prime: 6, primeadd: 16 }, creditCustom: [], creditKeep: false, sellCost: 2000, minRate: 0,
    combo: {}, caps: {}, split: false, keep: { want: 'count', salesN: 5, sellCost: 2000, combo: {} },
    weekRoute: {},
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
    // 판매 단위가 생기기 전에 추가한 결제수단은 5만원 단위로 본다(사용자 지정). 수정에서 바꿀 수 있다
    s.methods = s.methods.map(m => (m.unit ? m : { ...m, unit: 50_000 }))
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
    // 예전 '이번 달 남은 한도'는 기록 밖에서 이미 쓴 금액으로 옮긴다
    if (!got.outside && s.leftMonth === thisMonth())
      s.outside = Object.fromEntries(CARDS.map(c => [c.key, Math.max(0, MONTHLY - (s.leftNow[c.key] ?? MONTHLY))]).filter(([, v]) => v))
    if (s.leftMonth !== thisMonth()) { s.leftNow = base.leftNow; s.leftMonth = base.leftMonth; s.outside = {} }
    // 구매용은 그 주에만 쓴다
    if (s.buysWeek !== base.buysWeek) { s.buys = []; s.buysWeek = base.buysWeek }
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

/** 엄 판매 수수료를 뺀, 1억 메소를 팔아 실제로 받는 돈 */
export const umNet = () => eff.um * (1 - (eff.umFee ?? 0) / 100)

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
/** unit: 판매 단위(한 권 금액). 100이면 끝자리까지 아무 금액 */
export interface PayMethod { id: string; name: string; mode: PlainMode; val: number; monthly: number | null; on: boolean; unit: number }

export function addMethod(x: Omit<PayMethod, 'id' | 'on'>) {
  eff.methods.push({ ...x, id: `pm${Date.now().toString(36)}`, on: true })
  saveEff()
}

export function updateMethod(id: string, x: Omit<PayMethod, 'id' | 'on'>) {
  const m = eff.methods.find(m => m.id === id)
  if (!m) return
  // 달 한도를 바꾸면 이번 달 남은 한도도 새로 센다
  if (m.monthly !== x.monthly) delete eff.leftNow[id]
  Object.assign(m, x)
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

// ---- 실제로 쓰려고 사는 아이템(구매용) ----

export function addBuy(x: Omit<BuyItem, 'id'>) {
  eff.buysWeek = weekNow()
  eff.buys.push({ ...x, id: `b${Date.now().toString(36)}` })
  saveEff()
}

export function updateBuy(id: string, x: Omit<BuyItem, 'id'>) {
  const b = eff.buys.find(b => b.id === id)
  if (!b) return
  Object.assign(b, x)
  saveEff()
}

export function removeBuy(id: string) {
  eff.buys = eff.buys.filter(b => b.id !== id)
  saveEff()
}

/** 구매용 아이템 캐시 합계 */
export const buyTotal = () => eff.buys.reduce((a, b) => a + b.cash * (b.n ?? 1), 0)

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

export const sellables = (): Sellable[] => shopItems().map(x => ({ ...x, price: eff.prices[x.id] ?? 0, ...(eff.caps[x.id] ? { cap: eff.caps[x.id] } : {}) }))

/** 달성(또는 같이 설정) 루트 설정 */
export const reachSet = (): RouteSet => ({ want: eff.want, salesN: eff.salesN, sellCost: eff.sellCost, minRate: eff.minRate, combo: eff.combo })

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
  /** 결제 중 구매용(실제로 쓸 아이템)으로 뺀 캐시. 효율은 target − use 기준이다 */
  use: number
  /** 구매용이 결제액 전체보다 많아 넣지 못한 금액 */
  useOver: number
  weeks: WeekResult[]
  /** curve[n] = 주마다 판매 n회까지로 할 때 전체 잃는 돈 (n은 lo..hi) */
  curve: number[]
  lo: number
  hi: number
  best: Pick
  knee: Pick
  count: Pick
  /** 지금 고른 루트. 달성·유지를 따로 정했으면 주마다 그 구간 설정대로 고른 것 */
  sel: Pick
  /** 직접 짜기(같이 설정일 때 루트 카드용). 조합이 비었으면 null */
  custom: Pick | null
  /** 유지를 켠 계획이면 유지 구간의 주 시작일 */
  keepStarts: Set<string> | null
  /** 크레딧을 쓸 때 그 조건. 안 쓰면 null */
  credit: { balance: number; items: CreditItem[]; keepRest: boolean } | null
  pgOnly: Summary | null
  mkOnly: Summary | null
  giftOnly: Summary | null
  /** 성향별: 무기한 아이템만, 7일 아이템만, 비싼 아이템만 */
  waitOnly: Summary | null
  fastOnly: Summary | null
  bigOnly: Summary | null
  /** 그 주(순서)에 바꿔 끼울 만한 루트 후보. 화면에서 보고 있는 주만 그때 센다 */
  alts: (i: number) => RouteAlt[]
  /** 그 주 지금 루트가 최저가 조합과 같은지(그러면 최저가는 후보에 따로 안 나온다) */
  isBest: (i: number) => boolean
  /** 주마다 실제로 쓴 루트 종류(바꿔 끼운 것). 안 바꾼 주는 null */
  kinds: (RouteKind | null)[]
  labelOf: (k: RouteKind) => string
}

/**
 * 바꿔 끼울 루트 후보 하나. 금액은 그 주만 본 어림값이다(크레딧은 쌓이는 만큼 값으로 친다. 실제로 큐브를 사서 파는 건 주를 이어 센다).
 * rate: 크레딧 값까지 친 회수율, money: 돈만 친 회수율. diff: 지금 그 주 루트보다 더 나가는 돈(음수면 덜).
 */
export interface RouteAlt {
  kind: RouteKind
  label: string
  /** '선물식 20만 · 메소마켓 3천'처럼 그 주에 하는 일 */
  what: string
  route: Route
  rate: number
  money: number
  diff: number
  sales: number
  current: boolean
}

/**
 * 유지 구간의 주. 달성 계획은 목표 주 뒤의 주다.
 * 이미 목표 등급 이상인 계획(유지·낮춰서 유지)은 이번 주부터 전부 유지다. 계획표는 이번 주를 목표 주로 두어(keep=false)
 * 이번 주만 달성 설정을 탔다(2026-10-15 사용자: 블랙인데 이번 주가 '달성 1주'로 최적화 하한에 걸려 플가 33개)
 */
export function keepStartsOf(plan: PlanResult | null): Set<string> | null {
  if (!plan?.keep) return null
  return new Set(plan.timeline.filter(w => w.keep || plan.mode !== 'reach').map(w => w.start))
}

/** 효율표에서 보는 주. ''면 이번 주 */
export const effWeek = $state({ sel: '' })

/**
 * 목표 계획에서 이번 주에 더 낼 금액(목표 − 이미 낸 금액). 다 채웠으면 null(이번 주에 산 것은 결산에서 본다).
 * 다음 주를 고르면 다음 주 계획 금액(미리 보기). 한 주씩만 본다(2026-10-16 사용자: 여러 주를 다 보여 주면 한눈에 안 들어온다)
 */
export function planWeeks(d: State, plan: PlanResult | null) {
  const next = !!effWeek.sel && effWeek.sel > d.thisWeek
  const w = plan && !plan.error ? plan.timeline[next ? 1 : 0] : null
  if (!w || w.amount <= 0) return null
  return [{ start: w.start, amount: w.amount, tier: w.tier as TierKey | null, month: next ? w.start.slice(0, 7) : thisMonth() }]
}

/** '플가 9개 · 메소마켓 14.1만'처럼 루트에서 하는 일 */
export const whatOf = (r: Route) => [
  ...r.lines.map(l => `${l.item.set > 1 || l.item.bundle ? `${l.item.name}(${l.item.set}개)` : l.item.name} ${l.n}${l.item.set > 1 ? '세트' : '개'}`),
  ...(r.gift ? [`선물식 ${(r.gift / 10_000).toLocaleString('ko-KR')}만`] : []),
  ...(r.market ? [`메소마켓 ${r.market >= 10_000 ? `${(r.market / 10_000).toLocaleString('ko-KR')}만` : `${(r.market / 1_000).toLocaleString('ko-KR')}천`}`] : []),
].join(' · ')

export function computeEff(d: State, plan: PlanResult | null, rows: Row[] = []): EffOut | null {
  // 충전 기록이 있으면 캐시 잔액은 기록으로 센다(남은 캐시는 충전한 값 그대로)
  const flow = cashFlow(rows, d.thisWeek)
  const bal = flow ? { cash: flow.left, won: flow.leftWon } : { cash: eff.balance, won: eff.balance }
  const pw = eff.usePlan ? planWeeks(d, plan) : null
  // 계획을 따르는데 이번 주 목표를 다 채웠으면 더 낼 돈이 없다
  if (eff.usePlan && plan && !plan.error && !pw) return null
  const mode = pw ? 'plan' : 'amount'
  const raw = pw ?? (eff.amount > 0 ? [{ start: d.thisWeek, amount: eff.amount, tier: tierAfter(d, eff.amount), month: thisMonth() }] : null)
  if (!raw || !eff.um) return null
  // 구매용(실제로 쓸 아이템)은 첫 결제 주부터 차례로 뺀다. 어느 주에 살지는 적지 않는다(이름·금액만, 2026-10-04 건의)
  let left = buyTotal()
  const weeks = raw.map(w => { const use = Math.min(left, w.amount); left -= use; return { ...w, use } })
  const use = weeks.reduce((a, w) => a + w.use, 0)
  // 금액 직접일 때는 수수료를 사용자가 정한다. 안 건드렸으면 오를 등급으로 먼저 채워 둔다
  const fee = mode === 'amount' ? (eff.feeOverride ?? (weeks[0].tier && weeks[0].tier !== 'bronze' ? 0.03 : 0.05)) : eff.feeOverride
  const all = sellables()
  // 크레딧은 흐름으로 센 지금 남은 크레딧(쌓인 것 − 적어 둔 산 것)
  const credit = eff.creditOn ? { balance: Math.max(0, creditFlow(rows, d.thisWeek).left), items: creditItems(), keepRest: eff.creditKeep } : null
  // 같은 입력이면 앞서 계산한 것을 다시 쓴다. 루트·횟수·스위치만 바꿀 때는 조합을 다시 찾을 필요가 없다
  // sink: 메소마켓·선물식 중 하나만 견줄 때(전부 메소마켓 / 전부 선물식)
  const run = (items: Sellable[], fixedFor?: (i: number) => Combo | undefined, bestOnly = false,
               sink: { mk: number; gift: number } = { mk: eff.mk, gift: eff.gift }) => {
    const input = {
      weeks, balance: bal.cash, balanceWon: bal.won, cards: $state.snapshot(eff.cards), methods: eff.methods.map(m => ({ key: m.id, name: m.name, rate: plainRateOf(m.mode, m.val), monthly: null, on: m.on, unit: m.unit })),
      leftNow: leftNowCalc(), thisMonth: thisMonth(),
      barcode: SHOP.barcode, barcodeOn: eff.barcodeOn, barcodeWant: eff.barcodeWant, weekBarcode: $state.snapshot(eff.weekBarcode),
      um: umNet(), mk: sink.mk, gift: giftOf(sink.gift), items, fee, exact: mode === 'plan', credit, bestOnly, plainOn: eff.plainOn, nexonLast: false,
    }
    const combos = fixedFor ? weeks.map((_, i) => fixedFor(i) ?? null) : null
    const key = JSON.stringify([input, combos])
    if (runs.has(key)) { const v = runs.get(key)!; runs.delete(key); runs.set(key, v); return v }
    const v = planAll({ ...input, fixedFor: combos ? i => combos[i] ?? undefined : undefined })
    runs.set(key, v)
    if (runs.size > 24) runs.delete(runs.keys().next().value!)
    return v
  }
  const res = run(all)
  if (!res) return null

  const keepStarts = mode === 'plan' ? keepStartsOf(plan) : null
  // 회수율 하한은 화면처럼 달성·유지 구간마다 따로 확인한다
  const idxOf = (keep: boolean) => weeks.flatMap((w, i) => ((keepStarts?.has(w.start) ?? false) === keep ? [i] : []))
  const groups = keepStarts ? [idxOf(false), idxOf(true)].filter(g => g.length) : undefined

  // 판매 횟수별 전체 손실. 주마다 같은 상한을 건다
  const { curve, lo, hi, best, knee: kp, count: cp } = routesOf(res, eff.salesN, credit, eff.sellCost, eff.minRate, groups)
  const hasCombo = (c: Combo) => Object.keys(c).length > 0
  // 주마다 그 주 구간의 설정. 따로 정하지 않았으면 모두 한 벌
  const reach = reachSet()
  const setOf = (i: number): RouteSet => eff.split && keepStarts?.has(weeks[i].start) ? eff.keep : reach
  /**
   * 설정대로 주마다 고른 루트. 직접 짜기인 주는 그 조합으로 가장 싼 것 하나만 다시 푼다(가볍게).
   * 나머지 주는 기본 계산을 그대로 쓴다
   */
  const compose = (sets: RouteSet[]) => {
    const custom = sets.map(s => s.want === 'custom' && hasCombo(s.combo))
    let r = res
    if (custom.some(Boolean)) {
      const c = run(all, i => (custom[i] ? sets[i].combo : undefined), true)
      if (!c) return null
      r = res.map((w, i) => (custom[i] ? c[i] : w))
    }
    const hiN = Math.max(1, ...r.map(w => w.solved.best.sales))
    const best0 = perWeek(r, 0)
    const base = sets.map((s, i) => s.want === 'count' ? (s.salesN >= hiN ? null : s.salesN) : custom[i] ? null : best0[i])
    // 최적화인 주는 구간(설정 한 벌)마다 묶어 고른다. 하한은 구간 회수율로 확인한다
    const phases = [...new Set(sets.filter(s => s.want === 'knee'))].map(s => ({
      idx: sets.flatMap((x, i) => (x === s ? [i] : [])), perSale: s.sellCost, minRate: s.minRate ?? 0,
    }))
    return pickAt(r, phases.length ? kneeFit(r, base, phases, credit) : base, credit)
  }
  const sets = weeks.map((_, i) => setOf(i))
  const linked = !eff.split || !keepStarts
  const simple = linked && eff.want !== 'custom'
  const base = simple ? (eff.want === 'knee' ? kp : eff.want === 'count' ? cp : best) : compose(sets) ?? best

  // ---- 주마다 바꿔 끼우는 루트 ----
  const priced0 = all.filter(x => x.price > 0)
  const onlyMk0 = { mk: eff.mk, gift: 0 }
  /** 그 종류로 모든 주를 푼 결과(주마다 그 종류의 가장 싼 조합이 solved.best). 판매 횟수 종류는 기본 계산을 쓴다 */
  const kindRes = (k: RouteKind): WeekResult[] | null =>
    k === 'best' || k.startsWith('sales:') ? res
    : k === 'gift' ? (eff.gift > 0 ? run([], undefined, true, { mk: 0, gift: eff.gift }) : null)
    : k === 'mk' ? (eff.mk > 0 ? run([], undefined, true, onlyMk0) : null)
    : itemRes(k.slice(5))
  /** 그 아이템을 그 주 금액으로 살 수 있는 만큼 꼭 사고 끝자리만 메소마켓. 쓸 수 있게만 두면 손해인 주에서는 하나도 안 사 지금 루트와 같아졌다 */
  function itemRes(id: string) {
    const x = priced0.find(y => y.id === id)
    if (!x) return null
    return run(priced0.filter(y => y.id === id), i => ({ [id]: Math.max(0, Math.floor((weeks[i].amount - weeks[i].use) / x.cash)) }), true, onlyMk0)
  }
  /** i번째 주를 그 종류로 했을 때의 루트. 안 되면 null */
  const routeOf = (k: RouteKind, i: number): Route | null => {
    const r = kindRes(k)?.[i]
    if (!r) return null
    if (!k.startsWith('sales:')) return r.solved.best
    const n = Number(k.slice(6))
    return Number.isFinite(r.solved.lossAt[n]) ? r.solved.routeAt(n) : null
  }
  const kinds = weeks.map(w => eff.weekRoute[w.start] ?? null)
  // 바꿔 끼운 주는 그 루트를, 나머지 주는 고른 루트를 그대로 넣고 크레딧은 주를 이어 다시 센다
  const swapped = kinds.map((k, i) => (k ? routeOf(k, i) : null))
  const sel = swapped.some(Boolean)
    ? pickAt(base.weeks.map((p, i) => ({ ...p.w, solved: { ...p.w.solved, best: swapped[i] ?? p.route } })), null, credit)
    : base

  const est = (r: Route) => r.cost - r.back - r.creditEst
  const rateOf = (r: Route) => (r.cost ? (r.back + r.creditEst) / r.cost : 0)
  const itemName = (id: string) => all.find(x => x.id === id)?.name ?? id
  const labelOf = (k: RouteKind) => k === 'best' ? '최저가' : k === 'gift' ? '선물식' : k === 'mk' ? '메소마켓'
    : k === `item:${PG_ID}` ? '전부 플가' : k.startsWith('item:') ? `${itemName(k.slice(5))} 위주` : `판매 ${k.slice(6)}회로 줄이기`
  const same = (a: Route, b: Route) => a.market === b.market && a.gift === b.gift && a.lines.length === b.lines.length
    && a.lines.every(l => b.lines.some(m => m.item.id === l.item.id && m.n === l.n))
  /** 비슷하다고 볼 회수율 차이(크레딧 포함). 없으면 가장 가까운 둘. 아이템은 살 수 있는 만큼 꼭 사는 루트라 이름도 '위주'다 */
  const NEAR = 0.02
  const alts = (i: number): RouteAlt[] => {
    const now = sel.weeks[i]?.route
    if (!now) return []
    const kindsTry: RouteKind[] = ['best', ...(eff.gift > 0 ? ['gift' as const] : []), ...(eff.mk > 0 ? ['mk' as const] : []),
      ...priced0.map(x => `item:${x.id}` as const),
      ...(now.sales > 1 ? [`sales:${now.sales - 1}` as const] : [])]
    const out: RouteAlt[] = []
    for (const k of kindsTry) {
      const r = routeOf(k, i)
      if (!r || out.some(a => same(a.route, r))) continue
      out.push({ kind: k, label: labelOf(k), what: whatOf(r), route: r, rate: rateOf(r), money: r.cost ? r.back / r.cost : 0,
        diff: est(r) - est(now), sales: r.sales, current: same(r, now) })
    }
    // 최저가 조합과 전부 플가는 회수율과 상관없이 늘 보인다(기준이 되는 두 루트, 2026-10-12 사용자). 나머지는 회수율이 비슷한 것만
    const fixedKinds: RouteKind[] = ['best', `item:${PG_ID}`]
    const others = out.filter(a => !a.current).sort((a, b) => a.diff - b.diff)
    const always = fixedKinds.flatMap(k => others.filter(a => a.kind === k))
    const rest = others.filter(a => !fixedKinds.includes(a.kind))
    const near = rest.filter(a => Math.abs(a.rate - rateOf(now)) <= NEAR)
    return [...always, ...(near.length ? near : rest.slice(0, 2)).slice(0, 4)]
  }
  const custom = hasCombo(eff.combo) ? (linked && eff.want === 'custom' ? base : compose(weeks.map(() => ({ ...reachSet(), want: 'custom' as const })))) : null
  const alt = (items: Sellable[], sink = { mk: eff.mk, gift: eff.gift }): Summary | null => {
    if (!items.some(x => x.price > 0) && !sink.mk && !sink.gift) return null
    const r = run(items, undefined, true, sink)
    if (!r) return null
    const p = pickAt(r, null, credit)
    return { loss: p.loss, sales: p.sales }
  }
  const priced = all.filter(x => x.price > 0)
  const onlyMk = { mk: eff.mk, gift: 0 }
  const wait = priced.filter(x => !x.days), fast = priced.filter(isShort), big = priced.filter(isBig)
  return {
    mode, target: weeks.reduce((a, w) => a + w.amount, 0), use, useOver: left, weeks: res, curve, lo, hi, credit,
    best, knee: kp, count: cp, sel, custom, keepStarts, alts, kinds, labelOf,
    isBest: (i: number) => { const b = routeOf('best', i), n = sel.weeks[i]?.route; return !!b && !!n && same(b, n) },
    // 아이템 하나로만 하는 비교는 끝자리만 메소마켓으로 채운다. 선물식까지 넣으면 선물식이 나을 때 아이템을 안 사 '플가만'이 '전부 선물식'이 된다
    pgOnly: priced.some(x => x.id === PG_ID) ? alt(priced.filter(x => x.id === PG_ID), onlyMk) : null,
    mkOnly: eff.mk > 0 ? alt([], { mk: eff.mk, gift: 0 }) : null,
    giftOnly: eff.gift > 0 ? alt([], { mk: 0, gift: eff.gift }) : null,
    waitOnly: wait.length ? alt(wait, onlyMk) : null,
    fastOnly: fast.length ? alt(fast, onlyMk) : null,
    bigOnly: big.length ? alt(big, onlyMk) : null,
  }
}

/** 그 주에만 루트를 바꿔 끼운다. 'reset'이면 되돌린다 */
export function setWeekRoute(start: string, k: RouteKind | null) {
  if (k) eff.weekRoute[start] = k
  else delete eff.weekRoute[start]
  saveEff()
}

// ---- 주별 결산 ----

/** 지금 시세와 결제수단. fee: 지금 등급의 경매장 수수료 */
export function snapNow(fee: number, planned?: Snap['planned']): Snap {
  const um = umNet()
  const g = giftOf()
  return {
    at: Date.now(),
    prices: {
      items: sellables().filter(x => x.price > 0).map(x => ({ id: x.id, name: x.name, set: x.set, cash: x.cash, ...(x.bundle ? { bundle: true } : {}), price: x.price })),
      um, mk: eff.mk, giftRate: g?.rate ?? 0, fee,
      creditPer: eff.creditOn ? creditWonPer(creditItems(), fee, um) : 0,
    },
    fund: { cards: $state.snapshot(eff.cards), methods: $state.snapshot(eff.methods), barcodeOn: eff.barcodeOn, barcodeWant: eff.barcodeWant, plainOn: eff.plainOn, nexonLast: eff.nexonLast },
    ...(planned ? { planned } : {}),
  }
}

/** 이번 주 시세를 떠 둔다. 바뀐 게 있을 때만 저장한다. 26주 넘은 것은 지운다 */
export function keepSnap(fee: number, planned?: Snap['planned']) {
  const w = weekNow(), old = eff.snaps[w]
  const s = snapNow(fee, planned ?? old?.planned)
  if (old && JSON.stringify({ ...old, at: 0 }) === JSON.stringify({ ...s, at: 0 })) return
  eff.snaps[w] = s
  const cut = addDays(w, -7 * 26)
  for (const k of Object.keys(eff.snaps)) if (k < cut) delete eff.snaps[k]
  saveEff()
}

/** 그 주 결제 전부를 그 주 결제수단으로 충전했다고 보고 든 현금과 내역. 한도는 그 달 처음 한도로 본다(그때 남은 한도는 모른다) */
function fundOf(all: number, none: number, s: Snap, week: string, tier: TierKey | null) {
  if (all <= 0) return null
  const f = s.fund
  const res = planAll({
    weeks: [{ start: week, amount: all, tier, month: week.slice(0, 7), use: none }], balance: 0,
    cards: f.cards, methods: f.methods.map(m => ({ key: m.id, name: m.name, rate: plainRateOf(m.mode, m.val), monthly: null, on: m.on, unit: m.unit })),
    leftNow: week.slice(0, 7) === thisMonth() ? leftNowCalc(week) : {}, thisMonth: week.slice(0, 7), barcode: SHOP.barcode, barcodeOn: f.barcodeOn, barcodeWant: f.barcodeWant, weekBarcode: {},
    um: s.prices.um || 1, mk: s.prices.mk || 1, gift: null, items: [], fee: s.prices.fee, exact: true, bestOnly: true, plainOn: f.plainOn, nexonLast: false,
  })
  return res ? fund(Math.ceil(all / 100) * 100, res[0].ctx) : null
}

/** 그 주 구매내역 */
export const rowsOf = (rows: Row[], week: string) => rows.filter(r => weekStart(r.date) === week)

/** 구매내역이 있는 주(새 주부터) */
export const weeksWithRows = (rows: Row[]) => [...new Set(rows.map(r => weekStart(r.date)))].sort().reverse()

/** 한 주 결산. 그 주에 떠 둔 시세가 없으면 지금 시세로 센다(own=false) */
export function ledgerOf(rows: Row[], week: string, fee: number, tier: TierKey | null) {
  const own = eff.snaps[week]
  const s = own ?? snapNow(fee)
  const lines = groupRows(rowsOf(rows, week), eff.tags, catalog(), s.prices.giftRate > 0)
  const all = lines.reduce((a, l) => a + l.cash, 0), none = lines.filter(l => l.use === 'none').reduce((a, l) => a + l.cash, 0)
  // 충전 기록이 있는 주는 기록대로(먼저 충전한 캐시부터 쓴다). 넥슨쇼핑 쿠폰은 넥슨캐시가 아니라 돈으로 바로 산다
  const flow = cashFlow(rows, weekNow())
  const f = flow?.weeks[week]
  const shop = rowsOf(rows, week).filter(isShop).reduce((a, r) => a + r.price, 0)
  const funding = fundOf(all, none, s, week, tier)
  const cost = f ? { cost: f.usedWon + shop } : funding
  // 충전 방식과 거기 든 현금. 기록이 있으면 그 주에 한 충전, 없으면 계산값(estimated)
  const recs = eff.charges[week] ?? []
  const charges = recs.length
    ? recs.map(c => ({ name: c.name, off: c.off, cash: c.cash, won: c.cash * (1 - c.off / 100) }))
    : (funding?.parts ?? []).filter(q => !q.held && q.cash > 0).map(q => ({ name: q.name, off: Math.round((1 - q.won / q.cash) * 1000) / 10, cash: q.cash, won: q.won }))
  const chargeWon = charges.reduce((a, c) => a + c.won, 0) + shop
  const mk = Object.fromEntries(Object.entries(eff.mkMeso).filter(([k]) => k.startsWith(week + '|')).map(([k, v]) => [k.slice(week.length + 1), v]))
  // 크레딧: 흐름을 잇는 주는 그 주에 적은 산 것을 판 돈만 회수로(실제로 판 주에 센다). 그 전 주는 쌓인 크레딧 × 추정 값
  const tracked = week >= eff.creditFrom
  const cw = tracked ? creditFlow(rows, weekNow()).weeks[week] ?? null : null
  const buys = tracked ? eff.creditBuys[week] ?? [] : []
  const creditSale = tracked ? buys.reduce((a, b) => a + b.n * b.price, 0) * (1 - s.prices.fee) * s.prices.um : undefined
  return { ...settle(lines, s.prices, cost, mk, creditSale), credit: cw, creditBuys: buys, creditTracked: tracked, funding, flow: f ?? null, snap: s, own: !!own, all, charges, chargeWon, estimated: !recs.length, shop }
}

/** 결산에서 그 주 선물식(캐시 1원당 원) · 메소마켓(1억당 메포) · 억당 받은 돈(엄 수수료 뺀 것)을 고친다 */
export function setWeekRates(week: string, patch: Partial<{ giftRate: number; mk: number; um: number }>, fee: number) {
  const s = eff.snaps[week] ?? (eff.snaps[week] = snapNow(fee))
  Object.assign(s.prices, patch)
  saveEff()
}

/** 구매내역 줄의 용도를 바꾼다(묶음 전부) */
export function setUse(keys: string[], u: Use) {
  for (const k of keys) eff.tags[k] = u
  saveEff()
}

/** 서버 번호에 이름을 붙인다. 비우면 지운다 */
export function nameServer(code: string, name: string) {
  if (name.trim()) eff.serverNames[code] = name.trim()
  else delete eff.serverNames[code]
  saveEff()
}

export const feeNow = (tier: TierKey | null) => eff.feeOverride ?? feeOf(tier)

/**
 * 결산에서 그 주 경매장 가격(억)을 넣는다. 그 주에 떠 둔 시세가 없으면 지금 시세를 그 주 것으로 떠 두고 고친다
 */
export function setWeekPrice(week: string, itemId: string, price: number, fee: number) {
  const s = eff.snaps[week] ?? (eff.snaps[week] = snapNow(fee))
  const x = catalog().find(c => c.id === itemId)
  if (!x) return
  s.prices.items = s.prices.items.filter(i => i.id !== itemId)
  if (price > 0) s.prices.items.push({ id: x.id, name: x.name, set: x.set, cash: x.cash, ...(x.bundle ? { bundle: true } : {}), price })
  saveEff()
}

// ---- 충전 기록 ----

/** 일반 충전(1:1) */
export const PLAIN_KEY = 'plain'
const isShop = (r: Row) => !!r.id?.startsWith('shop:')

/** 고를 수 있는 결제수단과 설정의 할인율(%) */
export function payOptions() {
  const pct = (r: number | null) => r == null ? 0 : Math.round((1 - r) * 1000) / 10
  return [
    ...eff.cards.map(c => ({ key: c.key, name: c.name, off: pct(rateOf(c.disc)), limit: true })),
    ...eff.methods.map(m => ({ key: m.id, name: m.name, off: pct(plainRateOf(m.mode, m.val)), limit: false })),
    { key: PLAIN_KEY, name: '일반 충전', off: 0, limit: false },
  ]
}

/** 그 주에 충전을 한 줄 넣는다. 상품권 한도는 이번 주면 이번 달, 지난 주면 그 주가 시작한 달에서 깎는다 */
export function addCharge(week: string, x: Partial<Omit<Charge, 'id'>> = {}) {
  const opts = payOptions()
  const o = opts.find(p => p.key === (x.key ?? opts[0].key)) ?? opts[0]
  const c: Charge = {
    id: `ch${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, key: o.key, name: o.name, off: o.off, cash: 0,
    month: week === weekNow() ? thisMonth() : week.slice(0, 7), ...x,
  }
  if (!eff.charges[week]) eff.charges[week] = []
  eff.charges[week].push(c)
  saveEff()
}

export function updateCharge(week: string, id: string, x: Partial<Charge>) {
  const c = eff.charges[week]?.find(c => c.id === id)
  if (!c) return
  // 결제수단을 바꾸면 할인율은 설정 값으로
  if (x.key && x.key !== c.key) {
    const o = payOptions().find(p => p.key === x.key)
    if (o) Object.assign(c, { key: o.key, name: o.name, off: o.off })
  } else Object.assign(c, x)
  saveEff()
}

export function removeCharge(week: string, id: string) {
  eff.charges[week] = (eff.charges[week] ?? []).filter(c => c.id !== id)
  if (!eff.charges[week].length) delete eff.charges[week]
  saveEff()
}

/** 계산한 충전(결산의 추정값)을 그대로 기록으로 */
export function fillCharges(week: string, parts: { name: string; key?: string; cash: number; won: number; held?: boolean }[]) {
  for (const q of parts) {
    if (q.held || q.cash <= 0) continue
    const key = q.key ?? PLAIN_KEY
    addCharge(week, { key, name: payOptions().find(p => p.key === key)?.name ?? q.name, off: Math.round((1 - q.won / q.cash) * 1000) / 10, cash: q.cash })
  }
}

/** 이번 달에 그 결제수단으로 충전한 캐시 */
export const chargedThisMonth = (key: string, skipWeek?: string) => (eff.outside[key] ?? 0)
  + Object.entries(eff.charges).filter(([w]) => w !== skipWeek).flatMap(([, cs]) => cs)
    .filter(c => c.key === key && c.month === thisMonth()).reduce((a, c) => a + c.cash, 0)

/** 기록 밖에서 이번 달에 이미 쓴 금액 */
export function setOutside(key: string, v: number) {
  if (v > 0) eff.outside[key] = Math.round(v)
  else delete eff.outside[key]
  eff.leftMonth = thisMonth()
  saveEff()
}

/** 상품권 셋은 달마다 20만 고정. 이번 달 남은 한도는 충전 기록으로 센다(나머지 결제수단은 한도 없음, 2026-10-16 사용자) */
export const leftNowCalc = (skipWeek?: string): Record<string, number> =>
  Object.fromEntries(eff.cards.map(c => [c.key, Math.max(0, MONTHLY - chargedThisMonth(c.key, skipWeek))]))

export interface WeekFlow {
  /** 그 주를 시작할 때 가진 캐시 */
  start: number
  charged: number
  chargedWon: number
  /** 그 주 구매내역에 쓴 넥슨캐시와 거기 든 현금(먼저 충전한 것부터) */
  used: number
  usedWon: number
  /** 기록한 충전보다 더 쓴 캐시(1:1로 셌다) */
  short: number
  left: number
  leftWon: number
}

/**
 * 충전 기록을 처음 적은 주부터 이번 주까지 캐시가 어떻게 들고 났는지. 처음 잔액은 설정의 캐시 잔액(그 주 시작 때)이다.
 * 충전하고 남은 캐시는 충전한 값 그대로 다음 주로 넘어가고, 먼저 충전한 것부터 쓴다. 기록이 없으면 null
 */
export function cashFlow(rows: Row[], thisWeek: string) {
  const ws = Object.keys(eff.charges).filter(w => eff.charges[w].length).sort()
  if (!ws.length) return null
  const first = ws[0]
  const q: { cash: number; won: number }[] = eff.balance > 0 ? [{ cash: eff.balance, won: eff.balance }] : []
  const spent = new Map<string, number>()
  for (const r of rows) {
    if (isShop(r)) continue
    const w = weekStart(r.date)
    if (w >= first) spent.set(w, (spent.get(w) ?? 0) + r.price)
  }
  const sum = (k: 'cash' | 'won') => q.reduce((a, x) => a + x[k], 0)
  const weeks: Record<string, WeekFlow> = {}
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    const start = sum('cash')
    const ch = (eff.charges[w] ?? []).filter(c => c.cash > 0)
    for (const c of ch) q.push({ cash: c.cash, won: c.cash * (1 - c.off / 100) })
    const used = spent.get(w) ?? 0
    let need = used, won = 0
    while (need > 0 && q.length) {
      const h = q[0], t = Math.min(need, h.cash), r = h.won / h.cash
      won += t * r; h.cash -= t; h.won -= t * r; need -= t
      if (h.cash <= 0.5) q.shift()
    }
    weeks[w] = {
      start, charged: ch.reduce((a, c) => a + c.cash, 0), chargedWon: ch.reduce((a, c) => a + c.cash * (1 - c.off / 100), 0),
      used, usedWon: won + need, short: need, left: sum('cash'), leftWon: sum('won'),
    }
  }
  const last = weeks[thisWeek] ?? Object.values(weeks).at(-1)
  return { first, weeks, left: last?.left ?? 0, leftWon: last?.leftWon ?? 0 }
}

/** 이번 달 이번 주 전까지 그 결제수단으로 충전한 금액: 기록 밖 + 지난 주 기록 */
export const beforeThisWeek = (key: string) => (eff.outside[key] ?? 0)
  + Object.entries(eff.charges).filter(([w]) => w < weekNow()).flatMap(([, cs]) => cs)
    .filter(c => c.key === key && c.month === thisMonth()).reduce((a, c) => a + c.cash, 0)

/** 이번 달 이미 충전한 금액을 고친다. 지난 주 기록은 그대로 두고 기록 밖 금액을 맞춘다 */
export function setBefore(key: string, v: number) {
  setOutside(key, Math.max(0, Math.round(v) - (beforeThisWeek(key) - (eff.outside[key] ?? 0))))
}

/** 이번 주에 그 결제수단으로 충전한(할) 캐시 */
export const weekCharged = (key: string) => (eff.charges[weekNow()] ?? []).filter(c => c.key === key).reduce((a, c) => a + c.cash, 0)

/** 이번 주 충전을 정한다(그 결제수단 기록을 한 줄로). 할인율은 지금 설정 값 */
export function setWeekCharge(key: string, v: number) {
  const w = weekNow()
  eff.charges[w] = (eff.charges[w] ?? []).filter(c => c.key !== key)
  if (!eff.charges[w].length) delete eff.charges[w]
  if (v > 0) addCharge(w, { key, cash: Math.round(v) })
  else saveEff()
}

/** 설정의 할인율을 바꾸면 이번 주 충전 기록의 할인율도 따라간다 */
export function syncWeekOff(key: string) {
  const o = payOptions().find(p => p.key === key)
  for (const c of eff.charges[weekNow()] ?? []) if (o && c.key === key) c.off = o.off
  saveEff()
}

/** 결산의 메소마켓 줄에 메소마켓에서 실제로 산 메소(억)를 적는다. 비우면 최대(기본값)로 */
export function setMkMeso(week: string, lineKey: string, v: number | null) {
  const k = `${week}|${lineKey}`
  if (v == null || v <= 0) delete eff.mkMeso[k]
  else eff.mkMeso[k] = v
  saveEff()
}

// ---- 크레딧 흐름 ----
// 크레딧샵 구매는 넥슨 구매내역에 안 남는다. 잔액은 쌓인 만큼 저절로 늘고, 산 것은 산 주에 사용자가 결산에 적는다.
// 판 돈은 실제로 판 주의 회수로 센다(2026-10-16 사용자). 흐름은 creditFrom 주부터 잇는다(그 전 주는 쌓인 크레딧 × 추정 값)

/** 크레딧샵에서 산 것: 물건 · 한 개 크레딧 · 개수 · 경매장 한 번 판매 가격(억) */
export interface CreditBuy { id: string; itemId: string; name: string; credits: number; n: number; price: number }

/** 그 주에 쌓인 크레딧: 넥슨캐시로 산 것(넥슨쇼핑 쿠폰 빼고) 중 선물식이 아닌 것의 5% */
export function creditEarned(rows: Row[], week: string) {
  const giftOn = (eff.snaps[week]?.prices.giftRate ?? giftOf()?.rate ?? 0) > 0
  const lines = groupRows(rowsOf(rows, week).filter(r => !isShop(r)), eff.tags, catalog(), giftOn)
  return lines.filter(l => l.use !== 'gift').reduce((a, l) => a + l.cash, 0) * CREDIT_RATE
}

export interface CreditWeek { start: number; earned: number; used: number; left: number }

/** creditFrom 주부터 이번 주까지: 시작 + 쌓인 것 − 산 것 = 남은 것. 처음 시작은 eff.creditBalance */
export function creditFlow(rows: Row[], thisWeek: string) {
  const weeks: Record<string, CreditWeek> = {}
  let bal = eff.creditBalance
  for (let w = eff.creditFrom; w <= thisWeek; w = addDays(w, 7)) {
    const start = bal, earned = creditEarned(rows, w)
    const used = (eff.creditBuys[w] ?? []).reduce((a, b) => a + b.n * b.credits, 0)
    bal = start + earned - used
    weeks[w] = { start, earned, used, left: bal }
  }
  return { weeks, left: bal }
}

/** 5번 칸에서 '지금 남은 크레딧'을 게임 값으로 고친다. 적어 둔 산 것은 그대로 두고 흐름의 시작값을 맞춘다 */
export function setCreditNow(rows: Row[], thisWeek: string, v: number) {
  eff.creditBalance += Math.round(v) - creditFlow(rows, thisWeek).left
  saveEff()
}

/** 그 주에 크레딧샵에서 산 것을 적는다. 판 가격은 지금 크레딧샵 시세로 채워 두고 고친다 */
export function addCreditBuy(week: string, itemId: string) {
  const x = creditItems().find(c => c.id === itemId)
  if (!x) return
  const b: CreditBuy = { id: `cb${Date.now().toString(36)}`, itemId: x.id, name: x.name, credits: x.credits, n: 1, price: eff.creditPrices[x.id] ?? 0 }
  if (!eff.creditBuys[week]) eff.creditBuys[week] = []
  eff.creditBuys[week].push(b)
  saveEff()
}

export function updateCreditBuy(week: string, id: string, x: Partial<Pick2<CreditBuy, 'n' | 'price'>>) {
  const b = eff.creditBuys[week]?.find(b => b.id === id)
  if (!b) return
  Object.assign(b, x)
  saveEff()
}

export function removeCreditBuy(week: string, id: string) {
  eff.creditBuys[week] = (eff.creditBuys[week] ?? []).filter(b => b.id !== id)
  if (!eff.creditBuys[week].length) delete eff.creditBuys[week]
  saveEff()
}

type Pick2<T, K extends keyof T> = { [P in K]: T[P] }
