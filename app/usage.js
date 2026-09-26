// payment.nexon.com 페이지 안에서 실행된다. 넥슨 통합 캐시 사용내역을 GraphQL로 한 달치 가져온다.
// 메이플 아이템 구매내역(/MyMaple/Item/History)에 안 잡히는 결제가 여기에는 있어서 이쪽을 정본으로 쓴다.
// __YEAR__, __MONTH__는 Python이 채운다.
(async (year, month) => {
  const API = "https://public.api.nexon.com/billing-bff/mycash";
  const OP = "getNxCashHistoryDetailUseWithPaging";
  const QUERY = `
  query ${OP}($year: Int!, $month: Int!, $cursor: Int!) {
    nexonCashHistoryDetailUseWithPaging(year: $year, month: $month, cursor: $cursor) {
      useList {
        seqNo
        gameName
        purchaseAmount
        purchaseDate
        purchaseId
        purchaseItem
        purchaseStatus
      }
    }
  }
`;
  const PAGE = 20;          // cursor는 오프셋이고 한 번에 20건씩 온다
  const MAX = 5000;         // 무한 루프 방지
  const rows = [];
  try {
    for (let cursor = 0; cursor < MAX; cursor += PAGE) {
      const res = await fetch(API, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: QUERY, variables: { year, month, cursor }, operationName: OP }),
      });
      if (res.status === 401 || res.status === 403) return { needsLogin: true, status: res.status };
      if (!res.ok) return { error: "http", status: res.status };

      const json = await res.json();
      if (json.errors) {
        // 넥슨은 세션이 끊겨도 200으로 답하고 본문에만 그 사실을 적는다.
        // 그냥 오류로 넘기면 로그인하라는 말을 못 하고 옛 숫자를 계속 보여 주게 된다.
        const why = JSON.stringify(json.errors);
        if (/"70006"|세션 만료|로그인/.test(why)) return { needsLogin: true, detail: why.slice(0, 300) };
        return { error: "graphql", detail: why.slice(0, 300) };
      }
      const list = json && json.data && json.data.nexonCashHistoryDetailUseWithPaging
        ? json.data.nexonCashHistoryDetailUseWithPaging.useList : null;
      if (!Array.isArray(list)) return { error: "shape" };

      rows.push(...list);
      if (list.length < PAGE) break;
    }
  } catch (e) {
    // 세션이 끊기면 로그인 페이지로 밀려나면서 요청이 실패한다
    return { needsLogin: true, detail: String(e) };
  }
  return { rows };
})(__YEAR__, __MONTH__)
