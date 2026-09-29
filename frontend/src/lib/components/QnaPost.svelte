<script lang="ts">
  /**
   * 문의 글 하나.
   *
   * 다른 사람은 댓글을 못 단다. 대신 추천으로 '나도 같은 문제'를 알리고,
   * 답이 달리면 같이 알림을 받는다. 답글은 쓴 사람과 관리자만 주고받는다.
   *
   * 해결됨은 쓴 사람이 정한다. 마지막 답변 아래 '해결됐어요'를 누르고 한 번 더
   * 확인하면 글이 굳어서 누구도 더 쓰지 못한다.
   *
   * 들어오면 이 글의 알림은 읽은 것으로 친다. 알림을 눌러 왔든 목록에서 왔든
   * 이미 본 것이다.
   */
  import QnaShots from './QnaShots.svelte'
  import { TIERS } from '../core/mvp'
  import { won } from '../format'
  import { app } from '../store.svelte'
  import { board, checkNotes, go, loginHere, stamp } from '../qna.svelte'
  import {
    KIND_NAME, STATUS_NAME, TOPIC_NAME, drop, dropReply, get, imgUrl, like, reply, seen, solve,
    type Pic, type Post,
  } from '../web/qna'

  let { id }: { id: number } = $props()

  let post = $state<Post | null>(null)
  let error = $state('')
  let draft = $state('')
  let images = $state<string[]>([])
  let uploading = $state(false)
  let sending = $state(false)
  let replyError = $state('')
  let asking = $state<'' | 'drop' | 'solve'>('')
  let solving = $state(false)
  let liking = $state(false)
  let shots = $state<QnaShots>()

  async function load() {
    const r = await get(id)
    if (!r.data) { error = r.status === 404 ? '없는 글이거나 볼 수 없는 글이에요.' : (r.error ?? ''); post = null; return }
    error = ''
    post = r.data
  }

  $effect(() => {
    void id; void app.user?.id
    post = null
    asking = ''
    void load().then(async () => {
      if (!app.user || !post) return
      await seen(id)
      void checkNotes()
    })
  })


  async function toggleLike() {
    if (!post) return
    if (!app.user) { loginHere(); return }
    liking = true
    const r = await like(post.id)
    liking = false
    if (r.data && post) { post.liked = r.data.liked; post.likes = r.data.likes }
  }

  async function send() {
    if (!post || !draft.trim() || sending || uploading) return
    sending = true
    replyError = ''
    const r = await reply(post.id, draft.trim(), images)
    sending = false
    if (!r.data) { replyError = r.error ?? '올리지 못했어요'; return }
    draft = ''
    shots?.clear()
    board.stale++
    await load()
  }

  async function markSolved() {
    if (!post) return
    solving = true
    const r = await solve(post.id)
    solving = false
    asking = ''
    if (r.error) { replyError = r.error; return }
    board.stale++
    await load()
  }

  /** '해결됐어요'는 관리자의 마지막 답변 아래에만 둔다. 답을 읽고 나서 누르는 자리다 */
  const lastAnswer = $derived(post ? post.replies.findLastIndex(r => r.admin) : -1)

  async function remove() {
    if (!post) return
    const r = await drop(post.id)
    if (r.error) { replyError = r.error; return }
    board.stale++
    go('qna')
  }

  async function removeReply(rid: number) {
    if (!post) return
    await dropReply(post.id, rid)
    await load()
  }

  const tierName = (k: string | null) => TIERS.find(t => t.key === k)?.name ?? '등급 없음'
  const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
</script>

{#snippet pics(list: Pic[])}
  {#if list.length}
    <div class="pics">
      {#each list as p (p.id)}
        <a href={imgUrl(p.id)} target="_blank" rel="noopener" style="aspect-ratio:{p.w}/{p.h}">
          <img src={imgUrl(p.id)} alt="첨부 그림" loading="lazy" width={p.w} height={p.h} />
        </a>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet who(nick: string, admin: boolean)}
  <span class="nick" class:admin>{nick}{#if admin}<b>(관리자)</b>{/if}</span>
{/snippet}

<div class="card post">
  <div class="top">
    <a class="back" href="#qna">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      목록
    </a>
  </div>

  {#if error}
    <p class="empty">{error}</p>
  {:else if !post}
    <div class="spin"><span></span></div>
  {:else}
    <header>
      <div class="chips">
        <span class="k k-{post.kind}">{KIND_NAME[post.kind]}</span>
        {#if post.topic && TOPIC_NAME[post.topic]}<span class="topic">{TOPIC_NAME[post.topic]}</span>{/if}
        {#if post.kind !== 'notice'}<span class="st st-{post.status}">{STATUS_NAME[post.status]}</span>{/if}
        {#if post.secret}
          <span class="secret">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
            관리자만 보기
          </span>
        {/if}
      </div>
      <h2>{post.title}</h2>
      <div class="meta">{@render who(post.nick, post.admin)}<i>·</i><span class="mono">{stamp(post.at)}</span></div>
    </header>

    <div class="body">{post.body}</div>
    {@render pics(post.images)}

    {#if post.diag}
      <details class="diag">
        <summary>사이트 계산값 <em>나와 관리자만 봐요</em></summary>
        <div class="dg">
          <p>
            사이트 등급 <b>{tierName(post.diag.tier)}</b>
            · 이월 <b class="mono">{won(post.diag.carry)}</b>
            · 마지막 동기화 <b class="mono">{post.diag.syncedAt ? stamp(Date.parse(post.diag.syncedAt)) : '없음'}</b>
          </p>
          <div class="wk">
            <table>
              <thead><tr><th>주</th>{#each post.diag.weeks as w (w.start)}<th class="mono">{shortDate(w.start)}</th>{/each}</tr></thead>
              <tbody>
                <tr><th>합계</th>{#each post.diag.weeks as w (w.start)}<td class="mono">{won(w.amount)}</td>{/each}</tr>
                <tr><th>결제</th>{#each post.diag.weeks as w (w.start)}<td class="mono">{won(w.spent)}</td>{/each}</tr>
                <tr><th>PC방</th>{#each post.diag.weeks as w (w.start)}<td class="mono">{won(w.pc)}</td>{/each}</tr>
              </tbody>
            </table>
          </div>
          <p class="small mono">{post.diag.build} · {post.diag.screen}<br>{post.diag.ua}</p>
        </div>
      </details>
    {/if}

    <div class="acts">
      <!-- 쓴 사람과 관리자는 누르지 않아도 알림을 받는다. 수만 보여 준다 -->
      {#if post.mine || app.user?.admin}
        <span class="likes">
          👍 {#if post.likes}<b>{post.likes}명</b>이 추천했어요{:else}아직 추천이 없어요{/if}
        </span>
      {:else}
        <button class="like" aria-pressed={post.liked} disabled={liking} onclick={toggleLike}
          title={post.kind === 'notice' ? '추천하면 공지에 내용이 추가될 때 알림을 받아요' : '추천하면 답변이 등록될 때 같이 알림을 받아요'}>
          <span class="th">👍</span>추천<b class="mono">{post.likes}</b>
        </button>
        {#if post.kind === 'notice'}
          <span class="follow">{post.liked ? '공지에 내용이 추가되면 알림을 남겨 드려요' : '추천하면 공지에 내용이 추가될 때 알림을 받아요'}</span>
        {:else if post.status !== 'done'}
          <span class="follow">{post.liked ? '답변이 등록되면 알림을 남겨 드려요' : '같은 문제라면 추천해 주세요. 답변 알림을 같이 받아요'}</span>
        {/if}
      {/if}

      <span class="gap"></span>
      <!-- 지우기는 해결된 뒤에도 된다. 쓴 사람과 관리자만 -->
      {#if post.mine || app.user?.admin}
        {#if asking === 'drop'}
          <span class="ask">정말 지울까요? 답글과 그림도 같이 지워져요.</span>
          <button class="mini del" onclick={remove}>지우기</button>
          <button class="mini" onclick={() => (asking = '')}>취소</button>
        {:else}
          <button class="mini" onclick={() => (asking = 'drop')}>글 지우기</button>
        {/if}
      {/if}
    </div>

    {#if post.replies.length}
      <ol class="thread">
        {#each post.replies as r, i (r.id)}
          <li class:admin={r.admin}>
            <div class="rh">
              {#if r.admin}<span class="badge">{post.kind === 'notice' ? '추가 안내' : '답변'}</span>{/if}
              {@render who(r.nick, r.admin)}
              <i>·</i><span class="mono">{stamp(r.at)}</span>
              {#if r.mine || app.user?.admin}<button class="rx" onclick={() => removeReply(r.id)}>지우기</button>{/if}
            </div>
            <div class="body">{r.body}</div>
            {@render pics(r.images)}
            {#if post.canSolve && i === lastAnswer}
              <div class="solve">
                <span>답변으로 해결됐나요?</span>
                <button class="btn" onclick={() => (asking = 'solve')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
                  해결됐어요
                </button>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {:else if post.kind !== 'notice'}
      <p class="wait">아직 답변이 없어요. 답변이 등록되면 작성자와 추천한 사람에게 알림을 남겨 드려요.</p>
    {/if}

    {#if post.status === 'done'}
      <p class="closed">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>
        작성자가 해결됐다고 알려 준 문의예요. 더 이상 글을 더할 수 없어요.
      </p>
    {/if}

    {#if post.canReply}
      <div class="compose">
        <textarea rows="4" maxlength="5000" bind:value={draft}
          placeholder={post.kind === 'notice' ? '공지에 더할 내용을 적어 주세요. 올리면 추천한 사람에게 알림이 가요.'
            : app.user?.admin && !post.mine ? '답변을 적어 주세요. 올리면 작성자와 추천한 사람에게 알림이 가요.' : '더할 내용이나 캡처를 올려 주세요. 관리자에게 알림이 가요.'}></textarea>
        <QnaShots bind:this={shots} bind:ids={images} bind:busy={uploading} />
        <div class="send">
          {#if replyError}<span class="err">{replyError}</span>{/if}
          <button class="btn primary" disabled={!draft.trim() || sending || uploading} onclick={send}>
            {sending ? '올리는 중…' : app.user?.admin && !post.mine ? '답변 올리기' : '내용 더하기'}
          </button>
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if asking === 'solve'}
  <div class="scrim" role="presentation" onclick={e => e.target === e.currentTarget && (asking = '')}>
    <div class="dlg" role="dialog" aria-modal="true" aria-labelledby="solve-t">
      <h3 id="solve-t">해결된 문의로 바꿀까요?</h3>
      <p>바꾸면 이 문의는 <b>해결됨</b>으로 고정돼요. 그 뒤로는 답변도, 내용 더하기도 할 수 없어요.</p>
      <div class="row">
        <button class="btn" disabled={solving} onclick={() => (asking = '')}>취소</button>
        <button class="btn primary" disabled={solving} onclick={markSolved}>{solving ? '바꾸는 중…' : '확인'}</button>
      </div>
    </div>
  </div>
{/if}

<svelte:window onkeydown={e => { if (e.key === 'Escape' && asking === 'solve') asking = '' }} />

<style>
  .post { display: grid; gap: 16px; padding: 20px 22px 22px; user-select: text; }
  .top { display: flex; }
  .back {
    display: inline-flex; align-items: center; gap: 2px; padding: 4px 10px 4px 6px; border-radius: 9px;
    font-size: 12.5px; color: var(--color-tx3); text-decoration: none; border: 1px solid var(--color-line); user-select: none;
  }
  .back:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .back svg { width: 15px; height: 15px; }
  header { display: grid; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  h2 { margin: 0; font-size: 19px; font-weight: 600; line-height: 1.45; word-break: break-word; }
  .meta, .rh { display: flex; flex-wrap: wrap; align-items: center; gap: 0 6px; font-size: 12px; color: var(--color-tx3); }
  .meta i, .rh i { font-style: normal; opacity: .6; }
  .nick { color: var(--color-tx2); font-weight: 500; }
  .nick b { margin-left: 3px; color: var(--color-lav); font-weight: 600; }
  .nick.admin { color: var(--color-tx); }

  .k { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 7px; background: var(--color-panel3); color: var(--color-tx2); }
  .k-bug { color: var(--color-bad); background: color-mix(in oklab, var(--color-bad) 13%, transparent); }
  .k-idea { color: var(--color-sky); background: color-mix(in oklab, var(--color-sky) 13%, transparent); }
  .k-howto { color: var(--color-mint); background: color-mix(in oklab, var(--color-mint) 13%, transparent); }
  .k-notice { color: var(--color-butter); background: color-mix(in oklab, var(--color-butter) 16%, transparent); }
  .topic { font-size: 11.5px; color: var(--color-tx2); }
  .st { font-size: 11px; padding: 2px 9px; border-radius: 99px; border: 1px solid var(--color-line2); color: var(--color-tx3); }
  .st-answered { border-color: color-mix(in oklab, var(--color-lav) 60%, transparent); color: var(--color-lav); }
  .st-done { border-color: transparent; background: color-mix(in oklab, var(--color-mint) 16%, transparent); color: var(--color-mint); }
  .secret { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--color-tx3); }
  .secret svg { width: 12px; height: 12px; }

  .body { font-size: 14px; line-height: 1.75; white-space: pre-wrap; word-break: break-word; color: var(--color-tx); }
  .pics { display: flex; flex-wrap: wrap; gap: 8px; }
  .pics a {
    display: block; max-width: 100%; width: min(360px, 100%); max-height: 260px; border-radius: 10px; overflow: hidden;
    border: 1px solid var(--color-line); background: #000;
  }
  .pics a:hover { border-color: var(--color-lav); }
  .pics img { display: block; width: 100%; height: 100%; object-fit: contain; }

  .diag { border-radius: 12px; border: 1px dashed var(--color-line2); background: var(--color-bg2); }
  .diag summary { cursor: pointer; padding: 9px 12px; font-size: 12.5px; color: var(--color-tx2); user-select: none; }
  .diag summary em { font-style: normal; margin-left: 6px; font-size: 11px; color: var(--color-tx3); }
  .dg { display: grid; gap: 10px; padding: 0 12px 12px; }
  .dg p { margin: 0; font-size: 12.5px; color: var(--color-tx3); }
  .dg b { color: var(--color-tx); font-weight: 500; }
  .dg .small { font-size: 10.5px; line-height: 1.5; word-break: break-all; }
  .wk { overflow-x: auto; }
  .wk table { border-collapse: collapse; font-size: 11px; white-space: nowrap; }
  .wk th, .wk td { padding: 3px 7px; text-align: right; border-bottom: 1px solid var(--color-line); }
  .wk th { color: var(--color-tx3); font-weight: 500; }
  .wk tbody th { text-align: left; }

  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; padding-top: 4px; user-select: none; }
  .gap { flex: 1; }
  .like {
    appearance: none; cursor: pointer; font: inherit; font-size: 13px; color: var(--color-tx2);
    display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px 7px 11px; border-radius: 99px;
    border: 1px solid var(--color-line2); background: var(--color-bg2); transition: all .2s;
  }
  .like:hover { border-color: var(--color-lav); color: var(--color-tx); }
  .like[aria-pressed="true"] { border-color: var(--color-lav); color: var(--color-tx); background: color-mix(in oklab, var(--color-lav) 16%, var(--color-bg2)); }
  .like .th { font-size: 15px; transition: transform .25s cubic-bezier(.3,1.6,.5,1); }
  .like[aria-pressed="true"] .th { transform: scale(1.18) rotate(-8deg); }
  .like b { font-weight: 600; color: var(--color-lav); }
  .follow { font-size: 11.5px; color: var(--color-lav); }
  .likes { font-size: 12.5px; color: var(--color-tx3); }
  .likes b { color: var(--color-tx); }
  .mini {
    appearance: none; cursor: pointer; font: inherit; font-size: 12px; padding: 5px 11px; border-radius: 8px;
    border: 1px solid var(--color-line); background: transparent; color: var(--color-tx3);
  }
  .mini:hover { color: var(--color-tx); border-color: var(--color-line2); }
  .mini.del { color: var(--color-on-accent); background: var(--color-bad); border-color: var(--color-bad); }
  .ask { font-size: 12px; color: var(--color-tx2); }

  .thread { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .thread li { display: grid; gap: 8px; padding: 14px 16px; border-radius: 14px; background: var(--color-bg2); border: 1px solid var(--color-line); }
  .thread li.admin {
    border-color: color-mix(in oklab, var(--color-lav) 45%, var(--color-line));
    background: color-mix(in oklab, var(--color-lav) 7%, var(--color-bg2));
  }
  .badge { font-size: 10.5px; font-weight: 700; padding: 1px 7px; border-radius: 6px; background: var(--color-lav); color: var(--color-on-accent); }
  .rx { margin-left: auto; appearance: none; border: 0; background: none; cursor: pointer; font: inherit; font-size: 11px; color: var(--color-tx3); text-decoration: underline; }
  .rx:hover { color: var(--color-bad); }
  .thread .body { font-size: 13.5px; }
  .solve {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap;
    margin-top: 2px; padding-top: 10px; border-top: 1px dashed color-mix(in oklab, var(--color-lav) 30%, var(--color-line));
  }
  .solve span { font-size: 12.5px; color: var(--color-tx2); }
  .solve .btn { padding: 6px 14px; border-color: color-mix(in oklab, var(--color-mint) 60%, transparent); color: var(--color-mint); }
  .solve .btn:hover { background: color-mix(in oklab, var(--color-mint) 12%, var(--color-panel2)); border-color: var(--color-mint); }
  .solve svg, .closed svg { width: 15px; height: 15px; flex: none; }
  .closed {
    margin: 0; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-radius: 12px; font-size: 13px;
    color: var(--color-mint); background: color-mix(in oklab, var(--color-mint) 10%, transparent);
  }
  .scrim {
    position: fixed; inset: 0; z-index: 70; display: grid; place-items: center; padding: 20px;
    background: color-mix(in oklab, var(--color-scrim) 72%, transparent); backdrop-filter: blur(6px);
  }
  .dlg {
    width: min(380px, 100%); display: grid; gap: 12px; padding: 22px 22px 18px;
    border-radius: 16px; border: 1px solid var(--color-line2); background: var(--color-panel);
    box-shadow: 0 24px 60px rgba(0, 0, 0, .45);
  }
  .dlg h3 { margin: 0; font-size: 16px; font-weight: 600; }
  .dlg p { margin: 0; font-size: 13px; line-height: 1.65; color: var(--color-tx2); }
  .dlg b { color: var(--color-mint); font-weight: 600; }
  .dlg .row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
  .wait { margin: 0; padding: 14px 16px; border-radius: 12px; font-size: 12.5px; color: var(--color-tx3); background: var(--color-bg2); }

  .compose { display: grid; gap: 10px; padding-top: 6px; border-top: 1px solid var(--color-line); }
  textarea {
    font: inherit; font-size: 13.5px; line-height: 1.65; color: var(--color-tx); width: 100%; box-sizing: border-box; resize: vertical;
    padding: 10px 12px; border-radius: 11px; border: 1px solid var(--color-line2); background: var(--color-bg2); margin-top: 10px;
  }
  textarea:focus { outline: none; border-color: var(--color-lav); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-lav) 16%, transparent); }
  .send { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
  .err { font-size: 12px; color: var(--color-bad); }

  .empty { margin: 0; padding: 30px 0; text-align: center; font-size: 13px; color: var(--color-tx3); }
  .spin { display: grid; place-items: center; padding: 40px 0; }
  .spin span { width: 22px; height: 22px; border-radius: 50%; border: 3px solid var(--color-line2); border-top-color: var(--color-lav); animation: spin .8s linear infinite; }

  @media (max-width: 672px) {
    .post { padding: 16px 14px 18px; }
    h2 { font-size: 17px; }
    .pics a { width: 100%; max-height: none; }
    .send .btn { flex: 1; justify-content: center; }
  }
</style>
