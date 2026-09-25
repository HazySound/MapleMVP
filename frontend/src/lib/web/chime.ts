/**
 * 짧은 알림음.
 *
 * 화면공유로 읽는 동안 사용자는 게임을 보고 있다. 브라우저 창은 뒤에 있으니
 * 눈으로 알릴 길이 없다. 소리는 어느 창이 앞에 있든 들린다.
 *
 * 소리 파일은 두지 않는다. 몇 개의 음이면 되고, 받을 것이 없는 편이 낫다.
 */
let ctx: AudioContext | null = null

/** 사용자가 누른 그 순간에 불러 둔다. 그래야 브라우저가 소리를 허락한다. */
export function primeChime(): void {
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
  } catch { /* 막혀 있어도 읽기는 계속된다 */ }
}

export function chime(notes: number[]): void {
  try {
    primeChime()
    if (!ctx) return
    const at = ctx.currentTime
    notes.forEach((hz, i) => {
      const t = at + i * 0.12
      const osc = ctx!.createOscillator()
      const gain = ctx!.createGain()
      osc.type = 'sine'
      osc.frequency.value = hz
      // 뚝 끊으면 '딱' 하고 잡음이 난다. 부드럽게 올렸다 내린다
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      osc.connect(gain).connect(ctx!.destination)
      osc.start(t)
      osc.stop(t + 0.22)
    })
  } catch { /* 소리가 막혀도 그만이다 */ }
}

/** 올라가면 됐다는 뜻, 내려가면 아니라는 뜻. 듣자마자 알 수 있게. */
export const TONE = {
  step: [988],              // 한 단계 읽었다
  done: [784, 988, 1319],   // 다 읽었다
  fail: [440, 330],         // 못 읽고 끝났다
}
