/**
 * 카카오 로그인 시작.
 *
 * 돌아올 주소는 지금 열린 주소에서 만든다. 도메인이 늘어도 코드는 그대로다.
 * state는 위조를 막는 표식이다. 우리가 보낸 사람이 돌아온 것인지 확인할 때 쓴다.
 */
import { type Ctx, setCookie } from '../_lib'

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const here = new URL(ctx.request.url)
  const back = `${here.origin}/api/auth/kakao`
  const state = crypto.randomUUID()

  const go = new URL('https://kauth.kakao.com/oauth/authorize')
  go.searchParams.set('client_id', ctx.env.KAKAO_REST_KEY)
  go.searchParams.set('redirect_uri', back)
  go.searchParams.set('response_type', 'code')
  go.searchParams.set('state', state)
  go.searchParams.set('scope', 'profile_nickname')

  return new Response(null, {
    status: 302,
    headers: {
      location: go.toString(),
      // 10분이면 충분하다. 로그인하다 만 표식이 오래 남을 이유가 없다
      'set-cookie': setCookie('mv_s', state, 600),
    },
  })
}
