/**
 * 문의 목록과 새 문의.
 *
 * 목록은 20개씩 끊어서, 마지막으로 받은 글 번호보다 앞의 것을 이어 받는다.
 * 쪽 번호로 끊으면 그 사이에 새 글이 올라올 때 같은 글이 두 번 보인다.
 *
 * 공지는 목록에 섞지 않고 첫 장 맨 위에 늘 따로 얹는다. 종류로 거르든 내 문의만 보든,
 * 글이 몇 개 쌓이든 공지는 항상 맨 위에서 바로 읽을 수 있어야 한다.
 */
import { type Ctx, json } from '../_lib'
import {
  KINDS, MAX_BODY, MAX_DIAG, MAX_TITLE, NEED_SHOT, POST_SQL, type PostRow, TOPICS,
  admins, attach, clean, listItem, notify,
} from '../_qna'
import { LIMIT, tick, tooMany, whoSent } from '../_rate'
import { viewer } from '../_viewer'

const PAGE = 20

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  const wait = tick(`q:${whoSent(ctx.request, v?.uid)}`, LIMIT.board.n, LIMIT.board.ms)
  if (wait) return tooMany(wait)

  const q = new URL(ctx.request.url).searchParams
  const kind = q.get('kind') ?? ''
  const mine = q.get('mine') === '1' && !!v
  const before = Number(q.get('before')) || 0

  const where: string[] = []
  const args: unknown[] = []
  where.push("p.kind <> 'notice'")
  if (kind !== 'notice' && (KINDS as readonly string[]).includes(kind)) { where.push('p.kind = ?'); args.push(kind) }
  // 비공개 글은 쓴 사람과 관리자에게만 목록에도 나온다
  if (!v) where.push('p.secret = 0')
  else if (!v.admin) { where.push('(p.secret = 0 OR p.uid = ?)'); args.push(v.uid) }
  if (mine) { where.push('p.uid = ?'); args.push(v!.uid) }
  if (before) { where.push('p.id < ?'); args.push(before) }

  const db = ctx.env.DB
  // 목록과 공지를 한 번에 묻는다. 따로 물으면 D1까지 두 번 오간다
  const [r, n] = await db.batch<PostRow>([
    db.prepare(`${POST_SQL} WHERE ${where.join(' AND ')} ORDER BY p.id DESC LIMIT ${PAGE + 1}`).bind(...args),
    ...(before ? [] : [db.prepare(`${POST_SQL} WHERE p.kind = 'notice' ORDER BY p.id DESC LIMIT 30`)]),
  ])
  const rows = r.results
  const pins = n ? n.results.map(p => listItem(p, v)) : []

  return json({
    pins,
    items: rows.slice(0, PAGE).map(p => listItem(p, v)),
    more: rows.length > PAGE,
  })
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const v = await viewer(ctx)
  if (!v) return json({ error: '로그인이 필요해요' }, 401)
  if (!v.nick) return json({ error: '닉네임부터 정해 주세요' }, 400)
  const wait = tick(`p:${v.uid}`, LIMIT.post.n, LIMIT.post.ms)
  if (wait) return tooMany(wait)

  let b: Record<string, unknown>
  try { b = await ctx.request.json() } catch { return json({ error: '읽을 수 없는 형식이에요' }, 400) }

  const kind = String(b.kind ?? '')
  if (!(KINDS as readonly string[]).includes(kind)) return json({ error: '문의 종류를 골라 주세요' }, 400)
  if (kind === 'notice' && !v.admin) return json({ error: '공지는 관리자만 쓸 수 있어요' }, 403)
  const topic = kind === 'bug' ? String(b.topic ?? '') : ''
  if (kind === 'bug' && !(TOPICS as readonly string[]).includes(topic)) return json({ error: '어떤 문제인지 골라 주세요' }, 400)

  const title = clean(b.title, MAX_TITLE, false)
  const body = clean(b.body, MAX_BODY)
  if (!title) return json({ error: '제목을 적어 주세요' }, 400)
  if (!body) return json({ error: '내용을 적어 주세요' }, 400)
  // 진단 정보는 화면이 만든 JSON이다. 모양은 보지 않고 크기만 막는다
  const diag = b.diag && typeof b.diag === 'object' ? JSON.stringify(b.diag).slice(0, MAX_DIAG) : null
  // 공지는 누구나 봐야 한다
  const secret = kind !== 'notice' && b.secret ? 1 : 0

  const db = ctx.env.DB
  const images = Array.isArray(b.images) ? b.images.filter(x => typeof x === 'string') as string[] : []
  if (NEED_SHOT.includes(topic)) {
    // 붙일 수 있는(내가 올렸고 아직 안 붙은) 그림이 하나는 있어야 한다
    const ok = images.length
      ? await db.prepare(`SELECT COUNT(*) AS n FROM image WHERE uid = ? AND post_id IS NULL AND id IN (${images.map(() => '?').join(',')})`)
        .bind(v.uid, ...images).first<{ n: number }>()
      : { n: 0 }
    if (!ok?.n) return json({ error: '인게임 캡처를 한 장 이상 붙여 주세요' }, 400)
  }

  const now = Date.now()
  const r = await db.prepare('INSERT INTO post (uid, kind, topic, title, body, diag, secret, created_at, updated_at) '
    + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(v.uid, kind, topic, title, body, diag, secret, now, now).first<{ id: number }>()
  const id = r!.id
  await attach(db, v.uid, images, id, null)
  if (kind !== 'notice') await notify(db, (await admins(db)).filter(u => u !== v.uid), id, 'new')
  return json({ id })
}
