import { useContext, useRef } from 'react';
import type { XYPoint } from './data-draft';
import { EqColorContext, useChartControls, useContainerSize, EqLegend } from './shared';
import { useGaugeBulletChart, GaugeBulletControls, GaugeBulletTimeline } from './shared';
import { DraftDragHandle } from './ui';

// ── Bullet 차트 ───────────────────────────────────────────────────────────────
// Bullet 차트 패딩 상수 — right 여백은 상태 뱃지(정상/주의/경고) 공간
const BULLET_PAD = { top: 20, right: 72, bottom: 26, left: 76 };

// 수평 Bullet 차트 — 설비별 행, 존 배경·바·초과 뱃지 렌더링
export function BulletChart({ data, chartHeight }: { data: XYPoint[]; chartHeight?: number }) {
  const eqColors = useContext(EqColorContext);
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const { controlsVisible, toggleControls } = useChartControls();
  const {
    eqs, hiddenEqs, selectEq, eqYValues, visibleEqs,
    rangeMin, setRangeMin, rangeMax, setRangeMax,
    warnVal, setWarnVal, alertVal, setAlertVal,
    warnClamped, alertClamped, totalRange,
    dataMin, dataMax, resetAll, isModified, timeline,
  } = useGaugeBulletChart(data);
  const { isPlaying } = timeline;

  const plotW = Math.max(10, size.w - BULLET_PAD.left - BULLET_PAD.right);
  const plotH = Math.max(10, size.h - BULLET_PAD.top  - BULLET_PAD.bottom);
  const toX = (v: number) => BULLET_PAD.left + Math.max(0, Math.min(1, (v - rangeMin) / totalRange)) * plotW;

  const nRows = Math.max(1, visibleEqs.length);
  const rowH  = plotH / nRows;
  const barH  = Math.max(8, Math.min(22, rowH * 0.42));
  const bandH = Math.max(4, Math.min(10, rowH * 0.22));
  const barRx = barH / 2;
  const plotRx = 8;

  const xMin   = toX(rangeMin);
  const xWarn  = toX(warnClamped);
  const xAlert = toX(alertClamped);
  const xMax   = toX(rangeMax);

  const majorVals: number[] = [];
  for (let v = Math.ceil(rangeMin / 10) * 10; v <= rangeMax + 1e-9; v += 10) majorVals.push(v);

  return (
    <div className="draft-chart-card draft-ekpi-card" style={chartHeight ? { height: chartHeight } : undefined}>
      <div className="draft-ekpi-card-title">
        <DraftDragHandle />
        <span>Bullet 차트</span>
        <div className="draft-card-actions">
          <button className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          <button className={`draft-chip-btn${!isModified ? ' draft-chip-btn--dim' : ''}`} onClick={resetAll}>↺</button>
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
        />
      )}
      <div ref={wrapRef} className="draft-chart-wrap">
        <svg width={size.w} height={size.h} className="bullet-chart-svg">
          <rect x={BULLET_PAD.left} y={BULLET_PAD.top} width={plotW} height={plotH}
            fill="#0b1929" opacity={0.5} rx={plotRx} ry={plotRx} />
          {visibleEqs.map((_, i) => i > 0 && (
            <line key={i} x1={BULLET_PAD.left} y1={BULLET_PAD.top + i * rowH}
              x2={BULLET_PAD.left + plotW} y2={BULLET_PAD.top + i * rowH}
              stroke="#1e293b" strokeWidth={0.5} />
          ))}
          <rect x={xWarn}  y={BULLET_PAD.top} width={xAlert - xWarn}  height={plotH} fill="#f97316" opacity={0.07} />
          <rect x={xAlert} y={BULLET_PAD.top} width={xMax   - xAlert} height={plotH} fill="#ef4444" opacity={0.07} />
          {visibleEqs.map((eq, rowIdx) => {
            const rowY = BULLET_PAD.top + rowIdx * rowH;
            const midY = rowY + rowH / 2;
            const v    = eqYValues.get(eq) ?? rangeMin;
            const xV   = toX(v);
            const col  = eqColors[eq] ?? '#94a3b8';
            const barW = Math.max(0, xV - xMin);
            const bandY = midY - barH / 2 - bandH - 2;
            const valRight = xV + 4;
            const labelAnchor = valRight + 20 > BULLET_PAD.left + plotW ? 'end' : 'start';
            const statusInfo = v >= alertClamped
              ? { label: '경고', color: '#ef4444', excess: v - alertClamped }
              : v >= warnClamped
              ? { label: '주의', color: '#f97316', excess: v - warnClamped }
              : { label: '정상', color: '#22c55e', excess: 0 };
            const badgeX = BULLET_PAD.left + plotW + 6;
            const badgeW = 24;
            const badgeH = Math.min(14, barH);
            return (
              <g key={eq}>
                <rect x={xWarn}  y={bandY} width={xAlert - xWarn}  height={bandH} fill="#f97316" opacity={0.5} />
                <rect x={xAlert} y={bandY} width={xMax   - xAlert} height={bandH} fill="#ef4444" opacity={0.5} />
                <rect x={xMin} y={midY - barH / 2} width={plotW} height={barH} fill="#1e293b" rx={barRx} ry={barRx} />
                <rect x={xMin} y={midY - barH / 2} width={barW} height={barH} fill={col} opacity={0.82}
                  rx={Math.min(barRx, barW / 2)} ry={barRx}
                  style={isPlaying ? { transition: 'width 0.4s ease-out' } : undefined} />
                {/* 값 라벨 — 바 너비만큼 translateX로 일괄 이동 */}
                <g style={{
                  transform: `translateX(${barW}px)`,
                  ...(isPlaying ? { transition: 'transform 0.4s ease-out' } : {}),
                }}>
                  <text x={xMin + (valRight + 20 > BULLET_PAD.left + plotW ? -4 : 4)}
                    y={midY} textAnchor={labelAnchor} dominantBaseline="middle"
                    fontSize="9" fontWeight="700" fill={col}>{v}</text>
                </g>
                <text x={BULLET_PAD.left - 5} y={midY} textAnchor="end" dominantBaseline="middle"
                  fontSize="9" fontWeight="600" fill={col}>{eq.replace('EQ#', 'Equipment #')}</text>
                <rect x={badgeX} y={midY - badgeH / 2} width={badgeW} height={badgeH}
                  rx={badgeH / 2} ry={badgeH / 2}
                  fill={statusInfo.color} opacity={0.18} />
                <rect x={badgeX} y={midY - badgeH / 2} width={badgeW} height={badgeH}
                  rx={badgeH / 2} ry={badgeH / 2}
                  fill="none" stroke={statusInfo.color} strokeWidth={0.8} opacity={0.7} />
                <text x={badgeX + badgeW / 2} y={midY} textAnchor="middle" dominantBaseline="middle"
                  fontSize="8" fontWeight="700" fill={statusInfo.color}>{statusInfo.label}</text>
                {statusInfo.excess > 0 && (
                  <text x={badgeX + badgeW + 3} y={midY} dominantBaseline="middle"
                    fontSize="8" fontWeight="600" fill={statusInfo.color}>
                    +{statusInfo.excess.toFixed(1).replace(/\.0$/, '')}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={xWarn}  y1={BULLET_PAD.top - 6} x2={xWarn}  y2={BULLET_PAD.top + plotH}
            stroke="#f97316" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
          <line x1={xAlert} y1={BULLET_PAD.top - 6} x2={xAlert} y2={BULLET_PAD.top + plotH}
            stroke="#ef4444" strokeWidth={1} strokeDasharray="3,3" opacity={0.6} />
          <text x={xWarn}  y={BULLET_PAD.top - 8} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#f97316">{warnClamped}</text>
          <text x={xAlert} y={BULLET_PAD.top - 8} textAnchor="middle" fontSize="8" fontWeight="bold" fill="#ef4444">{alertClamped}</text>
          <line x1={BULLET_PAD.left} y1={BULLET_PAD.top + plotH}
            x2={BULLET_PAD.left + plotW} y2={BULLET_PAD.top + plotH}
            stroke="#334155" strokeWidth={1} />
          {majorVals.map((v, i) => (
            <g key={i}>
              <line x1={toX(v)} y1={BULLET_PAD.top + plotH} x2={toX(v)} y2={BULLET_PAD.top + plotH + 3}
                stroke="#475569" strokeWidth={0.8} />
              <text x={toX(v)} y={BULLET_PAD.top + plotH + 12}
                textAnchor="middle" fontSize="8" fill="#64748b">{v}</text>
            </g>
          ))}
        </svg>
      </div>
      <EqLegend eqs={eqs} hiddenEqs={hiddenEqs} eqColors={eqColors} onSelect={selectEq} />
      {controlsVisible && <GaugeBulletTimeline timeline={timeline} />}
    </div>
  );
}
