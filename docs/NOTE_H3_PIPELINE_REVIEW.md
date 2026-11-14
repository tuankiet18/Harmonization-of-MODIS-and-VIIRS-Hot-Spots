# Góp ý cho `03_unified_h3_pipeline.md`

Hướng chuyển sang lưới H3 res7 là đúng: ô có diện tích gần bằng nhau, giải quyết được vấn đề ô lat/lon bị co theo vĩ độ. Dưới đây là các điểm nên sửa **trước khi chạy toàn cầu**, vì chúng thay đổi cấu trúc file Parquet. Xếp theo mức quan trọng.

## 1. Thêm `satellite` vào khóa gộp (quan trọng nhất)

Khóa gộp hiện chỉ có `sensor_family`, nên S-NPP và NOAA-20 bị gộp chung vào "VIIRS". Một đám cháy cả hai vệ tinh cùng thấy sẽ bị đếm hai lần trong `point_count` và `frp` (SUM).

Số vệ tinh đang bay thay đổi theo năm, nên chuỗi sẽ có các bậc thang giả:

| Giai đoạn | VIIRS | MODIS |
|---|---|---|
| 2000 – giữa 2002 | chưa có | chỉ Terra |
| giữa 2002 – 2011 | chưa có | Terra + Aqua |
| 2012 – 2017 | S-NPP | Terra + Aqua |
| 2018 – 2022 | S-NPP + NOAA-20 | Terra + Aqua |
| 2023 – 11/2026 | thêm NOAA-21 | Terra + Aqua |
| sau 2026-11-02 | S-NPP ngừng | Terra + Aqua |

**Đề xuất:** giữ `satellite` trong khóa gộp cho tới hết bước hài hòa. Chỉ gộp theo họ cảm biến sau khi đã chuẩn hóa theo số vệ tinh.

## 2. Lọc `type` trước khi gộp

Bước 1 giữ cột `type`, nhưng Bước 2 gộp mất nó. Sau đó không lọc lại được. Nguồn tĩnh (`type=2`: mỏ khí, lò luyện), núi lửa (`1`) và điểm ngoài khơi (`3`) sẽ bị trộn vào ô có cháy thảm thực vật.

**Đề xuất:** lọc `type == 0` trước Bước 2. Nếu muốn giữ các loại khác thì để vào cột riêng.

## 3. `point_count` không so sánh được giữa MODIS và VIIRS

Một ô H3 res7 chứa khoảng 5 pixel MODIS (1 km) nhưng khoảng 35 pixel VIIRS (375 m). Đây là một phần lý do tỷ lệ VIIRS/MODIS toàn cầu cao (khoảng 6,9 theo audit của mình).

**Đề xuất:** thêm cột `active_cell = 1` (ô có ít nhất một điểm) và dùng số ô cháy khi hài hòa, thay vì số điểm thô.

## 4. Cần bảng độ phủ để phân biệt "không cháy" và "không có dữ liệu"

Ngày không có điểm cháy thì không có dòng nào trong Parquet. Calendar sẽ không biết đó là 0 hay vệ tinh mất tín hiệu.

**Đề xuất:** làm thêm bảng độ phủ theo ngày và vệ tinh (ngày nào vệ tinh có dữ liệu). Dùng kết quả audit trong `data/processed/audit/` và danh sách missing-data chính thức của FIRMS.

## 5. Giữ giờ bay qua trong Bước 3

Bước 3 bỏ `acq_time`, nên không kiểm tra được lệch quỹ đạo (giờ bay qua trượt dần từ khoảng 2022).

**Đề xuất:** giữ `acq_time_median` hoặc `acq_hour`.

## 6. Các điểm nhỏ

- `country` nằm trong khóa gộp: ô ở biên giới có thể bị tách thành hai dòng. Nên gán nước theo tâm ô.
- `frp` SUM trộn MODIS và VIIRS là hai thang đo khác nhau. Chỉ nên cộng trong cùng một họ cảm biến.
- Tên file `vietnam_h3_step2_2000_2025` cho thấy mới làm Việt Nam. Nhóm cần biết phạm vi toàn cầu thì chạy thế nào.

## Nguồn dữ liệu mới: NOAA-21

Đầu vào hiện có `modis`, `viirs-snpp`, `viirs-jpss1` (NOAA-20), chưa có NOAA-21. Mình đã lấy được qua FIRMS Area API (script `scripts/fetch_firms_api.py`, khóa MAP_KEY đọc từ biến môi trường).

- Có từ 2023-03-01 (SP). NRT từ 2024-01-17.
- Cột giống file zip, **trừ `country`**: API trả theo hộp tọa độ nên phải gán nước theo tâm ô H3.
- Nên có cột `product` (SP hay NRT). NRT có thể được xử lý lại về sau.
- NOAA-20 và NOAA-21 gần như cùng thiết bị, bay cách nhau khoảng 50 phút: cặp lý tưởng để đo hệ số đếm đôi, rồi mới tính cầu nối với MODIS.

## Chưa kiểm chứng

Các điểm 1 và 3 là suy luận từ cấu trúc dữ liệu, chưa đo bằng số liệu. Mình sẽ đo trên vùng Đông Nam Á (N20 so với N21) và gửi kết quả.
