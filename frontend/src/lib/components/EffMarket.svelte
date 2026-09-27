<script lang="ts">
  /** 3. 시세 — 엄 시세와 메소마켓은 직접, 경매장 수수료는 사는 순간 오를 등급으로 */
  import NumBox from './NumBox.svelte'
  import { app } from '../store.svelte'
  import { ageOf, eff, saveEff, touch } from '../eff.svelte'
  import { feeOf } from '../core/efficiency'
  import type { TierKey } from '../types'

  let { tier }: { tier: TierKey | null } = $props()

  const d = $derived(app.data!)
  const tierName = $derived(d.tiers.find(t => t.key === tier)?.name ?? '등급 없음')
  const fee = $derived(eff.feeOverride ?? feeOf(tier))

  // 자동 → 5% → 3% → 자동
  function cycle() {
    eff.feeOverride = eff.feeOverride == null ? 0.05 : eff.feeOverride === 0.05 ? 0.03 : null
    saveEff()
  }
</script>

<article class="card">
  <h3 class="card-title"><span class="n">3</span>시세</h3>

  <div class="ef-field">
    <label for="eff-um">엄 시세 <span class="u">1억 메소당</span></label>
    <NumBox id="eff-um" label="엄 시세 1억 메소당 원" unit="원" placeholder="예: 1,500" value={eff.um} set={v => { eff.um = v; touch('um'); saveEff() }} />
    <span class="ef-hint">{ageOf('um') || '메소를 현금으로 팔 때 1억에 받는 돈'}</span>
  </div>

  <div class="ef-field">
    <label for="eff-mk">메소마켓 <span class="u">1억 메소당</span></label>
    <NumBox id="eff-mk" label="메소마켓 1억 메소당 메이플포인트" unit="메포" placeholder="예: 2,300" value={eff.mk} set={v => { eff.mk = v; touch('mk'); saveEff() }} />
    <span class="ef-hint">{ageOf('mk') || '비우면 메소마켓은 계산에서 빼요'}</span>
  </div>

  <div class="ef-field">
    <span class="lbl">경매장 수수료</span>
    <div class="fee">
      <button class="pill" class:manual={eff.feeOverride != null} onclick={cycle} aria-label="경매장 수수료 바꾸기">{Math.round(fee * 100)}%</button>
      <span class="ef-hint">
        {#if eff.feeOverride != null}직접 정함 · 한 번 더 누르면 {eff.feeOverride === 0.05 ? '3%' : '자동'}
        {:else}사는 순간 {tierName}{tier && tier !== 'bronze' ? ' → 실버 이상이라 3%' : ' → 5%'}{/if}
      </span>
    </div>
  </div>
</article>

<style>
  .card { display: grid; gap: 14px; align-content: start; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .u { font-size: 11px; opacity: .8; }
  .fee { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .pill {
    appearance: none; cursor: pointer; font-family: var(--font-mono); font-size: 14px; font-weight: 600;
    padding: 4px 14px; border-radius: 999px; color: var(--color-mint);
    background: color-mix(in oklab, var(--color-mint) 12%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-mint) 45%, transparent);
  }
  .pill.manual { color: var(--color-peach); background: color-mix(in oklab, var(--color-peach) 12%, transparent); border-color: color-mix(in oklab, var(--color-peach) 45%, transparent); }
</style>
