# Các vấn đề cần giải quyết & chuẩn hoá khi xử lý dữ liệu FIRMS toàn cầu

Mỗi mục có: **Bằng chứng** (đo trên dữ liệu thật) · **Vì sao quan trọng** · **Chuẩn hoá đề xuất** · **Cách kiểm tra** · **Mức ưu tiên**.
Mục nào ghi *(giả thuyết)* nghĩa là chưa đo, cần thử trước khi tin.
Mẫu đo: MODIS 2019/2025/2001, S-NPP 2019/2025 (toàn cầu, mọi nước), phiên bản theo năm (4 nước mẫu), khoảng trống ngày (6 vùng demo).

---

## A. Toàn vẹn dữ liệu & lược đồ

### A1. Hai lược đồ khác nhau giữa MODIS và VIIRS — ưu tiên: cao, dễ
- **Bằng chứng:** cột nhiệt độ khác tên (`brightness`/`bright_t31` so với `bright_ti4`/`bright_ti5`). `confidence` của MODIS là số 0–100 (2019: 5 % ≤29, 66 % 30–79, 29 % ≥80); của VIIRS là chữ `l/n/h` (11 % / 83 % / 6 %). `satellite` là `Terra/Aqua` so với `N/N20`. Không có giá trị thiếu (NaN = 0) ở mọi file đã kiểm.
- **Chuẩn hoá:** lược đồ chung `sensor_group, platform, lat, lon, date_utc, time_utc, frp, conf_class{low,nominal,high}, daynight, type, scan, track, product_version`. MODIS: 0–29 low, 30–79 nominal, 80–100 high (quy ước của FIRMS). VIIRS: l/n/h. Bỏ hai cột nhiệt độ (không dùng cho đếm/FRP).
- **Kiểm tra:** bảng ánh xạ + test đơn vị; tổng điểm sau chuẩn hoá bằng tổng dòng gốc.

### A2. Nhiều phiên bản xử lý (collection) trong chuỗi MODIS — ưu tiên: cao
- **Bằng chứng:** cột `version` của MODIS đổi theo năm: `6.2` (2000–2017), `6.03` (2018–2022), `61.03` (2023–2025). VIIRS luôn là `2`. Hai tháng chuyển phiên bản trùng với ranh giới năm.
- **Vì sao:** tái xử lý có thể tạo bước nhảy giả trong chuỗi mà không phải thay đổi lửa thật. Ý nghĩa chính xác của từng chuỗi phiên bản cần đối chiếu tài liệu FIRMS (chưa kiểm chứng).
- **Chuẩn hoá:** giữ `product_version`; thêm biến giả theo phiên bản vào mô hình hiệu chỉnh.
- **Kiểm tra:** so tỉ lệ VIIRS/MODIS ngay trước/sau 2018-01 và 2023-01, tách Terra và Aqua. Ở 6 vùng demo chưa thấy bước nhảy rõ (Amazon 3,59→3,58 qua 2022→2023), nhưng chưa test thống kê.

### A3. Dữ liệu chuẩn hay sơ bộ (NRT) — ưu tiên: trung bình
- **Bằng chứng:** không thấy chuỗi "NRT" trong `version` ở các file đã kiểm; ngày kéo đến 2025-12-31. Chưa rõ các tháng cuối 2025 có sẽ được thay khi dữ liệu chuẩn cập nhật hay không.
- **Chuẩn hoá:** `data_status` mặc định `standard` cho zip này; mọi dữ liệu lấy sau từ API đánh `nrt`. Ghi ngày tải và checksum từng zip.

### A4. Trùng lặp — ưu tiên: thấp
- **Bằng chứng:** trùng (cùng lat, lon, ngày, giờ) trong cùng zip: VIIRS 0,005 % (~1.000 trên 21 triệu), MODIS 0 %.
- **Chuẩn hoá:** khử trùng theo `(lat, lon, date, time, platform)` khi gộp; không cần xử lý đặc biệt.

### A5. Gán quốc gia & tên — ưu tiên: trung bình
- **Bằng chứng:** 238 tên khác nhau; số nước mỗi zip 163–225 (thiếu chủ yếu là đảo nhỏ không có cháy, **không phải lỗi**). Tên không nhất quán dấu: `Guinea-Bissau`, `Timor-Leste`, `Saint-Martin` dùng gạch ngang, phần còn lại dùng gạch dưới. File chỉ chứa điểm *trong biên giới trên đất liền* của từng nước (điểm ngoài biển hầu như không có, `type 3` ≤ 0,3 %).
- **Chuẩn hoá:** bảng ánh xạ tên → ISO-3166 alpha-3, giữ tên gốc; vùng tranh chấp ghi rõ, không tự gán lại.

### A6. Toàn vẹn ngày/toạ độ — ưu tiên: thấp
- **Bằng chứng:** mọi `acq_date` nằm đúng trong năm của file; không có toạ độ |lon| ≥ 179,99.
- **Chuẩn hoá:** kiểm tự động khi gộp (ngày thuộc năm file, lat ∈ [−90, 90], lon ∈ [−180, 180]); log số dòng loại.

---

## B. Phủ quan sát theo thời gian (nhóm quan trọng nhất)

### B1. Ngày mất quan sát (outage) làm thấp số đếm tháng — ưu tiên: cao
- **Bằng chứng (6 vùng demo, ngày có 0 phát hiện):**
  - Terra: 2001-06-16→07-02 (17 ngày), 2002-03-20→28, 2003-12-17→23, 2008-12-21→23, 2016-02-19→27, 2022-10-11→23 (13 ngày).
  - Aqua: 2002-07-30→08-07, 2022-04-01→16 (16 ngày).
  - S-NPP: 2022-07-27→08-10 (15 ngày), nhiều đợt ngắn 2024-05→11.
  - NOAA-20: 2023-07-19→22.
  Đây là lỗ thật (cụm ngày liên tiếp), không phải mùa ít cháy.
- **Vì sao:** một tháng mất 15 ngày bị đếm thiếu ~50 %, tạo "tháng ít cháy" giả; nếu lấy hệ số tháng quy đổi sẽ bị nhiễu.
- **Chuẩn hoá:** thêm `days_observed` và `coverage = days_observed / days_in_month` cho mỗi (vệ tinh, vùng, tháng). Quy tắc: coverage ≥ 0,9 dùng bình thường; 0,5–0,9 chia theo ngày quan sát rồi gắn cờ `partial_month`; < 0,5 coi là thiếu (NA), không đưa vào fit.
- **Kiểm tra:** thống kê số ngày/tháng theo vệ tinh toàn cầu (chỉ mới kiểm trên 6 vùng; ngày giảm một phần quan sát chưa được đo).

### B2. Thời kỳ một cảm biến trong chuỗi MODIS — ưu tiên: cao
- **Bằng chứng:** Terra bắt đầu 2000-11-01, Aqua 2002-07-04. Giai đoạn 2000–mid-2002 chỉ có Terra; từ 2003 Terra chỉ còn ~25 % tổng MODIS (Aqua ~75 %). Số đếm 2001 (6 vùng) ~169 nghìn so với ~850 nghìn năm 2003.
- **Vì sao:** chuỗi MODIS tự nó có bước nhảy ~4× do thay đổi thành phần, trước cả vấn đề MODIS↔VIIRS.
- **Chuẩn hoá:** xây hai chuỗi: (1) `modis_terra`, (2) `modis_aqua`, rồi tạo `modis_combined` chỉ từ 2003 trở đi; với 2000–2002 quy đổi Terra→"tương đương Terra+Aqua" bằng hệ số fit trên 2003–2021 (theo vùng × tháng), gắn cờ `terra_only_era`.

### B3. Quỹ đạo trôi sau 2022 — ưu tiên: cao
- **Bằng chứng:** giờ quan sát địa phương ban ngày: Terra 10,4 → 9,21 giờ (2025), Aqua 13,65 → 14,86 giờ; VIIRS ổn định ~13,55 giờ. Terra giảm còn ~15 % số đếm MODIS năm 2025.
- **Chuẩn hoá:** fit trên 2013–2021, kiểm chứng riêng 2022–2025; cờ `orbit_drift` cho MODIS từ 2022; cân nhắc biến giờ quan sát; xem `docs/DATA_ANALYSIS.md`.

### B4. Số lần bay qua phụ thuộc vĩ độ *(giả thuyết)* — ưu tiên: trung bình
- Ở vĩ độ cao các dải quét chồng lên nhau, một đám cháy có thể bị thấy nhiều lần mỗi ngày (MODIS 2 vệ tinh, VIIRS 2 vệ tinh). Số đếm thô vì thế có thể phình lên ở Siberia/Canada so với xích đạo.
- **Kiểm tra:** với mỗi ô, đếm số lần quét khác nhau mỗi ngày theo vĩ độ; so sánh số đếm với số "ô-ngày có cháy".
- **Chuẩn hoá (nếu xác nhận):** thêm chỉ số `fire_days` (số ngày có ít nhất 1 phát hiện trong ô) bên cạnh `n` thô; dùng `fire_days` cho so sánh giữa vĩ độ.

---

## C. Khác biệt đo lường giữa cảm biến

### C1. Độ phân giải và pixel theo góc quét — ưu tiên: trung bình
- **Bằng chứng:** MODIS scan 1,3 km (trung vị) tới 4,8 km, track 1,1–2,0; diện tích pixel tương đối: trung vị 1,43, p99 8,36 (gấp ~6 lần). VIIRS scan 0,44–0,80, diện tích trung vị 0,2, p99 0,58 (gấp ~3 lần). Nghĩa là pixel MODIS ở mép dải quét rộng gấp ~6 lần pixel gần đáy, và khả năng phát hiện lửa nhỏ giảm ở đó.
- **Chuẩn hoá:** giữ `scan`, `track` trong bảng gộp ở dạng biến phụ (ví dụ tỉ lệ điểm có `scan` > 2,5 km). Tuỳ chọn: bản "lõi dải quét" loại pixel mép để so sánh sạch.
- **Kiểm tra:** ảnh hưởng của loại pixel mép lên tỉ lệ VIIRS/MODIS (chưa đo).

### C2. Ngưỡng độ tin cậy khác nhau — ưu tiên: trung bình
- 5 % MODIS có confidence < 30 so với 11 % VIIRS `l`. Mức "thấp" của hai sensor không tương đương.
- **Chuẩn hoá:** lưu cả tổng `n_all` và `n_hi` (nominal + high); chạy phân tích hai phiên bản (tất cả điểm / loại điểm thấp) và báo độ nhạy của hệ số.

### C3. Điểm không phải cháy thực vật (`type`) — ưu tiên: cao
- **Bằng chứng:** `type` = 2 (nguồn tĩnh: đốt khí, công nghiệp, khai thác): MODIS 4,2 %, VIIRS S-NPP 6,3 % số điểm 2019. Tập trung theo nước (VIIRS): Libya 92 %, Algeria 78 %, Iran 76 %, Iraq 69 %, Oman 71 %, Egypt 70 %, Đức 82 %, Trung Quốc 41 %. Ở Iraq MODIS cũng 77 %, nhưng VIIRS thấy nhiều nguồn tĩnh nhỏ hơn nên **tỉ lệ VIIRS/MODIS lệch** ở các nước này. `type` 1 (núi lửa) ≈ 0,1 %; `type` 3 (ngoài biển) ≤ 0,3 %.
- **Chuẩn hoá:** hai chuỗi tách biệt: `veg` (type = 0) cho phân tích cháy rừng; `static` (type 2) và `other` (1, 3) lưu riêng. Hiệu chỉnh MODIS↔VIIRS chỉ làm trên `veg`. Báo rõ trên web đây là "cháy thực vật".

### C4. FRP — ưu tiên: trung bình
- **Bằng chứng:** FRP trung vị VIIRS 5 MW so với MODIS 20 MW (trung bình mỗi điểm 12 MW so với 40–51 MW); VIIRS có 2.491 điểm FRP ≤ 0 (min −2,53), MODIS có 2.918 điểm FRP = 0; FRP cực đại VIIRS 1.670 MW, MODIS 12.160 MW.
- **Chuẩn hoá:** FRP ≤ 0 coi là thiếu khi cộng; báo tổng FRP và chuẩn hoá riêng (tỉ lệ FRP không bằng tỉ lệ đếm); không trộn đơn vị với số đếm.

### C5. Tỉ lệ VIIRS/MODIS biến thiên theo mùa và theo vùng — ưu tiên: cao
- Đã đo ở 6 vùng: 3,6–5,0 theo vùng; Amazon 0,5–4,1 theo tháng; Siberia mùa đông MODIS ≈ 0. Hệ quả: hệ số phải theo vùng × tháng, có ngưỡng đếm tối thiểu; xem mục fit trong `docs/GUIDE_GLOBAL_DATA.md`.

---

## D. Không gian & gộp

### D1. Diện tích ô 0,25° thay đổi theo vĩ độ — ưu tiên: trung bình
- Ô 0,25° ở 60°N chỉ bằng ~½ diện tích ở xích đạo (cos φ). Số đếm theo ô không so sánh được giữa các vĩ độ.
- **Chuẩn hoá:** thêm cột `cell_area_km2 = (111,32 × 0,25)² × cos(lat)`; báo mật độ (điểm/1.000 km²) khi so vùng; hoặc dùng lưới cân diện tích (ví dụ H3 / EASE-Grid). Tôi đề xuất giữ 0,25° cho web (đơn giản) và thêm diện tích ô.

### D2. Kích thước bảng đã gộp — ưu tiên: thấp (đã đo)
- **Bằng chứng:** S-NPP 2019 có 554.672 (ô, tháng) khác rỗng ở 0,25°, 114.606 ô riêng; MODIS 2019 có 337.097. Ước tính cả thế giới × cả giai đoạn ≈ 8–9 triệu dòng mỗi nhóm cảm biến theo (ô, tháng) — nhỏ, xử lý được bằng pandas/DuckDB trong vài GB RAM. Ước tính này ngoại suy từ một năm, chưa chạy toàn bộ.

### D3. Đơn vị fit hệ số — ưu tiên: cao
- Xem câu trả lời trước: khối 5° làm mặc định, nước làm dự phòng, cờ `low_confidence`; so sánh ba phương án bằng hold-out.

---

## E. Thời gian

### E1. UTC so với giờ địa phương — ưu tiên: trung bình
- `acq_date`/`acq_time` là UTC. Ở Úc/châu Á "ngày UTC" lệch ngày địa phương, ảnh hưởng lịch ngày của web và so sánh theo ngày.
- **Chuẩn hoá:** giữ UTC trong dữ liệu; thêm `local_date` (UTC + lon/15 giờ) nếu hiển thị theo ngày; ghi rõ trong metadata.

### E2. Số ngày trong tháng — ưu tiên: thấp
- Chuẩn hoá theo `days_observed` (mục B1) chứ không theo 30 ngày cố định.

---

## F. Kỹ thuật & tái lập

### F1. Quy mô xử lý — ưu tiên: trung bình
- S-NPP ~19–21 triệu dòng mỗi năm toàn cầu, MODIS ~3,7–4,6 triệu; cả bộ vài trăm triệu dòng. Phiên trước chạy 10 tiến trình làm máy báo thiếu paging file; dùng ≤ 4 tiến trình, đọc theo khối, kết quả từng zip riêng (script `scripts/aggregate_firms.py` đã làm vậy).
- Ổ C còn ~13 GB: không giải nén zip; đọc trực tiếp từ zip; thư mục ra đặt ổ có chỗ.

### F2. Tái lập & nguồn gốc — ưu tiên: trung bình
- Ghi SHA-256 từng zip, ngày tải, số dòng mỗi file, tham số script (cỡ ô, bộ lọc), phiên bản script (git commit). Xuất `metadata.json` theo `docs/DATA_CONTRACT.md` và kèm câu trích dẫn/giấy phép FIRMS (trong `AttributesReadme.txt`).

---

## G. Kiểm chứng

### G1. Thiết kế kiểm chứng — ưu tiên: cao
- **Tránh rò rỉ:** fit hệ số trên 2013–2021 (hoặc 2013–2017), kiểm trên giai đoạn riêng; không fit và kiểm trên cùng dữ liệu.
- **Chỉ số:** tương quan log-log tháng, bias tổng, sai số trung vị theo tháng, phần trăm tháng nằm trong ±25 %, tách theo vùng và mùa.
- **Đối chứng nội bộ:** NOAA-20 ≈ S-NPP (tỉ lệ 1,00–1,04) làm đối chứng độc lập cho độ ổn định của VIIRS; Terra so với Aqua cho trôi quỹ đạo.
- **Đối chứng ngoài (tuỳ chọn):** diện tích cháy (burned area) hoặc dữ liệu cháy quốc gia; chưa có sẵn trong máy.

---

## Thứ tự xử lý đề xuất
1. **Gộp lại với đủ cột:** `type`, `acq_time`, `scan`, `track`, `version`, `n_hi`, `frp` hợp lệ, `days_observed` (A1, A2, B1, C1, C3, C4).
2. **Làm sạch & cờ:** B1 (coverage), C3 (tách `veg`), A4/A6 (kiểm toàn vẹn), A5 (ISO3).
3. **Chuỗi MODIS nội bộ:** B2 (Terra→combined), kiểm bước nhảy phiên bản A2.
4. **Hiệu chỉnh MODIS→VIIRS:** C5, D3, B3, G1.
5. **Đánh dấu cho web:** `partial_month`, `terra_only_era`, `orbit_drift`, `low_confidence`, `static_excluded`.

---

# KẾT QUẢ KIỂM TOÁN TOÀN CẦU (48/48 zip, 548.501.203 dòng, mọi nước)

Script: `scripts/audit_firms.py`; kết quả thô: `data/processed/audit/*.pkl`. Mục này **thay thế** các con số lấy mẫu ở trên khi có mâu thuẫn.

## Đính chính so với phần lấy mẫu
| Điều đã nói | Thực tế toàn cầu |
|---|---|
| VIIRS/MODIS ≈ 3,6–5 | **Toàn cầu 6,9** (chỉ cháy thực vật, gộp 2013–2024). Theo nước: trung vị 6,3; 5%–95% = 4,2–10,4; thấp nhất Nhật 2,8, cao nhất Ai Cập 15,9. 6 vùng demo **không đại diện** cho thế giới |
| Terra ≈ 25 % số đếm MODIS (15 % năm 2025) | **Toàn cầu Terra ≈ 33 %** (49 % năm 2002, 27 % năm 2025). Con số 25 %/15 % chỉ đúng ở 6 vùng demo |
| MODIS 2025 ~ chỉ phần đo sai lệch ít | Giữ nguyên: giờ trôi quỹ đạo xác nhận toàn cầu (xem dưới) |

## Chất lượng dữ liệu thô — sạch
- Giá trị thiếu: 0. Ngày sai năm: 0. Vĩ độ/kinh độ ngoài miền: 0. Giờ không hợp lệ: 0.
- Trùng lặp: **237 dòng trên 548,5 triệu** (MODIS 3, S-NPP 159, NOAA-20 75) → bỏ qua được.
- `|lon| ≥ 179,9`: 88 dòng (không đáng kể).
- FRP ≤ 0: **111.684 dòng (0,02 %)**, tập trung ở Canada 30.875, Nga 16.143, Mỹ 15.768, Úc 10.490, Brazil 7.420, Iceland 5.818. Xử lý: coi là thiếu khi cộng FRP.

## Phiên bản MODIS (A2) — đổi đúng ranh giới năm, toàn cầu
- Terra/Aqua: `6.2` đến 2017-12, `6.03` từ 2018-01 đến 2022-12, `61.03` từ 2023-01. VIIRS luôn `2`.
- **Bước nhảy ở 2018-01:** tỉ lệ MODIS/VIIRS (thực vật, 12 tháng trước/sau) giảm 3,0 % (Aqua/S-NPP) và 5,2 % (Terra/S-NPP); không lọc loại điểm thì −1,8 % và −2,1 %. Đối chứng không đổi phiên bản (2020-01) chỉ +0,1…+0,7 %. Vậy ảnh hưởng nhỏ nhưng có, cỡ 2–5 %.
- **Nguyên nhân khả dĩ:** tỉ lệ điểm "nguồn tĩnh" (type 2) của MODIS tăng sau 2018 (Aqua 2,2 % → 3,3 %, Terra 4,9 % → 7,8 % năm 2018), VIIRS không đổi → bản mới gắn nhãn nguồn tĩnh nhiều hơn, nên bộ lọc `type = 0` lấy đi nhiều điểm hơn sau 2018. (Suy luận từ số liệu, chưa đối chiếu tài liệu NASA.)
- **Không có bước nhảy ở 2023-01** (Aqua/S-NPP +0,4 %, Terra/S-NPP 0,0 %).
- Chuẩn hoá: biến giả `era_6.2 / 6.03 / 61.03`, hoặc chỉ dùng điểm không đổi nhãn; không dùng ngưỡng `type` làm cơ sở so sánh xuyên 2018 mà chưa kiểm.

## Ngày mất quan sát (B1) — xác nhận toàn cầu, danh sách chính xác
| Vệ tinh | Khoảng ngày (số ngày) |
|---|---|
| Terra | 2001-06-15→07-03 (19), 2022-10-11→23 (13), 2016-02-19→27 (9), 2002-03-20→28 (9), 2003-12-17→24 (8), 2008-12-20→23 (4) |
| Aqua | 2022-04-01→16 (16), 2002-07-30→08-07 (9), vài ngày lẻ 2020–2021 |
| S-NPP | 2022-07-27→08-10 (15), 2024-07-10→16 (7), 2024-07-24→29 (6), 2024-05-30→06-03 (5), 2024-11-03→06 (4), 2025-07-05→07 (3) |
| NOAA-20 | 2023-07-19→22 (4), 2024-02-04→05, 2023-09-30→10-01 |
Tiêu chí: ngày không có dữ liệu hoặc < 35 % trung vị cửa sổ 31 ngày (toàn cầu nên không nhầm với mùa cháy). Nhiều đợt ngắn của S-NPP năm 2024 làm tháng 5–11/2024 thiếu rải rác.

## Trôi quỹ đạo (B3) — xác nhận toàn cầu
Giờ mặt trời địa phương trung bình của lần quan sát ban ngày:
| | 2012–2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|
| Terra | 10,65–10,77 | 10,50 | 10,31 | 10,06 | **9,68** |
| Aqua | 13,44–13,57 | 13,61 | 13,77 | 14,14 | **14,67** |
| S-NPP | 13,34–13,45 | 13,40 | 13,39 | 13,38 | 13,42 |
| NOAA-20 | 13,34–13,38 | 13,39 | 13,38 | 13,37 | 13,37 |
(Số liệu này là trung bình, khác với trung vị 10,4/13,65 ở mẫu 3 nước; xu hướng giống nhau.) Trôi bắt đầu từ 2022: Terra sớm ~1,0 giờ, Aqua muộn ~1,15 giờ vào 2025.

## Điểm không phải cháy thực vật (C3) — toàn cầu
- Tỉ lệ nguồn tĩnh (type 2): MODIS 3,27 %, VIIRS 6,34 % (toàn bộ thời gian); type 1 (núi lửa) 0,07 %/0,11 %; type 3 (ngoài biển) 0,03 %/0,35 %.
- Tập trung: **8 nước chiếm 64,5 % toàn bộ điểm nguồn tĩnh của VIIRS** (Trung Quốc 14,8 %, Iran 10,3 %, Nga 9,3 %, Iraq 9,2 %, Algeria 6,0 %, Mỹ 6,0 %, Ấn Độ 5,1 %, Venezuela 3,8 %).
- **27 trên 124 nước** (đủ dữ liệu) có > 20 % điểm VIIRS là nguồn tĩnh. Cao nhất: Qatar 93 %, Áo 90 %, Bỉ 89 %, Libya 83 %, Đức 83 %, Algeria 81 %, Iraq 80 %, Oman 79 %, Iran 78 %, Hàn Quốc 73 %, Ba Lan 72 %, Kuwait 71 %.
- Ở các nước này tỉ lệ VIIRS/MODIS bị méo (VIIRS thấy nhiều nguồn tĩnh nhỏ hơn). Ví dụ Qatar: 5.065 điểm MODIS so với 179.415 điểm VIIRS.
- Lọc `type = 0` đổi tỉ lệ toàn cầu từ 7,14 xuống 6,93 (nhỏ ở mức toàn cầu, lớn ở mức nước).

## Pixel và độ tin cậy
- Góc quét (`scan`): MODIS 61,6 % ở 0,8–1,5 km, 24,9 % ở 1,5–2,5 km, 8,6 % ở 2,5–3,5 km, **4,9–5,1 % ≥ 3,5 km** (tổng pixel mép > 2,5 km ≈ 13,5 %). VIIRS luôn ≤ 0,8 km (71 % ≤ 0,5).
- Độ tin cậy: MODIS < 30: 4,3–5,5 %, 80+: ~29 %. VIIRS `l` 11,2–11,5 %, `h` 5,1–5,9 %.

## Hệ quả cho bước fit hệ số (D3, C5) — quan trọng
- Dữ liệu theo (nước, tháng) giai đoạn 2013–2021 (chỉ cháy thực vật): **20.729 nước-tháng, chỉ 50,5 % có cả MODIS ≥ 30 và VIIRS ≥ 30 điểm; 36,8 % có MODIS < 10 điểm.**
- **164 trên 235 nước** có ít nhất 1 tháng đủ điều kiện fit; 71 nước không có tháng nào.
- 10 nước đầu (DR Congo, Brazil, Angola, Úc, Nga, Zambia, Mozambique, Nam Sudan, CH Trung Phi, Ấn Độ) chiếm **55,1 %** số điểm thực vật toàn cầu.
- Kết luận: fit theo nước × tháng sẽ **thiếu dữ liệu một nửa số ô**. Cần phân tầng: nước lớn dùng hệ số riêng theo tháng; nước nhỏ và thiếu dữ liệu dùng hệ số của khối lưới/vùng sinh thái lân cận và gắn cờ `low_confidence`. Khối 5° vẫn là ứng viên, nhưng chưa được thử.

## Việc còn lại chưa kiểm
- Số lần bay qua phụ thuộc vĩ độ (B4) — chưa đo (script chưa thu `acq_time` theo ô).
- Ảnh hưởng của pixel mép lên tỉ lệ (C1) — chưa đo.
- Hệ số theo khối lưới 5° so với theo nước (hold-out) — chưa chạy.
- Ý nghĩa chính thức của nhãn phiên bản — chưa đối chiếu tài liệu FIRMS.

---

# Thông tin từ trang FIRMS chính thức (đọc ngày 2026-11-14)

Nguồn: `earthdata.nasa.gov/data/tools/firms`, `firms.modaps.eosdis.nasa.gov/api/{area,data_availability,missing_data}/`, trang thuộc tính "Active Fire Data Attributes for MODIS and VIIRS". Bài blog "Transitioning from Suomi NPP…" trả về HTTP 429 nên **chưa đọc được**; chỉ có đoạn thông báo ngắn của FIRMS.

## 1. Suomi NPP ngừng phát dữ liệu — ảnh hưởng lớn
- Thông báo FIRMS (2026-11-05): *việc phát dữ liệu quan sát Suomi NPP sẽ chấm dứt ngày **2/11/2026**; người dùng nên chuyển sang sản phẩm NOAA-21 và NOAA-20.*
- Hệ quả: chuỗi VIIRS dài nhất (S-NPP, từ 2012) kết thúc; chuẩn VIIRS cho các tháng mới phải là **NOAA-20 và NOAA-21**. Các zip trên trang `/country/` **không có NOAA-21** (chỉ `modis`, `viirs-snpp`, `viirs-jpss1` = NOAA-20). NOAA-21 có trong API (`VIIRS_NOAA21_SP` và `_NRT`), mã vệ tinh `N21`.
- Ta đã đo NOAA-20 ≈ S-NPP (tỉ lệ 1,00–1,04), nên thay S-NPP bằng NOAA-20 làm neo là hợp lý; NOAA-21 chưa đo.

## 2. Danh sách ngày thiếu dữ liệu chính thức (`/api/missing_data/`, dữ liệu chuẩn)
Khớp từng khoảng ngày với các đợt mất quan sát ta tìm ra từ dữ liệu thô (xác nhận độc lập):
| Vệ tinh | Khoảng ngày thiếu |
|---|---|
| Terra | 2001-06-16→07-02, 2002-03-20→27, 2002-04-15, 2003-12-17→23, 2008-12-21→22, 2016-02-19→27, 2022-10-11→22, **2026-01-12** |
| Aqua | 2002-07-30→08-07, 2002-09-13, 2022-04-01→16 |
| S-NPP | 2012-03-25, 2022-07-27→08-10, 2024-05-30→06-03, 2024-07-10→15, 2024-07-25→28, 2024-09-26, 2024-11-03→05, **2026-03-10→12, 2026-04-28→06-02 (36 ngày), 2026-07-11→16** |
| NOAA-20 | 2023-07-19→22, 2023-09-30, 2024-02-04 |
| NOAA-21 (cột NRT) | 2024-02-27→03-06 |
Dùng API này thay cho phương pháp suy ra của ta khi tính `days_observed` (nhớ: bảng chỉ nói thiếu cả ngày, không nói thiếu một phần).
Đáng chú ý: S-NPP mất **36 ngày** từ 28/4 đến 2/6/2026, nên tháng 5/2026 gần như không có dữ liệu S-NPP.

## 3. Điểm cần xử lý mới
- **Trường `type` chỉ có ở dữ liệu chuẩn (MCD14ML), không có ở NRT.** Phần cuối chuỗi (sau khi dữ liệu chuẩn kết thúc, các tháng gần nhất) lấy từ NRT sẽ **không lọc được nguồn tĩnh**, tạo bước nhảy giả so với chuỗi đã lọc `type = 0`. Cần ghi `type_available = false` cho dữ liệu NRT và so sánh cẩn thận hoặc không lọc ở cả hai.
- **Vùng Dị thường Nam Đại Tây Dương (SAA):** theo tài liệu, VIIRS có pixel độ tin cậy thấp ban đêm chỉ ở vùng 11°E→110°W, 7°N→55°S (do nhiễu kênh I4), và các pixel này **đã bị loại khỏi NRT** nhưng còn trong dữ liệu chuẩn. Hai vùng demo Amazon và Trung Phi nằm trong vùng này. Hệ quả có thể xảy ra: số đếm VIIRS chuẩn và NRT lệch nhau ở khu vực này (chưa đo độ lớn).
- **`version` là "collection + nguồn xử lý":** hậu tố `URT`, `RT`, `NRT` cho dữ liệu gần thời gian thực; không có hậu tố là xử lý chuẩn. Dữ liệu zip của ta không có hậu tố nào, nên đều là **chuẩn** (xác nhận mục A3). Chuỗi cụ thể `6.2` / `6.03` / `61.03` không khớp ví dụ trong tài liệu (`6.1`) nên ý nghĩa chính xác vẫn chưa xác nhận.
- **VIIRS FRP:** từ 2015 thuật toán dùng thêm kênh M13 750 m (tài liệu FIRMS) — có thể gây thay đổi FRP quanh 2015; chưa kiểm.

## 4. API web services (dùng cho tháng mới và NOAA-21)
- `GET /api/area/csv/[MAP_KEY]/[SOURCE]/[west,south,east,north]/[DAY_RANGE 1..5]/[YYYY-MM-DD]`, nguồn: `MODIS_SP|NRT`, `VIIRS_NOAA20_SP|NRT`, `VIIRS_NOAA21_SP|NRT`, `VIIRS_SNPP_SP|NRT`.
- Mỗi lần gọi tối đa **5 ngày**; cần **MAP_KEY miễn phí** (đăng ký trên FIRMS, phải do người dùng tự làm); có đếm số "map transaction".
- `/api/data_availability/csv/[MAP_KEY]/[SENSOR]` cho biết ngày dữ liệu chuẩn/NRT có sẵn; `/api/missing_data/` không cần key (trang tải bằng JS, dữ liệu ở `?action=fetch_data`).
- Chưa kiểm tra giới hạn giao dịch của MAP_KEY.
