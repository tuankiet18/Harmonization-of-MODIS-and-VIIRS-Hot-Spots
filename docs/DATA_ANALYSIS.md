# Phân tích dữ liệu FIRMS đã tải (MODIS vs VIIRS)

Nguồn: `C:\firms-country-data\zips` (48 zip, standard quality, 2000-11 → 2025-12). Cắt theo bbox 6 vùng demo,
gộp ngày × ô 0.25° × vệ tinh. Kết quả: `data/processed/daily_cell.csv.gz` (≈14,5 triệu dòng, 74 triệu điểm cháy),
`monthly_region.csv`, `monthly_region_frp.csv`. Script: viết lại từ phiên làm việc (gộp theo `floor(lat/0.25)`).

## Kết quả chính
1. **VIIRS đếm nhiều hơn MODIS khoảng 3,6–5 lần** (độ phân giải 375 m so với 1 km): Amazon 3,6 · Trung Phi 3,8 ·
   California 4,5 · Đông Nam Á 5,0 · Đông Nam Úc 5,0 · Siberia 4,3 (tỉ lệ gộp 2013–2024, VIIRS S-NPP / MODIS Terra+Aqua).
   Mock đang dùng 3,3× nên cần sửa.
2. **Tỉ lệ khá ổn định theo năm** (dao động ±10–15 % mỗi vùng, không có xu hướng rõ), nên một hệ số quy đổi theo vùng là hợp lý.
3. **Tỉ lệ KHÔNG ổn định theo mùa**: Amazon từ 0,5 (tháng 3) đến 4,1 (tháng 10); Trung Phi 3,5–6,8; Siberia mùa đông MODIS
   gần 0 nên tỉ lệ >100. Một hệ số duy nhất cho cả năm sẽ sai ở mùa ít cháy → nên fit **hệ số theo vùng × tháng trong năm**,
   hoặc hồi quy log-log, và đánh dấu tháng có số đếm thấp là kém tin cậy.
4. **Tương quan tháng rất cao** (log-log r = 0,91–0,996). Hold-out (fit 2013–2017, dự đoán S-NPP 2018–2024 từ MODIS):
   tương quan 0,98–0,998, bias tổng ≤ 6 %, nhưng sai số trung vị theo tháng 12–30 % (Siberia 84 % vì tháng ít cháy).
   Kết luận: harmonization đúng về tổng và hình dạng mùa, kém ở tháng đếm thấp.
5. **NOAA-20 ≈ S-NPP** (tỉ lệ 1,00–1,04) → có thể gộp hai VIIRS làm một chuỗi từ 2018; nên dùng S-NPP làm chuẩn vì chuỗi dài hơn (2012).
6. **MODIS suy giảm**: Terra chỉ ~25 % số đếm MODIS (Aqua ~75 %), Terra giảm còn 15 % năm 2025, và MODIS 2025 thấp hơn. Cần ghi
   chú "Terra drift" khi diễn giải xu hướng; đây chính là lý do cần chuyển sang VIIRS.
7. **Chất lượng**: ~92–96 % điểm ở mức tin cậy nominal/high. VIIRS có 18–19 % phát hiện ban đêm, Aqua chỉ 4 %, Terra 27 %
   (khác lịch quan sát 10:30/13:30 và 22:30/01:30). FRP/điểm: MODIS 40–51 MW, VIIRS 12 MW → nên cân nhắc harmonize
   cả tổng FRP chứ không chỉ số đếm.
8. **Mùa cháy thực**: đỉnh Amazon tháng 9, Trung Phi tháng 7, Siberia tháng 7, Cali tháng 8, Đông Nam Á tháng 3, Đông Nam Úc
   tháng 1. Năm cực đoan (MODIS): Amazon 2004, Cali 2020, Úc 2019, Siberia 2019 (CV năm: Siberia 1,0; Cali 0,8; Úc 0,8; Amazon 0,5).

## Cảnh báo
- Dữ liệu 2025 là bản standard đến tháng 12/2025; app đang hiển thị đến 2026-10 nên các tháng sau đó cần dữ liệu NRT/API.
- Điểm cháy đếm thô chưa khử trùng lặp giữa các lượt quét và chưa loại gas flare/đốt công nghiệp (Siberia, Trung Phi).
- Tỉ lệ đo ở mức tổng vùng; ở mức ô 0.25° đơn lẻ số đếm nhỏ nên nhiễu.

## Bước tiếp
Viết `StaticFileDataSource` đọc `monthly_region.csv` + hệ số theo vùng × tháng, thay mock (`web/src/data/index.ts`),
và xuất file điểm/ngày theo vùng cho bản đồ.

## Quỹ đạo trôi (orbital drift) — kiểm chứng từ dữ liệu
Giờ mặt trời địa phương trung vị của các lần quan sát ban ngày (mẫu Brazil, Australia, DR Congo):
| Vệ tinh | 2000–2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|
| Terra | 10,4 | 10,25 | 9,97 | 9,68 | **9,21** |
| Aqua | 13,65 | 13,71 | 13,93 | 14,28 | **14,86** |
| S-NPP / NOAA-20 | 13,55 | 13,56 | 13,58 / 13,57 | 13,54 / 13,54 | 13,58 / 13,54 |
Terra sớm dần (~1,2 giờ), Aqua muộn dần (~1,2 giờ) từ 2022; VIIRS giữ ổn định. Hệ quả: chuỗi MODIS sau 2022 không còn cùng
điều kiện quan sát với trước đó, hệ số quy đổi nên fit trên giai đoạn ổn định (2013–2021) và kiểm chứng riêng 2022–2025.

> **Đính chính (kiểm toán toàn cầu, xem `docs/DATA_ISSUES.md`):** các số trên là của 6 vùng demo. Toàn cầu: VIIRS/MODIS = 6,9 (theo nước 4,2–10,4, tới 15,9 ở Ai Cập); Terra ≈ 33 % số đếm MODIS (27 % năm 2025), không phải 25 %/15 %.
