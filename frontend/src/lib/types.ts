export type TierKey = 'bronze' | 'silver' | 'gold' | 'diamond' | 'red' | 'black'

export interface Tier { key: TierKey; name: string; th: number }
export interface Week { start: string; end: string; amount: number }
export interface Row { date: string; item: string; price: number }
export interface Refresh { sum: number; tier: TierKey | null; carry: number }

export interface Sim {
  extra: number
  total: number
  current: TierKey | null // 시뮬레이션 금액까지 반영한 현재 등급
  next: TierKey | null
  carryAfter: number
  carryUsed: number
  carryAdded: number
  keepWeeks: number
  forecast: Refresh[] // 다음 목요일부터 14번의 갱신
}

export interface State {
  status: 'cached' | 'ok' | 'needs_login' | 'error'
  message: string | null
  syncedAt: string | null
  demo: boolean
  thisWeek: string
  deadline: string
  tiers: Tier[]
  weeks: Week[] // 13주: 가장 오래된 주 ~ 이번 주
  current: TierKey | null // 지금 등급 (이번 주 결제까지 반영)
  weekStart: TierKey | null // 이번 주가 시작될 때 정해진 등급
  carry: number
  need: Record<TierKey, number>    // 다음 목요일 기준
  needNow: Record<TierKey, number> // 지금 당장 올리는 기준
  recent: Row[]
  sim: Sim
}

/** 데이터가 하나도 없을 때의 응답 */
export interface Bare { status: 'empty' | 'needs_login' | 'error'; message?: string; demo: boolean }

export interface Progress { label: string; done: number; total: number }

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

export interface PlanWeek {
  offset: number // 0 = 이번 주
  start: string
  end: string
  amount: number // 계획 결제 (고정 또는 자동 분배)
  fixed: boolean
  counts: boolean // 결제를 나눠 넣을 수 있는 주인지
  skipped: boolean // 이번 주 추가 결제 없음으로 둔 주
  sum: number // 그 주의 13주 합계
  tier: TierKey | null
  drop: number // 그 주 목요일에 13주 밖으로 빠지는 금액
}

export interface PlanResult {
  error?: string
  base: number // 목표 주 13주 안에 남는 기존 결제
  required: number
  equalPer: number
  weeksCount: number
  fixedSum: number
  autoPer: number
  autoCount: number
  shortfall: number
  surplus: number
  planned: number
  reached: number | null
  spentThisWeek: number
  timeline: PlanWeek[]
}
