import { describe, expect, it } from 'vitest'
import { buildBase, buildState, makePlan, placeMoved, simulate } from './engine'
import { addDays, type Row } from './mvp'

/**
 * 실제로 확인된 한 주(2026-09-24 주, 다이아)를 그대로 재현한다.
 * 인게임 값과 하나라도 갈리면 여기서 걸린다.
 */
const STARTS = ['2026-07-02', '2026-07-09', '2026-07-16', '2026-07-23', '2026-07-30', '2026-08-06',
                '2026-08-13', '2026-08-20', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17',
                '2026-09-24']
// 수집한 결제액 (07-23 주는 구매가 없었고, 그 주 2,100원이 PC방이다)
const SPENT = [30000, 26420, 0, 0, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
// 저장할 때는 0원인 주도 '확인했다'는 뜻으로 함께 남긴다 (실제 pcroom.json과 같다)
const SAVED = Object.fromEntries(STARTS.map(s => [s, s === '2026-07-23' ? 2100 : 0]))
const NOW = new Date('2026-09-25T00:00:00Z')   // 한국 시간 2026-09-25 09:00

const rows: Row[] = SPENT.flatMap((price, i) =>
  price ? [{ date: addDays(STARTS[i], 1), item: '결제', price }] : [])

describe('실제 데이터 재현', () => {
  const base = buildBase(rows, SAVED, NOW)
  const st = buildState(base)

  it('13주 합계와 등급이 인게임과 같다', () => {
    expect(base.thisWeek).toBe('2026-09-24')
    expect(st.sim.total).toBe(909_670)        // 인게임 909,670
    expect(st.current).toBe('diamond')
    expect(st.carry).toBe(0)
  })

  it('필요 금액이 인게임과 같다', () => {
    expect(st.needNow.red).toBe(590_330)      // 인게임 '레드 등급까지 590,330'
    expect(st.need.diamond).toBe(20_330)      // 인게임 '다이아 등급 유지까지 20,330'
  })

  it('다음 주에는 가장 오래된 주가 빠져 골드로 내려간다', () => {
    expect(st.sim.next).toBe('gold')          // 인게임 '다음 주 예상 등급 골드'
    expect(st.sim.forecast[0].sum).toBe(879_670)
  })

  it('PC방 보정이 그 주에만 붙는다', () => {
    expect(st.pcroom.total).toBe(2100)
    expect(st.pcroom.missing).toEqual([])
    expect(st.weeks.filter(w => w.pc).map(w => [w.start, w.pc]))
      .toEqual([['2026-07-23', 2100]])
    expect(st.weeks[3]).toMatchObject({ spent: 0, pc: 2100, amount: 2100 })
  })

  it('주가 13개이고 이번 주가 마지막이다', () => {
    expect(st.weeks.length).toBe(13)
    expect(st.weeks[0].start).toBe('2026-07-02')
    expect(st.weeks[12].start).toBe('2026-09-24')
    expect(st.weeks[12].end).toBe('2026-09-30')
  })
})

describe('시뮬레이션과 목표 계획', () => {
  const base = buildBase(rows, SAVED, NOW)

  it('더 결제하면 등급이 유지된다', () => {
    const s = simulate(base, 20_330)
    expect(s.total).toBe(930_000)
    expect(s.next).toBe('diamond')            // 다음 목요일에도 다이아
    expect(s.keepWeeks).toBeGreaterThan(0)
  })

  it('이번 주가 목표면 이미 달성이다', () => {
    const p = makePlan(base, 'diamond', '2026-09-30', {}, false) as any
    expect(p.required).toBe(0)
    expect(p.base).toBe(909_670)
  })

  it('지금 등급(다이아)을 8주 뒤로 고르면 날짜와 상관없이 지금부터 유지 계획이다', () => {
    // 전에는 '8주 뒤 주에만 기준을 넘기면 된다'로 봐서 인게임 툴팁 '7주차 뒤 108,850'과 같은 금액이 나왔다.
    // 그 사이 주에는 떨어져도 되는 계획이라 쓸모가 없었다(2026-10-04 사용자). 이제는 유지로 본다
    const p = makePlan(base, 'diamond', '2026-11-18', {}, false, { every: 1, weeks: 8 }) as any
    expect(p.mode).toBe('keep')
    expect(p.required).toBe(0)
    expect(p.timeline[0].start).toBe('2026-09-24')
    for (const w of p.timeline) expect(w.sum).toBeGreaterThanOrEqual(900_000)
    // 8주 뒤에도 다이아려면 적어도 인게임 툴팁의 '7주차 뒤 108,850'만큼은 더 내야 한다
    expect(p.planned).toBeGreaterThanOrEqual(108_850)
  })

  it('지난 날짜는 거절한다', () => {
    expect((makePlan(base, 'red', '2026-09-01', {}, false) as any).error).toBeTruthy()
  })
})

/**
 * 2026-10-03 제보: 9/16에 산 693원이 인게임에서는 9/17 주에 들어갔다.
 * 앞 주는 그만큼 적고 다음 주는 꼭 그만큼 많으면 그 행을 다음 주로 옮긴다.
 */
describe('넥슨이 다음 주로 센 결제 옮기기', () => {
  const NOW2 = new Date('2026-10-03T03:00:00Z')   // 한국 시간 10/3 12:00, 이번 주는 10/1
  const rows2: Row[] = [
    { date: '2026-09-11', item: '큰 것', price: 94_941, id: 'big' },
    { date: '2026-09-16', item: '작은 것', price: 693, id: 'small' },
    { date: '2026-09-18', item: '다음 주', price: 69_600, id: 'next' },
  ]
  const nexonOf = (w9: number, w10: number) => {
    const n = Array(13).fill(0)
    n[9] = w9; n[10] = w10
    return n
  }

  it('모자란 만큼의 행을 다음 주 시작일로 옮긴다', () => {
    const b = buildBase(rows2, {}, NOW2)
    expect(b.starts[9]).toBe('2026-09-10')
    const m = placeMoved(b, nexonOf(94_941, 70_293))
    expect([...m]).toEqual([['small', '2026-09-17']])
  })

  it('다음 주 나머지가 100원 단위가 아니면 옮기지 않는다', () => {
    const b = buildBase(rows2, {}, NOW2)
    expect(placeMoved(b, nexonOf(94_941, 70_250)).size).toBe(0)
  })

  it('모르는 주 옆은 건드리지 않는다', () => {
    const b = buildBase(rows2, {}, NOW2)
    expect(placeMoved(b, nexonOf(94_941, 70_293), [10]).size).toBe(0)
  })

  it('id가 없는 행은 옮길 수 없다', () => {
    const b = buildBase(rows2.map(r => (r.id === 'small' ? { ...r, id: undefined } : r)), {}, NOW2)
    expect(placeMoved(b, nexonOf(94_941, 70_293)).size).toBe(0)
  })
})

/** 목표가 지금 등급 이하면 달성이 아니라 유지 계획이다 (2026-10-04 사용자) */
describe('계획의 성격: 달성 · 유지 · 내려가기', () => {
  const NOW3 = new Date('2026-10-03T03:00:00Z')   // 이번 주 10/1
  // 13주 내내 20만씩 → 260만, 지금 블랙
  const black: Row[] = Array.from({ length: 13 }, (_, i) => ({ date: addDays('2026-07-09', i * 7 + 1), item: '결제', price: 200_000 }))
  const keep = { every: 1, weeks: 8 }
  const made = (rows: Row[], target: 'black' | 'red' | 'gold', date: string, k = keep) => {
    const p = makePlan(buildBase(rows, {}, NOW3), target as never, date, {}, false, k)
    if (!('mode' in p)) throw new Error(p.error)
    return p
  }

  it('지금 블랙에 블랙을 고르면 날짜와 상관없이 지금부터 유지', () => {
    const p = made(black, 'black', '2026-11-25')
    expect(p.mode).toBe('keep')
    expect(p.required).toBe(0)
    expect(p.hold).toBeNull()
    expect(p.timeline.length).toBe(keep.weeks + 1)     // 날짜(8주 뒤)는 보지 않는다
    expect(p.curTier).toBe('black')
  })

  it('더 낮은 레드를 고르면 그 날짜가 든 주부터 레드, 그 전까지 블랙', () => {
    const p = made(black, 'red', '2026-10-29')        // 목요일 → 4주 뒤 주
    expect(p.mode).toBe('hold')
    expect(p.hold).toEqual({ th: 2_500_000, until: 4 })
    expect(p.timeline[4].start).toBe('2026-10-29')
  })

  it('지금보다 높은 등급은 전처럼 날짜까지 달성', () => {
    const silver: Row[] = [{ date: '2026-09-25', item: '결제', price: 300_000 }]
    const p = made(silver, 'gold', '2026-10-29', keep)
    expect(p.mode).toBe('reach')
    expect(p.hold).toBeNull()
  })
})
