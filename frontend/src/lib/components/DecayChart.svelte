<script lang="ts">
  import { app } from '../store.svelte'
  import { atX, fit, onResize } from '../canvas'
  import { C, FONT, TIER_COLOR, addDays, hexA, md, spotlight, tierColor, tierVar, tierName, won } from '../format'

  const d = $derived(app.data!)
  const sim = $derived(app.sim ?? d.sim)

  let cv: HTMLCanvasElement
  let wrap: HTMLDivElement
  let hover = $state<number | null>(null)
  let pts: { x: number; y: number }[] = []

  function draw() {
    if (!cv) return
    const { ctx, w, h } = fit(cv)
    const padL = 54, padR = 12, padT = 14, padB = 34
    const pw = w - padL - padR, ph = h - padT - padB
    const series = sim.forecast
    const peak = Math.max(...series.map(s => s.sum + s.carry))
    // 현재 합계 위로 한 등급까지는 보이게
    const nextUp = d.tiers.find(t => t.th > peak)?.th ?? peak
    const topV = Math.max(nextUp * 1.08, peak * 1.12, 200_000)
    const Y = (v: number) => padT + ph - (Math.min(v, topV) / topV) * ph
    const n = series.length
    const X = (k: number) => padL + (k * pw) / (n - 1)
    ctx.clearRect(0, 0, w, h)

    // 등급 띠
    const bounds = [...d.tiers.map(t => t.th), Infinity]
    d.tiers.forEach((t, i) => {
      if (t.th >= topV) return
      const y1 = Y(t.th), y0 = Y(Math.min(bounds[i + 1], topV))
      const c = TIER_COLOR[t.key]
      ctx.fillStyle = hexA(c, 0.07)
      ctx.fillRect(padL, y0, pw, y1 - y0)
      ctx.strokeStyle = hexA(c, 0.35)
      ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.moveTo(padL, y1); ctx.lineTo(w - padR, y1); ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = hexA(c, 0.85)
      ctx.font = `500 10.5px ${FONT.sans}`
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(t.name, padL - 10, Math.max(y0 + 7, Math.min(y1 - 8, (y0 + y1) / 2)))
    })

    // 계단 영역
    const val = (k: number) => series[k].sum
    ctx.beginPath()
    ctx.moveTo(X(0), Y(0))
    for (let k = 0; k < n; k++) { ctx.lineTo(X(k), Y(val(k))); if (k < n - 1) ctx.lineTo(X(k + 1), Y(val(k))) }
    ctx.lineTo(X(n - 1), Y(0))
    ctx.closePath()
    const grad = ctx.createLinearGradient(0, padT, 0, padT + ph)
    grad.addColorStop(0, hexA(C.lav, 0.32))
    grad.addColorStop(1, hexA(C.lav, 0))
    ctx.fillStyle = grad
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(X(0), Y(val(0)))
    for (let k = 1; k < n; k++) { ctx.lineTo(X(k), Y(val(k - 1))); ctx.lineTo(X(k), Y(val(k))) }
    ctx.strokeStyle = C.lav
    ctx.lineWidth = 2
    ctx.stroke()

    // 이월로 메워지는 구간
    for (let k = 0; k < n; k++) {
      const used = k === 0 ? 0 : Math.max(0, series[k - 1].carry - series[k].carry)
      if (used > 0) {
        ctx.fillStyle = hexA(C.butter, 0.35)
        ctx.fillRect(X(k) - 3, Y(val(k) + used), 6, Y(val(k)) - Y(val(k) + used))
      }
    }

    pts = series.map((s, k) => ({ x: X(k), y: Y(s.sum) }))
    if (hover != null) {
      ctx.strokeStyle = 'rgba(255,255,255,.18)'
      ctx.beginPath(); ctx.moveTo(pts[hover].x, padT); ctx.lineTo(pts[hover].x, padT + ph); ctx.stroke()
    }
    series.forEach((s, k) => {
      const on = hover === k
      ctx.beginPath()
      ctx.arc(pts[k].x, pts[k].y, on ? 6 : 3.6, 0, Math.PI * 2)
      ctx.fillStyle = tierColor(s.tier)
      ctx.fill()
      if (on) { ctx.strokeStyle = C.tx; ctx.lineWidth = 2; ctx.stroke() }
      if (k % 2 === 0) {
        ctx.fillStyle = C.tx3
        ctx.font = `10px ${FONT.mono}`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(k === 0 ? '다음 목' : md(addDays(d.deadline, k * 7)), pts[k].x, padT + ph + 16)
      }
    })
  }

  $effect(() => { void app.theme; void sim; void hover; draw() })

  function move(e: PointerEvent) {
    const x = atX(cv, e.clientX)
    let best = 0
    pts.forEach((p, i) => { if (Math.abs(p.x - x) < Math.abs(pts[best].x - x)) best = i })
    hover = best
  }

  const tip = $derived.by(() => {
    if (hover == null || !pts[hover]) return null
    const k = hover, s = sim.forecast[k], p = pts[k], tw = 200
    const left = Math.max(0, Math.min((wrap?.clientWidth ?? 0) - tw, p.x - tw / 2))
    return { k, s, left, top: Math.max(0, p.y - 110), tw }
  })

  // 지금 등급이 몇 번의 갱신 동안 유지되는지 요약
  const summary = $derived.by(() => {
    const now = sim.current ?? d.current
    if (!now) return '지금은 MVP 등급이 없어요.'
    const k = sim.keepWeeks
    const name = tierName(d.tiers, now)
    if (k === 0) return `다음 목요일부터 ${name} 아래로 내려가요.`
    if (k >= sim.forecast.length) return `추가 결제 없이도 ${name}이 ${k}번 넘게 유지돼요.`
    return `${name}은 ${md(addDays(d.deadline, (k - 1) * 7))} 갱신까지 유지되고, ${md(addDays(d.deadline, k * 7))}에 ${tierName(d.tiers, sim.forecast[k].tier)}(으)로 내려가요.`
  })
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">더 결제하지 않으면 <span class="sub">목요일마다 가장 오래된 주가 빠져요</span></h3>
  <p class="sum">{summary}</p>
  <div class="chart" bind:this={wrap} use:onResize={draw}>
    <canvas bind:this={cv} onpointermove={move} onpointerleave={() => (hover = null)}></canvas>
    <div class="tip" class:show={!!tip} style="left:{tip?.left ?? 0}px;top:{tip?.top ?? 0}px;width:{tip?.tw ?? 200}px">
      {#if tip}
        <b>{md(addDays(d.deadline, tip.k * 7))} (목)</b>
        <span style="color:var(--color-tx3)">{tip.k === 0 ? '다음 갱신' : `${tip.k}주 뒤 갱신`}</span>
        <div class="r" style="margin-top:6px"><span>13주 합계</span><span class="mono">{won(tip.s.sum)}원</span></div>
        {#if tip.s.carry || (tip.k > 0 && sim.forecast[tip.k - 1].carry)}
          <div class="r"><span>남은 이월</span><span class="mono">{won(tip.s.carry)}원</span></div>
        {/if}
        <div class="r"><span>등급</span><span style="color:{tierVar(tip.s.tier)};font-weight:600">{tierName(d.tiers, tip.s.tier)}</span></div>
      {/if}
    </div>
  </div>
</article>

<style>
  .sum { margin: 6px 0 0; font-size: 13px; color: var(--color-tx2); }
  .chart { position: relative; margin-top: 8px; }
  canvas { display: block; width: 100%; height: 230px; }
</style>
