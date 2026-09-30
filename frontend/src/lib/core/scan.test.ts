import { describe, expect, it } from 'vitest'
import fixture from './scan.fixture.json'
import { restore } from './pcroom'
import { forecast } from './mvp'
import { real } from '../../../test/private'
import {
  type ScanRaw, type Solved, acceptReading, carryFor, isTop, panelFields, pickTotal, solveScan, totalsFor,
  whyReject,
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
 * 블랙 등급 (2026-09-27 제보에서 알게 된 것).
 *
 * 블랙은 두 가지가 다르다.
 *   - 위 등급이 없어 상단 '○○ 등급까지' 줄이 아예 없다 → 13주 합계를 알 수 없다
 *   - 갱신 때 모자란 만큼 이월에서 꺼내 쓰고, 쓴 금액은 새 주 사용 금액으로 채워진다
 *     → 가운데 주는 그대로 나오고, 이번 주에는 목요일에 쓴 이월이 섞여 100원 단위가 아니다
 * 만든 숫자다. 이번 목요일 갱신에서 9,950이 모자라 이월로 메웠고, 이월이 1만 5천 남았다.
 */
const BK_W13 = [170_050, 600_000, 0, 50_000, 0, 500_000, 0, 70_000, 0, 0, 800_000, 300_000, 9_950]
const BLACK_COLLECTED = [170_050, 600_000, 0, 50_000, 0, 500_000, 0, 68_800, 0, 0, 800_000, 300_000, 0]
const bf = forecast(BK_W13, 15_000).slice(0, 12)
const BLACK_TIP = bf.map(r => 2_500_000 - r.sum - r.carryUsed)
// 표 맨 오른쪽 '사용 이월 금액' 열. 첫 갱신에서 다 쓰고 그 뒤는 0이다
const BLACK_CARRY = bf.map(r => r.carryUsed)
// '15,000'에서 0 하나가 떨어진 오독
const MISREAD_CARRY = [150, ...Array(11).fill(0)]
// 화면 숫자들. 하단 'MVP 블랙 구매 금액 이월 15,000'이 들어 있다
const BLACK_AMOUNTS = [1_046, 15_000, 88_333, BLACK_TIP[0]]

describe('블랙 등급', () => {
  const shot: ScanRaw = { readings: [BLACK_TIP], carries: [MISREAD_CARRY, BLACK_CARRY],
                          amounts: BLACK_AMOUNTS, scale: 1 }

  it('이월 열 없이 보면 이번 주가 어느 등급에도 안 맞는다 (제보된 증상)', () => {
    expect(BLACK_CARRY).toEqual([15_000, ...Array(11).fill(0)])
    expect(acceptReading(BLACK_TIP, BLACK_COLLECTED)).toBe(false)
    expect(whyReject(BLACK_TIP, BLACK_COLLECTED)).toContain('어느 등급')
  })

  it('이월 열이 있으면 블랙으로 보고 이번 주의 100원 단위를 묻지 않는다', () => {
    expect(acceptReading(BLACK_TIP, BLACK_COLLECTED, BLACK_CARRY, true)).toBe(true)
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [BLACK_CARRY])).toEqual(BLACK_CARRY)
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

  it('블랙은 결제가 표보다 많아도 받는다 — 기준을 넘긴 몫은 이월로만 가고, 넥슨이 걷어낸 주도 있다', () => {
    const more = [...BLACK_COLLECTED.slice(0, 12), 30_000]
    expect(acceptReading(BLACK_TIP, more, BLACK_CARRY, true)).toBe(true)
    // 그래도 이번 주가 음수로 읽히면 잘못 읽은 것이다
    const bad = [...BLACK_TIP.slice(0, 11), 2_600_000]
    expect(acceptReading(bad, BLACK_COLLECTED, BLACK_CARRY, true)).toBe(false)
    expect(whyReject(bad, BLACK_COLLECTED, BLACK_CARRY, true)).not.toBe('')
  })

  it('블랙이 아닌 표에서는 이월을 뒤지지 않는다', () => {
    // 다이아 캡처는 이월 없이 그대로 풀려야 한다
    const s = solveScan(raw('캡처'), COLLECTED)!
    expect(s.carry.every(n => n === 0)).toBe(true)
    expect(isTop(s)).toBe(false)
  })

  it('이월 열을 두 가지로 읽었으면 화면 하단 이월 잔액과 합이 같은 쪽을 고른다', () => {
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [MISREAD_CARRY, BLACK_CARRY], BLACK_AMOUNTS))
      .toEqual(BLACK_CARRY)
    // 가릴 근거가 없으면 고르지 않는다. 틀린 값을 쓰느니 못 읽은 것으로 둔다
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [MISREAD_CARRY, BLACK_CARRY])).toBeNull()
  })

  it('이월 열을 못 읽었으면 결론을 내지 않는다', () => {
    expect(solveScan({ readings: [BLACK_TIP], amounts: BLACK_AMOUNTS, scale: 1 },
                     BLACK_COLLECTED)).toBeNull()
  })
})

/** 블랙 제보자 캡처를 인식기에 넣어 나온 숫자와 그 사람 결제 (test/private, git 제외) */
describe.skipIf(!real)('블랙 제보자 캡처', () => {
  it('오독한 이월 열까지 섞여도 표·등급·이월이 나온다', () => {
    const r = real!.reporter
    const s = solveScan({ readings: [r.tip], carries: [r.carryMisread, r.carry], amounts: r.amounts, scale: 1 },
                        r.spent13)!
    expect(s.needs).toEqual(r.tip)
    expect(s.carry).toEqual(r.carry)
    expect(s.tierTh).toBe(2_500_000)
  })
})

/**
 * 툴팁 앞쪽 줄이 '0 캐시'인 다이아. 기준보다 한참 위라 앞쪽 몇 주는 모자란 금액이 없다.
 * 만든 숫자다. 7/09 주에만 PC방 2,100이 있고, 상단은 '레드 등급까지 510,000'이다.
 */
describe('앞쪽 줄이 0인 표', () => {
  const W13 = [60_000, 30_000, 0, 0, 0, 40_000, 20_000, 0, 30_000, 40_000, 0, 470_000, 300_000]
  const SPENT = [60_000, 27_900, 0, 0, 0, 40_000, 20_000, 0, 30_000, 40_000, 0, 470_000, 300_000]
  const NEEDS = forecast(W13, 0).slice(0, 12).map(r => Math.max(0, 900_000 - r.sum))
  const TOTAL = W13.reduce((a, b) => a + b, 0)

  it('0인 줄 사이는 합만 알고, 그 합으로 따진다', () => {
    expect(NEEDS[0]).toBe(0)
    const r = restore(NEEDS, 900_000, TOTAL)
    expect(r.ok).toBe(true)
    expect(r.blocks.length).toBe(1)
    const b = r.blocks[0]
    let pc = b.sum
    for (let w = b.from; w <= b.to; w++) pc -= SPENT[w]
    expect(pc).toBe(2_100)
    expect(r.weeks.slice(b.to + 1)).toEqual(W13.slice(b.to + 1))
  })

  it('합계 후보가 갈리면 사용자에게 고르게 넘긴다', () => {
    // 5,100은 오독이지만 0인 줄 때문에 따질 주가 줄어 '레드 등급까지'로 통과한다
    const found = totalsFor(NEEDS, SPENT, [5_100, 1_500_000 - TOTAL, 88_441])
    expect(found.size).toBe(2)
    // PC방으로 떠넘기는 금액이 적은 것을 앞에 둔다
    expect(pickTotal(NEEDS, SPENT, found).map(c => c.total)).toEqual([TOTAL, 1_494_900])
    const s = solveScan({ readings: [NEEDS], amounts: [5_100, 1_500_000 - TOTAL, 88_441], scale: 1 }, SPENT)!
    expect(s.total).toBeNull()
    expect(s.choices?.map(c => c.total)).toEqual([TOTAL, 1_494_900])
  })

  it('0이 앞쪽 말고 사이에 끼어 있으면 잘못 읽은 것이다', () => {
    const bad = [...NEEDS]
    bad[9] = 0
    expect(acceptReading(bad, SPENT)).toBe(false)
  })
})

/** 운영자 계정 캡처(앞 5줄 0 캐시) 숫자와 결제 (test/private, git 제외) */
describe.skipIf(!real)('운영자 0 캐시 캡처', () => {
  it('0인 줄이 있어도 12줄을 받아들이고, 합계 후보를 찾는다', () => {
    const o = real!.operator
    expect(acceptReading(o.needs, o.spent)).toBe(true)
    expect(totalsFor(o.needs, o.spent, o.amounts).size).toBeGreaterThan(0)
  })
})

describe('12줄 모두 0인 표(블랙 아님)', () => {
  it('이번 주 결제만으로 12주 내내 등급이 지켜지면 모두 0이다. 받아 두고 합계는 상단 금액으로', () => {
    // 이번 주에 160만을 결제한 레드: 옛 주가 다 빠져도 레드
    const collected = [0, 20_000, 0, 0, 0, 0, 10_000, 0, 0, 0, 0, 0, 1_600_000]
    const zeros = Array(12).fill(0)
    expect(acceptReading(zeros, collected)).toBe(true)
    const s = solveScan({ readings: [zeros], carries: [], amounts: [870_000], scale: 1 }, collected)
    expect(s?.needs).toEqual(zeros)
    // 상단 '블랙 등급까지 870,000' → 13주 합계 1,630,000(레드)
    expect([s?.total, ...(s?.choices ?? []).map(c => c.total)]).toContain(1_630_000)
    const r = restore(zeros, 1_500_000, 1_630_000)
    expect(r.ok, r.issues.join(' ')).toBe(true)
    expect(r.blocks).toEqual([{ from: 0, to: 12, sum: 1_630_000 }])
  })
})
