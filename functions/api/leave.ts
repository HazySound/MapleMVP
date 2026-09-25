/**
 * 탈퇴.
 *
 * 지우는 것이 먼저다. 카카오 연결 해제는 남의 서버에 거는 일이라 실패할 수 있는데,
 * 그걸 기다리다 실패하면 우리가 들고 있는 것도 그대로 남는다. 순서를 뒤집어서
 * 무슨 일이 있어도 우리 쪽에는 아무것도 안 남게 한다.
 *
 * 연결 해제에는 어드민 키가 든다. 안 넣어 두었으면 우리 것만 지우고 넘어간다.
 * 그래도 이 사람의 구매내역과 이름은 사라지고, 다시 로그인하면 새 사람으로 시작한다.
 */
import { type Ctx, SESSION, erase, json, setCookie, who } from './_lib'
import { LIMIT, tick, tooMany, whoSent } from './_rate'

async function unlink(env: Ctx['env'], uid: string): Promise<boolean> {
  if (!env.KAKAO_ADMIN_KEY) return false
  const id = uid.startsWith('kakao:') ? uid.slice(6) : ''
  if (!id) return false
  try {
    const r = await fetch('https://kapi.kakao.com/v1/user/unlink', {
      method: 'POST',
      headers: {
        authorization: `KakaoAK ${env.KAKAO_ADMIN_KEY}`,
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: new URLSearchParams({ target_id_type: 'user_id', target_id: id }),
    })
    return r.ok
  } catch {
    return false   // 이미 우리 쪽은 지운 뒤다
  }
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  // 이미 로그아웃된 사람이라도 쿠키는 확실히 지워서 돌려보낸다
  if (!me) {
    const r = json({ ok: true, unlinked: false })
    r.headers.set('set-cookie', setCookie(SESSION, '', 0))
    return r
  }

  const wait = tick(`w:${whoSent(ctx.request, me.uid)}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)

  await erase(ctx.env.DB, me.uid)

  const unlinked = await unlink(ctx.env, me.uid)

  const r = json({ ok: true, unlinked })
  r.headers.set('set-cookie', setCookie(SESSION, '', 0))
  return r
}
