import { useContext, useMemo, useRef, useState } from 'react';
import {
  SHAP_HISTORY,
  EQP_SHAP_HISTORY,
  EQP_NAMES,
  SHAP_POS_C,
  SHAP_NEG_C,
  SHAP_DATE_IDX_DEFAULT,
  type SHAPItem,
} from './data-draft';
import {
  EqColorContext,
  ShapDateCtx,
  useChartControls,
  useContainerSize,
  useShapTimeline,
  ChartTimeline,
  PeriodSelect,
  scaleLinear,
  genTicks,
  eqColor,
} from './shared';
import { shapArrowPts } from './shared';
import { DraftDragHandle } from './ui';

// ── SHAP 기여도 차트 ──────────────────────────────────────────────────────────
// SHAP 기여도 차트(전체) — 누적 워터폴 화살표, 정렬·상위N 필터·설비 선택 지원
export function SHAPChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const [sortMode, setSortMode] = useState<'magnitude' | 'positive' | 'negative'>('magnitude');
  const [topN, setTopN] = useState(0);
  const [selectedEqp, setSelectedEqp] = useState<string | null>(null);
  const { idx: selectedDateIdx } = useContext(ShapDateCtx);
  const timeline = useShapTimeline(SHAP_HISTORY);
  const {
    periodDays, setPeriodDays, localIdx, setLocalIdx, setIdx: setSelectedDateIdx,
    isPlaying, setIsPlaying, playSpeed, setPlaySpeed, onPlay: onPlayShap,
  } = timeline;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ feature: string; shap: number; featureVal?: string; color: string; svgX: number; svgY: number } | null>(null);

  const activeSource = selectedEqp
    ? (EQP_SHAP_HISTORY[selectedEqp]?.[selectedDateIdx] ?? EQP_SHAP_HISTORY[selectedEqp][0])
    : SHAP_HISTORY[selectedDateIdx];
  const fullPrediction = activeSource.base + activeSource.items.reduce((s, d) => s + d.shap, 0);

  // '기타 2개' 항목은 정렬·topN 필터 예외: 분리 후 항상 맨 아래에 다시 붙임
  const displayItems = useMemo(() => {
    const src = selectedEqp
      ? (EQP_SHAP_HISTORY[selectedEqp]?.[selectedDateIdx]?.items ?? [])
      : (SHAP_HISTORY[selectedDateIdx]?.items ?? []);
    const pinned = src.filter(d => d.feature === '기타 2개');
    let items = src.filter(d => d.feature !== '기타 2개');
    if (sortMode === 'positive') {
      const pos = items.filter(d => d.shap >= 0).sort((a, b) => b.shap - a.shap);
      const neg = items.filter(d => d.shap < 0).sort((a, b) => a.shap - b.shap);
      items = [...pos, ...neg];
    } else if (sortMode === 'negative') {
      const neg = items.filter(d => d.shap < 0).sort((a, b) => a.shap - b.shap);
      const pos = items.filter(d => d.shap >= 0).sort((a, b) => b.shap - a.shap);
      items = [...neg, ...pos];
    } else {
      items.sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
    }
    if (topN > 0) items = items.slice(0, Math.max(0, topN - pinned.length));
    return [...items, ...pinned];
  }, [sortMode, topN, selectedEqp, selectedDateIdx]);

  const resetControls = () => { setSortMode('magnitude'); setTopN(0); setSelectedEqp(null); setSelectedDateIdx(SHAP_DATE_IDX_DEFAULT); setIsPlaying(false); setPeriodDays(14); };
  const isModified = useMemo(() =>
    sortMode !== 'magnitude' || topN !== 0 || selectedEqp !== null || isPlaying || periodDays !== 14,
  [sortMode, topN, selectedEqp, isPlaying, periodDays]);

  const handleBarEnter = (e: React.MouseEvent, item: SHAPItem, color: string) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      feature: item.feature, shap: item.shap, featureVal: item.featureVal, color,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  const cumulative = useMemo(() => displayItems.reduce<number[]>((acc, item, i) => {
    acc.push((i === 0 ? activeSource.base : acc[i - 1]) + item.shap);
    return acc;
  }, []), [displayItems, activeSource.base]);

  const allX = [activeSource.base, ...cumulative];
  const xRawMin = Math.min(...allX);
  const xRawMax = Math.max(...allX);
  const xPad = Math.max((xRawMax - xRawMin) * 0.1, 0.5);
  const xMin = xRawMin - xPad;
  const xMax = xRawMax + xPad;

  const LABEL_W = 130;
  const PAD_T = 20, PAD_R = 20, PAD_B = 30;
  const plotW = Math.max(10, size.w - LABEL_W - PAD_R);
  const plotH = Math.max(10, size.h - PAD_T - PAD_B);
  const axisY = PAD_T + plotH;

  const n = displayItems.length;
  const barGap = 5;
  const barH = Math.max(8, (plotH - (n - 1) * barGap) / n);
  const bh = barH / 2;

  const xSc = (v: number) => scaleLinear(v, xMin, xMax, LABEL_W, plotW);
  const bcy = (i: number) => PAD_T + i * (barH + barGap) + bh;


  const ticks = genTicks(xMin, xMax, 6);

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>SHAP 기여도(전체)</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`} onClick={resetControls} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} />
          <select className="draft-toolbar-select" value={sortMode}
            onChange={e => setSortMode(e.target.value as typeof sortMode)} title="정렬 기준">
            <option value="magnitude">기여도순</option>
            <option value="positive">양수 우선</option>
            <option value="negative">음수 우선</option>
          </select>
          <select className="draft-toolbar-select" value={topN}
            onChange={e => setTopN(Number(e.target.value))} title="표시 개수">
            <option value={0}>전체</option>
            <option value={5}>상위 5개</option>
            <option value={7}>상위 7개</option>
          </select>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={LABEL_W} y={PAD_T} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <line x1={xSc(activeSource.base)} y1={PAD_T} x2={xSc(activeSource.base)} y2={axisY}
            stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={xSc(fullPrediction)} y1={PAD_T} x2={xSc(fullPrediction)} y2={axisY}
            stroke="#7dd3fc" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={LABEL_W} y1={axisY} x2={LABEL_W + plotW} y2={axisY}
            stroke="#334155" strokeWidth={1.5} />
          {ticks.map((t, ti) => {
            const x = xSc(t);
            if (x < LABEL_W - 1 || x > LABEL_W + plotW + 1) return null;
            return (
              <g key={ti}>
                <line x1={x} y1={axisY} x2={x} y2={axisY + 4} stroke="#334155" strokeWidth={1} />
                <text x={x} y={axisY + 14} textAnchor="middle" fontSize="9" fill="#475569">
                  {t % 1 === 0 ? t : t.toFixed(1)}
                </text>
              </g>
            );
          })}
          <text x={xSc(activeSource.base)} y={PAD_T - 4} textAnchor="middle" fontSize="9" fill="#64748b">
            E[f(x)]={activeSource.base.toFixed(1)}
          </text>
          <text x={xSc(fullPrediction)} y={PAD_T - 4} textAnchor="middle" fontSize="9" fill="#7dd3fc">
            f(x)={fullPrediction.toFixed(1)}
          </text>
          {displayItems.map((item, i) => {
            const sv = i === 0 ? activeSource.base : cumulative[i - 1];
            const ev = cumulative[i];
            const x1 = xSc(sv);
            const x2 = xSc(ev);
            const cy = bcy(i);
            const color = item.shap >= 0 ? SHAP_POS_C : SHAP_NEG_C;
            const bw = Math.abs(x2 - x1);
            const sign = item.shap >= 0 ? '+' : '';
            const valStr = `${sign}${item.shap.toFixed(2)}`;
            const inside = bw > 38;
            const lx = inside ? (x1 + x2) / 2 : item.shap >= 0 ? x2 + 5 : x2 - 5;
            const la: 'middle' | 'start' | 'end' = inside ? 'middle' : item.shap >= 0 ? 'start' : 'end';
            return (
              <g key={item.feature} style={{ cursor: 'pointer' }}
                onMouseEnter={e => handleBarEnter(e, item, color)}
                onMouseLeave={() => setTooltip(null)}>
                <polygon points={shapArrowPts(x1, x2, cy, bh)} fill={color} opacity={0.88} />
                <text x={LABEL_W - 8} y={cy + 4} textAnchor="end" fontSize="10">
                  {item.featureVal
                    ? <tspan fill="#64748b">{item.featureVal} = </tspan>
                    : null}
                  <tspan fill="#e2e8f0" fontWeight="600">{item.feature}</tspan>
                </text>
                <text x={lx} y={cy + 4} textAnchor={la} fontSize="10"
                  fill={inside ? '#fff' : color} fontWeight="600">
                  {valStr}
                </text>
              </g>
            );
          })}
          {tooltip && (() => {
            const tipW = 124;
            const tipH = tooltip.featureVal ? 50 : 38;
            const tipX = tooltip.svgX + tipW + 10 > size.w ? tooltip.svgX - tipW - 4 : tooltip.svgX + 8;
            const tipY = Math.max(PAD_T, tooltip.svgY - tipH / 2);
            return (
              <>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize="10" fill={tooltip.color} fontWeight="700">
                  {tooltip.feature}
                </text>
                <text x={tipX + 8} y={tipY + 26} fontSize="9" fill="#94a3b8">
                  {tooltip.shap >= 0 ? '+' : ''}{tooltip.shap.toFixed(2)}
                </text>
                {tooltip.featureVal && (
                  <text x={tipX + 8} y={tipY + 38} fontSize="9" fill="#94a3b8">
                    val: {tooltip.featureVal}
                  </text>
                )}
              </>
            );
          })()}
        </svg>
      </div>
      <div className="draft-legend">
        {EQP_NAMES.map(eqp => {
          const isSelected = selectedEqp === eqp;
          const isHidden = selectedEqp !== null && !isSelected;
          return (
            <button key={eqp}
              className={`draft-legend-item${isHidden ? ' draft-legend-item--hidden' : ''}${isSelected ? ' draft-legend-item--only' : ''}`}
              onClick={() => setSelectedEqp(prev => prev === eqp ? null : eqp)}>
              <svg width="8" height="8"><circle cx="4" cy="4" r="4" fill={isHidden ? '#334155' : eqColor(eqColors, eqp)} /></svg>
              {eqp}
            </button>
          );
        })}
      </div>
      {controlsVisible && timeline.filtered.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying} playSpeed={playSpeed}
          sliderIdx={localIdx} maxIdx={timeline.maxIdx}
          startDate={timeline.startDate}
          currentDate={timeline.currentDate}
          onPlay={onPlayShap}
          onSpeedChange={setPlaySpeed}
          onSlider={v => { setIsPlaying(false); setLocalIdx(v); }}
        />
      )}
    </div>
  );
}
