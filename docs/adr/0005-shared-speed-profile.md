---
status: accepted
date: 2026-10-01
---

# One speed profile for every view of the Replay

The Replay only knows when each car crossed the line, so until now a car moved at constant speed through its lap. That is invisible on the 2D Track Map but looks robotic from the Onboard view, where a car would enter a hairpin at top speed. We chose a speed profile per circuit, derived from the curvature of the outline with acceleration, braking and top-speed limits, stretched so every lap still takes its real time; lap 1 starts from standstill and the pit lane runs at a constant limit speed. The Track Map, the Timing Tower's interpolated order and the Onboard view all read car positions from this one profile, so the dot on the map, the row in the tower and the car on screen never disagree.

## Considered options

- Constant speed per lap (the old behaviour). Rejected: the Onboard view looks robotic.
- Speed profile for the Onboard view only. Rejected: the 3D car and the map dot would be in different places at the same race time.
- OpenF1 `car_data` / `location` telemetry. Rejected earlier on size (tens of MB per race) and legal grounds.

## Consequences

Interpolated positions between line crossings change on the Track Map and in the tower, so an overtake between two lines can show at a different point of the lap than before. Gaps and intervals at the line do not change. The profile is an approximation and is never shown as a speed value.
