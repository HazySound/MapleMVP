/**
 * 엑셀 파일(.xlsx)을 브라우저에서 만든다.
 *
 * exe는 파이썬 openpyxl로 같은 모양을 뽑는다. 웹만 csv로 내보내면 같은 단추가
 * 다른 것을 주게 되므로, 그쪽 생김새(app/api.py의 _write_xlsx)를 그대로 맞춘다.
 *
 * 라이브러리를 쓰지 않는다. 쓸 만한 것들은 21MB짜리(exceljs)라 번들이 단추
 * 하나 때문에 1MB 가까이 불어나고, 가벼운 쪽(SheetJS 무료판)은 칸 색을 못 넣는다.
 *
 * xlsx는 사실 XML 몇 장을 zip으로 묶은 것이다. 묶는 것은 압축 없이(STORE)
 * 넣는다. 구매내역은 많아야 수천 줄이고, 압축을 붙이면 브라우저마다 되는지
 * 확인할 것이 늘어난다.
 */

// ---- zip ----

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

interface Entry { name: string; body: Uint8Array }

/** 압축 없이 묶는다. zip 규격의 STORE */
function zip(entries: Entry[]): Blob {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const dir: Uint8Array[] = []
  let at = 0

  // 압축 시각. 파일마다 달라질 이유가 없어 한 값으로 둔다 (1980-01-01 00:00)
  const TIME = 0
  const DATE = 33

  for (const e of entries) {
    const name = enc.encode(e.name)
    const sum = crc32(e.body)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)       // 풀려면 필요한 버전
    local.setUint16(6, 0, true)        // 플래그
    local.setUint16(8, 0, true)        // 0 = 압축 안 함
    local.setUint16(10, TIME, true)
    local.setUint16(12, DATE, true)
    local.setUint32(14, sum, true)
    local.setUint32(18, e.body.length, true)
    local.setUint32(22, e.body.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)       // 덧붙임 없음

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)     // 만든 버전
    central.setUint16(6, 20, true)
    central.setUint16(8, 0, true)
    central.setUint16(10, 0, true)
    central.setUint16(12, TIME, true)
    central.setUint16(14, DATE, true)
    central.setUint32(16, sum, true)
    central.setUint32(20, e.body.length, true)
    central.setUint32(24, e.body.length, true)
    central.setUint16(28, name.length, true)
    central.setUint32(42, at, true)    // 이 파일이 시작하는 자리

    parts.push(new Uint8Array(local.buffer), name, e.body)
    dir.push(new Uint8Array(central.buffer), name)
    at += 30 + name.length + e.body.length
  }

  const dirSize = dir.reduce((n, b) => n + b.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, entries.length, true)
  end.setUint16(10, entries.length, true)
  end.setUint32(12, dirSize, true)
  end.setUint32(16, at, true)

  return new Blob([...parts, ...dir, new Uint8Array(end.buffer)],
                  { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ---- xlsx ----

const enc = new TextEncoder()
const f = (name: string, xml: string): Entry => ({ name, body: enc.encode(xml) })

/** XML에서 뜻이 있는 글자들. 아이템 이름에 &나 <가 들어와도 깨지지 않게 */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
}

/**
 * 엑셀이 쓰는 날짜 숫자.
 *
 * 1900-01-01이 1이다. 다만 엑셀은 1900년을 윤년으로 잘못 알고 있어서 하루가
 * 밀리는데, 그 버그까지 맞추려면 1899-12-30을 0으로 잡으면 된다.
 */
function serial(date: string): number {
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000)
}

const col = (i: number) => String.fromCharCode(65 + i)

/** 칸 하나. s는 아래 styles.xml의 cellXfs 순번이다 */
function cell(ref: string, style: number, value: string | number): string {
  if (typeof value === 'number') return `<c r="${ref}" s="${style}"><v>${value}</v></c>`
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy\\-mm\\-dd"/></numFmts>
<fonts count="3">
<font><sz val="11"/><name val="맑은 고딕"/></font>
<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="맑은 고딕"/></font>
<font><b/><sz val="11"/><name val="맑은 고딕"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF4A4E5C"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFD8D8DE"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

export interface Purchase { date: string; item: string; price: number }

/**
 * 구매내역을 엑셀 파일로 만든다. exe가 뽑는 것과 같은 모양이다.
 *
 * 머리줄에 색을 깔고 틀을 고정하고 자동 필터를 걸어 둔다. 날짜는 글자가 아니라
 * 날짜로, 금액은 숫자로 넣어야 엑셀에서 정렬과 합계가 바로 된다.
 */
export function buildXlsx(rows: Purchase[]): Blob {
  const body = rows.map((r, i) => {
    const n = i + 2
    return `<row r="${n}">`
      + cell(`A${n}`, 2, serial(r.date))
      + cell(`B${n}`, 0, r.item)
      + cell(`C${n}`, 3, r.price)
      + '</row>'
  }).join('')

  const head = '<row r="1">'
    + ['날짜', '아이템', '금액(원)'].map((t, i) => cell(`${col(i)}1`, 1, t)).join('')
    + '</row>'

  // 마지막 줄에서 한 줄 띄우고 합계. 자동 필터에는 안 걸리게 떨어뜨려 둔다
  const at = rows.length + 3
  const sum = rows.reduce((a, r) => a + r.price, 0)
  const total = `<row r="${at}">`
    + cell(`B${at}`, 4, `합계 (${rows.length.toLocaleString('en-US')}건)`)
    + cell(`C${at}`, 5, sum)
    + '</row>'

  const lastData = Math.max(1, rows.length + 1)
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:C${at}"/>
<sheetViews><sheetView tabSelected="1" workbookViewId="0">`
    + `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>`
    + `</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>
<col min="1" max="1" width="13" customWidth="1"/>
<col min="2" max="2" width="44" customWidth="1"/>
<col min="3" max="3" width="14" customWidth="1"/>
</cols>
<sheetData>${head}${body}${total}</sheetData>
<autoFilter ref="A1:C${lastData}"/>
</worksheet>`

  return zip([
    f('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    f('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    f('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="구매내역" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    f('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    f('xl/styles.xml', STYLES),
    f('xl/worksheets/sheet1.xml', sheet),
  ])
}
