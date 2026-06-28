// 마우스/휠 좌표가 SVG 플롯 영역 안에 있는지 확인 — 플롯 밖 스크롤은 줌 무시
export function wheelHitSvgPlot(
  e: WheelEvent, svg: SVGSVGElement,
  plotLeft: number, plotTop: number, plotW: number, plotH: number, svgW: number, svgH: number,
): boolean {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const mx = ((e.clientX - rect.left) / rect.width) * svgW;
  const my = ((e.clientY - rect.top) / rect.height) * svgH;
  return mx >= plotLeft && mx <= plotLeft + plotW && my >= plotTop && my <= plotTop + plotH;
}

// 클라이언트 좌표를 SVG 좌표계로 변환해 hit 여부와 함께 반환
export function hitSvgPlotFromClient(
  clientX: number, clientY: number, svg: SVGSVGElement,
  plotLeft: number, plotTop: number, plotW: number, plotH: number, svgW: number, svgH: number,
): { mx: number; my: number; hit: boolean } {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return { mx: 0, my: 0, hit: false };
  const mx = ((clientX - rect.left) / rect.width) * svgW;
  const my = ((clientY - rect.top) / rect.height) * svgH;
  return {
    mx, my,
    hit: mx >= plotLeft && mx <= plotLeft + plotW && my >= plotTop && my <= plotTop + plotH,
  };
}

// 터치 두 손가락 거리 — 핀치줌 배율 계산용
export function touchPairDist(a: Touch, b: Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// 터치 두 손가락 중점 — 핀치줌 기준점 계산용
export function touchPairMid(a: Touch, b: Touch) {
  return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
}

// 마우스 위치 비율을 고정점으로 X축 가시 구간을 줌; 전체 범위에 도달하면 null 반환
export function applyXViewZoom(
  fracAtMouse: number, visStart: number, visEnd: number, factor: number, datesLen: number,
): { start: number; end: number } | null {
  const curRange = visEnd - visStart;
  const newRange = Math.max(Math.min(curRange * factor, 1), 2 / Math.max(datesLen - 1, 1));
  let ns = fracAtMouse - (fracAtMouse - visStart) / curRange * newRange;
  let ne = ns + newRange;
  if (ns < 0) { ne -= ns; ns = 0; }
  if (ne > 1) { ns -= (ne - 1); ne = 1; }
  ns = Math.max(0, ns);
  ne = Math.min(1, ne);
  return ne - ns >= 1 - 1e-9 ? null : { start: ns, end: ne };
}
