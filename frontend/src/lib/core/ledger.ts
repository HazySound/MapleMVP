/**
 * 한 주 결산: 그 주 구매내역을 용도(작용·선물식·메소마켓·회수 없음)로 나누고, 그 주 시세로 돌려받은 돈과 실제로 쓴 돈을 센다.
 * 구매내역에는 용도가 없어 이름으로 짐작하고, 사용자가 고친 값(tags)을 먼저 쓴다(2026-10-16 사용자).
 */
import { CREDIT_RATE, type Funding, type ShopItem } from './efficiency'
import type { Row } from './mvp'

/** sell: 경매장에 판다 · gift: 선물식 · mk: 메이플포인트로 메소마켓 · none: 회수 없음(구매용·남에게 선물) */
export type Use = 'sell' | 'gift' | 'mk' | 'none'
export const USES: [Use, string][] = [['sell', '작용(경매장)'], ['gift', '선물식'], ['mk', '메소마켓'], ['none', '회수 없음']]

/**
 * 넥슨캐시 구매번호의 앞 두 자리는 산 서버다. 사용자가 확인한 것만 넣는다(2026-10-16: 00 스카니아, 01 베라, 05 크로아).
 * 모르는 번호는 '서버 48'로 보여 주고 사용자가 붙인 이름을 쓴다
 */
export const SERVERS: Record<string, string> = { '00': '스카니아', '01': '베라', '05': '크로아' }

/**
 * 모르는 번호에 사용자가 고를 수 있는 서버(게임 서버 목록 순서, 2026-10-16 사용자 캡처) + 챌린저스 1–4.
 * 자유 입력이면 '챌섭', '챌린저스1'처럼 제각각이라 모아서 맞춰 보기 어렵다. 추정값은 넣지 않는다(사용자)
 */
export const SERVER_LIST = ['스카니아', '베라', '루나', '제니스', '크로아', '유니온', '엘리시움', '이노시스', '레드', '오로라', '아케인', '노바', '에오스', '핼리오스',
  '챌린저스1', '챌린저스2', '챌린저스3', '챌린저스4']

/** 넥슨캐시 구매번호(숫자 26자리)면 앞 두 자리. 넥슨쇼핑 쿠폰 등은 null */
export const serverOf = (id?: string) => id && /^\d{26}$/.test(id) ? id.slice(0, 2) : null

export const rowKey = (r: Row) => r.id ?? `${r.date}|${r.item}|${r.price}`

const norm = (s: string) => s.replace(/\s+/g, '')

/** 구매내역 이름·가격에 맞는 가격표 아이템(묶음은 가격으로 가른다) */
export function matchItem(r: Pick<Row, 'item' | 'price'>, items: Pick<ShopItem, 'id' | 'name' | 'cash'>[]) {
  const n = norm(r.item)
  return items.find(x => norm(x.name) === n && x.cash === r.price)
    ?? items.find(x => x.cash === r.price && (n.startsWith(norm(x.name)) || norm(x.name).startsWith(n)))
}

/** 처음 용도: 가격표에 있는 아이템은 작용, 엘릭서는 선물식(선물식 시세가 없으면 메소마켓), 나머지는 회수 없음 */
export function guessUse(r: Row, items: Pick<ShopItem, 'id' | 'name' | 'cash'>[], giftOn: boolean): Use {
  if (matchItem(r, items)) return 'sell'
  if (/엘릭서/.test(r.item)) return giftOn ? 'gift' : 'mk'
  return 'none'
}

/** 한 줄: 같은 이름·가격·서버·용도는 묶는다 */
export interface LedgerLine {
  key: string
  name: string
  price: number
  n: number
  cash: number
  server: string | null
  use: Use
  /** 작용이면 맞는 가격표 아이템 */
  itemId?: string
  rows: string[]
  /** 묶인 구매 건(펼쳐서 건마다 용도를 고른다: 같은 파워엘릭서도 일부는 선물식, 일부는 메포일 수 있다) */
  parts: { key: string; date: string; item: string; price: number; id?: string }[]
}

/**
 * '파워엘릭서 100개'처럼 이름 끝에 묶음 수가 붙은 상품을 이름과 개수로 나눈다. 없으면 1개.
 * 묶음 수만 다르고 개당 가격이 같은 것(파워엘릭서 10·100·1000개)은 한 줄로 합친다(2026-10-16 사용자)
 */
export function splitBundle(name: string, price: number) {
  const m = name.match(/^(.*?)\s*(\d+)개$/)
  const count = m ? Number(m[2]) : 1
  return { base: m ? m[1].trim() : name, count, unit: price / count }
}

export function groupRows(rows: Row[], tags: Record<string, Use>, items: Pick<ShopItem, 'id' | 'name' | 'cash'>[], giftOn: boolean): LedgerLine[] {
  const m = new Map<string, LedgerLine>()
  for (const r of rows) {
    const k = rowKey(r), server = serverOf(r.id), use = tags[k] ?? guessUse(r, items, giftOn)
    // 작용은 묶음마다 경매장 시세가 따로라(로얄스타일 쿠폰 1·10·20장) 합치지 않는다
    const b = use === 'sell' ? null : splitBundle(r.item, r.price)
    const g = b ? `${norm(b.base)}|${b.unit}|${server}|${use}` : `${r.item}|${r.price}|${server}|${use}`
    const x = m.get(g)
    const part = { key: k, date: r.date, item: r.item, price: r.price, ...(r.id ? { id: r.id } : {}) }
    if (x) { x.n += b?.count ?? 1; x.cash += r.price; x.rows.push(k); x.parts.push(part) }
    else m.set(g, { key: g, name: b?.base ?? r.item, price: b?.unit ?? r.price, n: b?.count ?? 1, cash: r.price, server, use, itemId: use === 'sell' ? matchItem(r, items)?.id : undefined, rows: [k], parts: [part] })
  }
  return [...m.values()].sort((a, b) => b.cash - a.cash)
}

/**
 * 그 주에 쓰던 시세. items의 price는 경매장 한 번 판매 가격(억), um은 엄 판매 수수료를 뺀 1억 메소당 원,
 * mk는 1억 메소당 메포, giftRate는 캐시 1원당 받는 현금, creditPer는 크레딧 1개의 값(원, 안 쓰면 0)
 */
export interface Prices {
  items: { id: string; name: string; set: number; cash: number; bundle?: boolean; price: number }[]
  um: number
  mk: number
  giftRate: number
  fee: number
  creditPer: number
}

export interface Settled {
  /** meso: 그 줄로 얻은 메소(억). 경매장은 수수료 뺀 것, 메소마켓은 메포 ÷ 시세. 선물식·회수 없음은 0 */
  /**
   * 메소마켓 줄: max는 그 메포로 살 수 있는 최대 메소(억), want는 사용자가 적은 산 메소(없으면 max),
   * spare는 메소마켓에 안 쓴 메포(작 몫에서 빼고 회수 없음으로 센다)
   */
  lines: (LedgerLine & { back: number; noPrice: boolean; meso: number; max?: number; want?: number; spare?: number })[]
  /** 용도별 캐시 */
  sell: number
  gift: number
  mk: number
  none: number
  /** 작에 들어간 캐시(회수 없음 빼고)와 그 현금, 돌려받은 돈(크레딧 값 포함), 실제로 쓴 돈 */
  pay: number
  cost: number
  back: number
  credits: number
  creditWon: number
  loss: number
  sales: number
  /** 얻은 메소(억): 경매장 · 메소마켓, 그 메소를 판 돈(억당 um), 선물식으로 받은 돈 */
  mesoSell: number
  mesoMk: number
  mesoWon: number
  giftWon: number
}

/**
 * fundCost: 그 주 결제 전부(회수 없음 포함)를 충전하는 데 든 현금. 작 몫은 금액 비율로 나눠 센다(효율표와 같다)
 */
export function settle(lines: LedgerLine[], p: Prices, funding: Pick<Funding, 'cost'> | null, mkMeso: Record<string, number> = {}, creditSale?: number): Settled {
  const keep = (1 - p.fee) * p.um
  const out: Settled['lines'] = lines.map(l => {
    if (l.use === 'gift') return { ...l, back: l.cash * p.giftRate, noPrice: !p.giftRate, meso: 0 }
    if (l.use === 'mk') {
      // 메소마켓에서 실제로 산 메소. 적은 값이 최대보다 크면(가진 메포를 더 썼다) 최대까지만 센다(2026-10-16 사용자)
      // 메소마켓은 1억 단위로만 산다. 딱 안 떨어져 남는 메포는 그 주 작에 못 쓴 것으로(회수 없음) 센다(2026-10-16 사용자)
      const max = p.mk ? Math.floor(l.cash / p.mk + 1e-9) : 0, want = mkMeso[l.key] != null ? Math.floor(mkMeso[l.key]) : undefined
      const meso = want != null ? Math.min(want, max) : max
      return { ...l, back: meso * p.um, noPrice: !p.mk, meso, max, want, spare: p.mk ? l.cash - meso * p.mk : 0 }
    }
    if (l.use === 'none') return { ...l, back: 0, noPrice: false, meso: 0 }
    const price = p.items.find(x => x.id === l.itemId)?.price ?? 0
    return { ...l, back: l.n * price * keep, noPrice: !price, meso: l.n * price * (1 - p.fee) }
  })
  const sum = (u: Use) => out.filter(l => l.use === u).reduce((a, l) => a + l.cash, 0)
  const spare = out.reduce((a, l) => a + (l.spare ?? 0), 0)
  const sell = sum('sell'), gift = sum('gift'), mk = sum('mk') - spare, none = sum('none') + spare
  const pay = sell + gift + mk, all = pay + none
  // 선물은 크레딧이 안 쌓인다. 회수 없는 구매도 캐시샵에서 샀으니 쌓인다. 다만 작이 없는 주(회수 없음만 산 주)는
  // 작 효율을 셀 것이 없다. 크레딧만 돌려받은 돈으로 잡혀 실제로 쓴 돈이 −가 됐다(2026-10-16)
  const credits = pay ? (sell + mk + none) * CREDIT_RATE : 0
  // 크레딧샵에서 실제로 산 것을 판 돈을 주면 그걸 쓴다(쌓인 크레딧 × 추정 값 대신)
  const creditWon = creditSale ?? credits * p.creditPer
  const cost = all ? (funding?.cost ?? all) * pay / all : 0
  const back = out.reduce((a, l) => a + l.back, 0) + creditWon
  const sales = out.filter(l => l.use === 'sell').reduce((a, l) => a + l.n, 0) + (gift ? 1 : 0) + (mk ? 1 : 0)
  const mesoOf = (u: Use) => out.filter(l => l.use === u).reduce((a, l) => a + l.meso, 0)
  const mesoSell = mesoOf('sell'), mesoMk = mesoOf('mk')
  const giftWon = out.filter(l => l.use === 'gift').reduce((a, l) => a + l.back, 0)
  return { lines: out, sell, gift, mk, none, pay, cost, back, credits, creditWon, loss: cost - back, sales,
    mesoSell, mesoMk, mesoWon: (mesoSell + mesoMk) * p.um, giftWon }
}

/** 구매 건의 산 때: 넥슨캐시 구매번호(서버 2자리 + 연월일시분초)면 '10.15 00:33', 아니면 날짜 */
export function partWhen(p: { date: string; id?: string }) {
  const m = p.id && /^\d{2}(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(p.id)
  return m ? `${m[2]}.${m[3]} ${m[4]}:${m[5]}` : p.date.slice(5).replace('-', '.')
}
