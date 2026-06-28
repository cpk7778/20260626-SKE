# Databricks notebook source
# DBTITLE 1,Notebook Overview
# MAGIC %md
# MAGIC # CLX Energy Diff Model Simulation
# MAGIC
# MAGIC **Unified Diff Model** (AR 없음, 운전변수 100% 해석) 기반 에너지 변동 요인 분석 노트북
# MAGIC
# MAGIC ---
# MAGIC
# MAGIC ## 모델 구조
# MAGIC | 항목 | 내용 |
# MAGIC |------|------|
# MAGIC | 예측식 | Δy = f(ops_features), y\_t = y\_{t-1}(obs) + Δy\_pred |
# MAGIC | 보정 | corrected\_SHAP = SHAP + residual × (│SHAP│ / Σ│SHAP│) |
# MAGIC | 품질지표 | CQI = │residual│ / Σ│SHAP│ (High<0.5, Med<1.0, Low≥1.0) |
# MAGIC
# MAGIC ## 분석 모듈
# MAGIC | # | 모듈 | 내용 |
# MAGIC |---|------|------|
# MAGIC | 1-7 | 데이터 준비 | 모델 로드 → Validation → 피처 엔지니어링 → SHAP 보정 → MJ 환산 |
# MAGIC | 8 | 기준일 설정 | `TARGET_DATE` 변경으로 전체 리포트 전환 |
# MAGIC | 9-11 | D-1/W-1/M-1 | 전일/주간/월간 변동 요인 Waterfall (MJ) |
# MAGIC | 12 | SEC | Weather-Adjusted SEC + 트렌드 |
# MAGIC | 13 | Dashboard | KPI + 시계열 + 그룹 Waterfall |
# MAGIC | 14 | Anomaly | 이상감지 (SEC±3%, Z>2.5) + CQI 신뢰도 |
# MAGIC | 15 | Validation | 기준일 피처 OOR/Z-score 시각화 |
# MAGIC | 16-17 | 비용 분석 | Won 환산 + D-1/W-1/M-1 비용 리포트 |
# MAGIC
# MAGIC ## 비용 환산인자
# MAGIC | 에너지 | 단가 | 비고 |
# MAGIC |--------|------|------|
# MAGIC | F/G | 113,166 won/FOEB | 직접 적용 |
# MAGIC | Steam | 61,878 won/FOEB | ESSTON→FOEB 환산 (×0.4894) |
# MAGIC | ELEC | 177 won/KWH | 직접 적용 |
# MAGIC
# MAGIC ## 사용법
# MAGIC 1. **기준일 변경**: Cell 8의 `TARGET_DATE` 수정 후 Cell 8~17 재실행
# MAGIC 2. **신규 데이터**: `clx_energy_recent.csv` 갱신 후 Cell 1~17 전체 실행

# COMMAND ----------

# DBTITLE 1,패키지 설치
# MAGIC %pip install xgboost joblib shap -q

# COMMAND ----------

# DBTITLE 1,라이브러리 임포트
# ============================================================
# 라이브러리 임포트
# ============================================================
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import shap
import joblib
import json
from xgboost import XGBRegressor
from sklearn.metrics import r2_score, mean_absolute_percentage_error, mean_squared_error
from datetime import timedelta
import warnings
warnings.filterwarnings('ignore')

# 시각화 스타일
plt.rcParams['figure.facecolor'] = '#F8F8F8'
plt.rcParams['axes.facecolor'] = '#FFFFFF'
plt.rcParams['font.size'] = 10
print("✅ 라이브러리 로드 완료")

# COMMAND ----------

# DBTITLE 1,Diff 모델 + 메타데이터 로드
# ============================================================
# Diff 모델 + 메타데이터 로드
# ============================================================
MODEL_DIR = '/Workspace/Users/sk16381@skcorp.com/CLX_Energy_Analysis_prj/Models'

# 3에너지 Diff 모델 로드
fg_artifact = joblib.load(f'{MODEL_DIR}/fg_diff_model.joblib')
stm_artifact = joblib.load(f'{MODEL_DIR}/steam_diff_model.joblib')
elec_artifact = joblib.load(f'{MODEL_DIR}/elec_diff_model.joblib')

# 메타데이터 로드
with open(f'{MODEL_DIR}/diff_train_metadata.json', 'r') as f:
    train_meta = json.load(f)

# train_stats 보완 (raw_column_stats에서 가져오기)
if 'train_stats' not in train_meta:
    old_meta_path = f'{MODEL_DIR}/train_metadata.json'
    import os
    if os.path.exists(old_meta_path):
        with open(old_meta_path, 'r') as f:
            old_meta = json.load(f)
        if 'raw_column_stats' in old_meta:
            train_meta['train_stats'] = old_meta['raw_column_stats']

# 모델 정보 출력
print("✅ Diff 모델 로드 완료")
print(f"   모델 버전: {fg_artifact.get('version', 'unknown')}")
print(f"   모델 타입: {fg_artifact.get('model_type', 'unknown')}")
for art, name in [(fg_artifact, 'FG'), (stm_artifact, 'Steam'), (elec_artifact, 'ELEC')]:
    print(f"   {name}: {art['target_col']}, features={len(art['features'])}"
          f", R\u00b2={art.get('r2_test',0):.4f}, MAPE={art.get('mape_test',0):.2f}%")

# MJ 환산인자
MJ_FACTORS = {'FG': 6330.44, 'Steam': 3098.82, 'ELEC': 9.55}

# feature_groups 로드
import csv
fg_path = '/Workspace/Users/sk16381@skcorp.com/CLX_Energy_Analysis_prj/Modeling/feature_groups.csv'
feat_to_group, group_colors = {}, {}
with open(fg_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    for row in reader:
        feat_to_group[row['Feature']] = row['Group_KR']
        group_colors[row['Group_KR']] = row['Color']

# COMMAND ----------

# DBTITLE 1,신규 데이터 로드 + Validation
# ============================================================
# 신규 데이터 로드 + Validation
# ============================================================
DATA_PATH = '/Workspace/Users/sk16381@skcorp.com/CLX_Energy_Analysis_prj/Recent_Data/clx_energy_recent.csv'

df = pd.read_csv(DATA_PATH)
df['Date'] = pd.to_datetime(df.iloc[:, 0])
df = df.set_index('Date').sort_index()

# 칼럼명 정리
if 'ATM Temp.' in df.columns:
    df = df.rename(columns={'ATM Temp.': 'ATM_Temp'})

print(f"✅ 데이터 로드: {len(df)}행, {df.index[0].date()} ~ {df.index[-1].date()}")
print(f"   칼럼: {list(df.columns[:14])}")

# Validation: 학습 데이터 범위 vs 신규 데이터 비교
if 'train_stats' in train_meta:
    print(f"\n   [Validation Check]")
    for col, stats in train_meta['train_stats'].items():
        if col in df.columns:
            oor = ((df[col] < stats['min']) | (df[col] > stats['max'])).mean() * 100
            flag = '❌' if oor > 20 else ('⚠️' if oor > 5 else '✅')
            if oor > 0:
                print(f"   {flag} {col}: {oor:.1f}% out-of-range")
else:
    print("   ⚠️ train_stats 없음 - Validation 생략")

# COMMAND ----------

# DBTITLE 1,피처 엔지니어링 (공통 + Rain + 계절 + 차분)
# ============================================================
# 피처 엔지니어링 (공통 + Rain + 계절 + 차분)
# ============================================================

# --- 공통 피처 ---
df['RFCC_ratio'] = df['RFCC'] / df['CDU'].clip(lower=1)
df['RDS_ratio'] = df['RDS'] / df['CDU'].clip(lower=1)
df['UC_ratio'] = df['UC'] / df['CDU'].clip(lower=1)
df['CDU_ma7'] = df['CDU'].rolling(7, min_periods=1).mean()
df['CDU_diff'] = df['CDU'].diff().fillna(0)
df['heavy_ratio'] = df['FO'] + df['EHC']
df['light_ratio'] = df['Mild'] + df['L/S']

# --- Rain 피처 (Steam용) ---
df['is_rain'] = (df['Rain'] > 0).astype(int)
df['rain_intensity'] = df['Rain'].clip(upper=df['Rain'].quantile(0.99))
df['Rain_lag1'] = df['Rain'].shift(1).fillna(0)
df['Rain_cumsum3'] = df['Rain'].rolling(3, min_periods=1).sum()

# days_since_rain
df['days_since_rain'] = 0
last_rain = -999
for i in range(len(df)):
    if df['Rain'].iloc[i] > 0:
        last_rain = i
    df.iloc[i, df.columns.get_loc('days_since_rain')] = i - last_rain if last_rain >= 0 else 30
df['days_since_rain'] = df['days_since_rain'].clip(upper=30)

# --- 계절/온도 피처 ---
day_of_year = df.index.dayofyear
df['season_sin'] = np.sin(2 * np.pi * day_of_year / 365.25)
df['season_cos'] = np.cos(2 * np.pi * day_of_year / 365.25)
df['HDD'] = np.maximum(18 - df['ATM_Temp'], 0)
df['ATM_Temp_ma7'] = df['ATM_Temp'].rolling(7, min_periods=1).mean()
df['Rain_x_cold'] = df['rain_intensity'] * df['HDD']

# --- 차분 칼럼 ---
df['FG_diff'] = df['FG(BBL)'].diff()
df['STM_diff'] = df['STEAM(ESSTON)'].diff()
df['ELEC_diff'] = df['ELEC(KWH)'].diff()

# 첫 행 NaN 제거
df = df.iloc[1:].copy()

print(f"✅ 피처 엔지니어링 완료: {len(df)}행, {len(df.columns)}칼럼")
print(f"   차분 칼럼: FG_diff, STM_diff, ELEC_diff")
print(f"   Rain 피처: is_rain, rain_intensity, Rain_lag1, Rain_cumsum3, days_since_rain, Rain_x_cold")
print(f"   계절 피처: season_sin, season_cos, HDD, ATM_Temp_ma7")

# COMMAND ----------

# DBTITLE 1,3에너지 Diff 예측 + 실측 보정 (Corrected SHAP)
# ============================================================
# 3에너지 Diff 예측 + 실측 보정 (Corrected SHAP)
# ============================================================

def compute_corrected_shap(artifact, df, energy_name):
    """
    차분 모델 SHAP 계산 + 실측값 보정
    - corrected_SHAP_i = SHAP_i + residual × (|SHAP_i| / Σ|SHAP|)
    - Σ corrected_SHAP = Δy_actual (정확히 일치)
    """
    model = artifact['model_diff']
    features = artifact['features']
    diff_col = artifact['diff_col']
    target_col = artifact['target_col']
    
    X = df[features].values
    dy_actual = df[diff_col].values
    dy_pred = model.predict(X)
    
    # Level 복원 (1-step forecast: y_t = y_{t-1} + Δy_pred)
    y_actual = df[target_col].values
    pred_level = np.zeros(len(df))
    pred_level[0] = y_actual[0]  # 첫날은 실측값
    for i in range(1, len(pred_level)):
        pred_level[i] = y_actual[i-1] + dy_pred[i]
    
    # SHAP 계산
    explainer = shap.TreeExplainer(model)
    shap_raw = explainer.shap_values(X)  # (N, n_features)
    
    # 실측 보정 (Method B: 가산 잔차 배분)
    residual = dy_actual - dy_pred
    shap_corrected = np.zeros_like(shap_raw)
    cqi = np.zeros(len(df))
    
    for t in range(len(df)):
        s = shap_raw[t]
        s_abs_sum = np.abs(s).sum()
        if s_abs_sum > 0:
            weights = np.abs(s) / s_abs_sum
            shap_corrected[t] = s + residual[t] * weights
            cqi[t] = np.abs(residual[t]) / s_abs_sum
        else:
            shap_corrected[t] = s + residual[t] / len(features)
            cqi[t] = np.inf
    
    # R² (Level)
    r2 = r2_score(y_actual[1:], pred_level[1:])
    
    print(f"  {energy_name}: R\u00b2={r2:.4f}, CQI\uc911\uc559={np.median(cqi[np.isfinite(cqi)]):.3f}"
          f", High={((cqi<0.5).sum()/len(cqi)*100):.0f}%")
    
    return {
        'name': energy_name,
        'target_col': target_col, 'diff_col': diff_col,
        'features': features,
        'dy_actual': dy_actual, 'dy_pred': dy_pred,
        'pred_level': pred_level, 'y_actual': y_actual,
        'shap_raw': shap_raw, 'shap_corrected': shap_corrected,
        'cqi': cqi, 'r2': r2,
    }

print("✅ 3에너지 Diff 예측 + SHAP 보정")
print("="*60)
res_fg = compute_corrected_shap(fg_artifact, df, 'FG')
res_stm = compute_corrected_shap(stm_artifact, df, 'Steam')
res_elec = compute_corrected_shap(elec_artifact, df, 'ELEC')
all_results = [res_fg, res_stm, res_elec]
print("\n✅ Corrected SHAP 계산 완료 (Σ corrected_SHAP = Δy_actual 보장)")

# COMMAND ----------

# DBTITLE 1,MJ 환산 + CQI 통합 DataFrame 구성
# ============================================================
# MJ 환산 + CQI 통합 DataFrame 구성
# ============================================================

# --- MJ 환산 ---
df['FG_MJ'] = df['FG(BBL)'] * MJ_FACTORS['FG']
df['STM_MJ'] = df['STEAM(ESSTON)'] * MJ_FACTORS['Steam']
df['ELEC_MJ'] = df['ELEC(KWH)'] * MJ_FACTORS['ELEC']
df['TOTAL_MJ'] = df['FG_MJ'] + df['STM_MJ'] + df['ELEC_MJ']
df['SEC'] = df['TOTAL_MJ'] / df['CDU'].clip(lower=1)

# --- CQI 칼럼 ---
df['CQI_FG'] = res_fg['cqi']
df['CQI_STM'] = res_stm['cqi']
df['CQI_ELEC'] = res_elec['cqi']
df['CQI_avg'] = (df['CQI_FG'] + df['CQI_STM'] + df['CQI_ELEC']) / 3

# CQI 신뢰도 레벨
def cqi_level(cqi):
    if cqi < 0.5: return 'High'
    elif cqi < 1.0: return 'Medium'
    else: return 'Low'

def cqi_color(cqi):
    if cqi < 0.5: return '#1976D2'  # 파란
    elif cqi < 1.0: return '#FFC107'  # 노란
    else: return '#E53935'  # 빨간

df['CQI_level'] = df['CQI_avg'].apply(cqi_level)

# --- Diff 예측값 칼럼 ---
df['FG_diff_pred'] = res_fg['dy_pred']
df['STM_diff_pred'] = res_stm['dy_pred']
df['ELEC_diff_pred'] = res_elec['dy_pred']

# --- ΔMJ 칼럼 ---
df['FG_dMJ'] = df['FG_diff'] * MJ_FACTORS['FG']
df['STM_dMJ'] = df['STM_diff'] * MJ_FACTORS['Steam']
df['ELEC_dMJ'] = df['ELEC_diff'] * MJ_FACTORS['ELEC']
df['TOTAL_dMJ'] = df['FG_dMJ'] + df['STM_dMJ'] + df['ELEC_dMJ']

print(f"✅ MJ 환산 + CQI 통합 완료")
print(f"   CQI 분포: High={df['CQI_level'].value_counts().get('High',0)}"
      f", Med={df['CQI_level'].value_counts().get('Medium',0)}"
      f", Low={df['CQI_level'].value_counts().get('Low',0)}")
print(f"   TOTAL_MJ 평균: {df['TOTAL_MJ'].mean()/1e6:.1f} M MJ/day")
print(f"   SEC 평균: {df['SEC'].mean():.1f} MJ/BBL")

# COMMAND ----------

# DBTITLE 1,기준일 설정 (파라미터)
# ============================================================
# 기준일 설정
# ============================================================
TARGET_DATE = pd.Timestamp('2026-03-16')

# 기준일 인덱스
td_idx = df.index.get_loc(TARGET_DATE)

print(f"✅ 기준일: {TARGET_DATE.date()}")
print(f"   인덱스: {td_idx}/{len(df)}")
print(f"   TOTAL_MJ: {df['TOTAL_MJ'].iloc[td_idx]/1e6:.2f} M MJ")
print(f"   SEC: {df['SEC'].iloc[td_idx]:.1f} MJ/BBL")
print(f"   CQI: {df['CQI_avg'].iloc[td_idx]:.3f} ({cqi_level(df['CQI_avg'].iloc[td_idx])})")

# COMMAND ----------

# DBTITLE 1,D-1 해석: 전일 대비 변화 (Corrected SHAP)
# ============================================================
# D-1 해석: 전일 대비 변화 (Corrected SHAP 직접 출력)
# - AR 없음, 운전변수가 100% 설명
# - Σ corrected_SHAP = Δy_actual
# ============================================================

print(f"{'='*70}")
print(f"  [D-1] 전일 대비 변화 원인 (기준일: {TARGET_DATE.date()})")
print(f"{'='*70}")
print(f"  모델: Unified Diff (AR 없음, 운전변수 100%)")
print(f"  보정: 실측값 기반 가산 잔차 배분")

fig, axes = plt.subplots(1, 3, figsize=(20, 6))
fig.patch.set_facecolor('#F8F8F8')

for idx, res in enumerate(all_results):
    ax = axes[idx]
    shap_d1 = res['shap_corrected'][td_idx]
    dy_act = res['dy_actual'][td_idx]
    cqi_val = res['cqi'][td_idx]
    features = res['features']
    mj_f = MJ_FACTORS[res['name']]
    
    # Top 10 피처
    ranked = np.argsort(np.abs(shap_d1))[::-1][:10]
    vals_mj = [shap_d1[i] * mj_f / 1e6 for i in ranked]
    labels = [features[i] for i in ranked]
    colors = ['#E53935' if v > 0 else '#1976D2' for v in vals_mj]
    
    ax.barh(range(len(vals_mj)), vals_mj, color=colors, edgecolor='white', height=0.7)
    ax.set_yticks(range(len(vals_mj)))
    ax.set_yticklabels(labels, fontsize=9)
    ax.axvline(0, color='black', linewidth=0.8)
    ax.set_xlabel('SHAP (M MJ)', fontweight='bold')
    
    conf_color = cqi_color(cqi_val)
    conf_label = cqi_level(cqi_val)
    ax.set_title(f"{res['name']} D-1: {dy_act*mj_f/1e6:+.2f} M MJ\n"
                 f"CQI={cqi_val:.2f} [{conf_label}]",
                 fontsize=11, fontweight='bold', color=conf_color)
    ax.grid(True, alpha=0.3, axis='x')
    ax.invert_yaxis()
    
    # 요약 출력
    print(f"\n  [{res['name']}] Δy={dy_act:+,.0f}, CQI={cqi_val:.2f} ({conf_label})")
    for i in ranked[:5]:
        feat = features[i]
        val_mj = shap_d1[i] * mj_f / 1e6
        group = feat_to_group.get(feat, '-')
        print(f"    {feat:18s} {val_mj:+.3f} M MJ  ({group})")

plt.tight_layout()
plt.suptitle(f'D-1 Factor Analysis: Corrected SHAP ({TARGET_DATE.date()})',
             fontsize=13, fontweight='bold', y=1.02)
plt.show()

# COMMAND ----------

# DBTITLE 1,W-1 해석: 주간 누적 변화 (7일 합산)
# ============================================================
# W-1 해석: 주간 누적 변화 (7일 corrected SHAP 합산)
# - Σ corrected_SHAP[7일] = Δy_actual(7일) 정확 일치
# ============================================================

week_start = max(0, td_idx - 6)
cqi_week_avg = df['CQI_avg'].iloc[week_start:td_idx+1].mean()

print(f"{'='*70}")
print(f"  [W-1] 주간 누적 변화 ({df.index[week_start].date()} ~ {TARGET_DATE.date()})")
print(f"  평균 CQI: {cqi_week_avg:.2f} ({cqi_level(cqi_week_avg)})")
print(f"{'='*70}")

fig, axes = plt.subplots(1, 3, figsize=(20, 6))

for idx, res in enumerate(all_results):
    ax = axes[idx]
    shap_w1 = res['shap_corrected'][week_start:td_idx+1].sum(axis=0)
    dy_week = res['dy_actual'][week_start:td_idx+1].sum()
    cqi_w = res['cqi'][week_start:td_idx+1].mean()
    features = res['features']
    mj_f = MJ_FACTORS[res['name']]
    
    # Top 10
    ranked = np.argsort(np.abs(shap_w1))[::-1][:10]
    vals_mj = [shap_w1[i] * mj_f / 1e6 for i in ranked]
    labels = [features[i] for i in ranked]
    colors = ['#E53935' if v > 0 else '#1976D2' for v in vals_mj]
    
    ax.barh(range(len(vals_mj)), vals_mj, color=colors, edgecolor='white', height=0.7)
    ax.set_yticks(range(len(vals_mj)))
    ax.set_yticklabels(labels, fontsize=9)
    ax.axvline(0, color='black', linewidth=0.8)
    ax.set_xlabel('Cumulative SHAP (M MJ)', fontweight='bold')
    ax.set_title(f"{res['name']} W-1: {dy_week*mj_f/1e6:+.2f} M MJ\n"
                 f"CQI={cqi_w:.2f} [{cqi_level(cqi_w)}]",
                 fontsize=11, fontweight='bold', color=cqi_color(cqi_w))
    ax.grid(True, alpha=0.3, axis='x')
    ax.invert_yaxis()
    
    print(f"\n  [{res['name']}] ΣΔy(7d)={dy_week:+,.0f} = {dy_week*mj_f/1e6:+.2f} M MJ, CQI={cqi_w:.2f}")
    for i in ranked[:5]:
        feat = features[i]
        val_mj = shap_w1[i] * mj_f / 1e6
        group = feat_to_group.get(feat, '-')
        print(f"    {feat:18s} {val_mj:+.3f} M MJ  ({group})")

plt.tight_layout()
plt.suptitle(f'W-1 Factor Analysis: 7-Day Cumulative Corrected SHAP',
             fontsize=13, fontweight='bold', y=1.02)
plt.show()

# COMMAND ----------

# DBTITLE 1,M-1 해석: 월간 누적 변화 (30일 합산)
# ============================================================
# M-1 해석: 월간 누적 변화 (30일 corrected SHAP 합산)
# - Σ corrected_SHAP[30일] = Δy_actual(30일) 정확 일치
# ============================================================

month_start = max(0, td_idx - 29)
cqi_month_avg = df['CQI_avg'].iloc[month_start:td_idx+1].mean()

print(f"{'='*70}")
print(f"  [M-1] 월간 누적 변화 ({df.index[month_start].date()} ~ {TARGET_DATE.date()})")
print(f"  평균 CQI: {cqi_month_avg:.2f} ({cqi_level(cqi_month_avg)})")
print(f"{'='*70}")

# 그룹별 합산 Waterfall (MJ 통합)
group_mj_total = {}  # 그룹별 총 MJ 변화

for res in all_results:
    shap_m1 = res['shap_corrected'][month_start:td_idx+1].sum(axis=0)
    features = res['features']
    mj_f = MJ_FACTORS[res['name']]
    
    dy_month = res['dy_actual'][month_start:td_idx+1].sum()
    cqi_m = res['cqi'][month_start:td_idx+1].mean()
    
    print(f"\n  [{res['name']}] ΣΔy(30d)={dy_month:+,.0f} = {dy_month*mj_f/1e6:+.2f} M MJ"
          f", CQI={cqi_m:.2f} ({cqi_level(cqi_m)})")
    
    # 그룹별 집계
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        mj_val = shap_m1[i] * mj_f / 1e6
        group_mj_total[group] = group_mj_total.get(group, 0) + mj_val
    
    # Top 5 피처
    ranked = np.argsort(np.abs(shap_m1))[::-1][:5]
    for i in ranked:
        feat = features[i]
        val_mj = shap_m1[i] * mj_f / 1e6
        group = feat_to_group.get(feat, '-')
        print(f"    {feat:18s} {val_mj:+.3f} M MJ  ({group})")

# 그룹별 Waterfall
print(f"\n  [그룹별 통합 MJ 변화 (30일)]")
groups_sorted = sorted(group_mj_total.items(), key=lambda x: abs(x[1]), reverse=True)
for g, v in groups_sorted:
    print(f"    {g:12s} {v:+.2f} M MJ")
total_change = sum(group_mj_total.values())
print(f"    {'TOTAL':12s} {total_change:+.2f} M MJ")

# 그룹 Waterfall 차트
fig, ax = plt.subplots(figsize=(12, 6))
groups_names = [g for g, _ in groups_sorted]
groups_vals = [v for _, v in groups_sorted]
colors_wf = [group_colors.get(g, '#90A4AE') for g in groups_names]

ax.barh(range(len(groups_names)), groups_vals, color=colors_wf, edgecolor='white', height=0.6)
ax.set_yticks(range(len(groups_names)))
ax.set_yticklabels(groups_names, fontsize=11)
ax.axvline(0, color='black', linewidth=0.8)
ax.set_xlabel('Cumulative SHAP (M MJ / 30 days)', fontweight='bold')
ax.set_title(f'M-1 Group Waterfall: Total Energy Change (CQI={cqi_month_avg:.2f})',
             fontsize=12, fontweight='bold')
ax.grid(True, alpha=0.3, axis='x')
ax.invert_yaxis()

for i, (v, name) in enumerate(zip(groups_vals, groups_names)):
    ha = 'left' if v >= 0 else 'right'
    off = max(abs(v)*0.03, 0.01)
    ax.text(v + (off if v >= 0 else -off), i, f'{v:+.2f}',
            va='center', ha=ha, fontsize=10, fontweight='bold')

plt.tight_layout()
plt.show()

# COMMAND ----------

# DBTITLE 1,SEC 분석 (Weather-Adjusted SEC)
# ============================================================
# SEC 분석 (Weather-Adjusted SEC)
# - SEC = TOTAL_MJ / CDU
# - Weather-Adjusted: 환경/계절 그룹 SHAP 제거
# ============================================================

# 환경/계절 피처 목록
weather_features = {'ATM_Temp', 'ATM_Temp_ma7', 'season_sin', 'season_cos', 'HDD'}

# 월별 SEC 트렌드
df['month'] = df.index.to_period('M')
monthly_sec = df.groupby('month').agg(
    SEC_mean=('SEC', 'mean'),
    CDU_mean=('CDU', 'mean'),
    TOTAL_MJ_mean=('TOTAL_MJ', 'mean')
).reset_index()
monthly_sec['month_str'] = monthly_sec['month'].astype(str)

# Weather-adjusted SEC: 기준일의 날씨 효과 제거
weather_mj_today = 0
for res in all_results:
    features = res['features']
    shap_today = res['shap_corrected'][td_idx]
    mj_f = MJ_FACTORS[res['name']]
    for i, feat in enumerate(features):
        if feat in weather_features:
            weather_mj_today += shap_today[i] * mj_f

sec_raw = df['SEC'].iloc[td_idx]
sec_adj = (df['TOTAL_MJ'].iloc[td_idx] - weather_mj_today) / df['CDU'].iloc[td_idx]

print(f"{'='*70}")
print(f"  SEC 분석 (기준일: {TARGET_DATE.date()})")
print(f"{'='*70}")
print(f"  원본 SEC: {sec_raw:.1f} MJ/BBL")
print(f"  날씨 보정 SEC: {sec_adj:.1f} MJ/BBL")
print(f"  날씨 기여: {weather_mj_today/1e6:+.3f} M MJ ({weather_mj_today/df['CDU'].iloc[td_idx]:+.1f} MJ/BBL)")

# SEC 트렌드 차트
fig, axes = plt.subplots(1, 2, figsize=(16, 5))

# 월별 SEC
ax = axes[0]
ax.plot(monthly_sec['month_str'], monthly_sec['SEC_mean'], 'o-', color='#1976D2', linewidth=2)
ax.axhline(monthly_sec['SEC_mean'].mean(), color='#E53935', linestyle='--', label=f"Avg={monthly_sec['SEC_mean'].mean():.0f}")
ax.set_xlabel('Month')
ax.set_ylabel('SEC (MJ/BBL)', fontweight='bold')
ax.set_title('Monthly SEC Trend', fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)
plt.setp(ax.get_xticklabels(), rotation=45, ha='right')

# SEC vs CDU 산점도
ax = axes[1]
sc = ax.scatter(df['CDU'], df['SEC'], c=df['CQI_avg'], cmap='RdYlGn_r', 
                alpha=0.6, s=20, vmin=0, vmax=1.5)
ax.scatter(df['CDU'].iloc[td_idx], df['SEC'].iloc[td_idx], 
           s=200, color='red', marker='*', zorder=5, label=f'Today ({TARGET_DATE.date()})')
ax.set_xlabel('CDU (BBL/day)', fontweight='bold')
ax.set_ylabel('SEC (MJ/BBL)', fontweight='bold')
ax.set_title('SEC vs Throughput (colored by CQI)', fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)
plt.colorbar(sc, ax=ax, label='CQI (lower=better)')

plt.tight_layout()
plt.show()

# COMMAND ----------

# DBTITLE 1,Daily Energy Dashboard v5 (CQI 경고 포함)
# ============================================================
# Daily Energy Dashboard v5 (CQI 경고 포함)
# ============================================================

fig = plt.figure(figsize=(22, 28))
gs = fig.add_gridspec(6, 4, height_ratios=[0.7, 1.0, 1.0, 1.0, 1.0, 0.8],
                      hspace=0.35, wspace=0.3)
fig.patch.set_facecolor('#F8F8F8')

# === Row 0: KPI Cards ===
kpi_data = [
    ('TOTAL', df['TOTAL_MJ'].iloc[td_idx]/1e6, 'M MJ', df['CQI_avg'].iloc[td_idx]),
    ('FG', df['FG_MJ'].iloc[td_idx]/1e6, 'M MJ', df['CQI_FG'].iloc[td_idx]),
    ('Steam', df['STM_MJ'].iloc[td_idx]/1e6, 'M MJ', df['CQI_STM'].iloc[td_idx]),
    ('ELEC', df['ELEC_MJ'].iloc[td_idx]/1e6, 'M MJ', df['CQI_ELEC'].iloc[td_idx]),
]

for col, (name, val, unit, cqi_val) in enumerate(kpi_data):
    ax = fig.add_subplot(gs[0, col])
    ax.set_xlim(0, 1)
    ax.set_ylim(0, 1)
    ax.axis('off')
    
    # CQI 배경색
    bg_color = cqi_color(cqi_val)
    ax.add_patch(plt.Rectangle((0.05, 0.05), 0.9, 0.9, 
                               facecolor=bg_color, alpha=0.1, edgecolor=bg_color, linewidth=2))
    ax.text(0.5, 0.75, name, ha='center', va='center', fontsize=14, fontweight='bold')
    ax.text(0.5, 0.45, f'{val:.1f}', ha='center', va='center', fontsize=22, fontweight='bold')
    ax.text(0.5, 0.25, unit, ha='center', va='center', fontsize=10, color='gray')
    # CQI 배지
    ax.text(0.5, 0.08, f'CQI={cqi_val:.2f} [{cqi_level(cqi_val)}]',
            ha='center', va='center', fontsize=9, color=bg_color, fontweight='bold')

# === Row 1: D-1 Source Waterfall (3에너지 합산) ===
ax = fig.add_subplot(gs[1, :])
source_labels = ['FG', 'Steam', 'ELEC']
source_vals = [res['dy_actual'][td_idx] * MJ_FACTORS[res['name']] / 1e6 for res in all_results]
source_colors = ['#E53935', '#FF9800', '#1976D2']
ax.bar(source_labels, source_vals, color=source_colors, edgecolor='white', width=0.5)
ax.axhline(0, color='black', linewidth=0.8)
for i, v in enumerate(source_vals):
    ax.text(i, v + (0.1 if v >= 0 else -0.3), f'{v:+.2f}', ha='center', fontweight='bold')
ax.set_ylabel('D-1 Change (M MJ)', fontweight='bold')
ax.set_title(f'D-1 Energy Source Change ({TARGET_DATE.date()})', fontsize=12, fontweight='bold')
ax.grid(True, alpha=0.3, axis='y')

# === Row 2: D-1 Group SHAP Waterfall ===
ax = fig.add_subplot(gs[2, :])
group_d1 = {}
for res in all_results:
    shap_d1 = res['shap_corrected'][td_idx]
    features = res['features']
    mj_f = MJ_FACTORS[res['name']]
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        group_d1[group] = group_d1.get(group, 0) + shap_d1[i] * mj_f / 1e6

groups_s = sorted(group_d1.items(), key=lambda x: abs(x[1]), reverse=True)
g_names = [g for g, _ in groups_s]
g_vals = [v for _, v in groups_s]
g_colors = [group_colors.get(g, '#90A4AE') for g in g_names]

ax.barh(range(len(g_names)), g_vals, color=g_colors, edgecolor='white', height=0.6)
ax.set_yticks(range(len(g_names)))
ax.set_yticklabels(g_names, fontsize=10)
ax.axvline(0, color='black', linewidth=0.8)
ax.set_xlabel('D-1 Group SHAP (M MJ)', fontweight='bold')
ax.set_title('D-1 Group Factor Waterfall (Corrected SHAP, No AR)', fontsize=12, fontweight='bold')
ax.grid(True, alpha=0.3, axis='x')
ax.invert_yaxis()
for i, v in enumerate(g_vals):
    ax.text(v + (0.005 if v >= 0 else -0.005), i, f'{v:+.3f}', 
            va='center', ha='left' if v >= 0 else 'right', fontsize=9, fontweight='bold')

# === Row 3: W-1 Group Waterfall ===
ax = fig.add_subplot(gs[3, :])
group_w1 = {}
for res in all_results:
    shap_w1 = res['shap_corrected'][week_start:td_idx+1].sum(axis=0)
    features = res['features']
    mj_f = MJ_FACTORS[res['name']]
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        group_w1[group] = group_w1.get(group, 0) + shap_w1[i] * mj_f / 1e6

groups_w = sorted(group_w1.items(), key=lambda x: abs(x[1]), reverse=True)
gw_names = [g for g, _ in groups_w]
gw_vals = [v for _, v in groups_w]
gw_colors = [group_colors.get(g, '#90A4AE') for g in gw_names]

ax.barh(range(len(gw_names)), gw_vals, color=gw_colors, edgecolor='white', height=0.6)
ax.set_yticks(range(len(gw_names)))
ax.set_yticklabels(gw_names, fontsize=10)
ax.axvline(0, color='black', linewidth=0.8)
ax.set_xlabel('W-1 Cumulative Group SHAP (M MJ)', fontweight='bold')
ax.set_title(f'W-1 Group Factor Waterfall (7-day sum, CQI={cqi_week_avg:.2f})',
             fontsize=12, fontweight='bold')
ax.grid(True, alpha=0.3, axis='x')
ax.invert_yaxis()

# === Row 4: SEC Trend + CQI ===
ax = fig.add_subplot(gs[4, :2])
last30 = df.iloc[max(0,td_idx-30):td_idx+1]
ax.plot(last30.index, last30['SEC'], 'o-', color='#1976D2', linewidth=1.5, markersize=3)
ax.axhline(df['SEC'].mean(), color='#E53935', linestyle='--', alpha=0.7, label=f"Period Avg={df['SEC'].mean():.0f}")
ax.scatter([TARGET_DATE], [df['SEC'].iloc[td_idx]], s=100, color='red', zorder=5)
ax.set_xlabel('Date')
ax.set_ylabel('SEC (MJ/BBL)', fontweight='bold')
ax.set_title('SEC Trend (Last 30 Days)', fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)

# CQI 트렌드
ax = fig.add_subplot(gs[4, 2:])
ax.plot(last30.index, last30['CQI_avg'], 'o-', color='#333', linewidth=1, markersize=3)
ax.axhline(0.5, color='#4CAF50', linestyle='--', linewidth=1.5)
ax.axhline(1.0, color='#E53935', linestyle='--', linewidth=1.5)
ax.fill_between(last30.index, 0, 0.5, alpha=0.05, color='#4CAF50')
ax.fill_between(last30.index, 0.5, 1.0, alpha=0.05, color='#FFC107')
ax.set_xlabel('Date')
ax.set_ylabel('CQI', fontweight='bold')
ax.set_title('CQI Trend (Last 30 Days)', fontsize=12, fontweight='bold')
ax.set_ylim(0, min(2, last30['CQI_avg'].max()*1.2))
ax.grid(True, alpha=0.3)

# === Row 5: 데이터 검증 요약 ===
ax = fig.add_subplot(gs[5, :])
ax.axis('off')
summary_text = (f"Data: {df.index[0].date()} ~ {df.index[-1].date()} ({len(df)} days) | "
               f"Target: {TARGET_DATE.date()} | "
               f"Model: Unified Diff (No AR, 100% Ops) | "
               f"Correction: Additive Residual Allocation | "
               f"CQI: {df['CQI_avg'].iloc[td_idx]:.2f} ({cqi_level(df['CQI_avg'].iloc[td_idx])}) | "
               f"SEC: {df['SEC'].iloc[td_idx]:.0f} MJ/BBL")
ax.text(0.5, 0.5, summary_text, ha='center', va='center', fontsize=10,
        bbox=dict(boxstyle='round', facecolor='#E3F2FD', alpha=0.8))

plt.suptitle(f'CLX Energy Dashboard v5 - Unified Diff Model ({TARGET_DATE.date()})',
             fontsize=16, fontweight='bold', y=0.995)
plt.show()

# COMMAND ----------

# DBTITLE 1,Anomaly Detection + CQI 신뢰도 표시
# ============================================================
# Anomaly Detection + CQI 신뢰도 표시
# - 이상감지: |SEC - SEC_mean| > 3% 또는 |TOTAL_dMJ| > 3σ
# - CQI 낮은 날: '⚠️ 해석 주의' 표시
# ============================================================

# 이상감지 기준
sec_mean = df['SEC'].mean()
sec_std = df['SEC'].std()
dmj_std = df['TOTAL_dMJ'].std()

df['SEC_deviation'] = (df['SEC'] - sec_mean) / sec_mean * 100  # %
df['dMJ_zscore'] = (df['TOTAL_dMJ'] - df['TOTAL_dMJ'].mean()) / dmj_std

# 이상 플래그
df['is_anomaly'] = (
    (df['SEC_deviation'].abs() > 3) |
    (df['dMJ_zscore'].abs() > 2.5)
)

# 기준일 주변 30일 이상감지 테이블
last30 = df.iloc[max(0, td_idx-29):td_idx+1].copy()
anomalies = last30[last30['is_anomaly']].copy()

if len(anomalies) > 0:
    anomaly_table = anomalies[['SEC', 'SEC_deviation', 'TOTAL_dMJ', 'dMJ_zscore', 
                               'CQI_avg', 'CQI_level']].copy()
    anomaly_table['TOTAL_dMJ'] = anomaly_table['TOTAL_dMJ'] / 1e6  # M MJ
    anomaly_table.columns = ['SEC', 'SEC_Dev(%)', 'dMJ(M)', 'Z-score', 'CQI', 'Confidence']
    
    # CQI 경고 추가
    anomaly_table['Warning'] = anomaly_table['CQI'].apply(
        lambda x: '' if x < 0.5 else ('⚠️ 중간' if x < 1.0 else '⚠️ 해석주의')
    )
    
    print(f"{'='*70}")
    print(f"  Anomaly Detection (최근 30일)")
    print(f"{'='*70}")
    print(f"  총 이상일: {len(anomalies)}일 / 30일")
    print(f"  기준: |SEC deviation| > 3% OR |dMJ Z-score| > 2.5")
    print()
    display(anomaly_table.round(2))
else:
    print(f"✅ 최근 30일 이상감지 없음")

# 기준일 상태
td_anomaly = df['is_anomaly'].iloc[td_idx]
td_cqi = df['CQI_avg'].iloc[td_idx]
print(f"\n  기준일({TARGET_DATE.date()}) 상태:")
print(f"    이상 여부: {'\u274c 이상' if td_anomaly else '\u2705 정상'}")
print(f"    SEC 편차: {df['SEC_deviation'].iloc[td_idx]:+.1f}%")
print(f"    CQI: {td_cqi:.3f} ({cqi_level(td_cqi)})")
if td_cqi >= 1.0:
    print(f"    \u26a0\ufe0f 해\uc11d \uc8fc\uc758: CQI\u22651.0 - \ubaa8\ub378 \uc608\uce21 \uc624\ucc28\uac00 SHAP\ubcf4\ub2e4 \ud07c")

# Anomaly 시각화
fig, ax = plt.subplots(figsize=(16, 5))
ax.plot(last30.index, last30['SEC'], '-', color='#333', linewidth=1)
ax.fill_between(last30.index, sec_mean*(1-0.03), sec_mean*(1+0.03), 
                alpha=0.1, color='#4CAF50', label='±3% band')

# CQI 색상으로 점 표시
for i, (date, row) in enumerate(last30.iterrows()):
    color = cqi_color(row['CQI_avg'])
    marker = 'X' if row['is_anomaly'] else 'o'
    size = 80 if row['is_anomaly'] else 25
    ax.scatter(date, row['SEC'], c=color, s=size, marker=marker, zorder=3, edgecolors='white')

ax.axhline(sec_mean, color='#E53935', linestyle='--', alpha=0.7, label=f'Mean SEC={sec_mean:.0f}')
ax.set_xlabel('Date')
ax.set_ylabel('SEC (MJ/BBL)', fontweight='bold')
ax.set_title(f'Anomaly Detection with CQI Confidence (Last 30 Days)\n'
             f'Blue=High CQI, Yellow=Med, Red=Low | X=Anomaly',
             fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

print(f"\n\u2705 Diff_Model_Simulation 전체 실행 완료")
print(f"   모델: Unified Diff (AR 없음, 100% 운전변수 해석)")
print(f"   보정: 실측값 기반 가산 잔차 배분 (\u03a3 SHAP = \u0394y_actual)")
print(f"   D-1/W-1/M-1: 단일 모델 통합 해석")
print(f"   CQI: 해석 신뢰도 자동 표시 (High/Med/Low)")

# COMMAND ----------

# DBTITLE 1,기준일 Data Validation 상세
# ============================================================
# 기준일 Data Validation 상세 결과 + 시각화
# ============================================================

# train_stats 기반 기준일 피처 검증
print(f"{'='*70}")
print(f"  Data Validation (기준일: {TARGET_DATE.date()})")
print(f"{'='*70}")

val_results = []
if 'train_stats' in train_meta:
    for col, stats in train_meta['train_stats'].items():
        if col in df.columns:
            val_today = df[col].iloc[td_idx]
            train_min = stats['min']
            train_max = stats['max']
            train_mean = stats['mean']
            train_std = stats['std']
            
            # 범위 이탈 여부
            is_oor = val_today < train_min or val_today > train_max
            # Z-score (train 기준)
            z_score = (val_today - train_mean) / train_std if train_std > 0 else 0
            # 백분위 (전체 기간 내)
            pct_rank = (df[col] <= val_today).mean() * 100
            
            val_results.append({
                'Feature': col,
                'Today': val_today,
                'Train_Min': train_min,
                'Train_Max': train_max,
                'Z-score': z_score,
                'Percentile': pct_rank,
                'Status': '❌ OOR' if is_oor else ('⚠️ |Z|>2' if abs(z_score) > 2 else '✅ Normal'),
            })

df_val = pd.DataFrame(val_results)
print(f"\n  기준일 피처 상태:") 
display(df_val.round(2))

# 이상 피처 요약
oor_features = df_val[df_val['Status'].str.contains('❌')]
warn_features = df_val[df_val['Status'].str.contains('⚠️')]
print(f"\n  범위 이탈(❌): {len(oor_features)}개 - {list(oor_features['Feature'])}")
print(f"  경고(⚠️ |Z|>2): {len(warn_features)}개 - {list(warn_features['Feature'])}")
print(f"  정상(✅): {len(df_val) - len(oor_features) - len(warn_features)}개")

# --- Validation 시각화: 피처별 위치 ---
fig, ax = plt.subplots(figsize=(14, 6))
fig.patch.set_facecolor('#F8F8F8')

# 정규화된 위치 (0=min, 1=max 기준)
features_plot = df_val['Feature'].values
norm_positions = []
for _, row in df_val.iterrows():
    rng = row['Train_Max'] - row['Train_Min']
    if rng > 0:
        norm_pos = (row['Today'] - row['Train_Min']) / rng
    else:
        norm_pos = 0.5
    norm_positions.append(norm_pos)

colors_v = []
for _, row in df_val.iterrows():
    if '❌' in row['Status']: colors_v.append('#E53935')
    elif '⚠️' in row['Status']: colors_v.append('#FFC107')
    else: colors_v.append('#4CAF50')

y_pos = range(len(features_plot))
ax.barh(y_pos, [1]*len(features_plot), color='#E3F2FD', edgecolor='#90CAF9', height=0.6)
ax.scatter(norm_positions, y_pos, c=colors_v, s=120, zorder=5, edgecolors='white', linewidth=1.5)
ax.axvline(0, color='#1976D2', linewidth=2, linestyle='-', alpha=0.7, label='Train Min')
ax.axvline(1, color='#1976D2', linewidth=2, linestyle='-', alpha=0.7, label='Train Max')
ax.set_yticks(y_pos)
ax.set_yticklabels(features_plot, fontsize=10)
ax.set_xlabel('Normalized Position (0=Train Min, 1=Train Max)', fontweight='bold')
ax.set_title(f'Feature Validation: Target Date {TARGET_DATE.date()}\n'
             f'Green=Normal, Yellow=Warning, Red=Out-of-Range',
             fontsize=12, fontweight='bold')
ax.set_xlim(-0.3, 1.3)
ax.legend(loc='lower right')
ax.grid(True, alpha=0.3, axis='x')
ax.invert_yaxis()

plt.tight_layout()
plt.show()

# COMMAND ----------

# DBTITLE 1,비용 단위 환산 (Won)
# ============================================================
# 비용 단위 환산 (Won)
# ============================================================
# 비용 환산인자
# F/G: 113,166 won/FOEB(BBL)
# STM: 61,878 won/FOEB -> ESSTON 환산 필요 (1 ESSTON = 0.4894 FOEB)
# ELEC: 177 won/KWH

# FOEB 환산 (1 FOEB = 6330.44 MJ)
ESSTON_TO_FOEB = 3098.82 / 6330.44  # 0.4894

COST_PER_UNIT = {
    'FG': 113166,                        # won/BBL(FOEB)
    'Steam': 61878 * ESSTON_TO_FOEB,     # won/ESSTON (= 61,878 × 0.4894 = 30,275)
    'ELEC': 177,                         # won/KWH
}

COST_PER_FOEB = {
    'FG': 113166,   # won/FOEB
    'Steam': 61878, # won/FOEB
    'ELEC': 177,    # won/KWH (별도 단위)
}

print(f"✅ 비용 환산인자")
print(f"   FG:    {COST_PER_UNIT['FG']:,.0f} won/BBL")
print(f"   Steam: {COST_PER_UNIT['Steam']:,.0f} won/ESSTON (= 61,878 won/FOEB × {ESSTON_TO_FOEB:.4f})")
print(f"   ELEC:  {COST_PER_UNIT['ELEC']:,.0f} won/KWH")

# --- 일별 비용 계산 ---
df['FG_cost'] = df['FG(BBL)'] * COST_PER_UNIT['FG']
df['STM_cost'] = df['STEAM(ESSTON)'] * COST_PER_UNIT['Steam']
df['ELEC_cost'] = df['ELEC(KWH)'] * COST_PER_UNIT['ELEC']
df['TOTAL_cost'] = df['FG_cost'] + df['STM_cost'] + df['ELEC_cost']

# --- 비용 변화량 (D-1) ---
df['FG_dcost'] = df['FG_diff'] * COST_PER_UNIT['FG']
df['STM_dcost'] = df['STM_diff'] * COST_PER_UNIT['Steam']
df['ELEC_dcost'] = df['ELEC_diff'] * COST_PER_UNIT['ELEC']
df['TOTAL_dcost'] = df['FG_dcost'] + df['STM_dcost'] + df['ELEC_dcost']

# --- 기준일 비용 요약 ---
print(f"\n  기준일({TARGET_DATE.date()}) 에너지 비용:")
print(f"    FG:    {df['FG_cost'].iloc[td_idx]/1e6:,.1f} M won ({df['FG_cost'].iloc[td_idx]/df['TOTAL_cost'].iloc[td_idx]*100:.1f}%)")
print(f"    Steam: {df['STM_cost'].iloc[td_idx]/1e6:,.1f} M won ({df['STM_cost'].iloc[td_idx]/df['TOTAL_cost'].iloc[td_idx]*100:.1f}%)")
print(f"    ELEC:  {df['ELEC_cost'].iloc[td_idx]/1e6:,.1f} M won ({df['ELEC_cost'].iloc[td_idx]/df['TOTAL_cost'].iloc[td_idx]*100:.1f}%)")
print(f"    TOTAL: {df['TOTAL_cost'].iloc[td_idx]/1e6:,.1f} M won")
print(f"\n    원단위 (won/BBL): {df['TOTAL_cost'].iloc[td_idx]/df['CDU'].iloc[td_idx]:,.0f} won/BBL")

# --- SHAP 비용 환산인자 ---
# corrected_SHAP(BBL/ESSTON/KWH) × COST_PER_UNIT = SHAP(won)
print(f"\n  SHAP 비용 환산:")
print(f"    FG SHAP(BBL) × {COST_PER_UNIT['FG']:,.0f} = SHAP(won)")
print(f"    STM SHAP(ESSTON) × {COST_PER_UNIT['Steam']:,.0f} = SHAP(won)")
print(f"    ELEC SHAP(KWH) × {COST_PER_UNIT['ELEC']:,.0f} = SHAP(won)")

# COMMAND ----------

# DBTITLE 1,비용 기반 분석 리포트 (Won)
# ============================================================
# 비용 기반 분석 리포트 (Won)
# - D-1/W-1/M-1 모두 비용(원) 단위로 통합 해석
# ============================================================

print(f"{'='*70}")
print(f"  에너지 비용 분석 리포트 (기준일: {TARGET_DATE.date()})")
print(f"{'='*70}")

# --- D-1 비용 변화 ---
print(f"\n  [D-1] 전일 대비 비용 변화")
print(f"  CQI: {df['CQI_avg'].iloc[td_idx]:.2f} ({cqi_level(df['CQI_avg'].iloc[td_idx])})")
print(f"  {'-'*50}")

d1_cost_total = 0
d1_group_cost = {}  # 그룹별 비용 합산

for res in all_results:
    shap_d1 = res['shap_corrected'][td_idx]
    features = res['features']
    cost_f = COST_PER_UNIT[res['name']]
    dy_actual = res['dy_actual'][td_idx]
    cost_change = dy_actual * cost_f
    d1_cost_total += cost_change
    
    print(f"    {res['name']:6s}: Δy={dy_actual:+,.0f} → {cost_change/1e6:+,.2f} M won")
    
    # 그룹별 비용 집계
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        cost_val = shap_d1[i] * cost_f / 1e6  # M won
        d1_group_cost[group] = d1_group_cost.get(group, 0) + cost_val

print(f"    {'TOTAL':6s}: {d1_cost_total/1e6:+,.2f} M won")

# --- W-1 비용 변화 ---
print(f"\n  [W-1] 주간 누적 비용 변화 ({df.index[week_start].date()} ~ {TARGET_DATE.date()})")
print(f"  평균 CQI: {df['CQI_avg'].iloc[week_start:td_idx+1].mean():.2f}")
print(f"  {'-'*50}")

w1_cost_total = 0
w1_group_cost = {}
for res in all_results:
    shap_w1 = res['shap_corrected'][week_start:td_idx+1].sum(axis=0)
    features = res['features']
    cost_f = COST_PER_UNIT[res['name']]
    dy_week = res['dy_actual'][week_start:td_idx+1].sum()
    cost_change = dy_week * cost_f
    w1_cost_total += cost_change
    
    print(f"    {res['name']:6s}: ΣΔy={dy_week:+,.0f} → {cost_change/1e6:+,.2f} M won")
    
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        cost_val = shap_w1[i] * cost_f / 1e6
        w1_group_cost[group] = w1_group_cost.get(group, 0) + cost_val

print(f"    {'TOTAL':6s}: {w1_cost_total/1e6:+,.2f} M won")

# --- M-1 비용 변화 ---
print(f"\n  [M-1] 월간 누적 비용 변화 ({df.index[month_start].date()} ~ {TARGET_DATE.date()})")
print(f"  평균 CQI: {df['CQI_avg'].iloc[month_start:td_idx+1].mean():.2f}")
print(f"  {'-'*50}")

m1_cost_total = 0
m1_group_cost = {}
for res in all_results:
    shap_m1 = res['shap_corrected'][month_start:td_idx+1].sum(axis=0)
    features = res['features']
    cost_f = COST_PER_UNIT[res['name']]
    dy_month = res['dy_actual'][month_start:td_idx+1].sum()
    cost_change = dy_month * cost_f
    m1_cost_total += cost_change
    
    print(f"    {res['name']:6s}: ΣΔy={dy_month:+,.0f} → {cost_change/1e6:+,.2f} M won")
    
    for i, feat in enumerate(features):
        group = feat_to_group.get(feat, '기타')
        cost_val = shap_m1[i] * cost_f / 1e6
        m1_group_cost[group] = m1_group_cost.get(group, 0) + cost_val

print(f"    {'TOTAL':6s}: {m1_cost_total/1e6:+,.2f} M won")

# === 비용 Waterfall 시각화 (D-1 / W-1 / M-1) ===
fig, axes = plt.subplots(1, 3, figsize=(20, 7))
fig.patch.set_facecolor('#F8F8F8')

for ax_idx, (title, group_cost, total_cost) in enumerate([
    (f'D-1 Cost Change\n({TARGET_DATE.date()})', d1_group_cost, d1_cost_total),
    (f'W-1 Cost Change (7d)\n({df.index[week_start].date()}~{TARGET_DATE.date()})', w1_group_cost, w1_cost_total),
    (f'M-1 Cost Change (30d)\n({df.index[month_start].date()}~{TARGET_DATE.date()})', m1_group_cost, m1_cost_total),
]):
    ax = axes[ax_idx]
    groups_s = sorted(group_cost.items(), key=lambda x: abs(x[1]), reverse=True)
    g_names = [g for g, _ in groups_s]
    g_vals = [v for _, v in groups_s]
    g_colors = [group_colors.get(g, '#90A4AE') for g in g_names]
    
    ax.barh(range(len(g_names)), g_vals, color=g_colors, edgecolor='white', height=0.6)
    ax.set_yticks(range(len(g_names)))
    ax.set_yticklabels(g_names, fontsize=10)
    ax.axvline(0, color='black', linewidth=0.8)
    ax.set_xlabel('Cost Change (M won)', fontweight='bold')
    ax.set_title(f'{title}\nTotal: {total_cost/1e6:+,.1f} M won', fontsize=11, fontweight='bold')
    ax.grid(True, alpha=0.3, axis='x')
    ax.invert_yaxis()
    
    for i, v in enumerate(g_vals):
        ha = 'left' if v >= 0 else 'right'
        off = max(abs(v)*0.05, 0.01)
        ax.text(v + (off if v >= 0 else -off), i, f'{v:+.2f}',
                va='center', ha=ha, fontsize=9, fontweight='bold')

plt.tight_layout()
plt.suptitle('Energy Cost Factor Analysis (Won)', fontsize=14, fontweight='bold', y=1.02)
plt.show()

# === 월간 비용 트렌드 ===
fig, axes = plt.subplots(1, 2, figsize=(16, 5))

# 일별 총 비용
ax = axes[0]
last60 = df.iloc[max(0, td_idx-59):td_idx+1]
ax.plot(last60.index, last60['TOTAL_cost']/1e6, '-', color='#333', linewidth=1)
ax.fill_between(last60.index, last60['FG_cost']/1e6, 0, alpha=0.3, color='#E53935', label='FG')
ax.fill_between(last60.index, (last60['FG_cost']+last60['STM_cost'])/1e6, 
                last60['FG_cost']/1e6, alpha=0.3, color='#FF9800', label='Steam')
ax.fill_between(last60.index, last60['TOTAL_cost']/1e6, 
                (last60['FG_cost']+last60['STM_cost'])/1e6, alpha=0.3, color='#1976D2', label='ELEC')
ax.set_xlabel('Date')
ax.set_ylabel('Daily Cost (M won)', fontweight='bold')
ax.set_title('Daily Energy Cost Trend (Last 60 Days)', fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)

# 원단위 (won/BBL)
ax = axes[1]
df['cost_per_bbl'] = df['TOTAL_cost'] / df['CDU'].clip(lower=1)
last60_cpb = df['cost_per_bbl'].iloc[max(0, td_idx-59):td_idx+1]
ax.plot(last60.index, last60_cpb, 'o-', color='#7B1FA2', linewidth=1.5, markersize=3)
ax.axhline(last60_cpb.mean(), color='#E53935', linestyle='--', 
           label=f'60d Avg={last60_cpb.mean():,.0f}')
ax.scatter([TARGET_DATE], [df['cost_per_bbl'].iloc[td_idx]], 
           s=150, color='red', marker='*', zorder=5, label=f'Today={df["cost_per_bbl"].iloc[td_idx]:,.0f}')
ax.set_xlabel('Date')
ax.set_ylabel('Unit Cost (won/BBL)', fontweight='bold')
ax.set_title('Energy Unit Cost Trend (won per BBL processed)', fontsize=12, fontweight='bold')
ax.legend()
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.show()

# === 최종 요약 테이블 ===
print(f"\n{'='*70}")
print(f"  비용 리포트 요약 ({TARGET_DATE.date()})")
print(f"{'='*70}")
print(f"  ┌{'\u2500'*66}\u2510")
print(f"  \u2502 {'\ud56d\ubaa9':<12s} {'D-1':>14s} {'W-1(7d)':>14s} {'M-1(30d)':>14s} {'\ub2e8\uc704':>8s} \u2502")
print(f"  \u251c{'\u2500'*66}\u2524")
print(f"  \u2502 {'\uc5d0\ub108\uc9c0 \ube44\uc6a9':<12s} {d1_cost_total/1e6:>+14,.1f} {w1_cost_total/1e6:>+14,.1f} {m1_cost_total/1e6:>+14,.1f} {'M won':>8s} \u2502")

# 그룹별 비용 Top 3
for g, _ in sorted(m1_group_cost.items(), key=lambda x: abs(x[1]), reverse=True)[:3]:
    d1_v = d1_group_cost.get(g, 0)
    w1_v = w1_group_cost.get(g, 0)
    m1_v = m1_group_cost.get(g, 0)
    print(f"  \u2502  {g:<11s} {d1_v:>+14.2f} {w1_v:>+14.2f} {m1_v:>+14.2f} {'M won':>8s} \u2502")

print(f"  \u251c{'\u2500'*66}\u2524")
print(f"  \u2502 {'\uc6d0\ub2e8\uc704':<12s} {df['cost_per_bbl'].iloc[td_idx]:>14,.0f} {'-':>14s} {'-':>14s} {'won/BBL':>8s} \u2502")
print(f"  \u2502 {'CQI \uc2e0\ub8b0\ub3c4':<12s} {cqi_level(df['CQI_avg'].iloc[td_idx]):>14s} {cqi_level(cqi_week_avg):>14s} {cqi_level(cqi_month_avg):>14s} {'-':>8s} \u2502")
print(f"  \u2514{'\u2500'*66}\u2518")
print(f"\n  \u2705 \ube44\uc6a9 \ubd84\uc11d \uc644\ub8cc")
print(f"     - D-1: \uc804\uc77c \ub300\ube44 {d1_cost_total/1e6:+,.1f} M won \ubcc0\ud654")
print(f"     - M-1: 30\uc77c \ub204\uc801 {m1_cost_total/1e6:+,.1f} M won \ubcc0\ud654")
print(f"     - \uc6d0\ub2e8\uc704: {df['cost_per_bbl'].iloc[td_idx]:,.0f} won/BBL (60\uc77c \ud3c9\uade0: {last60_cpb.mean():,.0f})")