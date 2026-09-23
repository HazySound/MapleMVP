<script lang="ts">
  import { app } from '../store.svelte'
  import { md, spotlight, won } from '../format'

  const d = $derived(app.data!)

  function weekLabel(date: string) {
    const i = d.weeks.findIndex(w => w.start <= date && date <= w.end)
    return i === 12 ? '이번 주' : i >= 0 ? `${i + 1}주차` : ''
  }
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">
    최근 결제 <span class="cnt">{d.recent.length}건</span>
    <button class="more" onclick={() => (app.showHistory = true)}>전체 보기</button>
  </h3>
  {#if d.recent.length}
    <ul>
      {#each d.recent as r, i (i)}
        <li>
          <span class="dt mono">{md(r.date)}</span>
          <span class="it">{r.item}<span class="wk">{weekLabel(r.date)}</span></span>
          <span class="pr mono" class:neg={r.price < 0}>{won(r.price)}</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">최근 1년 동안 구매내역이 없어요.</p>
  {/if}
</article>

<style>
  ul { list-style: none; margin: 10px 0 0; padding: 0; max-height: 262px; overflow-y: auto; }
  li { display: grid; grid-template-columns: 50px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px 2px; border-bottom: 1px dashed var(--color-line); font-size: 13.5px; }
  li:last-child { border-bottom: 0; }
  .dt { font-size: 12px; color: var(--color-tx3); }
  .it { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wk { font-size: 11px; color: var(--color-tx3); margin-left: 6px; }
  .pr { font-weight: 600; }
  .pr.neg { color: var(--color-bad); }
  .empty { color: var(--color-tx3); font-size: 13px; margin: 14px 0 0; }
  .cnt { font-weight: 400; color: var(--color-tx3); }
  .more {
    margin-left: auto; appearance: none; cursor: pointer; font: inherit; font-size: 12px;
    padding: 4px 10px; border-radius: 8px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
  }
  .more:hover { color: var(--color-tx); border-color: var(--color-lav); }
</style>
