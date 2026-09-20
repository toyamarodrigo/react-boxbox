import { z } from 'zod';

export const teamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const driverSchema = z.object({
  id: z.string().min(1),
  code: z.string().regex(/^[A-Z]{3}$/),
  number: z.number().int().min(2).max(99),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  teamId: z.string().min(1),
});

export const gridSchema = z
  .object({ teams: z.array(teamSchema).length(10), drivers: z.array(driverSchema).length(20) })
  .superRefine((grid, ctx) => {
    const unique = (values: (string | number)[], label: string) => {
      if (new Set(values).size !== values.length) {
        ctx.addIssue({ code: 'custom', message: `Duplicate ${label}` });
      }
    };
    unique(
      grid.teams.map((team) => team.id),
      'team id',
    );
    unique(
      grid.teams.map((team) => team.name),
      'team name',
    );
    unique(
      grid.teams.map((team) => team.color),
      'team color',
    );
    unique(
      grid.drivers.map((driver) => driver.id),
      'driver id',
    );
    unique(
      grid.drivers.map((driver) => driver.code),
      'driver code',
    );
    unique(
      grid.drivers.map((driver) => driver.number),
      'driver number',
    );
    const teamIds = new Set(grid.teams.map((team) => team.id));
    for (const driver of grid.drivers) {
      if (!teamIds.has(driver.teamId)) {
        ctx.addIssue({ code: 'custom', message: `Unknown team ${driver.teamId}` });
      }
    }
    for (const team of grid.teams) {
      if (grid.drivers.filter((driver) => driver.teamId === team.id).length !== 2) {
        ctx.addIssue({ code: 'custom', message: `Team ${team.id} needs two drivers` });
      }
    }
  });

export type Grid = z.infer<typeof gridSchema>;
