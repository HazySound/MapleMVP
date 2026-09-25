<script lang="ts">
  import { app } from '../store.svelte'
  import { planner, setAmount, toggleLock, toggleSelect } from '../plan.svelte'
  import { md, spotlight, tierColor, tierName, won } from '../format'
  import { tip } from '../tip'

  const d = $derived(app.data!)
  const r = $derived(planner.result)
  const counting = $derived((r?.timeline ?? []).filter(w => w.counts))
  const allSelected = $derived(counting.length > 0 && counting.every(w => planner.selected.includes(w.start)))

  function selectAll() {
    planner.selected = allSelected ? [] : counting.map(w => w.start)
  }

  // 입력 중에는 콤마 없는 숫자를 보여주고, 벗어나면 적용한다
  let editing = $state<string | null>(null)
  let draft = $state('')
  function begin(week: string, amount: number) { editing = week; draft = amount ? String(amount) : '' }
  function commit(week: string) {
    if (editing !== week) return
    const raw = draft.replace(/[^\d]/g, '')
    editing = null
    setAmount(week, raw === '' ? null : Number(raw))
  }
</script>

<article class="card" id="plan-table" use:spotlight>
  <h3 class="card-title">주차별 계획 <span class="sub">금액을 입력하면 고정 · 비우면 자동 분배</span></h3>
  {#if r && !r.error}
    <div class="scroll"><div class="table">
      <div class="row head">
        <label class="ck"><input type="checkbox" checked={allSelected} onchange={selectAll} aria-label="전체 선택" /></label>
        <span>주차</span>
        <span class="num">계획 결제</span>
        <span>방식</span>
        <span class="num">빠지는 금액</span>
        <span class="num">13주 합계</span>
        <span>등급</span>
      </div>
      {#each r.timeline as w (w.start)}
        <div class="row" class:off={!w.counts} class:sel={planner.selected.includes(w.start)} class:reached={r.reached === w.offset}>
          <label class="ck">
            <input type="checkbox" disabled={!w.counts} checked={planner.selected.includes(w.start)} onchange={() => toggleSelect(w.start)} aria-label="{md(w.start)} 주 선택" />
          </label>
          <span class="wk">
            <b>{w.offset === 0 ? '이번 주' : `${w.offset}주 뒤`}</b>
            <span class="mono">{md(w.start)} – {md(w.end)}</span>
            {#if w.offset === 0 && r.spentThisWeek}<em>이미 {won(r.spentThisWeek)}원 결제</em>{/if}
            {#if w.skipped}<em>추가 결제 없음으로 설정됨</em>{:else if !w.counts}<em>목표일 전에 빠지는 주</em>{/if}
          </span>
          <span class="num">
            <input class="amt mono" class:locked={w.fixed} type="text" inputmode="numeric" disabled={!w.counts}
              value={editing === w.start ? draft : w.amount.toLocaleString('ko-KR')}
              onfocus={e => { begin(w.start, w.fixed ? w.amount : 0); e.currentTarget.select() }}
              oninput={e => (draft = e.currentTarget.value)}
              onblur={() => commit(w.start)}
              onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()}
              placeholder={won(w.amount)} aria-label="{md(w.start)} 주 결제 금액" />
          </span>
          <span>
            <button class="lock" class:locked={w.fixed} disabled={!w.counts} onclick={() => toggleLock(w.start, w.amount)}
              use:tip={w.fixed ? '자동 분배로 되돌리기' : '이 금액으로 고정'}>
              {#if w.skipped}
                제외
              {:else if w.fixed}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>고정
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>자동
              {/if}
            </button>
          </span>
          <span class="num mono drop">{w.drop ? `−${won(w.drop)}` : '-'}</span>
          <span class="num mono">{won(w.sum)}</span>
          <span class="tier" style="color:{tierColor(w.tier)}">
            {tierName(d.tiers, w.tier)}
            {#if r.reached === w.offset}<i>목표 달성</i>{/if}
          </span>
        </div>
      {/each}
    </div></div>
  {/if}
</article>

<style>
  .scroll { overflow-x: auto; margin-top: 12px; }
  .table { display: grid; min-width: 720px; }
  .row {
    display: grid; grid-template-columns: 30px minmax(150px, 1.3fr) 128px 72px 96px 104px minmax(92px, 1fr);
    gap: 8px; align-items: center; padding: 8px 8px; border-radius: 10px; font-size: 13.5px;
    border-bottom: 1px dashed var(--color-line); transition: background .2s;
  }
  .row:last-child { border-bottom: 0; }
  .row:not(.head):hover { background: rgba(255, 255, 255, .025); }
  .row.head { font-size: 11.5px; color: var(--color-tx3); border-bottom: 1px solid var(--color-line); padding-block: 6px; }
  .row.sel { background: color-mix(in oklab, var(--color-lav) 8%, transparent); }
  .row.reached { background: color-mix(in oklab, var(--color-mint) 8%, transparent); }
  .row.off { opacity: .45; }
  .num { text-align: right; }
  .ck { display: grid; place-items: center; }
  .ck input { width: 16px; height: 16px; accent-color: var(--color-lav); cursor: pointer; }
  .wk { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .wk b { font-weight: 600; }
  .wk .mono { font-size: 12px; color: var(--color-tx3); }
  .wk em { flex-basis: 100%; font-style: normal; font-size: 11.5px; color: var(--color-tx3); }
  .amt {
    width: 100%; text-align: right; font-size: 14px; color: var(--color-mint);
    background: var(--color-bg2); border: 1px dashed color-mix(in oklab, var(--color-mint) 40%, var(--color-line));
    border-radius: 9px; padding: 7px 10px; outline: none; transition: border-color .2s, color .2s;
  }
  .amt.locked { color: var(--color-tx); border: 1px solid color-mix(in oklab, var(--color-lav) 55%, var(--color-line)); }
  .amt:focus { border-color: var(--color-lav); border-style: solid; }
  .lock {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px; display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 9px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-mint);
  }
  .lock.locked { color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 45%, var(--color-line)); }
  .lock:disabled { cursor: default; }
  .lock svg { width: 13px; height: 13px; }
  .drop { color: var(--color-peach); font-size: 12.5px; }
  .tier { font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .tier i { font-style: normal; font-size: 11px; font-weight: 500; padding: 2px 7px; border-radius: 6px; background: color-mix(in oklab, var(--color-mint) 20%, transparent); color: var(--color-mint); }
</style>
