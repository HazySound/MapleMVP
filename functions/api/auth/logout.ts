/** 쿠키만 지우면 끝이다. 서버가 기억하는 세션이 없다. */
import { type Ctx, SESSION, json, setCookie } from '../_lib'

export async function onRequestPost(_ctx: Ctx): Promise<Response> {
  const r = json({ ok: true })
  r.headers.set('set-cookie', setCookie(SESSION, '', 0))
  return r
}
