# Hướng Dẫn Chi Tiết & Giải Mã Toàn Bộ Thông Số Model `gpu_ensemble_eqm_v2.joblib`

Tài liệu này dành cho thành viên nhóm (AI / Data / Backend / Web) nhận file **`gpu_ensemble_eqm_v2.joblib`** (được xuất từ Ô 6 của [colab_ml_harmonization_v2_gpu.ipynb](file:///d:/Gemini%20Output/colab_ml_harmonization_v2_gpu.ipynb)) và thư mục dữ liệu **`harmonize_final/*.parquet`**.

---

## 1. Tổng quan Mô hình & Bài toán Harmonization (`MODIS -> VIIRS-like`)

### 1.1. Mục đích
* Dữ liệu cháy rừng lịch sử từ đầu năm `2000` đến nay đến từ hai thế hệ cảm biến khác nhau:
  * **MODIS** (`Terra` / `Aqua`, độ phân giải ~1 km): có chuỗi dài từ 2000 nhưng bỏ sót đám cháy nhỏ và thường bị lệch thang đo nhiệt độ sáng / công suất bức xạ so với VIIRS.
  * **VIIRS** (`S-NPP` / `NOAA-20`, độ phân giải 375 m): độ nhạy cao hơn nhưng chỉ có đầy đủ từ 2012 trở đi.
* File **`gpu_ensemble_eqm_v2.joblib`** đóng gói duy nhất đường ống mô hình **`GPU Ensemble + EQM`** (phiên bản triển khai chính thức tốt nhất từ pipeline `parquet_h3_world_v2`) để quy đổi tín hiệu MODIS tổng hợp trên ô lục giác **H3 Resolution 7** (`~5.161 km²`) thành giá trị tương đương VIIRS (**`VIIRS-like`**).

### 1.2. Ba kênh đầu ra đồng thời
| Kênh mục tiêu | Tên trong `models` | Đơn vị | Miền giới hạn hợp lệ (`[clip_lo, clip_hi]`) | Ghi chú hiệu chỉnh |
| :--- | :--- | :--- | :--- | :--- |
| Nhiệt độ sáng hồng ngoại trung (MIR) | `bright_mir` | `K` (Kelvin) | `[200.0, 367.0]` | Có **EQM** (`eqm_map` bật). Giới hạn 367 K khớp điểm bão hòa kênh I4 của VIIRS. |
| Nhiệt độ sáng hồng ngoại nhiệt (TIR) | `bright_tir` | `K` (Kelvin) | `[180.0, 425.0]` | **Không dùng EQM** (`eqm_map = None`, dùng thẳng `Weighted GPU Ensemble`). |
| Công suất bức xạ lửa (FRP) | `frp_log1p` -> `frp` | `log1p(MW)` -> `MW` | Log: `[0.0, log1p(55000.0)]` (`≈ 10.9151`), MW: `[0.0, 55000.0]` | Dự đoán trên thang `log1p`, đi qua **EQM** (`eqm_map`), rồi quy đổi sang `MW` qua **Two-Zone Tail Calibrator** (`mw_cal`). |

### 1.3. Quy chuẩn dữ liệu huấn luyện & đánh giá
* **Ghép cặp 1–1 (`h3-time-aware-3.0.0`):** Nối MODIS và VIIRS theo `observation_window_id`, `h3_res7`, `year`, `daynight`, `type`, `aggregation_recipe_id`, `quality_policy_id` với sai lệch thời gian `pair_delta_minutes` từ `0.0` đến `15.0` phút (`PAIR_MAX_DELTA_MIN = 15.0`, `PLATFORM_SCOPE = "ALL"`, `FIRE_TYPE_SCOPE = "ALL"`).
* **Nguyên tắc Zero Leakage:** Toàn bộ 57 đặc trưng đầu vào `X` chỉ dùng thông tin phía MODIS và tọa độ/thời gian quan sát; tuyệt đối không sử dụng giá trị VIIRS hay độ lệch phút ghép cặp `pair_delta_minutes` khi suy luận.
* **Chia tập theo thời gian:**
  * **Train:** `2013–2022` (mỗi năm lấy mẫu tới `80,000` cặp; trong đó `2021–2022` tách làm validation nội bộ để học trọng số ensemble `regime_weights`, tham số `alpha` của EQM và `mw_cal`; phần `>= 2018` dùng làm tập tham chiếu `ref_mask` khớp phân vị EQM).
  * **Test độc lập:** `2023–2025` (`n_samples = 276,903` cặp kiểm thử trong `ml_v2_model_comparison.csv`).

---

## 2. Sơ đồ Cấu trúc Tổng thể của File `gpu_ensemble_eqm_v2.joblib`

Khi chạy `bundle = joblib.load("gpu_ensemble_eqm_v2.joblib")`, bạn nhận được một `dict` Python với cấu trúc cây như sau:

```text
gpu_ensemble_eqm_v2.joblib (dict)
├── "model_name"        : "GPU Ensemble + EQM"
├── "version"           : "v2_66col_57feat_hybridloss_biascal"
├── "dataset_version"   : "parquet_h3_world_v2"
├── "created_at"        : "YYYYMMDD_HHMMSS"
├── "feature_count"     : 57
├── "ensemble_members"  : [7 tên mô hình thành phần theo đúng thứ tự]
├── "prior_enc"         : dict (Mã hóa Bayesian 3 cấp không gian + nhiệt độ nền T_bg)
│     ├── "n_rows", "sig"
│     ├── "h3_map",  "h3_vals"  (N_h3 x 4),  "h3_def"  (4,)
│     ├── "g05_map", "g05_vals" (N_g05 x 3), "g05_def" (3,)
│     ├── "ctd_map", "ctd_vals" (N_ctd x 3), "ctd_def" (3,)
│     └── "tbg_cell_map", "tbg_band_map", "tbg_global"
├── "multitask"         : dict artifact PyTorch "Multi-Task Physics Net" (hoặc None nếu bị cắt tỉa khi mọi kênh có trọng số = 0)
└── "models"            : dict chứa 3 kênh mục tiêu: "bright_mir", "bright_tir", "frp_log1p"
│     └── <target_key>  : dict
│           ├── "tgt_idx"        : int (0=MIR, 1=TIR, 2=FRP)
│           ├── "active_members" : list[bool] (7 phần tử, True nếu model được giữ lại)
│           ├── "xgb"            : StandardizedXGBRegressor | None
│           ├── "catboost"       : CatBoostRegressor | None
│           ├── "dl_arts"        : dict[tên DL model -> artifact dict | None]
│           ├── "weights"        : np.ndarray shape (7,)
│           ├── "regime_weights" : np.ndarray shape (4, 8)
│           ├── "is_log"         : bool (False với MIR/TIR, True với frp_log1p)
│           ├── "clip_lo"        : float
│           ├── "clip_hi"        : float
│           ├── "eqm_map"        : dict {"probs", "src_q", "tgt_q", "alpha"} | None
│           └── "mw_cal"         : dict {"mode", "s0", "tau1", "c1", "p1", "tau2", "c2", "p2"} | None
└── "test_metrics"      : dict chỉ số đánh giá trên Test 2023-2025 cho:
                          "bright_mir", "bright_tir", "frp_log1p", "frp_mw"
```

### Bảng giải thích 10 khóa cấp cao nhất (Root Keys)

| Khóa (Key) | Kiểu dữ liệu | Ý nghĩa |
| :--- | :--- | :--- |
| `model_name` | `str` | Tên định danh mô hình đóng gói (`"GPU Ensemble + EQM"`). |
| `version` | `str` | Thẻ phiên bản thí nghiệm (`EXPERIMENT_TAG`), mặc định `"v2_66col_57feat_hybridloss_biascal"`. |
| `dataset_version` | `str` | Bộ dữ liệu gốc dùng để huấn luyện (`"parquet_h3_world_v2"`). |
| `created_at` | `str` | Thời điểm đóng gói bản `.joblib` standalone (`YYYYMMDD_HHMMSS`). |
| `feature_count` | `int` | Số chiều đặc trưng đầu vào bắt buộc của ma trận `X`, cố định `57`. |
| `ensemble_members` | `list[str]` | Danh sách 7 mô hình thành phần theo đúng thứ tự chỉ mục `0..6`. |
| `prior_enc` | `dict` | Bộ từ điển lịch sử sai số không gian/vùng (Empirical Bayes) và nhiệt độ nền `T_bg` học strictly trên tập Train. |
| `multitask` | `dict \| None` | Artifact của mạng `Multi-Task Physics Net` dùng chung cho cả 3 kênh (sẽ là `None` nếu cả 3 kênh đều có trọng số thành phần thứ 7 bằng `0` và bật cắt tỉa). |
| `models` | `dict` | Chứa trọng số, mô hình con, EQM và tail calibrator riêng cho từng kênh (`"bright_mir"`, `"bright_tir"`, `"frp_log1p"`). |
| `test_metrics` | `dict` | Bảng điểm đánh giá thực tế trên tập Test `2023–2025` trích từ `ml_v2_model_comparison.csv`. |

---

## 3. Giải thích Chi tiết Từng Thông số Nội bộ của Model

### 3.1. Bộ mã hóa Không gian & Nhiệt độ nền `prior_enc`

Để tránh rò rỉ dữ liệu (`Zero Leakage`), các đặc trưng lịch sử trong `prior_enc` được ước lượng bằng **5-fold Out-Of-Fold Empirical Bayes** trên tập Train đối với phần dư giữa VIIRS và MODIS:
* $r_{\text{mir}} = \text{clip}(v_{\text{mir}}, 200, 367) - m_{\text{mir}}$
* $r_{\text{tir}} = \text{clip}(v_{\text{tir}}, 180, 425) - m_{\text{tir}}$
* $r_{\text{frp}} = \log(1 + \text{clip}(v_{\text{frp}}, 0, 55000)) - \log(1 + m_{\text{frp}})$

Công thức co Empirical Bayes cho một nhóm có $n_g$ mẫu và tổng phần dư $\sum r$ với độ làm mượt $m$ là:
$$\hat{r}_g = \frac{\sum_{i \in g} r_i + m \cdot \bar{r}_{\text{global}}}{n_g + m}$$

Ý nghĩa từng khóa bên trong `prior_enc`:
* **`n_rows`, `sig`:** Số dòng và chữ ký biên của tập Train (`(mir[0], mir[-1], tir[0], tir[-1])`). Dùng để nhận diện chế độ OOF khi huấn luyện; khi suy luận độc lập (`is_oof=False`), bộ mã hóa sẽ luôn tra bảng đầy đủ.
* **Cấp 1 — Ô lục giác `h3_res7` (`m = 10.0`):**
  * `h3_map`: `dict` ánh xạ chuỗi `h3_res7` sang chỉ số hàng.
  * `h3_vals`: `np.ndarray` shape `(N_h3, 4)` lưu 4 giá trị `[h3_res_mir, h3_res_tir, h3_res_frp_log, log1p(count)]`.
  * `h3_def`: vector mặc định shape `(4,)` bằng `[g_mir, g_tir, g_frp, 0.0]` dùng khi gặp ô `h3_res7` mới chưa từng xuất hiện trong Train.
* **Cấp 2 — Lưới `0.5° × 0.5° × Ngày/Đêm` (`m = 25.0`):**
  * `g05_map`, `g05_vals` shape `(N_g05, 3)`, `g05_def` shape `(3,)`: Khóa số nguyên 64-bit đóng gói bởi `_pack_g05_keys(lat, lon, day)` để bù nếu ô `h3_res7` bị mới hoặc thưa dữ liệu.
* **Cấp 3 — Nhóm `Quốc gia | Loại cháy | Ngày/Đêm` (`m = 30.0`):**
  * `ctd_map`, `ctd_vals` shape `(N_ctd, 3)`, `ctd_def` shape `(3,)`: Khóa chuỗi `"<country>|<type>|<daynight>"` phản ánh đặc trưng sinh khối / chế độ cháy từng quốc gia.
* **Nhiệt độ nền $T_{\text{bg}}$ (phân vị 25 của `bright_tir`):**
  * `tbg_cell_map`: Tra cứu theo khóa bit-pack ô `1° × 1° × Quý × Ngày/Đêm` (`_pack_tbg_keys`).
  * `tbg_band_map`: Dự phòng cấp 2 theo dải vĩ độ `5° × Quý × Ngày/Đêm`.
  * `tbg_global`: Dự phòng toàn cầu (phân vị 25 toàn tập Train) khi hai bảng trên đều miss.

### 3.2. Cấu hình từng kênh mục tiêu trong `models[<target_key>]`

Ba khóa hợp lệ của `bundle["models"]` là `"bright_mir"`, `"bright_tir"`, `"frp_log1p"`. Trong mỗi kênh có các thông số:

1. **`tgt_idx` (`int`):** Chỉ mục đầu ra tương ứng trong `Multi-Task Physics Net`: `0` (`bright_mir`), `1` (`bright_tir`), `2` (`frp_log1p`).
2. **`active_members` (`list[bool]` độ dài 7):** Đánh dấu các mô hình thành phần thực sự tham gia suy luận sau khi cắt tỉa (`PRUNE_ZERO_WEIGHT_MEMBERS = True`). Một mô hình chỉ được đánh dấu `True` nếu `|weights[i]| > 1e-12` hoặc tồn tại ít nhất một regime trong `regime_weights[:, i]` có giá trị tuyệt đối `> 1e-12`. Nếu `False`, mô hình con tương ứng được đặt bằng `None` để giảm dung lượng `.joblib` và bỏ qua bước chạy predict thừa.
3. **`xgb` (`StandardizedXGBRegressor | None`):** Lớp bọc `xgb.XGBRegressor` với 3 thuộc tính:
   * `model`: cây quyết định `XGBRegressor` train trên mục tiêu chuẩn hóa Z-score.
   * `y_mean`, `y_std`: trung bình và độ lệch chuẩn của `y_train`; kết quả dự đoán được giải chuẩn hóa bằng `pred * y_std + y_mean`.
4. **`catboost` (`CatBoostRegressor | None`):** Mô hình gradient boosting đối xứng `CatBoostRegressor`.
5. **`dl_arts` (`dict`):** Chứa artifact của 4 mô hình PyTorch (`"PyTorch ResNet-MLP"`, `"FT-Transformer"`, `"PLR-RealMLP"`, `"Attentive TabNet"`), mỗi artifact là một `dict` (hoặc `None` nếu bị cắt tỉa) gồm:
   * `arch`: tên kiến trúc (`"resnet"`, `"ft_transformer"`, `"plr_realmlp"`, `"tabnet"`, `"multitask"`).
   * `in_dim` (`57`), `cont_dim` (`16`), `out_dim` (`1` hoặc `3` với `multitask`).
   * `state_dict`: trọng số CPU PyTorch đã áp dụng **SWA (Stochastic Weight Averaging)** trên 6 epoch cuối.
   * `scaler`: bộ chuẩn hóa `StandardScaler` cho đầu vào `X`.
   * `y_mean`, `y_std`: hệ số hoàn nguyên thang đo đầu ra.
6. **`weights` (`np.ndarray`, shape `(7,)`):** Vector trọng số pha trộn toàn cục của 7 mô hình theo đúng thứ tự `ensemble_members`, thỏa mãn $w_i \ge 0$ và $\sum_{i=0}^{6} w_i = 1$. Được tìm bằng khởi tạo NNLS rồi tinh chỉnh bằng SLSQP theo hàm mất mát kết hợp $\frac{1}{2}\frac{\text{MAE}}{\sigma_y} + \frac{1}{2}\frac{\text{RMSE}}{\sigma_y}$ trên validation `2021–2022`.
7. **`regime_weights` (`np.ndarray`, shape `(4, 8)`):** Ma trận pha trộn **theo 4 chế độ vật lý** dựa trên cột `daynight` (`X[:, 15] > 0.5`) và `point_count` (`X[:, 9] > 1.5`):
   * **Hàng 0 (`Regime 0`):** Ban đêm (`N`), điểm đơn (`point_count <= 1`).
   * **Hàng 1 (`Regime 1`):** Ban đêm (`N`), đa điểm (`point_count >= 2`).
   * **Hàng 2 (`Regime 2`):** Ban ngày (`D`), điểm đơn (`point_count <= 1`).
   * **Hàng 3 (`Regime 3`):** Ban ngày (`D`), đa điểm (`point_count >= 2`).
   * **Cột `0..6`:** Trọng số pha trộn 7 mô hình cho regime tương ứng (nếu regime có $\ge 500$ mẫu validation thì co Empirical Bayes $w_{\text{shrunk}} = 0.7 w_r + 0.3 w_{\text{global}}$ và chỉ giữ lại nếu cải thiện loss so với $w_{\text{global}}$).
   * **Cột `7` (`bias_offset` $b_r$):** Độ lệch cộng (additive bias term) gắn thêm sau tổng có trọng số:
     $$\hat{y}_{\text{ens}}(x) = \sum_{k=0}^{6} W_{r(x), k}\,\hat{y}_k(x) + W_{r(x), 7}$$
8. **`is_log`, `clip_lo`, `clip_hi`:** Cờ chỉ định kênh có ở thang `log1p` hay không (`True` chỉ với `frp_log1p`) và ngưỡng chặn vật lý tối thiểu/tối đa.

### 3.3. Bộ hiệu chỉnh phân vị thực nghiệm `eqm_map` (Empirical Quantile Mapping)

* **Mục đích:** Các mô hình hồi quy (cây + neural net) có xu hướng dự đoán co vào giá trị trung bình, làm hẹp dải cực đại (đuôi phân phối). **EQM** nắn lại hình dạng phân phối dự đoán sao cho khớp phân phối thực tế của VIIRS trên tập tham chiếu (`ref_mask`, các năm $\ge 2018$), đồng thời kiểm soát độ lệch MAE/RMSE qua hệ số trộn $\alpha$.
* **4 khóa bên trong `eqm_map`:**
  * `probs`: mảng `2001` mốc xác suất đều từ `0.0` đến `1.0` (bước `0.0005`).
  * `src_q`: `2001` phân vị của dự đoán ensemble $\hat{y}_{\text{ref}}$ trên tập tham chiếu.
  * `tgt_q`: `2001` phân vị của giá trị VIIRS thật $y_{\text{ref}}$ trên tập tham chiếu.
  * `alpha`: trọng số nội suy tối ưu trong `[0.0, 1.0]` (tìm lưới 41 điểm trên tập validation `2021–2022`).
* **Công thức biến đổi 2 bước:**
  $$p = \text{interp}(\hat{y},\, \text{src\_q},\, \text{probs}), \qquad \hat{y}_{\text{mapped}} = \text{interp}(p,\, \text{probs},\, \text{tgt\_q})$$
  $$\hat{y}_{\text{eqm}} = (1 - \alpha)\,\hat{y} + \alpha\,\hat{y}_{\text{mapped}}$$
  *(Chú ý: Ở cấu hình chuẩn v2, `bright_tir` có `eqm_map = None` vì mô hình tuyến tính/phi tuyến trên TIR vốn đã khớp biên độ tốt; EQM chỉ bật cho `bright_mir` và `frp_log1p`.)*

### 3.4. Bộ hiệu chỉnh đuôi công suất cháy `mw_cal` (`Two-Zone Tail Calibrator` cho `frp_mw`)

* **Tại sao cần `mw_cal`?** Khi huấn luyện ở không gian log (`frp_log1p`), phép biến đổi ngược ngây thơ $\text{expm1}(\hat{z}) = e^{\hat{z}} - 1$ sẽ bị **thiên lệch hụt dưới (Jensen's inequality)** trên các đám cháy công suất lớn.
* **8 khóa bên trong `mw_cal`** (chỉ có trên kênh `frp_log1p`):
  * `mode`: `"two_zone_tail"`
  * `s0`: Hệ số nhân nền toàn dải (tìm trong `[0.86, 1.15]`).
  * `tau1`: Ngưỡng vùng đuôi vừa, đặt bằng phân vị thứ **65** (`Q65`) của dự đoán log trên validation.
  * `c1`, `p1`: Biên độ và lũy thừa hiệu chỉnh vùng trên $\tau_1$ (`c1` trong `[0.0, 2.5]`, `p1` trong `[0.5, 2.5]`).
  * `tau2`: Ngưỡng vùng đuôi cực đại, đặt bằng phân vị thứ **90** (`Q90`) của dự đoán log trên validation.
  * `c2`, `p2`: Biên độ và lũy thừa tăng cường thêm cho đám cháy cực lớn vượt $\tau_2$ (`c2` trong `[0.0, 3.0]`, `p2` trong `[0.5, 2.5]`).
* **Công thức quy đổi từ $\hat{z} = \text{pred\_log}$ sang công suất $\text{MW}$:**
  $$\text{raw\_mw} = \max\left(e^{\hat{z}} - 1,\, 0\right)$$
  $$\text{mult}(\hat{z}) = s_0 + c_1 \cdot \max(0,\, \hat{z} - \tau_1)^{p_1} + c_2 \cdot \max(0,\, \hat{z} - \tau_2)^{p_2}$$
  $$\widehat{\text{FRP}}_{\text{MW}} = \text{clip}\left(\text{raw\_mw} \cdot \text{mult}(\hat{z}),\, 0.0,\, 55000.0\right)$$

---

## 4. Bảng Đặc tả 57 Đặc trưng Đầu vào (`feature_count = 57`) & Cột MODIS Nguồn

### 4.1. Các cột cần chuẩn bị trong DataFrame MODIS đầu vào

Hàm `build_feature_matrix_v2` đọc trực tiếp từ `pd.DataFrame` bằng `_safe_series_float`, tự động điền giá trị dự phòng nếu thiếu cột (nhưng để dự đoán chính xác tối đa, nên cung cấp đủ các cột chuẩn v2):

| Nhóm cột | Tên cột trong DataFrame MODIS | Giá trị dự phòng nếu thiếu / NaN |
| :--- | :--- | :--- |
| **Bắt buộc / chính** | `h3_res7`, `acq_date`, `daynight`, `country`, `type`, `center_lat`, `center_lon` | `country="UNK"`, `type=-1`, `lat/lon=0.0` |
| **Tín hiệu bức xạ MODIS** | `bright_mir`, `bright_tir`, `frp` | Tự động fallback sang `bright_mir_all_p50_k` (`315.0`), `bright_tir_all_p50_k` (`295.0`), `frp_sum_all_mw` (`0.0`) |
| **Đếm điểm & tin cậy** | `point_count`, `conf_l`, `conf_h`, `conf_modis_mean` | `point_count=1.0`, `conf_l=0.0`, `conf_h=0.0`, `conf_modis_mean=50.0` |
| **Hình học quét v2** | `scan_p50_km`, `track_p50_km`, `pixel_area_p50_km2`, `pixel_area_p95_km2`, `cell_area_km2` | `scan=1.0`, `track=1.0`, `pix_p50=scan*track`, `pix_p95=pix_p50`, `cell_area=5.161` |
| **Phân tán & cực trị nội nhóm** | `mir_iqr_k`, `tir_iqr_k`, `bright_mir_max_all_k` | `mir_iqr_k=0.0`, `tir_iqr_k=0.0`, `bright_mir_max_all_k=bright_mir` |
| **Vệ tinh & giờ mặt trời** | `modis_platform` (hoặc `source_platform`), `obs_time_utc` | `platform="Terra"` (`is_aqua=0`); nếu thiếu `obs_time_utc` dùng cos giờ mặt trời `-0.5` (Ngày) / `0.5` (Đêm) |

### 4.2. Tra cứu chi tiết 57 chiều đặc trưng (`X` shape `(N, 57)`, `float32`)

* **Nhóm 1: `base_26` (chỉ mục `0..25` — Vật lý cơ bản, Độ tin cậy & Thời-Không gian cầu)**
  * `0`: `mir` — Độ sáng MIR của MODIS (`clip [180, 550]` K)
  * `1`: `tir` — Độ sáng TIR của MODIS (`clip [150, 450]` K)
  * `2`: `mir_tir_diff` — Chênh nhiệt độ sáng giữa lửa và nền xung quanh (`mir - tir`)
  * `3`: `mir_tir_ratio` — Tỷ lệ `mir / max(tir, 180.0)`
  * `4`: `mir4_tir4` — Độ chênh bức xạ bậc 4 theo định luật Stefan-Boltzmann: `(mir/300)^4 - (tir/300)^4`
  * `5`: `day_mir_tir` — Tương tác Ngày/Đêm và độ tương phản nhiệt: `day * (mir - tir)`
  * `6`: `log1p(frp)` — Logarit công suất bức xạ MODIS
  * `7`: `frp_per_pt` — Công suất trung bình mỗi pixel phát hiện (`frp / pts`)
  * `8`: `log1p(frp_per_pt)` — Logarit công suất trung bình mỗi pixel
  * `9`: `pts` — Số điểm cháy MODIS trong ô (`max(point_count, 1.0)`). *Dùng để phân chia `Regime` (`> 1.5` = đa điểm)*
  * `10`: `log1p(pts)` — Logarit số điểm cháy
  * `11`: `cl` — Số điểm độ tin cậy thấp (`conf_l`)
  * `12`: `ch` — Số điểm độ tin cậy cao (`conf_h`)
  * `13`: `ch / pts` — Tỷ lệ điểm độ tin cậy cao
  * `14`: `cl / pts` — Tỷ lệ điểm độ tin cậy thấp
  * `15`: `day` — Cờ ban ngày (`1.0` nếu `daynight == "D"`, ngược lại `0.0`). *Dùng để phân chia `Regime` (`> 0.5` = ban ngày)*
  * `16`: `is_type_0` — Loại cháy `0` (thảm thực vật / cháy rừng)
  * `17`: `is_type_1` — Loại cháy `1` (núi lửa)
  * `18`: `is_type_2` — Loại cháy `2` (nguồn tĩnh trên đất liền)
  * `19`: `is_type_3` — Loại cháy `3` (ngoài khơi / khác)
  * `20`: `abs_lat` — Trị tuyệt đối vĩ độ `|center_lat|`
  * `21`: `sin(lat_rad)` — Tọa độ cầu Z
  * `22`: `cos(lat_rad) * sin(lon_rad)` — Tọa độ cầu Y
  * `23`: `cos(lat_rad) * cos(lon_rad)` — Tọa độ cầu X
  * `24`: `sin(2*pi*doy / 365.25)` — Chu kỳ mùa vụ (sin ngày trong năm)
  * `25`: `cos(2*pi*doy / 365.25)` — Chu kỳ mùa vụ (cos ngày trong năm)

* **Nhóm 2: `spatial_12` (chỉ mục `26..37` — Lịch sử sai số vùng Empirical Bayes & Độ lệch nhiệt nền)**
  * `26..29`: `h3_res_mir`, `h3_res_tir`, `h3_res_frp_log`, `h3_log1p_count` — Lịch sử độ lệch trung bình theo ô `h3_res7` (`m=10`) và mật độ xuất hiện ô
  * `30..32`: `g05_res_mir`, `g05_res_tir`, `g05_res_frp_log` — Lịch sử độ lệch theo lưới `0.5° x Ngày/Đêm` (`m=25`)
  * `33..35`: `ctd_res_mir`, `ctd_res_tir`, `ctd_res_frp_log` — Lịch sử độ lệch theo `country|type|daynight` (`m=30`)
  * `36`: `d_mir_bg` — Độ trội MIR so với nhiệt độ nền bề mặt (`mir - T_bg`)
  * `37`: `d_tir_bg` — Độ trội TIR so với nhiệt độ nền bề mặt (`tir - T_bg`)

* **Nhóm 3: `extra_6` (chỉ mục `38..43` — Bão hòa cảm biến & Diện tích bức xạ Wooster)**
  * `38`: `mir_cap367` — Giá trị MIR bị cắt trần tại `367.0 K` (mô phỏng ngưỡng bão hòa kênh I4 của VIIRS)
  * `39`: `mir_exc367` — Phần năng lượng MIR MODIS vượt ngưỡng `367.0 K` (`max(mir - 367.0, 0.0)`)
  * `40`: `wooster_area` — Ước lượng diện tích đám cháy hiệu dụng kiểu Wooster (`clip(frp / max((mir/300)^4 - (T_bg/300)^4, 0.05), 0, 1e6)`)
  * `41`: `log1p(wooster_area)` — Logarit diện tích Wooster
  * `42`: `dt_bg_ratio` — Tỷ số độ trội nhiệt MIR/TIR so với nền (`clip(d_mir_bg / max(d_tir_bg, 1.0), -50, 200)`)
  * `43`: `conf_net` — Chỉ số tin cậy ròng `(conf_h - conf_l) / pts`

* **Nhóm 4: `v2_13` (chỉ mục `44..56` — Hình học quét, Phân tán nội nhóm & Chu kỳ mặt trời)**
  * `44`: `scan_km` — Bề rộng pixel theo hướng quét (`scan_p50_km`, `[0.25, 10.0]`)
  * `45`: `track_km` — Chiều dài pixel theo hướng quỹ đạo (`track_p50_km`, `[0.25, 10.0]`)
  * `46`: `pix_area_p50` — Diện tích pixel trung vị (`pixel_area_p50_km2`, `[0.1, 50.0]`)
  * `47`: `pix_area_p95` — Diện tích pixel phân vị 95 (`pixel_area_p95_km2`, `[0.1, 60.0]`)
  * `48`: `scan_track_ratio` — Độ méo hình bowtie ở rìa quét (`scan_km / max(track_km, 0.25)`)
  * `49`: `pixel_to_cell_ratio` — Tỷ lệ diện tích pixel MODIS so với diện tích ô lục giác `H3 res7` (`cell_area_km2`)
  * `50`: `log1p_frp_per_px_km2` — Mật độ công suất cháy trên mỗi `km²` diện tích pixel (`log1p(frp / max(pix_area_p50, 0.25))`)
  * `51`: `mir_iqr` — Độ trải giữa Q75–Q25 của MIR trong ô (`mir_iqr_k`, `[0, 200]`)
  * `52`: `tir_iqr` — Độ trải giữa Q75–Q25 của TIR trong ô (`tir_iqr_k`, `[0, 150]`)
  * `53`: `mir_max_minus_p50` — Độ lệch giữa cực đại MIR và trung vị MIR trong ô (`bright_mir_max_all_k - mir`)
  * `54`: `conf_modis_norm` — Độ tin cậy MODIS trung bình chuẩn hóa về `[0, 1]` (`conf_modis_mean / 100.0`)
  * `55`: `is_aqua` — Vệ tinh nguồn MODIS (`1.0` nếu `"aqua"`, `0.0` nếu `"Terra"`)
  * `56`: `cos_solar_hr` — Cos của giờ mặt trời địa phương (`local_hr = (utc_hr + lon/15) % 24`)

---

## 5. Kiến trúc & Siêu tham số của 7 Mô hình Thành phần

Các mô hình được xếp theo đúng thứ tự `ENSEMBLE_MEMBERS` (`0..6`):

| Chỉ mục | Tên thành phần | Kiến trúc & Thông số huấn luyện chính |
| :--- | :--- | :--- |
| `0` | **`XGBoost CUDA GPU`** | Bọc `StandardizedXGBRegressor`; `n_estimators=1800`, `max_depth=8`, `max_bin=512`, `learning_rate=0.025`, `min_child_weight=40`, `subsample=0.85`, `colsample_bytree=0.80`, `reg_alpha=2.0`, `reg_lambda=8.0`, loss `reg:pseudohubererror` (`huber_slope=1.15`), `tree_method="hist"`, `device="cuda"`. |
| `1` | **`CatBoost GPU`** | `CatBoostRegressor`; `iterations=2400`, `depth=8`, `learning_rate=0.035`, `l2_leaf_reg=7.0`, `border_count=254`, `loss_function="RMSE"`, `task_type="GPU"`. |
| `2` | **`PyTorch ResNet-MLP`** | `TabularResNetMLP`: `in_dim=57`, `hidden_dim=256`, 2 `ResidualBlock` (`LayerNorm`, `SiLU`, `Dropout(0.1)`), nhánh `highway` tuyến tính; `28 epochs`, `bs=3072`, `lr=3e-3`. |
| `3` | **`FT-Transformer`** | `FTTransformer`: Feature Tokenizer ánh xạ mỗi đặc trưng thành token `d_token=64` + `[CLS]`, 2 tầng Transformer (`n_heads=4`, `dim_feedforward=128`, `GELU`, `dropout=0.1`, `norm_first=True`); `20 epochs`, `bs=2048`, `lr=1.5e-3`. |
| `4` | **`PLR-RealMLP`** | `PLRRealMLP`: Mã hóa Fourier tuần hoàn `Periodic Linear Representations` trên `16` đặc trưng đầu (`n_freqs=16` -> `sin`/`cos` mở rộng lên `569` chiều) + 2 `ResidualBlock` (`hidden_dim=256`) + `highway`; `28 epochs`, `bs=3072`, `lr=3e-3`. |
| `5` | **`Attentive TabNet`** | `AttentiveTabNet`: `hidden_dim=128`, `n_steps=3`, khối `GLU` chia sẻ & chọn lọc đặc trưng tuần tự qua mặt nạ chú ý `softmax` nhân hệ số suy giảm `prior = prior * (1.2 - mask).clamp(min=0.05)`; `28 epochs`, `bs=3072`, `lr=3e-3`. |
| `6` | **`Multi-Task Physics Net`** | Kiến trúc `PLRRealMLP` mở rộng (`hidden_dim=320`, `n_freqs=16`, `cont_dim=16`, `highway`), `out_dim=3` học đồng thời cả 3 kênh `[bright_mir, bright_tir, frp_log1p]`; `30 epochs`, `bs=3072`, `lr=3e-3`. |

> **Chế độ tối ưu PyTorch chung:** Cả 5 kiến trúc PyTorch đều tối ưu hàm mục tiêu lai **`0.55 * HuberLoss(delta=1.0) + 0.45 * MSELoss()`**, sử dụng `AdamW(weight_decay=1.5e-4)`, lịch trình `OneCycleLR(pct_start=0.1)`, cắt gradient `1.0`, và lấy trung bình trọng số **SWA 6 epochs cuối**.

---

## 6. Ý nghĩa & Kết quả Thực tế trong `test_metrics` (`Test 2023–2025`, `n = 276,903`)

### 6.1. Giải thích các trường chỉ số
* `mae` / `rmse`: Sai số tuyệt đối trung bình và căn sai số bình phương trung bình (càng nhỏ càng tốt).
* `wmape_pct`: Sai số phần trăm có trọng số $\frac{\sum |\hat{y} - y|}{\sum |y|} \times 100\%$ (càng nhỏ càng tốt).
* `mae_imp_pct` / `rmse_imp_pct`: Phần trăm giảm sai số MAE / RMSE so với giữ nguyên MODIS gốc (`Uncalibrated MODIS (Identity)`).
* `r2`: Hệ số xác định $R^2$ (gần `1.0` là tốt; số âm nghĩa là MODIS gốc lệch quá nặng so với VIIRS).
* `bias_pct`: Độ lệch tổng có dấu $\frac{\sum \hat{y} - \sum y}{\sum |y|} \times 100\%$ (`+` là đoán cao hơn VIIRS thật, `-` là đoán thấp hơn).
* `true_med`, `pred_med`, `modis_med`: Trung vị (`P50`) của VIIRS thật, dự đoán của model, và MODIS gốc.
* `true_p90`, `pred_p90`: Phân vị 90 (`P90`) — phản ánh khả năng giữ độ lớn ở các đám cháy cường độ cao.

### 6.2. Kết quả đối chiếu từ `ml_v2_model_comparison.csv`

| Kênh (`target`) | Đơn vị | Mô hình đánh giá | MAE | RMSE | WMAPE (%) | Giảm MAE (%) | Giảm RMSE (%) | $R^2$ | Bias (%) | Trung vị (Thật / Dự đoán / MODIS) | P90 (Thật / Dự đoán) |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`bright_mir`** | `K` | MODIS gốc (Identity) | `19.086` | `22.758` | `5.56` | `0.00` | `0.00` | `-2.4617` | `-4.25` | `343.28 / 325.5 / 325.5` | `356.82 / 348.3` |
| **`bright_mir`** | `K` | **`GPU Ensemble + EQM`** | **`7.091`** | **`9.317`** | **`2.07`** | **`+62.85%`** | **`+59.06%`** | **`0.4199`** | **`-0.19`** | `343.28 / 343.93 / 325.5` | `356.82 / 349.23` |
| **`bright_tir`** | `K` | MODIS gốc (Identity) | `4.543` | `6.270` | `1.52` | `0.00` | `0.00` | `0.5269` | `0.53` | `300.16 / 302.0 / 302.0` | `310.59 / 311.5` |
| **`bright_tir`** | `K` | **`Weighted GPU Ensemble`** | **`3.393`** | **`4.850`** | **`1.13`** | **`+25.30%`** | **`+22.64%`** | **`0.7169`** | **`0.25`** | `300.16 / 301.18 / 302.0` | `310.59 / 309.89` |
| **`frp_log1p`** | `log1p(MW)` | MODIS gốc (Identity) | `0.822` | `1.070` | `25.67` | `0.00` | `0.00` | `0.1623` | `14.53` | `3.07 / 3.5 / 3.5` | `4.8 / 5.17` |
| **`frp_log1p`** | `log1p(MW)` | **`GPU Ensemble + EQM`** | **`0.680`** | **`0.866`** | **`21.24`** | **`+17.26%`** | **`+19.08%`** | **`0.4514`** | **`2.33`** | `3.07 / 3.13 / 3.5` | `4.8 / 4.43` |
| **`frp_mw`** | `MW` | MODIS gốc (Identity) | `60.326` | `216.237` | `109.21` | `0.00` | `0.00` | `-1.9178` | `61.50` | `20.51 / 32.2 / 32.2` | `120.43 / 175.5` |
| **`frp_mw`** | `MW` | **`GPU Ensemble + EQM`** | **`35.699`** | **`95.667`** | **`64.63`** | **`+40.82%`** | **`+55.76%`** | **`0.4289`** | **`-16.38`** | `20.51 / 24.51 / 32.2` | `120.43 / 92.97` |

> **Lưu ý quan trọng:** Khi kiểm tra `bundle["test_metrics"]["bright_tir"]`, trường `model` sẽ mang tên `"Weighted GPU Ensemble"` và `bundle["models"]["bright_tir"]["eqm_map"]` là `None`, vì kênh `bright_tir` được cấu hình `use_eqm = False` (tắt EQM) trong khi hai kênh `bright_mir` và `frp_log1p` bật EQM.

---

## 7. Đặc tả Schema 25 Cột của Bộ Dữ liệu `.parquet` trong `harmonize_final`

Mỗi file `{year}.parquet` (`2000.parquet .. 2025.parquet`) được nén chuẩn `ZSTD` (`ROW_GROUP_SIZE 100000`) gồm đúng **25 cột** thống nhất:

| STT | Tên cột | Kiểu DuckDB / Parquet | Ý nghĩa |
| :---: | :--- | :--- | :--- |
| 1 | `observation_window_id` | `VARCHAR` | Khóa định danh duy nhất cửa sổ quan sát (`h3_res7 + ngày + ca + type + recipe + policy`). |
| 2 | `h3_res7` | `VARCHAR` | Chỉ số ô lưới lục giác H3 bậc 7 (~5.161 km²). |
| 3 | `acq_date` | `DATE` | Ngày thu nhận ảnh vệ tinh (`YYYY-MM-DD`). |
| 4 | `year` | `SMALLINT` | Năm quan sát (`2000..2025`). |
| 5 | `daynight` | `VARCHAR` | Ca quan sát: `"D"` (Ngày) hoặc `"N"` (Đêm). |
| 6 | `country` | `VARCHAR` | Tên / mã quốc gia. |
| 7 | `type` | `TINYINT` | Loại điểm nóng (`0`: thảm thực vật, `1`: núi lửa, `2`: nguồn tĩnh, `3`: ngoài khơi/khác). |
| 8 | `center_lat` | `DOUBLE` | Vĩ độ tâm ô H3 (độ thập phân). |
| 9 | `center_lon` | `DOUBLE` | Kinh độ tâm ô H3 (độ thập phân). |
| 10 | `obs_time_utc` | `TIMESTAMPTZ` | Thời điểm quan sát UTC. |
| 11 | `source_platform` | `VARCHAR` | Vệ tinh gốc (`Terra`, `Aqua`, `S-NPP`, `NOAA-20`...). |
| 12 | `record_origin` | `VARCHAR` | Nguồn dữ liệu: `"OBSERVED_VIIRS"` (đo trực tiếp) hoặc `"MODIS_ESTIMATED_VIIRS_LIKE"` (AI quy đổi từ MODIS). |
| 13 | `model_version` | `VARCHAR` | `"OBSERVED"` với dòng VIIRS gốc; **`"GPU_Ensemble_EQM"`** với dòng quy đổi bằng model này. |
| 14 | `bright_mir` | `FLOAT` | Nhiệt độ sáng MIR đã chuẩn hóa VIIRS (`K`, chặn `[0.0, 367.0]`). |
| 15 | `bright_tir` | `FLOAT` | Nhiệt độ sáng TIR đã chuẩn hóa VIIRS (`K`, `>= 0.0`). |
| 16 | `frp` | `FLOAT` | Công suất bức xạ lửa FRP đã chuẩn hóa VIIRS (`MW`, `>= 0.0`). |
| 17 | `raw_modis_mir_k` | `FLOAT` | Giá trị MIR MODIS gốc trước quy đổi (`NULL` nếu là dòng `OBSERVED_VIIRS`). |
| 18 | `raw_modis_tir_k` | `FLOAT` | Giá trị TIR MODIS gốc trước quy đổi (`NULL` nếu là dòng `OBSERVED_VIIRS`). |
| 19 | `raw_modis_frp_mw` | `FLOAT` | Giá trị FRP MODIS gốc trước quy đổi (`NULL` nếu là dòng `OBSERVED_VIIRS`). |
| 20 | `point_count` | `INTEGER` | Số điểm hotspot thành phần trong cửa sổ quan sát. |
| 21 | `conf_l` | `INTEGER` | Số điểm mức tin cậy thấp (Low). |
| 22 | `conf_n` | `INTEGER` | Số điểm mức tin cậy trung bình (Nominal). |
| 23 | `conf_h` | `INTEGER` | Số điểm mức tin cậy cao (High). |
| 24 | `confidence` | `VARCHAR` | Nhãn tin cậy tổng hợp gốc. |
| 25 | `conf_tier` | `VARCHAR` | Phân tầng mức tin cậy chuẩn hóa (`low` / `nominal` / `high`). |

---

## 8. Code Mẫu Python Độc lập (Tự động Chạy trên cả GPU lẫn CPU)

Khi giao file `gpu_ensemble_eqm_v2.joblib` cho người khác sử dụng ở backend hoặc notebook mới, `joblib.load()` cần nhìn thấy định nghĩa lớp **`StandardizedXGBRegressor`** (vì lớp này được pickle từ `__main__` của notebook huấn luyện).

Đoạn mã dưới đây đã định nghĩa đầy đủ lớp bọc, kiến trúc PyTorch, bộ tạo 57 đặc trưng, bộ tự chuyển XGBoost/PyTorch sang **CPU** nếu máy người nhận không có GPU NVIDIA, cùng hàm kiểm tra toàn bộ thông số trong `.joblib`:

```python
import contextlib
import sys
import warnings

import joblib
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import xgboost as xgb


# ==============================================================================
# 1. CÁC LỚP MODEL BẮT BUỘC ĐỂ UNPICKLE & KHỞI TẠO KIẾN TRÚC PYTORCH
# ==============================================================================
class StandardizedXGBRegressor:
    def __init__(self, **kwargs):
        self.model = xgb.XGBRegressor(**kwargs)
        self.y_mean = 0.0
        self.y_std = 1.0

    def predict(self, X: np.ndarray) -> np.ndarray:
        return self.model.predict(X).astype(np.float64) * self.y_std + self.y_mean


class ResidualBlock(nn.Module):
    def __init__(self, dim: int, dropout: float = 0.1):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(dim, dim), nn.LayerNorm(dim), nn.SiLU(), nn.Dropout(dropout),
            nn.Linear(dim, dim), nn.LayerNorm(dim),
        )
        self.act = nn.SiLU()

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.act(x + self.net(x))


class TabularResNetMLP(nn.Module):
    def __init__(self, in_dim: int = 57, hidden_dim: int = 256, out_dim: int = 1, use_highway: bool = True):
        super().__init__()
        self.stem = nn.Sequential(nn.Linear(in_dim, hidden_dim), nn.LayerNorm(hidden_dim), nn.SiLU())
        self.block1 = ResidualBlock(hidden_dim, dropout=0.1)
        self.block2 = ResidualBlock(hidden_dim, dropout=0.1)
        self.head = nn.Linear(hidden_dim, out_dim)
        self.highway = nn.Linear(in_dim, out_dim) if use_highway else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = self.head(self.block2(self.block1(self.stem(x))))
        return out + self.highway(x) if self.highway is not None else out


class FTTransformer(nn.Module):
    def __init__(self, in_dim: int = 57, d_token: int = 64, n_heads: int = 4, n_layers: int = 2, out_dim: int = 1):
        super().__init__()
        self.weight = nn.Parameter(torch.randn(in_dim, d_token) * 0.02)
        self.bias = nn.Parameter(torch.zeros(in_dim, d_token))
        self.cls_token = nn.Parameter(torch.randn(1, 1, d_token) * 0.02)
        enc_layer = nn.TransformerEncoderLayer(
            d_model=d_token, nhead=n_heads, dim_feedforward=d_token * 2,
            dropout=0.1, activation="gelu", batch_first=True, norm_first=True,
        )
        self.encoder = nn.TransformerEncoder(enc_layer, num_layers=n_layers, enable_nested_tensor=False)
        self.head = nn.Sequential(nn.LayerNorm(d_token), nn.SiLU(), nn.Linear(d_token, out_dim))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        tokens = x.unsqueeze(-1) * self.weight.unsqueeze(0) + self.bias.unsqueeze(0)
        cls = self.cls_token.expand(x.size(0), -1, -1)
        h = self.encoder(torch.cat([cls, tokens], dim=1))[:, 0, :]
        return self.head(h)


class PLRRealMLP(nn.Module):
    def __init__(self, in_dim: int = 57, n_freqs: int = 16, hidden_dim: int = 256, out_dim: int = 1, cont_dim: int = 16, use_highway: bool = True):
        super().__init__()
        self.cont_dim = min(int(cont_dim), int(in_dim))
        self.freqs = nn.Parameter(torch.randn(self.cont_dim, n_freqs) * 0.5)
        emb_dim = self.cont_dim * n_freqs * 2 + in_dim
        self.stem = nn.Sequential(nn.Linear(emb_dim, hidden_dim), nn.LayerNorm(hidden_dim), nn.SiLU())
        self.block1 = ResidualBlock(hidden_dim, dropout=0.1)
        self.block2 = ResidualBlock(hidden_dim, dropout=0.1)
        self.head = nn.Linear(hidden_dim, out_dim)
        self.highway = nn.Linear(in_dim, out_dim) if use_highway else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        ang = 2.0 * np.pi * x[:, :self.cont_dim].unsqueeze(-1) * self.freqs.unsqueeze(0)
        plr = torch.cat([x, torch.sin(ang).flatten(1), torch.cos(ang).flatten(1)], dim=1)
        out = self.head(self.block2(self.block1(self.stem(plr))))
        return out + self.highway(x) if self.highway is not None else out


class AttentiveTabNet(nn.Module):
    def __init__(self, in_dim: int = 57, hidden_dim: int = 128, n_steps: int = 3, out_dim: int = 1):
        super().__init__()
        self.n_steps = n_steps
        self.stem = nn.Sequential(nn.Linear(in_dim, hidden_dim), nn.LayerNorm(hidden_dim), nn.SiLU())
        self.shared = nn.Sequential(nn.Linear(in_dim, hidden_dim * 2), nn.LayerNorm(hidden_dim * 2), nn.GLU())
        self.step_layers = nn.ModuleList([
            nn.Sequential(nn.Linear(hidden_dim, hidden_dim * 2), nn.LayerNorm(hidden_dim * 2), nn.GLU())
            for _ in range(n_steps)
        ])
        self.attn_layers = nn.ModuleList([nn.Linear(hidden_dim, in_dim) for _ in range(n_steps)])
        self.head = nn.Linear(hidden_dim, out_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        prior = torch.ones_like(x)
        h_prev = self.shared(x)
        agg = self.stem(x)
        for step in range(self.n_steps):
            mask = torch.softmax(self.attn_layers[step](h_prev) * prior, dim=-1)
            prior = prior * (1.2 - mask).clamp(min=0.05)
            h_step = self.step_layers[step](self.shared(x * mask))
            agg = agg + torch.relu(h_step)
            h_prev = h_step
        return self.head(agg)


DL_MODELS = [
    ("PyTorch ResNet-MLP", "resnet", 28),
    ("FT-Transformer", "ft_transformer", 20),
    ("PLR-RealMLP", "plr_realmlp", 28),
    ("Attentive TabNet", "tabnet", 28),
]


def build_torch_arch(arch: str, in_dim: int = 57, out_dim: int = 1, cont_dim: int = 16, use_highway: bool = True) -> nn.Module:
    if arch == "resnet":
        return TabularResNetMLP(in_dim=in_dim, hidden_dim=256, out_dim=out_dim, use_highway=use_highway)
    if arch == "ft_transformer":
        return FTTransformer(in_dim=in_dim, d_token=64, n_heads=4, n_layers=2, out_dim=out_dim)
    if arch == "plr_realmlp":
        return PLRRealMLP(in_dim=in_dim, n_freqs=16, hidden_dim=256, out_dim=out_dim, cont_dim=cont_dim, use_highway=use_highway)
    if arch == "tabnet":
        return AttentiveTabNet(in_dim=in_dim, hidden_dim=128, n_steps=3, out_dim=out_dim)
    if arch == "multitask":
        return PLRRealMLP(in_dim=in_dim, n_freqs=16, hidden_dim=320, out_dim=out_dim, cont_dim=cont_dim, use_highway=use_highway)
    raise ValueError(f"Unknown arch: {arch}")


# ==============================================================================
# 2. HÀM TẠO 57 ĐẶC TRƯNG ĐẦU VÀO & HẬU XỬ LÝ (ENSEMBLE / EQM / TWO-ZONE)
# ==============================================================================
def _safe_series_float(df: pd.DataFrame, col: str, default_val: float | np.ndarray) -> np.ndarray:
    if col in df.columns:
        arr = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=np.float64)
    else:
        arr = np.full(len(df), np.nan, dtype=np.float64)
    if np.ndim(default_val) == 0:
        return np.where(np.isfinite(arr), arr, float(default_val))
    return np.where(np.isfinite(arr), arr, np.asarray(default_val, dtype=np.float64))


def _pack_g05_keys(lat: np.ndarray, lon: np.ndarray, day: np.ndarray) -> np.ndarray:
    lat_05 = np.clip(np.round(lat * 2.0).astype(np.int64), -360, 360) + 500
    lon_05 = np.clip(np.round(lon * 2.0).astype(np.int64), -720, 720) + 800
    return (lat_05 << 20) | (lon_05 << 4) | day.astype(np.int64)


def _pack_tbg_keys(lat: np.ndarray, lon: np.ndarray, dt_series: pd.Series, day: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    lat_1 = np.clip(np.round(lat).astype(np.int64), -90, 90) + 200
    lon_1 = np.clip(np.round(lon).astype(np.int64), -180, 180) + 400
    quarter = ((dt_series.dt.month.to_numpy(dtype=np.int64) - 1) // 3) & 3
    d = day.astype(np.int64)
    k_cell = (lat_1 << 20) | (lon_1 << 6) | (quarter << 2) | d
    lat_band = np.clip(np.round(lat / 5.0).astype(np.int64), -20, 20) + 50
    k_band = (lat_band << 6) | (quarter << 2) | d
    return k_cell, k_band


def _lookup_group_feats(keys, idx_map: dict, vals: np.ndarray, default_vec: np.ndarray) -> np.ndarray:
    idx = pd.Series(keys).map(idx_map).fillna(-1).to_numpy(dtype=np.int32)
    out = np.broadcast_to(default_vec, (len(idx), len(default_vec))).copy()
    hit = idx >= 0
    if np.any(hit):
        out[hit] = vals[idx[hit]]
    return out


def extract_spatial_prior_features(df: pd.DataFrame, prior_enc: dict | None) -> np.ndarray:
    n = len(df)
    mir_fb = _safe_series_float(df, "bright_mir_all_p50_k", 315.0)
    tir_fb = _safe_series_float(df, "bright_tir_all_p50_k", 295.0)
    mir = _safe_series_float(df, "bright_mir", mir_fb).astype(np.float32)
    tir = _safe_series_float(df, "bright_tir", tir_fb).astype(np.float32)
    lat = _safe_series_float(df, "center_lat", 0.0).astype(np.float32)
    lon = _safe_series_float(df, "center_lon", 0.0).astype(np.float32)
    day = (df["daynight"].astype(str).to_numpy() == "D").astype(np.int64)
    dt_series = pd.to_datetime(df["acq_date"])

    if prior_enc is None:
        tbg = np.full(n, 295.0, dtype=np.float32)
        return np.column_stack([np.zeros((n, 10), dtype=np.float32), mir - tbg, tir - tbg])

    tbg_cell_k, tbg_band_k = _pack_tbg_keys(lat, lon, dt_series, day)
    s_tbg = pd.Series(tbg_cell_k).map(prior_enc["tbg_cell_map"])
    if s_tbg.isna().any():
        s_tbg = s_tbg.fillna(pd.Series(tbg_band_k).map(prior_enc["tbg_band_map"])).fillna(prior_enc["tbg_global"])
    tbg = s_tbg.to_numpy(dtype=np.float32)
    dt_bg = np.column_stack([mir - tbg, tir - tbg]).astype(np.float32)

    h3_f = _lookup_group_feats(df["h3_res7"].astype(str).to_numpy(), prior_enc["h3_map"], prior_enc["h3_vals"], prior_enc["h3_def"])
    g05_f = _lookup_group_feats(_pack_g05_keys(lat, lon, day), prior_enc["g05_map"], prior_enc["g05_vals"], prior_enc["g05_def"])
    country_s = df["country"] if "country" in df.columns else pd.Series(["UNK"] * n, index=df.index)
    type_s = df["type"] if "type" in df.columns else pd.Series([0] * n, index=df.index)
    ctd_keys = (country_s.fillna("UNK").astype(str) + "|" + type_s.astype(str) + "|" + df["daynight"].astype(str)).to_numpy()
    ctd_f = _lookup_group_feats(ctd_keys, prior_enc["ctd_map"], prior_enc["ctd_vals"], prior_enc["ctd_def"])
    return np.hstack([h3_f, g05_f, ctd_f, dt_bg]).astype(np.float32)


def build_feature_matrix_v2(df: pd.DataFrame, prior_enc: dict | None = None) -> np.ndarray:
    pts = np.maximum(_safe_series_float(df, "point_count", 1.0), 1.0).astype(np.float32)
    mir_fb = _safe_series_float(df, "bright_mir_all_p50_k", 315.0)
    tir_fb = _safe_series_float(df, "bright_tir_all_p50_k", 295.0)
    frp_fb = _safe_series_float(df, "frp_sum_all_mw", 0.0)
    mir = np.clip(_safe_series_float(df, "bright_mir", mir_fb), 180.0, 550.0).astype(np.float32)
    tir = np.clip(_safe_series_float(df, "bright_tir", tir_fb), 150.0, 450.0).astype(np.float32)
    frp = np.maximum(_safe_series_float(df, "frp", frp_fb), 0.0).astype(np.float32)

    cl = np.maximum(_safe_series_float(df, "conf_l", 0.0), 0.0).astype(np.float32)
    ch = np.maximum(_safe_series_float(df, "conf_h", 0.0), 0.0).astype(np.float32)
    day = (df["daynight"].astype(str).to_numpy() == "D").astype(np.float32)
    tp = _safe_series_float(df, "type", -1.0).astype(np.int32)

    lat = _safe_series_float(df, "center_lat", 0.0).astype(np.float32)
    lon = _safe_series_float(df, "center_lon", 0.0).astype(np.float32)
    abs_lat, lat_rad, lon_rad = np.abs(lat), np.deg2rad(lat), np.deg2rad(lon)
    doy = pd.to_datetime(df["acq_date"]).dt.dayofyear.to_numpy(dtype=np.float32)
    doy_rad = (2.0 * np.pi / 365.25) * doy

    mir_tir_diff = mir - tir
    mir_tir_ratio = mir / np.maximum(tir, 180.0)
    mir4_tir4 = (mir / 300.0) ** 4 - (tir / 300.0) ** 4
    day_mir_tir = day * mir_tir_diff
    frp_per_pt = frp / pts

    base_26 = np.column_stack([
        mir, tir, mir_tir_diff, mir_tir_ratio, mir4_tir4, day_mir_tir,
        np.log1p(frp), frp_per_pt, np.log1p(frp_per_pt),
        pts, np.log1p(pts), cl, ch, ch / pts, cl / pts, day,
        (tp == 0).astype(np.float32), (tp == 1).astype(np.float32),
        (tp == 2).astype(np.float32), (tp == 3).astype(np.float32),
        abs_lat, np.sin(lat_rad), np.cos(lat_rad) * np.sin(lon_rad), np.cos(lat_rad) * np.cos(lon_rad),
        np.sin(doy_rad), np.cos(doy_rad),
    ])
    spatial_12 = extract_spatial_prior_features(df, prior_enc)

    d_mir_bg, d_tir_bg = spatial_12[:, 10], spatial_12[:, 11]
    tbg_est = mir - d_mir_bg
    rad_exc = np.maximum((mir / 300.0) ** 4 - (tbg_est / 300.0) ** 4, 0.05)
    wooster_area = np.clip(frp / rad_exc, 0.0, 1e6)
    extra_6 = np.column_stack([
        np.minimum(mir, 367.0), np.maximum(mir - 367.0, 0.0),
        wooster_area, np.log1p(wooster_area),
        np.clip(d_mir_bg / np.maximum(d_tir_bg, 1.0), -50.0, 200.0),
        (ch - cl) / pts,
    ])

    scan_km = np.clip(_safe_series_float(df, "scan_p50_km", 1.0), 0.25, 10.0).astype(np.float32)
    track_km = np.clip(_safe_series_float(df, "track_p50_km", 1.0), 0.25, 10.0).astype(np.float32)
    pix_area_p50 = np.clip(_safe_series_float(df, "pixel_area_p50_km2", scan_km * track_km), 0.1, 50.0).astype(np.float32)
    pix_area_p95 = np.clip(_safe_series_float(df, "pixel_area_p95_km2", pix_area_p50), 0.1, 60.0).astype(np.float32)
    cell_area = np.clip(_safe_series_float(df, "cell_area_km2", 5.161), 0.5, 20.0).astype(np.float32)

    scan_track_ratio = np.clip(scan_km / np.maximum(track_km, 0.25), 0.2, 8.0).astype(np.float32)
    pixel_to_cell_ratio = np.clip(pix_area_p50 / np.maximum(cell_area, 0.5), 0.02, 10.0).astype(np.float32)
    log1p_frp_per_px_km2 = np.log1p(np.clip(frp / np.maximum(pix_area_p50, 0.25), 0.0, 1e6)).astype(np.float32)

    mir_iqr = np.clip(_safe_series_float(df, "mir_iqr_k", 0.0), 0.0, 200.0).astype(np.float32)
    tir_iqr = np.clip(_safe_series_float(df, "tir_iqr_k", 0.0), 0.0, 150.0).astype(np.float32)
    mir_max_all = _safe_series_float(df, "bright_mir_max_all_k", mir)
    mir_max_minus_p50 = np.clip(mir_max_all - mir, -20.0, 200.0).astype(np.float32)

    conf_modis_norm = np.clip(_safe_series_float(df, "conf_modis_mean", 50.0) / 100.0, 0.0, 1.0).astype(np.float32)
    plat_col = df["modis_platform"] if "modis_platform" in df.columns else (df["source_platform"] if "source_platform" in df.columns else pd.Series(["Terra"] * len(df)))
    is_aqua = (plat_col.fillna("Terra").astype(str).str.strip().str.lower() == "aqua").astype(np.float32).to_numpy()

    if "obs_time_utc" in df.columns:
        ts_utc = pd.to_datetime(df["obs_time_utc"], utc=True, errors="coerce")
        utc_hr = (ts_utc.dt.hour.fillna(12.0) + ts_utc.dt.minute.fillna(0.0) / 60.0).to_numpy(dtype=np.float32)
        local_hr = (utc_hr + lon / 15.0) % 24.0
        cos_solar_hr = np.cos((2.0 * np.pi / 24.0) * local_hr).astype(np.float32)
    else:
        cos_solar_hr = np.where(day > 0.5, -0.5, 0.5).astype(np.float32)

    v2_13 = np.column_stack([
        scan_km, track_km, pix_area_p50, pix_area_p95,
        scan_track_ratio, pixel_to_cell_ratio, log1p_frp_per_px_km2,
        mir_iqr, tir_iqr, mir_max_minus_p50,
        conf_modis_norm, is_aqua, cos_solar_hr,
    ])
    return np.hstack([base_26, spatial_12, extra_6, v2_13]).astype(np.float32)


def _extract_regime_ids(X: np.ndarray) -> np.ndarray:
    return (X[:, 15] > 0.5).astype(np.int32) * 2 + (X[:, 9] > 1.5).astype(np.int32)


def blend_ensemble_preds(preds_mat: np.ndarray, weights: np.ndarray, X: np.ndarray | None = None, regime_weights: np.ndarray | None = None) -> np.ndarray:
    k = preds_mat.shape[1]
    if regime_weights is None or X is None or X.shape[1] <= 15:
        return preds_mat @ weights
    regimes = _extract_regime_ids(X)
    if regime_weights.shape[1] > k:
        return np.sum(preds_mat * regime_weights[regimes, :k], axis=1) + regime_weights[regimes, k]
    return np.sum(preds_mat * regime_weights[regimes], axis=1)


def apply_eqm_map(preds: np.ndarray, eqm_map: dict) -> np.ndarray:
    mapped = np.interp(np.interp(preds, eqm_map["src_q"], eqm_map["probs"]), eqm_map["probs"], eqm_map["tgt_q"])
    alpha = float(eqm_map.get("alpha", 1.0))
    return (1.0 - alpha) * preds + alpha * mapped


def apply_frp_mw_calibrator(pred_log: np.ndarray, mw_cal: dict | None) -> np.ndarray:
    raw_mw = np.maximum(np.expm1(pred_log), 0.0)
    if mw_cal is None:
        return raw_mw
    s0 = float(mw_cal.get("s0", 1.0))
    ex1 = np.maximum(0.0, pred_log - float(mw_cal.get("tau1", 0.0)))
    ex2 = np.maximum(0.0, pred_log - float(mw_cal.get("tau2", 0.0)))
    mult = s0 + float(mw_cal.get("c1", 0.0)) * np.power(ex1, float(mw_cal.get("p1", 1.0))) + float(mw_cal.get("c2", 0.0)) * np.power(ex2, float(mw_cal.get("p2", 1.0)))
    return np.clip(raw_mw * mult, 0.0, 55000.0)


def predict_torch_model(X: np.ndarray, art: dict, device: torch.device, batch_size: int = 65536) -> np.ndarray:
    sd = art["state_dict"]
    in_dim = int(art["in_dim"])
    use_highway = "highway.weight" in sd
    cont_dim = int(art.get("cont_dim", sd["freqs"].shape[0] if "freqs" in sd else in_dim))

    model = build_torch_arch(art["arch"], in_dim=in_dim, out_dim=int(art["out_dim"]), cont_dim=cont_dim, use_highway=use_highway).to(device)
    model.load_state_dict(sd)
    model.eval()

    X_use = X[:, :in_dim] if X.shape[1] > in_dim else X
    Xs = art["scaler"].transform(X_use).astype(np.float32)
    out_dim = int(art["out_dim"])
    bs = 8192 if art["arch"] == "ft_transformer" else batch_size
    out = np.empty((len(Xs), out_dim), dtype=np.float64)
    use_amp = device.type == "cuda"

    with torch.no_grad():
        for start in range(0, len(Xs), bs):
            xb = torch.from_numpy(Xs[start:start + bs]).to(device)
            with (torch.amp.autocast("cuda") if use_amp else contextlib.nullcontext()):
                pred = model(xb).detach().cpu().numpy().astype(np.float64)
            out[start:start + bs] = pred * art["y_std"] + art["y_mean"]
    return out[:, 0] if out_dim == 1 else out


# ==============================================================================
# 3. NẠP FILE .JOBLIB AN TOÀN (CHẠY ĐƯỢC CẢ GPU VÀ CPU) & IN TOÀN BỘ THÔNG SỐ
# ==============================================================================
def load_eqm_bundle(joblib_path: str) -> tuple[dict, torch.device]:
    """Nạp gpu_ensemble_eqm_v2.joblib an toàn cả khi gọi từ module ngoài __main__ hoặc máy chỉ có CPU."""
    main_mod = sys.modules.get("__main__")
    if main_mod is not None and not hasattr(main_mod, "StandardizedXGBRegressor"):
        setattr(main_mod, "StandardizedXGBRegressor", StandardizedXGBRegressor)

    bundle = joblib.load(joblib_path)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    if device.type == "cpu":
        for spec in bundle["models"].values():
            if spec.get("xgb") is not None:
                try:
                    spec["xgb"].model.set_params(device="cpu")
                except Exception:
                    pass
    return bundle, device


def inspect_eqm_bundle(bundle: dict) -> None:
    """In bảng giải thích chi tiết toàn bộ thông số đang lưu trong file .joblib."""
    print(f"Model   : {bundle.get('model_name')} | Version: {bundle.get('version')}")
    print(f"Dataset : {bundle.get('dataset_version')} | Created: {bundle.get('created_at')}")
    print(f"Features: {bundle.get('feature_count')} chiều | Members: {bundle.get('ensemble_members')}")

    members = bundle.get("ensemble_members", [])
    for key, spec in bundle["models"].items():
        print(f"\n--- Kênh [{key}] (clip=[{spec['clip_lo']}, {spec['clip_hi']:.2f}], is_log={spec['is_log']}) ---")
        print("  Trọng số toàn cục:")
        for name, flag, w in zip(members, spec["active_members"], spec["weights"]):
            status = "GIỮ" if flag else "ĐÃ CẮT (=0)"
            print(f"    - {name:24s}: w = {w:.4f} [{status}]")

        rw = spec.get("regime_weights")
        if rw is not None:
            r_names = ["Đêm + Điểm đơn", "Đêm + Đa điểm", "Ngày + Điểm đơn", "Ngày + Đa điểm"]
            print("  Regime bias offset (cột cuối):", {rn: round(float(rw[i, -1]), 4) for i, rn in enumerate(r_names)})

        eqm = spec.get("eqm_map")
        if eqm is not None:
            print(f"  EQM     : BẬT | alpha={eqm['alpha']:.3f} | n_quantiles={len(eqm['probs'])}")
        else:
            print("  EQM     : TẮT (None)")

        mw = spec.get("mw_cal")
        if mw is not None:
            print(f"  MW Cal  : {mw}")


def predict_modis_to_viirs(df_modis: pd.DataFrame, bundle: dict, device: torch.device, chunk_size: int = 200_000) -> pd.DataFrame:
    """Dự đoán bright_mir (K), bright_tir (K), frp (MW) chuẩn VIIRS-like từ DataFrame MODIS."""
    n = len(df_modis)
    out_mir = np.empty(n, dtype=np.float32)
    out_tir = np.empty(n, dtype=np.float32)
    out_frp = np.empty(n, dtype=np.float32)
    feat_cnt = int(bundle.get("feature_count", 57))
    members = bundle.get("ensemble_members", [])
    has_mt = bundle.get("multitask") is not None

    for start in range(0, n, chunk_size):
        end = min(start + chunk_size, n)
        m_len = end - start
        Xc_full = build_feature_matrix_v2(df_modis.iloc[start:end], bundle.get("prior_enc"))
        Xc = Xc_full[:, :feat_cnt] if Xc_full.shape[1] > feat_cnt else Xc_full
        mt_all = predict_torch_model(Xc, bundle["multitask"], device=device) if has_mt else None
        zeros_col = np.zeros(m_len, dtype=np.float64)

        for key, out_arr in [("bright_mir", out_mir), ("bright_tir", out_tir), ("frp_log1p", out_frp)]:
            spec = bundle["models"][key]
            lo, hi, w = float(spec["clip_lo"]), float(spec["clip_hi"]), spec["weights"]
            active = spec.get("active_members", [True] * len(members))

            if active[0] and spec["xgb"] is not None:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    p_xgb = np.clip(spec["xgb"].predict(Xc), lo, hi)
            else:
                p_xgb = zeros_col

            p_cb = np.clip(spec["catboost"].predict(Xc), lo, hi) if (active[1] and spec["catboost"] is not None) else zeros_col
            cols = [p_xgb, p_cb]
            for dl_offset, (disp_name, _, _) in enumerate(DL_MODELS):
                dl_art = spec["dl_arts"].get(disp_name)
                cols.append(np.clip(predict_torch_model(Xc, dl_art, device=device), lo, hi) if (active[2 + dl_offset] and dl_art is not None) else zeros_col)

            cols.append(np.clip(mt_all[:, int(spec["tgt_idx"])], lo, hi) if (active[6] and mt_all is not None) else zeros_col)

            pred = np.clip(blend_ensemble_preds(np.column_stack(cols), w, Xc, spec.get("regime_weights")), lo, hi)
            if spec.get("eqm_map") is not None:
                pred = np.clip(apply_eqm_map(pred, spec["eqm_map"]), lo, hi)
            if spec.get("is_log", False):
                mw_cal = spec.get("mw_cal")
                pred = apply_frp_mw_calibrator(pred, mw_cal) if mw_cal is not None else np.maximum(np.expm1(pred), 0.0)
            out_arr[start:end] = pred.astype(np.float32)

    res = df_modis.copy()
    res["pred_viirs_bright_mir_k"] = out_mir
    res["pred_viirs_bright_tir_k"] = out_tir
    res["pred_viirs_frp_mw"] = out_frp
    return res


# --- Ví dụ chạy thử ---
if __name__ == "__main__":
    bundle, device = load_eqm_bundle("gpu_ensemble_eqm_v2.joblib")
    inspect_eqm_bundle(bundle)

    df_sample = pd.DataFrame([{
        "h3_res7": "872830828ffffff",
        "acq_date": "2025-08-15",
        "daynight": "D",
        "country": "USA",
        "type": 0,
        "center_lat": 39.5,
        "center_lon": -121.4,
        "obs_time_utc": "2025-08-15T20:30:00Z",
        "modis_platform": "Aqua",
        "bright_mir": 335.0,
        "bright_tir": 304.0,
        "frp": 45.0,
        "point_count": 2,
        "conf_l": 0,
        "conf_h": 2,
        "conf_modis_mean": 88.0,
        "mir_iqr_k": 14.0,
        "tir_iqr_k": 3.5,
        "bright_mir_max_all_k": 348.0,
        "scan_p50_km": 1.1,
        "track_p50_km": 1.0,
        "pixel_area_p50_km2": 1.1,
        "pixel_area_p95_km2": 1.4,
        "cell_area_km2": 5.161,
    }])

    df_pred = predict_modis_to_viirs(df_sample, bundle, device)
    print("\nKết quả dự đoán VIIRS-like:")
    print(df_pred[["bright_mir", "pred_viirs_bright_mir_k", "bright_tir", "pred_viirs_bright_tir_k", "frp", "pred_viirs_frp_mw"]])
```

> **Thư viện Python tối thiểu cần cài trên máy người nhận:** `numpy`, `pandas`, `scikit-learn`, `torch`, `xgboost`, `catboost`, `joblib` (thêm `duckdb` nếu cần đọc/lọc trực tiếp các file `.parquet` trong `harmonize_final/`).
