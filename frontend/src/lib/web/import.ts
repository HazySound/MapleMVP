/**
 * 북마클릿이 보내오는 것을 받는다.
 *
 * 받는 길이 둘이다.
 *   1) postMessage — 북마클릿이 이 탭을 찾아서 바로 보낸다. 사용자가 할 일 없음
 *   2) 클립보드 → Ctrl+V — 탭을 잡지 못했을 때의 대비책
 * 어느 쪽이든 보낸 곳과 모양을 확인한 뒤에만 받아들인다.
 *
 * 듣기는 앱이 뜨는 순간 시작한다. 모달이 열려 있어야만 받을 수 있으면,
 * 북마클릿이 띄워 준 탭은 아무것도 못 받는다.
 */
import type { Progress, Row } from '../types'
import { APP_TAB, NEXON_USAGE_URL } from './bookmarklet'
import { saveRows } from './api'

const NEXON_ORIGIN = 'https://payment.nexon.com'
const MARK = 'maplemvp-bookmarklet'
const ROWS_KEY = 'maplemvp.rows'

/** 보내온 것이 우리가 기대한 모양인지 본다. 남이 보낸 것은 여기서 걸린다. */
function parse(data: unknown): Row[] | null {
  if (!data || typeof data !== 'object') return null
  const d = data as { source?: unknown; rows?: unknown }
  if (d.source !== MARK || !Array.isArray(d.rows)) return null
  const out: Row[] = []
  for (const r of d.rows) {
    if (!r || typeof r !== 'object') continue
    const { date, item, price, id } = r as Row
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
    if (typeof price !== 'number' || !Number.isFinite(price)) continue
    out.push({ date, item: typeof item === 'string' ? item : '', price: Math.round(price),
               id: typeof id === 'string' ? id : undefined })
  }
  return out
}

/** 넥슨 결제내역 페이지를 새 탭으로 연다. */
export function openNexon(): Window | null {
  return window.open(NEXON_USAGE_URL, 'maplemvp-nexon')
}

/**
 * 이 탭에 이름을 붙인다. 북마클릿이 이 이름으로 탭을 찾아서,
 * 이미 열려 있으면 새로 열지 않고 그리로 온다.
 */
export function claimTab(): void {
  try { if (!window.name) window.name = APP_TAB } catch { /* 막히면 새 탭이 하나 더 열릴 뿐이다 */ }
}

export interface Incoming {
  /** 북마클릿이 이 탭을 찾았다. 아직 긁기 전이다 */
  onConnect(): void
  onProgress(p: Progress): void
  onRows(rows: Row[]): void
  onError(message: string): void
  /** 다른 탭에서 내역이 저장됐다 */
  onOther(): void
}

/**
 * 받을 준비를 한다. 반환값을 부르면 듣기를 멈춘다.
 */
export function listen(h: Incoming): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== NEXON_ORIGIN) return       // 다른 사이트가 보낸 것은 버린다
    const d = e.data as { source?: unknown; kind?: unknown; label?: unknown; message?: unknown } | null
    if (!d || typeof d !== 'object' || d.source !== MARK) return

    // 받았다고 알려 줘야 북마클릿이 이 탭으로 보내기 시작한다
    try { (e.source as Window | null)?.postMessage({ source: 'maplemvp-app', kind: 'ack' }, NEXON_ORIGIN) } catch { /* 이미 닫혔다 */ }

    if (d.kind === 'ping') return void h.onConnect()
    if (d.kind === 'progress') {
      const p = d as unknown as Progress
      return void h.onProgress({ label: String(p.label ?? ''), done: Number(p.done) || 0,
                                 total: Number(p.total) || 0, count: Number(p.count) || 0 })
    }
    if (d.kind === 'error') return void h.onError(String(d.message ?? '내역을 읽지 못했어요.'))

    const rows = parse(d)
    if (!rows) return
    saveRows(rows)
    h.onRows(rows)
  }

  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (!text || !text.includes(MARK)) return
    try {
      const rows = parse(JSON.parse(text))
      if (!rows) return
      e.preventDefault()
      saveRows(rows)
      h.onRows(rows)
    } catch { /* 우리 것이 아니면 그냥 둔다 */ }
  }

  // 같은 브라우저의 다른 탭이 받아 저장했을 때. 이 탭만 옛날 값을 들고 있으면 안 된다
  const onStorage = (e: StorageEvent) => {
    if (e.key === ROWS_KEY) h.onOther()
  }

  window.addEventListener('message', onMessage)
  window.addEventListener('paste', onPaste)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener('message', onMessage)
    window.removeEventListener('paste', onPaste)
    window.removeEventListener('storage', onStorage)
  }
}
