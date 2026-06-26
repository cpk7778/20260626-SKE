import React from 'react';
import { IS_XY_POPOUT } from './constants';
import { DraftDragHandle } from '../ui';

// 차트 카드 래퍼 — 타이틀 바에 Control 토글·리셋·팝아웃 버튼을 일관되게 배치
export interface ChartCardProps {
  title: React.ReactNode;
  chartHeight?: number;
  titleClassName?: string;
  centerLabel?: React.ReactNode;
  controlsVisible: boolean;
  toggleControls: () => void;
  onReset?: () => void;
  resetDimmed?: boolean;
  showPopout?: boolean;
  extraActions?: React.ReactNode;
  titleSelects?: React.ReactNode;
  children: React.ReactNode;
}

export function ChartCard({
  title, chartHeight, titleClassName, centerLabel,
  controlsVisible, toggleControls, onReset, resetDimmed, showPopout, extraActions, titleSelects, children,
}: ChartCardProps) {
  return (
    <div
      className={`draft-chart-card draft-ekpi-card${chartHeight ? ' draft-chart-card--h' : ''}`}
      style={chartHeight ? { height: chartHeight } : undefined}
    >
      <div className={`draft-ekpi-card-title${titleClassName ? ` ${titleClassName}` : ''}`}>
        <DraftDragHandle />
        <span>{title}</span>
        {centerLabel}
        {titleSelects ? <div className="draft-card-title-selects">{titleSelects}</div> : null}
        <div className="draft-card-actions">
          {extraActions}
          <button type="button"
            className={`draft-chip-btn${controlsVisible ? ' draft-chip-btn--active' : ''}`}
            onClick={toggleControls} title="제어 영역 표시">Control</button>
          {onReset && (
            <button type="button"
              className={`draft-chip-btn${resetDimmed ? ' draft-chip-btn--dim' : ''}`}
              onClick={onReset} title="초기화">↺</button>
          )}
          {showPopout && !IS_XY_POPOUT && (
            <button type="button" className="draft-chip-btn" title="새 창에서 열기"
              onClick={() => window.open('?popout=xy', '_blank')}>
              ⧉
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
