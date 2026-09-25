import { describe, expect, it } from 'vitest'
import { pick, sortRows } from './api'
import type { Row } from '../types'

/**
 * 브라우저에서 도는 보관함 걸러내기.
 *
 * 여기가 비어 있어서 웹에서는 월별·기간·검색·정렬이 하나도 안 먹었다.
 * 페이지 나누기만 하고 조건을 통째로 버리고 있었는데, 화면에는 조건이
 * 멀쩡히 그려져 있어서 '되는데 결과가 이상한' 것처럼 보였다.
 */
const rows: Row[] = [
  { date: '2026-09-20', item: '솔 에르다 조각', price: 10000 },
  { date: '2026-09-01', item: '경험치 쿠폰', price: 3000 },
  { date: '2026-08-15', item: '솔 에르다', price: 22000 },
  { date: '2025-12-31', item: '캐시 아이템', price: 5000 },
]

describe('보관함 걸러내기', () => {
  it('기간 밖은 뺀다', () => {
    const r = pick(rows, '', '2026-09-01', '2026-09-30')
    expect(r.map(x => x.date)).toEqual(['2026-09-20', '2026-09-01'])
  })

  it('양 끝날도 포함한다', () => {
    expect(pick(rows, '', '2026-09-01', '2026-09-01')).toHaveLength(1)
  })

  it('기간을 비우면 전체다', () => {
    expect(pick(rows, '', '', '')).toHaveLength(4)
  })

  it('이름 일부로 찾는다', () => {
    expect(pick(rows, '솔 에르다', '', '').map(x => x.price)).toEqual([10000, 22000])
  })

  it('찾기와 기간은 함께 걸린다', () => {
    expect(pick(rows, '솔 에르다', '2026-09-01', '2026-09-30')).toHaveLength(1)
  })

  it('오지 않은 달을 고르면 빈 결과다 (고장이 아니다)', () => {
    expect(pick(rows, '', '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('금액순으로 세운다', () => {
    expect(sortRows(rows, 'price', false).map(x => x.price)).toEqual([3000, 5000, 10000, 22000])
    expect(sortRows(rows, 'price', true).map(x => x.price)).toEqual([22000, 10000, 5000, 3000])
  })

  it('날짜순으로 세운다', () => {
    expect(sortRows(rows, 'date', true)[0].date).toBe('2026-09-20')
    expect(sortRows(rows, 'date', false)[0].date).toBe('2025-12-31')
  })

  it('원본을 건드리지 않는다', () => {
    const before = rows.map(r => r.date)
    sortRows(rows, 'price', true)
    expect(rows.map(r => r.date)).toEqual(before)
  })
})
