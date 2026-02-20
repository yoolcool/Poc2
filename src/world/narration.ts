import { createRNG, hashSeed } from './rng';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NarrationLine = {
  id: string;
  text: string;
  tags?: string[];
  weight?: number;
};

export type NarrationState = {
  bag: string[];       // narration ids in shuffled order
  index: number;       // next unread position in bag
  recentIds: string[]; // recently emitted ids (dequeue, max RECENT_WINDOW)
  lastTick: number;    // tick when last narration was emitted
  reshuffleCount: number;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum ticks between narration lines. */
const NARRATION_COOLDOWN = 8;
/** Probability of emitting a narration on a successful move (0–1). */
const NARRATION_CHANCE   = 0.18;
/** Number of recent ids to remember (no repeat within this window). */
const RECENT_WINDOW = 12;
/** Max times we retry the bag to find a non-recent, tag-compatible line. */
const MAX_ATTEMPTS = 10;

/** Maps overworld biome names → narration tag. */
const BIOME_TO_TAG: Record<string, string> = {
  water:          'water',
  forest:         'forest',
  desert:         'desert',
  plains:         'plains',
  rocky_mountain: 'mountain',
  alpine:         'mountain',
};

// ---------------------------------------------------------------------------
// Narration pool (80 lines)
// ---------------------------------------------------------------------------

export const NARRATION_LINES: NarrationLine[] = [
  // 공통(분위기)
  { id: 'n001', text: '바람이 풀잎 사이로 길을 내며 지나갑니다.' },
  { id: 'n002', text: '하늘이 낮게 가라앉아, 먼 곳의 기척이 가까워집니다.' },
  { id: 'n003', text: '발아래 흙은 조용히 숨을 쉬고 있습니다.' },
  { id: 'n004', text: '어딘가에서 오래된 이야기의 끝자락이 스쳐갑니다.' },
  { id: 'n005', text: '바람결에 묻은 낯선 냄새가 잠깐 머물다 사라집니다.' },
  { id: 'n006', text: '잠시 고요가 내려앉아, 주변이 또렷해집니다.' },
  { id: 'n007', text: '멀리서 들려오는 소리들이 한 줄기 리듬을 만듭니다.' },
  { id: 'n008', text: '하늘빛이 바뀌며, 땅의 색도 조금씩 달라집니다.' },
  { id: 'n009', text: '어딘가의 물결이 시간을 천천히 밀어냅니다.' },
  { id: 'n010', text: '발걸음이 남긴 흔적이 금세 바람에 희미해집니다.' },

  // 숲/초원
  { id: 'n011', text: '숲은 말없이 길을 열어주고, 다시 닫아버립니다.', tags: ['forest'] },
  { id: 'n012', text: '나뭇잎들이 서로 부딪히며 작은 약속을 나눕니다.', tags: ['forest'] },
  { id: 'n013', text: '초원 위로 햇빛이 흩어져, 반짝이는 점들이 생깁니다.', tags: ['plains'] },
  { id: 'n014', text: '풀잎 끝에 맺힌 물방울이 잠깐 세상을 비춥니다.', tags: ['plains', 'forest'] },
  { id: 'n015', text: '어디선가 새가 울고, 그 소리가 길의 방향을 바꿉니다.', tags: ['forest', 'plains'] },
  { id: 'n016', text: '나무 그늘이 길게 늘어나며, 숨을 고르게 합니다.', tags: ['forest'] },
  { id: 'n017', text: '풀밭 사이로 작은 생명들이 바쁘게 오갑니다.', tags: ['plains'] },
  { id: 'n018', text: '숲의 냄새가 짙어졌다가, 이내 연해집니다.', tags: ['forest'] },
  { id: 'n019', text: '바람이 나무껍질을 스치며 낮은 소리를 냅니다.', tags: ['forest'] },
  { id: 'n020', text: '초원은 넓고, 마음은 더 넓어지는 듯합니다.', tags: ['plains'] },

  // 물/습지
  { id: 'n021', text: '물가에서 작은 파문이 번졌다가 잦아듭니다.', tags: ['water'] },
  { id: 'n022', text: '습한 공기가 피부에 닿아, 계절을 말해줍니다.', tags: ['water'] },
  { id: 'n023', text: '갈대가 흔들리며, 보이지 않는 길을 가리킵니다.', tags: ['water'] },
  { id: 'n024', text: '얕은 물이 햇빛을 삼키며 짙은 푸름이 됩니다.', tags: ['water'] },
  { id: 'n025', text: '물소리가 가까워졌다가 멀어집니다.', tags: ['water'] },
  { id: 'n026', text: '물결이 돌에 부딪혀, 작은 은빛을 튀깁니다.', tags: ['water'] },
  { id: 'n027', text: '어딘가에서 개구리 울음이 여운처럼 남습니다.', tags: ['water'] },
  { id: 'n028', text: '물은 길을 만들고, 길은 다시 물을 부릅니다.', tags: ['water'] },
  { id: 'n029', text: '강가에 쌓인 돌들은 오랜 세월을 기억합니다.', tags: ['water'] },
  { id: 'n030', text: '얕은 여울이 발아래로 빛을 쏟아냅니다.', tags: ['water'] },

  // 사막/건조
  { id: 'n031', text: '건조한 바람이 모래알을 굴리며 속삭입니다.', tags: ['desert'] },
  { id: 'n032', text: '뜨거운 공기가 먼 곳을 아지랑이로 지웁니다.', tags: ['desert'] },
  { id: 'n033', text: '바싹 마른 흙에서 먼지가 조용히 일어납니다.', tags: ['desert'] },
  { id: 'n034', text: '햇빛이 강해져, 그림자가 더 선명해집니다.', tags: ['desert'] },
  { id: 'n035', text: '모래 위의 흔적이 바람에 조금씩 깎여 나갑니다.', tags: ['desert'] },
  { id: 'n036', text: '멀리서 무엇인가 반짝였지만, 이내 사라집니다.', tags: ['desert'] },
  { id: 'n037', text: '갈증은 조심하라는 오래된 경고 같습니다.', tags: ['desert'] },
  { id: 'n038', text: '공기가 메말라, 숨소리마저 또렷합니다.', tags: ['desert'] },
  { id: 'n039', text: '낮은 소리로 모래가 흘러내립니다.', tags: ['desert'] },
  { id: 'n040', text: '사막은 텅 비어 보여도, 무언가를 숨기고 있습니다.', tags: ['desert'] },

  // 산/고지
  { id: 'n041', text: '바위가 바람을 받아, 낮게 울립니다.', tags: ['mountain'] },
  { id: 'n042', text: '고도가 높아질수록 하늘이 가까워지는 느낌입니다.', tags: ['mountain'] },
  { id: 'n043', text: '바위틈에서 작은 이끼가 묵묵히 버티고 있습니다.', tags: ['mountain'] },
  { id: 'n044', text: '산등성이가 길을 가르며, 다른 풍경을 예고합니다.', tags: ['mountain'] },
  { id: 'n045', text: '돌멩이가 굴러가며, 짧은 소리를 남깁니다.', tags: ['mountain'] },
  { id: 'n046', text: '바람이 강해져, 옷깃을 세우게 됩니다.', tags: ['mountain'] },
  { id: 'n047', text: '바위의 그늘은 차갑고, 햇빛은 날카롭습니다.', tags: ['mountain'] },
  { id: 'n048', text: '멀리서 독수리 같은 그림자가 천천히 지나갑니다.', tags: ['mountain'] },
  { id: 'n049', text: '산은 말이 없지만, 당신을 보고 있습니다.', tags: ['mountain'] },
  { id: 'n050', text: '높은 곳의 공기는 낯설 만큼 맑습니다.', tags: ['mountain'] },

  // 날씨/하늘
  { id: 'n051', text: '구름이 겹겹이 쌓이며, 빛이 한 겹 얇아집니다.', tags: ['sky'] },
  { id: 'n052', text: '먼 곳에서 천둥이 낮게 울리고, 곧 고요가 뒤따릅니다.', tags: ['sky'] },
  { id: 'n053', text: '바람이 방향을 바꿉니다. 비가 올지도 모릅니다.', tags: ['sky'] },
  { id: 'n054', text: '하늘이 잠깐 열리며, 햇살이 한 줄기 떨어집니다.', tags: ['sky'] },
  { id: 'n055', text: '먼지 냄새가 스치고 지나가, 비의 기척을 남깁니다.', tags: ['sky'] },
  { id: 'n056', text: '공기가 미세하게 떨리며, 날씨가 바뀌고 있음을 알립니다.', tags: ['sky'] },
  { id: 'n057', text: '구름 그림자가 땅 위를 느리게 이동합니다.', tags: ['sky'] },
  { id: 'n058', text: '하늘에서 빛이 새어 나와, 풍경이 잠깐 부드러워집니다.', tags: ['sky'] },
  { id: 'n059', text: '먼 곳의 번개가 하늘을 긁고 지나갑니다.', tags: ['sky'] },
  { id: 'n060', text: '천둥 소리는 멀지만, 마음에는 가까이 울립니다.', tags: ['sky'] },

  // 유적/낯선 기척(세계관 향)
  { id: 'n061', text: '어딘가에 오래된 돌무더기가 잠들어 있을 것 같습니다.', tags: ['lore'] },
  { id: 'n062', text: '바람이 낡은 기계의 냄새를 실어 나르는 듯합니다.', tags: ['lore'] },
  { id: 'n063', text: '발밑에서 금속성 울림이 느껴졌다가 사라집니다.', tags: ['lore'] },
  { id: 'n064', text: '먼 곳에 남겨진 흔적들이, 누군가의 시간을 말합니다.', tags: ['lore'] },
  { id: 'n065', text: '세상은 여러 번 무너졌고, 그래도 다시 이어졌습니다.', tags: ['lore'] },
  { id: 'n066', text: '한때 빛나던 것들의 그림자가 여전히 남아 있습니다.', tags: ['lore'] },
  { id: 'n067', text: '낡은 길은 아직도 누군가를 기다리는 듯합니다.', tags: ['lore'] },
  { id: 'n068', text: '보이지 않는 표식이 길의 옆을 따라갑니다.', tags: ['lore'] },
  { id: 'n069', text: '침묵 속에서, 오래된 이름 하나가 떠오릅니다.', tags: ['lore'] },
  { id: 'n070', text: '바람이 지나간 자리에서, 아주 희미한 기계음이 들립니다.', tags: ['lore'] },

  // 시간/호흡
  { id: 'n071', text: '빛이 누그러지며, 풍경의 모서리가 부드러워집니다.', tags: ['time'] },
  { id: 'n072', text: '고요한 순간이 지나가고, 또 다른 고요가 옵니다.', tags: ['time'] },
  { id: 'n073', text: '당신의 호흡이 길과 박자를 맞춥니다.', tags: ['time'] },
  { id: 'n074', text: '길은 계속되고, 마음도 함께 이어집니다.', tags: ['time'] },
  { id: 'n075', text: '잠깐 멈추면, 세상이 먼저 움직이는 것을 느낍니다.', tags: ['time'] },

  // 감각/정서(범용)
  { id: 'n076', text: '가까운 곳에서 풀 냄새가 짙게 올라옵니다.' },
  { id: 'n077', text: '당신은 잠깐 웃을 뻔했지만, 그냥 걸음을 이어갑니다.' },
  { id: 'n078', text: '발걸음이 가벼워졌다가, 다시 제자리로 돌아옵니다.' },
  { id: 'n079', text: '눈앞의 풍경이 익숙해질수록, 낯선 디테일이 보입니다.' },
  { id: 'n080', text: '이 세계는 크고, 당신의 여정은 그만큼 조용히 깊습니다.' },
];

// Pre-built lookup: id → NarrationLine
const NARRATION_MAP = new Map<string, NarrationLine>(
  NARRATION_LINES.map((l) => [l.id, l]),
);

// ---------------------------------------------------------------------------
// Fisher-Yates shuffle using a seeded RNG.
// ---------------------------------------------------------------------------
function shuffleIds(ids: string[], rng: () => number): string[] {
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Deterministic float [0, 1) for probability gate (no external RNG import needed).
function detRand(seed: number, entityId: number, tick: number): number {
  let h = (seed ^ entityId * 0x9e3779b9 ^ tick * 0x6b43c7) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Create a fresh NarrationState for a given world seed. */
export function initNarration(seed: number): NarrationState {
  const rng = createRNG(hashSeed(seed, 0xfa1ce123));
  const ids = NARRATION_LINES.map((l) => l.id);
  return {
    bag: shuffleIds(ids, rng),
    index: 0,
    recentIds: [],
    lastTick: -999,
    reshuffleCount: 0,
  };
}

/**
 * Try to emit a narration line when the player moves.
 *
 * Rules (all must pass):
 *  1. Cooldown: at least NARRATION_COOLDOWN ticks since last narration.
 *  2. Collision: `hadOtherMessageThisTick` must be false (no NPC/encounter
 *     message in this same move).
 *  3. Probability: 18% chance per successful move.
 *  4. Non-repeat: the picked line must not be in the recent-window (last 12).
 *  5. Biome affinity: prefer lines whose tags include the current biome.
 *
 * The state parameter is treated as immutable — a new NarrationState is
 * returned even when nothing is emitted, so callers should always replace
 * their stored state.
 */
export function maybeEmitNarration(
  seed: number,
  tick: number,
  biome: string,
  hadOtherMessageThisTick: boolean,
  state: NarrationState,
): { state: NarrationState; line?: { id: string; text: string } } {
  // 1. Cooldown gate
  if (tick - state.lastTick < NARRATION_COOLDOWN) return { state };

  // 2. Collision gate
  if (hadOtherMessageThisTick) return { state };

  // 3. Probability gate (deterministic, movement-based)
  if (detRand(seed, 0xabc123, tick) >= NARRATION_CHANCE) return { state };

  // 4–5. Pick from shuffle bag (tag-aware, non-repeat)
  const biomeTag = BIOME_TO_TAG[biome] ?? null;
  let next = { ...state };
  let pickedLine: NarrationLine | null = null;
  let tagFallback: NarrationLine | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Advance bag, reshuffling when exhausted.
    if (next.index >= next.bag.length) {
      const rng = createRNG(hashSeed(seed, next.reshuffleCount + 1, tick));
      next = {
        ...next,
        bag: shuffleIds(NARRATION_LINES.map((l) => l.id), rng),
        index: 0,
        reshuffleCount: next.reshuffleCount + 1,
      };
    }

    const id = next.bag[next.index];
    next = { ...next, index: next.index + 1 };

    // Skip recently-used lines.
    if (next.recentIds.includes(id)) continue;

    const line = NARRATION_MAP.get(id);
    if (!line) continue;

    // Check tag affinity.
    const noTag = !line.tags || line.tags.length === 0;
    const tagMatch = biomeTag !== null && (line.tags?.includes(biomeTag) ?? false);

    if (noTag || tagMatch) {
      pickedLine = line;
      break;
    } else if (!tagFallback) {
      // Keep as fallback (has tags, but none match current biome).
      tagFallback = line;
    }
  }

  const chosen = pickedLine ?? tagFallback;
  if (!chosen) return { state: next };

  const newRecent = [...next.recentIds, chosen.id].slice(-RECENT_WINDOW);
  const finalState: NarrationState = {
    ...next,
    recentIds: newRecent,
    lastTick: tick,
  };

  return { state: finalState, line: { id: chosen.id, text: chosen.text } };
}
