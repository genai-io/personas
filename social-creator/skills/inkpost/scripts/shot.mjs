// 用本机 Chrome 无头模式，把图解按"手机宽度 + 3x 高清"导成 PNG（公众号上传即用）
// 纯 Node，零依赖：用内置 fetch + WebSocket 直连 Chrome DevTools 协议
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

// 用法: node shot.mjs <html> [输出目录] [平台]   平台缺省 wechat
// 平台预设：画幅(逻辑宽) + 倍率(DPR) + 产出形式(cards 卡片切片 / long 单张长图 / both)
const PRESETS = {
  wechat:      { w: 414, dpr: 3, emit: 'both',  desc: '微信公众号：卡片切片 + 长图' },
  xhs:         { w: 360, dpr: 3, emit: 'cards', desc: '小红书：竖卡（≈1080 宽）' },
  pengyouquan: { w: 414, dpr: 3, emit: 'long',  desc: '朋友圈：单张长图' },
  weibo:       { w: 480, dpr: 3, emit: 'long',  desc: '微博：长图（略宽）' },
  zhihu:       { w: 460, dpr: 2, emit: 'cards', desc: '知乎：内嵌图（2×）' },
  bilibili:    { w: 460, dpr: 2, emit: 'cards', desc: 'B 站专栏：内嵌图（2×）' },
  ppt:         { w: 430, dpr: 3, emit: 'cards', desc: 'PPT：高清竖卡，自行摆上 16:9 页' },
};
const ALIAS = { '微信': 'wechat', '公众号': 'wechat', '小红书': 'xhs', red: 'xhs',
  '朋友圈': 'pengyouquan', moments: 'pengyouquan', '微博': 'weibo', '知乎': 'zhihu',
  'b站': 'bilibili', bili: 'bilibili', '专栏': 'bilibili', 'b 站': 'bilibili' };
const pkey = (process.argv[4] || 'wechat').toLowerCase();
const PLATFORM = PRESETS[pkey] ? pkey : (ALIAS[pkey] || 'wechat');
const P_ = PRESETS[PLATFORM];

// Chrome 路径：默认 macOS 位置，可用 CHROME 环境变量覆盖（换机器时）。
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE = process.argv[2];
if (!PAGE) {
  console.error('用法: node shot.mjs <page.html> [out-dir] [platform]');
  process.exit(2);
}
const URL    = 'file://' + resolve(PAGE);
const OUT    = process.argv[3] || 'wechat';   // 相对当前工作目录
const PORT   = 9333;
const DPR    = P_.dpr;
const WIDTH  = P_.w;
const udd    = '/tmp/san-shot-profile';
console.log(`平台 ${PLATFORM} —— ${P_.desc}（宽 ${WIDTH} × ${DPR}×, ${P_.emit}）`);

mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--remote-allow-origins=*',
  `--user-data-dir=${udd}`, `--force-device-scale-factor=${DPR}`, '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', `--window-size=${WIDTH},2200`, URL
], { stdio: 'ignore' });

async function getWS() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const pg = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pg) return pg.webSocketDebuggerUrl;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('找不到 DevTools 目标');
}

const ws = new WebSocket(await getWS());
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = e => rej(new Error('WS 连接失败: ' + (e?.message || e)));
  setTimeout(() => rej(new Error('WS 连接超时（8s）')), 8000);
});
console.log('已连上 Chrome，开始截图…');

let _id = 0; const pending = new Map();
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
};
const cmd = (method, params = {}, timeoutMs = 30000) => new Promise((res, rej) => {
  const id = ++_id; pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(method + ' 超时')); } }, timeoutMs);
});

await cmd('Page.enable');
await cmd('Runtime.enable');
// 权威设定 CSS 视口宽度 + 倍率（--window-size 在无头新模式下不可靠）
await cmd('Emulation.setDeviceMetricsOverride',
  { width: WIDTH, height: 1400, deviceScaleFactor: DPR, mobile: true });
for (let i = 0; i < 50; i++) {
  const r = await cmd('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
  if (r.result.value === 'complete') break;
  await sleep(200);
}
await sleep(900); // 等字体 + SVG 手绘绘制完成

async function shot(file, clip) {
  const params = { format: 'png', captureBeyondViewport: true };
  if (clip) params.clip = { x: clip.x, y: clip.y, width: clip.width, height: clip.height, scale: clip.scale ?? 1 };
  const r = await cmd('Page.captureScreenshot', params);
  writeFileSync(`${OUT}/${file}`, Buffer.from(r.data, 'base64'));
  console.log('  saved', file, clip ? `${Math.round(clip.width)}x${Math.round(clip.height)} css` : 'full');
}

// 逐屏切片（cards / both）
if (P_.emit !== 'long') {
  const ev = await cmd('Runtime.evaluate', { returnByValue: true, expression: `
    JSON.stringify([...document.querySelectorAll('.shot')].map(e => {
      const r = e.getBoundingClientRect();
      return { name: e.dataset.name || null, x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
    }))` });
  const rects = JSON.parse(ev.result.value);
  const names = ['01-cover','02-principle','03-timeline-head','04-era1','05-era2',
                 '06-era3','07-era4','08-era5','09-ladder','10-anatomy','11-trace','12-closing'];
  const P = 14;
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    await shot(`${r.name || names[i] || ('sec-' + i)}.png`, {
      x: Math.max(0, r.x - P), y: Math.max(0, r.y - P), width: r.w + 2 * P, height: r.h + 2 * P
    });
  }
}

// 整页长图（long / both；超高图等比降到设备像素 ≤ 15000，避免超过 GPU 限高而失败）
if (P_.emit !== 'cards') {
  try {
    const lm = await cmd('Page.getLayoutMetrics');
    const cs = lm.cssContentSize || lm.contentSize;
    const scale = Math.min(1, 15000 / (cs.height * DPR));
    await shot('00-full.png', { x: 0, y: 0, width: cs.width, height: cs.height, scale });
  } catch (e) { console.log('  整页长图跳过:', e.message); }
}

ws.close();
chrome.kill();
try { rmSync(udd, { recursive: true, force: true }); } catch (e) {}
console.log('完成 ->', OUT);
process.exit(0);
