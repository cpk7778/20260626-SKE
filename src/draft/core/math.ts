/** 스케일·회귀·눈금 유틸 */
// X축 선형 스케일: 값 → SVG 픽셀 X
export const scaleLinear = (v: number, min: number, max: number, pxMin: number, pxRange: number) =>
  pxMin + ((v - min) / Math.max(max - min, 1e-9)) * pxRange;

// Y축 선형 스케일: 값 → SVG 픽셀 Y (위쪽이 작은 값이므로 반전)
export const scaleLinearY = (v: number, min: number, max: number, top: number, height: number) =>
  top + height - ((v - min) / Math.max(max - min, 1e-9)) * height;

export type LinearRegression = { m: number; b: number; r2: number };

/** 최소제곱 1차 회귀 — xs·ys 길이 ≥ 2, 분산 0이면 null */
export function linearRegression(xs: number[], ys: number[]): LinearRegression | null {
  const n = xs.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
    sumXY += xs[i] * ys[i];
    sumX2 += xs[i] * xs[i];
  }
  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;
  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY - m * sumX) / n;
  const meanY = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const pred = m * xs[i] + b;
    ssRes += (ys[i] - pred) ** 2;
    ssTot += (ys[i] - meanY) ** 2;
  }
  // ssTot ≈ 0이면 예측이 완벽(1) 또는 완전히 틀림(0)
  const r2 = ssTot < 1e-12 ? (ssRes < 1e-12 ? 1 : 0) : Math.max(0, Math.min(1, 1 - ssRes / ssTot));
  return { m, b, r2 };
}

// periodDays 기준으로 날짜 배열 끝에서 N일치 데이터만 남김
export function sliceByPeriodDays<T extends { date: string }>(
  data: T[], allDates: string[], periodDays: number
): T[] {
  if (periodDays <= 0 || periodDays >= allDates.length) return data;
  const cutoff = allDates[allDates.length - periodDays];
  return data.filter(d => d.date >= cutoff);
}

// 팔레트에 없는 장비는 중립 회색 반환
export function eqColor(eqColors: Record<string, string>, eq: string): string {
  return eqColors[eq] ?? '#94a3b8';
}

// "사람이 읽기 좋은" 눈금 간격을 1/2/2.5/5 배수에서 선택 — 최대 maxCount개 이하
export function genTicks(lo: number, hi: number, maxCount = 6): number[] {
  const range = hi - lo;
  const rough = range / maxCount;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => range / s <= maxCount) ?? mag * 10;
  const start = Math.ceil(lo / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= hi + step * 1e-6; v += step)
    ticks.push(Math.round(v * 1e8) / 1e8);
  return ticks;
}

// Ray Casting 알고리즘 — 폴리곤 내부 포함 여부 판별 (Lasso 선택 등에 사용)
export function ptInPoly(pt: { x: number; y: number }, poly: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const { x: xi, y: yi } = poly[i], { x: xj, y: yj } = poly[j];
    if (((yi > pt.y) !== (yj > pt.y)) && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
