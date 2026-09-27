import { describe, expect, it } from 'vitest'
import {
  anchor, applyCorrections, compare, mergeSaved, minutesOf, missing, prune, restore,
} from './pcroom'
import { forecast } from './mvp'
import { real } from '../../../test/private'

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

/**
 * 블랙만 이월이 있다. 인게임 '유지까지'는 그 갱신에서 쓸 이월을 뺀 금액이고,
 * 쓴 이월은 새 주의 사용 금액으로 채워져 다음 줄부터 합계에 남는다.
 * 그래서 앞 줄의 이월은 이웃한 두 줄 사이에서 지워지고, 이번 주에만 전부 빠져 있다.
 *
 * 만든 숫자다. 이번 목요일 갱신에서 1만이 모자라 이월로 메웠고(이번 주에 1만이 채워짐),
 * 이월이 1만 5천 남아 다음 목요일에 모두 쓰인다. 8/20 주에만 PC방 1,200이 있다.
 */
describe('블랙 — 이월과 모르는 주', () => {
  const BLACK = 2_500_000
  const W13 = [170_000, 600_000, 0, 50_000, 0, 500_000, 0, 70_000, 0, 0, 800_000, 300_000, 10_000]
  const SPENT = [170_000, 600_000, 0, 50_000, 0, 500_000, 0, 68_800, 0, 0, 800_000, 300_000, 0]
  const f = forecast(W13, 15_000).slice(0, 12)
  const TIP = f.map(r => BLACK - r.sum - r.carryUsed)
  const CARRY = f.map(r => r.carryUsed)
  const STARTS13 = [...STARTS]

  it('툴팁이 그렇게 나온다 — 1주 뒤 줄에서 남은 이월을 모두 쓴다', () => {
    expect(CARRY).toEqual([15_000, ...Array(11).fill(0)])
    expect(TIP[0]).toBe(BLACK - (2_490_000 - 170_000 + 10_000) - 15_000)
  })

  it('1주 뒤 줄의 이월은 이웃한 두 줄 사이에서 지워진다', () => {
    const plain = restore(TIP, BLACK, null)
    const r = restore(TIP, BLACK, null, null, CARRY)
    expect(r.weeks.slice(1, 12)).toEqual(plain.weeks.slice(1, 12))
    expect(r.weeks.slice(1, 12)).toEqual(W13.slice(1, 12))
  })

  it('이번 주에는 쓰일 이월이 전부 빠져 있다', () => {
    const r = restore(TIP, BLACK, null, null, CARRY)
    expect(r.ok).toBe(true)
    expect(r.weeks[12]).toBe(10_000)                  // 갱신 때 채워진 1만
  })

  it('합계를 모르면 가장 오래된 주를 모른다고 표시한다', () => {
    const r = restore(TIP, BLACK, null, null, CARRY)
    expect(r.unknown).toEqual([0])
    expect(r.ok).toBe(true)                       // 모른다고 해서 틀린 것은 아니다
    // 합계를 알면 모르는 주가 없다
    expect(restore(NEEDS, DIAMOND, TOTAL).unknown).toEqual([])
  })

  it('PC방은 가운데 주에서 그대로 나오고, 이번 주는 이월이 섞였다고 알린다', () => {
    const r = restore(TIP, BLACK, null, null, CARRY)
    const gaps = compare(r.weeks, SPENT, STARTS13, r.unknown, [12])
    expect(gaps[0].unknown).toBe(true)
    expect(gaps.every(g => g.ok)).toBe(true)
    expect(gaps[7].amount).toBe(1_200)
    expect(gaps[12].amount).toBe(10_000)
    expect(gaps[12].minutes).toBe(0)
    expect(gaps[12].warn).toContain('이월')
  })

  it('모르는 주는 저장하지 않는다 — 0원으로 굳으면 다시 물을 길이 없다', () => {
    const r = restore(TIP, BLACK, null, null, CARRY)
    const saved = mergeSaved({}, compare(r.weeks, SPENT, STARTS13, r.unknown, [12]))
    expect(STARTS13[0] in saved).toBe(false)
    expect(saved[STARTS13[7]]).toBe(1_200)
  })

  it('블랙은 상단에서 기준점을 못 뽑는다', () => {
    const ths = [150_000, 300_000, 600_000, 900_000, 1_500_000, 2_500_000]
    expect(anchor(ths, ths.length, 0)).toEqual([2_500_000, null])
  })
})

/** 블랙 제보자의 실제 툴팁과 결제 (test/private, git 제외) */
describe.skipIf(!real)('블랙 제보자 캡처', () => {
  it('가운데 주는 수집한 결제와 원 단위까지 같고, 이번 주에는 채워진 이월이 있다', () => {
    const { tip, carry, spent13, nexon13 } = real!.reporter
    const r = restore(tip, 2_500_000, null, null, carry)
    expect(r.ok).toBe(true)
    expect(r.weeks.slice(1, 13)).toEqual(nexon13.slice(1, 13))
    expect(r.weeks[1]).toBe(spent13[1])
  })
})
