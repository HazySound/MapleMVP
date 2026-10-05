<script lang="ts">
  /**
   * 3. 시세 — 엄 시세(와 그 판매 수수료), 메소마켓은 직접.
   * 경매장 수수료는 계획을 따를 때만 '자동'(주마다 사는 순간 오를 등급)이 있고,
   * 금액을 직접 정할 때는 사용자가 3%·5% 중에 고른다.
   */
  import NumBox from './NumBox.svelte'
  import { app } from '../store.svelte'
  import { ageOf, eff, saveEff, touch, umNet } from '../eff.svelte'
  import { won } from '../format'
  import { feeOf } from '../core/efficiency'
  import type { TierKey } from '../types'

  let { tier, mode }: { tier: TierKey | null; mode: 'plan' | 'amount' } = $props()

  const d = $derived(app.data!)
  const tierName = $derived(d.tiers.find(t => t.key === tier)?.name ?? '등급 없음')
  const auto = $derived(feeOf(tier))
  /** 금액 직접일 때 아직 안 골랐으면 오를 등급으로 먼저 채워 둔 값 */
  const manual = $derived(eff.feeOverride ?? auto)
  const setFee = (v: number | null) => { eff.feeOverride = v; saveEff() }
</script>

<article class="card">
  <h3 class="card-title"><span class="n">3</span>시세</h3>

  <div class="ef-field">
    <div class="pair-l"><label for="eff-um">엄 시세 <span class="u">1억 메소당</span></label><label for="eff-umfee">판매 수수료</label></div>
    <!-- 수수료는 엄 시세에 딸린 값이라 같은 줄에 작게 둔다 -->
    <div class="pair">
      <NumBox id="eff-um" label="엄 시세 1억 메소당 원" unit="원" placeholder="예: 1,500" value={eff.um} set={v => { eff.um = v; touch('um'); saveEff() }} />
      <NumBox id="eff-umfee" label="엄 판매 수수료(%)" size="sm" decimal unit="%" placeholder="없음" value={eff.umFee} set={v => { eff.umFee = Math.min(v, 99); saveEff() }} />
    </div>
    <span class="ef-hint">{ageOf('um') || '메소를 현금으로 팔 때 1억에 받는 돈'}{eff.um && eff.umFee ? ` · 수수료 빼고 실제로 ${won(umNet())}원` : ''}</span>
  </div>

  <div class="ef-field">
    <label for="eff-mk">메소마켓 <span class="u">1억 메소당</span></label>
    <NumBox id="eff-mk" label="메소마켓 1억 메소당 메이플포인트" unit="메포" placeholder="예: 2,300" value={eff.mk} set={v => { eff.mk = v; touch('mk'); saveEff() }} />
    <span class="ef-hint">{ageOf('mk') || '비우면 메소마켓은 계산에서 빼요'}</span>
  </div>

  <div class="ef-field">
    <span class="lbl">경매장 수수료</span>
    {#if mode === 'plan'}
      <div class="ef-seg" role="group" aria-label="경매장 수수료">
        <button aria-pressed={eff.feeOverride == null} onclick={() => setFee(null)}>자동</button>
        <button aria-pressed={eff.feeOverride === 0.03} onclick={() => setFee(0.03)}>3%</button>
        <button aria-pressed={eff.feeOverride === 0.05} onclick={() => setFee(0.05)}>5%</button>
      </div>
      <span class="ef-hint">
        {#if eff.feeOverride == null}<b>자동</b> · 주마다 사는 순간 오를 등급으로 정해요. 이번 주는 {tierName} → {Math.round(auto * 100)}%
        {:else}<b>직접 정함</b> · 모든 주를 {Math.round(eff.feeOverride * 100)}%로 계산해요{/if}
      </span>
    {:else}
      <div class="ef-seg" role="group" aria-label="경매장 수수료">
        <button aria-pressed={manual === 0.03} onclick={() => setFee(0.03)}>3%</button>
        <button aria-pressed={manual === 0.05} onclick={() => setFee(0.05)}>5%</button>
      </div>
      <span class="ef-hint">직접 골라 주세요. MVP 실버 이상이면 3%, 아니면 5%예요.</span>
    {/if}
  </div>
</article>

<style>
  .card { display: grid; gap: 14px; align-content: start; }
  .n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 7px; background: var(--color-panel3); font-family: var(--font-mono); font-size: 11px; color: var(--color-lav); }
  .u { font-size: 11px; opacity: .8; }
  .ef-seg { justify-self: start; }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 8px; align-items: center; }
  .pair-l { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 8px; }
  .pair-l label { font-size: 12px; color: var(--color-tx3); }
</style>
