from app.rows import merge_months, normalize_usage

RAW = [
    {"seqNo": 1, "gameName": "메이플스토리", "purchaseAmount": 29800,
     "purchaseDate": "2026-08-31 00:16:59", "purchaseItem": "프리미엄 모멘텀 패스", "purchaseStatus": "사용"},
    {"seqNo": 2, "gameName": "FC ONLINE", "purchaseAmount": 5000,
     "purchaseDate": "2026-08-19 12:08:14", "purchaseItem": "[멤버십] 1,000 FC", "purchaseStatus": "사용"},
    {"seqNo": 3, "gameName": "메이플스토리", "purchaseAmount": 10000,
     "purchaseDate": "2026-08-15 14:01:44", "purchaseItem": "솔  에르다", "purchaseStatus": "사용"},
    {"seqNo": 4, "gameName": "메이플스토리", "purchaseAmount": 4000,
     "purchaseDate": "2026-08-14 10:00:00", "purchaseItem": "취소된 것", "purchaseStatus": "취소"},
]


def test_keeps_only_maple_and_used():
    rows, skipped = normalize_usage(RAW)
    assert [r["price"] for r in rows] == [29800, 10000]      # FC온라인과 취소 건은 빠진다
    assert rows[0] == {"date": "2026-08-31", "item": "프리미엄 모멘텀 패스", "price": 29800}
    assert rows[1]["item"] == "솔 에르다"                      # 연속 공백은 하나로
    assert skipped == {"취소": 1}


def test_ignores_broken_rows():
    rows, _ = normalize_usage([
        {"gameName": "메이플스토리", "purchaseDate": "", "purchaseAmount": 1, "purchaseStatus": "사용"},
        {"gameName": "메이플스토리", "purchaseDate": "2026-08-01 00:00:00", "purchaseStatus": "사용"},
    ])
    assert rows == [{"date": "2026-08-01", "item": "", "price": 0}]


def test_merge_prefers_usage():
    months = {"2026-08": {"rows": [{"date": "2026-08-15", "item": "솔 에르다", "price": 10000}]}}
    usage = {"2026-08": {"rows": [
        {"date": "2026-08-31", "item": "프리미엄 모멘텀 패스", "price": 29800},
        {"date": "2026-08-15", "item": "솔 에르다", "price": 10000},
    ]}}
    assert sum(r["price"] for r in merge_months(months, usage)) == 39800


def test_merge_falls_back_when_usage_missing_or_empty():
    months = {"2026-07": {"rows": [{"date": "2026-07-02", "item": "패스", "price": 30000}]}}
    # 통합 내역을 아직 못 받은 달
    assert sum(r["price"] for r in merge_months(months, {})) == 30000
    # 세션 문제로 빈 응답이 온 달은 멀쩡한 메이플 데이터를 덮어쓰지 않는다
    assert sum(r["price"] for r in merge_months(months, {"2026-07": {"rows": []}})) == 30000


def test_merge_covers_months_only_in_usage():
    usage = {"2026-09": {"rows": [{"date": "2026-09-07", "item": "패스", "price": 39800}]}}
    assert sum(r["price"] for r in merge_months({}, usage)) == 39800
