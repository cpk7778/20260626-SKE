# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# DBTITLE 1,Service Overview
# MAGIC %md
# MAGIC # CLX Energy Service v2 (Unified Diff Model)
# MAGIC
# MAGIC **목적**: Diff 모델 기반 에너지 변동 요인 분석 결과를 3가지 단위로 출력하여 대시보드 개발환경으로 전송
# MAGIC
# MAGIC ---
# MAGIC
# MAGIC ## Output 구조
# MAGIC | 레벨 | 파일 | 내용 | 용도 |
# MAGIC |------|------|------|------|
# MAGIC | Dashboard | dashboard_kpi.csv | 일별 KPI (원본/MJ/Won) | 시계열 차트 |
# MAGIC | Dashboard | dashboard_factors.csv | 그룹별 변동요인 (D-1/W-1/M-1) | Waterfall/Bar |
# MAGIC | Dashboard | data_dictionary.csv | 칼럼 설명서 | 개발자 참고 |
# MAGIC | Dashboard | metadata.json | 모델/환산인자/CQI | 설정 참고 |
# MAGIC | 상세 | detail_features.csv | 피처별 SHAP (3단위 통합) | 드릴다운 |
# MAGIC
# MAGIC ## 데이터 파이프라인
# MAGIC ```
# MAGIC [현재] CSV (clx_energy_recent.csv)
# MAGIC        ↓
# MAGIC [향후] Datalake Pipeline → Unity Catalog Table
# MAGIC        ↓
# MAGIC    전처리 + 모델 예측 + SHAP 보정
# MAGIC        ↓
# MAGIC    3단위 Output 저장 → 외부 Dashboard
# MAGIC ```
# MAGIC
# MAGIC ## 사용법
# MAGIC 1. `TARGET_DATE` 변경으로 기준일 전환
# MAGIC 2. `SHOW_VIZ = True/False`로 시각화 On/Off
# MAGIC 3. Output는 `OUTPUT_DIR`에 자동 저장

# COMMAND ----------

# DBTITLE 1,패키지 설치 (필요시)
# MAGIC %pip install xgboost>=2.0.0 joblib>=1.3.0 shap>=0.44.0 -q

# COMMAND ----------

# DBTITLE 1,라이브러리 임포트 + 설정
# ============================================================
# 라이브러리 임포트 + 전역 설정
# ============================================================
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import shap
import joblib
import json
import csv
import os
from xgboost import XGBRegressor
from sklearn.metrics import r2_score
from datetime import timedelta
import warnings
warnings.filterwarnings('ignore')

# --- 시각화 스타일 ---
plt.rcParams['figure.facecolor'] = '#F8F8F8'
plt.rcParams['axes.facecolor'] = '#FFFFFF'
plt.rcParams['font.size'] = 10

# ============================================================
# 전역 설정 (파라미터)
# ============================================================

# 기준일 (변경 후 이하 셀 재실행)
TARGET_DATE = pd.Timestamp('2026-03-16')

# 시각화 On/Off
SHOW_VIZ = True

# --- 경로 ---
BASE_DIR = '/Workspace/Users/sk16381@skcorp.com/CLX_Energy_Analysis_prj'
MODEL_DIR = f'{BASE_DIR}/Models'
DATA_DIR = f'{BASE_DIR}/Recent_Data'
OUTPUT_DIR = f'{BASE_DIR}/Service/output'
FEATURE_GROUPS_PATH = f'{BASE_DIR}/Modeling/feature_groups.csv'

# Output 디렉토리 생성
os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- 비용 환산인자 ---
MJ_FACTORS = {'FG': 6330.44, 'Steam': 3098.82, 'ELEC': 9.55}
ESSTON_TO_FOEB = 3098.82 / 6330.44  # 0.4894
COST_PER_UNIT = {
    'FG': 113166,                    # won/BBL(FOEB)
    'Steam': 61878 * ESSTON_TO_FOEB, # won/ESSTON (= 30,290)
    'ELEC': 177,                     # won/KWH
}

print("✅ 설정 완료")
print(f"   TARGET_DATE: {TARGET_DATE.date()}")
print(f"   SHOW_VIZ: {SHOW_VIZ}")
print(f"   OUTPUT_DIR: {OUTPUT_DIR}")
print(f"   비용: FG={COST_PER_UNIT['FG']:,} won/BBL, STM={COST_PER_UNIT['Steam']:,.0f} won/ESSTON, ELEC={COST_PER_UNIT['ELEC']} won/KWH")

# COMMAND ----------

# DBTITLE 1,모델 + 메타데이터 로드
# ============================================================
# Diff 모델 + 메타데이터 로드
# ============================================================
fg_artifact = joblib.load(f'{MODEL_DIR}/fg_diff_model.joblib')
stm_artifact = joblib.load(f'{MODEL_DIR}/steam_diff_model.joblib')
elec_artifact = joblib.load(f'{MODEL_DIR}/elec_diff_model.joblib')

with open(f'{MODEL_DIR}/diff_train_metadata.json', 'r') as f:
    train_meta = json.load(f)

# train_stats 보완
if 'train_stats' not in train_meta:
    old_meta_path = f'{MODEL_DIR}/train_metadata.json'
    if os.path.exists(old_meta_path):
        with open(old_meta_path, 'r') as f:
            old_meta = json.load(f)
        if 'raw_column_stats' in old_meta:
            train_meta['train_stats'] = old_meta['raw_column_stats']

# feature_groups 로드
feat_to_group, group_colors = {}, {}
with open(FEATURE_GROUPS_PATH, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        feat_to_group[row['Feature']] = row['Group_KR']
        group_colors[row['Group_KR']] = row['Color']

print("✅ 모델 로드 완료")
print(f"   버전: {fg_artifact.get('version', 'unknown')} ({fg_artifact.get('model_type', 'unknown')})")
for art, name in [(fg_artifact, 'FG'), (stm_artifact, 'Steam'), (elec_artifact, 'ELEC')]:
    print(f"   {name}: features={len(art['features'])}, R\u00b2={art.get('r2_test',0):.4f}")

# COMMAND ----------

# DBTITLE 1,데이터 로드 (전처리 - Pipeline Ready)
# ============================================================
# 데이터 로드 (Pipeline Ready)
# ============================================================
# 향후 Datalake Pipeline 구축 시 아래 섹션만 교체:
#   현재: CSV 파일 로드
#   향후: spark.table("catalog.schema.clx_energy_daily").toPandas()
# ============================================================

# ===================== DATA SOURCE CONFIG =====================
# [Option A] 현재: CSV 파일 (Recent Data)
DATA_SOURCE = 'csv'
CSV_PATH = f'{DATA_DIR}/clx_energy_recent.csv'

# [Option B] 향후: Datalake Pipeline (아래 주석 해제)
# DATA_SOURCE = 'datalake'
# DATALAKE_TABLE = 'catalog.schema.clx_energy_daily'
# ==============================================================

def load_data(source=DATA_SOURCE):
    """데이터 로드 - Pipeline 구축 시 source만 변경"""
    if source == 'csv':
        df = pd.read_csv(CSV_PATH)
        df['Date'] = pd.to_datetime(df.iloc[:, 0])
        df = df.set_index('Date').sort_index()
    elif source == 'datalake':
        # Datalake Pipeline 연결 시 사용
        # df = spark.table(DATALAKE_TABLE).toPandas()
        # df['Date'] = pd.to_datetime(df['Date'])
        # df = df.set_index('Date').sort_index()
        raise NotImplementedError("Datalake Pipeline 미구축 - CSV 모드 사용")
    else:
        raise ValueError(f"Unknown source: {source}")
    
    # 칼럼명 정리
    if 'ATM Temp.' in df.columns:
        df = df.rename(columns={'ATM Temp.': 'ATM_Temp'})
    if '일자' in df.columns:
        df = df.drop(columns=['일자'])
    
    return df

df = load_data()
print(f"✅ 데이터 로드: {len(df)}행, {df.index[0].date()} ~ {df.index[-1].date()}")
print(f"   Source: {DATA_SOURCE}")
print(f"   칼럼: {list(df.columns[:10])}...")

# --- Data Validation ---
if 'train_stats' in train_meta:
    print(f"\n   [Validation]")
    for col, stats in train_meta['train_stats'].items():
        if col in df.columns:
            oor = ((df[col] < stats['min']) | (df[col] > stats['max'])).mean() * 100
            if oor > 5:
                flag = '❌' if oor > 20 else '⚠️'
                print(f"   {flag} {col}: {oor:.1f}% out-of-range")

# COMMAND ----------

# DBTITLE 1,피처 엔지니어링
# ============================================================
# 피처 엔지니어링 (공통 + Rain + 계절 + 차분)
# ============================================================
def engineer_features(df):
    """피처 엔지니어링 - 모델 입력용"""
    df = df.copy()
    
    # 공통 피처
    df['RFCC_ratio'] = df['RFCC'] / df['CDU'].clip(lower=1)
    df['RDS_ratio'] = df['RDS'] / df['CDU'].clip(lower=1)
    df['UC_ratio'] = df['UC'] / df['CDU'].clip(lower=1)
    df['CDU_ma7'] = df['CDU'].rolling(7, min_periods=1).mean()
    df['CDU_diff'] = df['CDU'].diff().fillna(0)
    df['heavy_ratio'] = df['FO'] + df['EHC']
    df['light_ratio'] = df['Mild'] + df['L/S']
    
    # Rain 피처 (Steam용)
    df['is_rain'] = (df['Rain'] > 0).astype(int)
    df['rain_intensity'] = df['Rain'].clip(upper=df['Rain'].quantile(0.99))
    df['Rain_lag1'] = df['Rain'].shift(1).fillna(0)
    df['Rain_cumsum3'] = df['Rain'].rolling(3, min_periods=1).sum()
    
    # days_since_rain
    df['days_since_rain'] = 0
    dsr_col = df.columns.get_loc('days_since_rain')
    last_rain = -999
    for i in range(len(df)):
        if df['Rain'].iloc[i] > 0:
            last_rain = i
        df.iloc[i, dsr_col] = i - last_rain if last_rain >= 0 else 30
    df['days_since_rain'] = df['days_since_rain'].clip(upper=30)
    
    # 계절/온도 피처
    day_of_year = df.index.dayofyear
    df['season_sin'] = np.sin(2 * np.pi * day_of_year / 365.25)
    df['season_cos'] = np.cos(2 * np.pi * day_of_year / 365.25)
    df['HDD'] = np.maximum(18 - df['ATM_Temp'], 0)
    df['ATM_Temp_ma7'] = df['ATM_Temp'].rolling(7, min_periods=1).mean()
    df['Rain_x_cold'] = df['rain_intensity'] * df['HDD']
    
    # 차분 칼럼
    df['FG_diff'] = df['FG(BBL)'].diff()
    df['STM_diff'] = df['STEAM(ESSTON)'].diff()
    df['ELEC_diff'] = df['ELEC(KWH)'].diff()
    
    # 첨 행 NaN 제거
    df = df.iloc[1:].copy()
    return df

df = engineer_features(df)
print(f"✅ 피처 엔지니어링 완료: {len(df)}행, {len(df.columns)}칼럼")

# COMMAND ----------

# DBTITLE 1,Diff 예측 + Corrected SHAP + CQI
# ============================================================
# Diff 예측 + Corrected SHAP + CQI
# ============================================================

def compute_corrected_shap(artifact, df, energy_name):
    """차분 모델 SHAP + 실측값 보정"""
    model = artifact['model_diff']
    features = artifact['features']
    diff_col = artifact['diff_col']
    target_col = artifact['target_col']
    
    X = df[features].values
    dy_actual = df[diff_col].values
    dy_pred = model.predict(X)
    
    # Level 복원
    y_actual = df[target_col].values
    pred_level = np.zeros(len(df))
    pred_level[0] = y_actual[0]
    for i in range(1, len(pred_level)):
        pred_level[i] = y_actual[i-1] + dy_pred[i]
    
    # SHAP
    explainer = shap.TreeExplainer(model)
    shap_raw = explainer.shap_values(X)
    
    # 실측 보정 (Method B)
    residual = dy_actual - dy_pred
    shap_corrected = np.zeros_like(shap_raw)
    cqi = np.zeros(len(df))
    
    for t in range(len(df)):
        s = shap_raw[t]
        s_abs_sum = np.abs(s).sum()
        if s_abs_sum > 0:
            shap_corrected[t] = s + residual[t] * (np.abs(s) / s_abs_sum)
            cqi[t] = np.abs(residual[t]) / s_abs_sum
        else:
            shap_corrected[t] = s + residual[t] / len(features)
            cqi[t] = np.inf
    
    r2 = r2_score(y_actual[1:], pred_level[1:])
    return {
        'name': energy_name, 'target_col': target_col,
        'diff_col': diff_col, 'features': features,
        'dy_actual': dy_actual, 'dy_pred': dy_pred,
        'pred_level': pred_level, 'y_actual': y_actual,
        'shap_raw': shap_raw, 'shap_corrected': shap_corrected,
        'cqi': cqi, 'r2': r2,
    }

def cqi_level(cqi):
    if cqi < 0.5: return 'High'
    elif cqi < 1.0: return 'Medium'
    else: return 'Low'

def cqi_color(cqi):
    if cqi < 0.5: return '#1976D2'
    elif cqi < 1.0: return '#FFC107'
    else: return '#E53935'

print("✅ 3에너지 Diff 예측 + SHAP 보정")
print("="*60)
res_fg = compute_corrected_shap(fg_artifact, df, 'FG')
res_stm = compute_corrected_shap(stm_artifact, df, 'Steam')
res_elec = compute_corrected_shap(elec_artifact, df, 'ELEC')
all_results = [res_fg, res_stm, res_elec]

for res in all_results:
    med_cqi = np.median(res['cqi'][np.isfinite(res['cqi'])])
    high_pct = (res['cqi'] < 0.5).sum() / len(res['cqi']) * 100
    print(f"  {res['name']:6s}: R\u00b2={res['r2']:.4f}, CQI중앙={med_cqi:.3f}, High={high_pct:.0f}%")
print("\n✅ Corrected SHAP 계산 완료")

# COMMAND ----------

# DBTITLE 1,Output 생성 + 저장
# ============================================================
# Output 생성 + 저장
# ============================================================
# Output 구조:
#   [Dashboard용 - 개발자가 바로 사용]
#     1. dashboard_kpi.csv       : 일별 시계열 KPI (line/area chart)
#     2. dashboard_factors.csv   : 그룹별 요인분석 (waterfall/bar chart)
#     3. data_dictionary.csv     : 칼럼 설명서
#     4. metadata.json           : 모델/기준일 정보
#   [상세 분석용 - 드릴다운 필요시]
#     5. detail_features.csv     : 피처별 SHAP (원본/MJ/Won 통합)
# ============================================================

# --- 기준일 설정 ---
td_idx = df.index.get_loc(TARGET_DATE)
week_start = max(0, td_idx - 6)
month_start = max(0, td_idx - 29)

print(f"✅ 기준일: {TARGET_DATE.date()} (idx={td_idx}/{len(df)})")

# --- CQI 칼럼 ---
df['CQI_FG'] = res_fg['cqi']
df['CQI_STM'] = res_stm['cqi']
df['CQI_ELEC'] = res_elec['cqi']
df['CQI_avg'] = (df['CQI_FG'] + df['CQI_STM'] + df['CQI_ELEC']) / 3
df['CQI_level'] = df['CQI_avg'].apply(cqi_level)

# ================================================================
# [1] dashboard_kpi.csv : 일별 시계열 KPI
# ================================================================
df_daily = pd.DataFrame(index=df.index)
df_daily.index.name = 'date'

# 원본 단위
df_daily['fg_bbl'] = df['FG(BBL)']
df_daily['stm_esston'] = df['STEAM(ESSTON)']
df_daily['elec_kwh'] = df['ELEC(KWH)']
df_daily['cdu_bbl'] = df['CDU']
df_daily['atm_temp'] = df['ATM_Temp']
df_daily['rain_mm'] = df['Rain']

# MJ 단위
df_daily['fg_mj'] = df['FG(BBL)'] * MJ_FACTORS['FG'] / 1e6
df_daily['stm_mj'] = df['STEAM(ESSTON)'] * MJ_FACTORS['Steam'] / 1e6
df_daily['elec_mj'] = df['ELEC(KWH)'] * MJ_FACTORS['ELEC'] / 1e6
df_daily['total_mj'] = df_daily['fg_mj'] + df_daily['stm_mj'] + df_daily['elec_mj']
df_daily['sec_mj_per_bbl'] = df_daily['total_mj'] * 1e6 / df['CDU'].clip(lower=1)

# 비용 단위 (M won)
df_daily['fg_cost_mwon'] = df['FG(BBL)'] * COST_PER_UNIT['FG'] / 1e6
df_daily['stm_cost_mwon'] = df['STEAM(ESSTON)'] * COST_PER_UNIT['Steam'] / 1e6
df_daily['elec_cost_mwon'] = df['ELEC(KWH)'] * COST_PER_UNIT['ELEC'] / 1e6
df_daily['total_cost_mwon'] = df_daily['fg_cost_mwon'] + df_daily['stm_cost_mwon'] + df_daily['elec_cost_mwon']
df_daily['unit_cost_won_per_bbl'] = df_daily['total_cost_mwon'] * 1e6 / df['CDU'].clip(lower=1)

# 품질지표
df_daily['cqi_avg'] = (res_fg['cqi'] + res_stm['cqi'] + res_elec['cqi']) / 3
df_daily['cqi_level'] = df_daily['cqi_avg'].apply(cqi_level)

# CQI -> df에도 반영 (시각화용)
df['CQI_FG'] = res_fg['cqi']
df['CQI_STM'] = res_stm['cqi']
df['CQI_ELEC'] = res_elec['cqi']
df['CQI_avg'] = df_daily['cqi_avg'].values
df['CQI_level'] = df_daily['cqi_level'].values

# ================================================================
# [2] dashboard_factors.csv : 그룹별 요인분석 (D-1/W-1/M-1)
# ================================================================
def build_factor_table(results, start_idx, end_idx, horizon_name):
    """그룹별 3단위 통합 요인분석 테이블 생성"""
    group_raw = {}   # group -> {energy: raw_shap_sum}
    group_mj = {}    # group -> mj
    group_won = {}   # group -> won
    
    for res in results:
        shap_sum = res['shap_corrected'][start_idx:end_idx+1].sum(axis=0)
        features = res['features']
        mj_f = MJ_FACTORS[res['name']]
        cost_f = COST_PER_UNIT[res['name']]
        unit = 'BBL' if res['name'] == 'FG' else ('ESSTON' if res['name'] == 'Steam' else 'KWH')
        
        for i, feat in enumerate(features):
            group = feat_to_group.get(feat, '기타')
            # 원본: 에너지별 단위 다르므로 비율로 표시
            group_mj[group] = group_mj.get(group, 0) + shap_sum[i] * mj_f / 1e6
            group_won[group] = group_won.get(group, 0) + shap_sum[i] * cost_f / 1e6
            
            # 에너지별 원본 단위
            key = (group, res['name'])
            group_raw[key] = group_raw.get(key, 0) + shap_sum[i]
    
    # 요약 CQI
    cqi_avg = np.mean([r['cqi'][start_idx:end_idx+1].mean() for r in results])
    
    rows = []
    for group in sorted(set(g for g, _ in group_raw.keys())):
        row = {
            'horizon': horizon_name,
            'group': group,
            'color': group_colors.get(group, '#90A4AE'),
            # MJ 통합
            'impact_mj': group_mj.get(group, 0),
            # Won 통합
            'impact_mwon': group_won.get(group, 0),
            # 에너지별 원본
            'fg_bbl': group_raw.get((group, 'FG'), 0),
            'stm_esston': group_raw.get((group, 'Steam'), 0),
            'elec_kwh': group_raw.get((group, 'ELEC'), 0),
            # 신뢰도
            'cqi_avg': cqi_avg,
            'cqi_level': cqi_level(cqi_avg),
        }
        rows.append(row)
    return rows

factor_rows = []
factor_rows += build_factor_table(all_results, td_idx, td_idx, 'D-1')
factor_rows += build_factor_table(all_results, week_start, td_idx, 'W-1')
factor_rows += build_factor_table(all_results, month_start, td_idx, 'M-1')
df_factors = pd.DataFrame(factor_rows)

# ================================================================
# [3] data_dictionary.csv : 칼럼 설명서
# ================================================================
dict_rows = [
    # dashboard_kpi
    {'file': 'dashboard_kpi.csv', 'column': 'date', 'type': 'date', 'unit': 'YYYY-MM-DD', 'description': '날짜', 'chart_type': 'x축'},
    {'file': 'dashboard_kpi.csv', 'column': 'fg_bbl', 'type': 'float', 'unit': 'BBL', 'description': 'Fuel Gas 소비량 (원본)', 'chart_type': 'line/area'},
    {'file': 'dashboard_kpi.csv', 'column': 'stm_esston', 'type': 'float', 'unit': 'ESSTON', 'description': 'Steam 소비량 (원본)', 'chart_type': 'line/area'},
    {'file': 'dashboard_kpi.csv', 'column': 'elec_kwh', 'type': 'float', 'unit': 'KWH', 'description': '전력 소비량 (원본)', 'chart_type': 'line/area'},
    {'file': 'dashboard_kpi.csv', 'column': 'cdu_bbl', 'type': 'float', 'unit': 'BBL', 'description': '원유처리량', 'chart_type': 'line'},
    {'file': 'dashboard_kpi.csv', 'column': 'total_mj', 'type': 'float', 'unit': 'M MJ', 'description': '총 에너지 (MJ 통합)', 'chart_type': 'line/area'},
    {'file': 'dashboard_kpi.csv', 'column': 'sec_mj_per_bbl', 'type': 'float', 'unit': 'MJ/BBL', 'description': '에너지 원단위 (SEC)', 'chart_type': 'line + 기준선'},
    {'file': 'dashboard_kpi.csv', 'column': 'total_cost_mwon', 'type': 'float', 'unit': 'M won', 'description': '총 에너지 비용 (백만원)', 'chart_type': 'stacked area'},
    {'file': 'dashboard_kpi.csv', 'column': 'unit_cost_won_per_bbl', 'type': 'float', 'unit': 'won/BBL', 'description': '비용 원단위', 'chart_type': 'line + 기준선'},
    {'file': 'dashboard_kpi.csv', 'column': 'cqi_avg', 'type': 'float', 'unit': '-', 'description': '해석 신뢰도 (0=최고, <0.5=High, <1.0=Med, ≥1.0=Low)', 'chart_type': 'scatter + 기준선'},
    {'file': 'dashboard_kpi.csv', 'column': 'cqi_level', 'type': 'string', 'unit': '-', 'description': 'CQI 등급 (High/Medium/Low)', 'chart_type': '색상 매핑'},
    # dashboard_factors
    {'file': 'dashboard_factors.csv', 'column': 'horizon', 'type': 'string', 'unit': '-', 'description': '분석 기간 (D-1=전일, W-1=7일, M-1=30일)', 'chart_type': '필터'},
    {'file': 'dashboard_factors.csv', 'column': 'group', 'type': 'string', 'unit': '-', 'description': '운전요인 그룹명 (원유조성, 2차공정 처리비율 등)', 'chart_type': 'y축 라벨'},
    {'file': 'dashboard_factors.csv', 'column': 'color', 'type': 'string', 'unit': 'hex', 'description': '그룹 대표색상 (#RRGGBB)', 'chart_type': '색상'},
    {'file': 'dashboard_factors.csv', 'column': 'impact_mj', 'type': 'float', 'unit': 'M MJ', 'description': '해당 그룹의 에너지 변동 기여량 (MJ)', 'chart_type': 'waterfall/bar'},
    {'file': 'dashboard_factors.csv', 'column': 'impact_mwon', 'type': 'float', 'unit': 'M won', 'description': '해당 그룹의 비용 변동 기여량 (백만원)', 'chart_type': 'waterfall/bar'},
    {'file': 'dashboard_factors.csv', 'column': 'fg_bbl', 'type': 'float', 'unit': 'BBL', 'description': 'FG 변동 기여 (BBL 원본)', 'chart_type': 'bar'},
    {'file': 'dashboard_factors.csv', 'column': 'stm_esston', 'type': 'float', 'unit': 'ESSTON', 'description': 'Steam 변동 기여 (ESSTON 원본)', 'chart_type': 'bar'},
    {'file': 'dashboard_factors.csv', 'column': 'elec_kwh', 'type': 'float', 'unit': 'KWH', 'description': '전력 변동 기여 (KWH 원본)', 'chart_type': 'bar'},
    {'file': 'dashboard_factors.csv', 'column': 'cqi_avg', 'type': 'float', 'unit': '-', 'description': '해당 기간 평균 CQI (낮을수록 신뢰)', 'chart_type': '색상 매핑'},
    {'file': 'dashboard_factors.csv', 'column': 'cqi_level', 'type': 'string', 'unit': '-', 'description': 'CQI 등급 (High=신뢰, Medium=보통, Low=주의)', 'chart_type': '배지/아이콘'},
    # detail_features
    {'file': 'detail_features.csv', 'column': 'horizon', 'type': 'string', 'unit': '-', 'description': '분석 기간', 'chart_type': '필터'},
    {'file': 'detail_features.csv', 'column': 'energy', 'type': 'string', 'unit': '-', 'description': '에너지 종류 (FG/Steam/ELEC)', 'chart_type': '필터'},
    {'file': 'detail_features.csv', 'column': 'feature', 'type': 'string', 'unit': '-', 'description': '모델 입력 피처명', 'chart_type': 'y축'},
    {'file': 'detail_features.csv', 'column': 'group', 'type': 'string', 'unit': '-', 'description': '피처가 속한 운전요인 그룹', 'chart_type': '색상'},
    {'file': 'detail_features.csv', 'column': 'shap_raw', 'type': 'float', 'unit': '에너지별', 'description': '피처 기여량 (원본 단위: BBL/ESSTON/KWH)', 'chart_type': 'bar'},
    {'file': 'detail_features.csv', 'column': 'shap_mj', 'type': 'float', 'unit': 'M MJ', 'description': '피처 기여량 (MJ 환산)', 'chart_type': 'bar'},
    {'file': 'detail_features.csv', 'column': 'shap_mwon', 'type': 'float', 'unit': 'M won', 'description': '피처 기여량 (비용 환산)', 'chart_type': 'bar'},
]
df_dict = pd.DataFrame(dict_rows)

# ================================================================
# [4] metadata.json : 모델/기준일 정보
# ================================================================
metadata = {
    'target_date': str(TARGET_DATE.date()),
    'data_range': f"{df.index[0].date()} ~ {df.index[-1].date()}",
    'horizons': {
        'D-1': str(df.index[td_idx].date()),
        'W-1': f"{df.index[week_start].date()} ~ {df.index[td_idx].date()}",
        'M-1': f"{df.index[month_start].date()} ~ {df.index[td_idx].date()}",
    },
    'model': {
        'type': 'Unified Diff (AR 없음, 운전변수 100%)',
        'version': 'v1.0_optuna',
        'formula': 'dy = f(ops_features), y_t = y_{t-1} + dy_pred',
        'correction': 'corrected_SHAP = SHAP + residual * (|SHAP| / sum|SHAP|)',
    },
    'cost_factors': {
        'FG': {'value': 113166, 'unit': 'won/FOEB(BBL)'},
        'Steam': {'value': round(COST_PER_UNIT['Steam']), 'unit': 'won/ESSTON', 'note': '61,878 won/FOEB * 0.4894 FOEB/ESSTON'},
        'ELEC': {'value': 177, 'unit': 'won/KWH'},
    },
    'mj_factors': {
        'FG': {'value': 6330.44, 'unit': 'MJ/BBL'},
        'Steam': {'value': 3098.82, 'unit': 'MJ/ESSTON'},
        'ELEC': {'value': 9.55, 'unit': 'MJ/KWH'},
    },
    'cqi': {
        'formula': '|residual| / sum(|SHAP|)',
        'levels': {'High': '< 0.5 (신뢰)', 'Medium': '0.5 ~ 1.0 (보통)', 'Low': '>= 1.0 (주의)'},
        'today': round(df_daily['cqi_avg'].iloc[td_idx], 3),
    },
    'kpi_today': {
        'total_mj': round(df_daily['total_mj'].iloc[td_idx], 1),
        'sec': round(df_daily['sec_mj_per_bbl'].iloc[td_idx], 1),
        'total_cost_mwon': round(df_daily['total_cost_mwon'].iloc[td_idx], 1),
        'unit_cost_won_per_bbl': round(df_daily['unit_cost_won_per_bbl'].iloc[td_idx]),
    },
    'groups': list(group_colors.keys()),
    'group_colors': group_colors,
}

# ================================================================
# [5] detail_features.csv : 피처별 SHAP (원본/MJ/Won 통합)
# ================================================================
def build_detail_features():
    """피처 상세 - 3단위 통합"""
    rows = []
    for horizon, s_idx, e_idx in [('D-1', td_idx, td_idx),
                                    ('W-1', week_start, td_idx),
                                    ('M-1', month_start, td_idx)]:
        for res in all_results:
            shap_sum = res['shap_corrected'][s_idx:e_idx+1].sum(axis=0)
            mj_f = MJ_FACTORS[res['name']]
            cost_f = COST_PER_UNIT[res['name']]
            unit = 'BBL' if res['name'] == 'FG' else ('ESSTON' if res['name'] == 'Steam' else 'KWH')
            
            for i, feat in enumerate(res['features']):
                rows.append({
                    'horizon': horizon,
                    'energy': res['name'],
                    'feature': feat,
                    'group': feat_to_group.get(feat, '기타'),
                    'unit': unit,
                    'shap_raw': round(shap_sum[i], 2),
                    'shap_mj': round(shap_sum[i] * mj_f / 1e6, 4),
                    'shap_mwon': round(shap_sum[i] * cost_f / 1e6, 4),
                })
    return pd.DataFrame(rows)

df_detail = build_detail_features()

# ================================================================
# 저장
# ================================================================
df_daily.to_csv(f'{OUTPUT_DIR}/dashboard_kpi.csv', index=True)
df_factors.to_csv(f'{OUTPUT_DIR}/dashboard_factors.csv', index=False)
df_dict.to_csv(f'{OUTPUT_DIR}/data_dictionary.csv', index=False)
df_detail.to_csv(f'{OUTPUT_DIR}/detail_features.csv', index=False)
with open(f'{OUTPUT_DIR}/metadata.json', 'w', encoding='utf-8') as f:
    json.dump(metadata, f, indent=2, ensure_ascii=False)

print(f"\n✅ Output 저장 완료 ({OUTPUT_DIR}/)")
print(f"")
print(f"   [대시보드용 - 바로 사용]")
print(f"   ├─ dashboard_kpi.csv       : {len(df_daily)}행 (일별 시계열 KPI)")
print(f"   ├─ dashboard_factors.csv   : {len(df_factors)}행 (D-1/W-1/M-1 × 그룹별 요인)")
print(f"   ├─ data_dictionary.csv     : {len(df_dict)}행 (칼럼 설명서)")
print(f"   └─ metadata.json           : 모델/기준일/CQI/환산인자")
print(f"")
print(f"   [상세 분석용 - 드릴다운]")
print(f"   └─ detail_features.csv     : {len(df_detail)}행 (피처별 SHAP, 3단위 통합)")
print(f"")
print(f"   기준일: {TARGET_DATE.date()} | CQI: {metadata['cqi']['today']} ({cqi_level(metadata['cqi']['today'])})")

# COMMAND ----------

# DBTITLE 1,시각화: D-1/W-1/M-1 비용 Waterfall
# ============================================================
# 시각화: D-1/W-1/M-1 비용 Waterfall + 일별 트렌드
# ============================================================
if SHOW_VIZ:
    # --- 그룹별 비용 집계 ---
    def group_cost_summary(results, s_idx, e_idx):
        group_cost = {}
        for res in results:
            shap_sum = res['shap_corrected'][s_idx:e_idx+1].sum(axis=0)
            cost_f = COST_PER_UNIT[res['name']]
            for i, feat in enumerate(res['features']):
                group = feat_to_group.get(feat, '기타')
                group_cost[group] = group_cost.get(group, 0) + shap_sum[i] * cost_f / 1e6
        return group_cost

    d1_gc = group_cost_summary(all_results, td_idx, td_idx)
    w1_gc = group_cost_summary(all_results, week_start, td_idx)
    m1_gc = group_cost_summary(all_results, month_start, td_idx)

    # --- Waterfall 차트 ---
    fig, axes = plt.subplots(1, 3, figsize=(20, 7))
    fig.patch.set_facecolor('#F8F8F8')

    for ax_idx, (title, gc) in enumerate([
        (f'D-1 ({TARGET_DATE.date()})', d1_gc),
        (f'W-1 ({df.index[week_start].date()}~{TARGET_DATE.date()})', w1_gc),
        (f'M-1 ({df.index[month_start].date()}~{TARGET_DATE.date()})', m1_gc),
    ]):
        ax = axes[ax_idx]
        gs = sorted(gc.items(), key=lambda x: abs(x[1]), reverse=True)
        names = [g for g, _ in gs]
        vals = [v for _, v in gs]
        colors = [group_colors.get(g, '#90A4AE') for g in names]
        total = sum(vals)

        ax.barh(range(len(names)), vals, color=colors, edgecolor='white', height=0.6)
        ax.set_yticks(range(len(names)))
        ax.set_yticklabels(names, fontsize=10)
        ax.axvline(0, color='black', linewidth=0.8)
        ax.set_xlabel('Cost Change (M won)', fontweight='bold')
        ax.set_title(f'{title}\nTotal: {total:+,.1f} M won', fontsize=11, fontweight='bold')
        ax.grid(True, alpha=0.3, axis='x')
        ax.invert_yaxis()
        for i, v in enumerate(vals):
            ha = 'left' if v >= 0 else 'right'
            off = max(abs(v)*0.05, 0.01)
            ax.text(v + (off if v >= 0 else -off), i, f'{v:+.1f}',
                    va='center', ha=ha, fontsize=9, fontweight='bold')

    plt.suptitle('Energy Cost Factor Analysis by Group (Won)', fontsize=14, fontweight='bold', y=1.02)
    plt.tight_layout()
    plt.show()

    # --- 일별 비용 트렌드 ---
    fig, axes = plt.subplots(2, 2, figsize=(18, 10))
    last60 = df_daily.iloc[max(0, td_idx-59):td_idx+1]

    # (1) 일별 총 비용
    ax = axes[0, 0]
    ax.stackplot(last60.index, last60['fg_cost_mwon'], last60['stm_cost_mwon'], last60['elec_cost_mwon'],
                 labels=['FG', 'Steam', 'ELEC'], colors=['#E53935', '#FF9800', '#1976D2'], alpha=0.7)
    ax.set_ylabel('Daily Cost (M won)', fontweight='bold')
    ax.set_title('Daily Energy Cost (Stacked)', fontsize=12, fontweight='bold')
    ax.legend(loc='upper left')
    ax.grid(True, alpha=0.3)

    # (2) 원단위 (won/BBL)
    ax = axes[0, 1]
    ax.plot(last60.index, last60['unit_cost_won_per_bbl'], 'o-', color='#7B1FA2', markersize=3, linewidth=1.5)
    ax.axhline(last60['unit_cost_won_per_bbl'].mean(), color='#E53935', linestyle='--',
               label=f"60d Avg={last60['unit_cost_won_per_bbl'].mean():,.0f}")
    ax.set_ylabel('Unit Cost (won/BBL)', fontweight='bold')
    ax.set_title('Energy Unit Cost Trend', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # (3) SEC 트렌드
    ax = axes[1, 0]
    ax.plot(last60.index, last60['sec_mj_per_bbl'], 'o-', color='#00897B', markersize=3, linewidth=1.5)
    ax.axhline(last60['sec_mj_per_bbl'].mean(), color='#E53935', linestyle='--',
               label=f"60d Avg={last60['sec_mj_per_bbl'].mean():.0f}")
    ax.set_ylabel('SEC (MJ/BBL)', fontweight='bold')
    ax.set_title('SEC Trend (Last 60 Days)', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)

    # (4) CQI 트렌드
    ax = axes[1, 1]
    cqi_last60 = df['CQI_avg'].iloc[max(0, td_idx-59):td_idx+1]
    cqi_colors = [cqi_color(c) for c in cqi_last60]
    ax.scatter(last60.index, cqi_last60, c=cqi_colors, s=40, zorder=3, edgecolors='white')
    ax.axhline(0.5, color='#FFC107', linestyle='--', alpha=0.7, label='High/Med')
    ax.axhline(1.0, color='#E53935', linestyle='--', alpha=0.7, label='Med/Low')
    ax.set_ylabel('CQI (avg)', fontweight='bold')
    ax.set_title('CQI Confidence Trend', fontsize=12, fontweight='bold')
    ax.legend()
    ax.grid(True, alpha=0.3)

    plt.tight_layout()
    plt.show()
else:
    print("⏭️ 시각화 Off (SHOW_VIZ=False)")

# COMMAND ----------

# DBTITLE 1,실행 요약
# ============================================================
# 실행 요약
# ============================================================
print(f"{'='*70}")
print(f"  CLX Energy Service v2 - 실행 완료")
print(f"{'='*70}")
print(f"  기준일: {TARGET_DATE.date()}")
print(f"  모델: Unified Diff (v1.0_optuna, AR 없음)")
print(f"  CQI: {metadata['cqi']['today']} ({cqi_level(metadata['cqi']['today'])})")
print(f"")
print(f"  [일별 KPI]")
print(f"    TOTAL MJ:   {metadata['kpi_today']['total_mj']} M MJ")
print(f"    SEC:        {metadata['kpi_today']['sec']} MJ/BBL")
print(f"    TOTAL Cost: {metadata['kpi_today']['total_cost_mwon']} M won")
print(f"    원단위:     {metadata['kpi_today']['unit_cost_won_per_bbl']:,} won/BBL")
print(f"")
print(f"  [Output 파일]")
for fname in ['dashboard_kpi.csv', 'dashboard_factors.csv', 
              'data_dictionary.csv', 'metadata.json', 'detail_features.csv']:
    fpath = f'{OUTPUT_DIR}/{fname}'
    size = os.path.getsize(fpath) / 1024
    print(f"    {fname:30s} ({size:.1f} KB)")
print(f"")
print(f"  [Dashboard 개발자 안내]")
print(f"    1. data_dictionary.csv 읽고 칼럼 확인")
print(f"    2. metadata.json에서 모델/환산인자 확인")
print(f"    3. dashboard_kpi.csv → 시계열 차트")
print(f"    4. dashboard_factors.csv → Waterfall/Bar 차트")
print(f"    5. detail_features.csv → 드릴다운 (피처별 상세)")