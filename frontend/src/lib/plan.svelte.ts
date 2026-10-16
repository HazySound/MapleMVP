import type { PyApi } from './api'
import { type Base, makePlan, rollPlan } from './core/engine'
import { TIERS, tierIndex } from './core/mvp'
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
  // 날짜가 지나 새로 정했으면 세워 둔 계획도 새로 짠다
  const frozen = date === saved.date ? saved.frozen : undefined
  planner.input = { target: saved.target ?? fallbackTarget, date, fixed: saved.fixed ?? {},
    keep: { ...KEEP_DEFAULT, ...saved.keep }, ...(saved.unit ? { unit: saved.unit } : {}), ...(saved.holdCur ? { holdCur: true } : {}),
    ...(frozen ? { frozen } : {}), ...(saved.history?.length ? { history: saved.history } : {}) }
  requestPlan()
}

/** 계정에서 더 새 계획을 받아 왔을 때 다시 읽는다 */
export async function reloadPlan() {
  if (py && lastData) await initPlan(py, lastData)
}

/** 계획 입력으로 계산한다. pins: 세워 둔 주별 금액(없으면 지금 상황으로 새로 짠다) */
function calc(b: Base, p: PlanInput, pins: Record<string, number>, fresh = false) {
  // 지금 등급 이하를 고르면 달성이 아니라 유지 계획이다. 유지 스위치를 안 켰어도 유지 설정대로 나눈다
  const keepOn = !!p.keep?.on || TIERS.findIndex(t => t.key === p.target) <= tierIndex(b.current)
  const k = keepOn ? { every: p.keep?.every ?? KEEP_DEFAULT.every, weeks: p.keep?.weeks ?? KEEP_DEFAULT.weeks } : null
  return makePlan(b, p.target, p.date, $state.snapshot(p.fixed), k, p.unit ?? 1000, !!p.holdCur, pins, fresh) as PlanResult
}

/**
 * 지금 상황으로 짠 계획을 그대로 묶어 둔다. goal을 주면 이번 주 목표는 그 금액으로 둔다
 * (다른 주를 고쳐도 이번 주 목표가 다시 나뉘지 않게)
 */
function freeze(b: Base, p: PlanInput, goal?: number) {
  // 이번 주에 이미 낸 결제는 빼고 짠다. 그래야 이번 주 목표가 다른 주처럼 그 주 전체 금액이다
  const r = calc(b, p, goal != null ? { [b.thisWeek]: goal } : {}, true)
  if (r.error) { delete p.frozen; return }
  const weeks: Record<string, number> = {}
  for (const w of r.timeline) if (w.counts) weeks[w.start] = w.goal
  p.frozen = { v: FROZEN_V, from: b.thisWeek, weeks }
}

const FROZEN_V = 2

/** 목요일이 지났다: 지난 주를 판정해 history로 옮긴다. 못 채운 주가 있으면 남은 주에 다시 나눈다 */
function roll(b: Base, p: PlanInput) {
  const r = rollPlan(b, p.frozen!, p.history ?? [])
  p.history = r.history
  if (r.frozen) p.frozen = r.frozen
  else freeze(b, p)
}

/** 이번 주 목표 · 낸 금액 · 남은 금액 · 정하지 않은 초과분 */
export function weekNow() {
  const r = planner.result, f = planner.input?.frozen
  if (!r || r.error || !r.timeline.length) return null
  const goal = r.timeline[0].goal, paid = r.spentThisWeek
  const over = Math.max(0, paid - goal)
  return { goal, paid, bought: r.boughtThisWeek, left: Math.max(0, goal - paid), over,
           pending: (f?.over ?? 0) + Math.max(0, over - (f?.ack ?? 0)), earlier: f?.over ?? 0 }
}

// 계획도 브라우저 안에서 바로 계산한다
export function requestPlan() {
  const p = planner.input
  if (!p || !py) return
  const b = getBase()
  if (!b) return
  let dirty = false
  // 지난 주에 고정해 둔 금액은 더 쓰이지 않는다. 남아 있으면 '고정 모두 풀고 자동으로'가 계속 보였다
  for (const w of Object.keys(p.fixed)) if (w < b.thisWeek) { delete p.fixed[w]; dirty = true }
  // 10/16 첫 배포(6e3e768)는 이번 주에 낸 결제 위에 이번 주 몫을 또 얹어 묶었다. 그때 묶은 것은 다시 짠다
  if (p.frozen && p.frozen.v !== FROZEN_V) { delete p.frozen; dirty = true }
  if (p.frozen && p.frozen.from < b.thisWeek) { roll(b, p); dirty = true }
  if (!p.frozen) { freeze(b, p); dirty = !!p.frozen || dirty }
  planner.result = calc(b, p, p.frozen?.weeks ?? {})
  if (dirty) save(true)
}

/** 더 낸 금액을 남은 주 계획에 반영한다: 이번 주는 낸 만큼(목표보다 적으면 목표)으로 두고 나머지 주를 다시 짠다 */
export function applyOver() {
  const p = planner.input, b = getBase(), n = weekNow()
  if (!p || !b || !n) return
  freeze(b, p, Math.max(n.goal, n.paid))
  requestPlan()
  save()
}

/** 더 낸 금액을 반영하지 않고 세워 둔 계획을 그대로 둔다 */
export function keepOver() {
  const p = planner.input, n = weekNow()
  if (!p?.frozen || !n) return
  p.frozen = { ...p.frozen, ack: n.over, over: 0 }
  requestPlan()
  save()
}

/**
 * 계획을 고쳤다: 새로 짠다. 주별 금액만 고쳤으면(keepWeek) 이번 주 목표는 세워 둔 그대로 둔다.
 * 목표 등급·날짜·유지 설정을 바꾸면 이번 주까지 새로 짠다
 */
function changed(keepWeek = true) {
  const p = planner.input!, b = getBase()
  const old = keepWeek && b && p.frozen?.from === b.thisWeek ? p.frozen : undefined
  if (b && py) freeze(b, p, old?.weeks[b.thisWeek])
  // 이번 주 목표를 그대로 두면 초과분을 어떻게 하기로 했는지도 그대로 둔다(안 그러면 '반영할까요'가 다시 뜬다)
  if (old && p.frozen) p.frozen = { ...p.frozen, ...(old.ack ? { ack: old.ack } : {}), ...(old.over ? { over: old.over } : {}) }
  requestPlan()
  save()
}

/** 기다리는 저장이 저절로 바뀐 것뿐인지(주 넘김·다시 묶기). 사용자가 한 번이라도 고쳤으면 false */
let pendingAuto = true
function save(auto = false) {
  clearTimeout(saveTimer)
  pendingAuto = pendingAuto && auto
  saveTimer = window.setTimeout(async () => {
    if (!planner.input) return
    const a = pendingAuto
    pendingAuto = true
    await py.save_plan($state.snapshot(planner.input), a)
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
export function setTarget(k: TierKey) { planner.input!.target = k; changed(false) }
export function setDate(iso: string) { planner.input!.date = iso; planner.selected = []; changed(false) }

/** 낮춰서 유지할 때 지금 등급을 날짜까지 지킬지. 끄면 바로 낮춘다 */
export function setHoldCur(on: boolean) { planner.input!.holdCur = on; planner.selected = []; changed(false) }

/** 자동으로 나누는 금액의 단위. 5만원권으로만 충전하는 사람은 5만 원 단위로 */
export function setUnit(u: number) { planner.input!.unit = u; changed(false) }

/** 달성 뒤에도 등급 유지. 처음엔 꺼져 있고, 켜면 4주마다 · 26주 동안으로 시작한다 */
export const KEEP_DEFAULT = { on: false, every: 4, weeks: 26 }
export function setKeep(k: Partial<typeof KEEP_DEFAULT>) {
  planner.input!.keep = { ...KEEP_DEFAULT, ...planner.input!.keep, ...k }
  planner.selected = []
  changed(false)
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
  changed(false)
}

/** 0원으로 고정한 주만 자동으로 되돌린다. 0원 고정은 비워 둔 칸과 비슷해 보여 자동 계산이 왜 그 주를 안 쓰는지 알기 어렵다 */
export function unlockZeros() {
  const f = planner.input!.fixed
  for (const [w, v] of Object.entries(f)) if (!v) delete f[w]
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
  const byStart = new Map(r.timeline.map(w => [w.start, w.goal]))
  for (const w of ws) planner.input!.fixed[w] = (planner.input!.fixed[w] ?? byStart.get(w) ?? 0) + per
  changed()
}
