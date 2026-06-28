/** Draft 모듈 공용 타입 */

export type DraftCardId =
  | 'xy-scatter'
  | 'xy-line'
  | 'gauge'
  | 'bullet'
  | 'shap'
  | 'shap-equip'
  | 'pred-line'
  | 'pred-scatter'
  | 'steam-pred';

export const DRAFT_TABS = ['기능 Draft', 'HEX', 'Fuel-H2', 'CLX 에너지'] as const;
export type DraftTab = typeof DRAFT_TABS[number];

export type DraftDropTarget = { cardId: DraftCardId; position: 'before' | 'after' } | null;

export type SnapshotTab = 'draft' | 'hex' | 'fuelh2';

export type DraftLayoutState = {
  cardOrder: DraftCardId[];
  fontIdx: number;
  profileIdx: number;
  cols: 1 | 2 | 3 | 4;
  height: number;
  spacingIdx: number;
  shapDateIdx: number;
  periodDays: number;
};

export type LayoutSnapshot<T> = {
  id: string;
  createdAt: string;
  label: string;
  state: T;
};
