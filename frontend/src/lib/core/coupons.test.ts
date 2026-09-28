import { describe, expect, it } from 'vitest'
import { placeCoupons } from './coupons'

// 13주 (목요일 시작)
const starts = Array.from({ length: 13 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 6, 2 + i * 7))
  return d.toISOString().slice(0, 10)
})
const zero = () => starts.map(() => 0)
const day = (i: number, plus = 1) => {
  const d = new Date(starts[i] + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + plus)
  return d.toISOString().slice(0, 10)
}

describe('넥슨쇼핑 쿠폰을 인게임이 센 주로 옮긴다', () => {
  it('산 주에는 없고 뒤쪽 주에 같은 금액이 비어 있으면 그 주로', () => {
    const nexon = zero(); nexon[5] = 29_700
    const moves = placeCoupons([{ date: day(3), price: 29_700, id: 'shop:1' }], starts, nexon)
    expect(moves.get('shop:1')).toBe(starts[5])
  })

  it('여러 장의 합이 뒤쪽 한 주 차액과 맞으면 같이 옮긴다', () => {
    const nexon = zero(); nexon[4] = 10_000; nexon[7] = 32_000
    const rows = [
      { date: day(4), price: 10_000, id: 'n' },              // 넥슨캐시 결제, 그대로
      { date: day(4), price: 29_700, id: 'shop:a' },
      { date: day(4), price: 2_300, id: 'shop:b' },
    ]
    const moves = placeCoupons(rows, starts, nexon)
    expect(moves.get('shop:a')).toBe(starts[7])
    expect(moves.get('shop:b')).toBe(starts[7])
    expect(moves.has('n')).toBe(false)
  })

  it('딱 맞는 주가 없으면 들어갈 자리가 있는 가장 가까운 뒤쪽 주로', () => {
    const nexon = zero(); nexon[6] = 50_000; nexon[9] = 29_700 + 5_000
    const moves = placeCoupons([{ date: day(2), price: 29_700, id: 'shop:1' }], starts, nexon)
    expect(moves.get('shop:1')).toBe(starts[6])
  })

  it('앞쪽 주로는 옮기지 않는다 (산 뒤에만 등록할 수 있다)', () => {
    const nexon = zero(); nexon[1] = 29_700
    const moves = placeCoupons([{ date: day(5), price: 29_700, id: 'shop:1' }], starts, nexon)
    expect(moves.size).toBe(0)
  })

  it('인게임과 이미 맞는 주는 건드리지 않는다', () => {
    const nexon = zero(); nexon[3] = 29_700
    const moves = placeCoupons([{ date: day(3), price: 29_700, id: 'shop:1' }], starts, nexon)
    expect(moves.size).toBe(0)
  })

  it('모르는 주로는 옮기지 않는다', () => {
    const nexon = zero(); nexon[5] = 29_700
    const moves = placeCoupons([{ date: day(3), price: 29_700, id: 'shop:1' }], starts, nexon, [5])
    expect(moves.size).toBe(0)
  })
})
