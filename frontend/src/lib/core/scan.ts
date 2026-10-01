/**
 * 캡처에서 뽑아 온 숫자 후보 중 맞는 것을 규칙으로 고른다.
 *
 * 파이썬(또는 canvas) 인식기는 임계값과 블러를 바꿔 가며 읽어서 후보를 여럿 내놓는다.
 * 그중 무엇이 맞는지는 '정답을 몰라도 할 수 있는 검증'으로 가린다.
 *   - 유지까지 필요한 금액은 줄어들 수 없다 (단조 비감소)
 *   - 주차별 금액은 음수일 수 없다
 *   - 우리가 수집한 결제액보다 작을 수 없다
 *   - 그 차이는 PC방 단위인 100의 배수여야 한다
 * 실험에서 18개 조합 중 오답은 하나도 이 검증을 통과하지 못했다.
 */
import { BLACK, TIERS } from './mvp'
import {
  MAX_WEEK_MINUTES, NO_CARRY, TOOLTIP_ROWS, UNIT, compare, knownRows, lastWeek, middleWeeks, minutesOf, restore,
} from './pcroom'

export interface ScanRaw {
  ok?: boolean
  message?: string
  readings: number[][]    // 툴팁 12줄 후보
  /** readings마다 몇 번 그렇게 읽혔는지. 없으면 하나씩으로 본다 */
  votes?: number[]
  /** 툴팁 맨 오른쪽 '사용 이월 금액' 열 후보. 없으면 이월을 안 쓴 것으로 본다 */
  carries?: number[][]
  amounts: number[]       // 화면에서 읽은 숫자 후보
  scale: number
  /** 블랙 툴팁 맨 아래 'MVP 블랙 구매 금액 이월'의 지금 잔액. 못 읽으면 null */
  balance?: number | null
}

export interface Solved {
  needs: number[]
  tierTh: number
  total: number | null    // 상단 패널이 가려지거나 블랙이면 null (가장 오래된 주만 모른다)
  /** 툴팁 '사용 이월 금액' 열. 줄마다 그 갱신에서 꺼내 쓸 이월이고 블랙에만 있다 */
  carry: number[]
  scale: number
  /** 블랙이면 지금 이월 잔액(툴팁 맨 아래 줄). 못 읽었으면 null */
  balance?: number | null
  /** 구매내역과 맞춰 보는 검사 없이 표 모양만으로 고른 판독. 인게임이 수집보다 적은 주도 받아들인다 */
  relaxed?: boolean
  /** 상단 '○○ 등급까지'로 볼 수 있는 숫자가 여럿이라 사용자가 골라야 한다. 그동안 total은 null */
  choices?: TotalPick[]
}

/** '○○ 등급까지' 후보 하나: 지금 등급 기준과 거기서 나오는 13주 합계 */
export interface TotalPick { tierTh: number; total: number }

/**
 * 블랙은 위 등급이 없다. 그래서 상단에 '○○ 등급까지'가 아예 없고, 13주 합계를
 * 알아낼 길이 없다. 한 장 더 찍어도 나오지 않으므로 여기서 끝난 것으로 봐야 한다.
 */
export const isTop = (s: Solved) => s.tierTh === BLACK.th

const THS = TIERS.map(t => t.th)
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** 이번 주(마지막 줄)만으로 등급 기준이 말이 되는지 본다. 블랙이 아닐 때만 쓴다. */
function tierFits(th: number, lastNeed: number, collected: number[]): boolean {
  const gap = th - lastNeed - collected[collected.length - 1]
  return gap >= 0 && gap % UNIT === 0 && minutesOf(gap) <= MAX_WEEK_MINUTES
}

/**
 * 툴팁 12줄이 그 자체로 앞뒤가 맞는지. 총액을 몰라도 할 수 있는 검증만 쓴다.
 *
 * black: '사용 이월 금액' 열이 있는 표. 블랙의 이번 주에는 목요일에 꺼내 쓴 이월이
 * 사용 금액으로 채워져 있어 100원 단위로 떨어지지 않는다. 그 주는 음수만 거른다.
 * loose: 13주 중 갱신 때 이월이 쓰인 주. 같은 까닭으로 100원 단위를 묻지 않는다.
 * 0으로 적힌 줄(기준을 넘어 모자란 금액이 없는 줄)은 앞쪽에만 올 수 있고, 그 옆 주는 따지지 않는다.
 */
export function acceptReading(v: number[], collected: number[], carry: number[] = NO_CARRY,
                              black = false, loose: boolean[] = []): boolean {
  if (v.length !== TOOLTIP_ROWS) return false
  const known = knownRows(v, carry, black)
  // 12줄 모두 0: 이번 주 결제만으로 12주 내내 지금 등급이 지켜지는 표다(이번 주에 크게 산 경우).
  // 주별 금액은 알 수 없고 13주 합계(상단 '○○ 등급까지')만 쓴다. 맞춰 볼 가운데 주가 없으니 받아 둔다
  // (2026-09-30 제보: 레드인데 12줄이 전부 0이라 '구매내역 불일치'로 막혔다)
  if (!black && known.every(k => !k)) return true
  if (!known[known.length - 1] || known.some((k, i) => i > 0 && known[i - 1] && !k)) return false
  // 가운데 주들은 차분이 곧 그 주의 금액이다
  const mid = middleWeeks(v, carry)
  for (let k = 1; k <= mid.length; k++) {
    if (!known[k - 1]) continue
    const week = mid[k - 1]
    const spent = collected[k]
    // 블랙은 인게임이 수집보다 적을 수 있다(기준을 넘긴 결제는 이월로만, 9/29 넥슨 차감). 음수만 거른다
    if (black && week < spent) { if (week < 0) return false; continue }
    if (week < spent || (!loose[k] && (week - spent) % UNIT !== 0)) return false
  }
  const last = collected.length - 1
  if (black) return lastWeek(v, BLACK.th, carry) >= 0
  if (loose[last]) return THS.some(th => th - v[v.length - 1] >= collected[last])
  return THS.some(th => tierFits(th, v[v.length - 1], collected))
}

/** 표 오른쪽에 '사용 이월 금액' 열이 읽혔는지. 이 열은 블랙 툴팁에만 있다 */
export const hasCarryColumn = (scan: ScanRaw) =>
  (scan.carries ?? []).some(c => c.length === TOOLTIP_ROWS)

/**
 * 블랙 표에서 '사용 이월 금액' 열 후보 중 맞는 것을 고른다. 블랙이 아니면 이월은 없다.
 * 못 고르면 null.
 *
 * 1주 뒤 줄의 이월은 가운데 주에 영향이 없어 검증만으로는 오독(15,000 → 150처럼 0이 떨어진 것)이
 * 걸러지지 않는다. 화면 하단 'MVP 블랙 구매 금액 이월 N'이 쓰일 이월의 합과 같으므로
 * 화면에서 읽은 숫자 중 합이 같은 후보가 있으면 그것만 남긴다.
 */
export function carryFor(v: number[], collected: number[], carries: number[][] = [],
                         amounts: number[] = [], loose: boolean[] = []): number[] | null {
  const cols = carries.filter(c => c.length === TOOLTIP_ROWS)
  if (!cols.length) return acceptReading(v, collected, NO_CARRY, false, loose) ? NO_CARRY : null
  const fits = cols.filter(c => acceptReading(v, collected, c, true, loose))
  const sure = fits.filter(c => sumOf(c) > 0 && amounts.includes(sumOf(c)))
  const uniq = [...new Set((sure.length ? sure : fits).map(c => c.join(',')))]
  return uniq.length === 1 ? uniq[0].split(',').map(Number) : null
}

/** 이월을 한 푼이라도 쓰는 표인지. 화면에 쓸 말이 갈린다 */
export const usesCarry = (s: Solved) => s.carry.some(n => n > 0)

/**
 * acceptReading이 왜 물렀는지 한 줄로 돌려준다.
 * '맞지 않아요'만으로는 표를 잘못 읽은 건지 받아 둔 결제가 어긋난 건지 알 수 없다.
 */
export function whyReject(v: number[], collected: number[], carry: number[] = NO_CARRY,
                          black = false, loose: boolean[] = []): string {
  const w = (n: number) => n.toLocaleString('ko-KR')
  if (v.length !== TOOLTIP_ROWS) return `표가 ${TOOLTIP_ROWS}줄이 아니라 ${v.length}줄로 읽혔어요.`
  const known = knownRows(v, carry)
  const gap = known.findIndex((k, i) => i > 0 && known[i - 1] && !k)
  if (gap > 0) return `${gap + 1}주 뒤가 0으로 읽혔는데 ${gap}주 뒤는 아니에요. 잘못 읽은 자리가 있어요.`
  const mid = middleWeeks(v, carry)
  for (let k = 1; k <= mid.length; k++) {
    if (!known[k - 1]) continue
    const week = mid[k - 1]
    const spent = collected[k]
    if (week < 0) {
      return `${k}주 뒤(${w(v[k - 1])})가 ${k + 1}주 뒤(${w(v[k])})보다 커요. 잘못 읽은 자리가 있어요.`
    }
    if (week < spent && !black) {
      return `${k + 1}번째 주: 표에서는 ${w(week)}원인데 받아 둔 결제는 ${w(spent)}원이에요.`
    }
    if (week < spent) continue
    if (!loose[k] && (week - spent) % UNIT !== 0) {
      return `${k + 1}번째 주: 차이 ${w(week - spent)}원이 100의 배수가 아니에요.`
    }
  }
  if (black) return `이번 주가 ${w(lastWeek(v, BLACK.th, carry))}원으로 읽혔어요. 잘못 읽은 자리가 있어요.`
  return '어느 등급 기준에도 들어맞지 않아요.'
}

/** 화면에서 읽은 숫자 하나가 '○○ 등급까지'라고 가정했을 때 앞뒤가 맞는지 본다. */
export function totalsFor(needs: number[], collected: number[], amounts: number[],
                          carry: number[] = NO_CARRY, loose: boolean[] = []): Set<string> {
  const mixed = loose.flatMap((l, i) => (l ? [i] : []))
  const found = new Set<string>()
  for (let i = 1; i < THS.length; i++) {
    for (const v of amounts) {
      const total = THS[i] - v
      if (total <= 0) continue
      const r = restore(needs, THS[i - 1], total, null, carry)
      if (!r.ok) continue
      // 0으로 적힌 줄 사이의 주는 하나하나는 모르니 건너뛰고, 묶음의 합으로 따진다
      if (!compare(r.weeks, collected, collected.map(() => ''), r.unknown, mixed).every(g => g.ok)) continue
      const gaps = r.blocks.map(k => {
        let gap = k.sum
        for (let w = k.from; w <= k.to; w++) gap -= collected[w]
        return { gap, mix: loose.slice(k.from, k.to + 1).some(Boolean) }
      })
      if (!gaps.every(g => g.gap >= 0 && (g.mix || g.gap % UNIT === 0))) continue
      found.add(`${THS[i - 1]}:${total}`)
    }
  }
  return found
}

/**
 * totalsFor가 준 후보를 정리한다. 하나면 그것이 답이고, 여럿이면 사용자가 고른다.
 *
 * 화면의 숫자는 위치로 가리지 않고 전부 대 본다. 12줄이 모두 금액이면 엉뚱한 숫자는 거의
 * 걸러지지만, 앞쪽 줄이 0이면 따질 주가 줄어 우연히 통과하는 숫자가 생긴다.
 * 어느 쪽이 맞는지는 인게임 화면을 보는 사람이 가장 확실히 안다. 기준선을 그어 버리면
 * 정말 그만큼 PC방을 한 사람의 답이 사라진다.
 * 보여 줄 순서만 정한다: 0인 줄 사이에서 구매내역으로 설명되지 않는 금액이 적은 것부터.
 */
export function pickTotal(needs: number[], collected: number[], found: Set<string>,
                          carry: number[] = NO_CARRY): TotalPick[] {
  const all = [...found].map(k => { const [tierTh, total] = k.split(':').map(Number); return { tierTh, total } })
  const gapOf = (p: TotalPick) => {
    const r = restore(needs, p.tierTh, p.total, null, carry)
    let gap = 0
    for (const k of r.blocks) { gap += k.sum; for (let w = k.from; w <= k.to; w++) gap -= collected[w] }
    return gap
  }
  return all.map(p => ({ p, gap: gapOf(p) })).sort((a, b) => a.gap - b.gap).map(x => x.p)
}

/**
 * 후보에서 결론을 뽑는다.
 * prev: 먼저 읽어 둔 값. 툴팁이 없는 두 번째 장에서 합계만 채울 때 쓴다.
 */
export function solveScan(scan: ScanRaw, collected: number[], prev: Solved | null = null,
                          loose: boolean[] = []): Solved | null {
  const scale = scan.scale || prev?.scale || 1
  const key = (needs: number[], carry: number[]) => `${needs.join(',')}|${carry.join(',')}`
  const unkey = (k: string): [number[], number[]] => {
    const [n, c] = k.split('|')
    return [n.split(',').map(Number), c.split(',').map(Number)]
  }

  // 같은 값이 여러 번 나올수록 믿을 만하다
  const count = new Map<string, number>()
  scan.readings.forEach((v, i) => {
    const carry = carryFor(v, collected, scan.carries ?? [], scan.amounts, loose)
    if (carry == null) return
    const k = key(v, carry)
    count.set(k, (count.get(k) ?? 0) + (scan.votes?.[i] ?? 1))
  })
  const relaxed = !count.size && !hasCarryColumn(scan) ? relaxedPick(scan, collected, scale, loose.some(Boolean)) : null
  if (relaxed) return relaxed

  if (!count.size) {
    // 툴팁이 없는 장. 먼저 읽어 둔 값으로 합계만 채운다. 블랙은 채울 합계가 화면에 없다
    if (!prev || isTop(prev)) return prev
    const picks = pickTotal(prev.needs, collected, totalsFor(prev.needs, collected, scan.amounts, prev.carry, loose),
                            prev.carry)
    if (!picks.length) return { ...prev, scale: prev.scale }
    if (picks.length > 1) return { ...prev, total: null, choices: picks, scale: prev.scale }
    return { ...prev, ...picks[0], choices: undefined, scale: prev.scale }
  }

  // 가장 많이 나온 값을 쓰되, 동점이면 읽지 못한 것으로 본다
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1])
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1]

  // 블랙: 등급은 이월 열이 말해 주고, 13주 합계는 화면 어디에도 없다
  if (hasCarryColumn(scan)) {
    if (tied) return null
    const [needs, carry] = unkey(ranked[0][0])
    return { needs, tierTh: BLACK.th, total: null, carry, scale, balance: scan.balance ?? prev?.balance ?? null }
  }

  // 검증만으로는 1행 오독이 걸러지지 않는 경우가 있다(앞자리를 놓쳐도 차이가 100의 배수면 통과).
  // 상단 '○○ 등급까지'와 맞춰서 답이 하나로 떨어지는 후보를 우선한다.
  const solved: Solved[] = []
  for (const k of count.keys()) {
    const [needs, carry] = unkey(k)
    const picks = pickTotal(needs, collected, totalsFor(needs, collected, scan.amounts, carry, loose), carry)
    if (!picks.length) continue
    solved.push(picks.length === 1 ? { needs, carry, scale, ...picks[0] }
      : { needs, carry, scale, tierTh: picks[0].tierTh, total: null, choices: picks })
  }
  if (solved.length) {
    // 답이 갈리면 믿을 수 없다
    const uniq = new Set(solved.map(s => `${key(s.needs, s.carry)}|${s.total}|${(s.choices ?? []).map(c => c.total)}`))
    return uniq.size === 1 ? solved[0] : null
  }

  // 상단이 가려진 경우
  if (tied) return null
  const [needs, carry] = unkey(ranked[0][0])
  const fits = THS.filter(th => tierFits(th, needs[needs.length - 1], collected))
  if (fits.length !== 1) return null
  return { needs, tierTh: fits[0], total: null, carry, scale }
}

/**
 * 수집한 결제와 맞춰 보는 검사를 통과한 판독이 하나도 없을 때(블랙 아님).
 * 최근까지 블랙이었던 계정은 갱신 때 꺼내 쓴 이월이 그 주 금액으로 잡혀 인게임 주별 금액이 구매내역과 크게
 * 다르다(100원 단위도 아니고 더 적은 주도 있다). 사이트는 그 이월을 모르니 맞춰 볼 수 없다.
 * 그래서 표 모양만 본다: '유지까지'가 아래로 갈수록 줄지 않고, 0은 앞쪽에만 있는 판독. 그중 하나로 떨어질 때만 쓰고,
 * 합계는 상단 '○○ 등급까지'로 등급마다 후보를 낸다(여럿이면 사용자가 고른다). 주별 차이는 인게임을 믿는다
 * (2026-10-01 제보: 블랙에서 레드로 내려온 계정, 캡처를 계속 못 읽었다)
 */
function relaxedPick(scan: ScanRaw, collected: number[], scale: number, wasBlack: boolean): Solved | null {
  const needs = relaxedShape(scan, collected, wasBlack)
  if (!needs) return null
  const last = needs[needs.length - 1]
  const picks: TotalPick[] = []
  for (let i = 0; i + 1 < THS.length; i++) {
    const th = THS[i]
    const now = th - last
    if (th < last || (now < collected[collected.length - 1] && now !== 0)) continue
    for (const a of scan.amounts) {
      const total = THS[i + 1] - a
      // 캐시 금액은 10원 단위다. 1원 단위로 읽힌 건 화면의 다른 글자를 주운 것이다
      if (a > 0 && a % 10 === 0 && total >= th && !picks.some(p => p.tierTh === th && p.total === total)) picks.push({ tierTh: th, total })
    }
  }
  if (!picks.length) return null
  const carry = NO_CARRY
  if (picks.length === 1) return { needs, carry, scale, ...picks[0], relaxed: true }
  return { needs, carry, scale, tierTh: picks[0].tierTh, total: null, choices: picks, relaxed: true }
}

/**
 * relaxedPick의 앞부분: 표 모양으로 고른 12줄. 합계(상단 '○○ 등급까지')는 따지지 않는다.
 * 표는 읽었는데 상단이 안 찍혀 못 맞춘 경우를 사용자에게 알려 줄 때도 쓴다
 */
export function relaxedShape(scan: ScanRaw, collected: number[], wasBlack: boolean): number[] | null {
  // 줄지 않는 판독 중 가장 많이 나온 것. 동점이면 못 고른다
  const tally = new Map<string, number>()
  scan.readings.forEach((v, i) => {
    if (v.length !== TOOLTIP_ROWS || v[v.length - 1] <= 0 || v.some((n, j) => j > 0 && n < v[j - 1])) return
    const k = v.join(',')
    tally.set(k, (tally.get(k) ?? 0) + (scan.votes?.[i] ?? 1))
  })
  const ranked = [...tally].sort((a, b) => b[1] - a[1])
  if (!ranked.length || (ranked.length > 1 && ranked[0][1] === ranked[1][1])) return null
  const needs = ranked[0][0].split(',').map(Number)
  // 이월 때문에 인게임이 수집보다 적은 주가 생긴다. 결제가 통째로 이월로 가면 0원이다. 조금만 모자라면
  // (19,900 vs 20,000) 숫자를 잘못 읽은 것이다. 다만 사이트 기록으로도 13주 안에 이월을 쓴 계정(wasBlack)은
  // 기준을 넘긴 주가 일부만 남고, 넥슨이 9/29에 걷어낸 주는 아무 금액이나 된다(2026-10-01 제보: 300,000 → 277,810).
  // 그때는 캐시 금액이라 10원 단위인지만 본다
  const known = knownRows(needs)
  const mid = middleWeeks(needs)
  for (let k = 1; k <= mid.length; k++) {
    if (known[k - 1] && mid[k - 1] < collected[k] && (wasBlack ? mid[k - 1] % 10 : mid[k - 1]) !== 0) return null
  }
  return needs
}

/**
 * '○○ 등급까지'의 등급 자리와 남은 금액. 화면 입력칸을 채우는 데 쓴다.
 * 블랙이면 위 등급이 없어 자리가 THS 밖(= 목록 길이)으로 나간다.
 */
export function panelFields(s: Solved): { tierIndex: number; remaining: number | null } {
  const i = THS.indexOf(s.tierTh) + 1
  return { tierIndex: i, remaining: s.total == null || i >= THS.length ? null : THS[i] - s.total }
}
