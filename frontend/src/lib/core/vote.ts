/**
 * 여러 프레임에서 읽은 후보를 모아 결론을 낸다.
 *
 * 한 장으로 끝내려면 커서 위치를 맞춰야 한다. 툴팁이 커서 우하단에 붙어 나와서
 * 상단 '○○ 등급까지'를 가려 버리기 때문이다. 화면을 공유받으면 그럴 필요가 없다.
 * 마우스를 올렸다 치우는 동안 어떤 프레임에는 툴팁이, 어떤 프레임에는 상단 패널이
 * 찍히므로 둘을 따로 모아 합치면 된다.
 *
 * 프레임 하나는 믿지 않는다. 같은 답이 두 번 나와야 받아들인다.
 * 한 프레임을 판단할 때 앞선 결론을 끌어들이지도 않는다. 한 번 잘못 읽은 값이
 * 뒤따르는 프레임의 근거가 되면 틀린 답이 표를 쌓는다.
 */
import { type ScanRaw, type Solved, solveScan, totalsFor } from './scan'

export interface VoteState {
  frames: number          // 지금까지 본 프레임 수
  /** 그중 무엇이든 읽힌 프레임 수. 0이면 화면이 비어 들어오는 것이다 */
  seen: number
  needs: number[] | null  // 두 번 이상 같게 나온 툴팁 12줄
  solved: Solved | null   // 합계까지 나온 결론
  /** 12줄만 나온 상태. 도중에 그만두더라도 여기까지는 쓸 수 있다 */
  partial: Solved | null
}

export interface Vote {
  feed(raw: ScanRaw): VoteState
  state(): VoteState
}

/** 같은 답이 몇 번 나와야 받아들일지. */
export const AGREE = 2

export function createVote(collected: number[], agree = AGREE): Vote {
  const needsVotes = new Map<string, number>()
  const hits = new Map<string, number>()   // '등급기준:합계' → 그렇게 읽힌 프레임 수
  let waiting: number[][] | null = []      // 툴팁이 정해지기 전에 본 숫자들
  let frames = 0
  let seen = 0
  let scale = 1
  let needs: number[] | null = null
  let solved: Solved | null = null
  let partial: Solved | null = null

  /** 상단 패널이 찍힌 프레임에서 합계를 찾는다. 답이 갈리는 프레임은 버린다. */
  function addAmounts(amounts: number[]) {
    if (!needs || !amounts.length) return
    const found = totalsFor(needs, collected, amounts)
    if (found.size !== 1) return
    const key = [...found][0]
    hits.set(key, (hits.get(key) ?? 0) + 1)
  }

  function settle() {
    if (!needs || solved) return
    const best = [...hits.entries()].sort((a, b) => b[1] - a[1])
    // 서로 다른 합계가 같은 표를 받으면 아직 모르는 것이다
    if (!best.length || (best.length > 1 && best[0][1] === best[1][1])) return
    const [tierTh, total] = best[0][0].split(':').map(Number)
    solved = { needs, tierTh, total, scale }
  }

  function state(): VoteState {
    return { frames, seen, needs, solved, partial }
  }

  function feed(raw: ScanRaw): VoteState {
    frames++
    if (raw.readings.length || raw.amounts.length) seen++
    if (raw.scale) scale = raw.scale

    if (!needs) {
      const s = solveScan(raw, collected)
      if (s) {
        const key = s.needs.join(',')
        const n = (needsVotes.get(key) ?? 0) + 1
        needsVotes.set(key, n)
        if (n >= agree) {
          needs = s.needs
          partial = s          // 합계를 못 채우고 끝나도 12줄은 남는다
          for (const a of waiting!) addAmounts(a)   // 모아 둔 것을 한 번에 훑는다
          waiting = null
        }
      }
    }

    if (needs) addAmounts(raw.amounts)
    else waiting!.push(raw.amounts)

    settle()
    return state()
  }

  return { feed, state }
}
