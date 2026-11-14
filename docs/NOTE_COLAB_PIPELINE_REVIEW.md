# Góp ý cho `colab_harmonization_pipeline.ipynb` (Việt Nam)

Mình đã chạy lại Step 1–2 của notebook trên `vietnam_2000_2025.parquet` và kiểm tra các điểm bên dưới bằng số liệu thật.
Các con số khớp với notebook: 1.665.285 dòng sau lọc `type=0` và `nominal/high`, 50 ô tĩnh bị loại, 2.751 dòng bị xóa.

## Phần làm tốt (giữ nguyên)

- Chọn **S-NPP làm chuẩn VIIRS**: giờ bay của S-NPP và NOAA-20 ổn định, không trôi (xem bảng 3), nên là chuẩn tốt.
- **Không dùng MODIS sau 2022**: Terra và Aqua trôi quỹ đạo từ 2022–2023 (bảng 3). Notebook đã dùng VIIRS gốc từ 2013 nên tránh được.
- **Hệ số theo từng tháng** là đúng: hệ số VIIRS/MODIS dao động theo mùa từ khoảng 2,2 (tháng 7) đến 3,9 (tháng 2, tháng 11).
- Hệ số **ổn định theo năm trong 2013–2022** (bảng 2), nên nhân hệ số cố định trong giai đoạn này là hợp lý.
- Lọc `type=0` và loại nguồn nhiệt cố định đúng hướng.

## Cần xử lý

### 1. Giai đoạn 2000-11 đến 2002-06 chỉ có Terra, và Terra một mình thấy rất ít (quan trọng nhất)

Terra bay buổi sáng (khoảng 10:30), lúc lửa còn ít. Aqua bay buổi chiều, lúc lửa nhiều. Tính theo ô-ngày H3 res7:

| Giai đoạn | Terra một mình thấy bao nhiêu % so với Terra + Aqua | Hệ số để bù |
|---|---|---|
| 2003–2007 | 25,2% | 3,97 |
| 2008–2012 | 26,6% | 3,76 |
| 2013–2017 | 30,6% | 3,27 |
| 2018–2022 | 39,0% | 2,56 |

Notebook nhân `modis_dag` của giai đoạn Terra-only với hệ số đã fit trên thời Terra + Aqua, nên 20 tháng đầu bị thấp khoảng 4 lần (ước lượng).
Đường cơ sở 2003–2022 không bị ảnh hưởng, nhưng calendar sẽ hiển thị 2000-11 đến 2002-06 như những năm rất ít cháy.

**Đề xuất:** gắn cờ `terra_only_era` cho 20 tháng này và không dùng chúng làm "bình thường", hoặc tính một hệ số Terra → Terra + Aqua riêng.

### 2. Sai số hiệu chỉnh cỡ 9–12% mỗi tháng, cần ghi rõ

Mình chạy lại đúng phép thử của notebook (fit 2013–2018, thử 2019–2022, tỷ lệ theo tháng):

- 48 tháng thử: tổng lệch **+5,9%**, sai số tuyệt đối trung bình **15,7% mỗi tháng**.
- Bỏ-một-năm (10 lần chia): trung vị **8,8%**, trung bình **12,4%**, phân vị 90 là **27,9%**, tháng tệ nhất **68,5%**.

Web dùng dải "About usual" là ±10% so với trung vị. Sai số hiệu chỉnh của các tháng 2003–2012 ngang với dải này, nên một số tháng sẽ bị gắn nhãn "cao/thấp hơn bình thường" chỉ vì sai số.
Đây là sai số ở cấp quốc gia. Vùng nhỏ sẽ lớn hơn.

**Đề xuất:** (a) dùng bỏ-một-năm thay vì một lần chia 2019–2022; (b) xuất thêm một cột sai số (ví dụ `calib_err_pct`) để web hiển thị độ không chắc chắn cho các tháng đã hiệu chỉnh; (c) kiểm định thêm trên vùng con.

### 3. Mô hình chọn không dựa vào kết quả kiểm định

Notebook so 4 mô hình nhưng bước cuối luôn dùng `full_ratios` (tỷ lệ theo mùa). Nếu tỷ lệ theo mùa vẫn là lựa chọn tốt nhất thì ghi rõ lý do và bảng kết quả. Trong bản lưu, các ô Step 3 trở đi chưa có kết quả chạy (`status: aborted`), nên hiện chưa có bảng RMSE nào để đối chiếu.

### 4. Ngày không có điểm nào: chưa phân biệt "không cháy" và "thiếu dữ liệu"

Số ngày không có dòng nào trong năm (sau khi lọc): S-NPP 1–27 ngày, MODIS 16–60 ngày. Có chuỗi đáng nghi:

- S-NPP: **15 ngày liên tiếp (2022-07-27 đến 2022-08-10)** không có dòng nào; 2024 có nhiều đợt 5–6 ngày (30/5–3/6, 10–15/7, 24–29/7).
- MODIS: các đợt 4–5 ngày vào tháng 10–11/2025.

Mùa mưa ở Việt Nam có thể có ngày không cháy thật, nên chưa kết luận được. Cấp tháng thì không có tháng nào bằng 0, nên `fill_null(0.0)` chưa gây hại ở cấp quốc gia theo tháng, nhưng sẽ gây hại khi làm theo ngày hoặc theo vùng nhỏ.

**Đề xuất:** làm bảng độ phủ theo ngày và vệ tinh, đối chiếu danh sách dữ liệu thiếu chính thức của FIRMS, và để null thay vì 0 khi vệ tinh không có dữ liệu.

### 5. Ba điểm nhỏ trong code

- `month_ratios[m] = ... if m_mod > 0 else 1.0`: tháng không có dữ liệu MODIS thì đặt hệ số 1.0 âm thầm. Nên báo lỗi hoặc đánh dấu.
- Đường cơ sở 2003–2022 tính cả năm đang xét. Web dùng trung vị của **các năm khác**. Hai định nghĩa cho kết quả anomaly khác nhau.
- Vòng lặp `h3.latlng_to_cell` từng điểm chạy ổn với 1,8 triệu dòng nhưng sẽ rất chậm với dữ liệu toàn cầu. Cần cách tính theo lô (extension H3 của DuckDB hoặc polars-h3).

## Số liệu chi tiết

**Bảng 2. Hệ số ô-ngày S-NPP / MODIS theo năm**

| Năm | 2012 | 2013 | 2014 | 2015 | 2016 | 2017 | 2018 | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Hệ số | 3,14 | 3,64 | 3,34 | 3,46 | 3,34 | 3,16 | 3,65 | 3,21 | 3,26 | 3,13 | 3,22 | 2,87 | 2,85 | 2,46 |

Trong 2013–2022 hệ số dao động 3,1–3,65 và không có xu hướng. Từ 2023 hệ số giảm, trùng với lúc Terra và Aqua trôi quỹ đạo.

**Bảng 3. Giờ bay ban ngày trung vị (UTC; giờ Việt Nam = UTC + 7)**

| Năm | Terra | Aqua | S-NPP | NOAA-20 |
|---|---|---|---|---|
| 2013 | 03:36 | 06:18 | 06:15 | n/a |
| 2018 | 03:36 | 06:17 | 06:14 | 06:14 |
| 2022 | 03:24 | 06:20 | 06:13 | 06:15 |
| 2024 | 02:55 | 06:52 | 06:16 | 06:14 |
| 2025 | 02:33 | 07:16 | 06:15 | 06:13 |

Đến 2025, Terra bay sớm hơn khoảng 1 giờ và Aqua muộn hơn khoảng 1 giờ so với 2018. S-NPP và NOAA-20 không đổi. Aqua cũ (06:18) cùng giờ với S-NPP, đây là lý do hệ số ổn định.

**Hiệu ứng DAG** (2013–2022): MODIS 1,18 điểm mỗi ô-ngày, VIIRS 1,44 điểm mỗi ô-ngày. DAG đưa tỷ lệ thô VIIRS/MODIS từ 4,07 xuống 3,35. Hiệu ứng khá nhỏ ở Việt Nam, sẽ lớn hơn ở vùng cháy dày.

## Việc cần thống nhất với web và backend

1. **Hướng quy đổi.** Notebook nâng MODIS lên thang VIIRS. Hợp đồng dữ liệu và mô tả trên web hiện đang nói ngược lại ("VIIRS nhân hệ số để đưa về thang MODIS"). Cần chọn một hướng.
2. **Đơn vị.** Số liệu là "ô-ngày có cháy" (DAG), không phải số điểm cháy. Web sẽ đổi nhãn cho đúng.
3. **Mức chi tiết.** Notebook xuất bảng tháng cho cả quốc gia. Backend cần bảng theo từng ô H3 và tháng (`monthly.parquet`, xem `docs/DATA_CONTRACT.md`), kèm bảng ngày và bảng điểm.
4. **Phạm vi thời gian.** Dữ liệu dừng ở 2025-12. Web cần đến 2026 (SP đến 2026-07, sau đó là NRT). S-NPP ngừng từ 2026-11-02, nên cần cầu nối S-NPP → NOAA-20 → NOAA-21 (mình có thể tải NOAA-20 và NOAA-21 qua FIRMS Area API).
5. **Tài liệu.** `03_unified_h3_pipeline.md` gộp theo `sensor_family` và `daynight`, notebook gộp theo `sensor_stream` và không tách ngày/đêm. Cần cập nhật tài liệu cho khớp.

## Câu hỏi cho team

- Các ô từ Step 3 đã chạy chưa? Nếu có thì cho mình bảng kết quả.
- Có định giữ tỷ lệ theo mùa làm phương pháp cuối cùng không?
- Ai làm bảng độ phủ theo ngày?
