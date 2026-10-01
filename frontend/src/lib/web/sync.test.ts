import { beforeEach, describe, expect, it } from 'vitest'
import { mergeVault, saveRows, snapshot, webApi } from './api'

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

  it('산 주에 뺄 것이 없으면 뒤쪽에 금액이 맞는 주에서 빼고, 결제도 그 주로 옮긴다', () => {
    // 9월 3일 주에 샀는데 9월 17일 주에 등록했다. 스캔은 그 차액을 9월 17일 주에 넣어 뒀다
    mem.set('maplemvp.pcroom', JSON.stringify({ '2026-09-03': 3_600, '2026-09-17': 150_000 }))
    mem.set('maplemvp.pcroomAt', JSON.stringify({ '2026-09-03': Date.parse('2026-09-26T03:00:00Z'),
                                                   '2026-09-17': Date.parse('2026-09-26T03:00:00Z') }))
    saveRows([{ ...coupon, date: '2026-09-05' }])
    expect(pc()['2026-09-03']).toBe(3_600)
    expect(pc()['2026-09-17']).toBe(0)
    const saved = JSON.parse(mem.get('maplemvp.rows')!).find((r: { id: string }) => r.id === 'shop:77')
    expect(saved.date).toBe('2026-09-17')
    expect(saved.bought).toBe('2026-09-05')
  })

  it('옮겨 둔 쿠폰은 다시 가져와도 옮긴 날짜를 지킨다', () => {
    mem.set('maplemvp.rows', JSON.stringify([{ ...coupon, date: '2026-09-17', bought: '2026-09-05' }]))
    saveRows([{ ...coupon, date: '2026-09-05' }])
    const rows = JSON.parse(mem.get('maplemvp.rows')!)
    expect(rows).toHaveLength(1)
    expect(rows[0].date).toBe('2026-09-17')
  })

  it('계정에서 합칠 때는 빼지 않는다 (그 기기가 이미 뺐다)', () => {
    scanned()
    mergeVault([coupon], { pcroom: {}, syncedAt: null })
    expect(pc()['2026-09-17']).toBe(203_500)
  })
})

describe('목표 계획 계정 동기화', () => {
  const plan = { target: 'black', date: '2026-12-30', fixed: { '2026-10-01': 50_000 }, skipThisWeek: false }
  const planIn = () => JSON.parse(mem.get('maplemvp.plan') ?? 'null')

  it('고치면 시각과 함께 계정에 올라갈 묶음에 들어간다', async () => {
    await webApi.save_plan(plan as never)
    const s = snapshot()
    expect(s.plan).toEqual(plan)
    expect(Date.now() - s.planAt).toBeLessThan(5_000)
  })

  it('이 기기에 계획이 없으면(휴대폰 첫 접속) 계정 것을 받는다', () => {
    mergeVault([], { pcroom: {}, syncedAt: null, plan, planAt: 100 })
    expect(planIn()).toEqual(plan)
  })

  it('계정 것이 더 나중에 고친 것이면 받고, 이 기기가 더 나중이면 그대로 둔다', () => {
    const mine = { ...plan, target: 'red' }
    mem.set('maplemvp.plan', JSON.stringify(mine))
    mem.set('maplemvp.planAt', '200')
    mergeVault([], { pcroom: {}, syncedAt: null, plan, planAt: 100 })
    expect(planIn()).toEqual(mine)
    mergeVault([], { pcroom: {}, syncedAt: null, plan, planAt: 300 })
    expect(planIn()).toEqual(plan)
  })
})
