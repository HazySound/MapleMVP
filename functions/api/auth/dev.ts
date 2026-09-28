/**
 * 로컬에서 카카오 없이 로그인해 보는 길. 게시판 흐름(글 → 답 → 알림)을 여러 사람으로 시험할 때 쓴다.
 *
 * 운영에서는 절대 열리면 안 된다. 두 가지가 다 맞을 때만 연다:
 *  - DEV_LOGIN=1 (운영 환경변수에는 넣지 않는다. wrangler pages dev -b 로만 준다)
 *  - 주소가 localhost / 127.0.0.1
 */
import { type Ctx, SESSION, SESSION_AGE, ensure, setCookie, sign } from '../_lib'

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const here = new URL(ctx.request.url)
  const local = here.hostname === 'localhost' || here.hostname === '127.0.0.1'
  if (ctx.env.DEV_LOGIN !== '1' || !local) return new Response('not found', { status: 404 })

  const who = (here.searchParams.get('as') || 'tester').replace(/[^a-z0-9]/gi, '').slice(0, 20) || 'tester'
  const nick = here.searchParams.get('nick') || who
  const admin = here.searchParams.get('admin') === '1' ? 1 : 0
  const uid = `dev:${who}`
  await ensure(ctx.env.DB)
  await ctx.env.DB.prepare('INSERT INTO member (uid, nick, tag, joined_at, admin) VALUES (?, ?, 1, ?, ?) '
    + 'ON CONFLICT(uid) DO UPDATE SET nick = excluded.nick, admin = excluded.admin')
    .bind(uid, nick, Date.now(), admin).run()
  const to = here.searchParams.get('to') || '/#qna'
  return new Response(null, {
    status: 302,
    headers: [
      ['location', to.startsWith('/') && !to.startsWith('//') ? to : '/#qna'],
      ['set-cookie', setCookie(SESSION, await sign(ctx.env.SESSION_SECRET, uid), SESSION_AGE)],
    ],
  })
}
