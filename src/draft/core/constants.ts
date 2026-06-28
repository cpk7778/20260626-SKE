/** 차트 공통 상수 */
// 차트 폰트 프리셋 목록 — FontSelect UI에서 id로 선택
export const CHART_FONT_OPTIONS = [
  { id: 'system', label: 'System', family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'pretendard', label: 'Pretendard', family: "'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: 'noto', label: 'Noto Sans KR', family: "'Noto Sans KR', sans-serif" },
  { id: 'mono', label: 'Monospace', family: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace" },
] as const;

// URL ?popout=xy 로 열렸을 때 팝아웃 버튼을 숨기기 위한 플래그
export const IS_XY_POPOUT =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('popout') === 'xy';

// SVG 플롯 영역 안쪽 여백 — 모든 차트 공통
export const CHART_PAD = { top: 18, right: 20, bottom: 38, left: 38 } as const;
export const XY_PAD = CHART_PAD;
