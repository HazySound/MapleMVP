import type { Bare, ExportResult, HistoryPage, HistoryQuery, PlanInput, PlanResult, Progress, Sim, State } from './types'

export interface PyApi {
  get_state(): Promise<State | Bare>
  refresh(): Promise<State | Bare>
  simulate(extra: number): Promise<Sim>
  plan(target: string, date: string, fixed: Record<string, number>, skipThisWeek: boolean): Promise<PlanResult>
  get_ui(): Promise<{ medal?: boolean }>
  save_ui(data: { medal: boolean }): Promise<void>
  get_plan(): Promise<Partial<PlanInput>>
  save_plan(p: PlanInput): Promise<void>
  history(page: number, size: number, q: string, start: string, end: string, sort: string, desc: boolean): Promise<HistoryPage>
  export_history(q: string, start: string, end: string, sort: string, desc: boolean): Promise<ExportResult>
  open_login(): Promise<void>
  hide_login(): Promise<void>
  minimize(): Promise<void>
  toggle_maximize(): Promise<void>
  close(): Promise<void>
  start_resize(edge: string): Promise<void>
}

declare global {
  interface Window {
    pywebview?: { api: PyApi }
    // Python → JS 푸시
    __mvp?: { onProgress(p: Progress): void; onLoggedIn(): void }
  }
}

export function pyReady(): Promise<PyApi> {
  return new Promise(resolve => {
    if (window.pywebview?.api) return resolve(window.pywebview.api)
    window.addEventListener('pywebviewready', () => resolve(window.pywebview!.api), { once: true })
  })
}

export const hasData = (s: State | Bare): s is State => 'weeks' in s
