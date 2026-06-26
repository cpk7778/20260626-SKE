import { useRef, useState, useMemo } from 'react';
import { scaleLinear, genTicks } from '../draft/shared';
import { useContainerSize } from '../draft/shared';
import {
  SKE_DETAIL, GROUP_COLORS, ENERGY_COLOR, HORIZON_LABEL,
  FEATURE_DESC,
  type Horizon, type EnergyType, type DetailRow,
} from './data-ske';
import { shapArrowPts } from '../draft/shared';

type UnitMode = 'raw' | 'mj' | 'mwon';

const HORIZONS: Horizon[] = ['D-1', 'W-1', 'M-1'];
const ENERGIES: EnergyType[] = ['FG', 'Steam', 'ELEC'];
const UNIT_LABEL: Record<UnitMode, string> = {
  raw: '원본 단위',
  mj: 'M MJ',
  mwon: 'M원',
};

// 에너지별 원본 단위
const ENERGY_UNIT: Record<EnergyType, string> = {
  FG: 'BBL',
  Steam: 'ESSTON',
  ELEC: 'KWH',
};

function getVal(row: DetailRow, u: UnitMode) {
  if (u === 'raw') return row.shap_raw;
  if (u === 'mj') return row.shap_mj;
  return row.shap_mwon;
}

function fmtVal(v: number, u: UnitMode) {
  const sign = v >= 0 ? '+' : '';
  if (u === 'raw') return `${sign}${v.toFixed(2)}`;
  if (u === 'mj') return `${sign}${v.toFixed(4)}`;
  return `${sign}${v.toFixed(4)}`;
}

export function SKEDetailChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const svgRef = useRef<SVGSVGElement>(null);

  const [horizon, setHorizon] = useState<Horizon>('D-1');
  const [energy, setEnergy] = useState<EnergyType>('FG');
  const [unit, setUnit] = useState<UnitMode>('mj');
  const [sortMode, setSortMode] = useState<'magnitude' | 'group'>('magnitude');
  const [tooltip, setTooltip] = useState<{ row: DetailRow; svgX: number; svgY: number } | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const groups = useMemo(() => {
    const set = new Set(
      SKE_DETAIL.filter(r => r.horizon === horizon && r.energy === energy).map(r => r.group),
    );
    return Array.from(set);
  }, [horizon, energy]);

  const rows: DetailRow[] = useMemo(() => {
    let data = SKE_DETAIL.filter(r =>
      r.horizon === horizon &&
      r.energy === energy &&
      (selectedGroup === null || r.group === selectedGroup) &&
      getVal(r, unit) !== 0,
    );
    if (sortMode === 'magnitude')
      data = [...data].sort((a, b) => Math.abs(getVal(b, unit)) - Math.abs(getVal(a, unit)));
    else
      data = [...data].sort((a, b) => a.group.localeCompare(b.group) || a.feature.localeCompare(b.feature));
    return data;
  }, [horizon, energy, unit, sortMode, selectedGroup]);

  const values = rows.map(r => getVal(r, unit));
  const cumulative = values.reduce<number[]>((acc, v, i) => {
    acc.push((i === 0 ? 0 : acc[i - 1]) + v);
    return acc;
  }, []);
  const total = values.reduce((s, v) => s + v, 0);

  const allX = [0, ...cumulative];
  const xRawMin = Math.min(...allX);
  const xRawMax = Math.max(...allX);
  const xPad = Math.max((xRawMax - xRawMin) * 0.1, 0.001);
  const xMin = xRawMin - xPad;
  const xMax = xRawMax + xPad;

  const LABEL_W = 148, PAD_T = 24, PAD_R = 20, PAD_B = 36;
  const plotW = Math.max(10, size.w - LABEL_W - PAD_R);
  const plotH = Math.max(10, size.h - PAD_T - PAD_B);
  const axisY = PAD_T + plotH;
  const n = rows.length;
  const barGap = 4;
  const barH = Math.max(8, (plotH - Math.max(0, n - 1) * barGap) / Math.max(n, 1));
  const bh = barH / 2;
  const bcy = (i: number) => PAD_T + i * (barH + barGap) + bh;

  const xSc = (v: number) => scaleLinear(v, xMin, xMax, LABEL_W, plotW);
  const ticks = genTicks(xMin, xMax, 5);

  const handleBarEnter = (e: React.MouseEvent, row: DetailRow) => {
    const rect = svgRef.current!.getBoundingClientRect();
    setTooltip({
      row,
      svgX: ((e.clientX - rect.left) / rect.width) * size.w,
      svgY: ((e.clientY - rect.top) / rect.height) * size.h,
    });
  };

  return (
    <div className="draft-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="draft-ekpi-card-title">
        <span>피처별 SHAP 기여도 (드릴다운)</span>
        <div className="draft-card-actions">
          <select className="draft-toolbar-select" value={sortMode}
            onChange={e => setSortMode(e.target.value as typeof sortMode)}>
            <option value="magnitude">기여도순</option>
            <option value="group">그룹순</option>
          </select>
          <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
            {(['raw', 'mj', 'mwon'] as UnitMode[]).map(u => (
              <button key={u}
                className={`draft-chip-btn${unit === u ? ' draft-chip-btn--active' : ''}`}
                style={{ borderRadius: 0, borderRight: u !== 'mwon' ? '1px solid #334155' : 'none', fontSize: 10 }}
                onClick={() => setUnit(u)}>
                {UNIT_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Horizon + Energy + 그룹 필터 */}
      <div style={{ display: 'flex', gap: 8, padding: '2px 12px 6px', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Horizon */}
        <div style={{ display: 'flex', gap: 2 }}>
          {HORIZONS.map(h => (
            <button key={h} onClick={() => setHorizon(h)}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 5, border: 'none', cursor: 'pointer',
                background: horizon === h ? '#1976D2' : '#1e293b',
                color: horizon === h ? '#fff' : '#64748b',
                fontWeight: horizon === h ? 700 : 400,
              }}>
              {h}
            </button>
          ))}
        </div>
        {/* Energy */}
        <div style={{ display: 'flex', gap: 2 }}>
          {ENERGIES.map(en => (
            <button key={en} onClick={() => setEnergy(en)}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 5, border: 'none', cursor: 'pointer',
                background: energy === en ? ENERGY_COLOR[en] : '#1e293b',
                color: energy === en ? '#0d1117' : '#64748b',
                fontWeight: energy === en ? 700 : 400,
              }}>
              {en}
            </button>
          ))}
        </div>
        {/* 그룹 필터 */}
        <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <button onClick={() => setSelectedGroup(null)}
            style={{
              padding: '2px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer',
              background: selectedGroup === null ? '#334155' : '#0f172a',
              color: selectedGroup === null ? '#fff' : '#64748b',
            }}>
            전체
          </button>
          {groups.map(g => (
            <button key={g} onClick={() => setSelectedGroup(prev => prev === g ? null : g)}
              style={{
                padding: '2px 8px', fontSize: 10, borderRadius: 4, border: 'none', cursor: 'pointer',
                background: selectedGroup === g ? (GROUP_COLORS[g] ?? '#334155') : '#0f172a',
                color: selectedGroup === g ? '#fff' : '#64748b',
              }}>
              {g}
            </button>
          ))}
        </div>
        {/* 합계 */}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569' }}>
          합계 <strong style={{ color: total >= 0 ? '#86efac' : '#fca5a5' }}>
            {total >= 0 ? '+' : ''}{total.toFixed(4)} {UNIT_LABEL[unit]}
          </strong>
        </span>
      </div>

      <div ref={wrapRef} className="draft-chart-wrap" style={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} className="draft-chart-svg" width={size.w} height={size.h}
          onMouseLeave={() => setTooltip(null)}>
          <rect x={LABEL_W} y={PAD_T} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />
          <line x1={xSc(0)} y1={PAD_T} x2={xSc(0)} y2={axisY}
            stroke="#334155" strokeWidth={1} strokeDasharray="4 3" />
          <line x1={xSc(total)} y1={PAD_T} x2={xSc(total)} y2={axisY}
            stroke="#7dd3fc" strokeWidth={1} strokeDasharray="3 3" />
          <line x1={LABEL_W} y1={axisY} x2={LABEL_W + plotW} y2={axisY}
            stroke="#334155" strokeWidth={1.5} />

          {ticks.map((t, ti) => {
            const x = xSc(t);
            if (x < LABEL_W - 1 || x > LABEL_W + plotW + 1) return null;
            const fmt = t.toFixed(unit === 'raw' ? 1 : 3);
            return (
              <g key={ti}>
                <line x1={x} y1={axisY} x2={x} y2={axisY + 4} stroke="#334155" strokeWidth={1} />
                <text x={x} y={axisY + 14} textAnchor="middle" fontSize={9} fill="#475569">{fmt}</text>
              </g>
            );
          })}

          <text x={xSc(total)} y={PAD_T - 6} textAnchor="middle" fontSize={9} fill="#7dd3fc">
            합계 {total >= 0 ? '+' : ''}{total.toFixed(3)}
          </text>

          {rows.map((row, i) => {
            const v = values[i];
            const sv = i === 0 ? 0 : cumulative[i - 1];
            const ev = cumulative[i];
            const x1 = xSc(sv);
            const x2 = xSc(ev);
            const cy = bcy(i);
            const color = GROUP_COLORS[row.group] ?? (v >= 0 ? '#22c55e' : '#ef4444');
            const bw = Math.abs(x2 - x1);
            const inside = bw > 40;
            const valStr = fmtVal(v, unit);
            const lx = inside ? (x1 + x2) / 2 : v >= 0 ? x2 + 4 : x2 - 4;
            const la: 'middle' | 'start' | 'end' = inside ? 'middle' : v >= 0 ? 'start' : 'end';

            return (
              <g key={`${row.horizon}-${row.energy}-${row.feature}`} style={{ cursor: 'pointer' }}
                onMouseEnter={e => handleBarEnter(e, row)}
                onMouseLeave={() => setTooltip(null)}>
                <polygon points={shapArrowPts(x1, x2, cy, bh)} fill={color} opacity={0.82} />
                <text x={LABEL_W - 6} y={cy + 4} textAnchor="end" fontSize={10}>
                  <tspan fill={color} fontWeight="600">{row.feature}</tspan>
                  <tspan fill="#334155" fontSize={8}> {row.group}</tspan>
                </text>
                <text x={lx} y={cy + 4} textAnchor={la} fontSize={9}
                  fill={inside ? '#fff' : (v >= 0 ? '#86efac' : '#fca5a5')} fontWeight="600">
                  {valStr}
                </text>
              </g>
            );
          })}

          {tooltip && (() => {
            const { row, svgX, svgY } = tooltip;
            const v = getVal(row, unit);
            const desc = FEATURE_DESC[row.feature];
            const gColor = GROUP_COLORS[row.group] ?? '#94a3b8';
            const tipW = 196;
            const tipH = desc ? 102 : 86;
            const tipX = svgX + tipW + 12 > size.w ? svgX - tipW - 4 : svgX + 8;
            const tipY = Math.max(PAD_T, Math.min(axisY - tipH, svgY - tipH / 2));
            return (
              <g>
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                {/* 피처명 */}
                <text x={tipX + 8} y={tipY + 16} fontSize={12} fill="#e2e8f0" fontWeight="700">
                  {row.feature}
                </text>
                {/* 설명 */}
                {desc && (
                  <text x={tipX + 8} y={tipY + 30} fontSize={9} fill="#64748b">{desc}</text>
                )}
                {/* 그룹 */}
                <circle cx={tipX + 12} cy={tipY + (desc ? 44 : 30)} r={4} fill={gColor} />
                <text x={tipX + 22} y={tipY + (desc ? 48 : 34)} fontSize={9} fill="#94a3b8">
                  {row.group}
                </text>
                {/* SHAP 값 */}
                <text x={tipX + 8} y={tipY + (desc ? 64 : 50)} fontSize={11}
                  fill={v >= 0 ? '#86efac' : '#fca5a5'} fontWeight="700">
                  {fmtVal(v, unit)} {UNIT_LABEL[unit]}
                </text>
                {/* 원본 단위 표시 */}
                <text x={tipX + 8} y={tipY + (desc ? 78 : 64)} fontSize={9} fill="#475569">
                  원본: {row.shap_raw.toFixed(2)} {ENERGY_UNIT[row.energy]}
                </text>
                {/* MJ / 비용 병기 */}
                <text x={tipX + 8} y={tipY + tipH - 8} fontSize={9} fill="#334155">
                  MJ {row.shap_mj >= 0 ? '+' : ''}{row.shap_mj.toFixed(4)}
                  &nbsp;·&nbsp;비용 {row.shap_mwon >= 0 ? '+' : ''}{row.shap_mwon.toFixed(4)}M원
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      <div style={{ padding: '2px 12px 8px', fontSize: 10, color: '#475569' }}>
        {energy} ({ENERGY_UNIT[energy]}) · {HORIZON_LABEL[horizon]} · {UNIT_LABEL[unit]} · {rows.length}개 피처
      </div>
    </div>
  );
}
