/** "기능 Draft" 탭 레이아웃 상태 — cols/height/spacing/font/color/shap/period/cardOrder */
import { useCallback, useState } from 'react';
import { SHAP_DATE_IDX_DEFAULT } from '../data-draft';
import type { DraftCardId, DraftLayoutState } from '../types-draft';

export const DRAFT_COL_TO_HEIGHT: Record<1 | 2 | 3 | 4, number> = { 1: 720, 2: 600, 3: 480, 4: 400 };

export const SPACING_PRESETS = [
  { label: '최대', pad: '40px 48px', gap: 24 },
  { label: '넓게', pad: '28px 32px', gap: 16 },
  { label: '보통', pad: '20px 24px', gap: 12 },
  { label: '좁게', pad: '12px 16px', gap: 8 },
  { label: '촘촘', pad: '6px 8px',   gap: 4 },
];

export const INITIAL_DRAFT_CARD_ORDER: DraftCardId[] = [
  'xy-scatter', 'xy-line', 'gauge', 'bullet', 'shap',
  'shap-equip', 'pred-line', 'pred-scatter', 'steam-pred',
];

export interface DraftLayoutHook {
  cols: 1 | 2 | 3 | 4;
  setCols: (n: 1 | 2 | 3 | 4) => void;
  height: number;
  setHeight: (h: number) => void;
  spacingIdx: number;
  setSpacingIdx: (i: number) => void;
  fontIdx: number;
  setFontIdx: (i: number) => void;
  profileIdx: number;
  setProfileIdx: (i: number) => void;
  shapDateIdx: number;
  setShapDateIdx: React.Dispatch<React.SetStateAction<number>>;
  periodDays: number;
  setPeriodDays: React.Dispatch<React.SetStateAction<number>>;
  cardOrder: DraftCardId[];
  setCardOrder: React.Dispatch<React.SetStateAction<DraftCardId[]>>;
  getState: () => DraftLayoutState;
  applyState: (state: DraftLayoutState) => void;
  resetOrder: () => void;
}

export function useDraftLayout(): DraftLayoutHook {
  const [cols, setColsRaw] = useState<1 | 2 | 3 | 4>(4);
  const [height, setHeight] = useState(DRAFT_COL_TO_HEIGHT[4]);
  const [spacingIdx, setSpacingIdx] = useState(2);
  const [fontIdx, setFontIdx] = useState(0);
  const [profileIdx, setProfileIdx] = useState(0);
  const [shapDateIdx, setShapDateIdx] = useState(SHAP_DATE_IDX_DEFAULT);
  const [periodDays, setPeriodDays] = useState(14);
  const [cardOrder, setCardOrder] = useState<DraftCardId[]>(INITIAL_DRAFT_CARD_ORDER);

  const setCols = useCallback((n: 1 | 2 | 3 | 4) => {
    setColsRaw(n);
    setHeight(DRAFT_COL_TO_HEIGHT[n]);
  }, []);

  const getState = useCallback((): DraftLayoutState => {
    return { cardOrder: [...cardOrder], fontIdx, profileIdx, cols, height, spacingIdx, shapDateIdx, periodDays };
  }, [cardOrder, fontIdx, profileIdx, cols, height, spacingIdx, shapDateIdx, periodDays]);

  const applyState = useCallback((state: DraftLayoutState) => {
    setCardOrder(state.cardOrder);
    setFontIdx(state.fontIdx);
    setProfileIdx(state.profileIdx);
    setColsRaw(state.cols);
    setHeight(state.height);
    setSpacingIdx(state.spacingIdx);
    setShapDateIdx(state.shapDateIdx);
    setPeriodDays(state.periodDays);
  }, []);

  const resetOrder = useCallback(() => {
    setCardOrder(INITIAL_DRAFT_CARD_ORDER);
  }, []);

  return {
    cols, setCols, height, setHeight,
    spacingIdx, setSpacingIdx,
    fontIdx, setFontIdx,
    profileIdx, setProfileIdx,
    shapDateIdx, setShapDateIdx,
    periodDays, setPeriodDays,
    cardOrder, setCardOrder,
    getState, applyState, resetOrder,
  };
}
