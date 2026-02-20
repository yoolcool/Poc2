import type { EntityKind } from './entities';

export type LogType = 'info' | 'encounter' | 'system' | 'tick' | 'narration';

export type SimEvent = {
  id: number;
  type: LogType;
  text: string;
};

/** Per-entity proximity state tracked across ticks. */
export type EntityNearRecord = { wasNear: boolean; lastSpokeAt: number };
/** Map from entity id → proximity record. */
export type NearStateMap = Map<number, EntityNearRecord>;

/** Korean encounter messages per entity kind. */
const ENCOUNTER_MESSAGES: Record<EntityKind, string[]> = {
  goat: [
    '염소가 호기심 어린 눈으로 당신을 바라봅니다.',
    '염소가 "메에~" 하고 울며 옆으로 비켜섭니다.',
    '산염소가 발굽으로 바위를 또각또각 두드립니다.',
    '염소가 무심하게 풀을 뜯다가 당신을 발견했습니다.',
  ],
  bird: [
    '새가 깃털을 부르르 떨며 날아오릅니다.',
    '"짹짹!" — 작은 새 한 마리가 가지 위에서 당신을 살핍니다.',
    '화려한 새 한 마리가 머리 위를 선회합니다.',
    '새가 멀리 날아가며 맑은 노래를 남깁니다.',
  ],
  frog: [
    '개구리가 깜짝 놀라 연못 속으로 뛰어듭니다.',
    '"개굴개굴~" 개구리가 돌 위에 앉아 당신을 바라봅니다.',
    '청개구리가 잎사귀 사이에 납작 엎드립니다.',
    '개구리가 긴 혀를 낼름 내밀었다 거둡니다.',
  ],
  wanderer: [
    '낯선 방랑자가 모자를 눌러쓰며 말없이 지나칩니다.',
    '방랑자가 쉰 목소리로 중얼거립니다: "이 길은 위험하오…"',
    '후드를 깊이 눌러쓴 방랑자가 당신에게 고개를 끄덕입니다.',
    '방랑자가 낡은 지도를 잠시 들여다보다 주머니에 넣습니다.',
  ],
};


/**
 * Set to true (or flip in browser console: `window.__debugProx=true`)
 * to print a line per entity every time proximity is evaluated.
 */
export let DEBUG_PROXIMITY = false;

/** Proximity radius (Chebyshev distance) to trigger encounter messages. */
const NEAR_RADIUS = 2;

/** Minimum ticks between two messages from the same entity. */
const COOLDOWN_TICKS = 30;

/** Base speak probability per encounter entry event. */
const SPEAK_PROB: Record<EntityKind, number> = {
  wanderer: 0.60,
  goat:     0.35,
  bird:     0.35,
  frog:     0.35,
};

/** Chebyshev distance (max of |dx|, |dy|). */
function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

/** Deterministic float in [0, 1) for probability gate. */
function deterministicRand(seed: number, entityId: number, tick: number): number {
  let h = (seed ^ entityId * 0x9e3779b9 ^ tick * 0x6b43) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Update proximity state for all entities and return at most one encounter
 * message (or null).
 *
 * Trigger rules:
 *  1. FAR → NEAR transition only (entry event).
 *  2. Per-entity cooldown of COOLDOWN_TICKS ticks.
 *  3. Probabilistic gate (SPEAK_PROB per kind).
 *  4. Global throttle: at most 1 message returned.
 *  5. Wanderer messages have priority over animal messages.
 *
 * @param nearState - mutable Map; updated in-place (caller may treat it as immutable by copying first).
 */
export function updateProximity(
  cursorX: number,
  cursorY: number,
  entities: { id: number; kind: EntityKind; x: number; y: number }[],
  nearState: NearStateMap,
  tick: number,
  seed: number,
): string | null {
  type Candidate = { kind: EntityKind; msg: string };
  const candidates: Candidate[] = [];

  for (const e of entities) {
    const dist = chebyshev(cursorX, cursorY, e.x, e.y);
    const isNearNow = dist <= NEAR_RADIUS;
    const prev = nearState.get(e.id) ?? { wasNear: false, lastSpokeAt: -999 };

    const enteredNear = !prev.wasNear && isNearNow;

    // Update wasNear regardless of whether we speak.
    nearState.set(e.id, { wasNear: isNearNow, lastSpokeAt: prev.lastSpokeAt });

    if (DEBUG_PROXIMITY && isNearNow) {
      const cooldownOk = tick - prev.lastSpokeAt >= COOLDOWN_TICKS;
      // eslint-disable-next-line no-console
      console.log(
        `[DEBUG] entity ${e.kind}-${e.id} dist=${dist}` +
        ` enteredNear=${enteredNear} wasNear=${prev.wasNear}` +
        ` cooldownOk=${cooldownOk}` +
        ` (tick=${tick} lastSpokeAt=${prev.lastSpokeAt})`,
      );
    }

    if (enteredNear && tick - prev.lastSpokeAt >= COOLDOWN_TICKS) {
      const r = deterministicRand(seed, e.id, tick);
      if (r < SPEAK_PROB[e.kind]) {
        const msgs = ENCOUNTER_MESSAGES[e.kind];
        const idx = (e.x * 7 + e.y * 13 + tick) % msgs.length;
        candidates.push({ kind: e.kind, msg: msgs[idx] });
        // Record lastSpokeAt immediately so multiple candidates in the same
        // call don't each update it independently.
        nearState.set(e.id, { wasNear: isNearNow, lastSpokeAt: tick });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Priority: wanderer first, then first in list.
  const chosen = candidates.find((c) => c.kind === 'wanderer') ?? candidates[0];
  return chosen.msg;
}

