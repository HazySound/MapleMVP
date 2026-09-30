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
  /** 화면에 나오지 않아 구할 수 없는 주 (블랙의 가장 오래된 주) */
  unknown?: boolean
  /** PC방 범위. 갱신 때 쓴 이월이 섞여 확정하지 못한 주는 둘이 다르다 */
  pcMin?: number
  pcMax?: number
  /** 그 주 금액(넥슨 − 수집) 범위. 블랙 첫 스캔의 가장 오래된 주는 범위로만 안다 */
  gapMin?: number
  gapMax?: number
  /** 합만 아는 묶음의 첫 주. 묶음의 합은 첫 주 금액에 몰려 있다 */
  group?: string
}

/** 파이썬 인식기가 뽑아 준 숫자 후보. 어느 것이 맞는지는 core/scan이 고른다 */
export interface PcRoomScan {
  ok: boolean
  message?: string
  readings: number[][]
  /** 툴팁 맨 오른쪽 '사용 이월 금액' 열 후보. 블랙이 아니면 모두 0이다 */
  carries?: number[][]
  amounts: number[]
  scale: number
  /** 블랙 툴팁 맨 아래 이월 잔액. 못 읽으면 null */
  balance?: number | null
}

export interface PcRoomResult {
  ok: boolean
  issues: string[]
  rows: PcRoomRow[]
  /** 지금 13주 합계. 블랙은 화면에 안 나와서 null이다 */
  total?: number | null
  tierTh?: number
  pcTotal?: number
  /** 이월 규칙으로 맞춰 봤지만 툴팁과 맞는 경우가 없었다 */
  conflict?: boolean
  /** 인게임 툴팁으로 확인한 이월 잔액. 저장해 두고 다음부터 이 값을 믿는다 */
  carry?: number | null
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
export interface PlanInput {
  target: TierKey; date: string; fixed: Record<string, number>; skipThisWeek: boolean
  /** 달성 뒤에도 등급 유지: 몇 주마다 결제할지, 목표 주 뒤 몇 주 동안 */
  keep?: { on: boolean; every: number; weeks: number }
  /** 자동으로 나누는 금액의 단위(원). 없으면 1,000원 */
  unit?: number
}

