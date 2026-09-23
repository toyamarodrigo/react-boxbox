import { drivers, teams } from '@/data/grid';
import { GapChart, type GapChartSeries } from '@/registry/boxbox/ui/gap-chart';

// Its own module so Recharts loads only when a preview needs it, never in the page's entry chunk.

const LAPS = 20;

/** Seconds lost to the leader per lap, and the lap each car stops on (the leader never does). */
const CARS = [
  { code: 'EVO', drift: 0, stopLap: null },
  { code: 'MSO', drift: 0.35, stopLap: 8 },
  { code: 'TRE', drift: 0.6, stopLap: 11 },
  { code: 'NVA', drift: 0.9, stopLap: 9 },
] as const;

const series: GapChartSeries[] = CARS.map(({ code, drift, stopLap }) => {
  const driver = drivers.find((entry) => entry.code === code);
  const gaps = Array.from({ length: LAPS }, (_, index) => {
    const lap = index + 1;
    const stop = stopLap !== null && lap >= stopLap ? 14 : 0;
    return Math.round((drift * lap + stop) * 100) / 100;
  });
  return {
    id: driver?.id ?? code,
    code,
    color: teams.find((team) => team.id === driver?.teamId)?.color,
    gaps,
  };
});

export default function GapChartPreview() {
  return (
    <GapChart series={series} totalLaps={LAPS} emphasisedId={series[1]?.id} className="h-32 w-56" />
  );
}
