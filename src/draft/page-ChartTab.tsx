/** "기능 Draft" 탭 — 9개 차트 그리드 + toolbar */
import React, { useMemo } from 'react';
import { BUILT_IN_DATA, EQ_COLOR_PROFILES } from './data-draft';
import { CHART_FONT_OPTIONS } from './shared';
import { ChartProviders } from './shared';
import { DraftChartGrid } from './panel-ChartGrid';
import { DraftGlobalControlButton } from './ui';
import { SnapshotBar } from './ui';
import { XYScatterChart } from './chart-XYScatter';
import { XYLineChart } from './chart-XYLine';
import { GaugeChart } from './chart-Gauge';
import { BulletChart } from './chart-Bullet';
import { SHAPChart } from './chart-SHAP';
import { SHAPByEquipChart } from './chart-SHAPByEquip';
import { PredActualLineChart } from './chart-PredActualLine';
import { PredActualScatterChart } from './chart-PredActualScatter';
import { SteamPredictionChart } from './chart-SteamPrediction';
import { SPACING_PRESETS } from './hooks/useDraftLayout';
import type { DraftLayoutHook } from './hooks/useDraftLayout';
import type { DraftDragDropHook } from './hooks/useDraftDragDrop';
import type { UseLayoutSnapshotReturn } from './hooks/useLayoutSnapshot';
import type { DraftCardId, DraftLayoutState } from './types-draft';
import { normalizeDraftLayoutState } from './data-snapshotStorage';

interface DraftChartTabProps {
  layout: DraftLayoutHook;
  dragDrop: DraftDragDropHook;
  snap: UseLayoutSnapshotReturn<DraftLayoutState>;
}

export function DraftChartTab({ layout, dragDrop, snap }: DraftChartTabProps) {
  const spacing = SPACING_PRESETS[layout.spacingIdx];

  const draftCards = useMemo<Record<DraftCardId, React.ReactNode>>(() => ({
    'xy-scatter':   <XYScatterChart chartHeight={layout.height} />,
    'xy-line':      <XYLineChart data={BUILT_IN_DATA} chartHeight={layout.height} />,
    'gauge':        <GaugeChart data={BUILT_IN_DATA} chartHeight={layout.height} />,
    'bullet':       <BulletChart data={BUILT_IN_DATA} chartHeight={layout.height} />,
    'shap':         <SHAPChart chartHeight={layout.height} />,
    'shap-equip':   <SHAPByEquipChart chartHeight={layout.height} />,
    'pred-line':    <PredActualLineChart chartHeight={layout.height} />,
    'pred-scatter': <PredActualScatterChart chartHeight={layout.height} />,
    'steam-pred':   <SteamPredictionChart chartHeight={layout.height} />,
  }), [layout.height]);

  return (
    <ChartProviders
      fontIdx={layout.fontIdx}
      profileIdx={layout.profileIdx}
      shapDateIdx={layout.shapDateIdx}
      setShapDateIdx={layout.setShapDateIdx}
      periodDays={layout.periodDays}
      setPeriodDays={layout.setPeriodDays}
    >
      <div className="draft-dashboard-section-header draft-dashboard-section-header--tight draft-dashboard-section-header--draft">
        <div className="draft-header-left">
          <span className="draft-dashboard-section-label">Chart Components</span>
        </div>
        <div className="draft-header-center">
          <div className="draft-toolbar">
            <select className="draft-toolbar-select" value={layout.fontIdx}
              onChange={e => layout.setFontIdx(Number(e.target.value))} title="차트 폰트">
              {CHART_FONT_OPTIONS.map((f, i) => <option key={f.id} value={i}>{f.label}</option>)}
            </select>
            <select className="draft-toolbar-select" value={layout.profileIdx}
              onChange={e => layout.setProfileIdx(Number(e.target.value))} title="색상 프로필">
              {EQ_COLOR_PROFILES.map((_, i) => <option key={i} value={i}>Color # {i + 1}</option>)}
            </select>
            <DraftGlobalControlButton />
            <select className="draft-toolbar-select" value={layout.cols}
              onChange={e => layout.setCols(Number(e.target.value) as 1 | 2 | 3 | 4)}
              title="컬럼 수 조정" aria-label="컬럼 수">
              {([1, 2, 3, 4] as const).map(n => <option key={n} value={n}>{n}열</option>)}
            </select>
            <select className="draft-toolbar-select" value={layout.height}
              onChange={e => layout.setHeight(Number(e.target.value))} title="높이 조정" aria-label="높이">
              {[820, 720, 600, 480, 400, 320].map(n => <option key={n} value={n}>{n}px</option>)}
            </select>
            <select className="draft-toolbar-select" value={layout.spacingIdx}
              onChange={e => layout.setSpacingIdx(Number(e.target.value))} title="여백 조정" aria-label="여백">
              {SPACING_PRESETS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
            </select>
          </div>
        </div>
        <SnapshotBar
          snapshots={snap.snapshots}
          selectedId={snap.selectedId}
          onReset={layout.resetOrder}
          onSave={() => snap.save(layout.getState)}
          onDelete={snap.remove}
          onSelect={id => {
            const state = snap.apply(id, normalizeDraftLayoutState);
            if (state) layout.applyState(state);
          }}
          selectAriaLabel="기능 Draft 저장 상태"
        />
      </div>
      <DraftChartGrid
        cols={layout.cols}
        gap={spacing.gap}
        onDragOver={e => dragDrop.handleDragOver(e, dragDrop.draggingId)}
        onDrop={e => dragDrop.handleDrop(e, dragDrop.draggingId, (dragging, target, pos) =>
          dragDrop.reorder(dragging, target, pos, layout.setCardOrder)
        )}
        onDragLeave={dragDrop.handleDragLeave}
      >
        {layout.cardOrder.map(cardId => (
          <div
            key={cardId}
            data-draft-card-id={cardId}
            className={[
              'draft-card-slot',
              dragDrop.draggingId === cardId ? 'draft-card-slot--dragging' : '',
              dragDrop.dropTarget?.cardId === cardId && dragDrop.draggingId !== cardId
                ? 'draft-card-slot--drop-target' : '',
            ].filter(Boolean).join(' ')}
            onDragStart={() => { dragDrop.setDraggingId(cardId); dragDrop.setDropTarget(null); }}
            onDragEnd={() => { dragDrop.setDraggingId(null); dragDrop.setDropTarget(null); }}
          >
            {dragDrop.dropTarget?.cardId === cardId && dragDrop.dropTarget.position === 'before'
              ? <div className="draft-drop-indicator draft-drop-indicator--before" aria-hidden="true" />
              : null}
            {draftCards[cardId]}
            {dragDrop.dropTarget?.cardId === cardId && dragDrop.dropTarget.position === 'after'
              ? <div className="draft-drop-indicator draft-drop-indicator--after" aria-hidden="true" />
              : null}
          </div>
        ))}
      </DraftChartGrid>
    </ChartProviders>
  );
}
