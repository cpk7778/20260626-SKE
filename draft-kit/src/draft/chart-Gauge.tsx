import { useContext, useMemo, useRef, useState } from 'react';
import type { XYPoint } from './data-draft';
import { EqColorContext, useChartControls, useContainerSize, EqLegend } from './shared';
import { useGaugeBulletChart, GaugeBulletControls, GaugeBulletTimeline } from './shared';
import { DraftDragHandle } from './ui';

// ── Gauge 차트 ───────────────────────────────────────────────────────────────
// Gauge 차트 각도 상수 — Pac-Man(하향) 게이지: 210°(좌하) → 330°(우하) 시계방향 240° 호
const G_START = 7 * Math.PI / 6;               // 210°
const G_END   = -Math.PI / 6;                   // -30° = 330°
const G_SWEEP = G_START - G_END;               // 240°

const GAUGE_MULTI_READOUT_H = 22;
const GAUGE_MULTI_PAD_X = 12;
const GAUGE_MULTI_PAD_Y = 10;
/** compact 반원 게이지 — 반지름 대비 SVG 높이 비율 */
const GAUGE_MULTI_R_TO_H = 1.22;

/** wrap 높이에 비례한 기본 행 간격 — 영역이 커지면 간격도 커짐 */
function gaugeMultiRowGapFromHeight(wrapH: number, rows: number): number {
  if (rows <= 1) return 0;
  const ratio = rows >= 3 ? 0.035 : 0.05;
  return Math.round(Math.max(6, Math.min(64, wrapH * ratio)));
}

/** 게이지·readout 확정 후 남는 세로 공간을 행 간격에 추가 분배 */
function gaugeMultiDisplayRowGap(wrapH: number, rows: number, rowBlockH: number): number {
  if (rows <= 1) return 0;
  const vPad = 12;
  const baseGap = gaugeMultiRowGapFromHeight(wrapH, rows);
  const contentH = rowBlockH * rows + baseGap * (rows - 1);
  const slack = wrapH - vPad - contentH;
  if (slack <= 0) return baseGap;
  const extra = (slack * 0.75) / (rows - 1);
  return Math.round(baseGap + extra);
}

/** wrap 실측 크기에서 반지름이 최대가 되는 Multi 그리드 열 수 (6패널) */
function gaugeMultiGridCols(wrapW: number, wrapH: number): number {
  const candidates = [6, 3, 2];
  let bestCols = 3;
  let bestR = 0;
  for (const cols of candidates) {
    const rows = Math.ceil(6 / cols);
    const rowGap = gaugeMultiRowGapFromHeight(wrapH, rows);
    const r = gaugeMultiMaxRadius(wrapW, wrapH, cols, rows, rowGap);
    if (r > bestR) {
      bestR = r;
      bestCols = cols;
    }
  }
  return bestCols;
}

function gaugeMultiMaxRadius(
  wrapW: number,
  wrapH: number,
  gridCols: number,
  rows: number,
  rowGap: number,
): number {
  if (wrapW < 24 || wrapH < 24) return 0;
  const colGap = gaugeMultiColGap(gridCols);
  const cellW = (wrapW - 16 - colGap * Math.max(0, gridCols - 1)) / gridCols;
  const rowBlockH = (wrapH - 12 - rowGap * Math.max(0, rows - 1)) / rows;
  const plotBandH = rowBlockH - GAUGE_MULTI_READOUT_H - 6;
  const rFromW = (cellW - GAUGE_MULTI_PAD_X) / 2;
  const rFromH = (plotBandH - GAUGE_MULTI_PAD_Y) / GAUGE_MULTI_R_TO_H;
  return Math.max(0, Math.min(rFromW, rFromH));
}

function gaugeSlotGridColumn(slotIdx: number, total: number, cols: number): number | undefined {
  const lastRowCount = total % cols || cols;
  if (lastRowCount === cols) return undefined;
  const firstInLast = total - lastRowCount;
  if (slotIdx < firstInLast) return undefined;
  const startCol = Math.floor((cols - lastRowCount) / 2) + 1;
  return startCol + (slotIdx - firstInLast);
}

function gaugeMultiColGap(gridCols: number): number {
  if (gridCols >= 6) return 8;
  if (gridCols >= 4) return 10;
  return 14;
}

/** wrap 실측 크기로 셀당 게이지 SVG 크기 — rowGap 반영 */
function gaugeMultiPlotSize(
  wrapW: number, wrapH: number, gridCols: number, rows: number, rowGap: number,
) {
  if (wrapW < 24 || wrapH < 24) return { cellW: 80, cellH: 64, rowBlockH: 64 };

  const colGap = gaugeMultiColGap(gridCols);
  const cellW = (wrapW - 16 - colGap * Math.max(0, gridCols - 1)) / gridCols;
  const rowBlockH = (wrapH - 12 - rowGap * Math.max(0, rows - 1)) / rows;
  const plotBandH = rowBlockH - GAUGE_MULTI_READOUT_H - 6;

  return {
    cellW: Math.floor(cellW),
    cellH: Math.max(64, Math.floor(plotBandH)),
    rowBlockH: Math.ceil(rowBlockH),
  };
}

function gaugeMultiLayout(wrapW: number, wrapH: number, gridCols: number, gridRows: number) {
  let rowGap = gaugeMultiRowGapFromHeight(wrapH, gridRows);
  let plot = gaugeMultiPlotSize(wrapW, wrapH, gridCols, gridRows, rowGap);
  rowGap = gaugeMultiDisplayRowGap(wrapH, gridRows, plot.rowBlockH);
  plot = gaugeMultiPlotSize(wrapW, wrapH, gridCols, gridRows, rowGap);
  return { rowGap, ...plot };
}

type GaugeFaceProps = {
  width: number;
  height: number;
  needleEqs: string[];
  eqColors: Record<string, string>;
  eqYValues: Map<string, number>;
  rangeMin: number;
  rangeMax: number;
  warnClamped: number;
  alertClamped: number;
  totalRange: number;
  isPlaying: boolean;
  compact?: boolean;
};

// Pac-Man형 SVG 게이지 — 존(정상/주의/경고) 아크·바늘·눈금 렌더링
function GaugeFace({
  width, height, needleEqs, eqColors, eqYValues,
  rangeMin, rangeMax, warnClamped, alertClamped, totalRange, isPlaying, compact = false,
}: GaugeFaceProps) {
  const cx = width / 2;
  const rOuter = Math.max(8, Math.min(
    cx - (compact ? 6 : 16),
    (height - (compact ? GAUGE_MULTI_PAD_Y : 30)) / (compact ? GAUGE_MULTI_R_TO_H : 1.5),
  ));
  const cy = compact ? 8 + rOuter * 0.9 : rOuter + 22;
  const bandW = Math.max(4, rOuter * 0.075);
  const rBand = rOuter - bandW / 2;
  const rInner = rOuter - bandW;
  const rNeedle = rOuter * 0.6;
  const rPivot = Math.max(3, rOuter * 0.055);

  const valToAngle = (v: number) => {
    const n = Math.max(0, Math.min(1, (v - rangeMin) / totalRange));
    return G_START - n * G_SWEEP;
  };

  const polar = (angle: number, r: number) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  });

  const arcSeg = (aStart: number, aEnd: number, r: number) => {
    const p1 = polar(aStart, r), p2 = polar(aEnd, r);
    let sw = aStart - aEnd;
    sw = ((sw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    const large = sw > Math.PI + 1e-9 ? 1 : 0;
    return `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  };

  const zones = [
    { v1: rangeMin, v2: warnClamped, color: '#22c55e' },
    { v1: warnClamped, v2: alertClamped, color: '#f97316' },
    { v1: alertClamped, v2: rangeMax, color: '#ef4444' },
  ];
  const zoneBounds = [
    { val: warnClamped, color: '#f97316' },
    { val: alertClamped, color: '#ef4444' },
  ];

  const majorVals: number[] = [];
  const firstMajor = Math.ceil(rangeMin / 10) * 10;
  for (let v = firstMajor; v <= rangeMax + 1e-9; v += 10) majorVals.push(v);

  const minorVals: number[] = [];
  if (totalRange <= 300) {
    for (let v = Math.ceil(rangeMin); v <= Math.floor(rangeMax); v++) {
      if (v % 10 !== 0) minorVals.push(v);
    }
  }

  const svgH = Math.min(height, cy + (compact ? rOuter * 0.2 : rOuter * 0.35) + 4);

  return (
    <svg width={width} height={svgH} className="gauge-chart-svg">
      <path d={arcSeg(G_START, G_END, rBand)} fill="none"
        stroke="#1e293b" strokeWidth={bandW} strokeLinecap="butt" />
      {zones.map((z, i) => (
        <path key={i} d={arcSeg(valToAngle(z.v1), valToAngle(z.v2), rBand)}
          fill="none" stroke={z.color} strokeWidth={bandW} strokeLinecap="butt" opacity={0.9} />
      ))}
      {zoneBounds.map((b, i) => {
        const angle = valToAngle(b.val);
        const lp = polar(angle, rOuter + Math.min(11, rOuter * 0.12));
        return (
          <text key={i} x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={rOuter < 40 ? 7 : 8} fontWeight="bold" fill={b.color}>
            {Math.round(b.val)}
          </text>
        );
      })}
      {minorVals.map((v, i) => {
        const a = valToAngle(v);
        const p1 = polar(a, rInner - 5 - 6), p2 = polar(a, rInner - 5);
        return <line key={i} x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)}
          x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke="#475569" strokeWidth={1} />;
      })}
      {majorVals.map((v, i) => {
        const a = valToAngle(v);
        const tickOut = rInner - 5 - (rOuter < 40 ? 8 : 12);
        const p1 = polar(a, tickOut), p2 = polar(a, rInner - 5);
        const lp = polar(a, tickOut - (rOuter < 40 ? 7 : 9));
        return (
          <g key={i}>
            <line x1={p1.x.toFixed(1)} y1={p1.y.toFixed(1)}
              x2={p2.x.toFixed(1)} y2={p2.y.toFixed(1)} stroke="#94a3b8" strokeWidth={1.5} />
            <text x={lp.x.toFixed(1)} y={lp.y.toFixed(1)}
              textAnchor="middle" dominantBaseline="middle"
              fontSize={rOuter < 40 ? 7 : 8} fill="#64748b">{v}</text>
          </g>
        );
      })}
      {needleEqs.map(eq => {
        const v = eqYValues.get(eq) ?? rangeMin;
        const angleDeg = valToAngle(v) * 180 / Math.PI;
        const col = eqColors[eq] ?? '#94a3b8';
        return (
          <g key={eq}
            style={{
              transform: `translate(${cx}px,${cy}px) rotate(${-angleDeg}deg)`,
              ...(isPlaying ? { transition: 'transform 0.4s ease-out' } : {}),
            }}
          >
            <line x1={0} y1={0} x2={rNeedle} y2={0}
              stroke={col} strokeWidth={rOuter < 40 ? 2 : 3} strokeLinecap="round" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={rPivot} fill="#0f172a" stroke="#475569" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={rPivot * 0.45} fill="#64748b" />
    </svg>
  );
}

export function GaugeChart({ data, chartHeight }: { data: XYPoint[]; chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const [gaugeSplitCount, setGaugeSplitCount] = useState(1);
  const {
    eqs, hiddenEqs, selectEq, eqYValues, visibleEqs,
    rangeMin, setRangeMin, rangeMax, setRangeMax,
    warnVal, setWarnVal, alertVal, setAlertVal,
    warnClamped, alertClamped, totalRange,
    dataMin, dataMax, resetAll, isModified, timeline,
  } = useGaugeBulletChart(data);
  const { isPlaying } = timeline;

  const isGaugeModified = isModified || gaugeSplitCount !== 1;
  const handleReset = () => {
    resetAll();
    setGaugeSplitCount(1);
  };

  const gaugeSlots = useMemo(() => {
    if (gaugeSplitCount === 1) {
      return [{ id: 'all', label: '', needleEqs: visibleEqs }];
    }
    return eqs.map(eq => ({
      id: eq,
      needleEqs: hiddenEqs.has(eq) ? [] : [eq],
    }));
  }, [gaugeSplitCount, eqs, hiddenEqs]);

  const gridCols = gaugeSplitCount > 1 ? gaugeMultiGridCols(size.w, size.h) : 1;
  const gridRows = Math.ceil(6 / gridCols);
  const multiLayout = gaugeSplitCount > 1
    ? gaugeMultiLayout(size.w, size.h, gridCols, gridRows)
    : null;
  const rowGap = multiLayout?.rowGap ?? 0;
  const cellW = multiLayout?.cellW ?? size.w;
  const cellH = multiLayout?.cellH ?? size.h;

  const faceProps = {
    eqColors, eqYValues, rangeMin, rangeMax, warnClamped, alertClamped, totalRange, isPlaying,
  };

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>Gauge 차트</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isGaugeModified ? ' draft-chip-btn--dim' : ''}`} onClick={handleReset} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <GaugeBulletControls
          periodDays={timeline.periodDays}
          setPeriodDays={timeline.setPeriodDays}
          rangeMin={rangeMin}
          setRangeMin={setRangeMin}
          rangeMax={rangeMax}
          setRangeMax={setRangeMax}
          dataMin={dataMin}
          dataMax={dataMax}
          warnVal={warnVal}
          setWarnVal={setWarnVal}
          alertVal={alertVal}
          setAlertVal={setAlertVal}
          gaugeSplitCount={gaugeSplitCount}
          onGaugeSplitCountChange={setGaugeSplitCount}
        />
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <div
          className={gaugeSplitCount > 1 ? `gauge-split-grid gauge-split-grid--cols-${gridCols}` : undefined}
          style={gaugeSplitCount > 1 ? {
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridTemplateRows: `repeat(${gridRows}, auto)`,
            columnGap: gaugeMultiColGap(gridCols),
            rowGap,
          } : undefined}
        >
          {gaugeSlots.map((slot, slotIdx) => {
            const gridCol = gaugeSplitCount > 1
              ? gaugeSlotGridColumn(slotIdx, gaugeSlots.length, gridCols)
              : undefined;
            return (
              <div
                key={slot.id}
                className={gaugeSplitCount > 1 ? 'gauge-split-cell' : undefined}
                style={gridCol != null ? { gridColumn: gridCol } : undefined}
              >
                <div className={gaugeSplitCount > 1 ? 'gauge-split-face-wrap' : undefined}>
                  <GaugeFace
                    width={cellW}
                    height={cellH}
                    needleEqs={slot.needleEqs}
                    compact={gaugeSplitCount > 1}
                    {...faceProps}
                  />
                </div>
                {gaugeSplitCount > 1 && slot.needleEqs.length > 0 && (
                  <div className="gauge-split-readout">
                    {slot.needleEqs.map(eq => {
                      const col = eqColors[eq] ?? '#94a3b8';
                      const v = eqYValues.get(eq) ?? rangeMin;
                      return (
                        <span key={eq} className="gauge-readout-badge"
                          style={{ color: col, border: `1px solid ${col}` }}>
                          {v}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {gaugeSplitCount === 1 && (
        <div className="gauge-readout">
          {visibleEqs.map(eq => {
            const v = eqYValues.get(eq) ?? rangeMin;
            const col = eqColors[eq] ?? '#94a3b8';
            return (
              <span key={eq} style={{ color: col, border: `1px solid ${col}`, borderRadius: 3, padding: '1px 5px', background: '#0d1117' }}>
                {v}
              </span>
            );
          })}
        </div>
      )}
      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
      {controlsVisible && <GaugeBulletTimeline timeline={timeline} />}
    </div>
  );
}
