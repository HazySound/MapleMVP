/**
 * PC방 보정 시나리오. 넥슨이 보는 '진짜' 주별 금액(결제 + PC방)으로 인게임 툴팁을 만들고,
 * 앱에는 구매내역만 준 채 그 툴팁을 스캔시켜 본다. 앱이 확정한 값은 진짜와 같아야 하고,
 * 범위로 남긴 값은 진짜를 품어야 한다. 모른다고 한 주는 정말로 툴팁만으로는 가릴 수 없어야 한다.
 */
import { describe, expect, it } from 'vitest'
import { type Row, BLACK, WINDOW, addDays, forecast, replay, tierNow } from './mvp'
import { HISTORY_WEEKS, type Settled, buildBase, settleScan } from './engine'
import { META, restore, writeWeeks } from './pcroom'
import { real } from '../../../test/private'

const SPAN = HISTORY_WEEKS + WINDOW + 1

/** now주를 마지막으로 하는 전체 기간. 결제와 PC방은 주 시작일 → 금액 */
function world(now: string, spent: Record<string, number>, pc: Record<string, number> = {}) {
  const starts = Array.from({ length: SPAN }, (_, i) => addDays(now, -7 * (SPAN - 1 - i)))
  const rows: Row[] = Object.entries(spent).filter(([, v]) => v > 0)
    .map(([d, v]) => ({ date: addDays(d, 1), item: '', price: v }))
  // 넥슨이 보는 금액. 갱신 때 쓴 이월은 replay가 채운다
  const truth = replay(starts.map(s => (spent[s] ?? 0) + (pc[s] ?? 0)), [], starts)
  const last13 = truth.weeks.slice(-WINDOW)
  const tier = tierNow(last13, truth.carry)!
  const black = tier.key === 'black'
  const f = forecast(last13, truth.carry).slice(0, 12)
  return {
    now, rows, starts: starts.slice(-WINDOW), black, tier,
    pc: starts.slice(-WINDOW).map(s => pc[s] ?? 0),
    carry: truth.carry,
    // 인게임 툴팁: '현재 등급 유지까지'와 (블랙만) '사용 이월 금액'. 모자란 금액이 없으면 0으로 적힌다
    needs: f.map(r => Math.max(0, tier.th - r.sum - (black ? r.carryUsed : 0))),
    used: f.map(r => (black ? r.carryUsed : 0)),
    total: last13.reduce((a, b) => a + b, 0),
  }
}
type World = ReturnType<typeof world>

/** 그 주 일요일 정오(한국)에 스캔한다 */
const at = (week: string) => new Date(addDays(week, 3) + 'T03:00:00Z')

function scan(w: World, saved: Record<string, number> = {}): Settled {
  const b = buildBase(w.rows, saved, at(w.now))
  const r = restore(w.needs, w.tier.th, w.black ? null : w.total, null, w.used)
  expect(r.ok, r.issues.join(' ')).toBe(true)
  // 1주 뒤 '유지까지'가 0이면 이월이 남아 잔액을 알 수 없다
  return settleScan(b, r, w.black ? (w.needs[0] > 0 ? w.used[0] : null) : 0)
}

/**
 * 확정한 주는 진짜와 같고, 범위는 진짜를 품는다. 합만 아는 묶음은 합이 진짜와 같다.
 * conflict: 규칙으로 못 맞춘 경우를 허용한다
 */
function honest(s: Settled, w: World, conflict = false) {
  expect(s.conflict).toBe(conflict)
  const groups = new Set(s.weeks.map(x => x.group).filter(Boolean))
  for (const g of groups) {
    const idx = s.weeks.flatMap((x, i) => (x.group === g ? [i] : []))
    expect(idx.reduce((a, i) => a + s.weeks[i].gapMin, 0), `${g} 묶음 합`)
      .toBe(idx.reduce((a, i) => a + w.pc[i], 0))
  }
  s.weeks.forEach((x, i) => {
    if (x.unknown || x.group) return
    expect(w.pc[i], `${x.start} PC방 ${x.pcMin}~${x.pcMax}`).toBeGreaterThanOrEqual(x.pcMin)
    expect(w.pc[i], `${x.start} PC방 ${x.pcMin}~${x.pcMax}`).toBeLessThanOrEqual(x.pcMax)
  })
}

const exactWeeks = (s: Settled) => s.weeks.filter(x => !x.unknown && !x.group && x.pcMin === x.pcMax
  && x.gapMin === x.gapMax).map(x => x.start)
const save = (s: Settled, now: string, saved: Record<string, number> = {}) =>
  ({ ...saved, ...writeWeeks(s.weeks), ...(s.carry != null ? { [META.carry + now]: s.carry } : {}) })

describe('블랙 이력이 없는 사람', () => {
  const w = world('2026-11-26',
    { '2026-09-03': 400_000, '2026-09-17': 80_000, '2026-10-08': 300_000, '2026-11-19': 50_000 },
    { '2026-09-10': 1_200, '2026-10-22': 600, '2026-11-26': 300 })

  it('13주 전부 주별로 확정된다', () => {
    const s = scan(w)
    honest(s, w)
    expect(exactWeeks(s)).toEqual(w.starts)
  })
})

describe('이월 제도 전(9/17 전)에 250만을 넘긴 사람', () => {
  // 7월에 넘긴 금액은 그때 규칙대로 사라졌다. 앱이 이월을 지어내면 안 된다
  const w = world('2026-10-08',
    { '2026-06-25': 900_000, '2026-07-09': 1_700_000, '2026-07-16': 300_000, '2026-08-20': 100_000,
      '2026-10-01': 200_000 },
    { '2026-09-03': 800 })

  it('스캔 전에도 이월이 없다', () => {
    expect(buildBase(w.rows, {}, at(w.now)).carry).toBe(0)
    expect(buildBase(w.rows, {}, at(w.now)).used13.every(u => u === 0)).toBe(true)
  })

  it('13주 전부 확정된다', () => {
    const s = scan(w)
    honest(s, w)
    expect(exactWeeks(s)).toEqual(w.starts)
  })

  it('제도 시작 직후, 7월 초과분이 13주에 남은 채로 결제하면 그때부터는 이월이 쌓인다', () => {
    // 9/17 주 결제 20만이 통째로 이월이 되고, 9/24·10/01·10/08 갱신에서 차례로 쓰인다.
    // 그 갱신들의 12주 합계에 스캔한 적 없는 7월 주(PC방 1,000)가 들어 있어 규칙으로는 못 맞춘다.
    // 그래도 이월이 쓰였을 수 있는 주는 범위로 두어 틀린 값을 확정하지 않는다
    const w2 = world('2026-10-08',
      { '2026-06-25': 900_000, '2026-07-09': 1_700_000, '2026-07-16': 300_000, '2026-08-20': 100_000,
        '2026-09-17': 200_000 },
      { '2026-09-03': 800, '2026-07-09': 1_000 })
    const s = scan(w2)
    honest(s, w2, true)
    const ranged = s.weeks.filter(x => x.pcMax > x.pcMin).map(x => x.start)
    expect(ranged).toEqual(['2026-09-24', '2026-10-08'])
    expect(s.weeks[7]).toMatchObject({ start: '2026-09-03', pcMin: 800, pcMax: 800 })   // 그대로 확정
  })
})

/**
 * 블랙 제보자와 같은 흐름을 만든 숫자로 옮긴 것. 7월에 크게 결제하고, 9/17 주 결제로 250만을
 * 넘겨 이월이 쌓이고, 9/24 갱신에서 모자란 9,300을 이월로 메웠다. 13주 밖 6/25 주는 30,000.
 * PC방은 8/20 주 1,200만 확정이고, 나머지는 툴팁이 똑같이 나오는 두 가지 경우를 둔다.
 */
const REPORTER_SPENT: Record<string, number> = {
  '2026-06-25': 30_000, '2026-07-02': 120_000, '2026-07-09': 650_000, '2026-07-16': 700,
  '2026-07-23': 50_000, '2026-08-06': 500_000, '2026-08-20': 68_800, '2026-09-10': 800_000,
  '2026-09-17': 300_000,
}
const reporter = (pc: Record<string, number>, now = '2026-09-24', spent = REPORTER_SPENT) =>
  world(now, spent, { '2026-08-20': 1_200, ...pc })
// ① 6/25 주에 PC방 1,600   ② 7/02 주와 이번 주에 500씩, 6/25 주에 100
const R1 = reporter({ '2026-06-25': 1_600 })
const R2 = reporter({ '2026-07-02': 500, '2026-09-24': 500, '2026-06-25': 100 })

describe('블랙 첫 스캔 — 제보자와 같은 흐름', () => {
  it('블랙이고, 1주 뒤 줄에서 남은 이월을 모두 쓴다', () => {
    expect(R1.black).toBe(true)
    expect(R1.carry).toBe(13_000)
    expect(R1.used).toEqual([13_000, ...Array(11).fill(0)])
    expect(R1.needs[0]).toBeGreaterThan(0)
  })

  it('PC방이 다른 두 경우가 툴팁으로는 똑같다 — 툴팁만으로는 가를 수 없다', () => {
    expect(R2.needs).toEqual(R1.needs)
    expect(R2.used).toEqual(R1.used)
  })

  it('가운데 11주는 확정, 7/02 주와 이번 주는 0~500 범위', () => {
    for (const w of [R1, R2]) {
      const s = scan(w)
      honest(s, w)
      expect(exactWeeks(s)).toEqual(w.starts.slice(1, 12))
      expect(s.weeks[0]).toMatchObject({ unknown: false, pcMin: 0, pcMax: 500 })
      expect(s.weeks[12]).toMatchObject({ gapMin: 9_300, pcMin: 0, pcMax: 500 })
      expect(s.weeks[7].pcMin).toBe(1_200)
    }
  })

  it('저장하면 앱의 이월과 다음 주 필요 금액이 인게임과 같아진다', () => {
    const b = buildBase(R1.rows, save(scan(R1), R1.now), at(R1.now))
    expect(b.carry).toBe(R1.carry)
    const f = forecast(b.last13, b.carry)
    expect(BLACK.th - f[0].sum - f[0].carryUsed).toBe(R1.needs[0])
  })
})

/** 블랙 제보자의 실제 결제로 만든 툴팁이 캡처와 원 단위까지 같은지 (test/private, git 제외) */
describe.skipIf(!real)('블랙 제보자 실제 결제', () => {
  it('6/25 주 PC방 1,600으로 보면 캡처와 같은 툴팁이 나온다', () => {
    const r = real!.reporter
    const w = reporter({ ...r.pcKnown, '2026-06-25': 1_600 }, '2026-09-24', r.spentByWeek)
    expect(w.needs).toEqual(r.tip)
    expect(w.used).toEqual(r.carry)
    honest(scan(w), w)
  })
})

describe('그 사람의 다음 주 (10/01) — 툴팁 앞 4줄이 0', () => {
  // 레드로 떨어지지만 합계가 레드 기준보다 한참 위라 앞 4줄은 모자란 금액이 없어 0으로 적힌다.
  // 그 사이 7/09~8/06 주는 합만 알 수 있다
  const w2 = (pc: Record<string, number>) => reporter(pc, '2026-10-01')

  it('툴팁이 그렇게 나온다', () => {
    const w = w2({ '2026-06-25': 1_600 })
    expect(w.tier.key).toBe('red')
    expect(w.needs.slice(0, 4)).toEqual([0, 0, 0, 0])
    expect(w.needs.slice(4).every(n => n > 0)).toBe(true)
  })

  it('9/24에 스캔해 뒀으면 그 값으로 채워 전부 확정된다 (묶였던 9/24 주만 범위)', () => {
    for (const [pc1, w1] of [[{ '2026-06-25': 1_600 }, R1],
                             [{ '2026-07-02': 500, '2026-09-24': 500, '2026-06-25': 100 }, R2]] as const) {
      const w = w2(pc1)
      const s = scan(w, save(scan(w1), w1.now))
      honest(s, w)
      expect(s.weeks.filter(x => x.group || x.unknown)).toEqual([])
      const ranged = s.weeks.filter(x => x.pcMax > x.pcMin).map(x => x.start)
      expect(ranged).toEqual(['2026-09-24'])
    }
  })

  it('처음 스캔이면 0인 줄 사이의 주는 합만 안다', () => {
    const w = w2({ '2026-06-25': 1_600, '2026-07-16': 300, '2026-07-30': 200 })
    const s = scan(w)
    honest(s, w)
    const g = s.weeks.filter(x => x.group).map(x => x.start)
    // 0인 줄 넷의 앞뒤, 곧 다섯 주가 한 묶음이다
    expect(g).toEqual(['2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30', '2026-08-06'])
    expect(s.weeks[0].gapMin).toBe(500)               // 다섯 주 PC방 합이 첫 주에 몰려 있다
  })
})

describe('블랙 첫 스캔 — 이번 주에 이월을 안 쓴 경우', () => {
  // 10/15 갱신 때도 250만이 넘어 이월을 쓰지 않았다. 이월은 9/24 주 결제만큼만 쌓였다
  const spent = { '2026-07-23': 1_250_000, '2026-07-30': 600_000, '2026-08-06': 200_000, '2026-09-03': 500_000,
                  '2026-09-24': 50_000 }
  const pc = { '2026-07-23': 700, '2026-08-13': 300, '2026-09-10': 1_200, '2026-10-15': 600 }
  const w = world('2026-10-15', spent, pc)

  it('가장 오래된 주만 확인 불가, 나머지는 이번 주까지 확정', () => {
    expect(w.black).toBe(true)
    const s = scan(w)
    honest(s, w)
    expect(s.weeks[0].unknown).toBe(true)
    expect(exactWeeks(s)).toEqual(w.starts.slice(1))
  })

  it('다음 주에 또 스캔하면 13주 전부 확정된다 (이번에는 이월을 쓰고 떨어진다)', () => {
    const w2 = world('2026-10-22', spent, pc)
    expect(w2.black).toBe(false)
    const s = scan(w2, save(scan(w), w.now))
    honest(s, w2)
    expect(exactWeeks(s)).toEqual(w2.starts)
  })
})

/**
 * 지금은 블랙이 아니지만 13주 안에 블랙을 다녀온 사람. 이월은 9/24 주에 쌓였는데
 * 그때 13주 창(6/25~9/24)에는 지금 13주 밖 주(7/30 PC방 800)가 들어 있어, 쌓인 양을
 * 구매내역으로는 정확히 알 수 없다.
 */
const BLACK_ONCE = { '2026-07-30': 1_000_000, '2026-08-06': 400_000, '2026-09-10': 300_000, '2026-09-24': 820_000 }
const ONCE_PC = { '2026-07-30': 800, '2026-10-29': 300, '2026-10-08': 500 }

describe('블랙을 다녀와 이번 주에 이월을 다 쓰고 떨어진 사람', () => {
  const w = world('2026-10-29', BLACK_ONCE, ONCE_PC)

  it('이번 주 PC방은 범위로, 나머지는 확정', () => {
    expect(w.black).toBe(false)
    const s = scan(w)
    honest(s, w)
    expect(s.weeks[12].pcMax).toBeGreaterThan(s.weeks[12].pcMin)
    expect(exactWeeks(s)).toEqual(w.starts.slice(0, 12))
  })
})

describe('블랙을 다녀와 몇 주 전에 이월을 다 쓴 사람 — 처음 스캔', () => {
  const w = world('2026-12-03', BLACK_ONCE, ONCE_PC)

  it('이월이 쓰인 10/29 주는 범위, 나머지는 확정', () => {
    expect(w.black).toBe(false)
    const s = scan(w)
    honest(s, w)
    const ranged = s.weeks.filter(x => x.pcMax > x.pcMin).map(x => x.start)
    expect(ranged).toEqual(['2026-10-29'])
  })

})

describe('블랙일 때 한 번이라도 스캔해 둔 사람', () => {
  it('블랙인 10/22에 스캔해 두면, 이월을 다 쓰고 떨어진 10/29 주도 확정된다', () => {
    const w1 = world('2026-10-22', BLACK_ONCE, ONCE_PC)
    expect(w1.black).toBe(true)
    const s1 = scan(w1)
    honest(s1, w1)
    const w2 = world('2026-10-29', BLACK_ONCE, ONCE_PC)
    const s2 = scan(w2, save(s1, w1.now))
    honest(s2, w2)
    expect(s2.weeks[12].pcMin).toBe(300)
    expect(s2.weeks[12].pcMax).toBe(300)
  })
})
