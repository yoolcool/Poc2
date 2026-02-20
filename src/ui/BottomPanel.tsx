import { useState, useRef, useCallback } from 'react';
import type { Overworld } from '../world/types';
import type { Zone } from '../world/zoneTypes';
import type { SimEvent } from '../world/simulation';
import { ConsoleLog } from './ConsoleLog';
import { Inspector } from './Inspector';
import { ZoneInspector } from './ZoneInspector';
import { TouchPad } from './TouchPad';
import { ActionBar } from './ActionBar';
import type { ViewMode } from './ActionBar';
import { BIOME_CLASS } from './tileClasses';

type Tab = 'console' | 'inspector';

/** Collapsed: handle-only strip. */
const H_COLLAPSED = 40;
/** Mini: handle + content (D-pad visible). 3 D-pad rows × 44px + 8px gap + 36px handle ≈ 180px */
const H_MINI      = 180;

/** Returns the expanded height (40 % of viewport, clamped to min 240 px). */
function getExpandedH(): number {
  return Math.max(240, Math.floor(window.innerHeight * 0.40));
}

function snap(h: number): number {
  const expanded = getExpandedH();
  const pts = [H_COLLAPSED, H_MINI, expanded] as const;
  const dists = pts.map((p) => Math.abs(h - p));
  return pts[dists.indexOf(Math.min(...dists))];
}

function cycleSnap(h: number): number {
  if (h <= H_COLLAPSED + 4) return H_MINI;
  if (h <= H_MINI + 4)      return getExpandedH();
  return H_COLLAPSED;
}

/** Fraction of viewport height used as drag ceiling. */
const MAX_H_RATIO = 0.45;

type Props = {
  world: Overworld;
  seed: number;
  cursorX: number;
  cursorY: number;
  events: SimEvent[];
  onMoveCursor: (dx: number, dy: number) => void;
  // Zone mode
  mode: ViewMode;
  zone: Zone | null;
  zoneCursorX: number;
  zoneCursorY: number;
  onEnterZone: () => void;
  onExitZone:  () => void;
  onDepthChange: (delta: number) => void;
};

export function BottomPanel({
  world, seed, cursorX, cursorY, events, onMoveCursor,
  mode, zone, zoneCursorX, zoneCursorY,
  onEnterZone, onExitZone, onDepthChange,
}: Props) {
  const [height, setHeight] = useState<number>(H_MINI);
  const [activeTab, setActiveTab] = useState<Tab>('console');

  const dragStart = useRef<{ clientY: number; startH: number } | null>(null);
  const didDrag   = useRef(false);

  const isCollapsed = height <= H_COLLAPSED + 4;

  const cell       = world.cells[cursorY * world.width + cursorX];
  const biomeClass = BIOME_CLASS[cell.biome] ?? '';
  const zoneDepth  = zone?.meta.origin.depth ?? null;

  // ---- Drag handle --------------------------------------------------------
  const onHandleDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = { clientY: e.clientY, startH: height };
    didDrag.current = false;
  }, [height]);

  const onHandleMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    const delta = dragStart.current.clientY - e.clientY; // drag up = grow
    if (Math.abs(delta) > 6) didDrag.current = true;
    const maxH = Math.floor(window.innerHeight * MAX_H_RATIO);
    const rawH = dragStart.current.startH + delta;
    setHeight(Math.min(maxH, Math.max(H_COLLAPSED, rawH)));
  }, []);

  const onHandleUp = useCallback(() => {
    if (!dragStart.current) return;
    if (!didDrag.current) {
      setHeight((h) => cycleSnap(h));
    } else {
      setHeight((h) => snap(h));
    }
    dragStart.current = null;
  }, []);

  const onHandleCancel = useCallback(() => {
    if (dragStart.current) setHeight((h) => snap(h));
    dragStart.current = null;
  }, []);

  // Tab clicks must not bubble up to the drag handler.
  const stopProp = useCallback((e: React.PointerEvent | React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="bottom-panel" style={{ height: `${height}px` }}>

      {/* ── Handle + tab bar ─────────────────────────────────────────────── */}
      <div
        className="bp-handle"
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onPointerCancel={onHandleCancel}
      >
        <span className="bp-grip" aria-hidden>━━━━━</span>

        {isCollapsed ? (
          <span className="bp-summary">
            {mode === 'zone' && zone ? (
              <>
                <span className="bp-summary__item">Zone {zone.id}</span>
                <span className="bp-summary__sep">|</span>
                <span className="bp-summary__item">({zoneCursorX},{zoneCursorY})</span>
              </>
            ) : (
              <>
                <span className="bp-summary__item">시드 {seed}</span>
                <span className="bp-summary__sep">|</span>
                <span className="bp-summary__item">({cursorX},{cursorY})</span>
                <span className="bp-summary__sep">|</span>
                <span className={`bp-summary__item ${biomeClass}`}>{cell.biome}</span>
              </>
            )}
          </span>
        ) : (
          <div
            className="bp-tabs"
            onPointerDown={stopProp}
            onClick={stopProp}
          >
            <button
              className={`bp-tab${activeTab === 'console' ? ' bp-tab--active' : ''}`}
              onClick={() => setActiveTab('console')}
            >콘솔</button>
            <button
              className={`bp-tab${activeTab === 'inspector' ? ' bp-tab--active' : ''}`}
              onClick={() => setActiveTab('inspector')}
            >맵정보</button>
          </div>
        )}
      </div>

      {/* ── Action bar (Enter Zone / Back / Depth) ───────────────────────── */}
      {!isCollapsed && (
        <div className="bp-action" onPointerDown={stopProp} onClick={stopProp}>
          <ActionBar
            mode={mode}
            zoneDepth={zoneDepth}
            onEnterZone={onEnterZone}
            onExitZone={onExitZone}
            onDepthChange={onDepthChange}
          />
        </div>
      )}

      {/* ── Content: two-column grid (left: info, right: D-pad) ──────────── */}
      {!isCollapsed && (
        <div className="bp-content">
          {/* Left: console or inspector */}
          <div className="bp-left">
            {activeTab === 'console' ? (
              <ConsoleLog events={events} />
            ) : (
              <div className="bp-inspector-wrap">
                {mode === 'zone' && zone ? (
                  <ZoneInspector
                    zone={zone}
                    cursorX={zoneCursorX}
                    cursorY={zoneCursorY}
                  />
                ) : (
                  <Inspector
                    world={world}
                    seed={seed}
                    cursorX={cursorX}
                    cursorY={cursorY}
                    noCollapse
                  />
                )}
              </div>
            )}
          </div>

          {/* Right: D-pad — never overlaps the map */}
          <div className="bp-dpad-col" onPointerDown={stopProp}>
            <TouchPad onMoveCursor={onMoveCursor} />
          </div>
        </div>
      )}
    </div>
  );
}
