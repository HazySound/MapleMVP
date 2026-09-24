import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { scan, toGray } from '../src/lib/core/ocr'
import { solveScan } from '../src/lib/core/scan'

/**
 * 실제 인게임 캡처로 canvas 인식기를 검증한다.
 * 캡처에는 캐릭터 정보가 담겨 있어 저장소에 올리지 않는다.
 * 파일이 없으면 이 파일의 테스트는 건너뛴다.
 */
const DIR = join(import.meta.dirname, 'captures')
const have = existsSync(DIR) && readdirSync(DIR).some(f => f.endsWith('.png'))

const TRUTH = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
const COLLECTED = [30000, 26420, 0, 0, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
const TOTAL = 909_670

// 툴팁이 상단 패널을 가려서 합계를 못 읽는 캡처
const COVERED = new Set(['가림', '다가림'])

function gray(name: string) {
  const png = PNG.sync.read(readFileSync(join(DIR, `${name}.png`)))
  return toGray(png.data, png.width, png.height)
}

describe.skipIf(!have)('캡처 인식 (canvas)', () => {
  const names = have ? readdirSync(DIR).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)) : []

  for (const name of names) {
    it(`${name}`, () => {
      const r = scan(gray(name))
      expect(r.readings.length, '툴팁 후보').toBeGreaterThan(0)
      const s = solveScan(r, COLLECTED)
      expect(s, '규칙이 고른 결과').not.toBeNull()
      expect(s!.needs).toEqual(TRUTH)
      expect(s!.tierTh).toBe(900_000)
      expect(s!.total).toBe(COVERED.has(name) ? null : TOTAL)
    })
  }

  it('툴팁 없는 두 번째 장에서 합계만 채운다', () => {
    if (!names.includes('가림') || !names.includes('캡처')) return
    const first = solveScan(scan(gray('가림')), COLLECTED)!
    expect(first.total).toBeNull()
    const second = scan(gray('캡처'), first.scale)
    expect(solveScan({ ...second, readings: [] }, COLLECTED, first)!.total).toBe(TOTAL)
  })
})
