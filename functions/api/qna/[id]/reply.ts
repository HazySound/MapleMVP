/**
 * 답글. 쓴 사람과 관리자만 단다.
 *
 * 관리자가 달면 '답변 완료'로 바꾸고, 쓴 사람과 추천한 사람에게 알린다.
 * 쓴 사람이 덧붙이면(캡처를 더 올리는 등) 관리자에게 알린다.
 */
import { type Ctx, json } from '../../_lib'
import { MAX_BODY, admins, attach, canSee, clean, isOwner, loadPost, notify, watchers } from '../../_qna'
import { LIMIT, tick, tooMany } from '../../_rate'
import { viewer } from '../../_viewer'

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`p:${v.uid}`, LIMIT.post.n, LIMIT.post.ms)
  if (wait) return tooMany(wait)
  const db = ctx.env.DB
  const p = await loadPost(db, ctx.params.id)
  if (!p || !canSee(p, v)) return json({ error: '없는 글이에요' }, 404)
  if (!isOwner(p, v)) return json({ error: '쓴 사람과 관리자만 답글을 달 수 있어요' }, 403)
  if (p.status === 'done') return json({ error: '해결된 문의에는 더 쓸 수 없어요' }, 409)

  let b: { body?: unknown; images?: unknown }
  try { b = await ctx.request.json() } catch { return json({ error: '읽을 수 없는 형식이에요' }, 400) }
  const body = clean(b.body, MAX_BODY)
  if (!body) return json({ error: '내용을 적어 주세요' }, 400)

  const now = Date.now()
  const r = await db.prepare('INSERT INTO reply (post_id, uid, body, created_at) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(p.id, v.uid, body, now).first<{ id: number }>()
  await attach(db, v.uid, b.images, p.id, r!.id)

  // 관리자가 자기 글(공지)에 덧붙인 것은 답변이 아니다
  const answer = v.admin && v.uid !== p.uid
  await db.prepare('UPDATE post SET replies = replies + 1, updated_at = ?'
    + (answer && p.status === 'open' ? ", status = 'answered'" : '') + ' WHERE id = ?')
    .bind(now, p.id).run()
  if (answer) await notify(db, await watchers(db, p, v.uid), p.id, 'answer')
  else if (v.uid === p.uid) await notify(db, (await admins(db)).filter(u => u !== v.uid), p.id, 'more')
  return json({ id: r!.id })
}

/** 내가 단 답글을 지운다. 관리자는 아무 답글이나 */
export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${v.uid}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  const db = ctx.env.DB
  const pid = Number(ctx.params.id)
  const rid = Number(new URL(ctx.request.url).searchParams.get('rid'))
  const r = await db.prepare('SELECT uid FROM reply WHERE id = ? AND post_id = ?').bind(rid, pid).first<{ uid: string }>()
  if (!r) return json({ error: '없는 답글이에요' }, 404)
  if (!v.admin && r.uid !== v.uid) return json({ error: '쓴 사람만 지울 수 있어요' }, 403)
  await db.batch([
    db.prepare('DELETE FROM image WHERE reply_id = ?').bind(rid),
    db.prepare('DELETE FROM reply WHERE id = ?').bind(rid),
    db.prepare('UPDATE post SET replies = (SELECT COUNT(*) FROM reply WHERE post_id = ?1) WHERE id = ?1').bind(pid),
  ])
  return json({ ok: true })
}
