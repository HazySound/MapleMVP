/**
 * 지금 누구인지, 그리고 이름 정하기.
 *
 * 이름은 카카오에서 받지 않는다. 이용자가 여기서 직접 정한다.
 * 같은 이름을 여럿이 써도 되게 두되, 몇 번째인지를 함께 적어 둔다.
 * 이름이 남에게 보이게 되는 날 '#2'로 구분하려면 그때는 순서를 알 길이 없다.
 */
import { type Ctx, ensure, json, nickOf, who } from './_lib'
import { whyBad } from './_nick'
import { LIMIT, tick, tooMany, whoSent } from './_rate'

/** 이름 길이. 화면(web/nick.ts)과 같아야 한다.
    '한가하게 차를 마시는 아테나 파이틴'이 19자라 그보다 넉넉해야 한다 */
const MAX = 20

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json(null)
  const wait = tick(`r:${whoSent(ctx.request, me.uid)}`, LIMIT.read.n, LIMIT.read.ms)
  if (wait) return tooMany(wait)
  await ensure(ctx.env.DB)
  const m = await nickOf(ctx.env.DB, me.uid)
  return json({ id: me.uid, nick: m.nick, tag: m.tag })
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${whoSent(ctx.request, me.uid)}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)

  let nick = ''
  try {
    const body = (await ctx.request.json()) as { nick?: unknown }
    nick = String(body.nick ?? '')
  } catch {
    return json({ error: '읽을 수 없는 형식이에요' }, 400)
  }
  // 눈에 안 보이는 문자로 빈 이름을 만들 수 있다
  nick = nick.replace(/[\u0000-\u001f\u007f​-‏⁠﻿]/g, '').trim().slice(0, MAX)
  // 빈 이름은 '아직 안 정한 사람'이라는 표시로 쓴다. 되돌릴 수 있으면 그 뜻이 흐려진다
  if (!nick) return json({ error: '이름을 적어 주세요' }, 400)

  const bad = whyBad(nick)
  if (bad) return json({ error: bad }, 400)

  await ensure(ctx.env.DB)
  const now = await nickOf(ctx.env.DB, me.uid)
  if (now.nick === nick) return json({ id: me.uid, nick, tag: now.tag })

  // 번호는 한 문장 안에서 매긴다. 읽고 나서 쓰면 그 사이에 끼어들 수 있다
  await ctx.env.DB
    .prepare('INSERT INTO member (uid, nick, tag, joined_at) '
      + 'VALUES (?1, ?2, (SELECT COALESCE(MAX(tag), 0) + 1 FROM member WHERE nick = ?2), ?3) '
      + 'ON CONFLICT(uid) DO UPDATE SET nick = ?2, '
      + 'tag = (SELECT COALESCE(MAX(tag), 0) + 1 FROM member WHERE nick = ?2)')
    .bind(me.uid, nick, Date.now()).run()

  const after = await nickOf(ctx.env.DB, me.uid)
  return json({ id: me.uid, nick: after.nick, tag: after.tag })
}
