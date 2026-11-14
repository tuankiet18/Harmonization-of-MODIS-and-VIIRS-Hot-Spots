# Thiết kế lại UX dashboard FireCalendar (phương án A)

Ngày: 2026-11-14 · Trạng thái: **chờ duyệt** · Phạm vi: `web/src` (giao diện và chữ), không đổi dữ liệu hay logic tính.

## 1. Mục đích
Người lạ mở trang phải trả lời được **không cần bấm gì** hai câu mà đề bài NASA đặt ra:
1. Tháng này so với mức thường thấy của vùng này là cao hay thấp?
2. Tháng nào và năm nào cháy nhiều nhất?

Người dùng đích (theo đề bài): cán bộ ứng phó khẩn cấp, nhà khoa học, người quản lý đất, lính cứu hỏa. Họ không cần biết MODIS hay VIIRS là gì.

Vì sao làm: bản hiện tại bị rối. Quan sát ở 1440 px: nhiều thuật ngữ không giải thích ("Harmonized", "MODIS raw", "grid cells", "NRT", "calibration range"); 4 cách chọn "tháng đang xem"; khoảng 9 khối cùng cấp trong một cột cuộn; câu chuyện hiệu chỉnh nằm cuối trang.

## 2. Phần lõi và phần phụ
**Lõi (luôn hiện, đúng đề bài):** chọn vùng (vẽ/toạ độ/vùng có sẵn); chọn khoảng thời gian; lịch năm × tháng với thang màu dễ tiếp cận; so sánh với trung vị nhiều năm; vài con số chính (tháng đỉnh, năm đỉnh, tổng); tải CSV; chuỗi đã hiệu chỉnh làm mặc định.
**Phụ (cất vào mục "Chi tiết", thu gọn mặc định):** lịch ngày, biểu đồ đường, khung giải thích hiệu chỉnh, chọn nguồn thô MODIS/VIIRS, vẽ điểm cháy lên bản đồ. Người dùng sẽ bổ sung/chỉnh phần phụ sau.

## 3. Mục tiêu, không-mục-tiêu, điều tránh
- **Mục tiêu:** đọc ra kết luận trong 5 giây; một khái niệm duy nhất "tháng đang chọn"; không còn thuật ngữ chưa giải thích ở màn hình chính; dùng được trên điện thoại.
- **Không làm:** đổi dữ liệu, đổi cách hiệu chỉnh, thêm tính năng mới (dự báo, cảnh báo), thiết kế lại lịch ngày.
- **Tránh (thất bại dù chạy được):** giao diện đẹp hơn nhưng vẫn phải giải thích bằng miệng; giấu mất thang màu, cờ chất lượng (NRT) hoặc nhãn "demo"; chỉ dựa vào màu để truyền nghĩa.

## 4. Ràng buộc
Cuộc thi còn khoảng một đến hai ngày: sửa tại chỗ, giữ React + Tailwind + MapLibre + ECharts, không thêm thư viện. Giao diện **chỉ tiếng Anh** (theo yêu cầu của người dùng khi duyệt: bỏ nút EN/VI và toàn bộ bản dịch tiếng Việt). Giữ chế độ tương phản và cỡ chạm ≥ 44 px trên cảm ứng. Giữ banner "DEMO DATA" khi `isMock`.

## 5. Các phương án đã xét
| | Cách | Được | Mất |
|---|---|---|---|
| **A (chọn)** | Giữ 2 cột (bản đồ trái, kết quả phải), sắp lại thứ bậc, cất phần phụ | Ít việc nhất, bản đồ đủ lớn để vẽ vùng | Vẫn có hai cột để nhìn |
| B | Quy trình 3 bước (vùng → thời gian → kết quả) | Rõ nhất với người mới | Nhiều lần bấm; kết quả tách khỏi bản đồ |
| C | Lịch ở giữa, bản đồ thu nhỏ | Lịch là nhân vật chính | Bản đồ nhỏ khó vẽ vùng, trái với gợi ý của đề bài |
Người dùng chọn **A**.

## 6. Thiết kế (đã chốt cùng người dùng: hướng A; các chi tiết dưới là đề xuất của tôi, ghi ở mục 8)

### 6.1 Bố cục desktop
```
┌ Header: tên app ───────────────────────────────────────────────┐
├ Bản đồ (trái) ─────────┬ Thanh công cụ: Vùng · Giai đoạn · [Tải CSV]
│ chọn vùng sẵn, vẽ,     │ Kết luận 1 câu + nhãn [Cao hơn thường / Bình thường / Thấp hơn]
│ toạ độ, xoá            │ 3 số: Tháng cháy nhiều · Năm cháy nhiều · Tổng
│ (không còn thẻ tháng)  │ Cách đọc (1 dòng): mỗi ô = 1 tháng, càng đậm càng nhiều
│                        │ LỊCH NĂM × THÁNG   [Số lượng | So với mức thường]
│                        │ ▸ Chi tiết và chất lượng dữ liệu (thu gọn)
└────────────────────────┴────────────────────────────────────────┘
```
- **Thanh công cụ** (dính đầu cột phải): tên vùng đang chọn (chỉ đọc, bấm để cuộn/đưa tiêu điểm sang bản đồ), hai ô chọn tháng, các nút nhanh **Toàn bộ / 10 năm / 5 năm**, nút **Tải CSV** (chuyển từ header sang đây vì nó xuất đúng vùng và giai đoạn đang chọn). Nút chọn nguồn (Harmonized/MODIS/VIIRS) **bỏ khỏi đây**.
- **Một khái niệm "tháng đang chọn":** chọn bằng cách bấm ô trên lịch (chính) hoặc mũi tên ‹ › cạnh câu kết luận; bấm biểu đồ trong "Chi tiết" cũng chọn cùng tháng. Thẻ "tháng/ngày đang vẽ" trên bản đồ **bỏ**.
- **Bản đồ** chỉ còn việc chọn vùng. Điểm cháy chỉ vẽ khi bật công tắc trong "Chi tiết".
- Mặc định mở: nguồn = đã hiệu chỉnh; khoảng = toàn bộ; chế độ lịch = Số lượng; vùng = Amazon (như hiện tại).

### 6.2 Phần "Chi tiết và chất lượng dữ liệu" (thu gọn mặc định)
Gồm, theo thứ tự: (1) một câu đầu giải thích bằng lời thường vì sao số đã hiệu chỉnh ("Vệ tinh đã đổi theo thời gian; chúng tôi quy đổi số đếm cũ để mọi tháng so sánh được"); (2) khung "Vì sao số này đổi sau hiệu chỉnh" hiện có, giữ nguyên nội dung kỹ thuật; (3) chọn nguồn: Đã hiệu chỉnh / MODIS gốc / VIIRS gốc; (4) biểu đồ đường 3 chuỗi; (5) lịch ngày; (6) công tắc "Vẽ điểm cháy của tháng đã chọn lên bản đồ". Thuật ngữ MODIS, VIIRS, NRT, calibration chỉ được xuất hiện ở đây và ở dòng chú thích cuối trang.

### 6.3 Chữ (chỉ tiếng Anh; bỏ cột tiếng Việt) — bảng đổi từ
| Hiện tại | Thay bằng (EN / VI) |
|---|---|
| hotspots | fire detections / điểm cháy phát hiện được |
| median / "Against the median" | typical (median of that month in other years) / "So với mức thường thấy" |
| Harmonized | (ẩn khỏi màn hình chính; trong Chi tiết: "Combined, comparable series / Chuỗi đã quy đổi để so sánh được") |
| Preliminary (NRT) | Preliminary: may still change / Sơ bộ, có thể còn thay đổi |
| "140 grid cells, 312 months" | bỏ khỏi màn hình chính |
| "4,005 of 18,881 raw detections drawn" | chỉ còn trong Chi tiết, khi bật điểm cháy |
Nhãn kết luận dùng **chữ + biểu tượng + màu** (không chỉ màu).

### 6.4 Lịch
- Thêm dòng "Cách đọc" 1 dòng phía trên lịch.
- Giữ thang màu hiện tại (vàng nhạt → đỏ cháy cho số lượng; xanh–xám–cam cho so với mức thường). Giữ viền đứt cho dữ liệu sơ bộ và chữ nghiêng xám cho các năm chỉ có MODIS.
- Sau phần kết luận, lịch phải còn trong tầm nhìn đầu tiên ở 1440×900 (người làm tinh chỉnh chiều cao hàng).

### 6.5 Điện thoại (≤ 640 px)
Thanh công cụ → bản đồ (cao ~40 vh) → kết luận → 3 số → lịch → Chi tiết. Không cuộn ngang.

## 7. Kiểm tra hoàn thành
1. Ở 1440×900, không bấm gì, đọc được kết luận (cao/thấp/bình thường), tháng đỉnh và năm đỉnh.
2. Màn hình chính **không chứa** các từ: Harmonized, MODIS, VIIRS, NRT, calibration, grid cells, scale factor (kiểm bằng tìm chuỗi trên DOM của trang ở chế độ thu gọn).
3. Chỉ có một cách chọn tháng được trình bày rõ (lịch + mũi tên); không còn thẻ tháng trên bản đồ.
4. Mục "Chi tiết" thu gọn mặc định và mở ra đầy đủ nội dung cũ (lịch ngày, biểu đồ, giải thích, chọn nguồn).
5. 390 px không cuộn ngang; thao tác vẽ vùng, nhập toạ độ, chọn vùng sẵn, tải CSV, đổi EN/VI vẫn chạy.
6. `npm run build` và 9 test hiện có qua.
7. Chụp màn hình trước/sau ở 1440 và 390.

## 8. Những chỗ tôi tự quyết (cần bạn xem)
- Chuyển nút **Tải CSV** từ header xuống thanh công cụ.
- **Bỏ** thẻ "tháng đang xem" trên bản đồ; điểm cháy thành tuỳ chọn trong Chi tiết.
- Mặc định lịch ở chế độ **Số lượng** (không phải so với mức thường).
- Mặc định khoảng thời gian là **toàn bộ** 2000–nay (đúng đề bài), thêm nút nhanh 5 và 10 năm.
- Nút chọn nguồn thô (MODIS/VIIRS) chuyển vào Chi tiết.

## 9. Việc để người làm quyết
Chiều cao hàng lịch, độ rộng cột bản đồ so với kết quả, tên nhãn kết luận chính xác trong hai ngôn ngữ, cách thu gọn mục Chi tiết (accordion hay nút mở).
