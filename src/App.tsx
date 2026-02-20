import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { serializeOverworld } from './world/overworld';
import type { Overworld, OverworldCell } from './world/types';
import { runWorldGenV2 } from './world/gen/v2/pipeline';
import type { WorldGenV2Result } from './world/gen/v2/types';
import { spawnEntities, tickEntities, ENTITY_GLYPH } from './world/entities';
import type { Entity } from './world/entities';
import { updateProximity } from './world/simulation';
import type { SimEvent, NearStateMap } from './world/simulation';
import { initNarration, maybeEmitNarration } from './world/narration';
import type { NarrationState } from './world/narration';
import { generateZone } from './world/zone';
import type { Zone } from './world/zoneTypes';
import { GridView } from './ui/GridView';
import { Inspector } from './ui/Inspector';
import { ZoneInspector } from './ui/ZoneInspector';
import { ActionBar } from './ui/ActionBar';
import type { ViewMode } from './ui/ActionBar';
import { ConsoleLog } from './ui/ConsoleLog';
import { BottomPanel } from './ui/BottomPanel';
import { TouchPad } from './ui/TouchPad';
import { BIOME_CHAR, BIOME_CLASS } from './ui/tileClasses';
import './App.css';

const WORLD_WIDTH  = 80;
const WORLD_HEIGHT = 40;
const TICK_INTERVAL_MS = 1000;

export type MapLayer = 'biome' | 'height' | 'rivers';

/** Build an Overworld + v2 raw data from the v2 pipeline. */
function buildWorldV2(seed: number): { world: Overworld; v2: WorldGenV2Result } {
  const v2 = runWorldGenV2(seed, { width: WORLD_WIDTH, height: WORLD_HEIGHT });
  const cells: OverworldCell[] = [];
  for (let y = 0; y < WORLD_HEIGHT; y++) {
    for (let x = 0; x < WORLD_WIDTH; x++) {
      cells.push({
        height: v2.heightMap[y][x],
        moisture: v2.moisture[y][x],
        biome: v2.biomeMap[y][x],
      });
    }
  }
  return { world: { width: WORLD_WIDTH, height: WORLD_HEIGHT, cells }, v2 };
}

function simpleHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
    h = h >>> 0;
  }
  return h;
}

const INITIAL_SEED = 12345;
/** Zone dimensions when entering from overworld. */
const ZONE_W = 80;
const ZONE_H = 25;

// ---- Height-layer glyph/class helpers -----------------------------------

function heightGlyph(h: number): string {
  if (h < 0.10) return ' ';
  if (h < 0.25) return '~';
  if (h < 0.35) return '.';
  if (h < 0.50) return '-';
  if (h < 0.65) return '=';
  if (h < 0.78) return '#';
  return '^';
}

function heightClass(h: number): string {
  if (h < 0.10) return 'tile-h-deep';
  if (h < 0.25) return 'tile-h-ocean';
  if (h < 0.35) return 'tile-h-shore';
  if (h < 0.50) return 'tile-h-low';
  if (h < 0.65) return 'tile-h-mid';
  if (h < 0.78) return 'tile-h-high';
  if (h < 0.88) return 'tile-h-mount';
  return 'tile-h-peak';
}

// ---- Initial build (run once) -------------------------------------------

const initialBuild = buildWorldV2(INITIAL_SEED);

export default function App() {
  const [seed, setSeed]           = useState<number>(INITIAL_SEED);
  const [inputSeed, setInputSeed] = useState<string>(String(INITIAL_SEED));
  const [world, setWorld]         = useState<Overworld>(() => initialBuild.world);
  const [v2Data, setV2Data]       = useState<WorldGenV2Result>(() => initialBuild.v2);
  const [cursorX, setCursorX]     = useState(0);
  const [cursorY, setCursorY]     = useState(0);
  const [entities, setEntities]   = useState<Entity[]>(() =>
    spawnEntities(INITIAL_SEED, initialBuild.world),
  );
  const [tick, setTick]   = useState(0);
  const [logs, setLogs]   = useState<SimEvent[]>([]);

  // ---- Map layer toggle -------------------------------------------------
  const [mapLayer, setMapLayer] = useState<MapLayer>('biome');
  const mapLayerRef = useRef(mapLayer);
  useEffect(() => { mapLayerRef.current = mapLayer; }, [mapLayer]);
  const v2Ref = useRef(v2Data);
  useEffect(() => { v2Ref.current = v2Data; }, [v2Data]);

  // ---- Zone state -------------------------------------------------------
  const [mode, setMode]         = useState<ViewMode>('overworld');
  const [zone, setZone]         = useState<Zone | null>(null);
  const [zoneCursor, setZoneCursor] = useState({ x: 0, y: 0 });
  const [zoneOrigin, setZoneOrigin] = useState<{
    ox: number; oy: number; depth: number;
  } | null>(null);

  const logIdRef      = useRef(0);
  const seedRef       = useRef(seed);
  const cursorRef     = useRef({ x: 0, y: 0 });
  const entitiesRef   = useRef<Entity[]>(entities);
  // NearState is mutated in-place by updateProximity — a ref avoids re-renders.
  const nearStateRef      = useRef<NearStateMap>(new Map());
  const narrationStateRef = useRef<NarrationState>(initNarration(INITIAL_SEED));
  // worldRef lets the cursor-move effect read the current world without being
  // added to that effect's dependency array (world only changes on regenerate).
  const worldRef = useRef(world);

  // Keep refs in sync with state.
  useEffect(() => { seedRef.current = seed; }, [seed]);
  useEffect(() => { cursorRef.current = { x: cursorX, y: cursorY }; }, [cursorX, cursorY]);
  useEffect(() => { entitiesRef.current = entities; }, [entities]);
  useEffect(() => { worldRef.current = world; }, [world]);

  /** Append at most one log entry per call. */
  const addLog = useCallback((type: SimEvent['type'], text: string) => {
    const id = ++logIdRef.current;
    setLogs((prev) => {
      const next = [...prev, { id, type, text }];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, []);

  // ---- Regenerate world ------------------------------------------------
  const regenerate = useCallback((newSeed: number) => {
    const { world: w, v2 } = buildWorldV2(newSeed);
    const ents = spawnEntities(newSeed, w);
    setSeed(newSeed);
    setWorld(w);
    setV2Data(v2);
    setCursorX(0);
    setCursorY(0);
    setEntities(ents);
    setTick(0);
    setLogs([]);
    logIdRef.current = 0;
    nearStateRef.current = new Map();
    narrationStateRef.current = initNarration(newSeed);
    const hash = simpleHash(serializeOverworld(w));
    if (import.meta.env.DEV) {
      console.log(`[World] seed=${newSeed}  hash=0x${hash.toString(16).padStart(8, '0')}`);
    }
    addLog('system', `세계가 생성되었습니다. (시드: ${newSeed})`);
  }, [addLog]);

  const handleGenerate = useCallback(() => {
    const parsed = parseInt(inputSeed, 10);
    const s = isNaN(parsed) ? INITIAL_SEED : parsed;
    regenerate(s);
    setInputSeed(String(s));
  }, [inputSeed, regenerate]);

  const handleRandom = useCallback(() => {
    const s = (Math.floor(Math.random() * 0xffffffff) + 1) >>> 0;
    setInputSeed(String(s));
    regenerate(s);
  }, [regenerate]);

  // ---- Zone actions -----------------------------------------------------
  const enterZone = useCallback(() => {
    const cell = worldRef.current.cells[cursorY * worldRef.current.width + cursorX];
    const newZone = generateZone({
      worldSeed: seedRef.current,
      ox: cursorX, oy: cursorY, depth: 0,
      cell, width: ZONE_W, height: ZONE_H,
    });
    setZone(newZone);
    setZoneOrigin({ ox: cursorX, oy: cursorY, depth: 0 });
    setZoneCursor({ x: Math.floor(ZONE_W / 2), y: Math.floor(ZONE_H / 2) });
    setMode('zone');
    addLog('system', '존으로 진입합니다.');
    if (import.meta.env.DEV) console.log(`[Zone] enter (${cursorX},${cursorY}) depth=0`);
  }, [cursorX, cursorY, addLog]);

  const exitZone = useCallback(() => {
    setMode('overworld');
    setZone(null);
    setZoneOrigin(null);
    addLog('system', '오버월드로 복귀합니다.');
  }, [addLog]);

  const changeDepth = useCallback((delta: number) => {
    if (!zoneOrigin) return;
    const newDepth = zoneOrigin.depth + delta;
    if (newDepth < 0) return;
    const cell = worldRef.current.cells[zoneOrigin.oy * worldRef.current.width + zoneOrigin.ox];
    const newZone = generateZone({
      worldSeed: seedRef.current,
      ox: zoneOrigin.ox, oy: zoneOrigin.oy, depth: newDepth,
      cell, width: ZONE_W, height: ZONE_H,
    });
    setZone(newZone);
    setZoneOrigin({ ...zoneOrigin, depth: newDepth });
    setZoneCursor({ x: Math.floor(ZONE_W / 2), y: Math.floor(ZONE_H / 2) });
    addLog('system', `심도가 변경되었습니다.`);
    if (import.meta.env.DEV) console.log(`[Zone] depth → ${newDepth}`);
  }, [zoneOrigin, addLog]);

  // ---- Tick timer -------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ---- Entity tick ------------------------------------------------------
  useEffect(() => {
    if (tick === 0) return;
    const next = tickEntities(entitiesRef.current, seedRef.current, tick, world);
    entitiesRef.current = next;
    setEntities(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, world]);

  // ---- Cursor movement (mode-aware) ------------------------------------
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const zoneRef = useRef(zone);
  useEffect(() => { zoneRef.current = zone; }, [zone]);

  const handleMoveCursor = useCallback(
    (dx: number, dy: number) => {
      if (modeRef.current === 'zone') {
        const z = zoneRef.current;
        if (!z) return;
        setZoneCursor((c) => ({
          x: Math.max(0, Math.min(z.width  - 1, c.x + dx)),
          y: Math.max(0, Math.min(z.height - 1, c.y + dy)),
        }));
      } else {
        setCursorX((x) => Math.max(0, Math.min(world.width  - 1, x + dx)));
        setCursorY((y) => Math.max(0, Math.min(world.height - 1, y + dy)));
      }
    },
    [world.width, world.height],
  );

  // ---- Cell tap ---------------------------------------------------------
  const handleCellTap = useCallback(
    (x: number, y: number) => {
      if (modeRef.current === 'zone') {
        const z = zoneRef.current;
        if (!z) return;
        setZoneCursor({
          x: Math.max(0, Math.min(z.width  - 1, x)),
          y: Math.max(0, Math.min(z.height - 1, y)),
        });
      } else {
        setCursorX(Math.max(0, Math.min(world.width  - 1, x)));
        setCursorY(Math.max(0, Math.min(world.height - 1, y)));
      }
    },
    [world.width, world.height],
  );

  // ---- Grid adapters: callback-based (glyphAt / classAt) ----------------
  const entityAt = useMemo(() => {
    const map = new Map<number, Entity>();
    for (const e of entities) map.set(e.y * world.width + e.x, e);
    return map;
  }, [entities, world.width]);

  const glyphAt = useCallback((x: number, y: number): string => {
    if (modeRef.current === 'zone') {
      const z = zoneRef.current;
      if (!z) return ' ';
      return z.tiles[y * z.width + x]?.glyph ?? ' ';
    }

    const layer = mapLayerRef.current;
    const d = v2Ref.current;

    if (layer === 'height' && d) {
      return heightGlyph(d.heightMap[y][x]);
    }

    if (layer === 'rivers' && d) {
      if (d.riverMap.lake[y][x]) return 'o';
      if (d.riverMap.river[y][x]) return '~';
      if (d.heightMap[y][x] < d.seaLevel) return '~';
      if (d.heightMap[y][x] > 0.70) return '^';
      return '.';
    }

    // Default: biome layer
    const entity = entityAt.get(y * world.width + x);
    if (entity) return ENTITY_GLYPH[entity.kind];
    return BIOME_CHAR[world.cells[y * world.width + x]?.biome] ?? '?';
  }, [entityAt, world]);

  const classAt = useCallback((x: number, y: number): string | undefined => {
    if (modeRef.current === 'zone') {
      const z = zoneRef.current;
      if (!z) return undefined;
      const tile = z.tiles[y * z.width + x];
      return tile ? `tile-zone tile-zone--${tile.kind}` : undefined;
    }

    const layer = mapLayerRef.current;
    const d = v2Ref.current;

    if (layer === 'height' && d) {
      return heightClass(d.heightMap[y][x]);
    }

    if (layer === 'rivers' && d) {
      if (d.riverMap.lake[y][x]) return 'tile-r-lake';
      if (d.riverMap.river[y][x]) return 'tile-r-river';
      if (d.heightMap[y][x] < d.seaLevel) return 'tile-r-ocean';
      if (d.heightMap[y][x] > 0.70) return 'tile-r-mount';
      return 'tile-r-land';
    }

    // Default: biome layer
    const entity = entityAt.get(y * world.width + x);
    if (entity) return `tile-entity tile-entity--${entity.kind}`;
    return BIOME_CLASS[world.cells[y * world.width + x]?.biome] ?? undefined;
  }, [entityAt, world]);

  // Active cursor and grid dimensions depend on mode.
  const activeCursor     = mode === 'zone' ? zoneCursor : { x: cursorX, y: cursorY };
  const activeGridWidth  = mode === 'zone' ? (zone?.width  ?? ZONE_W) : world.width;
  const activeGridHeight = mode === 'zone' ? (zone?.height ?? ZONE_H) : world.height;

  // On cursor move: proximity check + narration (uses mutable refs; no re-render).
  const prevCursorRef = useRef({ x: 0, y: 0 });
  useEffect(() => {
    // Skip encounter/narration in zone mode — overworld cursor didn't move.
    if (mode !== 'overworld') return;
    const prev = prevCursorRef.current;
    if (prev.x === cursorX && prev.y === cursorY) return;
    prevCursorRef.current = { x: cursorX, y: cursorY };

    // 1. Encounter message (entity proximity entry).
    const encounterMsg = updateProximity(
      cursorX, cursorY,
      entitiesRef.current,
      nearStateRef.current,
      tick,
      seed,
    );
    if (encounterMsg) addLog('encounter', encounterMsg);

    // 2. Narration — skipped when an encounter fired this move.
    const biome = worldRef.current.cells[cursorY * worldRef.current.width + cursorX]?.biome ?? 'plains';
    const { state: nextNarState, line } = maybeEmitNarration(
      seed,
      tick,
      biome,
      !!encounterMsg,
      narrationStateRef.current,
    );
    narrationStateRef.current = nextNarState;
    if (line) addLog('narration', line.text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorX, cursorY, mode, tick, seed, addLog]);

  // ---- Layer toggle buttons ---------------------------------------------
  const layerButtons = (
    <span className="layer-toggle">
      {(['biome', 'height', 'rivers'] as MapLayer[]).map((l) => (
        <button
          key={l}
          className={`layer-btn${mapLayer === l ? ' layer-btn--active' : ''}`}
          onClick={() => setMapLayer(l)}
          disabled={mode === 'zone'}
        >
          {l === 'biome' ? '지형' : l === 'height' ? '고도' : '강'}
        </button>
      ))}
    </span>
  );

  return (
    <div className="app">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="toolbar">
        {/* Mode badge */}
        <span className={`mode-badge mode-badge--${mode}`}>
          {mode === 'overworld' ? '🌍 Overworld' : `🏔 Zone`}
        </span>
        {/* Seed controls — disabled in zone mode */}
        <label htmlFor="seed-input">Seed</label>
        <input
          id="seed-input"
          type="number"
          value={inputSeed}
          disabled={mode === 'zone'}
          onChange={(e) => setInputSeed(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        />
        <button onClick={handleGenerate} disabled={mode === 'zone'}>Generate</button>
        <button onClick={handleRandom}   disabled={mode === 'zone'}>Random</button>
        {/* Layer toggle */}
        {layerButtons}
        {/* Action bar — desktop only (BottomPanel shows it on mobile) */}
        <span className="toolbar-sep" />
        <ActionBar
          mode={mode}
          zoneDepth={zoneOrigin?.depth ?? null}
          onEnterZone={enterZone}
          onExitZone={exitZone}
          onDepthChange={changeDepth}
        />
      </div>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="main">
        {/* Map area: grid only — D-pad lives in the bottom panel on mobile */}
        <div className="map-area">
          <GridView
            width={activeGridWidth}
            height={activeGridHeight}
            glyphAt={glyphAt}
            classAt={classAt}
            cursor={activeCursor}
            onMoveCursor={handleMoveCursor}
            onCellTap={handleCellTap}
          />
        </div>

        {/* Inspector — hidden on mobile via CSS */}
        <div className="inspector-desktop-wrap">
          {mode === 'zone' && zone ? (
            <ZoneInspector zone={zone} cursorX={zoneCursor.x} cursorY={zoneCursor.y} />
          ) : (
            <Inspector world={world} seed={seed} cursorX={cursorX} cursorY={cursorY} />
          )}
        </div>
      </div>

      {/* Console log — hidden on mobile via CSS */}
      <ConsoleLog events={logs} className="console-desktop" />

      {/* Bottom panel — mobile only (hidden on desktop via CSS) */}
      <BottomPanel
        world={world}
        seed={seed}
        cursorX={cursorX}
        cursorY={cursorY}
        events={logs}
        mode={mode}
        zone={zone}
        zoneCursorX={zoneCursor.x}
        zoneCursorY={zoneCursor.y}
        onEnterZone={enterZone}
        onExitZone={exitZone}
        onDepthChange={changeDepth}
      />

      {/* D-pad — fixed overlay at bottom-right, mobile only */}
      <div className="dpad-fixed">
        <TouchPad onMoveCursor={handleMoveCursor} />
      </div>
    </div>
  );
}
