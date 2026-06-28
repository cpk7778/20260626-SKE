/**
 * DraftPage — ?popout=xy 팝업·기능 Draft 탭
 */
import React, { useEffect, useRef, useState } from 'react';
import './draft.css';
import { DRAFT_TABS, type DraftTab } from './types-draft';
import { loadHexDefaultState, normalizeHexLayoutState } from './data-snapshotStorage';
import { loadApcLayoutFromStorage, loadApcCardsFromStorage, resetApcLayoutStorage, resetApcCardsStorage, saveApcLayoutToStorage, saveApcCardsToStorage, type ApcCardSizes } from './data-apcLayoutStorage';
import { useDraftLayout, SPACING_PRESETS } from './hooks/useDraftLayout';
import { useDraftDragDrop } from './hooks/useDraftDragDrop';
import { useLayoutSnapshot } from './hooks/useLayoutSnapshot';
import { normalizeDraftLayoutState } from './data-snapshotStorage';
import { DraftChartTab } from './page-ChartTab';
import type { SKEDashboardHandle } from '../ske/panel-SKE';
const SKEDashboardLazy = React.lazy(() => import('../ske/panel-SKE').then(m => ({ default: m.SKEDashboard })));
import { SnapshotBar } from './ui';
import { createDefaultHexLayoutState, type HexLayoutState } from './types-hex';
import type { ApcLayout } from './data-apcLayout';
import { normalizeSkeSnapshot, type SkeLayoutSnapshot } from '../ske/data-skeLayoutStorage';

// ── Row 높이 더블클릭 입력 컴포넌트 ──────────────────────────────────────────
const RowHeightSelect: React.FC<{
  value: number;
  presets: number[];
  title?: string;
  onChange: (v: number) => void;
}> = ({ value, presets, title, onChange }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = (raw: string) => {
    setEditing(false);
    const n = parseInt(raw.trim(), 10);
    if (!isNaN(n) && n > 0) onChange(n);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <select
        className="draft-toolbar-select"
        title={title}
        value={presets.includes(value) ? value : ''}
        style={editing ? { visibility: 'hidden' } : undefined}
        onMouseDown={e => e.stopPropagation()}
        onChange={e => onChange(Number(e.target.value))}
        onDoubleClick={() => {
          setDraft(String(value));
          setEditing(true);
          setTimeout(() => inputRef.current?.select(), 0);
        }}
      >
        {presets.map(v => <option key={v} value={v}>{v}px</option>)}
        {!presets.includes(value) && <option value={value}>{value}px</option>}
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

const preloadHex = () => import('./panel-Hex');
const preloadApc = () => import('./panel-Apc');
const DraftHexPanel = React.lazy(() => preloadHex().then(m => ({ default: m.DraftHexPanel })));
const ApcDashboard = React.lazy(() => preloadApc().then(m => ({ default: m.ApcDashboard })));

const SNAPSHOT_KEYS = {
  draft: 'draft-layout-snapshots-v1',
  hex: 'hex-layout-snapshots-v1',
  fuelh2: 'fuelh2-layout-snapshots-v1',
  ske: 'ske-layout-snapshots-v1',
} as const;

const HEX_DEFAULT_STATE_KEY = 'hex-layout-default-state-v1';

const DraftPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DraftTab>('기능 Draft');

  const layout = useDraftLayout();
  const dragDrop = useDraftDragDrop();
  const containerPad = SPACING_PRESETS[layout.spacingIdx].pad;

  const draftSnap = useLayoutSnapshot(SNAPSHOT_KEYS.draft, normalizeDraftLayoutState);
  const hexSnap   = useLayoutSnapshot(SNAPSHOT_KEYS.hex, normalizeHexLayoutState);
  const fuelSnap  = useLayoutSnapshot<ApcLayout>(SNAPSHOT_KEYS.fuelh2);
  const skeSnap   = useLayoutSnapshot<SkeLayoutSnapshot>(SNAPSHOT_KEYS.ske, normalizeSkeSnapshot);

  const [hexState, setHexState] = useState<HexLayoutState>(() => loadHexDefaultState(HEX_DEFAULT_STATE_KEY));
  const [fuelKey, setFuelKey] = useState(0);
  const fuelImportRef = useRef<HTMLInputElement>(null);
  const skeRef = useRef<SKEDashboardHandle>(null);
  const [skeRowHeights, setSkeRowHeights] = useState<number[]>([800]);

  const formatApcExport = (data: { layout: string[][][]; cards: Record<string, { width: string; height: string }> }): string => {
    const rows = data.layout.map(row => {
      const cols = row.map(col => `      ${JSON.stringify(col)}`).join(',\n');
      return `    [\n${cols}\n    ]`;
    });
    const layoutStr = `[\n${rows.join(',\n')}\n  ]`;

    const keyMaxLen = Math.max(...Object.keys(data.cards).map(k => k.length));
    const cardLines = Object.entries(data.cards).map(([k, v]) => {
      const pad = ' '.repeat(keyMaxLen - k.length + 1);
      return `    ${JSON.stringify(k)}:${pad}${JSON.stringify(v)}`;
    });
    const cardsStr = `{\n${cardLines.join(',\n')}\n  }`;

    return `{\n  "layout": ${layoutStr},\n  "cards": ${cardsStr}\n}\n`;
  };

  const handleFuelExport = async () => {
    const { serializeCards } = await import('./panel-Apc');
    const selected = fuelSnap.snapshots.find(s => s.id === fuelSnap.selectedId);
    const data = {
      layout: selected ? selected.state : loadApcLayoutFromStorage(),
      cards: serializeCards(loadApcCardsFromStorage()),
    };
    const suffix = selected
      ? selected.label.replace(/[^0-9a-zA-Z가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      : new Date().toISOString().slice(0, 16).replace('T', '-').replace(':', '');
    const blob = new Blob([formatApcExport(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fuel-h2-layout-${suffix}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFuelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const raw = JSON.parse(ev.target?.result as string);
        if (Array.isArray(raw)) {
          saveApcLayoutToStorage(raw as ApcLayout);
        } else if (raw && typeof raw === 'object') {
          if (raw.layout) saveApcLayoutToStorage(raw.layout as ApcLayout);
          if (raw.cards) {
            // 구버전(widthIdx/heightIdx) 포맷도 저장 → ApcDashboard가 로드 시 마이그레이션
            saveApcCardsToStorage(raw.cards as unknown as ApcCardSizes);
          }
        }
        setFuelKey(k => k + 1);
      } catch { /* invalid JSON — ignore */ }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // 앱 idle 시 HEX·Apc 청크 백그라운드 preload (requestIdleCallback: iOS 18+만 지원)
  useEffect(() => {
    const ric = typeof requestIdleCallback !== 'undefined' ? requestIdleCallback : null;
    if (!ric) return;
    const id = ric(() => { void preloadHex(); void preloadApc(); });
    return () => cancelIdleCallback(id);
  }, []);

  // HEX 레이아웃 변경 시 자동 저장
  useEffect(() => {
    try { localStorage.setItem(HEX_DEFAULT_STATE_KEY, JSON.stringify(hexState)); } catch { /* ignore quota */ }
  }, [hexState]);

  return (
    <div className={`draft-page-content draft-dashboard-page${activeTab !== 'CLX 에너지' ? ' draft-page--scroll' : ''}`}>
      <div className="draft-artifacts-container draft-artifacts-container--pad" style={{ padding: containerPad }}>
        <div className="draft-artifacts-top-bar">
          <div className="draft-tab-bar">
            {DRAFT_TABS.map(tab => (
              <button
                key={tab}
                className={`draft-tab${activeTab === tab ? ' draft-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
                onMouseEnter={tab === 'HEX' ? preloadHex : tab === 'Fuel-H2' ? preloadApc : undefined}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {activeTab === '기능 Draft' && (
          <DraftChartTab layout={layout} dragDrop={dragDrop} snap={draftSnap} />
        )}

        {activeTab === 'HEX' && (
          <div className="draft-tab-panel-hex">
            <div className="draft-dashboard-section-header draft-dashboard-section-header--tight">
              <span className="draft-dashboard-section-label">CDU · HEX</span>
              <SnapshotBar
                snapshots={hexSnap.snapshots}
                selectedId={hexSnap.selectedId}
                onReset={() => setHexState(createDefaultHexLayoutState())}
                onSave={() => hexSnap.save(() => ({ ...hexState, slotOrder: [...hexState.slotOrder] }))}
                onDelete={hexSnap.remove}
                onSelect={id => {
                  const state = hexSnap.apply(id, normalizeHexLayoutState);
                  if (state) setHexState(state);
                }}
                selectAriaLabel="HEX 저장 상태"
              />
            </div>
            <React.Suspense fallback={null}>
              <DraftHexPanel layoutState={hexState} onLayoutStateChange={setHexState} />
            </React.Suspense>
          </div>
        )}

        {activeTab === 'CLX 에너지' && (
          <div className="draft-tab-panel-hex" style={{ paddingBottom: 0, flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div className="draft-dashboard-section-header draft-dashboard-section-header--tight">
              <span className="draft-dashboard-section-label">CLX 에너지 서비스</span>
              {/* Row 높이 드롭다운 — 더블클릭으로 직접 입력 가능 */}
              {(() => {
                const ROW_H_PRESETS = [400, 460, 520, 560, 600, 640, 680, 700, 720, 760, 800, 860, 920, 980, 1040, 1100];
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
                    <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>Row 높이</span>
                    {skeRowHeights.map((h, ri) => (
                      <RowHeightSelect
                        key={ri}
                        value={h}
                        presets={ROW_H_PRESETS}
                        title={`Row ${ri + 1} 높이`}
                        onChange={v => setSkeRowHeights(prev => {
                          const next = [...prev];
                          next[ri] = v;
                          return next;
                        })}
                      />
                    ))}
                  </div>
                );
              })()}
              <SnapshotBar
                snapshots={skeSnap.snapshots}
                selectedId={skeSnap.selectedId}
                onReset={() => skeRef.current?.reset()}
                onSave={() => skeSnap.save(() => skeRef.current?.getSnapshot() ?? { layout: [] as never, cards: {} })}
                onDelete={skeSnap.remove}
                onSelect={id => {
                  const s = skeSnap.apply(id, normalizeSkeSnapshot);
                  if (s) skeRef.current?.applySnapshot(s);
                }}
                selectAriaLabel="CLX 에너지 저장 상태"
              />
            </div>
            <React.Suspense fallback={null}>
              <SKEDashboardLazy
                ref={skeRef}
                onReset={() => skeSnap.setSelectedId('')}
                rowHeights={skeRowHeights}
                onRowCountChange={count => setSkeRowHeights(prev =>
                  count === prev.length ? prev :
                  count > prev.length
                    ? [...prev, ...Array(count - prev.length).fill(prev[prev.length - 1] ?? 700)]
                    : prev.slice(0, count)
                )}
              />
            </React.Suspense>
          </div>
        )}

        {activeTab === 'Fuel-H2' && (
          <div className="draft-tab-panel-hex">
            <div className="draft-dashboard-section-header draft-dashboard-section-header--tight">
              <span className="draft-dashboard-section-label">Fuel / H₂ Optimizer</span>
              <SnapshotBar
                snapshots={fuelSnap.snapshots}
                selectedId={fuelSnap.selectedId}
                onReset={() => { resetApcLayoutStorage(); resetApcCardsStorage(); setFuelKey(k => k + 1); }}
                onSave={() => fuelSnap.save(loadApcLayoutFromStorage)}
                onDelete={fuelSnap.remove}
                onSelect={id => {
                  fuelSnap.setSelectedId(id);
                  const snapshot = fuelSnap.snapshots.find(s => s.id === id);
                  if (!snapshot) return;
                  saveApcLayoutToStorage(snapshot.state);
                  setFuelKey(k => k + 1);
                }}
                selectAriaLabel="Fuel-H2 저장 상태"
              />
              <button type="button" className="draft-chip-btn" onClick={handleFuelExport}>내보내기</button>
              <button type="button" className="draft-chip-btn" onClick={() => fuelImportRef.current?.click()}>가져오기</button>
              <input ref={fuelImportRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFuelImport} />
            </div>
            <React.Suspense fallback={null}>
              <ApcDashboard key={fuelKey} />
            </React.Suspense>
          </div>
        )}
      </div>
    </div>
  );
};

export default DraftPage;
