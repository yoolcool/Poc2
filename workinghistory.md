# Working History

AI 에이전트가 이전 작업 맥락을 빠르게 파악하기 위한 작업 이력 문서.
각 항목은 **무엇을 왜 했는지**, **핵심 변경**, **교훈/주의사항**을 포함합니다.

---

## Phase 1: 기반 인프라 (Day 1-2)

### 1-1. 프로젝트 초기화 (`db9d288`)
- **작업**: Vite 7 + React 19 + TypeScript strict 세팅
- **변경**: `package.json`, `vite.config.ts`, `tsconfig.json` 생성
- **결정 사유**: 순수 프론트엔드 SPA, 서버 없이 브라우저에서 동작하는 텍스트 세계 시뮬레이션
- **교훈**: 없음 (초기 세팅)

### 1-2. 결정론적 RNG + 노이즈 오버월드 생성 (V1)
- **작업**: xorshift32 PRNG 구현, 80×40 오버월드 생성
- **변경**: `src/world/rng.ts`, `src/world/overworld.ts`, `src/world/types.ts`
- **결정 사유**: 외부 노이즈 라이브러리 없이 자체 구현 → 번들 크기 최소화 + 완전한 결정성
- **알고리즘**: 8셀 스케일 coarse grid → bilinear interpolation → 바이옴 분류
- **교훈**: `hashSeed()` 로 좌표별 고유 시드 생성 패턴이 이후 모든 모듈에서 재사용됨

### 1-3. GridView + Inspector 초기 버전
- **작업**: `<pre>` + `<span>` 기반 텍스트 맵 렌더러, 바이옴 정보 패널
- **변경**: `src/ui/GridView.tsx`, `src/ui/Inspector.tsx`
- **결정 사유**: Canvas 대신 DOM 기반 → CSS로 셀별 색상 제어 용이
- **교훈**: ResizeObserver로 동적 폰트 크기 조절하는 패턴 확립

---

## Phase 2: 엔티티 & 상호작용 (Day 3)

### 2-1. 엔티티 시스템 (`9906676`)
- **작업**: 4종 NPC(염소/새/개구리/방랑자) 12마리 스폰 + 1초 틱 이동
- **변경**: `src/world/entities.ts`
- **결정 사유**: 바이옴 선호도 기반 배치로 세계에 생동감 추가
- **알고리즘**: `hashSeed(seed, entityId, tick)` → 4방향 랜덤 이동, 개구리만 물 이동 가능
- **교훈**: 엔티티 위치를 O(1)로 조회하기 위해 `Map<number, Entity>` (`y*width+x` 키) 패턴 도입

### 2-2. 콘솔 로그 + 타입라이터 효과
- **작업**: 이벤트 로그를 한 글자씩 표시하는 ConsoleLog 컴포넌트
- **변경**: `src/ui/ConsoleLog.tsx`
- **결정 사유**: 분위기 있는 텍스트 RPG 느낌
- **교훈**: `Array.from(text)` 사용 필수 — 한국어 유니코드 안전 처리. `string[i]`는 서로게이트 페어에서 깨짐

### 2-3. NPC 근접 메시지 시스템 (`simulation.ts`)
- **작업**: 커서가 NPC 근처(Chebyshev ≤ 2)로 진입 시 한국어 대사 출력
- **변경**: `src/world/simulation.ts`
- **알고리즘**: FAR→NEAR 전환 감지, 30틱 쿨다운, 확률 게이트(방랑자 60% / 동물 35%), 호출당 최대 1메시지
- **교훈**: `updateProximity()`를 엔티티 틱에서도 호출하면 `wasNear=true`가 선점돼 커서 이동 시 항상 `enteredNear=false` → **틱 이펙트에서 제거하고 커서 이동 이펙트에서만 호출해야 함** (2-5에서 수정)

### 2-4. BottomPanel + 모바일 UI (`9b7318b`)
- **작업**: 드래그 리사이즈 하단 패널, 3단계 스냅, 탭(콘솔/맵정보), D-pad
- **변경**: `src/ui/BottomPanel.tsx`, `src/ui/TouchPad.tsx`
- **교훈**: iPad safe-area 영역에서 D-pad가 가려지는 문제 → `env(safe-area-inset-bottom)` 패딩 필요

### 2-5. NPC 마주침 버그 수정 (`dbc4868`)
- **문제**: 틱 이펙트에서 `updateProximity()` 호출 → `wasNear=true` 선점 → 실제 커서 이동 시 FAR→NEAR 감지 불가
- **수정**: `updateProximity()`를 틱 이펙트에서 완전히 제거, 커서 이동 이펙트에서만 호출
- **교훈**: **부수 효과(side effect)가 있는 함수는 호출 시점에 주의**. 같은 함수를 여러 useEffect에서 호출하면 상태 오염 발생

---

## Phase 3: 나래이션 시스템

### 3-1. 80줄 한국어 서정 나래이션 (`740a1e5`)
- **작업**: 바이옴 태그 기반 분위기 텍스트 자동 출력
- **변경**: `src/world/narration.ts`
- **알고리즘**: Fisher-Yates 셔플백 → 8틱 쿨다운 + 18% 확률 + 최근 12개 비반복 + NPC 대사 미충돌
- **교훈**: 셔플백 알고리즘이 단순 랜덤보다 "모든 문장을 한 번씩 보여주는" 경험에 좋음

---

## Phase 4: Zone 시스템

### 4-1. Zone 타입 & 결정적 생성기 (`7b8703a`)
- **작업**: 오버월드 셀을 80×25 상세 맵으로 확대
- **변경**: `src/world/zoneTypes.ts`, `src/world/zone.ts`, `src/world/zone.test.ts`
- **알고리즘**: 2-패스 생성 (독립 RNG 기반 타일 → 이웃 참조 보정: 클러스터 부스트, 수변 연쇄, 고도/습도 보정)
- **테스트**: Vitest 24개 (결정성, 바이옴 분포, 클러스터링, 플래그)
- **교훈**: `vitest.config.ts`를 `vite.config.ts`와 분리해야 Vercel `tsc -b` 빌드에서 타입 오류 안 남

### 4-2. Zone 모드 전환 + 모바일 UI (`d593005`)
- **작업**: overworld ↔ zone 모드 전환, ActionBar, ZoneInspector
- **변경**: `src/App.tsx`, `src/ui/ActionBar.tsx`, `src/ui/ZoneInspector.tsx`
- **교훈**: `modeRef` / `zoneRef` 패턴으로 stale closure 방지 — `useCallback` 의존성에 mode/zone을 넣으면 리렌더 폭발

### 4-3. GridView 범용화 + 셀 탭 (`e9e4ae9`)
- **작업**: GridView를 콜백 기반(`glyphAt`, `classAt`)으로 리팩터링
- **변경**: `src/ui/GridView.tsx`, `src/App.tsx`
- **결정 사유**: overworld와 zone 두 모드에서 같은 GridView 사용
- **알고리즘**: 셀별 `data-cx/data-cy` 어트리뷰트 → pointer capture → tap/swipe 분기 (25px 임계)
- **교훈**: 셀별 onClick 핸들러 대신 `<pre>` 하나에 이벤트 위임 → 수천 개 클로저 생성 방지

---

## Phase 5: V2 대륙형 월드젠 (`5723977`)

### 5-1. Continental Generator V2
- **작업**: 기존 V1(단순 노이즈)을 대체하는 사실적 대륙 기반 생성기
- **변경**: `src/world/gen/v2/` (5파일 신규)
- **파이프라인**: heightMap(대륙 마스크 + 릿지) → 동적 해수면(55% 바다) → D8 강/호수 → 기후(위도 온도 + 강수 그림자) → 바이옴
- **교훈**: D8 흐름 누적은 높은 셀부터 처리해야 함 → 정렬된 셀 배열에서 순회

---

## Phase 6: V3 구조 기반 월드젠 (`f2a16da`, `0dfc24e`)

### 6-1. Structure-Driven WorldGen V3
- **작업**: V2의 "자연 시뮬레이션" 대신 "구조 우선" 접근으로 전환
- **변경**: `src/world/gen/v3/` (7파일 신규), `src/App.tsx` (V3 연결)
- **파이프라인** (6단계):
  1. `oceanMask` — 고정 바다(서/남) + 유기적 인렛/반도
  2. `spine` — 북쪽 산맥 폴리라인 (6-9 제어점, 가우시안 반경)
  3. `rivers` — S-curve 강 (산맥→바다) + 중류 호수 + 지류
  4. `landmarks` — 밀림·특수지대·늪 (flood-fill blob)
  5. `biomes` — 우선순위 기반 채움 (산기슭 숲대, 해변, 강수 그림자)
  6. 합성 height/moisture 맵 (OverworldCell 호환)
- **결정 사유**: V2는 랜덤성이 강해 "산맥은 북쪽, 강은 남으로" 같은 구조적 의도를 보장 못함
- **교훈**: 바이옴을 추가할 때 `types.ts`의 Biome 유니온, `tileClasses.ts`의 글리프/클래스, `App.css`의 색상, `biomes.ts`의 생성 규칙, `Inspector.tsx`의 범례까지 5곳을 모두 수정해야 함

### 6-2. 조밀 글리프 + 고대비 팔레트
- **작업**: Unicode 글리프(≋ ♣ ♠ ▲ ━ ◈ ◉ ∴ ░ ▒) 적용, 13개 바이옴 색상 강화
- **변경**: `src/ui/tileClasses.ts`, `src/App.css`
- **교훈**: 모노스페이스 폰트에서 전각 Unicode 글자는 폭이 다를 수 있음 → Courier New/monospace 기준 테스트 필요

### 6-3. 빌드 에러 수정 (`0dfc24e`)
- **문제**: 미사용 import + `biomes.ts`에서 새 바이옴의 가중치 누락
- **수정**: 미사용 import 제거, 누락된 바이옴 가중치 항목 추가
- **교훈**: **바이옴 추가 시 가중치 테이블도 반드시 갱신** — TypeScript가 Record의 키 누락을 잡아주지 못하는 경우가 있음

---

## Phase 7: iPad/모바일 수정 (`ba514be`, `71f7395`)

### 7-1. iPad safe-area D-pad 클리핑 수정
- **문제**: iPad 가로 모드에서 D-pad가 safe-area에 가려짐
- **수정**: `.dpad-fixed`에 `bottom: calc(env(safe-area-inset-bottom) + 12px)` 적용
- **교훈**: iPad Safari는 `env(safe-area-inset-bottom)`이 48px까지 될 수 있음

### 7-2. NPC 첫 조우 보장 (`71f7395`)
- **작업**: `hasMetPlayer` 플래그 추가 — 첫 만남은 확률 게이트 무시하고 반드시 대사 출력
- **변경**: `src/world/simulation.ts`
- **교훈**: 확률 게이트만으로는 플레이어가 NPC를 한 번도 만나지 못할 수 있음

---

## 현재 상태 (2026-02-21)

- **활성 생성기**: V3 (`src/world/gen/v3/pipeline.ts`)
- **V2**: 코드 유지되나 미사용 (참조/비교용)
- **V1**: `src/world/overworld.ts`에 존재, 미사용
- **브랜치**: `claude/setup-mobile-ui-RrCYN`
- **테스트**: 24개 전부 통과
- **배포**: Vercel (빌드: `tsc -b && vite build`)

---

## 미구현 백로그

- Zone 내 엔티티 (스폰 + 이동)
- Zone 간 이동 (방향키로 경계 넘기)
- 오버레이 시스템 (바이옴·고도·습도·POI 히트맵)
- 저장/불러오기 (localStorage)
- 다국어 나래이션 (영어)
- Zone 전투/상호작용
- 미니맵
