import { afterEach, describe, expect, it, vi } from 'vitest'
import { LIMIT, tick, whoSent } from '../../../../functions/api/_rate'

/**
 * 너무 자주 두드리는 것을 막는 쪽은, 틀리면 멀쩡한 사람이 잠긴다.
 * 막는 것보다 안 막는 것을 먼저 확인한다.
 */
afterEach(() => vi.useRealTimers())

/** 같은 열쇠를 두 번 쓰면 앞 시험이 센 것이 남는다. 매번 새 열쇠를 만든다 */
let seq = 0
const key = () => `테스트:${++seq}`

describe('두드리는 횟수 세기', () => {
  it('한도까지는 통과시킨다', () => {
    const k = key()
    for (let i = 0; i < 5; i++) expect(tick(k, 5, 60_000)).toBe(0)
  })

  it('한도를 넘으면 몇 초 뒤에 오라고 알려 준다', () => {
    const k = key()
    for (let i = 0; i < 5; i++) tick(k, 5, 60_000)
    const wait = tick(k, 5, 60_000)
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(60)
  })

  it('창이 지나면 다시 받아 준다', () => {
    vi.useFakeTimers()
    const k = key()
    for (let i = 0; i < 5; i++) tick(k, 5, 60_000)
    expect(tick(k, 5, 60_000)).toBeGreaterThan(0)
    vi.advanceTimersByTime(60_001)
    expect(tick(k, 5, 60_000)).toBe(0)
  })

  it('사람이 다르면 따로 센다', () => {
    const a = key(), b = key()
    for (let i = 0; i < 5; i++) tick(a, 5, 60_000)
    expect(tick(a, 5, 60_000)).toBeGreaterThan(0)
    expect(tick(b, 5, 60_000)).toBe(0)
  })
})

describe('누가 보냈는지', () => {
  const req = (ip?: string) =>
    new Request('https://maple-mvp.com/api/data',
      { headers: ip ? { 'cf-connecting-ip': ip } : {} })

  it('로그인했으면 그 사람으로 센다 (PC방처럼 주소를 같이 써도 따로)', () => {
    expect(whoSent(req('1.2.3.4'), 'kakao:1')).toBe('kakao:1')
    expect(whoSent(req('1.2.3.4'), 'kakao:2')).toBe('kakao:2')
  })

  it('로그인 전이면 어디서 왔는지로 센다', () => {
    expect(whoSent(req('1.2.3.4'))).toBe('ip:1.2.3.4')
  })

  it('주소를 모르면 모른다고 두고 넘어간다', () => {
    expect(whoSent(req())).toBe('ip:unknown')
  })
})

describe('정한 한도가 실제 쓰임새를 막지 않는다', () => {
  // 앱을 한 번 열면 읽기 둘(me, data)에 쓰기 하나(pushUp)다
  it('10분 안에 앱을 열 번 열어도 안 막힌다', () => {
    const uid = key()
    let blocked = 0
    for (let i = 0; i < 10; i++) {
      if (tick(`r:${uid}`, LIMIT.read.n, LIMIT.read.ms)) blocked++
      if (tick(`r:${uid}`, LIMIT.read.n, LIMIT.read.ms)) blocked++
      if (tick(`w:${uid}`, LIMIT.write.n, LIMIT.write.ms)) blocked++
    }
    expect(blocked).toBe(0)
  })

  it('한 사람이 낼 수 있는 쓰기에 천장이 있다', () => {
    const uid = key()
    let ok = 0
    for (let i = 0; i < 1_000; i++) {
      if (!tick(`w:${uid}`, LIMIT.write.n, LIMIT.write.ms)) ok++
    }
    expect(ok).toBe(LIMIT.write.n)
    // 하루를 다 두드려도 D1 무료 한도(10만)의 한 줌이다
    expect(LIMIT.write.n * (24 * 60 / 10)).toBeLessThan(10_000)
  })
})
