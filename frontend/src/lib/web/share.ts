/**
 * 화면을 공유받아 실시간으로 MVP 정보를 읽는다.
 *
 * 캡처 한 장으로 끝내려면 툴팁이 상단 패널을 가리지 않게 커서 위치를 맞춰야 한다.
 * 화면을 계속 받으면 그 수고가 사라진다. 마우스를 올렸다 치우는 동안
 * 필요한 것이 모두 어느 프레임엔가는 찍히고, 모으는 일은 core/vote가 한다.
 *
 * 읽으려면 게임으로 넘어가야 하는데, 그러면 이 탭은 뒤로 간다.
 *   - 뒤로 간 탭은 타이머가 조여지고 화면 갱신도 멎을 수 있어서,
 *     가능하면 트랙에서 프레임을 곧바로 당겨 온다. 그쪽은 타이머를 타지 않는다.
 *   - 화면을 볼 수 없으니 지금 무엇이 보이는지를 게임 위 안내 창(pip)과 소리로 알린다.
 *     제대로 대고 있는지 모른 채 기다리게 두지 않는다.
 *
 * 읽기는 워커에서 한 장씩 차례로 돌린다. 앞 장이 끝나야 다음 장을 뜨므로
 * 프레임이 밀려 쌓이지 않는다.
 */
import type { ScanRaw, Solved } from '../core/scan'
import { type VoteState, createVote } from '../core/vote'
import { TONE, chime } from './chime'
import type { Guide, Tone } from './pip'
import type { ScanDone, ScanJob } from './ocr.worker'

/** 프레임 사이 최소 간격. 트랙에서 당겨 올 때는 프레임이 오는 속도가 곧 간격이다. */
const GAP = 150
/** 이만큼 아무 진전이 없으면 스스로 멈춘다. 잘 되면 몇 초면 끝난다. */
const IDLE = 180_000
/** 같은 상황을 몇 장 연속으로 봐야 인정할지. 한 장은 흔들릴 수 있다. */
const HOLD = 2
/** 알림을 이보다 자주 갈지 않는다. */
const QUIET = 2500

/**
 * 같은 자리에서 이만큼 맴돌면 뭔가 더 해 줘야 하는 것이다.
 * 잘 읽히면 몇 초면 넘어가므로, 넘어가지 않는다는 것 자체가 신호다.
 */
const NUDGE: Partial<Record<Stage, { after: number; body: string }>> = {
  blank: { after: 8000, body: 'MVP 패널이 안 보여요. 아래 「MVP 패널 여는 법」을 눌러 보세요.' },
  noTooltip: { after: 8000, body: '표가 보이지 않아요.\n초록 칸에 마우스를 올린 채로 가만히 두세요.' },
  // 멈춘 화면은 몇 번을 읽어도 같은 답이 나온다. 그대로 두라고 하면 영영 안 끝난다
  tooltip: { after: 5000, body: '표는 보이는데 숫자가 맞지 않아요.\n마우스를 아주 조금만 움직여 주세요.' },
  needTotal: { after: 6000, body: '아직 윗줄 금액을 못 읽었어요.\n마우스를 패널에서 멀리 치우고 잠깐 기다려 주세요.' },
}

interface FrameSource { displayWidth: number; displayHeight: number; close(): void }
interface Processor { readable: ReadableStream<FrameSource> }
type MakeProcessor = new (o: { track: MediaStreamTrack; maxBufferSize?: number }) => Processor

/** 지금 화면에서 무엇이 보이는지. 사용자에게 할 말이 여기서 갈린다. */
export type Stage = 'blank' | 'noTooltip' | 'tooltip' | 'needTotal' | 'done'

export const STAGE: Record<Stage, { title: string; body: string; tone: Tone }> = {
  blank: {
    tone: 'warn',
    title: '⚠️ MVP 패널을 못 찾았어요',
    body: 'MVP 패널을 열어 주세요. 전체화면 모드면 캡처가 막히니 전체 창 모드로 바꿔 주세요.',
  },
  noTooltip: {
    tone: 'wait',
    title: '🖱️ 패널 위에 마우스를 올려 주세요',
    body: '초록 칸 아무 데나 올려 두면 12줄 표가 떠요. 빨간 칸만 가리지 마세요.',
  },
  tooltip: {
    tone: 'wait',
    title: '👀 12줄 표가 보여요',
    body: '그대로 두세요. 읽는 중이에요.',
  },
  needTotal: {
    tone: 'good',
    title: '✅ 12줄 표를 읽었어요 (1/2)',
    body: '이제 마우스를 패널 밖으로 치워 주세요. 표가 사라져야 윗줄 금액을 읽어요.',
  },
  done: {
    tone: 'good',
    title: '✅ 다 읽었어요 (2/2)',
    body: '화면으로 돌아오세요.',
  },
}

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

/** 표 상태에 '몇 장을 집어 봤는지'와 '지금 무엇이 보이는지'를 더한 것 */
export interface ShareStatus extends VoteState { shots: number; stage: Stage }

export interface ShareOpts {
  collected: number[]
  /** 게임 위에 띄울 안내 창. 화면을 고른 뒤에 연다 */
  guide?(): Promise<Guide | null>
  onStream(stream: MediaStream): void
  onState(state: ShareStatus): void
  onDone(solved: Solved): void
  onStop(reason: string): void   // 빈 문자열이면 사용자가 멈춘 것
}

export interface ShareHandle {
  stop(): void
  /** 막혔을 때 그 화면을 파일로 내려받는다. 여기서 왜 못 읽는지 보려면 이게 필요하다 */
  save(): boolean
  /** 안내 창을 뒤늦게 붙인다. 처음에 못 열렸을 때 */
  setGuide(g: Guide | null): void
}

export async function startShare(o: ShareOpts): Promise<ShareHandle> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      // 빠를 필요는 없다. 마우스를 올렸다 치우는 몇 초를 담으면 된다
      frameRate: 4,
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      // 게임 화면을 먼저 보여 준다
      displaySurface: 'monitor',
    },
    audio: false,
    // 이 탭 자체는 고를 필요가 없다
    selfBrowserSurface: 'exclude',
  } as DisplayMediaStreamOptions)

  // 미리보기용. 트랙에서 직접 당겨 오지 못하는 브라우저에서는 여기서 그려 읽는다
  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play().catch(() => {})

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  const vote = createVote(o.collected)
  // 화면을 고르고 나서 연다. 고르는 창이 이 위에 겹치지 않도록
  let guide = o.guide ? await o.guide() : null

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let idle: ReturnType<typeof setTimeout> | undefined
  let job = 0
  let scale = 0
  let mark = -1                // 직전 화면의 표식. 똑같으면 다시 읽지 않는다
  let last: ScanRaw | null = null   // 그때 나온 답. 멈춘 화면에서 그대로 쓴다
  let shots = 0                // 집어 본 장 수. 멈춰 있어 건너뛴 것도 센다
  let stage: Stage | '' = ''   // 지금까지 인정한 상황. 아직 아무것도 못 봤으면 빈 값
  let held: Stage | null = null
  let holds = 0
  let spoke = 0                // 마지막으로 알린 때
  let linger = false           // 안내 창을 남겨 둔 채 끝내는 중인지
  let shot: Blob | null = null // 막혔던 순간의 화면
  let since = Date.now()       // 지금 상황이 된 때
  let nudged = false           // 막혔다고 한 번 짚어 줬는지

  function stop(reason = '') {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    clearTimeout(idle)
    worker.terminate()
    if (!linger) guide?.close()   // 마지막 모습을 보여 주는 중이면 두고 나간다
    for (const t of stream.getTracks()) t.stop()
    video.srcObject = null
    o.onStop(reason)
  }

  /** 진전이 있을 때마다 시계를 되돌린다. 손을 놓았을 때만 멈추도록 */
  function keepAlive() {
    clearTimeout(idle)
    guide?.deadline(Date.now() + IDLE)   // 남은 시간이 창에 보인다
    idle = setTimeout(() => {
      chime(TONE.fail)
      linger = !!guide
      guide?.finish({ title: '⏱️ 시간이 다 돼 멈췄어요', tone: 'warn',
        body: '3분 동안 읽을 것이 없었어요. MapleMVP 화면으로 돌아와 다시 시작해 주세요.' }, 20_000)
      stop('3분 동안 읽을 것이 없어서 화면 공유를 멈췄어요. 다시 시작해 주세요.')
    }, IDLE)
  }

  // 브라우저 자체의 '공유 중지'를 눌렀을 때
  for (const t of stream.getTracks()) t.addEventListener('ended', () => stop(''))
  o.onStream(stream)
  keepAlive()

  /** 한 장을 워커에 맡기고 결과를 기다린다. */
  function read(img: ImageData): Promise<ScanRaw> {
    const id = ++job
    return new Promise(resolve => {
      const on = (e: MessageEvent<ScanDone>) => {
        if (e.data.id !== id) return
        worker.removeEventListener('message', on)
        resolve(e.data)
      }
      worker.addEventListener('message', on)
      const msg: ScanJob = {
        id, data: img.data.buffer as ArrayBuffer,
        width: img.width, height: img.height, fallbackScale: scale,
      }
      worker.postMessage(msg, [msg.data])
    })
  }

  /** 화면이 바뀌었는지 싸게 본다. 인식기는 같은 화소에 늘 같은 답을 내므로 다시 읽을 이유가 없다. */
  function signature(d: Uint8ClampedArray): number {
    let s = 0
    for (let i = 0; i < d.length; i += 4001) s = (s * 31 + d[i]) | 0
    return s
  }

  /** 이 한 장이 말해 주는 상황. 뒤로 갈수록 다 온 것이다. */
  function look(raw: ScanRaw, st: VoteState): Stage {
    if (st.solved) return 'done'
    if (st.needs) return 'needTotal'
    if (raw.readings.length) return 'tooltip'
    if (raw.amounts.length) return 'noTooltip'
    return 'blank'
  }

  /**
   * 상황이 바뀌었으면 알린다.
   * 한 장이 흔들려 오락가락하는 것까지 알리면 시끄럽기만 해서, 몇 장 이어질 때만 인정한다.
   */
  function announce(next: Stage) {
    // 12줄을 읽었거나 다 읽은 것은 되돌아갈 일이 없다. 바로 알린다
    const sure = next === 'needTotal' || next === 'done'
    if (!sure) {
      if (next !== held) { held = next; holds = 1; return }
      if (++holds < HOLD) return
    }
    if (next === stage) return
    const now = Date.now()
    if (!sure && now - spoke < QUIET) return

    stage = next
    spoke = now
    since = now
    nudged = false
    keepAlive()   // 상황이 바뀌었으면 사용자가 붙어 있는 것이다
    if (sure) chime(next === 'done' ? TONE.done : TONE.step)
    const t = STAGE[next]
    const st = vote.state()
    guide?.show({ title: t.title, body: t.body, tone: t.tone, note: `${shots}장 확인`,
                  have: { panel: !!st.solved, tip: !!st.needs } })
  }

  /** 한자리에서 맴돌면 다음에 할 일을 짚어 준다. */
  function nudge() {
    const n = stage ? NUDGE[stage] : undefined
    if (!n || nudged || Date.now() - since < n.after) return
    nudged = true
    // 막힌 그 화면을 남겨 둔다. 나중에 그대로 읽혀 보면 원인이 드러난다
    try { canvas.toBlob(b => { if (b) { shot = b; guide?.offerSave(true) } }, 'image/png') } catch { /* 없으면 그만 */ }
    const st = vote.state()
    guide?.show({ title: STAGE[stage as Stage].title, body: n.body, tone: 'warn',
                  note: `${shots}장 확인`, have: { panel: !!st.solved, tip: !!st.needs } })
  }

  /** 읽어 낸 답을 표에 넣는다. 끝났으면 true. */
  function apply(raw: ScanRaw): boolean {
    const state = vote.feed(raw)
    announce(look(raw, state))
    nudge()
    o.onState({ ...state, shots, stage: stage || 'blank' })
    if (!state.solved) return false

    // 다 됐다는 것은 보고 나서 사라져야 한다. 그냥 닫히면 됐는지 모른다
    linger = !!guide
    guide?.finish({
      title: STAGE.done.title, tone: 'good',
      body: `13주 합계 ${state.solved.total?.toLocaleString('ko-KR') ?? '?'}원. MapleMVP 화면으로 돌아오세요.`,
      note: '돌아오면 이 창은 저절로 닫혀요', have: { panel: true, tip: true },
    }, 20_000)
    o.onDone(state.solved)
    stop('')
    return true
  }

  /** 한 장을 읽어 표에 넣는다. 끝났으면 true. */
  async function feed(src: CanvasImageSource, w: number, h: number): Promise<boolean> {
    if (!w || !h) return false
    canvas.width = w
    canvas.height = h
    ctx.drawImage(src, 0, 0)
    const img = ctx.getImageData(0, 0, w, h)
    shots++
    const sig = signature(img.data)
    // 멈춰 있는 화면은 다시 읽지 않는다. 인식기는 같은 화소에 늘 같은 답을 낸다.
    // 다만 표에는 그 답을 그대로 한 번 더 넣어야 한다. 툴팁을 띄우고 마우스를
    // 가만히 두면 화면이 멈추는데, 여기서 건너뛰면 표가 영영 한 표에 머문다.
    if (sig === mark && last) return apply(last)
    mark = sig

    const raw = await read(img)
    if (stopped) return true
    if (raw.scale) scale = raw.scale
    last = raw
    return apply(raw)
  }

  const sleep = (ms: number) => new Promise(r => { timer = setTimeout(r, ms) })

  async function loop() {
    try {
      const Make = (window as unknown as { MediaStreamTrackProcessor?: MakeProcessor }).MediaStreamTrackProcessor
      const track = stream.getVideoTracks()[0]
      if (Make && track) {
        try {
          // 트랙에서 곧바로 당겨 온다. 가장 최근 한 장만 들고 있으면 된다
          const reader = new Make({ track, maxBufferSize: 1 }).readable.getReader()
          while (!stopped) {
            const { value, done } = await reader.read()
            if (done || !value) break
            const over = await feed(value as unknown as CanvasImageSource, value.displayWidth, value.displayHeight)
            value.close()
            if (over) return
          }
          return
        } catch { /* 이 길이 막히면 아래 비디오로 읽는다 */ }
      }
      // 트랙을 직접 읽지 못하는 브라우저. 비디오를 그려서 읽는다
      while (!stopped) {
        if (await feed(video, video.videoWidth, video.videoHeight)) return
        if (stopped) return
        await sleep(GAP)
      }
    } catch (e) {
      stop(String((e as Error)?.message || e))
    }
  }

  // 화면을 고르자마자 첫 안내를 띄운다. 빈 채로 두지 않는다
  guide?.show({ title: '👀 화면을 보고 있어요', tone: 'wait',
                body: '게임에서 MVP 패널을 열어 주세요. 빨간 칸만 가리지 않으면 돼요.',
                have: { panel: false, tip: false } })

  void loop()
  return {
    stop: () => stop(''),
    save() {
      if (!shot) return false
      const a = document.createElement('a')
      a.href = URL.createObjectURL(shot)
      a.download = `maplemvp-${new Date().toISOString().slice(0, 19).replace(/[:T-]/g, '')}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
      return true
    },
    setGuide: g => { guide = g },
  }
}
