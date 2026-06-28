# Draft 화면 설계 문서

## 1. 개요

`src/draft/` 는 InvestOps의 **독립적인 IoT 운영 인텔리전스 분석 모듈**이다.  
9개 SVG 차트, 3개 탭(기능 Draft / HEX / Fuel-H2), 드래그·드롭 재정렬, 스냅샷 저장·복원을 제공한다.  
이 폴더만 다른 프로젝트에 복사해도 바로 동작하도록 설계되어 있다.

---

## 2. 디렉토리 구조

```
src/draft/
├── index.ts                    공개 API 진입점
├── draft.css                   모듈 전체 스타일 (1회만 import)
├── shared.tsx                  ChartProviders + core re-export + Gauge/Bullet 공용 훅·UI
├── page-Draft.tsx              3탭 페이지 (기능Draft / HEX / Fuel-H2) ← 진입점
├── page-ChartTab.tsx           "기능 Draft" 탭 (9개 차트 그리드 + 툴바)
│
├── 차트 컴포넌트 (9종)
│   ├── chart-XYScatter.tsx     XY 산점도 (3D·라소·터치줌)
│   ├── chart-XYLine.tsx        다중 Y축 라인 차트
│   ├── chart-Gauge.tsx         Pac-Man 게이지
│   ├── chart-Bullet.tsx        불릿 게이지
│   ├── chart-SHAP.tsx          SHAP 기여도 폭포 차트
│   ├── chart-SHAPByEquip.tsx   장비별 SHAP 분해
│   ├── chart-PredActualLine.tsx    예측 vs 실측 시계열
│   ├── chart-PredActualScatter.tsx 예측 정확도 산점도
│   └── chart-SteamPrediction.tsx   스팀 예측 + 신뢰구간
│
├── UI 컴포넌트
│   ├── ui.tsx                  DragHandle · GlobalControlButton · SnapshotBar
│   ├── panel-ChartGrid.tsx     CSS Grid 레이아웃 + EquipmentChartsSection
│   ├── panel-Hex.tsx           HEX 탭: CDU 공정도 (lazy)
│   └── panel-Apc.tsx           Fuel-H2 탭: APC 대시보드 (lazy)
│
├── 데이터 & 타입
│   ├── types-draft.ts          DraftCardId · DraftTab · DraftLayoutState
│   ├── types-hex.ts            HexLayoutState · 프리셋
│   ├── data-draft.ts           BUILT_IN_DATA · EQ_COLOR_PROFILES · SHAP_DATES
│   ├── data-hex.ts             HEX 데이터·설정
│   ├── data-apcLayout.ts       APC 레이아웃 구조
│   ├── data-snapshotStorage.ts localStorage 유틸 (정규화)
│   └── data-apcLayoutStorage.ts APC layout 저장/로드
│
├── hooks/
│   ├── useDraftLayout.ts       그리드 레이아웃 상태 (cols/height/spacing/font/color/shap/period/cardOrder)
│   ├── useDraftDragDrop.ts     드래그·드롭·재정렬 로직
│   └── useLayoutSnapshot.ts    제네릭 스냅샷 훅 (save/load/delete)
│
└── core/
    ├── context.tsx             5개 Context 정의
    ├── hooks.ts                useChartControls · useContainerSize · useChartPlayback · useEqVisibility · useChartPeriod · useShapTimeline
    ├── components.tsx          re-export (타임라인·범례·카드)
    ├── componentsCard.tsx      ChartCard · ChartCardControl
    ├── componentsTimeline.tsx  ChartTimeline · PeriodSelect
    ├── componentsLegend.tsx    EqLegend · EqVisibilityToggle
    ├── chartBuilders.ts        SVG 렌더링 함수들
    ├── constants.ts            폰트·마진 프리셋
    ├── math.ts                 스케일 생성·선형회귀
    ├── interaction.ts          마우스/터치 이벤트
    ├── interactionHelpers.ts   상호작용 유틸
    ├── scatterSelection.ts     라소·박스 선택
    └── dataReexports.ts        데이터 타입 재-export
```

---

## 3. 탭 구조

```
DraftPage (page-Draft.tsx)
  ├─ 기능 Draft    ← DraftChartTab (9개 차트 그리드)
  ├─ HEX          ← DraftHexPanel (CDU 공정도, lazy)
  └─ Fuel-H2      ← ApcDashboard (APC 최적화, lazy)
```

- 탭 전환 시 HEX·Fuel-H2 패널은 `React.lazy` + `Suspense`로 청크 분리
- `requestIdleCallback`으로 앱 idle 시 HEX·Apc 청크 백그라운드 preload
- 탭 버튼에 `onMouseEnter` hover prefetch 적용

---

## 4. Context 스택

`ChartProviders` (shared.tsx)가 5개 Context를 중첩 제공한다.

```
ChartFontContext          — 차트 폰트 family (string)
  └─ EqColorContext       — 장비별 색상 팔레트 (Record<string, string>)
       └─ GlobalControlsProvider   — 카드 Control 패널 일괄 열기/닫기
            └─ ShapDateCtx         — SHAP 타임라인 날짜 인덱스 + 기간 필터
                 └─ DraftEqHoverProvider  — Scatter ↔ Line 장비 호버 연동
```

### Context 상세

| Context | 타입 | 역할 |
|---|---|---|
| `ChartFontContext` | `string` | 모든 차트에 폰트 family 주입 |
| `EqColorContext` | `Record<string, string>` | 장비별 hex 색상 팔레트 |
| `GlobalControlsContext` | `GlobalControlsState` | 카드별 Control 패널 일괄 토글; `syncKey` 증가로 변경 전파 |
| `ShapDateCtx` | `{idx, setIdx, periodDays, setPeriodDays}` | Gauge/SHAP/PredActual이 공유하는 날짜·기간 필터 |
| `DraftEqHoverContext` | `{hoveredEq, setHoveredEq}` | Scatter에서 설정 → Line에서 강조; Escape로 해제 |

---

## 5. 타입 정의 (types-draft.ts)

```ts
type DraftCardId =
  | 'xy-scatter' | 'xy-line' | 'gauge' | 'bullet' | 'shap'
  | 'shap-equip' | 'pred-line' | 'pred-scatter' | 'steam-pred';

const DRAFT_TABS = ['기능 Draft', 'HEX', 'Fuel-H2'] as const;
type DraftTab = typeof DRAFT_TABS[number];

type DraftDropTarget = { cardId: DraftCardId; position: 'before' | 'after' } | null;

type DraftLayoutState = {
  cardOrder: DraftCardId[];   // 카드 순서 (드래그로 변경)
  fontIdx:    number;          // 0-3: 폰트 선택
  profileIdx: number;          // 0-3: 색상 팔레트
  cols:       1 | 2 | 3 | 4;  // 열 수
  height:     number;          // 카드 높이 (px)
  spacingIdx: number;          // 0-4: 여백 프리셋
  shapDateIdx: number;         // SHAP 날짜 인덱스
  periodDays:  number;         // 기간 필터 (일)
};

type LayoutSnapshot<T> = {
  id: string;
  createdAt: string;
  label: string;
  state: T;
};
```

---

## 6. Hook 생태계

### 6-1. useDraftLayout (hooks/useDraftLayout.ts)

"기능 Draft" 탭 레이아웃 상태의 단일 진실 소스.

```
상태:
  cols (1|2|3|4)      → setCols() 호출 시 height 자동 조정
  height (number)     → DRAFT_COL_TO_HEIGHT 기본값: {1:720, 2:600, 3:480, 4:400}
  spacingIdx (0-4)    → SPACING_PRESETS: 최대/넓게/보통/좁게/촘촘
  fontIdx (0-3)
  profileIdx (0-3)
  shapDateIdx         → ChartProviders → ShapDateCtx로 흘러 내려감
  periodDays          → 동일
  cardOrder           → 드래그로 재정렬

메서드:
  getState()          → DraftLayoutState 직렬화 (스냅샷 저장용)
  applyState(state)   → DraftLayoutState 복원 (스냅샷 로드용)
  resetOrder()        → cardOrder를 INITIAL_DRAFT_CARD_ORDER로 초기화
```

### 6-2. useDraftDragDrop (hooks/useDraftDragDrop.ts)

카드 드래그·드롭·재정렬 로직.

```
상태:
  draggingId: DraftCardId | null
  dropTarget: DraftDropTarget

메서드:
  handleDragOver(e, draggingId)
  handleDrop(e, draggingId, reorderFn)
  handleDragLeave()
  reorder(dragging, target, position, setCardOrder)
```

### 6-3. useLayoutSnapshot\<T\> (hooks/useLayoutSnapshot.ts)

제네릭 스냅샷 관리 — 3개 탭(draft/hex/fuelh2)이 공통 사용.

```
인터페이스:
  snapshots: LayoutSnapshot<T>[]
  selectedId: string | null
  setSelectedId(id)
  save(getStateFn): 현재 상태 → localStorage 저장
  remove(): 선택된 스냅샷 삭제
  apply(id, normalizeFn): 스냅샷 복원 후 state 반환

localStorage 키:
  'draft-layout-snapshots-v1'
  'hex-layout-snapshots-v1'
  'fuelh2-layout-snapshots-v1'
```

### 6-4. core/hooks.ts — 공유 Hook들

| Hook | 역할 |
|---|---|
| `useChartControls()` | `GlobalControlsContext` 구독; 카드별 Control 패널을 전역 토글과 동기화 |
| `useContainerSize(ref)` | `ResizeObserver`로 SVG viewBox 계산용 실제 크기 추적; 첫 콜백 전 `data-size-pending` 속성 부여 (CSS visibility:hidden) |
| `useChartPlayback(setIdx, maxIdx)` | 타임라인 재생/일시정지 인터벌; maxIdx 도달 시 자동 정지 |
| `useEqVisibility(eqs)` | 클릭=단일선택, Ctrl+클릭=다중토글, `applyScatterSelection`=라소/박스 결과 적용 |
| `useChartPeriod(fullList, ...)` | `periodDays` 변경 시 재생 멈춤 + 인덱스를 새 범위 끝으로 보정 |
| `useShapTimeline<T>(fullList)` | `ShapDateCtx` + `useChartPeriod` + `useChartPlayback` 조합; Gauge/SHAP/PredActual 공통 |

---

## 7. 레이아웃 구조 (기능 Draft 탭)

```
DraftChartTab
  └─ ChartProviders (Context 스택 주입)
       └─ 헤더 툴바 (폰트/색상/열수/높이/여백 select + SnapshotBar)
       └─ DraftChartGrid (CSS Grid, cols × gap)
            └─ layout.cardOrder.map(cardId)
                 └─ div.draft-card-slot [draggable]
                      ├─ div.draft-drop-indicator--before (드롭 위치 표시)
                      ├─ <차트 컴포넌트>
                      └─ div.draft-drop-indicator--after
```

### 열 수별 기본 높이

| cols | height |
|------|--------|
| 1 | 720px |
| 2 | 600px |
| 3 | 480px |
| 4 | 400px |

### 여백 프리셋 (SPACING_PRESETS)

| 이름 | pad | gap |
|------|-----|-----|
| 최대 | 40px 48px | 24 |
| 넓게 | 28px 32px | 16 |
| 보통 | 20px 24px | 12 |
| 좁게 | 12px 16px | 8 |
| 촘촘 | 6px 8px | 4 |

---

## 8. 데이터 흐름

### 공통 데이터 타입

```
XYPoint                         — 기본 시계열 포인트
  date: string (YYYY-MM-DD)
  eq:   string (EQ#1~6)
  x:    number
  y:    number

BUILT_IN_DATA: XYPoint[]        — 2026-01-01~2026-02-28, 6개 장비, 354개 포인트
SHAP_DATES: string[]            — 59개 날짜 배열
EQ_COLOR_PROFILES               — 4개 팔레트 프리셋
```

### 차트별 데이터 소비

| 차트 | 데이터 |
|---|---|
| XYScatter, XYLine, Gauge, Bullet | `BUILT_IN_DATA (XYPoint[])` |
| SHAP, SHAPByEquip | `SHAP_DATES` + 날짜별 `SHAPSnapshot` |
| PredActualLine, PredActualScatter | `PredActualPoint[]` |
| SteamPrediction | `SteamPredPoint[]` |

### Gauge/Bullet 공용 훅 (useGaugeBulletChart)

```
data (XYPoint[])
  → eqs, hiddenEqs, selectEq      (useEqVisibility)
  → timeline (useShapTimeline)
  → eqYValues (현재 날짜 기준 장비별 y값 Map, O(1) 조회)
  → rangeMin/Max, warnVal/alertVal  (슬라이더 상태)
  → warnClamped/alertClamped       (역전 방지 클램핑)
  → isModified                     (초기값과의 차이 감지)
  → resetAll()
```

---

## 9. 차트 간 상호작용

| 상호작용 | 트리거 | 효과 |
|---|---|---|
| 장비 호버 | XYScatter에서 장비 위 마우스 | `DraftEqHoverContext.hoveredEq` 설정 → XYLine에서 해당 장비 강조 |
| 호버 해제 | Escape 키 | `hoveredEq = null` |
| SHAP 날짜 동기 | `ShapDateCtx.idx` 변경 | Gauge, SHAP, PredActual 차트가 동일 날짜로 동기화 |
| 기간 필터 | `ShapDateCtx.periodDays` | 위 차트들의 타임라인 범위 일괄 변경 |
| Control 패널 일괄 토글 | 헤더 버튼 (`DraftGlobalControlButton`) | `GlobalControlsContext.toggleGlobal()` → 모든 카드의 Control 패널 열기/닫기 |
| 라소·박스 선택 | XYScatter에서 드래그 | `applyScatterSelection` → `hiddenEqs` 갱신 |

---

## 10. 스냅샷 저장·복원

```
저장:
  snap.save(layout.getState)
    → getState() → DraftLayoutState
    → localStorage['draft-layout-snapshots-v1'] 배열에 push
    → { id: uuid, createdAt: ISO, label: '저장 1', state: {...} }

복원:
  snap.apply(id, normalizeDraftLayoutState)
    → localStorage에서 해당 id 조회
    → normalizeDraftLayoutState(raw) 로 마이그레이션 방어
    → layout.applyState(state) 호출

삭제:
  snap.remove()
    → selectedId에 해당하는 항목 제거
```

---

## 11. HEX 탭

- `DraftHexPanel` (panel-Hex.tsx): CDU 공정도
- 상태: `HexLayoutState` (useState, 변경 시 `localStorage['hex-layout-default-state-v1']`에 자동 저장)
- 스냅샷: `hexSnap` (`useLayoutSnapshot`)
- 정규화: `normalizeHexLayoutState`

---

## 12. Fuel-H2 탭

- `ApcDashboard` (panel-Apc.tsx): APC 최적화 대시보드
- 상태: `ApcLayout` (localStorage에 직접 저장/로드)
- 스냅샷: `fuelSnap` (`useLayoutSnapshot<ApcLayout>`)
- 내보내기/가져오기: JSON 파일 (layout + cards 포함)
- `fuelKey` state로 `key` prop을 바꾸어 ApcDashboard 강제 재마운트

---

## 13. 외부 사용 패턴

```tsx
// 패턴 A: 전체 Draft 페이지
import DraftPage from './draft/page-Draft';
<DraftPage />

// 패턴 B: Dashboard에 차트 그리드만 삽입
import { EquipmentChartsSection } from './draft/panel-ChartGrid';
<EquipmentChartsSection chartHeight={480} cols={2} />

// 패턴 C: 개별 차트 선택
import { ChartProviders, XYScatterChart, GaugeChart } from './draft/index';
<ChartProviders
  fontIdx={0} profileIdx={0}
  shapDateIdx={idx} setShapDateIdx={setIdx}
  periodDays={14} setPeriodDays={setPeriod}
>
  <XYScatterChart chartHeight={480} />
  <GaugeChart data={data} chartHeight={480} />
</ChartProviders>
```

---

## 14. CSS 규칙

- `draft.css`는 페이지 진입점(`page-Draft.tsx` 또는 `Dashboard.tsx`)에서 **1회만** import
- 클래스명은 `draft-` 접두사로 모듈 네임스페이스 격리
- `data-size-pending` 속성: `useContainerSize`의 첫 ResizeObserver 콜백 전까지 `visibility: hidden`으로 레이아웃 점프 방지
