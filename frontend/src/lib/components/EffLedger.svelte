<script lang="ts">
  /**
   * 한 주 결산: 그 주 구매내역을 용도별로 나눠 무엇을 몇 개 샀고, 어떻게 충전했고, 얼마를 돌려받았고, 실제로 얼마를 썼는지.
   * 용도는 이름으로 짐작하고 사용자가 고친다. 회수는 그 주에 떠 둔 시세로 센다(2026-10-16 사용자)
   */
  import { app, getBase } from '../store.svelte'
  import { planner, weekNow } from '../plan.svelte'
  import { addCharge, addCreditBuy, creditItems, eff, feeNow, fillCharges, removeCreditBuy, updateCreditBuy, ledgerOf, nameServer, payOptions, removeCharge, saveEff, setMkMeso, setUse, setWeekPrice, setWeekRates, updateCharge } from '../eff.svelte'
  import NumBox from './NumBox.svelte'
  import { tip } from '../tip'
  import { tick } from 'svelte'
  import { SERVERS, SERVER_LIST, USES, partWhen, type Use } from '../core/ledger'
  import { addDays, eul, md, won, spotlight } from '../format'
  import type { TierKey } from '../types'

  let { week }: { week: string } = $props()

  const d = $derived(app.data!)
  const isNow = $derived(week === d.thisWeek)
  /** 계획 목표와 낸 금액: 이번 주는 지금 계획, 지난 주는 넘길 때 남긴 기록 */
  const goal = $derived.by(() => {
    if (isNow) { const n = planner.result ? weekNow() : null; return n ? { goal: n.goal, paid: n.paid, tier: d.current as TierKey | null } : null }
    const h = planner.input?.history?.find(h => h.start === week)
    return h ? { goal: h.goal, paid: h.paid, tier: h.tier } : null
  })
  const tier = $derived(goal?.tier ?? (d.current as TierKey | null))
  const L = $derived.by(() => {
    // eff를 읽어 용도·시세를 바꾸면 다시 센다
    void eff.tags; void eff.snaps
    return ledgerOf(getBase()?.rows ?? [], week, feeNow(tier), tier)
  })
  const rate = $derived(L.cost ? L.back / L.cost * 100 : 0)
  /** 서버를 고르는 중인 줄 */
  let srvEdit = $state<string | null>(null)
  async function openSrv(key: string) {
    srvEdit = key
    await tick()
    const el = document.getElementById(`srv-${key}`) as HTMLSelectElement | null
    el?.focus()
    try { el?.showPicker() } catch { /* 목록을 바로 못 열면 한 번 더 누르면 된다 */ }
  }
  const serverName = (c: string | null) => !c ? '—' : SERVERS[c] ?? eff.serverNames[c] ?? `서버 ${c}`
  const charges = $derived(eff.charges[week] ?? [])
  const opts = $derived(payOptions())
  let priceOpen = $state<string | null>(null)
  /** 크레딧당 가장 효율 좋은 크레딧샵 물건(모였다는 안내에 쓴다) */
  const bestCb = $derived([...creditItems()].filter(x => x.price > 0).sort((a, b) => b.price / b.credits - a.price / a.credits)[0] ?? null)
  /** 펼친 묶음 줄 */
  let openLine = $state<Record<string, boolean>>({})
  /** 그 주 선물식 · 메소마켓 · 억당 값 고치는 칸(gift|줄, mk|줄, um) */
  let rateOpen = $state<string | null>(null)
  let chEdit = $state(false)
  async function openRate(key: string) {
    rateOpen = key
    await tick()
    ;(document.getElementById(`rate-${key}`) as HTMLInputElement | null)?.focus()
  }
  /** 이번 주는 위 설정(3·4번) 자체를 고친다. 이번 주 시세는 볼 때마다 설정에서 다시 떠 두기 때문이다. 지난 주는 그 주 시세만 */
  function setRate(k: 'giftRate' | 'mk' | 'um', v: number) {
    if (isNow) {
      if (k === 'giftRate') eff.gift = Math.round(v * 10_000)
      else if (k === 'mk') eff.mk = v
      else eff.um = v / (1 - (eff.umFee ?? 0) / 100)
      saveEff()
    } else setWeekRates(week, { [k]: v }, feeNow(tier))
  }
  /** 가격을 누르면 칸을 열고 바로 입력하게 한다. 포커스가 없으면 바깥을 눌러도 칸이 닫히지 않았다(2026-10-16 사용자) */
  async function openPrice(key: string) {
    priceOpen = key
    await tick()
    ;(document.getElementById(`led-${key}`) as HTMLInputElement | null)?.focus()
  }
  const priceOf = (id: string) => L.snap.prices.items.find(x => x.id === id)?.price ?? 0
  /** 억 메소: 소수 둘째 자리까지 */
  const eok = (v: number) => v.toLocaleString('ko-KR', { maximumFractionDigits: 2 })
  const when = (t: number) => { const x = new Date(t + 9 * 36e5).toISOString(); return `${Number(x.slice(5, 7))}/${Number(x.slice(8, 10))}` }
</script>

<article class="card ledger" id="eff-ledger" use:spotlight>
  <h3 class="card-title">
    {md(week)} – {md(addDays(week, 6))} 결산
    <span class="sub">{isNow ? '이번 주 · 지금까지 산 것' : week < d.thisWeek ? '지난 주' : ''}</span>
  </h3>

  {#if !L.lines.length}
    <p class="none">이 주에는 구매내역이 없어요.</p>
  {:else}
    <div class="nums">
      {#if goal}<div><span>계획 목표</span><b class="mono">{won(goal.goal)}</b><em>낸 금액 {won(goal.paid)}{goal.paid >= goal.goal ? ' · 달성' : ` · ${won(goal.goal - goal.paid)} 모자람`}</em></div>{/if}
      <div><span>구매내역</span><b class="mono">{won(L.all)}</b>{#if L.none}<em>회수 없음 {won(L.none)} 빼고 작 {won(L.pay)}</em>{/if}</div>
      <div><span>충전에 든 현금</span><b class="mono">{won(L.chargeWon)}</b>{#if L.estimated}<em>기록이 없어 계산값</em>{/if}</div>
      <div><span>돌려받은 돈</span><b class="mono up">{won(L.back)}</b>{#if L.creditWon}<em>크레딧{L.creditTracked ? '샵 판 돈' : ' 추정'} {won(L.creditWon)}원 포함</em>{/if}</div>
      <div class="loss"><span>실제로 쓴 돈</span><b class="mono">{won(L.loss)}</b><em>회수율 {rate.toFixed(1)}% · 판매 {L.sales}회</em></div>
    </div>

    <!-- 넓은 화면: 왼쪽 표(내용 폭만큼), 오른쪽 흐름 요약 · 충전 기록. 표만 카드 폭을 다 쓰면 양옆이 크게 비었다(2026-10-16 사용자) -->
    <div class="lower">
    <div class="left">
    <div class="tbl" role="table" aria-label="구매내역">
      <div class="tr th" role="row"><span>아이템</span><span>서버</span><span class="c">용도</span><span class="r">캐시</span><span class="c">개수</span><span class="r">그 주 시세</span><span class="r">메소</span><span class="r">회수</span></div>
      {#each L.lines as l (l.key)}
        <div class="tr" role="row" class:off={l.use === 'none'}>
          <span class="nm">
            {#if l.parts.length > 1}<button class="exp" aria-expanded={!!openLine[l.key]} onclick={() => (openLine[l.key] = !openLine[l.key])}
              use:tip={'묶인 구매 건을 펼쳐 건마다 용도를 고를 수 있어요'}>{openLine[l.key] ? '▾' : '▸'}</button>{/if}{l.name}{#if l.parts.length > 1}<small class="pc">{l.parts.length}건</small>{/if}
          </span>
          <span class="sv">
            {#if l.server && !SERVERS[l.server]}
              <!-- 모르는 서버 번호: 눌러서 그 자리에서 고른다. 고르거나 다른 데를 누르면 글자로 돌아온다 -->
              {#if srvEdit === l.key}
                <select id="srv-{l.key}" value={eff.serverNames[l.server] ?? ''} aria-label="서버 {l.server} 고르기"
                  onchange={e => { nameServer(l.server!, e.currentTarget.value); srvEdit = null }} onblur={() => (srvEdit = null)}>
                  <option value="">모름</option>
                  {#each SERVER_LIST as n (n)}<option value={n}>{n}</option>{/each}
                </select>
              {:else}
                <button class="svb" onclick={() => openSrv(l.key)}
                  use:tip={`구매번호 앞자리(${l.server})로 서버를 알아냈어요. 어느 서버인지 알면 눌러서 골라 주세요`}>✎ {serverName(l.server)}</button>
              {/if}
            {:else}{serverName(l.server)}{/if}
          </span>
          <span class="c">
            <select aria-label="{l.name} 용도" value={l.use} onchange={e => setUse(l.rows, e.currentTarget.value as Use)}>
              {#each USES as [u, t] (u)}<option value={u}>{t}</option>{/each}
            </select>
          </span>
          <span class="r mono">{won(l.cash)}</span>
          <span class="c mono">{l.n.toLocaleString('ko-KR')}</span>
          <!-- 그 주 시세. 작용은 경매장 가격(억)을 점선 밑줄로 고친다. 선물식·메소마켓은 그 주 시세를 보여 주기만 -->
          <span class="r mono" class:warn={l.noPrice}>
            {#if l.use === 'sell' && l.itemId && (l.noPrice || priceOpen === l.key)}
              <span class="pbox"><NumBox id="led-{l.key}" label="{l.name} 그 주 경매장 가격" size="sm" decimal unit="억" placeholder="가격" value={priceOf(l.itemId)}
                set={v => { if (isNow) { eff.prices[l.itemId!] = v; saveEff() } else setWeekPrice(week, l.itemId!, v, feeNow(tier)) }} onblur={() => (priceOpen = null)} /></span>
            {:else if l.use === 'sell' && l.itemId}
              <button class="pr" onclick={() => openPrice(l.key)} use:tip={'그 주 경매장 가격 · 눌러서 고치기'}>{priceOf(l.itemId)}억</button>
            {:else if l.use === 'sell'}<span use:tip={'가격표에 없는 이름이에요. 이번 주 4번에서 아이템을 추가하면 맞춰져요'}>가격표에 없음</span>
            {:else if l.use === 'gift' && (rateOpen === `gift|${l.key}` || !L.snap.prices.giftRate)}
              <span class="pbox"><NumBox id="rate-gift|{l.key}" label="그 주 선물식 1만 캐시당 받은 돈" size="sm" unit="원" placeholder="1만당" value={Math.round(L.snap.prices.giftRate * 10_000)}
                set={v => setRate('giftRate', v / 10_000)} onblur={() => (rateOpen = null)} /></span>
            {:else if l.use === 'gift'}<button class="pr" onclick={() => openRate(`gift|${l.key}`)} use:tip={'그 주 선물식 1만 캐시당 받은 돈 · 눌러서 고치기'}>1만당 {won(L.snap.prices.giftRate * 10_000)}원</button>
            {:else if l.use === 'mk' && (rateOpen === `mk|${l.key}` || !L.snap.prices.mk)}
              <span class="pbox"><NumBox id="rate-mk|{l.key}" label="그 주 메소마켓 1억 메소당 메포" size="sm" unit="메포" placeholder="1억당" value={L.snap.prices.mk}
                set={v => setRate('mk', v)} onblur={() => (rateOpen = null)} /></span>
            {:else if l.use === 'mk'}<button class="pr" onclick={() => openRate(`mk|${l.key}`)} use:tip={'그 주 메소마켓 1억 메소당 메포 · 눌러서 고치기'}>{won(L.snap.prices.mk)}메포</button>
            {:else}—{/if}
          </span>
          <span class="r mono">
            {#if l.use === 'mk' && l.max}
              <!-- 메소마켓에서 실제로 산 메소. 기본은 그 메포로 살 수 있는 최대. 적게 적으면 남는 메포는 작에서 빠진다 -->
              {#if rateOpen === `meso|${l.key}`}
                <span class="pbox"><NumBox id="rate-meso|{l.key}" label="{l.name} 메소마켓에서 산 메소(1억 단위)" size="sm" unit="억" placeholder={eok(l.max)} value={l.want ?? 0}
                  set={v => setMkMeso(week, l.key, v || null)} onblur={() => (rateOpen = null)} /></span>
              {:else}
                <button class="pr" class:warn={l.want != null && l.want > l.max} onclick={() => openRate(`meso|${l.key}`)}
                  use:tip={l.want != null && l.want > l.max ? `적은 ${eok(l.want)}억은 이 메포로 살 수 있는 최대(${eok(l.max)}억)보다 많아요. 가진 메포를 더 썼을 수 있어 그대로 두고, 계산은 최대 ${eok(l.max)}억으로 해요`
                    : l.want != null ? `메소마켓에서 산 메소 · 남은 메포 ${won(l.spare ?? 0)}는 작에서 빼고 셉니다 · 눌러서 고치기 (비우면 최대 ${eok(l.max)}억)`
                    : `이 메포로 살 수 있는 최대 메소예요(1억 단위${l.spare ? ` · 딱 안 떨어져 남는 ${won(l.spare)}메포는 작에서 뺌` : ''}). 일부만 메소마켓에 썼으면 눌러서 실제로 산 메소를 적어 주세요`}>{eok(l.want ?? l.meso)}억</button>
                {#if l.want != null && l.want > l.max}<small class="cap">최대 {eok(l.max)}억까지만 셈</small>{/if}
              {/if}
            {:else}{l.meso ? `${eok(l.meso)}억` : '—'}{/if}
          </span>
          <span class="r mono">{l.use === 'none' ? '—' : won(l.back)}</span>
        </div>
        {#if openLine[l.key] && l.parts.length > 1}
          {#each l.parts as q (q.key)}
            <div class="tr subrow" role="row">
              <span class="nm"><span class="when mono">{partWhen(q)}</span>{q.item}</span>
              <span></span>
              <span class="c">
                <select aria-label="{q.item} {partWhen(q)} 용도" value={l.use} onchange={e => setUse([q.key], e.currentTarget.value as Use)}>
                  {#each USES as [u, t] (u)}<option value={u}>{t}</option>{/each}
                </select>
              </span>
              <span class="r mono">{won(q.price)}</span>
              <span></span><span></span><span></span><span></span>
            </div>
          {/each}
        {/if}
      {/each}
      <!-- 크레딧샵에서 산 것. 구매내역에 안 남아 산 주에 직접 적는다(2026-10-16 사용자) -->
      {#each L.creditBuys as cb (cb.id)}
        <div class="tr credit" role="row">
          <span class="nm"><button class="xb" onclick={() => removeCreditBuy(week, cb.id)} aria-label="{cb.name} 지우기" use:tip={'지우기'}>×</button>{cb.name}<small class="pc">크레딧샵</small></span>
          <span></span>
          <span class="c"><span class="ctag">크레딧</span></span>
          <span class="r mono">{won(cb.credits * cb.n)}<small class="pc">크레딧</small></span>
          <span class="c"><span class="nbox"><NumBox id="cbn-{cb.id}" label="{cb.name} 개수" size="sm" value={cb.n} set={v => updateCreditBuy(week, cb.id, { n: Math.max(1, Math.round(v || 1)) })} /></span></span>
          <span class="r mono">
            {#if rateOpen === `cb|${cb.id}` || !cb.price}
              <span class="pbox"><NumBox id="rate-cb|{cb.id}" label="{cb.name} 판 가격" size="sm" decimal unit="억" placeholder="판 가격" value={cb.price}
                set={v => updateCreditBuy(week, cb.id, { price: v })} onblur={() => (rateOpen = null)} /></span>
            {:else}<button class="pr" onclick={() => openRate(`cb|${cb.id}`)} use:tip={'경매장에 판 가격 · 눌러서 고치기'}>{cb.price}억</button>{/if}
          </span>
          <span class="r mono">{eok(cb.n * cb.price * (1 - L.snap.prices.fee))}억</span>
          <span class="r mono">{won(cb.n * cb.price * (1 - L.snap.prices.fee) * L.snap.prices.um)}</span>
        </div>
      {/each}
    </div>
    {#if L.creditTracked && L.credit}
      <!-- 크레딧 흐름: 시작 + 쌓인 것 − 산 것 = 남은 것. 산 것은 여기서 적는다 -->
      <div class="cbar">
        <span>크레딧 · 이 주 시작 <b class="mono">{won(L.credit.start)}</b> + 쌓인 <b class="mono">{won(L.credit.earned)}</b>{#if L.credit.used}{' '}− 산 것 <b class="mono">{won(L.credit.used)}</b>{/if} = 남은 <b class="mono" class:warn={L.credit.left < 0}>{won(L.credit.left)}</b></span>
        <select class="addcb" value="" onchange={e => { if (e.currentTarget.value) addCreditBuy(week, e.currentTarget.value); e.currentTarget.value = '' }} aria-label="크레딧샵에서 산 것 적기">
          <option value="">+ 크레딧샵에서 산 것 적기</option>
          {#each creditItems() as c (c.id)}<option value={c.id}>{c.name} ({won(c.credits)} 크레딧)</option>{/each}
        </select>
        {#if L.credit.left < 0}<b class="warn">가진 크레딧보다 많이 샀어요. 5번 칸 '지금 남은 크레딧'에 게임 안 크레딧을 넣어 주세요.</b>
        {:else if !L.creditBuys.length && bestCb && L.credit.start + L.credit.earned >= bestCb.credits}<span class="nudge">크레딧이 {won(bestCb.credits)}개 넘게 모였어요. 이 주에 {bestCb.name}{eul(bestCb.name)} 샀으면 적어 주세요.</span>{/if}
      </div>
    {/if}
    {#if L.lines.some(l => l.noPrice)}
      <p class="hint warn">값이 없는 줄은 0원으로 셌어요. 작용이면 그 주 경매장 가격(억)을 넣어 주세요.{L.lines.some(l => l.noPrice && l.use === 'sell' && !l.itemId) ? ' 가격표에 없는 이름은 이번 주 4번에서 아이템을 추가하면 맞춰져요.' : ''}{L.lines.some(l => l.noPrice && l.use !== 'sell') ? ' 선물식·메소마켓은 이번 주 3번 시세로 셉니다.' : ''}</p>
    {/if}

    </div>
    <div class="right">
    <!-- 흐름: 충전(방식 · 든 현금) → 넣은 캐시 → 얻은 메소 → 판 돈 → 총 회수 → 회수율. 충전도 이 목록 안에서 본다(2026-10-16 사용자) -->
    <section class="flow" aria-label="흐름">
      <div class="fl gh"><span>충전{L.estimated ? ' · 기록이 없어 계산값' : ''}</span>
        {#if !isNow}<button class="link sm" onclick={() => (chEdit = !chEdit)}>{chEdit ? '닫기' : charges.length ? '고치기' : '적기'}</button>{/if}
      </div>
      {#each L.charges as c, i (i)}
        <div class="fl sub"><span>{c.name}{c.off ? ` · ${c.off}% 할인` : ''}</span><b class="mono">{won(c.cash)}캐시 → {won(c.won)}원</b></div>
      {/each}
      {#if L.shop}<div class="fl sub"><span>넥슨쇼핑 쿠폰</span><b class="mono">{won(L.shop)}원</b></div>{/if}
      <div class="fl"><span>충전에 든 현금</span><b class="mono">{won(L.chargeWon)}원</b>
        {#if Math.abs(L.chargeWon - L.cost) >= 1}<em>회수율은 작에 쓴 몫 {won(L.cost)}원으로 셉니다{L.none ? ` (회수 없음 ${won(L.none)}캐시 뺌)` : ''}</em>{/if}
      </div>
      {#if isNow}<em class="note">이번 주 충전은 위 2번 칸의 '이번 주 충전'에서 적어요.</em>{/if}
      {#if chEdit && !isNow}
        <div class="chedit">
          {#each charges as c (c.id)}
            <div class="ch-row">
              <select aria-label="결제수단" value={c.key} onchange={e => updateCharge(week, c.id, { key: e.currentTarget.value })}>
                {#each opts as o (o.key)}<option value={o.key}>{o.name}</option>{/each}
              </select>
              <NumBox id="ch-off-{c.id}" label="할인율" size="sm" decimal unit="%" placeholder="0" value={c.off} set={v => updateCharge(week, c.id, { off: v })} />
              <NumBox id="ch-cash-{c.id}" label="충전한 캐시" size="sm" unit="캐시" placeholder="충전한 캐시" value={c.cash} set={v => updateCharge(week, c.id, { cash: v })} />
              <button class="x" onclick={() => removeCharge(week, c.id)} aria-label="이 충전 지우기">×</button>
            </div>
          {/each}
          <div class="ch-acts">
            <button class="btn" onclick={() => addCharge(week)}>+ 충전 추가</button>
            {#if !charges.length && L.funding}<button class="btn" onclick={() => fillCharges(week, L.funding!.parts)}>계산값대로 충전했어요</button>{/if}
          </div>
        </div>
      {/if}
      {#if L.flow}
        <em class="note">이 주 시작 잔액 {won(L.flow.start)}캐시 + 충전 {won(L.flow.charged)}캐시 − 구매 {won(L.flow.used)}캐시 = 다음 주로 {won(L.flow.left)}캐시(충전한 값 그대로 넘어가요)
          {#if L.flow.short}<b class="warn">기록한 충전보다 {won(L.flow.short)}캐시 더 썼어요. 빠진 충전이 있으면 넣어 주세요.</b>{/if}</em>
      {/if}

      <div class="fl sep"><span>작에 넣은 캐시</span><b class="mono">{won(L.pay)}</b></div>
      {#if L.mesoSell + L.mesoMk}
        <div class="fl"><span>얻은 메소</span><b class="mono">{eok(L.mesoSell + L.mesoMk)}억</b>
          <em>{[L.mesoSell ? `경매장 ${eok(L.mesoSell)}억` : '', L.mesoMk ? `메소마켓 ${eok(L.mesoMk)}억` : ''].filter(Boolean).join(' · ')}</em></div>
        <div class="fl"><span>메소 판 돈</span><b class="mono">{won(L.mesoWon)}원</b>
          <em>억당
            {#if rateOpen === 'um'}
              <span class="pbox"><NumBox id="rate-um" label="억당 받은 돈" size="sm" unit="원" value={Math.round(L.snap.prices.um)} set={v => setRate('um', v)} onblur={() => (rateOpen = null)} /></span>
            {:else}<button class="pr" onclick={() => openRate('um')} use:tip={'그 주에 1억 메소를 팔아 받은 돈(엄 판매 수수료 뺀 값) · 눌러서 고치기'}>{won(L.snap.prices.um)}원</button>{/if}
            (엄 판매 수수료 뺀 값)</em></div>
      {/if}
      {#if L.giftWon}<div class="fl"><span>선물식으로 받은 돈</span><b class="mono">{won(L.giftWon)}원</b></div>{/if}
      {#if L.creditTracked}
        {#if L.creditWon}<div class="fl"><span>크레딧샵 판 돈</span><b class="mono">{won(L.creditWon)}원</b><em>{L.creditBuys.map(b => `${b.name} ${b.n}개`).join(' · ')}</em></div>{/if}
      {:else if L.creditWon}<div class="fl"><span>크레딧 (추정)</span><b class="mono">{won(L.creditWon)}원</b><em>쌓인 {won(L.credits)}개 × 크레딧 값</em></div>{/if}
      <div class="fl tot"><span>총 회수</span><b class="mono">{won(L.back)}원</b><em>회수율 {rate.toFixed(1)}%</em></div>
      <div class="fl loss"><span>실제로 쓴 돈</span><b class="mono">{won(L.loss)}원</b></div>
    </section>
    {#if L.snap.planned}
      <div class="row">
        <span class="lab">짠 루트</span>
        <span>{L.snap.planned.label} · {L.snap.planned.what} → 실제로 나가는 돈 <b class="mono">{won(L.snap.planned.loss)}원</b>{L.snap.planned.cost ? ` · 회수율 ${(L.snap.planned.back / L.snap.planned.cost * 100).toFixed(1)}%` : ''} <small>(그때 남은 {won(L.snap.planned.pay)}원 기준)</small></span>
      </div>
    {/if}

    <p class="hint">
      {L.own ? `시세는 ${when(L.snap.at)}에 이 효율표에 넣어 둔 값이에요.` : '이 주에 떠 둔 시세가 없어 지금 시세로 셌어요.'}
      {L.flow ? '충전 비용은 충전 기록으로 셌어요.' : '충전 기록이 없어 충전 비용은 그 주 결제수단으로 그 달 처음 한도에서 했다고 보고 센 값이에요.'} 용도는 구매내역 이름으로 짐작했으니 다르면 고쳐 주세요(산 서버는 구매번호로 알아요).
    </p>
    </div>
    </div>
  {/if}
</article>

<style>
  .ledger { display: grid; gap: 12px; align-content: start; }
  .lower, .left, .right { display: grid; gap: 12px; align-content: start; min-width: 0; }
  /* 표와 오른쪽 요약이 나란히 들어갈 만큼 넓을 때만 옆으로 둔다 */
  @media (min-width: 1500px) {
    .lower { grid-template-columns: max-content minmax(320px, 1fr); gap: 20px; align-items: start; }
    .lower .tbl { column-gap: 28px; }
  }
  .flow { display: grid; gap: 2px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg2); border: 1px solid var(--color-line); }
  .fl { display: grid; grid-template-columns: 1fr auto; column-gap: 12px; align-items: baseline; font-size: 13px; color: var(--color-tx2); padding: 3px 0; }
  .fl b { font-weight: 500; color: var(--color-tx); text-align: right; }
  .fl em { grid-column: 1 / -1; font-style: normal; font-size: 11.5px; color: var(--color-tx3); text-align: right; margin-top: -2px; }
  .fl.gh span { font-weight: 600; color: var(--color-tx); }
  .fl.gh .sm { justify-self: end; font-size: 12px; }
  .fl.sub span { padding-left: 10px; font-size: 12.5px; color: var(--color-tx3); }
  .fl.sub b { font-size: 12.5px; color: var(--color-tx2); }
  .fl.sep { margin-top: 6px; padding-top: 8px; border-top: 1px solid var(--color-line); }
  .flow .note { font-style: normal; font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  .chedit { display: grid; gap: 6px; padding: 8px 0; }
  .fl em .pbox { width: 120px; vertical-align: middle; }
  .fl.tot { margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--color-line); }
  .fl.tot b { color: var(--color-mint); font-size: 15px; }
  .fl.loss b { color: var(--color-peach); font-size: 15px; }
  .none { margin: 0; font-size: 13px; color: var(--color-tx3); }
  .nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
  .nums div { background: var(--color-bg2); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 10px 12px; }
  .nums span { display: block; font-size: 11.5px; color: var(--color-tx3); }
  .nums b { font-size: 18px; font-weight: 700; }
  .nums b.up { color: var(--color-mint); }
  .nums .loss b { color: var(--color-peach); }
  .nums em { display: block; margin-top: 2px; font-style: normal; font-size: 11px; color: var(--color-tx3); }
  /*
   * 열 너비는 표 전체에서 열마다 가장 긴 내용에 맞춘다(줄마다 같은 열 너비: subgrid). 숫자 하나뿐인 개수는 좁게, 긴 이름은 넓게.
   * 남는 폭을 열마다 나누면 표가 양옆으로 너무 퍼져 읽기 힘들었다. 열 사이는 화면 폭에 따라 조금 넓히고,
   * 나머지는 양 끝 빈 칸(1fr씩)이 나눠 가져 내용이 가운데로 적당히 모인다(2026-10-16 사용자)
   */
  .tbl { display: grid; grid-template-columns: minmax(4px, 1fr) repeat(8, auto) minmax(4px, 1fr); column-gap: clamp(10px, (100vw - 700px) * .06, 48px); border: 1px solid var(--color-line); border-radius: var(--radius-md); overflow: hidden; }
  /* 아이템 칸만 넓고 나머지가 오른쪽에 몰려 사이가 크게 비었다. 칸들을 비율로 고르게 펼친다 */
  .tr { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; row-gap: 8px; align-items: center; padding: 6px 0; font-size: 13px; box-shadow: inset 0 1px 0 var(--color-line); }
  .tr.th { box-shadow: none; background: var(--color-bg2); font-size: 11.5px; color: var(--color-tx3); }
  .tr.off { color: var(--color-tx3); }
  .tr > :first-child { grid-column: 2; }
  .r { text-align: right; }
  .tr.credit { background: color-mix(in oklab, var(--color-lav) 7%, transparent); }
  .ctag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; color: var(--color-lav); background: color-mix(in oklab, var(--color-lav) 16%, transparent); }
  .xb { appearance: none; border: 0; background: none; padding: 0 6px 0 0; font: inherit; color: var(--color-tx3); cursor: pointer; }
  .xb:hover { color: var(--color-bad); }
  .nbox { display: inline-block; width: 56px; }
  .cbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 10px 14px; border-radius: var(--radius-md); background: color-mix(in oklab, var(--color-lav) 7%, var(--color-bg2)); border: 1px solid color-mix(in oklab, var(--color-lav) 25%, var(--color-line)); font-size: 12.5px; color: var(--color-tx2); }
  .cbar b { font-weight: 500; color: var(--color-tx); }
  .cbar .addcb { width: auto; margin-left: auto; color: var(--color-lav); border-color: color-mix(in oklab, var(--color-lav) 40%, var(--color-line)); }
  .cbar .nudge { flex-basis: 100%; color: var(--color-mint); font-size: 12px; }
  .exp { appearance: none; border: 0; background: none; padding: 0 6px 0 0; font: inherit; font-size: 11px; color: var(--color-tx3); cursor: pointer; }
  .exp:hover { color: var(--color-lav); }
  .pc { margin-left: 6px; font-size: 11px; color: var(--color-tx3); }
  .tr.subrow { background: color-mix(in oklab, var(--color-bg2) 60%, transparent); font-size: 12px; color: var(--color-tx2); }
  .subrow .when { margin: 0 8px 0 14px; color: var(--color-tx3); }
  .subrow select { font-size: 12px; }
  .c { text-align: center; }
  .c select { width: auto; }
  .pbox { display: inline-block; width: 112px; }
  .cap { display: block; font-family: var(--font-sans); font-size: 10.5px; color: var(--color-peach); }
  .nm { white-space: nowrap; }
  .sv { font-size: 12px; color: var(--color-tx2); }
  .warn { color: var(--color-peach); }
  .svb { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-size: 12px; color: var(--color-tx2); cursor: pointer; white-space: nowrap; }
  .svb:hover { color: var(--color-lav); }
  .pr { appearance: none; border: 0; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: underline dotted; text-underline-offset: 3px; }
  select { font: inherit; font-size: 12.5px; color: var(--color-tx); padding: 3px 6px; border-radius: 8px; background: var(--color-bg2); border: 1px solid var(--color-line); cursor: pointer; width: 100%; }
  .row { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: baseline; font-size: 13px; color: var(--color-tx2); }
  .row .lab { font-size: 11.5px; color: var(--color-tx3); min-width: 52px; }
  .row small { color: var(--color-tx3); }
  .ch-row { display: grid; grid-template-columns: minmax(0, 1.2fr) 90px minmax(0, 1fr) 28px; gap: 8px; align-items: center; font-size: 13px; }
  .ch-row .x { appearance: none; border: 0; background: none; cursor: pointer; font-size: 16px; color: var(--color-tx3); }
  .ch-acts { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .hint { margin: 0; font-size: 11.5px; color: var(--color-tx3); line-height: 1.5; }
  /* 중간 폭: 여덟 열이 다 안 들어가 회수가 잘렸다. 서버 열만 뺀다 */
  @media (min-width: 781px) and (max-width: 980px) {
    .tbl { grid-template-columns: minmax(4px, 1fr) repeat(7, auto) minmax(4px, 1fr); }
    .tr > :nth-child(2) { display: none; }
  }
  /* 좁으면 표를 두 줄짜리로(780px 아래는 일곱 열도 안 들어갔다) */
  @media (max-width: 780px) {
    .pbox { width: 100%; }
    /* 폰: 윗줄 아이템 · 개수 · 캐시, 아랫줄 용도 · 시세. 서버와 회수는 숨긴다 */
    .tbl { display: block; }
    .tr { grid-template-columns: minmax(0, 1fr) 40px 80px; column-gap: 8px; padding: 6px 12px; }
    .tr > :nth-child(2), .tr > :nth-child(7), .tr > :nth-child(8) { display: none; }
    .tr > :nth-child(1) { grid-column: 1; grid-row: 1; }
    .tr > :nth-child(5) { grid-column: 2; grid-row: 1; }
    .tr > :nth-child(4) { grid-column: 3; grid-row: 1; }
    .tr > :nth-child(3) { grid-column: 1 / 3; grid-row: 2; text-align: left; }
    .tr > :nth-child(6) { grid-column: 3; grid-row: 2; }
    .tr.th > :nth-child(3), .tr.th > :nth-child(6) { display: none; }
  }
</style>
