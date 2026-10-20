<script lang="ts">
  /**
   * 효율표 탭. 위에서 몇 칸만 채우면 맨 아래에 '실제로 나가는 돈'과 따라 할 순서가 나온다.
   * 결론 카드가 화면 밖에 있으면 아래에 작은 막대로 따라온다.
   */
  import { onMount } from 'svelte'
  import gsap from 'gsap'
  import EffAmount from './EffAmount.svelte'
  import EffCash from './EffCash.svelte'
  import EffCredit from './EffCredit.svelte'
  import EffItems from './EffItems.svelte'
  import EffLedger from './EffLedger.svelte'
  import EffMarket from './EffMarket.svelte'
  import EffResult from './EffResult.svelte'
  import EffStyles from './EffStyles.svelte'
  import { app, getBase } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { computeEff, eff, effWeek, feeNow, keepSnap, ledgerOf, planWeeks, tierAfter, weeksWithRows, whatOf } from '../eff.svelte'
  import { feeOf } from '../core/efficiency'
  import { REDUCED, addDays, md, mdy, won, spotlight } from '../format'
  import { untrack } from 'svelte'
  import { weekStart } from '../core/mvp'

  const d = $derived(app.data!)

  // ---- 주 옮기기: 구매내역이 있는 지난 주들 · 이번 주 · 다음 주(계획이 있으면 미리 보기) ----
  const planOk = $derived(!!planner.result && !planner.result.error)
  const next = $derived(addDays(d.thisWeek, 7))
  const list = $derived([
    ...(planOk && eff.usePlan ? [next] : []), d.thisWeek,
    ...weeksWithRows(getBase()?.rows ?? []).filter(w => w < d.thisWeek),
  ])
  const week = $derived(effWeek.sel && list.includes(effWeek.sel) ? effWeek.sel : d.thisWeek)
  const at = $derived(list.indexOf(week))
  const go = (i: number) => { const w = list[i]; if (w) effWeek.sel = w === d.thisWeek ? '' : w }
  const pickWeek = (w: string) => { effWeek.sel = w === d.thisWeek ? '' : w }
  /** 주마다 구매내역 합계(주 목록에 보여 준다) */
  const spent = $derived.by(() => {
    const m = new Map<string, number>()
    for (const r of getBase()?.rows ?? []) { const w = weekStart(r.date); m.set(w, (m.get(w) ?? 0) + r.price) }
    return m
  })
  const past = $derived(week < d.thisWeek)
  const label = (w: string) => w === d.thisWeek ? '이번 주' : w === next ? '다음 주 · 미리 보기' : w === addDays(d.thisWeek, -7) ? '지난 주' : `${Math.round((Date.parse(d.thisWeek) - Date.parse(w)) / 6048e5)}주 전`
  const out = $derived(computeEff(d, planner.result, getBase()?.rows ?? []))
  let sel = $state(0)
  const cur = $derived(out ? out.sel.weeks[Math.min(sel, out.sel.weeks.length - 1)] : null)
  const pw = $derived(eff.usePlan ? planWeeks(d, planner.result) : null)
  const mode = $derived<'plan' | 'amount'>(pw ? 'plan' : 'amount')
  // 결과가 아직 없어도 수수료 안내는 해 준다
  const tier = $derived(cur ? cur.w.tier : pw ? pw[0].tier : tierAfter(d, eff.amount))
  const fee = $derived(cur ? cur.w.fee : eff.feeOverride ?? feeOf(tier))
  const used = $derived(new Set(cur?.route.lines.map(l => l.item.id) ?? []))

  /**
   * 이번 주 시세와 짠 루트를 떠 둔다. 지난 주 결산은 이 값으로 센다(그 주에 효율표를 한 번도 안 열었으면 지금 시세로)
   */
  const WANT_NAME = { best: '최저가', knee: '최적화', count: '횟수 정하기', custom: '직접 짜기' } as const
  $effect(() => {
    if (past || week !== d.thisWeek) return
    const fee = feeNow(d.current)
    const r = out?.mode === 'plan' ? out.sel.weeks[0] : null
    const planned = r ? { label: WANT_NAME[eff.want], what: whatOf(r.route), pay: r.route.pay, cost: r.route.cost, back: r.route.back + (r.credit?.back ?? 0), loss: r.loss } : undefined
    const rows = getBase()?.rows ?? []
    untrack(() => keepSnap(fee, planned, rows))
  })

  /**
   * 아래 따라오는 막대: 결론(루트)이 있으면 결론으로, 없으면(이번 주 목표를 다 채웠거나 지난 주를 볼 때) 그 주 결산으로 데려간다.
   * 결론이 없을 때 막대까지 사라졌다(2026-10-16 사용자)
   */
  const led = $derived(week <= d.thisWeek ? ledgerOf(getBase()?.rows ?? [], week, feeNow(d.current), d.current) : null)
  const target = $derived(out && !past ? 'eff-answer' : 'eff-ledger')
  let answerSeen = $state(true)
  let grid: HTMLElement
  onMount(() => {
    if (!REDUCED) gsap.from(grid.children, { y: 22, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' })
  })
  // 보는 주나 결론 유무가 바뀌면 지켜볼 칸도 바뀐다. 칸이 그려진 뒤에 붙인다
  $effect(() => {
    const id = target
    void week
    if (typeof IntersectionObserver === 'undefined') return
    let io: IntersectionObserver | undefined
    const t = setTimeout(() => {
      const el = document.getElementById(id)
      if (!el) return
      io = new IntersectionObserver(([e]) => (answerSeen = e.isIntersecting), { threshold: 0 })
      io.observe(el)
    })
    return () => { clearTimeout(t); io?.disconnect() }
  })
  const toAnswer = () => document.getElementById(target)?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' })
</script>

<div class="grid" bind:this={grid}>
  <!-- 위는 설정, 아래는 결과(2026-10-16 사용자). 주를 옮겨도 설정 칸은 그대로 두고 아래 결과만 바뀐다 -->
  <div class="c4"><EffAmount /></div>
  <div class="c4 wide"><EffCash /></div>
  <div class="c4"><EffMarket {tier} {mode} /></div>
  <div class="c12"><EffItems {fee} {used} /></div>
  <div class="c12"><EffCredit {out} {fee} /></div>
  <!-- 주 옮기기. 주를 바꿔도 버튼이 움직이지 않게 폭을 고정하고, 내려가면 화면 위에 붙어 따라온다(2026-10-16 사용자) -->
  <div class="c12 navbar">
    <nav class="card weeknav" aria-label="주 옮기기" use:spotlight>
      <button class="arr" onclick={() => go(at + 1)} disabled={at >= list.length - 1} aria-label="앞 주">◀</button>
      <!-- 가운데 글자를 누르면 주 목록이 열려 여러 주를 한 번에 건너뛴다 -->
      <span class="wk">
        <b>{label(week)} <i aria-hidden="true">▾</i></b><span class="mono">{mdy(week, d.thisWeek)} – {md(addDays(week, 6))}</span>
        <select value={week} onchange={e => pickWeek(e.currentTarget.value)} aria-label="주 고르기">
          {#each list as w (w)}<option value={w}>{label(w)} · {mdy(w, d.thisWeek)} – {md(addDays(w, 6))}{spent.get(w) ? ` · ${won(spent.get(w)!)}원` : ''}</option>{/each}
        </select>
      </span>
      <button class="arr" onclick={() => go(at - 1)} disabled={at <= 0} aria-label="뒤 주">▶</button>
      <button class="link" class:gone={week === d.thisWeek} onclick={() => (effWeek.sel = '')} tabindex={week === d.thisWeek ? -1 : 0}>이번 주로</button>
      <span class="navhint">{past ? '지난 주는 그 주 구매내역과 그때 시세로 셉니다. 위 설정은 이번 주 계산에 쓰여요.' : ''}</span>
    </nav>
  </div>
  <!-- 주 결과. 결산이 짧은 주로 옮겨도 페이지가 줄어 스크롤이 당겨지지 않게(위 버튼이 오르내렸다) 화면 높이만큼은 늘 차지한다 -->
  <div class="c12 results">
    {#if week <= d.thisWeek}<EffLedger {week} />{/if}
    {#if !past}
      <EffResult {out} bind:sel />
      <EffStyles {out} />
    {/if}
  </div>
</div>

{#if !answerSeen && target === 'eff-ledger' && led?.lines.length}
  <button class="dock" onclick={toAnswer}>
    <span>{label(week)} 결산 · 판매 {led.sales}회</span><b class="mono">{won(led.loss)}원</b>
    <span>회수율 {(led.cost ? led.back / led.cost * 100 : 0).toFixed(1)}%</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
  </button>
{:else if out && !answerSeen && target === 'eff-answer'}
  <button class="dock" onclick={toAnswer}>
    <span>{eff.want === 'count' ? `${out.sel.sales}회 판매 루트` : `${eff.want === 'knee' ? '최적화' : '최저가'} 루트 · ${out.sel.sales}회 판매`}</span><b class="mono">{won(out.sel.loss)}원</b>
    <span>회수율 {(out.sel.back / out.sel.cost * 100).toFixed(1)}%</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
  </button>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; padding: 16px; max-width: 1560px; margin: 0 auto; }
  .grid > div { grid-column: span 12; display: grid; min-width: 0; }
  /* 카드 안의 넓은 표가 카드를 밀어 화면 밖으로 넘치지 않게 한다. 표는 제 칸 안에서 옆으로 넘긴다 */
  .grid > div > :global(*) { min-width: 0; }
  @media (min-width: 1296px) {
    .c4 { grid-column: span 4 !important; }
    .c4.wide { grid-column: span 5 !important; }
    .c4:first-child { grid-column: span 3 !important; }
  }
  /*
   * 노트북 폭(1280 등): 왼쪽에 1번·3번을 쌓고 오른쪽에 키가 큰 2번을 둔다.
   * 전에는 2번이 한 줄을 다 써서 결제수단 줄 오른쪽 절반이 비었다(2026-10-17 사용자)
   */
  @media (min-width: 912px) and (max-width: 1295px) {
    /* 2번이 더 길면 남는 높이는 아래 3번이 받는다(1번 가운데가 비지 않게) */
    .grid { grid-template-rows: auto 1fr; }
    .c4:first-child { grid-column: 1 / span 5 !important; grid-row: 1; }
    .c4.wide { grid-column: 6 / span 7 !important; grid-row: 1 / span 2; }
    .c4:not(:first-child):not(.wide) { grid-column: 1 / span 5 !important; grid-row: 2; }
  }
  .weeknav { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .weeknav .arr {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--color-tx2); width: 34px; height: 34px; border-radius: 10px;
    background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .weeknav .arr:disabled { opacity: .35; cursor: default; }
  .results { display: grid; gap: 14px; align-content: start; min-height: calc(100dvh - 140px); }
  /* 주 옮기기도 다른 칸과 같은 카드 모양. 내려가면 화면 위에 붙어 따라온다 */
  .navbar { position: sticky; top: 8px; z-index: 15; }
  .weeknav.card { padding: 10px 14px; box-shadow: 0 10px 28px rgba(0, 0, 0, .28); }
  .weeknav .wk { position: relative; display: grid; text-align: center; width: 190px; border-radius: 10px; }
  .weeknav .wk:hover { background: var(--color-bg2); }
  .weeknav .wk i { font-style: normal; font-size: 11px; color: var(--color-tx3); }
  /* 글자 위에 투명한 목록을 덮어, 누르면 바로 주 목록이 열린다 */
  .weeknav .wk select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 14px; }
  .weeknav .link.gone { visibility: hidden; }
  .weeknav .wk b { font-size: 15px; }
  .weeknav .wk span { font-size: 12px; color: var(--color-tx3); }
  .weeknav .navhint { font-size: 12px; color: var(--color-tx3); }
  .weeknav .link { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--color-lav); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .dock {
    position: sticky; bottom: 14px; z-index: 20; display: flex; align-items: center; gap: 12px; margin: 0 auto 14px; width: fit-content;
    appearance: none; cursor: pointer; font: inherit; font-size: 12.5px; color: var(--color-tx3);
    padding: 9px 16px; border-radius: 14px; background: color-mix(in oklab, var(--color-panel3) 94%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-lav) 40%, var(--color-line2)); box-shadow: 0 14px 36px rgba(0, 0, 0, .4);
    backdrop-filter: blur(10px); animation: rise .25s ease-out;
  }
  .dock b { font-size: 17px; color: var(--color-tx); }
  .dock svg { width: 16px; height: 16px; color: var(--color-lav); }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
  /* 폰: 양끝에 붙고 글자가 접혔다. 회수율은 빼고 한 줄로 */
  @media (max-width: 672px) {
    .dock { max-width: calc(100% - 24px); gap: 10px; padding: 8px 12px; }
    .dock span { white-space: nowrap; }
    .dock span:nth-of-type(2) { display: none; }
  }
</style>
