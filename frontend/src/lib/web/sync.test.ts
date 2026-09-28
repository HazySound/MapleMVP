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
