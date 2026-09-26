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
The one driver the viewer has chosen on the Replay page. The Timing Tower expands that driver's row and the Track Map emphasises that car; at most one at a time.
_Avoid_: Selected driver, focus driver, tracked driver

**Stint**:
The laps a car runs on one set of tyres, from one pit stop (or the start) to the next (or the finish).
_Avoid_: Run, tyre phase

**Pit window**:
The stretch of race time a car spends in the pit lane during one stop.
_Avoid_: Pit period

**Gap**:
How far a car is behind the leader, in time. Only ever measured against the leader.
_Avoid_: Delta, difference, interval

**Interval**:
How far a car is behind the car one place ahead of it, in time. Never the gap to the leader.
_Avoid_: Gap, delta, distance to car ahead

**Gap chart**:
The race drawn as every car's gap to the leader, lap by lap, with the leader on zero along the top. It only draws the laps the leader has finished.
_Avoid_: Race trace, delta chart, position chart

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
