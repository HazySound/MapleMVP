import { describe, expect, it } from 'vitest'
import { HOW, MAX, WHO, randomNick } from './nick'
import { whyBad } from '../../../../functions/api/_nick'

/**
 * 지어 준 이름은 서버가 되돌려보내면 안 된다.
 *
 * 첫 로그인 화면에는 직접 적는 칸이 없다. 지어 준 이름이 욕설 필터나 길이 제한에
 * 걸리면 그 사람은 가입 자체를 못 하고, 주사위를 아무리 굴려도 같은 벽에 막힌다.
 * 목록에 단어를 더할 때마다 여기서 걸리게 해 둔다.
 */
describe('지어 주는 이름', () => {
  it('두 목록 다 100개다', () => {
    expect(HOW).toHaveLength(100)
    expect(WHO).toHaveLength(100)
  })

  it('같은 것이 두 번 들어 있지 않다', () => {
    expect(new Set(HOW).size).toBe(HOW.length)
    expect(new Set(WHO).size).toBe(WHO.length)
  })

  it('어떻게 짝지어도 길이 제한을 넘지 않는다', () => {
    const over = []
    for (const how of HOW) {
      for (const who of WHO) {
        const nick = `${how} ${who}`
        if (nick.length > MAX) over.push(nick)
      }
    }
    expect(over).toEqual([])
  })

  it('어떤 짝도 서버 이름 검사에 걸리지 않는다', () => {
    const bad = []
    for (const how of HOW) {
      for (const who of WHO) {
        const nick = `${how} ${who}`
        const why = whyBad(nick)
        if (why) bad.push(`${nick} — ${why}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('굴리면 언제나 쓸 수 있는 이름이 나온다', () => {
    for (let i = 0; i < 500; i++) {
      const nick = randomNick()
      expect(nick.length).toBeGreaterThan(0)
      expect(nick.length).toBeLessThanOrEqual(MAX)
      expect(whyBad(nick)).toBe('')
    }
  })
})
