import { useEffect, useRef, useState } from 'react';
import type { SimEvent, LogType } from '../world/simulation';

const TYPEWRITER_MS = 28; // ms per character
const MAX_ENTRIES = 40;   // prune older entries beyond this

type TypewriterEntry = {
  id: number;
  type: LogType;
  full: string;      // full text
  visible: string;   // currently-shown prefix
  done: boolean;
};

type Props = {
  events: SimEvent[];
  /** Extra CSS class (e.g. 'console-desktop' for the desktop-only instance). */
  className?: string;
};

export function ConsoleLog({ events, className }: Props) {
  const [entries, setEntries] = useState<TypewriterEntry[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track which event ids have been added so we don't double-add.
  const seenRef = useRef<Set<number>>(new Set());

  // Sync new events into entries.
  useEffect(() => {
    const newEntries: TypewriterEntry[] = [];
    for (const ev of events) {
      if (!seenRef.current.has(ev.id)) {
        seenRef.current.add(ev.id);
        newEntries.push({ id: ev.id, type: ev.type, full: ev.text, visible: '', done: false });
      }
    }
    if (newEntries.length === 0) return;

    setEntries((prev) => {
      const combined = [...prev, ...newEntries];
      // Prune oldest when over limit.
      return combined.length > MAX_ENTRIES ? combined.slice(combined.length - MAX_ENTRIES) : combined;
    });
  }, [events]);

  // Typewriter ticker — advances the first unfinished entry one char at a time.
  useEffect(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setEntries((prev) => {
        const firstPending = prev.findIndex((e) => !e.done);
        if (firstPending === -1) {
          // Nothing to animate — clear the interval.
          if (timerRef.current !== null) clearInterval(timerRef.current);
          timerRef.current = null;
          return prev;
        }
        const entry = prev[firstPending];
        // Use Array.from for Unicode-safe slicing (handles Korean multi-byte correctly).
        const chars = Array.from(entry.full);
        const nextLen = Array.from(entry.visible).length + 1;
        const nextVisible = chars.slice(0, nextLen).join('');
        const done = nextLen >= chars.length;
        const updated = { ...entry, visible: nextVisible, done };
        const next = [...prev];
        next[firstPending] = updated;
        return next;
      });
    }, TYPEWRITER_MS);

    return () => {
      if (timerRef.current !== null) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [entries.some((e) => !e.done)]); // re-run when done-status changes

  // Auto-scroll to bottom whenever entries change.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  return (
    <div className={`console-log${className ? ` ${className}` : ''}`} aria-live="polite" aria-label="이벤트 로그">
      {entries.map((e) => (
        <div key={e.id} className={`console-line console-line--${e.type}`}>
          <span className="console-text">{e.visible}</span>
          {!e.done && <span className="console-cursor">▌</span>}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
