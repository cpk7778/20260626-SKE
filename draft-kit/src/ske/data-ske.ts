import kpiRaw from './dashboard_kpi.csv?raw';
import factorsRaw from './dashboard_factors.csv?raw';
import detailRaw from './detail_features.csv?raw';
import metaRaw from './metadata.json';

// ── 타입 ────────────────────────────────────────────────────────────────────

export type CqiLevel = 'High' | 'Medium' | 'Low';
export type Horizon = 'D-1' | 'W-1' | 'M-1';
export type EnergyType = 'FG' | 'Steam' | 'ELEC';

export interface KpiRow {
  date: string;
  fg_bbl: number;
  stm_esston: number;
  elec_kwh: number;
  cdu_bbl: number;
  atm_temp: number;
  rain_mm: number;
  fg_mj: number;
  stm_mj: number;
  elec_mj: number;
  total_mj: number;
  sec_mj_per_bbl: number;
  fg_cost_mwon: number;
  stm_cost_mwon: number;
  elec_cost_mwon: number;
  total_cost_mwon: number;
  unit_cost_won_per_bbl: number;
  cqi_avg: number;
  cqi_level: CqiLevel;
}

export interface FactorRow {
  horizon: Horizon;
  group: string;
  color: string;
  impact_mj: number;
  impact_mwon: number;
  fg_bbl: number;
  stm_esston: number;
  elec_kwh: number;
  cqi_avg: number;
  cqi_level: CqiLevel;
}

export interface DetailRow {
  horizon: Horizon;
  energy: EnergyType;
  feature: string;
  group: string;
  unit: string;
  shap_raw: number;
  shap_mj: number;
  shap_mwon: number;
}

export interface SkeMeta {
  target_date: string;
  data_range: string;
  horizons: Record<Horizon, string>;
  model: { type: string; version: string; formula: string; correction: string };
  cqi: { today: number; levels: Record<string, string> };
  kpi_today: { total_mj: number; sec: number; total_cost_mwon: number; unit_cost_won_per_bbl: number };
  group_colors: Record<string, string>;
  groups: string[];
}

// ── 피처 설명 (feature_groups.csv 에서 추출) ────────────────────────────────
export const FEATURE_DESC: Record<string, string> = {
  CDU: 'CDU 원유처리량 (BBL/day)',
  CDU_ma7: 'CDU 7일 이동평균 (조업 안정성)',
  CDU_diff: 'CDU 전일 대비 변화량',
  RFCC_ratio: '원유 처리대비 RFCC계열 처리량 비율',
  RDS_ratio: '원유 처리대비 RDS계열 처리량 비율',
  UC_ratio: '원유 처리대비 UC공정 처리량 비율',
  FO: 'FO 비율',
  EHC: '초중질유(Extra Heavy Crude) 비율',
  'H/S': '고유황유(High Sulfur) 비율',
  Mild: '중경질유(Mild Crude) 비율',
  'L/S': '저유황유(Low Sulfur) 비율',
  heavy_ratio: '중질유 합계 (H/S + EHC)',
  light_ratio: '경질유 합계 (L/S + Mild)',
  ATM_Temp: '대기온도 (℃)',
  ATM_Temp_ma7: '대기온도 7일 이동평균',
  HDD: '난방도일 (max(18-T, 0))',
  season_sin: '계절 사인 (sin(2π·DOY/365))',
  season_cos: '계절 코사인 (cos(2π·DOY/365))',
  is_rain: '강우 여부 (0/1)',
  rain_intensity: '강우 강도 (0=없음, 1=약, 2=중, 3=강)',
  Rain_lag1: '전일 강수량',
  Rain_cumsum3: '3일 누적 강수량',
  days_since_rain: '최종 강우 후 경과일',
  Rain_x_cold: '강우×한냉 상호작용 (Rain × HDD)',
};

// ── CSV 파서 ─────────────────────────────────────────────────────────────────

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const vals = line.split(',');
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (vals[i] ?? '').trim()]));
  });
}

function num(v: string) { return parseFloat(v) || 0; }

// ── 데이터 파싱 ──────────────────────────────────────────────────────────────

export const SKE_KPI: KpiRow[] = parseCsv(kpiRaw).map(r => ({
  date: r.date,
  fg_bbl: num(r.fg_bbl),
  stm_esston: num(r.stm_esston),
  elec_kwh: num(r.elec_kwh),
  cdu_bbl: num(r.cdu_bbl),
  atm_temp: num(r.atm_temp),
  rain_mm: num(r.rain_mm),
  fg_mj: num(r.fg_mj),
  stm_mj: num(r.stm_mj),
  elec_mj: num(r.elec_mj),
  total_mj: num(r.total_mj),
  sec_mj_per_bbl: num(r.sec_mj_per_bbl),
  fg_cost_mwon: num(r.fg_cost_mwon),
  stm_cost_mwon: num(r.stm_cost_mwon),
  elec_cost_mwon: num(r.elec_cost_mwon),
  total_cost_mwon: num(r.total_cost_mwon),
  unit_cost_won_per_bbl: num(r.unit_cost_won_per_bbl),
  cqi_avg: num(r.cqi_avg),
  cqi_level: r.cqi_level as CqiLevel,
}));

export const SKE_FACTORS: FactorRow[] = parseCsv(factorsRaw).map(r => ({
  horizon: r.horizon as Horizon,
  group: r.group,
  color: r.color,
  impact_mj: num(r.impact_mj),
  impact_mwon: num(r.impact_mwon),
  fg_bbl: num(r.fg_bbl),
  stm_esston: num(r.stm_esston),
  elec_kwh: num(r.elec_kwh),
  cqi_avg: num(r.cqi_avg),
  cqi_level: r.cqi_level as CqiLevel,
}));

export const SKE_DETAIL: DetailRow[] = parseCsv(detailRaw).map(r => ({
  horizon: r.horizon as Horizon,
  energy: r.energy as EnergyType,
  feature: r.feature,
  group: r.group,
  unit: r.unit,
  shap_raw: num(r.shap_raw),
  shap_mj: num(r.shap_mj),
  shap_mwon: num(r.shap_mwon),
}));

export const SKE_META: SkeMeta = metaRaw as SkeMeta;

export const SKE_DATES = SKE_KPI.map(r => r.date);

// ── 편의 상수 ────────────────────────────────────────────────────────────────
export const CQI_COLOR: Record<CqiLevel, string> = {
  High: '#22c55e',
  Medium: '#f59e0b',
  Low: '#ef4444',
};

export const GROUP_COLORS: Record<string, string> = {
  '원유처리량': '#1976D2',
  '2차공정 처리비율': '#FF9800',
  '원유조성': '#8E24AA',
  '환경/계절': '#43A047',
  '강우': '#0288D1',
};

export const ENERGY_COLOR: Record<EnergyType, string> = {
  FG: '#fb923c',
  Steam: '#38bdf8',
  ELEC: '#fbbf24',
};

export const HORIZON_LABEL: Record<Horizon, string> = {
  'D-1': '전일 (D-1)',
  'W-1': '주간 (W-1)',
  'M-1': '월간 (M-1)',
};

export function cqiFromValue(v: number): CqiLevel {
  return v < 0.5 ? 'High' : v < 1.0 ? 'Medium' : 'Low';
}
