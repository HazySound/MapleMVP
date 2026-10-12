/**
 * 툴팁 한 줄을 통째로 읽는 작은 학습 모델(합성곱 + CTC). 학습은 tools/ocrnet에서 한다.
 *
 * 글자를 하나씩 잘라 견본과 맞추는 판독(ocr.ts)은 자르는 규칙이 캡처 상태(밝기·흐림·크기·HDR)마다 깨졌다.
 * 이 모델은 메이플 숫자 조각을 이어 만든 줄을 그런 식으로 일부러 망가뜨려 가며 배웠고, 줄을 통째로 보고 숫자만 낸다('캐시'는 무시한다).
 * 입력 손질(prep)은 학습 쪽 train.py의 prep과 똑같아야 한다.
 */
import weights from './ocrnet.weights.json'

interface Conv { op: 'conv'; shape: [number, number, number, number]; pad: [number, number]; relu: boolean; w: Float32Array; b: Float32Array }
interface Pool { op: 'pool'; k: [number, number] }
type Layer = Conv | Pool

const H = weights.h
const MAXW = weights.maxw

function f16(b64: string): Float32Array {
  const bin = atob(b64)
  const u16 = new Uint16Array(bin.length / 2)
  for (let i = 0; i < u16.length; i++) u16[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)
  const out = new Float32Array(u16.length)
  for (let i = 0; i < u16.length; i++) {
    const h = u16[i], s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff
    out[i] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15)
  }
  return out
}

let layers: Layer[] | null = null
function model(): Layer[] {
  layers ??= (weights.layers as { op: string; shape?: number[]; pad?: number[]; relu?: boolean; w?: string; b?: string; k?: number[] }[]).map(l =>
    l.op === 'conv'
      ? { op: 'conv', shape: l.shape as Conv['shape'], pad: l.pad as Conv['pad'], relu: !!l.relu, w: f16(l.w!), b: f16(l.b!) }
      : { op: 'pool', k: l.k as Pool['k'] })
  return layers
}

/** PIL의 BILINEAR와 같은 한 축 늘이기·줄이기(줄일 때는 삼각 필터 폭을 비율만큼 넓힌다) */
function resizeAxis(src: Float32Array, w: number, h: number, n: number, horizontal: boolean): Float32Array {
  const len = horizontal ? w : h
  const scale = len / n
  const fs = Math.max(1, scale)
  const support = fs
  const dw = horizontal ? n : w, dh = horizontal ? h : n
  const out = new Float32Array(dw * dh)
  const other = horizontal ? h : w
  for (let i = 0; i < n; i++) {
    const center = (i + 0.5) * scale
    const lo = Math.max(0, Math.floor(center - support))
    const hi = Math.min(len, Math.ceil(center + support))
    const ws: number[] = []
    let sum = 0
    for (let k = lo; k < hi; k++) {
      const v = Math.max(0, 1 - Math.abs((k + 0.5 - center) / fs))
      ws.push(v)
      sum += v
    }
    for (let j = 0; j < other; j++) {
      let acc = 0
      for (let k = lo, m = 0; k < hi; k++, m++) acc += (horizontal ? src[j * w + k] : src[k * w + j]) * ws[m]
      const v = sum ? acc / sum : 0
      if (horizontal) out[j * dw + i] = v
      else out[i * dw + j] = v
    }
  }
  return out
}

function percentile(sorted: Float32Array, p: number): number {
  const r = (sorted.length - 1) * p
  const i = Math.floor(r), f = r - i
  return sorted[i] + (sorted[Math.min(sorted.length - 1, i + 1)] - sorted[i]) * f
}

/** 회색 줄(가로 w, 세로 h) → 높이 32, 밝기 0~1 */
export function prep(data: Float32Array, w: number, h: number): { x: Float32Array; w: number } {
  const nw = Math.max(8, Math.min(MAXW, Math.round(w * H / h)))
  // PIL은 8비트로 바꾼 뒤 늘인다. 같게 맞춘다
  const src = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) src[i] = Math.max(0, Math.min(255, Math.round(data[i])))
  // PIL은 가로를 먼저 늘이고, 단계마다 8비트로 반올림한다
  const mid = resizeAxis(src, w, h, nw, true)
  for (let i = 0; i < mid.length; i++) mid[i] = Math.max(0, Math.min(255, Math.round(mid[i])))
  const x = resizeAxis(mid, nw, h, H, false)
  for (let i = 0; i < x.length; i++) x[i] = Math.max(0, Math.min(255, Math.round(x[i])))
  const sorted = Float32Array.from(x).sort()
  const lo = percentile(sorted, 0.01), hi = percentile(sorted, 0.995)
  const d = Math.max(16, hi - lo)
  for (let i = 0; i < x.length; i++) x[i] = Math.max(0, Math.min(1, (x[i] - lo) / d))
  return { x, w: nw }
}

/**
 * 합성곱. 입력을 '칸마다 이웃 값' 표(im2col)로 펼친 뒤 가중치마다 한 줄씩 더한다. 안쪽 반복이 칸 수만큼 길어
 * 가로 한 줄씩 도는 것보다 몇 배 빠르다
 */
function conv(x: Float32Array, h: number, w: number, l: Conv): { y: Float32Array; h: number; w: number } {
  const [o, i, kh, kw] = l.shape
  const [ph, pw] = l.pad
  const oh = h + 2 * ph - kh + 1, ow = w + 2 * pw - kw + 1
  const n = oh * ow, K = i * kh * kw
  const col = new Float32Array(K * n)
  for (let ic = 0; ic < i; ic++) {
    for (let ky = 0; ky < kh; ky++) {
      for (let kx = 0; kx < kw; kx++) {
        const row = ((ic * kh + ky) * kw + kx) * n
        const dy = ky - ph, dx = kx - pw
        for (let yy = 0; yy < oh; yy++) {
          const sy = yy + dy
          if (sy < 0 || sy >= h) continue
          const src = (ic * h + sy) * w + dx, dst = row + yy * ow
          const x0 = Math.max(0, -dx), x1 = Math.min(ow, w - dx)
          for (let xx = x0; xx < x1; xx++) col[dst + xx] = x[src + xx]
        }
      }
    }
  }
  const y = new Float32Array(o * n)
  for (let oc = 0; oc < o; oc++) {
    const base = oc * n
    y.fill(l.b[oc], base, base + n)
    const wo = oc * K
    for (let k = 0; k < K; k++) {
      const wt = l.w[wo + k]
      if (!wt) continue
      const row = k * n
      for (let j = 0; j < n; j++) y[base + j] += wt * col[row + j]
    }
    if (l.relu) for (let j = base; j < base + n; j++) if (y[j] < 0) y[j] = 0
  }
  return { y, h: oh, w: ow }
}

function pool(x: Float32Array, c: number, h: number, w: number, [kh, kw]: [number, number]) {
  const oh = Math.floor(h / kh), ow = Math.floor(w / kw)
  const y = new Float32Array(c * oh * ow)
  for (let ch = 0; ch < c; ch++) {
    for (let yy = 0; yy < oh; yy++) {
      for (let xx = 0; xx < ow; xx++) {
        let m = -Infinity
        for (let a = 0; a < kh; a++) for (let b = 0; b < kw; b++) m = Math.max(m, x[(ch * h + yy * kh + a) * w + xx * kw + b])
        y[(ch * oh + yy) * ow + xx] = m
      }
    }
  }
  return { y, h: oh, w: ow }
}

/**
 * 손질한 줄 → 칸마다 가장 그럴듯한 것 → 숫자. 같은 것이 이어지면 하나로, 빈칸(0)은 뺀다.
 * conf: 칸마다 고른 것의 확률 중 가장 낮은 것. 흐리거나 처음 보는 모양이면 낮다
 */
export function readPrepped(x: Float32Array, w: number): { text: string; conf: number } {
  // 학습 때처럼 가로를 4의 배수로 맞춘다(오른쪽은 끝 열을 늘려 채운다)
  const pw = Math.ceil(w / 4) * 4
  let cur = new Float32Array(H * pw)
  for (let y = 0; y < H; y++) for (let k = 0; k < pw; k++) cur[y * pw + k] = x[y * w + Math.min(w - 1, k)]
  let c = 1, h = H, ww = pw
  for (const l of model()) {
    if (l.op === 'conv') {
      const r = conv(cur, h, ww, l)
      cur = r.y; c = l.shape[0]; h = r.h; ww = r.w
    } else {
      const r = pool(cur, c, h, ww, l.k)
      cur = r.y; h = r.h; ww = r.w
    }
  }
  let text = '', prev = 0, conf = 1
  for (let t = 0; t < ww; t++) {
    let best = 0, bv = -Infinity, sum = 0
    for (let k = 0; k < c; k++) { const v = cur[k * ww + t]; if (v > bv) { bv = v; best = k } }
    for (let k = 0; k < c; k++) sum += Math.exp(cur[k * ww + t] - bv)
    conf = Math.min(conf, 1 / sum)
    if (best !== prev && best !== 0) text += String(best - 1)
    prev = best
  }
  return { text, conf }
}

/** 회색 줄 한 장을 읽는다 */
export function readLine(data: Float32Array, w: number, h: number): { text: string; conf: number } {
  const p = prep(data, w, h)
  return readPrepped(p.x, p.w)
}
