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
  /** 같은 이름을 쓰는 사람들 사이에서 몇 번째인지. 아직 화면에는 안 쓴다 */
  tag: number
}

export interface Vault {
  rows: Row[]
  pcroom: Record<string, number>
  /** 보정값을 고친 시각(주차별). 기기가 어긋났을 때 나중에 고친 쪽을 고르는 데 쓴다 */
  pcroomAt: Record<string, number>
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

/** 이름을 정한다. 막힌 이름이면 그 이유가 돌아온다 */
export async function rename(nick: string): Promise<{ user?: User; why?: string }> {
  try {
    const r = await fetch('/api/me', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nick }),
    })
    const body = (await r.json()) as User & { error?: string }
    return r.ok ? { user: body } : { why: body.error || '이름을 저장하지 못했어요' }
  } catch {
    return { why: '연결이 끊겼어요' }
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

/**
 * 탈퇴. 계정에 있는 것을 모두 지우고 카카오 연결도 끊는다.
 *
 * 카카오 쪽 연결 해제는 우리 손을 떠난 일이라 실패할 수 있다. 그래도 우리가 들고
 * 있던 것은 이미 지운 뒤다. 남은 것이 있는지를 돌려줘서 화면에서 알리게 한다.
 */
export async function leave(): Promise<{ ok: boolean; unlinked: boolean }> {
  try {
    const r = await fetch('/api/leave', { method: 'POST', credentials: 'same-origin' })
    const body = (await r.json().catch(() => ({}))) as { unlinked?: boolean }
    return { ok: r.ok, unlinked: !!body.unlinked }
  } catch {
    return { ok: false, unlinked: false }
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
