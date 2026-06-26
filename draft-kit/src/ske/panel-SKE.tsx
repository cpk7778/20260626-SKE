import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import '../draft/draft.css';
import { HEX_WIDTH_PRESETS } from '../draft/types-hex';
import { DraftDragHandle } from '../draft/ui';
import {
  applySkeLayoutDrop,
  resolveSkeDropFromPointer,
  type SkeDropTarget,
  type SkeLayout,
} from './data-skeLayout';
import {
  loadSkeLayout,
  loadSkeCards,
  resetSkeLayout,
  resetSkeCards,
  saveSkeLayout,
  saveSkeCards,
  type SkeCardSizes,
} from './data-skeLayoutStorage';
import { SKE_META, SKE_KPI, CQI_COLOR, ENERGY_COLOR, GROUP_COLORS, cqiFromValue } from './data-ske';
import { SKEKpiChart } from './chart-SKEKpi';
import { SKEFactorsChart } from './chart-SKEFactors';
import { SKEDetailChart } from './chart-SKEDetail';
import type { CqiLevel, EnergyType } from './data-ske';

// ── 높이 프리셋 ──────────────────────────────────────────────────────────────
const SKE_HEIGHT_PRESETS = [
  { label: '자동',  value: 'auto'  },
  { label: '80',    value: '80px'  },
  { label: '100',   value: '100px' },
  { label: '120',   value: '120px' },
  { label: '140',   value: '140px' },
  { label: '160',   value: '160px' },
  { label: '180',   value: '180px' },
  { label: '200',   value: '200px' },
  { label: '240',   value: '240px' },
  { label: '280',   value: '280px' },
  { label: '320',   value: '320px' },
  { label: '360',   value: '360px' },
  { label: '400',   value: '400px' },
  { label: '460',   value: '460px' },
  { label: '520',   value: '520px' },
  { label: '560',   value: '560px' },
  { label: '600',   value: '600px' },
] as const;

const SKE_GAP = 10;

function gapAdjustedWidth(pct: string): string {
  const x = parseFloat(pct);
  if (!isFinite(x) || x === 0) return pct;
  const gapPerCard = (1 - x / 100) * SKE_GAP;
  return gapPerCard > 0 ? `calc(${pct} - ${gapPerCard}px)` : pct;
}

function getColWidthStyle(
  col: string[],
  sizes: SkeCardSizes,
): React.CSSProperties {
  let maxPct = 0;
  for (const id of col) {
    const v = sizes[id]?.width ?? '33%';
    if (v === '100%') {
      const w = gapAdjustedWidth('100%');
      return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
    }
    const n = parseFloat(v);
    if (!Number.isNaN(n) && n > maxPct) maxPct = n;
  }
  const w = gapAdjustedWidth(`${maxPct || 33}%`);
  return { width: w, flex: `0 0 ${w}`, maxWidth: '100%' };
}

const DEFAULT_CARD_SIZES: SkeCardSizes = {
  'kpi-header':    { width: '34%', height: '140px' },
  'kpi-summary':   { width: '33%', height: '140px' },
  'kpi-energy':    { width: '33%', height: '140px' },
  'chart-kpi':     { width: '34%', height: '460px' },
  'chart-factors': { width: '33%', height: '460px' },
  'chart-detail':  { width: '33%', height: '460px' },
};

// ── EditableSelect ────────────────────────────────────────────────────────────
const CUSTOM_OPT = '__custom__';

interface EditableSelectProps {
  presets: readonly { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  title?: string;
}

const EditableSelect: React.FC<EditableSelectProps> = ({ presets, value, onChange, suffix, title }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    setEditing(false);
    const t = raw.trim();
    if (!t) return;
    onChange(/^\d+(\.\d+)?$/.test(t) ? t + suffix : t);
  };

  const startEdit = () => {
    setDraft(value !== 'auto' ? value.replace(suffix, '') : '');
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const isCustom = !presets.some(p => p.value === value);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        className="draft-toolbar-select"
        title={title}
        value={isCustom ? CUSTOM_OPT : value}
        style={editing ? { visibility: 'hidden' } : undefined}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => e.target.value === CUSTOM_OPT ? startEdit() : onChange(e.target.value)}
        onDoubleClick={startEdit}
      >
        {presets.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        {isCustom
          ? <option value={CUSTOM_OPT}>✏ {value}</option>
          : <option value={CUSTOM_OPT}>직접입력...</option>}
      </select>
      {editing && (
        <input
          ref={inputRef}
          className="draft-toolbar-select"
          style={{ position: 'absolute', inset: 0, width: '100%', boxSizing: 'border-box' }}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(draft); }
            if (e.key === 'Escape') setEditing(false);
          }}
          autoFocus
        />
      )}
    </div>
  );
};

// ── CardWrapper ───────────────────────────────────────────────────────────────
interface CardWrapperProps {
  id: string;
  title: string;
  sizes: SkeCardSizes;
  onUpdate: (patch: Partial<{ width: string; height: string }>) => void;
  children: React.ReactNode;
  className?: string;
  dragging?: boolean;
  fillColumn?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

const CardWrapper: React.FC<CardWrapperProps> = ({
  id, title, sizes, onUpdate, children, className,
  dragging, fillColumn, onDragStart, onDragEnd,
}) => {
  const s = sizes[id] ?? { width: '33%', height: 'auto' };
  const fixedH = s.height !== 'auto';
  const cardWidth = fillColumn ? '100%' : gapAdjustedWidth(s.width);

  return (
    <div
      className={[
        'ske-card',
        'apc-card',
        'draft-ekpi-card',
        fixedH   ? 'apc-card--fixed-h'  : '',
        dragging ? 'apc-card--dragging' : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
      data-ske-card-id={id}
      style={{
        width: cardWidth,
        maxWidth: '100%',
        ...(fixedH ? { height: s.height, '--apc-flex-basis': s.height } as React.CSSProperties : {}),
      }}
      onDragEnd={onDragEnd}
    >
      <div className="draft-ekpi-card-title">
        <DraftDragHandle
          draggable
          title="드래그하여 카드 이동"
          ariaLabel="드래그하여 카드 이동"
          onDragStart={e => {
            e.stopPropagation();
            e.dataTransfer.setData('text/plain', id);
            e.dataTransfer.effectAllowed = 'move';
            const card = (e.currentTarget as HTMLElement).closest('.ske-card') as HTMLElement;
            if (card) {
              const rect = card.getBoundingClientRect();
              e.dataTransfer.setDragImage(card, e.clientX - rect.left, e.clientY - rect.top);
            }
            onDragStart?.();
          }}
          onDragEnd={() => onDragEnd?.()}
        />
        <span className="apc-card-title-text">{title}</span>
        <EditableSelect
          presets={HEX_WIDTH_PRESETS}
          value={s.width}
          onChange={v => onUpdate({ width: v })}
          suffix="%"
          title="너비"
        />
        <EditableSelect
          presets={SKE_HEIGHT_PRESETS}
          value={s.height}
          onChange={v => onUpdate({ height: v })}
          suffix="px"
          title="높이"
        />
      </div>
      {fixedH ? <div className="apc-card-body">{children}</div> : children}
    </div>
  );
};

// ── 카드 컨텐츠: kpi-header ───────────────────────────────────────────────────
const KpiHeaderCard: React.FC = () => {
  const meta = SKE_META;
  const cqiLevel: CqiLevel = cqiFromValue(meta.cqi.today);
  return (
    <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
          CLX 에너지 변동 분석
        </div>
        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.7 }}>
          기준일&nbsp;<strong style={{ color: '#7dd3fc' }}>{meta.target_date}</strong>
          &nbsp;·&nbsp;<span style={{ color: '#64748b' }}>{meta.data_range}</span>
          &nbsp;·&nbsp;<span style={{ color: '#475569' }}>{meta.model.version}</span>
        </div>
      </div>
      <div style={{
        padding: '5px 10px', background: '#0b1929', borderRadius: 6,
        border: '1px solid #1e3a5f', fontSize: 10, color: '#475569',
      }}>
        <span style={{ color: '#38bdf8' }}>▶ </span>
        <strong style={{ color: '#94a3b8' }}>Δy = f(운전변수)</strong>
        &nbsp;XGBoost+SHAP 100% 설명
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <div style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
          background: CQI_COLOR[cqiLevel] + '20', color: CQI_COLOR[cqiLevel],
          border: `1px solid ${CQI_COLOR[cqiLevel]}44`,
        }}>
          CQI {cqiLevel}
        </div>
        <span style={{ fontSize: 10, color: '#334155' }}>
          {meta.cqi.today.toFixed(3)}
        </span>
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {meta.groups.map(g => (
            <span key={g} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: '#94a3b8' }}>
              <svg width={7} height={7}><circle cx={3.5} cy={3.5} r={3.5} fill={GROUP_COLORS[g] ?? '#64748b'} /></svg>
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── 카드 컨텐츠: kpi-summary ──────────────────────────────────────────────────
const KpiSummaryCard: React.FC = () => {
  const { kpi_today } = SKE_META;
  const items = [
    { label: '총 에너지',   value: kpi_today.total_mj.toFixed(1),                  unit: 'M MJ',    color: '#38bdf8' },
    { label: '에너지 원단위', value: kpi_today.sec.toFixed(1),                      unit: 'MJ/BBL',  color: '#a78bfa' },
    { label: '총 비용',     value: (kpi_today.total_cost_mwon / 1000).toFixed(2),   unit: 'B원',     color: '#fb923c' },
    { label: '비용 원단위', value: kpi_today.unit_cost_won_per_bbl.toFixed(0),       unit: '원/BBL',  color: '#34d399' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '8px 14px', height: '100%', boxSizing: 'border-box' }}>
      {items.map(item => (
        <div key={item.label} style={{
          background: '#071220', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px',
        }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{item.label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: item.color, lineHeight: 1.1 }}>{item.value}</div>
          <div style={{ fontSize: 10, color: '#334155', marginTop: 1 }}>{item.unit}</div>
        </div>
      ))}
    </div>
  );
};

// ── 카드 컨텐츠: kpi-energy ───────────────────────────────────────────────────
const KpiEnergyCard: React.FC = () => {
  const todayRow = SKE_KPI.find(r => r.date === SKE_META.target_date) ?? SKE_KPI[SKE_KPI.length - 1];
  const total = todayRow?.total_mj ?? SKE_META.kpi_today.total_mj;
  const items: { key: EnergyType; label: string; mj: number; cost: number }[] = todayRow ? [
    { key: 'FG',    label: 'Fuel Gas', mj: todayRow.fg_mj,   cost: todayRow.fg_cost_mwon   },
    { key: 'Steam', label: 'Steam',    mj: todayRow.stm_mj,  cost: todayRow.stm_cost_mwon  },
    { key: 'ELEC',  label: 'ELEC',     mj: todayRow.elec_mj, cost: todayRow.elec_cost_mwon },
  ] : [];
  return (
    <div style={{ padding: '8px 14px', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>에너지 구성 (M MJ)</div>
      {items.map(({ key, label, mj, cost }) => {
        const pct = total > 0 ? (mj / total) * 100 : 0;
        const color = ENERGY_COLOR[key];
        return (
          <div key={key} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
              <span style={{ fontSize: 10, color: '#64748b' }}>
                {mj.toFixed(1)} M MJ&nbsp;·&nbsp;{(cost / 1000).toFixed(2)} B원
              </span>
            </div>
            <div style={{ height: 6, background: '#1e293b', borderRadius: 3 }}>
              <div style={{ height: 6, width: `${pct}%`, background: color, borderRadius: 3 }} />
            </div>
            <div style={{ fontSize: 9, color: '#334155', marginTop: 1 }}>{pct.toFixed(1)}%</div>
          </div>
        );
      })}
    </div>
  );
};

// ── 메인 SKE 대시보드 ─────────────────────────────────────────────────────────
export const SKEDashboard: React.FC = () => {
  const [sizes, setSizes] = useState<SkeCardSizes>(() => ({
    ...DEFAULT_CARD_SIZES,
    ...loadSkeCards(),
  }));
  const [layout, setLayout]         = useState<SkeLayout>(loadSkeLayout);
  const [, setUndoStack]    = useState<SkeLayout[]>([]);
  const [draggingId, setDragging]   = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<SkeDropTarget | null>(null);

  const dropTargetRef  = useRef<SkeDropTarget | null>(null);
  const draggingIdRef  = useRef<string | null>(null);
  const layoutRef      = useRef<SkeLayout>(layout);
  const didDropRef     = useRef(false);

  dropTargetRef.current = dropTarget;
  layoutRef.current     = layout;

  const handleDragStart = useCallback((id: string) => {
    didDropRef.current = false;
    draggingIdRef.current = id;
    requestAnimationFrame(() => setDragging(id));
  }, []);

  const handleDragEnd = useCallback(() => {
    requestAnimationFrame(() => {
      if (!didDropRef.current) {
        draggingIdRef.current = null;
        setDragging(null);
        setDropTarget(null);
      }
      didDropRef.current = false;
    });
  }, []);

  const handleWrapDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!draggingIdRef.current) return;
    const next = resolveSkeDropFromPointer(
      e.clientX, e.clientY,
      e.currentTarget as HTMLElement,
      draggingIdRef.current,
    );
    if (!next) { setDropTarget(null); return; }
    setDropTarget(prev => {
      if (
        prev?.kind     === next.kind &&
        prev?.targetId === next.targetId &&
        prev?.rowIndex === next.rowIndex &&
        prev?.colIndex === next.colIndex
      ) return prev;
      return next;
    });
  }, []);

  const applyDrop = useCallback(() => {
    const from = draggingIdRef.current;
    const dt   = dropTargetRef.current;
    if (!from || !dt) return;
    setLayout(prev => {
      const next = applySkeLayoutDrop(prev, from, dt);
      setUndoStack(stack => [...stack.slice(-19), prev]);
      return next;
    });
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  const handleWrapDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    didDropRef.current = true;
    applyDrop();
  }, [applyDrop]);

  const updSize = (id: string, patch: Partial<{ width: string; height: string }>) =>
    setSizes(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        setUndoStack(stack => {
          if (stack.length === 0) return stack;
          const prev = stack[stack.length - 1];
          setLayout(prev);
          return stack.slice(0, -1);
        });
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => { saveSkeLayout(layout); }, [layout]);
  useEffect(() => { saveSkeCards(sizes);   }, [sizes]);

  const handleReset = useCallback(() => {
    resetSkeLayout();
    resetSkeCards();
    setSizes({ ...DEFAULT_CARD_SIZES });
    setLayout(loadSkeLayout());
    setUndoStack([]);
    draggingIdRef.current = null;
    setDragging(null);
    setDropTarget(null);
  }, []);

  const dndProps = (id: string) => ({
    dragging:    draggingId === id,
    onDragStart: () => handleDragStart(id),
    onDragEnd:   handleDragEnd,
  });

  const renderCard = (id: string, fillColumn = false): React.ReactNode => {
    const commonProps = {
      id,
      sizes,
      onUpdate: (patch: Partial<{ width: string; height: string }>) => updSize(id, patch),
      fillColumn,
      ...dndProps(id),
    };

    switch (id) {
      case 'kpi-header':
        return (
          <CardWrapper key={id} title="헤더 — 기준일 · 모델 · CQI" {...commonProps}>
            <KpiHeaderCard />
          </CardWrapper>
        );
      case 'kpi-summary':
        return (
          <CardWrapper key={id} title="KPI 요약" {...commonProps}>
            <KpiSummaryCard />
          </CardWrapper>
        );
      case 'kpi-energy':
        return (
          <CardWrapper key={id} title="에너지 구성 분해" {...commonProps}>
            <KpiEnergyCard />
          </CardWrapper>
        );
      case 'chart-kpi':
        return (
          <CardWrapper key={id} title="KPI 시계열" {...commonProps}>
            <SKEKpiChart />
          </CardWrapper>
        );
      case 'chart-factors':
        return (
          <CardWrapper key={id} title="변동요인 Waterfall" {...commonProps}>
            <SKEFactorsChart />
          </CardWrapper>
        );
      case 'chart-detail':
        return (
          <CardWrapper key={id} title="피처 SHAP 드릴다운" {...commonProps}>
            <SKEDetailChart />
          </CardWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="apc-page">
      {/* 상태 바 */}
      <div className="apc-status-bar">
        <span className="apc-badge apc-badge--ok">CLX 에너지 서비스</span>
        <span className="apc-status-meta">기준일 {SKE_META.target_date}</span>
        <span className="apc-status-sep" />
        <span className="apc-status-meta">{SKE_META.model.version}</span>
        <div style={{ flex: 1 }} />
        <div className="apc-layout-persist">
          <span className="apc-layout-persist-label">배치 자동 저장</span>
          <button
            type="button"
            className="apc-layout-reset-btn"
            onClick={handleReset}
            title="저장된 배치를 기본으로 초기화"
          >
            Reset
          </button>
        </div>
      </div>

      {/* 드래그/드롭 영역 */}
      <div
        className={['apc-main-wrap', draggingId ? 'apc-main-wrap--dragging' : ''].filter(Boolean).join(' ')}
        onDragOver={handleWrapDragOver}
        onDrop={handleWrapDrop}
      >
        {/* 맨 위 new-row 슬롯 */}
        {draggingId && (
          <div
            className={[
              'ske-row-above-slot',
              'apc-row-above-slot',
              dropTarget?.kind === 'row-above' ? 'apc-row-above-slot--active' : '',
            ].filter(Boolean).join(' ')}
            aria-hidden="true"
          >
            <span className="apc-row-above-slot__label">+ New Row</span>
          </div>
        )}
        {dropTarget?.kind === 'row-above' && (
          <div
            className="apc-drop-indicator apc-drop-indicator--row"
            style={dropTarget.indicatorWidth != null
              ? { width: dropTarget.indicatorWidth, marginLeft: dropTarget.indicatorMarginLeft ?? 0 }
              : undefined}
          />
        )}

        {layout.map((row, ri) => (
          <div key={`row-${ri}`} className="ske-row apc-row" data-ske-row-index={ri}>
            <div className="apc-row-cols">
              {row.map((col, ci) => (
                <Fragment key={`col-${ri}-${ci}`}>
                  {dropTarget?.kind === 'col-before' && dropTarget.rowIndex === ri && dropTarget.colIndex === ci && (
                    <div className="apc-drop-indicator apc-drop-indicator--col" />
                  )}
                  <div
                    className={`ske-column apc-column${col.length > 1 ? ' ske-column--stack apc-column--stack' : ''}`}
                    data-ske-col-index={ci}
                    style={getColWidthStyle(col, sizes)}
                  >
                    {col.map(id => {
                      const dt = dropTarget;
                      const isAbove = dt?.kind === 'stack-above' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const isBelow = dt?.kind === 'stack-below' && dt.rowIndex === ri && dt.colIndex === ci && dt.targetId === id;
                      const dropCls = isAbove ? 'apc-card--drop-above' : isBelow ? 'apc-card--drop-below' : '';
                      const card = renderCard(id, true);
                      const node = dropCls && React.isValidElement(card)
                        ? React.cloneElement(card as React.ReactElement<{ className?: string }>, {
                            className: [(card.props as { className?: string }).className, dropCls]
                              .filter(Boolean).join(' ') || undefined,
                          })
                        : card;
                      return <Fragment key={id}>{node}</Fragment>;
                    })}
                    {/* 스택 하단 드롭 슬롯 */}
                    {draggingId && col.length > 0 && (
                      <div className="ske-col-stack-slot" style={{ height: 12, minHeight: 12 }} aria-hidden="true" />
                    )}
                  </div>
                  {dropTarget?.kind === 'col-after' && dropTarget.rowIndex === ri && dropTarget.colIndex === ci && (
                    <div className="apc-drop-indicator apc-drop-indicator--col" />
                  )}
                </Fragment>
              ))}
            </div>

            {/* row 아래 new-row 슬롯 */}
            {draggingId && (
              <div
                className={[
                  'ske-row-below-slot',
                  'apc-row-below-slot',
                  dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri
                    ? 'apc-row-below-slot--active'
                    : '',
                ].filter(Boolean).join(' ')}
                data-ske-row-index={ri}
                aria-hidden="true"
              >
                <span className="apc-row-below-slot__label">+ New Row</span>
              </div>
            )}
            {dropTarget?.kind === 'row-below' && dropTarget.rowIndex === ri && (
              <div
                className="apc-drop-indicator apc-drop-indicator--row"
                style={dropTarget.indicatorWidth != null
                  ? { width: dropTarget.indicatorWidth, marginLeft: dropTarget.indicatorMarginLeft ?? 0 }
                  : undefined}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default SKEDashboard;
