<script lang="ts">
  /**
   * 맨 아래 한 줄.
   *
   * 뭔가 잘못됐을 때 어디로 말해야 할지 모르면 그냥 떠난다. 연락할 곳을 눈에
   * 띄는 자리가 아니라 늘 같은 자리에 둔다 — 찾으려 할 때 있으면 된다.
   *
   * 빌드 표시를 같이 두는 이유는 제보 때문이다. '안 돼요'만 오면 고친 뒤인지
   * 전인지 알 수 없는데, 이 줄을 같이 찍어 보내 주면 바로 안다.
   */
  import { app } from '../store.svelte'

  /** 빌드할 때 박아 넣는다. vite.config.ts 참고 */
  const build = __BUILD__
  const MAIL = 'cemigs1@gmail.com'
</script>

<footer>
  <span>
    문의 · 제보 <a href="mailto:{MAIL}">{MAIL}</a>
  </span>
  <span class="dot" aria-hidden="true">·</span>
  <span class="build mono">{build}</span>
  {#if app.web}
    <span class="dot" aria-hidden="true">·</span>
    <a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>
  {/if}
</footer>

<style>
  footer {
    display: flex; flex-wrap: wrap; justify-content: center; align-items: center;
    gap: 6px; padding: 18px 16px 26px;
    font-size: 11.5px; line-height: 1.6; color: var(--color-tx3);
  }
  a { color: var(--color-tx3); text-decoration: none; border-bottom: 1px solid var(--color-line2); }
  a:hover { color: var(--color-tx2); border-bottom-color: currentColor; }
  .dot { opacity: .5; }
  .build { font-size: 11px; opacity: .8; }

  /* 좁은 화면에서는 가운뎃점이 줄 끝에 홀로 남는다. 줄을 나눠 버린다 */
  @media (max-width: 672px) {
    footer { gap: 4px 6px; padding: 14px 14px 22px; }
    .dot { display: none; }
    footer > span, footer > a { flex: 0 0 100%; text-align: center; }
  }
</style>
