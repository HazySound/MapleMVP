/**
 * 브라우저에서 돌 때의 구현. exe의 파이썬 자리를 대신한다.
 *
 * 웹은 넥슨을 긁을 수 없다 — 브라우저는 남의 도메인 응답을 읽지 못한다.
 * 그래서 결제내역이 없고, 인게임 툴팁에서 읽은 주차별 금액이 곧 13주 금액이 된다.
 * (exe에서는 그 숫자가 '수집한 결제 + PC방'이라 차이만 보정으로 저장한다.)
 *
 * 저장은 이 브라우저에만 남는다. 서버로 가는 것은 없다.
 */
import type { PyApi } from '../api'
import type { ExportResult, HistoryPage, PcRoomScan, PlanInput, Raw, Row } from '../types'

const KEY = {
  rows: 'maplemvp.rows',
  pcroom: 'maplemvp.pcroom',
  // 보정값을 고친 시각(주차별). 기기가 둘일 때 나중에 고친 쪽이 이기게 하려면
  // 값만으로는 알 수 없다. 값은 그대로 두고 시각만 옆에 따로 적어 둔다.
  pcroomAt: 'maplemvp.pcroomAt',
  ui: 'maplemvp.ui',
  plan: 'maplemvp.plan',
}

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback   // 사생활 보호 모드 등에서 막힐 수 있다
  }
}

function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* 저장이 막혀도 이번 세션 동안은 쓸 수 있게 둔다 */
  }
}

/**
 * 북마클릿이 보내온 구매내역을 저장한다.
 * 같은 날 같은 아이템을 여러 번 사는 일이 흔해서(솔 에르다 10,000원 4건 같은),
 * 중복은 넥슨이 주는 결제 고유번호로만 거른다. 번호가 없으면 그냥 남긴다.
 */
export function saveRows(rows: Row[]): void {
  const seen = new Set<string>()
  const merged: Row[] = []
  for (const r of [...rows, ...load<Row[]>(KEY.rows, [])]) {
    if (r.id) {
      if (seen.has(r.id)) continue
      seen.add(r.id)
    }
    merged.push(r)
  }
  merged.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  save(KEY.rows, merged)
  save('maplemvp.syncedAt', new Date().toISOString())
}

/**
 * 계정에서 받아 온 것을 이 브라우저에 합친다.
 *
 * 구매내역은 넥슨 결제번호가 붙어 있어 그냥 합치면 된다(중복은 saveRows가 거른다).
 * 어느 기기에서 로그인하든 결과가 합집합이라, 먼저 모은 쪽의 것이 사라질 일이 없다.
 *
 * 보정값은 다르다. '몇째 주 얼마'라서 같은 주를 양쪽이 다르게 들고 있을 수 있다.
 * 그때는 나중에 고친 쪽을 남긴다. 시각을 모르는 옛 값은 0으로 쳐서, 시각이 적힌
 * 쪽이 있으면 그쪽이 이긴다.
 */
export function mergeVault(rows: Row[], v: VaultIn): void {
  if (rows.length) saveRows(rows)

  const mine = load<Record<string, number>>(KEY.pcroom, {})
  const mineAt = load<Record<string, number>>(KEY.pcroomAt, {})
  const theirsAt = v.pcroomAt ?? {}
  for (const [week, amount] of Object.entries(v.pcroom ?? {})) {
    const when = theirsAt[week] ?? 0
    if (week in mine && when <= (mineAt[week] ?? 0)) continue
    mine[week] = amount
    mineAt[week] = when
  }
  save(KEY.pcroom, mine)
  save(KEY.pcroomAt, mineAt)

  const seen = load<string | null>('maplemvp.syncedAt', null)
  if (v.syncedAt && (!seen || v.syncedAt > seen)) save('maplemvp.syncedAt', v.syncedAt)
}

interface VaultIn {
  pcroom: Record<string, number>
  pcroomAt?: Record<string, number>
  syncedAt: string | null
}

/** 지금 이 브라우저가 들고 있는 것 전부. 계정에 올릴 때 쓴다 */
export function snapshot() {
  return {
    rows: load<Row[]>(KEY.rows, []),
    pcroom: load<Record<string, number>>(KEY.pcroom, {}),
    pcroomAt: load<Record<string, number>>(KEY.pcroomAt, {}),
    syncedAt: load<string | null>('maplemvp.syncedAt', null),
  }
}

export function clearRows(): void {
  save(KEY.rows, [])
}

/** 이 브라우저에 저장해 둔 것을 전부 지운다. 서버에는 애초에 아무것도 없다. */
export function clearAll(): void {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('maplemvp.')) localStorage.removeItem(k)
  } catch { /* 저장이 막혀 있으면 지울 것도 없다 */ }
}

export const isWeb = () => import.meta.env.VITE_TARGET === 'web' || !window.pywebview

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('이미지 형식을 알 수 없어요'))
    img.src = src
  })
}

function raw(): Raw {
  return {
    status: 'ok',
    loggedOut: false,
    message: null,
    syncedAt: load<string | null>('maplemvp.syncedAt', null),
    demo: false,
    rows: load<Row[]>(KEY.rows, []),
    pcroom: load<Record<string, number>>(KEY.pcroom, {}),
  }
}

/** 브라우저에서는 넥슨 수집도, 창 조작도 없다. 자리만 맞춰 둔다. */
export const webApi: PyApi = {
  async get_state() { return raw() },
  async refresh() { return raw() },

  async pcroom_scan(dataUrl, scale) {
    // exe에서는 파이썬이 하던 일을 여기서는 canvas가 한다. 결과 모양은 같다.
    if (!dataUrl) {
      return { ok: false, readings: [], amounts: [], scale: 1,
               message: '이미지를 붙여넣거나 끌어다 놓아 주세요. (브라우저는 클립보드를 마음대로 볼 수 없어요)' }
    }
    try {
      const { scan, toGray } = await import('../core/ocr')
      const img = await loadImage(dataUrl)
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      const ctx = cv.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, cv.width, cv.height)
      const r = scan(toGray(px.data, cv.width, cv.height), scale || 0)
      const ok = !!(r.readings.length || r.amounts.length)
      return { ok, ...r,
               message: ok ? '' : 'MVP 등급 툴팁을 찾지 못했어요. 등급 게이지에 마우스를 올린 채로 찍어 주세요.' }
    } catch (e) {
      return { ok: false, readings: [], amounts: [], scale: 1, message: `이미지를 읽지 못했어요. ${e}` }
    }
  },

  async pcroom_save(weeks) {
    save(KEY.pcroom, { ...load<Record<string, number>>(KEY.pcroom, {}), ...weeks })
    // 고친 주에만 지금 시각을 찍는다. 다른 기기와 어긋났을 때 이쪽이 이긴다
    const now = Date.now()
    const at = load<Record<string, number>>(KEY.pcroomAt, {})
    for (const week of Object.keys(weeks)) at[week] = now
    save(KEY.pcroomAt, at)
    save('maplemvp.syncedAt', new Date().toISOString())
    return raw()
  },

  async pcroom_clear() {
    // 지운 것도 '지금 정한 것'이다. 시각을 남겨야 옛 값이 다시 내려와 되살아나지 않는다
    const now = Date.now()
    const at: Record<string, number> = {}
    for (const week of Object.keys(load<Record<string, number>>(KEY.pcroom, {}))) at[week] = now
    save(KEY.pcroom, {})
    save(KEY.pcroomAt, at)
    return raw()
  },

  async get_ui() { return load(KEY.ui, {}) },
  async save_ui(data) { save(KEY.ui, data) },
  async get_plan() { return load<Partial<PlanInput>>(KEY.plan, {}) },
  async save_plan(p) { save(KEY.plan, p) },

  async history(page, size) {
    const rows = load<Row[]>(KEY.rows, [])
    return {
      rows: rows.slice((page - 1) * size, page * size),
      total: rows.length, sum: rows.reduce((a, r) => a + r.price, 0),
      page, pages: Math.max(1, Math.ceil(rows.length / size)),
      allTotal: rows.length,
      first: rows.length ? rows[rows.length - 1].date : '',
      last: rows.length ? rows[0].date : '',
      archived: true,
    } as HistoryPage
  },

  async export_history() {
    return { error: '이 화면에서는 내보내기를 지원하지 않아요.' } as ExportResult
  },

  async open_login() {},
  async hide_login() {},
  async minimize() {},
  async toggle_maximize() { return false },
  async is_maximized() { return false },
  async close() {},
  async start_resize() {},
}
