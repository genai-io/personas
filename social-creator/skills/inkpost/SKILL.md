---
name: inkpost
description: Turn written copy/文案 into a hand-drawn illustrated long-image (图解 / 海报) in this repo's sketch style, sized for a chosen platform (微信公众号 / 小红书 / 朋友圈 / 微博 / 知乎 / B站专栏 / PPT), then render/export to PNG. Use when asked to make/create/排版/render/screenshot/export a 图解, 长图, 手绘海报, or turn copy into an illustrated post.
---

# inkpost (文案 → 手绘图文长图)

Turn a piece of copy into a hand-drawn long image in the house style — a
**图解系列** episode (educational, dual-track 主线+旁注) or a **发布海报**
(release/announcement) — then render it sized for whatever platform it's going
to. Output is a single zero-dependency HTML file at your working directory that
draws itself; the exporter renders it per a **platform preset** (width / DPI /
output form). Authoring **and** rendering live in this one skill.

This skill bundles everything under its own directory — `skills/inkpost/` inside
the `social-creator` persona (`scripts/` for executables, the fill-in template at
the skill root):
- **`template.html`** (skill root) — copy-and-fill skeleton: full CSS design
  system + the vanilla-JS sketch lib + a diagram catalog + example sections.
- **`scripts/shot.mjs`** — the exporter: pure Node (no deps), drives headless
  Google Chrome over the DevTools protocol; renders the page at a preset's
  width/DPI and writes the PNGs.

**Locate the skill first.** The persona may be installed at project or user
scope, so resolve its directory into `$INKPOST` and use that in every command
below. Run the authoring commands from your working directory — the
`<slug>.html` and exported PNGs land there.

```bash
INKPOST=$(ls -d "$PWD/.san/personas/social-creator/skills/inkpost" \
              "$HOME/.san/personas/social-creator/skills/inkpost" 2>/dev/null | head -1)
```

## Workflow

1. **Ask the user which platform(s) they're publishing to** — this sets the size
   and output form. Use `AskUserQuestion` (multi-select) with: 微信公众号 /
   小红书 / 朋友圈 / 微博 / 知乎 / B站专栏 / PPT. Map each to a preset:

   | 平台 | 平台参数 | 画幅 × 倍率 | 产出形式 |
   |---|---|---|---|
   | 微信公众号 (默认) | `wechat` | 414 × 3 | 卡片切片 + 长图 |
   | 小红书 | `xhs` | 360 × 3 | 竖卡（≈1080 宽） |
   | 朋友圈 | `pengyouquan` | 414 × 3 | 单张长图 |
   | 微博 | `weibo` | 480 × 3 | 长图（略宽） |
   | 知乎 | `zhihu` | 460 × 2 | 内嵌卡片 |
   | B站专栏 | `bilibili` | 460 × 2 | 内嵌卡片 |
   | PPT | `ppt` | 430 × 3 | 高清竖卡（自行摆上 16:9 页） |

   Also accepts Chinese names (`小红书`, `微博`, …) as aliases. For several
   platforms, export once per preset into separate out-dirs.

2. **Copy the template** to your working directory and rename:
   ```bash
   cp "$INKPOST/template.html" <slug>.html
   ```
3. **Fill the cover.** 图解系列 → `.series-tag` = `图解 XXX · 0N`; 海报 → `.tag` =
   a one-line positioning. Set `<h1>`, `.sub`, `.legend`.
4. **Write the sections** (one `<section>` = one screen). Keep the house writing
   style: objective (no "我觉得"), narrative paragraphs not bullet dumps, no AI 八股
   (decorative emoji, "五大核心" listicles, concept tables, "写在最后"). Developer
   detail → a `.note` 黄便签; key phrases → `<span class="hl">`.
5. **Mark every exportable screen** with `class="shot" data-name="NN-name"` — one
   PNG per `.shot`, named from `data-name`.
6. **Add diagrams** by dropping the matching `<svg id="...">` into a section (see
   catalog). Built-in diagram functions carry **placeholder Chinese labels** —
   edit the labels inside the matching `draw*()` in the `<script>`, or duplicate
   it under a new `id` for a bespoke one.
7. **Preview, then export with the chosen platform** (see 导出 below):
   ```bash
   open <slug>.html                                              # live preview
   node "$INKPOST/scripts/shot.mjs" <slug>.html <out-dir> <platform>
   ```
   Then read the PNGs and actually look — fix anything clipped or garbled.

## Design system (in the template)

- **Palette** (`:root` vars): cream paper + warm ink + blue/green/red/gold/plum
  accents, marker-yellow highlight, sticky-note yellow.
- **Fonts:** macOS system handwriting (`Hanzipen SC` / `Hannotate SC`, fall back
  to 楷体) + mono for code. **No CDN, no web fonts** (blocked/slow in China) — so
  the handwriting only renders on macOS.
- **Components** (classes): `.series-tag`/`.tag` (cover badge), `.hero`+`h1`+
  `.sub`+`.legend`, `.sec-kicker`+`h2`, `.note`+`.note-tab` (技术旁注), `.hl`
  (highlight), `.card .c-*` (color-edged section card), `.chips` (tag/coverage
  row), `.pt-list` (✓/• point list), `.code-tab`+`pre.code` (`.cmt`/`.str`
  tokens), `.trace`+`.step .user/.think/.act/.obs/.ans`, `.punch` (closing 金句).

### Diagram catalog (drop the `<svg>`, it auto-draws)

| put in HTML | draws | viewBox |
|---|---|---|
| `<svg id="heroLine">` / `<svg id="endLine">` | title / closing underline | `0 0 320 22` / `0 0 300 20` |
| `<svg id="loop">` | 感知→决策→行动→反馈 环路 | `0 0 520 430` |
| `<svg id="anat">` | 中心节点 + 5 模块辐射 | `0 0 680 560` |
| `<svg id="ladder">` | 上升阶梯 L0–L5 | `0 0 660 500` |
| `<svg id="eq">` | 等式 甲+乙+丙=结果 | `0 0 580 120` |
| `<svg id="flow">` | 流程图（判断分支 + 回路） | `0 0 560 520` |
| `<svg id="term">` | 终端窗口（海报封面） | `0 0 360 210` |
| `<svg id="heart">` | 手绘爱心 | `0 0 60 56` |
| `<svg class="ck">` | 绿色对勾（要点列表内） | `0 0 28 28` |
| `<svg class="harrow">` | 竖向小箭头（trace 之间） | `0 0 34 40` |

**New diagram?** Use the sketch primitives: `rect`, `fillRect`, `ellipse`,
`fillEllipse`, `stroke`, `line2`, `arrow`, `path`, `sparkle`, `text`.
**`text(svg,x,y,str,opts)` always needs both x AND y** (a dropped `y` sends every
label to the top of the SVG); it auto-paints a paper halo behind glyphs.

## 导出（渲染成图）

The driver `shot.mjs` is pure Node — no `npm install`. **Prereq:** macOS with
Google Chrome at `/Applications/Google Chrome.app`, Node ≥ 22 (uses the global
`WebSocket`; verified on v24).

```bash
node "$INKPOST/scripts/shot.mjs" <page.html> <out-dir> [platform]
```

- `[platform]` preset (default `wechat`) sets render width / DPI / output form —
  presets are at the top of `shot.mjs`.
- Output: `NN-<name>.png` per `.shot` block (1452px wide @ wechat 3×), plus
  `00-full.png` (the whole page; auto-scaled so it can't exceed Chrome's texture
  height). `emit` per preset decides cards / long / both.

**Gotchas (do not "simplify" these away):**
- Chrome 111+ silently refuses the DevTools WebSocket from a non-browser client →
  the run hangs with no error. `shot.mjs` launches with `--remote-allow-origins=*`.
- A single full-page 3× screenshot of a long page exceeds Chrome's GPU texture
  height (~16384px) and hangs forever; `shot.mjs` scales `00-full` to ≤15000
  device px and captures sections first.
- Every CDP command has a timeout; without it one stuck capture freezes the run.
- Render width is set via `Emulation.setDeviceMetricsOverride` — `--window-size`
  is unreliable in `--headless=new`.
- Chrome path defaults to the macOS location; override it on another machine with
  the `CHROME` env var (e.g. `CHROME=/path/to/chrome node "$INKPOST/scripts/shot.mjs" …`).

**Troubleshooting:**
- Prints `已连上 Chrome…` then hangs → a capture is stuck; kill leftover headless
  Chrome with `pkill -f shot.mjs` (it uses its own `--user-data-dir`, so this
  won't touch your normal Chrome).
- `找不到 DevTools 目标` → Chrome never started; check the `CHROME` path / install.
- Boxy/default-font text instead of handwriting → not on macOS, or
  `Hanzipen SC` / `Hannotate SC` aren't installed.

## Authoring conventions

- Render width comes from the platform preset (360–480 logical px); the
  `@media(max-width:560px)` styles apply for all presets.
- **`pre.code` lines must stay ≤ ~46 half-width chars** (tighter on the 360-wide
  小红书 preset), or they overflow `pre` and get clipped. Put Chinese
  inline-comments on their own line.
- Diagrams draw on `DOMContentLoaded` only for `id`s present; `.ck` / `.harrow`
  scan by class. SVGs are viewBox-based so they scale cleanly across presets.
- An `<svg>` inside a flex row needs its auto side-margins cleared (global
  `svg{margin:0 auto}` otherwise pushes it) — the template does this for `.ck`.

## Reference

`template.html` ships with worked example sections (cover, color cards, the
diagram catalog, a reasoning trace, closing 金句) — copy from those. The house
style was developed on a 图解系列 + release-poster set in the source blog repo;
those pages aren't bundled here, the template carries the whole system.
