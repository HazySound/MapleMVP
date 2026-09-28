/**
 * 그림 올리기. 글을 쓰기 전에 한 장씩 먼저 올린다.
 *
 * 글과 한꺼번에 받으면 요청 하나가 수 MB가 되고, 그걸 나눠 읽는 데 일꾼의
 * 짧은 계산 시간을 다 쓴다. 한 장씩 받으면 받은 그대로 담기만 하면 된다.
 *
 * 크기 줄이기와 형식 바꾸기는 브라우저가 이미 했다. 여기서는 형식과 크기만 본다.
 * SVG처럼 스크립트를 품을 수 있는 것은 받지 않는다.
 */
import { type Ctx, json } from '../_lib'
import { MAX_IMAGE } from '../_qna'
import { LIMIT, tick, tooMany } from '../_rate'
import { viewer } from '../_viewer'

const TYPES = ['image/png', 'image/jpeg', 'image/webp']
/** 한 사람이 글에 안 붙이고 쌓아 둘 수 있는 수 */
const LOOSE = 20

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`i:${v.uid}`, LIMIT.image.n, LIMIT.image.ms)
  if (wait) return tooMany(wait)

  const mime = (ctx.request.headers.get('content-type') ?? '').split(';')[0].trim()
  if (!TYPES.includes(mime)) return json({ error: 'PNG, JPG, WEBP만 올릴 수 있어요' }, 415)
  if (Number(ctx.request.headers.get('content-length') ?? 0) > MAX_IMAGE) return json({ error: '그림이 너무 커요' }, 413)
  const data = await ctx.request.arrayBuffer()
  if (!data.byteLength || data.byteLength > MAX_IMAGE) return json({ error: '그림이 너무 커요' }, 413)

  const q = new URL(ctx.request.url).searchParams
  const w = Math.max(1, Math.min(20_000, Math.round(Number(q.get('w')) || 1)))
  const h = Math.max(1, Math.min(20_000, Math.round(Number(q.get('h')) || 1)))

  const db = ctx.env.DB
  // 하루 넘게 글에 안 붙은 것은 버려진 것이다. 올릴 때마다 조금씩 치운다
  await db.prepare('DELETE FROM image WHERE post_id IS NULL AND created_at < ?').bind(Date.now() - 864e5).run()
  const loose = await db.prepare('SELECT COUNT(*) AS n FROM image WHERE uid = ? AND post_id IS NULL')
    .bind(v.uid).first<{ n: number }>()
  if ((loose?.n ?? 0) >= LOOSE) return json({ error: '올려 둔 그림이 너무 많아요. 글을 먼저 올려 주세요' }, 429)

  const id = crypto.randomUUID().replace(/-/g, '')
  await db.prepare('INSERT INTO image (id, uid, mime, w, h, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, v.uid, mime, w, h, data, Date.now()).run()
  return json({ id, w, h })
}
