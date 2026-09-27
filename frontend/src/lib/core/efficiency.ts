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
 * - 상품권은 권 단위로 산다. 5만원권이 먼저, 5만 원이 안 되는 부분은 3천 원 단위. 넘치게 사지 않는다
 * - 권으로 딱 맞지 않는 끝자리는 바코드(이벤트 때만) 또는 일반 충전 1:1
 * - 상품권 한도는 달마다 새로 생긴다(각 20만 원)
 */
import type { TierKey } from './mvp'

export const PG_ID = 'karma'
export const MONTHLY = 200_000
export const BIG = 50_000
export const SMALL = 3_000
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

export interface Card { key: string; name: string; rate: number }
export interface Part {
  name: string
  cash: number
  won: number
  card?: boolean
  /** 5만원권 장수, 3천 원 단위로 채운 금액 */
  big?: number
  small?: number
  /** 바코드로 더 받은 캐시 */
  bonus?: number
  held?: boolean
}
export interface Funding { cost: number; parts: Part[] }

export interface FundCtx {
  /** 이미 충전해 둔 캐시와 그때 쓴 현금 */
  held: { cash: number; won: number }
  /** 이 결제에 쓸 수 있는 상품권 한도(이름 → 남은 금액) */
  limits: Record<string, number>
  /** 쓸 상품권. 싼 것부터 */
  cards: Card[]
  /** 바코드 이벤트. null이면 없음. want가 null이면 남는 금액 전부 */
  barcode: { bonus: number; capLeft: number; want: number | null } | null
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
  for (const k of x.cards) {
    if (left <= 0) break
    const L = x.limits[k.key] ?? 0
    const big = Math.floor(Math.min(left, L) / BIG) * BIG
    const small = Math.floor(Math.min(left - big, L - big) / SMALL) * SMALL
    const use = big + small
    if (use <= 0) continue
    parts.push({ name: k.name, cash: use, won: use * k.rate, card: true, big: big / BIG, small })
    left -= use; cost += use * k.rate
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
  return { cost, parts }
}

// ---- 메이플 크레딧 ----

/** 캐시템을 사면 산 금액의 5%가 메이플 크레딧으로 쌓인다(메이플포인트로 사는 메소마켓 몫은 넣지 않는다) */
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
export interface Sellable extends ShopItem { price: number }
export interface Line { item: Sellable; n: number }
export interface Route {
  /** 이번에 결제하는 캐시 */
  pay: number
  /** 그 캐시에 든 현금 */
  cost: number
  /** 돌려받는 현금 */
  back: number
  loss: number
  /** 경매장 판매 횟수 (메소마켓은 1회로 센다) */
  sales: number
  lines: Line[]
  /** 메이플포인트로 사서 메소마켓에 파는 캐시 */
  market: number
  fee: number
  /** 경매장에서 받는 메소(억, 수수료 뺀 것) */
  meso: number
  /** 캐시템을 사서 쌓이는 메이플 크레딧 */
  credits: number
  /** 그 크레딧의 값(원). 조합을 고를 때 쓰는 어림값이고, 실제로 큐브를 사서 판 값은 루트 단계에서 다시 센다 */
  creditEst: number
}

export interface SolveIn {
  /** 채워야 할 결제 */
  target: number
  costOf: (cash: number) => number
  fee: number
  /** 엄 시세(1억 메소당 원), 메소마켓(1억 메소당 메포) */
  um: number
  mk: number
  items: Sellable[]
  /** 계획을 따를 때는 결제액을 목표와 똑같이 맞춘다 */
  exact: boolean
  /** 크레딧 1개의 값(원). 캐시템을 살 때 쌓이는 크레딧만큼 그 아이템이 더 이득이 된다 */
  creditPer?: number
}

export interface Solved {
  /** 가장 많이 남는 조합(최저가 루트) */
  best: Route
  /** lossAt[k] = 경매장 판매 k회 이하로 할 때 가장 적게 잃는 돈. 안 되면 Infinity. k는 0..best.sales */
  lossAt: number[]
  /** 판매 k회 이하에서 가장 적게 잃는 조합 */
  routeAt: (k: number) => Route
}

/** 판매 횟수를 이만큼까지만 층으로 쌓는다. 그 위는 최저가 루트와 같다고 본다 */
const MAX_LAYERS = 600

export function solve(o: SolveIn): Solved | null {
  const keep = (1 - o.fee) * o.um
  const cp = o.creditPer ?? 0
  // back: 경매장에서 돌려받는 돈, val: 거기에 쌓이는 크레딧 값까지 더한 것(조합 고르기용)
  const usable = o.items.filter(x => x.price > 0).map(x => ({ x, u: Math.round(x.cash / U), back: x.price * keep, val: x.price * keep + x.cash * CREDIT_RATE * cp }))
  const mk1 = o.mk > 0 ? U / o.mk * o.um : 0
  const need = Math.ceil(o.target / U)
  if (need <= 0) return null
  if (!usable.length && !mk1) return null
  const run = (exact: boolean) => {
    const A = exact ? need : need + Math.max(0, ...usable.map(v => v.u))
    const cost = new Float64Array(A + 1)
    for (let a = 0; a <= A; a++) cost[a] = o.costOf(a * U)
    return { A, cost }
  }
  let { A, cost } = run(o.exact)

  const finish = (counts: Map<number, number>, market: number, pay: number): Route => {
    let back = market / U * mk1, sales = market ? 1 : 0, meso = 0, credits = 0
    const lines: Line[] = []
    for (const [j, n] of counts) {
      back += n * usable[j].back; sales += n; meso += n * usable[j].x.price * (1 - o.fee)
      credits += n * usable[j].x.cash * CREDIT_RATE
      lines.push({ item: usable[j].x, n })
    }
    lines.sort((a, b) => b.n * b.item.cash - a.n * a.item.cash)
    const c = cost[pay / U], creditEst = credits * cp
    return { pay, cost: c, back, loss: c - back - creditEst, sales, lines, market, fee: o.fee, meso, credits, creditEst }
  }

  // 최저가 루트. 판매 한 번마다 아주 작은 값을 빼서, 남는 돈이 같으면 적게 파는 쪽을 고른다
  const EPS = 0.01, NEG = -1e18
  const best1 = () => {
    const v = new Float64Array(A + 1).fill(NEG), how = new Int16Array(A + 1).fill(-3), mkIn = new Uint8Array(A + 1)
    v[0] = 0
    for (let a = 1; a <= A; a++) {
      if (mk1 && v[a - 1] > NEG) { v[a] = v[a - 1] + mk1 - (mkIn[a - 1] ? 0 : EPS); how[a] = -2; mkIn[a] = 1 }
      for (let j = 0; j < usable.length; j++) {
        const q = usable[j]
        if (q.u > a || v[a - q.u] <= NEG) continue
        const val = v[a - q.u] + q.val - EPS
        if (val > v[a]) { v[a] = val; how[a] = j; mkIn[a] = mkIn[a - q.u] }
      }
    }
    let pick = -1, net = -Infinity
    for (let a = need; a <= A; a++) if (v[a] > NEG && v[a] - cost[a] > net) { net = v[a] - cost[a]; pick = a }
    if (pick < 0) return null
    const counts = new Map<number, number>(); let m = 0
    for (let a = pick; a > 0;) {
      const h = how[a]
      if (h === -2) { m += U; a-- } else { counts.set(h, (counts.get(h) ?? 0) + 1); a -= usable[h].u }
    }
    return finish(counts, m, pick * U)
  }
  let best = best1()
  if (!best && o.exact) { ({ A, cost } = run(false)); best = best1() }
  if (!best) return null
  const K = best.sales

  // 판매 횟수별: 경매장 k번으로 정확히 a를 만들 때 가장 많이 돌려받는 값을 층층이 쌓는다.
  // 값은 두 층만 들고, 되짚을 선택만 층마다 남긴다. 메소마켓을 쓰면 판매가 1회 늘어난다
  type At = { k: number; a: number; m: number; tot: number }
  const L = Math.min(K, MAX_LAYERS)
  const top = new Array<number>(L + 1).fill(-Infinity)
  const atS = new Array<At | null>(L + 1).fill(null)
  const hows: Int8Array[] = []
  const put = (s: number, val: number, at: At) => { if (s <= L && val > top[s] + 0.5) { top[s] = val; atS[s] = at } }
  const consider = (row: Float64Array, k: number) => {
    for (let a = 0; a <= A; a++) {
      if (row[a] <= NEG) continue
      if (a >= need) put(k, row[a] - cost[a], { k, a, m: 0, tot: a })
      else if (mk1) put(k + 1, row[a] + (need - a) * mk1 - cost[need], { k, a, m: need - a, tot: need })
    }
  }
  let prev = new Float64Array(A + 1).fill(NEG); prev[0] = 0
  consider(prev, 0)
  for (let k = 1; k <= L; k++) {
    const cur = new Float64Array(A + 1).fill(NEG), h = new Int8Array(A + 1).fill(-1)
    for (let a = 1; a <= A; a++) for (let j = 0; j < usable.length; j++) {
      const q = usable[j]
      if (q.u > a || prev[a - q.u] <= NEG) continue
      const val = prev[a - q.u] + q.val
      if (val > cur[a]) { cur[a] = val; h[a] = j }
    }
    hows.push(h); consider(cur, k); prev = cur
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
    const counts = new Map<number, number>()
    for (let i = at.k, a = at.a; i > 0; i--) {
      const j = hows[i - 1][a]
      counts.set(j, (counts.get(j) ?? 0) + 1); a -= usable[j].u
    }
    const r = finish(counts, at.m * U, at.tot * U)
    built.set(k, r)
    return r
  }
  return { best, lossAt, routeAt }
}

/**
 * 판매 횟수 대비 가장 효율적인 지점.
 *
 * 횟수가 늘수록 잃는 돈은 줄지만, 어느 지점부터는 더 팔아도 아끼는 돈이 얼마 안 된다.
 * 양 끝(가장 적게 파는 곳, 최저가 루트)을 이은 직선에서 곡선이 가장 멀리 떨어진 곳을 고른다.
 * 기준선 숫자를 따로 정하지 않고 곡선 모양만 본다. 곡선이 곧으면 꺾이는 곳이 없어 최저가를 돌려준다.
 */
export function knee(loss: number[], lo: number, hi: number): number {
  if (hi <= lo) return hi
  const y0 = loss[lo], y1 = loss[hi]
  if (!(y0 > y1)) return lo
  let pick = hi, far = 1e-9
  for (let k = lo + 1; k < hi; k++) {
    const x = (k - lo) / (hi - lo), y = (loss[k] - y1) / (y0 - y1)
    const d = 1 - x - y
    if (d > far) { far = d; pick = k }
  }
  return pick
}

// ---- 여러 주(계획) 또는 한 번(금액) ----

export interface CardSetting { key: string; name: string; disc: number; on: boolean }
export interface Plan {
  /** 결제할 주. 계획이 없으면 한 줄 */
  weeks: { start: string; amount: number; tier: TierKey | null; month: string }[]
  /** 캐시 잔액. 이미 낸 돈이라 1:1로 센다 */
  balance: number
  cards: CardSetting[]
  /** 이번 달에 남은 상품권 한도. 다음 달부터는 각 20만 원 */
  leftNow: Record<string, number>
  thisMonth: string
  barcode: BarcodeEvent
  barcodeOn: boolean
  barcodeWant: number | null
  /** 주별로 바코드 캐시를 따로 정한 것 */
  weekBarcode: Record<string, number>
  um: number
  mk: number
  items: Sellable[]
  /** 수수료를 직접 정했으면 그 값. 아니면 주마다 오를 등급으로 */
  fee: number | null
  exact: boolean
  /** 크레딧을 쓸지와 크레딧샵 물건. 없으면 크레딧은 계산에 넣지 않는다 */
  credit?: { items: CreditItem[] } | null
}

export interface WeekResult {
  start: string
  month: string
  amount: number
  tier: TierKey | null
  fee: number
  um: number
  solved: Solved
  /** 이 주에 쓸 수 있던 잔액·한도. 어떤 루트든 이것으로 충전 내역을 만든다 */
  ctx: FundCtx
}

export function planAll(p: Plan): WeekResult[] | null {
  const cards: Card[] = p.cards
    .map(c => ({ key: c.key, name: c.name, rate: rateOf(c.disc) ?? 0 }))
    .filter((c, i) => p.cards[i].on && c.rate > 0)
    .sort((a, b) => a.rate - b.rate)
  const monthLeft: Record<string, Record<string, number>> = {}
  const limitsOf = (m: string) => (monthLeft[m] ??= Object.fromEntries(
    p.cards.map(c => [c.key, m === p.thisMonth ? (p.leftNow[c.key] ?? MONTHLY) : MONTHLY])))
  let balance = p.balance, capLeft = p.barcode.cap
  const out: WeekResult[] = []
  for (const w of p.weeks) {
    const limits = limitsOf(w.month)
    const want = w.start in p.weekBarcode ? p.weekBarcode[w.start] : p.barcodeWant
    // 이 주의 사정을 떠 둔다. 뒤 주가 한도를 깎아도 이 주 계산은 그대로여야 한다
    const ctx: FundCtx = {
      held: { cash: balance, won: balance }, limits: { ...limits }, cards,
      barcode: p.barcode.on && p.barcodeOn ? { bonus: p.barcode.bonus, capLeft, want } : null,
    }
    const fee = p.fee ?? feeOf(w.tier)
    const creditPer = p.credit ? creditWonPer(p.credit.items, fee, p.um) : 0
    const solved = solve({ target: w.amount, costOf: c => fund(c, ctx).cost, fee, um: p.um, mk: p.mk, items: p.items, exact: p.exact, creditPer })
    if (!solved) return null
    const f = fund(solved.best.pay, ctx)
    for (const q of f.parts) {
      if (q.card) limits[p.cards.find(c => c.name === q.name)!.key] -= q.cash
      if (q.bonus) capLeft -= q.bonus
      if (q.held) balance -= q.cash
    }
    out.push({ start: w.start, month: w.month, amount: w.amount, tier: w.tier, fee, um: p.um, solved, ctx })
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
 * 판매 횟수 제한(주마다 n회)으로 루트를 고른다.
 * 크레딧은 주마다 쌓인 만큼(남아 있던 것 포함) 가장 많이 돌려받게 털고, 남는 건 다음 주로 넘긴다.
 */
export function pickAt(weeks: WeekResult[], n: number | null, credit: CreditUse | null = null): RoutePick {
  let carry = credit?.balance ?? 0
  // 중간 주에는 크레딧당 가장 많이 받는 물건만 산다. 모자라면 모아 둔다.
  // 마지막 주에 남은 것으로 가장 많이 받는 조합을 사면, 계획 전체를 한 번에 턴 것과 같다
  const top = credit ? [...credit.items].filter(x => x.price > 0 && x.credits > 0).sort((a, b) => b.price / b.credits - a.price / a.credits).slice(0, 1) : []
  const ps: WeekPick[] = weeks.map((w, i) => {
    const route = n == null ? w.solved.best : w.solved.routeAt(n)
    let spend: CreditSpend | null = null
    if (credit) {
      carry += route.credits
      spend = spendCredits(carry, route.credits, i === weeks.length - 1 && !credit.keepRest ? credit.items : top, w.fee, w.um)
      carry = spend.left
    }
    return { w, route, funding: fund(route.pay, w.ctx), credit: spend, loss: route.cost - route.back - (spend?.back ?? 0) }
  })
  const sum = (f: (p: WeekPick) => number) => ps.reduce((a, p) => a + f(p), 0)
  const creditBack = sum(p => p.credit?.back ?? 0)
  return {
    n, weeks: ps, cost: sum(p => p.route.cost), back: sum(p => p.route.back) + creditBack, loss: sum(p => p.loss),
    sales: sum(p => p.route.sales), pay: sum(p => p.route.pay),
    creditBack, creditLeft: carry, creditSales: sum(p => p.credit?.sales ?? 0),
  }
}

/**
 * 최저가·최적화·횟수 정하기 세 루트와 판매 횟수별 곡선.
 * curve[n] = 주마다 판매 n회까지로 할 때 전체 잃는 돈 (n은 lo..hi)
 */
export function routesOf(res: WeekResult[], salesN: number, credit: CreditUse | null = null) {
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
  const kn = Math.min(knee(curve, lo, bn), bn)
  const n = Math.max(lo, Math.min(salesN, hi))
  return { curve, lo, hi, best: picks[bn]!, knee: picks[kn]!, count: picks[n]! }
}
