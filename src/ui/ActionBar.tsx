export type ViewMode = 'overworld' | 'zone';

type Props = {
  mode: ViewMode;
  zoneDepth: number | null;
  onEnterZone: () => void;
  onExitZone:  () => void;
  onDepthChange: (delta: number) => void;
};

export function ActionBar({ mode, zoneDepth, onEnterZone, onExitZone, onDepthChange }: Props) {
  if (mode === 'overworld') {
    return (
      <div className="action-bar">
        <button className="action-btn action-btn--enter" onClick={onEnterZone}>
          Enter Zone
        </button>
      </div>
    );
  }

  const depth = zoneDepth ?? 0;

  return (
    <div className="action-bar">
      <button className="action-btn action-btn--back" onClick={onExitZone}>
        ← Back
      </button>
      <span className="action-depth">Depth {depth}</span>
      <button className="action-btn" onClick={() => onDepthChange(1)}>
        Depth +
      </button>
      <button
        className="action-btn"
        onClick={() => onDepthChange(-1)}
        disabled={depth <= 0}
      >
        Depth −
      </button>
    </div>
  );
}
