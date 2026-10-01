/**
 * 원본 결제내역과 PC방 보정값으로 화면에 필요한 값을 전부 만들어 낸다.
 * app/api.py의 Base가 하던 일이고, exe와 웹이 같은 코드를 쓴다.
 *
 * 파이썬은 넥슨 수집·저장·캡처 인식만 하고, 규칙 판단은 전부 여기서 한다.
 * 같은 규칙이 두 언어에 흩어져 있으면 반드시 어긋나기 때문이다.
 */
import type { PcFuzzy } from '../format'
import {
  BLACK, CARRY_START, type KeepOpt, type Refresh, type Row, type Tier, type TierKey, TIERS, WINDOW, addDays, forecast, grade,
  needFor, needNow, plan as planCalc, replay, tierIndex, tierNow, todayKst, weekStart, weeklyAmounts,
} from './mvp'
import {
  MAX_WEEK_MINUTES, META, type Restored, UNIT, type WeekPc, applyCorrections, minutesOf, missing, readWeek,
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
  const { tier: weekStartTier, carry, weeks, used } = replay(amounts, fixedOf(allStarts, saved), allStarts,
                                                             { anchor: anchorOf(allStarts, saved) })
  const last13 = weeks.slice(-WINDOW)
  return {
    today, thisWeek,
    starts: allStarts.slice(-WINDOW),
    purchases: purchases.slice(-WINDOW),
    last13, carry, weekStartTier,
    used13: used.slice(-WINDOW),
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
  const groups: { first: number; weeks: number[]; rem: number }[] = []
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
    // 여럿이 남으면 합을 가장 최근 주에 몰아 둔다. 묶음 사이 줄은 툴팁에 0(기준 이상)으로 나왔으니
    // 그 갱신들에서 합계가 기준 밑으로 내려가면 안 된다. 오래된 주에 두면 먼저 빠져서 인게임은 유지인데
    // 사이트는 떨어진다고 보인다(2026-09-29 제보: 네 주 묶음을 첫 주에 두니 다음 주 한 단계 아래, 인게임은 유지)
    else if (open.length > 1) { gaps[open[open.length - 1]] = rem; groups.push({ first: open[0], weeks: open, rem }) }
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
      for (const i of g.weeks) {
        const v = i === g.weeks[g.weeks.length - 1] ? g.rem : 0
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

export function makePlan(b: Base, target: TierKey, dateIso: string,
                         fixed: Record<string, number>, skipThisWeek: boolean, keep: KeepOpt | null = null, unit = 1000) {
  const t = Math.round((Date.parse(weekStart(dateIso)) - Date.parse(b.thisWeek)) / (7 * 864e5))
  if (t < 0) return { error: '목표 날짜는 오늘 이후여야 해요.' }
  const tier = TIERS.find(x => x.key === target)!
  const offsets: Record<number, number> = {}
  for (const [k, v] of Object.entries(fixed)) {
    offsets[Math.round((Date.parse(k) - Date.parse(b.thisWeek)) / (7 * 864e5))] = Number(v)
  }
  // 유지를 켜면 지금 이월도 주마다 따라간다. 안 켜도 등급 칸은 이월로 채워 매긴다
  const p = planCalc(b.last13, tier, t, offsets, skipThisWeek, unit, keep, b.carry)
  return {
    ...p,
    timeline: p.timeline.map(w => {
      const start = addDays(b.thisWeek, w.offset * 7)
      return { ...w, start, end: addDays(start, 6), tier: key(w.tier), thu: w.thu ? key(w.thu) : null }
    }),
    spentThisWeek: b.last13[b.last13.length - 1],
  }
}

/** 화면이 쓰는 상태 한 덩어리. 예전에 파이썬이 내려 주던 것과 같은 모양이다. */
export function buildState(b: Base) {
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
