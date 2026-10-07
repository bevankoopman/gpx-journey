# Performance

Target ("Large-file and error handling", #18): a 100,000-point GPX analysed and rendered in under ~3 s on a mid-range phone, with the UI responsive throughout.

## Measured 2026-10-07

Test file: a synthetic 1 Hz ride of 100,000 points (9.8 MB GPX, ~4.2 h around greater Sydney, 41 postcodes). Production build (`vite preview`), Playwright Chromium with software WebGL at a 390×844 phone viewport. "Results shown" runs from choosing the file until the figures and postcode list are on screen. "Warm" means the postcode data had already been prefetched; "cold" means the file was chosen as soon as the page loaded, while the prefetch was still running.

| CPU | Data | Results shown | Longest main-thread task | Longest frame gap |
|---|---|---|---|---|
| 1× (Apple-silicon laptop) | warm | 0.84 s | 76 ms | 75 ms |
| 1× | cold | 1.35 s | 63 ms | 184 ms |
| 4× throttled (Lighthouse "mid-tier mobile") | warm | 0.96 s | 226 ms | 250 ms |
| 4× throttled | cold | 1.53 s | 218 ms | 243 ms |

Analysis runs in a Web Worker, so the main thread only reads the file, posts it, and renders the result: one long task of about 0.2 s at 4×, with no freezes.

**Caveat:** Chrome's CPU throttling (`Emulation.setCPUThrottlingRate`) targets the page's main thread and may not slow the dedicated worker equally. The small 1×→4× difference suggests it doesn't. A conservative estimate for a mid-range phone takes the worker-side cost measured in Node (≈0.35 s to parse, measure and match 100k points on this laptop) × 4–5 ≈ 1.4–1.8 s, plus ≈0.25 s of main-thread work: comfortably under 3 s. This has not been measured on a physical phone.

Method: a Playwright script (not committed) throttles the CPU through CDP, records `longtask` entries and the longest gap between `requestAnimationFrame` callbacks.
