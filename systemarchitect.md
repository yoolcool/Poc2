# System Architecture

AI 에이전트가 코드 수정 시 영향 범위를 파악하고, 올바른 패턴을 따르기 위한 아키텍처 문서.

---

## 1. 시스템 개요

```
┌─────────────────────────────────────────────────────────┐
│                      App.tsx (루트)                       │
│  ┌───────────┐  ┌──────────┐  ┌─────────┐  ┌─────────┐ │
│  │ 상태 관리  │  │ 틱 루프   │  │ 모드 분기│  │ 이벤트  │ │
│  │ (useState) │  │ (1초)    │  │ OW/Zone │  │ (logs)  │ │
│  └─────┬─────┘  └────┬─────┘  └────┬────┘  └────┬────┘ │
│        │             │             │             │       │
│  ┌─────▼─────────────▼─────────────▼─────────────▼────┐ │
│  │              콜백 어댑터 (glyphAt, classAt)          │ │
│  └────────────────────────┬───────────────────────────┘ │
└───────────────────────────┼─────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   ┌─────────┐      ┌────────────┐      ┌────────────┐
   │ GridView │      │ Inspector  │      │ ConsoleLog │
   │ (맵 렌더)│      │ (정보 패널) │      │ (이벤트 로그)│
   └─────────┘      └────────────┘      └────────────┘
```

---

## 2. 모듈 의존 관계

```
App.tsx
├── world/gen/v3/pipeline.ts  ← 월드 생성 (현재 사용)
│   ├── oceanMask.ts
│   ├── spine.ts
│   ├── rivers.ts
│   ├── landmarks.ts
│   └── biomes.ts
│       └── types.ts (Biome 유니온)
│
├── world/entities.ts         ← 엔티티 스폰/이동
│   └── rng.ts
│
├── world/simulation.ts       ← NPC 근접 이벤트
│   └── rng.ts
│
├── world/narration.ts        ← 서정 나래이션
│   └── rng.ts
│
├── world/zone.ts             ← Zone 생성
│   ├── zoneTypes.ts
│   └── rng.ts
│
├── ui/GridView.tsx            ← 맵 렌더링
├── ui/Inspector.tsx           ← 오버월드 정보
├── ui/ZoneInspector.tsx       ← Zone 정보
├── ui/ActionBar.tsx           ← 모드 전환 버튼
├── ui/ConsoleLog.tsx          ← 이벤트 로그
├── ui/BottomPanel.tsx         ← 모바일 하단 UI
├── ui/TouchPad.tsx            ← D-pad
└── ui/tileClasses.ts          ← 글리프/CSS 매핑
```

> **핵심**: 모든 `world/` 모듈은 `rng.ts`에 의존. UI 모듈은 `world/` 를 직접 import하지 않고, App.tsx가 콜백으로 중개.

---

## 3. 데이터 흐름

### 3-1. 월드 생성 흐름

```
seed (number)
  │
  ▼
runWorldGenV3(seed, {width: 80, height: 40})
  │
  ├── buildOceanMask()      → boolean[40][80]   (바다 마스크)
  ├── generateNorthMountainSpine() → boolean[40][80] (산맥 마스크)
  ├── generateRivers()      → { river: bool[][], lake: bool[][], mainPath: [x,y][] }
  ├── generateLandmarks()   → LandmarkZone[]     (밀림/특수/늪)
  ├── buildBiomeMap()       → Biome[40][80]      (13종 바이옴)
  └── synthesize height/moisture → number[40][80] × 2
  │
  ▼
WorldGenV3Result
  │
  ▼ (App.tsx: buildWorldV3)
Overworld { width, height, cells: OverworldCell[] }
  + WorldGenV2Result (호환 래퍼: heightMap, riverMap, biomeMap)
```

### 3-2. 렌더링 흐름

```
App.tsx 상태
  │
  ├── glyphAt(x, y): string
  │   ├── zone 모드 → zone.tiles[y*w+x].glyph
  │   ├── height 레이어 → heightGlyph(heightMap[y][x])
  │   ├── rivers 레이어 → 'o'(lake) / '~'(river) / '.'
  │   └── biome 레이어 → ENTITY_GLYPH[entity] || BIOME_CHAR[biome]
  │
  ├── classAt(x, y): string
  │   ├── zone 모드 → 'tile-zone tile-zone--{kind}'
  │   ├── height 레이어 → 'tile-h-{level}'
  │   ├── rivers 레이어 → 'tile-r-{type}'
  │   └── biome 레이어 → 'tile-entity--{kind}' || BIOME_CLASS[biome]
  │
  ▼
GridView.tsx
  ├── <pre> 태그 안에 행별 <div>
  ├── 각 셀: <span data-cx={x} data-cy={y} class={cls}>{glyph}</span>
  ├── 커서 위치: '@' 글리프 + 'tile-player' 클래스
  └── ResizeObserver → 동적 폰트 크기
```

### 3-3. 틱 루프 흐름

```
setInterval(1000ms) → tick++
  │
  ▼
tickEntities(entities, seed, tick, world)
  → 각 엔티티: hashSeed(seed, id, tick) → 4방향 이동
  → 새 Entity[] 반환
  │
  ▼
(커서 이동 시에만)
updateProximity(cursorX, cursorY, entities, nearState, tick, seed)
  → FAR→NEAR 감지 → encounterMsg?
  │
  ▼
maybeEmitNarration(seed, tick, biome, hadEncounter, state)
  → 8틱 쿨다운 + 18% 확률 → narrationLine?
  │
  ▼
addLog(type, text) → logs 상태 갱신 → ConsoleLog 리렌더
```

### 3-4. Zone 진입/퇴출 흐름

```
enterZone()
  │
  ├── worldRef.current.cells[cursorY * width + cursorX] → OverworldCell
  ├── generateZone({ worldSeed, ox, oy, depth: 0, cell, 80, 25 })
  │   ├── Pass 1: 셀별 독립 RNG → 바이옴 가중치 기반 타일 배정
  │   └── Pass 2: 이웃 참조 보정 (클러스터, 수변, 고도, 습도)
  ├── setZone(zone)
  ├── setMode('zone')
  └── setZoneCursor({ x: 40, y: 12 })  // 중앙

exitZone()
  ├── setMode('overworld')
  ├── setZone(null)
  └── (오버월드 커서 위치 유지)

changeDepth(delta)
  └── generateZone({ ...sameOrigin, depth: origin.depth + delta })
```

---

## 4. 핵심 타입 관계도

```
Biome (13종 유니온)
  = 'water' | 'beach' | 'plains' | 'forest' | 'dense_forest'
  | 'desert' | 'steppe' | 'rocky_mountain' | 'alpine'
  | 'river' | 'lake' | 'special' | 'swamp'

OverworldCell { height: number, moisture: number, biome: Biome }

Overworld { width: number, height: number, cells: OverworldCell[] }
  ↑ row-major: index = y * width + x

EntityKind = 'goat' | 'bird' | 'frog' | 'wanderer'
Entity { id: string, kind: EntityKind, x: number, y: number }

ZoneTileKind (12종)
  = 'sand' | 'gravel' | 'rock' | 'dirt' | 'grass' | 'tall_grass'
  | 'shallow_water' | 'mud' | 'tree' | 'reed' | 'snow' | 'cliff'

ZoneTile { kind: ZoneTileKind, glyph: string, flags: ZoneTileFlags }
ZoneTileFlags { blocked: boolean, liquid: boolean, vegetation: boolean, cold: boolean }

Zone { id: string, width: number, height: number, tiles: ZoneTile[], meta: ZoneMeta }

ViewMode = 'overworld' | 'zone'
MapLayer = 'biome' | 'height' | 'rivers'

SimEvent { id: number, type: 'system'|'encounter'|'info'|'tick'|'narration', text: string }
```

---

## 5. V3 월드젠 파이프라인 상세

### 단계별 실행 순서 (반드시 순차)

```
Step 1: buildOceanMask(seed, W, H)
  ├── 하단 행 + 좌측 열 = 바다 (고정)
  ├── 2행/2열 = 해안 (부분)
  ├── 8-16개 인렛 (바다→내륙, 깊이 2-8)
  └── 3-4개 반도 (내륙→바다)

Step 2: generateNorthMountainSpine(seed, W, H, oceanMask)
  ├── 6-9 제어점 (y: 2 .. H*0.35)
  ├── 보간 → 연속 스파인
  ├── 가우시안 반경 (2-5셀) 페인팅
  └── 4-8개 산개 봉우리

Step 3: generateRivers(seed, W, H, oceanMask, mountainMask)
  ├── 메인 강: 산맥 중앙 → 남쪽 바다 (S-curve)
  ├── 중류 호수: 강 35-60% 지점에 원형
  └── 1-2개 지류: 랜덤 산맥점 → 바다

Step 4: generateLandmarks(seed, W, H, ocean, river, mountain, lake, mainPath)
  ├── 밀림 (dense_forest): 남쪽 반, 60-140셀 flood-fill
  ├── 특수지대 (special): 중간 영역, 30-80셀
  └── 늪 (swamp): 강 하구 근처, 30-70셀

Step 5: buildBiomeMap(seed, W, H, ocean, mountain, river, lake, landmarks)
  우선순위 순서:
  1. 바다 → 'water'
  2. 산맥 → 'alpine' (상위 15%) / 'rocky_mountain'
  3. 강 → 'river', 호수 → 'lake'
  4. 랜드마크 → 'dense_forest' / 'special' / 'swamp'
  5. 산기슭 (산맥 남쪽 3-6행) → 'forest'
  6. 해안 인접 → 'beach' (50%)
  7. 강수 그림자 (산맥 동쪽) → 'desert'(15%) / 'steppe'(20%)
  8. 남쪽 잔여 → 'forest'(12%) / 'plains'

Step 6: synthesize heightMap + moisture (OverworldCell 호환)
  ├── height: ocean=0.1, mountain=0.9, river/lake=0.2, 나머지 0.3-0.6
  └── moisture: ocean=0.8, river/lake=0.7, forest=0.6, desert=0.15, 나머지 0.3-0.5
```

---

## 6. 상태 관리 패턴

### 6-1. React State (리렌더 트리거)

| 상태 | 타입 | 갱신 시점 |
|------|------|-----------|
| `seed` | `number` | 월드 생성 |
| `world` | `Overworld` | 월드 생성 |
| `v2Data` | `WorldGenV2Result` | 월드 생성 |
| `cursorX/Y` | `number` | 키보드/탭/스와이프 |
| `entities` | `Entity[]` | 매 틱 |
| `tick` | `number` | 1초 인터벌 |
| `logs` | `SimEvent[]` | 이벤트 발생 |
| `mode` | `ViewMode` | zone 진입/퇴출 |
| `zone` | `Zone \| null` | zone 진입/깊이 변경 |
| `zoneCursor` | `{x, y}` | zone 내 이동 |
| `zoneOrigin` | `{ox, oy, depth}` | zone 진입 |
| `mapLayer` | `MapLayer` | 레이어 토글 |

### 6-2. Ref (리렌더 없이 최신값 접근)

| Ref | 용도 |
|-----|------|
| `seedRef` | useCallback 내부에서 최신 seed 접근 |
| `cursorRef` | 커서 이동 이펙트에서 이전값 비교 |
| `entitiesRef` | 틱 이펙트에서 최신 엔티티 접근 |
| `worldRef` | 커서 이동 이펙트에서 world 접근 (의존성 제거) |
| `modeRef` | handleMoveCursor에서 모드 분기 |
| `zoneRef` | handleMoveCursor에서 zone 데이터 접근 |
| `mapLayerRef` | glyphAt/classAt에서 레이어 분기 |
| `v2Ref` | glyphAt/classAt에서 height/river 데이터 접근 |
| `nearStateRef` | NearStateMap (in-place mutation, 리렌더 불필요) |
| `narrationStateRef` | NarrationState (in-place mutation) |
| `logIdRef` | 로그 ID 카운터 |
| `prevCursorRef` | 커서 이동 감지 (이전 좌표) |

### 6-3. Stale Closure 방지 패턴

```typescript
// 1. state 변경 → ref 동기화
const modeRef = useRef(mode);
useEffect(() => { modeRef.current = mode; }, [mode]);

// 2. useCallback 내부에서 ref 읽기 (의존성에 mode 넣지 않음)
const handleMoveCursor = useCallback((dx, dy) => {
  if (modeRef.current === 'zone') { ... }
  else { ... }
}, [world.width, world.height]);  // mode 없음 → 리렌더 최소화
```

---

## 7. UI 레이아웃 구조

### 7-1. 데스크톱 (>768px)

```
┌────────────────────────────────────────┐
│ Toolbar: [Mode] [Seed] [Gen] [Rand]   │
│          [지형|고도|강] [ActionBar]      │
├─────────────────────┬──────────────────┤
│                     │                  │
│   GridView          │   Inspector      │
│   (80×40 or 80×25)  │   (or ZoneInsp)  │
│                     │                  │
├─────────────────────┴──────────────────┤
│ ConsoleLog (타입라이터)                   │
└────────────────────────────────────────┘
```

### 7-2. 모바일 (≤768px)

```
┌────────────────────────┐
│ Toolbar (축소)          │
├────────────────────────┤
│                        │
│   GridView (풀 너비)    │
│                        │
├────────────────────────┤
│ BottomPanel            │
│ ┌────────────────────┐ │
│ │ 드래그 핸들          │ │
│ │ [콘솔] [맵정보] 탭  │ │
│ │ ActionBar           │ │
│ │ 콘텐츠 (로그/인스펙) │ │
│ └────────────────────┘ │
└────────────────────────┘
         ┌─────┐
         │ D   │  ← 고정 위치
         │ pad │     (safe-area 고려)
         └─────┘
```

---

## 8. CSS 클래스 체계

### 8-1. 오버월드 바이옴

```css
.tile-water          { color: #4FC3F7; }
.tile-beach          { color: #FFE0B2; }
.tile-plains         { color: #9CCC65; }
.tile-forest         { color: #2E7D32; }
.tile-dense-forest   { color: #1B5E20; font-weight: bold; }
.tile-desert         { color: #FBC02D; }
.tile-steppe         { color: #C8B560; }
.tile-rocky-mountain { color: #B0BEC5; }
.tile-alpine         { color: #E0F7FA; }
.tile-river          { color: #29B6F6; font-weight: bold; }
.tile-lake           { color: #0288D1; }
.tile-special        { color: #CE93D8; font-weight: bold; }
.tile-swamp          { color: #6D9B6E; }
```

### 8-2. 고도 레이어

```css
.tile-h-deep   { color: #0D47A1; }
.tile-h-ocean  { color: #1976D2; }
.tile-h-shore  { color: #4FC3F7; }
.tile-h-low    { color: #81C784; }
.tile-h-mid    { color: #FDD835; }
.tile-h-high   { color: #FF8A65; }
.tile-h-mount  { color: #E53935; }
.tile-h-peak   { color: #FFFFFF; }
```

### 8-3. 강 레이어

```css
.tile-r-ocean  { color: #1565C0; }
.tile-r-river  { color: #29B6F6; }
.tile-r-lake   { color: #0277BD; }
.tile-r-land   { color: #4E342E; }
.tile-r-mount  { color: #9E9E9E; }
```

### 8-4. Zone 타일

```css
.tile-zone--sand          { color: #D4A76A; }
.tile-zone--gravel        { color: #9E9E9E; }
.tile-zone--dirt          { color: #A1887F; }
.tile-zone--grass         { color: #7CB342; }
.tile-zone--tall_grass    { color: #558B2F; }
.tile-zone--rock          { color: #757575; }
.tile-zone--cliff         { color: #B71C1C; font-weight: bold; }
.tile-zone--shallow_water { color: #4FC3F7; }
.tile-zone--mud           { color: #6D4C41; }
.tile-zone--tree          { color: #2E7D32; font-weight: bold; }
.tile-zone--reed          { color: #827717; }
.tile-zone--snow          { color: #E1F5FE; }
```

---

## 9. 수정 가이드 (영향 범위 체크리스트)

### 바이옴 추가

1. `src/world/types.ts` — `Biome` 유니온에 값 추가
2. `src/ui/tileClasses.ts` — `BIOME_CHAR` + `BIOME_CLASS` 항목 추가
3. `src/App.css` — `.tile-<name>` CSS 규칙 추가
4. `src/world/gen/v3/biomes.ts` — 생성 규칙 (어떤 조건에서 이 바이옴이 배치되는지)
5. `src/ui/Inspector.tsx` — 범례 항목 추가

### Zone 타일 추가

1. `src/world/zoneTypes.ts` — `ZoneTileKind` 유니온 + 플래그 정의
2. `src/world/zone.ts` — 바이옴별 가중치 테이블 + ZONE_TILE_DEFS 추가
3. `src/App.css` — `.tile-zone--<name>` CSS 규칙
4. `src/ui/ZoneInspector.tsx` — 범례 항목

### 엔티티 추가

1. `src/world/entities.ts` — `EntityKind` 유니온 + `ENTITY_GLYPH` + 선호 바이옴 + 스폰 수
2. `src/world/simulation.ts` — 근접 메시지 텍스트 배열 추가
3. `src/App.css` — `.tile-entity--<name>` CSS 규칙 (선택)

### 맵 레이어 추가

1. `src/App.tsx` — `MapLayer` 유니온에 값 추가
2. `src/App.tsx` — `glyphAt()` + `classAt()` 분기 추가
3. `src/App.tsx` — `layerButtons` JSX에 버튼 추가
4. `src/App.css` — 레이어 전용 CSS 클래스 추가

### 나래이션 추가

1. `src/world/narration.ts` — `LINES` 배열에 `{ id, text, tags, weight }` 항목 추가
2. 태그: `common`, `forest`, `plains`, `water`, `desert`, `mountain`, `sky`, `lore`, `time`, `sensory`

### 시뮬레이션 이벤트 타입 추가

1. `src/world/simulation.ts` — `SimEvent['type']` 유니온에 값 추가
2. `src/ui/ConsoleLog.tsx` — 이벤트 타입별 색상 스타일 추가

---

## 10. 성능 고려사항

| 항목 | 현재 구현 | 주의 |
|------|-----------|------|
| 엔티티 조회 | `Map<number, Entity>` (O(1)) | `useMemo` 의존성: `[entities, world.width]` |
| GridView 렌더 | 행별 `<div>` + 셀별 `<span>` | 80×40 = 3,200 span — React diffing |
| 이벤트 위임 | `<pre>`에 pointer event → `data-cx/cy` | 셀별 onClick 절대 안 달 것 |
| 콜백 안정성 | `useCallback` + ref 패턴 | 의존성에 자주 변하는 값 넣지 말 것 |
| 로그 제한 | 최대 60개 (addLog에서 prune) | ConsoleLog에서 최대 40개 표시 |
| 폰트 크기 | ResizeObserver + 가로:세로 비율 계산 | 최대 13.6px, Courier New 가정 |
