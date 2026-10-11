---
name: frameflow
description: Create or edit motion-graphics videos with Frameflow (video as code, seconds-based, TS or JSON scenes). Use when asked to make a promo, explainer, social clip, animated chart, captions or any programmatic video in this repo.
---

# Making videos with Frameflow

Read `AGENTS.md` for the full vocabulary. Then:

1. Draft the scene in `examples/<name>.ts`, or `.json` if no logic is needed.
2. Run `node dist/cli.js check <scene>` and fix every error. Messages include the path and the likely fix.
3. Run `node dist/cli.js storyboard <scene> out/<name>.storyboard.png --count 8` and Read the PNG. Check that:
   - nothing overlaps unintentionally and text fits inside the frame
   - entrances and exits happen when intended (timestamps are printed on each tile)
   - the last tile isn't empty (unless intended)
4. Iterate until the storyboard looks right, then `node dist/cli.js render <scene> out/<name>.mp4`.
5. Report the output path, duration, and render time.

Design defaults that look good: dark background (#0f172a), one accent color, 2–3 text sizes (≈110/56/36 px at 1080p), `enter: 'fadeUp'` for headings, `pop` for shapes, stagger steps 0.1–0.15s, and a 0.4–0.6s exit fade.
