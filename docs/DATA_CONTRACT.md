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
| `modis_raw` | int \| null | Số hotspot MODIS gốc (null nếu không có) |
| `viirs_raw` | int \| null | Số hotspot VIIRS gốc (null trước 2012) |
| `harmonized` | number \| null | Giá trị đã hiệu chỉnh (chuỗi thống nhất) |
| `method` | `modis_only` \| `viirs_scaled` \| `blend` | Cách tạo `harmonized` |
| `scale_factor` | number \| null | Hệ số quy đổi VIIRS→MODIS đã dùng |
| `in_calibration` | bool | Tháng nằm trong giai đoạn chồng lấn dùng để hiệu chỉnh |
| `data_status` | `standard` \| `nrt` | Dữ liệu chuẩn hay sơ bộ (near-real-time) |

## `metadata.json`

```json
{
  "version": "1.0.0",
  "method": "Mô tả ngắn phương pháp hiệu chỉnh (hiển thị trong panel và đóng vào CSV)",
  "source": "NASA FIRMS MODIS C6.1 + VIIRS S-NPP/NOAA-20 375m",
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
- Hiện tại `MockDataSource` sinh số liệu giả theo đúng schema này (có mùa cháy, năm bất thường, tỷ lệ VIIRS ≈ 3.3× MODIS).

## Điểm cháy trên bản đồ (tùy chọn nhưng nên có)

Bản đồ vẽ **điểm phát hiện gốc** của tháng đang xem qua `DataSource.points(bbox, yearMonth, source)`.
Cần file điểm theo tháng (hoặc theo tile/tháng), mỗi dòng: `lat, lon, sensor` (`modis` | `viirs`), có thể thêm `frp`, `confidence`.
Web app tự lấy mẫu tối đa khoảng 4.000 điểm mỗi lần vẽ và ghi rõ "vẽ X trên Y điểm". Nếu chưa có file điểm, bản đồ chỉ hiện khung vùng.

## Dữ liệu theo ngày (cho lịch ngày và bản đồ theo ngày)

Khi người dùng chọn một tháng, web app hiện **lịch theo ngày** của tháng đó và cho chọn một ngày để xem điểm cháy của riêng ngày đó. Cần thêm một lớp dữ liệu:

`DataSource.daily(bbox, yearMonth)` → mỗi ngày một dòng, đã cộng gộp trong vùng: `day` (1–31), `modis_raw`, `viirs_raw`, `harmonized`.

- **Tổng các ngày phải bằng số của tháng** trong file theo tháng (web app và test đang kiểm tra điều này với dữ liệu giả).
- Nên tải theo tháng khi cần (vd file theo vùng/tháng), không cần tải cả 26 năm theo ngày.
- File điểm cháy (mục trên) cần có thêm cột `acq_date` hoặc `day` để lọc theo ngày; `DataSource.points(bbox, yearMonth, source, day?)` trả về điểm của riêng ngày đó.
- Bộ chọn khoảng thời gian (Từ/Đến) vẫn theo tháng. Chọn khoảng theo ngày cần dữ liệu ngày cho cả giai đoạn.
