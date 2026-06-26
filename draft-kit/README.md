# InvestOps Draft Charts Kit

InvestOps `src/draft/` 모듈을 **독립 실행**할 수 있는 미니 프로젝트입니다.  
ZIP으로 전달받은 뒤 바로 `npm install && npm run dev`로 3개 탭 전체를 확인·수정할 수 있습니다.

## 요구 사항

- Node.js **20+**
- npm

## 실행

```bash
npm install
npm run dev
```

브라우저에서 <http://localhost:5173> 을 엽니다.

프로덕션 빌드 확인:

```bash
npm run build
npm run preview
```

## 화면 구성

| 탭 | 내용 |
| --- | --- |
| **기능 Draft** | XY Scatter, XY Line, Gauge, Bullet, SHAP, SHAP(설비별), Pred/Actual Line·Scatter, Steam Prediction — 9개 차트 그리드 |
| **HEX** | CDU 열교환기 패널 (Q·U·UC 스파크라인, 산점도, 트렌드) |
| **Fuel-H2** | Fuel / H₂ Optimizer 대시보드 (공정 흐름도, KPI, CV/MV 제어, 드래그앤드롭 레이아웃) |

## 파일 구조

```text
src/
└── draft/
    ├── DraftPage.tsx
    ├── README-DESIGN.md
    ├── README-src.md
    ├── chart-Bullet.tsx
    ├── chart-Gauge.tsx
    ├── chart-PredActualLine.tsx
    ├── chart-PredActualScatter.tsx
    ├── chart-SHAP.tsx
    ├── chart-SHAPByEquip.tsx
    ├── chart-SteamPrediction.tsx
    ├── chart-XYLine.tsx
    ├── chart-XYScatter.tsx
    ├── data-apcLayout.ts                ← Fuel-H2 레이아웃 구조
    ├── data-apcLayoutStorage.ts         ← APC 레이아웃 localStorage 유틸
    ├── data-draft.ts                    ← 샘플 데이터
    ├── data-hex.ts                      ← HEX 샘플 데이터
    ├── data-snapshotStorage.ts          ← localStorage 유틸 + 정규화 함수
    ├── draft.css                        ← 전체 스타일
    ├── index.ts
    ├── page-ChartTab.tsx                ← 기능Draft 탭
    ├── page-Draft.tsx                   ← 탭 진입점 (기능Draft / HEX / Fuel-H2)
    ├── panel-Apc.tsx                    ← Fuel-H2 탭
    ├── panel-ChartGrid.tsx              ← CSS Grid 레이아웃 + EquipmentChartsSection
    ├── panel-Hex.tsx                    ← HEX 탭
    ├── shared.tsx                       ← ChartProviders + 공용 훅·UI
    ├── types-draft.ts                   ← UI 상태 타입
    ├── types-hex.ts                     ← HEX 레이아웃 타입
    ├── ui.tsx                           ← DragHandle · GlobalControlButton · SnapshotBar
    ├── core/                            ← 공통 컴포넌트·컨텍스트·훅
    └── hooks/                           ← 레이아웃·스냅샷 훅
```

| 수정 목적 | 주로 볼 파일 |
| --- | --- |
| 샘플 데이터 교체 | `draft/data-draft.ts`, `draft/data-hex.ts` |
| 기능Draft 차트 | `draft/page-ChartTab.tsx`, `draft/chart-XYScatter.tsx` 등 |
| HEX 탭 | `draft/panel-Hex.tsx` |
| Fuel-H2 탭 | `draft/panel-Apc.tsx`, `draft/data-apcLayout.ts` |
| 공통 스타일 | `draft/draft.css` |

## 기술 스택

- React 19
- TypeScript
- Vite 7
- ReactFlow 11 (Fuel-H2 공정 흐름도)
- ExcelJS (HEX 데이터 다운로드)
- SVG 직접 렌더링 (D3/Recharts 등 외부 차트 라이브러리 없음)

## 데이터 교체

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
<PredActualLineChart chartHeight={400} data={myPredActualData} eqpNames={['EQ-A', 'EQ-B']} />
<SteamPredictionChart chartHeight={400} data={mySteamData} />
<XYScatterChart chartHeight={400} data={myXYData} />
```

---

## InvestOps 본 repo에 반영

작업이 끝나면 `src/draft/` 폴더 전체를 InvestOps `src/draft/`에 **덮어쓰기**합니다.

자세한 통합 절차는 [INTEGRATION.md](./INTEGRATION.md)를 참고하세요.

## InvestOps 쪽에서 ZIP 생성 (전달 전)

본 repo 루트에서 목적에 맞는 스크립트를 선택합니다.

### 독립 실행용 (kit 전체)

```bash
node scripts/pack-draft-kit.mjs
```

`investops-draft-kit.zip` 생성 — 실행 환경 포함 완성 프로젝트.  
받는 쪽: **압축 해제 → `npm install` → `npm run dev`**

### 기존 프로젝트 병합용 (소스만)

```bash
node scripts/pack-draft-src.mjs
```

`investops-draft-src.zip` 생성 — `src/draft/` 소스 코드만 포함.  
받는 쪽: **`draft/` 폴더를 기존 프로젝트 `src/draft/`에 덮어쓰기 → 아래 패키지 확인 → `npm install`**

병합 시 `package.json`에 누락된 패키지 추가:

```json
"reactflow": "^11.11.4",
"exceljs": "^4.4.0"
```

| 상황 | 스크립트 | 결과물 |
| --- | --- | --- |
| 바로 실행해서 확인·수정 | `pack-draft-kit.mjs` | `investops-draft-kit.zip` |
| 기존 프로젝트에 병합 | `pack-draft-src.mjs` | `investops-draft-src.zip` |

---

원본 프로젝트: [InvestOps](https://github.com/cpk7778/investops)
