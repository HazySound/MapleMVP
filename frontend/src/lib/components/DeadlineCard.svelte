<script lang="ts">
  import { onMount } from 'svelte'
  import { app, refresh, setExtra, setTarget } from '../store.svelte'
  import { TIER_COLOR, addDays, countup, md, spotlight, tierName, won } from '../format'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)

  // ---- 카운트다운 ----
  let left = $state(0)
  let reloadedFor = ''
  function tick() {
    left = Math.max(0, new Date(d.deadline).getTime() - Date.now())
    // 창을 켜둔 채로 목요일이 되면 새 주로 다시 불러온다
    if (left === 0 && reloadedFor !== d.deadline) { reloadedFor = d.deadline; refresh() }
  }
  onMount(() => {
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  })
  const cd = $derived({
    d: Math.floor(left / 864e5),
    h: Math.floor(left / 36e5) % 24,
    m: Math.floor(left / 6e4) % 60,
    s: Math.floor(left / 1e3) % 60,
  })
  const pad = (n: number) => String(n).padStart(2, '0')

  // ---- 유지 안내 (시뮬레이션 금액까지 반영한 현재 등급 기준) ----
  const cur = $derived(sim.current ?? d.current)
  const curTh = $derived(d.tiers.find(t => t.key === cur)?.th ?? 0)
  // 다음 목요일 합계(시뮬레이션 포함)로 지금 등급을 지킬 수 있는지
  const keepNeed = $derived(Math.max(0, (cur ? curTh : d.tiers[0].th) - sim.forecast[0].sum - d.carry))

  // ---- 목표 ----
  const target = $derived(d.tiers.find(t => t.key === app.target)!)
  const needBase = $derived(d.need[app.target])
  // 목표 등급을 지금 이미 달성했는지 (다음 목요일에 지킬 수 있는지와는 별개)
  const targetDone = $derived(Math.max(0, d.needNow[app.target] - sim.extra) === 0)
  const needLeft = $derived(Math.max(0, needBase - sim.extra))
  // 목표 등급은 다음 목요일 기준이라, 가장 오래된 주가 빠진 합계로 진행률을 그린다
  const nextBase = $derived(sim.forecast[0].sum - sim.extra)
  const pctBase = $derived(Math.min(100, ((nextBase + d.carry) / target.th) * 100))
  const pctExtra = $derived(Math.max(0, Math.min(100 - pctBase, (sim.extra / target.th) * 100)))
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">이번 주 마감까지 <span class="sub">{md(d.thisWeek)}(목) – {md(addDays(d.thisWeek, 6))}(수) 23:59</span></h3>

  <div class="countdown" class:urgent={cd.d === 0}>
    <div class="cd"><b class="mono">{cd.d}</b><span>일</span></div>
    <div class="cd"><b class="mono">{pad(cd.h)}</b><span>시간</span></div>
    <div class="cd"><b class="mono">{pad(cd.m)}</b><span>분</span></div>
    <div class="cd"><b class="mono">{pad(cd.s)}</b><span>초</span></div>
  </div>

  <div class="callout" class:ok={keepNeed === 0 && !!cur}>
    <div class="ic">
      {#if keepNeed === 0 && cur}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
      {/if}
    </div>
    <div class="t">
      {#if !cur}
        <b><span class="mono">{won(keepNeed)}</span>원 더 결제하면 브론즈</b>
        지금은 MVP 등급이 없어요. 수요일 23:59까지 결제하면 다음 목요일에 반영돼요.
      {:else if keepNeed === 0}
        <b>{tierName(d.tiers, cur)} 유지 확정</b>
        {#if sim.extra}시뮬레이션 금액까지 결제하면 {/if}다음 주 목요일에도 {tierName(d.tiers, cur)} 등급이에요. 여유 <span class="mono">{won(sim.forecast[0].sum + d.carry - curTh)}</span>원
      {:else}
        <b><span class="mono">{won(keepNeed)}</span>원 더 결제하면 {tierName(d.tiers, cur)} 유지</b>
        지금대로면 다음 목요일에 {tierName(d.tiers, sim.next)}(으)로 내려가요. 가장 오래된 {md(d.weeks[0].start)}–{md(d.weeks[0].end)} 주의 {won(d.weeks[0].amount)}원이 그때 13주 합계에서 빠지기 때문이에요.
      {/if}
    </div>
  </div>

  <div class="targets">
    <h3 class="card-title">목표 등급 <span class="sub">달성 여부는 지금 · 금액은 다음 주 목요일 기준 · 숫자키 1–6</span></h3>
    <div class="chips" role="group" aria-label="목표 등급 선택">
      {#each d.tiers as t (t.key)}
        {@const now = Math.max(0, d.needNow[t.key] - sim.extra)}
        {@const next = Math.max(0, d.need[t.key] - sim.extra)}
        <button class="chip" class:done={now === 0} aria-pressed={app.target === t.key} style="--c:{TIER_COLOR[t.key]}" onclick={() => setTarget(t.key)}>
          <span class="nm"><i></i>{t.name}{#if t.key === cur}<em>유지</em>{/if}</span>
          <small class="mono">{now === 0 ? '달성' : '+' + won(next)}</small>
          {#if now === 0 && next > 0}<small class="keep mono">유지 +{won(next)}</small>{/if}
        </button>
      {/each}
    </div>

    <div class="need">
      <div>
        <div class="dl">
          {#if sim.extra}
            {target.name}{targetDone ? ' 유지에' : '까지'} 남은 금액 · 시뮬레이션 {won(sim.extra)}원 반영
          {:else if targetDone && needBase > 0}
            {target.name} 유지를 위해서는 이번 주에 추가 결제 필요
          {:else}
            {target.name}까지 이번 주 추가 결제 필요
          {/if}
        </div>
        <div class="v mono"><span use:countup={sim.extra ? needLeft : needBase}>0</span><small>원</small></div>
      </div>
      <button class="btn primary" onclick={() => setExtra(Math.ceil(needBase / 1000) * 1000, true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        시뮬레이터에 넣기
      </button>
    </div>
    <div class="prog" style="--c:{TIER_COLOR[target.key]}">
      <i style="width:{pctBase}%"></i><em style="left:{pctBase}%;width:{pctExtra}%"></em>
    </div>
    <div class="legend">
      <span><i style="background:var(--color-lav)"></i>다음 주 예상 합계{d.carry ? ' + 이월' : ''}</span>
      <span><i style="background:repeating-linear-gradient(45deg,#95e2c4 0 3px,#4d7a69 3px 6px)"></i>시뮬레이터 추가분</span>
    </div>
  </div>
</article>

<style>
  .countdown { display: flex; gap: 10px; margin-top: 12px; }
  .cd { flex: 1; background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 8px 8px; text-align: center; }
  .cd b { display: block; font-size: clamp(22px, 2.6vw, 32px); font-weight: 600; line-height: 1.1; }
  .cd span { font-size: 11px; color: var(--color-tx3); }
  .urgent .cd b { color: var(--color-peach); }

  .callout {
    --k: var(--color-peach);
    margin-top: 14px; display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--radius-md);
    background: linear-gradient(100deg, color-mix(in oklab, var(--k) 15%, var(--color-panel)), var(--color-panel2));
    border: 1px solid color-mix(in oklab, var(--k) 35%, var(--color-line));
    transition: background .4s, border-color .4s;
  }
  .callout.ok { --k: var(--color-mint); }
  .ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex: none; background: color-mix(in oklab, var(--k) 24%, transparent); color: var(--k); }
  .ic svg { width: 18px; height: 18px; }
  .t { font-size: 13px; color: var(--color-tx2); line-height: 1.5; }
  .t b { display: block; font-size: 17px; color: var(--color-tx); font-weight: 600; }

  .targets { margin-top: 16px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
  .chip {
    appearance: none; cursor: pointer; font: inherit; font-size: 13px; text-align: left;
    display: grid; min-width: 88px; padding: 7px 11px 6px; border-radius: 11px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
    transition: transform .15s, border-color .2s, background .2s;
  }
  .chip:hover { transform: translateY(-1px); border-color: var(--color-line2); }
  .chip[aria-pressed="true"] { border-color: var(--c); background: color-mix(in oklab, var(--c) 14%, var(--color-bg2)); color: var(--color-tx); }
  .nm { display: flex; align-items: center; gap: 6px; font-weight: 600; }
  .nm i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .nm em { font-style: normal; font-weight: 400; font-size: 11px; color: var(--color-tx3); }
  .chip small { font-size: 11px; color: var(--color-tx3); }
  .chip[aria-pressed="true"] small { color: var(--c); }
  .chip.done small { color: var(--color-good); }
  /* 지금은 달성했지만 다음 목요일에 떨어지는 등급 */
  .chip small.keep { color: var(--color-peach); }
  .chip[aria-pressed="true"] small.keep { color: var(--color-peach); }

  .need { margin-top: 14px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .dl { font-size: 12.5px; color: var(--color-tx3); }
  .v { font-size: 36px; font-weight: 700; line-height: 1.05; letter-spacing: -.02em; }
  .v small { font-size: .42em; color: var(--color-tx3); font-weight: 400; margin-left: 4px; }

  .prog { margin-top: 12px; height: 10px; border-radius: 99px; background: var(--color-bg2); border: 1px solid var(--color-line); overflow: hidden; position: relative; }
  .prog i { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: linear-gradient(90deg, var(--color-lav), var(--c)); transition: width .7s cubic-bezier(.2, .8, .2, 1); }
  .prog em { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, rgba(149, 226, 196, .8) 0 5px, rgba(149, 226, 196, .35) 5px 10px); transition: left .5s cubic-bezier(.2, .8, .2, 1), width .5s cubic-bezier(.2, .8, .2, 1); }
</style>
