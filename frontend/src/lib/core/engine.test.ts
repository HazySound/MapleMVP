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

  it('8주 뒤 다이아 유지는 인게임 표와 같은 금액이 든다', () => {
    const p = makePlan(base, 'diamond', '2026-11-18', {}, false) as any
    // 인게임 툴팁 '7주차 뒤 108,850 캐시'와 같은 값
    expect(p.required).toBe(108_850)
    expect(p.timeline[0].start).toBe('2026-09-24')
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
