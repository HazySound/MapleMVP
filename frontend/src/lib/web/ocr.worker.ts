/**
 * 캡처 한 장을 읽는 일만 하는 워커.
 *
 * 화면공유는 초당 두어 장을 읽는데 한 장에 100~300ms가 든다. 본 화면에서 돌리면
 * 그동안 멈춰 보이므로 따로 떼어 둔다. 판단은 하지 않는다. 후보만 돌려준다.
 */
import { scan, toGray } from '../core/ocr'
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
  const g = toGray(new Uint8ClampedArray(data), width, height)
  const r = scan(g, fallbackScale, net ?? 'always')
  postMessage({ id, ...r } satisfies ScanDone)
})
