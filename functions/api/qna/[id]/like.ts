/**
 * 추천(나도 같은 문제를 겪는 중). 누르면 답이 달릴 때 같이 알림을 받는다.
 * 한 번 더 누르면 취소다. 내 글에는 누를 일이 없다(원래 알림을 받는다).
 */
import { type Ctx, json } from '../../_lib'
import { canSee, loadPost } from '../../_qna'
import { LIMIT, tick, tooMany } from '../../_rate'
import { viewer } from '../../_viewer'

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  const db = ctx.env.DB
  const p = await loadPost(db, ctx.params.id)
  if (!p || !canSee(p, v)) return json({ error: '없는 글이에요' }, 404)
  if (p.uid === v.uid) return json({ error: '내 글에는 누를 수 없어요' }, 400)

  const had = await db.prepare('SELECT 1 AS y FROM follow WHERE post_id = ? AND uid = ?').bind(p.id, v.uid).first()
  await db.batch([
    had
      ? db.prepare('DELETE FROM follow WHERE post_id = ? AND uid = ?').bind(p.id, v.uid)
      : db.prepare('INSERT OR IGNORE INTO follow (post_id, uid, created_at) VALUES (?, ?, ?)').bind(p.id, v.uid, Date.now()),
    db.prepare('UPDATE post SET likes = (SELECT COUNT(*) FROM follow WHERE post_id = ?1) WHERE id = ?1').bind(p.id),
  ])
  const n = await db.prepare('SELECT likes FROM post WHERE id = ?').bind(p.id).first<{ likes: number }>()
  return json({ liked: !had, likes: n?.likes ?? 0 })
}
