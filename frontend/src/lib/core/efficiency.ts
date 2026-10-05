/**
 * MVP 효율표 계산.
 *
 * 캐시를 충전해 캐시템을 사고, 경매장에 팔아 받은 메소를 엄(현금)으로 바꾼다.
 * 그 사이에 사라지는 돈이 '실제로 나가는 돈'이다. 여기서는 그 돈이 가장 적은 조합을 찾는다.
 *
 * 규칙은 사용자와 정한 것이다 (2026-09-27):
 * - 효율의 기준은 플가(플래티넘 카르마의 가위). 다른 아이템의 기준 가격은 플가 가격에 캐시가 비율을 곱한 것
 * - 묶음은 통째로 사고 통째로 판다. 가격은 묶음 전체 가격이고 판매 1회
 * - 경매장 수수료는 사는 순간 오를 등급으로 정한다. 실버 이상 3%, 아니면 5%
 * - 상품권은 5만원권으로만 산다(2026-09-28 사용자 결정: 작은 권은 할인도 적고 MVP작에선 잘 안 쓴다). 넘치게 사지 않는다
 * - 사용자가 직접 추가한 결제수단(넥슨팩 쿠폰 등)은 할인율과 달 한도(없을 수도 있다)대로, 정한 판매 단위(권)로 쓴다
 * - 할인이 큰 결제수단부터 쓴다. 권 단위보다 작은 끝자리는 할인되는 결제수단으로 한 권 더 사고,
 *   남는 캐시는 산 값 그대로 다음 주로 넘긴다(2026-09-29 사용자 결정). 마지막 주만 바코드나 일반 충전 1:1로 딱 맞춘다
 * - 상품권 한도는 달마다 새로 생긴다(각 20만 원)
 * - 넥슨카드는 그 달 마지막 20만 원에만 쓴다. 먼저 쓰면 그 달에 현대카드 포인트·중고 캐시 충전을 못 한다(2026-09-29 사용자)
 */
import type { TierKey } from './mvp'

export const PG_ID = 'karma'
export const MONTHLY = 200_000
export const BIG = 50_000
/** 계산 단위. 캐시템 값이 모두 100원 단위다 */
const U = 100

/**
 * 캐시샵 아이템.
 * days: 받은 뒤 써야 하는 기간(일). 없으면 무기한. 기간이 짧으면 값이 오를 때까지 들고 버틸 수 없다.
 * until: 캐시샵 판매가 끝나는 날. 지나면 살 수 없어 목록에서 뺀다.
 */
export interface ShopItem { id: string; name: string; set: number; cash: number; bundle?: boolean; until?: string; days?: number; custom?: boolean }

/** 7일 안에 써야 하는 아이템. 오래 들고 기다릴 수 없어 빨리 팔아야 한다 */
export const isShort = (x: Pick<ShopItem, 'days'>) => !!x.days && x.days <= 7
/** '7일', '무기한' */
export const daysLabel = (x: Pick<ShopItem, 'days'>) => x.days ? `${x.days}일` : '무기한'
export interface BarcodeEvent { on: boolean; bonus: number; cap: number; until?: string }

/** '로얄스타일 쿠폰(45개)'. 묶음이 여럿인 아이템은 1개짜리도 개수를 붙여 구분한다 */
export const itemLabel = (x: Pick<ShopItem, 'name' | 'set' | 'bundle'>) => x.set > 1 || x.bundle ? `${x.name}(${x.set}개)` : x.name
/** 묶음은 세트, 낱개는 개 */
export const countLabel = (x: Pick<ShopItem, 'set'>, n: number) => x.set > 1 ? `${n}세트` : `${n}개`

/** 플가 가격(억)일 때 이 아이템이 플가와 같은 효율이 되는 가격(억) */
export const minPrice = (pg: number, cash: number) => pg * cash / 5900

/**
 * 일반 충전 비율 칸. 사람마다 적는 방식이 달라 방식을 고르게 한다.
 * off: 할인율(7 → 7% 할인), ratio: 실제 비율(93 또는 0.93), per10k: 1만 캐시당 현금(9300).
 * 캐시 1원에 드는 현금을 돌려준다. 비었거나 말이 안 되면 1(1:1)
 */
export type PlainMode = 'off' | 'ratio' | 'per10k'
export function plainRateOf(mode: PlainMode, v: number): number {
  const r = !v || v <= 0 ? 1
    : mode === 'off' ? 1 - v / 100
    : mode === 'ratio' ? (v > 1 ? v / 100 : v)
    : v / 10000
  return r > 0 && r < 1 ? r : 1
}

/** 사는 순간 이 등급이 되면 경매장 수수료 */
export const feeOf = (tier: TierKey | null) => tier && tier !== 'bronze' ? 0.03 : 0.05

/**
 * 할인 칸. 100 이하는 할인율(%), 넘으면 상품권 한 장 가격.
 * 1만 원 이하면 1만원권, 그 위는 5만원권 가격으로 본다.
 * 캐시 1원을 얻는 데 드는 현금을 돌려준다.
 */
export function rateOf(disc: number): number | null {
  if (!disc || disc <= 0) return null
  if (disc <= 100) return disc < 100 ? 1 - disc / 100 : null
  if (disc <= 10000) return disc / 10000
  if (disc <= 50000) return disc / 50000
  return null
}

/** 한 권 금액의 이름: 50000 → '5만원권', 5000 → '5천원권' */
export const unitName = (u: number) => u >= 10_000 ? `${u / 10_000}만원권` : u >= 1_000 ? `${u / 1_000}천원권` : `${u}원권`

/** 결제수단. unit은 사는 단위(상품권은 5만원권, 직접 추가한 것은 100원) */
export interface Card { key: string; name: string; rate: number; unit?: number }
export interface Part {
  name: string
  cash: number
  won: number
  card?: boolean
  /** 5만원권 장수 */
  big?: number
  /** 권 단위로 사는 결제수단이면 한 권 금액(장수 = cash / unit) */
  unit?: number
  /** 바코드로 더 받은 캐시 */
  bonus?: number
  held?: boolean
  /** 결제수단 키(한도를 깎을 때 쓴다) */
  key?: string
  /** 끝자리 때문에 한 권 더 사서 이 주에 쓰지 않고 남는 캐시 */
  spare?: number
}
/** cost는 이 주에 쓴 캐시의 값이다. 남는 캐시(spare)는 산 값(won)과 함께 다음 주로 넘어가서 거기서 센다 */
export interface Funding { cost: number; parts: Part[]; spare: { cash: number; won: number } | null }

export interface FundCtx {
  /** 이미 충전해 둔 캐시와 그때 쓴 현금 */
  held: { cash: number; won: number }
  /** 이 결제에 쓸 수 있는 결제수단 한도(키 → 남은 금액). 한도 없는 것은 Infinity */
  limits: Record<string, number>
  /** 쓸 결제수단. 싼 것부터 */
  cards: Card[]
  /** 바코드 이벤트. null이면 없음. want가 null이면 남는 금액 전부 */
  barcode: { bonus: number; capLeft: number; want: number | null } | null
  /** 끝자리를 한 권 더 사서 남겨도 되는지. 다음 주가 있어야 남는 캐시를 쓴다 */
  spareOk?: boolean
}

/** 캐시 c를 마련하는 데 드는 현금과 그 내역 */
export function fund(c: number, x: FundCtx): Funding {
  const parts: Part[] = []
  let left = c, cost = 0
  if (x.held.cash > 0 && left > 0) {
    const use = Math.min(left, x.held.cash), r = x.held.won > 0 ? x.held.won / x.held.cash : 1
    parts.push({ name: '가진 캐시', cash: use, won: use * r, held: true })
    left -= use; cost += use * r
  }
  const used: Record<string, number> = {}
  const put = (k: Card, n: number) => {
    const u = k.unit ?? BIG
    const q = parts.find(p => p.key === k.key)
    if (q) { q.cash += n; q.won += n * k.rate } else parts.push({ name: k.name, key: k.key, cash: n, won: n * k.rate, card: true })
    const r = q ?? parts[parts.length - 1]
    if (u === BIG) r.big = r.cash / BIG
    if (u > U) r.unit = u
    used[k.key] = (used[k.key] ?? 0) + n
    return r
  }
  for (const k of x.cards) {
    if (left <= 0) break
    const L = x.limits[k.key] ?? 0
    const u = k.unit ?? BIG
    const use = Math.floor(Math.min(left, L) / u) * u
    if (use <= 0) continue
    put(k, use)
    left -= use; cost += use * k.rate
  }
  // 끝자리: 할인되는 결제수단으로 한 권 더 사고 남는 캐시는 다음 주로. 할인이 크고, 같으면 덜 남는 쪽
  let spare: Funding['spare'] = null
  if (x.spareOk && left > 0) {
    const bc = x.barcode && x.barcode.want == null ? 1 / (1 + x.barcode.bonus) : 1
    let pick: { k: Card; n: number } | null = null
    for (const k of x.cards) {
      const u = k.unit ?? BIG
      const n = Math.ceil(left / u) * u
      if (k.rate >= bc || (x.limits[k.key] ?? 0) - (used[k.key] ?? 0) < n) continue
      if (!pick || k.rate < pick.k.rate || (k.rate === pick.k.rate && n < pick.n)) pick = { k, n }
    }
    if (pick) {
      const q = put(pick.k, pick.n)
      q.spare = pick.n - left
      spare = { cash: q.spare, won: q.spare * pick.k.rate }
      cost += left * pick.k.rate
      left = 0
    }
  }
  if (x.barcode && left > 0) {
    const use = x.barcode.want == null ? left : Math.min(left, x.barcode.want)
    if (use > 0) {
      const b = x.barcode.bonus
      // 추가분은 계정당 한도까지. 넘으면 그 뒤는 1:1
      const won = b * use / (1 + b) <= x.barcode.capLeft ? use / (1 + b) : use - x.barcode.capLeft
      parts.push({ name: '바코드', cash: use, won, bonus: use - won })
      left -= use; cost += won
    }
  }
  if (left > 0) { parts.push({ name: '일반 충전', cash: left, won: left }); cost += left }
  return { cost, parts, spare }
}

// ---- 메이플 크레딧 ----

/** 캐시샵에서 쓴 캐시의 5%가 메이플 크레딧으로 쌓인다. 캐시템도, 메소마켓에 팔 메이플포인트를 사는 것도 똑같다 */
export const CREDIT_RATE = 0.05

/** 크레딧샵 물건. price는 경매장 한 번 판매 가격(억) */
export interface CreditItem { id: string; name: string; credits: number; price: number; days?: number; custom?: boolean }

/** 크레딧 1개가 돈으로 얼마인지. 크레딧당 가장 많이 받는 물건 기준 */
export function creditWonPer(items: CreditItem[], fee: number, um: number): number {
  return Math.max(0, ...items.filter(x => x.price > 0 && x.credits > 0).map(x => x.price * (1 - fee) * um / x.credits))
}

export interface CreditSpend {
  /** 이번에 쌓인 것, 쓰기 전 전부(남아 있던 것 포함) */
  earned: number
  have: number
  buys: { item: CreditItem; n: number }[]
  used: number
  left: number
  /** 산 물건을 경매장에 팔아 받는 돈과 메소(억) */
  back: number
  meso: number
  sales: number
}

/** 가진 크레딧으로 가장 많이 돌려받는 조합. 딱 안 떨어지는 크레딧은 남긴다 */
export function spendCredits(have: number, earned: number, items: CreditItem[], fee: number, um: number): CreditSpend {
  const list = items.filter(x => x.price > 0 && x.credits > 0)
  const none = { earned, have, buys: [], used: 0, left: have, back: 0, meso: 0, sales: 0 }
  if (!list.length || have <= 0) return none
  const g = list.reduce((a, x) => gcd(a, Math.round(x.credits)), 0) || 1
  const T = Math.floor(have / g)
  const v = new Float64Array(T + 1), how = new Int16Array(T + 1).fill(-1)
  for (let t = 1; t <= T; t++) {
    v[t] = v[t - 1]; how[t] = -1
    list.forEach((x, j) => {
      const c = Math.round(x.credits) / g
      if (c <= t && v[t - c] + x.price > v[t]) { v[t] = v[t - c] + x.price; how[t] = j }
    })
  }
  const count = new Map<number, number>()
  for (let t = T; t > 0;) { const j = how[t]; if (j < 0) t--; else { count.set(j, (count.get(j) ?? 0) + 1); t -= Math.round(list[j].credits) / g } }
  const buys = [...count].map(([j, n]) => ({ item: list[j], n })).sort((a, b) => b.item.credits - a.item.credits)
  const used = buys.reduce((a, b) => a + b.n * b.item.credits, 0)
  const meso = buys.reduce((a, b) => a + b.n * b.item.price, 0) * (1 - fee)
  return { earned, have, buys, used, left: have - used, back: meso * um, meso, sales: buys.reduce((a, b) => a + b.n, 0) }
}
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)

/** 팔 수 있는 것. price는 경매장 한 번 판매 가격(억, 묶음이면 묶음 전체). 0이면 계산에서 뺀다 */
/** cap: 한 주에 팔 수 있는(그래서 살) 최대 개수(세트). 회전율. 없으면 제한 없음 */
export interface Sellable extends ShopItem { price: number; cap?: number }
export interface Line { item: Sellable; n: number }
export interface Route {
  /** 이번에 결제하는 캐시 */
  pay: number
  /** 그 캐시에 든 현금 */
  cost: number
  /** 돌려받는 현금 */
  back: number
  loss: number
  /** 경매장 판매 횟수 (메소마켓·선물식은 1회로 센다) */
  sales: number
  lines: Line[]
  /** 메이플포인트로 사서 메소마켓에 파는 캐시 */
  market: number
  /** 선물식: 캐시템(메이플포인트 상품)을 선물해 주고 현금으로 바로 받는 캐시. 메소를 거치지 않는다 */
  gift: number
  fee: number
  /** 경매장에서 받는 메소(억, 수수료 뺀 것) */
  meso: number
  /** 캐시템을 사서 쌓이는 메이플 크레딧 */
  credits: number
  /** 그 크레딧의 값(원). 조합을 고를 때 쓰는 어림값이고, 실제로 큐브를 사서 판 값은 루트 단계에서 다시 센다 */
  creditEst: number
}

/**
 * 선물식: 할인 충전한 캐시로 남에게 캐시템을 선물해 주고 현금을 바로 받는다.
 * rate: 캐시 1원어치에 받는 현금(1만 캐시당 7,000원이면 0.7). 사고파는 사람이 있는 단위(unit, 1만·3만·5만·10만 캐시)로만,
 * 한 번에 min 캐시 이상만 거래한다(2,000원어치를 이 비율로 사는 사람은 없다, 2026-10-05 사용자)
 */
export interface Gift { rate: number; unit: number; min: number }

export interface SolveIn {
  /** 채워야 할 결제 */
  target: number
  costOf: (cash: number) => number
  fee: number
  /** 엄 시세(1억 메소당 원), 메소마켓(1억 메소당 메포) */
  um: number
  mk: number
  /** 선물식. 없으면 안 쓴다 */
  gift?: Gift | null
  items: Sellable[]
  /** 계획을 따를 때는 결제액을 목표와 똑같이 맞춘다 */
  exact: boolean
  /** 크레딧 1개의 값(원). 캐시템을 살 때 쌓이는 크레딧만큼 그 아이템이 더 이득이 된다 */
  creditPer?: number
  /** 직접 짜기: 아이템 id → 살 개수. 적은 아이템은 그 개수 그대로, 나머지(items에 있는 것)는 알아서 고르고 메소마켓으로 마저 채운다 */
  fixed?: Record<string, number>
  /** 가장 싼 조합 하나만 필요할 때(비교 칸·직접 짜기). 판매 횟수별 계산을 건너뛴다 */
  bestOnly?: boolean
}

export interface Solved {
  /** 가장 많이 남는 조합(최저가 루트) */
  best: Route
  /** lossAt[k] = 경매장 판매 k회 이하로 할 때 가장 적게 잃는 돈. 안 되면 Infinity. k는 0..best.sales */
  lossAt: number[]
  /** 판매 k회 이하에서 가장 적게 잃는 조합 */
  routeAt: (k: number) => Route
}

/** 계산 안에서 선물식을 아이템처럼 다룰 때의 이름. 직접 짜기 조합에서도 이 이름으로 넣는다(개수 = 단위 묶음 수) */
export const GIFT_ID = '__gift'

/** 판매 횟수를 이만큼까지만 층으로 쌓는다. 그 위는 최저가 루트와 같다고 본다 */
const MAX_LAYERS = 600
/** 메이플포인트는 1,000원 단위로만 산다(계산 단위 100원의 10배) */
const MU = 10

export function solve(o: SolveIn): Solved | null {
  const keep = (1 - o.fee) * o.um
  const cp = o.creditPer ?? 0
  // back: 경매장에서 돌려받는 돈, val: 거기에 쌓이는 크레딧 값까지 더한 것(조합 고르기용)
  let usable = o.items.filter(x => x.price > 0).map(x => ({ x, u: Math.round(x.cash / U), back: x.price * keep, val: x.price * keep + x.cash * CREDIT_RATE * cp }))
  // 직접 짜기: 개수를 적은 아이템은 그 개수 그대로 산다(0이면 빠진다)
  const forced = (j: number) => o.fixed?.[usable[j].x.id]
  usable = usable.filter(q => o.fixed?.[q.x.id] !== 0)
  // 선물식은 단위(1만 캐시 등) 묶음을 몇 개든 사는 아이템처럼 넣는다. 다만 몇 묶음이든 거래는 한 번이고,
  // 최소 금액보다 적게는 안 판다. 그래서 개수를 늘어놓는 쪽(상한 있는 아이템)에서 따로 다룬다
  const g = o.gift && o.gift.rate > 0 && o.gift.unit > 0 ? o.gift : null
  if (g) {
    const gx: Sellable = { id: GIFT_ID, name: '선물식', set: 1, cash: g.unit, price: 0 }
    usable.push({ x: gx, u: Math.round(g.unit / U), back: g.unit * g.rate, val: g.unit * g.rate + g.unit * CREDIT_RATE * cp })
  }
  const isGift = (j: number) => usable[j].x.id === GIFT_ID
  /** 선물식은 한 번에 이 묶음 수 이상 */
  const giftMin = g ? Math.max(1, Math.ceil(g.min / g.unit)) : 1
  /** 한 주에 살 수 있는 개수 상한(개수를 정했으면 그 개수). 없으면 제한 없음. 선물식은 정하지 않았으면 결제액이 허락하는 만큼 */
  const capOf = (j: number) => isGift(j) ? forced(j) ?? Infinity : forced(j) ?? usable[j].x.cap
  const freeIdx = usable.flatMap((_, j) => (capOf(j) == null ? [j] : []))
  const capIdx = usable.flatMap((_, j) => (capOf(j) != null ? [j] : []))
  const mk1 = o.mk > 0 ? U / o.mk * o.um : 0
  // 메이플포인트도 캐시샵에서 사므로 크레딧이 쌓인다. 조합을 고를 때는 그 값까지 본다
  const mkVal = mk1 ? mk1 + U * CREDIT_RATE * cp : 0
  const need = Math.ceil(o.target / U)
  if (need <= 0) return null
  if (!usable.length && !mk1) return null
  const fixedUnits = capIdx.reduce((a, j) => a + (forced(j) ?? 0) * usable[j].u, 0)
  // 계획을 따를 때는 먼저 계획 금액에 딱 맞춰 본다. 메포가 1,000원 단위라 안 맞으면 1,000원 안쪽으로 넘기고,
  // 그래도 안 되면(메소마켓 시세가 없을 때 등) 필요한 만큼 넘겨 산다
  const run = (mode: 'tight' | 'near' | 'free') => {
    const room = Math.max(MU - 1, ...usable.map(v => v.u))
    let A = mode === 'tight' ? need : mode === 'near' ? need + MU - 1 : need + room
    // 정해 둔 개수가 결제액보다 크면 그만큼은 사고, 그 위로도 결제액이 모자랄 때처럼 하나 더 얹어 볼 수 있다
    A = Math.max(A, mode === 'free' ? fixedUnits + room : fixedUnits)
    const cost = new Float64Array(A + 1)
    for (let a = 0; a <= A; a++) cost[a] = o.costOf(a * U)
    return { A, cost }
  }
  let { A, cost } = run(fixedUnits > need ? 'free' : o.exact ? 'tight' : 'free')

  /**
   * 상한이 있는 아이템은 살 개수 조합을 늘어놓는다(C: 캐시 단위 합, V: 값, n: 개수 합).
   * 캐시 합과 개수 합이 같은 조합은 값이 큰 것 하나만 남긴다. 나머지 계산에는 C·n·V만 쓰이니 답이 같다.
   * 상한이 없으면 조합은 '하나도 안 삼' 하나뿐이라 예전 계산과 같다
   */
  type Combo = { cnt: number[]; C: number; V: number; n: number }
  const combosOf = (lim: number) => {
    let cur = new Map<number, Combo>([[0, { cnt: [], C: 0, V: 0, n: 0 }]])
    for (const j of capIdx) {
      const q = usable[j], cap = capOf(j)!
      const next = new Map<number, Combo>()
      for (const b of cur.values()) {
        // 선물식: 0이거나 최소 묶음 수부터, 몇 묶음이든 거래 1회
        for (let c = forced(j) ?? 0; c <= cap && b.C + c * q.u <= lim; c = isGift(j) && c === 0 ? giftMin : c + 1) {
          const x = { cnt: [...b.cnt, c], C: b.C + c * q.u, V: b.V + c * q.val, n: b.n + (isGift(j) ? Math.min(c, 1) : c) }
          const key = x.n * (lim + 1) + x.C, had = next.get(key)
          if (!had || x.V > had.V) next.set(key, x)
        }
      }
      cur = next
    }
    return [...cur.values()]
  }
  let combos = combosOf(A)

  const finish = (counts: Map<number, number>, market: number, pay: number): Route => {
    let back = market / U * mk1, sales = market ? 1 : 0, meso = 0, credits = market * CREDIT_RATE, gift = 0
    const lines: Line[] = []
    for (const [j, n] of counts) {
      if (!n) continue
      if (isGift(j)) { gift = n * usable[j].x.cash; back += n * usable[j].back; sales++; credits += gift * CREDIT_RATE; continue }
      back += n * usable[j].back; sales += n; meso += n * usable[j].x.price * (1 - o.fee)
      credits += n * usable[j].x.cash * CREDIT_RATE
      lines.push({ item: usable[j].x, n })
    }
    lines.sort((a, b) => b.n * b.item.cash - a.n * a.item.cash)
    const c = cost[pay / U], creditEst = credits * cp
    return { pay, cost: c, back, loss: c - back - creditEst, sales, lines, market, gift, fee: o.fee, meso, credits, creditEst }
  }
  const comboCounts = (c: Combo) => new Map(capIdx.map((j, i) => [j, c.cnt[i]] as [number, number]))

  // 최저가 루트. 판매 한 번마다 아주 작은 값을 빼서, 남는 돈이 같으면 적게 파는 쪽을 고른다.
  // 상한 없는 아이템과 메소마켓으로 만든 표에 상한 있는 조합을 하나씩 얹어 본다
  const EPS = 0.01, NEG = -1e18
  const best1 = () => {
    const v = new Float64Array(A + 1).fill(NEG), how = new Int16Array(A + 1).fill(-3), mkIn = new Uint8Array(A + 1)
    v[0] = 0
    for (let a = 1; a <= A; a++) {
      if (mk1 && a >= MU && v[a - MU] > NEG) { v[a] = v[a - MU] + MU * mkVal - (mkIn[a - MU] ? 0 : EPS); how[a] = -2; mkIn[a] = 1 }
      for (const j of freeIdx) {
        const q = usable[j]
        if (q.u > a || v[a - q.u] <= NEG) continue
        const val = v[a - q.u] + q.val - EPS
        if (val > v[a]) { v[a] = val; how[a] = j; mkIn[a] = mkIn[a - q.u] }
      }
    }
    let pick = -1, pc = -1, net = -Infinity
    combos.forEach((c, ci) => {
      for (let a = Math.max(0, need - c.C); a + c.C <= A; a++) {
        if (v[a] <= NEG) continue
        const x = v[a] + c.V - c.n * EPS - cost[a + c.C]
        if (x > net) { net = x; pick = a; pc = ci }
      }
    })
    if (pick < 0) return null
    const counts = comboCounts(combos[pc]); let m = 0
    for (let a = pick; a > 0;) {
      const h = how[a]
      if (h === -2) { m += MU * U; a -= MU } else { counts.set(h, (counts.get(h) ?? 0) + 1); a -= usable[h].u }
    }
    return finish(counts, m, (pick + combos[pc].C) * U)
  }
  let best = best1()
  if (!best && o.exact) { ({ A, cost } = run('near')); combos = combosOf(A); best = best1() }
  if (!best && o.exact) { ({ A, cost } = run('free')); combos = combosOf(A); best = best1() }
  if (!best) return null
  if (o.bestOnly) { const b = best; return { best: b, lossAt: [b.loss], routeAt: () => b } }
  const K = best.sales

  /**
   * 판매 횟수별. row[s][a] = 판매 s번(메소마켓 빼고)으로 정확히 a를 채울 때 가장 많이 돌려받는 값.
   * 어떤 조합이든 '상한 있는 아이템 조합(n개)' 위에 상한 없는 아이템을 하나씩 얹은 것이다. 그래서
   *   row[s][a] = max(개수 합 s·캐시 합 a인 조합의 값, 상한 없는 아이템 j에 대해 row[s−1][a − u_j] + 값_j)
   * 층을 하나씩 쌓으면 조합은 자기 개수 층에 한 번만 들어간다(층마다 조합을 다 훑지 않는다).
   * 값은 두 층만 들고, 되짚을 선택만 층마다 남긴다(-2 = 여기서 조합이 시작). 메소마켓을 쓰면 판매가 1회 는다
   */
  type At = { k: number; a: number; m: number; tot: number }
  const L = Math.min(K, MAX_LAYERS)
  const top = new Array<number>(L + 1).fill(-Infinity)
  const atS = new Array<At | null>(L + 1).fill(null)
  const hows: Int8Array[] = []
  const put = (s: number, val: number, at: At) => { if (s <= L && val > top[s] + 0.5) { top[s] = val; atS[s] = at } }
  const byN: Combo[][] = Array.from({ length: L + 1 }, () => [])
  const comboAt = new Map<number, Combo>()
  for (const cb of combos) if (cb.n <= L) { byN[cb.n].push(cb); comboAt.set(cb.n * (A + 1) + cb.C, cb) }
  const lastN = byN.findLastIndex(x => x.length > 0)
  /**
   * 메포를 m(1,000원 단위)만큼 더 사서 결제액이 tot이 되면 값 = row[a] + m × mkVal − cost[tot], m = tot − a.
   * 모자라는 만큼만이 아니라 더 사는 것도 본다(5만원권에 맞추면 더 싸질 때가 있다. 최저가 루트도 그렇게 고른다).
   * tot마다 'row[a] − a × mkVal'이 가장 큰 a(tot − MU 이하, MU로 나눈 나머지가 tot과 같은 것)만 보면 된다.
   * bestLow[a] = a 이하에서 나머지가 a와 같은 것 중 그 값이 가장 큰 곳(같으면 작은 a)
   */
  const bestLow = new Int32Array(A + 1)
  const consider = (row: Float64Array, s: number, lo: number, hi: number) => {
    // 결제액을 채우거나 넘기는 쪽
    for (let a = Math.max(lo, need); a <= hi; a++) if (row[a] > NEG) put(s, row[a] - cost[a], { k: s, a, m: 0, tot: a })
    if (!mk1 || s + 1 > L) return
    for (let a = lo; a <= A; a++) {
      const p = a - MU >= lo ? bestLow[a - MU] : -1
      bestLow[a] = a <= hi && row[a] > NEG && (p < 0 || row[a] - a * mkVal > row[p] - p * mkVal) ? a : p
    }
    for (let tot = Math.max(need, lo + MU); tot <= A; tot++) {
      const a = bestLow[tot - MU]
      if (a >= 0) put(s + 1, row[a] + (tot - a) * mkVal - cost[tot], { k: s, a, m: tot - a, tot })
    }
  }
  // 캐시가가 같으면 값이 큰(같으면 앞의) 아이템만 이길 수 있다. 나머지는 층 계산에서 뺀다
  const layerIdx = freeIdx.filter((j, t) => !freeIdx.slice(0, t).some(i => usable[i].u === usable[j].u && usable[i].val >= usable[j].val)
    && !freeIdx.slice(t + 1).some(i => usable[i].u === usable[j].u && usable[i].val > usable[j].val))
  let prev: Float64Array | null = null
  let lo = 0, hi = -1
  for (let s = 0; s <= L; s++) {
    // 앞 층이 비었고 더 얹을 조합도 없으면 끝
    if (hi < 0 && s > lastN) break
    const cur = new Float64Array(A + 1).fill(NEG), h = new Int8Array(A + 1).fill(-1)
    // 상한 없는 아이템을 하나 얹는다. 아이템마다 한 줄씩 훑고, 커야만 바꾸니 칸마다 먼저 나온 아이템이 이긴다
    if (prev && hi >= 0) for (const j of layerIdx) {
      const u = usable[j].u, v = usable[j].val, end = Math.min(A, hi + u)
      for (let a = lo + u; a <= end; a++) {
        const p = prev[a - u]
        if (p <= NEG) continue
        if (p + v > cur[a]) { cur[a] = p + v; h[a] = j }
      }
    }
    // 개수 합이 s인 조합에서 시작
    for (const cb of byN[s]) if (cb.C <= A && cb.V > cur[cb.C]) { cur[cb.C] = cb.V; h[cb.C] = -2 }
    lo = A + 1; hi = -1
    for (let a = 0; a <= A; a++) if (cur[a] > NEG) { if (a < lo) lo = a; hi = a }
    hows.push(h); prev = cur
    if (hi >= 0) consider(cur, s, lo, hi)
  }
  // k회 이하로 바꾼다
  const lossAt: number[] = [], pickAt: (At | null)[] = []
  let bv = -Infinity, ba: At | null = null
  for (let s = 0; s <= L; s++) {
    if (top[s] > bv) { bv = top[s]; ba = atS[s] }
    lossAt.push(-bv); pickAt.push(ba)
  }
  lossAt[L] = Math.min(lossAt[L], best.loss)
  const built = new Map<number, Route>()
  const routeAt = (k: number): Route => {
    if (k >= L) return best!
    const at = pickAt[Math.max(0, k)]
    if (!at) return best!
    if (built.has(k)) return built.get(k)!
    // 되짚기: 상한 없는 아이템을 하나씩 빼다가 조합이 시작된 칸에서 멈춘다
    let s = at.k, a = at.a, j = hows[s][a]
    const free = new Map<number, number>()
    while (j !== -2) { free.set(j, (free.get(j) ?? 0) + 1); a -= usable[j].u; s--; j = hows[s][a] }
    const counts = comboCounts(comboAt.get(s * (A + 1) + a)!)
    for (const [i, n] of free) counts.set(i, (counts.get(i) ?? 0) + n)
    const r = finish(counts, at.m * U, at.tot * U)
    built.set(k, r)
    return r
  }
  return { best, lossAt, routeAt }
}

/** MVP작할 몫이 없는 주(구매용이 결제액 전부). 사는 것도 파는 것도 없다 */
function nothing(fee: number): Solved {
  const r: Route = { pay: 0, cost: 0, back: 0, loss: 0, sales: 0, lines: [], market: 0, gift: 0, fee, meso: 0, credits: 0, creditEst: 0 }
  return { best: r, lossAt: [0], routeAt: () => r }
}

/**
 * 최적화 지점: 판매를 한 번 줄일 때 더 내는 돈이 판매 1회 수고비(perSale) 이하일 때만 줄인다.
 * 곧 '잃는 돈 + 판매 횟수 × 수고비'가 가장 작은 곳이다. 같으면 적게 파는 쪽.
 *
 * 전에는 곡선 모양(가장 크게 꺾이는 곳)만 봤다. 그러면 한 번 덜 팔려고 몇천 원씩 더 내는 쪽을
 * 추천하게 된다. 돈으로 따져야 한다.
 */
export function balancePoint(loss: number[], sales: number[], lo: number, hi: number, perSale: number, rate?: number[], minRate = 0): number {
  // 회수율 하한(%): 그 아래로 떨어지는 횟수는 고르지 않는다. 하한을 넘는 곳이 없으면 회수율이 가장 높은 곳
  const ok = (k: number) => !minRate || !rate || rate[k] * 100 >= minRate - 1e-9
  let pick = -1, score = Infinity
  for (let k = lo; k <= hi; k++) {
    if (!Number.isFinite(loss[k]) || !ok(k)) continue
    const v = loss[k] + sales[k] * perSale
    if (v < score - 0.5) { score = v; pick = k }
  }
  if (pick >= 0) return pick
  if (!rate) return hi
  pick = hi
  for (let k = lo; k <= hi; k++) if (Number.isFinite(loss[k]) && rate[k] > rate[pick] + 1e-12) pick = k
  return pick
}

// ---- 여러 주(계획) 또는 한 번(금액) ----

export interface CardSetting { key: string; name: string; disc: number; on: boolean }
/** 직접 추가한 결제수단. rate는 캐시 1원에 드는 현금, monthly는 달마다 한도(null이면 없음) */
export interface MethodSetting { key: string; name: string; rate: number; monthly: number | null; on: boolean; unit?: number }
export interface Plan {
  /**
   * 결제할 주. 계획이 없으면 한 줄.
   * use: 그 주 결제 중 MVP작이 아니라 실제로 쓸 아이템(모멘텀패스 등)에 들어갈 캐시. MVP 금액에는 들지만 팔지 않으니
   * 회수가 없다. MVP작 조합은 amount − use로 짜고, 충전·한도는 amount 전체로 센다(2026-10-04 건의)
   */
  weeks: { start: string; amount: number; tier: TierKey | null; month: string; use?: number }[]
  /** 캐시 잔액. 이미 낸 돈이라 1:1로 센다 */
  balance: number
  cards: CardSetting[]
  /** 직접 추가한 결제수단 */
  methods?: MethodSetting[]
  /** 이번 달에 남은 한도(키 → 금액). 다음 달부터는 상품권 20만 원, 직접 추가한 것은 그 달 한도 */
  leftNow: Record<string, number>
  thisMonth: string
  barcode: BarcodeEvent
  barcodeOn: boolean
  barcodeWant: number | null
  /** 주별로 바코드 캐시를 따로 정한 것 */
  weekBarcode: Record<string, number>
  um: number
  mk: number
  /** 선물식. 없으면 안 쓴다 */
  gift?: Gift | null
  items: Sellable[]
  /** 수수료를 직접 정했으면 그 값. 아니면 주마다 오를 등급으로 */
  fee: number | null
  exact: boolean
  /** 크레딧을 쓸지와 크레딧샵 물건. 없으면 크레딧은 계산에 넣지 않는다 */
  credit?: { items: CreditItem[] } | null
  /**
   * 직접 짜기: 주(순서)마다 그 주 조합. 아이템 id → 개수(null이면 개수는 알아서). 조합에 없는 아이템은 안 쓴다.
   * undefined인 주는 모든 아이템에서 알아서 고른다
   */
  fixedFor?: (i: number) => Record<string, number | null> | undefined
  /** 가장 싼 조합 하나만(비교 칸·직접 짜기) */
  bestOnly?: boolean
  /**
   * 일반 충전(1:1)을 쓸지. 켜면(기본) 끝자리는 일반 충전으로 딱 맞추고 남기는 게 이득일 때만 한 권 더 산다.
   * 끄면 끝자리도 늘 할인 수단으로 한 권 더 사서 남긴다(할인 한도가 없을 때만 일반 충전). 2026-09-30 사용자
   */
  plainOn?: boolean
  /**
   * 넥슨카드를 그 달 마지막 20만 원에만 쓸지(기본). 끄면 다른 상품권과 똑같이 할인이 큰 순서대로 먼저 쓴다.
   * 현대카드 포인트·중고 캐시 충전을 안 하는 사람은 아껴 둘 이유가 없다(2026-09-30 사용자)
   */
  nexonLast?: boolean
}

export interface WeekResult {
  start: string
  month: string
  amount: number
  /** 결제 중 실제로 쓸 아이템에 들어가는 캐시. MVP작 조합(solved)은 이걸 뺀 금액으로 짰다 */
  use: number
  tier: TierKey | null
  fee: number
  um: number
  solved: Solved
  /** 이 주에 쓸 수 있던 잔액·한도. 어떤 루트든 이것으로 충전 내역을 만든다 */
  ctx: FundCtx
}

/**
 * 충전 비용은 그 주 사정(ctx)만으로 정해진다. 루트·비교 칸마다 같은 주를 다시 풀 때 앞서 센 값을 다시 쓴다.
 * 사정이 같은지는 ctx 전체를 글로 바꿔 비교한다. 최근 것만 둔다
 */
const costMemo = new Map<string, number[]>()
function costOfCtx(ctx: FundCtx) {
  const key = JSON.stringify(ctx)
  let tab = costMemo.get(key)
  if (!tab) {
    tab = []
    costMemo.set(key, tab)
    if (costMemo.size > 400) costMemo.delete(costMemo.keys().next().value!)
  }
  const t = tab
  return (c: number) => t[c / U] ?? (t[c / U] = fund(c, ctx).cost)
}

/** 그 달 마지막 충전에만 쓰는 결제수단 */
export const LAST_KEY = 'nexon'

export function planAll(p: Plan): WeekResult[] | null {
  const methods = (p.methods ?? []).filter(m => m.on && m.rate > 0 && m.rate < 1)
  const cards: Card[] = [
    ...p.cards.filter(c => c.on).map(c => ({ key: c.key, name: c.name, rate: rateOf(c.disc) ?? 0 })).filter(c => c.rate > 0),
    ...methods.map(m => ({ key: m.key, name: m.name, rate: m.rate, unit: m.unit ?? U })),
  ].sort((a, b) => a.rate - b.rate)
  /** 그 달에 처음 쓸 수 있는 한도 */
  const full = (key: string) => { const m = methods.find(x => x.key === key); return m ? (m.monthly ?? Infinity) : MONTHLY }
  // 달마다 남은 한도. 주를 차례로 지나며 쓴 만큼 깎는다(앞 주가 할인 큰 것부터 먼저 쓴다)
  const lim: Record<string, Record<string, number>> = {}
  const monthLim = (m: string) => lim[m] ??= Object.fromEntries(cards.map(c => [c.key,
    full(c.key) === Infinity ? Infinity : m === p.thisMonth ? (p.leftNow[c.key] ?? full(c.key)) : full(c.key)]))
  // 넥슨카드는 달마다 마지막 주부터 거꾸로 한도만큼(5만원권) 잡아 두고, 잡아 둔 주에만 먼저 쓴다.
  // 결제가 한 번뿐이면 그 뒤 충전을 모르니 맨 뒤 순서로만 둔다(다른 한도를 다 쓰고 모자랄 때)
  const last = p.nexonLast === false ? undefined : cards.find(c => c.key === LAST_KEY)
  const others = cards.filter(c => c !== last)
  const once = p.weeks.length === 1
  const reserve = p.weeks.map(() => 0)
  if (last && !once) for (const m of new Set(p.weeks.map(w => w.month))) {
    let left = monthLim(m)[LAST_KEY]
    for (let i = p.weeks.length - 1; i >= 0; i--) {
      if (p.weeks[i].month !== m) continue
      reserve[i] = Math.floor(Math.min(left, p.weeks[i].amount) / BIG) * BIG
      left -= reserve[i]
    }
  }
  /** 주를 지나며 바뀌는 것: 가진 캐시(처음 잔액 1:1에 끝자리로 남긴 캐시의 산 값이 더해진다), 달마다 남은 한도, 바코드 추가분 한도 */
  interface St { held: { cash: number; won: number }; lim: typeof lim; capLeft: number }
  const limOf = (st: St, m: string) => { if (!st.lim[m]) st.lim[m] = { ...monthLim(m) }; return st.lim[m] }
  const ctxOf = (st: St, wi: number, spareOk: boolean): FundCtx => {
    const w = p.weeks[wi]
    const want = w.start in p.weekBarcode ? p.weekBarcode[w.start] : p.barcodeWant
    return {
      held: { ...st.held }, limits: { ...limOf(st, w.month), ...(last && !once ? { [LAST_KEY]: reserve[wi] } : {}) },
      cards: !last ? others : once ? [...others, last] : reserve[wi] ? [last, ...others] : others,
      barcode: p.barcode.on && p.barcodeOn ? { bonus: p.barcode.bonus, capLeft: st.capLeft, want } : null,
      spareOk,
    }
  }
  const spend = (st: St, wi: number, f: Funding) => {
    const L = limOf(st, p.weeks[wi].month)
    for (const q of f.parts) {
      if (q.bonus) st.capLeft -= q.bonus
      if (q.held) { st.held.cash -= q.cash; st.held.won -= q.won }
      if (q.key) L[q.key] -= q.cash
    }
    if (f.spare) { st.held.cash += f.spare.cash; st.held.won += f.spare.won }
  }
  const copy = (st: St): St => ({ held: { ...st.held }, lim: Object.fromEntries(Object.entries(st.lim).map(([m, x]) => [m, { ...x }])), capLeft: st.capLeft })
  /**
   * 이 주 끝자리를 한 권 더 사서 남기는 게 이득인지. 이 주부터 계획 끝까지 두 경우(남김 / 일반 충전으로 딱)를 따라가
   * 뒤 주는 지금 규칙대로(가운데 주는 남기고 마지막 주는 딱 맞춤) 계획 금액을 결제한다고 보고 비교한다.
   * 남긴 캐시로 계획 전체의 일반 충전(1:1)이 실제로 줄고 낸 현금도 줄 때만 남긴다.
   * 남긴 캐시가 매주 그대로 굴러가다 마지막 주에 같은 만큼 일반 충전하게 되면 일반 충전을 미룬 것뿐이다.
   * 유지는 계획 뒤에도 이어지니 그런 캐시는 끝내 못 쓴다(2026-09-30 사용자 제보: 2만 원이 계속 남던 것)
   */
  const payOf = (i: number) => Math.ceil(p.weeks[i].amount / U) * U
  const spareHelps = (st: St, wi: number) => {
    if (!fund(payOf(wi), ctxOf(st, wi, true)).spare) return false
    const run = (first: boolean) => {
      const s = copy(st)
      let won = 0, plain = 0
      for (let j = wi; j < p.weeks.length; j++) {
        const f = fund(payOf(j), ctxOf(s, j, j === wi ? first : j < p.weeks.length - 1))
        for (const q of f.parts) if (!q.held) { won += q.won; if (!q.card) plain += q.cash }
        spend(s, j, f)
      }
      return { won, plain }
    }
    const a = run(true), b = run(false)
    return a.plain < b.plain && a.won < b.won - 0.5
  }
  const plainOn = p.plainOn ?? true
  const st: St = { held: { cash: p.balance, won: p.balance }, lim, capLeft: p.barcode.cap }
  const out: WeekResult[] = []
  for (const [wi, w] of p.weeks.entries()) {
    // 끝자리: 일반 충전을 끄면 늘 할인 수단으로 한 권 더(한도가 없으면 그때만 일반 충전).
    // 켜 두면 마지막 주는 딱 맞추고, 그 전 주는 남기는 게 이득일 때만 남긴다
    const spareOk = !plainOn || (wi < p.weeks.length - 1 && spareHelps(st, wi))
    // 이 주의 사정을 떠 둔다. 뒤 주가 한도를 깎아도 이 주 계산은 그대로여야 한다
    const ctx = ctxOf(st, wi, spareOk)
    const fee = p.fee ?? feeOf(w.tier)
    const creditPer = p.credit ? creditWonPer(p.credit.items, fee, p.um) : 0
    const combo = p.fixedFor?.(wi)
    const items = combo ? p.items.filter(x => x.id in combo) : p.items
    // 직접 짜기에서 선물식을 조합에 넣지 않았으면 그 주에는 쓰지 않는다
    const gift = combo && !(GIFT_ID in combo) ? null : p.gift
    const fixed = combo ? Object.fromEntries(Object.entries(combo).filter(([, n]) => n != null)) as Record<string, number> : undefined
    // 실제로 쓸 아이템 몫(use)은 MVP작에서 뺀다. 충전은 한 번에 하니 그 현금은 전체 충전비를 금액 비율로 나눠 센다.
    // MVP작 몫이 없는 주(구매용이 결제액 전부)는 사고팔 것이 없다
    const use = Math.min(w.use ?? 0, w.amount)
    const costAll = costOfCtx(ctx)
    const costOf = use ? (c: number) => (c > 0 ? costAll(c + use) * c / (c + use) : 0) : costAll
    const goal = w.amount - use
    const solved = goal > 0
      ? solve({ target: goal, costOf, fee, um: p.um, mk: p.mk, gift, items, exact: p.exact, creditPer, fixed, bestOnly: p.bestOnly })
      : nothing(fee)
    if (!solved) return null
    spend(st, wi, fund(solved.best.pay + use, ctx))
    out.push({ start: w.start, month: w.month, amount: w.amount, use, tier: w.tier, fee, um: p.um, solved, ctx })
  }
  return out
}

// ---- 결론: 루트 셋 ----

/** 한 주에 고른 조합과 그 충전 내역. credit은 그 주에 턴 크레딧, loss는 크레딧까지 실제로 센 값 */
export interface WeekPick { w: WeekResult; route: Route; funding: Funding; credit: CreditSpend | null; loss: number }
/** 루트 하나: 주마다 판매 n회까지(null이면 제한 없음) */
export interface RoutePick {
  n: number | null
  weeks: WeekPick[]
  cost: number
  back: number
  loss: number
  sales: number
  pay: number
  /** 크레딧: 큐브를 팔아 받은 돈, 끝에 남는 크레딧, 큐브 판매 횟수(경매장 판매 횟수와 따로 센다) */
  creditBack: number
  creditLeft: number
  creditSales: number
}

/** keepRest: 끝에 남는 크레딧을 털지 않고 모아 둔다(마지막에도 가장 효율 좋은 물건만 산다) */
export interface CreditUse { balance: number; items: CreditItem[]; keepRest?: boolean }

/**
 * 판매 횟수 제한(주마다 n회)으로 루트를 고른다. n이 배열이면 주마다 따로 정한 상한이다.
 * 크레딧은 주마다 쌓인 만큼(남아 있던 것 포함) 가장 많이 돌려받게 털고, 남는 건 다음 주로 넘긴다.
 */
export function pickAt(weeks: WeekResult[], n: number | null | (number | null)[], credit: CreditUse | null = null): RoutePick {
  let carry = credit?.balance ?? 0
  // 중간 주에는 크레딧당 가장 많이 받는 물건만 산다. 모자라면 모아 둔다.
  // 마지막 주에 남은 것으로 가장 많이 받는 조합을 사면, 계획 전체를 한 번에 턴 것과 같다
  const top = credit ? [...credit.items].filter(x => x.price > 0 && x.credits > 0).sort((a, b) => b.price / b.credits - a.price / a.credits).slice(0, 1) : []
  const ps: WeekPick[] = weeks.map((w, i) => {
    const k = Array.isArray(n) ? n[i] : n
    const route = k == null ? w.solved.best : w.solved.routeAt(k)
    let spend: CreditSpend | null = null
    if (credit) {
      carry += route.credits
      spend = spendCredits(carry, route.credits, i === weeks.length - 1 && !credit.keepRest ? credit.items : top, w.fee, w.um)
      carry = spend.left
    }
    // 충전 내역은 구매용 몫까지 합친 전체 결제로 만든다. 효율(cost·back·loss)은 MVP작 몫만이다
    return { w, route, funding: fund(route.pay + w.use, w.ctx), credit: spend, loss: route.cost - route.back - (spend?.back ?? 0) }
  })
  const sum = (f: (p: WeekPick) => number) => ps.reduce((a, p) => a + f(p), 0)
  const creditBack = sum(p => p.credit?.back ?? 0)
  return {
    n: Array.isArray(n) ? Math.max(0, ...ps.map(p => p.route.sales)) : n, weeks: ps, cost: sum(p => p.route.cost), back: sum(p => p.route.back) + creditBack, loss: sum(p => p.loss),
    sales: sum(p => p.route.sales), pay: sum(p => p.route.pay),
    creditBack, creditLeft: carry, creditSales: sum(p => p.credit?.sales ?? 0),
  }
}

/**
 * 최저가·최적화·횟수 정하기 세 루트와 판매 횟수별 곡선.
 * curve[n] = 주마다 판매 n회까지로 할 때 전체 잃는 돈 (n은 lo..hi)
 */
/**
 * 주마다 따로: 그 주의 '잃는 돈 + 판매 횟수 × perSale'이 가장 작은 판매 상한.
 * 모든 주에 같은 상한을 걸면, 금액이 큰 주(목표 달성 주)가 작은 주 여럿에 끌려 메소마켓을 크게 섞게 된다
 * (2026-09-29 사용자 제보: 달성 1주 + 유지 52주에서 달성 주 회수율이 89.6% → 80.9%)
 */
/** 회수율: 돌려받는 돈(크레딧 어림값 포함) ÷ 든 현금 */
const rateOfRoute = (r: Route) => r.cost ? (r.back + r.creditEst) / r.cost : 0

export function perWeek(res: WeekResult[], perSale: number, minRate = 0): (number | null)[] {
  return res.map(w => {
    const L = w.solved.lossAt.length - 1
    if (L < 1) return null
    const loss = [Infinity], sales = [0], rate = [0]
    for (let k = 1; k <= L; k++) {
      const ok = Number.isFinite(w.solved.lossAt[k])
      const r = ok ? w.solved.routeAt(k) : null
      loss.push(r ? r.loss : Infinity); sales.push(r ? r.sales : 0); rate.push(r ? rateOfRoute(r) : 0)
    }
    const k = balancePoint(loss, sales, 1, L, perSale, rate, minRate)
    return k >= L ? null : k
  })
}

/** perSale: 판매 1회 수고비. 최적화 루트는 주마다, 한 번 덜 팔 때 이보다 더 내야 하면 줄이지 않는다 */
/** 최적화로 고를 구간 하나: 그 구간의 주(순서), 판매 1회 수고비, 회수율 하한(%) */
export interface KneePhase { idx: number[]; perSale: number; minRate: number }

/**
 * 여러 주의 최적화 상한을 구간(달성·유지)마다 고른다. base는 다른 주(최저가·횟수 정하기 등)의 상한이다.
 * 회수율 하한은 주마다 크레딧 어림값으로 먼저 지키고, 그다음 화면과 똑같이 센 구간 회수율로 다시 확인한다.
 * 화면은 크레딧을 실제로 큐브를 산 주에 센다(달성 주에 쌓인 크레딧이 유지 주에 쓰이면 달성 회수율은 그만큼 낮다).
 * 구간 회수율이 하한 아래면 그 구간의 주별 기준만 0.1%씩 올려 다시 고른다.
 * 전체가 아니라 구간마다 본다(2026-09-30 사용자 제보: 달성 하한 83%인데 전체 84%로 통과해 달성은 82.1%였다)
 */
export function kneeFit(res: WeekResult[], base: (number | null)[], phases: KneePhase[], credit: CreditUse | null = null): (number | null)[] {
  const ns = [...base]
  const f = phases.map(ph => ph.minRate)
  const fill = (g: number) => {
    const ph = phases[g], w = perWeek(ph.idx.map(i => res[i]), ph.perSale, f[g])
    ph.idx.forEach((i, t) => { ns[i] = w[t] })
  }
  phases.forEach((_, g) => fill(g))
  for (let round = 0; round < 400; round++) {
    const p = pickAt(res, ns, credit)
    let again = false
    phases.forEach((ph, g) => {
      if (!ph.minRate || f[g] > ph.minRate + 20) return
      const ws = ph.idx.map(i => p.weeks[i])
      const cost = ws.reduce((a, w) => a + w.route.cost, 0), back = ws.reduce((a, w) => a + w.route.back + (w.credit?.back ?? 0), 0)
      if (cost && back / cost * 100 < ph.minRate - 1e-9) { f[g] += 0.1; fill(g); again = true }
    })
    if (!again) break
  }
  return ns
}

/**
 * minRate: 최적화 루트의 회수율 하한(%). 0이면 없음.
 * groups: 회수율을 따로 확인할 구간(달성·유지의 주 순서). 없으면 전체 한 구간
 */
export function routesOf(res: WeekResult[], salesN: number, credit: CreditUse | null = null, perSale = 2000, minRate = 0, groups?: number[][]) {
  const hi = Math.max(1, ...res.map(w => w.solved.best.sales))
  // 크레딧을 쓰면 조합은 크레딧 어림값으로 골랐어도, 곡선은 큐브를 실제로 살 수 있는 만큼 산 값으로 그린다.
  // 그래야 그래프와 루트 카드의 숫자가 같다
  const picks: (RoutePick | null)[] = [null]
  const curve: number[] = [Infinity]
  for (let n = 1; n <= hi; n++) {
    const finite = res.every(w => Number.isFinite(w.solved.lossAt[Math.min(n, w.solved.lossAt.length - 1)]))
    const p = finite ? { ...pickAt(res, n >= hi ? null : n, credit), n } : null
    picks.push(p); curve.push(p ? p.loss : Infinity)
  }
  let lo = 1
  while (lo < hi && !Number.isFinite(curve[lo])) lo++
  // 최저가: 실제로 가장 적게 잃는 횟수. 같으면 적게 파는 쪽
  let bn = hi
  for (let k = lo; k <= hi; k++) if (curve[k] < curve[bn] - 0.5) bn = k
  for (let k = lo; k < bn; k++) if (curve[k] <= curve[bn] + 0.5) { bn = k; break }
  const n = Math.max(lo, Math.min(salesN, hi))
  // 최저가·최적화는 주마다 따로 고른다(최저가는 같으면 적게 파는 쪽). 곡선과 횟수 정하기는 모든 주에 같은 상한
  const best = res.length > 1 ? pickAt(res, perWeek(res, 0), credit) : picks[bn]!
  const knee = res.length > 1 ? pickAt(res, kneeFit(res, res.map(() => null), (groups ?? [res.map((_, i) => i)]).map(idx => ({ idx, perSale, minRate })), credit), credit)
    : picks[balancePoint(curve, picks.map(p => p?.sales ?? 0), lo, bn, perSale, picks.map(p => (p?.cost ? p.back / p.cost : 0)), minRate)]!
  return { curve, lo, hi, best, knee, count: picks[n]! }
}
