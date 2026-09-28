/**
 * 문의 글 하나: 읽기, 해결됨으로 바꾸기(쓴 사람), 지우기(쓴 사람·관리자).
 *
 * 볼 수 없는 글은 '없는 글'과 똑같이 답한다. 다르게 답하면 비공개 글이
 * 몇 번에 있는지 두드려 볼 수 있다.
 */
import { type Ctx, json } from '../_lib'
import {
  admins, canSee, dropPosts, imagesOf, isOwner, listItem, loadPost, notify, watchers,
} from '../_qna'
import { LIMIT, tick, tooMany, whoSent } from '../_rate'
import { viewer } from '../_viewer'

const gone = () => json({ error: '없는 글이에요' }, 404)

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  const wait = tick(`q:${whoSent(ctx.request, v?.uid)}`, LIMIT.board.n, LIMIT.board.ms)
  if (wait) return tooMany(wait)
  const p = await loadPost(ctx.env.DB, ctx.params.id)
  if (!p || !canSee(p, v)) return gone()

  const db = ctx.env.DB
  const [replies, images, liked] = await Promise.all([
    db.prepare('SELECT r.id, r.uid, r.body, r.created_at, m.nick, m.admin FROM reply r '
      + 'LEFT JOIN member m ON m.uid = r.uid WHERE r.post_id = ? ORDER BY r.id')
      .bind(p.id).all<{ id: number; uid: string; body: string; created_at: number; nick: string | null; admin: number | null }>(),
    imagesOf(db, p.id),
    v ? db.prepare('SELECT 1 AS y FROM follow WHERE post_id = ? AND uid = ?').bind(p.id, v.uid).first() : null,
  ])
  const own = isOwner(p, v)
  const pics = (rid: number | null) => images.filter(i => i.reply_id === rid).map(i => ({ id: i.id, w: i.w, h: i.h }))

  return json({
    ...listItem(p, v),
    body: p.body,
    images: pics(null),
    diag: own && p.diag ? JSON.parse(p.diag) : null,
    liked: !!liked,
    // 해결된 글은 굳힌다. 더 쓰려면 새 문의로
    canReply: own && p.status !== 'done',
    // 답을 받은 뒤에 쓴 사람만 해결됐다고 알릴 수 있다
    canSolve: !!v && v.uid === p.uid && p.status === 'answered',
    replies: replies.results.map(r => ({
      id: r.id, body: r.body, at: r.created_at,
      nick: r.nick || '떠난 사람', admin: !!r.admin,
      mine: !!v && v.uid === r.uid,
      images: pics(r.id),
    })),
  })
}

/**
 * 쓴 사람이 '해결됐어요'를 누른다. 답변이 달린 뒤에만 된다.
 * 관리자와 추천한 사람에게 알리고, 그 뒤로는 답글을 받지 않는다.
 */
export async function onRequestPatch(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  const p = await loadPost(ctx.env.DB, ctx.params.id)
  if (!p || !canSee(p, v)) return gone()
  if (p.uid !== v.uid) return json({ error: '쓴 사람만 해결됨으로 바꿀 수 있어요' }, 403)
  let b: { status?: unknown }
  try { b = await ctx.request.json() } catch { return json({ error: '읽을 수 없는 형식이에요' }, 400) }
  if (b.status !== 'done') return json({ error: '없는 상태예요' }, 400)
  if (p.status === 'done') return json({ status: 'done' })
  if (p.status !== 'answered') return json({ error: '답변이 등록된 뒤에 해결됨으로 바꿀 수 있어요' }, 400)

  const db = ctx.env.DB
  await db.prepare("UPDATE post SET status = 'done', updated_at = ? WHERE id = ?").bind(Date.now(), p.id).run()
  await notify(db, [...await admins(db), ...await watchers(db, p, v.uid)].filter(u => u !== v.uid), p.id, 'done')
  return json({ status: 'done' })
}

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  const p = await loadPost(ctx.env.DB, ctx.params.id)
  if (!p || !canSee(p, v)) return gone()
  if (!isOwner(p, v)) return json({ error: '쓴 사람만 지울 수 있어요' }, 403)
  await dropPosts(ctx.env.DB, [p.id])
  return json({ ok: true })
}
