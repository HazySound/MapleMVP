<script lang="ts">
  import { app } from '../store.svelte'
  import { autoTargets, fixTargets, planner, spreadShortfall, unlockAll, unlockZeros } from '../plan.svelte'
  import { TIER_COLOR, TIER_INK_VAR, TIER_VAR, countup, eul, mdw, mdy, ro, spotlight, tierName, won } from '../format'

  const d = $derived(app.data!)
  const p = $derived(planner.input!)
  const r = $derived(planner.result)
  const tier = $derived(d.tiers.find(t => t.key === p.target)!)
  const cur = $derived(d.tiers.find(t => t.key === d.current) ?? null)
  /** reach: 날짜까지 달성 · keep: 지금 등급 유지 · hold: 더 낮은 등급으로 낮춰 유지 */
  const mode = $derived(r && !r.error ? r.mode : 'reach')
  /** 지금 등급을 지키다가 목표 등급 기준으로 바뀌는 주의 시작일(지금 등급을 날짜까지 지킬 때만) */
  const holdStart = $derived(r && !r.error && r.hold ? r.timeline[r.hold.until]?.start ?? null : null)
  /** 실제로 목표 등급이 되는(낮출 때는 목표 등급까지 내려오는) 첫 주 */
  const firstWeek = $derived(r && !r.error && r.firstAt != null ? r.timeline[r.firstAt] ?? null : null)
  /** 그 전까지 보이는 위 등급들(옛 결제가 13주 안에 남아서) */
  const above = $derived(r && !r.error && firstWeek ? [...new Set(r.timeline.slice(0, r.firstAt!).map(w => w.tier))].filter(Boolean) as string[] : [])
  /** 결제를 더 안 하면 내려가는 흐름. 너무 길면 앞의 넷만 */
  const decay = $derived(r && !r.error ? r.decay.slice(0, 4) : [])
  const ref = $derived(d.thisWeek)
  const eulOf = (w?: string) => (w ? eul(w) : '')
  /** 고정 금액만으로 나간 결제 합계(유지 구간에서 자동 결제가 없을 때 '추가 결제 없이'가 맞는지 가린다) */
  const fixedPlanned = $derived(r && !r.error ? r.timeline.filter(w => w.fixed).reduce((a, w) => a + w.amount, 0) : 0)
  /** 고정 때문에 자동으로 짤 때보다 더 내는 금액, 목표 등급이 늦어지는지 */
  const extra = $derived(r && !r.error && r.auto ? r.planned - r.auto.planned : 0)
  const autoFirst = $derived(r && !r.error && r.auto && r.auto.firstAt != null ? r.timeline[r.auto.firstAt] ?? null : null)
  const later = $derived(!!(r && !r.error && r.auto && r.auto.firstAt != null && (r.firstAt == null || r.firstAt > r.auto.firstAt)))
  /** 0원으로 고정한 주(자동 계산이 그 주를 못 쓴다) */
  const zeros = $derived(r && !r.error ? r.timeline.filter(w => w.fixed && w.amount === 0 && w.counts) : [])
  const last = $derived(r?.timeline.at(-1))
  const reachedWeek = $derived(r?.reached != null ? r.timeline[r.reached] : null)
  const scope = $derived(planner.selected.length ? `선택한 ${planner.selected.length}주` : '모든 주')

  let perWeek = $state(200_000)
  let perText = $state('200,000')
  function commitPer() {
    const v = Number(perText.replace(/[^\d]/g, ''))
    perWeek = v
    perText = v.toLocaleString('ko-KR')
  }

  /** 이번 주 13주 합계(+이월) 기준으로 목표 등급까지 더 필요한 금액 */
  const nowNeed = $derived(d.needNow[p.target] ?? 0)
  const k = $derived(r && !r.error ? r.keep : null)
  /** 유지 구간에서 목요일 갱신 직후엔 목표 등급 아래로 내려가는 주(그 주 결제로 다시 오른다) */
  const rank = (key: string | null) => (key ? d.tiers.findIndex(t => t.key === key) : -1)
  const dips = $derived(k && r && !r.error ? r.timeline.filter(w => w.keep && rank(w.thu) < rank(p.target)) : [])
  const keepEnd = $derived(r?.timeline.at(-1))
  /** 유지 결제가 매번 같은 금액인지. 모자라는 만큼만 낼 때는 주마다 다를 수 있다 */
  const keepPays = $derived(r && !r.error ? r.timeline.filter(w => w.keepPay && w.amount > 0) : [])
  const even = $derived(keepPays.length > 0 && keepPays.every(w => w.amount === keepPays[0].amount))
  const block = $derived(k?.blocked[0] ? r!.timeline[k.blocked[0].offset] : null)

  const status = $derived.by(() => {
    if (!r || r.error) return 'none'
    if (r.required === 0) return 'done'
    return r.shortfall > 0 ? 'short' : 'ok'
  })
</script>

<article class="card sum" use:spotlight style="--c:{TIER_VAR[p.target]};--ink:{TIER_INK_VAR[p.target]}">
  <h3 class="card-title">계획 결과 <span class="sub">{#if mode === 'keep'}{tier.name} 유지 ({won(tier.th)}원){:else if mode === 'hold'}{holdStart ? `${mdw(holdStart, ref)}부터 ${tier.name} 기준 · 그 전까지 ${cur?.name}` : `${tier.name}${ro(tier.name)} 낮춰 유지`}{:else}{mdy(p.date, ref)}까지 {tier.name} ({won(tier.th)}원){/if}</span></h3>

  {#if r?.error}
    <p class="err">{r.error}</p>
  {:else if r}
    {#if mode === 'reach'}
    <div class="banner {status}">
      <div class="ic">
        {#if status === 'short'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        {/if}
      </div>
      <div class="t">
        {#if status === 'done'}
          <b>추가 결제 없이 달성돼요</b>
          {mdy(p.date, ref)}가 든 주에도 13주 합계가 {won(r.base)}원으로 {tier.name} 기준을 넘어요.
        {:else if status === 'short'}
          <b><span class="mono">{won(r.shortfall)}</span>원 모자라요</b>
          지금 계획대로면 {mdy(p.date, ref)}가 든 주 13주 합계가 {won(last?.sum ?? 0)}원이에요. 모자란 금액을 아래에서 나눠 넣어 보세요.
        {:else}
          <b>달성 가능 · {reachedWeek ? `${mdw(reachedWeek.start, ref)}부터 ${tier.name}` : ''}</b>
          {#if r.autoCount === 0}
            정한 금액만으로 충분해요{r.surplus ? `. 여유 ${won(r.surplus)}원` : ''}.
          {:else if r.fixedSum > 0}
            정한 {won(r.fixedSum)}원 외에 나머지 {r.autoCount}주에 매주 {won(r.autoPer)}원씩 자동으로 나눴어요.
          {:else}
            {r.weeksCount}주 동안 매주 {won(r.autoPer)}원씩 결제하면 돼요.
          {/if}
        {/if}
      </div>
    </div>
    {:else}
    <!-- 지금 등급 이하를 골랐다: 달성할 것이 없고 유지만 짠다 (2026-10-04) -->
    <div class="banner done">
      <div class="ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      </div>
      <div class="t">
        {#if mode === 'keep'}
          <b>지금 {cur?.name} 등급 · {tier.name} 유지 계획</b>
          이미 달성한 등급이라 날짜와 상관없이 지금부터 유지에 필요한 금액만 나눠요.
        {:else}
          <!-- '○○ 주부터 골드'를 '그때 골드가 된다'로 읽었다(2026-10-12 문의). 기준이 바뀌는 날과 실제로 그 등급이 되는 날을 나눠 쓴다 -->
          <b>지금 {cur?.name} · {firstWeek ? `${mdw(firstWeek.start, ref)}부터 ${tier.name}` : `${tier.name}${ro(tier.name)} 낮춰 유지`}{block ? ' · 끊기는 주 있음' : ''}</b>
          {#if holdStart}{mdy(r.timeline[r.hold!.until - 1]?.end ?? holdStart, ref)}까지는 {cur?.name}{eulOf(cur?.name)} 지키고, 그다음 주부터 {tier.name} 기준으로 나눠요.{/if}
          {#if firstWeek && above.length}그 전까지는 지금 결제가 13주 안에 남아 {above.map(x => tierName(d.tiers, x)).join('·')}{ro(tierName(d.tiers, above.at(-1)!))} 보여요.{/if}
          {#if !firstWeek}이 계획대로면 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name}보다 위 등급이에요. 고정한 금액이 크면 이렇게 돼요.{/if}
          {#if decay.length}<span class="decay">결제를 더 안 하면: {decay.map(x => `${mdw(x.start, ref)} ${x.tier ? tierName(d.tiers, x.tier) : '등급 없음'}`).join(' → ')}</span>{/if}
          {#if r.stay && !r.stay.short}<span class="save">같은 기간 {cur?.name}{eulOf(cur?.name)} 계속 지키면 <b class="mono">{won(r.stay.planned)}</b>원, {tier.name}{ro(tier.name)} 낮추면 <b class="mono">{won(r.auto?.planned ?? r.planned)}</b>원{(r.auto?.planned ?? r.planned) < r.stay.planned ? ` · ${won(r.stay.planned - (r.auto?.planned ?? r.planned))}원 덜 들어요` : ''}{r.auto ? ' (고정 없이 자동으로 짠 금액)' : ''}.</span>{/if}
        {/if}
      </div>
    </div>
    {/if}

    {#if k}
      <div class="banner keep" class:short={!!block}>
        <div class="ic">
          {#if block}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          {:else}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>
          {/if}
        </div>
        <div class="t">
          {#if block}
            <b>{mdw(block.start, ref)}{k.blocked.length > 1 ? ` 등 ${k.blocked.length}주` : ''}에 {tier.name} 유지가 끊겨요</b>
            {mdw(block.start, ref)} 주 13주 합계가 <span class="mono">{won(k.blocked[0].missing)}</span>원 모자라요{k.blocked.length > 1 ? '. 끊기는 주는 표에 빨갛게 표시했어요' : ''}. 그 주 13주 안의 결제가 모두 고정돼 있어서 자동으로 채울 주가 없어요.
            그 사이 주의 <b class="inl">고정을 풀거나</b>, 고정 금액을 올리거나, <b class="inl">충전 주기를 줄여</b> 주세요.
            {#if r.auto && !r.auto.short}자동으로 짜면 끊기지 않고 합계 <span class="mono">{won(r.auto.planned)}</span>원이에요. <button class="link" onclick={unlockAll}>고정 모두 풀고 자동으로</button>{/if}
          {:else if k.asNeeded}
            <!-- 결제 주마다 모자라는 만큼만. 옛 결제가 남은 동안은 안 내고, 모자라는 주부터 낸다 (2026-10-05) -->
            {#if k.count === 0 && fixedPlanned > 0}
              <!-- 자동 결제가 0번이어도 고정한 결제는 낸다. 전에는 이때도 '추가 결제 없이'라고 썼다(2026-10-12 문의) -->
              <b>정해 둔 금액만으로 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name} 유지</b>
              고정한 결제 <span class="mono">{won(fixedPlanned)}</span>원으로 {k.weeks}주 동안 지켜져서 더 낼 주가 없어요.
            {:else if k.count === 0}
              <b>추가 결제 없이 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name} 유지</b>
              지금 결제만으로 {k.weeks}주 동안 지켜져요.
            {:else}
              <b>{even ? `${k.every === 1 ? '매주' : `${k.every}주마다`} ` : '주마다 달라요 · 많을 때 '}<span class="mono">{won(k.per)}</span>원</b>
              {k.count}번 결제하면 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name} 등급이 목요일에도 끊기지 않아요(합계 <span class="mono">{won(r.planned)}</span>원).
              {#if !even}앞으로 빠질 결제를 남은 주에 고르게 나눠 내요. 큰 결제가 빠지고 나면 줄고{p.target === 'black' ? '' : ', 한 단계 위 등급에는 닿지 않게 맞춰요'}. 금액은 아래 표에 주마다 적어 뒀어요.{/if}
              {#if mode === 'hold' && holdStart}그 전까지는 {cur?.name}, {mdw(holdStart, ref)}부터는 {tier.name} 기준으로 셌어요.{/if}
              {#if k.carryUsed}250만을 넘긴 결제는 이월로 쌓였다가 모자라는 목요일에 채워지는 것까지 넣었어요.{/if}
            {/if}
          {:else if k.per === 0 && k.count > 0}
            <b>유지 결제 없이 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name} 유지</b>
            정해 둔 금액만으로 {k.weeks}주 동안 지켜져요.
          {:else}
            <b>{mode === 'reach' ? '달성 뒤 ' : ''}{k.every === 1 ? '매주' : `${k.every}주마다`} <span class="mono">{won(k.per)}</span>원</b>
            {#if dips.length}
              {k.count}번 결제하면 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 매주 결제 뒤 {tier.name} 등급이에요{k.every > 1 ? ` (주당 평균 ${won(Math.round(k.per / k.every))}원)` : ''}.
              다만 <b class="inl">목요일 갱신 때 내려갔다가 그 주에 결제하면 다시 오르는 주가 {dips.length}번</b> 있어요({dips.map(w => mdy(w.start, ref)).slice(0, 3).join(', ')}{dips.length > 3 ? ' 등' : ''}). 표에 주마다 적어 뒀어요.
            {:else}
              {k.count}번 결제하면 {keepEnd ? mdy(keepEnd.end, ref) : ''}까지 {tier.name} 등급이 목요일에도 끊기지 않아요{k.every > 1 ? ` (주당 평균 ${won(Math.round(k.per / k.every))}원)` : ''}.
            {/if}
            {#if k.reachExtra}첫 유지 결제 전까지 버티도록 달성하는 주에 주당 {won(k.reachExtra)}원을 더 넣었어요.{/if}
            {#if k.carryUsed}250만을 넘긴 결제는 이월로 쌓였다가 모자라는 목요일에 채워지는 것까지 넣었어요.{/if}
            {#if mode === 'hold' && holdStart}그 전까지는 {cur?.name}, {mdw(holdStart, ref)}부터는 {tier.name} 기준으로 셌어요.{#if k.perAfter !== k.per} 내려간 뒤에는 {k.every === 1 ? '매주' : `${k.every}주마다`} <span class="mono">{won(k.perAfter)}</span>원이에요.{/if}{/if}
          {/if}
        </div>
      </div>
    {/if}

    <!-- 고정한 금액 때문에 자동으로 짤 때보다 더 내거나 목표 등급이 늦어지면 알린다. 다 고정해 두고 왜 계획과 다른지 몰랐다(2026-10-12 문의) -->
    {#if r.auto && !r.auto.short && !block && (extra > 0 || later)}
      <div class="banner fixnote">
        <div class="t">
          <b>고정한 금액 때문에 {extra > 0 ? `자동으로 짤 때보다 ${won(extra)}원 더 내요` : `${tier.name}${ro(tier.name)} 늦게 바뀌어요`}</b>
          {#if later && autoFirst}자동으로 짜면 {mdw(autoFirst.start, ref)}부터 {tier.name}인데, 지금 계획은 {firstWeek ? `${mdw(firstWeek.start, ref)}부터예요` : '유지 기간 안에 안 돼요'}.{/if}
          <button class="link" onclick={unlockAll}>고정 모두 풀고 자동으로</button>
        </div>
      </div>
    {/if}
    {#if zeros.length}
      <p class="zeros">{zeros.length}주를 <b>0원으로 고정</b>해 뒀어요. 0원 고정한 주는 자동 계산이 금액을 넣지 않아요(표에 '0원 고정'으로 표시).
        <button class="link" onclick={unlockZeros}>0원 고정만 풀기</button></p>
    {/if}

    <div class="stats">
      <!-- 이번 주에 결제할 수 있으면 이번 주 기준(인게임 '○○ 등급까지'와 같은 값). 목표 주가 뒤면 그사이 13주에서 빠지는 결제만큼 더 든다 -->
      <!-- 유지·낮춤 계획은 '필요한 금액'·'균등 분배'가 늘 0이라 뜻이 없다. 유지 결제 횟수와 가장 큰 한 번을 보여 준다 -->
      {#if mode !== 'reach' && k}
        <div class="st"><span>결제하는 주</span><b class="mono">{r.timeline.filter(w => w.offset > 0 && w.amount > 0).length}<small>주 · 고정 포함</small></b></div>
        <div class="st"><span>가장 큰 한 번</span><b class="mono">{won(Math.max(0, ...r.timeline.filter(w => w.offset > 0).map(w => w.amount)))}</b></div>
      {:else}
        <div class="st"><span>이번 주 기준 필요한 금액</span><b class="mono" use:countup={nowNeed}>0</b>
          {#if r.required !== nowNeed}<em>목표 주({mdy(r.timeline.find(w => w.start <= p.date && p.date <= w.end)?.start ?? p.date, ref)}) 기준은 {won(r.required)}원{r.required > nowNeed ? ` (그사이 13주에서 ${won(r.required - nowNeed)}원이 빠져요)` : ''}</em>{/if}
        </div>
      {/if}
      {#if mode === 'reach' || !k}<div class="st"><span>균등 분배하면</span><b class="mono">{won(r.equalPer)}<small> × {r.weeksCount}주</small></b></div>{/if}
      <div class="st"><span>계획한 결제 합계</span><b class="mono">{won(r.planned)}</b></div>
      <div class="st"><span>{mode === 'reach' ? '목표 주에 남는 기존 결제' : '지금 13주 합계'}</span><b class="mono">{won(r.base)}</b></div>
    </div>

    <div class="actions">
      <div class="grp">
        <span class="scope">{scope}{eul(scope)}</span>
        <span class="per">매주
          <input id="per-week" type="text" inputmode="numeric" bind:value={perText} onblur={commitPer}
            onkeydown={e => e.key === 'Enter' && (commitPer(), fixTargets(perWeek))} />원
        </span>
        <button class="btn" onclick={() => { commitPer(); fixTargets(perWeek) }}>으로 고정</button>
      </div>
      <div class="grp">
        {#if r.shortfall > 0}
          <button class="btn primary" onclick={spreadShortfall}>부족분 {won(r.shortfall)}원을 {scope}에 나눠 더하기</button>
        {/if}
        <button class="btn" onclick={autoTargets}>{scope} 자동 분배로</button>
      </div>
    </div>
    <p class="hint">
      바로 아래 <button class="link" onclick={() => document.getElementById('plan-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>주차별 계획 표</button>에서 금액을 직접 입력하면 그 주는 고정되고, 나머지 주에 필요한 금액이 자동으로 나뉘어요. 표에서 주를 체크하면 위 버튼은 체크한 주에만 적용돼요.
    </p>
  {/if}
</article>

<style>
  .sum { display: grid; align-content: start; }
  .err { color: var(--color-peach); font-size: 13px; }
  .banner {
    --k: var(--color-mint);
    margin-top: 12px; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--radius-md);
    background: linear-gradient(100deg, color-mix(in oklab, var(--k) 15%, var(--color-panel)), var(--color-panel2));
    border: 1px solid color-mix(in oklab, var(--k) 35%, var(--color-line));
    transition: background .4s, border-color .4s;
  }
  .banner.short { --k: var(--color-peach); }
  .banner.keep:not(.short) { --k: var(--color-lav); }
  .t b.inl { display: inline; font-size: inherit; }
  /* 낮춰 유지: 결제 없이 내려가는 흐름, 지금 등급을 계속 지킬 때와 견준 금액 */
  .t .decay, .t .save { display: block; margin-top: 6px; font-size: 12.5px; color: var(--color-tx3); }
  .t .save b { display: inline; font-size: inherit; font-weight: 600; color: var(--color-tx); }
  .banner.fixnote { --k: var(--color-peach); }
  .banner.fixnote .link { margin-left: 4px; }
  .zeros { margin: 10px 0 0; font-size: 12.5px; color: var(--color-tx2); }
  .zeros .link { margin-left: 4px; }
  .ic { width: 38px; height: 38px; border-radius: 12px; display: grid; place-items: center; flex: none; background: color-mix(in oklab, var(--k) 24%, transparent); color: var(--k); }
  .ic svg { width: 19px; height: 19px; }
  .t { font-size: 13px; color: var(--color-tx2); line-height: 1.5; }
  .t b { display: block; font-size: 18px; color: var(--color-tx); font-weight: 600; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .st { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px; }
  .st span { display: block; font-size: 11.5px; color: var(--color-tx3); }
  .st b { font-size: 17px; font-weight: 700; }
  .st:first-child b { color: var(--ink); }
  .st small { font-size: 12px; font-weight: 400; color: var(--color-tx3); }
  .st em { display: block; margin-top: 2px; font-style: normal; font-size: 11px; line-height: 1.35; color: var(--color-tx3); }
  .actions { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-top: 14px; }
  .grp { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .scope { font-size: 13px; color: var(--color-tx2); }
  .per { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--color-tx2); }
  .per input {
    width: 110px; font-family: var(--font-mono); font-size: 14px; text-align: right; color: var(--color-tx);
    background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: 9px; padding: 7px 10px; outline: none;
  }
  .per input:focus { border-color: var(--color-lav); }
  .hint { margin: 10px 0 0; font-size: 12px; color: var(--color-tx3); }
  .link { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: var(--color-lav); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
</style>
