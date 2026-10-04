<script lang="ts">
  import { app } from '../store.svelte'
  import { KEEP_DEFAULT, planner, setDate, setKeep, setSkipThisWeek, setTarget, setUnit } from '../plan.svelte'
  import { TIER_COLOR, TIER_INK_VAR, TIER_VAR, addDays, md, spotlight, won } from '../format'

  const d = $derived(app.data!)
  const p = $derived(planner.input!)
  const r = $derived(planner.result)
  const weeksAhead = $derived(Math.floor((Date.parse(p.date) - Date.parse(d.thisWeek)) / (7 * 864e5)))
  const weekStart = $derived(addDays(d.thisWeek, weeksAhead * 7))
  const DOW = ['일', '월', '화', '수', '목', '금', '토']
  const dow = (iso: string) => DOW[new Date(iso + 'T00:00:00Z').getUTCDay()]
  const keep = $derived({ ...KEEP_DEFAULT, ...p.keep })
  const tierName = $derived(d.tiers.find(t => t.key === p.target)!.name)
  const cur = $derived(d.tiers.find(t => t.key === d.current) ?? null)
  /** reach: 날짜까지 달성 · keep: 지금 등급 유지 · hold: 날짜가 든 주부터 더 낮은 등급 유지 */
  const mode = $derived(r && !r.error ? r.mode : 'reach')
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">목표</h3>

  <div class="label">달성할 등급</div>
  <div class="tiers-wrap"><div class="tiers" role="group" aria-label="목표 등급">
    {#each d.tiers as t (t.key)}
      <button class="tier" aria-pressed={p.target === t.key} style="--c:{TIER_VAR[t.key]};--ink:{TIER_INK_VAR[t.key]}" onclick={() => setTarget(t.key)}>
        <i></i>{t.name}<small class="mono">{t.th / 10000}만</small>
      </button>
    {/each}
  </div></div>
  <!-- 지금 등급 이하를 고르면 달성할 것이 없다. 날짜까지 손 놓고 턱걸이하는 계획 대신 유지 계획으로 본다 (2026-10-04) -->
  {#if mode === 'keep'}
    <p class="modenote">지금 <b>{cur?.name}</b> 등급이에요. 날짜와 상관없이 <b>지금부터 {tierName} 유지</b> 계획으로 봐요.</p>
  {:else if mode === 'hold'}
    <p class="modenote">지금 <b>{cur?.name}</b> 등급이에요. 아래 날짜가 든 주부터 <b>{tierName}</b>로 내려가고, 그 전까지는 {cur?.name}을 지켜요.</p>
  {/if}

  {#if mode !== 'keep'}
    <label class="label" for="plan-date">{mode === 'hold' ? `이 날짜부터 ${tierName}` : '이 날짜까지'}</label>
    <div class="daterow">
      <input id="plan-date" type="date" min={d.thisWeek} value={p.date} onchange={e => e.currentTarget.value && setDate(e.currentTarget.value)} />
      <span class="dow">{dow(p.date)}요일</span>
    </div>
    <div class="quick">
      {#each [4, 8, 12, 13] as n (n)}
        <button onclick={() => setDate(addDays(d.thisWeek, n * 7 + 6))}>{n}주 뒤 수요일</button>
      {/each}
    </div>
  {/if}

  <label class="unitrow" for="plan-unit">
    <span>충전 단위<small>자동으로 나누는 금액을 이 단위로 올려 맞춰요</small></span>
    <select id="plan-unit" value={p.unit ?? 1000} onchange={e => setUnit(Number(e.currentTarget.value))}>
      {#each [[1000, '1천 원'], [10_000, '1만 원'], [50_000, '5만 원'], [100_000, '10만 원']] as [v, t] (v)}<option value={v}>{t}</option>{/each}
    </select>
  </label>

  <label class="toggle" for="skip-week">
    <input id="skip-week" type="checkbox" checked={p.skipThisWeek} onchange={e => setSkipThisWeek(e.currentTarget.checked, d.thisWeek)} />
    <span class="sw" aria-hidden="true"></span>
    <span class="tx">
      <b>이번 주는 더 결제하지 않음</b>
      <small>{r && !r.error ? `이미 결제한 ${won(r.spentThisWeek)}원만 반영하고, 다음 주부터 나눠요` : '다음 주부터 나눠요'}</small>
    </span>
  </label>

  <!-- 유지 계획(keep·hold)에서는 유지가 곧 계획이라 끌 수 없다. 스위치는 켜진 채로 보여만 준다 -->
  <label class="toggle" for="keep-on" class:fixed={mode !== 'reach'}>
    <input id="keep-on" type="checkbox" checked={keep.on || mode !== 'reach'} disabled={mode !== 'reach'} onchange={e => setKeep({ on: e.currentTarget.checked })} />
    <span class="sw" aria-hidden="true"></span>
    <span class="tx">
      <b>{mode === 'keep' ? `지금부터 ${tierName} 유지` : mode === 'hold' ? `${cur?.name} 유지 → ${tierName} 유지` : `달성한 뒤에도 ${tierName} 유지`}</b>
      <small>{keep.on || mode !== 'reach' ? `${keep.every === 1 ? '매주' : `${keep.every}주마다`} 한 번 결제해서 ${keep.weeks}주 동안 지켜요` : '켜면 유지에 필요한 금액까지 주차별 계획에 넣어요'}</small>
    </span>
  </label>
  {#if keep.on || mode !== 'reach'}
    <div class="keep">
      <label for="keep-every">충전 주기
        <select id="keep-every" value={keep.every} onchange={e => setKeep({ every: Number(e.currentTarget.value) })}>
          {#each Array.from({ length: 12 }, (_, i) => i + 1) as n (n)}<option value={n}>{n === 1 ? '매주' : `${n}주마다`}</option>{/each}
        </select>
      </label>
      <label for="keep-weeks">유지 기간
        <select id="keep-weeks" value={keep.weeks} onchange={e => setKeep({ weeks: Number(e.currentTarget.value) })}>
          {#each [[13, '13주 (약 3개월)'], [26, '26주 (약 6개월)'], [52, '52주 (약 1년)']] as [n, t] (n)}<option value={n}>{t}</option>{/each}
        </select>
      </label>
    </div>
  {/if}

  <div class="facts">
    {#if mode === 'reach'}
      <div><span>목표 주</span><b class="mono">{md(weekStart)}(목) – {md(p.date)}({dow(p.date)})</b></div>
      <div><span>남은 결제 기회</span><b>{weeksAhead === 0 ? '이번 주뿐' : `이번 주 포함 ${weeksAhead + 1}주`}</b></div>
    {:else if mode === 'hold'}
      <div><span>{tierName}로 내려가는 주</span><b class="mono">{md(weekStart)}(목)부터</b></div>
    {/if}
    {#if r && !r.error}
      <div><span>결제를 나눌 주</span><b>{r.weeksCount}주{#if p.skipThisWeek} <em>(이번 주 제외)</em>{/if}{#if r.timeline.some(w => !w.counts && !w.skipped)} <em>(그 전 결제는 목표일 전에 빠져요)</em>{/if}</b></div>
      <div><span>이번 주 이미 결제</span><b class="mono">{won(r.spentThisWeek)}원</b></div>
    {/if}
  </div>
  {#if keep.on || mode !== 'reach'}
    <p class="note">유지 계산에는 블랙 이월{d.carry ? `(지금 ${won(d.carry)}원)` : ''}도 넣었어요. 250만을 넘긴 결제는 그 주 실적에 들지 않고 이월로 쌓였다가, 모자라는 목요일에 채워져요.</p>
  {:else if d.carry}
    <p class="note">이월 {won(d.carry)}원은 목요일 갱신 때 부족분을 메우는 데만 쓰여서 계획에는 넣지 않았어요. 유지를 켜면 넣어 계산해요.</p>
  {/if}
</article>

<style>
  .label { display: block; font-size: 12px; color: var(--color-tx3); margin: 14px 0 6px; }
  .tiers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  /* 칸 폭이 좁으면 '브론즈 15만'이 칸을 넘친다. 화면이 아니라 이 칸 묶음의 폭으로 둘씩 나눈다 */
  .tiers-wrap { container-type: inline-size; }
  @container (max-width: 420px) { .tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .tier {
    appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600;
    display: flex; align-items: center; gap: 7px; padding: 8px 10px; border-radius: 11px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
    transition: border-color .2s, background .2s, transform .15s;
  }
  .tier:hover { transform: translateY(-1px); border-color: var(--color-line2); }
  .tier i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); flex: none; box-shadow: inset 0 0 0 1px var(--ring-on-fill); }
  .tier small { margin-left: auto; font-weight: 400; font-size: 11px; color: var(--color-tx3); white-space: nowrap; }
  /* 회색 칸에 등급색을 섞으면 탁해진다. 카드색에 섞고 비율을 올려 또렷하게 둔다 */
  .tier[aria-pressed="true"] { border-color: var(--c); background: color-mix(in oklab, var(--c) 26%, var(--color-panel)); color: var(--color-tx); }
  /* 글자는 칠하는 색이 아니라 잉크색이다. 파스텔로 쓰면 밝은 화면에서 안 보인다 */
  .tier[aria-pressed="true"] small { color: var(--ink); }
  .daterow { display: flex; align-items: center; gap: 10px; }
  input[type=date] {
    flex: 1; font: inherit; font-family: var(--font-mono); font-size: 15px; color: var(--color-tx);
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 11px; padding: 9px 12px;
    color-scheme: inherit; outline: none; transition: border-color .2s;
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
  .unitrow { margin-top: 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .unitrow span { display: grid; font-size: 13px; font-weight: 600; line-height: 1.35; }
  .unitrow small { font-size: 11.5px; font-weight: 400; color: var(--color-tx3); }
  .unitrow select, .keep select { font: inherit; font-size: 13.5px; color: var(--color-tx); background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 10px; outline: none; color-scheme: inherit; }
  .unitrow select:focus { border-color: var(--color-lav); }
  .keep { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
  .keep label { display: grid; gap: 4px; font-size: 12px; color: var(--color-tx3); }
  .keep select { font: inherit; font-size: 13.5px; color: var(--color-tx); background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 10px; padding: 8px 10px; outline: none; color-scheme: inherit; }
  .keep select:focus { border-color: var(--color-lav); }
  .facts { margin-top: 16px; display: grid; gap: 8px; padding-top: 14px; border-top: 1px dashed var(--color-line); }
  .facts div { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; }
  .facts span { color: var(--color-tx3); }
  .facts b { font-weight: 600; text-align: right; }
  .facts em { font-style: normal; font-weight: 400; font-size: 11.5px; color: var(--color-tx3); }
  .note { margin: 12px 0 0; font-size: 12px; color: var(--color-butter); }
  .modenote {
    margin: 10px 0 0; padding: 9px 11px; border-radius: 10px; font-size: 12.5px; line-height: 1.5; color: var(--color-tx2);
    background: color-mix(in oklab, var(--color-lav) 10%, transparent); border: 1px solid color-mix(in oklab, var(--color-lav) 30%, transparent);
  }
  .modenote b { color: var(--color-tx); }
  .toggle.fixed { cursor: default; }
  /*
   * 좁은 화면. 셋씩 두면 한 칸이 100px 남짓이라 '브론즈'와 '15만'이 맞붙는다.
   * 둘씩 세 줄로 나눈다.
   *
   * 이 덩어리는 스타일시트 맨 끝에 둔다. 가운데 끼우면 뒤에 오는 기본 규칙이
   * 그대로 덮어쓴다. (중단점은 app.css에 적어 둔 좁은 화면 기준값 672)
   */
  @media (max-width: 672px) {
    .tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
</style>