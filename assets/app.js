const $ = (s) => document.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u = "") => (/^(https?:|mailto:)/i.test(u) ? esc(u) : "#");

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (ym) => { if (!ym) return "Present"; const [y, m] = ym.split("-"); return `${MONTHS[+m - 1] || ""} ${y}`.trim(); };
function duration(a, b) {
  const [y1, m1] = a.split("-").map(Number);
  const now = new Date();
  const [y2, m2] = b ? b.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const t = (y2 - y1) * 12 + (m2 - m1) + 1, y = Math.floor(t / 12), m = t % 12;
  return [y && `${y} yr${y > 1 ? "s" : ""}`, m && `${m} mo`].filter(Boolean).join(" ");
}

function render(d) {
  const p = d.profile, l = p.links || {};
  const email = l.email ? `<a class="btn" href="mailto:${esc(l.email)}">email</a>` : "";
  const html = `
  <div class="hero">
    <p class="prompt"><span class="u">${esc(p.handle)}@${esc(p.timezone.split("/").pop().toLowerCase())}</span>:<span class="p">~</span>$ whoami</p>
    <h1>${esc(p.name)}</h1>
    <p class="role">${esc(p.role)}</p>
    <p class="lead">${esc(p.tagline)}</p>
    <div class="meta"><span><i class="dot"></i>${esc(p.location)}</span><span id="clock"></span></div>
    <div class="btns">
      <a class="btn primary" href="#ventures">what I'm building</a>
      ${l.linkedin ? `<a class="btn" href="${safeUrl(l.linkedin)}" rel="noopener">linkedin</a>` : ""}
      ${l.github ? `<a class="btn" href="${safeUrl(l.github)}" rel="noopener">github</a>` : ""}${email}
    </div>
  </div>
  <section id="about" class="about"><h2>about</h2>${(p.about || []).map((t) => `<p>${esc(t)}</p>`).join("")}
    <div class="grid" style="margin-top:22px">${(d.focus || []).map((f) => `<div class="card focus"><h3>${esc(f.title)}</h3><p>${esc(f.body)}</p></div>`).join("")}</div>
  </section>
  <section id="ventures"><h2>ventures</h2>${(d.ventures || []).map((v) => `
    <a class="card venture" href="${safeUrl(v.url)}" rel="noopener">
      <span class="k">${esc(v.kind)} · ${esc(v.location)}</span><h3>${esc(v.name)}</h3>
      <p>${esc(v.summary)}</p><span class="u">${esc((v.url || "").replace(/^https?:\/\//, ""))} ↗</span></a>`).join("")}</section>
  <section id="experience"><h2>experience</h2><ol class="tl">${(d.experience || []).map((e) => `
    <li class="${e.end ? "" : "now"}"><span class="when">${fmt(e.start)} – ${fmt(e.end)} · ${duration(e.start, e.end)}</span>
      <h3>${esc(e.role)}</h3><div class="co">${esc(e.company)}${e.location ? ` <span class="when">· ${esc(e.location)}</span>` : ""}</div>
      <p>${esc(e.summary)}</p><div class="tags">${(e.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div></li>`).join("")}</ol></section>
  ${(d.posts || []).length ? `<section id="writing"><h2>writing</h2>${d.posts.map((x) => `
    <a class="post" href="${safeUrl(x.url)}"><span class="when">${esc(x.date)}</span>${esc(x.title)}</a>`).join("")}</section>` : ""}
  <section id="contact"><h2>contact</h2><p>Open to conversations about reliability, platform work, and product engineering. For consultancy, reach out via <a href="https://termitetechlab.com" rel="noopener">Termite Tech Lab</a> or find me on <a href="${safeUrl(l.linkedin)}" rel="noopener">LinkedIn</a>.</p></section>`;
  $("#top").innerHTML = html;
  $("#foot-l").textContent = `© ${new Date().getFullYear()} ${p.name}`;
  const clock = $("#clock");
  const tick = () => { clock.textContent = new Date().toLocaleTimeString("en-GB", { timeZone: p.timezone, hour: "2-digit", minute: "2-digit" }) + " " + p.timezone.split("/").pop(); };
  tick(); setInterval(tick, 30000);
}

const root = document.documentElement;
try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
$("#theme").addEventListener("click", () => {
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme:dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  try { localStorage.setItem("theme", root.dataset.theme); } catch {}
});

fetch("content/site.json", { cache: "no-cache" }).then((r) => r.json()).then(render)
  .catch(() => { $("#top").innerHTML = "<p>Failed to load content.</p>"; });
