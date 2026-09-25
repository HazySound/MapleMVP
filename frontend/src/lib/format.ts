import gsap from 'gsap'
import type { Tier, TierKey } from './types'

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * 손가락으로 쓰는 기기.
 * 넥슨 내역 가져오기는 북마크바가 있어야 해서 이런 기기에서는 할 수 없다.
 */
export const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

/**
 * 색은 app.css가 쥐고 있다. 여기서 값을 또 적으면 밝은 화면으로 바꿨을 때
 * 한쪽만 따라오지 않는다.
 *
 * CSS에 넣을 때는 var(...) 그대로 건네준다. 그래야 테마가 바뀌는 순간
 * 다시 그리지 않아도 색이 따라온다.
 * 캔버스는 값이 있어야 하므로 그때만 실제 색을 읽어 온다.
 */
const KEYS: TierKey[] = ['bronze', 'silver', 'gold', 'diamond', 'red', 'black']
const varsOf = (p: string) =>
  Object.fromEntries(KEYS.map(k => [k, `var(--color-${p}-${k})`])) as Record<TierKey, string>

/** 칠하는 색 (게이지·점·배경) */
export const TIER_VAR = varsOf('t')
/** 글자 색 (바탕 위에서 읽혀야 하는 곳) */
export const TIER_INK_VAR = varsOf('tk')

let ink: Record<string, string> = {}
let inkFor = ''

/** 지금 테마에서 이 변수의 실제 색. 테마가 바뀌면 알아서 다시 읽는다 */
function read(name: string): string {
  const now = document.documentElement.dataset.theme ?? 'dark'
  if (now !== inkFor) { ink = {}; inkFor = now }
  return (ink[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#80828f')
}

/** 캔버스용 칠하는 색 */
export const TIER_COLOR = new Proxy({} as Record<TierKey, string>, {
  get: (_, k) => read(`--color-t-${String(k)}`),
})
/** 캔버스용 글자 색 */
export const TIER_INK = new Proxy({} as Record<TierKey, string>, {
  get: (_, k) => read(`--color-tk-${String(k)}`),
})

/** 캔버스에서 쓰는 테마 색. app.css의 값을 그때그때 읽어 온다 */
export const C = new Proxy({} as Record<string, string>, {
  get: (_, k) => read(`--color-${String(k)}`),
})
export const FONT = {
  sans: '"IBM Plex Sans KR", "Malgun Gothic", sans-serif',
  mono: '"JetBrains Mono", Consolas, monospace',
}

export const won = (n: number) => Math.round(n).toLocaleString('ko-KR')
export const man = (n: number) => (n >= 10000 ? `${Math.round(n / 1000) / 10}만` : won(n))
/** 'YYYY-MM-DD' → 'MM.DD' */
export const md = (iso: string) => iso.slice(5, 10).replace('-', '.')

export function addDays(iso: string, days: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const tierName = (tiers: Tier[], k: TierKey | null) => tiers.find(t => t.key === k)?.name ?? '미달'
export const tierIdx = (tiers: Tier[], k: TierKey | null) => tiers.findIndex(t => t.key === k)
/** 캔버스용: 지금 테마의 실제 색 */
export const tierColor = (k: TierKey | null) => (k ? TIER_COLOR[k] : C.tx3)
/** CSS용 글자 색. 이 함수는 전부 style="color:..." 자리에 쓰인다 */
export const tierVar = (k: TierKey | null) => (k ? TIER_INK_VAR[k] : 'var(--color-tx3)')

export function hexA(hex: string, a: number) {
  // 여섯 자리 색이 아니면 조용히 엉뚱한 색이 된다 ('#888'은 남색이 된다)
  const n = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0x80828f
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** 숫자가 바뀔 때마다 카운트업하는 action */
export function countup(node: HTMLElement, value: number) {
  const o = { v: 0 }
  const run = (to: number) => {
    if (REDUCED) { node.textContent = won(to); return }
    gsap.to(o, { v: to, duration: 1.1, ease: 'power3.out', overwrite: true, onUpdate: () => { node.textContent = won(o.v) } })
  }
  run(value)
  return { update: run }
}

/** 마우스를 따라다니는 카드 하이라이트 */
export function spotlight(node: HTMLElement) {
  const move = (e: PointerEvent) => {
    const r = node.getBoundingClientRect()
    node.style.setProperty('--mx', `${e.clientX - r.left}px`)
    node.style.setProperty('--my', `${e.clientY - r.top}px`)
  }
  node.addEventListener('pointermove', move)
  return { destroy: () => node.removeEventListener('pointermove', move) }
}

/** 받침이 있으면 '을', 없으면 '를'. (블랙을 / 다이아를) */
export function eul(word: string): string {
  const c = word.codePointAt(word.length - 1) ?? 0
  if (c < 0xac00 || c > 0xd7a3) return '를'
  return (c - 0xac00) % 28 ? '을' : '를'
}
