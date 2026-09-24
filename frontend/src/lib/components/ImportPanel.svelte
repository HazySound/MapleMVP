<script lang="ts">
  import { onMount } from 'svelte'
  import { app, reloadWeb } from '../store.svelte'
  import { bookmarkletUrl } from '../web/bookmarklet'
  import { listen, openNexon } from '../web/import'
  import { spotlight, won } from '../format'

  const d = $derived(app.data!)
  const count = $derived(d.recent.length ? d.weeks.reduce((s, w) => s + w.spent, 0) : 0)
  const has = $derived(d.weeks.some(w => w.spent))

  let url = $state('')
  let status = $state('')
  let waiting = $state(false)

  onMount(() => {
    url = bookmarkletUrl(location.origin)
    return listen(rows => {
      waiting = false
      status = `${rows.length.toLocaleString('ko-KR')}건을 받았어요.`
      reloadWeb()
    })
  })

  function go() {
    waiting = true
    status = '넥슨 결제 페이지를 열었어요. 거기서 북마크를 눌러 주세요.'
    if (!openNexon()) {
      waiting = false
      status = '새 탭이 막혔어요. 팝업 허용을 켜거나 직접 결제 페이지를 열어 주세요.'
    }
  }
</script>

<article class="card" use:spotlight>
  <h3 class="card-title">
    구매내역 가져오기
    <span class="sub">{has ? `${won(count)}원 · 최근 13주` : '아직 없어요'}</span>
  </h3>

  <p class="why">
    브라우저는 다른 사이트의 응답을 읽지 못해서, 이 화면이 넥슨을 직접 볼 수 없어요.
    대신 <b>넥슨 페이지에서 실행되는 북마크</b>를 하나 만들어 두면 거기서 내역을 읽어 보내 줍니다.
    받은 내역은 <b>이 브라우저에만</b> 저장돼요.
  </p>

  <ol class="steps">
    <li>
      <span class="n">1</span>
      <div>
        <b>아래 단추를 북마크바로 끌어다 놓으세요</b> <em>(처음 한 번만)</em>
        <div class="drop">
          <a class="bm" href={url} onclick={e => e.preventDefault()}>📥 MapleMVP 가져오기</a>
          <small>북마크바가 없으면 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd></small>
        </div>
      </div>
    </li>
    <li>
      <span class="n">2</span>
      <div>
        <b>넥슨 결제 페이지를 열고 로그인하세요</b>
        <small>아래 단추를 누르면 새 탭으로 열립니다.
          이미 로그인돼 있으면 내역이 바로 보이고, 아니면 로그인부터 해 주세요.</small>
        <button class="btn primary" onclick={go} disabled={waiting}>
          {waiting ? '기다리는 중…' : '넥슨 결제 페이지 열기'}
        </button>
      </div>
    </li>
    <li>
      <span class="n">3</span>
      <div>
        <b class="hl">그 탭에서</b> <b>1번에서 만든 북마크를 누르세요</b>
        <small>읽는 동안 화면 오른쪽 아래에 진행률이 뜹니다.
          다 읽으면 이 화면으로 내역이 바로 돌아오고, 넥슨 탭은 알아서 닫힙니다.</small>
      </div>
    </li>
  </ol>

  <p class="note">
    북마크는 <b>넥슨 결제 페이지에서만</b> 동작해요. 다른 곳에서 누르면 아무 일도 일어나지 않고
    안내만 뜹니다. 로그인이 풀려 있으면 그것도 알려 줘요.
  </p>

  {#if status}<p class="status" class:on={!waiting}>{status}</p>{/if}
</article>

<style>
  .card { display: grid; gap: 12px; align-content: start; }
  .why { margin: 0; font-size: 12.5px; line-height: 1.65; color: var(--color-tx2); }
  .why b { color: var(--color-tx); }

  .steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
  .steps li { display: flex; gap: 11px; align-items: flex-start; }
  .steps li > div { display: grid; gap: 7px; justify-items: start; min-width: 0; }
  .n {
    flex: none; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center;
    font-size: 12px; font-weight: 600; color: var(--color-lav);
    background: color-mix(in oklab, var(--color-lav) 18%, transparent);
    border: 1px solid color-mix(in oklab, var(--color-lav) 40%, transparent);
  }
  .steps b { font-size: 13px; color: var(--color-tx); font-weight: 600; }
  .steps em { font-style: normal; font-size: 11.5px; color: var(--color-tx3); }
  .steps small { font-size: 11.5px; color: var(--color-tx3); line-height: 1.55; }

  .drop { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .bm {
    display: inline-flex; align-items: center; gap: 6px; cursor: grab; user-select: none;
    font-size: 13px; font-weight: 600; text-decoration: none; padding: 8px 14px; border-radius: 10px;
    color: var(--color-tx); background: var(--color-bg2);
    border: 1px dashed color-mix(in oklab, var(--color-lav) 55%, var(--color-line));
  }
  .bm:hover { border-style: solid; border-color: var(--color-lav); }
  kbd {
    font: inherit; font-family: var(--font-mono); font-size: 11px; padding: 1px 5px;
    border-radius: 5px; border: 1px solid var(--color-line2); background: var(--color-panel2);
  }

  .btn { appearance: none; cursor: pointer; font: inherit; font-size: 13px; font-weight: 600; padding: 8px 14px; border-radius: 10px; border: 1px solid var(--color-line); background: var(--color-bg2); color: var(--color-tx); }
  .btn:disabled { opacity: .5; cursor: default; }

  .hl { color: var(--color-lav) !important; }
  .note {
    margin: 0; font-size: 11.5px; line-height: 1.6; color: var(--color-tx3);
    padding: 10px 12px; border-radius: 10px; background: var(--color-bg2); border: 1px solid var(--color-line);
  }
  .note b { color: var(--color-tx2); }
  .btn.primary { background: var(--color-lav); border-color: var(--color-lav); color: #1b1c21; }
  .status { margin: 0; font-size: 12.5px; color: var(--color-tx2); }
  .status.on { color: var(--color-good); }
</style>
