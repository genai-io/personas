#!/usr/bin/env node
// gen-videos · make-videos.mjs — 读 storyboard.json，逐镜用 Agnes 图生视频：
// image_url + motion_prompt → 异步建任务 → 轮询 → 下载到 assets/sceneNN.mp4，
// 回填 video_task_id / video_url / video_file（即时写盘、可断点续传），
// 全部就绪后用 ffmpeg 拼成 final.mp4、回填 final_video，并重渲染 HTML。
// 纯 Node + ffmpeg，零 npm 依赖（Node ≥ 18 全局 fetch）。绝不打印 API key。
//
// 关键：任务 id 一建即落盘；重跑时若该镜已有 video_task_id 且未 --force，
// 直接续接轮询，不会重复建任务（避免重复计费）。
//
// 用法：
//   node make-videos.mjs <storyboard.json> [--model agnes-video-v2.0]
//        [--frames 121] [--fps 24] [--only 1,3] [--force]
//        [--timeout 1200] [--interval 12] [--no-translate] [--no-concat] [--no-render]
//
// 鉴权：环境变量 AGNES_API_KEY / AGNES_API_TOKEN / APIHUB_AGNES_API_KEY 任一。
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const BASE = 'https://apihub.agnes-ai.com';
const DEFAULT_MODEL = 'agnes-video-v2.0';
const TEXT_MODEL = 'agnes-2.0-flash';   // 中文运镜提示词自动转英文（Agnes 英文更稳）
const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = resolve(HERE, '..', '..', 'gen-storyboard', 'scripts', 'build.mjs');

const die = (m) => { console.error('make-videos: ' + m); process.exit(1); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getKey() {
  for (const n of ['AGNES_API_KEY', 'AGNES_API_TOKEN', 'APIHUB_AGNES_API_KEY'])
    if (process.env[n]) return process.env[n];
  die('缺少 API key，请设置 AGNES_API_KEY（或 AGNES_API_TOKEN / APIHUB_AGNES_API_KEY）。');
}

// ---- 参数 ----
const argv = process.argv.slice(2);
const opt = {
  model: DEFAULT_MODEL, frames: 121, fps: 24, only: null, force: false,
  timeout: 1200, interval: 12, translate: true, concat: true, render: true,
};
let input = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--model') opt.model = argv[++i];
  else if (a === '--frames') opt.frames = parseInt(argv[++i], 10);
  else if (a === '--fps') opt.fps = parseFloat(argv[++i]);
  else if (a === '--only') opt.only = new Set(argv[++i].split(',').map((s) => s.trim()));
  else if (a === '--force') opt.force = true;
  else if (a === '--timeout') opt.timeout = parseInt(argv[++i], 10);
  else if (a === '--interval') opt.interval = parseInt(argv[++i], 10);
  else if (a === '--no-translate') opt.translate = false;
  else if (a === '--no-concat') opt.concat = false;
  else if (a === '--no-render') opt.render = false;
  else if (!input) input = a;
  else die('unexpected argument: ' + a);
}
if (!input) die('usage: node make-videos.mjs <storyboard.json> [--frames 121] [--fps 24] [--only 1,3] [--force]');
if (opt.frames > 441 || (opt.frames - 1) % 8 !== 0) die('--frames 必须满足 8n+1 且 ≤441，例如 81 或 121');
if (!(opt.fps >= 1 && opt.fps <= 60)) die('--fps 取值 1–60');

const jsonPath = resolve(input);
let sb;
try { sb = JSON.parse(readFileSync(jsonPath, 'utf8')); }
catch (e) { die('cannot read/parse ' + input + ': ' + e.message); }
if (!Array.isArray(sb.scenes) || !sb.scenes.length) die('storyboard has no scenes');

const dir = dirname(jsonPath);
const assetsDir = join(dir, 'assets');
mkdirSync(assetsDir, { recursive: true });
const m = /^(\d+)x(\d+)$/.exec(sb.size || '1152x768');
const width = m ? parseInt(m[1], 10) : 1152;
const height = m ? parseInt(m[2], 10) : 768;
const headers = { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json' };
const saveSb = () => writeFileSync(jsonPath, JSON.stringify(sb, null, 2) + '\n');

// ---- 通用 ----
const hasCJK = (s) => /[㐀-鿿　-〿＀-￯]/.test(s);

async function withRetry(fn, label, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const msg = String(e?.message || e);
      const transient = /HTTP 5\d\d|请求失败|下载失败 HTTP 5|do_request_failed|upstream|busy|ECONN|ETIMEDOUT|fetch failed/i.test(msg);
      if (!transient || i === tries) throw e;
      const wait = 2000 * i;
      console.error(`\n     ${label}第 ${i} 次失败（${msg.slice(0, 70)}），${wait}ms 后重试…`);
      await sleep(wait);
    }
  }
  throw last;
}

async function apiJson(method, path, payload) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method, headers,
      body: payload ? JSON.stringify(payload) : undefined,
    });
  } catch (e) { throw new Error('请求失败 — ' + e.message); }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);
  try { return text ? JSON.parse(text) : {}; }
  catch { throw new Error('响应非 JSON — ' + text.slice(0, 300)); }
}

async function translateToEnglish(text) {
  const data = await apiJson('POST', '/v1/chat/completions', {
    model: TEXT_MODEL, temperature: 0, max_tokens: 512,
    messages: [
      { role: 'system', content: 'Translate the user\'s image-to-video motion prompt into ONE fluent English prompt. Preserve camera movement, subject motion, pacing, lighting and mood. Return ONLY the English prompt — no quotes, no preamble.' },
      { role: 'user', content: text },
    ],
  });
  const out = data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('翻译返回为空');
  return out;
}

function extractVideoUrl(data) {
  // Agnes 完成后的视频 URL 可能落在 video_url / url / remixed_from_video_id 任一字段。
  const KEYS = ['video_url', 'url', 'remixed_from_video_id'];
  const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
  for (const k of KEYS) if (isUrl(data?.[k])) return data[k];
  if (Array.isArray(data?.data)) for (const it of data.data) {
    for (const k of KEYS) if (isUrl(it?.[k])) return it[k];
  }
  return null;
}

async function downloadMp4(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function createTask(prompt, imageUrl) {
  const payload = {
    model: opt.model, prompt, image: imageUrl,
    width, height, num_frames: opt.frames, frame_rate: opt.fps,
  };
  if (sb.seed != null) payload.seed = sb.seed;
  return apiJson('POST', '/v1/videos', payload);
}

async function pollTask(id) {
  const deadline = Date.now() + opt.timeout * 1000;
  let last = {};
  while (Date.now() < deadline) {
    last = await withRetry(() => apiJson('GET', `/v1/videos/${id}`), '查询');
    const status = String(last.status || '').toLowerCase();
    process.stdout.write(`\r     任务 ${id}: ${status}${last.progress != null ? ' ' + last.progress + '%' : ''}      `);
    if (status === 'completed') return last;
    if (status === 'failed') throw new Error('任务失败 — ' + JSON.stringify(last).slice(0, 300));
    await sleep(opt.interval * 1000);
  }
  throw new Error(`轮询超时（${opt.timeout}s），任务 ${id} 仍未完成`);
}

// ---- 逐镜生成 ----
console.log(`gen-videos · model=${opt.model} ${width}x${height} ${opt.frames}f@${opt.fps} → ${assetsDir}`);
let done = 0, skipped = 0;
const failed = [];
for (let i = 0; i < sb.scenes.length; i++) {
  const s = sb.scenes[i];
  const id = s.id != null ? s.id : i + 1;
  if (opt.only && !opt.only.has(String(id))) continue;
  if (s.video_file && !opt.force) { skipped++; console.log(`  镜 ${id}: 已有视频，跳过（--force 可重做）`); continue; }
  if (!s.image_url) { failed.push(id); console.log(`  镜 ${id}: ✗ 缺 image_url，请先跑 gen-images`); continue; }

  console.log(`  镜 ${id}:`);
  try {
    // 续接：已有 task_id 且非强制 → 直接轮询，不重复建任务
    let taskId = (!opt.force && s.video_task_id) ? s.video_task_id : null;
    if (taskId) {
      console.log(`     续接已有任务 ${taskId}`);
    } else {
      let prompt = s.motion_prompt || s.text || '';
      if (opt.translate && hasCJK(prompt)) prompt = await withRetry(() => translateToEnglish(prompt), '翻译');
      const created = await withRetry(() => createTask(prompt, s.image_url), '建任务');
      taskId = created.id;
      if (!taskId) throw new Error('建任务响应缺 id — ' + JSON.stringify(created).slice(0, 200));
      s.video_task_id = taskId; saveSb();
      console.log(`     已建任务 ${taskId}，轮询中…`);
    }
    const result = await pollTask(taskId);
    const url = extractVideoUrl(result);
    if (!url) throw new Error('完成但未找到视频 URL — ' + JSON.stringify(result).slice(0, 300));
    const dest = join(assetsDir, `scene${String(id).padStart(2, '0')}.mp4`);
    await withRetry(() => downloadMp4(url, dest), '下载');
    s.video_url = url; s.video_file = 'assets/' + basename(dest);
    saveSb(); done++;
    console.log(`\r     ✓ ${s.video_file}                              `);
  } catch (e) {
    failed.push(id);
    console.log(`\r     ✗ ${e.message}                              `);
  }
}
console.log(`\n生成 ${done}，跳过 ${skipped}${failed.length ? '，失败 ' + failed.join(',') : ''}`);

// ---- 拼接成片 ----
const ordered = sb.scenes.filter((s) => s.video_file);
const allReady = ordered.length === sb.scenes.length;
if (opt.concat && !opt.only && allReady) {
  const listPath = join(dir, '.concat.txt');
  writeFileSync(listPath, ordered.map((s) => `file '${resolve(dir, s.video_file)}'`).join('\n') + '\n');
  const out = resolve(dir, 'final.mp4');
  console.log('拼接成片 → final.mp4 …');
  const r = spawnSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', listPath,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out], { stdio: 'inherit' });
  rmSync(listPath, { force: true });
  if (r.status === 0) { sb.final_video = 'final.mp4'; saveSb(); console.log('✓ final.mp4'); }
  else console.log('ffmpeg 拼接失败（status ' + r.status + '）');
} else if (opt.concat && !allReady) {
  console.log(`（还差 ${sb.scenes.length - ordered.length} 镜没视频，齐了再拼接）`);
}

// ---- 重渲染 ----
if (opt.render && existsSync(RENDERER)) {
  const r = spawnSync('node', [RENDERER, jsonPath, '-o', resolve(dir, 'storyboard.html')], { stdio: 'inherit' });
  if (r.status === 0) console.log('已刷新 storyboard.html');
}
if (failed.length) process.exit(1);
