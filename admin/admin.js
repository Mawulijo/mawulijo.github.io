const $app = document.getElementById("app");
const SESSION_MS = 30 * 60 * 1000;
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: (k) => { try { sessionStorage.removeItem(k); } catch {} } };
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ---------- auth (client-side gate; see README for the threat model) ---------- */
const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function derive(value, saltB64, iter) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64(saltB64), iterations: iter }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
const same = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
let failures = 0;
async function verify(u, p) {
  const cfg = await fetch("auth.json", { cache: "no-cache" }).then((r) => r.json());
  if (cfg.disabled) throw new Error("CMS login is not configured for this build.");
  const [hu, hp] = await Promise.all([derive(u, cfg.user.salt, cfg.iter), derive(p, cfg.pass.salt, cfg.iter)]);
  return same(hu, cfg.user.hash) & same(hp, cfg.pass.hash);
}
const authed = () => +ss.get("cms_exp") > Date.now();

function loginView() {
  $app.innerHTML = `<form class="login" id="f" autocomplete="on">
    <p class="prompt"><span class="u">cms</span>:<span class="p">~</span>$ login</p>
    <h1>Sign in</h1>
    <label for="u">username</label><input id="u" name="username" autocomplete="username" required autofocus>
    <label for="p">password</label><input id="p" name="password" type="password" autocomplete="current-password" required>
    <div class="err" id="e" role="alert"></div>
    <button class="btn primary" style="margin-top:8px;cursor:pointer">authenticate</button>
    <p class="hint"><a href="../">← back to site</a></p></form>`;
  document.getElementById("f").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const e = document.getElementById("e"), btn = ev.target.querySelector("button");
    btn.disabled = true; e.textContent = "";
    if (failures) await new Promise((r) => setTimeout(r, Math.min(failures * 1500, 10000)));
    try {
      if (await verify(document.getElementById("u").value, document.getElementById("p").value)) {
        ss.set("cms_exp", String(Date.now() + SESSION_MS)); failures = 0; boot();
      } else { failures++; e.textContent = "invalid credentials"; }
    } catch (x) { e.textContent = x.message; }
    btn.disabled = false;
  });
}

/* ---------- schema ---------- */
const T = { text: "text", area: "area", csv: "csv", lines: "lines" };
const SCHEMA = {
  profile: { label: "Profile", type: "object", fields: [
    ["name", "Name"], ["handle", "Handle"], ["role", "Role"], ["tagline", "Tagline", T.area], ["location", "Location"], ["timezone", "Timezone (IANA)"],
    ["about", "About (one paragraph per line)", T.lines], ["links.linkedin", "LinkedIn URL"], ["links.github", "GitHub URL"], ["links.email", "Public email (optional)"]] },
  focus: { label: "Focus", type: "array", title: "title", blank: { title: "", body: "" }, fields: [["title", "Title"], ["body", "Body", T.area]] },
  experience: { label: "Experience", type: "array", title: "role", blank: { company: "", role: "", start: "", end: "", location: "", summary: "", tags: [] },
    fields: [["role", "Role"], ["company", "Company"], ["start", "Start (YYYY-MM)"], ["end", "End (YYYY-MM, blank = present)"], ["location", "Location"], ["summary", "Summary", T.area], ["tags", "Tags (comma separated)", T.csv]] },
  ventures: { label: "Ventures", type: "array", title: "name", blank: { name: "", url: "", kind: "", location: "", summary: "" },
    fields: [["name", "Name"], ["url", "URL"], ["kind", "Kind"], ["location", "Location"], ["summary", "Summary", T.area]] },
  posts: { label: "Writing", type: "array", title: "title", blank: { title: "", date: "", url: "" }, fields: [["title", "Title"], ["date", "Date"], ["url", "URL"]] },
};
const getP = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const setP = (o, p, v) => { const ks = p.split("."); const last = ks.pop(); const t = ks.reduce((a, k) => (a[k] ??= {}), o); t[last] = v; };
const toView = (v, t) => (t === T.csv ? (v || []).join(", ") : t === T.lines ? (v || []).join("\n") : v ?? "");
const fromView = (v, t) => (t === T.csv ? v.split(",").map((s) => s.trim()).filter(Boolean) : t === T.lines ? v.split("\n").map((s) => s.trim()).filter(Boolean) : v);

/* ---------- GitHub ---------- */
const gh = {
  repo: () => ls.get("cms_repo") || guessRepo(),
  branch: () => ls.get("cms_branch") || "main",
  token: () => ss.get("cms_token") || "",
  async api(path, opt = {}) {
    const r = await fetch(`https://api.github.com/repos/${this.repo()}/contents/${path}`, { ...opt, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${this.token()}`, ...(opt.headers || {}) } });
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || r.statusText}`);
    return r.json();
  },
};
function guessRepo() {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  if (!m) return "";
  const first = location.pathname.split("/")[1];
  return `${m[1]}/${first && first !== "admin" ? first : m[1] + ".github.io"}`;
}
const utf8b64 = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

/* ---------- editor ---------- */
let data, tab = "profile", dirty = false;

function field(path, label, type, val, attrs = "") {
  const v = esc(toView(val, type));
  return `<label>${esc(label)}</label>${type === T.area || type === T.lines ? `<textarea data-p="${path}" data-t="${type || ""}" ${attrs}>${v}</textarea>` : `<input data-p="${path}" data-t="${type || ""}" value="${v}" ${attrs}>`}`;
}
function sectionView() {
  const s = SCHEMA[tab], d = data[tab];
  if (s.type === "object") return s.fields.map(([p, l, t]) => field(`${tab}.${p}`, l, t, getP(d, p))).join("");
  const items = d.map((it, i) => `<div class="card item"><div class="hd"><b>${esc(it[s.title] || "(untitled)")}</b><span class="sp"></span>
    <button data-a="up" data-i="${i}" ${i ? "" : "disabled"}>↑</button><button data-a="down" data-i="${i}" ${i < d.length - 1 ? "" : "disabled"}>↓</button><button class="danger" data-a="del" data-i="${i}">remove</button></div>
    <div class="row2">${s.fields.map(([p, l, t]) => `<div style="${t === T.area ? "grid-column:1/-1" : ""}">${field(`${tab}.${i}.${p}`, l, t, getP(it, p))}</div>`).join("")}</div></div>`).join("");
  return items + `<button class="btn" data-a="add">+ add ${esc(s.label.toLowerCase())} entry</button>`;
}
function editorView() {
  const repo = esc(gh.repo()), exp = Math.round((+ss.get("cms_exp") - Date.now()) / 60000);
  $app.innerHTML = `<div class="wrap">
    <div class="bar"><span class="brand"><b>~/</b>cms</span><span class="hint" id="st">${dirty ? "unsaved changes" : "up to date"}</span><span class="sp"></span>
      <a class="btn" href="../" target="_blank" rel="noopener">view site</a><button class="btn" id="dl">export json</button><button class="btn primary" id="save">commit to ${repo || "github"}</button><button class="btn" id="out">sign out</button></div>
    <div class="tabs">${Object.entries(SCHEMA).map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? "on" : ""}">${v.label}</button>`).join("")}<button data-tab="_gh" class="${tab === "_gh" ? "on" : ""}">GitHub</button></div>
    <div id="body">${tab === "_gh" ? ghView() : sectionView()}</div>
    <p class="hint" style="margin-top:32px">Session expires in ~${exp} min. <span id="msg"></span></p></div>`;
}
function ghView() {
  return `<div class="panel"><p class="hint">Saving commits <code>content/site.json</code> to your repo through the GitHub API, which triggers the Pages deploy. Use a fine-grained token limited to this repository with <b>Contents: read &amp; write</b>. The token is held in this tab's session only.</p>
    ${field("_repo", "Repository (owner/name)", "", gh.repo())}${field("_branch", "Branch", "", gh.branch())}
    <label>Token</label><input data-p="_token" type="password" autocomplete="off" value="${esc(gh.token())}" placeholder="github_pat_..."></div>`;
}
function msg(t, ok) { const m = document.getElementById("msg"); if (m) { m.textContent = t; m.className = ok ? "ok" : "err"; } }

async function save() {
  if (!gh.repo() || !gh.token()) { tab = "_gh"; editorView(); return msg("Set repository and token first.", false); }
  const btn = document.getElementById("save"); btn.disabled = true; msg("committing…", true);
  try {
    const path = "content/site.json", br = gh.branch();
    const cur = await gh.api(`${path}?ref=${encodeURIComponent(br)}`);
    await gh.api(path, { method: "PUT", body: JSON.stringify({ message: "cms: update site content", content: utf8b64(JSON.stringify(data, null, 2) + "\n"), sha: cur.sha, branch: br }) });
    dirty = false; editorView(); msg("committed. Pages redeploys in about a minute.", true);
  } catch (e) { btn.disabled = false; msg(e.message, false); }
}

document.addEventListener("input", (e) => {
  const p = e.target.dataset?.p; if (!p) return;
  if (p === "_repo") return ls.set("cms_repo", e.target.value.trim());
  if (p === "_branch") return ls.set("cms_branch", e.target.value.trim());
  if (p === "_token") return ss.set("cms_token", e.target.value.trim());
  const [sec, ...rest] = p.split(".");
  const target = SCHEMA[sec].type === "array" ? data[sec] : data[sec];
  setP(target, rest.join("."), fromView(e.target.value, e.target.dataset.t));
  dirty = true; document.getElementById("st").textContent = "unsaved changes";
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || !authed()) return;
  if (b.dataset.tab) { tab = b.dataset.tab; return editorView(); }
  if (b.id === "save") return save();
  if (b.id === "out") { ss.del("cms_exp"); ss.del("cms_token"); return loginView(); }
  if (b.id === "dl") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = "site.json"; a.click(); return; }
  const a = b.dataset.a, i = +b.dataset.i, arr = data[tab];
  if (a === "add") arr.push(structuredClone(SCHEMA[tab].blank));
  else if (a === "del" && confirm("Remove this entry?")) arr.splice(i, 1);
  else if (a === "up") [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
  else if (a === "down") [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
  else return;
  dirty = true; editorView();
});
window.addEventListener("beforeunload", (e) => { if (dirty) e.preventDefault(); });
setInterval(() => { if (data && !authed()) { dirty = false; ss.del("cms_token"); loginView(); } }, 15000);

async function boot() {
  if (!authed()) return loginView();
  data = await fetch("../content/site.json", { cache: "no-cache" }).then((r) => r.json());
  editorView();
}
boot();
