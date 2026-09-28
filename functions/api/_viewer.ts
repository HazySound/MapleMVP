/**
 * 게시판에서 지금 보고 있는 사람. 로그인 안 했으면 null.
 * 관리자인지는 쿠키가 아니라 D1에 적힌 것으로만 정한다.
 */
import { type Ctx, ensure, nickOf, who } from './_lib'
import type { Viewer } from './_qna'

export async function viewer(ctx: Ctx): Promise<(Viewer & { nick: string }) | null> {
  await ensure(ctx.env.DB)
  const me = await who(ctx)
  if (!me) return null
  const m = await nickOf(ctx.env.DB, me.uid)
  return { uid: me.uid, admin: m.admin, nick: m.nick }
}
