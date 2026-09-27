import { describe, expect, it } from 'vitest'
import fixture from './scan.fixture.json'
import {
  type ScanRaw, type Solved, acceptReading, carryFor, isTop, panelFields, solveScan, whyReject,
} from './scan'

/**
 * 실제 인게임 캡처 8장을 파이썬 인식기에 넣어 나온 후보를 그대로 담아 두고,
 * 규칙이 그중 맞는 것을 고르는지 본다. 인식기를 canvas로 옮겨도 같은 후보를
 * 내놓기만 하면 이 테스트가 그대로 쓰인다.
 */
const TRUTH = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
const COLLECTED = [30000, 26420, 0, 0, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
const TOTAL = 909_670
const DIAMOND = 900_000

const raw = (name: keyof typeof fixture) => fixture[name] as ScanRaw

describe('캡처 한 장으로 다 읽히는 경우', () => {
  for (const name of ['캡처', '클립보드', '위치이동', '창모드1', '창모드2', '창모드 부분캡처'] as const) {
    it(`${name}`, () => {
      const s = solveScan(raw(name), COLLECTED)!
      expect(s.needs).toEqual(TRUTH)
      expect(s.tierTh).toBe(DIAMOND)
      expect(s.total).toBe(TOTAL)
      expect(panelFields(s)).toEqual({ tierIndex: 4, remaining: 590_330 })
    })
  }
})

describe('툴팁이 상단 패널을 가린 경우', () => {
  for (const name of ['가림', '다가림'] as const) {
    it(`${name} — 12줄은 읽고 합계만 모른다`, () => {
      const s = solveScan(raw(name), COLLECTED)!
      expect(s.needs).toEqual(TRUTH)
      expect(s.tierTh).toBe(DIAMOND)
      expect(s.total).toBeNull()
      expect(panelFields(s).remaining).toBeNull()
    })
  }

  it('두 번째 장에서 합계만 채운다', () => {
    const first = solveScan(raw('가림'), COLLECTED)!
    expect(first.total).toBeNull()
    // 마우스를 치우면 툴팁이 사라진다 → 표 없이 숫자만 있는 장
    const second: ScanRaw = { readings: [], amounts: raw('캡처').amounts, scale: 0 }
    const s = solveScan(second, COLLECTED, first)!
    expect(s.needs).toEqual(TRUTH)
    expect(s.total).toBe(TOTAL)
  })
})

describe('오답은 통과하지 못한다', () => {
  it('아무것도 못 읽으면 null', () => {
    expect(solveScan({ readings: [], amounts: [], scale: 1 }, COLLECTED)).toBeNull()
  })

  it('숫자가 하나 틀린 후보는 걸러진다', () => {
    const wrong = [...TRUTH]
    wrong[5] = 88_950                       // 88,850 → 88,950
    const s = solveScan({ readings: [wrong], amounts: [590_330], scale: 1 }, COLLECTED)
    expect(s).toBeNull()
  })

  it('줄 순서가 뒤집힌 후보는 걸러진다', () => {
    const rev = [...TRUTH].reverse()
    expect(solveScan({ readings: [rev], amounts: [590_330], scale: 1 }, COLLECTED)).toBeNull()
  })

  it('정답과 오답이 섞여 있으면 정답만 고른다', () => {
    const wrong = TRUTH.map(v => v + 7)
    const s = solveScan({ readings: [wrong, TRUTH, wrong], amounts: raw('캡처').amounts, scale: 1 },
                        COLLECTED)!
    expect(s.needs).toEqual(TRUTH)
    expect(s.total).toBe(TOTAL)
  })
})

describe('실제로 모든 후보가 걸러지는지', () => {
  it('8장 모두, 통과한 후보는 정답뿐이다', () => {
    for (const name of Object.keys(fixture) as (keyof typeof fixture)[]) {
      const s: Solved | null = solveScan(raw(name), COLLECTED)
      expect(s, name).not.toBeNull()
      expect(s!.needs, name).toEqual(TRUTH)
    }
  })
})

/**
 * 블랙 등급 (2026-09-27 제보).
 *
 * 블랙은 두 가지가 다르다.
 *   - 위 등급이 없어 상단 '○○ 등급까지' 줄이 아예 없다 → 13주 합계를 알 수 없다
 *   - 갱신 때 모자란 만큼 이월에서 자동으로 꺼내 쓴다 → 1주 뒤 줄만 이월만큼 작게 적힌다
 * 아래 숫자는 제보자 캡처를 파이썬 인식기에 넣어 나온 것을 그대로 옮긴 것이다.
 */
const BLACK_TIP = [104_568, 771_531, 772_224, 822_024, 822_024, 1_325_364,
                   1_325_364, 1_396_164, 1_396_164, 1_396_164, 2_201_034, 2_476_134]
// 표 맨 오른쪽 '사용 이월 금액' 열. 첫 갱신에서 다 쓰고 그 뒤는 0이다
const BLACK_CARRY = [16_132, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
// 같은 캡처에서 읽힌 화면 숫자들. 오독 찌꺼기까지 그대로 두어야 시험이 된다
const BLACK_AMOUNTS = [1046, 1115, 2114, 2511, 4048, 4101, 5836, 5969, 5979, 6441, 6811, 7841,
                       8112, 8326, 8411, 10411, 16132, 21111, 41144, 58326, 79711, 88333, 88353,
                       88357, 88999, 98929, 104568, 111112, 811721, 811888, 814888, 1041168, 1111112]
// 이월을 되돌려 놓았을 때 주차별 금액과 아귀가 맞는 결제 내역
const BLACK_COLLECTED = [300_000, 640_831, 693, 45_800, 0, 500_340, 0, 60_800, 0, 0,
                         800_870, 270_100, 20_866]

describe('블랙 등급', () => {
  const shot: ScanRaw = { readings: [BLACK_TIP], carries: [BLACK_CARRY],
                          amounts: BLACK_AMOUNTS, scale: 1 }

  it('이월을 모르면 표가 통째로 막힌다 (제보된 증상)', () => {
    expect(acceptReading(BLACK_TIP, BLACK_COLLECTED)).toBe(false)
  })

  it("'사용 이월 금액' 열을 가져다 표를 푼다", () => {
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [BLACK_CARRY])).toEqual(BLACK_CARRY)
    expect(acceptReading(BLACK_TIP, BLACK_COLLECTED, BLACK_CARRY)).toBe(true)
  })

  it('한 장으로 결론이 난다 — 합계는 없지만 등급과 이월은 나온다', () => {
    const s = solveScan(shot, BLACK_COLLECTED)!
    expect(s.needs).toEqual(BLACK_TIP)
    expect(s.tierTh).toBe(2_500_000)
    expect(s.carry).toEqual(BLACK_CARRY)
    expect(s.total).toBeNull()      // 위 등급이 없어 화면에 안 나온다
    expect(isTop(s)).toBe(true)
  })

  it("'○○ 등급까지' 자리가 목록 밖으로 나간다", () => {
    const s = solveScan(shot, BLACK_COLLECTED)!
    expect(panelFields(s)).toEqual({ tierIndex: 6, remaining: null })
  })

  it('막힌 까닭을 이월이라고 짚어 준다', () => {
    expect(whyReject(BLACK_TIP, BLACK_COLLECTED)).toContain('이월')
  })

  it('블랙이 아닌 표에서는 이월을 뒤지지 않는다', () => {
    // 다이아 캡처는 이월 없이 그대로 풀려야 한다
    const s = solveScan(raw('캡처'), COLLECTED)!
    expect(s.carry.every(n => n === 0)).toBe(true)
    expect(isTop(s)).toBe(false)
  })

  it('이월 열을 두 가지로 읽었으면 고르지 않는다', () => {
    // 둘 다 말이 되면 어느 쪽인지 알 수 없다. 틀린 값을 쓰느니 못 읽은 것으로 둔다
    const other = [6_132, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [BLACK_CARRY, other])).toBeNull()
  })

  it('이월 열을 못 읽었으면 결론을 내지 않는다', () => {
    expect(solveScan({ readings: [BLACK_TIP], amounts: BLACK_AMOUNTS, scale: 1 },
                     BLACK_COLLECTED)).toBeNull()
  })
})
