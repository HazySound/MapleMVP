/** 지금 누구인지. 로그인 전이면 빈 값을 돌려준다 (오류가 아니다) */
import { type Ctx, json, who } from './_lib'

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  return json(me ? { id: me.uid, nick: me.nick } : null)
}
