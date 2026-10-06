# Glossary

- **Activity** — one uploaded GPX file, a single run or ride. All tracks/segments in the file are merged into one activity.
- **Activity type** — `running` or `cycling`. Taken from the GPX `<type>` element, else guessed from speed; the user can override it.
- **Highlight figures** — the summary numbers shown for an activity: distance, moving time, elapsed time, average pace (running) or average speed (cycling), elevation gain, start date/time.
- **Elapsed time** — first timestamp to last timestamp.
- **Moving time** — elapsed time minus pauses; the basis for average pace/speed.
- **Pace** — minutes per km (running). **Speed** — km/h (cycling).
- **Postcode** — an Australian postal area as given by the chosen boundary dataset (expected: ABS Postal Areas, an approximation of Australia Post postcodes). _Avoid_: "suburb" (a locality, not a postcode).
- **Postcode passed through** — a postcode the activity's route counts as entering under the matching rule (to be defined in the "Postcode data delivery and matching design" ticket).
