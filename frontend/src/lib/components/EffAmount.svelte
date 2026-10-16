<script lang="ts">
  /** 1. 얼마나 결제할까 — 목표 계획이 있으면 이번 주에 더 낼 금액, 없으면 금액 한 번 */
  import NumBox from './NumBox.svelte'
  import { app } from '../store.svelte'
  import { planner, weekNow } from '../plan.svelte'
  import { eff, effWeek, saveEff } from '../eff.svelte'
  import { TIER_INK_VAR, won, spotlight } from '../format'

  const d = $derived(app.data!)
  const planOk = $derived(!!planner.result && !planner.result.error)
  const usePlan = $derived(planOk && eff.usePlan)
  const n = $derived(planOk ? weekNow() : null)
  /** 다음 주를 보고 있으면 그 주 계획 */
  const next = $derived(planOk && effWeek.sel > d.thisWeek ? planner.result!.timeline[1] ?? null : null)
  const tier = $derived(planner.input ? d.tiers.find(t => t.key === planner.input!.target) : null)
  const sum13 = $derived(d.weeks.reduce((a, w) => a + w.amount, 0))
  const curName = $derived(d.tiers.find(t => t.key === d.current)?.name ?? '등급 없음')
  const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`

  /** 지금보다 높은 등급까지 지금 당장 더 필요한 금액 */
  const quick = $derived(d.tiers.filter(t => d.needNow[t.key] > 0).map(t => ({ key: t.key, name: t.name, v: d.needNow[t.key] })))

  function pick(v: number) { eff.amount = v; saveEff() }
</script>

<article class="card" use:spotlight>
  <h3 class="card-title"><span class="n">1</span>얼마나 결제할까</h3>

  {#if planOk}
    <div class="ef-seg mode" role="group" aria-label="결제 금액 정하는 방법">
      <button aria-pressed={usePlan} onclick={() => { eff.usePlan = true; saveEff() }}>목표 계획대로</button>
      <button aria-pressed={!usePlan} onclick={() => { eff.usePlan = false; saveEff() }}>금액 직접</button>
    </div>
  {/if}

  {#if usePlan && n && tier}
    <div class="plan" style="--ink:{TIER_INK_VAR[tier.key]}">
      <span class="from">목표 계획에서 가져옴 · {next ? '다음 주 미리 보기' : '이번 주만'}</span>
      <span class="goal">{#if planner.result?.mode === 'keep'}<b>{tier.name}</b> 유지{:else if planner.result?.mode === 'hold'}<b>{tier.name}</b> {md(planner.input!.date)}부터 유지{:else}<b>{tier.name}</b> {md(planner.input!.date)}까지{/if}</span>
      <span class="amt">
        {#if next}다음 주 계획 <b class="mono">{won(next.amount)}원</b>{:else}
        이번 주 목표 <b class="mono">{won(n.goal)}원</b> · 낸 금액 <b class="mono">{won(n.paid)}원</b>
        → {#if n.left}더 낼 금액 <b class="mono">{won(n.left)}원</b>{:else}더 낼 금액 없음{/if}{/if}
      </span>
    </div>
    <p class="ef-hint">{next ? '시세·한도는 지금 값으로 미리 계산해요. 목요일에 이번 주가 되면 그때 값으로 다시 계산해요.' : '다음 주는 아래 결과에서 주를 넘겨 미리 볼 수 있어요.'} 금액을 바꾸려면 목표 계획 탭에서.</p>
  {:else}
    {#if quick.length}
      <div class="quick">
        {#each quick as q (q.key)}
          <button class:on={eff.amount === q.v} onclick={() => pick(q.v)} style="--ink:{TIER_INK_VAR[q.key]}">
            <span>{q.name}까지</span><b class="mono">{won(q.v)}</b>
          </button>
        {/each}
      </div>
    {/if}
    <div class="ef-field">
      <label for="eff-amount">결제할 금액</label>
      <NumBox id="eff-amount" label="결제할 금액" unit="원" placeholder="예: 300,000" value={eff.amount} set={v => { eff.amount = v; saveEff() }} />
      <span class="ef-hint">지금 13주 합계 {won(sum13)}원({curName}) 기준이에요.{#if !planOk} 목표 계획을 세우면 이번 주에 낼 금액으로 계산해요. <button class="link" onclick={() => (app.view = 'plan')}>목표 계획 세우기</button>{/if}</span>
    </div>
  {/if}
</article>

<style>
  .card { display: grid; gap: 12px; align-content: start; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .mode { justify-self: start; }
  .plan { display: grid; gap: 3px; padding: 14px; border-radius: var(--radius-md); background: linear-gradient(120deg, color-mix(in oklab, var(--ink) 12%, var(--color-bg2)), var(--color-bg2)); border: 1px solid color-mix(in oklab, var(--ink) 30%, var(--color-line)); }
  .from { font-size: 11.5px; color: var(--color-tx3); }
  .goal { font-size: 14px; color: var(--color-tx2); }
  .goal b { font-family: var(--font-display); font-size: 22px; font-weight: 400; color: var(--ink); margin-right: 4px; }
  .amt { font-size: 13px; color: var(--color-tx2); }
  .amt b { color: var(--color-tx); font-weight: 500; }
  .quick { display: flex; flex-wrap: wrap; gap: 6px; }
  .quick button {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--color-tx2);
    display: inline-flex; gap: 6px; align-items: baseline; padding: 6px 11px; border-radius: 10px;
    background: var(--color-bg2); border: 1px solid var(--color-line); transition: border-color .2s, color .2s;
  }
  .quick button b { color: var(--ink); font-weight: 500; }
  .quick button:hover { border-color: var(--color-line2); color: var(--color-tx); }
  .quick button.on { border-color: var(--ink); color: var(--color-tx); background: color-mix(in oklab, var(--ink) 10%, var(--color-bg2)); }
  .link { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: var(--color-lav); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
