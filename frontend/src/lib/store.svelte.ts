import gsap from 'gsap'
import { hasData, pyReady, runtime, type PyApi } from './api'
import { REDUCED } from './format'
import { initPlan, requestPlan } from './plan.svelte'
import { buildBase, buildState, simulate as simCalc } from './core/engine'
import type { Base } from './core/engine'
import type { Bare, HistoryPage, HistoryQuery, Progress, Raw, Sim, State, TierKey } from './types'

/** 화면 위를 덮는 상태. null이면 대시보드만 보인다. */
export type Overlay = null | 'boot' | 'first-sync' | 'login' | 'first-error'

export const app = $state({
  view: 'dash' as 'dash' | 'plan',
  data: null as State | null,
  sim: null as Sim | null,
  extra: 0,
  target: 'red' as TierKey,
  targetPicked: false, // 목표 등급을 사용자가 직접 골랐는지 (고르기 전까지는 현재 등급을 따라간다)
  overlay: 'boot' as Overlay,
  syncing: false,
  progress: null as Progress | null,
  loginOpened: false,
  loggedOut: false,   // 넥슨 로그인이 풀린 상태
  error: null as string | null, // 데이터는 있는데 동기화에 실패했을 때
  showHistory: false,
  showPcRoom: false,
  showImport: false,
  importing: false,  // 북마클릿이 넥슨에서 읽어 보내는 중 (웹)
  importError: '',   // 북마클릿이 알려 온 실패 사유
  importPoke: 0,     // 북마클릿이 이 화면을 부른 횟수. 다음에 누를 곳을 짚어 준다
  maximized: false,
  web: false,        // 브라우저에서 도는 중 (넥슨 수집을 직접 못 한다)
  simBusy: false,    // 시뮬레이션 금액이 움직이는 중
  simTarget: 0,      // 움직여 가는 목표 금액 (0이면 원래대로 돌아가는 중)
  theme: 'dark' as 'dark' | 'light',
  medal: false,   // MVP 등급 카드 가운데: false=합계, true=메달
  previewTier: null as TierKey | null,   // 개발자용: 다른 등급으로 바꿔서 보기
  history: null as HistoryPage | null,
  firstError: '',
})

let py: PyApi
let base: Base | null = null
export const getBase = () => base

/** 원본(파이썬) + TS 코어 계산 = 화면 상태 */
function compute(raw: Raw): State {
  base = buildBase(raw.rows, raw.pcroom)
  const { rows, pcroom, ...rest } = raw
  return { ...rest, ...buildState(base) }
}

function apply(raw: Raw, initial: boolean) {
  const s = compute(raw)
  app.data = s
  // 기본 목표는 '지금 등급 유지'. 직접 고르기 전까지는 동기화로 등급이 바뀌면 같이 따라간다
  // (첫 화면은 동기화 전 캐시라 등급이 낮게 나올 수 있어서, 거기서 굳으면 안 된다)
  if (initial || !app.targetPicked) app.target = s.current ?? 'bronze'
  if (app.extra === 0) app.sim = s.sim
  else requestSim(app.extra)
  if (initial) initPlan(py, s)
  else requestPlan()
}

function handle(s: Raw | Bare) {
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
  app.web = runtime.web
  window.__mvp = {
    onProgress: p => { app.progress = p },
    onLoggedIn: () => {
      app.loginOpened = false
      if (!app.data) app.overlay = 'first-sync'   // 로그인 안내를 내리고 수집 화면으로 넘어간다
      refresh()
    },
  }
  if (app.web) await listenWeb()
  py.get_ui().then(ui => {
    if (typeof ui?.medal === 'boolean') app.medal = ui.medal
    if (ui?.theme === 'light' || ui?.theme === 'dark') setTheme(ui.theme)
  })
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

/** 목표 등급을 직접 고른다. 이 뒤로는 동기화해도 바뀌지 않는다. */
export function setTarget(k: TierKey) {
  app.target = k
  app.targetPicked = true
}

/** 캡처에서 숫자 후보를 뽑아 온다. 어느 것이 맞는지는 core/scan이 고른다 */
export function pcroomScan(dataUrl = '', scale = 0) {
  return py.pcroom_scan(dataUrl, scale)
}

export async function pcroomSave(weeks: Record<string, number>) {
  handle(await py.pcroom_save(weeks))
}

/** 북마클릿이 보내온 구매내역이 저장된 뒤 화면을 다시 만든다 */
export async function reloadWeb() {
  handle(await py.get_state())
}

/**
 * 북마클릿이 보내오는 것을 앱이 뜰 때부터 듣는다.
 *
 * 모달이 열려 있을 때만 들으면, 북마클릿이 띄워 준 탭은 아무것도 못 받는다.
 * 받는 동안에는 모달을 열어 진행률을 보여 주고, 다 받으면 스스로 닫는다.
 */
async function listenWeb() {
  const { claimTab, listen } = await import('./web/import')
  claimTab()   // 북마클릿이 이 탭을 이름으로 찾아온다
  // 이 화면에서 북마클릿을 누르면 여기를 부른다. 주소를 건드리지 않는다.
  // 창이 이미 열려 있으면 뜨는 변화가 없으므로, 다음에 누를 단추를 짚어 준다.
  const openImport = () => {
    app.showImport = true
    app.importPoke++
  }
  window.__mvpImport = openImport
  // 앱이 아직 안 떴을 때 북마클릿이 쓰는 길. 주소로 부르고 흔적은 지운다
  const fromHash = () => {
    if (location.hash !== '#import') return
    // 이 파일에도 history라는 함수가 있다. 브라우저 쪽을 또렷이 가리킨다
    window.history.replaceState(null, '', location.pathname + location.search)
    openImport()
  }
  window.addEventListener('hashchange', fromHash)
  fromHash()
  listen({
    onConnect: () => {
      app.importError = ''
      app.progress = null
      app.importing = true
      app.showImport = true
    },
    onProgress: p => { app.progress = p },
    onRows: async () => {
      app.importing = false
      app.progress = null
      await reloadWeb()
      app.showImport = false   // 다 받았으니 바로 대시보드를 보여 준다
    },
    onError: message => {
      app.importing = false
      app.progress = null
      app.importError = message
      app.showImport = true
    },
    onOther: () => { void reloadWeb() },
  })
}

/** 이 브라우저에 저장해 둔 구매내역·보정값을 모두 지운다 (웹 전용) */
export async function clearWeb() {
  const { clearAll } = await import('./web/api')
  clearAll()
  app.importError = ''
  app.targetPicked = false
  await reloadWeb()
}

export async function pcroomClear() {
  handle(await py.pcroom_clear())
}

/** 밝은 화면/어두운 화면. 색은 전부 CSS 변수를 거치므로 표시 하나만 바꾸면 된다 */
export function setTheme(t: 'dark' | 'light') {
  app.theme = t
  if (t === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
}

export function toggleTheme() {
  setTheme(app.theme === 'dark' ? 'light' : 'dark')
  py.save_ui({ medal: app.medal, theme: app.theme })
}

export function toggleMedal() {
  app.medal = !app.medal
  py.save_ui({ medal: app.medal, theme: app.theme })   // 다음에 열 때도 그대로 보이게 저장
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
  maximize: async () => { app.maximized = await py.toggle_maximize() },
  close: () => py?.close(),
  resize: (edge: string) => py?.start_resize(edge),
}

// 시뮬레이션은 브라우저 안에서 바로 계산한다 (예전에는 파이썬까지 다녀왔다)
function requestSim(v: number) {
  if (base) app.sim = simCalc(base, v)
}

export function setExtra(v: number, animate = false) {
  app.previewTier = null   // 실제 데이터를 건드리면 미리보기는 끈다
  v = Math.max(0, Math.min(MAX_EXTRA, Math.round(v / 1000) * 1000))
  app.simTarget = v
  if (!animate || REDUCED) {
    app.simBusy = false
    app.extra = v
    requestSim(v)
    return
  }
  app.simBusy = true
  const o = { v: app.extra }
  gsap.to(o, {
    v, duration: 0.6, ease: 'power3.out', overwrite: true,
    onUpdate: () => { app.extra = Math.round(o.v / 1000) * 1000; requestSim(app.extra) },
    onComplete: () => { app.simBusy = false },
  })
}

export const MAX_EXTRA = 3_000_000
