/**
 * 인게임 금액 맞추기를 시도한 기록. 이 기기에만 최근 몇 번을 남기고, 문의 글을 쓸 때 진단에 붙인다.
 * '캡처를 못 읽어요' 문의는 캡처를 다시 받아 돌려 봐야 원인이 보였다. 판독에서 막혔는지(표를 못 찾음),
 * 검사에서 막혔는지(어느 주가 왜), 어떤 배율·해상도였는지가 글에 같이 오면 바로 짚을 수 있다
 */
import type { ScanRaw } from '../core/scan'

export interface ScanLog {
  at: number
  how: 'file' | 'share'
  ok: boolean
  /** 화면에 띄운 말. 막혔으면 막힌 까닭이다 */
  msg: string
  /** 계산까지 갔을 때의 오류·빨간 줄 */
  after?: string
  /** 캡처나 공유 화면의 크기 */
  size?: string
  scale?: number
  /** 화면 공유: 본 장 수, 무엇이든 읽힌 장 수, 마지막 상황 */
  frames?: number
  seen?: number
  stage?: string
  /** 표 후보 중 많이 나온 셋과 득표 */
  readings: { v: number[]; n: number }[]
  carries: number[][]
  balance: number | null
  amounts: number[]
}

const KEY = 'maplemvp.scanLog'
const KEEP = 3

export function lastScans(): ScanLog[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ScanLog[] } catch { return [] }
}

function put(list: ScanLog[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, KEEP))) } catch { /* 못 남기면 그만 */ }
}

/** 판독 결과에서 기록에 남길 만큼만 뗀다 */
export function fromRaw(raw: ScanRaw | null | undefined): Pick<ScanLog, 'readings' | 'carries' | 'balance' | 'amounts' | 'scale'> {
  return {
    readings: (raw?.readings ?? []).slice(0, 3).map((v, i) => ({ v, n: raw?.votes?.[i] ?? 1 })),
    carries: (raw?.carries ?? []).slice(0, 2),
    balance: raw?.balance ?? null,
    amounts: (raw?.amounts ?? []).slice(0, 12),
    scale: raw?.scale ? Math.round(raw.scale * 1000) / 1000 : undefined,
  }
}

export function logScan(x: ScanLog) {
  put([x, ...lastScans()])
}

/** 가장 최근 기록에 계산 결과를 덧붙인다 */
export function noteScan(after: string) {
  const [first, ...rest] = lastScans()
  if (first) put([{ ...first, after }, ...rest])
}
