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

/** PC방 반영액을 접속 시간(분)으로 환산한다. */
export const minutesOf = (amount: number) => Math.floor(amount / UNIT) * MINUTES_PER_UNIT

export interface Restored { weeks: number[]; issues: string[]; ok: boolean }

/**
 * 상단 '○○ 등급까지 N 캐시' 한 줄에서 (지금 등급 기준, 지금 13주 합계)를 뽑는다.
 * '레드 등급까지'라고 적혀 있으면 지금 등급은 그 바로 아래(다이아)다.
 */
export function anchor(ths: number[], nextIndex: number, remaining: number): [number, number] {
  return [nextIndex > 0 ? ths[nextIndex - 1] : 0, ths[nextIndex] - remaining]
}

/**
 * 툴팁 12줄을 넥슨 기준 주차별 금액 13개로 되돌린다.
 * 가운데 11주는 이웃한 줄의 차이라서 tierTh가 상쇄된다. 양 끝 두 주만 tierTh와 total이 필요하다.
 */
export function restore(needs: number[], tierTh: number, total: number,
                        keepNeed: number | null = null): Restored {
  const issues: string[] = []
  if (needs.length !== TOOLTIP_ROWS) {
    return { weeks: [], issues: [`툴팁 값이 ${TOOLTIP_ROWS}개여야 하는데 ${needs.length}개예요.`], ok: false }
  }
  if (tierTh <= 0) return { weeks: [], issues: ['지금 등급을 알 수 없어요.'], ok: false }

  const weeks = [total - tierTh + needs[0]]                               // 가장 오래된 주
  for (let k = 1; k < TOOLTIP_ROWS; k++) weeks.push(needs[k] - needs[k - 1]) // 가운데 11주
  weeks.push(tierTh - needs[needs.length - 1])                            // 이번 주

  weeks.forEach((v, i) => {
    if (v < 0) issues.push(`${i + 1}번째 주 금액이 음수(${v.toLocaleString('ko-KR')}원)예요. 툴팁 숫자를 잘못 읽은 것 같아요.`)
  })
  for (let k = 1; k < TOOLTIP_ROWS; k++) {
    if (needs[k] < needs[k - 1]) {
      issues.push(`${k}주 뒤(${needs[k - 1].toLocaleString('ko-KR')})보다 `
        + `${k + 1}주 뒤(${needs[k].toLocaleString('ko-KR')})가 작아요. 유지까지 필요한 금액은 줄어들 수 없어요.`)
    }
  }
  if (keepNeed != null && keepNeed !== needs[0]) {
    issues.push(`상단의 유지 필요 금액(${keepNeed.toLocaleString('ko-KR')})과 `
      + `툴팁 1주 뒤(${needs[0].toLocaleString('ko-KR')})가 달라요.`)
  }
  return { weeks, issues, ok: issues.length === 0 }
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
}

/**
 * 넥슨 기준 주차별 금액과 수집한 금액을 견줘 주별 PC방 반영액을 낸다.
 * 차이가 PC방이 아니라 '수집 누락'일 수도 있다. PC방은 반드시 100의 배수라
 * 그걸로 한 번 거르고, 접속 시간으로 환산해서 말이 되는지로 한 번 더 거른다.
 */
export function compare(nexon: number[], collected: number[], starts: string[]): Gap[] {
  const out: Gap[] = []
  for (let i = 0; i < Math.min(nexon.length, collected.length, starts.length); i++) {
    const gap = nexon[i] - collected[i]
    let note = ''
    let warn = ''
    if (gap < 0) {
      note = '수집한 금액이 인게임보다 많아요. 툴팁 숫자를 잘못 읽었을 수 있어요.'
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
               minutes: minutesOf(gap), note, warn, ok: !note })
  }
  return out
}

/** 확인한 보정값을 기존 저장분에 얹는다. 0원인 주도 '확인했다'는 뜻이라 남긴다. */
export function mergeSaved(saved: Record<string, number>, gaps: Gap[]): Record<string, number> {
  const out = { ...saved }
  for (const g of gaps) out[g.start] = g.amount
  return out
}

/** 13주 창 안에서 아직 보정값을 모르는 주. 주가 지나면 최근 주부터 여기 쌓인다. */
export const missing = (starts: string[], saved: Record<string, number>) =>
  starts.filter(s => !(s in saved))

/** 주별 금액에 저장된 보정값을 더한다. 모르는 주는 0으로 둔다. */
export const applyCorrections = (amounts: number[], starts: string[], saved: Record<string, number>) =>
  amounts.map((a, i) => a + (saved[starts[i]] ?? 0))

/** 13주 창을 한참 벗어난 오래된 보정값을 버린다. */
export const prune = (saved: Record<string, number>, oldest: string) =>
  Object.fromEntries(Object.entries(saved).filter(([k]) => k >= oldest))
