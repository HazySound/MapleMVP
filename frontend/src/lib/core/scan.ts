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
function totalsFor(needs: number[], collected: number[], amounts: number[]): Set<string> {
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
  let needs: number[] | null = null
  let tierTh = 0
  let scale = scan.scale || prev?.scale || 1

  const passed = scan.readings.filter(v => acceptReading(v, collected))
  if (passed.length) {
    // 통과한 것이 여럿이면 가장 많이 나온 값을 쓴다
    const count = new Map<string, number>()
    for (const v of passed) count.set(v.join(','), (count.get(v.join(',')) ?? 0) + 1)
    const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0]
    needs = best.split(',').map(Number)
    const fits = THS.filter(th => tierFits(th, needs![needs!.length - 1], collected))
    tierTh = fits.length ? fits[0] : 0
  } else if (prev) {
    needs = prev.needs
    tierTh = prev.tierTh
    scale = prev.scale
  }
  if (!needs || !tierTh) return null

  const found = totalsFor(needs, collected, scan.amounts)
  if (found.size === 1) {
    const [th, total] = [...found][0].split(':').map(Number)
    return { needs, tierTh: th, total, scale }
  }
  return { needs, tierTh, total: null, scale }
}

/** '○○ 등급까지'의 등급 자리와 남은 금액. 화면 입력칸을 채우는 데 쓴다. */
export function panelFields(s: Solved): { tierIndex: number; remaining: number | null } {
  const i = Math.min(THS.indexOf(s.tierTh) + 1, THS.length - 1)
  return { tierIndex: i, remaining: s.total == null ? null : THS[i] - s.total }
}
