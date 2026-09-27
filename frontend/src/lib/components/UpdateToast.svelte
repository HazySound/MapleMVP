<script lang="ts">
  /**
   * 새 버전이 나왔다는 알림. 웹에서만 뜬다(exe는 파일을 통째로 바꿔 끼운다).
   *
   * 새로 접속하거나 새로고침할 때마다 본다. 켜 둔 동안에는 5분마다, 탭으로 돌아올 때도 본다.
   * '나중에'는 이 탭에서만 기억한다. 새로고침하면 다시 뜨고, 그 뒤 또 배포돼도 다시 뜬다.
   */
  import { onMount } from 'svelte'
  import { cleanUrl, newerBuild, reloadFresh } from '../web/update'

  const EVERY = 5 * 60_000

  let next = $state<string | null>(null)
  let skipped = ''

  async function check() {
    const b = await newerBuild()
    if (b && b !== skipped) next = b
  }

  onMount(() => {
    if (import.meta.env.VITE_TARGET !== 'web') return
    cleanUrl()
    void check()
    const t = setInterval(check, EVERY)
    const onShow = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onShow)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  })
</script>

{#if next}
  <div class="toast" role="status">
    <span class="t">
      <b>새 버전이 나왔어요</b>
      <span class="mono">{__BUILD__} → {next}</span>
    </span>
    <button class="btn primary" onclick={() => reloadFresh(next!)}>지금 업데이트</button>
    <button class="chip" onclick={() => { skipped = next!; next = null }}>나중에</button>
  </div>
{/if}

<style>
  .toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 300;
    display: flex; align-items: center; gap: 12px; max-width: calc(100vw - 32px);
    padding: 10px 12px 10px 16px; border-radius: 14px;
    background: var(--color-panel2, #2b2d36); color: var(--color-tx, #ecebf2);
    border: 1px solid color-mix(in oklab, var(--color-lav) 55%, var(--color-line2, #474b59));
    box-shadow: 0 14px 36px rgba(0, 0, 0, .45);
    animation: rise .25s ease-out;
  }
  .t { display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .t .mono { font-size: 11px; color: var(--color-tx3); }
  button { white-space: nowrap; }
  @keyframes rise { from { opacity: 0; transform: translate(-50%, 8px); } }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
</style>
