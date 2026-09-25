<script lang="ts">
  import { app } from '../store.svelte'
  import ImportPanel from './ImportPanel.svelte'
</script>

<div class="back" role="presentation" onclick={e => e.target === e.currentTarget && (app.showImport = false)}>
  <div class="sheet" role="dialog" aria-label="구매내역 가져오기">
    <button class="x" onclick={() => (app.showImport = false)} aria-label="닫기">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
    </button>
    <ImportPanel />
  </div>
</div>

<svelte:window onkeydown={e => e.key === 'Escape' && (app.showImport = false)} />

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 40;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 72%, transparent); backdrop-filter: blur(8px);
  }
  .sheet { position: relative; width: min(680px, 100%); max-height: 100%; overflow-y: auto; }
  .x {
    position: absolute; top: 14px; right: 14px; z-index: 1;
    appearance: none; width: 32px; height: 32px; border-radius: 10px; cursor: pointer;
    display: grid; place-items: center; border: 1px solid var(--color-line);
    background: var(--color-panel2); color: var(--color-tx2);
  }
  .x:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .x svg { width: 15px; height: 15px; }
</style>
