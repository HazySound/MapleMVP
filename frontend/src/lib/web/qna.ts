/**
 * 문의 게시판과 알림을 서버에 묻는 곳.
 *
 * 누가 무엇을 볼 수 있는지는 서버(functions/api/_qna.ts)가 정한다.
 * 여기서는 받은 것을 그대로 쓴다. 화면에서 가려 봐야 주소만 알면 열린다.
 */

export type Kind = 'bug' | 'idea' | 'howto' | 'notice'
export type Topic = 'tier' | 'pcroom' | 'etc' | ''
export type Status = 'open' | 'answered' | 'done'

export interface Item {
  id: number
  kind: Kind
  topic: Topic
  title: string
  secret: boolean
  status: Status
  likes: number
  replies: number
  at: number
  nick: string
  admin: boolean
  mine: boolean
  /** 글에 그림이 붙어 있는지 */
  pics: boolean
}

export interface Pic { id: string; w: number; h: number }

export interface Reply { id: number; body: string; at: number; nick: string; admin: boolean; mine: boolean; images: Pic[] }

export interface Post extends Omit<Item, 'replies'> {
  body: string
  images: Pic[]
  diag: Diag | null
  liked: boolean
  canReply: boolean
  /** 쓴 사람이 답을 받은 뒤 '해결됐어요'를 누를 수 있는지 */
  canSolve: boolean
  replies: Reply[]
}

/** 버그 문의에 같이 보내는 것. 쓴 사람과 관리자만 본다 */
export interface Diag {
  build: string
  ua: string
  screen: string
  syncedAt: string | null
  tier: string | null
  carry: number
  weeks: { start: string; amount: number; spent: number; pc: number }[]
}

export interface Note { id: number; post: number; kind: 'new' | 'more' | 'answer' | 'done'; at: number; seen: boolean; title: string }

export const KIND_NAME: Record<Kind, string> = { bug: '버그·오류', idea: '건의', howto: '사용법', notice: '공지' }
export const TOPIC_NAME: Record<string, string> = {
  tier: 'MVP 현황이 게임과 달라요', pcroom: 'PC방 보정이 이상해요', etc: '그 밖의 오류',
}
export const STATUS_NAME: Record<Status, string> = { open: '접수', answered: '답변 완료', done: '해결됨' }

async function call<T>(url: string, init?: RequestInit): Promise<{ data?: T; error?: string; status: number }> {
  try {
    const r = await fetch(url, { credentials: 'same-origin', ...init })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) return { error: (body as { error?: string }).error || '잠시 뒤에 다시 시도해 주세요', status: r.status }
    return { data: body as T, status: r.status }
  } catch {
    return { error: '연결이 끊겼어요', status: 0 }
  }
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

export function list(q: { kind?: Kind | ''; mine?: boolean; before?: number }) {
  const p = new URLSearchParams()
  if (q.kind) p.set('kind', q.kind)
  if (q.mine) p.set('mine', '1')
  if (q.before) p.set('before', String(q.before))
  return call<{ pins: Item[]; items: Item[]; more: boolean }>(`/api/qna?${p}`)
}

export const get = (id: number) => call<Post>(`/api/qna/${id}`)

export const create = (b: { kind: Kind; topic: Topic; title: string; body: string; secret: boolean; images: string[]; diag: Diag | null }) =>
  call<{ id: number }>('/api/qna', send('POST', b))

export const reply = (id: number, body: string, images: string[]) =>
  call<{ id: number }>(`/api/qna/${id}/reply`, send('POST', { body, images }))

export const dropReply = (id: number, rid: number) => call(`/api/qna/${id}/reply?rid=${rid}`, send('DELETE'))

export const like = (id: number) => call<{ liked: boolean; likes: number }>(`/api/qna/${id}/like`, send('POST'))

/** 쓴 사람이 해결됐다고 알린다. 그 뒤로는 글이 굳는다 */
export const solve = (id: number) => call<{ status: Status }>(`/api/qna/${id}`, send('PATCH', { status: 'done' }))

export const drop = (id: number) => call(`/api/qna/${id}`, send('DELETE'))

export const notes = () => call<{ unread: number; items: Note[] }>('/api/note')
export const unread = () => call<{ unread: number; uid: string }>('/api/note?count=1')
export const seen = (post?: number) => call('/api/note', send('POST', post ? { post } : {}))

export const imgUrl = (id: string) => `/api/img/${id}`

/** 서버가 받는 한 장 크기(D1 한 줄 2MB)보다 조금 작게 */
const LIMIT = 1_850_000
/** 이보다 크면 줄인다. 1440p 캡처까지는 그대로 둔다 */
const MAX_SIDE = 2560

/**
 * 올리기 전에 크기를 맞춘다.
 *
 * 인게임 캡처는 작은 글씨를 읽어야 하니 가능하면 PNG(손실 없음) 그대로 둔다.
 * 툴팁 인식을 다시 돌려 볼 때도 원본 픽셀이 필요하다. 너무 크면 WEBP로 바꾸고,
 * 그래도 크면 조금씩 줄인다.
 */
export async function prepare(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file)
  let scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const draw = (s: number) => {
    const c = document.createElement('canvas')
    c.width = Math.max(1, Math.round(bmp.width * s))
    c.height = Math.max(1, Math.round(bmp.height * s))
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    return c
  }
  const encode = (c: HTMLCanvasElement, type: string, q?: number) =>
    new Promise<Blob>((ok, no) => c.toBlob(b => (b ? ok(b) : no(new Error('encode'))), type, q))

  // 이미 충분히 작은 PNG·JPG·WEBP는 손대지 않는다
  if (scale === 1 && file.size <= LIMIT && /^image\/(png|jpeg|webp)$/.test(file.type)) {
    return { blob: file, w: bmp.width, h: bmp.height }
  }
  for (let i = 0; i < 6; i++) {
    const c = draw(scale)
    const png = await encode(c, 'image/png')
    if (png.size <= LIMIT) return { blob: png, w: c.width, h: c.height }
    const webp = await encode(c, 'image/webp', 0.92)
    if (webp.size <= LIMIT && webp.type === 'image/webp') return { blob: webp, w: c.width, h: c.height }
    scale *= 0.8
  }
  throw new Error('too big')
}

export async function upload(file: Blob): Promise<{ id?: string; error?: string }> {
  let p: Awaited<ReturnType<typeof prepare>>
  try { p = await prepare(file) } catch { return { error: '그림을 읽지 못했어요' } }
  const r = await call<{ id: string }>(`/api/img?w=${p.w}&h=${p.h}`, {
    method: 'POST', headers: { 'content-type': p.blob.type }, body: p.blob,
  })
  return r.data ? { id: r.data.id } : { error: r.error }
}
