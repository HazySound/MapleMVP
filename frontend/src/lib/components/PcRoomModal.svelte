<script lang="ts">
  import { app, getBase, pcroomClear, pcroomSave, pcroomScan } from '../store.svelte'
  import { META, NO_CARRY, anchor, compare, readWeek, restore, unpaid, writeWeeks } from '../core/pcroom'
  import { buildBase, knownOf, looseWeeks, placeMoved, settleScan, weekRows } from '../core/engine'
  import { isCoupon, placeCoupons } from '../core/coupons'
  import { forecast, weekStart } from '../core/mvp'
  import { onMount } from 'svelte'
  import { type ScanRaw, type Solved, type TotalPick, acceptReading, carryFor, hasCarryColumn, isTop as topTier, panelFields, solveScan,
    relaxedShape, usesCarry, whyReject } from '../core/scan'
  import HelpModal from './HelpModal.svelte'
  import { STAGE, type ShareHandle, type ShareStatus, canShare, startShare } from '../web/share'
  import { primeChime } from '../web/chime'
  import { type Guide, canGuide, openGuide } from '../web/pip'
  import type { PcRoomResult, PcRoomScan, Row, Tier } from '../types'
  import { type ScanLog, fromRaw, logScan } from '../web/scanlog'
  import { type PcFuzzy, TIER_COLOR, TIER_INK_VAR, addDays, dayTime, md, pcCaveat, pcRange, spotlight, won } from '../format'
  import { tip } from '../tip'

  const d = $derived(app.data!)

  // 인게임 상단 '○○ 등급까지 N 캐시' — 여기서 지금 등급과 13주 합계가 같이 나온다
  let nextIndex = $state(-1)
  let remainText = $state('')
  let keepText = $state('')
  // 블랙만 있는 칸. 인게임이 '유지까지'에서 미리 빼 두는 금액이라 알아야 표가 풀린다.
  // 이월은 보통 첫 갱신에서 한꺼번에 쓰여 1주 뒤 줄에만 적히므로 칸은 하나만 둔다.
  // 드물게 여러 줄에 걸쳐 쓰이는 경우는 읽어 온 값을 그대로 들고 간다
  let carryText = $state('')
  let carryRest = $state<number[]>(Array(11).fill(0))
  // 툴팁 12줄 '현재 등급 유지까지' (1주 뒤 → 12주 뒤)
  let needTexts = $state<string[]>(Array(12).fill(''))

  let result = $state<PcRoomResult | null>(null)
  // 상단 '○○ 등급까지'로 볼 숫자가 여럿일 때 사용자가 고를 목록. 고르기 전에는 계산하지 않는다
  let choices = $state<TotalPick[] | null>(null)
  let ownText = $state('')
  let edited = $state<Record<string, number>>({})   // 사용자가 직접 고친 주
  /**
   * PC방으로는 말이 안 되지만 인게임 금액은 맞는 주. 넥슨쇼핑 쿠폰처럼 우리가 못 가져온 결제다.
   * 인게임 툴팁이 정답이라, 차액을 그대로 그 주에 넣으면 등급이 게임과 같아진다
   */
  let missed = $state<Record<string, boolean>>({})
  /**
   * 넥슨쇼핑 쿠폰을 인게임이 센 주로 옮긴 것(쿠폰 id → 옮길 주). 저장할 때 구매내역에도 적용한다.
   * 쿠폰은 산 주가 아니라 캐시샵에 등록한 주에 게임에 들어가는데, 우리는 산 날만 안다
   */
  let moves = new Map<string, string>()
  /** 주마다 옮겨 들어온 쿠폰 금액과, 쿠폰이 들어 있는 주 */
  let movedIn = $state<Record<string, number>>({})
  let couponWeeks = $state<Record<string, boolean>>({})
  let busy = $state(false)
  let error = $state('')

  const num = (t: string) => Number((t ?? '').replace(/[^\d]/g, '')) || 0
  const fmt = (t: string) => (t.trim() ? num(t).toLocaleString('ko-KR') : '')

  // '레드 등급까지'라고 적혀 있으면 지금 등급은 그 바로 아래(다이아)다
  const curTier = $derived<Tier | null>(nextIndex > 0 ? d.tiers[nextIndex - 1] : null)
  const tierTh = $derived(curTier?.th ?? 0)
  // 블랙은 위 등급이 없어 '○○ 등급까지' 줄 자체가 인게임에 없다
  const isTop = $derived(nextIndex >= d.tiers.length)
  const carry = $derived(isTop ? [num(carryText), ...carryRest] : NO_CARRY)
  const filled = $derived(needTexts.every(t => t.trim() !== '') && nextIndex >= 0
    && (isTop || remainText.trim() !== ''))

  // 처음 열었을 때 지금 등급 바로 위를 골라둔다 (보통 그게 화면에 적혀 있다)
  $effect(() => {
    if (nextIndex >= 0) return
    const i = d.tiers.findIndex(t => t.key === d.current)
    nextIndex = Math.min(i + 1, d.tiers.length - 1)
  })

  function tierOf(sum: number): Tier | null {
    let found: Tier | null = null
    for (const t of d.tiers) if (sum >= t.th) found = t
    return found
  }

  /**
   * 입력한 값으로 '예상 등급'을 되짚는다. 인게임 화면과 다르면 잘못 넣은 것이다.
   * 그 갱신에서 꺼내 쓰는 이월도 등급에 들어간다(인게임도 '유지까지 0 · 사용 이월 N' 줄을 블랙으로 적는다).
   * 그래서 등급은 기준 − 유지까지로 매기고, 이월을 뺀 합계가 음수면 잘못 넣은 것이다
   */
  const predicted = $derived(needTexts.map((t, i) => {
    if (!t.trim() || !tierTh) return null
    const sum = tierTh - num(t) - (carry[i] ?? 0)
    return { sum, tier: sum < 0 ? null : tierOf(sum + (carry[i] ?? 0)), bad: sum < 0 }
  }))

  const rows = $derived(result?.rows ?? [])
  const amountOf = (start: string, fallback: number) => edited[start] ?? fallback
  const looseOf = looseWeeks
  /** 확정하지 못한 주: 사용자가 직접 고치지 않은 범위·확인 불가 주 */
  const loose = (r: { start: string; pcMin?: number; pcMax?: number; unknown?: boolean; group?: string }) =>
    edited[r.start] === undefined && (!!r.unknown || !!r.group || (r.pcMax ?? 0) > (r.pcMin ?? 0))
  /** 합만 아는 묶음 → 그 묶음의 주들 */
  const groupOf = (g: string) => rows.filter(r => r.group === g && edited[r.start] === undefined)
  /** 묶음의 합. 합은 묶음의 가장 최근 주에 몰아 두었다 */
  const groupSum = (g: string) => groupOf(g).reduce((s, r) => s + (r.gapMin ?? 0), 0)
  const pcOf = (r: typeof rows[number], hi: boolean) => {
    const e = edited[r.start]
    if (e !== undefined) return e
    if (r.unknown || missed[r.start]) return 0   // 수집 못 한 결제는 PC방이 아니다
    if (r.group) return r.gapMin ?? 0          // 묶음의 합은 가장 최근 주에 몰려 있다
    return (hi ? r.pcMax : r.pcMin) ?? r.amount
  }
  /** PC방이 아니라 수집 못 한 결제로 넣는 금액 (빼는 주는 음수) */
  const missSum = $derived(rows.reduce((s, r) => s + (missed[r.start] && edited[r.start] === undefined ? (r.gapMin ?? r.amount) : 0), 0))
  const pcSum = $derived({
    total: rows.reduce((s, r) => s + pcOf(r, false), 0),
    totalMax: rows.reduce((s, r) => s + pcOf(r, true), 0),
  })
  /** 금액 자체를 범위로만 아는 주 (블랙 첫 스캔의 가장 오래된 주) */
  const hiddenRow = (r: { gapMin?: number; gapMax?: number }) => (r.gapMax ?? 0) > (r.gapMin ?? 0)
  const caveat = $derived(pcCaveat({
    ...pcSum,
    fuzzy: rows.filter(r => loose(r) && (!r.group || r.group === r.start)).map((r): PcFuzzy => {
      if (r.unknown) return { start: r.start, kind: 'unknown', min: 0, max: 0 }
      if (r.group) {
        const g = groupOf(r.group)
        return { start: r.start, end: g[g.length - 1].start, kind: 'group', min: groupSum(r.group), max: groupSum(r.group) }
      }
      return { start: r.start, kind: 'range', min: r.pcMin ?? 0, max: r.pcMax ?? 0 }
    }),
  }))
  const blocked = $derived(rows.some(r => r.note && edited[r.start] === undefined && !missed[r.start]))
  /**
   * 수집 못 한 결제로 볼 수 있는 빨간 줄. 인게임보다 수집이 많으면 보통은 잘못 읽은 것이라 안 되지만,
   * 그 주에 넥슨쇼핑 쿠폰이 있으면 쿠폰을 다른 주에 등록한 것일 수 있어 인게임 금액에 맞춰 뺀다
   */
  const canMiss = (r: { start: string; note: string; nexon: number; spent: number; unknown?: boolean }) =>
    !!r.note && !r.unknown && (r.nexon >= r.spent || !!couponWeeks[r.start])

  function markMissed(start: string, on: boolean) {
    const keep = edited
    missed = { ...missed, [start]: on }
    calc(true)
    edited = keep
  }

  /** 넣은 숫자로 주차별 PC방 반영액을 뽑는다. 규칙은 core/pcroom에 있다. */
  function calc(keepMissed = false) {
    error = ''
    edited = {}
    const b0 = getBase()
    if (!b0) return
    const [tierTh, total] = anchor(d.tiers.map(t => t.th), nextIndex, num(remainText))
    const r = restore(needTexts.map(num), tierTh, total, keepText.trim() ? num(keepText) : null, carry)
    if (!r.ok) {
      result = null
      error = r.issues.join(' ')
      openInput = true
      return
    }
    // 넥슨쇼핑 쿠폰을 인게임이 센 주로 옮겨 본 뒤에 견준다. 옮길 게 없으면 그대로다
    const withMoves = (rows: Row[], m: Map<string, string>) => (m.size
      ? rows.map(x => (x.id && m.has(x.id) ? { ...x, bought: x.bought ?? x.date, date: m.get(x.id)! } : x))
      : rows)
    const coupons = app.web ? placeCoupons(b0.rows, b0.starts, r.weeks, r.unknown) : new Map<string, string>()
    movedIn = {}
    for (const x of b0.rows) if (x.id && coupons.has(x.id)) movedIn[coupons.get(x.id)!] = (movedIn[coupons.get(x.id)!] ?? 0) + x.price
    // 넥슨이 다음 주로 센 결제도 그 주로 옮긴다. 쿠폰을 옮기고 남은 차이로 본다. 옮기지 않으면 앞 주는
    // '안 들어간 결제', 다음 주는 '100의 배수 아님'으로 갈려 막힌다(2026-10-03 제보: 9/16 693원 → 9/17 주)
    const b1 = coupons.size ? buildBase(withMoves(b0.rows, coupons), b0.saved) : b0
    moves = new Map([...coupons, ...placeMoved(b1, r.weeks, r.unknown)])
    const rowsNow = withMoves(b0.rows, moves)
    const b = moves.size ? buildBase(rowsNow, b0.saved) : b0
    couponWeeks = Object.fromEntries(rowsNow.filter(isCoupon).map(x => [weekStart(x.date), true]))
    // 목요일 갱신에서 이월이 쓰인 주는 그 금액이 사용 금액으로 채워져 100원 단위가 아니다.
    // 블랙의 이번 주는 앱이 모르는 사이에 그랬을 수 있어 늘 그렇게 본다
    const last = r.weeks.length - 1
    // 구매내역과 맞춰 보지 못하고 표 모양으로만 읽은 경우(최근까지 블랙): 이월이 섞인 주를 사이트가 모르니
    // 모든 주를 이월이 섞일 수 있는 주로 보고, 인게임이 수집보다 적은 주도 블랙처럼 받아들인다
    const lenient = !!prev?.relaxed
    // 지난번 툴팁으로 확인해 저장한 금액과 똑같이 나온 주도 그렇다. 저장한 값이 들어가면 그 주에 쓰인 이월을
    // 되짚지 못해, 다시 읽을 때마다 같은 주가 '한 주에 들어갈 수 없는 접속 시간'으로 막혔다(2026-10-01 제보)
    const same = (i: number) => {
      const w = readWeek(b.saved, b.starts[i])
      return !!w && !w.unknown && !w.group && !r.unknown.includes(i) && r.weeks[i] - b.purchases[i] === w.gapMin
    }
    const mixed = b.used13.flatMap((u, i) => (u > 0 || lenient || (isTop && i === last) || same(i) ? [i] : []))
    const gaps = compare(r.weeks, b.purchases, b.starts, r.unknown, mixed, isTop || lenient, knownOf(b))
    // 인게임이 적은 만큼이 그 주에 산 물건값과 꼭 맞는 주(블랙 아님): 넥슨이 그 결제를 MVP에 안 넣었다.
    // 그 물건을 빼고 계산하고, 저장할 때는 그만큼 빼서 인게임 금액 그대로 남긴다
    const dropped = new Set<Row>()
    const dropAt: Record<string, { amount: number; names: string[] }> = {}
    if (!isTop && !lenient) {
      const wr = weekRows(b)
      gaps.forEach((g, i) => {
        if (g.unknown || g.amount >= 0 || g.note) return
        const pick = unpaid(wr[i].map(x => x.price), -g.amount)
        if (!pick) return
        for (const k of pick) dropped.add(wr[i][k])
        dropAt[g.start] = { amount: -g.amount, names: pick.map(k => wr[i][k].item) }
      })
    }
    const bS = dropped.size ? buildBase(rowsNow.filter(x => !dropped.has(x)), b0.saved) : b
    // 지난번에 '수집 못 한 결제'로 저장한 주는 이번에도 그렇게 본다. 다시 누르게 하지 않는다
    if (!keepMissed) {
      missed = Object.fromEntries(gaps.filter(g => g.note && readWeek(b.saved, g.start)?.miss
        && canMiss({ start: g.start, note: g.note, nexon: g.nexon, spent: g.collected, unknown: g.unknown }))
        .map(g => [g.start, true]))
    }
    // 블랙이면 툴팁에서 지금 이월 잔액을 읽는다. '유지까지'가 처음으로 남는 줄에서 이월이 바닥난다
    // (모자라서 가진 것을 다 썼으니까). 그러니 그 줄까지의 '사용 이월'을 더하면 지금 잔액이다.
    // 예) 1주 뒤 0 · 사용 93,090 / 2주 뒤 356,780 · 사용 117,620 → 잔액 210,710 (화면 아래 잔액과 같다).
    // 12줄 내내 0이면 이월이 끝까지 남는다는 뜻이라 잔액을 알 수 없다.
    // 블랙이 아니면 이월은 없다. 떨어졌다면 다 쓴 것이다
    // 툴팁 맨 아래 'MVP 블랙 구매 금액 이월' 줄을 읽었으면 그 잔액을 그대로 쓴다(12줄 내내 0이어도 안다)
    const drained = needTexts.findIndex(t => num(t) > 0)
    const carryNow = !isTop ? 0 : prev?.balance != null ? prev.balance
      : savedBalance != null ? savedBalance
      : drained >= 0 ? carry.slice(0, drained + 1).reduce((s, v) => s + v, 0) : null
    // 빨간 줄이 있으면 숫자부터 바로잡아야 한다. 그 전에는 범위를 셈해 봐야 소용없다
    const st = gaps.some(g => g.note && !missed[g.start]) ? null : settleScan(bS, r, carryNow)
    result = {
      ok: gaps.every(g => g.ok),
      issues: gaps.filter(g => g.note && !missed[g.start]).map(g => g.note),
      rows: gaps.map((g, i) => {
        const w = st?.weeks[i]
        const dr = dropAt[g.start]
        const cut = dr?.amount ?? 0
        return { start: g.start, end: addDays(g.start, 6),
                 spent: g.collected, amount: w ? w.pcMin : dr ? 0 : g.amount, minutes: g.minutes,
                 note: g.note,
                 warn: dr ? `${dr.names.join(', ')} ${won(cut)}원이 인게임 MVP에 들어가지 않았어요. 인게임 금액대로 저장해요.`
                   : w && w.pcMax > w.pcMin ? '' : g.warn,
                 unknown: w ? w.unknown : g.unknown,
                 pcMin: w?.pcMin, pcMax: w?.pcMax,
                 gapMin: w ? w.gapMin - cut : undefined, gapMax: w ? w.gapMax - cut : undefined, group: w?.group,
                 nexon: w && !w.unknown && !w.group ? g.collected + w.gapMin - cut : g.nexon }
      }),
      total, tierTh, pcTotal: gaps.reduce((s, g) => s + (dropAt[g.start] ? 0 : g.amount), 0),
      conflict: st?.conflict, carry: st?.carry,
    }
  }

  async function save() {
    busy = true
    try {
      // 구할 수 없었던 주를 0원으로 적어 두면 '확인했다'는 뜻이 돼 다시 물어볼 길이 없어진다.
      // 범위로만 아는 주는 최솟값을 금액으로, 범위는 옆에 따로 적는다
      const weeks = writeWeeks(rows.map(r => {
        const e = edited[r.start]
        if (e !== undefined) return { start: r.start, gapMin: e, gapMax: e, pcMin: e, pcMax: e, unknown: false }
        const gapMin = r.gapMin ?? r.amount
        // PC방이 아니라 수집 못 한 결제. 금액은 그대로 넣고 PC방 합계에서는 뺀다
        if (missed[r.start]) {
          return { start: r.start, gapMin, gapMax: r.gapMax ?? gapMin, pcMin: 0, pcMax: 0, unknown: false,
                   group: r.group, miss: true }
        }
        return { start: r.start, gapMin, gapMax: r.gapMax ?? gapMin, pcMin: r.pcMin ?? r.amount,
                 pcMax: r.pcMax ?? r.amount, unknown: !!r.unknown, group: r.group }
      }))
      // 인게임에서 본 이월 잔액. 다음부터 구매내역으로 되짚는 대신 이 값을 믿는다
      const b = getBase()
      // 이월 규칙으로 되짚지 못했으면(13주 밖에 우리가 모르는 결제가 있을 때 — 넥슨쇼핑 쿠폰 등)
      // 툴팁 '사용 이월 금액' 열의 합을 쓴다. 앞으로 꺼내 쓸 이월이라 잔액보다 클 수 없다.
      // 모르는 채로 두면 이월을 0으로 쳐서, 인게임은 블랙인데 레드로 보인다
      const used = carry.reduce((s, v) => s + v, 0)
      const anchor = result?.carry ?? (isTop && result?.conflict && used > 0 ? used : null)
      if (b && anchor != null) weeks[META.carry + b.thisWeek] = anchor
      // 쿠폰을 옮긴 채로 계산했으니 구매내역에도 옮겨 둔다. 보정값보다 먼저 적어야 다시 계산할 때 맞는다.
      // exe는 구매내역을 파이썬이 들고 있어 못 옮긴다. 다음에 맞출 때 같은 자리에서 다시 옮겨지니 결과는 같다
      if (app.web && moves.size) (await import('../web/api')).moveRows(moves)
      await pcroomSave(weeks)
      app.showPcRoom = false
    } finally {
      busy = false
    }
  }

  async function clear() {
    busy = true
    try {
      await pcroomClear()
      result = null
      edited = {}
    } finally {
      busy = false
    }
  }

  const hm = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`)

  // ---- 캡처에서 읽기 ----
  let scanMsg = $state('')
  let scanBad = $state(false)
  let scanPartial = $state(false)
  let scanning = $state(false)
  let prev: Solved | null = null   // 먼저 읽어 둔 값 (두 장에 나눠 찍을 때 이어 붙인다)
  // 읽어온 값은 확인용이라 기본은 접어 둔다. 중요한 건 아래 보정 결과다
  let openInput = $state(false)
  const doneCount = $derived(needTexts.filter(t => t.trim() !== '').length)
  const summary = $derived(
    doneCount === 0 ? '아직 비어 있어요 · 펼치면 직접 넣을 수 있어요'
      : `${curTier?.name ?? '등급 미정'} · ${(isTop ? carryText && `이월 ${carryText}` : remainText) || '?'} 캐시`
        + ` · ${doneCount}/12줄`)

  /** 이번 시도를 진단 기록에 남긴다. 계산까지 갔으면 그 오류·빨간 줄도 */
  function record(how: ScanLog['how'], raw: ScanRaw | null | undefined, extra: Partial<ScanLog> = {}) {
    const after = error || result?.issues.join(' ') || ''
    logScan({ at: Date.now(), how, ok: !scanBad, msg: scanMsg, ...(after ? { after } : {}), ...fromRaw(raw), ...extra })
  }

  async function grab(dataUrl = '') {
    scanning = true
    scanBad = scanPartial = false
    let raw: PcRoomScan | null = null
    try {
      const b = getBase()
      raw = await pcroomScan(dataUrl, prev?.scale ?? 0)
      if (!b || !raw.ok) {
        scanBad = true
        scanMsg = raw.message || '이미지를 읽지 못했어요.'
        return
      }
      const known = knownOf(b)
      const s = solveScan(raw, b.purchases, prev, looseOf(b), known)
      if (!s) {
        scanBad = true
        // 왜 실패했는지 말해 주지 않으면 매번 처음부터 원인을 찾게 된다
        const black = hasCarryColumn(raw)
        const col = raw.carries?.find(c => c.length === NO_CARRY.length) ?? NO_CARRY
        const ok = raw.readings.filter(v => acceptReading(
          v, b.purchases, carryFor(v, b.purchases, raw.carries, raw.amounts, looseOf(b), known, raw.carryVotes) ?? NO_CARRY, black, looseOf(b),
          known)).length
        scanMsg = !raw.readings.length
          ? `12줄 표를 찾지 못했어요. MVP 패널 위에 마우스를 올린 채로 찍어 주세요. `
            + `(화면에서 숫자 ${raw.amounts.length}개만 봤어요)`
          : ok
            ? `표는 읽었는데 어느 값이 맞는지 가릴 수 없었어요. `
              + `(후보 ${raw.readings.length}개 중 ${ok}개 통과, 숫자 ${raw.amounts.length}개)`
            // 최근까지 블랙이던 계정은 구매내역 대신 상단 '○○ 등급까지'로 맞춘다. 그게 안 찍혔으면 그렇다고 말한다
            : !black && relaxedShape(raw, b.purchases, looseOf(b).some(Boolean))
              ? "표는 읽었어요. 이월이 섞여 구매내역으로는 맞출 수 없는 계정이라 상단 '○○ 등급까지' 금액이 같이 있어야 해요. "
                + '툴팁과 상단 패널이 한 화면에 같이 보이게 찍거나, 화면 공유로 읽어 주세요.'
              : `표는 찾았는데 구매내역과 맞지 않아요. ${whyReject(raw.readings[0], b.purchases, col, black, looseOf(b), known)}`
        return
      }
      apply(s)
    } finally {
      scanning = false
      if (raw) record('file', raw, { size: raw.size })
    }
  }

  /** '○○ 등급까지' 후보 → (그 등급 자리, 남은 금액) */
  const choiceOf = (c: TotalPick) => {
    const i = d.tiers.findIndex(t => t.th === c.tierTh) + 1
    return { i, name: d.tiers[i]?.name ?? '', remaining: (d.tiers[i]?.th ?? 0) - c.total }
  }

  /** 후보 중 하나를 골랐거나 직접 넣었다. 그 숫자로 계산한다 */
  function choose(i: number, remaining: number) {
    choices = null
    ownText = ''
    nextIndex = i
    remainText = remaining.toLocaleString('ko-KR')
    scanPartial = false
    scanMsg = `${d.tiers[i]?.name ?? ''} 등급까지 ${remainText}캐시로 계산했어요.`
    calc()
  }

  /**
   * 다시 열었을 때 지난번 맞춘 값으로 칸을 채운다. 사이트는 읽은 12줄을 따로 두지 않고 주별 보정값만 두는데,
   * 보정값이 맞으면 그것으로 12줄·사용 이월·13주 합계가 인게임과 원 단위까지 같게 다시 나온다.
   * 목요일이 지났으면 주별 금액이 한 칸 밀리고(가장 오래된 주는 빠지고 새 주는 그동안의 결제로 채워진다)
   * 거기서 다시 계산한 12줄은 예상값이다. 새 주의 PC방처럼 구매내역에 없는 금액은 모른다.
   * 그래서 같은 주면 결과표까지 보여 주고, 지났으면 칸만 채우고 다시 읽어 달라고 한다
   */
  let savedBalance: number | null = null
  function fromSaved() {
    const b = getBase()
    const cur = b?.current
    if (!b || !cur || !Object.keys(b.saved).some(k => /^\d{4}-/.test(k))) return
    const ti = d.tiers.findIndex(t => t.key === cur.key)
    if (ti < 0) return
    const black = ti === d.tiers.length - 1
    const f = forecast(b.last13, b.carry).slice(0, 12)
    const col = black ? f.map(x => x.carryUsed) : NO_CARRY
    needTexts = f.map((x, i) => Math.max(0, cur.th - x.sum - col[i]).toLocaleString('ko-KR'))
    nextIndex = ti + 1
    carryText = col[0] ? col[0].toLocaleString('ko-KR') : ''
    carryRest = col.slice(1)
    remainText = black ? '' : (d.tiers[ti + 1].th - b.last13.reduce((a, x) => a + x, 0)).toLocaleString('ko-KR')
    savedBalance = black ? b.carry : null
    const at = d.fixedAt ?? 0
    const kst = (t: number) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10)
    if (at && weekStart(kst(at)) === b.thisWeek) {
      calc()
      scanMsg = `마지막 맞춤(${dayTime(at)})에 읽은 값이에요. 인게임과 같으면 그대로 두셔도 돼요.`
    } else {
      openInput = true
      scanPartial = true
      scanMsg = `${at ? `마지막 맞춤(${dayTime(at)}) 뒤 목요일이 지나 ` : ''}인게임 숫자가 바뀌었어요. `
        + '아래는 저장된 값으로 계산한 이번 주 예상값이에요. 다시 읽어 주세요.'
    }
  }
  onMount(fromSaved)

  /** 읽어낸 값을 입력칸에 넣는다. 캡처로 읽든 화면공유로 읽든 같다. */
  function apply(s: Solved) {
    savedBalance = null
    prev = s
    needTexts = s.needs.map(v => v.toLocaleString('ko-KR'))
    const f = panelFields(s)
    nextIndex = f.tierIndex
    if (s.choices?.length) {
      // 여러 숫자가 '○○ 등급까지'로 말이 된다. 인게임 화면을 보는 사람이 고르게 한다
      choices = s.choices
      nextIndex = choiceOf(s.choices[0]).i
      result = null
      scanPartial = true
      scanMsg = "상단 '○○ 등급까지' 금액이 여러 숫자로 읽혔어요. 인게임 화면과 같은 숫자를 골라 주세요."
      return
    }
    choices = null
    carryText = s.carry[0] ? s.carry[0].toLocaleString('ko-KR') : ''
    carryRest = s.carry.slice(1)
    if (f.remaining != null) remainText = f.remaining.toLocaleString('ko-KR')
    if (topTier(s)) {
      // 블랙은 위 등급이 없어 '○○ 등급까지'가 화면에 없다. 한 장 더 찍어도 나오지 않는다
      scanPartial = false
      scanMsg = '블랙이라 13주 합계가 화면에 안 나와요. 확정하지 못한 주는 아래에 범위로 보여 드려요.'
        + (s.balance != null ? ` (이월 잔액 ${s.balance.toLocaleString('ko-KR')}원 반영)`
          : usesCarry(s) ? ` (사용 이월 ${s.carry[0].toLocaleString('ko-KR')}원 반영)` : '')
      calc()
    } else if (s.total == null) {
      scanPartial = true
      scanMsg = "툴팁 12줄은 읽었어요. 상단 '○○ 등급까지'가 가려져 있어서 가장 오래된 주만 "
        + '알 수 없어요. 마우스를 치우고 한 장 더 찍어 주세요.'
    } else {
      scanPartial = false
      scanMsg = `읽었어요. 지금 13주 합계 ${s.total.toLocaleString('ko-KR')}원`
      calc()
    }
  }

  function fromFile(file: File | null | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    const fr = new FileReader()
    fr.onload = () => grab(String(fr.result))
    fr.readAsDataURL(file)
  }

  function onPaste(e: ClipboardEvent) {
    const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'))
    if (item) { e.preventDefault(); fromFile(item.getAsFile()) }
  }

  /** 붙여넣기 단추. 브라우저는 사용자가 누를 때만 클립보드를 열어 준다. */
  async function pasteFromClipboard() {
    scanning = true
    scanBad = scanPartial = false
    try {
      const items = await navigator.clipboard.read()
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'))
        if (!type) continue
        const blob = await it.getType(type)
        scanning = false
        fromFile(new File([blob], 'capture.png', { type }))
        return
      }
      scanBad = true
      scanMsg = '클립보드에 이미지가 없어요. 게임 화면에서 PrintScreen을 눌러 주세요.'
    } catch {
      scanBad = true
      scanMsg = '클립보드를 열지 못했어요. 권한을 허용하거나 Ctrl+V로 붙여넣어 주세요.'
    } finally {
      scanning = false
    }
  }

  // ---- 화면공유로 읽기 ----
  // 캡처 한 장에 다 담으려면 툴팁이 상단 패널을 가리지 않게 커서를 맞춰야 한다.
  // 화면을 계속 받으면 마우스를 올렸다 치우는 것만으로 둘 다 모인다.
  let sharing = $state(false)
  let shareState = $state<ShareStatus | null>(null)
  let stream = $state<MediaStream | null>(null)
  let screen = $state<HTMLVideoElement | null>(null)
  let handle: ShareHandle | null = null
  // 게임 위에 띄우는 안내 창. 열렸으면 화면을 못 봐도 지금 상황이 보인다
  let guided = $state(false)
  // 화면공유가 주된 길이다. 캡처는 그게 안 되는 자리를 위한 대비책
  const live1st = $derived(app.web && canLive)
  let showHelp = $state(false)
  // 모바일 브라우저에는 화면 공유가 없다
  const canLive = canShare() && !matchMedia('(pointer: coarse)').matches

  /** 안내 창이 처음에 못 열렸을 때. 누른 직후여야 열린다 */
  async function showGuide() {
    const g: Guide | null = await openGuide(() => handle?.stop(), () => handle?.save())
    guided = !!g
    handle?.setGuide(g)
  }

  $effect(() => {
    if (screen && stream) {
      screen.srcObject = stream
      screen.play().catch(() => {})
    }
  })

  // 공유를 시작하면 브라우저 창을 떠나 게임으로 가야 해서, 지금 무엇을 할 차례인지
  // 한눈에 보여야 한다. 진행에 따라 저절로 다음 줄로 넘어간다.
  const tell = $derived(guided ? '게임 위 안내 창과 소리로' : '소리로')
  const LIVE_STEPS = $derived([
    '공유 창에서 게임이 있는 화면을 고르세요',
    `게임에서 MVP 패널을 열고 그 위에 마우스를 올려 두세요 (읽으면 ${tell} 알려 드려요)`,
    `마우스를 패널 밖으로 치우세요 (다 읽으면 ${tell} 알려 드려요)`,
  ])
  const liveStep = $derived(
    !shareState?.shots ? 0 : !shareState.needs ? 1 : 2)

  // 화면에 적는 말과 알림으로 보내는 말이 같아야 한다. 둘 다 share의 판단을 쓴다
  const liveBlank = $derived(!!shareState?.shots && shareState.stage === 'blank')
  const liveHint = $derived(
    !shareState?.shots ? '공유할 화면을 고르면 시작돼요.' : STAGE[shareState.stage].body)

  async function live() {
    const b = getBase()
    if (!b || sharing) return
    primeChime()   // 누른 이 순간에 열어 둬야 브라우저가 소리를 허락한다
    scanBad = scanPartial = false
    scanMsg = ''
    shareState = null
    try {
      handle = await startShare({
        collected: b.purchases,
        loose: looseOf(b),
        known: knownOf(b),
        guide: async () => {
          const g = await openGuide(() => handle?.stop(), () => handle?.save())
          guided = !!g
          return g
        },
        onStream: s => (stream = s),
        onState: s => (shareState = s),
        onDone: s => apply(s),
        onStop: reason => {
          sharing = false
          guided = false
          stream = null
          handle = null
          if (reason) {
            scanBad = true
            scanMsg = `화면을 읽는 중에 끊겼어요. ${reason}`
          } else if (shareState?.solved) {
            // apply가 이미 채웠다
          } else if (shareState?.partial) {
            apply(shareState.partial)   // 12줄까지는 건졌다
          } else {
            scanBad = true
            scanMsg = !shareState?.shots ? '읽기 전에 멈췄어요.' : STAGE[shareState.stage].body
          }
          if (shareState?.shots) {
            record('share', shareState.last, { size: shareState.size, frames: shareState.shots,
                                               seen: shareState.seen, stage: shareState.stage })
          }
        },
      })
      sharing = true
    } catch (e) {
      // 공유 창에서 취소한 것은 잘못이 아니다
      const name = (e as Error)?.name
      if (name !== 'NotAllowedError' && name !== 'AbortError') {
        scanBad = true
        scanMsg = '화면 공유를 시작하지 못했어요. 브라우저가 지원하지 않거나 권한이 막혀 있어요.'
      }
    }
  }

  // 창을 닫으면 공유도 끊는다
  $effect(() => () => handle?.stop())
</script>

{#if showHelp}<HelpModal web={app.web && canLive} onClose={() => (showHelp = false)} />{/if}

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && (app.showPcRoom = false)}>
  <div class="sheet" role="dialog" aria-label="인게임 금액 맞추기" use:spotlight>
    <header>
      <h2>인게임 금액 맞추기 <small class="h2s">PC방 접속분 · 이월로 옮겨진 금액</small></h2>
      <span class="meta">
        {#if d.pcroom.missing.length}
          <em>13주 중 {d.pcroom.missing.length}주는 아직 몰라요</em>
        {:else if d.pcroom.totalMax}
          지금 적용 중 · {pcRange(d.pcroom)}원
        {:else}
          보정값 없음
        {/if}
      </span>
      <button class="help" onclick={() => (showHelp = true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.9 2.9 0 1 1 3.6 3.1c-.6.2-.8.7-.8 1.3v.4"/><path d="M12 17.2h.01"/></svg>
        <span>사용법</span>
      </button>
      <button class="x" onclick={() => (app.showPcRoom = false)} aria-label="닫기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </button>
    </header>

    <div class="body">
      <p class="why">
        프리미엄 PC방 접속분은 6분마다 100캐시씩 MVP 금액에 반영되는데 구매내역에는 잡히지 않아요.
        인게임 <b>MVP 패널</b>만 보여 주시면 읽어 드려요.
      </p>

      <section class="cap" aria-label="캡처로 불러오기"
        ondragover={e => e.preventDefault()}
        ondrop={e => { e.preventDefault(); fromFile(e.dataTransfer?.files?.[0]) }}>
        <div class="capmain">
          {#if live1st}
            <b>화면을 공유하면 알아서 읽어 드려요</b>
            <span>게임에서 MVP 패널을 열고 <b>그 위에 마우스를 올렸다 치우기만</b> 하면 돼요.
              게임 위에 작은 안내 창이 떠서 지금 무엇을 할 차례인지 알려 줍니다.</span>
            <span class="alt">캡처를 직접 찍어 붙여넣어도 돼요 —
              <kbd>Ctrl</kbd>+<kbd>V</kbd>, 끌어다 놓기, 파일 선택 모두 됩니다.</span>
          {:else}
            <b>게임에서 <kbd>PrintScreen</kbd>을 누른 뒤</b>
            <span>MVP 패널을 열고 그 위에 마우스를 올린 채로 찍어 주세요.
              {#if app.web}여기에 <kbd>Ctrl</kbd>+<kbd>V</kbd> 하거나 이미지를 끌어다 놓으면 읽어 드려요.
              {:else}이미지를 끌어다 놓거나 <kbd>Ctrl</kbd>+<kbd>V</kbd>도 돼요.{/if}</span>
          {/if}
        </div>
        {#if live1st}
          <button class="btn primary" disabled={scanning || sharing} onclick={live}>화면 공유로 읽기</button>
        {/if}
        <button class="btn" class:primary={!live1st} disabled={scanning}
          onclick={() => (app.web ? pasteFromClipboard() : grab())}>
          {#if scanning}<span class="spin" aria-hidden="true"></span>{/if}
          {scanning ? '읽는 중…' : '붙여넣기'}
        </button>
        <label class="chip file" class:off={scanning}>
          파일 선택
          <input type="file" accept="image/*" disabled={scanning} onchange={e => fromFile(e.currentTarget.files?.[0])} />
        </label>
      </section>

      {#if sharing}
        <section class="live" aria-label="화면 공유로 읽는 중">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={screen} muted playsinline></video>
          <div class="livebody">
            <b><span class="spin small" aria-hidden="true"></span>화면을 읽고 있어요</b>
            <ol class="lsteps">
              {#each LIVE_STEPS as s, i (s)}
                <li class:now={liveStep === i} class:ok={liveStep > i}>{s}</li>
              {/each}
            </ol>
            <span class="hint" class:warn={liveBlank}>{liveHint}</span>
            <div class="marks">
              <span class="mark" class:on={!!shareState?.needs}>툴팁 12줄</span>
              <span class="mark" class:on={!!shareState?.solved}>13주 합계</span>
              <small>{shareState?.shots ?? 0}장 확인</small>
            </div>
          </div>
          {#if !guided && canGuide()}
            <button class="chip call" onclick={showGuide}
              use:tip={'게임 위에 떠 있는 작은 안내 창을 띄워요'}>안내 창 띄우기</button>
          {/if}
          <button class="chip" onclick={() => handle?.stop()}>중지</button>
        </section>
      {/if}

      {#if scanning}
        <p class="scanmsg busy"><span class="spin small" aria-hidden="true"></span>캡처를 읽고 있어요…</p>
      {:else if scanMsg}
        <p class="scanmsg" class:bad={scanBad} class:warn={scanPartial}>{scanMsg}</p>
        {#if choices}
          {@const first = choiceOf(choices[0])}
          <!-- 화면의 숫자는 위치로 가리지 않고 전부 대 본다. 여럿이 말이 되면 인게임을 보는 사람이 고른다 -->
          <div class="choices" role="group" aria-label="상단 금액 고르기">
            {#each choices as c (c.tierTh + ':' + c.total)}
              {@const o = choiceOf(c)}
              <button class="chip mono" onclick={() => choose(o.i, o.remaining)}>
                {o.name} 등급까지 {won(o.remaining)}
              </button>
            {/each}
            <span class="own">
              <input class="mono" type="text" inputmode="numeric" placeholder="직접 입력" bind:value={ownText}
                onblur={() => (ownText = fmt(ownText))} aria-label="{first.name} 등급까지 직접 입력" />
              <button class="chip" disabled={!num(ownText)} onclick={() => choose(first.i, num(ownText))}>확인</button>
            </span>
          </div>
        {/if}
      {/if}

      <button class="fold" aria-expanded={openInput} onclick={() => (openInput = !openInput)}>
        <svg class="arw" class:open={openInput} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
        <b>읽어온 값 확인·수정</b>
        <small>{summary}</small>
      </button>

      {#if openInput}
      <!-- 인게임 상단 패널과 같은 모양 -->
      <section class="panel">
        <div class="prow">
          <span class="k">이번 주 등급</span>
          <b class="tier" style="--c:{curTier ? TIER_INK_VAR[curTier.key] : 'var(--color-tx3)'}">{curTier?.name ?? '등급 없음'}</b>
          <small>인게임 표시와 같아야 해요</small>
        </div>
        <div class="prow">
          <span class="k">
            <select bind:value={nextIndex} aria-label="화면에 적힌 등급">
              {#each d.tiers as t, i (t.key)}<option value={i}>{t.name} 등급까지</option>{/each}
              <option value={d.tiers.length}>블랙 (윗줄이 없어요)</option>
            </select>
          </span>
          {#if isTop}
            <small class="none">블랙은 위 등급이 없어 이 줄이 인게임에 없어요</small>
          {:else}
            <input type="text" inputmode="numeric" bind:value={remainText} placeholder="590,330"
              onblur={() => (remainText = fmt(remainText))} aria-label="남은 금액" />
            <small>캐시</small>
          {/if}
        </div>
        <div class="prow">
          <span class="k">{curTier?.name ?? ''} 등급 유지까지</span>
          <input type="text" inputmode="numeric" bind:value={keepText} placeholder="20,330"
            onblur={() => (keepText = fmt(keepText))} aria-label="유지 필요 금액" />
          <small>캐시 · 선택 (넣으면 1주차와 대조해요)</small>
        </div>
        {#if isTop}
          <!-- 블랙은 갱신 때 모자란 만큼 이월에서 자동으로 꺼내 쓴다.
               그만큼 1주 뒤 줄이 작게 적혀 있어서, 모르면 그 주 금액이 틀린다 -->
          <div class="prow">
            <span class="k">1주차 뒤 사용 이월 금액</span>
            <input type="text" inputmode="numeric" bind:value={carryText} placeholder="15,000"
              onblur={() => (carryText = fmt(carryText))} aria-label="사용 이월 금액" />
            <small>캐시 · 표 맨 오른쪽 열의 첫 줄이에요 (없으면 0)</small>
          </div>
        {/if}
      </section>

      <!-- 인게임 툴팁 표와 같은 4열 구조 -->
      <section class="tt">
        <div class="tr head">
          <span>주차</span><span>등급 설정일</span><span class="c">예상 등급</span><span class="r">현재 등급 유지까지</span>
        </div>
        {#each needTexts as _, i (i)}
          {@const p = predicted[i]}
          <div class="tr">
            <span class="wk">{i + 1} 주차 뒤</span>
            <span class="dt mono">{addDays(d.thisWeek, (i + 1) * 7)}</span>
            <span class="c tg" style="--c:{p?.tier ? TIER_INK_VAR[p.tier.key] : 'var(--color-tx3)'}">
              {#if !p}–{:else if p.bad}?{:else}{p.tier?.name ?? '없음'}{/if}
            </span>
            <span class="r in">
              <input type="text" inputmode="numeric" bind:value={needTexts[i]} placeholder="0"
                onblur={() => (needTexts[i] = fmt(needTexts[i]))} aria-label="{i + 1}주차 뒤 유지까지" />
              <em>캐시</em>
            </span>
          </div>
        {/each}
      </section>
      <p class="hint">
        <b>예상 등급</b> 열은 넣으신 숫자로 저희가 거꾸로 계산한 값이에요.
        인게임 표의 같은 열과 다르면 그 줄을 잘못 옮겨 적은 거예요.
      </p>

      <div class="acts">
        <button class="btn primary" disabled={!filled || busy} onclick={() => calc()}>주차별로 계산하기</button>
      </div>
      {/if}
      {#if error}<p class="err">{error}</p>{/if}

      {#if !rows.length && Object.keys(d.pcroom.weeks).length}
        <div class="acts"><button class="chip" disabled={busy} onclick={clear}>저장된 보정값 지우기</button></div>
      {/if}

      {#if rows.length}
        <section class="result">
          <div class="label">검수 · 이상한 값은 직접 고칠 수 있어요</div>
          <div class="grid">
            <div class="r2 head"><span>주</span><span class="n">인게임</span><span class="n">수집한 결제</span><span class="n">PC방</span><span class="n">환산</span></div>
            {#each rows as r (r.start)}
              {@const v = amountOf(r.start, r.amount)}
              <div class="r2" class:bad={!!r.note && !missed[r.start]} class:warn={!r.note && !!r.warn}
                   class:miss={missed[r.start]}
                   class:zero={v === 0} class:unsure={!!r.unknown}>
                <span class="mono wk2">{md(r.start)}–{md(r.end)}</span>
                <span class="n mono">{r.unknown || (r.group && edited[r.start] === undefined) ? '–'
                  : hiddenRow(r) && edited[r.start] === undefined
                  ? `${won(r.spent + (r.gapMin ?? 0))}~${won(r.spent + (r.gapMax ?? 0))}` : won(r.nexon)}</span>
                <span class="n mono dim">{won(r.spent)}</span>
                <span class="n">
                  {#if loose(r)}
                    <!-- 확정하지 못한 주는 고칠 값을 짐작할 수 없다. 범위를 보여 주고, 원하면 눌러서 직접 넣는다 -->
                    <button class="range mono" onclick={() => (edited[r.start] = r.unknown || r.group ? 0 : r.pcMin ?? 0)}
                      use:tip={'눌러서 직접 넣을 수 있어요'}>
                      {r.unknown ? '확인 불가' : r.group ? (r.group === r.start ? `합 ${won(groupSum(r.group))}` : '↑ 합')
                        : `${won(r.pcMin ?? 0)}~${won(r.pcMax ?? 0)}`}
                    </button>
                  {:else}
                    <input class="mono" type="text" inputmode="numeric" value={v.toLocaleString('ko-KR')}
                      aria-label="{md(r.start)} 주 PC방 금액"
                      onchange={e => (edited[r.start] = Number(e.currentTarget.value.replace(/[^\d]/g, '')) || 0)} />
                  {/if}
                </span>
                <span class="tm">{missed[r.start] ? '결제' : v && !loose(r) ? hm(Math.floor(v / 100) * 6) : '-'}</span>
              </div>
              {#if r.group && r.group === r.start && edited[r.start] === undefined}
                {@const g = groupOf(r.group)}
                <p class="msg">{md(g[0].start)}~{md(g[g.length - 1].end)} {g.length}주는 툴팁에 0으로 나와 합계만 알아요.
                  이 {g.length}주 PC방은 합쳐서 {won(groupSum(r.group))}원이에요.</p>
              {:else if r.unknown && edited[r.start] === undefined}
                <p class="msg">인게임에 이 주 금액이 나오지 않아요. 곧 13주에서 빠지는 주라 등급에는 영향이 없어요.</p>
              {:else if loose(r) && !r.group && hiddenRow(r)}
                <p class="msg">인게임에 이 주 금액이 나오지 않아요. 이월 잔액으로 거꾸로 맞춰 보면
                  PC방은 {won(r.pcMin ?? 0)}~{won(r.pcMax ?? 0)}원 사이예요.</p>
              {:else if loose(r) && !r.group}
                <p class="msg">목요일 갱신 때 쓴 이월 {won((r.gapMin ?? 0) - (r.pcMax ?? 0))}~{won((r.gapMax ?? 0) - (r.pcMin ?? 0))}원이
                  섞여 있어, PC방은 {won(r.pcMin ?? 0)}~{won(r.pcMax ?? 0)}원 사이까지만 알 수 있어요.</p>
              {:else if missed[r.start] && edited[r.start] === undefined}
                <p class="msg ok">
                  이 주 {v < 0 ? `${won(-v)}원을 빼서` : `${won(v)}원을 수집하지 못한 결제(넥슨쇼핑 쿠폰 등)로 넣어`} 인게임과 같은 금액으로 저장해요.
                  <button class="link" onclick={() => markMissed(r.start, false)}>되돌리기</button>
                </p>
              {:else if !r.group && (r.note || r.warn)}
                <p class="msg" class:bad={!!r.note}>
                  {r.note || r.warn}
                  {#if canMiss(r) && edited[r.start] === undefined}
                    <br>숫자를 잘못 읽었을 수도 있어요. 위 '읽어온 값 확인·수정'의 12줄이 게임 화면과 같은지 확인한 뒤 눌러 주세요.
                    <button class="link" onclick={() => markMissed(r.start, true)}>인게임 금액 그대로 저장하기</button>
                  {/if}
                </p>
              {/if}
              {#if movedIn[r.start]}
                <p class="msg ok">넥슨쇼핑 쿠폰 {won(movedIn[r.start])}원을 인게임에 맞춰 이 주로 옮겼어요. 쿠폰은 산 날이 아니라 등록한 주에 들어가요.</p>
              {/if}
            {/each}
          </div>

          {#if caveat}<p class="caveat">{caveat}</p>{/if}
          {#if result?.conflict}
            <p class="caveat bad">이월 규칙으로 되짚어 봤는데 인게임 숫자와 맞는 경우가 없었어요. 가운데 주는 그대로 믿어도 되지만,
              100원 단위가 아닌 주의 PC방은 범위로만 보여 드려요.</p>
          {/if}
          <div class="foot">
            <div class="sum">PC방 보정 합계
              <b class="mono">{pcRange(pcSum)}</b>원
              {#if missSum}<small>· 수집 못 한 결제 {missSum < 0 ? '−' : '+'}{won(Math.abs(missSum))}원</small>{/if}
              {#if result?.total != null}<small>· 13주 합계가 {won(result.total)}원이 돼요</small>{/if}
            </div>
            <div class="foot-btns">
              {#if Object.keys(d.pcroom.weeks).length}
                <button class="chip" disabled={busy} onclick={clear}>저장된 보정값 지우기</button>
              {/if}
              <button class="btn primary" disabled={busy || blocked} onclick={save}>저장하고 반영</button>
            </div>
          </div>
          {#if blocked}<p class="err">빨간 줄의 금액을 고치거나 '인게임 금액 그대로 저장하기'를 눌러야 저장할 수 있어요.</p>{/if}
        </section>
      {/if}
    </div>
  </div>
</div>

<svelte:window onkeydown={e => e.key === 'Escape' && (app.showPcRoom = false)} onpaste={onPaste} />

<style>
  /* 제목 글꼴(Orbit)을 물려받으면 자간이 벌어져 옆 '지금 적용 중'과 다른 글꼴로 보인다 */
  .h2s { margin-left: 6px; font-family: var(--font-sans); font-size: 12px; font-weight: 400; color: var(--color-tx3); }
  .unsure { opacity: .6 }
  .range { font-size: 12px; color: var(--color-peach); background: none; border: 1px dashed var(--color-line);
           border-radius: 6px; padding: 2px 6px; cursor: pointer; white-space: nowrap; }
  .caveat { white-space: pre-line; margin: 10px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 12.5px; line-height: 1.6;
            color: var(--color-tx2); background: color-mix(in oklab, var(--color-peach) 10%, transparent); }
  .caveat.bad { background: color-mix(in oklab, var(--color-rose, #f87171) 12%, transparent); }
  .none { color: var(--color-tx3) }

  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 40;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 72%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(820px, 100%); max-height: 100%;
    display: flex; flex-direction: column;
    background: var(--color-panel); border: 1px solid var(--color-line2); border-radius: 22px;
    box-shadow: 0 30px 90px -30px rgba(0, 0, 0, .85); overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 12px; padding: 18px 20px 12px; }
  /* 제목 옆 작은 글씨들은 글자 밑선을 맞춘다(가운데 맞춤이면 큰 제목 옆에서 위로 떠 보인다) */
  h2 { font-family: var(--font-display); font-weight: 400; font-size: 19px; margin: 0; align-self: baseline; }
  .meta { font-size: 12px; color: var(--color-tx3); align-self: baseline; }
  .meta em { font-style: normal; color: var(--color-butter); }
  .help {
    margin-left: auto; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px;
    display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px;
    border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2);
  }
  .help:hover { color: var(--color-tx); border-color: var(--color-lav); }
  .help svg { width: 15px; height: 15px; }
  .x { appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer; display: grid; place-items: center; border: 1px solid var(--color-line); background: var(--color-panel2); color: var(--color-tx2); }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 15px; height: 15px; }

  .body { overflow-y: auto; padding: 0 20px 20px; }
  .why { font-size: 12.5px; line-height: 1.65; color: var(--color-tx2); background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 12px; padding: 11px 13px; margin: 0 0 14px; }
  .why b { color: var(--color-tx); }

  .cap {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px;
    padding: 11px 13px; border-radius: 12px; background: var(--color-bg2);
    border: 1px dashed color-mix(in oklab, var(--color-lav) 45%, var(--color-line));
    transition: border-color .2s, opacity .2s;
  }
  .spin {
    display: inline-block; width: 12px; height: 12px; margin-right: 2px; border-radius: 50%;
    border: 2px solid color-mix(in oklab, currentColor 30%, transparent); border-top-color: currentColor;
    animation: spin .8s linear infinite; vertical-align: -1px;
  }
  .spin.small { width: 11px; height: 11px; border-width: 1.8px; margin-right: 6px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .file.off { opacity: .45; pointer-events: none; }
  .choices { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0 10px; }
  .choices .own { display: inline-flex; gap: 6px; align-items: center; }
  .choices input { width: 110px; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--color-line); background: transparent; color: inherit; }
  .scanmsg.busy { color: var(--color-tx2); display: flex; align-items: center; }
  .capmain { flex: 1 1 320px; min-width: 0; display: grid; gap: 2px; }
  .capmain b { font-size: 13px; color: var(--color-tx); }
  .capmain span { font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  .capmain .alt { color: var(--color-tx4, var(--color-tx3)); opacity: .8; }
  kbd {
    font: inherit; font-family: var(--font-mono); font-size: 11.5px; padding: 1px 6px;
    border-radius: 6px; border: 1px solid var(--color-line2); background: var(--color-panel2);
  }
  .file { position: relative; overflow: hidden; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  /* 화면공유로 읽는 동안 */
  .live {
    display: flex; align-items: center; gap: 12px; margin: -4px 0 14px;
    padding: 11px 13px; border-radius: 12px; background: var(--color-bg2);
    border: 1px solid color-mix(in oklab, var(--color-lav) 55%, var(--color-line));
  }
  .live video {
    flex: none; width: 168px; height: 96px; border-radius: 8px; object-fit: contain;
    background: #000; border: 1px solid var(--color-line);
  }
  .livebody { flex: 1 1 220px; min-width: 0; display: grid; gap: 5px; }
  .lsteps { list-style: none; margin: 1px 0 2px; padding: 0; display: grid; gap: 3px; counter-reset: s; }
  .lsteps li {
    position: relative; padding-left: 20px; font-size: 11.5px; line-height: 1.45;
    color: var(--color-tx3); counter-increment: s; transition: color .2s;
  }
  .lsteps li::before {
    content: counter(s); position: absolute; left: 0; top: 1px;
    width: 14px; height: 14px; border-radius: 50%; font-size: 9.5px; line-height: 14px;
    text-align: center; color: var(--color-tx3); background: var(--color-panel2);
    border: 1px solid var(--color-line2);
  }
  .lsteps li.now { color: var(--color-tx); font-weight: 600; }
  .lsteps li.now::before { color: var(--color-on-accent); background: var(--color-lav); border-color: var(--color-lav); }
  .lsteps li.ok { color: var(--color-tx3); }
  .lsteps li.ok::before {
    content: '¹3'; color: var(--color-good);
    border-color: color-mix(in oklab, var(--color-good) 45%, transparent);
    background: color-mix(in oklab, var(--color-good) 14%, transparent);
  }
  .livebody b { display: flex; align-items: center; font-size: 13px; color: var(--color-tx); }
  .hint { font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  .hint.warn { color: var(--color-peach); }
  .marks { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; margin-top: 2px; }
  .mark {
    font-size: 11px; padding: 2px 8px; border-radius: 999px; color: var(--color-tx3);
    border: 1px solid var(--color-line2); background: var(--color-panel2);
    transition: color .2s, border-color .2s, background .2s;
  }
  /* 표시가 켜져도 폭이 변하지 않게 자리를 미리 잡아 둔다 */
  .mark::before { content: '✓ '; opacity: 0; }
  .mark.on::before { opacity: 1; }
  .mark.on {
    color: var(--color-good);
    border-color: color-mix(in oklab, var(--color-good) 45%, transparent);
    background: color-mix(in oklab, var(--color-good) 14%, transparent);
  }
  .marks small { font-size: 11px; color: var(--color-tx3); }

  .scanmsg { margin: -6px 2px 12px; font-size: 12px; color: var(--color-good); line-height: 1.55; }
  .scanmsg.warn { color: var(--color-peach); }
  .scanmsg.bad { color: var(--color-bad); }

  /* 인게임 상단 패널 */
  .panel { border: 1px solid var(--color-line2); border-radius: 12px; overflow: hidden; background: var(--color-bg2); }
  .prow { display: flex; align-items: center; gap: 9px; padding: 8px 12px; border-top: 1px solid var(--color-line); }
  .prow:first-child { border-top: 0; }
  .prow .k { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--color-tx2); min-width: 168px; }
  .prow small { font-size: 11.5px; color: var(--color-tx3); }
  .tier { font-size: 14px; color: var(--c); }

  /* 인게임 툴팁 표 */
  .tt { margin-top: 14px; border: 1px solid var(--color-line2); border-radius: 12px; overflow: hidden; }
  .tr { display: grid; grid-template-columns: 82px 108px 1fr 190px; gap: 10px; align-items: center; padding: 5px 12px; border-top: 1px solid var(--color-line); font-size: 12.5px; }
  .tr:first-child { border-top: 0; }
  .tr.head { background: var(--color-panel2); color: var(--color-tx3); font-size: 11.5px; padding: 8px 12px; }
  .tr:not(.head):nth-child(even) { background: color-mix(in oklab, var(--color-bg2) 55%, transparent); }
  .wk { color: var(--color-tx2); }
  .dt { font-size: 11.5px; color: var(--color-tx3); }
  .c { text-align: center; }
  .r { text-align: right; }
  .tg { color: var(--c); font-weight: 600; }
  .in { display: flex; align-items: center; justify-content: flex-end; gap: 6px; }
  .in em { font-style: normal; font-size: 11px; color: var(--color-tx3); width: 24px; }
  .hint { font-size: 11.5px; line-height: 1.6; color: var(--color-tx3); margin: 8px 2px 0; }
  .hint b { color: var(--color-tx2); }

  input[type=text], select {
    font: inherit; font-size: 13px; color: var(--color-tx); color-scheme: inherit;
    background: var(--color-panel); border: 1px solid var(--color-line); border-radius: 9px;
    padding: 6px 9px; outline: none; min-width: 0;
  }
  input[type=text] { width: 116px; font-family: var(--font-mono); text-align: right; }
  input:focus, select:focus { border-color: var(--color-lav); }

  .acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
  .btn { appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 9px 15px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx); }
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: var(--color-on-accent); }
  .btn:disabled { opacity: .45; cursor: default; }
  .chip { appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; padding: 9px 13px; border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .chip:hover:not(:disabled) { color: var(--color-tx); border-color: var(--color-line2); }
  /* 크기는 그대로 두고 테두리 빛만 번지게 한다 */
  .chip.call {
    color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 65%, transparent);
    animation: call 2.2s ease-out infinite;
  }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 55%, transparent); }
    70%, 100% { box-shadow: 0 0 0 11px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .chip.call { animation: none; } }
  .err { font-size: 12.5px; color: var(--color-bad); margin: 10px 0 0; }
  .label { font-size: 12px; color: var(--color-tx3); margin: 18px 0 7px; }
  .fold {
    width: 100%; appearance: none; cursor: pointer; font: inherit; text-align: left;
    display: flex; align-items: center; gap: 8px; padding: 9px 12px; margin-bottom: 12px;
    border-radius: 11px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
  }
  .fold:hover { border-color: var(--color-line2); color: var(--color-tx); }
  .fold b { font-size: 12.5px; font-weight: 600; flex: none; }
  .fold small { margin-left: auto; font-size: 11.5px; color: var(--color-tx3); text-align: right; }
  .arw { width: 14px; height: 14px; flex: none; color: var(--color-tx3); transition: transform .2s; }
  .arw.open { transform: rotate(90deg); }
  .foot-btns { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .grid { border: 1px solid var(--color-line); border-radius: 12px; overflow: hidden; }
  .r2 { display: grid; grid-template-columns: minmax(96px, 1.3fr) 1fr 1fr 124px 86px; gap: 8px; align-items: center; padding: 5px 11px; border-top: 1px solid var(--color-line); font-size: 12.5px; }
  .r2:first-child { border-top: 0; }
  .r2.head { background: var(--color-panel2); color: var(--color-tx3); font-size: 11.5px; padding: 8px 11px; }
  .r2.zero { color: var(--color-tx3); }
  .r2.bad { background: color-mix(in oklab, var(--color-bad) 12%, transparent); }
  .r2.warn { background: color-mix(in oklab, var(--color-peach) 11%, transparent); }
  .n { text-align: right; }
  .r2 .dim { color: var(--color-tx3); }
  .wk2 { font-size: 11.5px; }
  .tm { font-size: 11.5px; color: var(--color-tx3); text-align: right; }
  .r2 input { width: 100%; padding: 5px 8px; font-size: 12.5px; }
  .msg { margin: 0; padding: 4px 11px 8px; font-size: 11.5px; color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 11%, transparent); }
  .msg.bad { color: var(--color-bad); background: color-mix(in oklab, var(--color-bad) 12%, transparent); }
  .msg.ok { color: var(--color-sky); background: color-mix(in oklab, var(--color-sky) 10%, transparent); }
  .r2.miss { background: color-mix(in oklab, var(--color-sky) 8%, transparent); }
  .msg .link {
    appearance: none; border: 0; background: none; cursor: pointer; padding: 0; margin-left: 6px;
    font: inherit; font-weight: 600; color: inherit; text-decoration: underline;
  }

  .foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
  .sum { font-size: 13px; color: var(--color-tx2); }
  .sum b { font-size: 16px; color: var(--color-tx); }
  .sum small { color: var(--color-tx3); font-size: 12px; }
  /*
   * 좁은 화면.
   *
   * 표는 열이 넷·다섯이라 줄이면 글자가 겹친다. 폭을 지키고 가로로 민다
   * (구매내역 표·차트와 같은 방식). 나머지는 여백과 글자를 한 단 줄인다.
   * (중단점은 app.css에 적어 둔 좁은 화면 기준값 672)
   */
  @media (max-width: 672px) {
    .back { padding: 10px; }
    header { gap: 8px; padding: 14px 14px 10px; }
    h2 { font-size: 17px; }
    .meta { display: none; }
    .help { padding: 7px 9px; }
    .help span { display: none; }
    .body { padding: 0 14px 16px; }
    .why { padding: 10px 11px; font-size: 12px; }

    .tt, .grid { overflow-x: auto; }
    .tr { min-width: 430px; }
    .r2 { min-width: 452px; }
    /* 설명 줄의 이름칸이 넓어 값이 밖으로 밀렸다 */
    .prow .k { min-width: 0; }
    .cap, .live { padding: 10px 11px; }
  }
</style>