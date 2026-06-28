/** HEX 탭 레이아웃 타입·프리셋·기본값 — panel-Hex.tsx 로딩 없이 참조 가능 */

export type HexSlotId = 'main' | 'scatter' | 'empty-stack';
export const DEFAULT_HEX_SLOT_ORDER: HexSlotId[] = ['main', 'scatter', 'empty-stack'];

export type HexLayoutState = {
  slotOrder: HexSlotId[];
  hiddenEqs: string[];
  scatterXField: 'q' | 'u' | 'ua' | 'uc';
  scatterYField: 'q' | 'u' | 'ua' | 'uc';
  spacingIdx: number;
  rowHeightIdx: number;
  widthIdx: number;
  heightIdx: number;
  scatterWidthIdx: number;
  scatterHeightIdx: number;
  empty1WidthIdx: number;
  empty1HeightIdx: number;
  empty2WidthIdx: number;
  empty2HeightIdx: number;
  linkedPeriodDays: number;
  linkedControlsVisible: boolean;
  linkedShowLegend: boolean;
};

export const HEX_WIDTH_PRESETS = [
  { label: '전체', value: '100%' },
  { label: '95%', value: '95%' },
  { label: '90%', value: '90%' },
  { label: '85%', value: '85%' },
  { label: '80%', value: '80%' },
  { label: '75%', value: '75%' },
  { label: '70%', value: '70%' },
  { label: '65%', value: '65%' },
  { label: '60%', value: '60%' },
  { label: '55%', value: '55%' },
  { label: '50%', value: '50%' },
  { label: '45%', value: '45%' },
  { label: '40%', value: '40%' },
  { label: '35%', value: '35%' },
  { label: '30%', value: '30%' },
  { label: '25%', value: '25%' },
  { label: '20%', value: '20%' },
  { label: '15%', value: '15%' },
  { label: '10%', value: '10%' },
  { label: '5%', value: '5%' },
] as const;

export const HEX_SPACING_PRESETS = [
  { label: '최대', gap: 24 },
  { label: '넓게', gap: 16 },
  { label: '보통', gap: 12 },
  { label: '좁게', gap: 8 },
  { label: '촘촘', gap: 4 },
] as const;

export const HEX_ROW_HEIGHT_PRESETS = [
  { label: '16', value: 16 },
  { label: '18', value: 18 },
  { label: '20', value: 20 },
  { label: '22', value: 22 },
  { label: '24', value: 24 },
  { label: '26', value: 26 },
  { label: '28', value: 28 },
  { label: '30', value: 30 },
  { label: '32', value: 32 },
  { label: '36', value: 36 },
  { label: '40', value: 40 },
  { label: '44', value: 44 },
  { label: '48', value: 48 },
] as const;

export const HEX_HEIGHT_PRESETS = [
  { label: '자동', value: 'auto' },
  { label: '100%', value: '100%' },
  { label: '95%', value: '95%' },
  { label: '90%', value: '90%' },
  { label: '85%', value: '85%' },
  { label: '80%', value: '80%' },
  { label: '75%', value: '75%' },
  { label: '70%', value: '70%' },
  { label: '65%', value: '65%' },
  { label: '60%', value: '60%' },
  { label: '55%', value: '55%' },
  { label: '50%', value: '50%' },
  { label: '45%', value: '45%' },
  { label: '40%', value: '40%' },
  { label: '35%', value: '35%' },
  { label: '30%', value: '30%' },
  { label: '25%', value: '25%' },
  { label: '20%', value: '20%' },
  { label: '15%', value: '15%' },
  { label: '10%', value: '10%' },
  { label: '5%', value: '5%' },
] as const;

export function defaultSpacingPresetIdx() {
  const i = HEX_SPACING_PRESETS.findIndex(p => p.label === '촘촘');
  return i >= 0 ? i : 4;
}
export function defaultRowHeightPresetIdx() {
  const i = HEX_ROW_HEIGHT_PRESETS.findIndex(p => p.value === 28);
  return i >= 0 ? i : 0;
}
export function defaultWidthPresetIdx() {
  const i = HEX_WIDTH_PRESETS.findIndex(p => p.value === '20%');
  return i >= 0 ? i : 0;
}
export function defaultEmptyWidthPresetIdx() {
  const i = HEX_WIDTH_PRESETS.findIndex(p => p.value === '40%');
  return i >= 0 ? i : defaultWidthPresetIdx();
}
export function defaultScatterWidthPresetIdx() {
  const i = HEX_WIDTH_PRESETS.findIndex(p => p.value === '40%');
  return i >= 0 ? i : 0;
}
export function defaultHeightPresetIdx() {
  const i = HEX_HEIGHT_PRESETS.findIndex(p => p.value === '95%');
  return i >= 0 ? i : 0;
}
export function defaultGridHeightPresetIdx() {
  const i = HEX_HEIGHT_PRESETS.findIndex(p => p.value === '35%');
  return i >= 0 ? i : defaultHeightPresetIdx();
}
export function defaultTrendHeightPresetIdx() {
  const i = HEX_HEIGHT_PRESETS.findIndex(p => p.value === '65%');
  return i >= 0 ? i : defaultHeightPresetIdx();
}

export function createDefaultHexLayoutState(): HexLayoutState {
  return {
    slotOrder: [...DEFAULT_HEX_SLOT_ORDER],
    hiddenEqs: [],
    scatterXField: 'q',
    scatterYField: 'u',
    spacingIdx: defaultSpacingPresetIdx(),
    rowHeightIdx: defaultRowHeightPresetIdx(),
    widthIdx: defaultWidthPresetIdx(),
    heightIdx: defaultHeightPresetIdx(),
    scatterWidthIdx: defaultScatterWidthPresetIdx(),
    scatterHeightIdx: defaultHeightPresetIdx(),
    empty1WidthIdx: defaultEmptyWidthPresetIdx(),
    empty1HeightIdx: defaultTrendHeightPresetIdx(),
    empty2WidthIdx: defaultEmptyWidthPresetIdx(),
    empty2HeightIdx: defaultGridHeightPresetIdx(),
    linkedPeriodDays: 14,
    linkedControlsVisible: true,
    linkedShowLegend: true,
  };
}
