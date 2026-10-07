# Glossary

- **Activity** — one uploaded GPX file, a single run or ride. All tracks/segments in the file are merged into one activity.
- **Activity type** — `running` (shows pace) or `cycling` (shows speed). Taken from the track's own `<type>` (walks and hikes map to running; the original label is shown for information only). If that's missing: power data → cycling, else average moving speed ≥ 15 km/h → cycling. The user can override it.
- **Highlight figures** — the summary numbers shown for an activity: distance, moving time, elapsed time, average pace (running) or average speed (cycling), elevation gain, start date/time.
- **Elapsed time** — last timestamp minus first timestamp, across the whole file.
- **Moving time** — time where the net displacement over the trailing 10 s is at least 1 km/h (never measured across a pause or segment gap); the basis for average pace/speed. GPX records no pauses, so moving time is always inferred.
- **Untimed activity** — fewer than 90% of points have timestamps; only distance and elevation gain are shown.
- **Elevation gain** — total climb through a 4 m dead band on `<ele>`: rises and dips under 4 m are noise; each climb runs from its true low to its true high (no terrain-model correction).
- **Pace** — minutes per km (running). **Speed** — km/h (cycling).
- **Postcode** — an Australian postal area as given by ABS Postal Areas 2021 (an approximation of Australia Post postcodes; no PO-box-only codes). _Avoid_: "suburb" (a locality, not a postcode).
- **Postcode passed through** — a postcode with at least 50 m (tunable) of the activity's route inside its boundary, measured along the recorded route between points, not just at its points (the unrecorded gap between track segments doesn't count). Listed in order of first entry. If none reaches 50 m, the start postcode counts.
- **Outside any postcode** — route distance that falls in no postcode polygon (water, ferries, coast; boundaries stop at the coastline). Reported as a footnote, not a postcode.
- **Locality** — a suburb/locality name (ABS SAL) shown alongside a postcode; up to 3 per postcode, ranked by population. _Avoid_: treating a locality as a postcode.
