# 텍스트 월드 제너레이터

브라우저에서 동작하는 절차적 텍스트 세계 시뮬레이션.
80×40 ASCII 오버월드 위에 바이옴·엔티티·나래이션이 실시간으로 생성·진행되며,
개별 셀로 진입해 80×25 Zone 맵을 탐색할 수 있습니다.

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
│
├── world/
│   ├── types.ts             # Overworld, OverworldCell, Biome 타입
│   ├── rng.ts               # xorshift32 PRNG: createRNG, hashSeed
│   ├── overworld.ts         # 노이즈 기반 오버월드 생성 (generateOverworld)
│   ├── entities.ts          # EntityKind, spawnEntities, tickEntities, ENTITY_GLYPH
│   ├── simulation.ts        # updateProximity, NearStateMap, DEBUG_PROXIMITY
│   ├── narration.ts         # 80줄 한국어 나래이션, 셔플백, maybeEmitNarration
│   ├── zoneTypes.ts         # ZoneTileKind, ZoneTileFlags, ZoneTile, Zone, ZoneMeta
│   ├── zone.ts              # generateZone — 결정론적 2-패스 Zone 생성
│   └── zone.test.ts         # Vitest 24개 — 결정성·분포·클러스터링·플래그 검증
│
└── ui/
    ├── GridView.tsx          # 범용 텍스트 맵 렌더러 (Ticket 3 API)
    ├── Inspector.tsx         # 오버월드 커서 위치/바이옴 정보 패널
    ├── ZoneInspector.tsx     # Zone 커서 위치/타일 정보 + 범례 패널
    ├── ActionBar.tsx         # Enter Zone / Back / Depth± 버튼
    ├── ConsoleLog.tsx        # 타입라이터 콘솔 로그
    ├── BottomPanel.tsx       # 모바일 하단 패널 (드래그 리사이즈, 탭, D-pad, ActionBar)
    ├── TouchPad.tsx          # D-pad 컴포넌트
    └── tileClasses.ts        # BIOME_CHAR, BIOME_CLASS 매핑

vitest.config.ts             # Vitest 전용 설정 (vite.config.ts와 분리됨)
vite.config.ts               # Vite 프로덕션 설정 — test 블록 없음
```

---

## 구현 히스토리

### Day 1–2: 기반 인프라 (`9699265`, `2805a12`)

- **Vite + React + TypeScript** 프로젝트 초기화
- **xorshift32 PRNG** (`src/world/rng.ts`)
  - `createRNG(seed)` — 상태를 클로저로 보유하는 결정론적 난수 스트림
  - `hashSeed(...args: number[])` — 여러 인자를 XOR-혼합해 고유 시드 생성
- **오버월드 생성** (`src/world/overworld.ts`)
  - 80×40 격자, 시드 기반 완전 재현 가능
  - 2개 노이즈 레이어(지형 고도 + 습도) 합성
  - 6가지 바이옴: `water` / `plains` / `forest` / `desert` / `rocky_mountain` / `alpine`
- **GridView** 초기 버전 — ResizeObserver, 키보드, Pointer Events 터치
- **Inspector** — 바이옴·고도·습도·좌표 표시

### Day 2.5: 바이옴 색상 렌더링 (`2805a12`)

- 셀별 `<span>` + CSS 클래스로 바이옴별 색상 구분
- 결정성 검증 해시 콘솔 출력 (`simpleHash` 기반)

### Day 3: 엔티티 & 콘솔 로그 (`9906676`)

- **엔티티 시스템** (`src/world/entities.ts`)
  - 4종류: 염소(`g`) / 새(`b`) / 개구리(`f`) / 방랑자(`W`) — 총 12마리
  - 바이옴 선호도 기반 배치 (30회 시도, 실패 시 비-물 셀로 폴백)
  - 1초 틱마다 4방향 랜덤 이동 — `hashSeed(seed, id, tick)` 결정론적
  - 개구리만 물 위 이동 가능; 나머지 물 회피
- **콘솔 로그** (`src/ui/ConsoleLog.tsx`)
  - 타입라이터 효과 (28ms/글자), `Array.from(text)` — 한국어 Unicode 안전 처리
  - 최신 로그 자동 스크롤, 최대 40개 항목

### Day 3 폴리시: BottomPanel + NPC 스팸 방지 (`9b7318b`)

- **BottomPanel** — 드래그 리사이즈, 3단계 스냅(40/180/max px), 탭(콘솔/맵정보), D-pad
- **NPC 근접 메시지** (`src/world/simulation.ts`)
  - FAR → NEAR 진입 이벤트만 트리거
  - 엔티티별 30틱 쿨다운, 방랑자 60% / 동물 35% 확률
  - 전역 스로틀: 호출당 최대 1개, 방랑자 우선

### 나래이션 시스템 (`740a1e5`)

- **80줄 한국어 서정 나래이션** (`src/world/narration.ts`)
  - 바이옴 태그: `water/forest/desert/plains/mountain/sky/lore/time/general`
  - 셔플백 알고리즘: Fisher-Yates + seeded RNG + 재셔플 카운트 솔트
  - 최근 12개 창 — 동일 문장 반복 방지, 최대 10회 재시도
  - 발화 조건: 쿨다운 8틱 + 18% 확률 + 같은 이동에서 NPC 대사 미발생

### NPC 마주침 버그 수정 (`dbc4868`)

- **원인**: 틱 이펙트에서 `updateProximity()` 호출 → `wasNear=true` 선점 → 커서 이동 시 `enteredNear` 항상 `false`
- **수정**: `updateProximity()`를 틱 이펙트에서 제거, 커서 이동 이펙트에서만 호출

---

### Ticket 1: Zone 타입 시스템 & 결정적 Zone 생성기 (`7b8703a`)

**새 파일:** `src/world/zoneTypes.ts`, `src/world/zone.ts`, `src/world/zone.test.ts`
**설정:** `vitest` devDependency 추가, `package.json`에 `"test": "vitest run"` 스크립트

#### Zone 생성 알고리즘 (`generateZone`)

```
zoneSeed = hashSeed(worldSeed, ox, oy, depth, 0x5A0E)
```

- **Pass 1** — 셀별 독립 RNG (`hashSeed(zoneSeed, x, y, 0x1111)`)로 바이옴 기반 가중치 테이블에서 타일 결정
- **Pass 2** — 이웃 참조(`hashSeed(zoneSeed, x, y, 0x2222)`) 로컬 규칙 적용:
  - 클러스터 부스트: 이웃에 같은 타일 2개 이상이면 4× 확률
  - 수변 연쇄: `shallow_water → mud(×3)`, `mud → reed(×3)`
  - 고도 보정: 지형 높이에 따라 rock/cliff 비율 증가
  - 습도 보정: 식생 타일 비율 증가
  - 사막 오아시스: moisture > 0.55이면 water/mud/reed 허용

#### 바이옴별 기본 가중치

| 바이옴 | 주요 타일 |
|--------|-----------|
| desert | sand 75, gravel 18, rock 7 |
| plains | grass 55, dirt 25, tall_grass 20 |
| forest | dirt 45, grass 25, tall_grass 10, tree 20 |
| water | shallow_water 80, mud 15, reed 5 |
| rocky_mountain | rock 55, cliff 25, dirt 20 |
| alpine | snow 55, rock 30, cliff 10, dirt 5 |

#### Zone 타일 글리프 & 플래그

| Kind | Glyph | blocked | liquid | vegetation | cold |
|------|-------|---------|--------|------------|------|
| sand | `.` | false | false | false | — |
| gravel | `,` | false | false | false | — |
| rock | `#` | true | false | false | — |
| dirt | `_` | false | false | false | — |
| grass | `"` | false | false | true | — |
| tall_grass | `"` | false | false | true | — |
| shallow_water | `~` | false | true | false | — |
| mud | `%` | false | false | false | — |
| tree | `T` | true | false | true | — |
| reed | `\|` | false | false | true | — |
| snow | `*` | false | false | false | true |
| cliff | `!` | true | false | false | — |

#### 테스트 (24개, 모두 통과)

- 결정성: 동일 인자 → 동일 출력, 다른 인자 → 40% 미만 일치
- 바이옴 분포: 사막 >50% sand, 물 >45% shallow_water, alpine >30% snow 등
- 클러스터링: tree의 ≥40%가 인접한 다른 tree 보유
- 플래그 정확성: cliff.blocked=true, shallow_water.liquid=true 등

---

### Ticket 2: Zone 모드 전환 + 모바일 터치 UI (`d593005`)

**새 파일:** `src/ui/ActionBar.tsx`, `src/ui/ZoneInspector.tsx`
**수정:** `src/App.tsx`, `src/ui/BottomPanel.tsx`, `src/App.css`

#### ViewMode

```typescript
type ViewMode = 'overworld' | 'zone';
```

#### Zone 상태 (App.tsx)

```typescript
const [mode, setMode]           = useState<ViewMode>('overworld');
const [zone, setZone]           = useState<Zone | null>(null);
const [zoneCursor, setZoneCursor] = useState({ x: 0, y: 0 });
const [zoneOrigin, setZoneOrigin] = useState<{ox, oy, depth} | null>(null);
const ZONE_W = 80; const ZONE_H = 25;
```

- `modeRef` / `zoneRef` — stale closure 방지용 ref (useEffect로 동기화)
- `handleMoveCursor` — modeRef 읽어 overworld/zone 커서 분기
- 근접/나래이션 이펙트: `if (mode !== 'overworld') return;` 가드

#### ActionBar

- Overworld: `[Enter Zone]` 버튼
- Zone: `[← Back]` `[Depth N]` `[Depth +]` `[Depth −]` 버튼

#### ZoneInspector

Zone ID, 바이옴, 깊이, 커서 X/Y, 타일 kind/glyph/flags, 12종 범례 표시

---

### Ticket 3: GridView 범용화 + 모바일 셀 탭 (`e9e4ae9`)

**수정:** `src/ui/GridView.tsx`, `src/App.tsx`, `src/App.css`

#### 새 GridView API

```typescript
export type GridCursor = { x: number; y: number };

export type GridViewProps = {
  width: number;
  height: number;
  glyphAt: (x: number, y: number) => string;       // 셀 글리프 콜백
  classAt?: (x: number, y: number) => string | undefined; // 셀 CSS 클래스 콜백
  cursor?: GridCursor;      // 커서 위치 (@로 오버레이)
  highlight?: GridCursor;   // 강조 위치 (tile-highlight 추가)
  onCellTap?: (x: number, y: number) => void;      // 모바일 탭 콜백
  onMoveCursor?: (dx: number, dy: number) => void; // 키보드/스와이프 이동
  scale?: number;           // 폰트 크기 스케일 배수
};
```

#### 탭 감지 구조

- 각 `<span>`에 `data-cx={x} data-cy={y}` 어트리뷰트 부여
- `handlePointerDown` (on `<pre>`): `e.target.dataset` 읽어 `pointerCell` ref에 기록 + pointer capture
- `handlePointerUp` (on `<pre>`): 이동 거리로 tap/swipe 분기
  - tap (< 25px): `onCellTap(pointerCell.x, pointerCell.y)`
  - swipe: `onMoveCursor(±1, 0)` 또는 `onMoveCursor(0, ±1)`
- 셀 클로저 생성 없음 — 성능 최적화

#### renderGlyph / cellClass 헬퍼

```typescript
// 커서/오버레이 로직을 한 곳에 집중 → 향후 레이어 추가 용이
function renderGlyph(x, y, glyphAt, cursor): string
function cellClass(x, y, classAt, cursor, highlight): string
```

#### App.tsx 어댑터

```typescript
// O(1) 엔티티 조회 맵
const entityAt = useMemo(() => {
  const map = new Map<number, Entity>();
  for (const e of entities) map.set(e.y * world.width + e.x, e);
  return map;
}, [entities, world.width]);

// 모드 분기 콜백 (modeRef/zoneRef로 stale closure 방지)
const glyphAt  = useCallback((x, y) => { /* zone tile or overworld biome+entity */ }, [entityAt, world]);
const classAt  = useCallback((x, y) => { /* zone CSS class or overworld CSS class */ }, [entityAt, world]);

// 탭 → 커서 이동 (overworld/zone 분기)
const handleCellTap = useCallback((x, y) => { ... }, [world.width, world.height]);
```

#### 추가 CSS

```css
.tile-highlight {
  background-color: rgba(255, 255, 100, 0.15);
  outline: 1px solid rgba(255, 255, 100, 0.4);
}
```

---

### 빌드 수정: Vercel TypeScript 오류 해결 (`74460fe`)

**문제:** `vite.config.ts`에 `/// <reference types="vitest" />` + `test:` 블록이 있으면
`tsc -b`(Vercel 빌드)에서 `TS2769: 'test' does not exist in type 'UserConfigExport'` 오류 발생.

**해결:** `vitest.config.ts` 분리

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})

// vite.config.ts — test 블록 완전 제거
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
```

---

## 조작 방법

### Overworld 모드

| 입력 | 동작 |
|------|------|
| `W` / `↑` | 커서 위로 |
| `S` / `↓` | 커서 아래로 |
| `A` / `←` | 커서 왼쪽 |
| `D` / `→` | 커서 오른쪽 |
| 셀 탭(클릭) | 해당 셀로 커서 이동 |
| 스와이프 | 1칸 이동 (방향 우세 판정) |
| Enter Zone 버튼 | 현재 커서 셀의 Zone으로 진입 |
| Seed 입력 + Generate | 새 월드 생성 |
| Random 버튼 | 무작위 시드로 재생성 |

### Zone 모드

| 입력 | 동작 |
|------|------|
| `W/A/S/D` / 화살표 | Zone 커서 이동 |
| 셀 탭(클릭) | Zone 커서 이동 |
| ← Back 버튼 | Overworld로 복귀 |
| Depth + / Depth − | 동일 위치 다른 깊이의 Zone 생성 |

### 공통

| 입력 | 동작 |
|------|------|
| 하단 핸들 드래그 | 패널 높이 조절 (3단계 스냅) |
| 핸들 탭 | 접힘 → 미니 → 확장 순환 |
| Enter | Seed 입력 후 Generate |

---

## 바이옴 & 글리프 참조

### 오버월드 바이옴

| 기호 | 바이옴 | CSS 클래스 | 색상 |
|------|--------|-----------|------|
| `~` | water | `.tile-water` | `#4FC3F7` |
| `,` | plains | `.tile-plains` | `#9CCC65` |
| `T` | forest | `.tile-forest` | `#2E7D32` |
| `.` | desert | `.tile-desert` | `#FBC02D` |
| `^` | rocky_mountain | `.tile-rocky-mountain` | `#B0BEC5` |
| `A` | alpine | `.tile-alpine` | `#E0F7FA` |
| `@` | 커서 | `.tile-player` | `#FF5252` |

### 엔티티

| 글리프 | 종류 | CSS 클래스 | 선호 바이옴 |
|--------|------|-----------|-------------|
| `g` | 염소 | `.tile-entity--goat` | rocky_mountain, alpine, plains |
| `b` | 새 | `.tile-entity--bird` | plains, forest, alpine |
| `f` | 개구리 | `.tile-entity--frog` | water, plains, forest |
| `W` | 방랑자 | `.tile-entity--wanderer` | plains, desert, forest |

### Zone 타일

| Kind | Glyph | CSS 클래스 | 색상 |
|------|-------|-----------|------|
| sand | `.` | `.tile-zone--sand` | `#D4A76A` |
| gravel | `,` | `.tile-zone--gravel` | `#9E9E9E` |
| dirt | `_` | `.tile-zone--dirt` | `#A1887F` |
| grass | `"` | `.tile-zone--grass` | `#7CB342` |
| tall_grass | `"` | `.tile-zone--tall_grass` | `#558B2F` |
| rock | `#` | `.tile-zone--rock` | `#757575` |
| cliff | `!` | `.tile-zone--cliff` | `#B71C1C` (bold) |
| shallow_water | `~` | `.tile-zone--shallow_water` | `#4FC3F7` |
| mud | `%` | `.tile-zone--mud` | `#6D4C41` |
| tree | `T` | `.tile-zone--tree` | `#2E7D32` (bold) |
| reed | `\|` | `.tile-zone--reed` | `#827717` |
| snow | `*` | `.tile-zone--snow` | `#E1F5FE` |

---

## 콘솔 이벤트 색상

| 색상 | 이벤트 종류 |
|------|-------------|
| 회색 `#888` | 시스템 메시지 |
| 연두 `#C5E1A5` | 엔티티 마주침 (encounter) |
| 청록 `#80CBC4` | 정보 (info) |
| 뮤트 청록 `#8ab4b0` | 서정 나래이션 (narration) |
| 어두운 청회 `#546E7A` | 틱 이벤트 (tick) |

---

## 결정성 검증

동일한 Seed는 항상 동일한 맵·엔티티 배치를 보장합니다.

```
[World] seed=12345  hash=0x9f3a1c2e
```

Zone도 동일: `zoneSeed = hashSeed(worldSeed, ox, oy, depth, 0x5A0E)` — 같은 인자면 항상 같은 타일 배열.

---

## 디버그

```typescript
// src/world/simulation.ts
export let DEBUG_PROXIMITY = true;
```

활성화 시 콘솔 출력 예:

```
[DEBUG] entity wanderer-2 dist=1 enteredNear=true wasNear=false cooldownOk=true (tick=45 lastSpokeAt=-999)
```

---

## 커밋 히스토리 (최신순)

| 커밋 | 내용 |
|------|------|
| `e9e4ae9` | Ticket 3: GridView 범용 렌더러 + 모바일 셀 탭 |
| `74460fe` | fix: vitest.config.ts 분리 — Vercel 빌드 오류 수정 |
| `d593005` | Ticket 2: Zone 모드 전환 + 모바일 터치 UI |
| `7b8703a` | Ticket 1: Zone 타입 및 결정적 Zone 생성기 구현 |
| `4b705d9` | docs: README 전면 갱신 |
| `dbc4868` | UI 폴리시 + NPC 마주침 버그 수정 |
| `740a1e5` | 나래이션 시스템 |
| `9b7318b` | Day 3 폴리시: BottomPanel + NPC 스팸 방지 |
| `9906676` | Day 3: 엔티티, 틱 시스템, 한국어 콘솔 로그 |
| `2805a12` | Day 2.5: 바이옴 색상 렌더링 |
| `9699265` | Day 2: 노이즈 기반 오버월드 생성 |
| `4a32e1a` | Day 1 MVP: 결정론적 RNG + 텍스트 월드 |

---

## 브랜치

```
claude/text-world-generator-VOZHz
```

---

## 다음 작업 후보 (미구현)

- **오버레이 시스템**: `classAt` 콜백만 교체하면 바이옴·고도·습도·POI 히트맵 즉시 추가 가능 (GridView 변경 불필요)
- **Zone 내 엔티티**: Zone 진입 시 엔티티 스폰 + 이동 시스템
- **Zone 간 이동**: 인접 Zone 연결 (방향키로 Zone 경계 넘기)
- **저장/불러오기**: localStorage에 시드 + 커서 위치 저장
- **highlight 활용**: 셀 선택 → 상세 정보 팝업 (GridView `highlight` prop 이미 준비됨)
- **다국어 나래이션**: 영어 텍스트 추가
