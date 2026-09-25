import type { Bare, ExportResult, HistoryPage, HistoryQuery, PcRoomScan, PlanInput, Progress, Raw } from './types'

export interface PyApi {
  get_state(): Promise<Raw | Bare>
  refresh(): Promise<Raw | Bare>
  pcroom_scan(dataUrl: string, scale: number): Promise<PcRoomScan>
  pcroom_save(weeks: Record<string, number>): Promise<Raw | Bare>
  pcroom_clear(): Promise<Raw | Bare>
  get_ui(): Promise<{ medal?: boolean }>
  save_ui(data: { medal: boolean }): Promise<void>
  get_plan(): Promise<Partial<PlanInput>>
  save_plan(p: PlanInput): Promise<void>
  history(page: number, size: number, q: string, start: string, end: string, sort: string, desc: boolean): Promise<HistoryPage>
  export_history(q: string, start: string, end: string, sort: string, desc: boolean): Promise<ExportResult>
  open_login(): Promise<void>
  hide_login(): Promise<void>
  minimize(): Promise<void>
  toggle_maximize(): Promise<boolean>
  is_maximized(): Promise<boolean>
  close(): Promise<void>
  start_resize(edge: string): Promise<void>
}

declare global {
  interface Window {
    pywebview?: { api: PyApi }
    // Python → JS 푸시
    __mvp?: { onProgress(p: Progress): void; onLoggedIn(): void }
    /** 같은 화면에서 북마클릿을 눌렀을 때 가져오기 안내를 여는 길 (웹) */
    __mvpImport?: () => void
  }
}

/**
 * 어디서 도는지에 따라 구현을 고른다.
 * exe 안이면 파이썬(pywebview), 그냥 브라우저면 web/api.ts.
 * 웹으로 빌드할 때는 VITE_TARGET=web이라 기다리지 않고 바로 고른다.
 */
export function pyReady(): Promise<PyApi> {
  return new Promise(resolve => {
    if (import.meta.env.VITE_TARGET === 'web') { runtime.web = true; return void import('./web/api').then(m => resolve(m.webApi)) }
    if (window.pywebview?.api) return resolve(window.pywebview.api)
    // 브라우저에서 그냥 열어 본 경우 (npm run dev 등) — 잠깐 기다려 보고 웹 구현으로 넘어간다
    const timer = setTimeout(() => { runtime.web = true; void import('./web/api').then(m => resolve(m.webApi)) }, 2000)
    window.addEventListener('pywebviewready', () => {
      clearTimeout(timer)
      resolve(window.pywebview!.api)
    }, { once: true })
  })
}

/** 브라우저에서 도는 중인지 (exe가 아니면 참) */
export const runtime = { web: false }

export const hasData = (s: Raw | Bare): s is Raw => 'rows' in s
