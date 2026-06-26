# CLX Energy Service v2 - Developer Package

## 📌 프로젝트 개요

**목적**: 정유공장(CLX) 에너지 소비량(Fuel Gas, Steam, 전력)의 일간 변동 요인을 
운전조건 기반으로 자동 해석하여 대시보드로 제공하는 서비스

**모델**: Unified Diff Model (AR 없음, 운전변수 100% 해석)
- 예측식: Δy = f(운전변수), y_t = y_{t-1}(실측) + Δy_pred
- 보정: corrected_SHAP = SHAP + residual × (|SHAP| / Σ|SHAP|)
- 품질지표(CQI): |residual| / Σ|SHAP| → High(<0.5), Medium(0.5~1.0), Low(≥1.0)

**핵심 가치**: 
- 에너지 비용 변동의 원인을 운전요인 그룹별로 100% 분해
- D-1(전일), W-1(주간), M-1(월간) 3가지 시간축 분석
- 원본단위/MJ/비용(Won) 3가지 단위로 동시 제공

---

## 📁 파일 구조

```
CLX_Energy_Service_v2_full_package/
│
├── README.md                          ← 이 문서
│
├── Models/                            ← 학습된 모델 파일
│   ├── fg_diff_model.joblib           FG(Fuel Gas) Diff 예측 모델
│   ├── steam_diff_model.joblib        Steam Diff 예측 모델
│   ├── elec_diff_model.joblib         ELEC(전력) Diff 예측 모델
│   ├── diff_train_metadata.json       Diff 모델 학습 정보
│   └── train_metadata.json            학습데이터 통계 (Validation용)
│
├── Modeling/                          ← 모델 설정
│   └── feature_groups.csv             피처→운전그룹 매핑 (색상 포함)
│
├── Service/                           ← 서비스 코드
│   └── CLX_Energy_Service_v2.py       메인 서비스 노트북 (실행 코드)
│
├── Recent_Data/                       ← 입력 데이터 (임시)
│   ├── clx_energy_recent.csv          신규 운전 데이터 (274일)
│   └── Diff Model Simulation.py       상세 분석 시뮬레이션 노트북
│
└── Service/output/                    ← 대시보드용 Output (샘플)
    ├── dashboard_kpi.csv              일별 시계열 KPI
    ├── dashboard_factors.csv          그룹별 변동요인 (D-1/W-1/M-1)
    ├── data_dictionary.csv            칼럼 설명서
    ├── metadata.json                  모델/환산인자/CQI 정보
    └── detail_features.csv            피처별 SHAP 상세 (드릴다운)
```

---

## 🔧 각 파일 상세 설명

### Models/ (서비스 구동 필수)

| 파일 | 설명 |
|------|------|
| `fg_diff_model.joblib` | FG 차분 예측 모델 (XGBoost, 14 피처, R²=0.95) |
| `steam_diff_model.joblib` | Steam 차분 예측 모델 (XGBoost, 24 피처, R²=0.88) |
| `elec_diff_model.joblib` | ELEC 차분 예측 모델 (XGBoost, 18 피처, R²=0.96) |
| `diff_train_metadata.json` | 모델 버전(v1.0_optuna), 학습기간, 성능지표 |
| `train_metadata.json` | 학습데이터의 칼럼별 min/max/mean/std (입력 Validation용) |

**모델 구조 (joblib 내부):**
```python
artifact = {
    'model_diff': XGBRegressor,    # Δy 예측 모델
    'features': list,              # 입력 피처 목록
    'monotone': tuple,             # 단조 제약조건
    'target_col': str,             # 타겟 칼럼명
    'diff_col': str,               # 차분 칼럼명
    'best_params': dict,           # Optuna 최적 하이퍼파라미터
    'model_type': 'unified_diff',
    'version': 'v1.0_optuna',
    'r2_test': float,
    'mape_test': float,
}
```

### Modeling/feature_groups.csv (피처 그룹 정의)

| 칼럼 | 설명 |
|------|------|
| Feature | 모델 입력 피처명 |
| Group | 영문 그룹명 |
| Group_KR | 한글 그룹명 (대시보드 표시용) |
| Color | 그룹 대표 색상 (#hex) |
| Used_FG / Used_STM / Used_ELEC | 에너지별 사용 여부 |
| Monotone_FG / Monotone_STM / Monotone_ELEC | 단조 제약 방향 |

**⚠️ 인코딩: UTF-8-BOM (encoding='utf-8-sig'으로 읽기)**

### Service/CLX_Energy_Service_v2.py (메인 서비스)

**실행 순서:** Cell 1~10 순차 실행
1. 패키지 설치 (xgboost, shap, joblib)
2. 라이브러리 + 설정 (TARGET_DATE, SHOW_VIZ, 비용인자)
3. 모델 로드
4. **데이터 로드 (Pipeline 전환 포인트)**
5. 피처 엔지니어링
6. SHAP 예측 + 보정
7. Output 생성 + 저장
8. 시각화 (On/Off 가능)
9. 실행 요약

**Pipeline 전환 시 변경점 (Cell 5):**
```python
# 현재
DATA_SOURCE = 'csv'
CSV_PATH = '{DATA_DIR}/clx_energy_recent.csv'

# 향후 Datalake 연결 시
DATA_SOURCE = 'datalake'
DATALAKE_TABLE = 'catalog.schema.clx_energy_daily'
```

**배치 모드 (시각화 없이 Output만):**
```python
SHOW_VIZ = False  # Cell 4에서 변경
```

---

## 📊 Output 파일 스키마

### dashboard_kpi.csv (일별 시계열 → 라인/영역 차트)
| 칼럼 | 단위 | 설명 |
|------|------|------|
| date | YYYY-MM-DD | 날짜 (인덱스) |
| fg_bbl | BBL | Fuel Gas 소비량 |
| stm_esston | ESSTON | Steam 소비량 |
| elec_kwh | KWH | 전력 소비량 |
| cdu_bbl | BBL | 원유처리량 |
| total_mj | M MJ | 총 에너지 (MJ 통합) |
| sec_mj_per_bbl | MJ/BBL | 에너지 원단위 |
| total_cost_mwon | M won | 총 비용 (백만원) |
| unit_cost_won_per_bbl | won/BBL | 비용 원단위 |
| cqi_avg | 0~∞ | 해석 신뢰도 (낮을수록 신뢰) |
| cqi_level | High/Medium/Low | CQI 등급 |

### dashboard_factors.csv (그룹별 요인 → Waterfall/Bar 차트)
| 칼럼 | 설명 |
|------|------|
| horizon | D-1(전일), W-1(7일), M-1(30일) |
| group | 운전요인 그룹명 (한글) |
| color | 그룹 색상 코드 (#hex) |
| impact_mj | 에너지 변동 기여량 (M MJ) |
| impact_mwon | 비용 변동 기여량 (M won) |
| fg_bbl / stm_esston / elec_kwh | 에너지별 원본 단위 기여 |
| cqi_avg | 해당 기간 평균 CQI |
| cqi_level | CQI 등급 |

### detail_features.csv (피처 상세 → 드릴다운)
| 칼럼 | 설명 |
|------|------|
| horizon | D-1/W-1/M-1 |
| energy | FG/Steam/ELEC |
| feature | 모델 피처명 |
| group | 소속 그룹 |
| unit | 원본 단위 (BBL/ESSTON/KWH) |
| shap_raw | 원본 단위 기여량 |
| shap_mj | MJ 환산 기여량 (M MJ) |
| shap_mwon | 비용 환산 기여량 (M won) |

---

## 💰 비용 환산인자

| 에너지 | 단가 | 비고 |
|--------|------|------|
| F/G | 113,166 won/FOEB(BBL) | 직접 적용 |
| Steam | 61,878 won/FOEB | ESSTON→FOEB 환산: ×0.4894 → 30,290 won/ESSTON |
| ELEC | 177 won/KWH | 직접 적용 |

**MJ 환산인자:**
- FG: 6,330.44 MJ/BBL
- Steam: 3,098.82 MJ/ESSTON
- ELEC: 9.55 MJ/KWH

---

## 🎯 CQI (Contribution Quality Index)

모델 해석의 신뢰도를 나타내는 지표:
- **공식**: |실제Δy - 예측Δy| / Σ|SHAP|
- **High (< 0.5)**: 모델이 변동을 잘 설명 → 해석 신뢰 가능
- **Medium (0.5 ~ 1.0)**: 보통 → 참고용
- **Low (≥ 1.0)**: 모델 예측 오차가 큼 → 해석 주의

**대시보드 활용:**
- CQI가 Low인 날은 빨간색 경고 표시
- Waterfall 차트에 CQI 배지 표시 권장

---

## 🚀 Quick Start

1. Databricks 워크스페이스에 파일 구조 그대로 업로드
2. `CLX_Energy_Service_v2.py`의 `BASE_DIR` 경로를 새 위치로 변경
3. `TARGET_DATE` 설정 후 전체 셀 실행
4. `output/` 폴더에서 CSV/JSON 읽어 대시보드 연동

---

## 📌 운전요인 그룹 (5개)

| 그룹 | 색상 | 포함 피처 | 의미 |
|------|------|-----------|------|
| 원유처리량 | #1976D2 | CDU, CDU_ma7, CDU_diff | 원유 투입량 변화 |
| 2차공정 처리비율 | #FF9800 | RFCC_ratio, RDS_ratio, UC_ratio | 2차 공정 가동률 |
| 원유조성 | #8E24AA | FO, EHC, H/S, Mild, L/S, heavy_ratio, light_ratio | 원유 성상 변화 |
| 환경/계절 | #43A047 | ATM_Temp, season_sin, season_cos, HDD, ATM_Temp_ma7 | 기온/계절 영향 |
| 강우 | #0288D1 | Rain 관련 10개 피처 | 강우 영향 (주로 Steam) |

---

## ⚠️ 주의사항

1. `feature_groups.csv`는 반드시 `encoding='utf-8-sig'`로 읽기
2. Steam MAPE가 높음 (음수값 포함으로 MAPE 왜곡, R²는 정상)
3. `clx_energy_recent.csv`는 임시 데이터 → Datalake Pipeline 구축 후 교체
4. 모델은 2021-01-09 ~ 2024-08-07 데이터로 학습됨
5. Validation 이탈 피처(RFCC 26.6%, STEAM 21.5%)는 모니터링 필요

---

*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}*
*Model Version: v1.0_optuna (Unified Diff)*
*Package Version: 2.0*
