/** Slope·Center 마크 빌더 */
import { linearRegression, type LinearRegression } from './math';

export type { LinearRegression };

/** Line 차트 시리즈 변수 (Scatter X/Y축과 구분) */
export type LineVar = 'A' | 'B';

// Slope 패널에서 A·B 두 변수를 EQ별 또는 평균으로 묶은 점 집합
export type ABDataGroup = {
  label: string;
  eq: string | null;
  color: string;
  points: { a: number; b: number }[];
};

// Slope 패널 Center 선 — A/B 축별 EQ(또는 평균) 평균값
export type ABCenterMark = {
  var: LineVar;
  label: string;
  eq: string | null;
  color: string;
  mean: number;
};

// 수치 크기에 따라 소수점 자릿수를 조정해 레이블 너비를 절약
export function fmtLineVarMean(v: number): string {
  return v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : String(Math.round(v));
}

export function lineVarMeanSymbol(v: LineVar): string {
  return v === 'A' ? 'Ā' : 'B̄';
}

/** 가시 구간·EQ 선택 기준 (A,B) 점 집합 — Slope 회귀용 */
export function buildABDataGroups(
  data: { date: string; eq: string; x: number; y: number }[],
  dates: string[],
  eqs: string[],
  hiddenEqs: Set<string>,
  fvi: number,
  lvi: number,
  eqColors: Record<string, string>,
): ABDataGroup[] {
  const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
  // hiddenEqs가 없으면 장비 구분 없이 날짜별 평균 단일 그룹으로 집계
  const useAverage = hiddenEqs.size === 0;
  const groups: ABDataGroup[] = [];
  const index = new Map(data.map(d => [`${d.date}\0${d.eq}`, d]));

  const pushPoints = (label: string, eq: string | null, color: string, points: { a: number; b: number }[]) => {
    if (points.length) groups.push({ label, eq, color, points });
  };

  if (useAverage) {
    const points: { a: number; b: number }[] = [];
    for (let i = fvi; i <= lvi; i++) {
      const as: number[] = [];
      const bs: number[] = [];
      for (const e of visibleEqs) {
        const row = index.get(`${dates[i]}\0${e}`);
        if (row) { as.push(row.x); bs.push(row.y); }
      }
      if (as.length) {
        points.push({
          a: as.reduce((s, v) => s + v, 0) / as.length,
          b: bs.reduce((s, v) => s + v, 0) / bs.length,
        });
      }
    }
    pushPoints('평균', null, '#94a3b8', points);
  } else {
    for (const eq of visibleEqs) {
      const points: { a: number; b: number }[] = [];
      for (let i = fvi; i <= lvi; i++) {
        const row = index.get(`${dates[i]}\0${eq}`);
        if (row) points.push({ a: row.x, b: row.y });
      }
      pushPoints(eq, eq, eqColors[eq] ?? '#94a3b8', points);
    }
  }
  return groups;
}

/** EQ(또는 평균)별 A·B 변수 평균 — Center 선 */
export function buildABCenterMarks(
  data: { date: string; eq: string; x: number; y: number }[],
  dates: string[],
  eqs: string[],
  hiddenEqs: Set<string>,
  fvi: number,
  lvi: number,
  eqColors: Record<string, string>,
): ABCenterMark[] {
  const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
  const useAverage = hiddenEqs.size === 0;
  const marks: ABCenterMark[] = [];
  const index = new Map(data.map(d => [`${d.date}\0${d.eq}`, d]));

  const pushMeans = (label: string, eq: string | null, color: string, aVals: number[], bVals: number[]) => {
    if (aVals.length) {
      marks.push({
        var: 'A',
        label,
        eq,
        color,
        mean: aVals.reduce((s, v) => s + v, 0) / aVals.length,
      });
    }
    if (bVals.length) {
      marks.push({
        var: 'B',
        label,
        eq,
        color,
        mean: bVals.reduce((s, v) => s + v, 0) / bVals.length,
      });
    }
  };

  if (useAverage) {
    const aVals: number[] = [];
    const bVals: number[] = [];
    for (let i = fvi; i <= lvi; i++) {
      const as: number[] = [];
      const bs: number[] = [];
      for (const e of visibleEqs) {
        const row = index.get(`${dates[i]}\0${e}`);
        if (row) { as.push(row.x); bs.push(row.y); }
      }
      if (as.length) {
        aVals.push(as.reduce((s, v) => s + v, 0) / as.length);
        bVals.push(bs.reduce((s, v) => s + v, 0) / bs.length);
      }
    }
    pushMeans('평균', null, '#94a3b8', aVals, bVals);
  } else {
    for (const eq of visibleEqs) {
      const aVals: number[] = [];
      const bVals: number[] = [];
      for (let i = fvi; i <= lvi; i++) {
        const row = index.get(`${dates[i]}\0${eq}`);
        if (row) { aVals.push(row.x); bVals.push(row.y); }
      }
      pushMeans(eq, eq, eqColors[eq] ?? '#94a3b8', aVals, bVals);
    }
  }
  return marks;
}

/** 산점도 축 (Actual=X, Pred=Y) */
export type ScatterAxisVar = 'X' | 'Y';

// PredActual 산점도 Center 선 — X(Actual)·Y(Pred) 평균을 EQ별 또는 통합 평균으로 표시
export type ScatterCenterMark = {
  var: ScatterAxisVar;
  label: string;
  eq: string | null;
  color: string;
  mean: number;
};

export function scatterAxisMeanSymbol(v: ScatterAxisVar): string {
  return v === 'X' ? 'X̄' : 'Ȳ';
}

// hiddenEqs가 없으면 전체 포인트를 단일 평균으로 처리
export function buildPredActualCenterMarks(
  points: { eq: string; actual: number; pred: number }[],
  eqs: string[],
  hiddenEqs: Set<string>,
  eqColors: Record<string, string>,
): ScatterCenterMark[] {
  const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
  const useAverage = hiddenEqs.size === 0;
  const marks: ScatterCenterMark[] = [];

  const pushMeans = (label: string, eq: string | null, color: string, rows: { actual: number; pred: number }[]) => {
    if (!rows.length) return;
    const xVals = rows.map(r => r.actual);
    const yVals = rows.map(r => r.pred);
    marks.push({
      var: 'X',
      label,
      eq,
      color,
      mean: xVals.reduce((s, v) => s + v, 0) / xVals.length,
    });
    marks.push({
      var: 'Y',
      label,
      eq,
      color,
      mean: yVals.reduce((s, v) => s + v, 0) / yVals.length,
    });
  };

  const visibleSet = new Set(visibleEqs);
  if (useAverage) {
    pushMeans('평균', null, '#94a3b8', points.filter(p => visibleSet.has(p.eq)));
  } else {
    for (const eq of visibleEqs) {
      pushMeans(eq, eq, eqColors[eq] ?? '#94a3b8', points.filter(p => p.eq === eq));
    }
  }
  return marks;
}

// PredActual 산점도 Slope 회귀선 데이터 타입
export type PredActualSlopeLine = {
  label: string;
  color: string;
  eq: string | null;
  reg: LinearRegression;
};

/** Actual→Pred 1차 회귀선 (산점도 Slope) */
export function buildPredActualSlopeLines(
  points: { eq: string; actual: number; pred: number }[],
  eqs: string[],
  hiddenEqs: Set<string>,
  eqColors: Record<string, string>,
): PredActualSlopeLine[] {
  const visibleEqs = eqs.filter(eq => !hiddenEqs.has(eq));
  const useAverage = hiddenEqs.size === 0;
  const lines: PredActualSlopeLine[] = [];

  const pushLine = (label: string, eq: string | null, rows: { actual: number; pred: number }[]) => {
    if (rows.length < 2) return;
    const reg = linearRegression(rows.map(r => r.actual), rows.map(r => r.pred));
    if (!reg) return;
    lines.push({
      label,
      color: eq ? (eqColors[eq] ?? '#94a3b8') : '#94a3b8',
      eq,
      reg,
    });
  };

  const visibleSet = new Set(visibleEqs);
  if (useAverage) {
    pushLine('평균', null, points.filter(p => visibleSet.has(p.eq)));
  } else {
    for (const eq of visibleEqs) {
      pushLine(eq, eq, points.filter(p => p.eq === eq));
    }
  }
  return lines;
}
