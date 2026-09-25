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

/** 회원번호와 닉네임을 담은 쿠키 값을 만든다. */
export async function sign(secret: string, uid: string, nick: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify({ uid, nick, exp: Date.now() + DAYS * 864e5 })))
  const mac = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(body))
  return `${body}.${b64url(mac)}`
}

/** 쿠키에서 누구인지 꺼낸다. 서명이 틀리거나 기한이 지났으면 null. */
export async function verify(secret: string, token: string | null): Promise<{ uid: string; nick: string } | null> {
  if (!token || !token.includes('.')) return null
  const [body, mac] = token.split('.')
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(secret), unb64url(mac), enc.encode(body))
    if (!ok) return null
    const p = JSON.parse(new TextDecoder().decode(unb64url(body)))
    if (!p.uid || typeof p.exp !== 'number' || p.exp < Date.now()) return null
    return { uid: String(p.uid), nick: String(p.nick ?? '') }
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

/** 표가 없으면 만든다. 마이그레이션 도구를 따로 두기엔 표가 하나뿐이다. */
export async function ensure(db: D1Database) {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS vault (' +
    'uid TEXT PRIMARY KEY, ' +
    'rows TEXT NOT NULL, ' +
    'pcroom TEXT NOT NULL, ' +
    'synced_at TEXT, ' +
    'saved_at INTEGER NOT NULL)')
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } })
