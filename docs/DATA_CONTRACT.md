# Data contract — web app ⇄ data team

Web app đọc **dữ liệu tổng hợp theo ô lưới × tháng** (không đọc điểm cháy thô). Mỗi dòng = 1 ô lưới trong 1 tháng.
Giao diện chỉ phụ thuộc interface `DataSource` (`web/src/data/types.ts`); khi có dữ liệu thật chỉ cần viết
`StaticFileDataSource` và đổi 1 dòng trong `web/src/data/index.ts`.

## Schema (CSV hoặc JSON, một dòng / ô / tháng)

| Cột | Kiểu | Ý nghĩa |
|---|---|---|
| `cell_id` | string | Mã ô lưới, ổn định giữa các tháng (vd `-10.25_-60.75`) |
| `lat`, `lon` | number | Tâm ô lưới (độ thập phân) |
| `year_month` | `YYYY-MM` | Tháng |
| `modis_raw` | int \| null | Số **ô-ngày có cháy** (DAG) của MODIS, Terra + Aqua gộp theo ô-ngày (null nếu không có) |
| `viirs_raw` | int \| null | Số ô-ngày có cháy của **S-NPP VIIRS** (chuỗi chuẩn; null trước 2012-01) |
| `harmonized` | number \| null | Chuỗi thống nhất trên **thang VIIRS (S-NPP)**: trước 2013 = `modis_raw` × `scale_factor`; từ 2013 = `viirs_raw` |
| `method` | `modis_scaled` \| `viirs_native` | Cách tạo `harmonized`: MODIS nhân hệ số (trước 2013) hoặc VIIRS giữ nguyên (từ 2013) |
| `scale_factor` | number \| null | Hệ số **MODIS→VIIRS** (VIIRS/MODIS) của tháng dương lịch đó, fit trên 2013–2022; null khi `method = viirs_native` |
| `in_calibration` | bool | Tháng nằm trong giai đoạn 2013–2022 dùng để fit hệ số |
| `data_status` | `standard` \| `nrt` | Dữ liệu chuẩn hay sơ bộ (near-real-time) |

## `metadata.json`

```json
{
  "version": "1.0.0",
  "method": "Mô tả ngắn phương pháp hiệu chỉnh (hiển thị trong panel và đóng vào CSV)",
  "source": "NASA FIRMS MODIS C6.1 + VIIRS S-NPP 375m",
  "gridDeg": 0.25,
  "updated": "2026-11-14",
  "firstMonth": "2000-11",
  "lastMonth": "2026-10",
  "isMock": false
}
```

## Yêu cầu
- Phủ toàn cầu hoặc các vùng cần demo; tên cột đúng như trên.
- Kích thước: nên gọn (vài chục MB) để tải thẳng về trình duyệt; nếu quá lớn, chia file theo vùng/tile.
- `isMock: false` để banner "DEMO DATA" biến mất.
- Hiện tại `MockDataSource` sinh số liệu giả theo đúng schema này (có mùa cháy, năm bất thường, tỷ lệ VIIRS ≈ 3.3× MODIS, hiệu chỉnh đúng quy ước bên dưới).

## Quy ước hiệu chỉnh (theo team data)

- **Đơn vị: ô-ngày có cháy (DAG).** Mỗi ô H3 res7 (~5 km²) có ít nhất một điểm phát hiện trong một ngày tính là 1. Web hiển thị là "active cell-days"; CSV có dòng `# unit` ghi rõ.
- **Chuẩn là S-NPP VIIRS.** MODIS được nâng lên thang VIIRS bằng hệ số theo từng tháng dương lịch (fit trên 2013–2022). Từ 2013 dùng VIIRS gốc.
- **Chưa có NOAA-20 và NOAA-21 trong chuỗi.** S-NPP ngừng từ 2026-11-02, cần cầu nối S-NPP → NOAA-20 → NOAA-21 khi mở rộng sang 2026.
- **Giai đoạn 2000-11 đến 2002-06 chỉ có Terra**, thấy ít hơn nhiều so với Terra + Aqua; web ghi chú rõ nhưng chưa bù.

## Bản đồ lục giác H3 (theo team data)

Bản đồ vẽ **ô lục giác H3 res7 (~5,16 km²)**, giống bản đồ trong notebook của team, thay cho chấm điểm thô.

- Bảng điểm (`points.parquet`) có thêm cột **`h3_res7`** (mã ô H3 của từng điểm phát hiện, chính là Bước 1 trong `03_unified_h3_pipeline.md`).
- Backend gom theo ô: `GET /api/hexes?box&from&to[&source][&day][&limit]` (`from`, `to` là `YYYY-MM`) trả `{cells: [{h3, days}], total, used}`. `days` là số ngày có cháy của ô, **cộng qua các tháng của khoảng** (bằng 1 khi chọn một ngày, lúc đó `from` và `to` phải cùng tháng), tức số **ô-ngày** của ô res7. `total` là số ô res7 có cháy, `used` là số ô trả về (nhỏ hơn `total` khi bị cắt bởi giới hạn `MAX_HEXES`).
- Web tự gộp theo độ phân giải phù hợp với kích thước vùng chọn (res7 cho vùng nhỏ, res4 cho vùng cỡ 10°…): giá trị của lục giác lớn là tổng ô-ngày của các ô res7 bên trong, nên cùng đơn vị với toàn ứng dụng. Chú giải đổi theo giá trị lớn nhất.
- **Dữ liệu thật của team (`parquet_h3_world`)** là bảng bước 2: mỗi dòng một (ngày, ngày/đêm, `sensor_family`, `h3_res7`, `country`) kèm `center_lat/lon`, `point_count`, `frp`, `conf_tier`. Script `backend/scripts/build_hex_months.py` nén thành mỗi (ô, cảm biến, nước, tháng) một dòng trong `<DATA_DIR>/hex/ym=YYYY-MM/*.parquet`, với `days_mask` (bit d-1 bật khi ô có cháy ngày d, nên số bit bật là số ngày có cháy và lọc theo ngày được) và `points`. Có thư mục `hex/` thì `/api/hexes` chỉ đọc từ đó; tháng nào không có file thì trả rỗng.
- `GET /api/hexes` nhận thêm `res` (3 đến 7, mặc định 7): máy chủ cộng các ô res7 vào lục giác cha cỡ đó (tính ô cha bằng phép toán bit trên mã H3, đã đối chiếu với thư viện h3), nên không ô-ngày nào bị mất khi gộp; `limit` áp dụng cho số lục giác trả về, không phải số ô bên trong.
- **Tháng chỉ có Terra** (trước 2002-07, khi Aqua chưa bay): chuỗi tháng và ngày để trống giá trị hài hòa (số MODIS thô vẫn có), vì Terra một mình chỉ thấy khoảng một phần tư những gì Terra cộng Aqua thấy.
- Chuỗi hiển thị khi `source=harmonized`: **MODIS trước 2013-01, VIIRS từ 2013-01**, chọn theo từng tháng nên một khoảng vắt qua 2013 dùng MODIS cho các tháng trước đó và VIIRS cho các tháng sau (số ngày gốc, chưa nhân hệ số; nhân hệ số không có nghĩa với số ngày của từng ô). Nên tổng các lục giác có thể khác số trên lịch ở các năm trước 2013.
- **Bản cập nhật của team** (đã có `type`, `conf_l`, `conf_n`, `conf_h`): script bỏ hàng `type` khác 0 (nguồn cố định, núi lửa, ngoài khơi) và bỏ đúng các điểm tin cậy thấp bằng `conf_l`. File cũ (không có các cột đó) vẫn đọc được: không lọc `type`, bỏ hàng `conf_tier = low`. File tháng có thêm `temp_max` (nhiệt độ sáng cao nhất, K) và `frp_sum` (MW).
- Còn lại của dữ liệu đầu vào: VIIRS từ 2018 có thể gộp S-NPP và NOAA-20 nên số ô-ngày có bậc nhảy (cần team xác nhận); chưa rõ `type` được gộp thế nào khi một ô-ngày có nhiều điểm.
- Cột `cell_id` của bảng tháng trong dữ liệu thật nên là mã H3 res7 (mẫu giả vẫn dùng lưới 1°).

## Chọn quốc gia

- Đường biên lấy từ Natural Earth 50m (gói npm `world-atlas`, miền công cộng), tải riêng khi trang mở (khoảng 750 KB), 241 vùng. Chọn một nước thì bản đồ vẽ đường biên thay cho hình chữ nhật và thu phóng vừa nước đó.
- Hộp để hỏi API là hộp của phần đất chính: các đảo xa (Guiana thuộc Pháp, Hawaii-xa...) và phần vắt qua kinh tuyến 180 không kéo giãn hộp.
- Lục giác chỉ giữ ô có **tâm nằm trong biên giới** (lọc ở trình duyệt, không cần ghép tên nước).
- **Chưa làm:** số liệu theo tháng (lịch, KPI, CSV) vẫn tính theo hộp, nên gồm cả ô của nước láng giềng nằm trong hộp. Lọc đúng theo nước cần bảng tháng có cột nước và bảng tên nước khớp giữa dữ liệu (`South_Sudan`) và bản đồ (`S. Sudan`).
- Cột `cell_id` của bảng tháng trong dữ liệu thật nên là mã H3 res7 (mẫu giả vẫn dùng lưới 1°).

## Điểm cháy trên bản đồ (tùy chọn nhưng nên có)

Bản đồ vẽ **điểm phát hiện gốc** của tháng đang xem qua `DataSource.points(bbox, yearMonth, source)`.
Cần file điểm theo tháng (hoặc theo tile/tháng), mỗi dòng: `lat, lon, sensor` (`modis` | `viirs`), `h3_res7`, có thể thêm `frp`, `confidence`.
Web app tự lấy mẫu tối đa khoảng 4.000 điểm mỗi lần vẽ và ghi rõ "vẽ X trên Y điểm". Nếu chưa có file điểm, bản đồ chỉ hiện khung vùng.

## Dữ liệu theo ngày (cho lịch ngày và bản đồ theo ngày)

Khi người dùng chọn một tháng, web app hiện **lịch theo ngày** của tháng đó và cho chọn một ngày để xem điểm cháy của riêng ngày đó. Cần thêm một lớp dữ liệu:

`DataSource.daily(bbox, yearMonth)` → mỗi ngày một dòng, đã cộng gộp trong vùng: `day` (1–31), `modis_raw`, `viirs_raw`, `harmonized`.

- **Tổng các ngày phải bằng số của tháng** trong file theo tháng (web app và test đang kiểm tra điều này với dữ liệu giả).
- Nên tải theo tháng khi cần (vd file theo vùng/tháng), không cần tải cả 26 năm theo ngày.
- File điểm cháy (mục trên) cần có thêm cột `acq_date` hoặc `day` để lọc theo ngày; `DataSource.points(bbox, yearMonth, source, day?)` trả về điểm của riêng ngày đó.
- Bộ chọn khoảng thời gian (Từ/Đến) vẫn theo tháng. Chọn khoảng theo ngày cần dữ liệu ngày cho cả giai đoạn.

## Bảng tuần cho "năm tương đồng" (`/api/analog`)

Thuật toán của team data (`colab_burning_calendar_analog.ipynb`) cần FRP, độ tương phản nhiệt `(bright_mir - bright_tir) / bright_tir` và độ tin cậy,
những cột không có trong bảng ô-ngày. Backend đọc một bảng riêng `analog_weekly.parquet` (kèm `analog_meta.json`), dựng một lần từ các file năm
của team (`YYYY.parquet`, 25 cột) bằng `backend/scripts/build_analog_weekly.py`:

| Cột | Ý nghĩa |
|---|---|
| `bin_lat`, `bin_lon` | Tâm ô 1° |
| `year`, `week` | Năm, tuần 1..52 (khối 7 ngày từ 1/1; tuần 52 gồm cả các ngày cuối năm) |
| `sum_frp` | Tổng, theo ô H3-ngày, của FRP lớn nhất trong ô-ngày (MW) |
| `sum_score` | Tổng `frp × trọng số tin cậy × độ tương phản nhiệt` |
| `sum_temp`, `sum_conf` | Tổng độ tương phản nhiệt, tổng trọng số tin cậy `(1,0 conf_h + 0,6 conf_n + 0,2 conf_l) / point_count` |
| `n_cells` | Số ô H3-ngày |

- Chỉ `type = 0`. Nhiều vệ tinh trong cùng một ô-ngày chỉ tính một lần (lấy FRP lớn nhất), nên không bị đếm đôi dù file final tách từng `source_platform`.
- Vùng bất kỳ là tổng các ô 1° có tâm nằm trong vùng (xấp xỉ ở biên). Vùng nhỏ hơn 1° có thể không có ô nào.
- Ghi chú trung thực: điểm số so **hình dạng** mùa cháy, không so độ lớn; "biên" `100 - điểm` không phải khoảng tin cậy; chuỗi trước 2012 chỉ có MODIS.

