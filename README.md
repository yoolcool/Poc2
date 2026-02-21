# 텍스트 월드 제너레이터

브라우저에서 동작하는 절차적 텍스트 세계 시뮬레이션.
80×40 ASCII 오버월드 위에 바이옴·엔티티·나래이션이 실시간으로 생성·진행되며,
개별 셀로 진입해 80×25 Zone 맵을 탐색할 수 있습니다.

---

## AI 코딩 가이드 (Context for Agentic Coding)

> 이 프로젝트에서 AI 코딩을 수행할 때 아래 세 문서를 먼저 읽으세요.

| 문서 | 내용 | 용도 |
|------|------|------|
| **README.md** (본 파일) | 프로젝트 개요, 기술 스택, 빌드/테스트 명령, 파일 구조, 조작법 | 빠른 온보딩 |
| **systemarchitect.md** | 모듈별 책임, 데이터 흐름, 핵심 알고리즘, 타입 관계도 | 코드 수정 시 영향 범위 파악 |
| **workinghistory.md** | 커밋 히스토리, 각 작업의 목적·변경 사항·교훈 | 기존 결정 이유 파악 + 중복 작업 방지 |

### AI 코딩 시 주의사항

1. **결정론적 RNG**: 모든 난수는 `createRNG(seed)` + `hashSeed()` 기반. `Math.random()` 사용 금지.
2. **Row-major 인덱싱**: 셀 접근은 항상 `cells[y * width + x]`. 이 패턴을 준수.
3. **바이옴 추가 시 체크리스트**:
   - `src/world/types.ts` — `Biome` 유니온에 추가
   - `src/ui/tileClasses.ts` — `BIOME_CHAR` + `BIOME_CLASS` 매핑 추가
   - `src/App.css` — `.tile-<biome>` CSS 클래스 추가
   - `src/world/gen/v3/biomes.ts` — 생성 규칙 추가
   - `src/ui/Inspector.tsx` — 범례에 추가
4. **Zone 타일 추가 시**: `src/world/zoneTypes.ts` → `src/world/zone.ts` → `src/ui/ZoneInspector.tsx`
5. **모바일/데스크톱 분기**: CSS 미디어 쿼리(`768px`)로 처리. JS 분기 없음.
6. **Stale closure 방지**: 이벤트 핸들러에서 최신 상태가 필요하면 `useRef` + `useEffect` 동기화 패턴 사용.
7. **빌드 검증**: `npx tsc -b --noEmit && npm run build` — Vercel 배포 조건과 동일.
8. **테스트**: `npm test` — Vitest 24개 단위 테스트 통과 확인.

---

## 기술 스택

| 항목 | 내용 |
|------|------|
| 프레임워크 | Vite 7 + React 19 + TypeScript (strict) |
| 렌더링 | `<pre>` + `<span>` 셀 방식 — DOM 직접 조작 없음 |
| 스타일 | 순수 CSS (미디어 쿼리로 모바일/데스크톱 분기) |
| 상태 관리 | React `useState` / `useRef` / `useCallback` / `useEffect` / `useMemo` |
| 난수 | xorshift32 PRNG — 외부 노이즈 라이브러리 미사용 |
| 테스트 | Vitest 4 (`vitest.config.ts` 분리, `npm test`) |
| 배포 | Vercel (빌드 커맨드: `tsc -b && vite build`) |

---

## 빠른 시작

```bash
npm install
npm run dev        # 개발 서버 http://localhost:5173
npm run build      # 프로덕션 빌드 → dist/
npm test           # Vitest 단위 테스트 (24개)
npm run lint       # ESLint 검사
npx tsc -b --noEmit  # 타입 체크 (Vercel 동일 조건)
```

---

## 파일 구조

```
src/
├── App.tsx                  # 루트 컴포넌트 — 전체 상태, 모드 분기, 레이아웃
├── App.css                  # 전체 스타일 (모바일/데스크톱 미디어 쿼리)
├── main.tsx                 # React 진입점
├── index.css                # 글로벌 리셋 스타일
│
├── world/
│   ├── types.ts             # Biome(13종), OverworldCell, Overworld 타입
│   ├── rng.ts               # xorshift32 PRNG: createRNG, hashSeed
│   ├── overworld.ts         # V1 노이즈 기반 오버월드 생성 (레거시)
│   ├── entities.ts          # EntityKind(4종), spawnEntities, tickEntities
│   ├── simulation.ts        # updateProximity — NPC 근접 이벤트
│   ├── narration.ts         # 80줄 한국어 서정 나래이션, 셔플백 알고리즘
│   ├── zoneTypes.ts         # ZoneTileKind(12종), ZoneTile, Zone 타입
│   ├── zone.ts              # generateZone — 결정론적 2-패스 Zone 생성
│   ├── zone.test.ts         # Vitest 24개 — 결정성·분포·클러스터링·플래그 검증
│   │
│   └── gen/
│       ├── v2/              # V2 대륙형 생성기 (유지, 미사용)
│       │   ├── types.ts
│       │   ├── pipeline.ts  # runWorldGenV2: height → rivers → biomes
│       │   ├── height.ts    # 대륙 마스크 + 다중 옥타브 노이즈
│       │   ├── climate.ts   # 위도 온도 + 강수 그림자 → 바이옴
│       │   └── rivers.ts    # D8 흐름 누적 → 강/호수
│       │
│       └── v3/              # V3 구조 기반 생성기 (현재 사용)
│           ├── types.ts
│           ├── pipeline.ts  # runWorldGenV3: 6단계 파이프라인
│           ├── oceanMask.ts # 고정 바다(서/남) + 유기적 해안
│           ├── spine.ts     # 북쪽 산맥 스파인 폴리라인
│           ├── rivers.ts    # S-curve 강 + 중류 호수
│           ├── landmarks.ts # 밀림·특수지대·늪 랜드마크
│           └── biomes.ts    # 우선순위 기반 바이옴 채움
│
└── ui/
    ├── GridView.tsx          # 범용 텍스트 맵 렌더러 (콜백 기반)
    ├── Inspector.tsx         # 오버월드 커서 위치/바이옴 정보 패널
    ├── ZoneInspector.tsx     # Zone 커서 위치/타일 정보 + 범례
    ├── ActionBar.tsx         # Enter Zone / Back / Depth± 버튼
    ├── ConsoleLog.tsx        # 타입라이터 콘솔 로그
    ├── BottomPanel.tsx       # 모바일 하단 패널 (드래그 리사이즈, 탭, D-pad)
    ├── TouchPad.tsx          # D-pad 컴포넌트
    └── tileClasses.ts        # BIOME_CHAR(글리프), BIOME_CLASS(CSS) 매핑
```

---

## 조작 방법

### Overworld 모드

| 입력 | 동작 |
|------|------|
| `W/A/S/D` / 화살표 | 커서 이동 |
| 셀 탭(클릭) | 해당 셀로 커서 이동 |
| 스와이프 | 1칸 이동 (방향 우세 판정) |
| Enter Zone 버튼 | 현재 커서 셀의 Zone으로 진입 |
| Seed 입력 + Generate | 새 월드 생성 |
| Random 버튼 | 무작위 시드로 재생성 |
| 지형/고도/강 토글 | 맵 레이어 전환 |

### Zone 모드

| 입력 | 동작 |
|------|------|
| `W/A/S/D` / 화살표 | Zone 커서 이동 |
| 셀 탭(클릭) | Zone 커서 이동 |
| ← Back 버튼 | Overworld로 복귀 |
| Depth + / Depth − | 동일 위치 다른 깊이의 Zone 생성 |

---

## 바이옴 참조 (13종 — V3)

| 글리프 | 바이옴 | CSS 클래스 |
|--------|--------|-----------|
| `≋` | water | `.tile-water` |
| `░` | beach | `.tile-beach` |
| `∴` | plains | `.tile-plains` |
| `♣` | forest | `.tile-forest` |
| `♠` | dense_forest | `.tile-dense-forest` |
| `▒` | desert | `.tile-desert` |
| `∵` | steppe | `.tile-steppe` |
| `▲` | rocky_mountain | `.tile-rocky-mountain` |
| `△` | alpine | `.tile-alpine` |
| `━` | river | `.tile-river` |
| `◈` | lake | `.tile-lake` |
| `◉` | special | `.tile-special` |
| `⌇` | swamp | `.tile-swamp` |

---

## 엔티티 (4종)

| 글리프 | 종류 | 선호 바이옴 |
|--------|------|-------------|
| `g` | 염소 | rocky_mountain, alpine, plains |
| `b` | 새 | plains, forest, alpine |
| `f` | 개구리 | water, plains, forest |
| `W` | 방랑자 | plains, desert, forest |

---

## 결정성 검증

동일한 Seed는 항상 동일한 맵·엔티티 배치·나래이션 순서를 보장합니다.
```
[World] seed=12345  hash=0x9f3a1c2e
```
Zone도 동일: `zoneSeed = hashSeed(worldSeed, ox, oy, depth, 0x5A0E)`
