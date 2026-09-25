<script lang="ts">
  /**
   * 로그인 자리.
   *
   * 로그인 전에는 단추 하나, 로그인 뒤에는 닉네임과 메뉴다.
   * 앱은 로그인 없이도 그대로 돌아가므로, 여기서 막는 것은 아무것도 없다.
   *
   * 올리기·내려받기 단추는 두지 않는다. 로그인해 있으면 앱이 뜰 때, 내역을 받아올 때,
   * 보정값을 저장할 때 알아서 오간다. 사람이 누를 일이 없는 것을 단추로 내놓으면
   * 안 누르면 안 되는 줄 알게 된다. 대신 마지막으로 저장된 때를 적어 둔다.
   */
  import { app, clearWeb, leaveAccount, setNick, signOut, wipeAccount } from '../store.svelte'
  import { tip } from '../tip'

  /** 지금 펼쳐진 것. 한 번에 하나만 연다 */
  type Panel = '' | 'name' | 'wipe' | 'out' | 'leave'

  let open = $state(false)
  let panel = $state<Panel>('')
  let busy = $state('')
  let draft = $state('')
  let why = $state('')
  let alsoHere = $state(false)
  /** 탈퇴하고 나면 메뉴가 사라져서, 끝났다는 말을 할 자리가 없다. 여기에 남긴다 */
  let left = $state('')

  const shown = $derived(app.user?.nick || '이름 없음')

  const saved = $derived.by(() => {
    if (app.syncingUp) return '계정에 저장하는 중…'
    if (!app.savedAt) return '아직 계정에 저장되지 않았어요'
    return `계정에 저장됨 · ${ago(app.savedAt)}`
  })

  function ago(t: number): string {
    const m = Math.floor((Date.now() - t) / 60000)
    if (m < 1) return '방금'
    if (m < 60) return `${m}분 전`
    const h = Math.floor(m / 60)
    return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`
  }

  function show(p: Panel) {
    if (p === 'name') {
      draft = app.user?.nick ?? ''
      why = ''
    }
    if (p === 'out') alsoHere = false
    panel = p
  }

  function shut() {
    open = false
    panel = ''
  }

  async function run(what: string, job: () => Promise<void>) {
    busy = what
    try { await job() } finally { busy = '' }
  }

  async function saveName() {
    if (!draft.trim()) return   // 빈 이름은 '아직 안 정함'이라 되돌릴 수 없다
    await run('name', async () => { why = await setNick(draft.trim()) })
    if (!why) panel = ''
  }

  const forget = () => run('wipe', async () => {
    await wipeAccount()
    await clearWeb()
    shut()
  })

  const out = () => run('out', async () => {
    await signOut(alsoHere)
    shut()
  })

  const quit = () => run('leave', async () => {
    const r = await leaveAccount()
    left = !r.ok
      ? '탈퇴 처리가 끝나지 않았어요. 잠시 뒤 다시 시도해 주세요.'
      : r.unlinked
        ? '탈퇴했어요. 저장돼 있던 내역과 닉네임을 모두 지웠어요.'
        : '탈퇴했어요. 저장돼 있던 내역과 닉네임을 모두 지웠어요.\n카카오 쪽 연결은 카카오계정 관리에서 직접 끊어 주세요.'
    shut()
  })
</script>

<svelte:window onkeydown={e => { if (e.key === 'Escape') { shut(); left = '' } }} />

<div class="wrap">
  {#if !app.user}
    <button class="who" onclick={() => (app.showSignIn = true)}
      use:tip={'카카오로 로그인하면 휴대폰에서도 볼 수 있어요\n로그인 전에는 아무것도 서버로 보내지 않아요'}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="8.4" r="3.8"/><path d="M4.6 20.2a7.4 7.4 0 0 1 14.8 0"/>
      </svg>
      로그인
    </button>
  {:else}
    <button class="who on" onclick={() => (open ? shut() : (open = true))} aria-expanded={open}>
      <span class="ini">{(app.user.nick || '?').slice(0, 1)}</span>
      <span class="nm">{shown}</span>
    </button>
  {/if}

  {#if left}
    <div class="veil" role="presentation" onclick={() => (left = '')}></div>
    <div class="menu">
      <p class="done">{left}</p>
      <div class="row"><button onclick={() => (left = '')}>닫기</button></div>
    </div>
  {:else if open && app.user}
    <!-- 바깥을 누르면 닫힌다 -->
    <div class="veil" role="presentation" onclick={shut}></div>
    <div class="menu" role="menu">
      {#if panel === 'name'}
        <div class="form">
          <label for="nick">닉네임</label>
          <input id="nick" maxlength="12" placeholder="닉네임" bind:value={draft}
            oninput={() => (why = '')}
            onkeydown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') panel = '' }} />
          {#if why}<small class="bad">{why}</small>{/if}
          <div class="row">
            <button class="go" disabled={!!busy || !draft.trim()} onclick={saveName}>{busy === 'name' ? '저장 중…' : '저장'}</button>
            <button disabled={!!busy} onclick={() => (panel = '')}>취소</button>
          </div>
        </div>
      {:else}
        <div class="head">
          <b>{shown}</b>
          <span>카카오로 로그인됨</span>
          <button class="rename" onclick={() => show('name')}>닉네임 변경</button>
        </div>

        <div class="state" class:busy={app.syncingUp}>{saved}</div>

        <div class="line"></div>

        {#if panel === 'wipe'}
          <p class="ask">계정과 이 기기에 저장된 <b>구매내역과 PC방 보정값</b>을 모두 지워요. 되돌릴 수 없어요.</p>
          <div class="row">
            <button class="del" disabled={!!busy} onclick={forget}>{busy === 'wipe' ? '지우는 중…' : '지우기'}</button>
            <button disabled={!!busy} onclick={() => (panel = '')}>취소</button>
          </div>
        {:else if panel === 'out'}
          <p class="ask">로그아웃할까요?</p>
          <label class="check">
            <input type="checkbox" bind:checked={alsoHere} />
            <span>이 기기에 받아 둔 내역도 지우기<em>PC방이나 남의 컴퓨터라면 지워 주세요</em></span>
          </label>
          <div class="row">
            <button class="del" disabled={!!busy} onclick={out}>{busy === 'out' ? '나가는 중…' : '로그아웃'}</button>
            <button disabled={!!busy} onclick={() => (panel = '')}>취소</button>
          </div>
        {:else if panel === 'leave'}
          <p class="ask">
            <b>정말 탈퇴할까요?</b><br>
            계정에 저장된 구매내역과 닉네임이 모두 지워지고 카카오 연결도 끊어져요.
            <b>되돌릴 수 없어요.</b>
          </p>
          <div class="row">
            <button class="del" disabled={!!busy} onclick={quit}>{busy === 'leave' ? '탈퇴하는 중…' : '탈퇴하기'}</button>
            <button disabled={!!busy} onclick={() => (panel = '')}>취소</button>
          </div>
        {:else}
          <button role="menuitem" class="warn" onclick={() => show('wipe')}>
            내 데이터 지우기
            <em>계정과 이 기기에서 모두 지워요</em>
          </button>

          <button role="menuitem" class="danger" onclick={() => show('out')}>
            <span class="lab">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15.4 16.6v2a2 2 0 0 1-2 2H5.6a2 2 0 0 1-2-2V5.4a2 2 0 0 1 2-2h7.8a2 2 0 0 1 2 2v2"/>
                <path d="M19.4 12H9.2M16.2 8.8 19.4 12l-3.2 3.2"/>
              </svg>
              로그아웃
            </span>
            <em>이 기기에 받아 둔 내역은 남겨 둘 수 있어요</em>
          </button>

          <div class="foot">
            <a href="/privacy.html" target="_blank" rel="noopener">개인정보 처리방침</a>
            <button class="quit" onclick={() => show('leave')}>탈퇴</button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

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
    width: 252px; display: grid; gap: 2px; padding: 7px;
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

  /* 사람이 누를 것이 아니라 읽을 것이다. 단추처럼 보이면 안 된다 */
  .state {
    margin: 0 2px; padding: 7px 9px; border-radius: 9px;
    font-size: 11px; color: var(--color-tx3); background: var(--color-bg2);
  }
  .state.busy { color: var(--color-tx2); }

  .form { display: grid; gap: 6px; padding: 7px 9px 9px; }
  .form label { font-size: 11px; color: var(--color-tx3); }
  .form input {
    font: inherit; font-size: 13px; padding: 7px 9px; border-radius: 9px;
    border: 1px solid var(--color-line2); background: var(--color-bg2); color: var(--color-tx);
  }
  .form input:focus { outline: none; border-color: var(--color-lav); }
  .form .bad { font-size: 11px; line-height: 1.5; color: var(--color-bad); }
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

  /* 로그아웃. 글자와 아이콘을 붉게 해서 그냥 지나치지 않게 한다 */
  .menu button.danger { color: var(--color-bad); }
  .menu button.danger:hover:not(:disabled) {
    background: color-mix(in oklab, var(--color-bad) 12%, transparent);
  }
  .lab { display: flex; align-items: center; gap: 7px; font-weight: 600; }
  .lab svg { flex: none; width: 14px; height: 14px; }

  .check {
    display: flex; gap: 8px; align-items: start; cursor: pointer;
    margin: 0 2px 2px; padding: 8px 9px; border-radius: 9px; background: var(--color-bg2);
  }
  .check input { flex: none; margin: 1px 0 0; accent-color: var(--color-lav); }
  .check span { font-size: 11.5px; line-height: 1.5; color: var(--color-tx2); }
  .check em { display: block; font-style: normal; font-size: 10.5px; color: var(--color-tx3); }

  /* 처리방침 아래에 조용히 둔다. 실수로 누를 자리가 아니다 */
  .foot { display: grid; gap: 1px; margin-top: 4px; padding-top: 5px; border-top: 1px solid var(--color-line); }
  .foot a { padding: 6px 9px; font-size: 11px; color: var(--color-tx3); text-decoration: none; }
  .foot a:hover { color: var(--color-tx2); text-decoration: underline; }
  .menu .foot button.quit {
    justify-self: start; padding: 4px 9px 5px; font-size: 10.5px;
    color: var(--color-tx3); text-decoration: underline;
  }
  .menu .foot button.quit:hover { color: var(--color-bad); background: none; }

  .line { height: 1px; margin: 5px 2px; background: var(--color-line); }
  .ask { margin: 0; padding: 4px 9px 8px; font-size: 11.5px; line-height: 1.6; color: var(--color-tx3); }
  .ask b { color: var(--color-tx2); }
  .done { margin: 0; padding: 10px 9px; font-size: 12px; line-height: 1.6; color: var(--color-tx2); white-space: pre-line; }
  .row { display: flex; gap: 6px; padding: 0 3px 2px; }
  .row button {
    flex: 1; justify-items: center; padding: 7px 10px; border-radius: 9px;
    border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx2);
  }
  .row button.del {
    color: var(--color-on-accent); background: var(--color-bad); border-color: var(--color-bad);
  }
</style>
