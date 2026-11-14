# Biểu đồ của tab Overview: dùng để làm gì, cần dữ liệu gì

Mọi biểu đồ và bản đồ của tab Overview đều theo khoảng **From–To** ở thanh trên.

| Nhóm | Biểu đồ | Câu hỏi | Dữ liệu |
|---|---|---|---|
| Over time | Xu hướng theo tháng (MODIS, VIIRS, chuỗi hài hòa) | Sau hài hòa, cảm biến gốc còn quan trọng không? Có mùa, có đột biến không? | chuỗi tháng |
| Over time | Tổng theo năm | Năm nào cháy nhiều nhất, có xu hướng không? | chuỗi tháng |
| Against usual | Mỗi tháng so với bình thường | Tháng nào bất thường? (cam: nhiều hơn, xanh: ít hơn; cột bị cắt ở 400%, tooltip vẫn ghi số thật) | chuỗi tháng |
| Against usual | Một năm điển hình và năm đang xem | Mùa cháy rơi vào tháng nào, năm này lệch ra sao? | chuỗi tháng |
| Against usual | Tiến độ mùa cháy (cộng dồn từ đầu năm) | Mùa này đang chạy nhanh hay chậm hơn bình thường? | chuỗi tháng |
| Where | Ô lục giác cháy nhiều nhất | Cần theo dõi ở đâu? Bấm vào một dòng để bản đồ bay tới ô đó | số ngày cháy mỗi ô (`/api/hexes`) |

"Bình thường" luôn là **trung vị của cùng tháng ở các năm khác** (cả tháng đang xét bị loại ra), cùng cách tính với kết luận ở đầu bảng.
Tiến độ mùa: một năm chỉ được tính cho tháng m khi có đủ dữ liệu từ tháng 1 đến m, nên năm dở dang không kéo mức bình thường xuống.

## Ô cháy dai dẳng

Một ô cháy từ 60% số ngày của khoảng trở lên (khoảng ít nhất 30 ngày) được gắn nhãn "có thể là nguồn nhiệt cố định" (giàn khí, nhà máy).
Dữ liệu của team không có cột `type`, nên không lọc được các nguồn này; nhãn chỉ là gợi ý, không phải kết luận.
Trên 2 tháng đầu của dữ liệu thật, có ô cháy 44 trên 61 ngày.

## Chưa làm, cần mở rộng dữ liệu

- **Cường độ (FRP):** dữ liệu của team có `frp` ở mọi dòng (trung vị 22 MW, p99 548 MW, lớn nhất 11.358 MW trên MODIS 2000), nhưng `build_hex_months.py` đang bỏ cột này. Cần thêm tổng hoặc trung vị FRP theo ô và tháng. FRP của MODIS và VIIRS không cùng thang đo, nên chỉ vẽ theo từng cảm biến hoặc từ 2013.
- **Ngày và đêm:** 15% dòng là ban đêm. Cần thêm `daynight`. Ưu tiên thấp.
- **Xếp hạng nước:** có cột `country` nhưng API chưa trả; chỉ có nghĩa khi chọn vùng nhiều nước.
