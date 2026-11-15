# 🔥 2026 NASA Space Apps Challenge — Harmonized Burning Activity Calendar (`MODIS → VIIRS-like`, `2000–2025`)

> **One Unified Fire Standard from 2000 to Today:** Converting 26 years of cross-sensor **MODIS** (`Terra`/`Aqua`, 1 km) and **VIIRS** (`S-NPP`/`NOAA-20`, 375 m) active fire hotspots onto **Uber H3 Resolution 7** hexagonal grids (`~5.16 km²`) using a **7-Model Physics-Guided GPU Ensemble + EQM + Two-Zone Tail Calibrator**, powering an interactive **Dual-Ramp Burning Activity Calendar**, **Early Warning Engine**, **Sakoe-Chiba DTW Seasonal Analog Forecasting**, and **Carbon Credit Wildfire Risk Assessment**.

---

## 📁 Project Artifacts & Documentation

* **Training, Evaluation & Standalone Export Notebook:** [`colab_ml_harmonization_v2_gpu.ipynb`](colab_ml_harmonization_v2_gpu.ipynb)
* **Model Technical Reference & Standalone CPU/GPU Inference Code:** [`MODEL_GUIDE_GPU_ENSEMBLE_EQM_V2.md`](MODEL_GUIDE_GPU_ENSEMBLE_EQM_V2.md)
* **Deployed Model Artifact:** `gpu_ensemble_eqm_v2.joblib` *(standalone pruned bundle for `GPU Ensemble + EQM`)*
* **Harmonized Output Dataset:** `outputs/harmonize_final/{2000..2025}.parquet` *(25-column ZSTD Parquet schema, ready for DuckDB / Web APIs / CSV export)*

---

## 📊 SLIDE 1: VALIDATION & IMPACT (Tests, Limitations & Expected Benefits)

### Top KPI Highlights *(Unseen Out-of-Time Test 2023–2025, `N = 276,903` Paired Snapshots)*

| Metric | Result | Detail |
| :--- | :---: | :--- |
| **Out-of-Time Test Scale** | **`276,903`** pairs | Strictly 1-to-1 matched `2023–2025` observations (`Train 2013–2022`) |
| **MIR Brightness Error (`bright_mir`)** | **`-62.85%` MAE \| `-59.06%` RMSE** | Cut MAE from `19.086 K` $\rightarrow$ **`7.091 K`**, bias `-4.25%` $\rightarrow$ **`-0.19%`** |
| **TIR Brightness Error (`bright_tir`)** | **`-25.30%` Ens \| `-30.05%` `PLR-RealMLP`** | Ensemble MAE `4.543 K` $\rightarrow$ **`3.393 K`** (`PLR-RealMLP`: **`3.178 K`**, $R^2 = \mathbf{0.7362}$) |
| **Fire Radiative Power (`frp_mw`)** | **`-40.82%` MAE \| `-55.76%` RMSE** | Cut RMSE from `216.237 MW` $\rightarrow$ **`95.667 MW`**; lifted P90 tail toward `120.43 MW` |
| **Zero Data Leakage** | **`0.0%`** leakage | Uses strictly **57 MODIS-only physical, geometry & 5-fold OOF Bayesian features** |

---

### 1. Validation & Benchmark Tests (`ml_v2_model_comparison.csv`)

#### Validation Protocol (`h3-time-aware-3.0.0` / `TRAIN_PAIRING.md`)
* **Strict 1-to-1 Co-location:** MODIS and VIIRS snapshots paired by `observation_window_id`, `h3_res7`, `year`, `daynight`, `type`, `aggregation_recipe_id`, and `quality_policy_id`, filtered to `n_qualified_detections > 0` and overpass time gap `pair_delta_minutes` $\in [0, 15]$ minutes.
* **Leak-Free Temporal Split:** Trained on **`2013–2022`** (with `2021–2022` internal validation for regime blending, EQM $\alpha$, and Two-Zone Tail Calibration; `>= 2018` as EQM quantile reference) and evaluated **once** on unseen future test pairs **`2023–2025` (`n = 276,903`)**.
* **No Target / QA Leakage:** Zero VIIRS columns, `pair_delta_minutes`, or snapshot IDs enter feature matrix $X$.

#### A. Compact Comparison Table for Slide 1

| Target Channel (Unit) | Uncalibrated MODIS (Identity) | Linear OLS Baseline | Best Single GPU/DL Model | **Deployed: `GPU Ensemble + EQM`** | **Error Reduction & Distributional Fit** |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **`bright_mir` (`K`)** | MAE: `19.086`<br>RMSE: `22.758`<br>$R^2$: `-2.4617` | MAE: `7.240`<br>RMSE: `9.421`<br>$R^2$: `0.4068` | `XGBoost`: MAE `7.105`<br>`CatBoost`: RMSE `9.310` | **MAE: `7.091 K`**<br>**RMSE: `9.317 K`**<br>**$R^2$: `0.4199`** | **MAE `-62.85%` \| RMSE `-59.06%`**<br>Bias: `-4.25%` $\rightarrow$ **`-0.19%`**<br>Med: `325.5K` $\rightarrow$ **`343.93K`** *(True: `343.28K`)* |
| **`bright_tir` (`K`)** | MAE: `4.543`<br>RMSE: `6.270`<br>$R^2$: `0.5269` | MAE: `3.799`<br>RMSE: `5.408`<br>$R^2$: `0.6479` | **`PLR-RealMLP`:**<br>**MAE `3.178` \| RMSE `4.682`**<br>**$R^2$: `0.7362`** | **MAE: `3.393 K`** *(Weighted Ens)*<br>**RMSE: `4.850 K`**<br>**$R^2$: `0.7169`** | **MAE `-25.30%`** *(Single DL: **`-30.05%`**)*<br>Bias: `+0.53%` $\rightarrow$ **`+0.25%`**<br>Med: `302.0K` $\rightarrow$ **`301.18K`** *(True: `300.16K`)* |
| **`frp_log1p` (`log1p MW`)** | MAE: `0.822`<br>RMSE: `1.070`<br>$R^2$: `0.1623` | MAE: `0.688`<br>RMSE: `0.874`<br>$R^2$: `0.4415` | `CatBoost` / `TabNet`:<br>MAE `0.681` \| RMSE `0.866` | **MAE: `0.680`**<br>**RMSE: `0.866`**<br>**$R^2$: `0.4514`** | **MAE `-17.26%` \| RMSE `-19.08%`**<br>Bias: `+14.53%` $\rightarrow$ **`+2.33%`**<br>Med: `3.50` $\rightarrow$ **`3.13`** *(True: `3.07`)* |
| **`frp_mw` (`MW`)** | MAE: `60.326`<br>RMSE: `216.237`<br>$R^2$: `-1.9178` | MAE: `35.786`<br>RMSE: `102.811`<br>P90: `74.78 MW` | `FT-Transformer`:<br>MAE `35.274` \| RMSE `97.614`<br>P90: `82.75 MW` | **MAE: `35.699 MW`**<br>**RMSE: `95.667 MW`**<br>**$R^2$: `0.4289`** | **MAE `-40.82%` \| RMSE `-55.76%`**<br>Bias halved vs OLS (`-30.59%` $\rightarrow$ **`-16.38%`**)<br>Tail P90: `74.8` $\rightarrow$ **`92.97 MW`** *(True: `120.43`)* |

#### B. Full 11-Model Ablation Benchmark (`n_samples = 276,903`)

<details>
<summary>Click to view complete per-model metrics across all 4 targets from <code>ml_v2_model_comparison.csv</code></summary>

| target | unit | model | mae | rmse | wmape_pct | mae_imp_pct | rmse_imp_pct | r2 | bias_pct | true_med | pred_med | modis_med | true_p90 | pred_p90 |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `bright_mir` | `K` | Uncalibrated MODIS (Identity) | 19.086 | 22.758 | 5.56 | 0.00 | 0.00 | -2.4617 | -4.25 | 343.28 | 325.50 | 325.5 | 356.82 | 348.30 |
| `bright_mir` | `K` | Linear OLS Baseline (Train) | 7.240 | 9.421 | 2.11 | 62.07 | 58.60 | 0.4068 | -0.06 | 343.28 | 344.61 | 325.5 | 356.82 | 349.62 |
| `bright_mir` | `K` | XGBoost CUDA GPU | 7.105 | 9.330 | 2.07 | 62.77 | 59.01 | 0.4183 | -0.17 | 343.28 | 343.96 | 325.5 | 356.82 | 349.38 |
| `bright_mir` | `K` | CatBoost GPU | 7.144 | 9.310 | 2.08 | 62.57 | 59.09 | 0.4207 | -0.05 | 343.28 | 344.42 | 325.5 | 356.82 | 349.76 |
| `bright_mir` | `K` | PyTorch ResNet-MLP | 7.115 | 9.358 | 2.07 | 62.72 | 58.88 | 0.4147 | -0.17 | 343.28 | 343.97 | 325.5 | 356.82 | 349.41 |
| `bright_mir` | `K` | FT-Transformer | 7.180 | 9.324 | 2.09 | 62.38 | 59.03 | 0.4189 | 0.02 | 343.28 | 344.80 | 325.5 | 356.82 | 349.97 |
| `bright_mir` | `K` | PLR-RealMLP | 7.191 | 9.420 | 2.10 | 62.32 | 58.61 | 0.4069 | -0.13 | 343.28 | 344.13 | 325.5 | 356.82 | 349.57 |
| `bright_mir` | `K` | Attentive TabNet | 7.145 | 9.380 | 2.08 | 62.56 | 58.78 | 0.4119 | -0.14 | 343.28 | 344.05 | 325.5 | 356.82 | 349.38 |
| `bright_mir` | `K` | Multi-Task Physics Net | 7.147 | 9.390 | 2.08 | 62.55 | 58.74 | 0.4107 | -0.15 | 343.28 | 344.05 | 325.5 | 356.82 | 349.44 |
| `bright_mir` | `K` | Weighted GPU Ensemble | 7.091 | 9.317 | 2.07 | 62.85 | 59.06 | 0.4199 | -0.19 | 343.28 | 343.93 | 325.5 | 356.82 | 349.23 |
| `bright_mir` | `K` | **GPU Ensemble + EQM** | **7.091** | **9.317** | **2.07** | **62.85** | **59.06** | **0.4199** | **-0.19** | **343.28** | **343.93** | **325.5** | **356.82** | **349.23** |
| `bright_tir` | `K` | Uncalibrated MODIS (Identity) | 4.543 | 6.270 | 1.52 | 0.00 | 0.00 | 0.5269 | 0.53 | 300.16 | 302.00 | 302.0 | 310.59 | 311.50 |
| `bright_tir` | `K` | Linear OLS Baseline (Train) | 3.799 | 5.408 | 1.27 | 16.38 | 13.74 | 0.6479 | 0.48 | 300.16 | 301.72 | 302.0 | 310.59 | 310.39 |
| `bright_tir` | `K` | XGBoost CUDA GPU | 3.605 | 5.070 | 1.20 | 20.65 | 19.13 | 0.6906 | 0.35 | 300.16 | 301.51 | 302.0 | 310.59 | 310.10 |
| `bright_tir` | `K` | CatBoost GPU | 3.676 | 5.151 | 1.23 | 19.08 | 17.85 | 0.6807 | 0.36 | 300.16 | 301.56 | 302.0 | 310.59 | 310.21 |
| `bright_tir` | `K` | PyTorch ResNet-MLP | 3.587 | 5.097 | 1.20 | 21.03 | 18.71 | 0.6873 | 0.39 | 300.16 | 301.58 | 302.0 | 310.59 | 310.58 |
| `bright_tir` | `K` | FT-Transformer | 3.387 | 4.821 | 1.13 | 25.44 | 23.11 | 0.7203 | 0.38 | 300.16 | 301.51 | 302.0 | 310.59 | 310.52 |
| `bright_tir` | `K` | **PLR-RealMLP** *(Single Best)* | **3.178** | **4.682** | **1.06** | **30.05** | **25.33** | **0.7362** | **0.16** | **300.16** | **300.78** | **302.0** | **310.59** | **309.42** |
| `bright_tir` | `K` | Attentive TabNet | 3.246 | 4.681 | 1.08 | 28.55 | 25.34 | 0.7362 | 0.16 | 300.16 | 300.92 | 302.0 | 310.59 | 309.54 |
| `bright_tir` | `K` | Multi-Task Physics Net | 3.537 | 5.013 | 1.18 | 22.13 | 20.05 | 0.6976 | 0.36 | 300.16 | 301.51 | 302.0 | 310.59 | 310.17 |
| `bright_tir` | `K` | **Weighted GPU Ensemble** *(Deployed)* | **3.393** | **4.850** | **1.13** | **25.30** | **22.64** | **0.7169** | **0.25** | **300.16** | **301.18** | **302.0** | **310.59** | **309.89** |
| `frp_log1p` | `log1p(MW)` | Uncalibrated MODIS (Identity) | 0.822 | 1.070 | 25.67 | 0.00 | 0.00 | 0.1623 | 14.53 | 3.07 | 3.50 | 3.5 | 4.80 | 5.17 |
| `frp_log1p` | `log1p(MW)` | Linear OLS Baseline (Train) | 0.688 | 0.874 | 21.48 | 16.30 | 18.35 | 0.4415 | 1.79 | 3.07 | 3.13 | 3.5 | 4.80 | 4.33 |
| `frp_log1p` | `log1p(MW)` | XGBoost CUDA GPU | 0.682 | 0.869 | 21.31 | 16.96 | 18.84 | 0.4482 | 2.45 | 3.07 | 3.13 | 3.5 | 4.80 | 4.43 |
| `frp_log1p` | `log1p(MW)` | CatBoost GPU | 0.681 | 0.866 | 21.29 | 17.07 | 19.13 | 0.4521 | 2.15 | 3.07 | 3.13 | 3.5 | 4.80 | 4.37 |
| `frp_log1p` | `log1p(MW)` | PyTorch ResNet-MLP | 0.683 | 0.869 | 21.33 | 16.89 | 18.81 | 0.4477 | 1.76 | 3.07 | 3.12 | 3.5 | 4.80 | 4.39 |
| `frp_log1p` | `log1p(MW)` | FT-Transformer | 0.682 | 0.868 | 21.30 | 16.99 | 18.85 | 0.4484 | 2.50 | 3.07 | 3.14 | 3.5 | 4.80 | 4.43 |
| `frp_log1p` | `log1p(MW)` | PLR-RealMLP | 0.687 | 0.874 | 21.45 | 16.44 | 18.35 | 0.4416 | 1.99 | 3.07 | 3.12 | 3.5 | 4.80 | 4.37 |
| `frp_log1p` | `log1p(MW)` | Attentive TabNet | 0.681 | 0.867 | 21.28 | 17.08 | 18.95 | 0.4497 | 1.72 | 3.07 | 3.11 | 3.5 | 4.80 | 4.40 |
| `frp_log1p` | `log1p(MW)` | Multi-Task Physics Net | 0.686 | 0.873 | 21.42 | 16.56 | 18.46 | 0.4430 | 2.17 | 3.07 | 3.12 | 3.5 | 4.80 | 4.41 |
| `frp_log1p` | `log1p(MW)` | Weighted GPU Ensemble | 0.680 | 0.866 | 21.24 | 17.25 | 19.13 | 0.4521 | 2.31 | 3.07 | 3.13 | 3.5 | 4.80 | 4.41 |
| `frp_log1p` | `log1p(MW)` | **GPU Ensemble + EQM** | **0.680** | **0.866** | **21.24** | **17.26** | **19.08** | **0.4514** | **2.33** | **3.07** | **3.13** | **3.5** | **4.80** | **4.43** |
| `frp_mw` | `MW` | Uncalibrated MODIS (Identity) | 60.326 | 216.237 | 109.21 | 0.00 | 0.00 | -1.9178 | 61.50 | 20.51 | 32.20 | 32.2 | 120.43 | 175.50 |
| `frp_mw` | `MW` | Linear OLS Baseline (Train) | 35.786 | 102.811 | 64.79 | 40.68 | 52.45 | 0.3404 | -30.59 | 20.51 | 21.87 | 32.2 | 120.43 | 74.78 |
| `frp_mw` | `MW` | XGBoost CUDA GPU | 35.343 | 97.562 | 63.98 | 41.41 | 54.88 | 0.4060 | -25.39 | 20.51 | 21.86 | 32.2 | 120.43 | 82.98 |
| `frp_mw` | `MW` | CatBoost GPU | 35.287 | 98.841 | 63.88 | 41.51 | 54.29 | 0.3904 | -28.12 | 20.51 | 21.87 | 32.2 | 120.43 | 78.32 |
| `frp_mw` | `MW` | PyTorch ResNet-MLP | 35.435 | 98.699 | 64.15 | 41.26 | 54.36 | 0.3921 | -27.60 | 20.51 | 21.54 | 32.2 | 120.43 | 79.51 |
| `frp_mw` | `MW` | FT-Transformer | 35.274 | 97.614 | 63.86 | 41.53 | 54.86 | 0.4054 | -25.64 | 20.51 | 22.02 | 32.2 | 120.43 | 82.75 |
| `frp_mw` | `MW` | PLR-RealMLP | 35.821 | 99.712 | 64.85 | 40.62 | 53.89 | 0.3796 | -26.47 | 20.51 | 21.75 | 32.2 | 120.43 | 78.29 |
| `frp_mw` | `MW` | Attentive TabNet | 35.413 | 98.475 | 64.11 | 41.30 | 54.46 | 0.3949 | -26.65 | 20.51 | 21.47 | 32.2 | 120.43 | 80.49 |
| `frp_mw` | `MW` | Multi-Task Physics Net | 35.916 | 100.751 | 65.02 | 40.46 | 53.41 | 0.3666 | -25.52 | 20.51 | 21.70 | 32.2 | 120.43 | 81.39 |
| `frp_mw` | `MW` | Weighted GPU Ensemble | 35.721 | 95.702 | 64.67 | 40.79 | 55.74 | 0.4285 | -16.21 | 20.51 | 24.82 | 32.2 | 120.43 | 92.79 |
| `frp_mw` | `MW` | **GPU Ensemble + EQM** | **35.699** | **95.667** | **64.63** | **40.82** | **55.76** | **0.4289** | **-16.38** | **20.51** | **24.51** | **32.2** | **120.43** | **92.97** |

</details>

---

### 2. Scientific Limitations *(Transparency & Physical Constraints from `TRAIN_PAIRING.md`)*

1. **Co-Detection Conditioning & Sub-Pixel Small Fire Omission:**
   * Paired calibration requires both MODIS (1 km) and VIIRS (375 m) to report `n_qualified_detections > 0`.
   * Therefore, the model outputs **statistical `VIIRS-like` estimates** for MODIS-detected fire windows—it **cannot** hallucinate or reconstruct sub-pixel micro-fires or cloud-obscured ignitions missed completely by MODIS.
2. **Pre-VIIRS Temporal Extrapolation (`2000–2011`):**
   * Because `S-NPP` VIIRS began operations in late 2011, applying the `2013–2022` learned mapping back to `2000–2011` (especially `2000–2002` Terra-only years) represents an **out-of-era temporal extrapolation**.
3. **Sensor Saturation (`367 K`) & Megafire Tail Compression:**
   * VIIRS Band I4 (`bright_mir`) physically saturates at **`367 K`**, while extreme `frp_mw` megafires retain slight tail compression (`True P90 = 120.43 MW` vs `Pred P90 = 92.97 MW`, bias `-16.38%`) due to rapid fire-front evolution within the $0\text{–}15\text{ min}$ overpass gap and differing MODIS vs. VIIRS footprints.

---

### 3. Expected Benefits *(Operational, Scientific & Economic Impact)*

* **Emergency Responders & Firefighters:** Eliminates false sensor-induced jumps; pairs **Dual-Ramp Anomaly Calendars** (`EARLY_SEASON_ONSET`, `NIGHTTIME_FIRE_PERSISTENCE`) with **Sakoe-Chiba DTW** analog matching to deploy crews **2–4 weeks before peak fire windows**.
* **Earth Scientists:** Unlocks a consistent **26-year (`2000–2025`) Uber H3 Res-7 archive** where sensor origin no longer distorts long-term climate trends, cutting months of manual preprocessing into instant **one-click CSV exports**.
* **Carbon Markets (2026–2028) & ESG:** Establishes an unbiased 26-year baseline to size **Wildfire Reversal Buffer Pools** and leverages tail-calibrated **FRP (`MW`)** to estimate biomass $\text{CO}_2$ emissions (**MRV**) under Vietnam's **Decision 232/QD-TTg** and **Decree 29/2026/ND-CP**.

---

## 🚀 SLIDE 2: NEXT STEPS (Improve, Test Next & Deploy)

### 1. IMPROVE: Advancing the `parquet_h3_world_v2` Harmonization Core
* **Platform-Pair & Overpass-Gap Specialization:** Train dedicated sub-ensembles for specific orbital pairs (`Aqua → S-NPP` vs. `Terra → NOAA-20/21`) and tighten overpass gap filtering (`pair_delta_minutes <= 5 min` vs. `15 min`) with **Expectile / Extreme-Value Tail Loss** to close the remaining megafire P90 gap (`92.97 MW → 120.43 MW`).
* **Zero-Inflated Spatiotemporal Count Calibration:** Build a companion H3 cell-activation density model (`DISTINCT h3_res7` active cells/day) to statistically account for sub-pixel `375 m` VIIRS-only small fires during the pre-VIIRS era (`2000–2011`).
* **Hybrid Best-Per-Channel Routing:** Route `bright_tir` inference through **`PLR-RealMLP`** (`MAE 3.178 K`, $R^2 = 0.7362$) while keeping **`GPU Ensemble + EQM`** on `bright_mir` and `frp_mw` for maximum 3-channel accuracy.

### 2. TEST NEXT: From Historical Harmonization to **Proactive Wildfire Prediction & Spread AI**
> 💡 *Today, `parquet_h3_world_v2` observes active hotspots **after** ignition. Because our architecture already indexes the globe on standardized **Uber H3 Res-7 hexagons (`~5.16 km²`)**, **if provided with multi-modal Remote Sensing datasets, ground-truth labels, and full environmental attributes**, we can immediately train a **Proactive Wildfire Ignition & Spread Prediction System**:*

| Required Multi-Modal Data Layer | Specific Remote Sensing & Contextual Attributes | Predictive Capability Unlocked |
| :--- | :--- | :--- |
| **1. Optical & Radar Vegetation / Fuel State** *(Sentinel-1/2, Landsat, MODIS)* | • **NDVI / EVI** (Biomass fuel load & greenness)<br>• **NDWI / NDMI & Live Fuel Moisture Content (LFMC)**<br>• **Land Surface Temperature (LST)** & canopy dryness | Quantify **dry fuel availability** inside every H3 hexagon before ignition occurs. |
| **2. Meteorology & Drought Reanalysis** *(ERA5-Land, GFS, IMERG)* | • **Wind speed & direction (`u10`, `v10`)**, Relative Humidity (`RH`)<br>• **Vapor Pressure Deficit (`VPD`)** & Keetch-Byram Drought Index (`KBDI`)<br>• Consecutive dry days & lightning strike density | Predict **daily ignition probability** and directional **hex-to-hex fire spread velocity**. |
| **3. Topography & Human Exposure** *(SRTM DEM, OpenStreetMap, Land Cover)* | • **Slope, Aspect, Elevation** (terrain chimney effects)<br>• Distance to roads, powerlines, agricultural edges (`WUI`)<br>• Land-use class (`type=0` forest vs. crop residue burning) | Separate **routine agricultural burns** from high-risk **wildfire breakouts**. |
| **4. Verified Ground-Truth Labels** *(Field Reports & Burned Area Polygons)* | • Confirmed **Burned Area perimeters** (`MCD64A1` / Sentinel-2 dNBR)<br>• Verified **fire / no-fire negative samples** & suppression logs<br>• True biomass carbon loss (`tCO2e/ha`) | Train **Graph Neural Networks (GNN) / Spatiotemporal Transformers** on H3 grids for **7-day Wildfire Risk Forecasting**. |

### 3. DEPLOY NEXT: Production Architecture & Market Integration
* **Near-Real-Time (NRT) NASA FIRMS Ingestion:** Connect our standalone `gpu_ensemble_eqm_v2.joblib` inference engine + **DuckDB ZSTD Parquet server** to live NASA FIRMS streams to harmonize incoming detections and refresh **Early Warning Alerts (`CRITICAL / WATCH`)** every 3 hours.
* **Cross-Biome Stress Testing:** Validate **Sakoe-Chiba DTW** seasonal analog matching across diverse global fire regimes (Southeast Asia tropical forests, Amazon, Mediterranean, California, and Australia).
* **Carbon MRV & Emergency Command Pilot (2026–2028):** Deploy REST APIs for provincial Forest Protection Departments and integrate automated **H3 Buffer-Pool Risk & FRP Emission Reports** into Vietnam's **HNX / VSDC Domestic Carbon Exchange** ecosystem.

---

## 🎯 Target Customers & Value Proposition (`Who We Serve`)

| Customer Segment | Target Scope / Users | Key Features Used | Core Value & Benefits Delivered |
| :--- | :--- | :--- | :--- |
| **1. Firefighters & Emergency Responders** *(B2G)* | Forest Protection Dept., Fire & Rescue Police, Disaster Response Centers | `Early Warning` + `DTW Analog Forecast` + `Night Fire Alert` | Pre-position crews **2–4 weeks before peak fire season**; separate real fire surges from sensor noise. |
| **2. Forest & Land Managers** *(B2G)* | Ministry of Agriculture & Environment, National Parks, Local Authorities | `Burning Activity Calendar` (Dual Color Ramps) | Identify **Critical Periods** & **Unusual Conditions** to schedule fuel breaks and prescribed burns safely. |
| **3. Climate & EO Scientists** *(Research)* | Research Institutes, Universities, NASA / Earth Observation Community | `H3 Harmonized 2000–2025` Series + `CSV Export` | Eliminate the 2012 MODIS–VIIRS sensor discontinuity; save **months** of manual data preprocessing. |
| **4. Carbon Credit Market 2026–2028** *(B2B / Policy)* | REDD+ Projects, Carbon Exchanges (HNX/VSDC), MRV Auditors (Verra, Gold Standard) | 26-Year Harmonized Baseline + `Calibrated FRP (MW)` | Accurately quantify **Reversal Risk / Buffer Pools** and estimate actual $\text{CO}_2$ emissions from burned biomass. |
| **5. Insurance & ESG Supply Chains** *(B2B)* | Agro-Forestry Insurers, Timber / Coffee / Rubber Exporters (EUDR Compliance) | `Z-score Anomaly` Index & H3 Spatial Lookup | Price **Parametric Wildfire Insurance** accurately and generate auditable **ESG / EUDR** compliance reports. |

---

## 📜 Policy & Carbon Market Evidence *(Vietnam & Global Context)*

* **Government Decree No. 06/2022/ND-CP *(Jan 7, 2022)*:** Established mandatory GHG inventories and the foundational legal framework for organizing a domestic carbon market.
* **Prime Minister's Decision No. 232/QD-TTg *(Jan 24, 2025)*:** Officially approved the *National Scheme on the Establishment and Development of a Carbon Market in Vietnam*, mandating **pilot Domestic Carbon Exchange operations (`2025–2028`)** and **official nationwide/international trading from `2029` onward** toward Vietnam's **Net-Zero 2050** commitment.
* **Government Decree No. 119/2025/ND-CP *(June 9, 2025)*:** Amended Decree 06/2022/ND-CP to define the National Carbon Registry, quota allocation, and carbon credit offsetting mechanisms.
* **Government Decree No. 29/2026/ND-CP *(Jan 19, 2026)*:** Directly regulates the **Domestic Carbon Exchange**, designating the **Hanoi Stock Exchange (HNX)** to operate trading and **VSDC** to provide registry, depository, clearing, and settlement services.

> **Spoken Evidence Quote (12s):**
> *"This is not a distant future. Under **Prime Minister’s Decision 232/QD-TTg** and **Government Decree 29/2026/ND-CP**, Vietnam has launched its domestic Carbon Exchange on the Hanoi Stock Exchange for the **2025–2028 phase**. Yet every forestry carbon credit traded on this market faces one existential threat—**wildfire reversal risk**—which cannot be accurately priced without a harmonized 26-year NASA satellite fire baseline."*

---

## 🎤 Pitching Kit (`30s Video` + `2-Min Pitch` + `Judge Q&A`)

### 1. 30-Second Teaser Video Storyboard

| Time | Visual on Screen | Voiceover (EN) | Voiceover (VI) |
| :--- | :--- | :--- | :--- |
| **0:00–0:07** | Lush forest fading into satellite wildfire plume; overlay **`2026–2027: Carbon Market Rollout`**. | *"By 2026–2027, Carbon Credit markets go live in Vietnam and globally. Yet a single wildfire can wipe out millions in carbon assets overnight."* | *"Năm 2026–2027, Việt Nam và thế giới bước vào kỷ nguyên Thị trường Tín chỉ Carbon. Nhưng chỉ một vụ cháy rừng có thể xóa sổ hàng triệu đô la tín chỉ trong vài giờ."* |
| **0:07–0:15** | Broken time-series chart splitting at **2012**: left = **MODIS (1 km, retiring)**, right = **VIIRS (375 m)**. | *"To price risk and respond early, we need 26 years of NASA satellite history. But MODIS is retiring, and VIIRS speaks a completely different language."* | *"Để quản trị rủi ro cháy và ứng cứu sớm, ta cần 26 năm lịch sử vệ tinh NASA. Nhưng MODIS đang ngừng hoạt động, còn VIIRS lại đo ở một thang hoàn toàn khác."* |
| **0:15–0:23** | Data flowing through **H3 Res-7** hex grid & **7-Model Physics-Guided GPU Ensemble + EQM** into the **Burning Activity Calendar**. | *"We harmonized 26 years of data on H3 hex-grids using a 7-model Physics-Guided GPU Ensemble—cutting thermal error by 63% and radiative power error by 56%."* | *"Chúng tôi hợp nhất 26 năm dữ liệu trên lưới lục giác H3 bằng AI Vật lý 7 mô hình GPU, giảm 63% sai số nhiệt và 56% sai số công suất bức xạ."* |
| **0:23–0:30** | Region selection on map, **`CRITICAL / EARLY_SEASON_ONSET`** badge, **DTW Analog** cone, & **`Download CSV`**. | *"From early warning and DTW seasonal forecasting to protecting carbon sinks—one unified fire calendar from 2000 to today."* | *"Từ cảnh báo sớm, dự báo mùa cháy bằng DTW đến bảo vệ tài sản rừng — một chuẩn dữ liệu duy nhất từ năm 2000 đến nay."* |

---

### 2. 2-Minute Live Pitch Script

#### English Version (`~2 min`)
> **[0:00 – 0:25 | THE HOOK: Carbon Market 2026–2027 & The Broken Satellite Record]**
> "Judges, under **Prime Minister’s Decision 232/QD-TTg** and **Decree 29/2026/ND-CP**, Vietnam is launching its Domestic Carbon Exchange through 2028 alongside global carbon markets. As forests become billion-dollar climate assets, governments, carbon verifiers, and emergency responders face one urgent question: *How does today's wildfire risk compare to the last 25 years?*
> Yet right when we need a 26-year historical baseline, our satellite record breaks in half. NASA's retiring **MODIS** (1 km) and newer **VIIRS** (375 m) sensors have vastly different sensitivities and saturation limits—comparing them directly creates false jumps."
>
> **[0:25 – 1:05 | THE AI & PHYSICS INNOVATION]**
> "While others might apply a simple multiplier, we solved **sensor harmonization at the physical and radiative level**.
> On **Uber H3 Resolution 7** hexagons (`~5.16 km²`), we built strict 1-to-1 co-located windows within 15 minutes and engineered **57 leak-free physical features**—including Stefan-Boltzmann $T^4$ radiative terms, Wooster fire area, and bow-tie scan geometry.
> We trained a **7-Model GPU Ensemble**—combining *XGBoost, CatBoost, ResNet-MLP, FT-Transformer, PLR-RealMLP, TabNet,* and a *Multi-Task Physics Net* across 4 day/night regimes—paired with **Empirical Quantile Mapping (EQM)** and a **Two-Zone Tail Calibrator**.
> On **276,903 unseen 2023–2025 test pairs**, we cut **MIR thermal MAE by 62.85%** and **Fire Radiative Power RMSE by 55.76%**, translating MODIS records since 2000 into a single **`VIIRS-like`** standard."
>
> **[1:05 – 1:40 | THE WEB APP & DTW ENGINE]**
> "Our Web Application turns this harmonized archive into immediate action:
> 1. **A Dual-Ramp Burning Activity Calendar:** A sequential ramp pinpoints **Critical Periods**, while a diverging Z-score ramp exposes **Unusual Conditions** (`EARLY_SEASON_ONSET`, `NIGHTTIME_FIRE_PERSISTENCE`).
> 2. **Sakoe-Chiba DTW Analog Forecasting:** Matches current mid-year trajectories against 25 historical years—even with 1–2 month phase shifts—to identify twin fire years and project seasonal risk.
> 3. **On-Demand Region Analytics & CSV Export.**"
>
> **[1:40 – 2:00 | THE CLOSE]**
> "Sensor of origin no longer matters. Firefighters respond weeks earlier, scientists track true climate signals, and our roadmap expands into H3 multi-modal **Wildfire Ignition & Spread Prediction** to protect every hectare of forest and every carbon credit. Thank you!"

#### Vietnamese Version (`~2 phút`)
> **[0:00 – 0:25 | MỞ MÀN: Thị trường Tín chỉ Carbon 2026–2028 & Sự đứt gãy dữ liệu]**
> "Chào Ban Giám khảo. Theo **Quyết định 232/QĐ-TTg** và **Nghị định 29/2026/NĐ-CP**, Việt Nam chính thức vận hành Sàn giao dịch Tín chỉ Carbon trong nước giai đoạn 2025–2028. Khi rừng trở thành tài sản carbon tỷ đô, câu hỏi sống còn của lực lượng cứu hỏa, nhà khoa học lẫn thị trường carbon toàn cầu là: *Rủi ro cháy rừng hiện tại so với 25 năm lịch sử đang ở mức nào?*
> Nhưng chuỗi dữ liệu vệ tinh NASA lại bị đứt gãy làm đôi: **MODIS** (1 km từ năm 2000) sắp ngừng hoạt động để nhường chỗ cho **VIIRS** (375 m) nhạy hơn gấp nhiều lần, khiến ta không thể so sánh trực tiếp."
>
> **[0:25 – 1:05 | ĐỘT PHÁ AI VẬT LÝ (`GPU Ensemble + EQM`)]**
> "Nhóm giải quyết bài toán **Harmonization ở cấp độ vật lý và AI** trên lưới lục giác **Uber H3 Res-7**: ghép cặp 1–1 trong biên độ 15 phút, thiết kế **57 đặc trưng vật lý không rò rỉ nhãn** (bức xạ Stefan-Boltzmann $T^4$, diện tích Wooster, méo hình học quét), huấn luyện **GPU Ensemble 7 mô hình** kèm **EQM** và **Two-Zone Tail Calibrator**.
> Kết quả trên **276.903 cặp kiểm thử 2023–2025**: giảm **62,85% sai số nhiệt MIR** (`19,09 K → 7,09 K`) và **55,76% RMSE công suất lửa FRP** (`216,2 MW → 95,7 MW`), quy đổi chuỗi MODIS từ năm 2000 về chuẩn **`VIIRS-like`** thống nhất."
>
> **[1:05 – 1:40 | ỨNG DỤNG WEB & DỰ BÁO DTW]**
> "Dữ liệu này vận hành trực tiếp trên Web App với: (1) **Lịch hoạt động cháy 2 thang màu** tách bạch *Critical Periods* và *Unusual Conditions*; (2) **Cảnh báo sớm & Tải CSV tức thì**; (3) **Sakoe-Chiba DTW** tìm năm lịch sử tương đồng kể cả khi mùa cháy lệch pha sớm/muộn để dự báo phần còn lại của năm."
>
> **[1:40 – 2:00 | KẾT THÚC]**
> "Khi nguồn cảm biến không còn là rào cản, lực lượng cứu hỏa điều quân sớm hơn 2–4 tuần, và nếu được bổ sung dữ liệu viễn thám đa phổ cùng nhãn thực địa, hệ lưới H3 này sẵn sàng chạy mô hình **Dự báo Khởi phát & Lan truyền Cháy rừng** để bảo vệ rừng và thị trường carbon tương lai. Xin cảm ơn!"

---

### 3. Likely Judge Questions & Winning Answers (`Q&A`)

1. **Q: Why use a 7-model GPU Ensemble + EQM instead of simple Linear OLS or a single XGBoost?**
   * **A:** Benchmark results on `N = 276,903` test pairs prove the MODIS–VIIRS mapping is strongly nonlinear (VIIRS I4 saturates at `367 K`, MODIS has bow-tie edge pixel growth). `Linear OLS` leaves `bright_tir` at MAE `3.799 K` (vs `PLR-RealMLP` **`3.178 K`**) and collapses `frp_mw` extreme fires (`P90 = 74.78 MW`, RMSE `102.811 MW`, bias `-30.59%`). **`GPU Ensemble + EQM + Two-Zone Tail Calibrator`** hits the lowest `frp_mw` RMSE (**`95.667 MW`**, `-55.76%`), cuts bias nearly in half (`-16.38%`), and lifts P90 intensity to **`92.97 MW`**.
2. **Q: VIIRS (375 m) detects many small fires that MODIS (1 km) misses entirely. How does your calendar handle raw detection count bias?**
   * **A:** Two layers: (1) At each co-detected H3 Res-7 window, `GPU Ensemble + EQM` translates MIR, TIR, and FRP to **`VIIRS-like`** physical scales; (2) At the calendar level, we aggregate by normalized fixed-area **`DISTINCT h3_res7` fire cells** (`~5.16 km²`), seasonal quantiles, and `eq_viirs_fire_count`, rather than raw sub-pixel dot counts.
3. **Q: How does this concretely help Vietnam's 2025–2028 Carbon Exchange?**
   * **A:** Under **Decision 232/QD-TTg** & **Decree 29/2026/ND-CP** (`HNX`/`VSDC`), forestry carbon credits require a 20–25 year baseline to size **Wildfire Reversal Buffer Pools** and verify emissions (**MRV**). Without harmonization, post-2012 VIIRS counts cause artificial risk spikes; furthermore, Wooster's biomass burning formula integrates **FRP (MW)** over time—cutting FRP RMSE by `55.76%` directly improves $\text{CO}_2$ loss auditing.
4. **Q: Why use Sakoe-Chiba DTW instead of Pearson correlation or Euclidean distance for year matching?**
   * **A:** Climate oscillations (El Niño / droughts) shift fire seasons by 2–6 weeks. A twin fire year starting in February instead of March fails point-to-point Euclidean matching. **Sakoe-Chiba DTW** ($\pm 2$-month warp window) aligns seasonal trajectories dynamically and outputs `phase_shift_months` to warn if fire season has arrived early.
5. **Q: How did you guarantee Zero Data Leakage?**
   * **A:** (1) Strict future temporal split (`Train 2013–2022` $\rightarrow$ `Test 2023–2025`); (2) **5-fold Out-Of-Fold Empirical Bayes** spatial priors (`prior_enc`); (3) Zero VIIRS measurements or `pair_delta_minutes` in the 57 input features.
6. **Q: Why disable EQM on `bright_tir` while enabling Two-Zone Tail Calibration on `frp_mw`?**
   * **A:** `bright_tir` (~11 µm) does not saturate below >400 K, so `Weighted GPU Ensemble` / `PLR-RealMLP` already achieves $R^2 = 0.7169\text{–}0.7362$ with only `0.16%–0.25%` bias. Conversely, inverting `frp_log1p` via `expm1` suffers Jensen's inequality under-prediction on heavy right-tailed megafires—our **Two-Zone Tail Calibrator** compensates above **Q65 ($\tau_1$)** and **Q90 ($\tau_2$)** without degrading small-fire MAE.
7. **Q: How does the Web App serve 26 years of global data fast?**
   * **A:** Records are pre-aggregated on **H3 Res-7**, stored in yearly **`ZSTD` Parquet** files (`ROW_GROUP_SIZE 100000`) queried via **DuckDB** predicate pushdown, while regional calendars, `[0, 1]` color ramps, alerts, and DTW outputs are precomputed into lightweight JSON bundles for sub-100 ms UI responsiveness and fast CSV downloads.
