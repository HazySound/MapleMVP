/**
 * 원본 결제내역과 PC방 보정값으로 화면에 필요한 값을 전부 만들어 낸다.
 * app/api.py의 Base가 하던 일이고, exe와 웹이 같은 코드를 쓴다.
 *
 * 파이썬은 넥슨 수집·저장·캡처 인식만 하고, 규칙 판단은 전부 여기서 한다.
 * 같은 규칙이 두 언어에 흩어져 있으면 반드시 어긋나기 때문이다.
 */
import {
  type Refresh, type Row, type Tier, type TierKey, TIERS, WINDOW, addDays, forecast, grade,
  needFor, needNow, plan as planCalc, replay, tierIndex, tierNow, todayKst, weekStart, weeklyAmounts,
} from './mvp'
import { applyCorrections, missing } from './pcroom'

/** 이월 잔액을 재현할 갱신 횟수. 이 기간 이전의 이월은 0으로 본다. */
export const HISTORY_WEEKS = 52
const SPAN = HISTORY_WEEKS + WINDOW + 1

const key = (t: Tier | null) => (t ? t.key : null)

export interface Base {
  today: string
  thisWeek: string
  starts: string[]          // 13주의 시작일
  purchases: number[]       // 수집한 결제액만 (13주)
  last13: number[]          // 보정까지 더한 금액 (13주)
  carry: number
  weekStartTier: Tier | null
  current: Tier | null
  saved: Record<string, number>
  rows: Row[]
}

export function buildBase(rows: Row[], saved: Record<string, number> = {},
                          now: Date = new Date()): Base {
  const today = todayKst(now)
  const thisWeek = weekStart(today)
  const purchases = weeklyAmounts(rows, thisWeek, SPAN)
  const first = addDays(thisWeek, -7 * (SPAN - 1))
  const allStarts = Array.from({ length: SPAN }, (_, i) => addDays(first, i * 7))
  // PC방 반영액은 구매내역에 안 잡혀서, 사용자가 확인해 준 값을 여기서 더한다
  const amounts = applyCorrections(purchases, allStarts, saved)
  const { tier: weekStartTier, carry } = replay(amounts)
  const last13 = amounts.slice(-WINDOW)
  return {
    today, thisWeek,
    starts: allStarts.slice(-WINDOW),
    purchases: purchases.slice(-WINDOW),
    last13, carry, weekStartTier,
    current: tierNow(last13, carry),
    saved, rows,
  }
}

export interface Sim {
  extra: number
  total: number
  current: TierKey | null
  next: TierKey | null
  carryAfter: number
  carryUsed: number
  carryAdded: number
  keepWeeks: number
  forecast: { sum: number; tier: TierKey | null; carry: number }[]
}

export function simulate(b: Base, extra: number): Sim {
  const w = [...b.last13.slice(0, -1), b.last13[b.last13.length - 1] + extra]
  const f: Refresh[] = forecast(b.last13, b.carry, extra)
  const ci = tierIndex(tierNow(w, b.carry))
  let keep = 0
  for (const r of f) {
    if (ci >= 0 && tierIndex(r.tier) >= ci) keep++
    else break
  }
  return {
    extra,
    total: w.reduce((a, c) => a + c, 0),
    current: key(tierNow(w, b.carry)),
    next: key(f[0].tier),
    carryAfter: f[0].carry,
    carryUsed: f[0].carryUsed,
    carryAdded: f[0].carryAdded,
    keepWeeks: keep,
    forecast: f.map(r => ({ sum: r.sum, tier: key(r.tier), carry: r.carry })),
  }
}

export function makePlan(b: Base, target: TierKey, dateIso: string,
                         fixed: Record<string, number>, skipThisWeek: boolean) {
  const t = Math.round((Date.parse(weekStart(dateIso)) - Date.parse(b.thisWeek)) / (7 * 864e5))
  if (t < 0) return { error: '목표 날짜는 오늘 이후여야 해요.' }
  const tier = TIERS.find(x => x.key === target)!
  const offsets: Record<number, number> = {}
  for (const [k, v] of Object.entries(fixed)) {
    offsets[Math.round((Date.parse(k) - Date.parse(b.thisWeek)) / (7 * 864e5))] = Number(v)
  }
  const p = planCalc(b.last13, tier, t, offsets, skipThisWeek)
  return {
    ...p,
    timeline: p.timeline.map(w => {
      const start = addDays(b.thisWeek, w.offset * 7)
      return { ...w, start, end: addDays(start, 6), tier: key(w.tier) }
    }),
    spentThisWeek: b.last13[b.last13.length - 1],
  }
}

/** 화면이 쓰는 상태 한 덩어리. 예전에 파이썬이 내려 주던 것과 같은 모양이다. */
export function buildState(b: Base) {
  const weeks = b.starts.map((start, i) => ({
    start, end: addDays(start, 6),
    amount: b.last13[i], spent: b.purchases[i], pc: b.last13[i] - b.purchases[i],
  }))
  const recent = [...b.rows].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0)).slice(0, 12)
  const need = {} as Record<TierKey, number>
  const nowNeed = {} as Record<TierKey, number>
  for (const t of TIERS) {
    need[t.key] = needFor(t, b.last13, b.carry)
    nowNeed[t.key] = needNow(t, b.last13, b.carry)
  }
  return {
    thisWeek: b.thisWeek,
    deadline: addDays(b.thisWeek, 7) + 'T00:00:00+09:00',
    tiers: TIERS.map(t => ({ key: t.key, name: t.name, th: t.th })),
    weeks,
    current: key(b.current),
    weekStart: key(b.weekStartTier),
    carry: b.carry,
    need,
    needNow: nowNeed,
    recent,
    sim: simulate(b, 0),
    pcroom: {
      weeks: Object.fromEntries(b.starts.filter(s => s in b.saved).map(s => [s, b.saved[s]])),
      missing: missing(b.starts, b.saved),
      total: b.last13.reduce((a, c, i) => a + c - b.purchases[i], 0),
    },
  }
}

// grade는 여기서 직접 쓰지 않지만, 규칙이 한곳에 모여 있다는 것을 드러내려고 다시 내보낸다
export { grade }
