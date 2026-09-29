<script lang="ts">
  /**
   * 문의 목록.
   *
   * 맨 위에 공지, 그 아래 새 글부터. 공지는 거르는 조건과 상관없이 늘 맨 위에 고정된다.
   * 종류로 걸러 보고, 로그인했으면 내 문의만 볼 수 있다.
   * 추천 수를 같이 보여 줘서 '나랑 같은 문제'를 먼저 찾게 한다. 이미 있으면 새로 쓰지
   * 않고 추천만 눌러도 답을 같이 받는다.
   */
  import { app } from '../store.svelte'
  import { ago, board, go, loginHere } from '../qna.svelte'
  import { KIND_NAME, STATUS_NAME, TOPIC_NAME, list, type Item, type Kind } from '../web/qna'
  import { cached, keep, keyOf, forget } from '../qnaCache'

  const FILTERS: { key: Kind | ''; name: string }[] = [
    { key: '', name: '전체' }, { key: 'bug', name: '버그·오류' }, { key: 'idea', name: '건의' },
    { key: 'howto', name: '사용법' },
  ]

  let kind = $state<Kind | ''>('')
  let mine = $state(false)
  let pins = $state<Item[]>([])
  let items = $state<Item[]>([])
  let more = $state(false)
  let loading = $state(true)
  let error = $state('')
  let now = $state(Date.now())

  /** 받는 중인 마지막 요청. 탭을 빨리 옮기면 늦게 온 옛 답이 새 목록을 덮지 않게 */
  let seq = 0

  /**
   * 탭을 옮길 때마다 서버에 묻기를 기다리면 한참 가만히 있다가 바뀐다.
   * 한 번 받은 탭은 들고 있다가 바로 보여 주고, 뒤에서 새로 받아 바꾼다.
   * 처음 보는 탭은 옛 목록을 흐리게 하고 위에 받는 중 막대를 띄운다.
   */
  async function load(append = false) {
    const my = ++seq
    const key = keyOf(app.user?.id, kind, mine)
    error = ''
    if (!append) {
      const c = cached(key)
      if (c) { pins = c.pins; items = c.items; more = c.more }
      loading = !c
    } else loading = true
    const before = append ? items[items.length - 1]?.id : 0
    const r = await list({ kind, mine, before })
    if (my !== seq) return
    loading = false
    now = Date.now()
    if (!r.data) { error = r.error ?? '목록을 받지 못했어요'; return }
    if (!append) pins = r.data.pins
    items = append ? [...items, ...r.data.items] : r.data.items
    more = r.data.more
    keep(key, { pins, items, more })
    if (!append && !kind && !mine) warm()
  }

  /** 전체를 받고 나면 다른 탭도 미리 받아 둔다. 눌렀을 때 바로 바뀌게 */
  let warmed = ''
  function warm() {
    const uid = app.user?.id
    if (warmed === `${uid}|${board.stale}`) return
    warmed = `${uid}|${board.stale}`
    for (const f of FILTERS) {
      if (!f.key) continue
      const key = keyOf(uid, f.key, false)
      if (cached(key)) continue
      void list({ kind: f.key }).then(r => { if (r.data) keep(key, r.data) })
    }
  }

  // 글을 쓰고 지운 뒤에는 들고 있던 목록을 버린다
  let stale = board.stale
  // 거르는 조건이 바뀌거나, 글을 쓰고 지운 뒤, 로그인이 바뀌면 다시 받는다
  $effect(() => {
    void kind; void mine; void app.user?.id
    if (board.stale !== stale) { stale = board.stale; forget() }
    void load()
  })

  function write() {
    if (!app.user) { loginHere('#qna/new'); return }
    go('qna/new')
  }
</script>

{#snippet row(p: Item, pin = false)}
  <li>
    <a class="row" class:pin href="#qna/{p.id}">
      <span class="k k-{p.kind}">{KIND_NAME[p.kind]}</span>
      <span class="main">
        <span class="t">
          {#if p.secret}
            <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="비공개"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
          {/if}
          <span class="tt">{p.title}</span>
          {#if p.pics}
            <svg class="pic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="그림 첨부"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5.2-5.2L6 20"/></svg>
          {/if}
          {#if p.replies}<span class="rc mono">[{p.replies}]</span>{/if}
        </span>
        <span class="meta">
          {#if p.topic && TOPIC_NAME[p.topic]}<span>{TOPIC_NAME[p.topic]}</span><i>·</i>{/if}
          <span class="nick" class:me={p.mine}>{p.nick}{#if p.admin}<b class="adm">(관리자)</b>{/if}</span>
          <i>·</i><span>{ago(p.at, now)}</span>
        </span>
      </span>
      <span class="side">
        {#if p.likes}
          <span class="likes" title="추천 {p.likes}개"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 21h3.2V9.6H2V21zm19.6-10.3c0-1.1-.9-2-2-2h-6.2l.9-4.5v-.3c0-.4-.2-.8-.4-1.1L12.8 2 6.4 8.4c-.4.4-.6.9-.6 1.4V19c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.1-.5.1-.7v-1.3z"/></svg>{p.likes}</span>
        {/if}
        {#if p.kind !== 'notice'}<span class="st st-{p.status}">{STATUS_NAME[p.status]}</span>{/if}
      </span>
    </a>
  </li>
{/snippet}

<div class="card board">
  <div class="head">
    <div class="ttl">
      <h2>문의 게시판</h2>
      <p>버그 제보, 건의, 사용법 문의를 남기면 운영자가 직접 답해요. 답변이 등록되면 알림을 남겨 드려요.</p>
    </div>
    <button class="btn primary" onclick={write}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      문의 남기기
    </button>
  </div>

  <div class="bar">
    <div class="ef-seg" role="group" aria-label="종류">
      {#each FILTERS as f (f.key)}
        <button aria-pressed={kind === f.key} onclick={() => (kind = f.key)}>{f.name}</button>
      {/each}
    </div>
    {#if app.user}
      <label class="mine"><input type="checkbox" bind:checked={mine} />내 문의만</label>
    {/if}
  </div>

  <ul class="list" class:busy={loading && items.length > 0} aria-busy={loading}>
    {#each pins as p (p.id)}{@render row(p, true)}{/each}
    {#each items as p (p.id)}{@render row(p)}{/each}
  </ul>

  {#if error}
    <p class="empty">{error} <button class="link" onclick={() => load()}>다시 받기</button></p>
  {:else if !loading && !items.length}
    <p class="empty">
      {mine ? '아직 남긴 문의가 없어요.' : kind ? `${FILTERS.find(f => f.key === kind)?.name} 문의가 아직 없어요.` : '아직 문의가 없어요. 첫 문의를 남겨 주세요!'}
    </p>
  {/if}
  {#if loading && !items.length}<div class="spin"><span></span></div>{/if}
  {#if more}
    <button class="btn more" disabled={loading} onclick={() => load(true)}>{loading ? '받는 중…' : '더 보기'}</button>
  {/if}
</div>

<style>
  .board { display: grid; gap: 14px; padding: 20px 20px 16px; }
  .head { display: flex; align-items: flex-start; gap: 16px; }
  .ttl { flex: 1; min-width: 0; }
  .ttl h2 { margin: 0; font-size: 17px; font-weight: 600; }
  .ttl p { margin: 3px 0 0; font-size: 12.5px; color: var(--color-tx3); }
  .head .btn { flex: none; }
  .head .btn svg { width: 15px; height: 15px; }

  .bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .mine { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--color-tx2); cursor: pointer; }
  .mine input { accent-color: var(--color-lav); margin: 0; }

  .list { position: relative; list-style: none; margin: 0 -6px; padding: 0; display: grid; transition: opacity .15s; }
  /* 처음 보는 탭을 받는 동안: 옛 목록은 흐리게, 위에 움직이는 막대 */
  .list.busy { opacity: .45; pointer-events: none; }
  .list.busy::before {
    content: ""; position: absolute; top: -8px; left: 6px; right: 6px; height: 2px; border-radius: 2px;
    background: linear-gradient(90deg, transparent, var(--color-lav), transparent); background-size: 40% 100%;
    background-repeat: no-repeat; animation: slide 1s ease-in-out infinite;
  }
  @keyframes slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }
  .list li + li { border-top: 1px solid var(--color-line); }
  .row {
    display: grid; grid-template-columns: 74px minmax(0, 1fr) auto; align-items: center; gap: 12px;
    padding: 11px 8px; border-radius: 10px; color: inherit; text-decoration: none;
    transition: background .15s;
  }
  .row:hover { background: var(--color-bg2); }
  .row.pin { background: color-mix(in oklab, var(--color-butter) 7%, transparent); }
  .row.pin:hover { background: color-mix(in oklab, var(--color-butter) 12%, transparent); }
  .k {
    justify-self: start; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 7px; white-space: nowrap;
    background: var(--color-panel3); color: var(--color-tx2);
  }
  .k-bug { color: var(--color-bad); background: color-mix(in oklab, var(--color-bad) 13%, transparent); }
  .k-idea { color: var(--color-sky); background: color-mix(in oklab, var(--color-sky) 13%, transparent); }
  .k-howto { color: var(--color-mint); background: color-mix(in oklab, var(--color-mint) 13%, transparent); }
  .k-notice { color: var(--color-butter); background: color-mix(in oklab, var(--color-butter) 16%, transparent); }
  .main { display: grid; gap: 1px; min-width: 0; }
  .t { display: flex; align-items: center; gap: 5px; min-width: 0; font-size: 13.5px; }
  .tt { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pin .tt { font-weight: 600; }
  .lock { flex: none; width: 13px; height: 13px; color: var(--color-tx3); }
  .pic { flex: none; width: 14px; height: 14px; color: var(--color-sky); }
  .rc { flex: none; font-size: 12px; color: var(--color-lav); }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 5px; font-size: 11.5px; color: var(--color-tx3); }
  .meta i { font-style: normal; opacity: .6; }
  .nick.me { color: var(--color-tx2); }
  .adm { margin-left: 3px; font-weight: 600; color: var(--color-lav); }
  .side { display: flex; align-items: center; gap: 6px; }
  /* 추천이 많을수록 같은 문제를 겪는 사람이 많다는 뜻이다. 한눈에 보이게 */
  .likes {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px 2px 7px; border-radius: 99px;
    font-size: 12px; font-weight: 700; font-family: var(--font-mono);
    color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 16%, transparent);
  }
  .likes svg { width: 12px; height: 12px; }
  .st { font-size: 11px; padding: 2px 9px; border-radius: 99px; white-space: nowrap; border: 1px solid var(--color-line2); color: var(--color-tx3); }
  .st-answered { border-color: color-mix(in oklab, var(--color-lav) 60%, transparent); color: var(--color-lav); }
  .st-done { border-color: transparent; background: color-mix(in oklab, var(--color-mint) 16%, transparent); color: var(--color-mint); }

  .empty { margin: 8px 0; text-align: center; font-size: 13px; color: var(--color-tx3); padding: 26px 0; }
  .link { appearance: none; border: 0; background: none; cursor: pointer; font: inherit; color: var(--color-lav); text-decoration: underline; }
  .spin { display: grid; place-items: center; padding: 30px 0; }
  .spin span { width: 22px; height: 22px; border-radius: 50%; border: 3px solid var(--color-line2); border-top-color: var(--color-lav); animation: spin .8s linear infinite; }
  .more { justify-self: center; }

  @media (max-width: 672px) {
    .board { padding: 16px 12px 12px; }
    .head { flex-direction: column; gap: 10px; }
    .head .btn { align-self: stretch; justify-content: center; }
    .bar .ef-seg { width: 100%; box-sizing: border-box; flex-wrap: nowrap; overflow-x: auto; }
    .bar .ef-seg button { flex: 1 0 auto; padding: 4px 10px; }
    .row { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "k st" "main main"; gap: 5px 8px; padding: 11px 6px; }
    .k { grid-area: k; }
    .side { grid-area: st; }
    .main { grid-area: main; }
    .t { white-space: normal; }
    .tt { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  }
</style>
