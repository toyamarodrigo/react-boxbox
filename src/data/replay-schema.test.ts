import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generatedReplayFiles, readJson, replayIndexFile } from './replay-fixtures';
import { replayIndexSchema, replayRaceSchema } from './replay-schema';

const files = generatedReplayFiles();

describe('generated replay dataset', () => {
  if (files.length === 0) {
    it.skip('is not generated yet, so the dataset checks are skipped', () => {});
    return;
  }

  it.each(files.map((file) => [path.basename(file), file] as const))(
    '%s parses and is coherent',
    (name, file) => {
      const race = replayRaceSchema.parse(readJson(file));

      expect(race.id).toBe(`${race.season}-${race.round}`);
      expect(name).toBe(`${race.id}.json`);

      const laps = race.laps.map((lap) => lap.lap);
      expect(laps).toEqual([...laps].sort((a, b) => a - b));
      expect(new Set(laps).size).toBe(laps.length);
      expect(race.totalLaps).toBe(Math.max(...laps));

      const driverIds = new Set(race.drivers.map((driver) => driver.id));
      const teamIds = new Set(race.teams.map((team) => team.id));
      expect(driverIds.size).toBe(race.drivers.length);
      expect(teamIds.size).toBe(race.teams.length);

      for (const driver of race.drivers) expect(teamIds.has(driver.teamId)).toBe(true);
      for (const result of race.results) expect(driverIds.has(result.driverId)).toBe(true);

      for (const lap of race.laps) {
        const positions = lap.rows.map((row) => row.position);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(new Set(positions).size).toBe(positions.length);
        expect(new Set(lap.rows.map((row) => row.driverId)).size).toBe(lap.rows.length);
        for (const row of lap.rows) expect(driverIds.has(row.driverId)).toBe(true);
      }
    },
  );

  it.skipIf(!existsSync(replayIndexFile))('has an index that matches the race files', () => {
    const index = replayIndexSchema.parse(readJson(replayIndexFile));
    expect(index.races.map((race) => race.id).sort()).toEqual(
      files.map((file) => path.basename(file, '.json')).sort(),
    );

    for (const entry of index.races) {
      const file = path.join(path.dirname(replayIndexFile), `${entry.id}.json`);
      const race = replayRaceSchema.parse(readJson(file));
      expect(entry.name).toBe(race.name);
      expect(entry.totalLaps).toBe(race.totalLaps);
      expect(entry.driverCount).toBe(race.drivers.length);
      expect(race.drivers.some((driver) => driver.code === entry.winnerCode)).toBe(true);
    }
  });
});
