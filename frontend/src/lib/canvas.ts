/** 캔버스를 CSS 크기 × devicePixelRatio로 맞추고 컨텍스트를 돌려준다. */
export function fit(cv: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2)
  const r = cv.getBoundingClientRect()
  cv.width = Math.max(1, Math.round(r.width * dpr))
  cv.height = Math.max(1, Math.round(r.height * dpr))
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w: r.width, h: r.height }
}

/** 크기가 바뀌면 다시 그리는 action */
export function onResize(node: HTMLElement, draw: () => void) {
  let t: number | undefined
  const ro = new ResizeObserver(() => { clearTimeout(t); t = window.setTimeout(draw, 40) })
  ro.observe(node)
  return { destroy: () => ro.disconnect() }
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, h / 2, w / 2)
  c.beginPath()
  c.moveTo(x + r, y)
  c.arcTo(x + w, y, x + w, y + h, r)
  c.arcTo(x + w, y + h, x, y + h, r)
  c.arcTo(x, y + h, x, y, r)
  c.arcTo(x, y, x + w, y, r)
  c.closePath()
}

export function niceStep(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  const m = x / p
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
