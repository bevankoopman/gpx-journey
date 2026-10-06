# Glossary

- **Activity** — one uploaded GPX file, a single run or ride. All tracks/segments in the file are merged into one activity.
- **Activity type** — `running` or `cycling`. Taken from the GPX `<type>` element, else guessed from speed; the user can override it.
- **Highlight figures** — the summary numbers shown for an activity: distance, moving time, elapsed time, average pace (running) or average speed (cycling), elevation gain, start date/time.
- **Elapsed time** — first timestamp to last timestamp.
- **Moving time** — elapsed time minus pauses; the basis for average pace/speed.
- **Pace** — minutes per km (running). **Speed** — km/h (cycling).
- **Postcode** — an Australian postal area as given by the chosen boundary dataset (expected: ABS Postal Areas, an approximation of Australia Post postcodes). _Avoid_: "suburb" (a locality, not a postcode).
- **Postcode passed through** — a postcode with at least 50 m (tunable) of the activity's route inside its boundary, measured on the route's segments, not just its points. Listed in order of first entry. If none reaches 50 m, the start postcode counts.
- **Outside any postcode** — route distance that falls in no postcode polygon (water, ferries, coast; boundaries stop at the coastline). Reported as a footnote, not a postcode.
- **Locality** — a suburb/locality name (ABS SAL) shown alongside a postcode; up to 3 per postcode, ranked by population. _Avoid_: treating a locality as a postcode.
