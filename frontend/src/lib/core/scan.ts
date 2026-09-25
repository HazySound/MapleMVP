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
import { TIERS } from './mvp'
import { MAX_WEEK_MINUTES, TOOLTIP_ROWS, UNIT, compare, minutesOf, restore } from './pcroom'

export interface ScanRaw {
  ok?: boolean
  message?: string
  readings: number[][]    // 툴팁 12줄 후보
  amounts: number[]       // 화면에서 읽은 숫자 후보
  scale: number
}

export interface Solved {
  needs: number[]
  tierTh: number
  total: number | null    // 상단 패널이 가려지면 null (가장 오래된 주만 모른다)
  scale: number
}

const THS = TIERS.map(t => t.th)

/** 이번 주(마지막 줄)만으로 등급 기준이 말이 되는지 본다. */
function tierFits(th: number, lastNeed: number, collected: number[]): boolean {
  const gap = th - lastNeed - collected[collected.length - 1]
  return gap >= 0 && gap % UNIT === 0 && minutesOf(gap) <= MAX_WEEK_MINUTES
}

/** 툴팁 12줄이 그 자체로 앞뒤가 맞는지. 총액을 몰라도 할 수 있는 검증만 쓴다. */
export function acceptReading(v: number[], collected: number[]): boolean {
  if (v.length !== TOOLTIP_ROWS) return false
  for (let i = 0; i < v.length - 1; i++) if (v[i] > v[i + 1]) return false
  // 가운데 주들은 차분이 곧 그 주의 금액이다
  for (let k = 1; k < v.length; k++) {
    const week = v[k] - v[k - 1]
    const spent = collected[k]
    if (week < spent || (week - spent) % UNIT !== 0) return false
  }
  return THS.some(th => tierFits(th, v[v.length - 1], collected))
}

/** 화면에서 읽은 숫자 하나가 '○○ 등급까지'라고 가정했을 때 앞뒤가 맞는지 본다. */
export function totalsFor(needs: number[], collected: number[], amounts: number[]): Set<string> {
  const found = new Set<string>()
  for (let i = 1; i < THS.length; i++) {
    for (const v of amounts) {
      const total = THS[i] - v
      if (total <= 0) continue
      const r = restore(needs, THS[i - 1], total)
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

  // 같은 값이 여러 번 나올수록 믿을 만하다
  const count = new Map<string, number>()
  for (const v of scan.readings) {
    if (acceptReading(v, collected)) count.set(v.join(','), (count.get(v.join(',')) ?? 0) + 1)
  }

  if (!count.size) {
    // 툴팁이 없는 장. 먼저 읽어 둔 값으로 합계만 채운다
    if (!prev) return null
    const found = totalsFor(prev.needs, collected, scan.amounts)
    if (found.size !== 1) return { ...prev, scale: prev.scale }
    const [th, total] = [...found][0].split(':').map(Number)
    return { needs: prev.needs, tierTh: th, total, scale: prev.scale }
  }

  // 검증만으로는 1행 오독이 걸러지지 않는 경우가 있다(앞자리를 놓쳐도 차이가 100의 배수면 통과).
  // 상단 '○○ 등급까지'와 맞춰서 답이 하나로 떨어지는 후보를 우선한다.
  const solved: Solved[] = []
  for (const key of count.keys()) {
    const needs = key.split(',').map(Number)
    const found = totalsFor(needs, collected, scan.amounts)
    if (found.size !== 1) continue
    const [th, total] = [...found][0].split(':').map(Number)
    solved.push({ needs, tierTh: th, total, scale })
  }
  if (solved.length) {
    // 답이 갈리면 믿을 수 없다
    const uniq = new Set(solved.map(s => `${s.needs.join(',')}|${s.total}`))
    return uniq.size === 1 ? solved[0] : null
  }

  // 상단이 가려진 경우. 가장 많이 나온 값을 쓰되, 동점이면 읽지 못한 것으로 본다
  const ranked = [...count.entries()].sort((a, b) => b[1] - a[1])
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null
  const needs = ranked[0][0].split(',').map(Number)
  const fits = THS.filter(th => tierFits(th, needs[needs.length - 1], collected))
  if (fits.length !== 1) return null
  return { needs, tierTh: fits[0], total: null, scale }
}

/** '○○ 등급까지'의 등급 자리와 남은 금액. 화면 입력칸을 채우는 데 쓴다. */
export function panelFields(s: Solved): { tierIndex: number; remaining: number | null } {
  const i = Math.min(THS.indexOf(s.tierTh) + 1, THS.length - 1)
  return { tierIndex: i, remaining: s.total == null ? null : THS[i] - s.total }
}
