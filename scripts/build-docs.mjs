// Renders docs/*.md into a small static docs site at public/docs/ (served at /docs/ on Netlify
// and bundled into the app build). Runs before `vite build` via the "prebuild" script.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'https://github.com/join2AJ/drive/blob/HEAD/';

const PAGES = [
  { src: 'FEATURES.md', out: 'index.html', nav: 'Product guide', desc: 'Every feature of Drive, who it is for, and plans & pricing.' },
  { src: 'BUILD-AND-SCALE.md', out: 'build-and-scale.html', nav: 'Build & scale', desc: 'Hardware, servers, app integration, rollout from 1 to 10,000+ vehicles, and cost-benefit analysis.' },
  { src: 'hardware.md', out: 'hardware.html', nav: 'Hardware reference', desc: 'Reference tracker design: parts, wiring, firmware and data protocol.' },
];
const OUT_OF = Object.fromEntries(PAGES.map((p) => [p.src, p.out]));

// GitHub-style heading ids, so in-page links written for GitHub work here too.
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s/g, '-');
const plain = (s) => s.replace(/\*\*|__|`|\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(md) {
  const toc = [];
  const marked = new Marked({ gfm: true });
  marked.use({
    walkTokens(t) {
      if (t.type !== 'link') return;
      const [path, hash] = t.href.split('#');
      if (/^[a-z]+:/i.test(path) || !path) return;
      const file = path.replace(/^\.\//, '');
      if (OUT_OF[file]) t.href = OUT_OF[file] + (hash ? `#${hash}` : '');
      else t.href = REPO + file.replace(/^(\.\.\/)+/, '') + (hash ? `#${hash}` : '');
    },
    renderer: {
      heading({ tokens, depth, text }) {
        const id = slug(plain(text));
        if (depth === 2) toc.push({ id, text: plain(text) });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang }) {
        if (lang === 'mermaid') return `<pre class="mermaid">${esc(text)}</pre>\n`;
        return false;
      },
    },
  });
  const html = marked.parse(md)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>');
  return { html, toc };
}

const CSS = `
:root{--bg:#f7f6f3;--surface:#fff;--ink:#1c1b19;--ink2:#4a4944;--ink3:#77756e;--line:#e4e2dc;--accent:#2f6fde;--accent-soft:#e7effd;--code:#f0efeb;--good:#1a7f37}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#0e0e0d;--surface:#181817;--ink:#f1efe9;--ink2:#c9c6be;--ink3:#8f8c84;--line:#2b2a27;--accent:#6ea3ff;--accent-soft:#1a2740;--code:#22211f;--good:#4cc36b}}
:root[data-theme=dark]{--bg:#0e0e0d;--surface:#181817;--ink:#f1efe9;--ink2:#c9c6be;--ink3:#8f8c84;--line:#2b2a27;--accent:#6ea3ff;--accent-soft:#1a2740;--code:#22211f;--good:#4cc36b}
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:72px}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
header{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:16px;padding:12px 24px;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:18px;color:var(--ink);letter-spacing:-.01em}.brand img{width:28px;height:28px;border-radius:8px}
header nav{display:flex;gap:4px;margin-left:auto;overflow-x:auto;scrollbar-width:none}
header nav a{padding:6px 12px;border-radius:999px;color:var(--ink2);font-weight:600;font-size:14px;white-space:nowrap}
header nav a.on{background:var(--accent-soft);color:var(--accent)}header nav a:hover{text-decoration:none;color:var(--ink)}
.open-app{padding:7px 14px;border-radius:999px;background:var(--accent);color:#fff!important;font-weight:700;font-size:14px;white-space:nowrap}
.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:48px;max-width:1180px;margin:0 auto;padding:32px 24px 80px}
aside{position:sticky;top:84px;align-self:start;max-height:calc(100vh - 100px);overflow:auto;font-size:14px}
aside .t{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin:0 0 8px 10px}
aside a{display:block;padding:5px 10px;border-radius:8px;color:var(--ink2);line-height:1.35}aside a:hover{background:var(--surface);text-decoration:none}aside a.on{color:var(--accent);background:var(--accent-soft)}
main{min-width:0}
.hero{padding:28px 28px 24px;border-radius:20px;background:linear-gradient(135deg,var(--accent-soft),var(--surface));border:1px solid var(--line);margin-bottom:24px}
.hero .kicker{font-size:13px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.08em}
h1{font-size:clamp(28px,4vw,40px);line-height:1.15;letter-spacing:-.025em;margin:6px 0 10px}
h2{font-size:26px;letter-spacing:-.02em;margin:48px 0 12px;padding-top:8px;border-top:1px solid var(--line)}
h3{font-size:19px;margin:30px 0 8px}h4{margin:22px 0 6px}
h1 .anchor,h2 .anchor,h3 .anchor,h4 .anchor{float:left;margin-left:-22px;width:22px;opacity:0;color:var(--ink3);font-weight:400}
h2:hover .anchor,h3:hover .anchor{opacity:1}
p,li{color:var(--ink2)}strong{color:var(--ink)}
blockquote{margin:18px 0;padding:14px 18px;border-left:4px solid var(--accent);background:var(--surface);border-radius:0 12px 12px 0}blockquote p{margin:0}
code{font:0.88em/1.4 "JetBrains Mono",ui-monospace,Menlo,monospace;background:var(--code);padding:2px 6px;border-radius:6px}
pre{background:var(--code);padding:16px;border-radius:12px;overflow:auto}pre code{background:none;padding:0}
pre.mermaid{background:var(--surface);border:1px solid var(--line);text-align:center}
@media (max-width:700px){pre.mermaid svg{min-width:640px}}
.table-wrap{overflow-x:auto;margin:16px 0;border:1px solid var(--line);border-radius:14px;background:var(--surface)}
table{border-collapse:collapse;width:100%;font-size:14.5px}
th,td{padding:10px 14px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}
th{font-size:13px;color:var(--ink3);font-weight:700;background:color-mix(in srgb,var(--code) 60%,transparent);white-space:nowrap}
tr:last-child td{border-bottom:0}td{color:var(--ink2)}
hr{border:0;border-top:1px solid var(--line);margin:40px 0}hr+h2{border-top:0;margin-top:0}
.theme{margin-left:4px;border:1px solid var(--line);background:var(--surface);color:var(--ink2);border-radius:999px;width:34px;height:34px;cursor:pointer;flex:none;display:grid;place-items:center;padding:0}
footer{max-width:1180px;margin:0 auto;padding:24px;color:var(--ink3);font-size:13px;border-top:1px solid var(--line)}
@media (max-width:900px){.layout{grid-template-columns:1fr;gap:0;padding:20px 16px 60px}aside{display:none}header{padding:10px 16px;gap:10px}.brand span{display:none}.hero{padding:22px 18px}h2{font-size:22px}}
@media (max-width:560px){.open-app{display:none}}
`;

function page(p, { html, toc }) {
  // Pull the first H1 out into the hero.
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>\n?/);
  const title = m ? m[1].replace(/<a class="anchor"[^>]*>#<\/a>/, '') : p.nav;
  const body = m ? html.replace(m[0], '') : html;
  const plainTitle = title.replace(/<[^>]+>/g, '');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(plainTitle)}</title>
<meta name="description" content="${esc(p.desc)}">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<header>
  <a class="brand" href="index.html"><img src="../icon.svg" alt=""><span>Drive docs</span></a>
  <nav>${PAGES.map((x) => `<a href="${x.out}"${x === p ? ' class="on"' : ''}>${x.nav}</a>`).join('')}</nav>
  <a class="open-app" href="../">Open the app</a>
  <button class="theme" id="theme" aria-label="Toggle dark mode"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg></button>
</header>
<div class="layout">
  <aside><div class="t">On this page</div>${toc.map((t) => `<a href="#${t.id}">${esc(t.text)}</a>`).join('')}</aside>
  <main>
    <div class="hero"><div class="kicker">${esc(p.nav)}</div><h1>${title}</h1><p style="margin:0">${esc(p.desc)}</p></div>
    ${body}
  </main>
</div>
<footer>Drive · generated from <a href="${REPO}docs/${p.src}">docs/${p.src}</a></footer>
<script>
(function(){
  var r=document.documentElement,b=document.getElementById('theme');
  try{var s=localStorage.getItem('docs-theme');if(s)r.dataset.theme=s}catch(e){}
  b.onclick=function(){var d=r.dataset.theme?r.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;r.dataset.theme=d?'light':'dark';try{localStorage.setItem('docs-theme',r.dataset.theme)}catch(e){}location.reload()};
  var links=[].slice.call(document.querySelectorAll('aside a')),hs=links.map(function(a){return document.getElementById(a.getAttribute('href').slice(1))});
  function spy(){var i=0;hs.forEach(function(h,k){if(h&&h.getBoundingClientRect().top<120)i=k});links.forEach(function(a,k){a.classList.toggle('on',k===i)})}
  addEventListener('scroll',spy,{passive:true});spy();
})();
</script>
<script type="module">
// Diagrams render from the CDN; offline the diagram source stays readable as text.
if (document.querySelector('pre.mermaid')) {
  try {
    const { default: mermaid } = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
    const r = document.documentElement;
    const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', fontFamily: 'Inter, system-ui, sans-serif' });
    await mermaid.run({ querySelector: 'pre.mermaid' });
  } catch { /* keep the text version */ }
}
// Diagrams and web fonts change the layout; land on the linked heading again once they're in.
await document.fonts.ready;
if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
</script>
</body>
</html>
`;
}

const outDir = join(root, 'public', 'docs');
await mkdir(outDir, { recursive: true });
for (const p of PAGES) {
  const md = await readFile(join(root, 'docs', p.src), 'utf8');
  await writeFile(join(outDir, p.out), page(p, render(md)));
}
console.log(`docs: wrote ${PAGES.length} pages to public/docs/`);
