/**
 * 너무 자주 두드리는 것을 막는다.
 *
 * D1 무료 한도는 하루 쓰기 10만 건이다. 보통 쓰는 사람은 하루 두세 건이라
 * 천 명이 와도 2%밖에 안 쓴다. 그런데 계정 하나로 초당 스무 번씩 한 시간
 * 남짓 두드리면 그 하루치가 통째로 사라지고, 그날 다른 사람들의 저장이
 * 조용히 실패한다. 쓰는 양이 아니라 장난 한 번이 위험하다.
 *
 * 세는 것은 이 일꾼의 기억 안에서만 한다. 막자고 D1에 적으면 지키려던 것을
 * 스스로 까먹는 꼴이고, KV나 Durable Object는 따로 붙여야 한다.
 *
 * 그래서 이것은 완벽한 빗장이 아니다. 요청이 여러 일꾼에 흩어지면 각자
 * 따로 세므로, 작정하고 분산해 오면 곱절로 들어온다. 그래도 한 사람이 낼 수
 * 있는 양에 천장이 생기고, 실수로 도는 무한 루프 같은 것은 여기서 멎는다.
 */

interface Hit {
  /** 이 창에서 몇 번 왔는지 */
  n: number
  /** 이 창이 끝나는 시각 */
  until: number
}

const seen = new Map<string, Hit>()

/** 기억이 한없이 불어나지 않게, 지난 것을 치운다 */
function sweep(now: number) {
  for (const [k, h] of seen) if (h.until <= now) seen.delete(k)
  // 다 치웠는데도 많이 남아 있으면 오래된 쪽부터 버린다 (Map은 넣은 순서를 지킨다)
  if (seen.size > 20_000) {
    let over = seen.size - 20_000
    for (const k of seen.keys()) {
      seen.delete(k)
      if (--over <= 0) break
    }
  }
}

/**
 * 한 번 두드린 것으로 세고, 넘었으면 몇 초 뒤에 오라고 알려 준다.
 * 괜찮으면 0.
 */
export function tick(key: string, limit: number, windowMs: number): number {
  const now = Date.now()
  let h = seen.get(key)
  if (!h || h.until <= now) {
    h = { n: 0, until: now + windowMs }
    seen.set(key, h)
  }
  h.n++
  if (seen.size > 10_000) sweep(now)
  return h.n <= limit ? 0 : Math.ceil((h.until - now) / 1000)
}

/** 누가 보냈는지. 로그인했으면 그 사람, 아니면 어디서 왔는지로 센다 */
export function whoSent(request: Request, uid?: string): string {
  return uid ?? `ip:${request.headers.get('cf-connecting-ip') ?? 'unknown'}`
}

export const LIMIT = {
  /** 저장·이름 바꾸기·탈퇴. 보통은 앱을 열 때 한 번이다 */
  write: { n: 40, ms: 10 * 60_000 },
  /** 내려받기. 앱을 열 때 두 번씩 부른다 */
  read: { n: 150, ms: 10 * 60_000 },
  /*
   * 로그인 시작. 카카오로 보내기 전이라 아직 누구인지 몰라서 주소로 센다.
   * 이 길은 D1을 건드리지 않으므로 아낄 것이 없고, PC방처럼 여럿이 한 주소를
   * 같이 쓰는 곳이 이 앱의 주 무대다. 막는 것보다 안 막는 쪽으로 넉넉히 둔다.
   */
  login: { n: 30, ms: 10 * 60_000 },
}

/** 너무 잦으면 이 답을 돌려준다. 몇 초 뒤에 오면 되는지 함께 적는다 */
export function tooMany(after: number): Response {
  return new Response(JSON.stringify({ error: '잠시 뒤에 다시 시도해 주세요' }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'retry-after': String(after),
    },
  })
}
