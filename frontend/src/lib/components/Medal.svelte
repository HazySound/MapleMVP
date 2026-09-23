<script lang="ts">
  import { REDUCED, TIER_COLOR } from '../format'
  import type { TierKey } from '../types'
  import bronze from '../../assets/medals/bronze.png'
  import silver from '../../assets/medals/silver.png'
  import gold from '../../assets/medals/gold.png'
  import diamond from '../../assets/medals/diamond.png'
  import red from '../../assets/medals/red.png'
  import black from '../../assets/medals/black.png'

  let { tier, size = 96 }: { tier: TierKey | null; size?: number } = $props()

  const SRC: Record<TierKey, string> = { bronze, silver, gold, diamond, red, black }
  const ORDER: TierKey[] = ['bronze', 'silver', 'gold', 'diamond', 'red', 'black']
  const src = $derived(tier ? SRC[tier] : null)
  const glow = $derived(tier ? TIER_COLOR[tier] : '#80828f')
  const level = $derived(tier ? ORDER.indexOf(tier) : 0)
  // 레드·블랙만 특별한 연출을 더한다
  const special = $derived(tier === 'red' || tier === 'black')
  const ORBITS = [
    { r: 40, t: 9, dot: 3.5, delay: 0 },
    { r: 46, t: 13, dot: 2.5, delay: -4 },
    { r: 34, t: 11, dot: 2.8, delay: -7 },
  ]
  const MOTES = [12, 28, 44, 58, 72, 86].map((x, i) => ({ x, d: i * 0.8, t: 4 + (i % 3) }))

  // 주변에 떠다니는 반짝이 (위치·크기·박자를 조금씩 다르게). 등급이 높을수록 많아진다
  const SPARKS = [
    { x: 6, y: 18, s: 15, d: 0, t: 3.4 },
    { x: 92, y: 26, s: 11, d: 1.1, t: 4.2 },
    { x: 10, y: 74, s: 9, d: 2.0, t: 3.8 },
    { x: 90, y: 70, s: 13, d: 0.6, t: 4.6 },
    { x: 50, y: 0, s: 8, d: 2.6, t: 3.2 },
    { x: 72, y: 94, s: 10, d: 1.7, t: 4.0 },
  ]
  const sparks = $derived(SPARKS.slice(0, 2 + level))
</script>

<div class="wrap" class:special style="--size:{size}px; --glow:{glow}">
  {#if src}
    {#if special && !REDUCED}
      <span class="aura"></span>
      <span class="halo"></span>
      {#each ORBITS as o, i (i)}
        <span class="orbit" style="animation-duration:{o.t}s; animation-delay:{o.delay}s">
          <span class="dot" style="--r:{o.r}%; --dot:{o.dot}px"></span>
        </span>
      {/each}
      {#each MOTES as m, i (i)}
        <span class="mote" style="left:{m.x}%; animation-delay:{m.d}s; animation-duration:{m.t}s"></span>
      {/each}
    {/if}

    <img class="medal" src={src} alt="" draggable="false" />
    {#if !REDUCED}
      {#each sparks as p, i (i)}
        <span class="spark" style="left:{p.x}%; top:{p.y}%; --s:{p.s}px; animation-delay:{p.d}s; animation-duration:{p.t}s"></span>
      {/each}
    {/if}
  {/if}
</div>

<style>
  .wrap {
    position: relative;
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
  }
  .medal {
    position: relative;
    max-width: 74%;
    max-height: 74%;
    filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .55)) drop-shadow(0 0 10px color-mix(in oklab, var(--glow) 40%, transparent));
  }
  /* 레드·블랙: 메달 자체가 숨 쉬듯 빛난다 */
  .wrap.special .medal { animation: breathe 4.5s ease-in-out infinite; }
  @keyframes breathe {
    0%, 100% { filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .55)) drop-shadow(0 0 10px color-mix(in oklab, var(--glow) 40%, transparent)); }
    50% { filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .55)) drop-shadow(0 0 22px color-mix(in oklab, var(--glow) 75%, transparent)); }
  }

  /* 뒤에 깔리는 빛무리 */
  .aura {
    position: absolute; inset: 8%; border-radius: 50%;
    background: radial-gradient(circle, color-mix(in oklab, var(--glow) 34%, transparent) 0%, transparent 65%);
    animation: pulse 4.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: .5; transform: scale(.94); }
    50% { opacity: 1; transform: scale(1.06); }
  }

  /* 천천히 도는 빛의 테 */
  .halo {
    position: absolute; inset: 3%; border-radius: 50%;
    /* 한 줄기로 이어지고 밝기만 서서히 오르내린다 (양 끝이 모두 투명이라 이음매가 없다) */
    background: conic-gradient(from 0deg,
      transparent 0deg,
      color-mix(in oklab, var(--glow) 30%, transparent) 70deg,
      color-mix(in oklab, var(--glow) 62%, transparent) 150deg,
      color-mix(in oklab, var(--glow) 40%, transparent) 230deg,
      color-mix(in oklab, var(--glow) 14%, transparent) 300deg,
      transparent 360deg);
    mask: radial-gradient(circle, transparent 56%, #000 61%, #000 72%, transparent 77%);
    animation: spin 14s linear infinite;
    opacity: .75;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* 궤도를 도는 작은 빛 */
  .orbit { position: absolute; inset: 0; animation-name: spin; animation-timing-function: linear; animation-iteration-count: infinite; }
  .dot {
    position: absolute; top: 50%; left: 50%;
    width: var(--dot); height: var(--dot); border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 8px 2px color-mix(in oklab, var(--glow) 80%, transparent);
    transform: translate(-50%, -50%) translateY(calc(var(--r) * -1));
  }

  /* 아래에서 위로 떠오르는 입자 */
  .mote {
    position: absolute; bottom: 12%;
    width: 2.5px; height: 2.5px; border-radius: 50%;
    background: color-mix(in oklab, var(--glow) 85%, #fff);
    box-shadow: 0 0 6px color-mix(in oklab, var(--glow) 70%, transparent);
    opacity: 0;
    animation-name: rise; animation-timing-function: ease-out; animation-iteration-count: infinite;
  }
  @keyframes rise {
    0% { opacity: 0; transform: translateY(0) scale(.6); }
    25% { opacity: .85; }
    100% { opacity: 0; transform: translateY(calc(var(--size) * -.55)) scale(1); }
  }

  /* 네 갈래 별 모양 반짝이 */
  .spark {
    position: absolute;
    width: var(--s);
    height: var(--s);
    margin: calc(var(--s) / -2);
    background: radial-gradient(circle, #fff 0%, color-mix(in oklab, var(--glow) 70%, #fff) 45%, transparent 70%);
    clip-path: polygon(50% 0%, 58% 42%, 100% 50%, 58% 58%, 50% 100%, 42% 58%, 0% 50%, 42% 42%);
    opacity: 0;
    animation-name: twinkle;
    animation-iteration-count: infinite;
    animation-timing-function: ease-in-out;
    pointer-events: none;
  }
  @keyframes twinkle {
    0%, 100% { opacity: 0; transform: scale(.4) rotate(0deg) translateY(0); }
    45% { opacity: .95; transform: scale(1) rotate(25deg) translateY(-3px); }
    70% { opacity: .25; transform: scale(.75) rotate(40deg) translateY(-5px); }
  }
</style>
