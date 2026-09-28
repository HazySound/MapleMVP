/**
 * 진단 기록. 지금은 가져오기(북마클릿) 한 번마다 하나씩 온다.
 *
 * 넥슨쇼핑 수집은 실제 내역으로 확인하지 못한 채 붙였다. 이용자 쪽에서 안 되면
 * 운영자가 D1에서 이 사람 기록을 꺼내 무엇이 막혔는지 본다.
 *   npx wrangler d1 execute maplemvp --remote --json --command
 *     "SELECT at, body FROM applog WHERE uid = '...' ORDER BY id DESC LIMIT 5"
 *
 * 한 사람당 최근 20개만 둔다. 로그인 토큰 같은 비밀값은 북마클릿이 애초에 넣지 않는다.
 */
import { type Ctx, ensure, json, who } from './_lib'
import { LIMIT, tick, tooMany } from './_rate'

/** 5년 치 월별 기록이 들어온다. 넉넉히 두되 끝없이 받지는 않는다 */
const MAX = 300_000
const KEEP = 20

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await who(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  const body = await ctx.request.text()
  if (body.length > MAX) return json({ error: '내용이 너무 커요' }, 413)
  let kind = 'import'
  try { kind = String((JSON.parse(body) as { kind?: unknown }).kind ?? 'import').slice(0, 20) } catch {
    return json({ error: '읽을 수 없는 형식이에요' }, 400)
  }
  const db = ctx.env.DB
  await ensure(db)
  await db.batch([
    db.prepare('INSERT INTO applog (uid, kind, body, at) VALUES (?, ?, ?, ?)').bind(v.uid, kind, body, Date.now()),
    db.prepare('DELETE FROM applog WHERE uid = ?1 AND id NOT IN (SELECT id FROM applog WHERE uid = ?1 ORDER BY id DESC LIMIT ?2)')
      .bind(v.uid, KEEP),
  ])
  return json({ ok: true })
}
