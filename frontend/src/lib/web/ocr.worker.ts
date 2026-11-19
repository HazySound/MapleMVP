/**
 * 캡처 한 장을 읽는 일만 하는 워커.
 *
 * 화면공유는 초당 두어 장을 읽는데 한 장에 100~300ms가 든다. 본 화면에서 돌리면
 * 그동안 멈춰 보이므로 따로 떼어 둔다. 판단은 하지 않는다. 후보만 돌려준다.
 */
import { TIERS } from '../core/mvp'
import { scan, toGray } from '../core/ocr'
import { scanTable } from '../core/panel'
import type { ScanResult } from '../core/ocr'

export interface ScanJob {
  id: number
  data: ArrayBuffer          // RGBA. 복사하지 않고 넘긴다
  width: number
  height: number
  fallbackScale: number
  /** 새 판독기(ocrnet)를 언제 같이 돌릴지. 화면공유는 'fallback'(한 장에 1초 남짓 들어 프레임마다는 못 돌린다) */
  net?: 'always' | 'fallback' | 'off'
}

export type ScanDone = ScanResult & { id: number }

addEventListener('message', (e: MessageEvent<ScanJob>) => {
  const { id, data, width, height, fallbackScale, net } = e.data
  const rgba = new Uint8ClampedArray(data)
  // 2026-11-19 리뉴얼된 패널 표가 있으면 그것만 읽는다. 예전 툴팁과 한 화면에 같이 나올 일은 없다
  const table = scanTable(rgba, width, height, TIERS.map(t => t.th))
  if (table) {
    postMessage({ id, table, readings: [], carries: [], amounts: [], scale: 1 } satisfies ScanDone)
    return
  }
  const g = toGray(rgba, width, height)
  const r = scan(g, fallbackScale, net ?? 'always')
  postMessage({ id, ...r } satisfies ScanDone)
})
