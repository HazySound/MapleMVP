// maplestory.nexon.com 페이지 안에서 실행된다. 한 달치 구매내역을 모든 쪽에 걸쳐 가져온다.
// __YEAR__, __MONTH__는 Python이 채운다.
(async (year, month) => {
  const PER_PAGE = 20;
  const rows = [];
  try {
    for (let page = 1; page <= 100; page++) {
      const res = await fetch(`/MyMaple/Item/History?year=${year}&month=${month}&page=${page}`, { credentials: "include" });
      const html = await res.text();
      if (/로그인이 필요합니다/.test(html)) return { needsLogin: true };

      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = doc.querySelector("table.my_page_tb2");
      if (!table) return { error: "layout" };

      const trs = [...table.querySelectorAll(":scope > tbody > tr")].slice(1);
      if (trs.length === 1 && trs[0].querySelector("td[colspan]")) break; // 구매 내역이 없습니다.

      const part = trs
        .map(tr => [...tr.querySelectorAll("td")])
        .filter(tds => tds.length >= 3)
        .map(tds => ({
          date: tds[0].textContent.trim(),
          item: tds[1].textContent.trim().replace(/\s+/g, " "),
          price: Number(tds[2].textContent.trim().replace(/[^\d-]/g, "")),
        }));
      rows.push(...part);
      if (part.length < PER_PAGE) break;
    }
  } catch (e) {
    // 세션이 끊기면 로그인 페이지(다른 도메인)로 리다이렉트되면서 fetch가 실패한다
    return { needsLogin: true, detail: String(e) };
  }
  return { rows };
})(__YEAR__, __MONTH__)
