<script lang="ts">
  /**
   * 로그인 자리.
   *
   * 로그인 전에는 단추 하나, 로그인 뒤에는 닉네임과 메뉴다.
   * 앱은 로그인 없이도 그대로 돌아가므로, 여기서 막는 것은 아무것도 없다.
   */
  import { app, clearWeb, pullDown, pushUp, setNick, signOut, wipeAccount } from '../store.svelte'
  import { tip } from '../tip'

  let open = $state(false)
  let busy = $state('')
  let asking = $state(false)
  let naming = $state(false)
  let draft = $state('')

  const shown = $derived(app.user?.nick || '이름 없음')

  function startName() {
    draft = app.user?.nick ?? ''
    naming = true
  }

  async function saveName() {
    await run('nick', () => setNick(draft))
    naming = false
  }

  async function run(what: string, job: () => Promise<void>) {
    busy = what
    try { await job() } finally { busy = '' }
  }

  async function forget() {
    await run('wipe', async () => {
      await wipeAccount()
      await clearWeb()
    })
    asking = false
    open = false
  }
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && (open = false)} />

{#if !app.user}
  <button class="who" onclick={() => (app.showSignIn = true)}
    use:tip={'카카오로 로그인하면 휴대폰에서도 볼 수 있어요\n로그인 전에는 아무것도 서버로 보내지 않아요'}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="8.4" r="3.8"/><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>
    </svg>
    로그인
  </button>
{:else}
  <div class="wrap">
    <button class="who on" onclick={() => (open = !open)} aria-expanded={open}>
      <span class="ini">{(app.user.nick || '?').slice(0, 1)}</span>
      <span class="nm">{shown}</span>
    </button>

    {#if open}
      <!-- 바깥을 누르면 닫힌다 -->
      <div class="veil" role="presentation" onclick={() => (open = false)}></div>
      <div class="menu" role="menu">
        {#if naming}
          <div class="name">
            <label for="nick">화면에 보일 이름</label>
            <input id="nick" maxlength="12" placeholder="이름 없음" bind:value={draft}
              onkeydown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') naming = false }} />
            <div class="row">
              <button class="go" disabled={!!busy} onclick={saveName}>{busy === 'nick' ? '저장 중…' : '저장'}</button>
              <button disabled={!!busy} onclick={() => (naming = false)}>취소</button>
            </div>
          </div>
        {:else}
          <div class="head">
            <b>{shown}</b>
            <span>카카오로 로그인됨</span>
            <button class="rename" onclick={startName}>이름 바꾸기</button>
          </div>
        {/if}

        <button role="menuitem" disabled={!!busy} onclick={() => run('up', pushUp)}>
          {busy === 'up' ? '올리는 중…' : '지금 계정에 올리기'}
          <em>이 기기의 내역을 계정에 저장해요</em>
        </button>
        <button role="menuitem" disabled={!!busy} onclick={() => run('down', pullDown)}>
          {busy === 'down' ? '받는 중…' : '계정에서 내려받기'}
          <em>다른 기기에서 받은 내역을 합쳐요</em>
        </button>

        <div class="line"></div>

        {#if asking}
          <p class="ask">계정과 이 기기에 저장된 <b>구매내역과 PC방 보정값</b>을 모두 지워요. 되돌릴 수 없어요.</p>
          <div class="row">
            <button class="del" disabled={!!busy} onclick={forget}>{busy === 'wipe' ? '지우는 중…' : '지우기'}</button>
            <button disabled={!!busy} onclick={() => (asking = false)}>취소</button>
          </div>
        {:else}
          <button role="menuitem" class="warn" onclick={() => (asking = true)}>
            내 데이터 지우기
            <em>계정과 이 기기에서 모두 지워요</em>
          </button>
        {/if}

        <button role="menuitem" disabled={!!busy}
          onclick={() => run('out', async () => { await signOut(); open = false })}>
          로그아웃
          <em>이 기기에 받아 둔 내역은 남아요</em>
        </button>

        <a class="legal" href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>
      </div>
    {/if}
  </div>
{/if}

<style>
  .wrap { position: relative; flex: none; }
  .who {
    flex: none; appearance: none; cursor: pointer; font: inherit; font-size: 12.5px;
    display: flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: 10px;
    border: 1px solid var(--color-line); background: var(--color-panel); color: var(--color-tx2);
    max-width: 180px;
  }
  .who:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .who svg { width: 14px; height: 14px; }
  .who.on { padding-left: 6px; }
  .ini {
    flex: none; width: 21px; height: 21px; border-radius: 50%; display: grid; place-items: center;
    font-size: 11px; font-weight: 700;
    background: var(--color-lav); color: var(--color-on-accent);
  }
  .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .veil { position: fixed; inset: 0; z-index: 40; }
  .menu {
    position: absolute; top: calc(100% + 7px); right: 0; z-index: 41;
    width: 244px; display: grid; gap: 2px; padding: 7px;
    border-radius: 13px; border: 1px solid var(--color-line2); background: var(--color-panel);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .38);
  }
  .head { display: grid; gap: 1px; padding: 7px 9px 9px; }
  .head b { font-size: 13px; color: var(--color-tx); }
  .head span { font-size: 11px; color: var(--color-tx3); }
  .head .rename {
    justify-self: start; margin-top: 5px; padding: 0; font-size: 11px;
    color: var(--color-lav); background: none; text-decoration: underline;
  }
  .head .rename:hover { background: none; }

  .name { display: grid; gap: 6px; padding: 7px 9px 9px; }
  .name label { font-size: 11px; color: var(--color-tx3); }
  .name input {
    font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 9px;
    border: 1px solid var(--color-line2); background: var(--color-bg2); color: var(--color-tx);
  }
  .name input:focus { outline: none; border-color: var(--color-lav); }
  .row button.go {
    color: var(--color-on-accent); background: var(--color-lav); border-color: var(--color-lav);
  }

  .menu button {
    appearance: none; cursor: pointer; font: inherit; text-align: left;
    display: grid; gap: 2px; padding: 8px 9px; border-radius: 9px;
    border: 0; background: transparent; color: var(--color-tx); font-size: 12.5px;
  }
  .menu button em { font-style: normal; font-size: 11px; color: var(--color-tx3); }
  .menu button:hover:not(:disabled) { background: var(--color-bg2); }
  .menu button:disabled { opacity: .5; cursor: default; }
  .menu button.warn { color: var(--color-peach); }

  .legal {
    padding: 7px 9px 4px; font-size: 11px; color: var(--color-tx3); text-decoration: none;
  }
  .legal:hover { color: var(--color-tx2); text-decoration: underline; }
  .line { height: 1px; margin: 5px 2px; background: var(--color-line); }
  .ask { margin: 0; padding: 4px 9px 8px; font-size: 11.5px; line-height: 1.55; color: var(--color-tx3); }
  .ask b { color: var(--color-tx2); }
  .row { display: flex; gap: 6px; padding: 0 3px 2px; }
  .row button {
    flex: 1; justify-items: center; padding: 7px 10px; border-radius: 9px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
  }
  .row button.del {
    color: var(--color-on-accent); background: var(--color-bad); border-color: var(--color-bad);
  }
</style>
