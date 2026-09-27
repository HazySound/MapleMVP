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
  MAX_WEEK_MINUTES, NO_CARRY, TOOLTIP_ROWS, UNIT, compare, minutesOf, restore, withCarry,
} from './pcroom'

export interface ScanRaw {
  ok?: boolean
  message?: string
  readings: number[][]    // 툴팁 12줄 후보
  /** 툴팁 맨 오른쪽 '사용 이월 금액' 열 후보. 없으면 이월을 안 쓴 것으로 본다 */
  carries?: number[][]
  amounts: number[]       // 화면에서 읽은 숫자 후보
  scale: number
}

export interface Solved {
  needs: number[]
  tierTh: number
  total: number | null    // 상단 패널이 가려지거나 블랙이면 null (가장 오래된 주만 모른다)
  /** 줄마다 쓰이는 이월. 인게임이 '유지까지'에서 미리 빼 둔 금액이고 블랙에만 있다 */
  carry: number[]
  scale: number
}

/**
 * 블랙은 위 등급이 없다. 그래서 상단에 '○○ 등급까지'가 아예 없고, 13주 합계를
 * 알아낼 길이 없다. 한 장 더 찍어도 나오지 않으므로 여기서 끝난 것으로 봐야 한다.
 */
export const isTop = (s: Solved) => s.tierTh === BLACK.th

const THS = TIERS.map(t => t.th)

/** 이번 주(마지막 줄)만으로 등급 기준이 말이 되는지 본다. */
function tierFits(th: number, lastNeed: number, collected: number[]): boolean {
  const gap = th - lastNeed - collected[collected.length - 1]
  return gap >= 0 && gap % UNIT === 0 && minutesOf(gap) <= MAX_WEEK_MINUTES
}

/** 툴팁 12줄이 그 자체로 앞뒤가 맞는지. 총액을 몰라도 할 수 있는 검증만 쓴다. */
export function acceptReading(v: number[], collected: number[], carry: number[] = NO_CARRY): boolean {
  if (v.length !== TOOLTIP_ROWS) return false
  const adj = withCarry(v, carry)
  for (let i = 0; i < adj.length - 1; i++) if (adj[i] > adj[i + 1]) return false
  // 가운데 주들은 차분이 곧 그 주의 금액이다
  for (let k = 1; k < adj.length; k++) {
    const week = adj[k] - adj[k - 1]
    const spent = collected[k]
    if (week < spent || (week - spent) % UNIT !== 0) return false
  }
  return THS.some(th => tierFits(th, adj[adj.length - 1], collected))
}

/**
 * 이 표에 얼마의 이월이 섞여 있는지 고른다. 못 고르면 null.
 *
 * 이월을 안 쓴 것으로 먼저 맞춰 본다. 그것으로 풀리면 블랙이 아니거나 이월이 없는
 * 것이니 더 볼 것이 없다. 안 풀릴 때만 '사용 이월 금액' 열 후보를 대 본다.
 * 여럿이 통과하면 고르지 않는다. 잘못 고르면 그 주 금액이 통째로 틀린다.
 */
export function carryFor(v: number[], collected: number[],
                         carries: number[][] = []): number[] | null {
  if (acceptReading(v, collected)) return NO_CARRY
  if (v.length !== TOOLTIP_ROWS) return null
  // 블랙이 아니면 이월도 없다. 다른 등급에서 이월을 뒤지면 오독이 정답처럼 보인다
  if (!tierFits(BLACK.th, v[v.length - 1], collected)) return null
  const fits = carries.filter(c => c.length === TOOLTIP_ROWS && c.some(n => n > 0)
    && acceptReading(v, collected, c))
  const uniq = [...new Set(fits.map(c => c.join(',')))]
  return uniq.length === 1 ? uniq[0].split(',').map(Number) : null
}

/** 이월을 한 푼이라도 쓰는 표인지. 화면에 쓸 말이 갈린다 */
export const usesCarry = (s: Solved) => s.carry.some(n => n > 0)

/**
 * acceptReading이 왜 물렀는지 한 줄로 돌려준다.
 * '맞지 않아요'만으로는 표를 잘못 읽은 건지 받아 둔 결제가 어긋난 건지 알 수 없다.
 */
export function whyReject(v: number[], collected: number[], carry: number[] = NO_CARRY): string {
  const w = (n: number) => n.toLocaleString('ko-KR')
  if (v.length !== TOOLTIP_ROWS) return `표가 ${TOOLTIP_ROWS}줄이 아니라 ${v.length}줄로 읽혔어요.`
  const adj = withCarry(v, carry)
  for (let i = 0; i < adj.length - 1; i++) {
    if (adj[i] > adj[i + 1]) {
      return `${i + 1}주 뒤(${w(adj[i])})가 ${i + 2}주 뒤(${w(adj[i + 1])})보다 커요. 잘못 읽은 자리가 있어요.`
    }
  }
  // 블랙은 갱신 때 이월에서 자동으로 꺼내 쓴 만큼 1주 뒤 줄이 작게 적힌다.
  // 이월을 모르는 채로는 그 줄만 영영 안 맞으므로, 그 모양이면 짚어 준다
  if (!carry.some(n => n > 0) && tierFits(BLACK.th, v[v.length - 1], collected)
      && acceptReadingFrom(v, collected, 2)) {
    return '블랙 등급이라 1주 뒤 줄에 이월이 섞여 있어요. '
      + "인게임 표 맨 오른쪽 '사용 이월 금액'에 적힌 금액을 넣어 주세요."
  }
  for (let k = 1; k < adj.length; k++) {
    const week = adj[k] - adj[k - 1]
    const spent = collected[k]
    if (week < spent) {
      return `${k + 1}번째 주: 표에서는 ${w(week)}원인데 받아 둔 결제는 ${w(spent)}원이에요.`
    }
    if ((week - spent) % UNIT !== 0) {
      return `${k + 1}번째 주: 차이 ${w(week - spent)}원이 100의 배수가 아니에요.`
    }
  }
  return '어느 등급 기준에도 들어맞지 않아요.'
}

/** from번째 줄부터만 검증한다. 앞줄 하나 때문에 통째로 막힌 것인지 가리는 데 쓴다. */
function acceptReadingFrom(v: number[], collected: number[], from: number): boolean {
  for (let k = from; k < v.length; k++) {
    const week = v[k] - v[k - 1]
    if (week < collected[k] || (week - collected[k]) % UNIT !== 0) return false
  }
  return true
}

/** 화면에서 읽은 숫자 하나가 '○○ 등급까지'라고 가정했을 때 앞뒤가 맞는지 본다. */
export function totalsFor(needs: number[], collected: number[], amounts: number[],
                          carry: number[] = NO_CARRY): Set<string> {
  const found = new Set<string>()
  for (let i = 1; i < THS.length; i++) {
    for (const v of amounts) {
      const total = THS[i] - v
      if (total <= 0) continue
      const r = restore(needs, THS[i - 1], total, null, carry)
      if (!r.ok) continue
      if (compare(r.weeks, collected, collected.map(() => '')).every(g => g.ok)) {
        found.add(`${THS[i - 1]}:${total}`)
      }
    }
  }
  return found
}

/**
 * 후보에서 결론을 뽑는다.
 * prev: 먼저 읽어 둔 값. 툴팁이 없는 두 번째 장에서 합계만 채울 때 쓴다.
 */
export function solveScan(scan: ScanRaw, collected: number[], prev: Solved | null = null): Solved | null {
  const scale = scan.scale || prev?.scale || 1
  const key = (needs: number[], carry: number[]) => `${needs.join(',')}|${carry.join(',')}`
  const unkey = (k: string): [number[], number[]] => {
    const [n, c] = k.split('|')
    return [n.split(',').map(Number), c.split(',').map(Number)]
  }

  // 같은 값이 여러 번 나올수록 믿을 만하다
  const count = new Map<string, number>()
  for (const v of scan.readings) {
    const carry = carryFor(v, collected, scan.carries ?? [])
    if (carry == null) continue
    const k = key(v, carry)
    count.set(k, (count.get(k) ?? 0) + 1)
  }

  if (!count.size) {
    // 툴팁이 없는 장. 먼저 읽어 둔 값으로 합계만 채운다
    if (!prev) return null
    const found = totalsFor(prev.needs, collected, scan.amounts, prev.carry)
    if (found.size !== 1) return { ...prev, scale: prev.scale }
    const [th, total] = [...found][0].split(':').map(Number)
    return { ...prev, tierTh: th, total, scale: prev.scale }
  }

  // 검증만으로는 1행 오독이 걸러지지 않는 경우가 있다(앞자리를 놓쳐도 차이가 100의 배수면 통과).
  // 상단 '○○ 등급까지'와 맞춰서 답이 하나로 떨어지는 후보를 우선한다.
  const solved: Solved[] = []
  for (const k of count.keys()) {
    const [needs, carry] = unkey(k)
    const found = totalsFor(needs, collected, scan.amounts, carry)
    if (found.size !== 1) continue
    const [th, total] = [...found][0].split(':').map(Number)
    solved.push({ needs, tierTh: th, total, carry, scale })
  }
  if (solved.length) {
    // 답이 갈리면 믿을 수 없다
    const uniq = new Set(solved.map(s => `${key(s.needs, s.carry)}|${s.total}`))
    return uniq.size === 1 ? solved[0] : null
  }

  // 상단이 가려졌거나, 블랙이라 그 줄이 애초에 없는 경우.
  // 가장 많이 나온 값을 쓰되, 동점이면 읽지 못한 것으로 본다
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null
  const [needs, carry] = unkey(ranked[0][0])
  const adj = withCarry(needs, carry)
  const fits = THS.filter(th => tierFits(th, adj[adj.length - 1], collected))
  if (fits.length !== 1) return null
  return { needs, tierTh: fits[0], total: null, carry, scale }
}

/**
 * '○○ 등급까지'의 등급 자리와 남은 금액. 화면 입력칸을 채우는 데 쓴다.
 * 블랙이면 위 등급이 없어 자리가 THS 밖(= 목록 길이)으로 나간다.
 */
export function panelFields(s: Solved): { tierIndex: number; remaining: number | null } {
  const i = THS.indexOf(s.tierTh) + 1
  return { tierIndex: i, remaining: s.total == null || i >= THS.length ? null : THS[i] - s.total }
}
