#!/usr/bin/env node
// gen-storyboard · agnes.mjs — 用 Agnes 文本模型 (agnes-2.0-flash) 起草分镜。
// 仅在文案引擎选 "agnes" 时需要；引擎选 "current"（San 自身模型）时本脚本不参与。
// 纯 Node、零依赖（Node ≥ 18 的全局 fetch）。绝不打印 API key。
//
// 鉴权：环境变量 AGNES_API_KEY / AGNES_API_TOKEN / APIHUB_AGNES_API_KEY 任一。
// 端点：POST https://apihub.agnes-ai.com/v1/chat/completions
//
// 用法：
//   node agnes.mjs draft --brief "选题/文案 brief" [--scenes 5] [--size 1152x768] \
//        [--style "cinematic, warm light"] [--lang zh] [--seed 12345]
//        → 向 stdout 打印一份合法 storyboard.json（重定向保存即可）
//   node agnes.mjs text  --prompt "..." [--system "..."] [--temperature 0.7] [--max-tokens 1024]
//        → 打印模型文本（通用兜底）

const BASE = 'https://apihub.agnes-ai.com';
const TEXT_MODEL = 'agnes-2.0-flash';

function getKey() {
  for (const n of ['AGNES_API_KEY', 'AGNES_API_TOKEN', 'APIHUB_AGNES_API_KEY']) {
    if (process.env[n]) return process.env[n];
  }
  console.error('agnes.mjs: 缺少 API key，请设置 AGNES_API_KEY（或 AGNES_API_TOKEN / APIHUB_AGNES_API_KEY）。');
  process.exit(2);
}

function parseArgs(rest) {
  const o = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('--')) o[a.slice(2)] = (rest[i + 1] && !rest[i + 1].startsWith('--')) ? rest[++i] : true;
  }
  return o;
}

async function chat(messages, { temperature = 0.7, max_tokens = 2048 } = {}) {
  let resp;
  try {
    resp = await fetch(BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: TEXT_MODEL, messages, temperature, max_tokens }),
    });
  } catch (e) {
    console.error('agnes.mjs: 请求失败 — ' + e.message);
    process.exit(1);
  }
  const body = await resp.text();
  if (!resp.ok) {
    console.error(`agnes.mjs: HTTP ${resp.status} — ${body}`);
    process.exit(1);
  }
  let data;
  try { data = JSON.parse(body); } catch { console.error('agnes.mjs: 响应非 JSON — ' + body.slice(0, 400)); process.exit(1); }
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    console.error('agnes.mjs: 响应缺少 content — ' + JSON.stringify(data).slice(0, 400));
    process.exit(1);
  }
  return content;
}

// 从模型回复里抠出第一个 JSON 对象（容忍 ```json 代码块包裹）。
function extractJson(text) {
  let t = text.trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) { console.error('agnes.mjs: 回复里找不到 JSON：\n' + text.slice(0, 600)); process.exit(1); }
  try { return JSON.parse(t.slice(a, b + 1)); }
  catch (e) { console.error('agnes.mjs: JSON 解析失败 — ' + e.message + '\n' + t.slice(0, 600)); process.exit(1); }
}

const STORYBOARD_SYSTEM = `You are a storyboard director for short social-media videos.
Output ONLY one valid JSON object, no prose, no code fence. Schema:
{
  "project": string,            // short kebab-case slug
  "title": string,              // display title in the user's language
  "size": string,               // "WIDTHxHEIGHT", echo the requested size
  "style": string,              // one global visual style line (English), reused by every image_prompt
  "seed": number|null,          // echo the requested seed, else null
  "scenes": [
    {
      "id": number,             // 1-based
      "text": string,           // narration / on-screen copy, in the USER'S language
      "image_prompt": string,   // ENGLISH. [Subject] + [Scene/Environment] + [Style] + [Lighting] + [Composition] + [Quality]
      "motion_prompt": string   // ENGLISH. camera movement + subject motion, for image-to-video
    }
  ]
}
Rules:
- image_prompt and motion_prompt MUST be fluent English (Agnes generates more stably in English); keep the SAME style/character across scenes for visual continuity.
- text stays in the user's language.
- Produce exactly the requested number of scenes. Return JSON only.`;

async function cmdDraft(rest) {
  const o = parseArgs(rest);
  if (!o.brief) { console.error('agnes.mjs draft: 需要 --brief "..."'); process.exit(2); }
  const scenes = o.scenes ? parseInt(o.scenes, 10) : 5;
  const size = o.size || '1152x768';
  const lang = o.lang || 'zh';
  const seed = o.seed != null && o.seed !== true ? parseInt(o.seed, 10) : null;
  const user = [
    `Brief: ${o.brief}`,
    `Scenes: ${scenes}`,
    `Size: ${size}`,
    o.style ? `Global style: ${o.style}` : null,
    `Narration language: ${lang}`,
    `Seed: ${seed == null ? 'null' : seed}`,
  ].filter(Boolean).join('\n');

  const content = await chat(
    [{ role: 'system', content: STORYBOARD_SYSTEM }, { role: 'user', content: user }],
    { temperature: 0.8, max_tokens: 3072 },
  );
  const sb = extractJson(content);

  // 兜底补齐，保证 build.mjs 能直接吃。
  sb.size = sb.size || size;
  if (sb.seed === undefined) sb.seed = seed;
  if (Array.isArray(sb.scenes)) {
    sb.scenes.forEach((s, i) => {
      if (s.id == null) s.id = i + 1;
      s.image_url = s.image_url ?? null;
      s.image_file = s.image_file ?? null;
      s.video_task_id = s.video_task_id ?? null;
      s.video_url = s.video_url ?? null;
      s.video_file = s.video_file ?? null;
    });
  }
  if (sb.final_video === undefined) sb.final_video = null;
  process.stdout.write(JSON.stringify(sb, null, 2) + '\n');
}

async function cmdText(rest) {
  const o = parseArgs(rest);
  if (!o.prompt) { console.error('agnes.mjs text: 需要 --prompt "..."'); process.exit(2); }
  const messages = [];
  if (o.system) messages.push({ role: 'system', content: o.system });
  messages.push({ role: 'user', content: o.prompt });
  const content = await chat(messages, {
    temperature: o.temperature ? parseFloat(o.temperature) : 0.7,
    max_tokens: o['max-tokens'] ? parseInt(o['max-tokens'], 10) : 1024,
  });
  process.stdout.write(content + '\n');
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'draft') await cmdDraft(rest);
else if (cmd === 'text') await cmdText(rest);
else { console.error('用法: node agnes.mjs <draft|text> ...'); process.exit(2); }
