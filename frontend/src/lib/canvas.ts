/**
 * 이 요소에 걸린 배율. 화면에 그려진 크기를 배치 크기로 나누면 나온다.
 * (앱 전체에 zoom을 걸어 뒀다. 값을 따로 읽어 올 길이 없어 이렇게 잰다.)
 */
export function zoomOf(el: HTMLElement): number {
  const w = el.clientWidth
  return w ? el.getBoundingClientRect().width / w : 1
}

/** 마우스 위치를 캔버스 안의 좌표로 옮긴다. 배율이 걸려 있어도 맞는다. */
export function atX(cv: HTMLCanvasElement, clientX: number): number {
  return (clientX - cv.getBoundingClientRect().left) / zoomOf(cv)
}

/**
 * 캔버스를 배치 크기에 맞추고 컨텍스트를 돌려준다.
 *
 * 그리는 좌표계는 배치 크기로 둔다. 화면 크기(배율이 곱해진 값)로 두면 글자 크기를
 * px로 적어 둔 곳들이 배율만큼 상대적으로 작아져서, 화면은 커졌는데 차트 글씨만
 * 그대로인 꼴이 된다. 해상도는 배율까지 곱해 잡으므로 선명함은 그대로다.
 */
export function fit(cv: HTMLCanvasElement) {
  const dpr = Math.min(devicePixelRatio || 1, 2) * zoomOf(cv)
  const w = cv.clientWidth
  const h = cv.clientHeight
  cv.width = Math.max(1, Math.round(w * dpr))
  cv.height = Math.max(1, Math.round(h * dpr))
  const ctx = cv.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
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
