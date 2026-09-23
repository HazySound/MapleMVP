import type { PyApi } from './api'
import { addDays } from './format'
import type { PlanInput, PlanResult, State, TierKey } from './types'

export const planner = $state({
  input: null as PlanInput | null,
  result: null as PlanResult | null,
  selected: [] as string[], // 선택한 주 (주 시작일)
})

let py: PyApi
let saveTimer: number | undefined

/** 저장된 계획을 불러오고, 없으면 "한 단계 위 등급을 8주 뒤까지"로 시작한다. */
export async function initPlan(api: PyApi, data: State) {
  py = api
  const saved = await py.get_plan()
  const idx = data.tiers.findIndex(t => t.key === data.current)
  const fallbackTarget = data.tiers[Math.min(idx + 1, data.tiers.length - 1)].key
  const date = saved.date && saved.date >= data.thisWeek ? saved.date : addDays(data.thisWeek, 8 * 7 + 6)
  planner.input = { target: saved.target ?? fallbackTarget, date, fixed: saved.fixed ?? {}, skipThisWeek: saved.skipThisWeek ?? false }
  requestPlan()
}

// ---- 계산 요청: 입력이 빠르게 바뀌면 마지막 입력만 다시 보낸다 ----
let inflight = false
let sentKey = ''
export async function requestPlan() {
  const p = planner.input
  if (!p || !py) return
  const key = JSON.stringify(p)
  if (inflight) return
  inflight = true
  sentKey = key
  try {
    planner.result = await py.plan(p.target, p.date, $state.snapshot(p.fixed), p.skipThisWeek)
  } finally {
    inflight = false
  }
  if (JSON.stringify(planner.input) !== sentKey) requestPlan()
}

function changed() {
  requestPlan()
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => planner.input && py.save_plan($state.snapshot(planner.input)), 400)
}

// ---- 입력 조작 ----
export function setTarget(k: TierKey) { planner.input!.target = k; changed() }
export function setDate(iso: string) { planner.input!.date = iso; planner.selected = []; changed() }

/** 이번 주는 더 결제하지 않음 (이미 쓴 금액만 반영) */
export function setSkipThisWeek(on: boolean, thisWeek: string) {
  planner.input!.skipThisWeek = on
  if (on) planner.selected = planner.selected.filter(w => w !== thisWeek)
  changed()
}

/** 금액을 직접 정하면 그 주는 고정, null이면 자동 분배로 돌아간다. */
export function setAmount(week: string, v: number | null) {
  const f = planner.input!.fixed
  if (v == null) delete f[week]
  else f[week] = Math.max(0, Math.round(v))
  changed()
}

export function toggleLock(week: string, current: number) {
  setAmount(week, week in planner.input!.fixed ? null : current)
}

export function toggleSelect(week: string) {
  const s = planner.selected
  planner.selected = s.includes(week) ? s.filter(w => w !== week) : [...s, week]
}

/** 선택한 주. 아무것도 안 골랐으면 계산에 들어가는 모든 주 */
function targets(): string[] {
  if (planner.selected.length) return planner.selected
  return (planner.result?.timeline ?? []).filter(w => w.counts).map(w => w.start)
}

export function fixTargets(amount: number) {
  for (const w of targets()) planner.input!.fixed[w] = Math.max(0, Math.round(amount))
  changed()
}

export function autoTargets() {
  for (const w of targets()) delete planner.input!.fixed[w]
  changed()
}

/** 부족분을 고른 주들에 1,000원 단위로 나눠 더한다. */
export function spreadShortfall() {
  const r = planner.result
  const ws = targets()
  if (!r || !r.shortfall || !ws.length) return
  const per = Math.ceil(r.shortfall / ws.length / 1000) * 1000
  const byStart = new Map(r.timeline.map(w => [w.start, w.amount]))
  for (const w of ws) planner.input!.fixed[w] = (planner.input!.fixed[w] ?? byStart.get(w) ?? 0) + per
  changed()
}
