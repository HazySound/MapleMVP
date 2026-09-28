/**
 * 문의 게시판의 화면 상태: 지금 어느 쪽(목록·글·쓰기)을 보는지와 알림 개수.
 *
 * 어느 쪽인지는 주소의 # 뒤에 둔다(#qna, #qna/12, #qna/new). 그래야 알림에서
 * 글로 바로 가고, 뒤로 가기가 먹고, 글 주소를 남에게 줄 수 있다.
 */
import { app, followOtherTabs, refreshUser } from './store.svelte'
import { unread } from './web/qna'

export type Route = { page: 'list' } | { page: 'write' } | { page: 'post'; id: number }

export const board = $state({
  route: { page: 'list' } as Route,
  unread: 0,
  /** 목록을 새로 받아야 할 때 올린다(글을 쓰거나 지운 뒤) */
  stale: 0,
})

/** 게시판 안에서 옮겨 간다. 'qna', 'qna/new', 'qna/12' */
export function go(to: string) {
  if (location.hash.slice(1) === to) read()
  else location.hash = to
}

/** 다른 탭으로 나갈 때 주소에서 #qna를 걷는다. 뒤로 가기로 다시 돌아올 수 있다 */
export function leaveBoard() {
  if (location.hash.startsWith('#qna')) history.pushState(null, '', location.pathname + location.search)
}

function read() {
  const h = decodeURIComponent(location.hash.slice(1))
  if (!h.startsWith('qna')) {
    if (app.view === 'qna') app.view = 'dash'
    return
  }
  const rest = h.slice(4)
  board.route = rest === 'new' ? { page: 'write' }
    : /^\d+$/.test(rest) ? { page: 'post', id: Number(rest) }
    : { page: 'list' }
  app.view = 'qna'
  document.querySelector('main')?.scrollTo(0, 0)
  // 게시판 안에서 옮겨 다닐 때도 새 알림이 있는지 본다. 1분을 기다리지 않게
  void checkNotes()
}

/**
 * 카카오 로그인은 첫 화면(/)으로 돌아온다. 쓰던 자리를 적어 두었다가 돌려놓는다.
 * 문의를 쓰려다 로그인한 사람이 목록 첫 화면에서 다시 찾아 들어가지 않게.
 */
const BACK = 'maplemvp.back'
export function loginHere(to = location.hash) {
  try { sessionStorage.setItem(BACK, to) } catch { /* 돌아와서 첫 화면이면 그만이다 */ }
  app.signInForQna = true
  app.showSignIn = true
}

let timer = 0

/**
 * 알림 개수. 화면을 보고 있는 동안 15초마다, 탭으로 돌아오거나 게시판 안에서 옮겨 다닐 때 묻는다.
 * 실시간 연결(웹소켓)은 무료 요금제에서 붙들고 있을 수가 없다. 개수만 묻는 요청은 가벼워서
 * 자주 물어도 부담이 없고, 보는 사람에게는 거의 바로 뜨는 것처럼 보인다.
 */
export async function checkNotes() {
  if (!app.user) { board.unread = 0; return }
  const r = await unread()
  if (r.data) {
    board.unread = r.data.unread
    // 다른 탭에서 다른 계정으로 로그인했다. 이름표를 그 사람으로 바꾼다
    if (r.data.uid && r.data.uid !== app.user?.id) void refreshUser()
  } else if (r.status === 401) {
    void refreshUser()   // 다른 탭에서 로그아웃했다
  }
}

export function initBoard() {
  try {
    const back = sessionStorage.getItem(BACK)
    sessionStorage.removeItem(BACK)
    if (back && !location.hash) history.replaceState(null, '', back)
  } catch { /* 없으면 그만 */ }
  addEventListener('hashchange', read)
  read()
  clearInterval(timer)
  timer = window.setInterval(() => { if (document.visibilityState === 'visible') void checkNotes() }, 15_000)
  followOtherTabs(() => { board.stale++; void checkNotes() })
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void checkNotes() })
}

/** '방금', '3분 전', '어제', '9월 3일' */
export function ago(t: number, now = Date.now()): string {
  const m = Math.floor((now - t) / 60000)
  if (m < 1) return '방금'
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = new Date(t)
  const days = Math.floor(h / 24)
  if (days < 7) return days === 1 ? '어제' : `${days}일 전`
  const y = d.getFullYear() === new Date(now).getFullYear() ? '' : `${d.getFullYear()}년 `
  return `${y}${d.getMonth() + 1}월 ${d.getDate()}일`
}

/** 글에 적는 날짜와 시각 */
export function stamp(t: number): string {
  const d = new Date(t)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
