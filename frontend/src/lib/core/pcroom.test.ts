import { describe, expect, it } from 'vitest'
import {
  anchor, applyCorrections, compare, mergeSaved, minutesOf, missing, prune, restore,
} from './pcroom'

// tests/test_pcroom.py와 같은 경우를 쓴다. 실제 인게임 툴팁(2026-09-24, 다이아)이 바탕이다.
const NEEDS = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
const DIAMOND = 900_000
const TOTAL = 1_500_000 - 590_330        // 상단 '레드 등급까지 590,330'에서 역산
const NEXON = [30000, 26420, 0, 2100, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
const STARTS = ['2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30', '2026-08-06',
                '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17',
                '2026-09-24']

describe('툴팁 역산', () => {
  it('실제 툴팁에서 주차별 금액이 복원된다', () => {
    const r = restore(NEEDS, DIAMOND, TOTAL)
    expect(r.ok).toBe(true)
    expect(r.weeks).toEqual(NEXON)
    expect(r.weeks.reduce((a, b) => a + b, 0)).toBe(TOTAL)
  })

  it('가운데 11주는 등급 기준이 틀려도 그대로 나온다', () => {
    const wrong = restore(NEEDS, 600_000, TOTAL)
    expect(wrong.weeks.slice(1, 12)).toEqual(NEXON.slice(1, 12))
    expect(wrong.weeks[0]).not.toBe(NEXON[0])
    expect(wrong.weeks[12]).not.toBe(NEXON[12])
  })

  it('잘못된 입력은 걸러낸다', () => {
    expect(restore(NEEDS.slice(0, 5), DIAMOND, TOTAL).ok).toBe(false)
    expect(restore(NEEDS, 0, TOTAL).ok).toBe(false)
    const bad = [...NEEDS]; bad[3] = 10_000        // 유지 필요 금액은 줄어들 수 없다
    expect(restore(bad, DIAMOND, TOTAL).ok).toBe(false)
    expect(restore(NEEDS, DIAMOND, TOTAL, 19_000).ok).toBe(false)
    expect(restore(NEEDS, DIAMOND, TOTAL, 20_330).ok).toBe(true)
  })

  it('상단 한 줄에서 기준점을 뽑는다', () => {
    const ths = [150_000, 300_000, 600_000, 900_000, 1_500_000, 2_500_000]
    expect(anchor(ths, 4, 590_330)).toEqual([900_000, 909_670])
    expect(anchor(ths, 0, 50_000)).toEqual([0, 100_000])
  })
})

describe('PC방 몫 가려내기', () => {
  it('구매가 없는 주의 금액을 찾아낸다', () => {
    const collected = [...NEXON]
    collected[3] = 0                      // 07-23 주: 구매 0건인데 넥슨은 2,100원
    const hit = compare(NEXON, collected, STARTS).filter(g => g.amount)
    expect(hit.length).toBe(1)
    expect(hit[0].start).toBe('2026-07-23')
    expect(hit[0].amount).toBe(2100)
    expect(hit[0].minutes).toBe(126)      // 2시간 6분
    expect(hit[0].ok).toBe(true)
    expect(hit[0].warn).toBe('')
  })

  it('수상한 차이를 짚어 준다', () => {
    const one = STARTS.slice(0, 1)
    expect(compare([1050], [0], one)[0].note).toBeTruthy()     // 100 단위가 아님
    expect(compare([0], [5000], one)[0].note).toBeTruthy()     // 수집이 더 많음
    // 29,800원 = 29시간 48분. 100의 배수지만 PC방치고 이례적이다 (실제 수집 누락이었다)
    const g = compare([29800], [0], one)[0]
    expect(g.ok).toBe(true)
    expect(g.warn).toContain('29시간 48분')
  })

  it('접속 시간 환산', () => {
    expect(minutesOf(2100)).toBe(126)
    expect(minutesOf(100)).toBe(6)
    expect(minutesOf(0)).toBe(0)
    expect(minutesOf(150)).toBe(6)        // 100캐시 단위로만 쌓인다
  })
})

describe('저장한 보정값', () => {
  it('주가 지나면 알아서 밀려난다', () => {
    const saved = mergeSaved({}, compare(NEXON, Array(13).fill(0), STARTS))
    expect(saved['2026-07-23']).toBe(2100)
    expect(Object.keys(saved).length).toBe(13)
    // 2주가 지나면 오래된 두 주가 빠지고 새 두 주가 빈칸이 된다
    const later = [...STARTS.slice(2), '2026-10-01', '2026-10-08']
    expect(missing(later, saved)).toEqual(['2026-10-01', '2026-10-08'])
    expect(applyCorrections(Array(13).fill(0), later, saved)[1]).toBe(2100)
  })

  it('더하고 오래된 것은 버린다', () => {
    const saved = { '2026-07-02': 500, '2026-09-24': 700 }
    expect(applyCorrections(Array(13).fill(1000), STARTS, saved))
      .toEqual([1500, ...Array(11).fill(1000), 1700])
    expect(prune(saved, '2026-08-01')).toEqual({ '2026-09-24': 700 })
  })
})
