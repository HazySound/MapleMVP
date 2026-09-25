<script lang="ts">
  /**
   * 처음 로그인한 사람에게 이름을 지어 준다.
   *
   * 두 번째부터는 뜨지 않는다. 이름이 비어 있다는 것이 곧 '처음'이라는 뜻이다.
   * 그래서 이름 바꾸기에서 빈 이름으로 되돌리는 것은 막아 둔다.
   *
   * 여기서는 직접 적을 수 없다. 빈칸을 내밀면 무엇을 적어야 할지부터 고민하게
   * 되는데, 그 고민은 가입 첫 화면에서 시킬 것이 아니다. 지어 준 것을 그냥
   * 받거나 다시 굴리면 끝나고, 원하는 이름은 나중에 언제든 바꿀 수 있다.
   *
   * 닫는 길도 두지 않는다. 이름 없이 넘어가면 화면 곳곳이 '이름 없음'이 된다.
   */
  import { setNick } from '../store.svelte'
  import { randomNick } from '../web/nick'
  import { spotlight } from '../format'

  let draft = $state(randomNick())
  let busy = $state(false)
  let why = $state('')
  /** 굴릴 때마다 바뀌어서 글자에 애니메이션을 다시 걸게 한다 */
  let spin = $state(0)

  function roll() {
    let next = draft
    while (next === draft) next = randomNick()   // 같은 것이 나오면 안 굴린 것처럼 보인다
    draft = next
    why = ''
    spin++
  }

  async function save() {
    if (busy) return
    busy = true
    try {
      why = await setNick(draft)
    } finally {
      busy = false
    }
  }
</script>

<div class="back">
  <div class="sheet" role="dialog" aria-label="이름 정하기" use:spotlight>
    <h2>반가워요</h2>
    <p class="why">
      MapleMVP에서 쓸 <b>이름</b>을 지어 드렸어요.<br>
      마음에 안 들면 주사위를 굴려 주세요.
    </p>

    <div class="card">
      {#key spin}
        <strong class="nick">{draft}</strong>
      {/key}
      <button class="dice" onclick={roll} disabled={busy}
        aria-label="다른 이름 뽑기" title="다른 이름 뽑기">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3.6" y="3.6" width="16.8" height="16.8" rx="3.4"/>
          <circle cx="8.6" cy="8.6" r="1.15" fill="currentColor" stroke="none"/>
          <circle cx="15.4" cy="8.6" r="1.15" fill="currentColor" stroke="none"/>
          <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none"/>
          <circle cx="8.6" cy="15.4" r="1.15" fill="currentColor" stroke="none"/>
          <circle cx="15.4" cy="15.4" r="1.15" fill="currentColor" stroke="none"/>
        </svg>
      </button>
    </div>

    {#if why}<small class="bad">{why}</small>{/if}

    <button class="go" disabled={busy} onclick={save}>
      {busy ? '저장 중…' : '이 이름으로 시작하기'}
    </button>

    <small class="hint">이름은 나중에 <b>내 계정 → 닉네임 변경</b>에서 직접 정할 수 있어요.</small>
  </div>
</div>

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 70;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 82%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(400px, 100%);
    display: grid; gap: 12px; padding: 26px 22px 22px;
    border-radius: 16px; border: 1px solid var(--color-line2); background: var(--color-panel);
  }
  h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--color-tx); }
  .why { margin: 0; font-size: 13.5px; line-height: 1.7; color: var(--color-tx2); }
  .why b { color: var(--color-tx); font-weight: 700; }

  /* 지어 준 이름이 주인공이다. 적는 칸이 아니라 받는 자리로 보여야 한다 */
  .card {
    display: flex; align-items: center; gap: 10px; margin-top: 2px;
    padding: 14px 14px 14px 16px; border-radius: 12px;
    border: 1px solid var(--color-line2); background: var(--color-bg2);
  }
  .nick {
    flex: 1; min-width: 0; font-size: 16px; font-weight: 700; line-height: 1.4;
    color: var(--color-tx); word-break: keep-all;
    animation: in .32s cubic-bezier(.2, .9, .3, 1);
  }
  @keyframes in {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) { .nick { animation: none; } }

  .dice {
    flex: none; appearance: none; cursor: pointer; width: 40px; height: 40px;
    border-radius: 11px; display: grid; place-items: center;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx3);
  }
  .dice:hover:not(:disabled) { color: var(--color-lav); border-color: var(--color-lav); }
  .dice:disabled { opacity: .5; cursor: default; }
  .dice svg { width: 19px; height: 19px; }

  .bad { font-size: 11.5px; line-height: 1.5; color: var(--color-bad); }

  .go {
    appearance: none; cursor: pointer; font: inherit; font-size: 14.5px; font-weight: 700;
    margin-top: 2px; padding: 12px; border-radius: 12px; border: 0;
    background: var(--color-lav); color: var(--color-on-accent);
  }
  .go:disabled { opacity: .45; cursor: default; }

  .hint { font-size: 11px; line-height: 1.6; color: var(--color-tx3); text-align: center; }
  .hint b { color: var(--color-tx2); font-weight: 600; }
</style>
