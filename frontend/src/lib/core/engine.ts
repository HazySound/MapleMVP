/**
 * 원본 결제내역과 PC방 보정값으로 화면에 필요한 값을 전부 만들어 낸다.
 * app/api.py의 Base가 하던 일이고, exe와 웹이 같은 코드를 쓴다.
 *
 * 파이썬은 넥슨 수집·저장·캡처 인식만 하고, 규칙 판단은 전부 여기서 한다.
 * 같은 규칙이 두 언어에 흩어져 있으면 반드시 어긋나기 때문이다.
 */
import type { PcFuzzy } from '../format'
import { isCoupon } from './coupons'
import {
  BLACK, CARRY_START, type KeepOpt, type Refresh, type Row, type Tier, type TierKey, TIERS, WINDOW, addDays, forecast, grade,
  needFor, needNow, plan as planCalc, replay, tierIndex, tierNow, todayKst, weekStart, weeklyAmounts,
} from './mvp'
import {
  type Known, MAX_WEEK_MINUTES, META, type Restored, UNIT, type WeekPc, applyCorrections, minutesOf, missing, readWeek,
  unpaid,
} from './pcroom'

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
  /** 그 주 목요일 갱신에서 꺼내 쓴 이월 (13주). 그 금액이 그 주 사용 금액으로 채워진다 */
  used13: number[]
  /**
   * 주마다 목표 계획에 낸 것으로 치는 금액(13주): 구매내역 + 보정. 블랙인 주에서 인게임이 수집보다 적으면(기준을 넘긴 몫이
   * 이월로만 갔다) 이월에 쌓였으니 구매한 금액 그대로 낸 것으로 친다(2026-10-16 사용자: 이월은 마일리지처럼 쌓여 있다)
   */
  paid13: number[]
  /** 그 주가 끝났을 때(이번 주는 지금) 등급 (13주) */
  tier13: (Tier | null)[]
  carry: number
  weekStartTier: Tier | null
  current: Tier | null
  saved: Record<string, number>
  rows: Row[]
}

/** 이월을 재현할 전체 기간의 주 시작일과 수집한 결제 (오래된 주 → 이번 주) */
function span(rows: Row[], thisWeek: string) {
  const first = addDays(thisWeek, -7 * (SPAN - 1))
  return {
    purchases: weeklyAmounts(rows, thisWeek, SPAN),
    allStarts: Array.from({ length: SPAN }, (_, i) => addDays(first, i * 7)),
  }
}

/** 툴팁에서 되짚은 주. 넥슨 값이라 갱신 때 쓴 이월이 이미 들어 있다 */
const fixedOf = (allStarts: string[], saved: Record<string, number>) =>
  allStarts.map(s => { const w = readWeek(saved, s); return !!w && !w.unknown })

/** 인게임 툴팁으로 확인해 둔 이월 잔액 중 가장 최근 것. before보다 앞선 주에서만 찾는다 */
function anchorOf(allStarts: string[], saved: Record<string, number>, before = allStarts.length) {
  for (let k = before - 1; k >= 0; k--) {
    const v = saved[META.carry + allStarts[k]]
    if (v != null) return { k, carry: v }
  }
  return undefined
}

export function buildBase(rows: Row[], saved: Record<string, number> = {},
                          now: Date = new Date()): Base {
  const today = todayKst(now)
  const thisWeek = weekStart(today)
  const { purchases, allStarts } = span(rows, thisWeek)
  // PC방 반영액은 구매내역에 안 잡혀서, 사용자가 확인해 준 값을 여기서 더한다
  const amounts = applyCorrections(purchases, allStarts, saved)
  // 이월은 구매내역만으로는 13주 밖 PC방만큼 어긋날 수 있다. 인게임에서 본 값이 있으면 그걸 믿는다
  const { tier: weekStartTier, carry, weeks, used, held } = replay(amounts, fixedOf(allStarts, saved), allStarts,
                                                             { anchor: anchorOf(allStarts, saved) })
  const last13 = weeks.slice(-WINDOW)
  const tiers = weeks.map((_, k) => grade(weeks.slice(Math.max(0, k - WINDOW + 1), k + 1).reduce((a, x) => a + x, 0), held[k]).tier)
  const paid = amounts.map((a, k) => Math.max(0, tiers[k] === BLACK && a < purchases[k] ? purchases[k] : a))
  return {
    today, thisWeek,
    starts: allStarts.slice(-WINDOW),
    purchases: purchases.slice(-WINDOW),
    last13, carry, weekStartTier,
    used13: used.slice(-WINDOW),
    paid13: paid.slice(-WINDOW),
    tier13: tiers.slice(-WINDOW),
    current: tierNow(last13, carry),
    saved, rows,
  }
}

/**
 * 13주 중 목요일 갱신에서 이월이 쓰였을 수 있는 주. 그 주는 꺼내 쓴 이월이 채워져 100원 단위로 떨어지지 않는다.
 * 구매내역으로 되짚어 쓰인 주(used13)에 더해, 지난번 툴팁으로 확인해 저장한 금액이 100원 단위가 아닌 주도 넣는다.
 * 저장한 값이 들어가면 그 주에 쓰인 이월을 되짚지 못해, 한 번 맞춘 뒤 다시 읽으면 막혔다(2026-10-01 제보)
 */
export function looseWeeks(b: Base): boolean[] {
  return b.used13.map((u, i) => {
    if (u > 0) return true
    const w = readWeek(b.saved, b.starts[i])
    return !!w && !w.unknown && !w.group && w.gapMin % UNIT !== 0
  })
}

/** 13주 주마다 산 것(구매내역 행). 인게임이 적은 주를 물건값으로 설명할 때 쓴다 */
export function weekRows(b: Base): Row[][] {
  return b.starts.map(s => b.rows.filter(r => weekStart(r.date) === s))
}
export const weekItems = (b: Base): number[][] => weekRows(b).map(rs => rs.map(r => r.price))
/** 판독을 견줄 때 함께 볼 것: 주마다 산 물건값과 사이트가 지금 계산한 13주 금액 */
export const knownOf = (b: Base): Known => ({ items: weekItems(b), shop: weekRows(b).map(rs => rs.map(isCoupon)), model: b.last13 })

/**
 * 넥슨이 다음 주로 센 결제를 그 주로 옮긴다. 행 id → 옮길 주 시작일.
 *
 * 인게임이 수집보다 적은 주의 모자란 만큼이 그 주에 산 물건값과 맞고, 바로 다음 주는 꼭 그만큼 더
 * 잡혀 있으면(나머지는 100원 단위) 그 결제가 다음 주로 넘어간 것이다. 안 옮기면 앞 주는 'MVP에 안 들어간
 * 결제', 다음 주는 '100의 배수가 아님'으로 갈려 막힌다(2026-10-03 제보: 9/16 693원이 인게임 9/17 주에).
 * purchaseDate는 한국 시간이라 시간대 탓은 아니다. 왜 넘어가는지는 모른다. 쿠폰을 먼저 옮긴 뒤에 본다
 */
export function placeMoved(b: Base, nexon: number[], skip: number[] = []): Map<string, string> {
  const moves = new Map<string, string>()
  const rows = weekRows(b)
  for (let i = 0; i + 1 < b.starts.length; i++) {
    if (skip.includes(i) || skip.includes(i + 1)) continue
    const short = b.purchases[i] - nexon[i]
    if (short <= 0) continue
    const pick = unpaid(rows[i].map(r => r.price), short)
    if (!pick || pick.some(k => !rows[i][k].id)) continue
    const rest = nexon[i + 1] - b.purchases[i + 1] - short
    if (rest < 0 || rest % UNIT) continue
    for (const k of pick) moves.set(rows[i][k].id!, b.starts[i + 1])
  }
  return moves
}

/** 한 주에 들어갈 수 있는 가장 큰 PC방 반영액 (일주일 내내 접속) */
const PC_CAP = Math.floor(MAX_WEEK_MINUTES / 6) * UNIT

export interface Settled {
  weeks: WeekPc[]           // 13주 (오래된 주 → 이번 주)
  /** 인게임 툴팁으로 확인한 지금 이월 잔액. 블랙이 아니면 0, 툴팁으로 알 수 없으면 null */
  carry: number | null
  /** 이월 규칙으로 되짚었을 때 툴팁과 맞는 경우가 하나도 없었다 */
  conflict: boolean
}

/**
 * 툴팁에서 되짚은 13주를 주별 보정으로 확정한다. 모르는 것은 범위로 남긴다.
 *
 * 가운데 11주는 툴팁이 넥슨 금액을 그대로 주므로 늘 확정이다. 모르는 것은 둘이다.
 *   - 가장 오래된 주: 블랙은 13주 합계가 화면에 없어 이 주 금액을 모른다.
 *   - 이번 주: 목요일 갱신에서 이월을 꺼내 썼으면 그 금액이 이 주 사용 금액으로 채워져 있어,
 *     PC방이 얼마인지는 그때 모자란 금액(= 가장 오래된 주에 달렸다)을 알아야 나온다.
 * 그래서 가장 오래된 주 금액을 100원씩 대 보며 이월 규칙으로 처음부터 재현하고,
 * 인게임이 보여 준 이월 잔액과 원 단위까지 맞는 경우만 남긴다.
 * 구매내역에 없는 13주 밖 PC방은 이월이 처음 쌓이는 주에 얹는 금액(bonus)으로 흉내 낸다.
 *
 * 툴팁에 0으로 적힌 줄이 있으면 그 사이 주는 합만 안다(r.blocks). 지난 스캔에서 확정해 둔 주로
 * 채우고 남은 금액을 역산한다. 한 주만 남으면 확정이고, 여럿이 남으면 '합만 아는 묶음'으로 둔다.
 * 0인 줄은 가장 오래된 주 쪽에 몰리는데, 그 주들은 몇 주 전 스캔에서 최근 주로 확정됐기 쉽다.
 *
 * r: 툴팁에서 되짚은 13주(core/pcroom restore). unknown 자리의 금액은 쓰지 않는다.
 * carryNow: 블랙이면 1주 뒤 줄에서 읽은 이월 잔액. 블랙이 아니면 0이다(떨어졌다면 다 썼다).
 *   1주 뒤 '유지까지'가 0이면 이월이 남아서 잔액을 알 수 없다. 그때는 null로 맞춰 보지 않는다.
 */
export function settleScan(b: Base, r: Pick<Restored, 'weeks' | 'unknown' | 'blocks' | 'floor'>,
                           carryNow: number | null): Settled {
  const st = settleOpen(b, r, carryNow)
  // 블랙의 가장 오래된 주를 끝내 못 정했으면 최솟값부터의 범위로 둔다(저장 금액은 최솟값). 비워 두면 13주 합계가
  // 기준에 못 미쳐 인게임은 블랙인데 사이트는 한 단계 아래로 보인다. 9/17 전 결제로 기준을 넘긴 블랙은
  // 합계가 기준보다 클 수 있어 위는 열어 둔다. 수집한 결제보다 적게 잡지는 않는다
  if (r.floor != null && st.weeks[0].unknown) {
    const gap = Math.max(0, r.floor - b.purchases[0])
    const hi = Math.max(gap, PC_CAP)
    st.weeks[0] = { start: b.starts[0], gapMin: gap, gapMax: hi, pcMin: gap, pcMax: hi, unknown: false }
  }
  return st
}

function settleOpen(b: Base, r: Pick<Restored, 'weeks' | 'unknown' | 'blocks'>,
                    carryNow: number | null): Settled {
  const { purchases, allStarts } = span(b.rows, b.thisWeek)
  const off = SPAN - WINDOW
  const last = WINDOW - 1
  const gaps = r.weeks.map((v, i) => v - b.purchases[i])
  const steps = (lo: number, hi: number) =>
    Array.from({ length: Math.floor((hi - lo) / UNIT) + 1 }, (_, i) => lo + i * UNIT)
  /** 지난 스캔에서 금액까지 확정해 둔 주 */
  const sure = (i: number) => {
    const w = readWeek(b.saved, b.starts[i])
    return w && !w.unknown && !w.group && w.gapMin === w.gapMax ? w.gapMin : null
  }

  // 합만 아는 묶음을 지난 스캔 값으로 채운다
  const hole = new Set(r.unknown)
  const groups: { first: number; weeks: number[]; rem: number; dist: number[] }[] = []
  for (const blk of r.blocks) {
    const idx = Array.from({ length: blk.to - blk.from + 1 }, (_, t) => blk.from + t)
    let rem = blk.sum - idx.reduce((a, i) => a + b.purchases[i], 0)
    const open: number[] = []
    for (const i of idx) {
      const v = sure(i)
      if (v == null) { open.push(i); continue }
      gaps[i] = v
      rem -= v
    }
    for (const i of idx) { hole.delete(i); if (open.includes(i)) gaps[i] = 0 }
    if (open.length === 1) gaps[open[0]] = rem
    // 여럿이 남으면 묶음 사이 줄(툴팁에 0 = 기준 이상)과 어긋나지 않게 나눈다(spreadGroup)
    else if (open.length > 1) {
      const dist = spreadGroup(rem, open.map(i => b.purchases[i]), true)
      open.forEach((i, k) => (gaps[i] = dist[k]))
      groups.push({ first: open[0], weeks: open, rem, dist })
    }
  }
  // 합도 모르는 앞쪽 주. 지난 스캔 값이 있으면 그것을 쓴다
  for (const i of [...hole]) {
    const v = sure(i)
    if (v != null) { gaps[i] = v; hole.delete(i) }
  }
  const grouped = new Set(groups.flatMap(g => g.weeks))

  // 가장 오래된 주 하나만 모르면 100원씩 대 본다. 지난 스캔에서 범위로 구해 둔 주면 그 안에서만
  const before = readWeek(b.saved, b.starts[0])
  const w0Open = hole.size === 1 && hole.has(0)
  const firsts = !hole.has(0) ? [gaps[0]]
    : !w0Open ? [0]
    : before && !before.unknown && !before.group ? steps(before.gapMin, before.gapMax)
    : steps(0, PC_CAP)

  const base = applyCorrections(purchases, allStarts, b.saved)
  const fixed = fixedOf(allStarts, b.saved)
  for (let i = 0; i < WINDOW; i++) fixed[off + i] = true

  // 지난 스캔에서 범위로만 남긴 주가 막 13주 밖으로 나갔으면, 창 안 갱신 계산에 아직 들어 있다.
  // 그 주도 같이 대 본다. 둘 다 넓으면 셈이 너무 많아 그 주는 최솟값만 쓰고 결과를 넓혀 둔다
  let prev = -1
  for (let k = off - 1; k >= off - WINDOW + 1 && prev < 0; k--) {
    const w = readWeek(b.saved, allStarts[k])
    if (w && (w.unknown || w.gapMax > w.gapMin)) prev = k
  }
  const pw = prev >= 0 ? readWeek(b.saved, allStarts[prev])! : null
  let prevs = !pw ? [0] : pw.unknown ? steps(0, PC_CAP) : steps(pw.gapMin, pw.gapMax)
  const coarse = firsts.length * prevs.length > 20_000
  if (coarse) prevs = [prevs[0]]

  // pcLo·pcHi: 기준을 넘겨 이월로 숨었다가 나중 주에 채워졌을 수 있는 PC방까지 넣은 아래·위 끝
  const fits: { first: number; pc: number[]; pcLo: number[]; pcHi: number[]; covered: boolean[] }[] = []
  // 어느 경우로 되짚든 갱신 때 이월이 있었을 수 있는 주. 맞는 경우를 못 찾았을 때 쓴다
  const risky = Array(WINDOW).fill(false)
  // 어느 경우로 되짚든 기준에 닿았던 주. 맞는 경우를 못 찾았을 때 숨은 PC방을 범위로 둔다
  const hidAny = new Set<number>()
  for (const first of firsts) for (const pv of prevs) {
    const a = [...base]
    if (pw) a[prev] = purchases[prev] + pv
    for (let i = 0; i < WINDOW; i++) {
      a[off + i] = purchases[off + i] + (i === 0 ? first : hole.has(i) ? 0 : gaps[i])
    }
    // 지난 스캔에서 확인한 이월 잔액이 있으면 그 뒤로는 그 값을 믿는다. 이번 주 것은 지금 맞춰 보는 중이라 뺀다
    const anchor = anchorOf(allStarts, b.saved, off + last)
    // 9/17부터 기준(250만)에 닿은 주는 넘긴 결제와 그 주 PC방이 이월로만 갔다. 인게임 주 금액에는 안 보인다.
    // 그런 주를 찾아, 결제만으로 넘긴 몫(적어도 이만큼)을 이월에 더해 되짚는다. PC방은 이월 잔액으로 가린다
    const plain0 = replay(a, fixed, allStarts, { anchor })
    const hid: number[] = []
    const extra = Array(a.length).fill(0)
    for (let i = 1; i < WINDOW; i++) {
      const k = off + i
      if (allStarts[k] < CARRY_START) continue
      const room = BLACK.th - plain0.weeks.slice(k - WINDOW + 1, k).reduce((x, y) => x + y, 0)
      // 그 주 몫(갱신 때 채운 이월 뺀 인게임 금액). 결제보다 적으면 모자란 만큼은 틀림없이 이월로 갔다.
      // 13주 밖 PC방은 구매내역에 없어 room이 조금 크게 보일 수 있다. 한 주 최대 PC방만큼 여유를 둔다
      const own = a[k] - plain0.used[k]
      if (own < purchases[k] || own >= room - PC_CAP) { hid.push(i); extra[k] = Math.max(0, purchases[k] - own) }
    }
    for (const i of hid) hidAny.add(i)
    const run = (bonus: number) => replay(a, fixed, allStarts, { bonus, anchor, extra })
    const plain = hid.length ? run(0) : plain0
    for (let i = 0; i < WINDOW; i++) if (plain.used[off + i] > 0 || plain.held[off + i - 1] > 0) risky[i] = true
    // 13주 밖 PC방 몫. 블랙은 인게임 잔액과의 차이로 정해지고, 아니면 이월이 쓰인 주 금액 안에서 대 본다
    const spentCarry = plain.used.slice(off).map((u, i) => (u > 0 ? (i === 0 ? first : gaps[i]) : 0))
    // 인게임 잔액과 모자란 차이는 13주 밖 PC방(bonus)이거나, 기준에 닿은 주에 숨은 PC방이다. 둘 다 따진다
    const diff = carryNow == null ? 0 : carryNow - plain.carry
    const bonuses = carryNow == null || anchor ? [0]
      : carryNow > 0 ? [...new Set([diff, ...(hid.length ? [0] : [])])]
      : steps(0, Math.max(0, ...spentCarry))
    for (const bonus of bonuses) {
      if (bonus < 0 || bonus % UNIT) continue
      const t = bonus ? run(bonus) : plain
      // 숨은 PC방: 잔액 차이 중 bonus로 설명하지 않은 몫
      const slack = carryNow == null ? 0 : carryNow - t.carry
      if (carryNow != null && (slack < 0 || (slack && (!hid.length || slack % UNIT)))) continue
      // 주마다 PC방 = 넥슨 − 수집 − 그 주 갱신에서 쓴 이월 + 기준을 넘겨 이월로 간 결제
      const pc = b.starts.map((_, i) => (i === 0 ? first : gaps[i]) - t.used[off + i] + extra[off + i])
      if (hid.length === 1) pc[hid[0]] += slack
      const bad = (v: number, i: number) => !hole.has(i) && !grouped.has(i)
        && (v < 0 || v % UNIT > 0 || minutesOf(v) > MAX_WEEK_MINUTES)
      if (pc.some(bad)) continue
      // 숨은 PC방이 어디로 갔는지. 잔액에 남았으면(slack) 숨은 주 중 어딘가다. 나중 갱신에서 꺼내 써서
      // 채워졌으면 그 주 금액에 PC방처럼 보인다(fill). 지난 스캔 잔액이 되짚은 것보다 많았어도 그렇다(jump).
      // 어느 숨은 주인지는 툴팁으로 가릴 수 없어 범위로 둔다. 잔액을 모르면 얼마인지도 모른다
      const h0 = hid[0] ?? WINDOW
      const fills = pc.flatMap((_, i) => (i > h0 && t.used[off + i] > 0 ? [i] : []))
      const jump = anchor && anchor.k > off + h0 ? Math.max(0, t.jump) : 0
      const hidden = carryNow == null ? PC_CAP
        : (hid.length > 1 ? slack : 0) + fills.reduce((x, i) => x + Math.max(0, pc[i]), 0) + jump
      const pcHi = pc.map((v, i) => (hid.includes(i) ? Math.min(PC_CAP, v + hidden) : v))
      const pcLo = pc.map((v, i) => (fills.includes(i) && hid.length ? 0 : v))
      fits.push({ first, pc, pcLo, pcHi, covered: t.covered.slice(off) })
    }
  }

  // 인게임이 수집보다 적은 주(블랙: 이월로만 간 결제, 넥슨 차감)는 PC방이 아니다. 금액만 그대로 맞춘다
  const exact = (i: number): WeekPc => {
    const pc = Math.max(0, gaps[i])
    return { start: b.starts[i], gapMin: gaps[i], gapMax: gaps[i], pcMin: pc, pcMax: pc, unknown: false }
  }
  const weeks = b.starts.map((_, i) => exact(i))
  const unknown = (i: number): WeekPc => ({ ...weeks[i], gapMin: 0, gapMax: 0, pcMin: 0, pcMax: 0, unknown: true })
  /** 모르는 주와 합만 아는 묶음을 결과에 적는다 */
  const holes = () => {
    for (const i of hole) if (i !== 0 || !w0Open) weeks[i] = unknown(i)
    for (const g of groups) {
      for (const [k, i] of g.weeks.entries()) {
        const v = g.dist[k]
        weeks[i] = { start: b.starts[i], gapMin: v, gapMax: v, pcMin: 0,
                     pcMax: Math.max(0, g.rem - g.rem % UNIT), unknown: false, group: b.starts[g.first] }
      }
    }
  }
  const lo = (xs: number[]) => xs.reduce((a, c) => Math.min(a, c), Infinity)
  const hi = (xs: number[]) => xs.reduce((a, c) => Math.max(a, c), -Infinity)
  if (!fits.length) {
    // 규칙으로 맞춰지지 않는다. 구매내역에 없는 13주 밖 PC방이 갱신 합계를 바꿨을 때 그렇다.
    // 금액은 툴팁 그대로 두고, 이월이 있었을 수 있는 첫 주부터는 PC방을 0부터 그 주 금액까지로 둔다.
    // 넓지만 틀리지는 않는다. 100원 단위가 아닌 주도 마찬가지다
    const from = risky.indexOf(true)
    for (let i = 1; i < WINDOW; i++) {
      if (gaps[i] % UNIT || (from >= 0 && i >= from && gaps[i] > 0)) {
        weeks[i] = { ...weeks[i], pcMin: 0, pcMax: Math.max(0, gaps[i] - gaps[i] % UNIT) }
      }
    }
    // 기준에 닿았던 주의 PC방은 이월로 숨었다가 뒤 주에 채워졌을 수 있다. 그 뒤 주들 금액만큼까지 범위로 둔다
    for (const i of hidAny) {
      const later = gaps.slice(i + 1).reduce((x, v) => x + Math.max(0, v), 0)
      weeks[i] = { ...weeks[i], pcMin: 0, pcMax: Math.min(PC_CAP, Math.max(weeks[i].pcMax, later)) }
    }
    if (hole.has(0)) weeks[0] = unknown(0)
    holes()
    return { weeks, carry: carryNow, conflict: true }
  }
  for (let i = 1; i < WINDOW; i++) {
    weeks[i] = { ...weeks[i], pcMin: lo(fits.map(x => x.pcLo[i])), pcMax: hi(fits.map(x => x.pcHi[i])) }
    // 이월로 블랙을 지킨 주는 모자란 만큼만 썼으니, 그 갱신의 12주 합계에 달렸다. 그 안에 스캔한 적
    // 없는 13주 밖 주가 있으면 그 주 PC방을 몰라서 쓰인 이월도 확정할 수 없다. PC방이 많았을수록
    // 덜 쓰였으니 위로만 넓힌다. 못 지킨 주는 가진 이월을 다 썼으니 12주 합계와 상관없다
    const blind = Array.from({ length: WINDOW - 1 }, (_, t) => off + i - WINDOW + 1 + t)
      .some(k => k >= 0 && k < off && (!fixed[k] || (coarse && k === prev)))
    if (blind && fits.some(x => x.covered[i])) weeks[i].pcMax = Math.max(0, gaps[i] - gaps[i] % UNIT)
  }
  const f = fits.map(x => x.first)
  const p0 = fits.map(x => x.pc[0])
  weeks[0] = !hole.has(0) ? { ...weeks[0], pcMin: lo(p0), pcMax: hi(p0) }
    // 위로 막히지 않으면 범위라고 하기엔 의미가 없어 모른다고 둔다
    : !w0Open || hi(f) >= PC_CAP ? unknown(0)
    : { ...weeks[0], gapMin: lo(f), gapMax: hi(f), pcMin: lo(p0), pcMax: hi(p0) }
  holes()
  return { weeks, carry: carryNow, conflict: false }
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

/**
 * 계획의 성격. 목표가 지금 등급보다 높으면 '날짜까지 달성', 같으면 '지금부터 유지',
 * 낮으면 '낮춰서 유지'(결제를 줄여 그 등급으로 내려가되, 그 등급은 끊기지 않게). 낮출 때 지금 등급을 날짜까지 지키는 것은 고를 때만
 */
export type PlanMode = 'reach' | 'keep' | 'hold'

/**
 * holdCur: 낮춰서 유지할 때 지금 등급을 dateIso가 든 주까지 지킨다(그다음 주부터 목표 등급). 끄면 바로 낮춘다.
 * 2026-10-12 문의: '이 날짜부터 골드'를 '그때 골드가 된다'로 읽었다. 기준이 바뀌는 날일 뿐이고, 옛 결제가 남은 동안은 위 등급으로 보인다.
 * 그래서 기본은 바로 낮추고, 실제로 목표 등급이 되는 주(firstAt)와 결제 없이 내려가는 흐름(decay)을 같이 낸다
 *
 * fixed·pins의 이번 주 금액은 그 주 전체 목표(이미 낸 금액 포함)다. 이미 낸 만큼(paid13)을 빼고 남은 금액만 더 낸다.
 * 전에는 이번 주 고정 금액이 '추가분'이라, 고정한 뒤 결제하면 그 금액이 두 번 잡혔다.
 * pins: 세워 둔 계획의 주별 금액(사용자가 정한 고정이 아니다). 계산에서는 고정처럼 묶지만 화면에는 자동으로 보인다.
 * 계획을 세운 뒤 결제해도 목표가 다시 나뉘지 않게 한다(2026-10-16 사용자: 목표는 세운 그대로, 낸 만큼 이번 주 목표에서 빠지게)
 * fresh: 계획을 새로 짤 때. 이번 주에 이미 낸 결제를 빼고 짜서 이번 주 금액이 그 주 전체 목표가 된다.
 * 빼지 않으면 이미 낸 금액 위에 이번 주 몫을 또 얹었다(2026-10-16 사용자: 블랙 유지 매주 20만인데 20만을 낸 뒤 세우니 이번 주 40만)
 */
export function makePlan(b: Base, target: TierKey, dateIso: string,
                         fixed: Record<string, number>, keep: KeepOpt | null = null, unit = 1000,
                         holdCur = false, pins: Record<string, number> = {}, fresh = false) {
  const tAt = Math.round((Date.parse(weekStart(dateIso)) - Date.parse(b.thisWeek)) / (7 * 864e5))
  const tier = TIERS.find(x => x.key === target)!
  // 지금 등급 이하를 고르면 '달성'할 것이 없다. 전에는 날짜까지 손 놓고 기준에 턱걸이하는 계획이 나왔다.
  // 지금부터 유지하는 계획으로 본다(2026-10-04 사용자)
  const ci = tierIndex(b.current), ti = TIERS.indexOf(tier)
  const mode: PlanMode = ti > ci ? 'reach' : ti === ci ? 'keep' : 'hold'
  const useDate = mode === 'reach' || (mode === 'hold' && holdCur)
  if (useDate && tAt < 0) return { error: '목표 날짜는 오늘 이후여야 해요.' }
  const t = mode === 'reach' ? tAt : 0
  const hold = mode === 'hold' && holdCur ? { th: b.current!.th, until: tAt + 1 } : null
  const paid = b.paid13[b.paid13.length - 1]
  const offsetOf = (iso: string) => Math.round((Date.parse(iso) - Date.parse(b.thisWeek)) / (7 * 864e5))
  const toOffsets = (f: Record<string, number>) => {
    const out: Record<number, number> = {}
    for (const [k, v] of Object.entries(f)) {
      const o = offsetOf(k)
      out[o] = o === 0 && !fresh ? Math.max(0, Number(v) - paid) : Number(v)
    }
    return out
  }
  // 유지를 켜면 지금 이월도 주마다 따라간다. 안 켜도 등급 칸은 이월로 채워 매긴다
  // 유지·내려가기 계획은 결제 주마다 모자라는 만큼만 낸다. 같은 금액을 매주 내면 옛 결제가 남은 앞쪽 주에서 한 단계 위로 올라간다
  const k = keep && mode !== 'reach' ? { ...keep, asNeeded: true } : keep
  // 새로 짤 때는 이번 주 결제를 뺀 13주와 이월로 짠다. 이번 주 칸에는 목요일에 채운 이월만 남고, 이번 주에 이월로 간 몫도 뺀다
  const now = b.last13.length - 1
  const last13 = fresh ? [...b.last13.slice(0, now), b.used13[now]] : b.last13
  const carry = fresh ? Math.max(0, b.carry - Math.max(0, paid - (b.last13[now] - b.used13[now]))) : b.carry
  const run = (f: Record<string, number>, tg: Tier, h: typeof hold) => planCalc(last13, tg, t, toOffsets(f), unit, k, carry, h)
  const own = new Set(Object.keys(fixed).map(offsetOf))
  const p = Object.keys(pins).length ? asAuto(run({ ...pins, ...fixed }, tier, hold), own, hold) : run(fixed, tier, hold)
  const rank = (x: Tier | null) => (x ? TIERS.indexOf(x) : -1)
  /** 그 계획에서 목표 등급이 실제로 되는(낮출 때는 목표 등급까지 내려오는) 첫 주. 달성은 목표 등급 이상이 되는 첫 주 */
  const firstAt = (q: ReturnType<typeof planCalc>) => {
    if (mode === 'hold') return q.timeline.find(w => w.offset >= (hold?.until ?? 0) && rank(w.tier) <= ti)?.offset ?? null
    return mode === 'reach' ? q.reached : 0
  }
  const shortOf = (q: ReturnType<typeof planCalc>) => q.shortfall > 0 || (q.keep?.blocked.length ?? 0) > 0
  // 고정한 금액이 있으면 '모두 자동으로 짰다면'을 같이 낸다. 고정 때문에 더 내거나 목표 등급이 늦어지는 걸 알려 준다
  const auto = Object.keys(fixed).length ? run({}, tier, hold) : null
  // 낮출 때는 '지금 등급을 같은 기간 계속 지켰다면'의 금액을 같이 낸다(낮추면 얼마 아끼는지). 고정 없이 견준다
  const stay = mode === 'hold' ? planCalc(b.last13, b.current!, 0, {}, unit, k, b.carry, null) : null
  // 결제를 더 안 하면 언제 몇 등급으로 내려가는지(목요일 갱신마다)
  const decay: { start: string; tier: TierKey | null }[] = []
  let prevTier: TierKey | null = key(b.current)
  forecast(b.last13, b.carry).forEach((r, i) => {
    const tk = key(r.tier)
    if (tk !== prevTier) decay.push({ start: addDays(b.thisWeek, (i + 1) * 7), tier: tk })
    prevTier = tk
  })
  return {
    ...p,
    mode,
    holdCur: !!hold,
    curTier: key(b.current),
    firstAt: firstAt(p),
    decay,
    auto: auto && { planned: auto.planned, firstAt: firstAt(auto), short: shortOf(auto) },
    stay: stay && { planned: stay.planned, short: shortOf(stay) },
    timeline: p.timeline.map(w => {
      const start = addDays(b.thisWeek, w.offset * 7)
      // 그 주 목표. 이번 주는 이미 낸 금액까지 친 전체(정해 둔 금액이 있으면 그 금액, 아니면 낸 금액 + 더 낼 금액)
      const goal = w.offset === 0 ? fixed[start] ?? pins[start] ?? (fresh ? w.amount : paid + w.amount) : w.amount
      return { ...w, start, end: addDays(start, 6), tier: key(w.tier), thu: w.thu ? key(w.thu) : null, goal }
    }),
    /** 이번 주에 이미 낸 금액(구매내역 + 보정, 블랙이면 이월로 간 몫 포함)과 그중 구매내역 */
    spentThisWeek: paid,
    boughtThisWeek: b.purchases[b.purchases.length - 1],
  }
}

/** 세워 둔 계획. 주 시작일 → 그 주 목표 금액. from은 그때의 이번 주. ack: 이번 주 초과분 중 그대로 두기로 한 금액, over: 넘겨받은 초과분 */
/**
 * 세워 둔 계획. basis: 짤 때 쓴 지난 주까지의 자료(basisOf). pin: 이번 주 목표를 정해 두고 짰으면 그 금액
 */
export interface Frozen { v?: number; from: string; weeks: Record<string, number>; ack?: number; over?: number; basis?: string; pin?: number }

/**
 * 계획을 짤 때 쓰는 자료 가운데 이번 주 전까지의 것: 구매내역 개수·합계와 보정값.
 * 이번 주 결제는 짤 때 빼므로 넣지 않는다(이번 주에 사도 계획이 다시 짜이지 않게)
 */
export function basisOf(b: Base): string {
  let n = 0, sum = 0
  for (const r of b.rows) if (r.date < b.thisWeek) { n++; sum += r.price }
  const pc = Object.keys(b.saved).filter(w => w < b.thisWeek).sort().map(w => `${w}=${b.saved[w]}`).join(',')
  return `${n}:${sum}:${pc}`
}
export interface Done { start: string; goal: number; paid: number; tier: TierKey | null }

/**
 * 목요일이 지났다: 세워 둔 계획의 지난 주를 그 주에 낸 금액(paid13)과 견줘 history로 옮긴다.
 * 못 채운 주가 있으면 frozen = null(남은 주에 다시 나눠야 한다. 반드시 반영, 2026-10-16 사용자).
 * 더 낸 금액은 over로 넘겨 반영할지 사용자가 고르게 한다. 그대로 두기로 한 금액(ack)은 빼고 센다
 */
export function rollPlan(b: Base, f: Frozen, history: Done[], keepN = WINDOW): { frozen: Frozen | null; history: Done[] } {
  const weeks = { ...f.weeks }
  const hist = [...history]
  let short = false, over = f.over ?? 0
  for (const s of Object.keys(weeks).sort()) {
    if (s >= b.thisWeek) continue
    const goal = weeks[s]
    delete weeks[s]
    const i = b.starts.indexOf(s)
    if (i < 0 || s < f.from) continue
    const paid = b.paid13[i]
    if (goal || paid) hist.push({ start: s, goal, paid, tier: key(b.tier13[i]) })
    if (paid < goal) short = true
    else over += Math.max(0, paid - goal - (s === f.from ? f.ack ?? 0 : 0))
  }
  return { frozen: short ? null : { ...(f.v ? { v: f.v } : {}), from: b.thisWeek, weeks, ...(over ? { over } : {}) }, history: hist.slice(-keepN) }
}

/**
 * 지난 기록의 낸 금액·등급을 지금 자료로 다시 센다(13주 안의 주만). 구매내역·인게임 맞추기를 안 한 채 주가 넘으면 그때 자료로
 * 미달이 찍혀, 나중에 동기화해도 그대로였다(2026-10-22 사용자). 바뀐 게 없으면 null
 */
export function refreshHistory(b: Base, history: Done[]): Done[] | null {
  let changed = false
  const next = history.map(h => {
    const i = b.starts.indexOf(h.start)
    if (i < 0) return h
    const paid = b.paid13[i], tier = key(b.tier13[i])
    if (paid === h.paid && tier === h.tier) return h
    changed = true
    return { ...h, paid, tier }
  })
  return changed ? next : null
}

/**
 * 묶어 둔 금액(pins)은 계산에서 고정처럼 쓰였지만 사용자가 고정한 것이 아니다. 화면의 고정 표시와
 * '정한 금액 · 자동 나눔' 숫자는 사용자가 고정한 주(own)로만 다시 센다
 */
function asAuto(p: ReturnType<typeof planCalc>, own: Set<number>, hold: { until: number } | null): ReturnType<typeof planCalc> {
  const timeline = p.timeline.map(w => ({ ...w, fixed: own.has(w.offset) }))
  const reach = timeline.filter(w => !w.keep && w.counts)
  const free = reach.filter(w => !w.fixed)
  // 이번 주는 이미 낸 만큼 빠져 다른 주와 금액이 다르다. 다음 주부터의 금액을 '매주' 금액으로 본다
  const later = free.filter(w => w.offset > 0)
  const max = (ws: typeof timeline) => Math.max(0, ...ws.map(w => w.amount))
  const pays = timeline.filter(w => w.keepPay && !w.fixed)
  const split = hold ? hold.until : Infinity
  return {
    ...p,
    timeline,
    fixedSum: reach.filter(w => w.fixed).reduce((a, w) => a + w.amount, 0),
    autoCount: free.length,
    autoPer: max(later.length ? later : free),
    keep: p.keep && {
      ...p.keep,
      per: max(pays.filter(w => w.offset < split)),
      perAfter: hold ? max(pays.filter(w => w.offset >= split)) : max(pays.filter(w => w.offset < split)),
      count: p.keep.asNeeded ? pays.filter(w => w.amount > 0).length : pays.length,
    },
  }
}

/**
 * 합만 아는 묶음(툴팁에 0으로 나온 줄 사이 주들)의 '넥슨 − 수집' 합 rem을 주마다 나눈다. paid: 그 주들의 수집 결제.
 * 0인 줄은 그 갱신 때 합계가 기준 이상이었다는 뜻이라, 묶음 금액이 13주에 오래 남게 나눠야 인게임과 어긋나지 않는다.
 *   - 더할 금액(PC방)은 가장 최근 주에 몰아 둔다. 오래된 주에 두면 먼저 빠져서 인게임은 유지인데 사이트는 떨어진다
 *     (2026-09-29 제보: 네 주 묶음을 첫 주에 두니 다음 주 한 단계 아래, 인게임은 유지)
 *   - 뺄 금액(인게임이 수집보다 적다: MVP에 안 들어간 결제 등)은 오래된 주부터 그 주 결제만큼까지 뺀다. 최근 주에서 빼면
 *     앞 주들이 크게 남았다가 먼저 빠져, 인게임은 0인 줄이 사이트에서는 모자라게 나온다
 *     (2026-10-07 제보: 7/9~8/20 묶음이 수집보다 180,000원 적은데 8/20 주에서 빼니 3~6주 뒤 줄이 31,200~111,200, 인게임은 0)
 * keep=false면 반대쪽 끝(13주에서 가장 빨리 빠지게)으로 나눈다. 다시 맞춰야 하는지 볼 때 쓴다
 */
export function spreadGroup(rem: number, paid: number[], keep = true): number[] {
  const out = paid.map(() => 0)
  if (rem >= 0) { out[keep ? out.length - 1 : 0] = rem; return out }
  let left = -rem
  const order = paid.map((_, i) => i)
  if (!keep) order.reverse()
  for (const i of order) {
    const take = Math.min(left, paid[i])
    out[i] = -take
    left -= take
  }
  // 결제보다 많이 빠질 수는 없지만, 그래도 남으면 마지막 자리에 둔다(합은 지킨다)
  if (left) out[order[order.length - 1]] -= left
  return out
}

/**
 * 인게임 금액을 다시 맞춰야 하는지. 툴팁 앞줄이 0이라 합만 아는 묶음은 그 합을 묶음의 가장 최근 주에 몰아 둔다.
 * 맞출 때 등급에서는 그 줄들이 0이었으니(모자람 없음) 어떻게 나뉘든 그 등급 이하의 12줄은 늘 같다. 뒤에 들어오는 결제·PC방은
 * 더하기만 하니까 그대로다. 그런데 결제로 등급이 오르면 더 높은 기준으로 따지게 되어, 묶음의 주마다 얼마였는지에 따라
 * '유지까지'가 달라진다. 그때 합을 묶음의 첫 주에 둘 때와 마지막 주에 둘 때 지금 등급의 12줄이 다르면 사이트가 맞힐 수 없다.
 * 다시 맞추면 새 툴팁에 그 주들이 숫자로 나온다
 * (2026-10-06 제보: 10/5 실버로 맞춘 뒤 골드가 되자, 묶음에 있던 7/9 주 PC방 8,100원을 몰라 '골드 유지'로 봤다)
 * fixedAt: 마지막으로 맞춘 시각. 그때의 등급은 그때까지의 결제로 다시 셈한다
 */
export function needRecheck(b: Base, fixedAt: number): boolean {
  if (!b.current || !fixedAt) return false
  const saved = b.starts.map(s => readWeek(b.saved, s))
  const groups = [...new Set(saved.flatMap(w => (w?.group ? [w.group] : [])))]
  if (!groups.length) return false
  // 결제 번호 앞에 결제 시각(한국 시간 yyyymmddhhmmss)이 있다. 없으면(넥슨쇼핑 쿠폰) 날짜로만 본다
  const at = new Date(fixedAt + 9 * 3600e3).toISOString().replace(/\D/g, '').slice(0, 14)
  const before = b.rows.filter(r => {
    const m = /^\d{2}(\d{14})/.exec(r.id ?? '')
    return m ? m[1] <= at : r.date <= `${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)}`
  })
  const then = buildBase(before, b.saved, new Date(fixedAt)).current
  if (then && then.th >= b.current.th) return false
  const rows = (w: number[]) => forecast(w, b.carry).slice(0, WINDOW - 1).map(r => Math.max(0, b.current!.th - r.sum - r.carryUsed))
  const now = rows(b.last13).join(',')
  for (const g of groups) {
    const idx = saved.flatMap((w, i) => (w?.group === g ? [i] : []))
    if (idx.length < 2) continue
    const sum = idx.reduce((a, i) => a + saved[i]!.gapMin, 0)
    // 저장해 둔 나눔과 반대쪽 끝으로 나눴을 때 12줄이 갈리면 사이트가 맞힐 수 없다
    const flip = spreadGroup(sum, idx.map(i => b.purchases[i]), false)
    const alt = [...b.last13]
    idx.forEach((i, k) => (alt[i] += flip[k] - saved[i]!.gapMin))
    if (rows(alt).join(',') !== now) return true
  }
  return false
}

/** 화면이 쓰는 상태 한 덩어리. 예전에 파이썬이 내려 주던 것과 같은 모양이다. */
export function buildState(b: Base, fixedAt = 0) {
  const saved = b.starts.map(s => readWeek(b.saved, s))
  // 넥슨 − 수집 = PC방 + 갱신 때 쓴 이월. PC방을 범위로만 아는 주는 최솟값을 PC방으로 둔다
  const weeks = b.starts.map((start, i) => {
    const pc = saved[i]?.pcMin ?? 0
    return { start, end: addDays(start, 6), amount: b.last13[i], spent: b.purchases[i], pc,
             carried: b.last13[i] - b.purchases[i] - pc }
  })
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
      /** 끝내 알 수 없는 주 (블랙 첫 스캔의 가장 오래된 주) */
      unknown: b.starts.filter((_, i) => saved[i]?.unknown),
      /** 금액 자체를 범위로만 아는 주 (블랙 첫 스캔의 가장 오래된 주) */
      hidden: saved.filter(w => w && !w.unknown && !w.group && w.gapMax > w.gapMin).map(w => w!.start),
      /** 금액은 알지만 갱신 때 쓴 이월이 섞여 PC방을 범위로만 아는 주 */
      ranged: saved.filter(w => w && !w.unknown && !w.group && w.gapMax === w.gapMin && w.pcMax > w.pcMin)
        .map(w => w!.start),
      /** 합만 아는 주 (툴팁에 0으로 나온 줄 사이) */
      grouped: saved.filter(w => w?.group).map(w => w!.start),
      /** 주별로 확정하지 못한 주. 묶음은 첫 주 한 줄로 */
      fuzzy: saved.flatMap((w): PcFuzzy[] => {
        if (!w) return []
        if (w.unknown) return [{ start: w.start, kind: 'unknown', min: 0, max: 0 }]
        if (w.group) {
          if (w.group !== w.start) return []
          const end = saved.filter(x => x?.group === w.group).at(-1)!.start
          const sum = saved.reduce((a, x) => a + (x?.group === w.group ? x.gapMin : 0), 0)
          return [{ start: w.start, end, kind: 'group', min: sum, max: sum }]
        }
        return w.pcMax > w.pcMin ? [{ start: w.start, kind: 'range', min: w.pcMin, max: w.pcMax }] : []
      }),
      /** 합만 아는 묶음 때문에 지금 등급의 12줄을 맞힐 수 없다. 인게임 금액을 다시 맞춰야 한다 */
      recheck: needRecheck(b, fixedAt),
      /** PC방이 아니라 수집 못 한 결제(넥슨쇼핑 쿠폰 등)로 넣어 둔 금액. PC방 합계와 따로 센다 */
      missTotal: saved.reduce((a, w) => a + (w?.miss ? w.gapMin : 0), 0),
      // 묶음은 주별로는 모르지만 합은 정확하다. 합을 한 주에 몰아 두었으니 그 금액을 그대로 센다
      total: saved.reduce((a, w) => a + (w?.group ? w.gapMin : w?.pcMin ?? 0), 0),
      totalMax: saved.reduce((a, w) => a + (w?.group ? w.gapMin : w?.pcMax ?? 0), 0),
    },
  }
}

// grade는 여기서 직접 쓰지 않지만, 규칙이 한곳에 모여 있다는 것을 드러내려고 다시 내보낸다
export { grade }
