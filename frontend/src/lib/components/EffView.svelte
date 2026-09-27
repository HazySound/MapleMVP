<script lang="ts">
  /**
   * 효율표 탭. 위에서 몇 칸만 채우면 맨 아래에 '실제로 나가는 돈'과 따라 할 순서가 나온다.
   * 결론 카드가 화면 밖에 있으면 아래에 작은 막대로 따라온다.
   */
  import { onMount } from 'svelte'
  import gsap from 'gsap'
  import EffAmount from './EffAmount.svelte'
  import EffCash from './EffCash.svelte'
  import EffItems from './EffItems.svelte'
  import EffMarket from './EffMarket.svelte'
  import EffResult from './EffResult.svelte'
  import { app } from '../store.svelte'
  import { planner } from '../plan.svelte'
  import { computeEff, eff, planWeeks, tierAfter } from '../eff.svelte'
  import { feeOf } from '../core/efficiency'
  import { REDUCED, won } from '../format'

  const d = $derived(app.data!)
  const out = $derived(computeEff(d, planner.result))
  let sel = $state(0)
  const cur = $derived(out?.weeks ? out.weeks[Math.min(sel, out.weeks.length - 1)] : null)
  // 결과가 아직 없어도 수수료 안내는 해 준다
  const tier = $derived.by(() => {
    if (cur) return cur.tier
    const pw = eff.usePlan ? planWeeks(d, planner.result) : null
    return pw ? pw[0].tier : tierAfter(d, eff.amount)
  })
  const fee = $derived(eff.feeOverride ?? feeOf(tier))
  const used = $derived(new Set(cur?.route.lines.map(l => l.item.id) ?? []))

  let answerSeen = $state(true)
  let grid: HTMLElement
  onMount(() => {
    if (!REDUCED) gsap.from(grid.children, { y: 22, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' })
    const el = document.getElementById('eff-answer')
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([e]) => (answerSeen = e.isIntersecting), { threshold: 0.2 })
    io.observe(el)
    return () => io.disconnect()
  })
  const toAnswer = () => document.getElementById('eff-answer')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' })
</script>

<div class="grid" bind:this={grid}>
  <div class="c4"><EffAmount /></div>
  <div class="c4 wide"><EffCash /></div>
  <div class="c4"><EffMarket {tier} /></div>
  <div class="c12"><EffItems {fee} {used} /></div>
  <div class="c12"><EffResult {out} bind:sel /></div>
</div>

{#if out?.weeks && !answerSeen}
  <button class="dock" onclick={toAnswer}>
    <span>실제로 나가는 돈</span><b class="mono">{won(out.loss)}원</b>
    <span>회수율 {(out.back / out.cost * 100).toFixed(1)}% · {out.sales}회</span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
  </button>
{/if}

<style>
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; padding: 16px; max-width: 1560px; margin: 0 auto; }
  .grid > div { grid-column: span 12; display: grid; min-width: 0; }
  @media (min-width: 1296px) {
    .c4 { grid-column: span 4 !important; }
    .c4.wide { grid-column: span 5 !important; }
    .c4:first-child { grid-column: span 3 !important; }
  }
  @media (min-width: 912px) and (max-width: 1295px) {
    .c4 { grid-column: span 6 !important; }
    .c4.wide { grid-column: span 12 !important; order: 3; }
    .c12 { order: 4; }
  }
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
</style>
