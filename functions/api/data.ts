/**
 * 계정에 묶어 두는 것: 구매내역과 PC방 보정값.
 *
 * 한 사람당 한 줄이다. 덮어쓰기만 하고 이력을 쌓지 않는다.
 * 합치는 규칙(같은 결제를 두 번 세지 않기)은 브라우저 쪽에 이미 있으므로
 * 여기서는 받은 것을 그대로 둔다.
 */
import { type Ctx, ensure, json, who } from './_lib'
import { LIMIT, tick, tooMany, whoSent } from './_rate'

/** 너무 큰 것은 받지 않는다. 24개월치라도 이보다 한참 작다 */
const MAX_BODY = 2_000_000

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`r:${whoSent(ctx.request, me.uid)}`, LIMIT.read.n, LIMIT.read.ms)
  if (wait) return tooMany(wait)
  await ensure(ctx.env.DB)

  const row = await ctx.env.DB
    .prepare('SELECT rows, pcroom, pcroom_at, synced_at FROM vault WHERE uid = ?')
    .bind(me.uid)
    .first<{ rows: string; pcroom: string; pcroom_at: string | null; synced_at: string | null }>()
  if (!row) return json({ rows: [], pcroom: {}, pcroomAt: {}, syncedAt: null })

  return json({
    rows: JSON.parse(row.rows),
    pcroom: JSON.parse(row.pcroom),
    // 이 열이 생기기 전에 올린 것은 비어 있다. 그때는 시각을 모르는 값으로 친다
    pcroomAt: row.pcroom_at ? JSON.parse(row.pcroom_at) : {},
    syncedAt: row.synced_at,
  })
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json({ error: '로그인이 필요해요' }, 401)
  // 읽기 전에 센다. 본문을 받아 놓고 버리면 그만큼 일을 한 뒤에 막는 셈이다
  const wait = tick(`w:${whoSent(ctx.request, me.uid)}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)

  const body = await ctx.request.text()
  if (body.length > MAX_BODY) return json({ error: '내용이 너무 커요' }, 413)

  let data: { rows?: unknown; pcroom?: unknown; pcroomAt?: unknown; syncedAt?: unknown }
  try {
    data = JSON.parse(body)
  } catch {
    return json({ error: '읽을 수 없는 형식이에요' }, 400)
  }
  if (!Array.isArray(data.rows)) return json({ error: '구매내역이 없어요' }, 400)

  await ensure(ctx.env.DB)
  await ctx.env.DB
    .prepare('INSERT INTO vault (uid, rows, pcroom, pcroom_at, synced_at, saved_at) '
      + 'VALUES (?, ?, ?, ?, ?, ?) '
      + 'ON CONFLICT(uid) DO UPDATE SET rows = excluded.rows, pcroom = excluded.pcroom, '
      + 'pcroom_at = excluded.pcroom_at, synced_at = excluded.synced_at, saved_at = excluded.saved_at')
    .bind(me.uid, JSON.stringify(data.rows), JSON.stringify(data.pcroom ?? {}),
          JSON.stringify(data.pcroomAt ?? {}),
          typeof data.syncedAt === 'string' ? data.syncedAt : null, Date.now())
    .run()

  return json({ ok: true })
}

/** 계정에 저장된 것을 지운다. 로그인은 그대로 둔다 */
export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const me = await who(ctx)
  if (!me) return json({ error: '로그인이 필요해요' }, 401)
  const wait = tick(`w:${whoSent(ctx.request, me.uid)}`, LIMIT.write.n, LIMIT.write.ms)
  if (wait) return tooMany(wait)
  await ensure(ctx.env.DB)
  await ctx.env.DB.prepare('DELETE FROM vault WHERE uid = ?').bind(me.uid).run()
  return json({ ok: true })
}
