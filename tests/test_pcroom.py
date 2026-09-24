from app.pcroom import (apply, compare, merge_saved, minutes_of, missing, prune, restore)

# 실제 인게임 툴팁 (2026-09-24 기준, 다이아 등급). 1주 뒤 ~ 12주 뒤 '현재 등급 유지까지'
NEEDS = [20330, 46750, 46750, 48850, 48850, 88850, 108850, 108850, 138650, 178450, 178450, 646300]
DIAMOND = 900_000
TOTAL = 1_500_000 - 590_330        # 상단 '레드 등급까지 590,330'에서 역산
# 넥슨이 들고 있는 주차별 금액 (가장 오래된 주 → 이번 주)
NEXON = [30000, 26420, 0, 2100, 0, 40000, 20000, 0, 29800, 39800, 0, 467850, 253700]
STARTS = ["2026-07-02", "2026-07-09", "2026-07-16", "2026-07-23", "2026-07-30", "2026-08-06",
          "2026-08-13", "2026-08-20", "2026-08-27", "2026-09-03", "2026-09-10", "2026-09-17",
          "2026-09-24"]


def test_restores_real_tooltip():
    r = restore(NEEDS, DIAMOND, TOTAL)
    assert r.ok and r.weeks == NEXON
    assert sum(r.weeks) == TOTAL          # 합계는 구성상 항상 맞는다


def test_middle_weeks_need_no_tier_threshold():
    # 가운데 11주는 차분이라 등급 기준이 틀려도 그대로 나온다
    wrong = restore(NEEDS, 600_000, TOTAL)
    assert wrong.weeks[1:12] == NEXON[1:12]
    assert wrong.weeks[0] != NEXON[0] and wrong.weeks[12] != NEXON[12]


def test_rejects_broken_input():
    assert not restore(NEEDS[:5], DIAMOND, TOTAL).ok
    assert not restore(NEEDS, 0, TOTAL).ok
    # 유지 필요 금액은 줄어들 수 없다
    bad = NEEDS.copy(); bad[3] = 10_000
    assert not restore(bad, DIAMOND, TOTAL).ok
    # 상단 값과 툴팁 1행이 다르면 잡아낸다
    assert not restore(NEEDS, DIAMOND, TOTAL, keep_need=19_000).ok
    assert restore(NEEDS, DIAMOND, TOTAL, keep_need=20_330).ok


def test_compare_finds_pc_room_week():
    collected = NEXON.copy()
    collected[3] = 0                       # 07-23 주: 구매 0건인데 넥슨은 2,100원
    gaps = compare(NEXON, collected, STARTS)
    hit = [g for g in gaps if g.amount]
    assert len(hit) == 1
    g = hit[0]
    assert (g.start, g.amount, g.minutes) == ("2026-07-23", 2100, 126)   # 2시간 6분
    assert g.ok and not g.warn


def test_compare_flags_suspicious_gaps():
    starts = STARTS[:1]
    assert compare([1050], [0], starts)[0].note          # 100 단위가 아님
    assert compare([0], [5000], starts)[0].note          # 수집이 더 많음
    # 29,800원 = 29시간 48분. 100의 배수지만 PC방치고 이례적이다 (실제 수집 누락이었다)
    g = compare([29800], [0], starts)[0]
    assert g.ok and g.warn and "29시간 48분" in g.warn


def test_minutes_conversion():
    assert minutes_of(2100) == 126 and minutes_of(100) == 6 and minutes_of(0) == 0
    assert minutes_of(150) == 6       # 100캐시 단위로만 쌓인다


def test_saved_values_roll_forward_by_week():
    saved = merge_saved({}, compare(NEXON, [0] * 13, STARTS))
    assert saved["2026-07-23"] == 2100 and len(saved) == 13
    # 2주가 지나면 오래된 두 주가 빠지고 새 두 주가 빈칸이 된다
    later = STARTS[2:] + ["2026-10-01", "2026-10-08"]
    assert missing(later, saved) == ["2026-10-01", "2026-10-08"]
    assert apply([0] * 13, later, saved)[1] == 2100      # 07-23 주는 그대로 따라온다


def test_apply_and_prune():
    saved = {"2026-07-02": 500, "2026-09-24": 700}
    assert apply([1000] * 13, STARTS, saved) == [1500] + [1000] * 11 + [1700]
    assert prune(saved, "2026-08-01") == {"2026-09-24": 700}


def test_anchor_reads_top_panel():
    from app.pcroom import anchor
    ths = [150_000, 300_000, 600_000, 900_000, 1_500_000, 2_500_000]
    # '레드 등급까지 590,330' → 지금은 다이아, 13주 합계 909,670
    assert anchor(ths, 4, 590_330) == (900_000, 909_670)
    # 등급이 없을 때 ('브론즈 등급까지 N')
    assert anchor(ths, 0, 50_000) == (0, 100_000)
