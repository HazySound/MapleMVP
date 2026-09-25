/**
 * 화면을 공유받아 실시간으로 MVP 정보를 읽는다.
 *
 * 캡처 한 장으로 끝내려면 툴팁이 상단 패널을 가리지 않게 커서 위치를 맞춰야 한다.
 * 화면을 계속 받으면 그 수고가 사라진다. 마우스를 올렸다 치우는 동안
 * 필요한 것이 모두 어느 프레임엔가는 찍히고, 모으는 일은 core/vote가 한다.
 *
 * 읽기는 워커에서 한 장씩 차례로 돌린다. 앞 장이 끝나야 다음 장을 뜨므로
 * 프레임이 밀려 쌓이지 않는다.
 */
import type { ScanRaw, Solved } from '../core/scan'
import { type VoteState, createVote } from '../core/vote'
import type { ScanDone, ScanJob } from './ocr.worker'

/** 프레임 사이에 두는 최소 간격. 읽는 시간이 더 길면 그쪽에 맞춰진다. */
const GAP = 120
/** 아무것도 못 읽은 채 이만큼 지나면 안내를 바꾼다. */
export const HINT_AFTER = 20_000

export function canShare(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia
}

export interface ShareOpts {
  collected: number[]
  onStream(stream: MediaStream): void
  onState(state: VoteState): void
  onDone(solved: Solved): void
  onStop(reason: string): void   // 빈 문자열이면 사용자가 멈춘 것
}

export interface ShareHandle {
  stop(): void
}

export async function startShare(o: ShareOpts): Promise<ShareHandle> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      frameRate: 5,
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      // 게임 화면을 먼저 보여 준다
      displaySurface: 'monitor',
    },
    audio: false,
    // 이 탭 자체는 고를 필요가 없다
    selfBrowserSurface: 'exclude',
  } as DisplayMediaStreamOptions)

  const video = document.createElement('video')
  video.srcObject = stream
  video.muted = true
  video.playsInline = true
  await video.play().catch(() => {})

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  const vote = createVote(o.collected)

  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let job = 0
  let scale = 0

  function stop(reason = '') {
    if (stopped) return
    stopped = true
    clearTimeout(timer)
    worker.terminate()
    for (const t of stream.getTracks()) t.stop()
    video.srcObject = null
    o.onStop(reason)
  }

  // 브라우저 자체의 '공유 중지'를 눌렀을 때
  for (const t of stream.getTracks()) t.addEventListener('ended', () => stop(''))
  o.onStream(stream)

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

  async function tick() {
    if (stopped) return
    try {
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        ctx.drawImage(video, 0, 0)
        const raw = await read(ctx.getImageData(0, 0, canvas.width, canvas.height))
        if (stopped) return
        if (raw.scale) scale = raw.scale
        const state = vote.feed(raw)
        o.onState(state)
        if (state.solved) {
          o.onDone(state.solved)
          stop('')
          return
        }
      }
    } catch (e) {
      stop(String((e as Error)?.message || e))
      return
    }
    timer = setTimeout(tick, GAP)
  }

  tick()
  return { stop: () => stop('') }
}
