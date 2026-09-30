import { memo, useMemo } from 'react';
import type { ReplayRace } from '@/data/replay-schema';
import { STANDINGS_TABLES, type StandingsTable, standingsAt } from '@/data/replay-standings';
import { Standings } from '@/registry/boxbox/ui/standings';
import { Button } from '@/components/ui/button';

const TABLE_LABELS: Record<StandingsTable, string> = { drivers: 'Drivers', teams: 'Teams' };

/** Drivers or teams. Two buttons, like the page's other pickers: both stay one click away. */
function TablePicker({
  value,
  onSelect,
}: {
  value: StandingsTable;
  onSelect: (table: StandingsTable) => void;
}) {
  return (
    <fieldset aria-label="Standings table" className="ml-auto flex items-center gap-1">
      {STANDINGS_TABLES.map((table) => (
        <Button
          key={table}
          variant={table === value ? 'default' : 'outline'}
          size="sm"
          aria-pressed={table === value}
          onClick={() => onSelect(table)}
        >
          {TABLE_LABELS[table]}
        </Button>
      ))}
    </fieldset>
  );
}

/**
 * The season's standings around the race on screen: projected while it runs, the official ones
 * once the chequered flag is out.
 *
 * Memoised on plain values. `scorers` is the order of the cars in the points as one string (see
 * `pointScorers`), so the ten renders a second the page makes only reach the table when a car in
 * the points changes place, and the rows animate for that change alone.
 */
export const StandingsPanel = memo(function StandingsPanel({
  race,
  scorers,
  finished,
  table,
  onTable,
}: {
  race: ReplayRace;
  scorers: string;
  finished: boolean;
  table: StandingsTable;
  onTable: (table: StandingsTable) => void;
}) {
  const tables = useMemo(
    () => standingsAt(race, scorers === '' ? [] : scorers.split(','), finished),
    [race, scorers, finished],
  );

  if (tables === null) {
    return (
      <p className="py-2 text-sm text-muted-foreground">
        There are no standings for this race in the dataset.
      </p>
    );
  }

  const name = table === 'drivers' ? "Drivers' standings" : "Teams' standings";
  return (
    <div data-slot="replay-standings" data-table={table} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-display text-sm font-bold uppercase tracking-widest">
          {finished ? `After round ${race.round}` : 'Projected'}
        </h3>
        <TablePicker value={table} onSelect={onTable} />
      </div>
      <Standings entries={tables[table]} aria-label={name} className="w-full max-w-md" />
      <p className="text-xs text-muted-foreground">
        {finished
          ? `The official ${race.season} standings after round ${race.round}.`
          : `Projected standings: the standings before the race plus the points each car's position is worth at race time. No fastest-lap bonus, and a retired car scores nothing. Before the race is after round ${race.round} less this race's points, so a sprint the same weekend counts as before. The official standings replace them at the chequered flag.`}
      </p>
    </div>
  );
});
