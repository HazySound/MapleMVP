import type { PyApi } from './api'
import { makePlan } from './core/engine'
import { getBase } from './store.svelte'
import { addDays } from './format'
import type { PlanInput, PlanResult, State, TierKey } from './types'

export const planner = $state({
  input: null as PlanInput | null,
  result: null as PlanResult | null,
  selected: [] as string[], // 선택한 주 (주 시작일)
})

let py: PyApi
let saveTimer: number | undefined
let upTimer: number | undefined
let lastData: State | undefined

/** 저장된 계획을 불러오고, 없으면 "한 단계 위 등급을 8주 뒤까지"로 시작한다. */
export async function initPlan(api: PyApi, data: State) {
  py = api
  lastData = data
  const saved = await py.get_plan()
  const idx = data.tiers.findIndex(t => t.key === data.current)
  const fallbackTarget = data.tiers[Math.min(idx + 1, data.tiers.length - 1)].key
  const date = saved.date && saved.date >= data.thisWeek ? saved.date : addDays(data.thisWeek, 8 * 7 + 6)
  planner.input = { target: saved.target ?? fallbackTarget, date, fixed: saved.fixed ?? {}, skipThisWeek: saved.skipThisWeek ?? false,
    keep: { ...KEEP_DEFAULT, ...saved.keep }, ...(saved.unit ? { unit: saved.unit } : {}) }
  requestPlan()
}

/** 계정에서 더 새 계획을 받아 왔을 때 다시 읽는다 */
export async function reloadPlan() {
  if (py && lastData) await initPlan(py, lastData)
}

// 계획도 브라우저 안에서 바로 계산한다
export function requestPlan() {
  const p = planner.input
  if (!p || !py) return
  const b = getBase()
  if (!b) return
  const k = p.keep?.on ? { every: p.keep.every, weeks: p.keep.weeks } : null
  planner.result = makePlan(b, p.target, p.date, $state.snapshot(p.fixed), p.skipThisWeek, k, p.unit ?? 1000) as PlanResult
}

function changed() {
  requestPlan()
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(async () => {
    if (!planner.input) return
    await py.save_plan($state.snapshot(planner.input))
    // 로그인해 있으면 계정에도 올린다. 쓰기 횟수 제한이 있어 마지막으로 고친 뒤 잠깐 기다렸다가 한 번에
    clearTimeout(upTimer)
    upTimer = window.setTimeout(pushNow, 15_000)
  }, 400)
}

async function pushNow() {
  clearTimeout(upTimer)
  upTimer = undefined
  const { app, pushUp } = await import('./store.svelte')
  if (app.web && app.user) await pushUp()
}

// 올리기를 기다리는 중에 탭을 떠나면 그때 바로 올린다
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && upTimer !== undefined) void pushNow()
  })
}

// ---- 입력 조작 ----
export function setTarget(k: TierKey) { planner.input!.target = k; changed() }
export function setDate(iso: string) { planner.input!.date = iso; planner.selected = []; changed() }

/** 자동으로 나누는 금액의 단위. 5만원권으로만 충전하는 사람은 5만 원 단위로 */
export function setUnit(u: number) { planner.input!.unit = u; changed() }

/** 달성 뒤에도 등급 유지. 처음엔 꺼져 있고, 켜면 4주마다 · 26주 동안으로 시작한다 */
export const KEEP_DEFAULT = { on: false, every: 4, weeks: 26 }
export function setKeep(k: Partial<typeof KEEP_DEFAULT>) {
  planner.input!.keep = { ...KEEP_DEFAULT, ...planner.input!.keep, ...k }
  planner.selected = []
  changed()
}

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

/** 고정을 모두 풀고 모든 주를 다시 자동으로 나눈다 */
export function unlockAll() {
  planner.input!.fixed = {}
  planner.selected = []
  changed()
}

export function autoTargets() {
  for (const w of targets()) delete planner.input!.fixed[w]
  changed()
}

/** 부족분을 고른 주들에 충전 단위로 나눠 더한다. */
export function spreadShortfall() {
  const r = planner.result
  const ws = targets()
  if (!r || !r.shortfall || !ws.length) return
  const u = planner.input!.unit ?? 1000
  const per = Math.ceil(r.shortfall / ws.length / u) * u
  const byStart = new Map(r.timeline.map(w => [w.start, w.amount]))
  for (const w of ws) planner.input!.fixed[w] = (planner.input!.fixed[w] ?? byStart.get(w) ?? 0) + per
  changed()
}
