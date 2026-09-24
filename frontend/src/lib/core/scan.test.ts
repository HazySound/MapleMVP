import { describe, expect, it } from 'vitest'
import fixture from './scan.fixture.json'
import { type ScanRaw, type Solved, panelFields, solveScan } from './scan'

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
