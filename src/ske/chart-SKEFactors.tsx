import { useRef, useState, useMemo } from 'react';
import { scaleLinear, genTicks } from '../draft/shared';
import { useContainerSize } from '../draft/shared';
import { getSKEFactors, SKE_KPI, CQI_COLOR, ENERGY_COLOR, DATE_RANGE_LABEL, type FactorRow, type EnergyType, type DateRange } from './data-ske';
import { shapArrowPts } from '../draft/shared';

type SortMode = 'cumulative' | 'magnitude';


function fmtImpact(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)} MMJ`;
}

function fmtRaw(row: FactorRow) {
  const parts: string[] = [];
  if (Math.abs(row.fg_bbl) > 0.1)    parts.push(`FG ${row.fg_bbl.toFixed(0)} BBL`);
  if (Math.abs(row.stm_esston) > 0.1) parts.push(`STM ${row.stm_esston.toFixed(0)} ES`);
  if (Math.abs(row.elec_kwh) > 1)     parts.push(`ELEC ${(row.elec_kwh / 1000).toFixed(0)}k KWH`);
  return parts.join(' · ');
}

interface SKEFactorsChartProps {
  onGroupSelect?: (group: string | null) => void;
  selectedGroup?: string | null;
  activeEnergy?: EnergyType | null;
  dateRange?: DateRange;
  anchorDate?: string;
  fromDate?: string;
}

export function SKEFactorsChart({ onGroupSelect, selectedGroup: selectedGroupProp, activeEnergy, dateRange = '30d', anchorDate, fromDate: fromDateProp }: SKEFactorsChartProps = {}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const svgRef = useRef<SVGSVGElement>(null);

  const unit = 'mj' as const;
  const [sortMode, setSortMode] = useState<SortMode>('magnitude');
  const [tooltip, setTooltip] = useState<{ row: FactorRow; svgX: number; svgY: number } | null>(null);
  const [internalGroup, setInternalGroup] = useState<string | null>(null);
  const selectedGroup = selectedGroupProp !== undefined ? selectedGroupProp : internalGroup;

  const impactKey = 'impact_mj' as const;

  const rows = useMemo(() => {
    const base = getSKEFactors(dateRange).filter(r => r.horizon === 'D-1');
    if (sortMode === 'magnitude')
      return [...base].sort((a, b) => Math.abs(b[impactKey]) - Math.abs(a[impactKey]));
    const pos = base.filter(r => r[impactKey] >= 0).sort((a, b) => b[impactKey] - a[impactKey]);
    const neg = base.filter(r => r[impactKey] < 0).sort((a, b) => a[impactKey] - b[impactKey]);
    return [...pos, ...neg];
  }, [sortMode, impactKey, dateRange]);

  const impacts = rows.map(r => r[impactKey]);
  const total = impacts.reduce((s, v) => s + v, 0);

  const cumulative = impacts.reduce<number[]>((acc, v, i) => {
    acc.push((i === 0 ? 0 : acc[i - 1]) + v);
    return acc;
  }, []);

  const allX = [0, ...cumulative];
  const xRawMin = Math.min(...allX);
  const xRawMax = Math.max(...allX);
  const xPad = Math.max((xRawMax - xRawMin) * 0.14, Math.abs(total) * 0.05 + 0.1);
  const xMin = xRawMin - xPad;
  const xMax = xRawMax + xPad;

  const LABEL_W = 126, PAD_T = 32, PAD_R = 20, PAD_B = 36;
  const plotW = Math.max(10, size.w - LABEL_W - PAD_R);
  const plotH = Math.max(10, size.h - PAD_T - PAD_B);
  const axisY = PAD_T + plotH;
  const n = rows.length;
  const barGap = 7;
  const barH = Math.max(12, (plotH - (n - 1) * barGap) / n);
  const bh = barH / 2;
  const bcy = (i: number) => PAD_T + i * (barH + barGap) + bh;

  const xSc = (v: number) => scaleLinear(v, xMin, xMax, LABEL_W, plotW);
  const ticks = genTicks(xMin, xMax, 5);

  // 이번 horizon의 CQI
  const cqiRow = rows[0];
  const cqiLevel = cqiRow?.cqi_level ?? 'High';

  // From ~ To 날짜 계산
  const toDate = anchorDate ?? SKE_KPI[SKE_KPI.length - 1]?.date ?? '';
  const fromDate = fromDateProp ?? (() => {
    const daysMap: Record<DateRange, number> = { '7d': 7, '14d': 14, '30d': 30, '90d': 90, '180d': 180, 'all': 0 };
    const spanDays = daysMap[dateRange] || SKE_KPI.length;
    const toIdx = SKE_KPI.findIndex(r => r.date === toDate);
    const resolvedToIdx = toIdx >= 0 ? toIdx : SKE_KPI.length - 1;
    return SKE_KPI[Math.max(0, resolvedToIdx - spanDays + 1)]?.date ?? '';
  })();
  const fmtDate = (d: string) => d.slice(5);

  const handleBarEnter = (e: React.MouseEvent, row: FactorRow) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      row,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  const handleBarClick = (row: FactorRow) => {
    const next = selectedGroup === row.group ? null : row.group;
    setInternalGroup(next);
    onGroupSelect?.(next);
  };

  return (
    <div className="draft-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 700,
          background: '#1e3a5f', color: '#7dd3fc', border: '1px solid #1e4a7f' }}>
          {DATE_RANGE_LABEL[dateRange]}
        </div>
        <div style={{
          padding: '2px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
          background: CQI_COLOR[cqiLevel] + '22', color: CQI_COLOR[cqiLevel],
          border: `1px solid ${CQI_COLOR[cqiLevel]}44`,
        }}>
          CQI {cqiLevel}
        </div>
        <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
          {(['magnitude', 'cumulative'] as SortMode[]).map(s => (
            <button key={s}
              className={`draft-chip-btn${sortMode === s ? ' draft-chip-btn--active' : ''}`}
              style={{ borderRadius: 0, border: 'none', borderRight: s === 'magnitude' ? '1px solid #334155' : 'none', fontSize: 10 }}
              onClick={() => setSortMode(s)}>
              {s === 'magnitude' ? '크기순' : '누적순'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '2px 12px 6px', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>
          {fmtDate(fromDate)} ~ {fmtDate(toDate)}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
          합계 <strong style={{ color: total >= 0 ? '#86efac' : '#fca5a5' }}>{fmtImpact(total)}</strong>
        </span>
      </div>

      <div ref={wrapRef} className="draft-chart-wrap" style={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} className="draft-chart-svg" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={LABEL_W} y={PAD_T} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <line x1={xSc(0)} y1={PAD_T} x2={xSc(0)} y2={axisY}
            stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={xSc(total)} y1={PAD_T} x2={xSc(total)} y2={axisY}
            stroke="#7dd3fc" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={LABEL_W} y1={axisY} x2={LABEL_W + plotW} y2={axisY}
            stroke="#334155" strokeWidth={1.5} />

          {ticks.map((t, ti) => {
            const x = xSc(t);
            if (x < LABEL_W - 1 || x > LABEL_W + plotW + 1) return null;
            const fmt = unit === 'mj' ? t.toFixed(1) : (t / 1000).toFixed(1);
            return (
              <g key={ti}>
                <line x1={x} y1={axisY} x2={x} y2={axisY + 4} stroke="#334155" strokeWidth={1} />
                <text x={x} y={axisY + 14} textAnchor="middle" fontSize={11} fill="#475569">{fmt}</text>
              </g>
            );
          })}

          <text x={xSc(0)} y={PAD_T - 8} textAnchor="middle" fontSize={11} fill="#64748b">0</text>
          <text x={xSc(total)} y={PAD_T - 8} textAnchor="middle" fontSize={11}
            fill={total >= 0 ? '#86efac' : '#fca5a5'}>
            {fmtImpact(total)}
          </text>

          {rows.map((row, i) => {
            const impact = impacts[i];
            const sv = i === 0 ? 0 : cumulative[i - 1];
            const ev = cumulative[i];
            const x1 = xSc(sv);
            const x2 = xSc(ev);
            const cy = bcy(i);
            const bw = Math.abs(x2 - x1);
            const inside = bw > 52;
            const valStr = fmtImpact(impact);
            const lx = inside ? (x1 + x2) / 2 : impact >= 0 ? x2 + 5 : x2 - 5;
            const la: 'middle' | 'start' | 'end' = inside ? 'middle' : impact >= 0 ? 'start' : 'end';

            const isSelected = selectedGroup === row.group;
            const dimmed = selectedGroup !== null && !isSelected;

            // 에너지 강조
            const energyRawVal =
              activeEnergy === 'FG'    ? row.fg_bbl :
              activeEnergy === 'Steam' ? row.stm_esston :
              activeEnergy === 'ELEC'  ? row.elec_kwh : 0;
            const energyUnit =
              activeEnergy === 'FG'    ? 'BBL' :
              activeEnergy === 'Steam' ? 'ES' : 'KWH';
            const hasEnergy = activeEnergy != null && Math.abs(energyRawVal) > 0.1;
            const energyDimmed = activeEnergy != null && !hasEnergy;
            const energyColor = activeEnergy ? ENERGY_COLOR[activeEnergy] : null;

            return (
              <g key={row.group} style={{ cursor: 'pointer' }}
                onMouseEnter={e => handleBarEnter(e, row)}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => handleBarClick(row)}>
                {hasEnergy && energyColor && (
                  <rect x={Math.min(x1, x2) - 2} y={cy - bh - 2}
                    width={Math.max(4, bw) + 4} height={barH + 4}
                    fill="none" stroke={energyColor} strokeWidth={1.5} opacity={0.7} rx={2} />
                )}
                <polygon points={shapArrowPts(x1, x2, cy, bh)} fill={row.color}
                  opacity={energyDimmed ? 0.15 : dimmed ? 0.25 : isSelected ? 1 : 0.87}
                  stroke={isSelected ? '#fff' : 'none'} strokeWidth={1.5} />
                <text x={LABEL_W - 8} y={cy + 4} textAnchor="end" fontSize={12}
                  fill={energyDimmed ? '#1e3a5f' : dimmed ? '#334155' : '#e2e8f0'}
                  fontWeight={isSelected ? 700 : 600}>
                  {row.group}
                </text>
                <text x={lx} y={cy + 4} textAnchor={la} fontSize={11}
                  fill={energyDimmed ? '#1e3a5f' : dimmed ? '#334155' : inside ? '#fff' : (impact >= 0 ? '#86efac' : '#fca5a5')}
                  fontWeight="600">
                  {valStr}
                </text>
                {hasEnergy && energyColor && (
                  <text x={LABEL_W - 8} y={cy + bh + 11} textAnchor="end" fontSize={10}
                    fill={energyColor} opacity={0.9}>
                    {energyRawVal.toFixed(0)} {energyUnit}
                  </text>
                )}
              </g>
            );
          })}

          {tooltip && (() => {
            const { row, svgX, svgY } = tooltip;
            const impact = row[impactKey];
            const rawStr = fmtRaw(row);
            const tipW = 172, tipH = rawStr ? 96 : 78;
            const tipX = svgX + tipW + 12 > size.w ? svgX - tipW - 4 : svgX + 8;
            const tipY = Math.max(PAD_T, Math.min(axisY - tipH, svgY - tipH / 2));
            return (
              <g>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <circle cx={tipX + 12} cy={tipY + 14} r={5} fill={row.color} />
                <text x={tipX + 22} y={tipY + 18} fontSize={12} fill="#e2e8f0" fontWeight="700">
                  {row.group}
                </text>
                <text x={tipX + 8} y={tipY + 34} fontSize={12}
                  fill={impact >= 0 ? '#86efac' : '#fca5a5'} fontWeight="600">
                  {fmtImpact(impact)}
                </text>
                {rawStr && (
                  <text x={tipX + 8} y={tipY + 50} fontSize={11} fill="#64748b">{rawStr}</text>
                )}
                {/* CQI */}
                <rect x={tipX + 8} y={tipY + tipH - 18} width={56} height={12} rx={3}
                  fill={CQI_COLOR[row.cqi_level]} opacity={0.18} />
                <text x={tipX + 36} y={tipY + tipH - 8} textAnchor="middle" fontSize={11}
                  fill={CQI_COLOR[row.cqi_level]} fontWeight="600">
                  CQI {row.cqi_level} ({row.cqi_avg.toFixed(2)})
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div style={{ padding: '2px 12px 8px', fontSize: 12, color: '#475569' }}>
        단위: M MJ · 정렬: {sortMode === 'magnitude' ? '절대값 크기순' : '누적 흐름순'}
      </div>
    </div>
  );
}
