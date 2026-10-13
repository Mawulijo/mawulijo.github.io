// Assembles dist/ and derives admin/auth.json from CMS_USERNAME / CMS_PASSWORD.
// Only salted PBKDF2 hashes are emitted; the plaintext credentials never ship.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITER = 310_000;
const { CMS_USERNAME: user, CMS_PASSWORD: pass, CI } = process.env;

if (!user || !pass) {
  const msg = "CMS_USERNAME / CMS_PASSWORD not set; the CMS login will be disabled.";
  if (CI) { console.error("error: " + msg); process.exit(1); }
  console.warn("warn: " + msg);
}
if (pass && pass.length < 12) console.warn("warn: CMS_PASSWORD is short; use a long passphrase (hash is publicly downloadable).");

const derive = (v) => {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: pbkdf2Sync(v, salt, ITER, 32, "sha256").toString("base64") };
};

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const p of ["index.html", "assets", "admin", "content"]) await cp(p, `dist/${p}`, { recursive: true });
await writeFile("dist/.nojekyll", "");
await writeFile("dist/admin/auth.json", JSON.stringify(user && pass ? { v: 1, iter: ITER, user: derive(user), pass: derive(pass) } : { v: 1, disabled: true }));
console.log("built dist/");
