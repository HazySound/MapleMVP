import gsap from 'gsap'
import { hasData, pyReady, type PyApi } from './api'
import { REDUCED } from './format'
import { initPlan, requestPlan } from './plan.svelte'
import type { Bare, HistoryPage, HistoryQuery, Progress, Sim, State, TierKey } from './types'

/** 화면 위를 덮는 상태. null이면 대시보드만 보인다. */
export type Overlay = null | 'boot' | 'first-sync' | 'login' | 'first-error'

export const app = $state({
  view: 'dash' as 'dash' | 'plan',
  data: null as State | null,
  sim: null as Sim | null,
  extra: 0,
  target: 'red' as TierKey,
  overlay: 'boot' as Overlay,
  syncing: false,
  progress: null as Progress | null,
  loginOpened: false,
  loggedOut: false,   // 넥슨 로그인이 풀린 상태
  error: null as string | null, // 데이터는 있는데 동기화에 실패했을 때
  showHistory: false,
  medal: false,   // MVP 등급 카드 가운데: false=합계, true=메달
  previewTier: null as TierKey | null,   // 개발자용: 다른 등급으로 바꿔서 보기
  history: null as HistoryPage | null,
  firstError: '',
})

let py: PyApi

function apply(s: State, initial: boolean) {
  app.data = s
  if (initial) {
    // 기본 목표: 지금 등급 유지. 등급이 없으면 브론즈
    app.target = s.current ?? 'bronze'
  }
  if (app.extra === 0) app.sim = s.sim
  else requestSim(app.extra)
  if (initial) initPlan(py, s)
  else requestPlan()
}

function handle(s: State | Bare) {
  const first = !app.data
  if (hasData(s)) { apply(s, first); app.loggedOut = s.loggedOut }
  app.error = null
  if (s.status === 'needs_login') {
    app.loggedOut = true
    app.overlay = 'login'
  } else if (s.status === 'error') {
    if (hasData(s)) { app.error = s.message; app.overlay = null }
    else { app.firstError = s.message ?? ''; app.overlay = 'first-error' }
  } else if (hasData(s)) {
    app.overlay = null
  }
}

export async function boot() {
  py = await pyReady()
  window.__mvp = {
    onProgress: p => { app.progress = p },
    onLoggedIn: () => {
      app.loginOpened = false
      if (!app.data) app.overlay = 'first-sync'   // 로그인 안내를 내리고 수집 화면으로 넘어간다
      refresh()
    },
  }
  py.get_ui().then(ui => { if (typeof ui?.medal === 'boolean') app.medal = ui.medal })
  const s = await py.get_state()
  if (s.status === 'empty') app.overlay = 'first-sync'
  else handle(s)
  if (s.status !== 'needs_login') refresh()   // 로그인부터 해야 하면 수집은 로그인한 뒤에
}

export async function refresh() {
  if (app.syncing) return
  app.previewTier = null
  app.syncing = true
  app.progress = null
  if (!app.data && app.overlay !== 'login') app.overlay = 'first-sync'
  try {
    handle(await py.refresh())
  } finally {
    app.syncing = false
    app.progress = null
  }
}

// ---- 구매내역 보관함 ----
let historySeq = 0
export async function history(qry: HistoryQuery) {
  const seq = ++historySeq
  const r = await py.history(qry.page, qry.size, qry.q, qry.start, qry.end, qry.sort, qry.desc)
  if (seq === historySeq) app.history = r // 늦게 온 응답은 버린다
}

export function exportHistory(qry: Omit<HistoryQuery, 'page' | 'size'>) {
  return py.export_history(qry.q, qry.start, qry.end, qry.sort, qry.desc)
}

export function toggleMedal() {
  app.medal = !app.medal
  py.save_ui({ medal: app.medal })   // 다음에 열 때도 그대로 보이게 저장
}

export function openLogin() {
  app.loginOpened = true
  py.open_login()
}

/** 로그인 안내를 닫는다. 받아둔 내역만으로 계속 볼 수 있다 */
export function dismissLogin() {
  app.loginOpened = false
  app.overlay = null
  py.hide_login()
}

export function showLogin() {
  app.overlay = 'login'
}

export const win = {
  minimize: () => py?.minimize(),
  maximize: () => py?.toggle_maximize(),
  close: () => py?.close(),
  resize: (edge: string) => py?.start_resize(edge),
}

// ---- 시뮬레이션: 요청이 밀리면 마지막 값만 다시 보낸다 ----
let inflight = false
async function requestSim(v: number) {
  if (inflight) return
  inflight = true
  try {
    app.sim = await py.simulate(v)
  } finally {
    inflight = false
  }
  if (app.sim && app.sim.extra !== app.extra) requestSim(app.extra)
}

export function setExtra(v: number, animate = false) {
  app.previewTier = null   // 실제 데이터를 건드리면 미리보기는 끈다
  v = Math.max(0, Math.min(MAX_EXTRA, Math.round(v / 1000) * 1000))
  if (!animate || REDUCED) {
    app.extra = v
    requestSim(v)
    return
  }
  const o = { v: app.extra }
  gsap.to(o, {
    v, duration: 0.6, ease: 'power3.out', overwrite: true,
    onUpdate: () => { app.extra = Math.round(o.v / 1000) * 1000; requestSim(app.extra) },
  })
}

export const MAX_EXTRA = 3_000_000
