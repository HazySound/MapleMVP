import { describe, expect, it } from 'vitest'
import { buildXlsx } from './xlsx'

/**
 * 엑셀 파일을 손으로 짜 넣는다. 한 바이트만 어긋나도 엑셀이 열기를 거부하고,
 * 거부당했다는 사실은 엑셀을 켜 봐야만 안다. 그래서 여기서 붙잡는다.
 *
 * 만들어 낸 파일을 다시 풀어서 확인한다. 압축을 안 했으므로(STORE) 푸는 데
 * 라이브러리가 필요 없다 — 이름과 길이를 읽어 그만큼 잘라 내면 된다.
 */
function unzip(buf: Uint8Array): Map<string, string> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out = new Map<string, string>()
  const dec = new TextDecoder()
  let at = 0
  while (at + 4 <= buf.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true)
    const nameLen = view.getUint16(at + 26, true)
    const extraLen = view.getUint16(at + 28, true)
    const name = dec.decode(buf.subarray(at + 30, at + 30 + nameLen))
    const from = at + 30 + nameLen + extraLen
    out.set(name, dec.decode(buf.subarray(from, from + size)))
    at = from + size
  }
  return out
}

const rows = [
  { date: '2026-09-20', item: '솔 에르다 조각', price: 10000 },
  { date: '2026-08-15', item: '경험치 <쿠폰> & "특별"', price: 3000 },
]

async function parts(rs = rows) {
  const buf = new Uint8Array(await buildXlsx(rs).arrayBuffer())
  expect(buf[0]).toBe(0x50)   // 'P'
  expect(buf[1]).toBe(0x4b)   // 'K'
  return unzip(buf)
}

describe('엑셀 파일 만들기', () => {
  it('엑셀이 찾는 파일이 다 들어 있다', async () => {
    const z = await parts()
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml',
                        'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
                        'xl/worksheets/sheet1.xml']) {
      expect(z.has(name), name).toBe(true)
    }
  })

  it('시트 이름은 구매내역이다', async () => {
    expect((await parts()).get('xl/workbook.xml')).toContain('name="구매내역"')
  })

  it('날짜는 글자가 아니라 엑셀 날짜 숫자다', async () => {
    const sheet = (await parts()).get('xl/worksheets/sheet1.xml')!
    // 2026-09-20 = 1899-12-30으로부터 46285일
    expect(sheet).toContain('<c r="A2" s="2"><v>46285</v></c>')
    expect(sheet).not.toContain('2026-09-20')
  })

  it('금액은 숫자로 들어간다', async () => {
    expect((await parts()).get('xl/worksheets/sheet1.xml'))
      .toContain('<c r="C2" s="3"><v>10000</v></c>')
  })

  it('아이템 이름의 &와 <를 XML로 피해 쓴다', async () => {
    const sheet = (await parts()).get('xl/worksheets/sheet1.xml')!
    expect(sheet).toContain('경험치 &lt;쿠폰&gt; &amp; &quot;특별&quot;')
  })

  it('틀 고정과 자동 필터를 건다', async () => {
    const sheet = (await parts()).get('xl/worksheets/sheet1.xml')!
    expect(sheet).toContain('state="frozen"')
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>')   // 머리줄 + 2줄
  })

  it('한 줄 띄우고 합계를 붙인다', async () => {
    const sheet = (await parts()).get('xl/worksheets/sheet1.xml')!
    expect(sheet).toContain('합계 (2건)')
    expect(sheet).toContain('<c r="C5" s="5"><v>13000</v></c>')
  })

  it('내역이 없어도 깨지지 않는다', async () => {
    const z = await parts([])
    expect(z.get('xl/worksheets/sheet1.xml')).toContain('합계 (0건)')
  })
})
