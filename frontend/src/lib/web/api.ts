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

export function clearRows(): void {
  save(KEY.rows, [])
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
    const saved = { ...load<Record<string, number>>(KEY.pcroom, {}), ...weeks }
    save(KEY.pcroom, saved)
    save('maplemvp.syncedAt', new Date().toISOString())
    return raw()
  },

  async pcroom_clear() {
    save(KEY.pcroom, {})
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
