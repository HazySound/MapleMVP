/**
 * 북마클릿이 긁어 온 구매내역을 받는다.
 *
 * 받는 길이 둘이다.
 *   1) 웹앱이 연 탭에서 postMessage로 바로 — 사용자가 할 일 없음
 *   2) 사용자가 넥슨 페이지를 직접 열었으면 클립보드 → Ctrl+V
 * 어느 쪽이든 보낸 곳과 모양을 확인한 뒤에만 받아들인다.
 */
import type { Row } from '../types'
import { NEXON_USAGE_URL } from './bookmarklet'
import { saveRows } from './api'

const NEXON_ORIGIN = 'https://payment.nexon.com'
const MARK = 'maplemvp-bookmarklet'

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

/** 넥슨 결제 페이지를 새 탭으로 연다. 이 연결이 있어야 데이터가 바로 돌아온다. */
export function openNexon(): Window | null {
  return window.open(NEXON_USAGE_URL, 'maplemvp-nexon')
}

/**
 * 받을 준비를 한다. 받으면 onRows가 불린다.
 * 반환값을 부르면 듣기를 멈춘다.
 */
export function listen(onRows: (rows: Row[]) => void): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== NEXON_ORIGIN) return       // 다른 사이트가 보낸 것은 버린다
    const rows = parse(e.data)
    if (!rows) return
    saveRows(rows)
    onRows(rows)
  }
  const onPaste = (e: ClipboardEvent) => {
    const text = e.clipboardData?.getData('text')
    if (!text || !text.includes(MARK)) return
    try {
      const rows = parse(JSON.parse(text))
      if (!rows) return
      e.preventDefault()
      saveRows(rows)
      onRows(rows)
    } catch { /* 우리 것이 아니면 그냥 둔다 */ }
  }
  window.addEventListener('message', onMessage)
  window.addEventListener('paste', onPaste)
  return () => {
    window.removeEventListener('message', onMessage)
    window.removeEventListener('paste', onPaste)
  }
}
