/**
 * 지금 누구인지, 그리고 이름 정하기.
 *
 * 이름은 카카오에서 받지 않는다. 이용자가 여기서 직접 정한다.
 * 받는 개인정보가 줄고, 카카오 쪽 동의항목도 건드릴 필요가 없다.
 */
import { type Ctx, ensure, json, nickOf, who } from './_lib'

/** 이름 길이. 너무 길면 화면이 밀린다 */
const MAX = 12

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json(null)
  await ensure(ctx.env.DB)
  return json({ id: me.uid, nick: await nickOf(ctx.env.DB, me.uid) })
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json({ error: '로그인이 필요해요' }, 401)

  let nick = ''
  try {
    const body = (await ctx.request.json()) as { nick?: unknown }
    nick = String(body.nick ?? '')
  } catch {
    return json({ error: '읽을 수 없는 형식이에요' }, 400)
  }
  // 눈에 안 보이는 문자로 빈 이름을 만들 수 있다
  nick = nick.replace(/[\u0000-\u001f\u007f​-‏⁠﻿]/g, '').trim().slice(0, MAX)

  await ensure(ctx.env.DB)
  await ctx.env.DB
    .prepare('INSERT INTO member (uid, nick, joined_at) VALUES (?, ?, ?) '
      + 'ON CONFLICT(uid) DO UPDATE SET nick = excluded.nick')
    .bind(me.uid, nick, Date.now()).run()

  return json({ id: me.uid, nick })
}
