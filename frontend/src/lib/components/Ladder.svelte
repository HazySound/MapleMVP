<script lang="ts">
  import { app } from '../store.svelte'
  import { TIER_COLOR, TIER_VAR, spotlight, won } from '../format'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)
  // 등급 판정에 쓰이는 금액: 13주 합계 + 이월 잔액
  const v = $derived(sim.total + d.carry)
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">등급별 달성 현황 <span class="sub">최근 13주 합계{d.carry ? ' + 이월' : ''} 기준</span></h3>
  <div class="ladder">
    {#each [...d.tiers].reverse() as t (t.key)}
      {@const ok = v >= t.th}
      <div class="rung" class:ok class:cur={t.key === (sim.current ?? d.current)} style="--c:{TIER_VAR[t.key]}">
        <span class="n"><i></i>{t.name}</span>
        <span class="bar"><i style="width:{Math.min(100, (v / t.th) * 100)}%"></i></span>
        <span class="s mono">{ok ? `달성 · ${t.th / 10000}만` : `−${won(t.th - v)}`}</span>
      </div>
    {/each}
  </div>
</article>

<style>
  .ladder { display: grid; gap: 6px; margin-top: 12px; }
  .rung { display: grid; grid-template-columns: 64px minmax(0, 1fr) 118px; gap: 12px; align-items: center; font-size: 13px; padding: 5px 8px; margin-inline: -8px; border-radius: 10px; transition: background .3s; }
  .rung.cur { background: color-mix(in oklab, var(--c) 9%, transparent); }
  .n { display: flex; align-items: center; gap: 7px; font-weight: 600; }
  .n i { width: 9px; height: 9px; border-radius: 3px; background: var(--c); box-shadow: inset 0 0 0 1px var(--ring-on-fill); }
  .bar { height: 8px; border-radius: 99px; background: var(--color-bg2); overflow: hidden; border: 1px solid var(--color-line); }
  .bar i { display: block; height: 100%; background: var(--c); border-radius: 99px; transition: width .7s cubic-bezier(.2, .8, .2, 1); }
  .s { font-size: 12px; color: var(--color-tx3); text-align: right; }
  .ok .s { color: var(--color-good); }
</style>
