# boxbox

Broadcast-style race graphics for React, shipped as a shadcn registry, plus a Replay page that runs the whole library on real past races.

## Language

### Library

**Item**:
One installable unit of the registry (a component, a lib file, or a token set).
_Avoid_: Package, module

**Component**:
A UI item of the registry, such as Timing Tower or Track Map.
_Avoid_: Widget, graphic

### Replay

**Replay**:
The page that plays a curated past race back through the components. It is the showcase of the library, not a separate product.
_Avoid_: Live, showcase, demo race

**Curated race**:
One past grand prix stored as static JSON at build time and offered on the Replay page.
_Avoid_: Session, event

**Race time**:
The elapsed time of the race the Replay clock is at. All positions, gaps and stints are read at race time.
_Avoid_: Playhead, cursor

**Followed driver**:
The one driver the viewer has chosen on the Replay page. The Timing Tower expands that driver's row, the Track Map emphasises that car and the Onboard view rides with it; at most one at a time.
_Avoid_: Selected driver, focus driver, tracked driver

**Onboard view**:
The circuit drawn in 3D as seen from the followed driver's car, at race time. It shows a pair at most: the followed driver's car and, when there is one, the first compared driver's car; the other cars only appear on its minimap. Without a followed driver it rides with the leader, alone. It is an alternative to the Track Map on the Replay page, not a recording: the circuit, its surroundings and the cars are generated.
_Avoid_: Street view, 3D map, cockpit view, POV

**Speed profile**:
How fast a car is taken to be at each point of a lap: slower in tight corners, faster on straights, stretched so the lap still takes its real time. It is worked out along the racing line. It decides where a car is between two line crossings, for the Track Map, the Timing Tower and the Onboard view alike. It is an approximation, never telemetry.
_Avoid_: Telemetry, speed trace

**Racing line**:
The path a car is taken to follow across the width of the track: wide into a corner, tight at its apex, wide out of it, kept a little inside the track edges. It is generated from the shape and width of the track, never measured, and every car follows the same one. It only moves a car sideways: how far along the lap a car is stays measured on the outline.
_Avoid_: Trajectory, line, driving line

**Compared driver**:
A driver the viewer puts next to the followed driver, up to three at a time. Every comparison is measured against the followed driver, never between compared drivers. There is no compared driver without a followed driver.
_Avoid_: Rival, second followed driver, pinned driver

**Standings**:
The championship table of drivers or of teams, by points, as it stood after one round of a season.
_Avoid_: Leaderboard, classification, table

**Projected standings**:
The standings as they would be if the race ended at the current race time: the standings before the race plus the points each car's position is worth now. Replaced by the official standings at the chequered flag.
_Avoid_: Live standings, provisional standings, predicted table

**Classic race**:
A curated race from a season before the current one, chosen by hand for being well known. The current season is offered in full; earlier seasons only through classic races.
_Avoid_: Popular race, archive race, featured race

**Stint**:
The laps a car runs on one set of tyres, from one pit stop (or the start) to the next (or the finish).
_Avoid_: Run, tyre phase

**Pit window**:
The stretch of race time a car spends in the pit lane during one stop.
_Avoid_: Pit period

**Stationary time**:
The part of a pit window a car stands still in its box. Known only for races from the 2024 United States Grand Prix on; earlier curated races have the pit window alone.
_Avoid_: Stop time, pit duration, pit stop time

**Gap**:
How far a car is behind the leader, in time. Only ever measured against the leader.
_Avoid_: Delta, difference, interval

**Interval**:
How far a car is behind the car one place ahead of it, in time. Never the gap to the leader.
_Avoid_: Gap, delta, distance to car ahead

**Gap chart**:
The race drawn as every car's gap to the leader, lap by lap, with the leader on zero along the top. It only draws the laps the leader has finished.
_Avoid_: Race trace, delta chart, position chart

**Moment link**:
A link that opens the Replay paused at one race time of one curated race, with the same followed driver, compared drivers and tower value.
_Avoid_: Timestamp link, deep link, share link

**Positions gained**:
How many places a car is ahead of where it started the race. A pit lane start counts as the last grid slot. Retired cars have none.
_Avoid_: Places gained, position delta, net positions

**Battle**:
Two cars one place apart whose interval at the line stays at 1.0 s or less for two laps in a row. It ends when the interval grows past 1.5 s. It does not start or run under a neutralisation, and a pit stop by either car ends it. An overtake inside a battle swaps the two cars and keeps the battle.
_Avoid_: Fight, duel, DRS train

**Battle card**:
The card that shows one battle: both cars, the interval and its trend over the last three laps. On the Replay page it shows the followed driver's battle (the one with the car ahead when the followed driver is in two), otherwise the battle highest up the order.
_Avoid_: Head-to-head card, fight graphic

**Pit stop card**:
The card that shows one stop of the followed driver during its pit window and a moment after: stop number, compound off and on, pit lane time, position in and out. The stop number counts only the stops shown: a red-flag wait is not a stop, and neither is leaving the pit lane after the red, so the first real stop after one is stop 1.
_Avoid_: Pit timer, stop graphic

**Lap grid**:
Every car's laps as a grid of coloured cells, one row per car and one column per lap of that car, for the lap or one sector. A cell is coloured as of the lap it was set: race best, personal best, or slower by how much. Laps that are not pace (lap 1, pit in and out, neutralised) are striped and never count.
_Avoid_: Lap chart (that is positions per lap), heatmap, pace chart

### Telemetry

**Speed trap**:
The speed one car was measured at as it crossed the trap on a lap, and the card that shows it against the best of the session. It comes from the simulator only.
_Avoid_: Top speed, radar, speed gun

**Gauge**:
The engine widget: revolutions drawn as an arc with the gear in the middle. Fed by a fictional engine model, never by telemetry.
_Avoid_: Rev counter, tachometer, dial
