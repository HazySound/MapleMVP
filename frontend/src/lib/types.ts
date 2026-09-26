import type { buildState, makePlan, simulate } from './core/engine'
import type { Row as CoreRow, TierKey as CoreTierKey } from './core/mvp'

export type TierKey = CoreTierKey
export type Row = CoreRow
export type Sim = ReturnType<typeof simulate>
export type Computed = ReturnType<typeof buildState>
export type PlanResult = Exclude<ReturnType<typeof makePlan>, { error: string }> & { error?: string }
export type PlanWeek = PlanResult['timeline'][number]

export interface Tier { key: TierKey; name: string; th: number }
/** 검수 표의 한 줄 */
export interface PcRoomRow {
  start: string; end: string
  nexon: number    // 툴팁에서 역산한 금액
  spent: number    // 수집한 결제액
  amount: number   // PC방으로 볼 금액
  minutes: number
  note: string     // 확실히 잘못된 값
  warn: string     // 확인해 볼 값
}

/** 파이썬 인식기가 뽑아 준 숫자 후보. 어느 것이 맞는지는 core/scan이 고른다 */
export interface PcRoomScan {
  ok: boolean
  message?: string
  readings: number[][]
  amounts: number[]
  scale: number
}

export interface PcRoomResult {
  ok: boolean
  issues: string[]
  rows: PcRoomRow[]
  total?: number
  tierTh?: number
  pcTotal?: number
}

/** 파이썬이 내려 주는 것: 원본 결제내역과 저장해 둔 PC방 보정값뿐이다 */
export interface Raw {
  status: 'cached' | 'ok' | 'needs_login' | 'error'
  loggedOut: boolean
  message: string | null
  syncedAt: string | null
  demo: boolean
  usageError?: string | null
  rows: Row[]
  pcroom: Record<string, number>
}

/** 화면이 쓰는 상태 = 원본 + TS 코어가 계산한 값 */
export type State = Omit<Raw, 'rows' | 'pcroom'> & Computed
export type Week = Computed['weeks'][number]
export type PcRoom = Computed['pcroom']

/** 데이터가 하나도 없을 때의 응답 */
export interface Bare { status: 'empty' | 'needs_login' | 'error'; message?: string; demo: boolean }

/** total이 0이면 끝을 모른다는 뜻이다. 그때는 눈금 없는 막대로 보여 준다 */
export interface Progress { label: string; done: number; total: number; count?: number }

export interface ExportResult { path?: string; name?: string; count?: number; canceled?: boolean; error?: string }

export type SortField = 'date' | 'item' | 'price'

export interface HistoryQuery { page: number; size: number; q: string; start: string; end: string; sort: SortField; desc: boolean }

export interface HistoryPage {
  rows: Row[]
  total: number   // 조건에 맞는 건수
  sum: number
  page: number
  pages: number
  allTotal: number // 보관 중인 전체 건수
  first: string
  last: string
  archived: boolean // 과거 내역까지 다 받아뒀는지
}

/** 목표 계획 입력. fixed는 주 시작일(목) → 직접 정한 결제 금액 */
export interface PlanInput { target: TierKey; date: string; fixed: Record<string, number>; skipThisWeek: boolean }

