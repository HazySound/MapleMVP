<script lang="ts">
  import { MAX_EXTRA, app, setExtra } from '../store.svelte'
  import { addDays, md, spotlight, tierColor, tierVar, tierIdx, tierName, won } from '../format'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)
  const up = $derived(d.tiers[tierIdx(d.tiers, sim.next) + 1])
  const showCarry = $derived(d.carry > 0 || sim.carryAfter > 0)

  // 현재 등급이 며칠까지 유지되는지. k번의 갱신을 버티면 그다음 갱신 하루 전까지 유지된다
  const keepText = $derived.by(() => {
    if (!sim.current) return '-'
    const k = sim.keepWeeks
    const until = addDays(d.deadline, k * 7 - 1)
    const [, m, day] = until.split('-')
    const text = `${Number(m)}월 ${Number(day)}일까지`
    return k >= sim.forecast.length ? `${text} 이상` : text
  })

  // 금액 직접 입력
  let editing = $state(false)
  let draft = $state('')
  function commit() {
    editing = false
    setExtra(Number(draft.replace(/[^\d]/g, '')) || 0)
  }
</script>


<article class="card" use:spotlight>
  <h3 class="card-title">이번 주 결제 시뮬레이터 <span class="sub">Esc로 초기화</span></h3>
  <div class="val">
    <input class="amt mono" type="text" inputmode="numeric" aria-label="이번 주 추가 결제 금액"
      value={editing ? draft : won(app.extra)}
      onfocus={e => { editing = true; draft = app.extra ? String(app.extra) : ''; e.currentTarget.select() }}
      oninput={e => (draft = e.currentTarget.value)}
      onblur={commit}
      onkeydown={e => e.key === 'Enter' && e.currentTarget.blur()} />
    <small>원 추가</small>
  </div>
  <label for="sim" class="hint">직접 입력하거나 막대를 움직이면 게이지·등급·하락 그래프가 같이 바뀌어요</label>
  <input id="sim" type="range" min="0" max={MAX_EXTRA} step="1000" value={app.extra}
    style="--p:{(app.extra / MAX_EXTRA) * 100}%"
    oninput={e => setExtra(Number(e.currentTarget.value))} />
  <div class="quick">
    <button onclick={() => setExtra(0, true)}>초기화</button>
    {#each [10_000, 50_000, 100_000, 500_000] as a (a)}
      <button onclick={() => setExtra(app.extra + a, true)}>+{a / 10000}만</button>
    {/each}
  </div>
  <div class="out">
    <div class="kv"><span>현재 등급</span><b style="color:{tierVar(sim.current)}">{tierName(d.tiers, sim.current)}</b></div>
    <div class="kv"><span>다음 주 예정 등급</span><b style="color:{tierVar(sim.next)}">{tierName(d.tiers, sim.next)}</b></div>
    <div class="kv"><span>최근 13주 합계</span><b class="mono">{won(sim.total)}</b></div>
    <div class="kv"><span>다음 주 예상 합계</span><b class="mono">{won(sim.forecast[0].sum)}</b></div>
    <div class="kv"><span>현재 등급 유지</span><b>{keepText}</b></div>
    {#if up}
      <div class="kv"><span>다음 단계까지</span><b class="mono">{up.name} −{won(Math.max(0, up.th - sim.forecast[0].sum - d.carry))}</b></div>
    {:else}
      <div class="kv none"><span>다음 단계까지</span><b>—<em>더 위 등급이 없어요</em></b></div>
    {/if}
    {#if showCarry}
      <div class="kv carry"><span>이월 잔액 (현재)</span><b class="mono">{won(d.carry)}</b></div>
      <div class="kv carry">
        <span>다음 주 이월</span>
        <b class="mono">{won(sim.carryAfter)}</b>
        {#if sim.carryAdded}<em>+{won(sim.carryAdded)} 적립</em>{:else if sim.carryUsed}<em>−{won(sim.carryUsed)} 사용</em>{/if}
      </div>
    {/if}
  </div>
</article>

<style>
  .val { display: flex; align-items: baseline; gap: 6px; margin-top: 10px; }
  .val small { font-size: 14px; color: var(--color-tx3); }
  .amt {
    flex: 1; min-width: 0; max-width: 240px; font-size: 28px; font-weight: 700; letter-spacing: -.02em; text-align: right;
    color: var(--color-tx); background: var(--color-bg2);
    border: 1px solid var(--color-line); border-radius: 12px; padding: 4px 12px; outline: none;
    transition: border-color .2s;
  }
  .amt:focus { border-color: var(--color-lav); }
  .hint { display: block; font-size: 12px; color: var(--color-tx3); }
  input[type=range] { -webkit-appearance: none; appearance: none; width: 100%; height: 30px; background: transparent; margin-top: 6px; cursor: pointer; }
  input[type=range]::-webkit-slider-runnable-track { height: 8px; border-radius: 99px; border: 1px solid var(--color-line); background: linear-gradient(90deg, var(--color-lav) 0 var(--p), var(--color-bg2) var(--p)); }
  input[type=range]::-webkit-slider-thumb {
    -webkit-appearance: none; width: 22px; height: 22px; margin-top: -8px; border-radius: 50%;
    background: var(--color-tx); border: 4px solid var(--color-lav);
    box-shadow: 0 0 0 6px color-mix(in oklab, var(--color-lav) 22%, transparent); transition: box-shadow .2s;
  }
  input[type=range]:active::-webkit-slider-thumb { box-shadow: 0 0 0 10px color-mix(in oklab, var(--color-lav) 28%, transparent); }
  .quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
  .quick button { appearance: none; cursor: pointer; font-family: var(--font-mono); font-size: 12px; padding: 5px 9px; border-radius: 8px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2); }
  .quick button:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .out { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 8px; margin-top: 14px; }
  .kv { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px; }
  .kv span { display: block; font-size: 11.5px; color: var(--color-tx3); }
  .kv b { font-size: 15.5px; font-weight: 600; }
  .kv.carry { border-color: color-mix(in oklab, var(--color-butter) 30%, var(--color-line)); }
  .kv.carry b { color: var(--color-butter); }
  .kv em { font-style: normal; font-size: 11px; color: var(--color-tx3); margin-left: 6px; }
  .kv.none { border-style: dashed; opacity: .6; }
  .kv.none b { color: var(--color-tx3); font-weight: 500; }
  .kv.none em { display: block; margin: 0; }
</style>
