# Hướng dẫn đọc & phân tích dữ liệu FIRMS toàn cầu

## 1. Dữ liệu có gì
- 48 file `<sensor>_<năm>_all_countries.zip` ở `C:\firms-country-data\zips\{modis,viirs-snpp,viirs-jpss1}`.
- Mỗi zip chứa 1 CSV cho mỗi quốc gia (khoảng 160–220 nước), mỗi dòng là **một điểm cháy** (một pixel phát hiện).
- Cột: `latitude, longitude, acq_date, acq_time, satellite, instrument, confidence, frp, daynight, type`,
  cộng `brightness/bright_t31` (MODIS) hoặc `bright_ti4/bright_ti5` (VIIRS), `scan, track, version`.
  - `satellite`: Terra, Aqua (MODIS); `N` = S-NPP, `N20` = NOAA-20 (VIIRS).
  - `confidence`: MODIS là số 0–100; VIIRS là chữ `l`/`n`/`h` (thấp/thường/cao). **Hai thang khác nhau**, đừng so thẳng.
  - `frp`: công suất bức xạ lửa (MW). `daynight`: D/N. `type`: 0 = cháy thực vật, 1 = núi lửa, 2 = nguồn tĩnh (khai thác, công nghiệp), 3 = ngoài biển.
- Quy mô toàn cầu: VIIRS S-NPP khoảng 20–40 triệu điểm mỗi năm, tổng cả bộ cỡ **vài trăm triệu dòng**, nên
  **không bao giờ nạp thô vào pandas/trình duyệt**. Luôn gộp trước.
- Ngoại lệ phủ thời gian: MODIS 2000-11 → 2025-12; S-NPP 2012-01 →; NOAA-20 2018-01 →. Tháng sau 2025 chưa có.

## 2. Bước 1: gộp thô thành bảng nhỏ (script có sẵn, đã chạy thử)
```
python -I scripts/aggregate_firms.py C:\firms-country-data\zips D:\...\processed_world --cell 0.25 --workers 4
```
- Đọc từng zip theo khối 500 nghìn dòng (RAM thấp), ra `<tên_zip>.csv.gz` với cột
  `country, sat, ym, ci, cj, n, hi, frp, night` (số đếm, số điểm tin cậy, tổng FRP, số điểm ban đêm theo tháng × ô × vệ tinh × nước).
- Tâm ô: `lat = (ci+0.5)*cell`, `lon = (cj+0.5)*cell`. Chạy lại sẽ bỏ qua file xong, nên tắt máy giữa chừng vẫn tiếp tục được.
- Đã thử trên MODIS 2000 (30 nghìn dòng) và S-NPP 2012 (574 nghìn dòng, 222 nước, 20,9 triệu điểm), mất vài chục giây mỗi file.
  Ước tính cả 48 file: khoảng 30–60 phút. Dùng `--workers 4` (lần trước 10 tiến trình làm máy báo thiếu paging file).
- Muốn theo ngày để làm lịch ngày: sửa `ch.ym` thành `ch.acq_date` (file ra lớn hơn nhiều; chỉ làm cho vùng cần xem).
- Lưu ý: **MODIS dùng 1 km, VIIRS 375 m**, nên mọi phân tích dưới đây dùng ô 0,25° (≈ 28 km) để chung một lưới.

## 3. Bước 2: đọc bảng đã gộp
```python
import glob, pandas as pd
d = pd.concat(pd.read_csv(f) for f in glob.glob('processed_world/*.csv.gz'))
d['grp'] = d.sat.map({'terra':'modis','aqua':'modis','snpp':'viirs','n20':'viirs'})  # n20 ≈ snpp (tỉ lệ 1.0)
```
Kiểm tra trước khi tin: (a) số file = 48; (b) tổng `n` theo năm khớp tổng dòng CSV; (c) không có năm thiếu vệ tinh (xem bảng năm × vệ tinh).

## 4. Bước 3: phân tích gợi ý (đúng với đề bài harmonization)
1. **Bảng chuỗi tháng theo ô:** pivot `(ci,cj,ym) × grp` → cột `modis`, `viirs`. Đây là bảng đưa vào web (`cell_id,lat,lon,year_month,modis_raw,viirs_raw,...`).
2. **Giai đoạn chồng lấn:** 2012-01 → 2025-12 có cả MODIS và S-NPP. Dùng 2013–2017 để *fit* và 2018–2025 để *kiểm chứng* (không fit và kiểm trên cùng dữ liệu).
3. **Hệ số quy đổi:** với mỗi *đơn vị phân tích* (quốc gia, vùng sinh thái hoặc khối ô lớn hơn như 5°) tính `k = tổng viirs / tổng modis`
   và `k` theo **tháng trong năm**. Trên 6 vùng demo, k thay đổi mạnh theo mùa (Amazon 0,5 → 4,1) nên một hệ số toàn cầu sẽ sai.
   Đừng fit hệ số theo từng ô 0,25° đơn lẻ vì số đếm quá nhỏ, rất nhiễu; gộp ô theo vùng rồi áp xuống.
4. **Chuỗi thống nhất:** trước 2012 dùng `modis × k` để quy về thang VIIRS, từ 2012 dùng VIIRS thật (hoặc hòa trộn có trọng số ở giai đoạn chồng lấn).
   Ghi `method` (`modis_only/viirs_scaled/blend`), `scale_factor`, `in_calibration` theo `docs/DATA_CONTRACT.md`.
5. **Đánh giá chất lượng harmonization:** tương quan log-log tháng, bias tổng, sai số trung vị theo tháng, và báo riêng các tháng đếm thấp (<10) là kém tin cậy.
6. **Chỉ số cho web:** median nhiều năm theo (ô, tháng), anomaly = giá trị / median, tháng đỉnh, năm cực đoan.
7. **Phân tích bổ sung có giá trị:** tổng FRP (VIIRS 12 MW/điểm so với MODIS 40–51 MW), tỉ lệ đêm/ngày, tỉ lệ `hi`, xu hướng Terra (chỉ khoảng 25 % số đếm MODIS, giảm còn 15 % năm 2025).

## 5. Bẫy thường gặp
- **Đừng so nhầm số đếm VIIRS với MODIS khi chưa quy đổi:** VIIRS cao gấp 3,6–5 lần chỉ vì phân giải mịn hơn, không phải cháy nhiều hơn.
- **Điểm không phải cháy rừng:** `type` ≠ 0 (núi lửa, đốt khí công nghiệp, khai thác). Trên toàn cầu nên lọc `type == 0` hoặc ít nhất báo riêng, đặc biệt ở Nga, Iraq, Iran, Nigeria. Script hiện tại **chưa lọc**; nếu cần thêm `type` vào `COLS` và vào khóa `groupby`.
- **Số đếm không bằng diện tích cháy:** một đám cháy lớn tạo nhiều điểm; so sánh vùng nên dùng thêm FRP hoặc số ô có cháy.
- **Quốc gia ≠ vùng sinh thái:** tên nước theo tên file; biên giới tranh chấp có thể lệch. Nếu dùng hệ số theo nước thì nước nhỏ ít dữ liệu sẽ nhiễu; hãy gộp.
- **Ngày UTC:** `acq_date`/`acq_time` là UTC, nên "ngày" ở châu Á/Úc lệch ngày địa phương.
- **NRT / dữ liệu mới nhất:** zip chỉ là chuẩn (standard); các tháng sau 12/2025 phải lấy NRT qua FIRMS API (cần MAP_KEY) và đánh dấu `data_status = nrt`.
- **Trùng lặp:** nếu một điểm nằm sát biên nước có thể xuất hiện ở hai file; ảnh hưởng nhỏ, nhưng nếu cần chính xác hãy loại trùng theo `(lat, lon, acq_date, acq_time, sat)`.

## 6. Dung lượng đầu ra cho web
Toàn cầu × 0,25° × tháng × 312 tháng là quá lớn để tải thẳng về trình duyệt. Chia theo vùng/tile (ví dụ 30° × 30°) thành các file JSON/CSV nhỏ,
hoặc dùng Parquet + DuckDB-WASM. App chỉ cần tải tile của vùng đang xem và file `metadata.json`.
