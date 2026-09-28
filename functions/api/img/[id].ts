/**
 * 그림 보기. 붙은 글을 볼 수 있는 사람만 본다.
 * 아직 글에 안 붙은 것은 올린 사람만 본다.
 */
import { type Ctx, json } from '../_lib'
import { canSee } from '../_qna'
import { LIMIT, tick, tooMany, whoSent } from '../_rate'
import { viewer } from '../_viewer'

interface Img { uid: string; mime: string; data: ArrayBuffer | number[]; post_id: number | null; owner: string | null; secret: number | null }

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  const wait = tick(`q:${whoSent(ctx.request, v?.uid)}`, LIMIT.board.n, LIMIT.board.ms)
  if (wait) return tooMany(wait)
  const img = await ctx.env.DB.prepare('SELECT i.uid, i.mime, i.data, i.post_id, p.uid AS owner, p.secret FROM image i '
    + 'LEFT JOIN post p ON p.id = i.post_id WHERE i.id = ?')
    .bind(ctx.params.id).first<Img>()
  const ok = img && (img.post_id == null
    ? v?.uid === img.uid
    : img.owner != null && canSee({ uid: img.owner, secret: img.secret ?? 0 }, v))
  if (!img || !ok) return json({ error: '없는 그림이에요' }, 404)

  return new Response(new Uint8Array(img.data as ArrayBuffer), {
    headers: {
      'content-type': img.mime,
      'x-content-type-options': 'nosniff',
      // 공개 글의 그림은 바뀔 일이 없다. 비공개는 이 사람 브라우저에만 잠깐 둔다
      'cache-control': img.post_id != null && !img.secret ? 'public, max-age=86400' : 'private, max-age=3600',
    },
  })
}
