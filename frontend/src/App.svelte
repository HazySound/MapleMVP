<script lang="ts">
  import gsap from 'gsap'
  import { onMount } from 'svelte'
  import Aurora from './lib/components/Aurora.svelte'
  import DeadlineCard from './lib/components/DeadlineCard.svelte'
  import DecayChart from './lib/components/DecayChart.svelte'
  import GradeCard from './lib/components/GradeCard.svelte'
  import HistoryModal from './lib/components/HistoryModal.svelte'
  import Ladder from './lib/components/Ladder.svelte'
  import Overlay from './lib/components/Overlay.svelte'
  import Payments from './lib/components/Payments.svelte'
  import PlanChart from './lib/components/PlanChart.svelte'
  import PlanGoal from './lib/components/PlanGoal.svelte'
  import PlanSummary from './lib/components/PlanSummary.svelte'
  import PlanTable from './lib/components/PlanTable.svelte'
  import ResizeHandles from './lib/components/ResizeHandles.svelte'
  import Simulator from './lib/components/Simulator.svelte'
  import TitleBar from './lib/components/TitleBar.svelte'
  import WeeklyBars from './lib/components/WeeklyBars.svelte'
  import { REDUCED } from './lib/format'
  import { planner } from './lib/plan.svelte'
  import { app, boot, refresh, setExtra } from './lib/store.svelte'

  onMount(() => { boot() })

  function onKey(e: KeyboardEvent) {
    if (e.key === 'F5') { e.preventDefault(); refresh(); return }
    if (!app.data || app.view !== 'dash') return
    if (e.key === 'Escape') { setExtra(0, true); return }
    if ((e.target as HTMLElement).matches('input')) return
    if (/^[1-6]$/.test(e.key)) app.target = app.data.tiers[Number(e.key) - 1].key
  }

  /** 대시보드가 처음 나타날 때 카드들이 차례로 올라온다 */
  function intro(node: HTMLElement) {
    if (REDUCED) return
    gsap.from(node.children, { y: 22, opacity: 0, duration: 0.7, stagger: 0.07, ease: 'power3.out', clearProps: 'transform,opacity' })
  }
</script>

<svelte:window onkeydown={onKey} />

<Aurora />
<div class="shell">
  <TitleBar />
  <main>
    {#if app.data && app.view === 'plan'}
      {#if planner.input}
        <div class="grid" use:intro>
          <!-- 목표 카드는 이 영역 안에서만 따라 내려오고, 차트 앞에서 멈춘다 -->
          <div class="c12 plan-top">
            <div class="side"><PlanGoal /></div>
            <div class="main"><PlanSummary /><PlanTable /></div>
          </div>
          <div class="c12"><PlanChart /></div>
        </div>
      {/if}
    {:else if app.data}
      <div class="grid" use:intro>
        <div class="c5"><GradeCard /></div>
        <div class="c7"><DeadlineCard /></div>
        <div class="c12"><WeeklyBars /></div>
        <div class="c7"><DecayChart /></div>
        <div class="c5"><Simulator /></div>
        <div class="c6"><Ladder /></div>
        <div class="c6"><Payments /></div>
      </div>
    {:else if app.overlay === 'boot'}
      <div class="boot"><span></span></div>
    {/if}
  </main>
  <Overlay />
  {#if app.data && app.showHistory}<HistoryModal />{/if}
</div>
<ResizeHandles />

<style>
  .shell { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; }
  main { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; padding: 16px; max-width: 1560px; margin: 0 auto; }
  @media (max-width: 760px) { .grid { gap: 10px; padding: 10px; } }
  .grid > div { grid-column: span 12; display: grid; }
  @media (min-width: 900px) {
    .c5 { grid-column: span 5 !important; }
    .c6 { grid-column: span 6 !important; }
    .c7 { grid-column: span 7 !important; }
  }
  .plan-top { gap: 14px; grid-template-columns: minmax(0, 1fr); }
  .main { display: grid; gap: 14px; min-width: 0; }
  .side { display: grid; }
  @media (min-width: 1100px) {
    .plan-top { grid-template-columns: minmax(300px, 380px) minmax(0, 1fr); }
    .side { align-self: start; position: sticky; top: 16px; }
  }
  .boot { height: 100%; display: grid; place-items: center; }
  .boot span { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--color-line2); border-top-color: var(--color-lav); animation: spin .8s linear infinite; }
</style>
