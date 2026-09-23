<script lang="ts">
  import { app } from '../store.svelte'
  import { autoTargets, fixTargets, planner, spreadShortfall } from '../plan.svelte'
  import { TIER_COLOR, countup, md, spotlight, won } from '../format'

  const d = $derived(app.data!)
  const p = $derived(planner.input!)
  const r = $derived(planner.result)
  const tier = $derived(d.tiers.find(t => t.key === p.target)!)
  const last = $derived(r?.timeline.at(-1))
  const reachedWeek = $derived(r?.reached != null ? r.timeline[r.reached] : null)
  const scope = $derived(planner.selected.length ? `선택한 ${planner.selected.length}주` : '모든 주')

  let perWeek = $state(200_000)
  let perText = $state('200,000')
  function commitPer() {
    const v = Number(perText.replace(/[^\d]/g, ''))
    perWeek = v
    perText = v.toLocaleString('ko-KR')
  }

  const status = $derived.by(() => {
    if (!r || r.error) return 'none'
    if (r.required === 0) return 'done'
    return r.shortfall > 0 ? 'short' : 'ok'
  })
</script>

<article class="card sum" use:spotlight style="--c:{TIER_COLOR[p.target]}">
  <h3 class="card-title">계획 결과 <span class="sub">{md(p.date)}까지 {tier.name} ({won(tier.th)}원)</span></h3>

  {#if r?.error}
    <p class="err">{r.error}</p>
  {:else if r}
    <div class="banner {status}">
      <div class="ic">
        {#if status === 'short'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        {/if}
      </div>
      <div class="t">
        {#if status === 'done'}
          <b>추가 결제 없이 달성돼요</b>
          {md(p.date)} 주에도 13주 합계가 {won(r.base)}원으로 {tier.name} 기준을 넘어요.
        {:else if status === 'short'}
          <b><span class="mono">{won(r.shortfall)}</span>원 모자라요</b>
          지금 계획대로면 {md(p.date)} 주 13주 합계가 {won(last?.sum ?? 0)}원이에요. 모자란 금액을 아래에서 나눠 넣어 보세요.
        {:else}
          <b>달성 가능 · {reachedWeek ? `${md(reachedWeek.start)} 주에 도달` : ''}</b>
          {#if r.autoCount === 0}
            정한 금액만으로 충분해요{r.surplus ? `. 여유 ${won(r.surplus)}원` : ''}.
          {:else if r.fixedSum > 0}
            정한 {won(r.fixedSum)}원 외에 나머지 {r.autoCount}주에 매주 {won(r.autoPer)}원씩 자동으로 나눴어요.
          {:else}
            {r.weeksCount}주 동안 매주 {won(r.autoPer)}원씩 결제하면 돼요.
          {/if}
        {/if}
      </div>
    </div>

    <div class="stats">
      <div class="st"><span>앞으로 필요한 금액</span><b class="mono" use:countup={r.required}>0</b></div>
      <div class="st"><span>균등 분배하면</span><b class="mono">{won(r.equalPer)}<small> × {r.weeksCount}주</small></b></div>
      <div class="st"><span>계획한 결제 합계</span><b class="mono">{won(r.planned)}</b></div>
      <div class="st"><span>목표 주에 남는 기존 결제</span><b class="mono">{won(r.base)}</b></div>
    </div>

    <div class="actions">
      <div class="grp">
        <span class="scope">{scope}을</span>
        <span class="per">매주
          <input id="per-week" type="text" inputmode="numeric" bind:value={perText} onblur={commitPer}
            onkeydown={e => e.key === 'Enter' && (commitPer(), fixTargets(perWeek))} />원
        </span>
        <button class="btn" onclick={() => { commitPer(); fixTargets(perWeek) }}>으로 고정</button>
      </div>
      <div class="grp">
        {#if r.shortfall > 0}
          <button class="btn primary" onclick={spreadShortfall}>부족분 {won(r.shortfall)}원을 {scope}에 나눠 더하기</button>
        {/if}
        <button class="btn" onclick={autoTargets}>{scope} 자동 분배로</button>
      </div>
    </div>
    <p class="hint">
      바로 아래 <button class="link" onclick={() => document.getElementById('plan-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>주차별 계획 표</button>에서 금액을 직접 입력하면 그 주는 고정되고, 나머지 주에 필요한 금액이 자동으로 나뉘어요. 표에서 주를 체크하면 위 버튼은 체크한 주에만 적용돼요.
    </p>
  {/if}
</article>

<style>
  .sum { display: grid; align-content: start; }
  .err { color: var(--color-peach); font-size: 13px; }
  .banner {
    --k: var(--color-mint);
    margin-top: 12px; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--radius-md);
    background: linear-gradient(100deg, color-mix(in oklab, var(--k) 15%, var(--color-panel)), var(--color-panel2));
    border: 1px solid color-mix(in oklab, var(--k) 35%, var(--color-line));
    transition: background .4s, border-color .4s;
  }
  .banner.short { --k: var(--color-peach); }
  .ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none; background: color-mix(in oklab, var(--k) 24%, transparent); color: var(--k); }
  .ic svg { width: 19px; height: 19px; }
  .t { font-size: 13px; color: var(--color-tx2); line-height: 1.5; }
  .t b { display: block; font-size: 18px; color: var(--color-tx); font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .st { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px; }
  .st span { display: block; font-size: 11.5px; color: var(--color-tx3); }
  .st b { font-size: 17px; font-weight: 700; }
  .st:first-child b { color: var(--c); }
  .st small { font-size: 12px; font-weight: 400; color: var(--color-tx3); }
  .actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: 14px; }
  .grp { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .scope { font-size: 13px; color: var(--color-tx2); }
  .per { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-tx2); }
  .per input {
    width: 110px; font-family: var(--font-mono); font-size: 14px; text-align: right; color: var(--color-tx);
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 9px; padding: 7px 10px; outline: none;
  }
  .per input:focus { border-color: var(--color-lav); }
  .hint { margin: 10px 0 0; font-size: 12px; color: var(--color-tx3); }
  .link { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: var(--color-lav); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
