import { useEffect, useCallback, useRef, useState } from 'react';

const SWIPE_THRESHOLD = 25;

/**
 * Courier New character width / font-size ratio (~0.601).
 * Used by ResizeObserver to compute the largest font that still fits the grid.
 */
const CHAR_ASPECT = 0.601;

/** Desktop default font-size in px (≈ 0.85rem). Font never exceeds this. */
const MAX_FONT_SIZE = 13.6;

/** Line-height multiplier — matches CSS line-height: 1.25. */
const LINE_HEIGHT = 1.25;

export type GridCursor = { x: number; y: number };

export type GridViewProps = {
  width: number;
  height: number;

  /** Returns the glyph (single char) for cell (x, y). */
  glyphAt: (x: number, y: number) => string;

  /** Returns the CSS class for cell (x, y). */
  classAt?: (x: number, y: number) => string | undefined;

  /** Cursor position — rendered as '@' with tile-player class. */
  cursor?: GridCursor;

  /** Highlight position — adds tile-highlight class (stacks with classAt). */
  highlight?: GridCursor;

  /** Called when a cell is tapped (pointer down + up without significant drag). */
  onCellTap?: (x: number, y: number) => void;

  /** Called for keyboard arrow keys and swipe gestures. */
  onMoveCursor?: (dx: number, dy: number) => void;

  /** Optional font-size scale multiplier (default 1). */
  scale?: number;
};

/**
 * Returns the glyph to render for (x, y), with cursor overlay.
 * Extracted so overlay logic lives in one place for future layers.
 */
function renderGlyph(
  x: number, y: number,
  glyphAt: (x: number, y: number) => string,
  cursor?: GridCursor,
): string {
  if (cursor && cursor.x === x && cursor.y === y) return '@';
  return glyphAt(x, y);
}

/** Returns the CSS class string for (x, y). */
function cellClass(
  x: number, y: number,
  classAt: ((x: number, y: number) => string | undefined) | undefined,
  cursor?: GridCursor,
  highlight?: GridCursor,
): string {
  if (cursor && cursor.x === x && cursor.y === y) return 'tile-player';
  const base = classAt?.(x, y) ?? '';
  if (highlight && highlight.x === x && highlight.y === y) {
    return base ? `${base} tile-highlight` : 'tile-highlight';
  }
  return base;
}

export function GridView({
  width, height,
  glyphAt, classAt,
  cursor, highlight,
  onCellTap, onMoveCursor,
  scale = 1,
}: GridViewProps) {
  const wrapRef      = useRef<HTMLDivElement>(null);
  const preRef       = useRef<HTMLPreElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerCell  = useRef<{ x: number; y: number } | null>(null);

  const [fontSize, setFontSize] = useState(MAX_FONT_SIZE);

  // ---- Dynamic font-size: fit grid into wrapper via ResizeObserver --------
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w <= 0 || h <= 0) return;
      const fsByW = w / (width  * CHAR_ASPECT);
      const fsByH = h / (height * LINE_HEIGHT);
      setFontSize(Math.max(1, Math.min(fsByW, fsByH, MAX_FONT_SIZE * scale)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, scale]);

  // ---- Keyboard -----------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!onMoveCursor) return;
      switch (e.key) {
        case 'ArrowUp':    case 'w': case 'W': e.preventDefault(); onMoveCursor( 0, -1); break;
        case 'ArrowDown':  case 's': case 'S': e.preventDefault(); onMoveCursor( 0,  1); break;
        case 'ArrowLeft':  case 'a': case 'A': e.preventDefault(); onMoveCursor(-1,  0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); onMoveCursor( 1,  0); break;
      }
    },
    [onMoveCursor],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ---- Pointer events (swipe + per-cell tap) ------------------------------
  // We read the cell from data-cx/data-cy on the span the pointer lands on.
  // This avoids creating per-cell closures and works with pointer capture.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLPreElement>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);

    // Record which cell the pointer started on (via data attributes on the span).
    const target = e.target as HTMLElement;
    const cx = target.dataset.cx;
    const cy = target.dataset.cy;
    pointerCell.current = cx !== undefined && cy !== undefined
      ? { x: parseInt(cx, 10), y: parseInt(cy, 10) }
      : null;
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLPreElement>) => {
      if (!pointerStart.current) return;
      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      pointerStart.current = null;
      const cell = pointerCell.current;
      pointerCell.current = null;

      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) {
        // Tap — call onCellTap with the cell the pointer started on.
        if (cell && onCellTap) onCellTap(cell.x, cell.y);
      } else {
        // Swipe — move one step in the dominant direction.
        if (onMoveCursor) {
          if (absDx > absDy) onMoveCursor(dx > 0 ? 1 : -1, 0);
          else                onMoveCursor(0, dy > 0 ? 1 : -1);
        }
      }
    },
    [onCellTap, onMoveCursor],
  );

  const handlePointerCancel = useCallback(() => {
    pointerStart.current = null;
    pointerCell.current  = null;
  }, []);

  // ---- Render: one <span> per cell, data-cx/data-cy for tap detection -----
  const children: React.ReactNode[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx   = y * width + x;
      const glyph = renderGlyph(x, y, glyphAt, cursor);
      const cls   = cellClass(x, y, classAt, cursor, highlight);
      children.push(
        <span key={idx} className={cls} data-cx={x} data-cy={y}>{glyph}</span>,
      );
    }
    if (y < height - 1) children.push('\n');
  }

  const cellStyle: React.CSSProperties = {
    fontSize: `${fontSize}px`,
    lineHeight: String(LINE_HEIGHT),
  };

  return (
    <div ref={wrapRef} className="grid-wrap">
      <pre
        ref={preRef}
        className="grid-view"
        style={cellStyle}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        {children}
      </pre>
    </div>
  );
}
