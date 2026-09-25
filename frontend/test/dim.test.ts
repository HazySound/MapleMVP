import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { scan, toGray } from '../src/lib/core/ocr'
import { solveScan } from '../src/lib/core/scan'

/**
 * 어두워진 프레임도 읽는지 본다.
 *
 * 화면을 공유받으면 색 변환을 한 번 거쳐 생캡처보다 어둡게 들어온다.
 * 예전에는 표를 찾는 밝기가 220으로 박혀 있어서, 조금만 어두워도 줄을 하나도
 * 못 찾았다. 숫자는 그대로 잡히니 화면에는 '패널 위에 마우스를 올려 주세요'만
 * 계속 뜨고 영영 끝나지 않았다. 그 자리를 지킨다.
 */
const DIR = join(import.meta.dirname, 'captures')
const have = existsSync(DIR) && readdirSync(DIR).some(f => f.endsWith('.png'))

const TRUTH = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
const COLLECTED = [30000, 26420, 0, 0, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]

function dimmed(name: string, k: number) {
  const png = PNG.sync.read(readFileSync(join(DIR, `${name}.png`)))
  const d = Uint8ClampedArray.from(png.data, v => Math.round(v * k))
  return toGray(d, png.width, png.height)
}

describe.skipIf(!have)('어두워진 프레임', () => {
  for (const k of [0.9, 0.8, 0.7]) {
    it(`밝기 ${k}배에서도 12줄을 읽는다`, () => {
      const s = solveScan(scan(dimmed('캡처', k)), COLLECTED)
      expect(s?.needs).toEqual(TRUTH)
      expect(s?.total).toBe(909_670)
    }, 60000)
  }
})
