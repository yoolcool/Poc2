import type { Zone, ZoneTile } from '../world/zoneTypes';

type Props = {
  zone: Zone;
  cursorX: number;
  cursorY: number;
};

const ZONE_LEGEND: [string, string][] = [
  ['sand',          '.'],
  ['gravel',        ','],
  ['dirt',          '.'],
  ['grass',         ','],
  ['tall_grass',    '"'],
  ['rock',          '^'],
  ['cliff',         '#'],
  ['shallow_water', '~'],
  ['mud',           ','],
  ['tree',          'T'],
  ['reed',          '`'],
  ['snow',          '*'],
];

export function ZoneInspector({ zone, cursorX, cursorY }: Props) {
  const tile: ZoneTile | undefined = zone.tiles[cursorY * zone.width + cursorX];
  const { meta } = zone;

  return (
    <div className="inspector">
      <div className="inspector-header">
        <span className="inspector-title">Zone</span>
      </div>
      <table>
        <tbody>
          <tr><th>ID</th>    <td>{zone.id}</td></tr>
          <tr><th>Biome</th> <td>{meta.biome}</td></tr>
          <tr><th>Depth</th> <td>{meta.origin.depth}</td></tr>
          <tr><th>X / Y</th> <td>{cursorX} / {cursorY}</td></tr>
          {tile && (
            <>
              <tr>
                <th>Tile</th>
                <td className={`tile-zone--${tile.kind}`}>{tile.kind.replace('_', ' ')}</td>
              </tr>
              <tr><th>Glyph</th><td>{tile.glyph}</td></tr>
              {tile.flags.blocked    && <tr><th>Blocked</th>   <td>yes</td></tr>}
              {tile.flags.liquid     && <tr><th>Liquid</th>    <td>yes</td></tr>}
              {tile.flags.vegetation && <tr><th>Vegetation</th><td>yes</td></tr>}
              {tile.flags.cold       && <tr><th>Cold</th>      <td>yes</td></tr>}
            </>
          )}
        </tbody>
      </table>
      <div className="legend">
        <h3>Zone Legend</h3>
        <ul>
          {ZONE_LEGEND.map(([kind, glyph]) => (
            <li key={kind}>
              <span className={`glyph tile-zone--${kind}`}>{glyph}</span>
              {kind.replace('_', ' ')}
            </li>
          ))}
        </ul>
        <p className="hint">Move: arrow keys / WASD / D-pad</p>
      </div>
    </div>
  );
}
