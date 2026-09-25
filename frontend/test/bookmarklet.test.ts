import { describe, expect, it } from 'vitest'
import { bookmarkletUrl } from '../src/lib/web/bookmarklet'

/**
 * 북마클릿은 함수를 문자열로 떼어 내 주소에 담는다.
 * 그래서 바깥 것을 참조하면 실행되는 자리에서 바로 죽는다. 그게 나지 않는지 본다.
 */
const bodyOf = (origin: string) =>
  decodeURIComponent(bookmarkletUrl(origin).slice('javascript:'.length))

describe('북마클릿 주소', () => {
  it('문법이 맞는 javascript: 주소다', () => {
    const url = bookmarkletUrl('https://maplemvp.example')
    expect(url.startsWith('javascript:')).toBe(true)
    expect(() => new Function(bodyOf('https://maplemvp.example'))).not.toThrow()
  })

  it('앱 주소를 그대로 박아 넣는다 — 며칠 뒤에 눌러도 여기로 돌아온다', () => {
    expect(bodyOf('https://maplemvp.example')).toContain('"https://maplemvp.example"')
  })

  it('모듈 바깥 이름을 쓰지 않는다', () => {
    const body = bodyOf('https://x.test')
    for (const name of ['NEXON_USAGE_URL', 'APP_TAB', 'bookmarkletUrl']) {
      expect(body, name).not.toContain(name)
    }
  })

  it('넥슨 결제 페이지와 앱 탭 이름을 안에 들고 있다', () => {
    const body = bodyOf('https://x.test')
    expect(body).toContain('payment.nexon.com')
    expect(body).toContain('maplemvp')
  })
})
