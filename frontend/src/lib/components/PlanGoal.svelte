<script lang="ts">
  import { app } from '../store.svelte'
  import { planner, setDate, setSkipThisWeek, setTarget } from '../plan.svelte'
  import { TIER_COLOR, addDays, md, spotlight, won } from '../format'

  const d = $derived(app.data!)
  const p = $derived(planner.input!)
  const r = $derived(planner.result)
  const weeksAhead = $derived(Math.floor((Date.parse(p.date) - Date.parse(d.thisWeek)) / (7 * 864e5)))
  const weekStart = $derived(addDays(d.thisWeek, weeksAhead * 7))
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const dow = (iso: string) => DOW[new Date(iso + 'T00:00:00Z').getUTCDay()]
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">목표</h3>

  <div class="label">달성할 등급</div>
  <div class="tiers" role="group" aria-label="목표 등급">
    {#each d.tiers as t (t.key)}
      <button class="tier" aria-pressed={p.target === t.key} style="--c:{TIER_COLOR[t.key]}" onclick={() => setTarget(t.key)}>
        <i></i>{t.name}<small class="mono">{t.th / 10000}만</small>
      </button>
    {/each}
  </div>

  <label class="label" for="plan-date">이 날짜까지</label>
  <div class="daterow">
    <input id="plan-date" type="date" min={d.thisWeek} value={p.date} onchange={e => e.currentTarget.value && setDate(e.currentTarget.value)} />
    <span class="dow">{dow(p.date)}요일</span>
  </div>
  <div class="quick">
    {#each [4, 8, 12, 13] as n (n)}
      <button onclick={() => setDate(addDays(d.thisWeek, n * 7 + 6))}>{n}주 뒤 수요일</button>
    {/each}
  </div>

  <label class="toggle" for="skip-week">
    <input id="skip-week" type="checkbox" checked={p.skipThisWeek} onchange={e => setSkipThisWeek(e.currentTarget.checked, d.thisWeek)} />
    <span class="sw" aria-hidden="true"></span>
    <span class="tx">
      <b>이번 주는 더 결제하지 않음</b>
      <small>{r && !r.error ? `이미 결제한 ${won(r.spentThisWeek)}원만 반영하고, 다음 주부터 나눠요` : '다음 주부터 나눠요'}</small>
    </span>
  </label>

  <div class="facts">
    <div><span>목표 주</span><b class="mono">{md(weekStart)}(목) – {md(p.date)}({dow(p.date)})</b></div>
    <div><span>남은 결제 기회</span><b>{weeksAhead === 0 ? '이번 주뿐' : `이번 주 포함 ${weeksAhead + 1}주`}</b></div>
    {#if r && !r.error}
      <div><span>결제를 나눌 주</span><b>{r.weeksCount}주{#if p.skipThisWeek} <em>(이번 주 제외)</em>{/if}{#if r.timeline.some(w => !w.counts && !w.skipped)} <em>(그 전 결제는 목표일 전에 빠져요)</em>{/if}</b></div>
      <div><span>이번 주 이미 결제</span><b class="mono">{won(r.spentThisWeek)}원</b></div>
    {/if}
  </div>
  {#if d.carry}
    <p class="note">이월 {won(d.carry)}원은 목요일 갱신 때 부족분을 메우는 데만 쓰여서 계획에는 넣지 않았어요.</p>
  {/if}
</article>

<style>
  .label { display: block; font-size: 12px; color: var(--color-tx3); margin: 14px 0 6px; }
  .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .tier {
    appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
    display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 11px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
    transition: border-color .2s, background .2s, transform .15s;
  }
  .tier:hover { transform: translateY(-1px); border-color: var(--color-line2); }
  .tier i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; }
  .tier small { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--color-tx3); }
  .tier[aria-pressed="true"] { border-color: var(--c); background: color-mix(in oklab, var(--c) 15%, var(--color-bg2)); color: var(--color-tx); }
  .tier[aria-pressed="true"] small { color: var(--c); }
  .daterow { display: flex; align-items: center; gap: 10px; }
  input[type=date] {
    flex: 1; font: inherit; font-family: var(--font-mono); font-size: 15px; color: var(--color-tx);
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 11px; padding: 9px 12px;
    color-scheme: dark; outline: none; transition: border-color .2s;
  }
  input[type=date]:focus { border-color: var(--color-lav); }
  .dow { font-size: 13px; color: var(--color-tx2); }
  .quick { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .quick button { appearance: none; cursor: pointer; font: inherit; font-size: 12px; padding: 5px 9px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .quick button:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .toggle { margin-top: 14px; display: flex; align-items: center; gap: 12px; padding: 11px 12px; border-radius: 12px; border: 1px solid var(--color-line); background: var(--color-bg2); cursor: pointer; transition: border-color .2s; }
  .toggle:hover { border-color: var(--color-line2); }
  .toggle input { position: absolute; opacity: 0; pointer-events: none; }
  .sw { position: relative; flex: none; width: 38px; height: 22px; border-radius: 99px; background: var(--color-panel3); border: 1px solid var(--color-line2); transition: background .25s, border-color .25s; }
  .sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--color-tx2); transition: transform .3s cubic-bezier(.3, 1.4, .5, 1), background .25s; }
  .toggle input:checked + .sw { background: color-mix(in oklab, var(--color-lav) 40%, var(--color-panel3)); border-color: var(--color-lav); }
  .toggle input:checked + .sw::after { transform: translateX(16px); background: #fff; }
  .toggle input:focus-visible + .sw { outline: 2px solid var(--color-lav); outline-offset: 2px; }
  .tx { display: grid; line-height: 1.35; }
  .tx b { font-size: 13px; font-weight: 600; }
  .tx small { font-size: 11.5px; color: var(--color-tx3); }
  .facts { margin-top: 16px; display: grid; gap: 8px; padding-top: 14px; border-top: 1px dashed var(--color-line); }
  .facts div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .facts span { color: var(--color-tx3); }
  .facts b { font-weight: 600; text-align: right; }
  .facts em { font-style: normal; font-weight: 400; font-size: 11.5px; color: var(--color-tx3); }
  .note { margin: 12px 0 0; font-size: 12px; color: var(--color-butter); }
</style>
