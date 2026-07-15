---
name: gen-storyboard
description: Turn an idea/brief into a video storyboard — narration copy (文案) + per-scene image & motion prompts — written to storyboard.json and rendered as an HTML 分镜板 for preview. The first stage of the gen-* video pipeline (storyboard → images → videos). Use when asked to 写分镜/做分镜脚本/storyboard, plan a 讲解视频/口播视频 script, turn an idea into shots/scenes, or start a video from a topic. Copywriting engine is selectable: San's own model (default) or Agnes agnes-2.0-flash.
---

# gen-storyboard (选题/文案 → 分镜板)

把一个选题或一段 brief 拆成**逐镜分镜**，每镜带：旁白/字幕文案、`image_prompt`（生图用）、
`motion_prompt`（图生视频用）。产出两样东西：

- **`storyboard.json`** —— 整条视频 pipeline 的数据契约（spine）。后续的 `gen-images`
  往里回填 `image_*`，`gen-videos` 回填 `video_*`，三步都读写同一个文件。
- **`<project>.storyboard.html`** —— 一张分镜板，浏览器打开就能审阅文案和提示词；
  生图/生视频后重跑渲染器，同一页就地填上 `<img>`/`<video>`。

本技能**只负责第一步**（文案 + 分镜），不调图片/视频生成。

**先定位技能目录。** 持久层可能装在项目级或用户级，把它解析进 `$GS`，下面命令都用它。
作者命令在你的工作目录里跑，产物（`storyboard.json` / `*.storyboard.html`）落在那里。

```bash
GS=$(ls -d "$PWD/.san/personas/social-creator/skills/gen-storyboard" \
           "$HOME/.san/personas/social-creator/skills/gen-storyboard" 2>/dev/null | head -1)
```

## Workflow

1. **问清楚再动手**（用 `AskUserQuestion`，缺省值见括号）：
   - **选题 / brief**：要做什么内容的视频。
   - **镜数**（默认 5）：分几镜。
   - **画幅 / size**（默认 `1152x768` 横版）：横版 `1152x768`、竖版 `768x1152`（小红书/抖音）、
     方形 `1024x1024`。这个尺寸会一路用到生图和生视频。
   - **风格 style**（可选）：一句全局视觉风格（英文），每镜的 `image_prompt` 复用它来保证跨镜一致。
   - **文案引擎**：
     - `current`（默认）—— **由当前 San 模型直接写**分镜，零 API、零额外成本，质量也好。
     - `agnes` —— 用 Agnes 文本模型 `agnes-2.0-flash` 起草（需要 `AGNES_API_KEY`）。

2. **起草 storyboard.json** —— 二选一：

   **引擎 = current（默认）：** 你（当前模型）直接按下面《数据契约》写出 `storyboard.json`。
   要点：`text` 用用户语言；`image_prompt` / `motion_prompt` **用流畅英文**（Agnes 英文更稳）；
   跨镜保持同一 `style` 与主体，保证人物/画面连贯。

   **引擎 = agnes：**
   ```bash
   node "$GS/scripts/agnes.mjs" draft \
     --brief "你的选题/brief" --scenes 5 --size 1152x768 \
     --style "warm cinematic, soft light, consistent character" --lang zh \
     > storyboard.json
   ```
   它向 stdout 打印一份合法的 storyboard.json。**打开看一眼**，文案/提示词可以手改。

3. **渲染分镜板：**
   ```bash
   node "$GS/scripts/build.mjs" storyboard.json -o storyboard.html
   open storyboard.html        # 预览，逐镜审阅文案 + 提示词
   ```
   `build.mjs` 会先校验（缺 `text`/`image_prompt`/`motion_prompt` 直接报错），
   再把每镜渲染成一张卡：左边画面框（现在是"待生成"占位），右边文案 + 两条提示词。

4. **迭代文案**：改 `storyboard.json` → 重跑 `build.mjs` → 刷新页面。满意后交给下一步
   `gen-images`（它读同一个 `storyboard.json`）。

## 数据契约 storyboard.json

三个技能围绕这一个文件读写——这是整条链路的脊梁。本技能写出全部字段，
媒体字段先留 `null`，由后续技能回填：

```json
{
  "project": "morning-coffee",            // kebab-case 短 slug，用于命名输出
  "title": "一杯手冲，叫醒一座城",          // 展示标题（用户语言）
  "size": "1152x768",                      // 生图/生视频统一像素尺寸 WxH
  "style": "warm cinematic, soft light",   // 一句全局风格（英文），每镜 image_prompt 复用
  "seed": 73219,                           // 可选，固定它有助跨镜一致（gen-images 会用）
  "scenes": [
    {
      "id": 1,
      "text": "清晨六点，城市还没醒。",       // ← 旁白/字幕，用户语言（本技能写）
      "image_prompt": "An empty cafe windowsill at dawn, ...",  // ← 英文（本技能写）
      "motion_prompt": "Slow push-in toward the cup, ...",     // ← 英文（本技能写）
      "image_url":  null,   // ↓ gen-images 回填
      "image_file": null,
      "video_task_id": null, // ↓ gen-videos 回填
      "video_url":  null,
      "video_file": null
    }
  ],
  "final_video": null         // gen-videos 拼接后回填
}
```

`example.storyboard.json` 是一份可直接渲染的 3 镜实例：
`node "$GS/scripts/build.mjs" "$GS/example.storyboard.json" -o demo.html && open demo.html`。

## 写作约定

- **`text`（文案）**：用户语言，连贯口播/字幕，别堆项目符号、别 AI 八股。一镜一个意思，
  配合画幅控制每镜时长感（默认每镜对应一段 2–4 秒的视频）。
- **`image_prompt`**：英文，结构 `[主体] + [场景/环境] + [风格] + [光线] + [构图] + [质量]`。
  跨镜复用同一 `style` 与主体描述，保证连贯。
- **`motion_prompt`**：英文，描述**镜头运动 + 主体动作**（push-in / pan / 慢动作 / 漂浮…），
  这是 `gen-videos` 做图生视频的运动指令。
- **English prompts**：Agnes 的图片/视频生成英文更稳；非英文 brief 也要把这两条提示词写成英文。
- **size**：横版 `1152x768`、竖版 `768x1152`、方形 `1024x1024`；选定后一路沿用。

## API key（仅 `agnes` 引擎需要）

`agnes.mjs` 从环境变量读 key，**绝不打印**：`AGNES_API_KEY`（或 `AGNES_API_TOKEN` /
`APIHUB_AGNES_API_KEY`）。引擎选 `current` 时完全不需要 key。

## 文件

- `template.html`（技能根）—— 分镜板骨架，含占位符 `{{TITLE}}` `{{META}}` `{{FINAL}}`
  和 `<!--SCENES-->` 整块标记；`build.mjs` 据此填充。**这是 gen-* 链的共享渲染器**。
- `scripts/build.mjs` —— `storyboard.json` → 分镜板 HTML（校验 + 渲染；纯 Node 零依赖）。
- `scripts/agnes.mjs` —— `agnes` 引擎用：调 `agnes-2.0-flash` 起草分镜（`draft`），
  或通用文本（`text`）。纯 Node 零依赖。
- `example.storyboard.json` —— 可直接渲染的 schema 实例。
