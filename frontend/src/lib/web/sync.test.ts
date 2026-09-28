import { beforeEach, describe, expect, it } from 'vitest'
import { mergeVault, saveRows } from './api'

/** 브라우저 저장소 흉내. 시험마다 비운다 */
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: k => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: k => void mem.delete(k),
  clear: () => mem.clear(),
  key: i => [...mem.keys()][i] ?? null,
  get length() { return mem.size },
} as Storage
beforeEach(() => mem.clear())

const synced = () => JSON.parse(mem.get('maplemvp.syncedAt') ?? 'null')
const row = { date: '2026-09-20', item: '예시', price: 10_000, id: 'a1' }

describe('마지막 동기화 시각', () => {
  it('구매내역을 새로 가져오면 지금으로 바뀐다', () => {
    saveRows([row])
    expect(Date.now() - Date.parse(synced())).toBeLessThan(5_000)
  })

  it('접속해서 계정 것을 합칠 때는 바뀌지 않는다', () => {
    mem.set('maplemvp.syncedAt', JSON.stringify('2026-09-27T16:51:40.100Z'))
    mergeVault([row], { pcroom: {}, syncedAt: '2026-09-27T16:51:40.100Z' })
    expect(synced()).toBe('2026-09-27T16:51:40.100Z')
  })

  it('다른 기기에서 더 나중에 가져왔으면 그 시각을 받는다', () => {
    mem.set('maplemvp.syncedAt', JSON.stringify('2026-09-20T00:00:00.000Z'))
    mergeVault([row], { pcroom: {}, syncedAt: '2026-09-27T16:51:40.100Z' })
    expect(synced()).toBe('2026-09-27T16:51:40.100Z')
  })

  it('이 브라우저에 처음 받을 때는 계정의 시각을 쓴다', () => {
    mergeVault([row], { pcroom: {}, syncedAt: '2026-09-27T16:51:40.100Z' })
    expect(synced()).toBe('2026-09-27T16:51:40.100Z')
  })
})

describe('뒤늦게 가져온 결제 (넥슨쇼핑 쿠폰 등)', () => {
  const pc = () => JSON.parse(mem.get('maplemvp.pcroom') ?? '{}')
  // 9월 17일 주를 9월 26일에 스캔해서, 쿠폰 203,500원이 수집 못 한 결제로 보정에 들어가 있다
  const scanned = () => {
    mem.set('maplemvp.pcroom', JSON.stringify({ '2026-09-17': 203_500, 'pcmax:2026-09-17': 203_500 }))
    mem.set('maplemvp.pcroomAt', JSON.stringify({ '2026-09-17': Date.parse('2026-09-26T03:00:00Z') }))
  }
  const coupon = { date: '2026-09-20', item: '위습의 원더베리', price: 150_000, id: 'shop:77' }

  it('스캔 전에 산 것이 새로 들어오면 그만큼 보정에서 뺀다', () => {
    scanned()
    saveRows([coupon])
    expect(pc()['2026-09-17']).toBe(53_500)
    expect(pc()['pcmax:2026-09-17']).toBe(53_500)
  })

  it('같은 결제를 다시 가져와도 두 번 빼지 않는다', () => {
    scanned()
    saveRows([coupon])
    saveRows([coupon])
    expect(pc()['2026-09-17']).toBe(53_500)
  })

  it('스캔한 날부터 산 것은 인게임에도 새로 더해진 돈이라 빼지 않는다', () => {
    scanned()
    saveRows([{ ...coupon, date: '2026-09-26', id: 'shop:78' }])
    expect(pc()['2026-09-17']).toBe(203_500)
  })

  it('보정값보다 크면 0까지만 뺀다', () => {
    scanned()
    saveRows([{ ...coupon, price: 300_000 }])
    expect(pc()['2026-09-17']).toBe(0)
  })

  it('계정에서 합칠 때는 빼지 않는다 (그 기기가 이미 뺐다)', () => {
    scanned()
    mergeVault([coupon], { pcroom: {}, syncedAt: null })
    expect(pc()['2026-09-17']).toBe(203_500)
  })
})
