# Tích hợp dữ liệu final `harmonize_final` và việc cần làm cho web app

Ngày: 2026-11-15 · Trạng thái: **chờ duyệt** · Nguồn: 26 file `2000.parquet` … `2025.parquet` (Drive `harmonize_final`, đã tải đủ, khoảng 12 GB, 308 triệu dòng) + `gpu_ensemble_eqm_v2.joblib` (mô hình, không dùng trong web).

## 1. Kết quả kiểm tra dữ liệu

**Đạt**
- Cả 26 file cùng một schema (25 cột, cùng kiểu). Không có giá trị trống ở ô H3, tọa độ, ngày, nước, vệ tinh, FRP; không có mã H3 sai độ dài, tọa độ ngoài phạm vi, `point_count` hay FRP âm; `observation_window_id` không trùng.
- Ngày đầy đủ 2003 → 2025 (365 hoặc 366 ngày mỗi năm). Dữ liệu kết thúc **31/12/2025**, không có 2026.
- Mỗi dòng = một lần quan sát (ô res7, ngày, ngày/đêm, vệ tinh, nước), có `confidence`, `type`, `frp`, `bright_mir/tir` và cả giá trị MODIS gốc (`raw_modis_*`) bên cạnh giá trị đã quy đổi.

**Khoảng trống thật (do vệ tinh, không phải lỗi tải)**
- 2000: chỉ từ 1/11 (Terra bắt đầu). 2001: thiếu 17 ngày (tháng 6, 7). 2002: thiếu 9 ngày (tháng 3, 4). Từ 2003 không thiếu ngày nào.
- Aqua chỉ xuất hiện từ 4/7/2002. Trước đó chỉ có Terra, thấy ít cháy hơn nhiều.

**Cần lọc khi dùng**
- `type` khác 0 (nguồn cố định, núi lửa, ngoài khơi): 3% (trước 2012) đến 7–8% (sau 2012).
- Độ tin cậy thấp (`conf_l`): 5% trước 2012, 11 đến 13% sau 2012.
- Tên nước dạng có gạch dưới (`Republic_of_Korea`, `Dem_Rep_Korea`, `South_Sudan`) khác tên trên bản đồ; cần bảng ánh xạ.

## 2. Phát hiện quan trọng: dữ liệu "final" chưa làm chuỗi số ô-ngày liên tục

Cấu trúc nguồn theo năm:

| Giai đoạn | Nguồn có trong file |
|---|---|
| 2000–2011 | chỉ `MODIS_ESTIMATED_VIIRS_LIKE` (Terra, từ 7/2002 thêm Aqua) |
| 2012–2017 | MODIS ước tính + `OBSERVED_VIIRS` S-NPP (từ 20/1/2012) |
| 2018–2025 | thêm VIIRS NOAA-20 (từ 1/4/2018) |

Số ô-ngày cháy toàn cầu mỗi năm (đã bỏ `type`≠0 và điểm tin cậy thấp):

| | 2011 | 2012 | 2017 | 2018 | 2019 | 2022 | 2025 |
|---|---|---|---|---|---|---|---|
| Hợp tất cả | 3,15 triệu | 9,52 | 9,37 | 12,11 | 14,08 | 12,70 | 12,67 |
| Chỉ S-NPP | – | 7,85 | 7,89 | 7,65 | 8,16 | 7,01 | 7,35 |
| Chỉ MODIS ước tính | 3,15 | 2,88 | 2,62 | 2,20 | 2,27 | 1,94 | 2,40 |

- Mô hình đã quy đổi **độ sáng và FRP** sang thang VIIRS, nhưng **số ô-ngày** vẫn chênh khoảng **3 lần** (VIIRS 375 m thấy nhiều điểm hơn MODIS 1 km): tỉ lệ VIIRS/MODIS là 2,7 đến 3,2 lần ở 2012–2017 và 4,8 đến 6 lần ở 2018 trở đi.
- Nếu cộng tất cả các nguồn, chuỗi **nhảy gấp 3 lần ở 2012** và **thêm 40 đến 50% ở 2018** chỉ vì có thêm vệ tinh, không vì cháy nhiều hơn. Đây đúng là vấn đề mà đề bài hài hòa muốn tránh.
- **Chỉ S-NPP** ổn định từ 2012 đến 2025 (khoảng 7 đến 8,7 triệu ô-ngày mỗi năm).

**Quyết định đề xuất cho "chuỗi đã hiệu chỉnh" (mặc định của app):**
1. Từ 02/2012: dùng **chỉ S-NPP** (một vệ tinh VIIRS liên tục suốt 14 năm).
2. Trước 02/2012: lấy số ô-ngày của MODIS ước tính nhân hệ số theo tháng (hệ số = VIIRS S-NPP / MODIS ước tính, ước lượng trên 2012–2022 như phương pháp hiện có trong `store.py`); trước 07/2002 (chỉ Terra) không đưa ra giá trị gộp, như hiện nay.
3. NOAA-20 giữ lại trong file để vẽ bản đồ chi tiết, nhưng **không** đưa vào chuỗi gộp; có thể thêm công tắc "tất cả vệ tinh VIIRS" sau.

Cần đội dữ liệu xác nhận: ý đồ của họ với bản final có đúng vậy không (họ có thể muốn cộng cả hai nguồn). Mình chưa chạy thử độ liên tục sau nhân hệ số, sẽ kiểm tra ngay khi dựng xong dữ liệu theo tháng.

## 3. Việc backend (có thứ tự)

1. **Sửa `scripts/build_hex_months.py`:** file mới không có `sensor_family`; dùng `record_origin` (VIIRS quan sát hoặc MODIS ước tính) và `source_platform`. Ghi cột `sensor` (`modis` | `viirs`) cho S-NPP và MODIS ước tính, và một sensor riêng cho NOAA-20 (không vào chuỗi gộp). Đọc trực tiếp từng file năm; giữ lọc `type = 0` và bỏ điểm tin cậy thấp bằng `conf_l`.
2. **Chạy gom** từng năm một (ổ D chỉ còn khoảng 6 GB; file lớn nhất 1 GB), ghi ra ổ C `C:\nasa-data\hex` (khoảng vài GB), kèm thêm `hex_meta.json`.
3. **`store.py`:** đổi `HARMONIZE_FROM` thành `2012-02`, khoảng ước hệ số thành `2012-02`…`2022-12`, và loại sensor NOAA-20 khỏi `_series` và `_daily_from_files`. Giữ `AQUA_START = 2002-07`.
4. **Ánh xạ tên nước** (underscore → tên bản đồ) để chọn nước đúng và bỏ lệch như `South_Sudan`.
5. **Docker:** gắn thư mục `C:\nasa-data` vào container api (bind mount), đặt `SERIES_SOURCE=hex`, và khởi động lại. Bỏ banner "demo" (`isMock=false` đã được đặt khi đọc từ hex).
6. **Thêm trường chất lượng vào `/api/monthly`:** số ngày thiếu trong tháng (2001, 2002) để web hiển thị cờ "thiếu ngày".

## 4. Việc web (ưu tiên theo giá trị với đề bài và thời gian)

Hiện có: chọn vùng (vẽ, tọa độ, nước, vùng sẵn), khoảng thời gian, bản đồ lục giác, lịch năm × tháng và lịch ngày, so với mức thường, chuỗi theo thời gian, tổng theo năm, mùa vụ, ô cháy nhiều nhất, panel giải thích, CSV, chia sẻ liên kết.

**P0: bắt buộc trước khi nộp**
- Chạy đúng với dữ liệu thật (mục 3), chữ giới hạn năm hiển thị đúng: dữ liệu 11/2000 đến 12/2025.
- **Dải thời kỳ vệ tinh** dưới biểu đồ theo thời gian (`TrendChart`): các mốc Terra 11/2000, Aqua 7/2002, S-NPP 2/2012, NOAA-20 4/2018, kèm chú thích "trước 2012 số được nhân hệ số để so sánh được". Đây là chỗ kể câu chuyện hài hòa; không cần thư viện mới.
- **Cờ chất lượng** trên lịch: tháng thiếu ngày (6, 7/2001 và 3, 4/2002), tháng chỉ có Terra (trước 7/2002); đã có kiểu viền đứt và chữ nghiêng, tái dùng.
- Chốt tính năng "vì sao số này đổi sau hiệu chỉnh" (`ExplainPanel`) dùng số thật: hệ số tháng đang chọn, số MODIS gốc → số đã hiệu chỉnh.

**P1: nếu còn thời gian**
- Công tắc **độ tin cậy**: chỉ điểm tin cậy cao, hoặc cả mức thường (cần thêm cột trong file gom).
- Chế độ lịch **cường độ cháy** (FRP, MW) bên cạnh số ô-ngày. Lưu ý: FRP của MODIS ước tính (khoảng 15 đến 20 MW) vẫn khác xa VIIRS (khoảng 6,4 MW) vì khác kích thước điểm ảnh, nên không nên so FRP trực tiếp giữa hai thời kỳ.
- Biểu đồ **ngày và đêm** (cột `daynight`).

**P2: để sau hackathon**
- Cho phép lấy bản đồ nhiều tháng bằng ô thô, thu hẹp bản đồ về tháng đang chọn (đã bàn).
- Dự báo, cảnh báo, chatbot: bỏ như đã thống nhất.

## 5. Thiết kế

- Giữ bố cục hai cột đã chốt ở `2026-11-14-dashboard-ux-design.md`; không đổi lớn vào ngày cuối.
- Thang màu lục giác và chú thích giữ nguyên (đã chấp nhận). Bản đồ vẫn là chấm khi zoom xa, lục giác từ zoom 8.
- Mọi nhãn kỹ thuật (MODIS, VIIRS, S-NPP, hiệu chỉnh) chỉ nằm trong dải thời kỳ vệ tinh và mục Chi tiết, đúng nguyên tắc cũ ("không thuật ngữ chưa giải thích ở màn hình chính").
- Giao diện và tên tính năng giữ tiếng Anh.

## 6. Triển khai

Demo hôm nay: chạy Docker trên máy và mở bằng Cloudflare Tunnel (không tốn tiền, không phải tải dữ liệu lên). Lâu dài: EC2 `t3.large` + ổ gp3 40 GB, dữ liệu qua S3 (xem cuộc trao đổi trước). Tài khoản AWS của bạn đã đăng nhập được, các bước tạo tài nguyên cần bạn đồng ý riêng.

## 7. Kiểm tra hoàn thành

1. `build_hex_months.py` chạy trên cả 26 file không lỗi; số tháng = 302 (11/2000 → 12/2025).
2. Chuỗi hiệu chỉnh của Việt Nam và Brazil liên tục ở 2012 (không nhảy lớn) và 2018 (không nhảy do NOAA-20).
3. Tháng thiếu ngày hiện cờ; không còn banner demo.
4. `pytest` backend và `vitest` web qua; build web xong; kiểm tra bản đồ và lịch trong trình duyệt ở Việt Nam, Brazil, Úc.
5. Đo thời gian truy vấn: bản đồ, chuỗi tháng, lịch ngày dưới vài giây.

## 8. Chưa kiểm tra / cần quyết

- Chưa thấy nguyên văn đề bài (trang spaceappschallenge.org lỗi chứng chỉ trên máy bạn); danh sách tính năng ở mục 4 dựa trên bản tóm tắt trong dự án. Nếu bạn dán đề bài, mình đối chiếu lại từng ý.
- Chưa kiểm chứng độ liên tục sau nhân hệ số (mục 2), chưa đo hiệu năng truy vấn trên toàn bộ dữ liệu.
- Hai quyết định cần bạn và đội dữ liệu: (a) chuỗi hiệu chỉnh dùng chỉ S-NPP như mục 2; (b) có đưa NOAA-20 vào bản đồ không.
