# InvestOps 통합 가이드

Draft Kit에서 작업한 결과를 InvestOps 본 repo에 반영하는 방법입니다.

## 1. 파일 복사

Kit의 `src/draft/` 폴더 전체를 InvestOps `src/draft/`에 덮어씁니다.

```bash
cp -r src/draft/ <investops>/src/draft/
```

**복사하지 않는 것**: `src/main.tsx`, `src/vite-env.d.ts` — kit 전용 진입점입니다.

## 2. InvestOps에서 draft가 쓰이는 위치

| 파일 | 역할 |
|---|---|
| `src/main.tsx` | `?popout=xy` URL이면 `DraftPage`를 lazy-load |
| `src/components/Dashboard.tsx` | Equipment 탭에서 개별 차트 import |

## 3. 의존성 확인

Kit에서 추가된 패키지가 InvestOps `package.json`에 있는지 확인합니다.

```json
"reactflow": "^11.11.4",
"xlsx": "^0.18.5"
```

없으면 추가 후 `npm install`.

## 4. 통합 후 확인

```bash
npm run build
```

브라우저에서 확인:

1. `npm run dev` → Dashboard → Equipment 탭 — 9개 차트
2. `http://localhost:5173/?popout=xy` — Draft 팝업 (기능 Draft / HEX / Fuel-H2 탭)

> InvestOps GitHub Pages 배포 시 Vite `base`는 `/investops/`입니다.

## 5. 폰트

Pretendard는 `index.html` CDN으로 로드됩니다. InvestOps 본 repo도 동일 CDN을 사용 중입니다.  
오프라인 환경이면 폰트 파일을 로컬로 교체하세요.
