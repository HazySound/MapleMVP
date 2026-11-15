import { describe, expect, it } from 'vitest'
import { bookmarkletUrl } from '../src/lib/web/bookmarklet'

/**
 * 북마클릿을 넥슨 결제내역 페이지에 있는 것처럼 돌려 본다.
 * 청약철회는 '사용' 줄이 그대로 남고 같은 결제번호로 '철회' 줄이 하나 더 생긴다(2026-11-15 운영자 계정 확인).
 */
const APP = 'https://app.test'

type Use = { gameName: string; purchaseAmount: number; purchaseDate: string; purchaseId: string; purchaseItem: string; purchaseStatus: string }
const use = (date: string, id: string, item: string, price: number, status = '사용'): Use =>
  ({ gameName: '메이플스토리', purchaseAmount: price, purchaseDate: `${date} 12:00:00`, purchaseId: id, purchaseItem: item, purchaseStatus: status })

/** 달마다 넥슨이 줄 목록. 키는 'YYYY-M' */
function run(months: Record<string, Use[]>): Promise<any> {
  const body = decodeURIComponent(bookmarkletUrl(APP).slice('javascript:'.length))
  return new Promise((resolve, reject) => {
    const listeners: ((e: any) => void)[] = []
    const el = () => ({ style: {}, remove() {}, querySelector: () => null, set innerHTML(_: string) {} })
    const document = { body: { appendChild() {} }, head: { appendChild() {} }, createElement: el, cookie: '_ifwt=t' }
    const opener = {
      closed: false,
      postMessage(msg: any) {
        if (msg.kind === 'ping') listeners.forEach(f => f({ origin: APP, data: { source: 'maplemvp-app' } }))
        if (msg.kind === 'rows') resolve(msg)
        if (msg.kind === 'error') reject(new Error(msg.message))
      },
    }
    const window: any = { opener, open: () => null, close() {}, inface: { auth: { getUserProfile: async () => ({ data: { uid: '1' } }) } } }
    const json = (v: unknown) => ({ ok: true, status: 200, json: async () => v })
    const fetch = async (url: string, init: any) => {
      if (url.includes('billing-bff')) {
        const { year, month, cursor } = JSON.parse(init.body).variables
        const list = (months[`${year}-${month}`] ?? []).slice(cursor, cursor + 20)
        return json({ data: { nexonCashHistoryDetailUseWithPaging: { useList: list } } })
      }
      if (url.includes('/coupons')) return json({ data: { coupons: [] } })
      return json({ code: 0, data: { purchasesByDate: [] } })
    }
    const location = { host: 'payment.nexon.com', origin: 'https://payment.nexon.com' }
    // 북마클릿 본문은 전역 이름을 그대로 쓴다. 가짜를 같은 이름으로 넘긴다
    new Function('window', 'document', 'location', 'fetch', 'addEventListener', body)(
      window, document, location, fetch, (_: string, f: any) => listeners.push(f))
  })
}

describe('북마클릿 청약철회', () => {
  const now = new Date()
  const ym = (back: number) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${d.getMonth() + 1}` }
  const day = (back: number, dd: string) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${dd}` }

  it('철회 줄과 결제번호가 같은 사용 줄을 빼고, 뺀 것을 철회한 날과 함께 보낸다', async () => {
    const msg = await run({
      [ym(0)]: [use(day(0, '15'), 'P1', '쪽지', 50, '철회'), use(day(0, '15'), 'P1', '쪽지', 50),
                use(day(0, '14'), 'P2', '쪽지', 50),
                // 지난달에 산 것을 이번 달에 철회했다
                use(day(0, '02'), 'P3', '부티크 기프트', 33_000, '철회')],
      [ym(1)]: [use(day(1, '28'), 'P3', '부티크 기프트', 33_000), use(day(1, '27'), 'P4', '부티크 기프트', 33_000)],
    })
    expect(msg.ver).toBe(3)
    expect(msg.rows.map((r: any) => r.id).sort()).toEqual(['P2', 'P4'])
    expect(msg.withdrawn).toEqual(expect.arrayContaining([
      { date: day(0, '15'), item: '쪽지', price: 50, id: 'P1', on: day(0, '15') },
      { date: day(1, '28'), item: '부티크 기프트', price: 33_000, id: 'P3', on: day(0, '02') },
    ]))
    expect(msg.cashLog).toEqual({ statuses: { 사용: 4, 철회: 2 }, withdrawn: 2, unpaired: 0 })
  }, 20_000)
})
