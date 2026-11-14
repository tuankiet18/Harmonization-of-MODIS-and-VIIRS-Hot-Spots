# Quy trình Chuẩn hóa Dữ liệu Điểm nóng Cháy sang Lưới H3 (`03_unified_h3_pipeline.md`)

Tài liệu này là **quy chuẩn thống nhất cho cả nhóm** để chuyển đổi dữ liệu điểm nóng cháy (Hotspots) từ 2 dòng vệ tinh **MODIS** và **VIIRS** về một cấu trúc lưới không gian **Uber H3 (`res=7`)** đồng nhất trước khi thực hiện đồng nhất hóa chuỗi thời gian và hiển thị trên Web.

---

## Bước 0: Dữ liệu đầu vào (Unified Raw Parquet)

Dữ liệu đầu vào được gộp từ các file CSV gốc của NASA FIRMS (`modis`, `viirs-snpp`, `viirs-jpss1`) với schema thống nhất:
* **Thời gian:** `acq_date` (`DATE`), `acq_time` (`HHMM`), `year` (`SMALLINT`), `daynight` (`D` = Ban ngày, `N` = Ban đêm)
* **Không gian:** `latitude`, `longitude`, `scan`, `track`, `pixel_area_km2`, `country`
* **Cảm biến & Chất lượng:** `sensor_family` (`MODIS` / `VIIRS`), `sensor_stream`, `satellite`, `confidence_raw` (MODIS: `0–100`, VIIRS: `l`/`n`/`h`), `conf_tier` (`low` / `nominal` / `high`), `type` (`0–3`)
* **Thông số vật lý:** `bright_mir` (`brightness` / `bright_ti4`), `bright_tir` (`bright_t31` / `bright_ti5`), `frp` (Megawatts)

---

## Bước 1: Bảng Dữ liệu Đồng nhất — Chuyển toàn bộ Điểm (Point) sang Ô lục giác H3 (`h3_res7`)

Thay vì lưu từng tọa độ điểm rời rạc (`latitude`, `longitude`), toàn bộ dữ liệu được quy về lưới lục giác **Uber H3 cấp độ 7 (`res=7`, diện tích ~5.16 km²/ô)**:

1. **Tính mã ô H3 và tọa độ tâm ô:**
   * `h3_res7 = h3.latlng_to_cell(latitude, longitude, 7)`
   * `(center_lat, center_lon) = h3.cell_to_latlng(h3_res7)`
2. **Cấu trúc cột sau Bước 1:**
   * Đưa các cột định danh không gian–thời gian lên đầu:
     `acq_date`, `h3_res7`, `center_lat`, `center_lon`, ...
   * **Giữ nguyên** toàn bộ các cột còn lại (`acq_time`, `daynight`, `sensor_family`, `sensor_stream`, `satellite`, `bright_mir`, `bright_tir`, `frp`, `confidence_raw`, `conf_tier`, `type`, `country`, `year`, ...).

---

## Bước 2: Gộp các điểm trong 1 ô H3 (Spatial–Temporal Aggregation)

Trong cùng một ô lục giác H3, nhiều pixel con (đặc biệt ở VIIRS 375 m) hoặc nhiều pixel lân cận có thể xuất hiện cùng lúc. Ta tiến hành gộp các điểm trong cùng 1 ô H3 theo các khóa và quy tắc sau:

### 2.1. Khóa gộp nhóm (Group-by Keys)
Gộp theo tổ hợp duy nhất của:
* **Không gian:** `h3_res7`, `center_lat`, `center_lon`, `country`
* **Loại vệ tinh:** `sensor_family` (`MODIS` hoặc `VIIRS`)
* **Thời gian & Ca bay:** `acq_date`, `year`, `daynight` (`D` hoặc `N`)

*(Nhờ tách riêng theo `daynight`, lượt bay ban ngày `D` và ban đêm `N` đã được tách biệt rõ ràng, không bị cộng dồn nhầm giữa ngày và đêm.)*

### 2.2. Quy tắc tổng hợp các giá trị vật lý & độ tin cậy

| Thuộc tính | Quy tắc gộp | Giải thích |
| :--- | :--- | :--- |
| **`bright_mir`** | **`MAX(bright_mir)`** | Nhiệt độ sáng kênh hồng ngoại trung (MIR) lấy giá trị lớn nhất để giữ lại cường độ lõi cháy mạnh nhất trong ô. |
| **`bright_tir`** | **`MEAN(bright_tir)`** | Nhiệt độ sáng kênh hồng ngoại nhiệt (TIR) lấy trung bình cộng để phản ánh nhiệt độ nền bề mặt trong ô. |
| **`frp`** | **`SUM(frp)`** | Công suất bức xạ lửa (MW) lấy tổng tất cả các điểm trong ô (do đã tách theo `daynight` nên tổng FRP phản ánh tổng năng lượng tỏa ra trong ca sáng hoặc ca đêm của ô H3 đó). |
| **`confidence` (MODIS)** | **`MEAN(confidence)`** | Với MODIS (thang số `0–100`), lấy trung bình cộng của các điểm trong ô (`conf_modis_mean`), đồng thời ánh xạ sang `conf_tier` (`< 30` → `low`, `30–79` → `nominal`, `≥ 80` → `high`). |
| **`confidence` (VIIRS)** | **`MODE` + Quy tắc hòa** | Đếm số lần xuất hiện của `l`, `n`, `h` trong ô H3 và lấy mức xuất hiện nhiều nhất. Nếu **số lần lặp bằng nhau (hòa)** thì áp dụng quy tắc dưới đây. |
| **`point_count`** | **`COUNT(*)`** | Lưu số lượng điểm gốc đã được gộp vào ô H3 đó để phục vụ kiểm tra và trực quan hóa. |

### 2.3. Quy tắc xử lý trường hợp hòa (Tie-breaking) cho `confidence` của VIIRS
Gọi số lần xuất hiện trong ô H3 lần lượt là $c_l$ (low), $c_n$ (nominal), $c_h$ (high):
1. **Có 1 giá trị nhiều nhất duy nhất:** Chọn giá trị có số lần xuất hiện lớn nhất.
2. **Hòa giữa `l` và `n`** ($c_l = c_n > c_h$): Ưu tiên làm tròn lên $\rightarrow$ chọn **`n`**.
3. **Hòa giữa `n` và `h`** ($c_n = c_h > c_l$): Ưu tiên làm tròn lên $\rightarrow$ chọn **`h`**.
4. **Hòa cả 3 mức `l`, `n` và `h`** ($c_l = c_n = c_h$): Lấy mức trung bình ở giữa $\rightarrow$ chọn **`n`**.
5. **Hòa giữa 2 mức `l` và `h`** ($c_l = c_h > c_n$): Lấy mức trung bình ở giữa $\rightarrow$ chọn **`n`**.

*(Tóm gọn thành biểu thức điều kiện chuẩn xác cho mọi trường hợp:*
* *Nếu $c_l > c_n$ và $c_l > c_h$ $\rightarrow$ **`l`**;*
* *Ngược lại, nếu $c_h \ge c_n$ và $c_h > c_l$ $\rightarrow$ **`h`**;*
* *Các trường hợp còn lại $\rightarrow$ **`n`**.)*

---

## Bước 3: Xuất Tệp Parquet Kết quả (`vietnam_h3_step2_2000_2025.parquet`)

Bảng kết quả sau Bước 2 được lưu dưới dạng **Parquet (nén ZSTD)** gồm các cột chuẩn:
`acq_date`, `year`, `daynight`, `sensor_family`, `h3_res7`, `center_lat`, `center_lon`, `country`, `bright_mir`, `bright_tir`, `frp`, `confidence`, `conf_tier`, `point_count`.
