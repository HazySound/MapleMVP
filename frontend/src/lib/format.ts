import gsap from 'gsap'
import type { Tier, TierKey } from './types'

export const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches

export const TIER_COLOR: Record<TierKey, string> = {
  bronze: '#e7b98f',
  silver: '#cdd5e1',
  gold: '#f3d47e',
  diamond: '#9fe0f2',
  red: '#ff9aa8',
  black: '#c9b6ff',
}

/** 캔버스에서 쓰는 테마 색 (app.css @theme과 같은 값) */
export const C = {
  bg2: '#202228', line: '#383b46',
  tx: '#ecebf2', tx2: '#b4b5c3', tx3: '#80828f',
  lav: '#b8a8ff', mint: '#95e2c4', peach: '#ffc29e', rose: '#ffa9c2', butter: '#f4e19c',
}
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
export const tierColor = (k: TierKey | null) => (k ? TIER_COLOR[k] : C.tx3)

export function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
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
