/**
 * 문의 게시판의 표와 규칙.
 *
 * 누가 무엇을 볼 수 있는지는 여기 한 군데서 정한다. 목록·글·그림이 따로 정하면
 * 한쪽만 고쳐져서 비공개 글이 다른 길로 새어 나간다.
 *
 *  - 공개 글: 누구나(로그인 안 해도) 본다
 *  - 비공개 글: 쓴 사람과 관리자만 본다. 목록에도 안 나온다
 *  - 답글: 쓴 사람과 관리자만 단다. 다른 사람은 추천(같은 문제 겪는 중)만 누른다
 *  - 해결됨: 쓴 사람이 답을 받고 직접 누른다. 그 뒤로는 아무도 더 쓰지 못한다
 *  - 진단 정보(사이트가 계산한 등급·주별 금액): 공개 글이어도 쓴 사람과 관리자만 본다
 */

export const KINDS = ['bug', 'idea', 'howto', 'notice'] as const
export type Kind = typeof KINDS[number]
/** 버그 중에서도 인게임 캡처가 꼭 있어야 하는 것 */
export const TOPICS = ['tier', 'pcroom', 'etc'] as const
export const NEED_SHOT = ['tier', 'pcroom']

export const MAX_TITLE = 80
export const MAX_BODY = 5000
export const MAX_DIAG = 20_000
/** 글 하나에 붙이는 그림 수 */
export const MAX_IMAGES = 6
/** D1 한 줄은 2MB까지다. 여유를 둔다 */
export const MAX_IMAGE = 1_900_000

let ready = false

/** 표가 없으면 만든다. _lib의 ensure가 부른다 */
export async function buildQna(db: D1Database) {
  if (ready) return
  await db.exec(
    'CREATE TABLE IF NOT EXISTS post (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'uid TEXT NOT NULL, ' +
    'kind TEXT NOT NULL, ' +
    "topic TEXT NOT NULL DEFAULT '', " +
    'title TEXT NOT NULL, ' +
    'body TEXT NOT NULL, ' +
    'diag TEXT, ' +
    'secret INTEGER NOT NULL DEFAULT 0, ' +
    "status TEXT NOT NULL DEFAULT 'open', " +
    'likes INTEGER NOT NULL DEFAULT 0, ' +
    'replies INTEGER NOT NULL DEFAULT 0, ' +
    'created_at INTEGER NOT NULL, ' +
    'updated_at INTEGER NOT NULL)')
  await db.exec('CREATE INDEX IF NOT EXISTS post_uid ON post (uid)')
  await db.exec(
    'CREATE TABLE IF NOT EXISTS reply (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'post_id INTEGER NOT NULL, ' +
    'uid TEXT NOT NULL, ' +
    'body TEXT NOT NULL, ' +
    'created_at INTEGER NOT NULL)')
  await db.exec('CREATE INDEX IF NOT EXISTS reply_post ON reply (post_id)')
  // 추천. 누른 사람은 답이 달리면 같이 알림을 받는다
  await db.exec(
    'CREATE TABLE IF NOT EXISTS follow (' +
    'post_id INTEGER NOT NULL, ' +
    'uid TEXT NOT NULL, ' +
    'created_at INTEGER NOT NULL, ' +
    'PRIMARY KEY (post_id, uid))')
  await db.exec(
    'CREATE TABLE IF NOT EXISTS note (' +
    'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
    'uid TEXT NOT NULL, ' +
    'post_id INTEGER NOT NULL, ' +
    'kind TEXT NOT NULL, ' +
    'created_at INTEGER NOT NULL, ' +
    'seen INTEGER NOT NULL DEFAULT 0)')
  await db.exec('CREATE INDEX IF NOT EXISTS note_uid ON note (uid, id)')
  // 그림은 먼저 올리고(post_id 없음) 글을 쓸 때 붙인다. 안 붙고 남은 것은 하루 뒤 치운다
  await db.exec(
    'CREATE TABLE IF NOT EXISTS image (' +
    'id TEXT PRIMARY KEY, ' +
    'uid TEXT NOT NULL, ' +
    'post_id INTEGER, ' +
    'reply_id INTEGER, ' +
    'mime TEXT NOT NULL, ' +
    'w INTEGER NOT NULL, ' +
    'h INTEGER NOT NULL, ' +
    'data BLOB NOT NULL, ' +
    'created_at INTEGER NOT NULL)')
  await db.exec('CREATE INDEX IF NOT EXISTS image_post ON image (post_id)')
  ready = true
}

/** 눈에 안 보이는 문자를 걷어 내고 길이를 자른다. 줄바꿈은 남긴다 */
export function clean(s: unknown, max: number, lines = true): string {
  let t = String(s ?? '').replace(/\r\n?/g, '\n')
  t = t.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f​-‏⁠﻿]/g
                      : /[\u0000-\u001f\u007f​-‏⁠﻿]/g, '')
  // 빈 줄을 끝없이 쌓아 목록을 밀어내는 것을 막는다
  if (lines) t = t.replace(/\n{4,}/g, '\n\n\n')
  return t.trim().slice(0, max)
}

export interface PostRow {
  id: number; uid: string; kind: Kind; topic: string; title: string; body: string
  diag: string | null; secret: number; status: string; likes: number; replies: number
  created_at: number; updated_at: number
  nick: string | null; admin: number | null; pics: number
}

/** 글과 쓴 사람 이름을 함께 가져온다 */
export const POST_SQL =
  'SELECT p.*, m.nick AS nick, m.admin AS admin, '
  + '(SELECT COUNT(*) FROM image i WHERE i.post_id = p.id AND i.reply_id IS NULL) AS pics '
  + 'FROM post p LEFT JOIN member m ON m.uid = p.uid'

export interface Viewer { uid: string; admin: boolean }

export function canSee(p: { uid: string; secret: number }, v: Viewer | null): boolean {
  return !p.secret || (!!v && (v.admin || v.uid === p.uid))
}

/** 쓴 사람과 관리자만 할 수 있는 일(답글, 진단 정보 보기, 지우기) */
export function isOwner(p: { uid: string }, v: Viewer | null): boolean {
  return !!v && (v.admin || v.uid === p.uid)
}

/** 화면에 내보낼 모양. 회원번호는 내보내지 않는다 */
export function listItem(p: PostRow, v: Viewer | null) {
  return {
    id: p.id, kind: p.kind, topic: p.topic, title: p.title,
    secret: !!p.secret, status: p.status, likes: p.likes, replies: p.replies,
    at: p.created_at, nick: p.nick || '떠난 사람', admin: !!p.admin,
    mine: !!v && v.uid === p.uid,
    pics: p.pics > 0,
  }
}

/**
 * 알림을 남긴다. 한 사람이 같은 글로 읽지 않은 알림을 여럿 받지 않게,
 * 같은 글의 읽지 않은 것은 새것 하나로 바꾼다.
 */
export async function notify(db: D1Database, uids: string[], postId: number, kind: string) {
  const to = [...new Set(uids)]
  if (!to.length) return
  const now = Date.now()
  await db.batch(to.flatMap(uid => [
    db.prepare('DELETE FROM note WHERE uid = ? AND post_id = ? AND seen = 0').bind(uid, postId),
    db.prepare('INSERT INTO note (uid, post_id, kind, created_at) VALUES (?, ?, ?, ?)').bind(uid, postId, kind, now),
  ]))
}

export async function admins(db: D1Database): Promise<string[]> {
  const r = await db.prepare('SELECT uid FROM member WHERE admin = 1').all<{ uid: string }>()
  return r.results.map(x => x.uid)
}

/** 글을 지운다. 답글·그림·추천·알림까지 같이 */
export async function dropPosts(db: D1Database, ids: number[]) {
  if (!ids.length) return
  await db.batch(ids.flatMap(id => [
    db.prepare('DELETE FROM reply WHERE post_id = ?').bind(id),
    db.prepare('DELETE FROM image WHERE post_id = ?').bind(id),
    db.prepare('DELETE FROM follow WHERE post_id = ?').bind(id),
    db.prepare('DELETE FROM note WHERE post_id = ?').bind(id),
    db.prepare('DELETE FROM post WHERE id = ?').bind(id),
  ]))
}

/**
 * 올려 두고 글에 안 붙인 그림을 이 글(또는 답글)에 붙인다.
 * 남의 그림이나 이미 붙은 그림은 건드리지 않는다.
 */
export async function attach(db: D1Database, uid: string, ids: unknown, postId: number, replyId: number | null) {
  const list = Array.isArray(ids) ? ids.filter(x => typeof x === 'string').slice(0, MAX_IMAGES) as string[] : []
  if (!list.length) return
  await db.batch(list.map(id =>
    db.prepare('UPDATE image SET post_id = ?, reply_id = ? WHERE id = ? AND uid = ? AND post_id IS NULL')
      .bind(postId, replyId, id, uid)))
}

/** 이 글에 붙은 그림들. 데이터는 빼고 크기만 */
export async function imagesOf(db: D1Database, postId: number) {
  const r = await db.prepare('SELECT id, reply_id, w, h FROM image WHERE post_id = ? ORDER BY created_at')
    .bind(postId).all<{ id: string; reply_id: number | null; w: number; h: number }>()
  return r.results
}

export async function loadPost(db: D1Database, raw: string | undefined) {
  const id = Number(raw)
  if (!Number.isInteger(id) || id <= 0) return null
  return db.prepare(`${POST_SQL} WHERE p.id = ?`).bind(id).first<PostRow>()
}

/** 답이 달리거나 해결됐을 때 알릴 사람: 쓴 사람과 추천한 사람. 한 사람은 뺀다 */
export async function watchers(db: D1Database, p: PostRow, except: string): Promise<string[]> {
  const f = await db.prepare('SELECT uid FROM follow WHERE post_id = ?').bind(p.id).all<{ uid: string }>()
  return [p.uid, ...f.results.map(x => x.uid)].filter(u => u !== except)
}
