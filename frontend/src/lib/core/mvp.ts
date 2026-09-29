/**
 * MVP 주차·등급·이월 계산. 입출력 없는 순수 함수만 둔다.
 * app/mvp.py를 그대로 옮긴 것이고, 테스트도 같은 경우를 쓴다.
 */

export interface Tier { key: TierKey; name: string; th: number }
export type TierKey = 'bronze' | 'silver' | 'gold' | 'diamond' | 'red' | 'black'

export const WINDOW = 13
export const CARRY_MAX = 10_000_000
/** 블랙 이월 제도가 시작된 주(목요일). 그 전에는 250만을 넘긴 금액이 그냥 사라졌다 */
export const CARRY_START = '2026-09-17'
/**
 * 넥슨이 '블랙 산정 구매 금액이 이월 금액에 중복 적용되는 현상'을 고친 때(2026-09-24 목 11:59, 공지).
 * 그 전(9/17 주)에는 250만을 넘긴 결제가 합계에도 들고 이월에도 쌓였고, 인게임에 아직 그대로 남아 있다
 * (후속 조치 공지 전). 고친 뒤로는 넘긴 몫이 이월로만 가고, 목요일에 꺼내 쓸 때 그 주 실적이 된다.
 * 앞으로의 결제(예측·목표 계획)는 모두 고친 규칙을 따른다. 지난 기록은 후속 공지가 나오면 맞춘다
 */
export const CARRY_FIX = '2026-09-24'

export const TIERS: Tier[] = [
  { key: 'bronze', name: '브론즈', th: 150_000 },
  { key: 'silver', name: '실버', th: 300_000 },
  { key: 'gold', name: '골드', th: 600_000 },
  { key: 'diamond', name: '다이아', th: 900_000 },
  { key: 'red', name: '레드', th: 1_500_000 },
  { key: 'black', name: '블랙', th: 2_500_000 },
]
export const BLACK = TIERS[TIERS.length - 1]

export function tierOf(amount: number): Tier | null {
  let found: Tier | null = null
  for (const t of TIERS) if (amount >= t.th) found = t
  return found
}

export const tierIndex = (t: Tier | null) => (t ? TIERS.indexOf(t) : -1)

// ---- 날짜: 시간대 함정을 피하려고 ISO 문자열과 UTC만 쓴다 ----
const DAY = 86_400_000
const at = (iso: string) => new Date(iso + 'T00:00:00Z')
export const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (isoStr: string, days: number) => iso(new Date(at(isoStr).getTime() + days * DAY))
export const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / DAY)

/** d가 속한 MVP 주의 시작일(목요일). */
export function weekStart(isoStr: string): string {
  const d = at(isoStr)
  return addDays(isoStr, -((d.getUTCDay() - 4 + 7) % 7)) // 4 = 목요일
}

/** 지금의 한국 날짜. */
export function todayKst(now: Date = new Date()): string {
  return iso(new Date(now.getTime() + 9 * 3_600_000))
}

/**
 * 결제 한 건. date는 MVP 금액에 들어간 날로 본다.
 * bought: 넥슨쇼핑 쿠폰처럼 산 날과 게임에 들어간 날이 다를 때, 인게임에 맞춰 옮기기 전의 원래 날
 */
export interface Row { date: string; item: string; price: number; id?: string; bought?: string }

/** 이번 주를 마지막으로 하는 nWeeks개 주의 결제 합계 (오래된 주 → 이번 주). */
export function weeklyAmounts(rows: Row[], thisWeek: string, nWeeks: number): number[] {
  const first = addDays(thisWeek, -7 * (nWeeks - 1))
  const out = new Array(nWeeks).fill(0)
  for (const r of rows) {
    const gap = daysBetween(first, r.date)
    if (gap < 0) continue
    const i = Math.floor(gap / 7)
    if (i < nWeeks) out[i] += r.price
  }
  return out
}

export interface Refresh {
  sum: number           // 그 시점의 13주 합계
  tier: Tier | null     // 갱신 결과 등급
  carry: number         // 갱신 후 이월 잔액
  carryUsed: number
  carryAdded: number
}

const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/**
 * 목요일 갱신 한 번. total은 새 주가 0원으로 들어온 13주 합계다.
 * 기준에 못 미치면 이월로 부족분을 메운다. 꺼내 쓴 금액은 새 주의 사용 금액으로
 * 채워진다(공지 예시 2 "사용 금액에 채워지나"). 그 몫은 부르는 쪽이 새 주에 더한다.
 */
export function grade(total: number, carry: number): Refresh {
  if (total >= BLACK.th) return { sum: total, tier: BLACK, carry, carryUsed: 0, carryAdded: 0 }
  const used = Math.min(carry, BLACK.th - total)
  return { sum: total, tier: tierOf(total + used), carry: carry - used, carryUsed: used, carryAdded: 0 }
}

/**
 * 한 주 동안 쌓이는 이월. live는 그 주 결제까지 더한 13주 합계, spent는 그 주 결제.
 * 결제로 블랙 기준을 넘는 순간 넘친 만큼이 쌓인다. 목요일까지 기다리지 않는다.
 * (2026-09 블랙 제보: 목요일에 쌓는다고 보면 그사이 빠져나간 주 몫을 놓친다)
 */
export function accrue(live: number, spent: number, carry: number): number {
  return Math.min(CARRY_MAX, carry + over(live, spent)) - carry
}

/** 그 주 결제 중 블랙 기준을 넘긴 몫. 고친 규칙에서는 이만큼이 그 주 금액에서 빠져 이월로만 간다 */
export const over = (live: number, spent: number) => Math.min(spent, Math.max(0, live - BLACK.th))

/**
 * amounts(오래된 주 → 이번 주)로 지난 목요일 갱신들을 재현한다.
 * 등급 기준은 "이번 주 포함 최근 13주"라서, 목요일 0시에는 새 주가 0원이므로
 * 앞선 12주 합계로 등급이 정해진다. 이월은 데이터 시작 시점에 0이었다고 본다.
 *
 * 돌려주는 weeks는 갱신 때 꺼내 쓴 이월까지 채운 주별 금액이다.
 * fixed인 주는 넥슨 툴팁에서 되짚은 값이라 이미 그 몫이 들어 있어 더하지 않는다.
 * used는 주마다 그 주 목요일 갱신에서 꺼내 쓴 이월이다. covered는 그 이월로 블랙을 지켰는지다
 * (지켰으면 모자란 만큼만 썼고, 못 지켰으면 가진 것을 다 썼다).
 *
 * starts를 주면 CARRY_START 전의 주에서는 이월을 쌓지도 쓰지도 않는다.
 * opts.anchor: 그 주가 끝났을 때의 이월을 인게임에서 읽은 값으로 맞춘다.
 * opts.bonus: 처음 이월이 쌓이는 주에 얹을 금액. 13주 밖 PC방처럼 구매내역에 없는 몫을 흉내 낸다.
 */
export function replay(amounts: number[], fixed: boolean[] = [], starts: string[] = [],
                       opts: { anchor?: { k: number; carry: number }; bonus?: number } = {}):
    { tier: Tier | null; carry: number; weeks: number[]; used: number[]; covered: boolean[]; held: number[] } {
  const w = [...amounts]
  const used: number[] = []
  const held: number[] = []   // 그 주가 끝났을 때의 이월
  const covered: boolean[] = []
  let carry = 0
  let bonus = opts.bonus ?? 0
  let tier: Tier | null = null
  for (let k = 0; k < w.length; k++) {
    const on = !starts[k] || starts[k] >= CARRY_START
    const r = grade(sumOf(w.slice(Math.max(0, k - WINDOW + 1), k)), on ? carry : 0)
    carry = on ? r.carry : 0
    tier = r.tier
    used.push(r.carryUsed)
    covered.push(r.carryUsed > 0 && r.tier === BLACK)
    if (!fixed[k]) w[k] += r.carryUsed
    if (on) {
      const added = accrue(sumOf(w.slice(Math.max(0, k - WINDOW + 1), k + 1)), amounts[k], carry)
      carry += added
      if (added > 0 && bonus) { carry = Math.min(CARRY_MAX, carry + bonus); bonus = 0 }
    }
    if (opts.anchor?.k === k) carry = opts.anchor.carry
    held.push(carry)
  }
  return { tier, carry, weeks: w, used, covered, held }
}

/** 지금 등급. 이번 주 결제까지 더한 13주 합계로 바로 정해진다. */
export function tierNow(last13: number[], carry: number): Tier | null {
  return grade(sumOf(last13), carry).tier
}

/**
 * 이번 주에 extra를 더 쓰고 그 뒤로 결제가 없을 때, 다음 목요일부터 13번의 갱신 결과.
 * 갱신 때마다 가장 오래된 주가 빠지고 새 주는 0원으로 들어온다.
 * 이월을 꺼내 쓴 갱신은 그 금액이 새 주에 채워져 13주 동안 합계에 남는다.
 */
export function forecast(last13: number[], carry: number, extra = 0): Refresh[] {
  const w = [...last13.slice(0, -1), last13[last13.length - 1] + extra]
  // extra로 기준을 넘으면 그 몫은 이월로만 간다. 그 주 금액에는 들지 않는다(CARRY_FIX)
  const added = accrue(sumOf(w), extra, carry)
  w[w.length - 1] -= over(sumOf(w), extra)
  carry += added
  const out: Refresh[] = []
  for (let k = 0; k < WINDOW; k++) {
    w.shift()
    const r = grade(sumOf(w), carry)
    carry = r.carry
    w.push(r.carryUsed)
    out.push(k === 0 ? { ...r, carryAdded: added } : r)
  }
  return out
}

/** 다음 목요일에 target 이상이 되려면 이번 주에 더 결제해야 하는 금액. */
export function needFor(target: Tier, last13: number[], carry: number): number {
  const rest = last13.slice(1).reduce((a, b) => a + b, 0)
  return Math.max(0, target.th - rest - carry)
}

/** 지금 당장 target으로 올리려면 더 결제해야 하는 금액. */
export function needNow(target: Tier, last13: number[], carry: number): number {
  const sum = last13.reduce((a, b) => a + b, 0)
  return Math.max(0, target.th - sum - carry)
}

const ceilUnit = (v: number, unit: number) => Math.ceil(v / unit) * unit

export interface PlanWeek {
  offset: number
  amount: number
  fixed: boolean
  counts: boolean
  skipped: boolean
  sum: number
  tier: Tier | null
  drop: number
  /** 달성 뒤 유지 구간의 주. keepPay는 그중 주기에 맞춰 결제하는 주 */
  keep: boolean
  keepPay: boolean
  /** 이 주 목요일 갱신에서 꺼내 쓴 이월(유지를 켰을 때만 센다). 그 주 금액으로 13주 동안 남는다 */
  carryUsed: number
}

/** 달성 뒤에도 등급을 지킬 때: every주마다 한 번 결제, 목표 주 뒤 weeks주 동안 */
export interface KeepOpt { every: number; weeks: number }

/** 고정 금액 때문에 유지가 안 되는 주와 그 주에 모자란 금액 */
export interface KeepBlock { offset: number; missing: number }

export interface PlanResult {
  base: number
  required: number
  equalPer: number
  weeksCount: number
  fixedSum: number
  autoPer: number
  autoCount: number
  shortfall: number
  surplus: number
  planned: number
  reached: number | null
  timeline: PlanWeek[]
  /** 유지를 켰을 때만 */
  keep: {
    every: number
    weeks: number
    /** 자동으로 정한 유지 결제 1회 금액과 그 횟수 */
    per: number
    count: number
    /** 첫 유지 결제 전까지 버티려고 달성 주에 더 얹은 금액(주당) */
    reachExtra: number
    blocked: KeepBlock[]
    /** 처음 이월과 유지 기간 동안 갱신에서 꺼내 쓴 이월 합계 */
    carryStart: number
    carryUsed: number
  } | null
}

/**
 * t주 뒤(0 = 이번 주) 그 주의 13주 합계가 target 기준에 닿도록 결제 계획을 세운다.
 * fixed: 주 오프셋 → 직접 정한 추가 결제 금액. 나머지 주에는 부족분을 균등하게 나눈다.
 * 이월은 목요일 갱신 때 부족분을 메우는 데만 쓰여서 여기서는 넣지 않는다.
 *
 * keep을 주면 달성 뒤 keep.weeks주 동안 매주 13주 합계(그 주 결제까지)가 기준 이상이도록
 * keep.every주마다 같은 금액을 결제하게 짠다. 첫 유지 결제 전까지는 달성 주들의 결제로 버텨야 하므로
 * 모자라면 달성 주 금액도 올린다. 고정 금액 때문에 어떻게 해도 안 되는 주는 blocked로 알려 준다.
 * 유지를 켜면 블랙 이월도 주마다 따라간다(carry = 지금 이월). 250만을 넘긴 몫은 그 주 금액에서 빠져
 * 이월로만 가고(CARRY_FIX), 목요일 갱신에서 모자라면 꺼내 그 주 금액으로 채운다.
 */
export function plan(last13: number[], target: Tier, t: number, fixed: Record<number, number>,
                     skipThisWeek = false, unit = 1000, keep: KeepOpt | null = null, carry = 0): PlanResult {
  const first = Math.max(0, t - (WINDOW - 1))      // 목표 주의 13주 안에 드는 첫 계획 주
  const weeks: number[] = []
  for (let o = first; o <= t; o++) if (!(skipThisWeek && o === 0)) weeks.push(o)
  const end = keep ? t + keep.weeks : t
  const pays = keep ? Array.from({ length: Math.floor(keep.weeks / keep.every) }, (_, k) => t + (k + 1) * keep.every) : []

  /** o주 뒤의 13주 안에 드는 이미 끝난(또는 진행 중인) 주 결제 합. */
  const past = (o: number) => {
    let s = 0
    for (let k = o - (WINDOW - 1); k <= 0; k++) {
      const i = WINDOW - 1 + k
      if (i >= 0) s += last13[i]
    }
    return s
  }
  const inWin = (o: number, k: number) => k <= o && k >= o - (WINDOW - 1)

  const base = past(t)
  const required = Math.max(0, target.th - base)
  const fx: Record<number, number> = {}
  for (const [k, v] of Object.entries(fixed)) {
    const o = Number(k)
    if (weeks.includes(o) || (o > t && o <= end)) fx[o] = Math.max(0, v)
  }
  const fixedSum = weeks.reduce((a, o) => a + (fx[o] ?? 0), 0)
  const free = weeks.filter(o => !(o in fx))
  const remaining = required - fixedSum
  let auto = free.length ? ceilUnit(Math.max(0, remaining), unit * free.length) / free.length : 0

  const amounts: Record<number, number> = {}
  const fill = () => {
    for (const o of weeks) amounts[o] = o in fx ? fx[o] : auto
    for (let o = t + 1; o <= end; o++) amounts[o] = o in fx ? fx[o] : pays.includes(o) ? keepPer : 0
  }
  /** o주의 13주 합계. 자동으로 나눌 주(auto)는 빼고 센다 */
  const known = (o: number, skip: (k: number) => boolean) => {
    let s = past(o)
    for (let k = Math.max(0, o - (WINDOW - 1)); k <= o; k++) if (!skip(k)) s += amounts[k] ?? 0
    return s
  }

  /**
   * 주마다 따라가며 13주 합계를 센다. 이월을 쌓고 목요일 갱신에서 꺼내 쓴다.
   * vals[k]는 (k − 12)주 뒤의 주 금액(갱신 때 채운 이월 포함), sums[o]는 o주 뒤 그 주 결제까지 더한 합계
   */
  const simulate = (amt: (o: number) => number) => {
    const win = [...last13]
    win[WINDOW - 1] += amt(0)
    let c = carry
    c += accrue(sumOf(win), amt(0), c)
    win[WINDOW - 1] -= over(sumOf(win), amt(0))
    const vals = [...win], sums = [sumOf(win)], used = [0]
    for (let o = 1; o <= end; o++) {
      win.shift()
      const r = grade(sumOf(win), c)
      c = r.carry
      const pay = amt(o)
      win.push(r.carryUsed + pay)
      const full = sumOf(win)
      c += accrue(full, pay, c)
      win[WINDOW - 1] -= over(full, pay)
      vals.push(win[WINDOW - 1]); sums.push(sumOf(win)); used.push(r.carryUsed)
    }
    return { vals, sums, used }
  }

  let keepPer = 0, reachExtra = 0
  const blocked: KeepBlock[] = []
  let sim: ReturnType<typeof simulate> | null = null
  if (keep) {
    const freeReach = (k: number) => free.includes(k)
    const freeKeep = pays.filter(o => !(o in fx))
    const amtOf = (a: number, A: number) => (o: number) =>
      o in fx ? fx[o] : o <= t ? (freeReach(o) ? a : 0) : freeKeep.includes(o) ? A : 0
    const ok = (a: number, A: number) => {
      const { sums } = simulate(amtOf(a, A))
      for (let o = t; o <= end; o++) if (sums[o] < target.th) return false
      return true
    }
    // 유지 금액 A마다 버틸 수 있는 가장 작은 달성 금액 a를 찾고, 유지 기간 전체 결제가 가장 적은 것을 고른다.
    // 같으면 A가 큰 쪽(달성 주에 몰지 않고 고르게)
    const aMax = free.length ? ceilUnit(target.th, unit) : 0
    const aTop = aMax / unit
    let best: { a: number; A: number; cost: number } | null = null
    for (let A = 0; A <= (freeKeep.length ? ceilUnit(target.th, unit) : 0); A += unit) {
      if (best && A * freeKeep.length > best.cost) break
      if (!ok(aMax, A)) continue
      let lo = 0, hi = aTop
      while (lo < hi) { const m = (lo + hi) >> 1; if (ok(m * unit, A)) hi = m; else lo = m + 1 }
      const a = lo * unit, cost = a * free.length + A * freeKeep.length
      if (!best || cost <= best.cost) best = { a, A, cost }
      if (a === 0) break
    }
    if (best) {
      reachExtra = Math.max(0, best.a - auto); auto = best.a; keepPer = best.A
    } else {
      // 어떻게 해도 안 된다(고정 때문). 이월 없이 셈한 금액으로 두고 끊기는 주를 알려 준다
      fill()
      const need: { miss: number; nr: number; nk: number }[] = []
      for (let o = t + 1; o <= end; o++) {
        const miss = target.th - known(o, k => freeReach(k) || freeKeep.includes(k))
        if (miss > 0) need.push({ miss, nr: free.filter(k => inWin(o, k)).length, nk: freeKeep.filter(k => inWin(o, k)).length })
      }
      let a = auto
      for (const c of need) if (c.nr) a = Math.max(a, ceilUnit(c.miss / c.nr, unit))
      for (const c of need) if (c.nk) keepPer = Math.max(keepPer, ceilUnit(Math.max(0, c.miss - c.nr * a) / c.nk, unit))
      reachExtra = a - auto; auto = a
    }
    fill()
    sim = simulate(o => amounts[o] ?? 0)
    for (let o = t + 1; o <= end; o++) if (sim.sums[o] < target.th) blocked.push({ offset: o, missing: target.th - sim.sums[o] })
  } else fill()

  const timeline: PlanWeek[] = []
  for (let o = 0; o <= end; o++) {
    let s = past(o)
    for (let k = Math.max(0, o - (WINDOW - 1)); k <= o; k++) s += amounts[k] ?? 0
    // 이 주 목요일에 13주 밖으로 밀려나는 주의 결제
    let drop = o >= 1 && o <= WINDOW ? last13[o - 1] : (amounts[o - WINDOW] ?? 0)
    if (sim) { s = sim.sums[o]; drop = o >= 1 ? sim.vals[o - 1] : 0 }
    const isKeep = o > t
    timeline.push({
      offset: o, amount: amounts[o] ?? 0, fixed: o in fx,
      counts: isKeep ? pays.includes(o) || o in fx : weeks.includes(o),
      skipped: skipThisWeek && o === 0, sum: s, tier: tierOf(s), drop,
      keep: isKeep, keepPay: pays.includes(o), carryUsed: sim?.used[o] ?? 0,
    })
  }
  const hit = timeline.find(w => w.sum >= target.th)
  const planned = Object.values(amounts).reduce((a, b) => a + b, 0)
  const reachPlanned = weeks.reduce((a, o) => a + (amounts[o] ?? 0), 0)
  return {
    base,
    required,
    equalPer: weeks.length ? ceilUnit(required, unit * weeks.length) / weeks.length : 0,
    weeksCount: weeks.length,
    fixedSum,
    autoPer: auto,
    autoCount: free.length,
    shortfall: free.length ? 0 : Math.max(0, remaining),
    surplus: Math.max(0, reachPlanned - required),
    planned,
    reached: hit ? hit.offset : null,
    timeline,
    keep: keep ? { every: keep.every, weeks: keep.weeks, per: keepPer, count: pays.filter(o => !(o in fx)).length, reachExtra, blocked,
      carryStart: carry, carryUsed: sim ? sim.used.reduce((a, b) => a + b, 0) : 0 } : null,
  }
}
