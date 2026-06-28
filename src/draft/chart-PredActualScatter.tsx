import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SHAP_HISTORY, EQP_NAMES, PRED_ACTUAL_DATA, type PredActualPoint } from './data-draft';
import {
  EqColorContext,
  DraftEqHoverContext,
  useChartControls,
  useContainerSize,
  useEqVisibility,
  useShapTimeline,
  ChartTimeline,
  PeriodSelect,
  EqLegend,
  scaleLinear,
  scaleLinearY,
  genTicks,
  buildPredActualCenterMarks,
  buildPredActualSlopeLines,
  fmtLineVarMean,
  scatterAxisMeanSymbol,
  wheelHitSvgPlot,
  beginScatterSelection,
  type ScatterSelOverlay,
} from './shared';
import { DraftDragHandle } from './ui';

// ── Pred vs Actual 산점도 ────────────────────────────────────────────────────
// Pred vs Actual 산점도 레이아웃 상수 — Center/Slope 활성 시 패딩 확장
const PAL_SCATTER_CENTER_PAD_RIGHT = 52;
const PAL_SCATTER_CENTER_PAD_TOP = 22;
const PAL_SCATTER_CENTER_LABEL_MIN_DY = 12;

// Pred vs Actual 산점도 — 선택일 점 강조, Slope·Center 오버레이, 클릭으로 날짜 이동
export function PredActualScatterChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const { hiddenEqs, selectEq: selectEqScatter, applyScatterSelection, resetHiddenEqs } = useEqVisibility(EQP_NAMES);
  const [selOverlay, setSelOverlay] = useState<ScatterSelOverlay | null>(null);
  const { hoveredEq, setHoveredEq } = useContext(DraftEqHoverContext);
  const [showSlope, setShowSlope] = useState(false);
  const [showCenter, setShowCenter] = useState(false);
  const timeline = useShapTimeline(SHAP_HISTORY);
  const {
    periodDays, setPeriodDays, filtered: filteredHistory, localIdx, setLocalIdx,
    isPlaying, setIsPlaying, playSpeed, setPlaySpeed, onPlay: onPlayScatter,
  } = timeline;
  const [tooltip, setTooltip] = useState<{ eq: string; date: string; actual: number; pred: number; svgX: number; svgY: number } | null>(null);
  const [xAxisRange, setXAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [yAxisRange, setYAxisRange] = useState<{ min: number; max: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const xAxisDragRef = useRef<{ startX: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const yAxisDragRef = useRef<{ startY: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; xMin: number; xMax: number; yMin: number; yMax: number } | null>(null);

  const setPlotPanCursor = useCallback((active: boolean) => {
    document.body.style.cursor = active ? 'grabbing' : '';
  }, []);

  useEffect(() => () => setPlotPanCursor(false), [setPlotPanCursor]);

  const eqs = EQP_NAMES;

  const resetControls = () => {
    setPeriodDays(14); setIsPlaying(false);
    setXAxisRange(null); setYAxisRange(null);
    setShowSlope(false); setShowCenter(false);
    resetHiddenEqs();
    setSelOverlay(null);
  };

  const filteredDateSet = useMemo(() => new Set(filteredHistory.map(h => h.date)), [filteredHistory]);

  const selectableData = useMemo(() =>
    PRED_ACTUAL_DATA.filter(d => filteredDateSet.has(d.date)),
    [filteredDateSet],
  );

  const filteredData = useMemo(() =>
    selectableData.filter(d => !hiddenEqs.has(d.eq)),
    [selectableData, hiddenEqs],
  );

  useEffect(() => { setXAxisRange(null); setYAxisRange(null); }, [periodDays]);

  const allActual = useMemo(() => filteredData.map(d => d.actual), [filteredData]);
  const allPred   = useMemo(() => filteredData.map(d => d.pred),   [filteredData]);
  const rawMin = Math.min(...(allActual.length ? [...allActual, ...allPred] : [0]));
  const rawMax = Math.max(...(allActual.length ? [...allActual, ...allPred] : [100]));
  const vPad = (rawMax - rawMin) * 0.06;
  const dataMin = rawMin - vPad;
  const dataMax = rawMax + vPad;

  const PAD = { top: 18, right: 16, bottom: 40, left: 40 };
  const padRight = showCenter ? PAL_SCATTER_CENTER_PAD_RIGHT : PAD.right;
  const plotTop = showCenter ? PAL_SCATTER_CENTER_PAD_TOP : PAD.top;
  const plotW = Math.max(10, size.w - PAD.left - padRight);
  const plotH = Math.max(10, size.h - plotTop - PAD.bottom);
  const plotRight = PAD.left + plotW;
  const centerLabelX = plotRight + 6;

  const activeXMin = xAxisRange?.min ?? dataMin;
  const activeXMax = xAxisRange?.max ?? dataMax;
  const activeYMin = yAxisRange?.min ?? dataMin;
  const activeYMax = yAxisRange?.max ?? dataMax;
  const activeXRange = Math.max(activeXMax - activeXMin, 1e-6);
  const activeYRange = Math.max(activeYMax - activeYMin, 1e-6);

  const xSc = (v: number) => scaleLinear(v, activeXMin, activeXMax, PAD.left, plotW);
  const ySc = (v: number) => scaleLinearY(v, activeYMin, activeYMax, plotTop, plotH);

  const centerMarks = useMemo(() => {
    if (!showCenter) return [];
    return buildPredActualCenterMarks(filteredData, eqs, hiddenEqs, eqColors);
  }, [showCenter, filteredData, eqs, hiddenEqs, eqColors]);

  const slopeLines = useMemo(() => {
    if (!showSlope) return [];
    return buildPredActualSlopeLines(filteredData, eqs, hiddenEqs, eqColors);
  }, [showSlope, filteredData, eqs, hiddenEqs, eqColors]);

  const centerLabelsY = useMemo(() => {
    if (!showCenter) return [];
    const yLo = plotTop + 5;
    const yHi = plotTop + plotH - 5;
    const items = centerMarks
      .filter(m => m.var === 'Y')
      .map(m => {
        const cy = ySc(m.mean);
        return {
          id: `${m.eq ?? '_'}:Y`,
          text: `${scatterAxisMeanSymbol('Y')}=${fmtLineVarMean(m.mean)}`,
          y: cy,
          cy,
          col: m.color,
          dim: hoveredEq !== null && m.eq !== null && hoveredEq !== m.eq,
        };
      });
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const laid: typeof sorted = [];
    for (const item of sorted) {
      let y = item.y;
      if (laid.length > 0 && y - laid[laid.length - 1].y < PAL_SCATTER_CENTER_LABEL_MIN_DY) {
        y = laid[laid.length - 1].y + PAL_SCATTER_CENTER_LABEL_MIN_DY;
      }
      laid.push({ ...item, y: Math.min(yHi, Math.max(yLo, y)) });
    }
    for (let i = laid.length - 2; i >= 0; i--) {
      if (laid[i + 1].y - laid[i].y < PAL_SCATTER_CENTER_LABEL_MIN_DY) {
        laid[i] = { ...laid[i], y: Math.max(yLo, laid[i + 1].y - PAL_SCATTER_CENTER_LABEL_MIN_DY) };
      }
    }
    return laid;
  }, [showCenter, centerMarks, plotH, plotTop, hoveredEq, activeYMin, activeYMax, activeYRange]);
  const xTicks = genTicks(activeXMin, activeXMax, 5);
  const yTicks = genTicks(activeYMin, activeYMax, 5);
  const isZoomed = xAxisRange !== null || yAxisRange !== null;
  const isModified = useMemo(() =>
    isZoomed || isPlaying || showSlope || showCenter || periodDays !== 14 || hiddenEqs.size > 0,
  [isZoomed, isPlaying, showSlope, showCenter, periodDays, hiddenEqs]);

  const selectedDate = filteredHistory[localIdx]?.date ?? '';

  const wheelStateRef = useRef({
    activeXMin, activeXMax, activeXRange, activeYMin, activeYMax, activeYRange,
    plotLeft: PAD.left, plotTop, plotW, plotH, svgW: size.w, svgH: size.h,
  });
  wheelStateRef.current = {
    activeXMin, activeXMax, activeXRange, activeYMin, activeYMax, activeYRange,
    plotLeft: PAD.left, plotTop, plotW, plotH, svgW: size.w, svgH: size.h,
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.85 : 1 / 0.85;
      const rect = svg.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width)  * st.svgW;
      const my = ((e.clientY - rect.top)  / rect.height) * st.svgH;
      const { activeXMin: xMn, activeXMax: xMx, activeXRange: xRng,
              activeYMin: yMn, activeYMax: yMx, activeYRange: yRng } = st;
      const dataX = xMn + ((mx - st.plotLeft) / st.plotW) * xRng;
      const dataY = yMn + ((st.plotTop + st.plotH - my) / st.plotH) * yRng;
      setXAxisRange({ min: dataX - (dataX - xMn) * factor, max: dataX + (xMx - dataX) * factor });
      setYAxisRange({ min: dataY - (dataY - yMn) * factor, max: dataY + (yMx - dataY) * factor });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [plotW, plotH]);

  const startXAxisDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const isPan = e.button === 2;
    const startMin = xAxisRange?.min ?? dataMin;
    const startMax = xAxisRange?.max ?? dataMax;
    const minRange = Math.max((startMax - startMin) * 0.02, 1e-6);
    xAxisDragRef.current = { startX: e.clientX, startMin, startMax, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!xAxisDragRef.current) return;
        const { startX, startMin: dMin, startMax: dMax, minRange: dMinR } = xAxisDragRef.current;
        if (isPan) {
          const shift = ((ev.clientX - startX) / plotW) * (dMax - dMin);
          setXAxisRange({ min: dMin - shift, max: dMax - shift });
        } else {
          const factor = Math.exp((ev.clientX - startX) / 160);
          const center = (dMin + dMax) / 2;
          const next = Math.max((dMax - dMin) * factor, dMinR);
          setXAxisRange({ min: center - next / 2, max: center + next / 2 });
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      xAxisDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startYAxisDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const isPan = e.button === 2;
    const startMin = yAxisRange?.min ?? dataMin;
    const startMax = yAxisRange?.max ?? dataMax;
    const minRange = Math.max((startMax - startMin) * 0.02, 1e-6);
    yAxisDragRef.current = { startY: e.clientY, startMin, startMax, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!yAxisDragRef.current) return;
        const { startY, startMin: dMin, startMax: dMax, minRange: dMinR } = yAxisDragRef.current;
        if (isPan) {
          const shift = ((ev.clientY - startY) / plotH) * (dMax - dMin);
          setYAxisRange({ min: dMin + shift, max: dMax + shift });
        } else {
          const factor = Math.exp((ev.clientY - startY) / 160);
          const center = (dMin + dMax) / 2;
          const next = Math.max((dMax - dMin) * factor, dMinR);
          setYAxisRange({ min: center - next / 2, max: center + next / 2 });
        }
      });
    };
    const onUp = () => {
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      yAxisDragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startPlotPan = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 1 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = svgRef.current!.getBoundingClientRect();
    const rectW = rect.width;
    const rectH = rect.height;
    panDragRef.current = {
      startX: e.clientX, startY: e.clientY,
      xMin: activeXMin, xMax: activeXMax, yMin: activeYMin, yMax: activeYMax,
    };
    setPlotPanCursor(true);
    setIsPanning(true);
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (!panDragRef.current || rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!panDragRef.current) return;
        const { startX, startY, xMin, xMax, yMin, yMax } = panDragRef.current;
        const dx = -((ev.clientX - startX) / rectW) * size.w / plotW * (xMax - xMin);
        const dy = ((ev.clientY - startY) / rectH) * size.h / plotH * (yMax - yMin);
        setXAxisRange({ min: xMin + dx, max: xMax + dx });
        setYAxisRange({ min: yMin + dy, max: yMax + dy });
      });
    };
    const onUp = () => {
      panDragRef.current = null;
      setIsPanning(false);
      setPlotPanCursor(false);
      if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [activeXMin, activeXMax, activeYMin, activeYMax, size.w, size.h, plotW, plotH, setPlotPanCursor]);

  const handlePlotMouseDown = useCallback((e: React.MouseEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    if (e.button === 1 || e.button === 2) {
      startPlotPan(e);
      return;
    }
    if (e.button !== 0) return;
    beginScatterSelection({
      e,
      svgEl: svg,
      svgW: size.w,
      svgH: size.h,
      plotLeft: PAD.left,
      plotTop,
      plotW,
      plotH,
      hits: selectableData.map(d => ({
        id: d.eq,
        sx: xSc(d.actual),
        sy: ySc(d.pred),
      })),
      onOverlay: setSelOverlay,
      onComplete: (ids, additive) => applyScatterSelection(ids, additive),
    });
  }, [
    selectableData, size.w, size.h, plotTop, plotW, plotH,
    activeXMin, activeXMax, activeYMin, activeYMax,
    applyScatterSelection, startPlotPan,
  ]);

  const handleDotClick = useCallback((d: PredActualPoint, e: React.MouseEvent) => {
    e.stopPropagation();
    selectEqScatter(d.eq, e.ctrlKey || e.metaKey);
    if (!e.ctrlKey && !e.metaKey) {
      const fi = filteredHistory.findIndex(h => h.date === d.date);
      if (fi >= 0) setLocalIdx(fi);
    }
  }, [selectEqScatter, filteredHistory, setLocalIdx]);

  const handleDotEnter = (e: React.MouseEvent, d: PredActualPoint) => {
    if (xAxisDragRef.current || yAxisDragRef.current) return;
    setHoveredEq(d.eq);
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      eq: d.eq, date: d.date, actual: d.actual, pred: d.pred,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>Pred vs Actual (산점도)</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`}
            onClick={resetControls} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} />
          <button className={`draft-chip-btn${showSlope ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowSlope(v => !v)} title="Actual→Pred 회귀선 (m, R²)">Slope</button>
          <button className={`draft-chip-btn${showCenter ? ' draft-chip-btn--active' : ' draft-chip-btn--off'}`}
            onClick={() => setShowCenter(v => !v)} title="X·Y 평균선 (X̄·Ȳ, EQ별)">Center</button>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef}
          className={`draft-chart-svg${isPanning ? ' draft-chart-svg--panning' : ''}`}
          width={size.w}
          height={size.h}
          onMouseLeave={() => { setTooltip(null); setHoveredEq(null); }}>
          <defs>
            <clipPath id="pal-scatter-clip">
              <rect x={PAD.left} y={plotTop} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          <rect x={PAD.left} y={plotTop} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <rect
            x={PAD.left}
            y={plotTop}
            width={plotW}
            height={plotH}
            fill="transparent"
            className="draft-scatter-plot-hit"
            style={{ cursor: isPanning ? 'grabbing' : 'default' }}
            onMouseDown={handlePlotMouseDown}
            onDoubleClick={() => { setXAxisRange(null); setYAxisRange(null); }}
            onClick={e => { if (!e.ctrlKey && !e.shiftKey && !e.metaKey) resetHiddenEqs(); }}
          />
          <g onMouseDown={startYAxisDrag} onContextMenu={ev => ev.preventDefault()} style={{ cursor: 'ns-resize' }}>
            <rect x={0} y={plotTop} width={PAD.left} height={plotH} fill="transparent" />
            {yTicks.map(v => (
              <g key={`y${v}`}>
                <line x1={PAD.left} y1={ySc(v)} x2={PAD.left + plotW} y2={ySc(v)}
                  stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                <text x={PAD.left - 4} y={ySc(v)} textAnchor="end" dominantBaseline="middle"
                  fontSize="9" fill="#64748b">{Math.round(v)}</text>
              </g>
            ))}
          </g>
          <g onMouseDown={startXAxisDrag} onContextMenu={ev => ev.preventDefault()} style={{ cursor: 'ew-resize' }}>
            <rect x={PAD.left} y={plotTop + plotH} width={plotW} height={PAD.bottom} fill="transparent" />
            {xTicks.map(v => (
              <g key={`x${v}`}>
                <line x1={xSc(v)} y1={plotTop} x2={xSc(v)} y2={plotTop + plotH}
                  stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                <text x={xSc(v)} y={plotTop + plotH + 12} textAnchor="middle"
                  fontSize="9" fill="#64748b">{Math.round(v)}</text>
              </g>
            ))}
          </g>
          <g clipPath="url(#pal-scatter-clip)">
            {showCenter && centerMarks.map((m, ci) => {
              const dim = hoveredEq !== null && m.eq !== null && hoveredEq !== m.eq;
              if (m.var === 'X') {
                const cx = xSc(m.mean);
                return (
                  <line key={`center-x-${ci}`}
                    x1={cx} y1={plotTop} x2={cx} y2={plotTop + plotH}
                    stroke={m.color} strokeWidth={1}
                    strokeDasharray="5 4"
                    opacity={dim ? 0.15 : 0.85}
                    pointerEvents="none" />
                );
              }
              const cy = ySc(m.mean);
              return (
                <line key={`center-y-${ci}`}
                  x1={PAD.left} y1={cy} x2={plotRight} y2={cy}
                  stroke={m.color} strokeWidth={1}
                  strokeDasharray="5 4"
                  opacity={dim ? 0.15 : 0.85}
                  pointerEvents="none" />
              );
            })}
            {showSlope && slopeLines.map((sl, li) => {
              const dim = hoveredEq !== null && sl.eq !== null && hoveredEq !== sl.eq;
              const y0 = sl.reg.m * activeXMin + sl.reg.b;
              const y1 = sl.reg.m * activeXMax + sl.reg.b;
              return (
                <line
                  key={`slope-${li}`}
                  x1={xSc(activeXMin)}
                  y1={ySc(y0)}
                  x2={xSc(activeXMax)}
                  y2={ySc(y1)}
                  stroke={sl.color}
                  strokeWidth={1.5}
                  opacity={dim ? 0.12 : 0.9}
                  pointerEvents="none"
                />
              );
            })}
            {filteredData.filter(d => d.date !== selectedDate).map(d => {
              const dim = hoveredEq !== null && hoveredEq !== d.eq;
              return (
              <circle key={`${d.date}-${d.eq}`}
                cx={xSc(d.actual)} cy={ySc(d.pred)} r={3}
                fill={eqColors[d.eq] ?? '#94a3b8'} opacity={dim ? 0.12 : 0.45}
                style={{ cursor: 'pointer' }}
                onMouseDown={ev => ev.stopPropagation()}
                onClick={e => handleDotClick(d, e)}
                onMouseEnter={e => handleDotEnter(e, d)}
                onMouseLeave={() => { setTooltip(null); setHoveredEq(null); }} />
            );})}
            {filteredData.filter(d => d.date === selectedDate).map(d => {
              const dim = hoveredEq !== null && hoveredEq !== d.eq;
              return (
              <circle key={`sel-${d.date}-${d.eq}`}
                cx={xSc(d.actual)} cy={ySc(d.pred)} r={5}
                fill={eqColors[d.eq] ?? '#94a3b8'} opacity={dim ? 0.25 : 1}
                stroke="#fff" strokeWidth={1.2}
                style={{ cursor: 'pointer' }}
                onMouseDown={ev => ev.stopPropagation()}
                onClick={e => handleDotClick(d, e)}
                onMouseEnter={e => handleDotEnter(e, d)}
                onMouseLeave={() => { setTooltip(null); setHoveredEq(null); }} />
            );})}
          </g>
          {selOverlay?.type === 'rect' && (
            <rect x={selOverlay.x} y={selOverlay.y} width={selOverlay.w} height={selOverlay.h}
              fill="rgba(100,150,255,0.08)" stroke="#6496ff" strokeWidth={1.5}
              strokeDasharray="4,4" pointerEvents="none" />
          )}
          {selOverlay?.type === 'lasso' && (
            <polyline points={selOverlay.pts}
              fill="rgba(249,115,22,0.06)" stroke="#f97316" strokeWidth={1.5}
              pointerEvents="none" />
          )}
          {isPanning && (
            <rect
              x={PAD.left}
              y={plotTop}
              width={plotW}
              height={plotH}
              fill="transparent"
              pointerEvents="all"
              className="draft-scatter-plot-hit"
              style={{ cursor: 'grabbing' }}
            />
          )}
          {showCenter && centerMarks.filter(m => m.var === 'X').map((m, ci) => {
            const dim = hoveredEq !== null && m.eq !== null && hoveredEq !== m.eq;
            const cx = xSc(m.mean);
            return (
              <text key={`center-lbl-x-${ci}`}
                x={cx} y={plotTop - 4}
                textAnchor="middle" fontSize="8" fill={m.color}
                className="draft-pal-gap-value"
                opacity={dim ? 0.2 : 0.95}
                pointerEvents="none">
                {`${scatterAxisMeanSymbol('X')}=${fmtLineVarMean(m.mean)}`}
              </text>
            );
          })}
          {showSlope && slopeLines.length > 0 && (
            <g className="draft-line-slope-stats" pointerEvents="none">
              {slopeLines.map((sl, li) => {
                const dim = hoveredEq !== null && sl.eq !== null && hoveredEq !== sl.eq;
                const fmtM = Math.abs(sl.reg.m) < 0.01 || Math.abs(sl.reg.m) >= 1000
                  ? sl.reg.m.toExponential(2)
                  : sl.reg.m.toFixed(3);
                return (
                  <text
                    key={`slope-stat-${li}`}
                    x={plotRight - 6}
                    y={plotTop - 4 + li * 12}
                    textAnchor="end"
                    className="draft-pal-gap-value"
                    fill={sl.color}
                    opacity={dim ? 0.2 : 0.95}
                  >
                    {sl.label} m={fmtM} R²={sl.reg.r2.toFixed(3)}
                  </text>
                );
              })}
            </g>
          )}
          {showCenter && centerLabelsY.length > 0 && (
            <g className="draft-line-center-labels" pointerEvents="none">
              {centerLabelsY.map(({ id, text, y, cy, col, dim }) => (
                <g key={id} opacity={dim ? 0.2 : 1}>
                  <line x1={plotRight} y1={cy} x2={centerLabelX - 3} y2={y}
                    stroke={col} strokeWidth={0.8} opacity={0.35} />
                  <text x={centerLabelX} y={y} className="draft-pal-gap-value" fill={col}>{text}</text>
                </g>
              ))}
            </g>
          )}
          <line x1={PAD.left} y1={plotTop + plotH} x2={PAD.left + plotW} y2={plotTop + plotH}
            stroke="#334155" strokeWidth={1} />
          <line x1={PAD.left} y1={plotTop} x2={PAD.left} y2={plotTop + plotH}
            stroke="#334155" strokeWidth={1} />
          <text x={PAD.left + plotW / 2} y={size.h - 4} textAnchor="middle"
            fontSize="9" fill="#64748b">Actual</text>
          <text transform={`translate(10,${plotTop + plotH / 2}) rotate(-90)`}
            textAnchor="middle" fontSize="9" fill="#64748b">Pred</text>
          {/* 툴팁 */}
          {tooltip && (() => {
            const tipW = 110, tipH = 56;
            const tipX = tooltip.svgX + tipW + 10 > size.w ? tooltip.svgX - tipW - 4 : tooltip.svgX + 8;
            const tipY = Math.max(plotTop, tooltip.svgY - tipH / 2);
            return (
              <>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize="10"
                  fill={eqColors[tooltip.eq] ?? '#94a3b8'} fontWeight="700">{tooltip.eq}</text>
                <text x={tipX + 8} y={tipY + 26} fontSize="9" fill="#94a3b8">{tooltip.date}</text>
                <text x={tipX + 8} y={tipY + 38} fontSize="9" fill="#60a5fa">Actual: {tooltip.actual}</text>
                <text x={tipX + 8} y={tipY + 50} fontSize="9" fill="#f87171">Pred: {tooltip.pred}</text>
              </>
            );
          })()}
        </svg>
      </div>
      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEqScatter} />
      {controlsVisible && timeline.filtered.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying} playSpeed={playSpeed}
          sliderIdx={localIdx} maxIdx={timeline.maxIdx}
          startDate={timeline.startDate}
          currentDate={timeline.currentDate}
          onPlay={onPlayScatter}
          onSpeedChange={setPlaySpeed}
          onSlider={v => { setIsPlaying(false); setLocalIdx(v); }}
        />
      )}
    </div>
  );
}
