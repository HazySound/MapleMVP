<script lang="ts">
  import gsap from 'gsap'
  import { onMount } from 'svelte'
  import Aurora from './lib/components/Aurora.svelte'
  import DeadlineCard from './lib/components/DeadlineCard.svelte'
  import DecayChart from './lib/components/DecayChart.svelte'
  import GradeCard from './lib/components/GradeCard.svelte'
  import HistoryModal from './lib/components/HistoryModal.svelte'
  import ImportModal from './lib/components/ImportModal.svelte'
  import LoginModal from './lib/components/LoginModal.svelte'
  import NameModal from './lib/components/NameModal.svelte'
  import PcRoomModal from './lib/components/PcRoomModal.svelte'
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
  import { REDUCED, TOUCH } from './lib/format'
  import { planner } from './lib/plan.svelte'
  import { app, boot, refresh, setExtra, setTarget } from './lib/store.svelte'

  onMount(() => { boot() })

  function onKey(e: KeyboardEvent) {
    if (e.key === 'F5') { e.preventDefault(); refresh(); return }
    if (!app.data || app.view !== 'dash') return
    if (e.key === 'Escape') { setExtra(0, true); return }
    if ((e.target as HTMLElement).matches('input')) return
    if (/^[1-6]$/.test(e.key)) setTarget(app.data.tiers[Number(e.key) - 1].key)
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
  <!-- 보정은 인게임 캡처나 화면공유가 있어야 한다. 휴대폰에서는 열 길이 없다 -->
  {#if app.data && app.showPcRoom && !(app.web && TOUCH)}<PcRoomModal />{/if}
  {#if app.data && app.web && app.showImport}<ImportModal />{/if}
  <!-- 모달은 화면 전체를 덮어야 한다. 타이틀바 안에 두면 거기에 갇힌다 -->
  {#if app.web && app.showSignIn}<LoginModal onClose={() => (app.showSignIn = false)} />{/if}
  <!-- 이름이 비어 있다는 것은 이 계정으로 처음 왔다는 뜻이다 -->
  {#if app.web && app.user && !app.user.nick}<NameModal />{/if}
</div>
<ResizeHandles />

<style>
  /*
   * 글자 크기를 하나하나 올리면 칸은 그대로인데 글만 커져서 줄바꿈이 사방에서 달라진다.
   * 배율을 걸면 여백과 간격도 같이 커져서, 사용자가 브라우저를 확대한 것과 같아진다.
   * 배경(Aurora)과 창 테두리는 이 바깥이라 영향을 받지 않는다.
   */
  .shell {
    zoom: var(--ui-scale, 1);
    position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column;
  }
  main { flex: 1; overflow-y: auto; overflow-x: hidden; }
  .grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 14px; padding: 16px; max-width: 1560px; margin: 0 auto; }
  /* 중단점은 --ui-scale(1.2)을 미리 곱해 둔 값이다.
     미디어 쿼리는 창 너비만 보고 배율을 모르기 때문에, 그냥 두면 자리가 없는데도 발동한다.
     원래 값: 760 / 900 / 1100 */
  @media (max-width: 912px) { .grid { gap: 10px; padding: 10px; } }
  .grid > div { grid-column: span 12; display: grid; }
  @media (min-width: 1080px) {
    .c5 { grid-column: span 5 !important; }
    .c6 { grid-column: span 6 !important; }
    .c7 { grid-column: span 7 !important; }
  }
  .plan-top { gap: 14px; grid-template-columns: minmax(0, 1fr); }
  .main { display: grid; gap: 14px; min-width: 0; }
  .side { display: grid; }
  /*
   * 주차별 계획 표는 720px 아래로는 줄지 않는다. 카드 안쪽 여백까지 756px이 필요해서,
   * 그만큼 남지 않으면 가로 스크롤이 생긴다. 목표 카드 폭을 줄이고 기준을 그에 맞췄다.
   * (창 1360 → 배율 1.2를 빼면 1133, 여백 32와 목표 320과 간격 14를 빼면 767 > 756)
   */
  @media (min-width: 1360px) {
    .plan-top { grid-template-columns: minmax(280px, 320px) minmax(0, 1fr); }
    .side { align-self: start; position: sticky; top: 16px; }
  }
  .boot { height: 100%; display: grid; place-items: center; }
  .boot span { width: 28px; height: 28px; border-radius: 50%; border: 3px solid var(--color-line2); border-top-color: var(--color-lav); animation: spin .8s linear infinite; }
</style>
