# Market research: "video as code" in the age of coding agents

> Snapshot: **2026-10-11**. Stars, licenses and last-push dates come from the GitHub API on that date. Prices come from vendor pricing pages fetched the same day unless marked *(unverified)*. Treat sentiment claims as directional: we could not reach Reddit, and most qualitative sources are blogs.

## 1. Why this market matters now

Coding agents (Claude Code, Codex, Cursor, Gemini CLI) changed who makes motion graphics. Developers used to need After Effects skills. Now they ask an agent for "a 15-second launch video for our new feature", and the agent needs a medium it can write: **code or structured data that renders to video deterministically**.

Signals:

- **Remotion's skills repo** ([remotion-dev/skills](https://github.com/remotion-dev/skills)): 5,020 stars. It ships 12 agent skills plus official plugins for Claude Code, Codex and Kimi.
- **HyperFrames** ([heygen-com/hyperframes](https://github.com/heygen-com/hyperframes)), launched around mid-2026, already has **60.6k stars**, close to Remotion's 63.2k from 2020. Its pitch is agent-first: describe a video to a coding agent and let it write HTML. That growth rate is the strongest demand signal in the space.
- Remotion added `template-prompt-to-video` and `template-prompt-to-motion-graphics` starters. HN shows a steady stream of "prompt → video" projects built on it ([1](https://news.ycombinator.com/item?id=48618659), [2](https://news.ycombinator.com/item?id=48538631)).
- Many blog and video tutorials teach "Claude Code + Remotion" ([tella](https://www.tella.com/blog/how-to-use-remotion-agent-skills-with-claude-code), [timewell](https://timewell.jp/en/columns/remotion-claude-code-programmatic-video), [openreplay](https://blog.openreplay.com/making-videos-claude-code-remotion/)). We could not find hard growth numbers.

## 2. The landscape

### Open-source frameworks

| Project | Stars | License | Language | How it renders | Last push | Agent-friendliness |
|---|---|---|---|---|---|---|
| [**Remotion**](https://github.com/remotion-dev/remotion) | 63,176 | Source-available (paid for 4+ person companies) | TS / React | Headless Chrome screenshot per frame → FFmpeg; Lambda/Cloud Run | 2026-10-11 | ★★★★ official skills and plugins, huge corpus |
| [**HyperFrames**](https://github.com/heygen-com/hyperframes) (HeyGen) | 60,589 | Apache-2.0 | TS / HTML | HTML+CSS (+GSAP/Lottie/Three adapters) in headless Chrome → FFmpeg; single machine | 2026-10-11 | ★★★★ 21 skills, HTML is easy for LLMs |
| [**Manim** (Community)](https://github.com/ManimCommunity/manim) | 41,416 | MIT | Python | Cairo/OpenGL rasterizer → FFmpeg | 2026-10-10 | ★★★ LLMs know it well; math niche |
| [**Motion Canvas**](https://github.com/motion-canvas/motion-canvas) | 19,276 | MIT | TS | Canvas 2D, generator-based timeline, browser editor | 2026-07-02 | ★★ imperative generators, editor-centric |
| [**Theatre.js**](https://github.com/theatre-js/theatre) | 12,742 | Apache-2.0 core / AGPL studio | TS | Live DOM/3D animation, **no video export** | 2024-08-14 | ★ (development moved private) |
| [**Editly**](https://github.com/mifi/editly) | 5,524 | MIT | JS | FFmpeg + gl-transitions + canvas overlays; JSON5 config | 2025-05-12 | ★★★ declarative config, but stale and needs headless-gl |
| [**Revideo**](https://github.com/midrender/revideo) | 4,097 | MIT | TS | Motion Canvas fork with headless rendering API | 2026-07-15 | ★★ future unclear (folded into Midrender? *unverified*) |
| [**FFCreator**](https://github.com/tnfe/FFCreator) | 3,163 | MIT | JS | node-canvas/GL + FFmpeg | 2024-12-19 | ★ stale |
| [**Diffusion Studio core**](https://github.com/diffusionstudio/core) | 1,248 | MPL-2.0 | TS | In-browser WebCodecs compositing | 2025-11-18 | ★ quiet |

### Hosted render APIs (JSON templates in, MP4 out)

| Vendor | Pricing (Oct 2026) | Effective cost |
|---|---|---|
| [Shotstack](https://shotstack.io/pricing/) | $39/mo for 250 min → $499/mo for 10,000 min; $10 pay-as-you-go for 50 min | **$0.05–0.20 per minute** |
| [Creatomate](https://creatomate.com/pricing) | Credit plans (2k / 10k / 50k credits); Essential ≈ $54/mo *(unverified)* | ~14 credits per 720p minute |
| [JSON2Video](https://json2video.com/pricing/) | $16.63/mo (50 min, yearly) → $99.95/mo (500 min) | **~$0.20–0.42 per minute** |
| [Plainly](https://plainlyvideos.com/pricing) | $48/mo (50 min) → $1,350+/mo unlimited | ~$0.75–1.00 per minute |
| [Rendi](https://rendi.dev/pricing) | Hosted FFmpeg command runner, $25/mo+ | n/a (not a template engine) |
| **Remotion Automators** | $0.01 per render, $100/mo minimum (+ your AWS bill) | per render |

### Adjacent: generative AI video

Veo, Sora, Runway, HeyGen avatars and Synthesia **generate pixels** from prompts. That output is non-deterministic, hard to edit precisely, and can't be relied on for exact brand colors, numbers or text. Video-as-code produces **exact, reproducible, data-driven motion graphics**. The two are complementary, not substitutes. Notably, HeyGen now sells both (avatars plus HyperFrames).

## 3. What users still don't get (unmet needs)

| Need | Who serves it today | Gap |
|---|---|---|
| **Free for commercial use** | HyperFrames, Manim, Motion Canvas, Editly | Remotion, the market leader, charges teams of 4+ (*$25/seat/mo* plus render fees) |
| **Fast rendering without a browser** | Manim (Python, math-only), Editly (stale) | Every major JS tool screenshots headless Chrome. **No maintained, general-purpose, browser-free JS renderer exists.** |
| **Small, simple install** | Hosted APIs (no install) | Remotion is ~688 MB with Chrome; HyperFrames also needs Chrome |
| **A format agents can write and *check*** | HTML (HyperFrames), JSON (hosted APIs, Editly) | None ship a **validator with fix-it messages** or a **visual self-check** (storyboard) designed for agent loops |
| **Seconds, not frames** | Hosted APIs, Editly | Remotion and Motion Canvas make you think in frames or generators |
| **Self-hosted JSON templates** | Editly (stale) | Hosted APIs charge per minute; teams want the JSON workflow on their own machines |

## 4. Where Frameflow fits

```
                    expressive (any CSS/HTML/React)
                                ▲
              Remotion ●        │        ● HyperFrames
                                │
   frame/generator ◄────────────┼────────────► seconds / declarative data
   math                         │
          Motion Canvas ●       │        ● Frameflow (this project)
                 Manim ●        │        ● Shotstack / Creatomate (hosted, paid)
                                │        ● Editly (stale)
                                ▼
                  purpose-built renderer (fast, small)
```

**Frameflow's position:** an MIT-licensed, **browser-free**, **seconds-based**, **JSON-or-TypeScript** motion-graphics engine with **agent-first tooling** (schema, validator with "did you mean", storyboard contact sheets). It targets the promo/explainer/social/data-video job that agents get asked to do most.

**What we deliberately don't compete on (yet):** arbitrary HTML/CSS layouts, React component reuse, 3D, embedded video clips, and cloud-scale distributed rendering. If you need those, Remotion or HyperFrames remain the right tools. See the roadmap in [03-frameflow-design.md](03-frameflow-design.md).

## 5. Risks

- **HyperFrames has the momentum** and HeyGen's distribution. Frameflow has to win on speed, install size, and how well agents can verify their own work, not on breadth.
- **Canvas-only rendering limits** layout (no CSS flexbox) and rich text. These need first-class layout helpers.
- **Remotion could ship a lighter renderer.** Its packages already include `skia` and `webcodecs`.
