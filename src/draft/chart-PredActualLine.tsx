import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SHAP_HISTORY, EQP_NAMES, PRED_ACTUAL_DATA } from './data-draft';
import {
  EqColorContext,
  useChartControls,
  useContainerSize,
  useEqVisibility,
  useShapTimeline,
  useLineChartWheelRef,
  ChartTimeline,
  PeriodSelect,
  EqLegend,
  scaleLinearY,
  genTicks,
  wheelHitSvgPlot,
} from './shared';
import { DraftDragHandle } from './ui';

// ── 설비별 Pred/Actual 라인 차트 ─────────────────────────────────────────────
// 설비별 Pred(점선)/Actual(실선) 시계열, 선택일 수직선·오른쪽 Gap 라벨 표시
export function PredActualLineChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const { hiddenEqs, selectEq: selectEqLine } = useEqVisibility(EQP_NAMES);
  const timeline = useShapTimeline(SHAP_HISTORY);
  const {
    periodDays, setPeriodDays, filtered: filteredHistory, localIdx, setLocalIdx,
    isPlaying, setIsPlaying, playSpeed, setPlaySpeed, onPlay: onPlayTimeline,
  } = timeline;
  const [yRange, setYRange] = useState<{ min: number; max: number } | null>(null);
  const [xViewRange, setXViewRange] = useState<{ start: number; end: number } | null>(null);
  const [hoverLocalIdx, setHoverLocalIdx] = useState<number | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const yAxisDragRef = useRef<{ startY: number; startMin: number; startMax: number; minRange: number } | null>(null);
  const xPanRef = useRef<{ startX: number; visStart: number; visEnd: number; plotW: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const eqs = EQP_NAMES;

  const isZoomed = yRange !== null || xViewRange !== null;
  const isModified = useMemo(() =>
    isZoomed || isPlaying || periodDays !== 14,
  [isZoomed, isPlaying, periodDays]);
  const resetControls = () => {
    setPeriodDays(14); setIsPlaying(false); setYRange(null); setXViewRange(null);
  };

  const filteredDates = useMemo(() => filteredHistory.map(h => h.date), [filteredHistory]);

  const byEq = useMemo(() => {
    const dateSet = new Set(filteredDates);
    const map = new Map<string, { actual: number[]; pred: number[] }>();
    eqs.forEach(eq => {
      if (hiddenEqs.has(eq)) return;
      const pts = PRED_ACTUAL_DATA
        .filter(d => d.eq === eq && dateSet.has(d.date))
        .sort((a, b) => a.date.localeCompare(b.date));
      map.set(eq, { actual: pts.map(d => d.actual), pred: pts.map(d => d.pred) });
    });
    return map;
  }, [hiddenEqs, filteredDates]);

  const allVals = useMemo(() => [...byEq.values()].flatMap(({ actual, pred }) => [...actual, ...pred]), [byEq]);
  const yRawMin = allVals.length ? Math.min(...allVals) : 0;
  const yRawMax = allVals.length ? Math.max(...allVals) : 100;
  const yDataPad = (yRawMax - yRawMin) * 0.08;
  const yDataMin = yRawMin - yDataPad;
  const yDataMax = yRawMax + yDataPad;

  const PAD = { top: 18, right: 52, bottom: 36, left: 40 };
  const GAP_LABEL_MIN_DY = 12;
  const plotW = Math.max(10, size.w - PAD.left - PAD.right);
  const plotH = Math.max(10, size.h - PAD.top - PAD.bottom);
  const n = filteredDates.length;
  const visStart = xViewRange?.start ?? 0;
  const visEnd = xViewRange?.end ?? 1;
  const visRange = Math.max(visEnd - visStart, 1e-6);
  const activeYMin = yRange?.min ?? yDataMin;
  const activeYMax = yRange?.max ?? yDataMax;
  const activeYRange = Math.max(activeYMax - activeYMin, 1e-6);

  const wheelStateRef = useLineChartWheelRef({
    plotLeft: PAD.left, plotTop: PAD.top, plotW, plotH, svgW: size.w, svgH: size.h,
    visStart, visEnd, datesLen: n,
    activeYMin, activeYMax, activeYRange, globalMin: yDataMin, globalMax: yDataMax,
  });

  useEffect(() => {
    setYRange(null);
    if (periodDays <= 0 || periodDays >= n || n <= 1) setXViewRange(null);
    else setXViewRange({ start: (n - periodDays) / (n - 1), end: 1 });
  }, [periodDays, n]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handler = (e: WheelEvent) => {
      const st = wheelStateRef.current;
      if (!wheelHitSvgPlot(e, svg, st.plotLeft, st.plotTop, st.plotW, st.plotH, st.svgW, st.svgH)) return;
      e.preventDefault();
      const factor = Math.exp(e.deltaY / 420);
      if (e.shiftKey) {
        const { activeYMin: yMn, activeYMax: yMx, globalMin: gMin, globalMax: gMax } = st;
        const center = (yMn + yMx) / 2;
        const nr = Math.max((yMx - yMn) * factor, Math.max((gMax - gMin) * 0.02, 1e-6));
        setYRange({ min: center - nr / 2, max: center + nr / 2 });
      } else {
        const { visStart: vs, visEnd: ve, plotW: pw, plotLeft: pl, datesLen: dn } = st;
        const rect = svg.getBoundingClientRect();
        const mouseRelX = Math.max(0, Math.min(pw, e.clientX - rect.left - pl));
        const fracAtMouse = vs + (mouseRelX / pw) * (ve - vs);
        const curRange = ve - vs;
        const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(dn - 1, 1));
        let ns = fracAtMouse - (fracAtMouse - vs) / curRange * newRange;
        let ne = ns + newRange;
        if (ns < 0) { ne -= ns; ns = 0; }
        if (ne > 1) { ns -= (ne - 1); ne = 1; }
        ns = Math.max(0, ns); ne = Math.min(1, ne);
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      }
    };
    svg.addEventListener('wheel', handler, { passive: false });
    return () => svg.removeEventListener('wheel', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — wheelStateRef로 최신값 접근

  const xSc = (i: number) => {
    const frac = n <= 1 ? 0 : i / (n - 1);
    return PAD.left + ((frac - visStart) / visRange) * plotW;
  };
  const ySc = (v: number) => scaleLinearY(v, activeYMin, activeYMax, PAD.top, plotH);

  const xTickIdxs = useMemo(() => {
    const fvi = Math.max(0, Math.floor(visStart * (n - 1)) - 1);
    const lvi = Math.min(n - 1, Math.ceil(visEnd * (n - 1)) + 1);
    const vc = lvi - fvi + 1;
    const step = Math.max(1, Math.ceil(vc / 6));
    const idxs: number[] = [];
    for (let i = fvi; i <= lvi; i += step) idxs.push(i);
    if (idxs.length > 0 && idxs[idxs.length - 1] !== lvi) idxs.push(lvi);
    return idxs;
  }, [n, visStart, visEnd]);
  const yTicks = genTicks(activeYMin, activeYMax, 5);

  const polyline = (vals: number[]) => vals.map((v, i) => `${xSc(i).toFixed(1)},${ySc(v).toFixed(1)}`).join(' ');

  const svgMX = (e: React.MouseEvent) => { const r = svgRef.current!.getBoundingClientRect(); return ((e.clientX - r.left) / r.width) * size.w; };
  const mxToLocalIdx = (mx: number) => {
    const frac = (mx - PAD.left) / plotW * visRange + visStart;
    return Math.max(0, Math.min(n - 1, Math.round(frac * Math.max(n - 1, 1))));
  };

  const selectedDate = filteredHistory[localIdx]?.date ?? '';
  const selectedLocalIdx = localIdx;
  const gapLabelX = PAD.left + plotW + 6;
  const gapLabels = useMemo(() => {
    if (selectedLocalIdx < 0) return [];
    const idx = selectedLocalIdx;
    const items = eqs
      .filter(eq => !hiddenEqs.has(eq) && byEq.has(eq))
      .map(eq => {
        const series = byEq.get(eq)!;
        if (idx >= series.actual.length) return null;
        const gap = +(series.pred[idx] - series.actual[idx]).toFixed(1);
        const yMid = ySc((series.actual[idx] + series.pred[idx]) / 2);
        return { eq, gap, y: yMid, col: eqColors[eq] ?? '#94a3b8' };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const yLo = PAD.top + 6;
    const yHi = PAD.top + plotH - 6;
    const sorted = [...items].sort((a, b) => a.y - b.y);
    const laid: typeof sorted = [];
    for (const item of sorted) {
      let y = item.y;
      if (laid.length > 0 && y - laid[laid.length - 1].y < GAP_LABEL_MIN_DY) {
        y = laid[laid.length - 1].y + GAP_LABEL_MIN_DY;
      }
      laid.push({ ...item, y: Math.min(yHi, Math.max(yLo, y)) });
    }
    for (let i = laid.length - 2; i >= 0; i--) {
      if (laid[i + 1].y - laid[i].y < GAP_LABEL_MIN_DY) {
        laid[i] = { ...laid[i], y: Math.max(yLo, laid[i + 1].y - GAP_LABEL_MIN_DY) };
      }
    }
    return laid;
  }, [selectedLocalIdx, eqs, hiddenEqs, byEq, eqColors, ySc, plotH, PAD.top]);

  const startYAxisDrag = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const startMin = yRange?.min ?? yDataMin;
    const startMax = yRange?.max ?? yDataMax;
    const minRange = Math.max((startMax - startMin) * 0.02, 1e-6);
    const isPan = e.shiftKey || e.button === 2;
    yAxisDragRef.current = { startY: e.clientY, startMin, startMax, minRange };
    let rafId: number | null = null;
    const onMove = (ev: MouseEvent) => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        if (!yAxisDragRef.current) return;
        const { startY, startMin: dMin, startMax: dMax, minRange: mr } = yAxisDragRef.current;
        let nextMin: number, nextMax: number;
        if (isPan) {
          const shift = ((ev.clientY - startY) / plotH) * (dMax - dMin);
          nextMin = dMin + shift;
          nextMax = dMax + shift;
        } else {
          const factor = Math.exp((ev.clientY - startY) / 160);
          const center = (dMin + dMax) / 2;
          const nr = Math.max((dMax - dMin) * factor, mr);
          nextMin = center - nr / 2;
          nextMax = center + nr / 2;
        }
        setYRange({ min: nextMin, max: nextMax });
      });
    };
    const onUp = () => { if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null; } yAxisDragRef.current = null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const ds = dragStartRef.current;
    if (ds && (Math.abs(e.clientX - ds.x) > 5 || Math.abs(e.clientY - ds.y) > 5)) return;
    const gi = mxToLocalIdx(svgMX(e));
    if (gi >= 0) setLocalIdx(gi);
  };

  // X축 영역 드래그: 패닝 + mouseup 시 이동 거리 5px 미만이면 클릭으로 처리해 타임라인 점프
  const startPan = (e: React.MouseEvent<SVGRectElement>) => {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    e.stopPropagation();
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    const { visStart: vs, visEnd: ve, plotW: pw } = wheelStateRef.current;
    xPanRef.current = { startX: e.clientX, visStart: vs, visEnd: ve, plotW: pw };
    setIsPanning(true);
    let rafId: number | null = null;
    let didPan = false;
    const onMove = (ev: MouseEvent) => {
      if (!xPanRef.current || rafId !== null) return;
      if (dragStartRef.current && Math.abs(ev.clientX - dragStartRef.current.x) > 5) didPan = true;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        if (!xPanRef.current) return;
        const { startX, visStart: s, visEnd: ve2, plotW: pw2 } = xPanRef.current;
        const vr = ve2 - s;
        const dFrac = -(ev.clientX - startX) / pw2 * vr;
        let ns = s + dFrac, ne = ve2 + dFrac;
        if (ns < 0) { ne -= ns; ns = 0; }
        if (ne > 1) { ns -= (ne - 1); ne = 1; }
        ns = Math.max(0, ns); ne = Math.min(1, ne);
        if (ne - ns >= 1 - 1e-9) setXViewRange(null);
        else setXViewRange({ start: ns, end: ne });
      });
    };
    const onUp = (ev: MouseEvent) => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!didPan && e.button === 0 && dragStartRef.current && svgRef.current) {
        const r = svgRef.current.getBoundingClientRect();
        const mx = ((ev.clientX - r.left) / r.width) * size.w;
        const gi = mxToLocalIdx(mx);
        if (gi >= 0) setLocalIdx(gi);
      }
      xPanRef.current = null;
      dragStartRef.current = null;
      setIsPanning(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>설비별 Pred/Actual</span>
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
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg draft-chart-touch" width={size.w} height={size.h}
          style={{ cursor: isPanning ? 'grabbing' : 'crosshair' }}
          onMouseMove={e => { if (!isPanning) setHoverLocalIdx(mxToLocalIdx(svgMX(e))); }}
          onMouseLeave={() => setHoverLocalIdx(null)}
          onClick={handleClick}
          onDoubleClick={() => { setYRange(null); setXViewRange(null); }}>
          <defs>
            <clipPath id="pal-line-clip">
              <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} />
            </clipPath>
          </defs>
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="#0b1929" opacity={0.5}
            onMouseDown={startPan}
            style={{ cursor: isPanning ? 'grabbing' : 'grab' }} />
          <g onMouseDown={startYAxisDrag} onContextMenu={ev => ev.preventDefault()}
            onDoubleClick={e => { e.stopPropagation(); setYRange(null); }}
            style={{ cursor: 'ns-resize' }}>
            <rect x={0} y={PAD.top} width={PAD.left} height={plotH} fill="transparent" />
            {yTicks.map(v => {
              const y = ySc(v);
              return (
                <g key={v}>
                  <line x1={PAD.left} y1={y} x2={PAD.left + plotW} y2={y} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={PAD.left - 4} y={y} textAnchor="end" dominantBaseline="middle"
                    fontSize="9" fill="#64748b">{Math.round(v)}</text>
                </g>
              );
            })}
          </g>
          <text className="draft-pal-y-axis-title"
            transform={`translate(10,${PAD.top + plotH / 2}) rotate(-90)`}
            textAnchor="middle">Pred / Actual</text>
          <g style={{ cursor: 'default' }}>
            <rect x={PAD.left} y={PAD.top + plotH} width={plotW} height={PAD.bottom} fill="transparent" />
            {xTickIdxs.map(idx => {
              const x = xSc(idx);
              if (x < PAD.left - 0.5 || x > PAD.left + plotW + 0.5) return null;
              return (
                <g key={idx}>
                  <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + plotH} stroke="#1e3a5f" strokeWidth={1} strokeDasharray="4 3" />
                  <text x={x} y={PAD.top + plotH + 12} textAnchor="middle"
                    fontSize="9" fill="#64748b">{filteredDates[idx]?.slice(5)}</text>
                </g>
              );
            })}
          </g>
          <g clipPath="url(#pal-line-clip)">
            {[...byEq.entries()].map(([eq, { actual, pred }]) => {
              const col = eqColors[eq] ?? '#94a3b8';
              return (
                <g key={eq}>
                  <polyline points={polyline(actual)} fill="none" stroke={col} strokeWidth={1.5} opacity={0.9} />
                  <polyline points={polyline(pred)} fill="none" stroke={col} strokeWidth={1.5} strokeDasharray="5 3" opacity={0.55} />
                </g>
              );
            })}
            {selectedLocalIdx >= 0 && (
              <line x1={xSc(selectedLocalIdx)} y1={PAD.top} x2={xSc(selectedLocalIdx)} y2={PAD.top + plotH}
                stroke="#f59e0b" strokeWidth={1.5} opacity={0.9} />
            )}
            {hoverLocalIdx !== null && hoverLocalIdx !== selectedLocalIdx && (
              <line x1={xSc(hoverLocalIdx)} y1={PAD.top} x2={xSc(hoverLocalIdx)} y2={PAD.top + plotH}
                stroke="#94a3b8" strokeWidth={1} strokeDasharray="3 2" opacity={0.5} />
            )}
          </g>
          {selectedLocalIdx >= 0 && (() => {
            const x = Math.max(PAD.left + 14, Math.min(PAD.left + plotW - 14, xSc(selectedLocalIdx)));
            return <text x={x} y={PAD.top - 4} textAnchor="middle" fontSize="9" fill="#f59e0b">{selectedDate?.slice(5)}</text>;
          })()}
          {gapLabels.length > 0 && (
            <g className="draft-pal-gap-labels" style={{ pointerEvents: 'none' }}>
              <text x={gapLabelX} y={PAD.top - 4} className="draft-pal-gap-heading">Gap</text>
              {gapLabels.map(({ eq, gap, y, col }) => (
                <g key={eq}>
                  <line x1={PAD.left + plotW} y1={y} x2={gapLabelX - 3} y2={y}
                    stroke={col} strokeWidth={0.8} opacity={0.35} />
                  <text x={gapLabelX} y={y} className="draft-pal-gap-value" fill={col}>
                    {gap >= 0 ? '+' : ''}{gap.toFixed(1)}
                  </text>
                </g>
              ))}
            </g>
          )}
          <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#334155" strokeWidth={1} />
          <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#334155" strokeWidth={1} />
        </svg>
      </div>
      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEqLine} />
      {controlsVisible && timeline.filtered.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying} playSpeed={playSpeed}
          sliderIdx={localIdx} maxIdx={timeline.maxIdx}
          startDate={timeline.startDate}
          currentDate={timeline.currentDate}
          onPlay={onPlayTimeline}
          onSpeedChange={setPlaySpeed}
          onSlider={v => { setIsPlaying(false); setLocalIdx(v); }}
        />
      )}
    </div>
  );
}
