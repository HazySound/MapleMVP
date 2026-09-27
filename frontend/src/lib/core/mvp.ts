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
  return Math.min(CARRY_MAX, carry + Math.min(spent, Math.max(0, live - BLACK.th))) - carry
}

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
  // extra로 기준을 넘으면 그 몫은 바로 쌓인다
  const added = accrue(sumOf(w), extra, carry)
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
