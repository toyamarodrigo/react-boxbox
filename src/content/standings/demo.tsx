import { useMemo } from 'react';
import { grid } from '@/data/grid';
import {
  type StandingsLine,
  pointScorers,
  projectStandings,
  scorerPoints,
  teamPoints,
} from '@/data/replay-standings';
import { useRaceSimulation } from '@/data/use-race-simulation';
import { Standings } from '@/registry/boxbox/ui/standings';
import { Button } from '@/components/ui/button';
import type { ControlValues } from '../types';
import type controls from './controls';

/**
 * An invented championship before the race, close at the top so the simulated race reorders it.
 * The points go to the grid out of its own order, so the start order is not the table's.
 */
const POINTS = [
  168, 161, 150, 149, 131, 122, 118, 104, 97, 90, 74, 70, 58, 51, 40, 33, 22, 18, 9, 4,
];
const WINS = [4, 3, 2, 2, 1, 1, 1];

const teamsById = new Map(grid.teams.map((team) => [team.id, team]));
const teamOf = new Map(grid.drivers.map((driver) => [driver.id, driver.teamId]));

const driverLines: StandingsLine[] = grid.drivers
  .map((driver, index) => {
    const place = (index * 7) % POINTS.length;
    return {
      id: driver.id,
      name: driver.code,
      color: teamsById.get(driver.teamId)?.color ?? 'currentColor',
      points: POINTS[place] ?? 0,
      wins: WINS[place] ?? 0,
      position: place + 1,
    };
  })
  .sort((a, b) => a.position - b.position);

/** Each team has what its two drivers have. */
const teamTotals = (of: 'points' | 'wins') =>
  teamPoints(new Map(driverLines.map((line) => [line.id, line[of]])), (id) => teamOf.get(id));
const [teamScores, teamWins] = [teamTotals('points'), teamTotals('wins')];
const teamLines: StandingsLine[] = grid.teams
  .map((team) => ({
    id: team.id,
    name: team.name,
    color: team.color,
    points: teamScores.get(team.id) ?? 0,
    wins: teamWins.get(team.id) ?? 0,
  }))
  .sort((a, b) => b.points - a.points || b.wins - a.wins)
  .map((line, index) => ({ ...line, position: index + 1 }));

export default function StandingsDemo({
  table,
  maxRows,
  size,
  speed,
}: ControlValues<typeof controls.fields>) {
  const { state, finished, reset } = useRaceSimulation({ intervalMs: speed });
  // Only the cars in the points move the table, so it is recomputed when their order changes.
  const scorers = pointScorers(state.rows).join(',');
  const entries = useMemo(() => {
    const ids = scorers === '' ? [] : scorers.split(',');
    const gains = scorerPoints(ids);
    const leader = ids[0];
    return table === 'drivers'
      ? projectStandings(driverLines, gains, leader)
      : projectStandings(
          teamLines,
          teamPoints(gains, (id) => teamOf.get(id)),
          leader === undefined ? undefined : teamOf.get(leader),
        );
  }, [scorers, table]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {finished ? 'FINAL' : `PROJECTED · LAP ${state.lap} / ${state.totalLaps}`}
        </span>
        {finished && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={reset}>
            Restart
          </Button>
        )}
      </div>
      <Standings
        entries={entries}
        maxRows={maxRows}
        size={size}
        aria-label={table === 'drivers' ? "Drivers' standings" : "Teams' standings"}
      />
    </div>
  );
}
