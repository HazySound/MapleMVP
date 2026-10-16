<script lang="ts">
  /**
   * 이번 주 목표를 얼마나 채웠는지. 목표는 세워 둔 그대로이고, 낸 금액(구매내역 + 보정, 블랙이면 이월로 간 몫까지)만큼 빠진다.
   * 더 냈으면 남은 주 계획에 반영할지 고른다. 못 채운 채 목요일이 지나면 남은 주에 다시 나눈다(2026-10-16 사용자)
   */
  import { app } from '../store.svelte'
  import { applyOver, keepOver, planner, weekNow } from '../plan.svelte'
  import { addDays, md, spotlight, tierName, tierVar, won } from '../format'

  const d = $derived(app.data!)
  const n = $derived(planner.result ? weekNow() : null)
  const hist = $derived(planner.input?.history ?? [])
  /** 바로 지난 주 결과(이번 목요일에 넘어온 것) */
  const last = $derived(hist.at(-1)?.start === addDays(d.thisWeek, -7) ? hist.at(-1)! : null)
  const pct = $derived(n && n.goal ? Math.min(100, n.paid / n.goal * 100) : n?.paid ? 100 : 0)
  let open = $state(false)
</script>

{#if n}
  <article class="card now" use:spotlight>
    <h3 class="card-title">이번 주 <span class="sub">{md(d.thisWeek)} – {md(addDays(d.thisWeek, 6))} · 목요일에 다음 주로 넘어가요</span></h3>

    <div class="nums">
      <div><span>이번 주 목표</span><b class="mono">{won(n.goal)}</b></div>
      <div><span>낸 금액</span><b class="mono">{won(n.paid)}</b>
        <em>구매내역 {won(n.bought)}{n.paid !== n.bought ? ` · 보정 ${n.paid > n.bought ? '+' : '−'}${won(Math.abs(n.paid - n.bought))}` : ''}</em></div>
      {#if n.over}
        <div class="over"><span>목표보다 더 냄</span><b class="mono">+{won(n.over)}</b></div>
      {:else}
        <div class="left" class:done={!n.left}><span>{n.left ? '앞으로 더 낼 금액' : '이번 주 목표 채움'}</span><b class="mono">{n.left ? won(n.left) : '완료'}</b></div>
      {/if}
    </div>
    <div class="bar" aria-hidden="true"><i style="width:{pct}%"></i></div>
    {#if d.current === 'black' && n.paid > 0}
      <p class="note">블랙 기준을 넘겨 MVP 실적 대신 이월로 쌓인 결제도 낸 금액에 넣었어요. 이월은 모자라는 목요일에 꺼내 쓰여요.</p>
    {/if}

    {#if n.pending}
      <div class="ask">
        <p><b>{n.earlier === n.pending ? '지난 주에 ' : ''}목표보다 {won(n.pending)}원 더 냈어요.</b> 남은 주 계획에 반영할까요?</p>
        <div class="btns">
          <button class="btn primary" onclick={applyOver}>반영해서 남은 주 금액 줄이기</button>
          <button class="btn" onclick={keepOver}>계획 그대로 두기</button>
        </div>
      </div>
    {/if}

    {#if last}
      <p class="last" class:short={last.paid < last.goal}>
        지난 주({md(last.start)}) 목표 {won(last.goal)}원 · 낸 금액 {won(last.paid)}원 →
        {#if last.paid < last.goal}<b>{won(last.goal - last.paid)}원 모자라 남은 주에 다시 나눴어요</b>{:else}<b>달성</b>{/if}
        · <span style="color:{tierVar(last.tier)}">{tierName(d.tiers, last.tier)}</span>
      </p>
    {/if}

    {#if hist.length}
      <button class="link" onclick={() => (open = !open)}>지난 기록 {hist.length}주 {open ? '▴' : '▾'}</button>
      {#if open}
        <ul class="hist">
          {#each [...hist].reverse() as h (h.start)}
            <li class:short={h.paid < h.goal}>
              <span class="mono">{md(h.start)}</span>
              <span>목표 <b class="mono">{won(h.goal)}</b></span>
              <span>낸 금액 <b class="mono">{won(h.paid)}</b></span>
              <span>{h.paid < h.goal ? `−${won(h.goal - h.paid)}` : h.paid > h.goal ? `+${won(h.paid - h.goal)}` : '딱 맞음'}</span>
              <span style="color:{tierVar(h.tier)}">{tierName(d.tiers, h.tier)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </article>
{/if}

<style>
  .now { display: grid; gap: 10px; align-content: start; }
  .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  .nums div { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px; }
  .nums span { display: block; font-size: 11.5px; color: var(--color-tx3); }
  .nums b { font-size: 18px; font-weight: 700; }
  .nums em { display: block; margin-top: 2px; font-style: normal; font-size: 11px; color: var(--color-tx3); }
  .nums .left b { color: var(--color-peach); }
  .nums .left.done b, .nums .over b { color: var(--color-mint); }
  .bar { height: 6px; border-radius: 99px; background: var(--color-panel3); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: inherit; background: var(--color-mint); transition: width .4s; }
  .note { margin: 0; font-size: 12px; color: var(--color-tx3); }
  .ask {
    display: grid; gap: 8px; padding: 12px 14px; border-radius: var(--radius-md);
    background: color-mix(in oklab, var(--color-lav) 10%, var(--color-panel2)); border: 1px solid color-mix(in oklab, var(--color-lav) 35%, var(--color-line));
  }
  .ask p { margin: 0; font-size: 13px; color: var(--color-tx2); }
  .ask b { color: var(--color-tx); }
  .btns { display: flex; flex-wrap: wrap; gap: 8px; }
  .last { margin: 0; font-size: 12.5px; color: var(--color-tx2); }
  .last b { color: var(--color-mint); font-weight: 600; }
  .last.short b { color: var(--color-peach); }
  .link { justify-self: start; appearance: none; border: 0; background: none; padding: 0; font: inherit; font-size: 12.5px; color: var(--color-lav); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
  .hist { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .hist li { display: grid; grid-template-columns: 52px 1fr 1fr 90px 64px; gap: 8px; align-items: baseline; padding: 6px 8px; font-size: 12.5px; color: var(--color-tx2); border-bottom: 1px dashed var(--color-line); }
  .hist li.short > span:nth-child(4) { color: var(--color-peach); }
  .hist b { color: var(--color-tx); font-weight: 500; }
  @media (max-width: 560px) { .hist li { grid-template-columns: 44px 1fr 1fr; } .hist li > span:nth-child(n+4) { grid-column: auto; } }
</style>
