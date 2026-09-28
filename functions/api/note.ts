/**
 * 알림. 문의에 답이 달렸을 때(쓴 사람·추천한 사람), 새 문의가 왔을 때(관리자).
 *
 * 브라우저를 닫고 있으면 알릴 길이 없다. 들어왔을 때 오른쪽 위 종에 모아 보여 준다.
 * 화면은 보고 있는 동안 15초마다 개수만 묻는다(count=1). 목록은 종을 열 때만 받는다.
 * 개수와 함께 지금 쿠키가 누구인지도 돌려준다. 같은 브라우저의 다른 탭에서 다른 계정으로
 * 로그인하면 이 탭도 그 계정이 되는데, 화면의 이름표만 옛 사람으로 남아 있으면 안 된다.
 */
import { type Ctx, json } from './_lib'
import { LIMIT, tick, tooMany } from './_rate'
import { viewer } from './_viewer'

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`q:${v.uid}`, LIMIT.board.n, LIMIT.board.ms)
  if (wait) return tooMany(wait)
  const db = ctx.env.DB
  const unread = (await db.prepare('SELECT COUNT(*) AS n FROM note WHERE uid = ? AND seen = 0')
    .bind(v.uid).first<{ n: number }>())?.n ?? 0
  if (new URL(ctx.request.url).searchParams.get('count') === '1') return json({ unread, uid: v.uid })

  const r = await db.prepare('SELECT n.id, n.post_id, n.kind, n.created_at, n.seen, p.title '
    + 'FROM note n JOIN post p ON p.id = n.post_id WHERE n.uid = ? ORDER BY n.id DESC LIMIT 30')
    .bind(v.uid).all<{ id: number; post_id: number; kind: string; created_at: number; seen: number; title: string }>()
  return json({
    unread,
    items: r.results.map(n => ({ id: n.id, post: n.post_id, kind: n.kind, at: n.created_at, seen: !!n.seen, title: n.title })),
  })
}

/** 읽음으로. post가 있으면 그 글의 알림만, 없으면 모두 */
export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  let b: { post?: unknown } = {}
  try { b = await ctx.request.json() } catch { /* 모두 읽음 */ }
  const post = Number(b.post) || 0
  const db = ctx.env.DB
  await (post
    ? db.prepare('UPDATE note SET seen = 1 WHERE uid = ? AND post_id = ? AND seen = 0').bind(v.uid, post)
    : db.prepare('UPDATE note SET seen = 1 WHERE uid = ? AND seen = 0').bind(v.uid)).run()
  return json({ ok: true })
}
