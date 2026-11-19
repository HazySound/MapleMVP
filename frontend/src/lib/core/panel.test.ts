import { describe, expect, it } from 'vitest'
import { TIERS } from './mvp'
import { FUTURE, type PanelRead, checkPanel, panelSolved } from './panel'
import { createVote } from './vote'

const ths = TIERS.map(t => t.th)

/**
 * 13주 실적(반영 + 이월 사용)과 이월 잔액으로 새 MVP 패널 표를 만든다. 넥슨 규칙대로 앞으로 12주를 굴린다:
 * 한 주씩 가장 오래된 주가 빠지고, 블랙 기준보다 모자라면 이월에서 꺼내 그 주를 채운다. 지어낸 숫자다
 */
function table(applied: number[], used: number[], balance: number): PanelRead {
  const weeks = applied.map((a, i) => a + used[i])
  const total = weeks.reduce((a, b) => a + b, 0)
  const black = total >= 2_500_000
  const th = [...ths].reverse().find(t => total >= t) ?? 0
  const f = { fExpire: [] as number[], fUsed: [] as number[], fBalance: [] as number[], fTotal: [] as number[], fKeep: [] as number[] }
  let t = total, b = balance
  for (let k = 0; k < FUTURE; k++) {
    t -= weeks[k]
    const use = black ? Math.min(b, Math.max(0, 2_500_000 - t)) : 0
    t += use; b -= use
    f.fExpire.push(weeks[k]); f.fUsed.push(use); f.fBalance.push(b); f.fTotal.push(t); f.fKeep.push(Math.max(0, th - t))
  }
  return { applied, used, balance, total, ...f }
}

const goldApplied = [10_000, 20_000, 0, 50_000, 7_400, 120_000, 100_000, 0, 150_000, 3_000, 9_300, 200_000, 0]
const zeros = Array(13).fill(0)

describe('새 MVP 패널 표 대조', () => {
  it('앞뒤가 맞는 표는 13주 실적과 등급을 그대로 낸다', () => {
    const c = checkPanel(table(goldApplied, zeros, 0), ths)
    expect(c.issues).toEqual([])
    expect(c.weeks).toEqual(goldApplied)
    expect(c.tierTh).toBe(600_000)
  })

  it('블랙은 이월 사용까지 그 주 실적에 넣고, 잔액이 굴러가는지도 본다', () => {
    const applied = [0, 900_000, 1_000_000, 300_000, 0, 0, 0, 0, 200_000, 0, 100_000, 0, 0]
    const used = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    const p = table(applied, used, 400_000)
    const c = checkPanel(p, ths)
    expect(c.ok).toBe(true)
    expect(c.tierTh).toBe(2_500_000)
    expect(p.fUsed.some(u => u > 0)).toBe(true)
  })

  it('숫자 하나만 잘못 읽어도 걸린다', () => {
    const p = table(goldApplied, zeros, 0)
    const bad = { ...p, applied: p.applied.map((v, i) => (i === 3 ? 56_000 : v)) }
    const c = checkPanel(bad, ths)
    expect(c.ok).toBe(false)
    expect(c.issues.length).toBeGreaterThanOrEqual(2)   // 13주 합산과 9주 뒤 만료 금액이 같이 어긋난다
  })

  it('못 읽은 칸이 있으면 대조하지 않는다', () => {
    const p = table(goldApplied, zeros, 0)
    const c = checkPanel({ ...p, fKeep: p.fKeep.map((v, i) => (i === 5 ? null : v)) }, ths)
    expect(c.ok).toBe(false)
    expect(c.missing).toBe(true)
  })

  it('판독 결과의 12줄은 예전 툴팁과 같은 뜻(유지까지 · 이월 사용)이다', () => {
    const p = table(goldApplied, zeros, 0)
    const s = panelSolved(p, checkPanel(p, ths))
    expect(s.needs).toEqual(p.fKeep)
    expect(s.carry).toEqual(p.fUsed)
    expect(s.total).toBe(p.total)
    expect(s.weeks).toEqual(goldApplied)
  })

  it('화면공유는 같은 표가 두 장 나와야 끝낸다', () => {
    const p = table(goldApplied, zeros, 0)
    const solved = panelSolved(p, checkPanel(p, ths))
    const vote = createVote(Array(13).fill(0))
    const raw = { table: { ok: true, issues: [], solved, fixed: 0 }, readings: [], amounts: [], scale: 1 }
    expect(vote.feed(raw).solved).toBeNull()
    expect(vote.feed(raw).solved?.weeks).toEqual(goldApplied)
  })
})
