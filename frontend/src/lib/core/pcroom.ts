/**
 * 프리미엄 PC방 반영액 보정. 입출력 없는 순수 함수만 둔다.
 * app/pcroom.py를 그대로 옮긴 것이고, 테스트도 같은 경우를 쓴다.
 *
 * PC방 접속은 6분마다 100캐시씩 MVP 금액에 반영되는데 구매내역에는 잡히지 않는다.
 * 인게임 툴팁의 '주차별 유지까지' 12줄은 "앞으로 결제가 없다"는 가정이라,
 * 매주 달라지는 것은 13주 창에서 빠져나가는 과거 한 주뿐이다. 그래서 이웃한
 * 두 줄의 차이가 그 주에 탈락하는 주의 금액이 된다.
 *
 *     그 주 PC방 반영액 = (툴팁에서 역산한 넥슨 금액) - (우리가 수집한 구매액)
 *
 * 보정값은 주 시작일을 키로 저장한다. 그래야 주가 지날 때 오래된 주가 창 밖으로
 * 자연히 빠지고, 새로 들어온 주만 빈칸으로 남는다.
 */

export const TOOLTIP_ROWS = 12          // 인게임 툴팁이 보여주는 줄 수
export const WEEKS = TOOLTIP_ROWS + 1   // 복원되는 주 수 (= 13주 창)
export const UNIT = 100                 // PC방은 100캐시 단위로 반영된다
export const MINUTES_PER_UNIT = 6       // 6분마다 100캐시

export const MAX_WEEK_MINUTES = 7 * 24 * 60   // 한 주를 넘는 접속은 있을 수 없다
export const HIGH_WEEK_MINUTES = 20 * 60      // 주 20시간을 넘으면 PC방치고 이례적이다
const BLACK_TH = 2_500_000                     // 블랙 기준(이월이 있는 등급)

/** 판독을 구매내역과 견줄 때 함께 보는 것 */
export interface Known {
  /** 13주 주마다 산 물건값. 인게임이 적은 주를 그 물건이 MVP에 안 들어간 것으로 설명할 때 쓴다 */
  items?: number[][]
  /**
   * 사이트가 지금 계산한 13주 금액(지난번 맞춘 보정값·이월까지 들어간 것). 툴팁의 주 금액이 이것과 같으면
   * 이미 확인한 값이다. 이월로 옮겨진 금액은 구매내역과 달라 다시 맞출 때마다 막혔다(2026-10-02 제보)
   */
  model?: number[]
}

/**
 * 인게임이 수집보다 gap원 적은 주: 그 주에 산 물건 몇 개 값의 합이 gap과 원 단위로 맞으면 그 물건들의 자리.
 * 넥슨이 그 결제를 MVP에 넣지 않은 것이다(2026-10-01 제보: 1초 간격으로 산 1,400원짜리 둘 중 하나만 들어갔다).
 * 결제 수단은 넥슨캐시 사용 내역에 없어 왜 빠졌는지는 모른다. 맞는 조합이 없으면 null
 */
export function unpaid(prices: number[], gap: number): number[] | null {
  if (gap <= 0 || !prices.length) return null
  // 합 → (직전 합, 더한 물건 자리). 물건마다 이전까지의 합에만 더해 한 번씩만 쓴다
  const from = new Map<number, [number, number]>([[0, [-1, -1]]])
  for (let i = 0; i < prices.length && !from.has(gap); i++) {
    for (const s of [...from.keys()]) {
      const t = s + prices[i]
      if (t <= gap && !from.has(t)) from.set(t, [s, i])
    }
    if (from.size > 100_000) return null   // 셈이 너무 커지면 모른다고 한다
  }
  if (!from.has(gap)) return null
  const out: number[] = []
  for (let s = gap; s > 0;) { const [p, i] = from.get(s)!; out.push(i); s = p }
  return out.reverse()
}

/** PC방 반영액을 접속 시간(분)으로 환산한다. */
export const minutesOf = (amount: number) => Math.floor(amount / UNIT) * MINUTES_PER_UNIT

/** 주 from..to(둘 다 포함)의 넥슨 금액 합. 하나하나는 모르고 합만 안다 */
export interface Block { from: number; to: number; sum: number }

export interface Restored {
  weeks: number[]
  /** 하나하나 금액을 모르는 주의 자리. 블랙의 가장 오래된 주, 툴팁에 0으로 나온 줄 사이의 주 */
  unknown: number[]
  /** unknown 중 합은 아는 묶음 */
  blocks: Block[]
  /**
   * 블랙인데 가장 오래된 주를 모를 때 그 주의 최솟값. 지금 블랙이면 13주 합계가 기준 이상이라
   * 가장 오래된 주는 적어도 '기준 − 나머지 12주'다. 정확한 값은 몰라도 이것이면 12줄과 지금 등급이 인게임과 같다
   */
  floor?: number
  issues: string[]
  ok: boolean
}

/** 이월을 한 푼도 안 쓴 12줄. 블랙이 아니면 늘 이것이다 */
export const NO_CARRY: number[] = Array(TOOLTIP_ROWS).fill(0)

/**
 * 툴팁 가운데 11주. k번째 주 = (k+1)주 뒤 − k주 뒤 + (k+1)주 뒤 줄의 사용 이월.
 *
 * 블랙은 갱신 때 모자란 금액을 이월에서 꺼내 쓰고, 인게임 '현재 등급 유지까지'는
 * 그만큼 빼고 적힌다. 꺼내 쓴 금액은 새 주의 사용 금액으로 채워져 다음 줄부터
 * 합계에 남으므로, 앞 줄의 이월은 이웃한 두 줄 사이에서 지워지고 뒷 줄의 것만 남는다.
 * (2026-09 블랙 제보에서 수집한 결제와 원 단위까지 맞는 것으로 확인)
 *
 * 얼마를 쓰는지는 툴팁 맨 오른쪽 '사용 이월 금액' 열에 줄마다 적혀 있다.
 * 이월이 있는 것은 블랙뿐이라 다른 등급에서는 전부 0이고 그냥 두 줄의 차이다.
 */
export const middleWeeks = (needs: number[], carry: number[] = NO_CARRY): number[] =>
  needs.slice(1).map((v, k) => v + (carry[k + 1] ?? 0) - needs[k])

/** 이번 주 금액. 12주 뒤 줄에는 그동안 채워질 이월이 전부 들어 있어 한꺼번에 뺀다 */
export const lastWeek = (needs: number[], tierTh: number, carry: number[] = NO_CARRY): number =>
  tierTh - needs[needs.length - 1] - carry.reduce((a, b) => a + b, 0)

/**
 * 상단 '○○ 등급까지 N 캐시' 한 줄에서 (지금 등급 기준, 지금 13주 합계)를 뽑는다.
 * '레드 등급까지'라고 적혀 있으면 지금 등급은 그 바로 아래(다이아)다.
 */
export function anchor(ths: number[], nextIndex: number, remaining: number): [number, number | null] {
  // 블랙은 위 등급이 없어 이 줄 자체가 화면에 없다. 13주 합계는 끝내 알 수 없다
  if (nextIndex >= ths.length) return [ths[ths.length - 1], null]
  return [nextIndex > 0 ? ths[nextIndex - 1] : 0, ths[nextIndex] - remaining]
}

/**
 * 줄마다 그 갱신 때의 13주 합계를 아는지.
 * 인게임은 모자란 금액이 없으면 '유지까지'를 0으로 적는다. 그때 합계는 기준 이상이라는 것만 안다.
 * 다만 블랙이 이월로 메우는 줄은 0이어도 '사용 이월'이 곧 모자란 금액이라 합계를 안다.
 * 그리고 이월로 메운 갱신 뒤에는 합계가 딱 기준이다. 그 뒤 '유지까지 0 · 사용 0'인 줄은 빠진 주가 0원이라
 * 합계가 그대로 기준이다(기준보다 작으면 이월을 썼을 것이고, 클 수는 없다). 그 줄도 합계를 안다
 * (2026-09-30 제보: 이월만 쓰는 블랙은 이런 줄이 사이사이 끼어 '잘못 읽었다'로 막혔다)
 */
export const knownRows = (needs: number[], carry: number[] = NO_CARRY, black = false) => {
  // 블랙인데 12줄 모두 0이고 이월도 한 번도 안 쓴다: 이번 주가 혼자 기준을 채운다(갱신 때 이월이 이번 주를
  // 기준까지 채웠다). 기준을 넘는 결제는 이월로만 가니 이번 주는 딱 기준이고 옛 주는 0이다. 모든 줄 합계가 딱 기준
  // (2026-10-01 제보: 레드로 떨어졌다가 이번 주 결제로 다시 블랙, 툴팁 전부 0)
  if (black && needs.every(n => n === 0) && carry.every(c => !c)) return needs.map(() => true)
  let filled = false
  return needs.map((n, i) => {
    const k = n > 0 || (carry[i] ?? 0) > 0 || filled
    if ((carry[i] ?? 0) > 0) filled = true
    return k
  })
}

/**
 * 툴팁 12줄을 넥슨 기준 주차별 금액 13개로 되돌린다.
 *
 * S[k] = k주 뒤 갱신 때의 13주 합계(그 갱신에서 쓸 이월 전) = 기준 − 유지까지 − 사용 이월.
 * 갱신에서 쓴 이월은 새 주에 채워져 합계에 남으므로 S[k+1] = S[k] − W[k] + 쓴 이월[k].
 * 그래서 합계를 아는 두 줄 사이의 주는 합을 알고, 이웃한 두 줄이면 그 주 금액이 곧 나온다.
 * S[0]은 지금 13주 합계(상단 '○○ 등급까지'), S[13]은 앞으로 채워질 이월의 합이다.
 * 블랙은 S[0]이 화면에 없어 가장 오래된 주를 모르고, 0으로 적힌 줄 사이의 주는 합만 안다.
 */
export function restore(needs: number[], tierTh: number, total: number | null,
                        keepNeed: number | null = null, carry: number[] = NO_CARRY): Restored {
  const issues: string[] = []
  const fail = (msg: string): Restored => ({ weeks: [], unknown: [], blocks: [], issues: [msg], ok: false })
  if (needs.length !== TOOLTIP_ROWS) return fail(`툴팁 값이 ${TOOLTIP_ROWS}개여야 하는데 ${needs.length}개예요.`)
  if (tierTh <= 0) return fail('지금 등급을 알 수 없어요.')

  const won = (n: number) => n.toLocaleString('ko-KR')
  const known = knownRows(needs, carry, tierTh >= BLACK_TH)
  const used = (k: number) => (k >= 1 && k <= TOOLTIP_ROWS ? carry[k - 1] ?? 0 : 0)
  const S: (number | null)[] = [total]
  for (let k = 1; k <= TOOLTIP_ROWS; k++) S.push(known[k - 1] ? tierTh - needs[k - 1] - used(k) : null)
  S.push(carry.reduce((a, b) => a + b, 0))

  // 0은 합계가 기준을 넘는 앞쪽 줄에만 나올 수 있다. 사이에 끼어 있으면 잘못 읽은 것이다
  for (let k = 1; k < TOOLTIP_ROWS; k++) {
    if (known[k - 1] && !known[k]) {
      issues.push(`${k + 1}주 뒤가 0으로 읽혔는데 ${k}주 뒤는 ${won(needs[k - 1])}이에요. 툴팁 숫자를 잘못 읽은 것 같아요.`)
    }
  }

  const weeks: number[] = Array(WEEKS).fill(0)
  const unknown: number[] = []
  const blocks: Block[] = []
  let a = S.findIndex(v => v != null)
  for (let i = 0; i < a; i++) unknown.push(i)
  for (let b = a + 1; b < S.length; b++) {
    if (S[b] == null) continue
    let sum = S[a]! - S[b]!
    for (let k = a; k < b; k++) sum += used(k)
    if (b === a + 1) weeks[a] = sum
    else {
      blocks.push({ from: a, to: b - 1, sum })
      for (let i = a; i < b; i++) unknown.push(i)
      if (sum < 0) issues.push(`${a + 1}~${b}번째 주 합이 음수(${won(sum)}원)예요. 툴팁 숫자를 잘못 읽은 것 같아요.`)
    }
    a = b
  }

  weeks.forEach((v, i) => {
    if (v >= 0 || unknown.includes(i)) return
    issues.push(i >= 1 && i < TOOLTIP_ROWS
      ? `${i}주 뒤(${won(needs[i - 1])})보다 ${i + 1}주 뒤(${won(needs[i])})가 작아요. 유지까지 필요한 금액은 줄어들 수 없어요.`
      : `${i + 1}번째 주 금액이 음수(${won(v)}원)예요. 툴팁 숫자를 잘못 읽은 것 같아요.`)
  })
  if (keepNeed != null && keepNeed !== needs[0]) {
    issues.push(`상단의 유지 필요 금액(${won(keepNeed)})과 툴팁 1주 뒤(${won(needs[0])})가 달라요.`)
  }
  // 1주 뒤 합계를 알면: 가장 오래된 주 ≥ 기준 − 1주 뒤 합계 (2026-10-01 제보: 모름으로 두니 22,800원 모자라 레드로 보였다)
  const floor = total == null && tierTh >= BLACK_TH && S[1] != null ? Math.max(0, tierTh - S[1]) : undefined
  return { weeks, unknown, blocks, ...(floor != null ? { floor } : {}), issues, ok: issues.length === 0 }
}

export interface Gap {
  start: string       // 주 시작일 (목요일, ISO)
  nexon: number       // 툴팁에서 역산한 금액
  collected: number   // 우리가 수집한 구매액
  amount: number      // PC방으로 볼 금액
  minutes: number
  note: string        // 확실히 잘못된 값
  warn: string        // 확인해 볼 값
  ok: boolean
  /** 화면에 나오지 않아 구할 수 없는 주. 0으로 보이지만 '0원'이라는 뜻이 아니다 */
  unknown: boolean
}

/**
 * 넥슨 기준 주차별 금액과 수집한 금액을 견줘 주별 PC방 반영액을 낸다.
 * 차이가 PC방이 아니라 '수집 누락'일 수도 있다. PC방은 반드시 100의 배수라
 * 그걸로 한 번 거르고, 접속 시간으로 환산해서 말이 되는지로 한 번 더 거른다.
 */
export function compare(nexon: number[], collected: number[], starts: string[],
                        unknown: number[] = [], mixed: number[] = [], black = false,
                        known: Known = {}): Gap[] {
  const out: Gap[] = []
  for (let i = 0; i < Math.min(nexon.length, collected.length, starts.length); i++) {
    if (unknown.includes(i)) {
      // 모르는 주를 0원이라고 우기면 안 된다. 비워 두고 사용자가 정하게 남긴다
      out.push({ start: starts[i], nexon: 0, collected: collected[i], amount: 0, minutes: 0,
                 note: '', warn: '', ok: true, unknown: true })
      continue
    }
    const gap = nexon[i] - collected[i]
    let note = ''
    let warn = ''
    if (!black && known.model?.[i] === nexon[i] && (gap < 0 || gap % UNIT)) {
      out.push({ start: starts[i], nexon: nexon[i], collected: collected[i], amount: gap, minutes: 0, note,
                 warn: '지금 사이트 계산과 같아요. 지난번에 맞춘 값(이월로 옮겨진 금액 등)이에요.', ok: true, unknown: false })
      continue
    }
    if (gap < 0 && black) {
      // 블랙은 인게임이 더 적을 수 있다. 기준을 넘긴 결제는 이월로만 가고(9/17부터),
      // 9/29에는 넥슨이 PC방 비정상 적립분을 주 금액에서 걷어냈다. 툴팁 금액을 그대로 믿는다
      out.push({ start: starts[i], nexon: nexon[i], collected: collected[i], amount: gap, minutes: 0, note,
                 warn: `인게임이 수집보다 ${(-gap).toLocaleString('ko-KR')}원 적어요. 블랙 기준을 넘겨 이월로 간 결제이거나 넥슨이 걷어낸 금액이에요.`,
                 ok: true, unknown: false })
      continue
    } else if (gap < 0 && unpaid(known.items?.[i] ?? [], -gap)) {
      out.push({ start: starts[i], nexon: nexon[i], collected: collected[i], amount: gap, minutes: 0, note,
                 warn: `인게임이 수집보다 ${(-gap).toLocaleString('ko-KR')}원 적어요. 그 주에 산 것 중 이만큼이 MVP에 들어가지 않았어요.`,
                 ok: true, unknown: false })
      continue
    } else if (gap < 0) {
      note = '수집한 금액이 인게임보다 많아요. 툴팁 숫자를 잘못 읽었을 수 있어요.'
    } else if (mixed.includes(i)) {
      // 블랙의 이번 주: 목요일 갱신 때 꺼내 쓴 이월이 이 주 사용 금액으로 채워진다.
      // 얼마가 이월이고 얼마가 PC방인지는 툴팁만으로 가를 수 없어 합친 채로 둔다
      if (gap) warn = '갱신 때 쓴 이월이 섞여 있어 PC방 시간은 알 수 없어요.'
      out.push({ start: starts[i], nexon: nexon[i], collected: collected[i], amount: gap,
                 minutes: 0, note, warn, ok: true, unknown: false })
      continue
    } else if (gap % UNIT) {
      note = '100원 단위가 아니에요. PC방이 아니라 수집하지 못한 결제일 수 있어요.'
    } else if (minutesOf(gap) > MAX_WEEK_MINUTES) {
      note = '한 주에 들어갈 수 없는 접속 시간이에요. 수집하지 못한 결제일 수 있어요.'
    } else if (minutesOf(gap) > HIGH_WEEK_MINUTES) {
      const m = minutesOf(gap)
      warn = `이 주에 ${Math.floor(m / 60)}시간 ${m % 60}분 PC방 접속이라는 뜻이에요. `
        + '맞는지 확인해 보세요. 수집하지 못한 결제일 수도 있어요.'
    }
    out.push({ start: starts[i], nexon: nexon[i], collected: collected[i], amount: gap,
               minutes: minutesOf(gap), note, warn, ok: !note, unknown: false })
  }
  return out
}

/**
 * 확인한 보정값을 기존 저장분에 얹는다. 0원인 주도 '확인했다'는 뜻이라 남긴다.
 * 다만 구할 수 없었던 주는 빼 둔다. 0원으로 적어 두면 다시 물어볼 길이 없어진다.
 */
export function mergeSaved(saved: Record<string, number>, gaps: Gap[]): Record<string, number> {
  const out = { ...saved }
  for (const g of gaps) if (!g.unknown) out[g.start] = g.amount
  return out
}

/**
 * 저장 맵에는 주 시작일을 키로 '넥슨 − 수집' 금액을 둔다. 확정하지 못한 주는 같은 맵에
 * 키 앞에 이름을 붙여 부가 정보를 함께 둔다. 계정 저장소·exe가 맵을 통째로 옮기기만 해서
 * 따로 칸을 만들지 않아도 같이 따라다닌다.
 *   gapmax:주   그 주 금액의 최댓값 (주 금액 자체를 모를 때. 저장한 값은 최솟값)
 *   pcmin:주 / pcmax:주   그 주 PC방의 범위 (갱신 때 쓴 이월이 섞여 PC방만 따로 모를 때)
 *   unk:주      1이면 끝내 알 수 없는 주 (블랙 첫 스캔의 가장 오래된 주)
 *   grp:주      합만 아는 묶음의 첫 주 (20260709처럼 숫자). 묶음의 합은 가장 최근 주에 몰아 둔다
 *   carry:주    그 주에 인게임 툴팁으로 확인한 이월 잔액
 *   miss:주     1이면 PC방이 아니라 수집 못 한 결제(넥슨쇼핑 쿠폰 등)로 넣은 주. PC방 합계에서 뺀다
 */
export const META = { gapMax: 'gapmax:', pcMin: 'pcmin:', pcMax: 'pcmax:', unknown: 'unk:', group: 'grp:',
                      carry: 'carry:', miss: 'miss:' }
const groupKey = (iso: string) => Number(iso.replace(/-/g, ''))
const groupIso = (n: number) => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` }

/** 한 주의 보정 상태. 확정된 주는 최소와 최대가 같다 */
export interface WeekPc {
  start: string
  gapMin: number      // 넥슨 − 수집 (갱신 때 쓴 이월 포함)
  gapMax: number
  pcMin: number       // 그중 PC방
  pcMax: number
  unknown: boolean    // 끝내 알 수 없는 주
  /** 합만 아는 묶음의 첫 주. 묶음의 합은 묶음의 가장 최근 주 gapMin에 몰려 있다 */
  group?: string
  /** PC방이 아니라 수집 못 한 결제로 넣은 주. 금액(gapMin)은 그대로 13주 합계에 들어간다 */
  miss?: boolean
}

/** 저장 맵에서 한 주를 읽는다. 아직 스캔하지 않은 주는 null */
export function readWeek(saved: Record<string, number>, s: string): WeekPc | null {
  if (saved[META.unknown + s]) {
    return { start: s, gapMin: 0, gapMax: 0, pcMin: 0, pcMax: 0, unknown: true }
  }
  if (!(s in saved)) return null
  const gapMin = saved[s]
  const gapMax = Math.max(gapMin, saved[META.gapMax + s] ?? gapMin)
  const pcMin = saved[META.pcMin + s] ?? gapMin
  const pcMax = Math.max(pcMin, saved[META.pcMax + s] ?? gapMax)
  const g = saved[META.group + s]
  return { start: s, gapMin, gapMax, pcMin, pcMax, unknown: false, ...(g ? { group: groupIso(g) } : {}),
           ...(saved[META.miss + s] ? { miss: true } : {}) }
}

/**
 * 저장할 맵을 만든다. 부가 정보는 확정된 주에도 '없음'에 해당하는 값으로 늘 같이 적는다.
 * 저장은 덮어쓰기만 해서, 지난번 범위가 이번에 확정됐을 때 옛 범위를 지울 길이 이것뿐이다.
 */
export function writeWeeks(weeks: WeekPc[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const w of weeks) {
    if (!w.unknown) out[w.start] = w.gapMin
    out[META.gapMax + w.start] = w.gapMax
    out[META.pcMin + w.start] = w.pcMin
    out[META.pcMax + w.start] = w.pcMax
    out[META.unknown + w.start] = w.unknown ? 1 : 0
    out[META.group + w.start] = w.group ? groupKey(w.group) : 0
    out[META.miss + w.start] = w.miss ? 1 : 0
  }
  return out
}

/** 13주 창 안에서 아직 보정값을 모르는 주. 주가 지나면 최근 주부터 여기 쌓인다. */
export const missing = (starts: string[], saved: Record<string, number>) =>
  starts.filter(s => readWeek(saved, s) == null)

/** 주별 금액에 저장된 보정값을 더한다. 모르는 주는 0으로 둔다. */
export const applyCorrections = (amounts: number[], starts: string[], saved: Record<string, number>) =>
  amounts.map((a, i) => a + (saved[starts[i]] ?? 0))

/** 13주 창을 한참 벗어난 오래된 보정값을 버린다. */
export const prune = (saved: Record<string, number>, oldest: string) =>
  Object.fromEntries(Object.entries(saved).filter(([k]) => k >= oldest))
