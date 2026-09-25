import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { scan, toGray } from '../src/lib/core/ocr'
import type { ScanRaw } from '../src/lib/core/scan'
import { createVote } from '../src/lib/core/vote'

/**
 * 화면공유처럼 여러 장을 차례로 넣었을 때 결론이 제대로 모이는지 본다.
 * 캡처는 저장소에 없으니(캐릭터 정보) 없으면 건너뛴다.
 */
const DIR = join(import.meta.dirname, 'captures')
const COVERED = '가림'        // 툴팁이 상단 패널을 가린 장
const OPEN = '캡처'           // 상단 패널이 보이는 장
const have = existsSync(join(DIR, `${COVERED}.png`)) && existsSync(join(DIR, `${OPEN}.png`))

const TRUTH = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
const COLLECTED = [30000, 26420, 0, 0, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
const TOTAL = 909_670

const cache = new Map<string, ScanRaw>()
function frame(name: string): ScanRaw {
  if (!cache.has(name)) {
    const png = PNG.sync.read(readFileSync(join(DIR, `${name}.png`)))
    cache.set(name, scan(toGray(png.data, png.width, png.height)))
  }
  return cache.get(name)!
}

const blank: ScanRaw = { readings: [], amounts: [], scale: 0 }

describe.skipIf(!have)('프레임 모으기', () => {
  it('한 장만으로는 결론을 내지 않는다', () => {
    const v = createVote(COLLECTED)
    const s = v.feed(frame(OPEN))
    expect(s.needs).toBeNull()
    expect(s.solved).toBeNull()
  })

  it('같은 장이 두 번 나오면 받아들인다', () => {
    const v = createVote(COLLECTED)
    v.feed(frame(OPEN))
    const s = v.feed(frame(OPEN))
    expect(s.needs).toEqual(TRUTH)
    expect(s.solved?.total).toBe(TOTAL)
    expect(s.solved?.tierTh).toBe(900_000)
  })

  it('툴팁이 가린 장으로 12줄을 얻고, 뒤에 온 장에서 합계를 채운다', () => {
    const v = createVote(COLLECTED)
    expect(v.feed(frame(COVERED)).needs).toBeNull()
    const got = v.feed(frame(COVERED))
    expect(got.needs).toEqual(TRUTH)    // 12줄은 나왔지만
    expect(got.solved).toBeNull()       // 합계는 아직 모른다
    const done = v.feed(frame(OPEN))
    expect(done.solved?.total).toBe(TOTAL)
    expect(done.frames).toBe(3)
  })

  it('합계를 못 채워도 12줄은 건진다', () => {
    const v = createVote(COLLECTED)
    v.feed(frame(COVERED))
    const s = v.feed(frame(COVERED))
    expect(s.solved).toBeNull()
    expect(s.partial?.needs).toEqual(TRUTH)
    expect(s.partial?.total).toBeNull()
    expect(s.partial?.tierTh).toBe(900_000)
  })

  it('합계가 먼저 지나가도 놓치지 않는다', () => {
    // 상단 패널만 찍힌 프레임이 툴팁보다 먼저 오는 순서
    const v = createVote(COLLECTED)
    v.feed({ ...frame(OPEN), readings: [] })   // 숫자만 있고 툴팁은 없는 장
    v.feed(frame(COVERED))
    const s = v.feed(frame(COVERED))
    expect(s.needs).toEqual(TRUTH)
    expect(s.solved?.total).toBe(TOTAL)
  })

  it('빈 프레임은 표를 늘리지 않는다', () => {
    const v = createVote(COLLECTED)
    v.feed(blank)
    v.feed(frame(OPEN))
    v.feed(blank)
    const s = v.feed(blank)
    expect(s.frames).toBe(4)
    expect(s.needs).toBeNull()
    expect(s.seen, '글자가 잡힌 프레임').toBe(1)
  })

  it('화면이 계속 비어 오면 읽힌 프레임이 하나도 없다', () => {
    // 게임이 전체화면 모드면 캡처가 까맣게 들어온다. 그걸 구분할 근거가 seen이다
    const v = createVote(COLLECTED)
    for (let i = 0; i < 12; i++) v.feed(blank)
    expect(v.state().seen).toBe(0)
    expect(v.state().frames).toBe(12)
  })
})
