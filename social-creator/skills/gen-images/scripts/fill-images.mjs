#!/usr/bin/env node
// gen-images · fill-images.mjs — 读 storyboard.json，逐镜用 Agnes 生成画面，
// 下载到 <storyboard 同目录>/assets/，回填 image_url / image_file（每镜即时写盘，
// 可断点续传），最后调 gen-storyboard 的共享渲染器重画 HTML。
// 纯 Node、零依赖（Node ≥ 18 全局 fetch）。绝不打印 API key。
//
// 用法：
//   node fill-images.mjs <storyboard.json> [--model agnes-image-2.1-flash]
//        [--only 1,3] [--force] [--html storyboard.html] [--no-render]
//
// 鉴权：环境变量 AGNES_API_KEY / AGNES_API_TOKEN / APIHUB_AGNES_API_KEY 任一。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const BASE = 'https://apihub.agnes-ai.com';
const DEFAULT_MODEL = 'agnes-image-2.1-flash';   // 文生图
const I2I_MODEL = 'agnes-image-2.0-flash';       // 图生图 / 带参考图（--ref 时默认切到它）
const TEXT_MODEL = 'agnes-2.0-flash';   // 中文提示词自动转英文（Agnes 英文出图更稳）
const HERE = dirname(fileURLToPath(import.meta.url));
const RENDERER = resolve(HERE, '..', '..', 'gen-storyboard', 'scripts', 'build.mjs');

const die = (m) => { console.error('fill-images: ' + m); process.exit(1); };

function getKey() {
  for (const n of ['AGNES_API_KEY', 'AGNES_API_TOKEN', 'APIHUB_AGNES_API_KEY'])
    if (process.env[n]) return process.env[n];
  die('缺少 API key，请设置 AGNES_API_KEY（或 AGNES_API_TOKEN / APIHUB_AGNES_API_KEY）。');
}

// ---- 参数 ----
const argv = process.argv.slice(2);
const opt = { model: DEFAULT_MODEL, only: null, force: false, render: true, html: null, translate: true, ref: null, refStyle: false, modelSet: false };
let input = null;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--model') { opt.model = argv[++i]; opt.modelSet = true; }
  else if (a === '--only') opt.only = new Set(argv[++i].split(',').map((s) => s.trim()));
  else if (a === '--ref') opt.ref = argv[++i];               // 锚点镜号：用该镜的图作参考，锁人物+画风
  else if (a === '--ref-style') opt.refStyle = true;         // 只锁画风/色调，不强制出现参考图里的人物
  else if (a === '--force') opt.force = true;
  else if (a === '--no-render') opt.render = false;
  else if (a === '--no-translate') opt.translate = false;
  else if (a === '--html') opt.html = argv[++i];
  else if (!input) input = a;
  else die('unexpected argument: ' + a);
}
if (!input) die('usage: node fill-images.mjs <storyboard.json> [--model M] [--only 1,3] [--force] [--no-render]');

const jsonPath = resolve(input);
let sb;
try { sb = JSON.parse(readFileSync(jsonPath, 'utf8')); }
catch (e) { die('cannot read/parse ' + input + ': ' + e.message); }
if (!Array.isArray(sb.scenes) || !sb.scenes.length) die('storyboard has no scenes');

const dir = dirname(jsonPath);
const assetsDir = join(dir, 'assets');
mkdirSync(assetsDir, { recursive: true });
const size = sb.size || '1024x768';
const style = sb.style || '';
const headers = { Authorization: `Bearer ${getKey()}`, 'Content-Type': 'application/json' };

function extractImageUrl(data) {
  const pick = (o) => (o && typeof o === 'object')
    ? (typeof o.url === 'string' ? o.url : typeof o.image_url === 'string' ? o.image_url : null) : null;
  if (Array.isArray(data?.data)) for (const it of data.data) { const u = pick(it); if (u) return u; }
  return pick(data);
}
function extractB64(data) {
  if (Array.isArray(data?.data)) for (const it of data.data) if (typeof it?.b64_json === 'string') return it.b64_json;
  return typeof data?.b64_json === 'string' ? data.b64_json : null;
}

const hasCJK = (s) => /[㐀-鿿　-〿＀-￯]/.test(s);

async function translateToEnglish(text) {
  const res = await fetch(BASE + '/v1/chat/completions', {
    method: 'POST', headers,
    body: JSON.stringify({
      model: TEXT_MODEL, temperature: 0, max_tokens: 1024,
      messages: [
        { role: 'system', content: 'Translate the user\'s image generation prompt into ONE fluent English prompt. Preserve every concrete visual detail: subject, the child\'s young age, scene, style, lighting, composition, and all constraints. Return ONLY the English prompt — no quotes, no preamble.' },
        { role: 'user', content: text },
      ],
    }),
  });
  const t = await res.text();
  if (!res.ok) throw new Error(`翻译失败 HTTP ${res.status} — ${t.slice(0, 200)}`);
  const out = JSON.parse(t)?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error('翻译返回为空');
  return out;
}

// 瞬时错误（5xx / 上游抖动 / 网络）自动重试，退避递增。
async function withRetry(fn, label, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const msg = String(e?.message || e);
      const transient = /HTTP 5\d\d|请求失败|下载失败 HTTP 5|do_request_failed|upstream|busy|ECONN|ETIMEDOUT|fetch failed/i.test(msg);
      if (!transient || i === tries) throw e;
      const wait = 1500 * i;
      console.error(`\n     ${label}第 ${i} 次失败（${msg.slice(0, 70)}），${wait}ms 后重试…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

async function genImage(prompt, refUrls) {
  const extra_body = { response_format: 'url' };
  if (refUrls && refUrls.length) extra_body.image = refUrls;   // 图生图参考
  let res;
  try {
    res = await fetch(BASE + '/v1/images/generations', {
      method: 'POST', headers,
      body: JSON.stringify({ model: opt.model, prompt, size, extra_body }),
    });
  } catch (e) { throw new Error('请求失败 — ' + e.message); }
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);
  let data; try { data = JSON.parse(text); } catch { throw new Error('响应非 JSON — ' + text.slice(0, 300)); }
  const url = extractImageUrl(data);
  if (url) return { url };
  const b64 = extractB64(data);
  if (b64) return { b64 };
  throw new Error('响应里找不到图片 — ' + text.slice(0, 300));
}

function extFrom(url, ct) {
  if (ct?.includes('jpeg') || ct?.includes('jpg')) return 'jpg';
  if (ct?.includes('webp')) return 'webp';
  if (ct?.includes('png')) return 'png';
  const e = extname(new URL(url, 'https://x/').pathname).replace('.', '').toLowerCase();
  return /^(png|jpg|jpeg|webp)$/.test(e) ? (e === 'jpeg' ? 'jpg' : e) : 'png';
}

async function download(url, destNoExt) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  const ext = extFrom(url, res.headers.get('content-type') || '');
  const dest = destNoExt + '.' + ext;
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

const saveSb = () => writeFileSync(jsonPath, JSON.stringify(sb, null, 2) + '\n');

// ---- 解析锚点参考图 ----
let refUrl = null;
if (opt.ref != null) {
  const rs = sb.scenes.find((x, i) => String(x.id != null ? x.id : i + 1) === String(opt.ref));
  if (!rs) die(`--ref ${opt.ref}: 找不到该镜`);
  if (!rs.image_url) die(`--ref ${opt.ref}: 该镜还没有 image_url（需先生成并取得托管 URL 作锚点）`);
  refUrl = rs.image_url;
  if (!opt.modelSet) opt.model = I2I_MODEL;   // 有参考图时默认切到图生图模型
}

// ---- 逐镜生成 ----
console.log(`gen-images · model=${opt.model} size=${size}${refUrl ? ' · ref=镜' + opt.ref : ''} → ${assetsDir}`);
let done = 0, skipped = 0;
const failed = [];
for (let i = 0; i < sb.scenes.length; i++) {
  const s = sb.scenes[i];
  const id = s.id != null ? s.id : i + 1;
  if (opt.only && !opt.only.has(String(id))) continue;
  if (s.image_file && !opt.force) { skipped++; console.log(`  镜 ${id}: 已有图，跳过（--force 可重做）`); continue; }
  const useRef = refUrl && String(id) !== String(opt.ref);   // 不拿自己当参考
  let prompt = [s.image_prompt, style ? `风格：${style}` : null].filter(Boolean).join('\n\n');
  if (useRef) prompt = (opt.refStyle
    ? `保持与参考图一致的整体写实画风、色调、光线与年代质感；本镜不必出现参考图中的人物。\n\n`
    : `严格保持与参考图一致的人物形象（同一张脸、同样的年龄、同样的衣着）与整体写实画风、色调；只改变场景内容。\n\n`) + prompt;
  process.stdout.write(`  镜 ${id}: 生成中… `);
  try {
    if (opt.translate && hasCJK(prompt)) prompt = await withRetry(() => translateToEnglish(prompt), '翻译');
    const r = await withRetry(() => genImage(prompt, useRef ? [refUrl] : null), '生成');
    const destNoExt = join(assetsDir, `scene${String(id).padStart(2, '0')}`);
    let file;
    if (r.url) { file = await withRetry(() => download(r.url, destNoExt), '下载'); s.image_url = r.url; }
    else { file = destNoExt + '.png'; writeFileSync(file, Buffer.from(r.b64, 'base64')); s.image_url = null; }
    s.image_file = 'assets/' + basename(file);
    saveSb();
    done++;
    console.log('✓ ' + s.image_file);
  } catch (e) {
    failed.push(id);
    console.log('✗ ' + e.message);
  }
}

console.log(`\n完成：生成 ${done}，跳过 ${skipped}${failed.length ? '，失败 ' + failed.join(',') : ''}`);

// ---- 重渲染 ----
if (opt.render) {
  const htmlOut = resolve(dir, opt.html || 'storyboard.html');
  if (!existsSync(RENDERER)) {
    console.log('（找不到 gen-storyboard/scripts/build.mjs，跳过渲染；手动跑 build.mjs 即可刷新页面）');
  } else {
    const r = spawnSync('node', [RENDERER, jsonPath, '-o', htmlOut], { stdio: 'inherit' });
    if (r.status === 0) console.log('已刷新 ' + htmlOut);
  }
}
if (failed.length) process.exit(1);
