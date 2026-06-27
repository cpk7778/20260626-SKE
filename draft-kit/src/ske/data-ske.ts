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

// ── 기간 선택 타입 ────────────────────────────────────────────────────────────
// KPI 시계열의 xViewRange(0~1 fraction)를 날짜 기간으로 변환한 버킷
export type DateRange = '7d' | '14d' | '30d' | '90d' | '180d' | 'all';

export const DATE_RANGE_LABEL: Record<DateRange, string> = {
  '7d':   '7일',
  '14d':  '14일',
  '30d':  '30일',
  '90d':  '90일',
  '180d': '180일',
  'all':  '전체',
};

// xViewRange span → DateRange 버킷 변환
export function spanToDateRange(spanDays: number): DateRange {
  if (spanDays <= 10)  return '7d';
  if (spanDays <= 21)  return '14d';
  if (spanDays <= 45)  return '30d';
  if (spanDays <= 135) return '90d';
  if (spanDays <= 225) return '180d';
  return 'all';
}

// ── 기간별 스케일 팩터 (더미 데이터 생성용) ───────────────────────────────────
// 기간이 길수록 누적 효과가 커지고, 그룹별 상대적 기여도 패턴도 미묘하게 달라짐
const RANGE_SCALE: Record<DateRange, number> = {
  '7d':   0.25,
  '14d':  0.50,
  '30d':  1.0,
  '90d':  2.8,
  '180d': 5.2,
  'all':  9.1,
};

// 그룹별 기간 가중치 — 기간이 길수록 일부 요인이 더 두드러지게
const GROUP_RANGE_WEIGHT: Record<string, Record<DateRange, number>> = {
  '원유조성':       { '7d': 0.90, '14d': 0.95, '30d': 1.00, '90d': 1.15, '180d': 1.35, 'all': 1.55 },
  '2차공정 처리비율': { '7d': 1.05, '14d': 1.02, '30d': 1.00, '90d': 0.92, '180d': 0.85, 'all': 0.78 },
  '원유처리량':      { '7d': 0.95, '14d': 0.97, '30d': 1.00, '90d': 1.08, '180d': 1.18, 'all': 1.30 },
  '환경/계절':       { '7d': 0.70, '14d': 0.85, '30d': 1.00, '90d': 1.22, '180d': 1.55, 'all': 2.10 },
  '강우':           { '7d': 1.20, '14d': 1.10, '30d': 1.00, '90d': 1.40, '180d': 2.00, 'all': 2.80 },
};

// 피처별 추가 가중치 (일부 피처는 장기일수록 더 중요)
const FEATURE_RANGE_WEIGHT: Record<string, Record<DateRange, number>> = {
  'CDU_ma7':       { '7d': 0.6, '14d': 0.8, '30d': 1.0, '90d': 1.2, '180d': 1.5, 'all': 1.9 },
  'CDU_diff':      { '7d': 1.4, '14d': 1.2, '30d': 1.0, '90d': 0.7, '180d': 0.5, 'all': 0.4 },
  'season_cos':    { '7d': 0.5, '14d': 0.7, '30d': 1.0, '90d': 1.4, '180d': 2.0, 'all': 2.8 },
  'season_sin':    { '7d': 0.5, '14d': 0.7, '30d': 1.0, '90d': 1.3, '180d': 1.8, 'all': 2.4 },
  'ATM_Temp':      { '7d': 0.8, '14d': 0.9, '30d': 1.0, '90d': 1.1, '180d': 1.4, 'all': 1.8 },
  'ATM_Temp_ma7':  { '7d': 0.6, '14d': 0.8, '30d': 1.0, '90d': 1.2, '180d': 1.6, 'all': 2.1 },
  'heavy_ratio':   { '7d': 0.9, '14d': 0.95, '30d': 1.0, '90d': 1.05, '180d': 1.12, 'all': 1.2 },
  'rain_intensity':{ '7d': 1.3, '14d': 1.15, '30d': 1.0, '90d': 1.3, '180d': 1.8, 'all': 2.5 },
};

// CQI: 기간이 길수록 평균 CQI가 중간값으로 수렴
const RANGE_CQI: Record<DateRange, { avg: number; level: CqiLevel }> = {
  '7d':   { avg: 0.280, level: 'High'   },
  '14d':  { avg: 0.340, level: 'High'   },
  '30d':  { avg: 0.405, level: 'High'   },
  '90d':  { avg: 0.620, level: 'Medium' },
  '180d': { avg: 0.780, level: 'Medium' },
  'all':  { avg: 0.910, level: 'Medium' },
};

export function getSKEFactors(range: DateRange): FactorRow[] {
  const scale = RANGE_SCALE[range];
  const cqi   = RANGE_CQI[range];
  return SKE_FACTORS.map(row => {
    const gw = GROUP_RANGE_WEIGHT[row.group]?.[range] ?? 1.0;
    const s  = scale * gw;
    return {
      ...row,
      impact_mj:   row.impact_mj   * s,
      impact_mwon: row.impact_mwon * s,
      fg_bbl:      row.fg_bbl      * s,
      stm_esston:  row.stm_esston  * s,
      elec_kwh:    row.elec_kwh    * s,
      cqi_avg:     cqi.avg,
      cqi_level:   cqi.level,
    };
  });
}

export function getSKEDetail(range: DateRange): DetailRow[] {
  const scale = RANGE_SCALE[range];
  return SKE_DETAIL.map(row => {
    const gw = GROUP_RANGE_WEIGHT[row.group]?.[range]    ?? 1.0;
    const fw = FEATURE_RANGE_WEIGHT[row.feature]?.[range] ?? 1.0;
    const s  = scale * gw * fw;
    return {
      ...row,
      shap_raw:  row.shap_raw  * s,
      shap_mj:   row.shap_mj   * s,
      shap_mwon: row.shap_mwon * s,
      // DetailRow에 cqi_level 없으므로 추가 불필요
    };
  });
}
