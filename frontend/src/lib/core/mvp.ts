/**
 * MVP 주차·등급·이월 계산. 입출력 없는 순수 함수만 둔다.
 * app/mvp.py를 그대로 옮긴 것이고, 테스트도 같은 경우를 쓴다.
 */

export interface Tier { key: TierKey; name: string; th: number }
export type TierKey = 'bronze' | 'silver' | 'gold' | 'diamond' | 'red' | 'black'

export const WINDOW = 13
export const CARRY_MAX = 10_000_000

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

export interface Row { date: string; item: string; price: number; id?: string }

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

/**
 * 13주 합계와 이월 잔액으로 등급을 정한다.
 * 블랙 기준을 넘으면 초과분이 이월된다. newest(직전에 끝난 주의 결제)를 넘겨받으면
 * 그 주 결제분까지만 쌓는다. 기준에 못 미치면 이월로 부족분을 메운다.
 */
export function grade(total: number, carry: number, newest = 0): Refresh {
  if (total >= BLACK.th) {
    const added = Math.min(CARRY_MAX, carry + Math.min(newest, total - BLACK.th)) - carry
    return { sum: total, tier: BLACK, carry: carry + added, carryUsed: 0, carryAdded: added }
  }
  const shortage = BLACK.th - total
  if (carry >= shortage) {
    return { sum: total, tier: BLACK, carry: carry - shortage, carryUsed: shortage, carryAdded: 0 }
  }
  return { sum: total, tier: tierOf(total + carry), carry: 0, carryUsed: carry, carryAdded: 0 }
}

/**
 * amounts(오래된 주 → 이번 주)로 지난 목요일 갱신들을 재현한다.
 * 등급 기준은 "이번 주 포함 최근 13주"라서, 목요일 0시에는 새 주가 0원이므로
 * 앞선 12주 합계로 등급이 정해진다. 이월은 데이터 시작 시점에 0이었다고 본다.
 */
export function replay(amounts: number[]): { tier: Tier | null; carry: number } {
  let carry = 0
  let tier: Tier | null = null
  for (let k = WINDOW - 1; k < amounts.length; k++) {
    const prev12 = amounts.slice(k - WINDOW + 1, k)
    const sum = prev12.reduce((a, b) => a + b, 0)
    const r = grade(sum, carry, prev12.length ? prev12[prev12.length - 1] : 0)
    carry = r.carry
    tier = r.tier
  }
  return { tier, carry }
}

/** 지금 등급. 이번 주 결제까지 더한 13주 합계로 바로 정해진다. */
export function tierNow(last13: number[], carry: number): Tier | null {
  const sum = last13.reduce((a, b) => a + b, 0)
  return grade(sum, carry, last13[last13.length - 1]).tier
}

/**
 * 이번 주에 extra를 더 쓰고 그 뒤로 결제가 없을 때, 다음 목요일부터 13번의 갱신 결과.
 * 갱신 때마다 가장 오래된 주가 빠지고 새 주는 0원으로 들어온다.
 */
export function forecast(last13: number[], carry: number, extra = 0): Refresh[] {
  const w = [...last13.slice(0, -1), last13[last13.length - 1] + extra]
  const out: Refresh[] = []
  for (let k = 0; k < WINDOW; k++) {
    // 직전에 끝난 주는 첫 갱신에서만 결제가 있다
    const sum = w.slice(k + 1).reduce((a, b) => a + b, 0)
    const r = grade(sum, carry, k === 0 ? w[w.length - 1] : 0)
    carry = r.carry
    out.push(r)
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
}

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
}

/**
 * t주 뒤(0 = 이번 주) 그 주의 13주 합계가 target 기준에 닿도록 결제 계획을 세운다.
 * fixed: 주 오프셋 → 직접 정한 추가 결제 금액. 나머지 주에는 부족분을 균등하게 나눈다.
 * 이월은 목요일 갱신 때 부족분을 메우는 데만 쓰여서 여기서는 넣지 않는다.
 */
export function plan(last13: number[], target: Tier, t: number, fixed: Record<number, number>,
                     skipThisWeek = false, unit = 1000): PlanResult {
  const first = Math.max(0, t - (WINDOW - 1))      // 목표 주의 13주 안에 드는 첫 계획 주
  const weeks: number[] = []
  for (let o = first; o <= t; o++) if (!(skipThisWeek && o === 0)) weeks.push(o)

  /** o주 뒤의 13주 안에 드는 이미 끝난(또는 진행 중인) 주 결제 합. */
  const past = (o: number) => {
    let s = 0
    for (let k = o - (WINDOW - 1); k <= 0; k++) {
      const i = WINDOW - 1 + k
      if (i >= 0) s += last13[i]
    }
    return s
  }

  const base = past(t)
  const required = Math.max(0, target.th - base)
  const fx: Record<number, number> = {}
  for (const [k, v] of Object.entries(fixed)) {
    const o = Number(k)
    if (weeks.includes(o)) fx[o] = Math.max(0, v)
  }
  const fixedSum = Object.values(fx).reduce((a, b) => a + b, 0)
  const free = weeks.filter(o => !(o in fx))
  const remaining = required - fixedSum
  const auto = free.length ? ceilUnit(Math.max(0, remaining), unit * free.length) / free.length : 0
  const amounts: Record<number, number> = {}
  for (const o of weeks) amounts[o] = o in fx ? fx[o] : auto

  const timeline: PlanWeek[] = []
  for (let o = 0; o <= t; o++) {
    let s = past(o)
    for (let k = Math.max(0, o - (WINDOW - 1)); k <= o; k++) s += amounts[k] ?? 0
    // 이 주 목요일에 13주 밖으로 밀려나는 주의 결제
    const drop = o >= 1 && o <= WINDOW ? last13[o - 1] : (amounts[o - WINDOW] ?? 0)
    timeline.push({
      offset: o, amount: amounts[o] ?? 0, fixed: o in fx, counts: weeks.includes(o),
      skipped: skipThisWeek && o === 0, sum: s, tier: tierOf(s), drop,
    })
  }
  const hit = timeline.find(w => w.sum >= target.th)
  const planned = Object.values(amounts).reduce((a, b) => a + b, 0)
  return {
    base,
    required,
    equalPer: weeks.length ? ceilUnit(required, unit * weeks.length) / weeks.length : 0,
    weeksCount: weeks.length,
    fixedSum,
    autoPer: auto,
    autoCount: free.length,
    shortfall: free.length ? 0 : Math.max(0, remaining),
    surplus: Math.max(0, planned - required),
    planned,
    reached: hit ? hit.offset : null,
    timeline,
  }
}
