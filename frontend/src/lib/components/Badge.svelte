<script lang="ts">
  import { TIER_VAR, tierName, tierVar } from '../format'
  import type { Tier, TierKey } from '../types'

  let { tier, tiers, ghost = false }: { tier: TierKey | null; tiers: Tier[]; ghost?: boolean } = $props()
</script>

<!-- 칠하는 색과 글자 색을 따로 받는다. 배경은 맑게, 글자는 읽히게 -->
<span class="badge" class:ghost class:black={tier === 'black' && !ghost} class:none={!tier}
  style="--c:{tier ? TIER_VAR[tier] : 'var(--color-panel3)'};--ink:{tierVar(tier)}">
  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>
  {tierName(tiers, tier)}
</span>

<style>
  .badge {
    position: relative; isolation: isolate; overflow: hidden;
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 14px 7px 10px; border-radius: 999px;
    font-weight: 700; font-size: 15px; color: var(--color-on-tier); background: var(--c);
    width: fit-content;
  }
  .badge::after {
    content: ""; position: absolute; inset: 0; z-index: -1;
    background: linear-gradient(110deg, transparent 30%, rgba(255, 255, 255, .65) 48%, transparent 62%);
    transform: translateX(-120%);
    animation: sheen 3.6s ease-in-out infinite;
  }
  @keyframes sheen { 55%, 100% { transform: translateX(120%); } }
  /* 블랙: 어두운 보라 투톤 그라데이션 + 가는 테두리 + 약한 글로우 (입체 표현은 최소로) */
  .badge.black {
    background: linear-gradient(135deg, #131020 0%, #2b2348 54%, #4b3c82 100%);
    color: #e6dfff;
    box-shadow:
      inset 0 0 0 1px rgba(176, 156, 255, .16),
      0 0 14px -9px rgba(130, 100, 230, .6);
  }
  .badge.ghost { background: transparent; color: var(--ink); border: 1.5px dashed var(--ink); padding-block: 5.5px; }
  .badge.ghost::after, .badge.none::after { display: none; }
  .badge.none:not(.ghost) { background: var(--color-panel3); color: var(--color-tx2); }
  svg { width: 16px; height: 16px; }
</style>
