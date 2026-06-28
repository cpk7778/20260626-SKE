/** 레이아웃 스냅샷 localStorage 유틸 + 정규화 함수 */
import { createDefaultHexLayoutState, type HexLayoutState, type HexSlotId } from './types-hex';
import { SHAP_DATE_IDX_DEFAULT } from './data-draft';
import type { DraftCardId, DraftLayoutState, LayoutSnapshot } from './types-draft';

// ── Generic storage ──────────────────────────────────────────────────────────

export function formatSnapshotLabel(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function loadSnapshots<T>(key: string): LayoutSnapshot<T>[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LayoutSnapshot<T>[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnapshots<T>(key: string, snapshots: LayoutSnapshot<T>[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(snapshots));
  } catch {
    /* ignore quota */
  }
}

// ── Normalizers ──────────────────────────────────────────────────────────────

const DRAFT_COL_TO_HEIGHT: Record<1 | 2 | 3 | 4, number> = { 1: 720, 2: 600, 3: 480, 4: 400 };

export function normalizeDraftLayoutState(value: unknown): DraftLayoutState | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    return {
      cardOrder: value.filter(v => typeof v === 'string') as DraftCardId[],
      fontIdx: 0,
      profileIdx: 0,
      cols: 4,
      height: DRAFT_COL_TO_HEIGHT[4],
      spacingIdx: 2,
      shapDateIdx: SHAP_DATE_IDX_DEFAULT,
      periodDays: 14,
    };
  }
  if (typeof value !== 'object') return null;
  const raw = value as Partial<DraftLayoutState>;
  if (!Array.isArray(raw.cardOrder)) return null;
  const cols = raw.cols === 1 || raw.cols === 2 || raw.cols === 3 || raw.cols === 4 ? raw.cols : 4;
  return {
    cardOrder: raw.cardOrder.filter(v => typeof v === 'string') as DraftCardId[],
    fontIdx: typeof raw.fontIdx === 'number' ? raw.fontIdx : 0,
    profileIdx: typeof raw.profileIdx === 'number' ? raw.profileIdx : 0,
    cols,
    height: typeof raw.height === 'number' ? raw.height : DRAFT_COL_TO_HEIGHT[cols],
    spacingIdx: typeof raw.spacingIdx === 'number' ? raw.spacingIdx : 2,
    shapDateIdx: typeof raw.shapDateIdx === 'number' ? raw.shapDateIdx : SHAP_DATE_IDX_DEFAULT,
    periodDays: typeof raw.periodDays === 'number' ? raw.periodDays : 14,
  };
}

export function normalizeHexLayoutState(value: unknown): HexLayoutState | null {
  if (!value) return null;
  const base = createDefaultHexLayoutState();
  if (Array.isArray(value)) {
    return { ...base, slotOrder: value.filter(v => typeof v === 'string') as HexSlotId[] };
  }
  if (typeof value !== 'object') return null;
  const raw = value as Partial<HexLayoutState>;
  if (!Array.isArray(raw.slotOrder)) return null;
  const scatterXField =
    raw.scatterXField === 'q' || raw.scatterXField === 'u' || raw.scatterXField === 'ua' || raw.scatterXField === 'uc'
      ? raw.scatterXField : base.scatterXField;
  const scatterYField =
    raw.scatterYField === 'q' || raw.scatterYField === 'u' || raw.scatterYField === 'ua' || raw.scatterYField === 'uc'
      ? raw.scatterYField : base.scatterYField;
  return {
    ...base,
    slotOrder: raw.slotOrder.filter(v => typeof v === 'string') as HexSlotId[],
    hiddenEqs: Array.isArray(raw.hiddenEqs) ? raw.hiddenEqs.filter(v => typeof v === 'string') : base.hiddenEqs,
    scatterXField,
    scatterYField,
    spacingIdx: typeof raw.spacingIdx === 'number' ? raw.spacingIdx : base.spacingIdx,
    rowHeightIdx: typeof raw.rowHeightIdx === 'number' ? raw.rowHeightIdx : base.rowHeightIdx,
    widthIdx: typeof raw.widthIdx === 'number' ? raw.widthIdx : base.widthIdx,
    heightIdx: typeof raw.heightIdx === 'number' ? raw.heightIdx : base.heightIdx,
    scatterWidthIdx: typeof raw.scatterWidthIdx === 'number' ? raw.scatterWidthIdx : base.scatterWidthIdx,
    scatterHeightIdx: typeof raw.scatterHeightIdx === 'number' ? raw.scatterHeightIdx : base.scatterHeightIdx,
    empty1WidthIdx: typeof raw.empty1WidthIdx === 'number' ? raw.empty1WidthIdx : base.empty1WidthIdx,
    empty1HeightIdx: typeof raw.empty1HeightIdx === 'number' ? raw.empty1HeightIdx : base.empty1HeightIdx,
    empty2WidthIdx: typeof raw.empty2WidthIdx === 'number' ? raw.empty2WidthIdx : base.empty2WidthIdx,
    empty2HeightIdx: typeof raw.empty2HeightIdx === 'number' ? raw.empty2HeightIdx : base.empty2HeightIdx,
    linkedPeriodDays: typeof raw.linkedPeriodDays === 'number' ? raw.linkedPeriodDays : base.linkedPeriodDays,
    linkedControlsVisible: typeof raw.linkedControlsVisible === 'boolean' ? raw.linkedControlsVisible : base.linkedControlsVisible,
    linkedShowLegend: typeof raw.linkedShowLegend === 'boolean' ? raw.linkedShowLegend : base.linkedShowLegend,
  };
}

export function loadHexDefaultState(key: string): HexLayoutState {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return createDefaultHexLayoutState();
    return normalizeHexLayoutState(JSON.parse(raw) as unknown) ?? createDefaultHexLayoutState();
  } catch {
    return createDefaultHexLayoutState();
  }
}

// ── Drag-drop ────────────────────────────────────────────────────────────────

export function resolveDraftDropTarget<T extends string>(
  clientX: number,
  clientY: number,
  gridEl: HTMLElement,
  draggingId: T,
): { cardId: T; position: 'before' | 'after' } | null {
  const slotEls = [...gridEl.querySelectorAll<HTMLElement>('[data-draft-card-id]')];
  let best: { id: T; rect: DOMRect; distance: number } | null = null;
  for (const el of slotEls) {
    const id = el.dataset.draftCardId as T | undefined;
    if (!id || id === draggingId) continue;
    const rect = el.getBoundingClientRect();
    const dx = clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    const dy = clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { id, rect, distance };
  }
  if (!best) return null;
  const midX = best.rect.left + best.rect.width / 2;
  return { cardId: best.id, position: clientX < midX ? 'before' : 'after' };
}
