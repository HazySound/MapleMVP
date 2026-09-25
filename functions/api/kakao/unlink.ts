/**
 * 카카오에서 "이 사람이 연결을 끊었다"고 알려 오는 자리.
 *
 * 우리 화면의 탈퇴 단추로 나가는 사람만 있는 것이 아니다. 카카오계정 관리에서
 * 바로 끊거나, 카카오계정 자체를 지우는 경우에는 우리에게 아무 말도 안 온다.
 * 그러면 그 사람 구매내역이 우리 쪽에 영영 남는다. 그 구멍을 막는다.
 *
 * 카카오 문서가 정한 것들:
 *  - GET/POST 중 아무거나 온다. 값도 쿼리로 오거나 본문으로 온다
 *  - Authorization에 우리 대표 어드민 키를 담아 보낸다. 그게 곧 신원 확인이다
 *  - 3초 안에 200을 줘야 한다. 지울 사람이 없어도 200이다
 *
 * 200을 주는 이유는 '잘 받았다'는 뜻이지 '지웠다'는 뜻이 아니다. 이미 없는
 * 사람이라고 오류를 돌려주면 카카오는 우리가 고장 난 줄 안다.
 */
import { type Ctx, erase } from '../_lib'

/** 길이가 다르면 바로 아는 것은 어쩔 수 없다. 그 뒤로는 시간이 값에 안 새게 한다 */
function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** 쿼리로 와도, 폼으로 와도, JSON으로 와도 같은 것을 꺼낸다 */
async function userId(request: Request): Promise<string> {
  const q = new URL(request.url).searchParams.get('user_id')
  if (q) return q
  if (request.method !== 'POST') return ''

  const type = request.headers.get('content-type') ?? ''
  try {
    if (type.includes('json')) {
      const body = (await request.json()) as { user_id?: unknown }
      return body.user_id == null ? '' : String(body.user_id)
    }
    const form = new URLSearchParams(await request.text())
    return form.get('user_id') ?? ''
  } catch {
    return ''
  }
}

async function handle(ctx: Ctx): Promise<Response> {
  const key = ctx.env.KAKAO_ADMIN_KEY
  // 열쇠를 안 넣어 두었으면 보낸 쪽이 카카오인지 알 수 없다. 그 상태로 지우면 안 된다
  if (!key) return new Response('not configured', { status: 500 })

  const sent = (ctx.request.headers.get('authorization') ?? '').replace(/^KakaoAK\s+/i, '')
  if (!same(sent, key)) return new Response('no', { status: 401 })

  const id = await userId(ctx.request)
  // 여기부터는 무슨 일이 있어도 200이다. 없는 사람이어도 '받았다'가 맞다
  if (id) {
    try { await erase(ctx.env.DB, `kakao:${id}`) } catch { /* 다음 기회가 없다. 그래도 200 */ }
  }
  return new Response('ok', { status: 200 })
}

export const onRequestGet = handle
export const onRequestPost = handle
