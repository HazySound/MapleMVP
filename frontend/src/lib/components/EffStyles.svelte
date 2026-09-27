<script lang="ts">
  /**
   * 나에게 맞는 방법. 아이템 성격에 따라 어떤 사람에게 맞는지 나눠 보여 준다.
   *   무기한 아이템(플가, 루나 크리스탈, 프리즘): 비싸질 때까지 기다렸다가 나눠 파는 사람
   *   7일 아이템(원더베리, 로얄스타일 등): 조금 손해 보더라도 빨리 메소로 바꾸고 싶은 사람
   *   비싼 아이템(전승 스크롤): 판매 횟수를 줄이고 싶은 사람
   * 가격을 넣은 아이템이 있으면 그 아이템만 썼을 때 실제로 나가는 돈도 붙인다.
   */
  import { isBig, shopItems, type EffOut, type Summary } from '../eff.svelte'
  import { PG_ID, isShort, itemLabel } from '../core/efficiency'
  import { won } from '../format'

  let { out }: { out: EffOut | null } = $props()

  const items = shopItems()
  const names = (f: (x: (typeof items)[number]) => boolean) => [...new Set(items.filter(f).map(x => x.id === PG_ID ? '플가' : itemLabel(x)))]

  const styles = $derived([
    {
      key: 'wait', color: 'var(--color-mint)', title: '천천히 기다릴 수 있어요',
      who: '급하지 않고, 비싸질 때까지 기다렸다가 몇 개씩 나눠 팔아 손해를 줄이고 싶은 분',
      items: names(x => !x.days),
      why: '기간이 없어서 값이 오를 때까지 들고 있을 수 있어요. 대신 낱개가 많아 여러 번 팔아야 해요.',
      sum: out?.waitOnly ?? null,
    },
    {
      key: 'fast', color: 'var(--color-sky)', title: '빨리 메소로 바꾸고 싶어요',
      who: '손해를 조금 보더라도 최저가로 빠르게빠르게 팔아서 바로 메소로 만들고 싶은 분',
      items: names(isShort),
      why: '받은 뒤 7일 안에 써야 해서 오래 들고 버티기 어려워요. 최저가에 빨리 팔고, 기간 안에 팔 만큼만 사세요.',
      sum: out?.fastOnly ?? null,
    },
    {
      key: 'few', color: 'var(--color-peach)', title: '판매 횟수를 줄이고 싶어요',
      who: '경매장에 여러 번 올리기 귀찮고, 한 번에 큰 금액을 채우고 싶은 분',
      items: names(isBig),
      why: '한 번 팔 때 금액이 커서 횟수가 확 줄어요. 사는 사람이 적어 팔리는 데 오래 걸리거나 값을 내려야 할 수 있어요.',
      sum: out?.bigOnly ?? null,
    },
  ] as { key: string; color: string; title: string; who: string; items: string[]; why: string; sum: Summary | null }[])
</script>

<article class="card">
  <h3 class="card-title">나에게 맞는 방법 <span class="sub">아이템 성격에 따라 맞는 사람이 달라요</span></h3>
  <div class="list">
    {#each styles as s (s.key)}
      <section style="--k:{s.color}">
        <b class="t">{s.title}</b>
        <p class="who">{s.who}</p>
        <div class="items">{#each s.items as n (n)}<span class="ef-chip">{n}</span>{/each}</div>
        <p class="why">{s.why}</p>
        <div class="sum">
          {#if s.sum}
            <span>이 아이템만 쓰면</span><b class="mono">{won(s.sum.loss)}원</b><span>판매 {s.sum.sales}회</span>
          {:else}
            <span>4번에서 이 아이템 가격을 넣으면 얼마 나가는지 보여 드려요</span>
          {/if}
        </div>
      </section>
    {/each}
  </div>
  <p class="ef-hint">'이 아이템만 쓰면'은 그 아이템과 메소마켓(끝자리)만으로 채웠을 때예요. 최저가·최적화 루트는 모든 아이템을 섞어서 계산해요.</p>
</article>

<style>
  .card { display: grid; gap: 12px; }
  .list { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
  @media (max-width: 1032px) { .list { grid-template-columns: 1fr; } }
  section {
    display: grid; gap: 8px; align-content: start; padding: 14px 16px; border-radius: var(--radius-md);
    background: linear-gradient(160deg, color-mix(in oklab, var(--k) 10%, var(--color-bg2)), var(--color-bg2) 65%);
    border: 1px solid color-mix(in oklab, var(--k) 35%, var(--color-line));
  }
  .t { font-size: 15px; color: var(--k); }
  .who { margin: 0; font-size: 13px; color: var(--color-tx); line-height: 1.5; }
  .items { display: flex; flex-wrap: wrap; gap: 4px; }
  .why { margin: 0; font-size: 12px; color: var(--color-tx3); line-height: 1.5; }
  .sum { display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px; padding-top: 8px; border-top: 1px dashed var(--color-line2); font-size: 12px; color: var(--color-tx3); }
  .sum b { font-size: 16px; color: var(--color-tx); }
</style>
