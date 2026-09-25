/**
 * 카카오로 로그인하고, 받아 둔 내역을 계정에 묶어 둔다.
 *
 * 로그인 전에도 앱은 그대로 돌아간다. 이 브라우저에만 저장될 뿐이다.
 * 로그인하면 그 위에 '다른 기기에서도 보이게'가 얹힌다.
 *
 * 합치는 규칙은 브라우저 쪽 saveRows가 이미 쥐고 있다(넥슨 결제번호로 중복 제거).
 * 서버는 받은 것을 그대로 보관만 한다.
 *
 * 이름은 카카오에서 받지 않는다. 이용자가 여기서 직접 정한다.
 */
import type { Row } from '../types'

export interface User {
  id: string
  nick: string
}

export interface Vault {
  rows: Row[]
  pcroom: Record<string, number>
  syncedAt: string | null
}

/** 지금 로그인한 사람. 안 했으면 null */
export async function me(): Promise<User | null> {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' })
    if (!r.ok) return null
    const u = (await r.json()) as User | null
    return u?.id ? u : null
  } catch {
    return null   // 서버가 없는 자리(로컬 개발 등)에서도 앱은 돌아가야 한다
  }
}

/** 이름을 정한다. 빈 값이면 이름 없는 상태로 돌아간다 */
export async function rename(nick: string): Promise<User | null> {
  try {
    const r = await fetch('/api/me', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nick }),
    })
    return r.ok ? ((await r.json()) as User) : null
  } catch {
    return null
  }
}

export function login(): void {
  location.href = '/api/auth/login'
}

export async function logout(): Promise<void> {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }) } catch { /* 쿠키만 남는다 */ }
}

/** 계정에 저장된 것을 가져온다 */
export async function pull(): Promise<Vault | null> {
  try {
    const r = await fetch('/api/data', { credentials: 'same-origin' })
    if (!r.ok) return null
    return (await r.json()) as Vault
  } catch {
    return null
  }
}

/** 계정에 올린다. 실패해도 이 브라우저에는 이미 저장돼 있다 */
export async function push(v: Vault): Promise<boolean> {
  try {
    const r = await fetch('/api/data', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(v),
    })
    return r.ok
  } catch {
    return false
  }
}

/** 계정에 저장된 것을 지운다. 로그인은 유지된다 */
export async function wipe(): Promise<boolean> {
  try {
    const r = await fetch('/api/data', { method: 'DELETE', credentials: 'same-origin' })
    return r.ok
  } catch {
    return false
  }
}
