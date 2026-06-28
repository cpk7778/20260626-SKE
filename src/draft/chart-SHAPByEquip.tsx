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

// ── SHAP 기여도(설비별) ────────────────────────────────────────────────────────
// 설비별 SHAP 수평 멀티행 차트 — 행당 양수/음수 분리 화살표, X축 Align 토글
export function SHAPByEquipChart({ chartHeight }: { chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const [topN, setTopN] = useState(5);
  const [reversed, setReversed] = useState(false);
  const [aligned, setAligned] = useState(true);
  const { idx: selectedDateIdx } = useContext(ShapDateCtx);
  const timeline = useShapTimeline(SHAP_HISTORY);
  const {
    periodDays, setPeriodDays, localIdx, setLocalIdx, setIdx: setSelectedDateIdx,
    isPlaying, setIsPlaying, playSpeed, setPlaySpeed, onPlay: onPlayByEquip,
  } = timeline;
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{ eq: string; feature: string; shap: number; featureVal?: string; eqCol: string; barColor: string; svgX: number; svgY: number } | null>(null);

  const resetControls = () => { setTopN(5); setReversed(false); setAligned(true); setSelectedDateIdx(SHAP_DATE_IDX_DEFAULT); setIsPlaying(false); setPeriodDays(14); };
  const isModified = useMemo(() =>
    topN !== 5 || reversed || !aligned || isPlaying || periodDays !== 14,
  [topN, reversed, aligned, isPlaying, periodDays]);

  const handleBarEnter = (e: React.MouseEvent, eq: string, item: SHAPItem, barEqCol: string, barColor: string) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      eq, feature: item.feature, shap: item.shap, featureVal: item.featureVal,
      eqCol: barEqCol, barColor,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  const eqpRows = useMemo(() => EQP_NAMES.map(eq => {
    const { base, items: rawItems } = EQP_SHAP_HISTORY[eq][selectedDateIdx] ?? EQP_SHAP_HISTORY[eq][0];
    let pool = [...rawItems];
    pool.sort((a, b) => Math.abs(b.shap) - Math.abs(a.shap));
    if (topN > 0) pool = pool.slice(0, topN);

    // base에서 바깥 방향으로 큰 값부터 쌓아야 화살표가 자연스럽게 이어짐
    const posItems = pool.filter(d => d.shap >= 0).sort((a, b) => b.shap - a.shap);
    const negItems = pool.filter(d => d.shap < 0).sort((a, b) => a.shap - b.shap);

    // reversed=false: 좌=파랑(음수), 우=빨강(양수) / reversed=true: 반대 — sign으로 값 부호 반전
    const sign = reversed ? -1 : 1;
    const posCum = posItems.reduce<number[]>((acc, item, i) => {
      acc.push((i === 0 ? base : acc[i - 1]) + sign * item.shap);
      return acc;
    }, []);
    const negCum = negItems.reduce<number[]>((acc, item, i) => {
      acc.push((i === 0 ? base : acc[i - 1]) + sign * item.shap);
      return acc;
    }, []);

    const fp = base + pool.reduce((s, d) => s + d.shap, 0);
    const allX = [base, ...posCum, ...negCum];
    const xRawMin = Math.min(...allX);
    const xRawMax = Math.max(...allX);
    return { eq, base, posItems, negItems, posCum, negCum, fp, xRawMin, xRawMax };
  }), [topN, reversed, selectedDateIdx]);

  const eqpRowsAligned = useMemo(() => {
    if (!eqpRows.length) return [];
    if (!aligned) {
      return eqpRows.map(r => {
        const xPad = Math.max((r.xRawMax - r.xRawMin) * 0.12, 1);
        return { ...r, xMin: r.xRawMin - xPad, xMax: r.xRawMax + xPad };
      });
    }
    const gMin = Math.min(...eqpRows.map(r => r.xRawMin));
    const gMax = Math.max(...eqpRows.map(r => r.xRawMax));
    const xPad = Math.max((gMax - gMin) * 0.12, 1);
    const xMin = gMin - xPad;
    const xMax = gMax + xPad;
    return eqpRows.map(r => ({ ...r, xMin, xMax }));
  }, [eqpRows, aligned]);

  const LABEL_W = 54;
  const PAD_T = 6, PAD_R = 10;
  const plotW = Math.max(10, size.w - LABEL_W - PAD_R);
  const nRows = eqpRowsAligned.length;
  const rowTotalH = (size.h - PAD_T) / nRows;

  // 행당 수직 레이아웃: 상단여백 → tick숫자 → axis선+막대 → feature라벨 순으로 배치
  const headerH  = Math.min(10, rowTotalH * 0.10);
  const tickNumH = Math.min(14, rowTotalH * 0.12);
  const barH     = Math.min(30, Math.max(14, rowTotalH * 0.36));
  const bh = barH / 2;
  const totalAxisH = headerH + tickNumH;

  const rTop      = (i: number) => PAD_T + i * rowTotalH;
  const rAxisY    = (i: number) => rTop(i) + totalAxisH;
  const rBarCY    = (i: number) => rAxisY(i) + 4 + bh;
  const rFxY      = (i: number) => rBarCY(i) - bh - 3;          // f(x)/base — 막대 상단 바로 위
  const rFeatY    = (i: number) => rBarCY(i) + bh + 12;

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>SHAP 기여도(설비별)</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`} onClick={resetControls} title="초기화">↺</button>
        </div>
      </div>
      {controlsVisible && (
        <div className="draft-chart-controls">
          <PeriodSelect value={periodDays} onChange={setPeriodDays} />
          <select className="draft-toolbar-select" value={topN}
            onChange={e => setTopN(Number(e.target.value))} title="표시 개수">
            <option value={0}>전체</option>
            <option value={5}>상위 5개</option>
            <option value={7}>상위 7개</option>
          </select>
          <button className={`draft-chip-btn${reversed ? ' draft-chip-btn--active' : ''}`}
            onClick={() => setReversed(v => !v)} title="좌우 반전">⇄ 반전</button>
          <button className={`draft-chip-btn${aligned ? ' draft-chip-btn--active' : ''}`}
            onClick={() => setAligned(v => !v)} title="X축 정렬 (전체 최대 범위 기준)">Align</button>
        </div>
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg ref={svgRef} className="draft-chart-svg" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={LABEL_W} y={PAD_T} width={plotW} height={size.h - PAD_T} fill="#0b1929" opacity={0.5} />
          {eqpRowsAligned.map(({ eq, base, posItems, negItems, posCum, negCum, fp, xMin, xMax }, rowIdx) => {
            const axY   = rAxisY(rowIdx);
            const cy    = rBarCY(rowIdx);
            const featY = rFeatY(rowIdx);
            const color = eqColor(eqColors, eq);
            const xSc = (v: number) => scaleLinear(v, xMin, xMax, LABEL_W, plotW);
            const ticks = genTicks(xMin, xMax, 5);
            const fpX   = xSc(fp);
            const baseX = xSc(base);

            const renderBars = (arr: SHAPItem[], cum: number[], clr: string, eqName: string, eqClr: string, isPositive: boolean) =>
              arr.map((item, i) => {
                const x1 = xSc(i === 0 ? base : cum[i - 1]);
                const x2 = xSc(cum[i]);
                const bw = Math.abs(x2 - x1);
                const sign = item.shap >= 0 ? '+' : '';
                const valStr = `${sign}${item.shap.toFixed(2)}`;
                const inside = bw > 38;
                const lx = inside ? (x1 + x2) / 2 : isPositive ? x2 + 5 : x2 - 5;
                const la: 'middle' | 'start' | 'end' = inside ? 'middle' : isPositive ? 'start' : 'end';
                return (
                  <g key={item.feature} style={{ cursor: 'pointer' }}
                    onMouseEnter={e => handleBarEnter(e, eqName, item, eqClr, clr)}
                    onMouseLeave={() => setTooltip(null)}>
                    <polygon points={shapArrowPts(x1, x2, cy, bh)} fill={clr} opacity={0.88} />
                    <text x={lx} y={cy + 4} textAnchor={la} fontSize="10"
                      fill={inside ? '#fff' : clr} fontWeight="600">
                      {valStr}
                    </text>
                  </g>
                );
              });

            const renderLabels = (arr: SHAPItem[], cum: number[], clr: string, labelY: number) =>
              arr.map((item, i) => {
                const x1 = xSc(i === 0 ? base : cum[i - 1]);
                const x2 = xSc(cum[i]);
                const bw = Math.abs(x2 - x1);
                if (bw < 28) return null;
                const midX = (x1 + x2) / 2;
                const label = bw >= 60 && item.featureVal
                  ? `${item.feature} = ${item.featureVal}`
                  : item.feature;
                return (
                  <text key={item.feature} x={midX} y={labelY} textAnchor="middle"
                    fontSize="9" fill={clr}>{label}</text>
                );
              });

            return (
              <g key={eq}>
                <text x={LABEL_W - 6} y={cy + 4} textAnchor="end" fontSize="11"
                  fill={color} fontWeight="700">{eq}</text>
                <text x={fpX} y={rFxY(rowIdx)} textAnchor="middle" fontSize="9"
                  fill={color} fontWeight="700">f(x)={fp.toFixed(1)}</text>
                {ticks.map((t, ti) => {
                  const x = xSc(t);
                  if (x < LABEL_W || x > LABEL_W + plotW) return null;
                  return (
                    <text key={ti} x={x} y={axY - 3} textAnchor="middle" fontSize="9" fill="#64748b">
                      {t % 1 === 0 ? t : t.toFixed(1)}
                    </text>
                  );
                })}

                <line x1={LABEL_W} y1={axY} x2={LABEL_W + plotW} y2={axY} stroke="#475569" strokeWidth={1} />
                {ticks.map((t, ti) => {
                  const x = xSc(t);
                  if (x < LABEL_W || x > LABEL_W + plotW) return null;
                  return <line key={ti} x1={x} y1={axY} x2={x} y2={axY + 4} stroke="#475569" strokeWidth={1} />;
                })}
                {renderBars(posItems, posCum, SHAP_POS_C, eq, color, true)}
                {renderBars(negItems, negCum, SHAP_NEG_C, eq, color, false)}
                <circle cx={baseX} cy={cy} r={3} fill="#ffffff" />
                <text x={baseX} y={cy - bh - 3} textAnchor="middle" className="shap-eqp-base-label">
                  base={base.toFixed(1)}
                </text>
                <circle cx={fpX} cy={cy} r={3} fill={color} />
                {renderLabels(posItems, posCum, SHAP_POS_C, featY)}
                {renderLabels(negItems, negCum, SHAP_NEG_C, featY)}
                {rowIdx < nRows - 1 && (
                  <line x1={LABEL_W} y1={rTop(rowIdx + 1) - 3}
                    x2={LABEL_W + plotW} y2={rTop(rowIdx + 1) - 3}
                    stroke="#1e293b" strokeWidth={1} strokeDasharray="5 4" />
                )}
              </g>
            );
          })}
          {tooltip && (() => {
            const tipW = 130;
            const tipH = tooltip.featureVal ? 62 : 50;
            const tipX = tooltip.svgX + tipW + 10 > size.w ? tooltip.svgX - tipW - 4 : tooltip.svgX + 8;
            const tipY = Math.max(PAD_T, tooltip.svgY - tipH / 2);
            return (
              <>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize="10" fill={tooltip.eqCol} fontWeight="700">
                  {tooltip.eq}
                </text>
                <text x={tipX + 8} y={tipY + 26} fontSize="9" fill={tooltip.barColor}>
                  {tooltip.feature}
                </text>
                <text x={tipX + 8} y={tipY + 38} fontSize="9" fill="#94a3b8">
                  {tooltip.shap >= 0 ? '+' : ''}{tooltip.shap.toFixed(2)}
                </text>
                {tooltip.featureVal && (
                  <text x={tipX + 8} y={tipY + 50} fontSize="9" fill="#94a3b8">
                    val: {tooltip.featureVal}
                  </text>
                )}
              </>
            );
          })()}
        </svg>
      </div>
      <div className="draft-legend">
        <span className="draft-legend-item" style={{ pointerEvents: 'none', cursor: 'default' }}>
          {reversed ? (
            <>
              <span style={{ color: SHAP_POS_C }}>◀ higher</span>
              {' ⇌ '}
              <span style={{ color: SHAP_NEG_C }}>lower ▶</span>
            </>
          ) : (
            <>
              <span style={{ color: SHAP_POS_C }}>▶ higher</span>
              {' ⇌ '}
              <span style={{ color: SHAP_NEG_C }}>lower ◀</span>
            </>
          )}
        </span>
      </div>
      {controlsVisible && timeline.filtered.length > 1 && (
        <ChartTimeline
          isPlaying={isPlaying} playSpeed={playSpeed}
          sliderIdx={localIdx} maxIdx={timeline.maxIdx}
          startDate={timeline.startDate}
          currentDate={timeline.currentDate}
          onPlay={onPlayByEquip}
          onSpeedChange={setPlaySpeed}
          onSlider={v => { setIsPlaying(false); setLocalIdx(v); }}
        />
      )}
    </div>
  );
}
