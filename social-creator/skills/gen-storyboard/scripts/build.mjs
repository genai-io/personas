#!/usr/bin/env node
// gen-storyboard · build.mjs — 把 storyboard.json 渲染成一张分镜板 HTML。
// 这是 gen-* 技能链的共享渲染器：现在显示文案 + 提示词；等 skill2/skill3
// 往 JSON 里回填 image_*/video_* 后重跑本脚本，同一页就地填上 <img>/<video>。
// 纯 Node、零依赖。用法：node build.mjs <storyboard.json> [-o out.html]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(HERE, '..', 'template.html');

const die = (msg) => { console.error('build.mjs: ' + msg); process.exit(1); };

// ---- 解析参数 ----
const argv = process.argv.slice(2);
let input = null, out = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '-o' || argv[i] === '--out') out = argv[++i];
  else if (!input) input = argv[i];
  else die('unexpected argument: ' + argv[i]);
}
if (!input) die('usage: node build.mjs <storyboard.json> [-o out.html]');

// ---- 读取 + 校验 ----
let data;
try { data = JSON.parse(readFileSync(input, 'utf8')); }
catch (e) { die('cannot read/parse ' + input + ': ' + e.message); }
if (typeof data !== 'object' || !data) die('storyboard must be a JSON object');

const project = data.project || basename(input).replace(/\.[^.]+$/, '');
const title = data.title || project;
const size = data.size || '1152x768';
const m = /^(\d+)x(\d+)$/.exec(size);
if (!m) die('size must be WIDTHxHEIGHT, e.g. 1152x768; got ' + JSON.stringify(size));
const ar = m[1] + ' / ' + m[2];
if (!Array.isArray(data.scenes) || data.scenes.length === 0)
  die('scenes must be a non-empty array');
data.scenes.forEach((s, i) => {
  for (const k of ['text', 'image_prompt', 'motion_prompt'])
    if (typeof s[k] !== 'string' || !s[k].trim())
      die(`scene[${i}] missing required string field "${k}"`);
});

// ---- 渲染 ----
const esc = (s) => String(s).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mediaSlot(s) {
  const vid = s.video_file || s.video_url;
  const img = s.image_file || s.image_url;
  if (vid) return `<video class="media" controls preload="metadata" src="${esc(vid)}"></video>`;
  if (img) return `<img class="media" src="${esc(img)}" alt="scene ${esc(s.id)}">`;
  return `<div class="media placeholder"><span class="ph-mark">🎬</span>` +
         `<span class="ph-txt">待生成 · pending image</span></div>`;
}
function statusPill(s) {
  if (s.video_file || s.video_url) return `<span class="pill done">▶ video</span>`;
  if (s.image_file || s.image_url) return `<span class="pill img">🖼 image</span>`;
  return `<span class="pill todo">○ draft</span>`;
}

const cards = data.scenes.map((s, i) => {
  const id = s.id != null ? s.id : i + 1;
  return `  <article class="scene">
    <div class="frame" style="aspect-ratio:${ar}">
      <span class="num">${esc(id)}</span>
      ${mediaSlot(s)}
    </div>
    <div class="body">
      <div class="row"><span class="label">镜 ${esc(id)}</span>${statusPill(s)}</div>
      <p class="text">${esc(s.text)}</p>
      <details class="prompts" open>
        <summary>prompts</summary>
        <p class="pk">image</p><pre class="pp">${esc(s.image_prompt)}</pre>
        <p class="pk">motion</p><pre class="pp">${esc(s.motion_prompt)}</pre>
      </details>
    </div>
  </article>`;
}).join('\n');

const metaBits = [
  size,
  data.scenes.length + ' 镜',
  data.style ? esc(data.style) : null,
  data.seed != null ? 'seed ' + esc(data.seed) : null,
].filter(Boolean).join('  ·  ');

const finalBanner = data.final_video
  ? `<div class="final"><span>成片</span><a href="${esc(data.final_video)}">${esc(data.final_video)}</a></div>`
  : '';

let html = readFileSync(TEMPLATE, 'utf8');
html = html.replaceAll('{{TITLE}}', esc(title))
           .replaceAll('{{META}}', metaBits)
           .replaceAll('{{FINAL}}', finalBanner)
           .replace('<!--SCENES-->', cards);

const outPath = out || project.replace(/[^\w.-]+/g, '-') + '.storyboard.html';
writeFileSync(outPath, html);
console.log(`wrote ${outPath}  (${data.scenes.length} scenes, ${size})`);
