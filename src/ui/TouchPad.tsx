import { useCallback, useState } from 'react';

type Props = {
  onMoveCursor: (dx: number, dy: number) => void;
};

/** Haptic feedback (Android Chrome only, silently ignored elsewhere). */
function vibrate() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

export function TouchPad({ onMoveCursor }: Props) {
  const [selectFlash, setSelectFlash] = useState(false);

  const move = useCallback(
    (dx: number, dy: number) => {
      onMoveCursor(dx, dy);
      vibrate();
    },
    [onMoveCursor],
  );

  const handleSelect = useCallback(() => {
    vibrate();
    setSelectFlash(true);
    setTimeout(() => setSelectFlash(false), 150);
  }, []);

  return (
    <div className="touchpad" aria-label="D-pad">
      <div className="touchpad-row">
        <button
          className="dpad-btn"
          onPointerDown={(e) => { e.preventDefault(); move(0, -1); }}
          aria-label="Up"
        >
          ↑
        </button>
      </div>
      <div className="touchpad-row">
        <button
          className="dpad-btn"
          onPointerDown={(e) => { e.preventDefault(); move(-1, 0); }}
          aria-label="Left"
        >
          ←
        </button>
        <button
          className={`dpad-btn dpad-select${selectFlash ? ' dpad-select--flash' : ''}`}
          onPointerDown={(e) => { e.preventDefault(); handleSelect(); }}
          aria-label="Select"
        >
          ⏺
        </button>
        <button
          className="dpad-btn"
          onPointerDown={(e) => { e.preventDefault(); move(1, 0); }}
          aria-label="Right"
        >
          →
        </button>
      </div>
      <div className="touchpad-row">
        <button
          className="dpad-btn"
          onPointerDown={(e) => { e.preventDefault(); move(0, 1); }}
          aria-label="Down"
        >
          ↓
        </button>
      </div>
    </div>
  );
}
