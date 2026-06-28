/** draft 공통 UI — DragHandle · GlobalControlButton · SnapshotBar */
import React, { useContext } from 'react';
import { GlobalControlsContext } from './core/context';
import type { LayoutSnapshot } from './types-draft';

// ── DragHandle ────────────────────────────────────────────────────────────────
interface DraftDragHandleProps {
  className?: string;
  title?: string;
  ariaLabel?: string;
  draggable?: boolean;
  onDragStart?: React.DragEventHandler<HTMLElement>;
  onDragEnd?: React.DragEventHandler<HTMLElement>;
}

export function DraftDragHandle({
  className,
  title = '드래그 핸들',
  ariaLabel = '드래그 핸들',
  draggable = true,
  onDragStart,
  onDragEnd,
}: DraftDragHandleProps) {
  const handleDragStart: React.DragEventHandler<HTMLElement> = e => {
    const source =
      (e.currentTarget.closest('[data-draft-card-id]') as HTMLElement | null)
      ?? (e.currentTarget.closest('[data-hex-card-id]') as HTMLElement | null)
      ?? (e.currentTarget.closest('[data-apc-card-id]') as HTMLElement | null)
      ?? (e.currentTarget.closest('[data-card-id]') as HTMLElement | null);
    const id =
      source?.dataset.draftCardId
      ?? source?.dataset.hexCardId
      ?? source?.dataset.apcCardId
      ?? source?.dataset.cardId;
    if (id) {
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    }
    onDragStart?.(e);
  };

  return (
    <span
      role="button"
      tabIndex={0}
      className={['draft-drag-handle', className ?? ''].filter(Boolean).join(' ')}
      draggable={draggable}
      title={title}
      aria-label={ariaLabel}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
      }}
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
    >
      <svg className="draft-drag-grip-svg" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
        <circle cx="2.5" cy="2.5" r="1.35" />
        <circle cx="7.5" cy="2.5" r="1.35" />
        <circle cx="2.5" cy="7" r="1.35" />
        <circle cx="7.5" cy="7" r="1.35" />
        <circle cx="2.5" cy="11.5" r="1.35" />
        <circle cx="7.5" cy="11.5" r="1.35" />
      </svg>
    </span>
  );
}

// ── GlobalControlButton ───────────────────────────────────────────────────────
export function DraftGlobalControlButton() {
  const { toggleGlobal, allOpen } = useContext(GlobalControlsContext);
  return (
    <button
      className={`draft-chip-btn${allOpen ? ' draft-chip-btn--active' : ''}`}
      onClick={toggleGlobal}
      title="전체 제어 영역 열기/닫기"
    >Control</button>
  );
}

// ── SnapshotBar ───────────────────────────────────────────────────────────────
export interface SnapshotBarProps<T> {
  snapshots: LayoutSnapshot<T>[];
  selectedId: string;
  onSave: () => void;
  onDelete: () => void;
  onReset: () => void;
  onSelect: (id: string) => void;
  selectAriaLabel?: string;
}

export function SnapshotBar<T>({
  snapshots,
  selectedId,
  onSave,
  onDelete,
  onReset,
  onSelect,
  selectAriaLabel,
}: SnapshotBarProps<T>) {
  return (
    <div className="draft-layout-manager">
      <button type="button" className="draft-chip-btn" onClick={onReset}>Reset</button>
      <button type="button" className="draft-chip-btn" onClick={onSave}>Save</button>
      <button
        type="button"
        className={`draft-chip-btn${selectedId ? '' : ' draft-chip-btn--dim'}`}
        onClick={onDelete}
        disabled={!selectedId}
      >
        Delete
      </button>
      <select
        className="draft-toolbar-select draft-layout-select"
        value={selectedId}
        onChange={e => onSelect(e.target.value)}
        aria-label={selectAriaLabel}
      >
        <option value="">저장 상태 선택</option>
        {snapshots.map(s => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
    </div>
  );
}
