import { useRef, useState, useMemo } from 'react';
import { scaleLinearY, genTicks } from '../draft/shared';
import { useContainerSize } from '../draft/shared';
import { SKE_KPI, CQI_COLOR, ENERGY_COLOR, type KpiRow, type CqiLevel, type EnergyType } from './data-ske';

// ── 단일 지표 모드 필드 정의 ──────────────────────────────────────────────────

type KpiField = 'total_mj' | 'sec_mj_per_bbl' | 'total_cost_mwon' | 'unit_cost_won_per_bbl' | 'cdu_bbl';
type ViewMode = 'single' | 'energy';

const FIELDS: { key: KpiField; label: string; unit: string; color: string }[] = [
  { key: 'total_mj', label: '총 에너지', unit: 'M MJ', color: '#38bdf8' },
  { key: 'sec_mj_per_bbl', label: '에너지 원단위', unit: 'MJ/BBL', color: '#a78bfa' },
  { key: 'total_cost_mwon', label: '총 비용', unit: 'M원', color: '#fb923c' },
  { key: 'unit_cost_won_per_bbl', label: '비용 원단위', unit: '원/BBL', color: '#34d399' },
  { key: 'cdu_bbl', label: '원유처리량', unit: 'BBL', color: '#fbbf24' },
];

// FG/Steam/ELEC MJ 동시 비교용
const ENERGY_LINES: { key: 'fg_mj' | 'stm_mj' | 'elec_mj'; energy: EnergyType; label: string }[] = [
  { key: 'fg_mj', energy: 'FG', label: 'FG (M MJ)' },
  { key: 'stm_mj', energy: 'Steam', label: 'Steam (M MJ)' },
  { key: 'elec_mj', energy: 'ELEC', label: 'ELEC (M MJ)' },
];

function fmtVal(v: number, key: KpiField) {
  if (key === 'cdu_bbl') return (v / 1000).toFixed(0) + 'k';
  if (key === 'unit_cost_won_per_bbl') return v.toFixed(0);
  if (key === 'total_cost_mwon') return (v / 1000).toFixed(1) + 'B';
  return v.toFixed(1);
}

export function SKEKpiChart() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const size = useContainerSize(wrapRef);
  const svgRef = useRef<SVGSVGElement>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [activeField, setActiveField] = useState<KpiField>('total_mj');
  const [periodDays, setPeriodDays] = useState(90);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hiddenEnergy, setHiddenEnergy] = useState<Set<EnergyType>>(new Set());

  const fieldMeta = FIELDS.find(f => f.key === activeField)!;

  const data = useMemo(() => {
    if (periodDays <= 0 || periodDays >= SKE_KPI.length) return SKE_KPI;
    return SKE_KPI.slice(-periodDays);
  }, [periodDays]);

  const PAD_L = 56, PAD_R = 16, PAD_T = 24, PAD_B = 44;
  const plotW = Math.max(10, size.w - PAD_L - PAD_R);
  const plotH = Math.max(10, size.h - PAD_T - PAD_B);

  // ── 단일 지표 스케일 ──
  const singleValues = data.map(r => r[activeField] as number);
  const sMin = Math.min(...singleValues), sMax = Math.max(...singleValues);
  const sPad = (sMax - sMin) * 0.08 || 1;
  const yMinS = sMin - sPad, yMaxS = sMax + sPad;

  // ── 에너지 비교 스케일: FG·Steam·ELEC를 각자 정규화 (축은 공통 0~1) ──
  const energySeriesRaw = ENERGY_LINES.map(el => data.map(r => r[el.key] as number));
  const energyNorm = energySeriesRaw.map(vals => {
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = hi - lo || 1;
    return vals.map(v => (v - lo) / range);
  });
  // 실제 값 참조용
  const energyRaw = energySeriesRaw;

  const xOf = (i: number) => PAD_L + (i / Math.max(data.length - 1, 1)) * plotW;
  const yOfS = (v: number) => scaleLinearY(v, yMinS, yMaxS, PAD_T, plotH);
  const yOfN = (v: number) => PAD_T + plotH - v * plotH; // 정규화 0~1

  const yTicksS = genTicks(yMinS, yMaxS, 5);

  const xLabelStep = Math.max(1, Math.floor(data.length / 8));
  const xLabels = data
    .map((r, i) => ({ i, label: r.date.slice(5) }))
    .filter((_, i) => i % xLabelStep === 0 || i === data.length - 1);

  const hovRow: KpiRow | null = hoverIdx !== null ? data[hoverIdx] : null;

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width * size.w;
    const i = Math.round(((x - PAD_L) / plotW) * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(data.length - 1, i)));
  };

  const gradId = `ske-kpi-grad-${activeField}`;

  // CQI Low 구간 배경 계산
  const cqiLowRanges: { x1: number; x2: number }[] = [];
  let rangeStart: number | null = null;
  data.forEach((r, i) => {
    if (r.cqi_level === 'Low') {
      if (rangeStart === null) rangeStart = i;
    } else {
      if (rangeStart !== null) {
        cqiLowRanges.push({ x1: xOf(rangeStart), x2: xOf(i - 1) });
        rangeStart = null;
      }
    }
  });
  if (rangeStart !== null)
    cqiLowRanges.push({ x1: xOf(rangeStart), x2: xOf(data.length - 1) });

  return (
    <div className="draft-chart-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="draft-ekpi-card-title">
        <span>CLX 에너지 KPI 시계열</span>
        <div className="draft-card-actions">
          {/* 뷰 모드 */}
          <div style={{ display: 'flex', border: '1px solid #334155', borderRadius: 6, overflow: 'hidden' }}>
            {(['single', 'energy'] as ViewMode[]).map(m => (
              <button key={m}
                className={`draft-chip-btn${viewMode === m ? ' draft-chip-btn--active' : ''}`}
                style={{ borderRadius: 0, borderRight: m === 'single' ? '1px solid #334155' : 'none' }}
                onClick={() => setViewMode(m)}>
                {m === 'single' ? '단일 지표' : 'FG/STM/ELEC'}
              </button>
            ))}
          </div>
          {/* 기간 */}
          {([30, 90, 180, 0] as const).map(d => (
            <button key={d}
              className={`draft-chip-btn${periodDays === d ? ' draft-chip-btn--active' : ''}`}
              onClick={() => setPeriodDays(d)}>
              {d === 0 ? '전체' : `${d}일`}
            </button>
          ))}
        </div>
      </div>

      {/* 지표 선택 (단일 모드) */}
      {viewMode === 'single' && (
        <div style={{ display: 'flex', gap: 6, padding: '4px 12px 6px', flexWrap: 'wrap' }}>
          {FIELDS.map(f => (
            <button key={f.key} onClick={() => setActiveField(f.key)}
              style={{
                padding: '3px 10px', fontSize: 11, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: activeField === f.key ? f.color : '#1e293b',
                color: activeField === f.key ? '#0d1117' : '#94a3b8',
                fontWeight: activeField === f.key ? 700 : 400,
              }}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* 에너지 범례/토글 (비교 모드) */}
      {viewMode === 'energy' && (
        <div style={{ display: 'flex', gap: 8, padding: '4px 12px 6px', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#475569' }}>각 에너지 독립 정규화 (0~1)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {ENERGY_LINES.map(el => {
              const hidden = hiddenEnergy.has(el.energy);
              return (
                <button key={el.energy}
                  onClick={() => setHiddenEnergy(prev => {
                    const next = new Set(prev);
                    if (next.has(el.energy)) next.delete(el.energy); else next.add(el.energy);
                    return next;
                  })}
                  style={{
                    padding: '2px 10px', fontSize: 11, borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: hidden ? '#1e293b' : ENERGY_COLOR[el.energy] + '33',
                    color: hidden ? '#334155' : ENERGY_COLOR[el.energy],
                    fontWeight: 600,
                  }}>
                  {el.energy}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={wrapRef} className="draft-chart-wrap" style={{ flex: 1, minHeight: 0 }}>
        <svg ref={svgRef} className="draft-chart-svg" width={size.w} height={size.h}
          onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIdx(null)}>

          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fieldMeta.color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={fieldMeta.color} stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* 배경 */}
          <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="#0b1929" opacity={0.5} />

          {/* CQI Low 구간 음영 */}
          {cqiLowRanges.map((r, ri) => (
            <rect key={ri} x={r.x1 - 2} y={PAD_T} width={Math.max(4, r.x2 - r.x1 + 4)} height={plotH}
              fill="#ef4444" opacity={0.07} />
          ))}

          {viewMode === 'single' && (
            <>
              {/* Y 그리드 + 레이블 */}
              {yTicksS.map((t, ti) => {
                const y = yOfS(t);
                if (y < PAD_T - 1 || y > PAD_T + plotH + 1) return null;
                return (
                  <g key={ti}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke="#1e3a5f" strokeWidth={0.8} />
                    <text x={PAD_L - 4} y={y + 4} textAnchor="end" fontSize={9} fill="#475569">
                      {fmtVal(t, activeField)}
                    </text>
                  </g>
                );
              })}

              {/* 영역 + 선 */}
              {data.length > 1 && (() => {
                const areaPath = `M${xOf(0)},${yOfS(singleValues[0])} `
                  + data.map((_, i) => `L${xOf(i)},${yOfS(singleValues[i])}`).join(' ')
                  + ` L${xOf(data.length - 1)},${PAD_T + plotH} L${xOf(0)},${PAD_T + plotH} Z`;
                const pts = data.map((_, i) => `${xOf(i)},${yOfS(singleValues[i])}`).join(' ');
                return (
                  <>
                    <path d={areaPath} fill={`url(#${gradId})`} />
                    <polyline points={pts} fill="none" stroke={fieldMeta.color} strokeWidth={1.8}
                      strokeLinejoin="round" strokeLinecap="round" />
                  </>
                );
              })()}

              {/* CQI Medium/Low 점 */}
              {data.map((r, i) => r.cqi_level !== 'High' && (
                <circle key={i} cx={xOf(i)} cy={yOfS(singleValues[i])} r={3}
                  fill={CQI_COLOR[r.cqi_level]} opacity={0.9} />
              ))}
            </>
          )}

          {viewMode === 'energy' && ENERGY_LINES.map((el, li) => {
            if (hiddenEnergy.has(el.energy)) return null;
            const color = ENERGY_COLOR[el.energy];
            const normVals = energyNorm[li];
            const pts = data.map((_, i) => `${xOf(i)},${yOfN(normVals[i])}`).join(' ');
            return (
              <polyline key={el.energy} points={pts} fill="none"
                stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round"
                opacity={0.9} />
            );
          })}

          {/* X축 */}
          <line x1={PAD_L} y1={PAD_T + plotH} x2={PAD_L + plotW} y2={PAD_T + plotH}
            stroke="#334155" strokeWidth={1} />
          {xLabels.map(({ i, label }) => (
            <text key={i} x={xOf(i)} y={PAD_T + plotH + 14} textAnchor="middle" fontSize={9} fill="#475569">
              {label}
            </text>
          ))}

          {/* 호버 */}
          {hoverIdx !== null && hovRow && (() => {
            const hx = xOf(hoverIdx);
            const isEnergy = viewMode === 'energy';
            const tipW = isEnergy ? 178 : 156;
            const tipH = isEnergy ? 96 : 76;
            const tipX = hx + tipW + 12 > size.w ? hx - tipW - 6 : hx + 8;
            const tipY = Math.max(PAD_T, Math.min(PAD_T + plotH - tipH, size.h / 2 - tipH / 2));
            const hy = isEnergy
              ? yOfN(energyNorm[0][hoverIdx])
              : yOfS(singleValues[hoverIdx]);
            return (
              <g>
                <line x1={hx} y1={PAD_T} x2={hx} y2={PAD_T + plotH}
                  stroke="#7dd3fc" strokeWidth={0.8} strokeDasharray="3 3" />
                <circle cx={hx} cy={hy} r={4}
                  fill={isEnergy ? ENERGY_COLOR.FG : fieldMeta.color} />
                <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={4}
                  fill="#0f172a" stroke="#334155" strokeWidth={1} />
                <text x={tipX + 8} y={tipY + 14} fontSize={10} fill="#64748b">{hovRow.date}</text>
                {isEnergy ? (
                  <>
                    {ENERGY_LINES.map((el, li) => !hiddenEnergy.has(el.energy) && (
                      <text key={el.energy} x={tipX + 8} y={tipY + 28 + li * 16} fontSize={10}
                        fill={ENERGY_COLOR[el.energy]} fontWeight="600">
                        {el.energy} {energyRaw[li][hoverIdx].toFixed(1)} M MJ
                      </text>
                    ))}
                    <text x={tipX + 8} y={tipY + 86} fontSize={9} fill="#475569">
                      CDU {(hovRow.cdu_bbl / 1000).toFixed(0)}k BBL
                    </text>
                  </>
                ) : (
                  <>
                    <text x={tipX + 8} y={tipY + 30} fontSize={12} fill={fieldMeta.color} fontWeight="700">
                      {fmtVal(singleValues[hoverIdx], activeField)} {fieldMeta.unit}
                    </text>
                    <text x={tipX + 8} y={tipY + 46} fontSize={10} fill="#64748b">
                      CDU {(hovRow.cdu_bbl / 1000).toFixed(0)}k BBL · {hovRow.atm_temp.toFixed(1)}℃
                    </text>
                  </>
                )}
                {/* CQI 배지 */}
                <rect x={tipX + 8} y={tipY + tipH - 14} width={52} height={11} rx={3}
                  fill={CQI_COLOR[hovRow.cqi_level]} opacity={0.18} />
                <text x={tipX + 34} y={tipY + tipH - 5} textAnchor="middle" fontSize={9}
                  fill={CQI_COLOR[hovRow.cqi_level]} fontWeight="600">
                  CQI {hovRow.cqi_level} ({hovRow.cqi_avg.toFixed(2)})
                </text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* 하단 범례 */}
      <div style={{ display: 'flex', gap: 12, padding: '4px 12px 8px', fontSize: 10, color: '#64748b', flexWrap: 'wrap' }}>
        {(['High', 'Medium', 'Low'] as CqiLevel[]).map(l => (
          <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width={8} height={8}><circle cx={4} cy={4} r={4} fill={CQI_COLOR[l]} /></svg>
            CQI {l}{l === 'Low' ? ' (배경 음영)' : ''}
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}>
          {viewMode === 'single' ? `단위: ${fieldMeta.unit}` : '각 에너지 개별 정규화'}
        </span>
      </div>
    </div>
  );
}
