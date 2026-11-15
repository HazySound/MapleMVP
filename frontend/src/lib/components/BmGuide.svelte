<script lang="ts">
  /**
   * 옛 북마크 안내. 화면을 어둡게 하고 '📥 MapleMVP 가져오기' 단추만 비춘다.
   *
   * 가져오기 창은 backdrop-filter를 써서 그 안의 fixed가 창 기준으로 놓인다. 그래서 이 층은 body로 옮긴다.
   * 층 전체가 마우스를 통과시켜서, 비춘 단추를 그대로 북마크바로 끌어 갈 수 있다(말풍선만 누를 수 있다).
   * 휴대폰은 북마크바로 끌어다 놓을 수 없어서 비추지 않고 말풍선만 가운데 띄운다.
   */
  import { onMount } from 'svelte'
  import { app } from '../store.svelte'

  let { target, ondone }: { target: HTMLElement | null; ondone: () => void } = $props()

  let layer = $state<HTMLDivElement | null>(null)
  let box = $state<{ x: number; y: number; w: number; h: number } | null>(null)
  let vw = $state(0)
  let vh = $state(0)
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

  onMount(() => {
    if (layer) document.body.appendChild(layer)
    if (!touch) target?.scrollIntoView({ block: 'center' })
    // 창이 뜨는 움직임·스크롤·크기 바뀜을 다 따라가야 한다. 떠 있는 동안만 매 프레임 잰다
    let raf = 0
    const tick = () => {
      vw = innerWidth
      vh = innerHeight
      const r = !touch && target ? target.getBoundingClientRect() : null
      box = r && r.width ? { x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 } : null
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); layer?.remove() }
  })

  const W = 360
  /** 말풍선 자리: 비춘 단추 아래(자리가 없으면 위), 화면 밖으로 안 나가게 */
  const tip = $derived.by(() => {
    const w = Math.min(W, vw - 32)
    if (!box) return { left: (vw - w) / 2, top: Math.max(16, vh / 2 - 170), w, below: true }
    const left = Math.min(Math.max(16, box.x), vw - w - 16)
    const below = box.y + box.h + 300 < vh
    return { left, top: below ? box.y + box.h + 12 : Math.max(16, box.y - 12 - 290), w, below }
  })

  const later = () => { app.bmGuide = false }
  const done = () => { app.bmGuide = false; ondone() }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && later()} />

<div class="layer" bind:this={layer}>
  {#if box}
    <div class="hole" style:left="{box.x}px" style:top="{box.y}px" style:width="{box.w}px" style:height="{box.h}px"></div>
  {:else}
    <div class="dim"></div>
  {/if}
  <div class="bmtip" role="dialog" aria-label="북마크 다시 등록 안내"
       style:left="{tip.left}px" style:top="{tip.top}px" style:width="{tip.w}px">
    <b class="t">북마크를 새로 바꿔 주세요</b>
    <p class="why">
      청약철회한 결제도 빠지도록 가져오기 북마크를 고쳤어요. 지금 누르신 건 <b>예전 북마크</b>라
      철회한 결제가 금액에 그대로 들어가요.
    </p>
    {#if box}
      <ol>
        <li><span class="n">1</span><span>북마크바의 예전 <b>MapleMVP 가져오기</b>를 오른쪽 클릭 → <b>삭제</b></span></li>
        <li><span class="n">2</span><span>{tip.below ? '위에' : '아래에'} 밝게 보이는 <b>📥 MapleMVP 가져오기</b>를 북마크바로 끌어다 놓기</span></li>
        <li><span class="n">3</span><span>새 북마크로 <b>한 번 더 가져오기</b> — 전에 가져온 철회 결제도 이때 빠져요</span></li>
      </ol>
    {:else}
      <p class="why">휴대폰에서는 북마크를 끌어다 놓을 수 없어요. <b>PC 브라우저</b>에서 가져오기 창을 열고
        예전 북마크를 지운 뒤 새 북마크를 끌어다 놓아 주세요.</p>
    {/if}
    <div class="row">
      <button class="btn" onclick={later}>나중에</button>
      <button class="btn primary" onclick={done}>다 했어요</button>
    </div>
  </div>
</div>

<style>
  .layer { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
  .dim { position: absolute; inset: 0; background: color-mix(in oklab, var(--color-scrim) 82%, transparent); }
  .hole {
    position: absolute; border-radius: 14px;
    box-shadow: 0 0 0 200vmax color-mix(in oklab, var(--color-scrim) 82%, transparent), 0 0 0 2px var(--color-lav);
  }
  /* 맥동: 가져오기 창의 '다음에 누를 단추'(ImportPanel .poke)와 같은 번지는 테두리 */
  .hole::after {
    content: ''; position: absolute; inset: 0; border-radius: inherit;
    animation: call 1.8s ease-out infinite;
  }
  @keyframes call {
    0% { box-shadow: 0 0 0 0 color-mix(in oklab, var(--color-lav) 60%, transparent); }
    70%, 100% { box-shadow: 0 0 0 12px transparent; }
  }
  @media (prefers-reduced-motion: reduce) { .hole::after { animation: none; } }

  .bmtip {
    position: absolute; pointer-events: auto; display: grid; gap: 10px;
    padding: 16px 18px; border-radius: 14px; background: var(--color-panel2); color: var(--color-tx);
    border: 1px solid color-mix(in oklab, var(--color-lav) 45%, var(--color-line));
    box-shadow: 0 16px 48px rgb(0 0 0 / .45);
  }
  .t { font-size: 15px; }
  .why { margin: 0; font-size: 12.5px; line-height: 1.6; color: var(--color-tx2); }
  .why b, li b { color: var(--color-tx); }
  ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li { display: flex; gap: 9px; align-items: flex-start; font-size: 12.5px; line-height: 1.55; color: var(--color-tx2); }
  .n {
    flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;
    font-size: 11px; font-weight: 600; color: var(--color-lav);
    background: color-mix(in oklab, var(--color-lav) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-lav) 40%, transparent);
  }
  .row { display: flex; justify-content: flex-end; gap: 8px; }
  .btn { appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 7px 14px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx); }
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: var(--color-on-accent); }
</style>
