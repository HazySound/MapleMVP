/**
 * 인게임 캡처에서 MVP 등급 툴팁의 숫자를 읽는다. app/ocr.py를 옮긴 것이다.
 *
 * 메이플 UI는 해상도를 바꿔도 픽셀 크기가 그대로인 고정 비트맵 글꼴이라,
 * 글자 모양을 떠 두고 맞춰 보는 방식이 일반 OCR보다 정확하다.
 *
 * 여기서는 판단하지 않고 후보만 내놓는다. 무엇이 맞는지는 core/scan.ts가 고른다.
 */
import templates from './ocr.templates.json'

export const ROWS = 12          // 툴팁 줄 수
const SPACING = 54.2            // 기준 배율에서의 줄 간격 (픽셀)
const MAX_GLYPH = 15            // 숫자 한 글자의 최대 폭. 한글('캐시')은 이보다 넓다
// 작은 캡처를 키우면 얇은 획이 흐려져 밝기가 떨어진다. 낮은 값까지 훑는다
const THRESHOLDS = [180, 190, 200, 210, 220, 230, 240]
const BLURS: (number | null)[] = [null, 0.5, 0.8]
const CLUSTER_THRESHOLDS = [200, 220, 235]
/**
 * 표의 줄을 찾을 때 '글자'로 칠 밝기.
 * 화면공유 프레임은 색 변환을 한 번 거쳐 생캡처보다 어둡게 들어온다. 하나만 박아 두면
 * 조금만 어두워도 줄을 하나도 못 찾아 표가 아예 안 잡힌다. 위에서부터 훑되,
 * 찾는 즉시 멈춰서 밝은 화면에서는 예전만큼 빠르다.
 */
const TABLE_THRESHOLDS = [220, 195, 170, 145]

const BOX_H = templates.height
const BOX_W = templates.width

/** 밝기만 남긴 회색 이미지. 좌표는 y * width + x. */
export interface Gray { data: Float32Array; width: number; height: number }

export function toGray(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Gray {
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (rgba[p] + rgba[p + 1] + rgba[p + 2]) / 3
  }
  return { data: level(data), width, height }
}

/**
 * 밝은 쪽 끝을 일정하게 맞춘다.
 *
 * 화면을 공유받은 프레임은 색 변환을 한 번 거쳐 생캡처보다 어둡게 들어온다.
 * 아래 단계들이 밝기를 숫자로 박아 쓰기 때문에, 조금만 어두워도 글자를 하나도
 * 못 찾는다. 여기서 한 번 맞춰 두면 그 아래는 손댈 것이 없다.
 *
 * 가장 밝은 화소 하나에 맞추면 흰 점 하나에 휘둘리므로 위쪽 0.2% 지점을 쓴다.
 * 이미 밝으면 그대로 두고, 너무 어두우면 억지로 늘리지 않는다. 많이 당길수록
 * 글자 가장자리가 뭉개져 오히려 잘못 읽으므로 끌어올리는 폭도 제한한다.
 */
function level(d: Float32Array): Float32Array {
  const hist = new Int32Array(256)
  for (let i = 0; i < d.length; i++) hist[d[i] | 0]++
  const want = d.length * 0.002
  let n = 0
  let peak = 255
  for (let v = 255; v >= 0; v--) {
    n += hist[v]
    if (n >= want) { peak = v; break }
  }
  if (peak >= 238 || peak < 60) return d
  const k = Math.min(1.35, 245 / peak)
  for (let i = 0; i < d.length; i++) d[i] = Math.min(255, d[i] * k)
  return d
}

const GLYPHS: Record<string, Float32Array> = (() => {
  const out: Record<string, Float32Array> = {}
  for (const [ch, b64] of Object.entries(templates.glyphs as Record<string, string>)) {
    const bin = atob(b64)
    const arr = new Float32Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) / 255
    out[ch] = arr
  }
  return out
})()

/** True가 이어지는 구간. gap 이하로 끊긴 것은 이어 붙인다. */
export function runs(mask: (i: number) => boolean, n: number, gap: number, minw: number): [number, number][] {
  const out: [number, number][] = []
  let cur: number | null = null
  let blank = 0
  for (let i = 0; i < n; i++) {
    if (mask(i)) {
      if (cur === null) cur = i
      blank = 0
    } else if (cur !== null) {
      blank++
      if (blank > gap) {
        if (i - blank - cur >= minw) out.push([cur, i - blank])
        cur = null
      }
    }
  }
  if (cur !== null && n - cur >= minw) out.push([cur, n])
  return out
}

/** Catmull-Rom 큐빅. 양선형보다 봉우리를 덜 깎아서 얇은 획이 살아남는다. */
function cubic(t: number): number {
  t = Math.abs(t)
  if (t < 1) return 1.5 * t * t * t - 2.5 * t * t + 1
  if (t < 2) return -0.5 * t * t * t + 2.5 * t * t - 4 * t + 2
  return 0
}

/**
 * 한 축을 늘이거나 줄인다. 줄일 때는 필터 폭을 비율만큼 넓힌다.
 * 면적 평균만 쓰면 확대할 때 계단이 생겨 '0'이 세로 획 두 개로 쪼개지고,
 * 양선형은 얇은 획의 밝기를 깎아 임계값 아래로 떨어뜨린다.
 */
function resizeAxis(src: Float32Array, w: number, h: number, dn: number, horizontal: boolean): Float32Array {
  const n = horizontal ? w : h
  const scale = dn / n
  const fs = scale < 1 ? 1 / scale : 1      // 줄일 때는 원본을 더 넓게 훑는다
  const support = 2 * fs
  const dw = horizontal ? dn : w
  const dh = horizontal ? h : dn
  const out = new Float32Array(dw * dh)
  const other = horizontal ? h : w

  for (let i = 0; i < dn; i++) {
    const center = (i + 0.5) / scale
    const lo = Math.max(0, Math.ceil(center - support - 0.5))
    const hi = Math.min(n - 1, Math.floor(center + support - 0.5))
    let wsum = 0
    const ws: number[] = []
    for (let k = lo; k <= hi; k++) {
      const v = cubic((k + 0.5 - center) / fs)
      ws.push(v)
      wsum += v
    }
    if (!(Math.abs(wsum) > 1e-6)) { ws.length = 0; ws.push(1); wsum = 1 }
    for (let j = 0; j < other; j++) {
      let acc = 0
      for (let k = lo, m = 0; k <= hi; k++, m++) {
        acc += (horizontal ? src[j * w + k] : src[k * w + j]) * (ws[m] ?? 0)
      }
      const v = acc / wsum
      if (horizontal) out[j * dw + i] = v
      else out[i * dw + j] = v
    }
  }
  return out
}

function resample(src: Float32Array, sw: number, sh: number, dw: number, dh: number): Float32Array {
  const mid = resizeAxis(src, sw, sh, dw, true)     // 가로 먼저
  return resizeAxis(mid, dw, sh, dh, false)         // 그다음 세로
}

/**
 * 가우시안 흐림. 붙어버린 글자를 떼거나 잡티를 뭉갤 때 쓴다.
 * 파이썬 쪽(PIL GaussianBlur)과 같은 세기여야 같은 결과가 나온다 — r이 곧 표준편차다.
 */
function blur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const rad = Math.max(1, Math.ceil(r * 3))
  const k = new Float32Array(rad * 2 + 1)
  let sum = 0
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * r * r))
    k[i + rad] = v
    sum += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum

  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, wsum = 0
      for (let d = -rad; d <= rad; d++) {
        const xx = x + d
        if (xx >= 0 && xx < w) { s += src[y * w + xx] * k[d + rad]; wsum += k[d + rad] }
      }
      tmp[y * w + x] = s / wsum
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, wsum = 0
      for (let d = -rad; d <= rad; d++) {
        const yy = y + d
        if (yy >= 0 && yy < h) { s += tmp[yy * w + x] * k[d + rad]; wsum += k[d + rad] }
      }
      out[y * w + x] = s / wsum
    }
  }
  return out
}


/** 잘라 낸 조각. Gray와 같은 모양이라 그대로 주고받는다. */
type Patch = { data: Float32Array; width: number; height: number }

/** 이미지에서 직사각형을 떼어 낸다. */
function crop(g: Gray, x0: number, y0: number, x1: number, y1: number): Patch {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0)
  x1 = Math.min(g.width, x1); y1 = Math.min(g.height, y1)
  const w = Math.max(0, x1 - x0)
  const h = Math.max(0, y1 - y0)
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) out[y * w + x] = g.data[(y0 + y) * g.width + x0 + x]
  }
  return { data: out, width: w, height: h }
}

export interface Table {
  rows: [number, number][]
  x0: number
  x1: number
  scale: number
}

/** 한 줄에서 숫자로 보이는 조각만 남긴다 ('캐시' 같은 한글은 폭으로 떨군다). */
function digitSegs(g: Gray, y0: number, y1: number, x0: number, x1: number,
                   scale: number, th = 220): [number, number][] {
  const b = crop(g, x0, y0, x1, y1)
  if (!b.width || !b.height) return []
  const s = (v: number) => Math.max(1, Math.round(v * scale))
  const col = (x: number) => {
    for (let y = 0; y < b.height; y++) if (b.data[y * b.width + x] > th) return true
    return false
  }
  return runs(col, b.width, s(2), s(2)).filter(([a, c]) => c - a <= s(MAX_GLYPH))
}

/** 금액 열다운 정도. 오른쪽 정렬이고 글자 수가 그럴듯하면 높다. */
function score(g: Gray, rows: [number, number][], x0: number, x1: number,
               scale: number, th = 220): number {
  const ends: number[] = []
  let plausible = 0
  for (const [y0, y1] of rows) {
    const segs = digitSegs(g, y0, y1, x0, x1, scale, th)
    if (!segs.length) return 0
    ends.push(segs[segs.length - 1][1])
    if (segs.length >= 3 && segs.length <= 9) plausible++
  }
  const spread = Math.max(...ends) - Math.min(...ends)
  const aligned = spread <= Math.max(4, 10 * scale) ? 1 : Math.max(0, 1 - spread / (60 * scale))
  return aligned * (plausible / rows.length)
}

/** 간격이 고르게 이어지는 가장 긴 줄 묶음. */
function chain(segs: [number, number][]): [number, number][] {
  let best: [number, number][] = []
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const d = segs[j][0] - segs[i][0]
      if (d < 12) continue
      const c = [segs[i], segs[j]]
      let last = segs[j][0]
      for (let k = j + 1; k < segs.length; k++) {
        if (Math.abs(segs[k][0] - last - d) <= Math.max(3, d * 0.12)) {
          c.push(segs[k])
          last = segs[k][0]
        }
      }
      if (c.length > best.length) best = c
    }
  }
  return best
}

/**
 * 툴팁 금액 열을 찾는다. 밝은 글자가 일정 간격으로 12줄 늘어선 곳을 찾고,
 * 그 줄들을 가로로 펼쳐 열 덩어리로 나눈다 (창 경계에 잘리지 않게).
 * 배율은 미리 알 필요 없이 줄 간격에서 역산한다.
 */
export function findTables(g: Gray, win = 320, step = 40, limit = 6): Table[] {
  for (const th of TABLE_THRESHOLDS) {
    const out = tablesAt(g, th, win, step, limit)
    if (out.length) return out
  }
  return []
}

function tablesAt(g: Gray, th: number, win: number, step: number, limit: number): Table[] {
  const { width: W, height: H } = g
  // 가로 누적합을 만들어 두면 어떤 열 구간의 밝은 화소 수도 뺄셈 한 번이다
  const cum = new Int32Array((W + 1) * H)
  for (let y = 0; y < H; y++) {
    const r = y * (W + 1)
    for (let x = 0; x < W; x++) cum[r + x + 1] = cum[r + x] + (g.data[y * W + x] > th ? 1 : 0)
  }

  const seen = new Map<string, [number, number][]>()
  for (let x0 = 0; x0 < Math.max(1, W - win + 1); x0 += step) {
    const x1 = Math.min(W, x0 + win)
    const hit = (y: number) => cum[y * (W + 1) + x1] - cum[y * (W + 1) + x0] >= 3
    const segs = runs(hit, H, 6, 5).filter(([a, b]) => b - a >= 8)
    const c = chain(segs).slice(0, ROWS)
    if (c.length < ROWS) continue
    const gaps: number[] = []
    for (let i = 0; i < ROWS - 1; i++) gaps.push(c[i + 1][0] - c[i][0])
    gaps.sort((a, b) => a - b)
    const d = gaps[gaps.length >> 1]
    if (d / SPACING < 0.5 || d / SPACING > 3) continue
    seen.set(`${c[0][0] >> 3}:${d >> 2}`, c)
  }

  const out: { s: number; t: Table }[] = []
  for (const c of seen.values()) {
    const gaps: number[] = []
    for (let i = 0; i < ROWS - 1; i++) gaps.push(c[i + 1][0] - c[i][0])
    gaps.sort((a, b) => a - b)
    const scale = gaps[gaps.length >> 1] / SPACING
    const s = (v: number) => Math.max(1, Math.round(v * scale))
    const rows = c.map(([a, b]) => [a - s(4), b + s(6)] as [number, number])

    const cols = new Uint8Array(W)
    for (const [y0, y1] of rows) {
      for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) {
        for (let x = 0; x < W; x++) if (g.data[y * W + x] > th) cols[x] = 1
      }
    }
    for (const [lo0, hi0] of runs(x => !!cols[x], W, s(24), s(30))) {
      if (hi0 - lo0 > s(420)) continue
      const lo = Math.max(0, lo0 - s(6))
      const hi = Math.min(W, hi0 + s(7))
      const sc = score(g, rows, lo, hi, scale, th)
      if (sc > 0) out.push({ s: sc, t: { rows, x0: lo, x1: hi, scale } })
    }
  }
  out.sort((a, b) => b.s - a.s)
  return out.slice(0, limit).map(o => o.t)
}

/**
 * 한 줄에서 글자 조각을 잘라 크기를 맞춘다.
 * 세로 비율을 지켜서 ','와 '1'을 구분한다. 창모드처럼 UI가 작게 그려진 캡처는
 * 글자가 7px쯤이라 임계값을 조금만 움직여도 붙거나 끊어져서, 템플릿을 뜬 크기로 되돌린다.
 */
export function lineGlyphs(g: Gray, y0: number, y1: number, x0: number, x1: number,
                           scale: number, th = 220, blurR: number | null = null,
                           mergeNarrow = false): Float32Array[] {
  let b: Patch = crop(g, x0, y0, x1, y1)
  if (!b.width || !b.height) return []
  if (scale < 0.95) {
    const nw = Math.max(1, Math.round(b.width / scale))
    const nh = Math.max(1, Math.round(b.height / scale))
    b = { data: resample(b.data, b.width, b.height, nw, nh), width: nw, height: nh }
    scale = 1
  }
  if (blurR) b = { ...b, data: blur(b.data, b.width, b.height, blurR) }

  const s = (v: number) => Math.max(1, Math.round(v * scale))
  const colHit = (x: number) => {
    for (let y = 0; y < b.height; y++) if (b.data[y * b.width + x] > th) return true
    return false
  }
  let segs = runs(colHit, b.width, s(2), s(2)).filter(([a, c]) => c - a <= s(MAX_GLYPH))
  // 작게 그려진 화면에서는 '0'의 위아래 곡선이 끊겨 세로 획 두 개로 갈린다.
  // 좁은 조각이 바싹 붙어 있으면 하나로 보는 경우도 후보에 넣는다.
  if (mergeNarrow && segs.length > 1) {
    const ws = segs.map(([a, c]) => c - a).sort((p, q) => p - q)
    const mid = ws[ws.length >> 1]
    const merged: [number, number][] = []
    for (const seg of segs) {
      const last = merged[merged.length - 1]
      if (last && seg[1] - last[0] <= s(MAX_GLYPH)
          && seg[0] - last[1] <= s(2)
          && last[1] - last[0] < mid * 0.7 && seg[1] - seg[0] < mid * 0.7) {
        last[1] = seg[1]
      } else {
        merged.push([seg[0], seg[1]])
      }
    }
    segs = merged
  }
  const wide = segs.filter(([a, c]) => c - a >= s(8))
  if (!wide.length) return []

  let top = -1
  let bot = -1
  for (let y = 0; y < b.height; y++) {
    let on = false
    for (const [a, c] of wide) {
      for (let x = a; x < c && !on; x++) if (b.data[y * b.width + x] > th) on = true
      if (on) break
    }
    if (on) { if (top < 0) top = y; bot = y }
  }
  if (top < 0) return []
  top = Math.max(0, top - 2)
  bot = Math.min(b.height, bot + 3)

  const out: Float32Array[] = []
  for (const [a, c] of segs) {
    const pw = c - a
    const ph = bot - top
    const piece = new Float32Array(pw * ph)
    for (let y = 0; y < ph; y++) {
      for (let x = 0; x < pw; x++) piece[y * pw + x] = b.data[(top + y) * b.width + a + x]
    }
    const f = BOX_H / Math.max(1, ph)
    const nw = Math.max(1, Math.min(BOX_W, Math.round(pw * f)))
    const small = resample(piece, pw, ph, nw, BOX_H)
    const cell = new Float32Array(BOX_H * BOX_W)
    const dx = (BOX_W - nw) >> 1
    for (let y = 0; y < BOX_H; y++) {
      for (let x = 0; x < nw; x++) {
        cell[y * BOX_W + dx + x] = Math.min(1, Math.max(0, (small[y * nw + x] - 70) / 185))
      }
    }
    out.push(cell)
  }
  return out
}

function match(im: Float32Array): string {
  let best = ''
  let bestScore = -Infinity
  let normIm = 0
  for (let i = 0; i < im.length; i++) normIm += im[i] * im[i]
  normIm = Math.sqrt(normIm)
  for (const [ch, t] of Object.entries(GLYPHS)) {
    let dot = 0
    let normT = 0
    for (let i = 0; i < t.length; i++) { dot += t[i] * im[i]; normT += t[i] * t[i] }
    const s = dot / (Math.sqrt(normT) * normIm + 1e-9)
    if (s > bestScore) { bestScore = s; best = ch }
  }
  return best
}

function readAmounts(g: Gray, t: Table, th: number, blurR: number | null,
                     mergeNarrow = false): number[] | null {
  const out: number[] = []
  for (const [y0, y1] of t.rows) {
    const gs = lineGlyphs(g, y0, y1, t.x0, t.x1, t.scale, th, blurR, mergeNarrow)
    const text = gs.map(match).join('').replace(/,/g, '')
    if (!/^\d+$/.test(text)) return null
    out.push(Number(text))
  }
  return out.length === ROWS ? out : null
}

/** 화면에서 '숫자 여러 개가 붙어 있는 덩어리'를 모두 찾는다. */
/** 이미 표에서 읽은 자리. 그 칸만 빼고, 같은 높이의 다른 곳은 건드리지 않는다 */
interface Skip { x0: number; x1: number; rows: [number, number][] }

function digitClusters(g: Gray, scale: number, skip?: Skip,
                       win = 360, step = 60) {
  const { width: W, height: H } = g
  const s = (v: number) => Math.max(1, Math.round(v * scale))
  const out: { y0: number; y1: number; x0: number; x1: number }[] = []
  const seen = new Set<string>()
  for (const th of CLUSTER_THRESHOLDS) {
    const cum = new Int32Array((W + 1) * H)
    for (let y = 0; y < H; y++) {
      const r = y * (W + 1)
      for (let x = 0; x < W; x++) cum[r + x + 1] = cum[r + x] + (g.data[y * W + x] > th ? 1 : 0)
    }
    for (let wx = 0; wx < Math.max(1, W - win + 1); wx += step) {
      const wx1 = Math.min(W, wx + win)
      const hit = (y: number) => cum[y * (W + 1) + wx1] - cum[y * (W + 1) + wx] >= 3
      for (const [a, b] of runs(hit, H, s(3), s(8))) {
        if (b - a < s(10) || b - a > s(30)) continue
        const cols = new Uint8Array(W)
        for (let y = a; y < b; y++) for (let x = 0; x < W; x++) if (g.data[y * W + x] > th) cols[x] = 1
        for (const [lo0, hi0] of runs(x => !!cols[x], W, s(24), s(18))) {
          if (hi0 <= wx || lo0 >= wx1) continue
          // 표의 숫자만 뺀다. 줄 전체를 빼면 옆에 나란히 있는 상단 금액까지 사라진다
          if (skip && lo0 < skip.x1 && skip.x0 < hi0
              && skip.rows.some(([s0, s1]) => a < s1 && s0 < b)) continue
          const lo = Math.max(0, lo0 - s(6))
          const hi = Math.min(W, hi0 + s(7))
          const n = digitSegs(g, a - s(4), b + s(6), lo, hi, scale, th).length
          const key = `${(a / 6) | 0}:${(lo / 10) | 0}:${th}`
          if (n >= 3 && n <= 9 && !seen.has(key)) {
            seen.add(key)
            out.push({ y0: a - s(4), y1: b + s(6), x0: lo, x1: hi })
          }
        }
      }
    }
  }
  return out
}

/** 화면에 보이는 숫자들을 모두 읽어 온다. 어느 게 맞는지는 규칙이 가린다. */
function findAmounts(g: Gray, scale: number, skip?: Skip): number[] {
  const vals = new Set<number>()
  for (const c of digitClusters(g, scale, skip)) {
    for (const th of [...THRESHOLDS, 235, 245]) {
      const gs = lineGlyphs(g, c.y0, c.y1, c.x0, c.x1, scale, th)
      const t = gs.map(match).join('').replace(/,/g, '')
      if (/^\d+$/.test(t)) {
        const v = Number(t)
        if (v >= 1000 && v <= 2_500_000) vals.add(v)
      }
    }
  }
  return [...vals].sort((a, b) => a - b)
}

export interface ScanResult { readings: number[][]; amounts: number[]; scale: number }

/** 캡처에서 숫자 후보를 뽑는다. 판단은 core/scan.ts가 한다. */
export function scan(g: Gray, fallbackScale = 0): ScanResult {
  for (const t of findTables(g)) {
    const seen: number[][] = []
    for (const th of THRESHOLDS) {
      for (const b of BLURS) {
        for (const merge of [false, true]) {
          const v = readAmounts(g, t, th, b, merge)
          if (v && !seen.some(x => x.every((n, i) => n === v[i]))) seen.push(v)
        }
      }
    }
    if (seen.length) {
      return { readings: seen, scale: t.scale,
               amounts: findAmounts(g, t.scale, { x0: t.x0, x1: t.x1, rows: t.rows }) }
    }
  }
  // 툴팁이 없는 장 (마우스를 치우면 표가 사라진다) — 숫자만 뽑아 둔다
  const sc = fallbackScale || 1
  return { readings: [], scale: sc, amounts: findAmounts(g, sc) }
}
