/**
 * 넥슨쇼핑 쿠폰을 인게임이 센 주로 옮긴다.
 *
 * 게임은 쿠폰을 캐시샵에 '등록한' 주에 MVP 금액을 넣는데, 넥슨쇼핑 내역에는 '산' 날만 있다.
 * 산 주와 등록한 주가 다르면 그 주는 인게임보다 많아지고(수집 > 인게임), 등록한 주는 그만큼
 * 모자란다(설명 안 되는 차액). 날짜를 정확히 알 길은 없지만 합이 인게임과 같아지게 옮길 수는 있다.
 *
 * 쿠폰은 산 뒤에만 등록할 수 있으니 뒤쪽 주로만 옮긴다. 고르는 순서:
 *   1. 쿠폰 여러 장의 합이 뒤쪽 어느 주 차액과 딱 맞으면 그 주로
 *   2. 한 장 금액이 뒤쪽 어느 주 차액과 딱 맞으면 그 주로
 *   3. 차액이 그 쿠폰보다 크거나 같은 가장 가까운 뒤쪽 주로
 * 그래도 못 옮기면 그대로 둔다(화면에서 빨간 줄로 보이고, 그 금액 그대로 저장할 수 있다).
 */
import { weekStart } from './mvp'

export interface CouponRow { date: string; price: number; id?: string }

export const isCoupon = (r: { id?: string }) => !!r.id?.startsWith('shop:')

/** 한 번에 따져 볼 쿠폰 수. 조합을 다 세어 보므로 이보다 많으면 한 장씩만 본다 */
const MAX_SET = 12

/**
 * starts: 13주 시작일(오래된 주 → 이번 주)
 * nexon: 툴팁에서 되짚은 주별 금액. skip에 든 주는 모르는 주라 건드리지 않는다
 * 돌려주는 것: 옮길 쿠폰 id → 새 날짜(옮겨 갈 주의 시작일)
 */
export function placeCoupons(rows: CouponRow[], starts: string[], nexon: number[],
                             skip: number[] = []): Map<string, string> {
  const at = new Map(starts.map((s, i) => [s, i]))
  const collected = starts.map(() => 0)
  const coupons: { id: string; price: number; week: number }[] = []
  for (const r of rows) {
    const i = at.get(weekStart(r.date))
    if (i == null) continue
    collected[i] += r.price
    if (isCoupon(r) && r.id) coupons.push({ id: r.id, price: r.price, week: i })
  }
  const gap = nexon.map((v, i) => v - collected[i])
  const known = (i: number) => !skip.includes(i)
  const moves = new Map<string, string>()

  const move = (list: { id: string; price: number; week: number }[], to: number) => {
    for (const c of list) {
      gap[c.week] += c.price
      gap[to] -= c.price
      c.week = to
      moves.set(c.id, starts[to])
    }
  }

  for (let i = 0; i < starts.length; i++) {
    if (!known(i) || gap[i] >= 0) continue
    const later = (min: number) => starts.map((_, j) => j).filter(j => j > i && known(j) && gap[j] >= min)

    // 1. 여러 장의 합이 뒤쪽 주 차액과 딱 맞는 조합 (넘친 만큼은 덜어 내야 한다)
    const here = coupons.filter(c => c.week === i).sort((a, b) => b.price - a.price)
    if (here.length > 1 && here.length <= MAX_SET) {
      let done = false
      for (let mask = (1 << here.length) - 1; mask > 0 && !done; mask--) {
        const set = here.filter((_, k) => mask & (1 << k))
        const sum = set.reduce((s, c) => s + c.price, 0)
        if (sum < -gap[i]) continue
        const j = later(sum).find(j => gap[j] === sum)
        if (j != null) { move(set, j); done = true }
      }
      if (done) continue
    }

    // 2·3. 한 장씩: 딱 맞는 주가 있으면 거기, 없으면 들어갈 자리가 있는 가장 가까운 주
    for (const c of coupons.filter(c => c.week === i).sort((a, b) => b.price - a.price)) {
      if (gap[i] >= 0) break
      const room = later(c.price)
      const j = room.find(j => gap[j] === c.price) ?? room[0]
      if (j != null) move([c], j)
    }
  }
  return moves
}
