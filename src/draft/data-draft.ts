/**
 * draft 차트 샘플 데이터 — 타입 정의 + 모든 차트의 정적/생성 데이터
 */

// ── 공유 타입 ────────────────────────────────────────────────────────────────
// x·y는 파라미터 A·B (XY 산점도·Line 차트에서 축으로 사용)
export interface XYPoint { date: string; eq: string; x: number; y: number; }
// featureVal: 모델 입력값 문자열 (툴팁 표시용)
export interface SHAPItem { feature: string; featureVal: string; shap: number; }
export interface SHAPSnapshot { date: string; base: number; items: SHAPItem[]; }
export interface PredActualPoint { date: string; eq: string; actual: number; pred: number; }
// maeLower/maeUpper: MAE 신뢰구간, rmseLower/rmseUpper: RMSE 신뢰구간
export interface SteamPredPoint { date: string; actual: number; pred: number; maeLower: number; maeUpper: number; rmseLower: number; rmseUpper: number; }

// ── XY 산점도·Line·Gauge·Bullet 공용 데이터 (2026-01-01 ~ 2026-02-28) ───────
export const BUILT_IN_DATA: XYPoint[] = [
  // ── January 2026 ──────────────────────────────────────────────────────────
  { date: '2026-01-01', eq: 'EQ#1', x:  9, y: 35 }, { date: '2026-01-01', eq: 'EQ#2', x:  5, y: 22 }, { date: '2026-01-01', eq: 'EQ#3', x:  9, y: 38 }, { date: '2026-01-01', eq: 'EQ#4', x:  5, y: 20 }, { date: '2026-01-01', eq: 'EQ#5', x:  4, y: 14 }, { date: '2026-01-01', eq: 'EQ#6', x:  2, y:  9 },
  { date: '2026-01-02', eq: 'EQ#1', x: 10, y: 26 }, { date: '2026-01-02', eq: 'EQ#2', x:  6, y: 28 }, { date: '2026-01-02', eq: 'EQ#3', x: 10, y: 42 }, { date: '2026-01-02', eq: 'EQ#4', x:  6, y: 25 }, { date: '2026-01-02', eq: 'EQ#5', x:  3, y: 20 }, { date: '2026-01-02', eq: 'EQ#6', x:  4, y: 16 },
  { date: '2026-01-03', eq: 'EQ#1', x:  5, y: 20 }, { date: '2026-01-03', eq: 'EQ#2', x:  4, y: 18 }, { date: '2026-01-03', eq: 'EQ#3', x:  6, y: 32 }, { date: '2026-01-03', eq: 'EQ#4', x:  5, y: 22 }, { date: '2026-01-03', eq: 'EQ#5', x:  6, y: 22 }, { date: '2026-01-03', eq: 'EQ#6', x:  2, y: 10 },
  { date: '2026-01-04', eq: 'EQ#1', x:  8, y: 32 }, { date: '2026-01-04', eq: 'EQ#2', x:  7, y: 30 }, { date: '2026-01-04', eq: 'EQ#3', x:  9, y: 45 }, { date: '2026-01-04', eq: 'EQ#4', x:  4, y: 18 }, { date: '2026-01-04', eq: 'EQ#5', x:  2, y: 12 }, { date: '2026-01-04', eq: 'EQ#6', x:  4, y: 14 },
  { date: '2026-01-05', eq: 'EQ#1', x:  6, y: 22 }, { date: '2026-01-05', eq: 'EQ#2', x:  4, y: 20 }, { date: '2026-01-05', eq: 'EQ#3', x:  7, y: 32 }, { date: '2026-01-05', eq: 'EQ#4', x:  7, y: 28 }, { date: '2026-01-05', eq: 'EQ#5', x:  5, y: 18 }, { date: '2026-01-05', eq: 'EQ#6', x:  3, y: 15 },
  { date: '2026-01-06', eq: 'EQ#1', x:  5, y: 25 }, { date: '2026-01-06', eq: 'EQ#2', x:  6, y: 26 }, { date: '2026-01-06', eq: 'EQ#3', x:  8, y: 28 }, { date: '2026-01-06', eq: 'EQ#4', x:  3, y: 14 }, { date: '2026-01-06', eq: 'EQ#5', x:  4, y: 15 }, { date: '2026-01-06', eq: 'EQ#6', x:  2, y:  9 },
  { date: '2026-01-07', eq: 'EQ#1', x:  7, y: 33 }, { date: '2026-01-07', eq: 'EQ#2', x:  3, y: 16 }, { date: '2026-01-07', eq: 'EQ#3', x: 10, y: 40 }, { date: '2026-01-07', eq: 'EQ#4', x:  5, y: 18 }, { date: '2026-01-07', eq: 'EQ#5', x:  3, y: 19 }, { date: '2026-01-07', eq: 'EQ#6', x:  4, y: 13 },
  { date: '2026-01-08', eq: 'EQ#1', x: 10, y: 36 }, { date: '2026-01-08', eq: 'EQ#2', x:  6, y: 24 }, { date: '2026-01-08', eq: 'EQ#3', x: 10, y: 41 }, { date: '2026-01-08', eq: 'EQ#4', x:  6, y: 22 }, { date: '2026-01-08', eq: 'EQ#5', x:  5, y: 16 }, { date: '2026-01-08', eq: 'EQ#6', x:  3, y: 11 },
  { date: '2026-01-09', eq: 'EQ#1', x: 11, y: 24 }, { date: '2026-01-09', eq: 'EQ#2', x:  7, y: 30 }, { date: '2026-01-09', eq: 'EQ#3', x: 11, y: 44 }, { date: '2026-01-09', eq: 'EQ#4', x:  7, y: 27 }, { date: '2026-01-09', eq: 'EQ#5', x:  4, y: 22 }, { date: '2026-01-09', eq: 'EQ#6', x:  5, y: 18 },
  { date: '2026-01-10', eq: 'EQ#1', x:  6, y: 22 }, { date: '2026-01-10', eq: 'EQ#2', x:  5, y: 20 }, { date: '2026-01-10', eq: 'EQ#3', x:  7, y: 34 }, { date: '2026-01-10', eq: 'EQ#4', x:  6, y: 24 }, { date: '2026-01-10', eq: 'EQ#5', x:  7, y: 24 }, { date: '2026-01-10', eq: 'EQ#6', x:  3, y: 12 },
  { date: '2026-01-11', eq: 'EQ#1', x:  9, y: 34 }, { date: '2026-01-11', eq: 'EQ#2', x:  8, y: 32 }, { date: '2026-01-11', eq: 'EQ#3', x: 10, y: 47 }, { date: '2026-01-11', eq: 'EQ#4', x:  5, y: 20 }, { date: '2026-01-11', eq: 'EQ#5', x:  3, y: 14 }, { date: '2026-01-11', eq: 'EQ#6', x:  5, y: 16 },
  { date: '2026-01-12', eq: 'EQ#1', x:  7, y: 24 }, { date: '2026-01-12', eq: 'EQ#2', x:  5, y: 22 }, { date: '2026-01-12', eq: 'EQ#3', x:  8, y: 34 }, { date: '2026-01-12', eq: 'EQ#4', x:  8, y: 30 }, { date: '2026-01-12', eq: 'EQ#5', x:  6, y: 20 }, { date: '2026-01-12', eq: 'EQ#6', x:  4, y: 17 },
  { date: '2026-01-13', eq: 'EQ#1', x:  6, y: 27 }, { date: '2026-01-13', eq: 'EQ#2', x:  7, y: 28 }, { date: '2026-01-13', eq: 'EQ#3', x:  9, y: 30 }, { date: '2026-01-13', eq: 'EQ#4', x:  4, y: 16 }, { date: '2026-01-13', eq: 'EQ#5', x:  5, y: 17 }, { date: '2026-01-13', eq: 'EQ#6', x:  3, y: 11 },
  { date: '2026-01-14', eq: 'EQ#1', x:  8, y: 35 }, { date: '2026-01-14', eq: 'EQ#2', x:  4, y: 18 }, { date: '2026-01-14', eq: 'EQ#3', x: 11, y: 42 }, { date: '2026-01-14', eq: 'EQ#4', x:  6, y: 20 }, { date: '2026-01-14', eq: 'EQ#5', x:  4, y: 21 }, { date: '2026-01-14', eq: 'EQ#6', x:  5, y: 15 },
  { date: '2026-01-15', eq: 'EQ#1', x:  8, y: 32 }, { date: '2026-01-15', eq: 'EQ#2', x:  4, y: 20 }, { date: '2026-01-15', eq: 'EQ#3', x:  8, y: 36 }, { date: '2026-01-15', eq: 'EQ#4', x:  4, y: 18 }, { date: '2026-01-15', eq: 'EQ#5', x:  3, y: 12 }, { date: '2026-01-15', eq: 'EQ#6', x:  1, y:  8 },
  { date: '2026-01-16', eq: 'EQ#1', x:  9, y: 22 }, { date: '2026-01-16', eq: 'EQ#2', x:  5, y: 26 }, { date: '2026-01-16', eq: 'EQ#3', x:  9, y: 40 }, { date: '2026-01-16', eq: 'EQ#4', x:  5, y: 23 }, { date: '2026-01-16', eq: 'EQ#5', x:  2, y: 18 }, { date: '2026-01-16', eq: 'EQ#6', x:  3, y: 14 },
  { date: '2026-01-17', eq: 'EQ#1', x:  4, y: 18 }, { date: '2026-01-17', eq: 'EQ#2', x:  3, y: 16 }, { date: '2026-01-17', eq: 'EQ#3', x:  5, y: 30 }, { date: '2026-01-17', eq: 'EQ#4', x:  4, y: 20 }, { date: '2026-01-17', eq: 'EQ#5', x:  5, y: 20 }, { date: '2026-01-17', eq: 'EQ#6', x:  1, y:  8 },
  { date: '2026-01-18', eq: 'EQ#1', x:  7, y: 30 }, { date: '2026-01-18', eq: 'EQ#2', x:  6, y: 28 }, { date: '2026-01-18', eq: 'EQ#3', x:  8, y: 43 }, { date: '2026-01-18', eq: 'EQ#4', x:  3, y: 16 }, { date: '2026-01-18', eq: 'EQ#5', x:  1, y: 10 }, { date: '2026-01-18', eq: 'EQ#6', x:  3, y: 12 },
  { date: '2026-01-19', eq: 'EQ#1', x:  5, y: 20 }, { date: '2026-01-19', eq: 'EQ#2', x:  3, y: 18 }, { date: '2026-01-19', eq: 'EQ#3', x:  6, y: 30 }, { date: '2026-01-19', eq: 'EQ#4', x:  6, y: 26 }, { date: '2026-01-19', eq: 'EQ#5', x:  4, y: 16 }, { date: '2026-01-19', eq: 'EQ#6', x:  2, y: 13 },
  { date: '2026-01-20', eq: 'EQ#1', x:  4, y: 23 }, { date: '2026-01-20', eq: 'EQ#2', x:  5, y: 24 }, { date: '2026-01-20', eq: 'EQ#3', x:  7, y: 26 }, { date: '2026-01-20', eq: 'EQ#4', x:  2, y: 12 }, { date: '2026-01-20', eq: 'EQ#5', x:  3, y: 13 }, { date: '2026-01-20', eq: 'EQ#6', x:  1, y:  7 },
  { date: '2026-01-21', eq: 'EQ#1', x:  6, y: 31 }, { date: '2026-01-21', eq: 'EQ#2', x:  2, y: 14 }, { date: '2026-01-21', eq: 'EQ#3', x:  9, y: 38 }, { date: '2026-01-21', eq: 'EQ#4', x:  4, y: 16 }, { date: '2026-01-21', eq: 'EQ#5', x:  2, y: 17 }, { date: '2026-01-21', eq: 'EQ#6', x:  3, y: 11 },
  { date: '2026-01-22', eq: 'EQ#1', x: 10, y: 38 }, { date: '2026-01-22', eq: 'EQ#2', x:  7, y: 26 }, { date: '2026-01-22', eq: 'EQ#3', x: 11, y: 43 }, { date: '2026-01-22', eq: 'EQ#4', x:  7, y: 24 }, { date: '2026-01-22', eq: 'EQ#5', x:  6, y: 18 }, { date: '2026-01-22', eq: 'EQ#6', x:  4, y: 13 },
  { date: '2026-01-23', eq: 'EQ#1', x: 12, y: 28 }, { date: '2026-01-23', eq: 'EQ#2', x:  8, y: 32 }, { date: '2026-01-23', eq: 'EQ#3', x: 12, y: 46 }, { date: '2026-01-23', eq: 'EQ#4', x:  8, y: 29 }, { date: '2026-01-23', eq: 'EQ#5', x:  5, y: 24 }, { date: '2026-01-23', eq: 'EQ#6', x:  6, y: 20 },
  { date: '2026-01-24', eq: 'EQ#1', x:  7, y: 24 }, { date: '2026-01-24', eq: 'EQ#2', x:  6, y: 22 }, { date: '2026-01-24', eq: 'EQ#3', x:  8, y: 36 }, { date: '2026-01-24', eq: 'EQ#4', x:  7, y: 26 }, { date: '2026-01-24', eq: 'EQ#5', x:  8, y: 26 }, { date: '2026-01-24', eq: 'EQ#6', x:  4, y: 14 },
  { date: '2026-01-25', eq: 'EQ#1', x: 10, y: 36 }, { date: '2026-01-25', eq: 'EQ#2', x:  9, y: 34 }, { date: '2026-01-25', eq: 'EQ#3', x: 11, y: 49 }, { date: '2026-01-25', eq: 'EQ#4', x:  6, y: 22 }, { date: '2026-01-25', eq: 'EQ#5', x:  4, y: 16 }, { date: '2026-01-25', eq: 'EQ#6', x:  6, y: 18 },
  { date: '2026-01-26', eq: 'EQ#1', x:  8, y: 26 }, { date: '2026-01-26', eq: 'EQ#2', x:  6, y: 24 }, { date: '2026-01-26', eq: 'EQ#3', x:  9, y: 36 }, { date: '2026-01-26', eq: 'EQ#4', x:  9, y: 32 }, { date: '2026-01-26', eq: 'EQ#5', x:  7, y: 22 }, { date: '2026-01-26', eq: 'EQ#6', x:  5, y: 19 },
  { date: '2026-01-27', eq: 'EQ#1', x:  7, y: 29 }, { date: '2026-01-27', eq: 'EQ#2', x:  8, y: 30 }, { date: '2026-01-27', eq: 'EQ#3', x: 10, y: 32 }, { date: '2026-01-27', eq: 'EQ#4', x:  5, y: 18 }, { date: '2026-01-27', eq: 'EQ#5', x:  6, y: 19 }, { date: '2026-01-27', eq: 'EQ#6', x:  4, y: 13 },
  { date: '2026-01-28', eq: 'EQ#1', x:  9, y: 37 }, { date: '2026-01-28', eq: 'EQ#2', x:  5, y: 20 }, { date: '2026-01-28', eq: 'EQ#3', x: 12, y: 44 }, { date: '2026-01-28', eq: 'EQ#4', x:  7, y: 22 }, { date: '2026-01-28', eq: 'EQ#5', x:  5, y: 23 }, { date: '2026-01-28', eq: 'EQ#6', x:  6, y: 17 },
  { date: '2026-01-29', eq: 'EQ#1', x:  7, y: 30 }, { date: '2026-01-29', eq: 'EQ#2', x:  4, y: 18 }, { date: '2026-01-29', eq: 'EQ#3', x:  7, y: 34 }, { date: '2026-01-29', eq: 'EQ#4', x:  3, y: 16 }, { date: '2026-01-29', eq: 'EQ#5', x:  2, y: 10 }, { date: '2026-01-29', eq: 'EQ#6', x:  2, y:  7 },
  { date: '2026-01-30', eq: 'EQ#1', x:  8, y: 20 }, { date: '2026-01-30', eq: 'EQ#2', x:  4, y: 24 }, { date: '2026-01-30', eq: 'EQ#3', x:  8, y: 38 }, { date: '2026-01-30', eq: 'EQ#4', x:  4, y: 21 }, { date: '2026-01-30', eq: 'EQ#5', x:  1, y: 16 }, { date: '2026-01-30', eq: 'EQ#6', x:  2, y: 12 },
  { date: '2026-01-31', eq: 'EQ#1', x:  3, y: 16 }, { date: '2026-01-31', eq: 'EQ#2', x:  2, y: 14 }, { date: '2026-01-31', eq: 'EQ#3', x:  4, y: 28 }, { date: '2026-01-31', eq: 'EQ#4', x:  3, y: 18 }, { date: '2026-01-31', eq: 'EQ#5', x:  4, y: 18 }, { date: '2026-01-31', eq: 'EQ#6', x:  1, y:  6 },
  // ── February 2026 ─────────────────────────────────────────────────────────
  { date: '2026-02-01', eq: 'EQ#1', x:  6, y: 28 }, { date: '2026-02-01', eq: 'EQ#2', x:  5, y: 26 }, { date: '2026-02-01', eq: 'EQ#3', x:  7, y: 41 }, { date: '2026-02-01', eq: 'EQ#4', x:  2, y: 14 }, { date: '2026-02-01', eq: 'EQ#5', x:  1, y:  8 }, { date: '2026-02-01', eq: 'EQ#6', x:  2, y: 10 },
  { date: '2026-02-02', eq: 'EQ#1', x:  5, y: 29 }, { date: '2026-02-02', eq: 'EQ#2', x:  3, y: 12 }, { date: '2026-02-02', eq: 'EQ#3', x:  8, y: 36 }, { date: '2026-02-02', eq: 'EQ#4', x:  3, y: 14 }, { date: '2026-02-02', eq: 'EQ#5', x:  1, y: 15 }, { date: '2026-02-02', eq: 'EQ#6', x:  2, y:  9 },
  { date: '2026-02-03', eq: 'EQ#1', x:  4, y: 21 }, { date: '2026-02-03', eq: 'EQ#2', x:  4, y: 24 }, { date: '2026-02-03', eq: 'EQ#3', x:  6, y: 34 }, { date: '2026-02-03', eq: 'EQ#4', x:  6, y: 28 }, { date: '2026-02-03', eq: 'EQ#5', x:  7, y: 28 }, { date: '2026-02-03', eq: 'EQ#6', x:  4, y: 16 },
  { date: '2026-02-04', eq: 'EQ#1', x:  8, y: 34 }, { date: '2026-02-04', eq: 'EQ#2', x:  8, y: 36 }, { date: '2026-02-04', eq: 'EQ#3', x: 10, y: 51 }, { date: '2026-02-04', eq: 'EQ#4', x:  5, y: 24 }, { date: '2026-02-04', eq: 'EQ#5', x:  2, y: 16 }, { date: '2026-02-04', eq: 'EQ#6', x:  5, y: 18 },
  { date: '2026-02-05', eq: 'EQ#1', x:  7, y: 26 }, { date: '2026-02-05', eq: 'EQ#2', x:  5, y: 26 }, { date: '2026-02-05', eq: 'EQ#3', x:  8, y: 38 }, { date: '2026-02-05', eq: 'EQ#4', x:  8, y: 34 }, { date: '2026-02-05', eq: 'EQ#5', x:  6, y: 24 }, { date: '2026-02-05', eq: 'EQ#6', x:  4, y: 21 },
  { date: '2026-02-06', eq: 'EQ#1', x:  6, y: 29 }, { date: '2026-02-06', eq: 'EQ#2', x:  7, y: 32 }, { date: '2026-02-06', eq: 'EQ#3', x:  9, y: 34 }, { date: '2026-02-06', eq: 'EQ#4', x:  4, y: 20 }, { date: '2026-02-06', eq: 'EQ#5', x:  5, y: 21 }, { date: '2026-02-06', eq: 'EQ#6', x:  3, y: 15 },
  { date: '2026-02-07', eq: 'EQ#1', x:  8, y: 37 }, { date: '2026-02-07', eq: 'EQ#2', x:  4, y: 22 }, { date: '2026-02-07', eq: 'EQ#3', x: 11, y: 46 }, { date: '2026-02-07', eq: 'EQ#4', x:  6, y: 24 }, { date: '2026-02-07', eq: 'EQ#5', x:  4, y: 25 }, { date: '2026-02-07', eq: 'EQ#6', x:  5, y: 19 },
  { date: '2026-02-08', eq: 'EQ#1', x: 11, y: 40 }, { date: '2026-02-08', eq: 'EQ#2', x:  7, y: 28 }, { date: '2026-02-08', eq: 'EQ#3', x: 11, y: 45 }, { date: '2026-02-08', eq: 'EQ#4', x:  7, y: 26 }, { date: '2026-02-08', eq: 'EQ#5', x:  6, y: 20 }, { date: '2026-02-08', eq: 'EQ#6', x:  4, y: 15 },
  { date: '2026-02-09', eq: 'EQ#1', x: 12, y: 30 }, { date: '2026-02-09', eq: 'EQ#2', x:  8, y: 34 }, { date: '2026-02-09', eq: 'EQ#3', x: 12, y: 48 }, { date: '2026-02-09', eq: 'EQ#4', x:  8, y: 31 }, { date: '2026-02-09', eq: 'EQ#5', x:  5, y: 26 }, { date: '2026-02-09', eq: 'EQ#6', x:  6, y: 22 },
  { date: '2026-02-10', eq: 'EQ#1', x:  7, y: 26 }, { date: '2026-02-10', eq: 'EQ#2', x:  6, y: 24 }, { date: '2026-02-10', eq: 'EQ#3', x:  8, y: 38 }, { date: '2026-02-10', eq: 'EQ#4', x:  7, y: 28 }, { date: '2026-02-10', eq: 'EQ#5', x:  8, y: 28 }, { date: '2026-02-10', eq: 'EQ#6', x:  4, y: 16 },
  { date: '2026-02-11', eq: 'EQ#1', x: 10, y: 38 }, { date: '2026-02-11', eq: 'EQ#2', x:  9, y: 36 }, { date: '2026-02-11', eq: 'EQ#3', x: 11, y: 51 }, { date: '2026-02-11', eq: 'EQ#4', x:  6, y: 24 }, { date: '2026-02-11', eq: 'EQ#5', x:  4, y: 18 }, { date: '2026-02-11', eq: 'EQ#6', x:  6, y: 20 },
  { date: '2026-02-12', eq: 'EQ#1', x:  8, y: 28 }, { date: '2026-02-12', eq: 'EQ#2', x:  6, y: 26 }, { date: '2026-02-12', eq: 'EQ#3', x:  9, y: 38 }, { date: '2026-02-12', eq: 'EQ#4', x:  9, y: 34 }, { date: '2026-02-12', eq: 'EQ#5', x:  7, y: 24 }, { date: '2026-02-12', eq: 'EQ#6', x:  5, y: 21 },
  { date: '2026-02-13', eq: 'EQ#1', x:  7, y: 31 }, { date: '2026-02-13', eq: 'EQ#2', x:  8, y: 32 }, { date: '2026-02-13', eq: 'EQ#3', x: 10, y: 34 }, { date: '2026-02-13', eq: 'EQ#4', x:  5, y: 20 }, { date: '2026-02-13', eq: 'EQ#5', x:  6, y: 21 }, { date: '2026-02-13', eq: 'EQ#6', x:  4, y: 15 },
  { date: '2026-02-14', eq: 'EQ#1', x:  9, y: 39 }, { date: '2026-02-14', eq: 'EQ#2', x:  5, y: 22 }, { date: '2026-02-14', eq: 'EQ#3', x: 12, y: 46 }, { date: '2026-02-14', eq: 'EQ#4', x:  7, y: 24 }, { date: '2026-02-14', eq: 'EQ#5', x:  5, y: 25 }, { date: '2026-02-14', eq: 'EQ#6', x:  6, y: 19 },
  { date: '2026-02-15', eq: 'EQ#1', x:  9, y: 34 }, { date: '2026-02-15', eq: 'EQ#2', x:  5, y: 22 }, { date: '2026-02-15', eq: 'EQ#3', x:  9, y: 38 }, { date: '2026-02-15', eq: 'EQ#4', x:  5, y: 20 }, { date: '2026-02-15', eq: 'EQ#5', x:  4, y: 14 }, { date: '2026-02-15', eq: 'EQ#6', x:  2, y: 10 },
  { date: '2026-02-16', eq: 'EQ#1', x: 10, y: 24 }, { date: '2026-02-16', eq: 'EQ#2', x:  6, y: 28 }, { date: '2026-02-16', eq: 'EQ#3', x: 10, y: 44 }, { date: '2026-02-16', eq: 'EQ#4', x:  6, y: 25 }, { date: '2026-02-16', eq: 'EQ#5', x:  3, y: 20 }, { date: '2026-02-16', eq: 'EQ#6', x:  4, y: 16 },
  { date: '2026-02-17', eq: 'EQ#1', x:  5, y: 20 }, { date: '2026-02-17', eq: 'EQ#2', x:  4, y: 18 }, { date: '2026-02-17', eq: 'EQ#3', x:  6, y: 32 }, { date: '2026-02-17', eq: 'EQ#4', x:  5, y: 22 }, { date: '2026-02-17', eq: 'EQ#5', x:  6, y: 22 }, { date: '2026-02-17', eq: 'EQ#6', x:  2, y: 10 },
  { date: '2026-02-18', eq: 'EQ#1', x:  8, y: 32 }, { date: '2026-02-18', eq: 'EQ#2', x:  7, y: 30 }, { date: '2026-02-18', eq: 'EQ#3', x:  9, y: 47 }, { date: '2026-02-18', eq: 'EQ#4', x:  4, y: 18 }, { date: '2026-02-18', eq: 'EQ#5', x:  2, y: 12 }, { date: '2026-02-18', eq: 'EQ#6', x:  4, y: 14 },
  { date: '2026-02-19', eq: 'EQ#1', x:  6, y: 22 }, { date: '2026-02-19', eq: 'EQ#2', x:  4, y: 20 }, { date: '2026-02-19', eq: 'EQ#3', x:  7, y: 32 }, { date: '2026-02-19', eq: 'EQ#4', x:  7, y: 28 }, { date: '2026-02-19', eq: 'EQ#5', x:  5, y: 18 }, { date: '2026-02-19', eq: 'EQ#6', x:  3, y: 15 },
  { date: '2026-02-20', eq: 'EQ#1', x:  5, y: 25 }, { date: '2026-02-20', eq: 'EQ#2', x:  6, y: 26 }, { date: '2026-02-20', eq: 'EQ#3', x:  8, y: 28 }, { date: '2026-02-20', eq: 'EQ#4', x:  3, y: 14 }, { date: '2026-02-20', eq: 'EQ#5', x:  4, y: 15 }, { date: '2026-02-20', eq: 'EQ#6', x:  2, y:  9 },
  { date: '2026-02-21', eq: 'EQ#1', x:  7, y: 33 }, { date: '2026-02-21', eq: 'EQ#2', x:  3, y: 16 }, { date: '2026-02-21', eq: 'EQ#3', x: 10, y: 40 }, { date: '2026-02-21', eq: 'EQ#4', x:  5, y: 18 }, { date: '2026-02-21', eq: 'EQ#5', x:  3, y: 19 }, { date: '2026-02-21', eq: 'EQ#6', x:  4, y: 13 },
  { date: '2026-02-22', eq: 'EQ#1', x: 11, y: 40 }, { date: '2026-02-22', eq: 'EQ#2', x:  8, y: 28 }, { date: '2026-02-22', eq: 'EQ#3', x: 12, y: 45 }, { date: '2026-02-22', eq: 'EQ#4', x:  8, y: 26 }, { date: '2026-02-22', eq: 'EQ#5', x:  7, y: 20 }, { date: '2026-02-22', eq: 'EQ#6', x:  5, y: 15 },
  { date: '2026-02-23', eq: 'EQ#1', x: 10, y: 28 }, { date: '2026-02-23', eq: 'EQ#2', x:  7, y: 30 }, { date: '2026-02-23', eq: 'EQ#3', x: 10, y: 44 }, { date: '2026-02-23', eq: 'EQ#4', x:  7, y: 27 }, { date: '2026-02-23', eq: 'EQ#5', x:  4, y: 22 }, { date: '2026-02-23', eq: 'EQ#6', x:  5, y: 18 },
  { date: '2026-02-24', eq: 'EQ#1', x:  5, y: 20 }, { date: '2026-02-24', eq: 'EQ#2', x:  5, y: 20 }, { date: '2026-02-24', eq: 'EQ#3', x:  6, y: 32 }, { date: '2026-02-24', eq: 'EQ#4', x:  5, y: 22 }, { date: '2026-02-24', eq: 'EQ#5', x:  6, y: 22 }, { date: '2026-02-24', eq: 'EQ#6', x:  2, y: 10 },
  { date: '2026-02-25', eq: 'EQ#1', x:  8, y: 32 }, { date: '2026-02-25', eq: 'EQ#2', x:  8, y: 32 }, { date: '2026-02-25', eq: 'EQ#3', x:  9, y: 47 }, { date: '2026-02-25', eq: 'EQ#4', x:  4, y: 18 }, { date: '2026-02-25', eq: 'EQ#5', x:  2, y: 12 }, { date: '2026-02-25', eq: 'EQ#6', x:  4, y: 14 },
  { date: '2026-02-26', eq: 'EQ#1', x:  6, y: 22 }, { date: '2026-02-26', eq: 'EQ#2', x:  5, y: 24 }, { date: '2026-02-26', eq: 'EQ#3', x:  7, y: 36 }, { date: '2026-02-26', eq: 'EQ#4', x:  7, y: 30 }, { date: '2026-02-26', eq: 'EQ#5', x:  5, y: 20 }, { date: '2026-02-26', eq: 'EQ#6', x:  3, y: 17 },
  { date: '2026-02-27', eq: 'EQ#1', x:  5, y: 27 }, { date: '2026-02-27', eq: 'EQ#2', x:  7, y: 30 }, { date: '2026-02-27', eq: 'EQ#3', x:  9, y: 32 }, { date: '2026-02-27', eq: 'EQ#4', x:  4, y: 18 }, { date: '2026-02-27', eq: 'EQ#5', x:  5, y: 19 }, { date: '2026-02-27', eq: 'EQ#6', x:  3, y: 13 },
  { date: '2026-02-28', eq: 'EQ#1', x:  7, y: 35 }, { date: '2026-02-28', eq: 'EQ#2', x:  4, y: 20 }, { date: '2026-02-28', eq: 'EQ#3', x: 11, y: 44 }, { date: '2026-02-28', eq: 'EQ#4', x:  6, y: 22 }, { date: '2026-02-28', eq: 'EQ#5', x:  4, y: 23 }, { date: '2026-02-28', eq: 'EQ#6', x:  5, y: 17 },
];

// 장비별 색상 팔레트 — 프로필 4종, DraftPage에서 선택 가능
export const EQ_COLOR_PROFILES: Record<string, string>[] = [
  { 'EQ#1': '#4ade80', 'EQ#2': '#38bdf8', 'EQ#3': '#f472b6', 'EQ#4': '#fb923c', 'EQ#5': '#a78bfa', 'EQ#6': '#fbbf24', 'EQ#7': '#34d399', 'EQ#8': '#60a5fa', 'EQ#9': '#f87171', 'EQ#10': '#e879f9' },
  { 'EQ#1': '#e05c73', 'EQ#2': '#4a9fd4', 'EQ#3': '#4abf8a', 'EQ#4': '#d4a044', 'EQ#5': '#9b71d4', 'EQ#6': '#3ec9c9', 'EQ#7': '#d4724a', 'EQ#8': '#6895d4', 'EQ#9': '#6abf6a', 'EQ#10': '#d460b4' },
  { 'EQ#1': '#ff4757', 'EQ#2': '#00d2d3', 'EQ#3': '#ffa502', 'EQ#4': '#5352ed', 'EQ#5': '#2ed573', 'EQ#6': '#ff6b81', 'EQ#7': '#eccc68', 'EQ#8': '#1e90ff', 'EQ#9': '#ff6348', 'EQ#10': '#7bed9f' },
  { 'EQ#1': '#88c0d0', 'EQ#2': '#bf616a', 'EQ#3': '#a3be8c', 'EQ#4': '#ebcb8b', 'EQ#5': '#b48ead', 'EQ#6': '#81a1c1', 'EQ#7': '#d08770', 'EQ#8': '#8fbcbb', 'EQ#9': '#5e81ac', 'EQ#10': '#e09fa0' },
];

// SHAP 막대 색상: 양수 기여=붉은 계열, 음수 기여=파란 계열
export const SHAP_POS_C = '#f43f5e';
export const SHAP_NEG_C = '#38bdf8';

export const EQP_NAMES: string[] = ['EQ#1', 'EQ#2', 'EQ#3', 'EQ#4', 'EQ#5', 'EQ#6'];

// ── SHAP 타임라인 날짜 + 스냅샷 데이터 ──────────────────────────────────────
/** BUILT_IN_DATA와 동일한 달력 범위 (UTC toISOString 오차 방지를 위해 직접 조립) */
export const SHAP_DATES = (() => {
  const out: string[] = [];
  for (let i = 0; i < 59; i++) {
    const d = new Date(2026, 0, 1 + i);
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push(`${d.getFullYear()}-${m}-${day}`);
  }
  return out;
})();

// 의사 노이즈 헬퍼 — 두 사인 합산으로 자연스러운 변동 생성 (i=날짜 인덱스, s=시드, a=진폭)
const _sn = (i: number, s: number, a: number) =>
  Math.sin(i * 0.31 + s * 1.9) * a * 0.65 + Math.sin(i * 0.11 + s * 3.7) * a * 0.35;

// 전체 SHAP 스냅샷 — 날짜별 base·feature 기여도 (PLS 모델 전체 집계)
export const SHAP_HISTORY: SHAPSnapshot[] = SHAP_DATES.map((date, i) => ({
  date,
  base: +(45.0 + _sn(i, 0, 2.5)).toFixed(2),
  items: [
    { feature: '진동(mm/s)', featureVal: Math.max(1.5, 2.80 + _sn(i,  1, 0.6)).toFixed(2), shap: +(8.2  + _sn(i,  1, 3.0)).toFixed(2) },
    { feature: '온도(°C)',   featureVal: (87.5 + _sn(i,  2, 4.0)).toFixed(1),               shap: +(5.6  + _sn(i,  2, 2.5)).toFixed(2) },
    { feature: '전류(A)',    featureVal: (14.2 + _sn(i,  3, 1.2)).toFixed(1),               shap: +(-3.4 + _sn(i,  3, 1.8)).toFixed(2) },
    { feature: '압력(bar)',  featureVal: (6.8  + _sn(i,  4, 0.5)).toFixed(1),               shap: +(-2.1 + _sn(i,  4, 1.2)).toFixed(2) },
    { feature: '소음(dB)',   featureVal: (68.0 + _sn(i,  5, 3.0)).toFixed(1),               shap: +(1.8  + _sn(i,  5, 1.0)).toFixed(2) },
    { feature: '유량(L/m)', featureVal: (98.3  + _sn(i,  6, 5.0)).toFixed(1),              shap: +(-1.2 + _sn(i,  6, 0.8)).toFixed(2) },
    { feature: '마모도',     featureVal: Math.max(0.1, 0.42 + _sn(i, 7, 0.1)).toFixed(2),  shap: +(0.9  + _sn(i,  7, 0.5)).toFixed(2) },
    { feature: '습도(%)',    featureVal: (65.0  + _sn(i,  8, 5.0)).toFixed(1),              shap: +(-0.6 + _sn(i,  8, 0.4)).toFixed(2) },
    { feature: '속도(RPM)', featureVal: String(1450 + Math.round(_sn(i, 9, 50))),            shap: +(-0.2 + _sn(i,  9, 0.3)).toFixed(2) },
    { feature: '기타 2개',  featureVal: '',                                                   shap: +(0.3  + _sn(i, 10, 0.2)).toFixed(2) },
  ],
}));

// 설비별 base·bias — SHAP_HISTORY에 더해 설비 특성을 반영한 EQP_SHAP_HISTORY 생성
const _EQP_CFG: Record<string, { base: number; bias: number[] }> = {
  'EQ#1': { base: 43.5, bias: [ 2.0,  0.8, -0.7, -0.7,  0.5, -0.3,  0.3, -0.2, -0.1,  0.1] },
  'EQ#2': { base: 46.2, bias: [-1.7, -1.4,  0.5,  0.4, -0.4,  0.3, -0.2,  0.2,  0.1, -0.1] },
  'EQ#3': { base: 44.8, bias: [ 0.9, -0.4,  0.4, -0.3,  0.2,  0.4, -0.1,  0.1, -0.1,  0.0] },
  'EQ#4': { base: 47.1, bias: [-3.4, -2.5,  1.2,  0.9, -0.7,  0.8, -0.3,  0.3,  0.3, -0.1] },
  'EQ#5': { base: 45.5, bias: [-0.4, -1.7,  0.8, -0.2, -0.2, -0.1, -0.1, -0.1, -0.1,  0.1] },
  'EQ#6': { base: 44.2, bias: [ 3.3,  1.6, -1.7, -1.1,  0.8, -0.6,  0.5, -0.3, -0.2,  0.2] },
};

export const EQP_SHAP_HISTORY: Record<string, SHAPSnapshot[]> = Object.fromEntries(
  EQP_NAMES.map(eq => {
    const cfg = _EQP_CFG[eq];
    return [eq, SHAP_DATES.map((date, i) => ({
      date,
      base: +(cfg.base + _sn(i, 0, 1.5)).toFixed(2),
      items: SHAP_HISTORY[i].items.map((item, fi) => ({
        ...item,
        shap: +(item.shap + cfg.bias[fi] + _sn(i, fi + 11, 0.4)).toFixed(2),
      })),
    }))];
  })
);

// 초기 선택 날짜 인덱스 — 가장 최신 날짜(배열 끝)를 기본으로 표시
export const SHAP_DATE_IDX_DEFAULT = SHAP_HISTORY.length - 1;

// ── Pred/Actual 시계열 데이터 (설비별) ────────────────────────────────────────
// 설비별 기준값·추세 기울기 — 교번 상승/하강 추세로 다양한 패턴 시뮬레이션
const _PA_BASE: Record<string, number> = {
  'EQ#1': 55, 'EQ#2': 59, 'EQ#3': 63, 'EQ#4': 67, 'EQ#5': 51, 'EQ#6': 71,
};
const _PA_SLOPES = [16, -14, 10, -20, 12, -10];
export const PRED_ACTUAL_DATA: PredActualPoint[] = SHAP_DATES.flatMap((date, i) =>
  EQP_NAMES.map((eq, eqIdx) => {
    const base = _PA_BASE[eq];
    const n = SHAP_DATES.length;
    const trend = (i / Math.max(n - 1, 1) - 0.5) * (_PA_SLOPES[eqIdx] ?? 12) * 2;
    const actual = Math.max(10, Math.min(99, +(base + trend + _sn(i, eqIdx * 2, 4)).toFixed(1)));
    const pred   = Math.max(10, Math.min(99, +(actual + _sn(i, eqIdx * 2 + 7, 2.5)).toFixed(1)));
    return { date, eq, actual, pred };
  })
);

// ── Steam Prediction 데이터 (2026-01-01 ~ 2026-02-28) ──────────────────────
export const STEAM_PRED_DATA: SteamPredPoint[] = [
  { date:'2026-01-01', actual:1440, pred:1455, maeLower:1435, maeUpper:1475, rmseLower:1425, rmseUpper:1485 },
  { date:'2026-01-02', actual:1460, pred:1535, maeLower:1515, maeUpper:1555, rmseLower:1505, rmseUpper:1565 },
  { date:'2026-01-03', actual:1520, pred:1565, maeLower:1545, maeUpper:1585, rmseLower:1535, rmseUpper:1595 },
  { date:'2026-01-04', actual:1465, pred:1485, maeLower:1465, maeUpper:1505, rmseLower:1455, rmseUpper:1515 },
  { date:'2026-01-05', actual:1410, pred:1430, maeLower:1410, maeUpper:1450, rmseLower:1400, rmseUpper:1460 },
  { date:'2026-01-06', actual:1408, pred:1425, maeLower:1405, maeUpper:1445, rmseLower:1395, rmseUpper:1455 },
  { date:'2026-01-07', actual:1392, pred:1402, maeLower:1382, maeUpper:1422, rmseLower:1372, rmseUpper:1432 },
  { date:'2026-01-08', actual:1388, pred:1430, maeLower:1410, maeUpper:1450, rmseLower:1400, rmseUpper:1460 },
  { date:'2026-01-09', actual:1360, pred:1375, maeLower:1355, maeUpper:1395, rmseLower:1345, rmseUpper:1405 },
  { date:'2026-01-10', actual:1365, pred:1402, maeLower:1382, maeUpper:1422, rmseLower:1372, rmseUpper:1432 },
  { date:'2026-01-11', actual:1360, pred:1395, maeLower:1375, maeUpper:1415, rmseLower:1365, rmseUpper:1425 },
  { date:'2026-01-12', actual:1403, pred:1420, maeLower:1400, maeUpper:1440, rmseLower:1390, rmseUpper:1450 },
  { date:'2026-01-13', actual:1380, pred:1390, maeLower:1370, maeUpper:1410, rmseLower:1360, rmseUpper:1420 },
  { date:'2026-01-14', actual:1432, pred:1440, maeLower:1420, maeUpper:1460, rmseLower:1410, rmseUpper:1470 },
  { date:'2026-01-15', actual:1355, pred:1362, maeLower:1342, maeUpper:1382, rmseLower:1332, rmseUpper:1392 },
  { date:'2026-01-16', actual:1330, pred:1362, maeLower:1342, maeUpper:1382, rmseLower:1332, rmseUpper:1392 },
  { date:'2026-01-17', actual:1315, pred:1338, maeLower:1318, maeUpper:1358, rmseLower:1308, rmseUpper:1368 },
  { date:'2026-01-18', actual:1363, pred:1505, maeLower:1485, maeUpper:1525, rmseLower:1475, rmseUpper:1535 },
  { date:'2026-01-19', actual:1398, pred:1422, maeLower:1402, maeUpper:1442, rmseLower:1392, rmseUpper:1452 },
  { date:'2026-01-20', actual:1435, pred:1448, maeLower:1428, maeUpper:1468, rmseLower:1418, rmseUpper:1478 },
  { date:'2026-01-21', actual:1380, pred:1415, maeLower:1395, maeUpper:1435, rmseLower:1385, rmseUpper:1445 },
  { date:'2026-01-22', actual:1393, pred:1418, maeLower:1398, maeUpper:1438, rmseLower:1388, rmseUpper:1448 },
  { date:'2026-01-23', actual:1433, pred:1460, maeLower:1440, maeUpper:1480, rmseLower:1430, rmseUpper:1490 },
  { date:'2026-01-24', actual:1225, pred:1320, maeLower:1300, maeUpper:1340, rmseLower:1290, rmseUpper:1350 },
  { date:'2026-01-25', actual:1242, pred:1272, maeLower:1252, maeUpper:1292, rmseLower:1242, rmseUpper:1302 },
  { date:'2026-01-26', actual:1250, pred:1267, maeLower:1247, maeUpper:1287, rmseLower:1237, rmseUpper:1297 },
  { date:'2026-01-27', actual:1245, pred:1313, maeLower:1293, maeUpper:1333, rmseLower:1283, rmseUpper:1343 },
  { date:'2026-01-28', actual:1212, pred:1243, maeLower:1223, maeUpper:1263, rmseLower:1213, rmseUpper:1273 },
  { date:'2026-01-29', actual:1240, pred:1345, maeLower:1325, maeUpper:1365, rmseLower:1315, rmseUpper:1375 },
  { date:'2026-01-30', actual:1255, pred:1297, maeLower:1277, maeUpper:1317, rmseLower:1267, rmseUpper:1327 },
  { date:'2026-01-31', actual:1290, pred:1322, maeLower:1302, maeUpper:1342, rmseLower:1292, rmseUpper:1352 },
  { date:'2026-02-01', actual:1253, pred:1295, maeLower:1275, maeUpper:1315, rmseLower:1265, rmseUpper:1325 },
  { date:'2026-02-02', actual:1278, pred:1315, maeLower:1295, maeUpper:1335, rmseLower:1285, rmseUpper:1345 },
  { date:'2026-02-03', actual:1312, pred:1348, maeLower:1328, maeUpper:1368, rmseLower:1318, rmseUpper:1378 },
  { date:'2026-02-04', actual:1410, pred:1425, maeLower:1405, maeUpper:1445, rmseLower:1395, rmseUpper:1455 },
  { date:'2026-02-05', actual:1290, pred:1335, maeLower:1315, maeUpper:1355, rmseLower:1305, rmseUpper:1365 },
  { date:'2026-02-06', actual:1240, pred:1280, maeLower:1260, maeUpper:1300, rmseLower:1250, rmseUpper:1310 },
  { date:'2026-02-07', actual:1233, pred:1365, maeLower:1345, maeUpper:1385, rmseLower:1335, rmseUpper:1395 },
  { date:'2026-02-08', actual:1288, pred:1305, maeLower:1285, maeUpper:1325, rmseLower:1275, rmseUpper:1335 },
  { date:'2026-02-09', actual:1426, pred:1439, maeLower:1419, maeUpper:1459, rmseLower:1409, rmseUpper:1469 },
  { date:'2026-02-10', actual:1384, pred:1419, maeLower:1399, maeUpper:1439, rmseLower:1389, rmseUpper:1449 },
  { date:'2026-02-11', actual:1406, pred:1431, maeLower:1411, maeUpper:1451, rmseLower:1401, rmseUpper:1461 },
  { date:'2026-02-12', actual:1432, pred:1459, maeLower:1439, maeUpper:1479, rmseLower:1429, rmseUpper:1489 },
  { date:'2026-02-13', actual:1220, pred:1315, maeLower:1295, maeUpper:1335, rmseLower:1285, rmseUpper:1345 },
  { date:'2026-02-14', actual:1234, pred:1264, maeLower:1244, maeUpper:1284, rmseLower:1234, rmseUpper:1294 },
  { date:'2026-02-15', actual:1263, pred:1280, maeLower:1260, maeUpper:1300, rmseLower:1250, rmseUpper:1310 },
  { date:'2026-02-16', actual:1250, pred:1318, maeLower:1298, maeUpper:1338, rmseLower:1288, rmseUpper:1348 },
  { date:'2026-02-17', actual:1203, pred:1234, maeLower:1214, maeUpper:1254, rmseLower:1204, rmseUpper:1264 },
  { date:'2026-02-18', actual:1250, pred:1355, maeLower:1335, maeUpper:1375, rmseLower:1325, rmseUpper:1385 },
  { date:'2026-02-19', actual:1258, pred:1300, maeLower:1280, maeUpper:1320, rmseLower:1270, rmseUpper:1330 },
  { date:'2026-02-20', actual:1297, pred:1329, maeLower:1309, maeUpper:1349, rmseLower:1299, rmseUpper:1359 },
  { date:'2026-02-21', actual:1248, pred:1290, maeLower:1270, maeUpper:1310, rmseLower:1260, rmseUpper:1320 },
  { date:'2026-02-22', actual:1273, pred:1310, maeLower:1290, maeUpper:1330, rmseLower:1280, rmseUpper:1340 },
  { date:'2026-02-23', actual:1320, pred:1356, maeLower:1336, maeUpper:1376, rmseLower:1326, rmseUpper:1386 },
  { date:'2026-02-24', actual:1415, pred:1430, maeLower:1410, maeUpper:1450, rmseLower:1400, rmseUpper:1460 },
  { date:'2026-02-25', actual:1278, pred:1323, maeLower:1303, maeUpper:1343, rmseLower:1293, rmseUpper:1353 },
  { date:'2026-02-26', actual:1232, pred:1272, maeLower:1252, maeUpper:1292, rmseLower:1242, rmseUpper:1302 },
  { date:'2026-02-27', actual:1241, pred:1373, maeLower:1353, maeUpper:1393, rmseLower:1343, rmseUpper:1403 },
  { date:'2026-02-28', actual:1275, pred:1292, maeLower:1272, maeUpper:1312, rmseLower:1262, rmseUpper:1322 },
];
