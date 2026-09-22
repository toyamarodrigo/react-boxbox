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
