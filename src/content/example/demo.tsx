import type { ControlValues } from '../types';
import controls from './controls';

export default function ExampleSignal({
  active,
  level,
  mode,
  color,
  label,
}: ControlValues<typeof controls.fields>) {
  return (
    <div
      className="w-64 border border-border bg-card p-4 font-mono text-card-foreground"
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
        <span>{mode}</span>
        <span>{active ? 'LIVE' : 'OFF AIR'}</span>
      </div>
      <div className="mt-5 font-display text-2xl font-bold tracking-tight">{label}</div>
      <div className="mt-4 h-1 bg-muted">
        <div className="h-full" style={{ width: `${level * 10}%`, backgroundColor: color }} />
      </div>
      <div className="mt-2 text-right text-xs tabular-nums">{level}/10</div>
    </div>
  );
}
