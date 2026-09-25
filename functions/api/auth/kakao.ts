/**
 * 카카오에서 돌아온 사람을 맞는다.
 *
 * 받은 일회용 코드를 토큰으로 바꾸고, 그 토큰으로 회원번호를 묻는다.
 * 카카오에서 받는 것은 회원번호 하나뿐이다. 이름은 이용자가 우리 쪽에서 정한다.
 * 코드 교환은 여기(서버)에서만 한다. 브라우저에 열쇠를 내보내지 않는다.
 */
import { type Ctx, SESSION, SESSION_AGE, cookieOf, ensure, setCookie, sign } from '../_lib'

const fail = (why: string) =>
  new Response(null, { status: 302, headers: { location: `/?login=${encodeURIComponent(why)}` } })

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const here = new URL(ctx.request.url)
  const code = here.searchParams.get('code')
  const state = here.searchParams.get('state')

  // 우리가 보낸 사람이 맞는지
  if (!code || !state || state !== cookieOf(ctx.request, 'mv_s')) return fail('state')

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: ctx.env.KAKAO_REST_KEY,
    redirect_uri: `${here.origin}/api/auth/kakao`,
    code,
  })
  // 켜 두었으면 반드시 같이 보내야 하고, 안 켰으면 보내면 안 된다
  if (ctx.env.KAKAO_CLIENT_SECRET) form.set('client_secret', ctx.env.KAKAO_CLIENT_SECRET)

  const tok = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form,
  })
  if (!tok.ok) return fail('token')
  const { access_token } = (await tok.json()) as { access_token?: string }
  if (!access_token) return fail('token')

  const me = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!me.ok) return fail('user')
  const info = (await me.json()) as { id?: number }
  if (!info.id) return fail('user')

  const uid = `kakao:${info.id}`
  await ensure(ctx.env.DB)
  await ctx.env.DB
    .prepare("INSERT INTO member (uid, nick, joined_at) VALUES (?, '', ?) ON CONFLICT(uid) DO NOTHING")
    .bind(uid, Date.now()).run()

  const token = await sign(ctx.env.SESSION_SECRET, uid)
  return new Response(null, {
    status: 302,
    headers: [
      ['location', '/'],
      ['set-cookie', setCookie(SESSION, token, SESSION_AGE)],
      ['set-cookie', setCookie('mv_s', '', 0)],   // 다 쓴 표식은 지운다
    ],
  })
}
