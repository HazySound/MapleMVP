<script lang="ts">
  import { win } from '../store.svelte'

  // 프레임 없는 창의 가장자리/모서리 잡는 영역. 누르면 Windows 기본 크기 조절이 시작된다.
  const edges = ['t', 'b', 'l', 'r', 'tl', 'tr', 'bl', 'br'] as const
</script>

{#each edges as e (e)}
  <div class="h {e}" aria-hidden="true" onpointerdown={ev => { if (ev.button === 0) { ev.preventDefault(); win.resize(e) } }}></div>
{/each}

<style>
  .h { position: fixed; z-index: 100; }
  .t, .b { left: 10px; right: 10px; height: 5px; cursor: ns-resize; }
  .l, .r { top: 10px; bottom: 10px; width: 5px; cursor: ew-resize; }
  .t { top: 0; } .b { bottom: 0; } .l { left: 0; } .r { right: 0; }
  .tl, .tr, .bl, .br { width: 10px; height: 10px; }
  .tl { top: 0; left: 0; cursor: nwse-resize; }
  .br { bottom: 0; right: 0; cursor: nwse-resize; }
  .tr { top: 0; right: 0; cursor: nesw-resize; }
  .bl { bottom: 0; left: 0; cursor: nesw-resize; }
</style>
