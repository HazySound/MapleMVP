/**
 * 로그인 세션과 저장소.
 *
 * 세션 목록을 서버에 두지 않는다. 쿠키 안에 회원번호를 담고 서명만 붙여서,
 * 서명이 맞으면 우리가 내준 것으로 본다. 서버가 기억할 것이 없으니
 * 여러 곳에서 동시에 요청이 와도 어긋날 일이 없다.
 */
export interface Env {
  DB: D1Database
  KAKAO_REST_KEY: string
  KAKAO_CLIENT_SECRET?: string
  /** 탈퇴할 때 카카오 연결까지 끊는 데 쓴다. 없으면 우리 쪽 것만 지운다 */
  KAKAO_ADMIN_KEY?: string
  SESSION_SECRET: string
}

export interface Ctx {
  request: Request
  env: Env
  params: Record<string, string>
}

const COOKIE = 'mv'
const DAYS = 30

const enc = new TextEncoder()

function b64url(b: ArrayBuffer | Uint8Array): string {
  const a = b instanceof Uint8Array ? b : new Uint8Array(b)
  let s = ''
  for (const v of a) s += String.fromCharCode(v)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function unb64url(s: string): Uint8Array {
  const t = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4))
  return Uint8Array.from(bin, c => c.charCodeAt(0))
}

async function key(secret: string) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' },
                                 false, ['sign', 'verify'])
}

/** 회원번호를 담은 쿠키 값을 만든다. 이름은 우리 쪽에 따로 둔다 */
export async function sign(secret: string, uid: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ uid, exp: Date.now() + DAYS * 864e5 })))
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body))
  return `${body}.${b64url(mac)}`
}

/** 쿠키에서 누구인지 꺼낸다. 서명이 틀리거나 기한이 지났으면 null. */
export async function verify(secret: string, token: string | null): Promise<{ uid: string } | null> {
  if (!token || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64url(mac), enc.encode(body))
    if (!ok) return null
    const p = JSON.parse(new TextDecoder().decode(unb64url(body)))
    if (!p.uid || typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return { uid: String(p.uid) }
  } catch {
    return null
  }
}

export function cookieOf(request: Request, name = COOKIE): string | null {
  const raw = request.headers.get('cookie') ?? ''
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

export function setCookie(name: string, value: string, maxAge: number): string {
  // HttpOnly라 스크립트가 못 읽고, Lax라 다른 사이트에서 보낸 요청에는 안 실린다
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

export const SESSION = COOKIE
export const SESSION_AGE = DAYS * 86400

/** 지금 요청을 보낸 사람. 로그인 전이면 null */
export async function who(ctx: Ctx) {
  return verify(ctx.env.SESSION_SECRET, cookieOf(ctx.request))
}

/**
 * 한 번 만들고 나면 다시 묻지 않는다.
 *
 * ensure는 요청마다 불리는데, 그때마다 CREATE TABLE IF NOT EXISTS 넷을 D1에
 * 보내면 아무것도 바뀌지 않는 왕복이 넷씩 쌓인다. 워커는 같은 일꾼이 여러
 * 요청을 받으므로, 그 일꾼이 한 번 확인했으면 그걸로 충분하다.
 *
 * 일꾼이 새로 뜨면 이 값도 새로 시작해서 다시 한 번 확인한다.
 */
let ready = false

/** 표가 없으면 만든다. 마이그레이션 도구를 따로 두기엔 표가 둘뿐이다. */
export async function ensure(db: D1Database) {
  if (ready) return
  await build(db)
  ready = true
}

async function build(db: D1Database) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS vault (' +
    'uid TEXT PRIMARY KEY, ' +
    'rows TEXT NOT NULL, ' +
    'pcroom TEXT NOT NULL, ' +
    'synced_at TEXT, ' +
    'saved_at INTEGER NOT NULL)')
  // 보정값을 주차별로 언제 고쳤는지. 기기가 둘일 때 나중에 고친 쪽을 남기려면 필요하다
  try { await db.exec('ALTER TABLE vault ADD COLUMN pcroom_at TEXT') } catch { /* 이미 있다 */ }
  // 이름은 카카오에서 받지 않는다. 이용자가 직접 정한 것을 여기 둔다.
  // tag는 같은 이름을 쓰는 사람들 사이에서 몇 번째인지다. 지금은 화면에 안 쓰지만,
  // 이름이 남에게 보이게 될 때 '느긋한 핑크빈 #2'로 구분하려면 그때 매길 수가 없다.
  await db.exec(
    'CREATE TABLE IF NOT EXISTS member (' +
    'uid TEXT PRIMARY KEY, ' +
    "nick TEXT NOT NULL DEFAULT '', " +
    'tag INTEGER NOT NULL DEFAULT 0, ' +
    'joined_at INTEGER NOT NULL)')
  // 이미 만들어진 표에는 열이 없다. 있으면 실패하는데 그때는 그냥 둔다
  try { await db.exec('ALTER TABLE member ADD COLUMN tag INTEGER NOT NULL DEFAULT 0') } catch { /* 이미 있다 */ }
  // 아직 이름을 안 정한 사람은 모두 ('', 0)이라 그대로 걸면 두 번째 가입이 막힌다
  try {
    await db.exec("CREATE UNIQUE INDEX IF NOT EXISTS member_name ON member (nick, tag) WHERE nick <> ''")
  } catch { /* 이미 있다 */ }
}

/**
 * 이 사람 것을 전부 지운다.
 *
 * 탈퇴 단추로도 오고, 카카오에서 연결을 끊었다는 알림으로도 온다. 두 길이
 * 지우는 것이 다르면 한쪽으로 나간 사람의 흔적만 남는다. 그래서 한 군데 둔다.
 */
export async function erase(db: D1Database, uid: string): Promise<void> {
  await ensure(db)
  await db.batch([
    db.prepare('DELETE FROM vault WHERE uid = ?').bind(uid),
    db.prepare('DELETE FROM member WHERE uid = ?').bind(uid),
  ])
}

/** 이용자가 정한 이름과 번호. 아직 안 정했으면 빈 이름 */
export async function nickOf(db: D1Database, uid: string): Promise<{ nick: string; tag: number }> {
  const row = await db.prepare('SELECT nick, tag FROM member WHERE uid = ?').bind(uid)
    .first<{ nick: string; tag: number }>()
  return { nick: row?.nick ?? '', tag: row?.tag ?? 0 }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
