import fs from "fs";
import path from "path";

const OUT_DIR = path.resolve("./works");
const DATA_FILE = path.resolve("./data/works.json");

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return "";
  return process.argv[idx + 1] || "";
}

const date = arg("date") || new Date().toISOString().slice(0, 10);
const title = arg("title") || "今日小作品";
const content = arg("content") || "今天也有一個小小的作品。";
const templateOverride = arg("template");

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return h >>> 0;
}

function pick(list, seed) {
  return list[seed % list.length];
}

function baseHead(extra = "") {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0f1a; --text:#e5e7eb; --muted:#9ca3af; --accent:#60a5fa; --accent2:#f472b6; --border:#1f2937; }
    *{box-sizing:border-box;}
    body{margin:0;min-height:100vh;font-family:"SF Pro Text",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text);
      background:radial-gradient(1200px 700px at 10% -10%, #0ea5e9 0%, rgba(14,165,233,0) 60%),
                 radial-gradient(1000px 700px at 90% -20%, #a78bfa 0%, rgba(167,139,250,0) 55%),
                 radial-gradient(900px 600px at 50% 120%, #f472b6 0%, rgba(244,114,182,0) 55%),
                 var(--bg);
      }
    a{color:var(--accent);text-decoration:none;} a:hover{text-decoration:underline;}
    header{max-width:900px;margin:24px auto 12px;padding:0 20px;}
    h1{margin:0;font-size:1.7rem;letter-spacing:.4px;background:linear-gradient(135deg,#fff 0%,#a78bfa 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
    .sub{color:var(--muted);font-size:.95rem;margin-top:6px;}
    .stage{max-width:900px;margin:14px auto 40px;padding:0 20px;}
    .card{border:1px solid var(--border);border-radius:18px;padding:18px;background:rgba(17,24,39,.9);box-shadow:0 0 24px rgba(96,165,250,.2);} 
    .meta{color:var(--muted);font-size:.85rem;margin-bottom:10px;}
    .content{line-height:1.8;white-space:pre-wrap;}
    ${extra}
  </style>
</head>`;
}

const templates = [
  {
    id: "constellation",
    name: "星座草稿",
    html: () => `${baseHead()}
<body>
  <header>
    <h1>${title}</h1>
    <div class="sub">${date}｜<a href="./index.html">回每日小作品</a> ｜ <a href="../index.html">回 OD</a></div>
  </header>
  <section class="stage">
    <div class="card">
      <div class="meta">今天的小作品</div>
      <div class="content">${content}</div>
      <div id="sky" style="position:relative; margin-top:16px; height:360px; border-radius:16px; border:1px solid var(--border); background:rgba(10,15,25,.7); overflow:hidden;"></div>
      <div style="margin-top:10px; color:var(--muted); font-size:.85rem;">點擊畫面添一顆星，拖曳連成你的星座。</div>
    </div>
  </section>
  <script>
    const sky = document.getElementById('sky');
    let dragging = null;
    sky.addEventListener('click', (e) => {
      if (dragging) return;
      const star = document.createElement('div');
      const size = 6 + Math.random()*6;
      star.style.width = size + 'px';
      star.style.height = size + 'px';
      star.style.borderRadius = '50%';
      star.style.background = 'radial-gradient(circle, #fff, rgba(255,255,255,.3))';
      star.style.position = 'absolute';
      star.style.left = (e.offsetX - size/2) + 'px';
      star.style.top = (e.offsetY - size/2) + 'px';
      star.style.boxShadow = '0 0 12px rgba(255,255,255,.6)';
      star.draggable = false;
      star.addEventListener('pointerdown', () => { dragging = star; });
      sky.appendChild(star);
    });
    sky.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      dragging.style.left = (e.offsetX - dragging.offsetWidth/2) + 'px';
      dragging.style.top = (e.offsetY - dragging.offsetHeight/2) + 'px';
    });
    window.addEventListener('pointerup', () => { dragging = null; });
  </script>
</body></html>`
  },
  {
    id: "rain-window",
    name: "雨窗",
    html: () => `${baseHead()}
<body>
  <header>
    <h1>${title}</h1>
    <div class="sub">${date}｜<a href="./index.html">回每日小作品</a> ｜ <a href="../index.html">回 OD</a></div>
  </header>
  <section class="stage">
    <div class="card">
      <div class="meta">今天的小作品</div>
      <div class="content">${content}</div>
      <canvas id="rain" style="width:100%; height:360px; margin-top:16px; border-radius:16px; border:1px solid var(--border);"></canvas>
      <div style="margin-top:10px; color:var(--muted); font-size:.85rem;">點擊製造雨滴，按住畫面像在呵氣。</div>
    </div>
  </section>
  <script>
    const canvas = document.getElementById('rain');
    const ctx = canvas.getContext('2d');
    function resize(){
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
    }
    resize();
    window.addEventListener('resize', resize);
    const drops = [];
    let fog = 0;
    canvas.addEventListener('click', e => {
      drops.push({x:e.offsetX, y:e.offsetY, r:2+Math.random()*4, vy:1+Math.random()*2});
    });
    canvas.addEventListener('pointerdown', () => { fog = 0.7; });
    canvas.addEventListener('pointerup', () => { fog = 0; });
    function tick(){
      const {width, height} = canvas.getBoundingClientRect();
      ctx.clearRect(0,0,width,height);
      ctx.fillStyle = 'rgba(15,20,35,0.6)';
      ctx.fillRect(0,0,width,height);
      drops.forEach(d => {
        d.y += d.vy; d.r *= 0.995;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(d.x,d.y,d.r,0,Math.PI*2); ctx.stroke();
      });
      while(drops.length && (drops[0].y>height || drops[0].r<0.5)) drops.shift();
      if (fog>0){
        ctx.fillStyle = 'rgba(255,255,255,' + fog + ')';
        ctx.fillRect(0,0,width,height);
        fog *= 0.98;
      }
      requestAnimationFrame(tick);
    }
    tick();
  </script>
</body></html>`
  },
  {
    id: "bloom",
    name: "生成花園",
    html: () => `${baseHead()}
<body>
  <header>
    <h1>${title}</h1>
    <div class="sub">${date}｜<a href="./index.html">回每日小作品</a> ｜ <a href="../index.html">回 OD</a></div>
  </header>
  <section class="stage">
    <div class="card">
      <div class="meta">今天的小作品</div>
      <div class="content">${content}</div>
      <svg id="garden" viewBox="0 0 600 360" style="width:100%; height:360px; margin-top:16px; border-radius:16px; border:1px solid var(--border); background:rgba(8,12,20,.7);"></svg>
      <div style="margin-top:10px; color:var(--muted); font-size:.85rem;">點一下種一朵花。</div>
    </div>
  </section>
  <script>
    const svg = document.getElementById('garden');
    svg.addEventListener('click', (e) => {
      const rect = svg.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width * 600;
      const y = (e.clientY - rect.top) / rect.height * 360;
      const petal = 6 + Math.floor(Math.random()*6);
      const group = document.createElementNS('http://www.w3.org/2000/svg','g');
      group.setAttribute('transform', 'translate(' + x + ' ' + y + ')');
      const color = 'hsl(' + (Math.random()*360) + ',70%,70%)';
      for (let i=0;i<petal;i++) {
        const p = document.createElementNS('http://www.w3.org/2000/svg','ellipse');
        p.setAttribute('rx', 8 + Math.random()*10);
        p.setAttribute('ry', 18 + Math.random()*12);
        p.setAttribute('fill', color);
        p.setAttribute('transform', 'rotate(' + ((360/petal)*i) + ') translate(0 -18)');
        group.appendChild(p);
      }
      const core = document.createElementNS('http://www.w3.org/2000/svg','circle');
      core.setAttribute('r', 8);
      core.setAttribute('fill', '#fff');
      group.appendChild(core);
      svg.appendChild(group);
    });
  </script>
</body></html>`
  },
  {
    id: "radio",
    name: "深夜電台",
    html: () => `${baseHead()}
<body>
  <header>
    <h1>${title}</h1>
    <div class="sub">${date}｜<a href="./index.html">回每日小作品</a> ｜ <a href="../index.html">回 OD</a></div>
  </header>
  <section class="stage">
    <div class="card">
      <div class="meta">今天的小作品</div>
      <div class="content">${content}</div>
      <div style="margin-top:16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <button id="power" style="padding:8px 14px; border-radius:999px; border:1px solid var(--border); background:rgba(96,165,250,.15); color:#c7d2fe;">開關</button>
        <input id="dial" type="range" min="220" max="880" value="440" />
        <span id="freq" style="color:var(--muted); font-size:.9rem;">440 Hz</span>
      </div>
      <div style="margin-top:10px; color:var(--muted); font-size:.85rem;">（點開關才會發聲，音量很低）</div>
    </div>
  </section>
  <script>
    let ctx, osc, gain;
    const power = document.getElementById('power');
    const dial = document.getElementById('dial');
    const freq = document.getElementById('freq');
    dial.addEventListener('input', () => {
      freq.textContent = dial.value + ' Hz';
      if (osc) osc.frequency.value = dial.value;
    });
    power.addEventListener('click', async () => {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        osc = ctx.createOscillator();
        gain = ctx.createGain();
        gain.gain.value = 0.02;
        osc.type = 'sine';
        osc.frequency.value = dial.value;
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        power.textContent = '關閉';
      } else {
        osc.stop(); ctx.close();
        ctx = null; osc = null; gain = null;
        power.textContent = '開關';
      }
    });
  </script>
</body></html>`
  }
];

const seed = hash(date);
const picked = templateOverride
  ? templates.find(t => t.id === templateOverride) || templates[0]
  : pick(templates, seed);

const html = picked.html();
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, `${date}.html`), html);

let works = [];
if (fs.existsSync(DATA_FILE)) {
  try { works = JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { works = []; }
}
works = works.filter(w => w.date !== date);
works.unshift({
  date,
  title,
  slug: date,
  excerpt: (content.split("\n")[0] || "").slice(0, 60),
  style: picked.name,
});
fs.writeFileSync(DATA_FILE, JSON.stringify(works, null, 2));

console.log(`Generated ${date} using template: ${picked.id}`);
