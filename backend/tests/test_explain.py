from conftest import BOX, make_client

BODY = {"bbox": BOX, "yearMonth": "2019-09", "source": "harmonized", "lang": "en", "place": "the Amazon Basin"}


def test_explain_returns_text_and_facts(client):
    r = client.post("/api/explain", json=BODY)
    assert r.status_code == 200
    j = r.json()
    assert j["provider"] == "template"
    assert "September 2019" in j["text"] and "the Amazon Basin" in j["text"]
    f = j["facts"]
    assert f["yearsCompared"] == 25 and f["value"] > 0 and f["historicalMedian"] > 0
    # every number quoted in the text must come from the facts
    assert f"{f['value']:,}" in j["text"] and f"{f['historicalMedian']:,}" in j["text"]


def test_explain_vietnamese(client):
    j = client.post("/api/explain", json={**BODY, "lang": "vi", "place": "vùng này"}).json()
    assert "tháng 9/2019" in j["text"] and "ô-ngày" in j["text"]


def test_explain_modis_scaled_month_mentions_conversion(client):
    j = client.post("/api/explain", json={**BODY, "yearMonth": "2005-09"}).json()
    assert "MODIS" in j["text"] and "VIIRS scale" in j["text"] and "less certain" in j["text"]


def test_explain_terra_only_month_warns_about_undercount(client):
    j = client.post("/api/explain", json={**BODY, "yearMonth": "2001-09"}).json()
    assert "Terra" in j["text"]
    later = client.post("/api/explain", json={**BODY, "yearMonth": "2005-09"}).json()
    assert "Terra" not in later["text"]


def test_explain_nrt_month_is_flagged(client):
    j = client.post("/api/explain", json={**BODY, "yearMonth": "2026-10"}).json()
    assert "preliminary" in j["text"].lower()


def test_explain_unknown_month_is_404(client):
    assert client.post("/api/explain", json={**BODY, "yearMonth": "1999-01"}).status_code == 404


def test_explain_rejects_bad_input(client):
    assert client.post("/api/explain", json={**BODY, "yearMonth": "2019-9"}).status_code == 422
    assert client.post("/api/explain", json={**BODY, "lang": "fr"}).status_code == 422


def test_explain_rate_limit(data_dir):
    c = make_client(data_dir, explain_rate_per_min=2)
    assert [c.post("/api/explain", json=BODY).status_code for _ in range(3)] == [200, 200, 429]


def test_llm_provider_is_a_clear_501_until_implemented(data_dir):
    c = make_client(data_dir, explain_provider="llm")
    r = c.post("/api/explain", json=BODY)
    assert r.status_code == 501 and "not implemented" in r.json()["detail"].lower()
