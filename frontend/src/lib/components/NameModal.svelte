<script lang="ts">
  /**
   * 처음 로그인한 사람에게 이름을 받는다.
   *
   * 두 번째부터는 뜨지 않는다. 이름이 비어 있다는 것이 곧 '처음'이라는 뜻이다.
   * 그래서 이름 바꾸기에서 빈 이름으로 되돌리는 것은 막아 둔다.
   *
   * 닫는 길을 두지 않는다. 이름 없이 넘어가면 화면 곳곳이 '이름 없음'이 된다.
   * 대신 그럴듯한 후보를 미리 채워 둬서, 그냥 눌러도 끝나게 한다.
   */
  import { app, setNick } from '../store.svelte'
  import { randomNick } from '../web/nick'
  import { spotlight } from '../format'

  let draft = $state(randomNick())
  let busy = $state(false)

  const ok = $derived(draft.trim().length > 0)

  async function save() {
    if (!ok || busy) return
    busy = true
    try {
      await setNick(draft.trim())
    } finally {
      busy = false
    }
  }
</script>

<div class="back">
  <div class="sheet" role="dialog" aria-label="이름 정하기" use:spotlight>
    <h2>반가워요</h2>
    <p class="why">
      MapleMVP에서 쓸 <b>이름</b>을 정해 주세요.<br>나중에 언제든 바꿀 수 있어요.
    </p>

    <div class="field">
      <!-- svelte-ignore a11y_autofocus -->
      <input maxlength="12" autofocus bind:value={draft}
        aria-label="이름" placeholder="이름"
        onkeydown={e => e.key === 'Enter' && save()} />
      <button class="dice" onclick={() => (draft = randomNick())} aria-label="다른 이름 뽑기" title="다른 이름 뽑기">
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
    <small class="hint">{draft.trim().length}/12자</small>

    <button class="go" disabled={!ok || busy} onclick={save}>
      {busy ? '저장 중…' : '시작하기'}
    </button>
  </div>
</div>

<style>
  .back {
    position: absolute; inset: 52px 0 0 0; z-index: 70;
    display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 82%, transparent); backdrop-filter: blur(8px);
  }
  .sheet {
    position: relative; width: min(380px, 100%);
    display: grid; gap: 12px; padding: 26px 22px 22px;
    border-radius: 16px; border: 1px solid var(--color-line2); background: var(--color-panel);
  }
  h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--color-tx); }
  .why { margin: 0; font-size: 13.5px; line-height: 1.7; color: var(--color-tx2); }
  .why b { color: var(--color-tx); font-weight: 700; }

  .field { display: flex; gap: 7px; margin-top: 2px; }
  input {
    flex: 1; min-width: 0; font: inherit; font-size: 15px; font-weight: 600;
    padding: 11px 13px; border-radius: 11px;
    border: 1px solid var(--color-line2); background: var(--color-bg2); color: var(--color-tx);
  }
  input:focus { outline: none; border-color: var(--color-lav); }
  .dice {
    flex: none; appearance: none; cursor: pointer; width: 44px; border-radius: 11px;
    display: grid; place-items: center;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx3);
  }
  .dice:hover { color: var(--color-lav); border-color: var(--color-lav); }
  .dice svg { width: 19px; height: 19px; }
  .hint { font-size: 11px; color: var(--color-tx3); text-align: right; }

  .go {
    appearance: none; cursor: pointer; font: inherit; font-size: 14.5px; font-weight: 700;
    margin-top: 4px; padding: 12px; border-radius: 12px; border: 0;
    background: var(--color-lav); color: var(--color-on-accent);
  }
  .go:disabled { opacity: .45; cursor: default; }
</style>
