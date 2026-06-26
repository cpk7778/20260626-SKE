# Draft 차트 모듈

산업 IoT 운영 인텔리전스용 분석 차트 9종과 공정 시각화 2종(HEX·APC)을 제공하는 독립 React 모듈입니다.

## 의존성

```
react          ^19
xlsx           (HEX 탭 엑셀 내보내기)
```

이 폴더 외부에 의존하는 코드가 없습니다. `src/draft/` 폴더만 복사하면 동작합니다.

---

## 디렉터리 구조

```
draft/
├── README.md                      ← 이 파일
├── README-DESIGN.md               ← 상세 설계 문서
├── draft.css                      ← 전체 스타일 (앱에서 1회 임포트)
│
├── index.ts                       ← 공개 API 진입점 (여기서만 임포트)
├── shared.tsx                     ← ChartProviders + core re-export + Gauge/Bullet 공용 훅·UI
│
├── page-Draft.tsx                 ← 전체 페이지 컴포넌트 (3탭)
├── page-ChartTab.tsx              ← "기능 Draft" 탭 (9개 차트 그리드 + 툴바)
├── ui.tsx                         ← DragHandle · GlobalControlButton · SnapshotBar
├── panel-ChartGrid.tsx            ← CSS Grid 레이아웃 + EquipmentChartsSection
├── panel-Hex.tsx                  ← HEX 탭: CDU 공정도 (lazy)
├── panel-Apc.tsx                  ← Fuel-H2 탭: APC 대시보드 (lazy)
│
├── types-draft.ts                 ← UI 상태 타입 (DraftLayoutState 등)
├── types-hex.ts                   ← HexLayoutState · 프리셋
├── data-draft.ts                  ← 샘플 데이터 + 공유 타입 (XYPoint 등)
├── data-hex.ts                    ← HEX 공정 데이터·설정
├── data-apcLayout.ts              ← APC 레이아웃 구조
├── data-snapshotStorage.ts        ← localStorage 유틸 + 정규화 함수
├── data-apcLayoutStorage.ts       ← APC 레이아웃 localStorage 유틸
│
├── hooks/
│   ├── useDraftLayout.ts          ← 차트 그리드 레이아웃 상태 훅
│   ├── useDraftDragDrop.ts        ← 카드 드래그&드롭 훅
│   └── useLayoutSnapshot.ts      ← 레이아웃 스냅샷 제네릭 훅
│
├── core/                          ← 차트 공통 인프라 (직접 임포트 불필요)
│   ├── context.tsx                ← ChartFontContext · EqColorContext · GlobalControlsContext 등
│   ├── hooks.ts                   ← useChartControls · useContainerSize · useShapTimeline 등
│   ├── math.ts                    ← 스케일 생성, 선형 회귀
│   ├── interaction.ts             ← 마우스/터치 이벤트 핸들러
│   ├── interactionHelpers.ts      ← 상호작용 유틸
│   ├── scatterSelection.ts        ← 라소·박스 선택
│   ├── components.tsx             ← re-export (타임라인·범례·카드)
│   ├── componentsCard.tsx         ← ChartCard · ChartCardControl
│   ├── componentsTimeline.tsx     ← ChartTimeline · PeriodSelect
│   ├── componentsLegend.tsx       ← EqLegend · EqVisibilityToggle
│   ├── chartBuilders.ts           ← SVG 렌더링 함수
│   ├── constants.ts               ← 폰트 프리셋, 여백 상수
│   └── dataReexports.ts           ← 데이터 타입 재-export
│
├── chart-XYScatter.tsx            ← XY 산점도 (3D·라소 선택·터치 줌)
├── chart-XYLine.tsx               ← 다중 Y축 라인 차트
├── chart-Gauge.tsx                ← Pac-Man 게이지
├── chart-Bullet.tsx               ← 불릿 게이지
├── chart-SHAP.tsx                 ← SHAP 기여도 폭포 차트
├── chart-SHAPByEquip.tsx          ← 장비별 SHAP 분해
├── chart-PredActualLine.tsx       ← 예측 vs 실측 시계열
├── chart-PredActualScatter.tsx    ← 예측 정확도 산점도
└── chart-SteamPrediction.tsx      ← 스팀 예측 + 신뢰구간
```

---

## 통합 패턴

### 패턴 A — 전체 Draft 페이지 마운트

3개 탭(기능 Draft · HEX · Fuel-H2)이 포함된 독립 페이지입니다.

```tsx
import './draft/draft.css';
import DraftPage from './draft/page-Draft';

// React Router v6 예시
<Route path="/draft" element={<DraftPage />} />
```

### 패턴 B — 대시보드에 차트 섹션 삽입

9개 차트를 그리드 형태로 한 번에 삽입합니다.

```tsx
import './draft/draft.css';
import { EquipmentChartsSection } from './draft/panel-ChartGrid';

// chartHeight: 차트 높이(px), 기본값 480
// cols: 열 수 1~4, 기본값 2
<EquipmentChartsSection chartHeight={400} cols={2} />
```

### 패턴 C — 개별 차트 선택 사용

필요한 차트만 골라서 쓸 때는 `ChartProviders`로 감싸야 합니다.

```tsx
import './draft/draft.css';
import { ChartProviders, XYScatterChart, GaugeChart } from './draft/index';
import { useState } from 'react';

function MyDashboard() {
  const [shapDateIdx, setShapDateIdx] = useState(0);
  const [periodDays, setPeriodDays] = useState(14);

  return (
    <ChartProviders
      fontIdx={0}           // 0=System  1=Pretendard  2=NotoSansKR  3=Monospace
      profileIdx={0}        // 0~3: 장비 색상 팔레트
      shapDateIdx={shapDateIdx}
      setShapDateIdx={setShapDateIdx}
      periodDays={periodDays}
      setPeriodDays={setPeriodDays}
    >
      <XYScatterChart chartHeight={480} />
      <GaugeChart data={myData} chartHeight={480} />
    </ChartProviders>
  );
}
```

---

## 데이터 교체

### 차트별 데이터 주입 방법

각 차트는 data prop이 없으면 내장 샘플 데이터로 동작하고, data prop을 넘기면 실제 데이터로 교체됩니다.

| 차트 | 주입 prop (모두 optional) | 내장 폴백 |
| --- | --- | --- |
| `XYScatterChart` | `data: XYPoint[]` | `BUILT_IN_DATA` |
| `XYLineChart` | `data: XYPoint[]` | 없음 (필수) |
| `GaugeChart` | `data: XYPoint[]` | 없음 (필수) |
| `BulletChart` | `data: XYPoint[]` | 없음 (필수) |
| `SHAPChart` | `shapHistory`, `eqpShapHistory`, `eqpNames` | `SHAP_HISTORY`, `EQP_SHAP_HISTORY`, `EQP_NAMES` |
| `SHAPByEquipChart` | `shapHistory`, `eqpShapHistory`, `eqpNames` | 동일 |
| `PredActualLineChart` | `data`, `history`, `eqpNames` | `PRED_ACTUAL_DATA`, `SHAP_HISTORY`, `EQP_NAMES` |
| `PredActualScatterChart` | `data`, `history`, `eqpNames` | 동일 |
| `SteamPredictionChart` | `data: SteamPredPoint[]` | `STEAM_PRED_DATA` |

### 공통 타입

```ts
// XYScatter·XYLine·Gauge·Bullet 공통
interface XYPoint {
  date: string;  // 'YYYY-MM-DD'
  eq:   string;  // 장비명 (예: 'EQ#1')
  x:    number;
  y:    number;
}

// SHAP·PredActual 공통
interface SHAPSnapshot {
  date:  string;
  base:  number;
  items: SHAPItem[];
}

// PredActual
interface PredActualPoint {
  date:   string;
  eq:     string;
  actual: number;
  pred:   number;
}

// SteamPrediction
interface SteamPredPoint {
  date:   string;
  actual: number;
  pred:   number;
  mae:    number;
  rmse:   number;
}
```

### 사용 예시

```tsx
// 샘플 데이터로 그냥 쓸 때 (prop 생략)
<SHAPChart chartHeight={400} />

// 실제 데이터 주입 (파일 수정 없이)
<SHAPChart
  chartHeight={400}
  shapHistory={myShapHistory}
  eqpShapHistory={myEqpShapHistory}
  eqpNames={['EQ-A', 'EQ-B', 'EQ-C']}
/>

<PredActualLineChart
  chartHeight={400}
  data={myPredActualData}
  eqpNames={['EQ-A', 'EQ-B']}
/>

<SteamPredictionChart chartHeight={400} data={mySteamData} />
<XYScatterChart chartHeight={400} data={myXYData} />
```

---

## CSS 임포트 주의사항

- `draft.css`는 앱 전체에서 **한 번만** 임포트합니다.
- Vite · webpack · Next.js 모두 지원합니다.
