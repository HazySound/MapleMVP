import { describe, expect, it } from 'vitest'
import { buildBase, buildState, makePlan, needRecheck, placeMoved, rollPlan, simulate } from './engine'
import { addDays, type Row } from './mvp'
import { writeWeeks } from './pcroom'

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
    const p = makePlan(base, 'diamond', '2026-09-30', {}) as any
    expect(p.required).toBe(0)
    expect(p.base).toBe(909_670)
  })

  it('지금 등급(다이아)을 8주 뒤로 고르면 날짜와 상관없이 지금부터 유지 계획이다', () => {
    // 전에는 '8주 뒤 주에만 기준을 넘기면 된다'로 봐서 인게임 툴팁 '7주차 뒤 108,850'과 같은 금액이 나왔다.
    // 그 사이 주에는 떨어져도 되는 계획이라 쓸모가 없었다(2026-10-04 사용자). 이제는 유지로 본다
    const p = makePlan(base, 'diamond', '2026-11-18', {}, { every: 1, weeks: 8 }) as any
    expect(p.mode).toBe('keep')
    expect(p.required).toBe(0)
    expect(p.timeline[0].start).toBe('2026-09-24')
    for (const w of p.timeline) expect(w.sum).toBeGreaterThanOrEqual(900_000)
    // 8주 뒤에도 다이아려면 적어도 인게임 툴팁의 '7주차 뒤 108,850'만큼은 더 내야 한다
    expect(p.planned).toBeGreaterThanOrEqual(108_850)
  })

  it('지난 날짜는 거절한다', () => {
    expect((makePlan(base, 'red', '2026-09-01', {}) as any).error).toBeTruthy()
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
  const made = (rows: Row[], target: 'black' | 'red' | 'gold', date: string, k = keep, holdCur = false) => {
    const p = makePlan(buildBase(rows, {}, NOW3), target as never, date, {}, k, 1000, holdCur)
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

  it('더 낮은 레드를 고르면 바로 레드 기준으로 낮춰 유지한다(날짜는 안 쓴다)', () => {
    const p = made(black, 'red', '2020-01-01')        // 지난 날짜여도 낮출 때는 날짜를 안 써서 오류가 아니다
    expect(p.mode).toBe('hold')
    expect(p.hold).toBeNull()
    expect(p.holdCur).toBe(false)
    // 결제를 더 안 하면 내려가는 흐름과, 블랙을 계속 지킬 때 금액을 같이 낸다
    expect(p.decay.length).toBeGreaterThan(0)
    expect(p.stay).not.toBeNull()
    expect(p.planned).toBeLessThanOrEqual(p.stay!.planned)
  })

  it('블랙을 날짜까지 지키기를 켜면 그 날짜가 든 주까지 블랙, 다음 주부터 레드 기준', () => {
    const p = made(black, 'red', '2026-10-29', keep, true)        // 목요일 → 4주 뒤 주까지 블랙
    expect(p.mode).toBe('hold')
    expect(p.hold).toEqual({ th: 2_500_000, until: 5 })
    expect(p.timeline[4].start).toBe('2026-10-29')
    expect(p.timeline.slice(0, 5).every(w => w.tier === 'black')).toBe(true)
  })

  it('고정한 금액이 있으면 모두 자동으로 짰을 때와 견준다', () => {
    const base = buildBase(black, {}, NOW3)
    const fixed = { '2026-10-08': 900_000, '2026-10-15': 0 }
    const p = makePlan(base, 'red', '2026-10-29', fixed, keep)
    if (!('mode' in p)) throw new Error(p.error)
    expect(p.auto).not.toBeNull()
    expect(p.planned).toBeGreaterThanOrEqual(p.auto!.planned)
    const q = makePlan(base, 'red', '2026-10-29', {}, keep)
    if (!('mode' in q)) throw new Error(q.error)
    expect(q.auto).toBeNull()
    expect(q.planned).toBe(p.auto!.planned)
  })

  it('지금보다 높은 등급은 전처럼 날짜까지 달성', () => {
    const silver: Row[] = [{ date: '2026-09-25', item: '결제', price: 300_000 }]
    const p = made(silver, 'gold', '2026-10-29', keep)
    expect(p.mode).toBe('reach')
    expect(p.hold).toBeNull()
  })
})

describe('다시 맞추라는 안내(합만 아는 묶음)', () => {
  // 2026-10-06 제보 모양: 10/5 실버로 맞출 때 툴팁 앞 9줄이 0이라 7/9~9/10 PC방 139,100원을 합으로만 알았다(9/10 주에 몰아 둠)
  const starts = Array.from({ length: 13 }, (_, i) => addDays('2026-07-09', i * 7))
  const paid: Row[] = [
    { date: '2026-07-10', item: '결제', price: 30_000, id: '00202607101200000000000001' },
    { date: '2026-07-24', item: '결제', price: 49_800, id: '00202607241200000000000002' },
    { date: '2026-09-19', item: '결제', price: 69_600, id: '00202609191200000000000003' },
    { date: '2026-09-26', item: '결제', price: 220_000, id: '00202609261200000000000004' },
  ]
  const group = starts.slice(0, 10).map(start => ({ start, gapMin: start === '2026-09-10' ? 139_100 : 0, gapMax: 0,
    pcMin: 0, pcMax: 139_100, unknown: false, group: '2026-07-09' }))
  const rest = starts.slice(10).map(start => { const pc = start === '2026-10-01' ? 8_200 : 0
    return { start, gapMin: pc, gapMax: pc, pcMin: pc, pcMax: pc, unknown: false } })
  const saved = writeWeeks([...group, ...rest].map(w => ({ ...w, gapMax: w.gapMin })))
  const fixedAt = Date.parse('2026-10-05T17:58:00+09:00')
  it('맞춘 때와 같은 등급이면 안내하지 않는다', () => {
    const b = buildBase(paid, saved, new Date('2026-10-05T18:00:00+09:00'))
    expect(b.last13.reduce((a, x) => a + x, 0)).toBe(516_700)
    expect(b.current?.key).toBe('silver')
    expect(needRecheck(b, fixedAt)).toBe(false)
  })
  it('그 뒤 결제로 등급이 올라 묶음이 12줄을 가르면 다시 맞추라고 한다', () => {
    const more = [...paid, { date: '2026-10-06', item: '결제', price: 119_000, id: '00202610062200000000000006' }]
    const b = buildBase(more, saved, new Date('2026-10-06T23:00:00+09:00'))
    expect(b.current?.key).toBe('gold')
    expect(needRecheck(b, fixedAt)).toBe(true)
    expect(buildState(b, fixedAt).pcroom.recheck).toBe(true)
    expect(needRecheck(b, 0)).toBe(false)   // 맞춘 적이 없으면 이 안내가 아니다
  })
})

/**
 * 2026-10-16 사용자: 목표 계획은 세운 그대로 묶어 두고, 결제한 만큼 이번 주 목표에서 빠져야 한다.
 * 전에는 결제할 때마다 남은 금액을 모든 주에 다시 나눠 이번 주 목표가 낸 만큼 줄지 않았다
 */
describe('세워 둔 계획', () => {
  const base0 = buildBase(rows, SAVED, NOW)
  const date = '2026-11-18'
  const p0 = makePlan(base0, 'red', date, {}) as any
  const pins = Object.fromEntries(p0.timeline.filter((w: any) => w.counts).map((w: any) => [w.start, w.goal]))
  const more = [...rows, { date: '2026-09-26', item: '결제', price: 50_000 }]
  const base1 = buildBase(more, SAVED, NOW)

  it('이번 주 목표는 이미 낸 금액까지 친 전체다', () => {
    expect(p0.spentThisWeek).toBe(253_700)
    expect(p0.timeline[0].goal).toBe(253_700 + p0.timeline[0].amount)
  })

  it('세운 뒤 결제하면 그만큼 이번 주 남은 금액만 줄고 다른 주는 그대로다', () => {
    const p1 = makePlan(base1, 'red', date, {}, null, 1000, false, pins) as any
    expect(p1.timeline[0].goal).toBe(p0.timeline[0].goal)
    expect(p1.timeline[0].amount).toBe(p0.timeline[0].amount - 50_000)
    for (let o = 1; o < p0.timeline.length; o++) expect(p1.timeline[o].amount).toBe(p0.timeline[o].amount)
    // 묶어 둔 금액은 사용자가 고정한 것이 아니다
    expect(p1.timeline.some((w: any) => w.fixed)).toBe(false)
    expect(p1.fixedSum).toBe(0)
    expect(p1.autoCount).toBe(p0.autoCount)
    expect(p1.autoPer).toBe(p0.autoPer)
    // 묶어 두지 않으면 낸 금액이 모든 주에 나뉘어 이번 주는 조금만 줄었다
    const live = makePlan(base1, 'red', date, {}) as any
    expect(live.timeline[0].amount).toBeGreaterThan(p1.timeline[0].amount)
  })

  it('목표보다 더 내면 이번 주 남은 금액은 0이고 다른 주는 그대로다', () => {
    const big = buildBase([...rows, { date: '2026-09-26', item: '결제', price: p0.timeline[0].amount + 30_000 }], SAVED, NOW)
    const p1 = makePlan(big, 'red', date, {}, null, 1000, false, pins) as any
    expect(p1.timeline[0].amount).toBe(0)
    expect(p1.spentThisWeek - p1.timeline[0].goal).toBe(30_000)
    expect(p1.timeline[1].amount).toBe(p0.timeline[1].amount)
  })

  it('이번 주를 고정하면 그 금액이 이번 주 전체 목표다(낸 금액이 두 번 잡히지 않는다)', () => {
    const p = makePlan(base1, 'red', date, { '2026-09-24': 400_000 }) as any
    expect(p.timeline[0].goal).toBe(400_000)
    expect(p.timeline[0].amount).toBe(400_000 - 303_700)
    expect(p.timeline[0].fixed).toBe(true)
  })

  it('블랙에서 인게임이 수집보다 적은 주는 이월로 간 몫까지 낸 것으로 친다', () => {
    // 12주 동안 20만씩(240만) + 이번 주 30만 → 블랙 기준을 20만 넘겨 인게임 이번 주는 10만
    const starts = Array.from({ length: 13 }, (_, i) => addDays('2026-09-24', (i - 12) * 7))
    const rs: Row[] = starts.map(s => ({ date: addDays(s, 1), item: '결제', price: i0(s) }))
    function i0(s: string) { return s === '2026-09-24' ? 300_000 : 200_000 }
    const saved = { ...Object.fromEntries(starts.map(s => [s, 0])), '2026-09-24': -200_000 }
    const b = buildBase(rs, saved, NOW)
    expect(b.tier13[12]?.key).toBe('black')
    expect(b.last13[12]).toBe(100_000)
    expect(b.paid13[12]).toBe(300_000)
  })

  describe('목요일이 지나면', () => {
    const NEXT = new Date('2026-10-02T00:00:00Z')   // 10/1 주
    const frozen = { from: '2026-09-24', weeks: pins }
    const paidBy = (extra: number) => buildBase([...rows, { date: '2026-09-26', item: '결제', price: p0.timeline[0].amount + extra }], SAVED, NEXT)

    it('목표만큼 냈으면 지난 주는 기록으로 옮기고 다음 주가 이번 주가 된다', () => {
      const r = rollPlan(paidBy(0), frozen, [])
      expect(r.frozen!.from).toBe('2026-10-01')
      expect(r.frozen!.weeks['2026-09-24']).toBeUndefined()
      expect(r.frozen!.weeks['2026-10-01']).toBe(pins['2026-10-01'])
      expect(r.frozen!.over).toBeUndefined()
      expect(r.history).toEqual([{ start: '2026-09-24', goal: pins['2026-09-24'], paid: pins['2026-09-24'], tier: expect.anything() }])
    })

    it('못 채웠으면 다시 짜야 한다', () => {
      expect(rollPlan(paidBy(-10_000), frozen, []).frozen).toBeNull()
    })

    it('더 낸 금액은 넘겨서 고르게 한다. 그대로 두기로 한 몫은 빼고', () => {
      expect(rollPlan(paidBy(30_000), frozen, []).frozen!.over).toBe(30_000)
      expect(rollPlan(paidBy(30_000), { ...frozen, ack: 10_000 }, []).frozen!.over).toBe(20_000)
    })
  })
})
