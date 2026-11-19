/**
 * 2026-11-19 넥슨 MVP 패널 리뉴얼 뒤의 '주차별 표'를 읽는다.
 *
 * 표는 25줄(12주 전 ~ 이번 주 13줄, 한 줄 띄고 1주 뒤 ~ 12주 뒤 12줄) × 11열이다.
 *   주차 · 시작일 · 만료 금액 · 구매 금액 · 반영 금액 · 이월 적립 · 이월 사용 · 이월 잔액 · 13주 합산 · 등급 · 현재 등급 유지까지
 * 칸마다 글이 가운데 맞춤이라, 글 덩어리의 가운데가 여러 줄에 걸쳐 같은 x에 서는 곳이 열이다.
 * 숫자는 글자마다 1px쯤 틈이 있어 하나씩 잘라 견본(panel.digits.json)과 맞춘다. 견본은 받아 둔 캡처에서 떴다
 * (test/private/panel.test.ts, 자료는 docs/private/panel2611).
 *
 * 그 주 실적 = 반영 금액 + 이월 사용(갱신 때 이월에서 채운 금액). 13주를 더하면 이번 주 '13주 합산'이고,
 * k주 뒤 '만료 금액'은 (13−k)주 전의 실적이다. 같은 숫자가 두 번 나오니 서로 맞춰 보면 잘못 읽었는지 안다(checkPanel).
 * 예전 툴팁 12줄('현재 등급 유지까지'와 '사용 이월')은 이 표의 뒤쪽 12줄과 같다.
 */
import type { Solved } from './scan'
import digits from './panel.digits.json'

export const PAST = 13     // 12주 전 ~ 이번 주
export const FUTURE = 12   // 1주 뒤 ~ 12주 뒤
export const COLS = 11
/** 열 자리(왼쪽부터) */
export const C = { week: 0, start: 1, expire: 2, buy: 3, applied: 4, saved: 5, used: 6, balance: 7, total: 8, tier: 9, keep: 10 } as const

/**
 * 세 색 중 가장 어두운 것. 흰 글자는 셋 다 밝고, 하늘색 13주 합산도 빨강이 190쯤이라 바탕(50~110)보다 훨씬 밝다.
 * '이번 주' 줄은 바탕이 연한 하늘색(196, 214, 235)이라 가장 밝은 색으로 보면 흰 글자와 20밖에 차이가 안 난다
 * (2026-11-19 골드 문의 캡처). 가장 어두운 색으로 보면 48이다
 */
export interface Lum { data: Float32Array; width: number; height: number }
export function toLum(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Lum {
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) data[i] = Math.min(rgba[p], rgba[p + 1], rgba[p + 2])
  return { data, width, height }
}

/** 한 축으로 k칸 최솟값·최댓값(가운데 기준) */
function slide(src: Float32Array, w: number, h: number, k: number, horizontal: boolean, max: boolean): Float32Array {
  const out = new Float32Array(src.length)
  const r = k >> 1
  const n = horizontal ? w : h, m = horizontal ? h : w
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      let v = max ? -Infinity : Infinity
      for (let d = Math.max(0, i - r); d <= Math.min(n - 1, i + r); d++) {
        const x = horizontal ? src[j * w + d] : src[d * w + j]
        v = max ? Math.max(v, x) : Math.min(v, x)
      }
      out[horizontal ? j * w + i : i * w + j] = v
    }
  }
  return out
}

/**
 * 둘레보다 얼마나 밝은지. 가는 획(글자)은 7칸 열림(최소 → 최대)에서 지워지고 바탕만 남는다.
 * 표 바탕이 줄마다 달라(이번 주 줄은 밝다) 고정 밝기로는 글자를 못 가른다
 */
function contrast(g: Lum): Float32Array {
  const { width: w, height: h, data } = g
  let o = slide(data, w, h, 7, true, false)
  o = slide(o, w, h, 7, false, false)
  o = slide(o, w, h, 7, true, true)
  o = slide(o, w, h, 7, false, true)
  const out = new Float32Array(data.length)
  for (let i = 0; i < data.length; i++) out[i] = data[i] - o[i]
  return out
}

interface Box { x0: number; x1: number; y0: number; y1: number }
/** 글 덩어리 하나(한 칸의 글) */
export interface Word extends Box { cx: number; cy: number }

/** 둘레보다 th 넘게 밝은 화소(contrast)의 덩어리(8방향 이웃). 너무 큰 것은 글자가 아니다 */
function blobs(data: Float32Array, w: number, h: number, th: number): Box[] {
  const seen = new Uint8Array(w * h)
  const out: Box[] = []
  const stack: number[] = []
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s] < th) continue
    seen[s] = 1
    stack.push(s)
    let x0 = w, x1 = -1, y0 = h, y1 = -1
    while (stack.length) {
      const p = stack.pop()!
      const x = p % w, y = (p - x) / w
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const q = yy * w + xx
          if (!seen[q] && data[q] >= th) { seen[q] = 1; stack.push(q) }
        }
      }
    }
    if (y1 - y0 < 40 && x1 - x0 < 60) out.push({ x0, x1: x1 + 1, y0, y1: y1 + 1 })
  }
  return out
}

/**
 * 같은 줄에서 가까운 덩어리를 이어 한 칸의 글로. '집계 예정'의 띄어쓰기는 글자 높이의 1.5배쯤이고,
 * 칸 사이는 4배 넘게 벌어져 있다
 */
function words(bs: Box[], lineH: number): Word[] {
  const sorted = [...bs].sort((a, b) => a.x0 - b.x0)
  const used = new Uint8Array(sorted.length)
  const out: Word[] = []
  for (let i = 0; i < sorted.length; i++) {
    if (used[i]) continue
    used[i] = 1
    const w: Box = { ...sorted[i] }
    for (let j = i + 1; j < sorted.length; j++) {
      if (used[j]) continue
      const b = sorted[j]
      if (b.x0 - w.x1 > lineH * 2) break
      // 같은 줄: 세로로 겹친다(쉼표·'-'처럼 낮은 것도 줄 높이 안에 든다)
      const cy = (w.y0 + w.y1) / 2
      if (b.y1 < cy - lineH * 0.9 || b.y0 > cy + lineH * 0.9) continue
      used[j] = 1
      w.x1 = Math.max(w.x1, b.x1); w.y0 = Math.min(w.y0, b.y0); w.y1 = Math.max(w.y1, b.y1)
    }
    out.push({ ...w, cx: (w.x0 + w.x1) / 2, cy: (w.y0 + w.y1) / 2 })
  }
  return out
}

export interface Grid {
  /** 열마다 가운데 x (왼쪽부터 11개) */
  cols: number[]
  /** 지난 줄(12주 전 ~ 이번 주) 13개와 앞으로 줄(1주 뒤 ~ 12주 뒤) 12개의 가운데 y */
  past: number[]
  future: number[]
  /** [줄][열] 그 칸의 글. 줄은 past 다음 future 순서. 없으면 null */
  cells: (Word | null)[][]
  lineH: number
}

/** 값이 비슷한 것끼리 묶는다(정렬해서 앞 것과 tol 안이면 같은 묶음) */
function cluster(vs: number[], tol: number): number[][] {
  const s = [...vs].sort((a, b) => a - b)
  const out: number[][] = []
  for (const v of s) {
    const last = out[out.length - 1]
    if (last && v - last[last.length - 1] <= tol) last.push(v)
    else out.push([v])
  }
  return out
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }

/**
 * 표의 칸 자리를 찾는다. 못 찾으면 null. debug를 넘기면 중간 값을 적는다.
 * 글자 높이: 흔한 덩어리 높이 몇 개를 차례로 넣어 본다. 보통은 숫자 높이가 가장 흔한데, 작게 줄인 캡처는
 * 비친 글자 조각이 더 많았다(2026-11-19 듀얼 모니터 캡처: 6px 조각이 숫자 10px보다 많았다)
 */
export function findGrid(g: Lum, debug?: (s: string) => void): Grid | null {
  const con = contrast(g)
  for (const th of CONTRAST) {
    const bs = blobs(con, g.width, g.height, th)
    const hs = new Map<number, number>()
    for (const b of bs) { const h = b.y1 - b.y0; if (h >= 5) hs.set(h, (hs.get(h) ?? 0) + 1) }
    const tries = [...hs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h)
    debug?.(`th${th} blobs ${bs.length} heights ${tries.join(',')}`)
    for (const lineH of tries) {
      const r = gridAt(bs, lineH, debug)
      if (r) return r
    }
  }
  return null
}
/**
 * 글자로 칠 대비(둘레보다 밝은 정도). 밝은 '이번 주' 줄은 흰 글자와 48밖에 차이가 없어, 작게 줄인 캡처에서는 흐려져
 * 40 아래로 떨어진다. 그때만 낮춰 다시 찾는다(낮추면 비친 글자 조각이 늘어 처음부터 쓰지는 않는다)
 */
const CONTRAST = [40, 24]

/**
 * 열: 글 덩어리 가운데 x가 여러 줄에서 같은 곳 → 그중 가장 많은 줄에 걸친 11개.
 * 줄: 그 열들 위에 글이 8칸 넘게 있는 y. 줄 간격의 1.4배가 넘게 벌어진 곳이 머리글 아래와 '이번 주' 아래다
 */
function gridAt(bs: Box[], lineH: number, debug?: (s: string) => void): Grid | null {
  const ws = words(bs.filter(b => b.y1 - b.y0 <= lineH * 1.8), lineH)
  const colTol = Math.max(3, lineH * 0.6)
  let cols = cluster(ws.map(w => w.cx), Math.max(2, lineH * 0.35)).filter(c => c.length >= 15)
  if (cols.length < COLS) { debug?.(`h${lineH} cols ${cols.length}`); return null }
  cols = [...cols].sort((a, b) => b.length - a.length).slice(0, COLS)
  const cx = cols.map(mean).sort((a, b) => a - b)
  const colOf = (w: Word) => {
    let best = -1, d = colTol
    cx.forEach((c, k) => { const e = Math.abs(c - w.cx); if (e <= d) { d = e; best = k } })
    return best
  }
  const tw = ws.filter(w => colOf(w) >= 0)
  const rowsAll = cluster(tw.map(w => w.cy), Math.max(2, lineH * 0.4))
    .map(r => mean(r))
    .map(y => ({ y, ws: tw.filter(w => Math.abs(w.cy - y) <= lineH * 0.5) }))
    .filter(r => new Set(r.ws.map(colOf)).size >= 8)
  const ys = rowsAll.map(r => r.y)
  const pitch = median(ys.slice(1).map((y, i) => y - ys[i]))
  const groups: number[][] = [[]]
  ys.forEach((y, i) => {
    if (i && y - ys[i - 1] > pitch * 1.4) groups.push([])
    groups[groups.length - 1].push(i)
  })
  debug?.(`h${lineH} cols ${cx.map(Math.round).join(',')} pitch ${pitch?.toFixed(1)} groups ${groups.map(x => x.length).join(',')}`)
  // 지난 줄 덩어리 위에는 머리글뿐이다. 머리글 아래가 덜 벌어져 붙어 나오면(크게 키운 캡처) 아래 13줄만 쓴다
  const gi = groups.findIndex((gr, k) => gr.length >= PAST && groups[k + 1]?.length === FUTURE)
  if (gi < 0) return null
  groups[gi] = groups[gi].slice(-PAST)
  const order = [...groups[gi], ...groups[gi + 1]]
  const cells = order.map(i => {
    const row: (Word | null)[] = Array(COLS).fill(null)
    for (const w of rowsAll[i].ws) {
      const k = colOf(w)
      // 한 칸에 덩어리가 둘이면 넓은 것(비친 글자 조각보다 칸 글이 넓다)
      if (k >= 0 && (!row[k] || w.x1 - w.x0 > row[k]!.x1 - row[k]!.x0)) row[k] = w
    }
    return row
  })
  return { cols: cx, past: groups[gi].map(i => ys[i]), future: groups[gi + 1].map(i => ys[i]), cells, lineH }
}

/** 글자 하나를 맞춰 볼 때의 크기. 높이를 맞추고 폭은 비율대로 가운데에 둔다('1'이 좁은 것도 특징이다) */
export const GW = 10, GH = 12
/** '1'이 아닌 숫자 폭 ÷ 글자 높이(받아 둔 캡처 세 장에서 잰 값) */
const DIGIT_W = 0.55

/** 잘라 낸 글자 하나: GW×GH 밝기(0~1), 폭 ÷ 높이, 바로 뒤 틈에 쉼표가 있는지 */
export interface Glyph { f: Float32Array; w: number; comma: boolean }

/**
 * 숫자 칸을 글자 하나씩 자른다. 숫자 사이에는 1px쯤 어두운 틈이 있다(작게 줄인 캡처에서도).
 * 쉼표는 밑줄보다 아래로 내려오니 숫자 윗부분(높이의 70%)만 보고 자르면 쉼표는 틈에 묻힌다.
 * 밝기는 칸 위아래 바탕을 0, 칸에서 가장 밝은 곳을 1로 맞춘다(흰 글자·하늘색 글자·밝은 '이번 주' 줄이 같아진다)
 */
export function glyphs(g: Lum, w: Word, lineH: number): Glyph[] {
  const pad = 2
  const x0 = Math.max(0, w.x0 - pad), x1 = Math.min(g.width, w.x1 + pad)
  const at = (x: number, y: number) => g.data[Math.max(0, Math.min(g.height - 1, y)) * g.width + x]
  const border: number[] = []
  for (let x = x0; x < x1; x++) border.push(at(x, w.y0 - 4), at(x, w.y1 + 4))
  const bg = median(border)
  let peak = bg
  for (let y = w.y0; y < w.y1; y++) for (let x = x0; x < x1; x++) peak = Math.max(peak, at(x, y))
  if (peak - bg < 30) return []
  const norm = (v: number) => Math.max(0, Math.min(1, (v - bg) / (peak - bg)))
  const ON = 0.4
  const rowMax = (y: number, a: number, b: number) => { let m = 0; for (let x = a; x < b; x++) m = Math.max(m, norm(at(x, y))); return m }
  // 윗선: 덩어리를 찾은 문턱보다 흐린 윗줄이 있다. 그 줄을 빼면 '0'의 윗변이 사라져 획 둘로 갈린다
  let top = w.y0
  for (let y = w.y0 - 3; y <= w.y0; y++) if (rowMax(y, x0, x1) >= ON) { top = y; break }
  const upper = top + Math.max(2, Math.round((w.y1 - top) * 0.6))
  const col: number[] = []
  for (let x = x0; x < x1; x++) { let m = 0; for (let y = top; y < upper; y++) m = Math.max(m, norm(at(x, y))); col.push(m) }
  let segs: [number, number][] = []
  let s = -1
  col.forEach((v, i) => {
    if (v >= ON && s < 0) s = i
    if (v < ON && s >= 0) { segs.push([s, i]); s = -1 }
  })
  if (s >= 0) segs.push([s, col.length])
  if (!segs.length) return []
  // 밑선: 글자마다 마지막 밝은 줄의 중간값. 쉼표는 글자 사이 틈에 있어 글자 칸에는 안 든다
  const bots = segs.map(([a, b]) => {
    let last = top
    for (let y = top; y < top + Math.max(lineH, w.y1 - top) + 3; y++) if (rowMax(y, x0 + a, x0 + b) >= ON) last = y
    return last + 1
  })
  const bot = median(bots)
  const dh = bot - top
  if (dh < 4) return []
  // 작게 줄인 캡처는 숫자가 붙어 한 덩어리가 된다. 숫자 폭으로 몇 개인지 보고 가장 어두운 열에서 나눈다
  const unit = dh * DIGIT_W
  segs = segs.flatMap(([a, b]): [number, number][] => {
    const n = Math.round((b - a + 1) / (unit + 1))
    if (n < 2 || b - a < unit * 1.5) return [[a, b]]
    const parts: [number, number][] = []
    let from = a
    for (let k = 1; k < n; k++) {
      const c = a + Math.round((b - a) * k / n)
      let best = c
      for (let x = c - 1; x <= c + 1; x++) if (x > from && x < b && col[x] < col[best]) best = x
      parts.push([from, best])
      from = best + 1
    }
    parts.push([from, b])
    return parts
  })
  // 쉼표: 글자 사이 틈에서 밑선 근처 아래로 밝은 화소
  const comma = (a: number, b: number) => {
    let m = 0
    for (let y = bot - 1; y < bot + Math.ceil(dh * 0.35); y++) m = Math.max(m, rowMax(y, x0 + a, x0 + b))
    return m >= 0.45
  }
  const k = GH / dh
  return segs.map(([a, b], i): Glyph => {
    const gw = b - a
    // 높이를 GH에 맞추고 폭도 같은 비율로 줄여 가운데에 놓는다(면적 평균)
    const nw = Math.min(GW, Math.max(1, Math.round(gw * k)))
    const off = Math.floor((GW - nw) / 2)
    const f = new Float32Array(GW * GH)
    for (let yy = 0; yy < GH; yy++) {
      for (let xx = 0; xx < nw; xx++) {
        const sy0 = top + yy / k, sy1 = top + (yy + 1) / k
        const sx0 = x0 + a + xx * gw / nw, sx1 = x0 + a + (xx + 1) * gw / nw
        let acc = 0, wt = 0
        for (let y = Math.floor(sy0); y < Math.ceil(sy1); y++) {
          const fy = Math.min(sy1, y + 1) - Math.max(sy0, y)
          for (let x = Math.floor(sx0); x < Math.ceil(sx1); x++) {
            const fx = Math.min(sx1, x + 1) - Math.max(sx0, x)
            acc += norm(at(x, y)) * fx * fy; wt += fx * fy
          }
        }
        f[yy * GW + off + xx] = wt ? acc / wt : 0
      }
    }
    const next = segs[i + 1]
    return { f, w: gw / dh, comma: !!next && comma(b, next[0]) }
  })
}

/** 견본: 숫자마다 [GW×GH 밝기…, 폭 비율] 여러 개 */
export type Templates = Record<string, number[][]>
const TPL = digits as Templates

/** 숫자마다 가장 가까운 견본까지의 거리(화소당 제곱 차이 + 폭 비율 차이). 가까운 순 */
export function rank(gl: Glyph, tpl: Templates = TPL): { d: string; dist: number }[] {
  const out: { d: string; dist: number }[] = []
  for (const [d, list] of Object.entries(tpl)) {
    let m = Infinity
    for (const t of list) {
      let e = 0
      for (let i = 0; i < GW * GH && e < m * GW * GH; i++) { const x = gl.f[i] - t[i]; e += x * x }
      e = e / (GW * GH) + 0.5 * (gl.w - t[GW * GH]) ** 2
      if (e < m) m = e
    }
    out.push({ d, dist: m })
  }
  return out.sort((a, b) => a.dist - b.dist)
}

/** 가장 가까운 견본의 숫자와 거리, 2등 거리 */
export function classify(gl: Glyph, tpl: Templates = TPL): { d: string; dist: number; second: number } {
  const r = rank(gl, tpl)
  return { d: r[0].d, dist: r[0].dist, second: r[1]?.dist ?? Infinity }
}

/**
 * 이보다 먼 글자는 숫자가 아니다(한글 '집계 예정', '-'). 맞게 자른 숫자는 다른 캡처 견본과도 0.06 안쪽이었다.
 * 이 안이어도 대조(checkPanel)를 통과해야 쓴다
 */
const MAX_DIST = 0.12
/** 1등과 2등이 이만큼 안으로 붙은 글자는 2등도 후보로 둔다(작은 캡처에서 5·6·3·8이 0.01 안쪽으로 붙었다) */
const CLOSE = 0.03
const MAX_CANDS = 24

/**
 * 칸 하나의 후보 숫자들. 첫 것이 가장 그럴듯하다. 숫자가 아니면 빈 목록.
 * 나머지는 헷갈린 글자를 2등 후보로 바꾼 조합(대조로 고를 때 쓴다)
 */
export function readCands(g: Lum, w: Word | null, lineH: number, tpl: Templates = TPL): number[] {
  if (!w) return []
  const gl = glyphs(g, w, lineH)
  if (!gl.length || gl.length > 10) return []
  const rs = gl.map(x => rank(x, tpl))
  if (rs.some(r => r[0].dist > MAX_DIST)) return []
  // 글자마다 1등과 CLOSE 안의 후보들. 조합은 헷갈린 글자가 적은 것(가까운 것)부터, 많아야 MAX_CANDS개
  const opts = rs.map(r => r.filter(x => x.dist - r[0].dist <= CLOSE))
  let out: { s: string; cost: number }[] = [{ s: '', cost: 0 }]
  for (const o of opts) {
    out = out.flatMap(p => o.map(x => ({ s: p.s + x.d, cost: p.cost + x.dist - o[0].dist })))
      .sort((a, b) => a.cost - b.cost).slice(0, MAX_CANDS)
  }
  return out.map(x => x.s).filter(s => s.length === 1 || s[0] !== '0').map(Number)
}

/** 칸 하나를 숫자로(가장 그럴듯한 것). 못 읽으면 null */
export function readNumber(g: Lum, w: Word | null, lineH: number, tpl: Templates = TPL): number | null {
  return readCands(g, w, lineH, tpl)[0] ?? null
}

/** 표에서 읽은 값. 못 읽은 칸은 null */
export interface PanelRead {
  /** 12주 전 ~ 이번 주 반영 금액·이월 사용 */
  applied: (number | null)[]
  used: (number | null)[]
  /** 이번 주 이월 잔액·13주 합산 */
  balance: number | null
  total: number | null
  /** 1주 뒤 ~ 12주 뒤 만료 금액·이월 사용·이월 잔액·13주 합산·현재 등급 유지까지 */
  fExpire: (number | null)[]
  fUsed: (number | null)[]
  fBalance: (number | null)[]
  fTotal: (number | null)[]
  fKeep: (number | null)[]
  /** 대조로 고친 칸 수(0이면 처음 읽은 그대로) */
  fixed?: number
  /** 못 읽어(마우스에 가리는 등) 다른 칸에서 계산해 채운 칸 수 */
  guessed?: number
}
type Key = Exclude<keyof PanelRead, 'fixed'>

/**
 * 캡처에서 표를 찾아 읽고, 앞뒤가 맞게 헷갈린 글자를 고른다. 표가 없으면 null.
 * 고를 때는 한 칸씩 2등 후보로 바꿔 보거나 '모르는 칸'으로 두고 다른 칸에서 계산해 채워 보며(fillPanel),
 * 어긋나는 곳이 줄면 받아들인다. 숫자 하나는 표에 두세 번 나와(실적 = 만료, 합산의 이어짐) 한 칸만 틀리면
 * 어긋나는 곳이 여럿이라 틀린 쪽이 드러난다. 마우스가 칸을 가려 못 읽거나 엉뚱하게 읽혀도 같은 길로 채운다
 */
export function readPanel(g0: Lum, ths: number[], tpl: Templates = TPL): PanelRead | null {
  // 글자가 아주 크면(4K 등) 획이 굵어 바탕을 재는 7칸 열림으로 글자가 안 지워진다. 원본에서 못 찾으면
  // 1/2, 1/3로 줄여 가며 찾고 그 크기에서 읽는다(이미지 피라미드). 글자 높이로 크기를 맞춰 읽으니 줄여도 같다
  let g = g0
  let gr: Grid | null = null
  for (const k of PYRAMID) {
    if (g0.width / k < 400 || g0.height / k < 300) break
    g = k === 1 ? g0 : shrink(g0, k)
    gr = findGrid(g)
    if (gr) break
  }
  if (!gr) return null
  const cands = (r: number, c: number) => readCands(g, gr.cells[r][c], gr.lineH, tpl)
  const pastRows = [...Array(PAST).keys()], futRows = [...Array(FUTURE).keys()].map(i => PAST + i)
  const cs: Record<Key, number[][]> = {
    applied: pastRows.map(r => cands(r, C.applied)),
    used: pastRows.map(r => cands(r, C.used)),
    balance: [cands(PAST - 1, C.balance)],
    total: [cands(PAST - 1, C.total)],
    fExpire: futRows.map(r => cands(r, C.expire)),
    fUsed: futRows.map(r => cands(r, C.used)),
    fBalance: futRows.map(r => cands(r, C.balance)),
    fTotal: futRows.map(r => cands(r, C.total)),
    fKeep: futRows.map(r => cands(r, C.keep)),
  }
  // pick이 후보 수와 같으면 '모르는 칸'(null)이다. 못 읽은 칸은 처음부터 그렇다
  const pick: Record<Key, number[]> = Object.fromEntries(Object.entries(cs).map(([k, l]) => [k, l.map(() => 0)])) as Record<Key, number[]>
  const build = (): PanelRead => {
    const v = (k: Key) => cs[k].map((l, i) => l[pick[k][i]] ?? null)
    return { applied: v('applied'), used: v('used'), balance: v('balance')[0], total: v('total')[0],
             fExpire: v('fExpire'), fUsed: v('fUsed'), fBalance: v('fBalance'), fTotal: v('fTotal'), fKeep: v('fKeep') }
  }
  // 점수: 채우고도 남은 빈칸은 크게, 어긋난 곳은 하나에 1, 채운 칸은 하나에 0.5(읽은 값을 버리는 데는 값을 치르게)
  const score = () => {
    const f = fillPanel(build(), ths)
    if (f.left) return 100 * f.left + f.guessed * 0.5
    return checkPanel(f.p, ths).issues.length + f.guessed * 0.5
  }
  let cur = score()
  for (let pass = 0; pass < 4 && cur >= 1; pass++) {
    let moved = false
    for (const k of Object.keys(cs) as Key[]) {
      cs[k].forEach((l, i) => {
        if (cur < 1) return
        const was = pick[k][i]
        for (let j = 0; j <= l.length; j++) {
          if (j === was) continue
          pick[k][i] = j
          const n = score()
          if (n < cur) { cur = n; moved = true; return }
        }
        pick[k][i] = was
      })
    }
    if (!moved) break
  }
  let fixed = 0
  for (const k of Object.keys(cs) as Key[]) fixed += pick[k].filter((j, i) => j > 0 && j < cs[k][i].length).length
  const f = fillPanel(build(), ths)
  return { ...f.p, fixed, guessed: f.guessed }
}

/**
 * 모르는 칸을 표의 계산 관계로 채운다. 모르는 값이 하나뿐인 관계부터 풀고, 더 못 풀 때까지 되풀이한다.
 *   (13−k)주 전 반영 + 이월 사용 = k주 뒤 만료,  13주 실적의 합 = 13주 합산,
 *   k주 뒤 합산 = 앞 줄 합산 − 만료 + 이월 사용,  k주 뒤 잔액 = 앞 줄 잔액 − 이월 사용,  유지까지 = max(0, 기준 − 합산)
 * 채운 뒤에도 나머지 관계가 다 맞아야(checkPanel) 쓴다. left: 끝내 못 채운 칸 수
 */
export function fillPanel(p0: PanelRead, ths: number[]): { p: PanelRead; guessed: number; left: number } {
  const p: PanelRead = { ...p0, applied: [...p0.applied], used: [...p0.used], fExpire: [...p0.fExpire], fUsed: [...p0.fUsed],
                         fBalance: [...p0.fBalance], fTotal: [...p0.fTotal], fKeep: [...p0.fKeep] }
  // 칸 하나를 가리키는 읽기·쓰기
  type Ref = [get: () => number | null, set: (v: number) => void]
  const arr = (a: (number | null)[], i: number): Ref => [() => a[i], v => { a[i] = v }]
  const total: Ref = [() => p.total, v => { p.total = v }]
  const balance: Ref = [() => p.balance, v => { p.balance = v }]
  // 관계: Σ 계수 × 칸 = 0
  const eqs: [number, Ref][][] = []
  for (let k = 0; k < FUTURE; k++) eqs.push([[1, arr(p.applied, k)], [1, arr(p.used, k)], [-1, arr(p.fExpire, k)]])
  eqs.push([...p.applied.map((_, i): [number, Ref] => [1, arr(p.applied, i)]), ...p.used.map((_, i): [number, Ref] => [1, arr(p.used, i)]),
            [-1, total]])
  for (let k = 0; k < FUTURE; k++) {
    eqs.push([[1, arr(p.fTotal, k)], [-1, k ? arr(p.fTotal, k - 1) : total], [1, arr(p.fExpire, k)], [-1, arr(p.fUsed, k)]])
    eqs.push([[1, arr(p.fBalance, k)], [-1, k ? arr(p.fBalance, k - 1) : balance], [1, arr(p.fUsed, k)]])
  }
  const empty = () => [p.applied, p.used, p.fExpire, p.fUsed, p.fBalance, p.fTotal, p.fKeep].flat().filter(v => v == null).length
    + (p.total == null ? 1 : 0) + (p.balance == null ? 1 : 0)
  const before = empty()
  for (let changed = true; changed;) {
    changed = false
    for (const eq of eqs) {
      const open = eq.filter(([, r]) => r[0]() == null)
      if (open.length !== 1) continue
      const [c, r] = open[0]
      const rest = eq.reduce((s, [cc, rr]) => s + (rr === r ? 0 : cc * rr[0]()!), 0)
      const v = -rest / c
      if (v >= 0 && Number.isInteger(v)) { r[1](v); changed = true }
    }
    // 유지까지 ↔ 합산(지금 등급 기준은 이번 주 합산으로 정해진다). 유지까지 0이면 합산은 기준 이상이라는 것만 안다
    if (p.total != null) {
      const th = tierAt(ths, p.total)
      for (let k = 0; k < FUTURE; k++) {
        if (p.fKeep[k] == null && p.fTotal[k] != null) { p.fKeep[k] = Math.max(0, th - p.fTotal[k]!); changed = true }
        if (p.fTotal[k] == null && p.fKeep[k] != null && p.fKeep[k]! > 0) { p.fTotal[k] = th - p.fKeep[k]!; changed = true }
      }
    }
  }
  const left = empty()
  return { p, guessed: before - left, left }
}

/** 등급 기준(낮은 것부터) 중 합계가 넘는 가장 높은 것. 없으면 0 */
const tierAt = (ths: number[], sum: number) => ths.reduce((a, th) => (sum >= th ? th : a), 0)

export interface PanelCheck {
  ok: boolean
  /** 맞지 않는 곳(사람이 읽을 말) */
  issues: string[]
  /** 12주 전 ~ 이번 주 실적(반영 + 이월 사용). ok일 때만 믿는다 */
  weeks: number[]
  tierTh: number
  /** 숫자로 못 읽은 칸이 있다(대조까지 가지 못했다) */
  missing?: boolean
}

/**
 * 표가 그 자체로 앞뒤가 맞는지. 같은 숫자가 두 번 나오는 곳을 모두 맞춰 본다.
 *   13주 실적의 합 = 이번 주 13주 합산
 *   k주 뒤 만료 = (13−k)주 전 실적
 *   k주 뒤 합산 = (k−1)주 뒤 합산 − 만료 + 이월 사용,  k주 뒤 잔액 = (k−1)주 뒤 잔액 − 이월 사용
 *   k주 뒤 유지까지 = max(0, 지금 등급 기준 − k주 뒤 합산)
 * 숫자 하나라도 잘못 읽으면 이 중 두 곳 넘게 어긋난다. ths는 등급 기준(낮은 것부터)
 */
export function checkPanel(p: PanelRead, ths: number[]): PanelCheck {
  const issues: string[] = []
  const won = (n: number) => n.toLocaleString('ko-KR')
  const missing = [
    ...p.applied.map((v, i) => (v == null ? `${PAST - 1 - i ? `${PAST - 1 - i}주 전` : '이번 주'} 반영 금액` : '')),
    ...p.used.map((v, i) => (v == null ? `${PAST - 1 - i ? `${PAST - 1 - i}주 전` : '이번 주'} 이월 사용` : '')),
    p.balance == null ? '이번 주 이월 잔액' : '', p.total == null ? '이번 주 13주 합산' : '',
    ...p.fExpire.map((v, i) => (v == null ? `${i + 1}주 뒤 만료 금액` : '')),
    ...p.fUsed.map((v, i) => (v == null ? `${i + 1}주 뒤 이월 사용` : '')),
    ...p.fBalance.map((v, i) => (v == null ? `${i + 1}주 뒤 이월 잔액` : '')),
    ...p.fTotal.map((v, i) => (v == null ? `${i + 1}주 뒤 13주 합산` : '')),
    ...p.fKeep.map((v, i) => (v == null ? `${i + 1}주 뒤 유지까지` : '')),
  ].filter(Boolean)
  if (missing.length) {
    return { ok: false, issues: [`숫자를 못 읽은 칸이 ${missing.length}개예요(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ' 등' : ''}).`],
             weeks: [], tierTh: 0, missing: true }
  }
  const n = (v: number | null) => v!
  const weeks = p.applied.map((a, i) => n(a) + n(p.used[i]))
  const total = n(p.total)
  const tierTh = tierAt(ths, total)
  const sum = weeks.reduce((a, b) => a + b, 0)
  if (sum !== total) issues.push(`13주 실적을 더하면 ${won(sum)}인데 13주 합산은 ${won(total)}이에요.`)
  p.fExpire.forEach((v, k) => {
    if (n(v) !== weeks[k]) issues.push(`${k + 1}주 뒤 만료 금액(${won(n(v))})이 ${PAST - 1 - k}주 전 실적(${won(weeks[k])})과 달라요.`)
  })
  let t = total, b = n(p.balance)
  for (let k = 0; k < FUTURE; k++) {
    t = t - n(p.fExpire[k]) + n(p.fUsed[k])
    b = b - n(p.fUsed[k])
    if (n(p.fTotal[k]) !== t) issues.push(`${k + 1}주 뒤 13주 합산(${won(n(p.fTotal[k]))})이 계산(${won(t)})과 달라요.`)
    if (n(p.fBalance[k]) !== b) issues.push(`${k + 1}주 뒤 이월 잔액(${won(n(p.fBalance[k]))})이 계산(${won(b)})과 달라요.`)
    t = n(p.fTotal[k]); b = n(p.fBalance[k])
    const keep = Math.max(0, tierTh - n(p.fTotal[k]))
    if (tierTh && n(p.fKeep[k]) !== keep) issues.push(`${k + 1}주 뒤 유지까지(${won(n(p.fKeep[k]))})가 계산(${won(keep)})과 달라요.`)
  }
  return { ok: !issues.length, issues, weeks, tierTh }
}

/**
 * 맞는 표를 판독 결과로. needs·carry는 예전 툴팁 12줄과 같은 뜻이라 맞추기 창의 칸을 그대로 채운다.
 * weeks가 있으면 맞추기 창은 '유지까지'를 거꾸로 풀지 않고 이 주별 금액을 그대로 쓴다
 */
export function panelSolved(p: PanelRead, c: PanelCheck, scale = 1): Solved {
  return {
    needs: p.fKeep.map(v => v!), tierTh: c.tierTh, total: p.total, carry: p.fUsed.map(v => v!),
    scale, balance: p.balance, weeks: c.weeks,
  }
}

/** 표를 찾아볼 축소 배율. 표가 화면에 읽을 만한 크기면 원본에서 찾힌다 */
const PYRAMID = [1, 2, 3]

/** k×k 칸 평균으로 줄인다 */
function shrink(g: Lum, k: number): Lum {
  const w = Math.floor(g.width / k), h = Math.floor(g.height / k)
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) s += g.data[(y * k + dy) * g.width + x * k + dx]
      data[y * w + x] = s / (k * k)
    }
  }
  return { data, width: w, height: h }
}

/** 캡처 한 장에서 새 패널 표를 본 결과. 표가 없으면 판독 결과에 이 칸이 없다 */
export interface TableScan {
  /** 앞뒤가 다 맞았다. 이때만 solved가 있다 */
  ok: boolean
  issues: string[]
  solved: Solved | null
  /** 대조로 고친 칸 수 */
  fixed: number
  /** 못 읽어 다른 칸에서 계산해 채운 칸 수 */
  guessed: number
}

/**
 * 계산으로 채워도 되는 칸 수. 마우스 커서는 칸 한두 개를 가린다. 이보다 많이 비면 표가 크게 가려졌거나
 * 잘못 찾은 것이라 다시 찍게 한다(채운 칸은 그 칸 자체로는 확인할 수 없다)
 */
const MAX_GUESS = 4
/**
 * 2등 후보로 고치거나 계산으로 채운 칸을 모두 합쳐 이만큼까지. 많이 고칠수록 틀린 칸끼리 서로 맞아떨어질 수 있다
 * (2026-11-19 골드 캡처를 0.8배로 줄인 사본: 같은 크기의 '5'·'6'이 두 곳에서 똑같이 헷갈려 +1,000·−1,000이
 * 합계에서 상쇄됐다. 고친 칸 7 · 채운 칸 6). 받아 둔 캡처는 원래 크기에서 0이었다
 */
const MAX_EDIT = 6

/** 읽은 표를 써도 되는지. 대조가 다 맞고, 고치거나 채운 칸이 적을 때만 */
export function judge(p: PanelRead, ths: number[]): PanelCheck {
  const c = checkPanel(p, ths)
  if (!c.ok) return c
  const guessed = p.guessed ?? 0, edits = guessed + (p.fixed ?? 0)
  if (guessed > MAX_GUESS) return { ...c, ok: false, issues: [`가려지거나 못 읽은 칸이 ${guessed}개라 확실하지 않아요.`] }
  if (edits > MAX_EDIT) return { ...c, ok: false, issues: [`헷갈린 숫자가 ${edits}개라 확실하지 않아요.`] }
  return c
}

/** RGBA 한 장에서 표를 찾아 읽고 대조까지. 표가 없으면 null(예전 툴팁 판독으로 넘어간다) */
export function scanTable(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number, ths: number[]): TableScan | null {
  const p = readPanel(toLum(rgba, width, height), ths)
  if (!p) return null
  const c = judge(p, ths)
  return { ok: c.ok, issues: c.issues, solved: c.ok ? panelSolved(p, c) : null, fixed: p.fixed ?? 0, guessed: p.guessed ?? 0 }
}
