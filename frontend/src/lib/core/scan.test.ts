import { describe, expect, it } from 'vitest'
import fixture from './scan.fixture.json'
import { NO_CARRY, restore } from './pcroom'
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

  it('숫자가 하나 틀린 후보끼리 표가 갈리면 못 읽은 것으로 본다', () => {
    const wrong = [...TRUTH]
    wrong[5] = 88_950                       // 88,850 → 88,950
    const wrong2 = [...TRUTH]
    wrong2[7] = 108_950
    const s = solveScan({ readings: [wrong, wrong2], votes: [6, 5], amounts: [590_330], scale: 1 }, COLLECTED)
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
    // 판독마다 득표가 있으면 많이 읽힌 쪽을 쓰고, 표가 같으면 여전히 고르지 않는다
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [MISREAD_CARRY, BLACK_CARRY], [], [], {}, [2, 28])).toEqual(BLACK_CARRY)
    expect(carryFor(BLACK_TIP, BLACK_COLLECTED, [MISREAD_CARRY, BLACK_CARRY], [], [], {}, [5, 5])).toBeNull()
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

describe('구매내역과 맞춰 볼 수 없는 표', () => {
  it('최근까지 블랙이던 레드: 이월이 섞여 검사를 못 넘으면 표 모양(줄지 않는 판독)으로 하나를 고른다', () => {
    // 인게임 주별이 이월 때문에 수집과 크게 다르다(더 적은 주, 100원 단위 아닌 주)
    const collected = [0, 0, 300_000, 400_000, 0, 0, 600_000, 7_130, 0, 40_000, 700_000, 0, 70_000]
    const good = [0, 0, 0, 0, 0, 0, 100_210, 100_210, 100_210, 100_210, 100_210, 1_300_010]
    const bad1 = [0, 0, 0, 0, 0, 0, 100_210, 1_002_111, 100_210, 100_210, 100_210, 1_300_010]
    const bad2 = [0, 0, 0, 0, 0, 0, 100_210, 100_210, 100_210, 100_210, 100_210, 13_010]
    const s = solveScan({ readings: [good, bad1, bad2], carries: [], amounts: [11_111, 200_470], scale: 1 }, collected)
    expect(s?.needs).toEqual(good)
    expect(s?.relaxed).toBe(true)
    expect(s?.tierTh).toBe(1_500_000)
    expect(s?.total).toBe(2_500_000 - 200_470)
  })
  it('확실히 읽은 표는 구매내역과 달라도 인게임대로 받는다(선물한 쿠폰 등)', () => {
    const collected = [...COLLECTED]
    collected[6] += 900_000                 // 인게임에 안 들어간 결제 90만 원
    const wrong = [...TRUTH]
    wrong[5] = 88_950
    const s = solveScan({ readings: [TRUTH, wrong], votes: [30, 2], amounts: [590_330, 41_110], panel: [590_330], scale: 1 },
                        collected)
    expect(s?.needs).toEqual(TRUTH)
    expect(s?.relaxed).toBe(true)
    expect([s?.tierTh, s?.total]).toEqual([DIAMOND, TOTAL])
  })
  it('압도적인 판독이 있으면 검사를 통과하는 소수 판독으로 가지 않는다', () => {
    const wrong = [...TRUTH]
    wrong[5] = 88_950
    const s = solveScan({ readings: [wrong, TRUTH], votes: [30, 2], amounts: [590_330], panel: [590_330], scale: 1 }, COLLECTED)
    expect(s?.needs).toEqual(wrong)
  })
  it('표가 엇비슷하게 갈리고 구매내역과도 안 맞으면 못 읽은 것으로 본다', () => {
    const collected = [...COLLECTED]
    collected[6] += 900_000
    const wrong = [...TRUTH]
    wrong[5] = 88_950
    expect(solveScan({ readings: [TRUTH, wrong], votes: [12, 10], amounts: [590_330], panel: [590_330], scale: 1 }, collected))
      .toBeNull()
  })
  it('블랙인데 12줄 모두 0이고 이월도 안 쓴다: 이번 주가 딱 기준, 옛 주는 0', () => {
    const zeros = Array(12).fill(0)
    const r = restore(zeros, 2_500_000, null, null, zeros)
    expect(r.ok, r.issues.join(' ')).toBe(true)
    expect(r.weeks.slice(1)).toEqual([...Array(11).fill(0), 2_500_000])
  })
})

/**
 * 2026-10-03 제보 둘.
 *  - 실버: 9/16에 산 693원이 인게임에서는 9/17 주에 들어갔다. 9/10 주는 수집보다 693원 적고
 *    9/17 주는 693원 많아 '100의 배수가 아니다'로 막혔다. 바로 앞 주에서 빠진 만큼은 PC방이 아니다
 *  - 블랙: 9/10 주가 수집보다 3,420원 많다. 블랙은 기준에 닿는 순간 결제가 쪼개지고 넥슨이 걷어낸
 *    금액도 1원 단위라 100원 단위를 물을 수 없다. 13주 합계는 인게임을 믿는다
 * 숫자는 두 제보의 캡처 기록을 그대로 옮긴 것이다
 */
describe('넥슨이 결제를 다음 주로 센 경우 (실버)', () => {
  const TIP = [0, 0, 0, 8_712, 32_595, 65_166, 134_766, 134_766, 134_766, 229_707, 300_000, 300_000]
  const SPENT = [0, 17_325, 8_316, 49_800, 21_483, 33_691, 69_600, 0, 0, 95_634, 69_600, 0, 0]
  // 8/13 주의 1,120원은 MVP에 안 들어간 결제, 9/10 주의 693원은 9/17 주로 넘어간 결제
  const ITEMS = SPENT.map((v, i) => (i === 5 ? [1_120, 32_571] : i === 9 ? [693, 94_941] : v ? [v] : []))

  it('앞 주에서 빠진 만큼 다음 주가 더 잡혀 있으면 통과한다', () => {
    expect(acceptReading(TIP, SPENT, NO_CARRY, false, [], { items: ITEMS })).toBe(true)
  })

  it('물건값으로 설명되지 않으면 여전히 막힌다', () => {
    expect(acceptReading(TIP, SPENT)).toBe(false)
    expect(whyReject(TIP, SPENT)).toContain('6번째 주')
  })

  it('넘어온 만큼을 빼고도 100원 단위가 아니면 막힌다', () => {
    const spent = [...SPENT]
    spent[10] = 69_650                      // 9/17 주 차이 643원. 693원이 넘어왔다고 볼 수 없다
    expect(acceptReading(TIP, spent, NO_CARRY, false, [], { items: ITEMS })).toBe(false)
    expect(whyReject(TIP, spent, NO_CARRY, false, [], { items: ITEMS })).toContain('11번째 주')
  })

  it("상단 '골드 등급까지 233,271'과 합쳐 한 장으로 풀린다", () => {
    // 233,271 왼쪽에 '등급까지'가 보였다(판독기가 panel로 넘긴다)
    const s = solveScan({ readings: [TIP], amounts: [1_141, 233_271], panel: [233_271], scale: 1 }, SPENT, null, [], { items: ITEMS })!
    expect(s).not.toBeNull()
    expect(s.tierTh).toBe(300_000)
    expect(s.total).toBe(600_000 - 233_271)
  })

  it("'등급까지'를 못 찾았으면 답이 하나여도 앞쪽 0줄 묶음이 걸리니 확인받는다", () => {
    const s = solveScan({ readings: [TIP], amounts: [1_141, 233_271], scale: 1 }, SPENT, null, [], { items: ITEMS })!
    expect(s.total).toBeNull()
    expect(s.confirm).toBe(true)
    expect(s.choices).toEqual([{ tierTh: 300_000, total: 600_000 - 233_271 }])
  })
})

describe('블랙 주 금액이 1원 단위인 경우', () => {
  const TIP = [0, 0, 320_450, 582_350, 628_950, 1_052_380, 1_353_610, 1_372_210, 1_886_010, 1_922_820,
               1_922_820, 1_941_120]
  const CARRY = [13_100, 12_100, 188_780, 0, 0, 0, 0, 0, 0, 0, 0, 0]
  const SPENT = [0, 0, 495_930, 250_000, 30_000, 404_130, 283_130, 0, 500_000, 33_390, 177_600, 320_000, 30_000]

  it('수집보다 3,420원 많은 주가 있어도 블랙은 통과한다', () => {
    expect(acceptReading(TIP, SPENT, CARRY, true)).toBe(true)
    expect(whyReject(TIP, SPENT, CARRY, true)).not.toContain('100의 배수')
  })

  it('이월 열 합이 화면 잔액과 같으면 그 열로 결론이 난다', () => {
    const s = solveScan({ readings: [TIP], carries: [CARRY], amounts: [213_980], scale: 1 }, SPENT)!
    expect(s).not.toBeNull()
    expect(s.tierTh).toBe(2_500_000)
    expect(s.carry).toEqual(CARRY)
  })
})
