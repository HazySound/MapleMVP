<script lang="ts">
  /** 문의 게시판. 주소의 # 뒤를 보고 목록·글·쓰기 중 하나를 보여 준다 */
  import QnaList from './QnaList.svelte'
  import QnaPost from './QnaPost.svelte'
  import QnaWrite from './QnaWrite.svelte'
  import { board } from '../qna.svelte'
</script>

<div class="wrap">
  {#if board.route.page === 'write'}
    <QnaWrite />
  {:else if board.route.page === 'post'}
    {#key board.route.id}<QnaPost id={board.route.id} />{/key}
  {:else}
    <QnaList />
  {/if}
</div>

<style>
  .wrap { display: grid; max-width: 920px; margin: 0 auto; padding: 16px; }
  @media (max-width: 912px) { .wrap { padding: 10px; } }
</style>
