/*
 * Uji end-to-end di Chrome/Edge headless lewat Chrome DevTools Protocol.
 * Tidak butuh dependensi npm (memakai WebSocket bawaan Node >= 22).
 *
 *   node tests/e2e.js                 (cari Chrome/Edge otomatis)
 *   CHROME=/path/ke/chrome node tests/e2e.js
 *   SHOTS=folder node tests/e2e.js    (simpan screenshot ke folder)
 *
 * Memakai mock backend (tests/serve.js --mock) yang menjalankan gas/Code.gs asli.
 */
"use strict";
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert/strict");

const PORT = 8180;
const SITE = `http://localhost:${PORT}/`;
const MOCK = `http://127.0.0.1:${PORT + 10}`;
const SHOTS = process.env.SHOTS || "";

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const c = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return c.find((p) => fs.existsSync(p));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, label = "kondisi") {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* coba lagi */ }
    await wait(150);
  }
  throw new Error("Timeout menunggu " + label);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) this.events.push(msg);
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.log("Chrome/Edge tidak ditemukan; set env CHROME."); process.exit(2); }

  const server = spawn(process.execPath, [path.join(__dirname, "serve.js"), "--mock"], {
    env: Object.assign({}, process.env, { PORT: String(PORT), MOCK_TIMEOUT: "2500" }), stdio: "ignore",
  });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mapaba-e2e-"));
  const browser = spawn(chrome, ["--headless=new", "--remote-debugging-port=9333", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "about:blank"], { stdio: "ignore" });

  let failures = 0;
  const results = [];
  try {
    const ver = await waitFor(async () => (await fetch("http://127.0.0.1:9333/json/version")).json(), 15000, "Chrome");
    await waitFor(async () => (await fetch(SITE)).ok, 10000, "server");
    const ws = new WebSocket(ver.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener("open", r));
    const cdp = new CDP(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const S = (m, p) => cdp.send(m, p, sessionId);
    await S("Page.enable"); await S("Runtime.enable");

    const js = async (expr) => {
      const r = await S("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text);
      return r.result.value;
    };
    const viewport = (width, height, mobile) => S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile });
    const load = async () => {
      await S("Page.navigate", { url: SITE });
      await waitFor(() => js("document.readyState === 'complete' && !!window.MapabaValidation"), 10000, "halaman");
      await js(HELPERS);
    };
    const shot = async (name) => {
      if (!SHOTS) return;
      fs.mkdirSync(SHOTS, { recursive: true });
      const m = await S("Page.getLayoutMetrics");
      const h = Math.ceil(m.cssContentSize.height);
      const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssLayoutViewport.clientWidth, height: h, scale: 1 } });
      fs.writeFileSync(path.join(SHOTS, name + ".png"), Buffer.from(data, "base64"));
    };
    const rows = async () => (await fetch(MOCK + "/rows")).json();

    async function scenario(name, fn) {
      try { await fn(); results.push("✔ " + name); }
      catch (e) { failures++; results.push("✘ " + name + "\n    " + (e.stack || e).toString().split("\n").slice(0, 3).join("\n    ")); }
    }

    await viewport(360, 780, true);
    await load();
    await js("sessionStorage.clear()");
    await load();

    await scenario("halaman tampil tanpa scroll horizontal di 360px", async () => {
      await shot("01-langkah1-360");
      const overflow = await js("document.documentElement.scrollWidth - document.documentElement.clientWidth");
      assert.equal(overflow, 0);
      assert.equal(await js("document.querySelector('#progress-count').textContent"), "Langkah 1 dari 3");
      assert.equal(await js("document.querySelector('#config-notice').hidden"), true, "notice backend tidak tampil saat URL diatur");
    });

    await scenario("Lanjut dengan form kosong menampilkan error & fokus ke field pertama", async () => {
      await js("click('[data-step=\"1\"] [data-action=next]')");
      assert.equal(await js("document.activeElement.id"), "fullName");
      assert.equal(await js("document.querySelector('#fullName').getAttribute('aria-invalid')"), "true");
      assert.match(await js("document.querySelector('#whatsapp-error').textContent"), /wajib/);
      assert.equal(await js("visibleStep()"), 1);
      await shot("02-error-360");
    });

    await scenario("input nomor membuang huruf; error hilang setelah diperbaiki", async () => {
      await js("type('whatsapp', '08ab12-3456 7890')");
      assert.equal(await js("document.querySelector('#whatsapp').value"), "0812-3456 7890");
      await js("type('fullName', 'Ahmad Fauzi')");
      assert.equal(await js("document.querySelector('#fullName-error').textContent"), "");
    });

    await scenario("field kondisional perguruan tinggi lain", async () => {
      await js("radio('campusType','other')");
      assert.equal(await js("document.querySelector('[data-show-when=\"campusType=other\"]').hidden"), false);
      await js("click('[data-step=\"1\"] [data-action=next]')");
      assert.match(await js("document.querySelector('#campusOther-error').textContent"), /perguruan tinggi/);
      await js("radio('campusType','trisakti')");
      assert.equal(await js("document.querySelector('[data-show-when=\"campusType=other\"]').hidden"), true);
    });

    await scenario("isi langkah 1 & 2, kembali tanpa kehilangan data", async () => {
      await js(`fillStep1(); click('[data-step="1"] [data-action=next]')`);
      assert.equal(await js("visibleStep()"), 2);
      assert.equal(await js("document.activeElement.id"), "step2-title");
      await js("fillStep2()");
      await shot("03-langkah2-360");
      await js(`click('[data-step="2"] [data-action=back]')`);
      assert.equal(await js("visibleStep()"), 1);
      assert.equal(await js("document.querySelector('#nickname').value"), "Fauzi");
      await js(`click('[data-step="1"] [data-action=next]')`);
      assert.equal(await js("document.querySelector('#emergencyName').value"), "Siti Aminah");
    });

    await scenario("draft bertahan setelah muat ulang halaman", async () => {
      await wait(400);
      await load();
      assert.equal(await js("document.querySelector('#fullName').value"), "Ahmad Fauzi");
      assert.equal(await js("document.querySelector('input[name=infoSource]:checked').value"), "instagram");
      await js(`click('[data-step="1"] [data-action=next]')`);
      await js(`click('[data-step="2"] [data-action=next]')`);
      assert.equal(await js("visibleStep()"), 3);
    });

    await scenario("ringkasan menampilkan data dengan aman & tombol Ubah kembali ke langkah", async () => {
      const text = await js("document.querySelector('#review').innerText");
      assert.match(text, /Ahmad Fauzi/);
      assert.match(text, /\+62 812-3456-7890/);
      assert.match(text, /Orang tua/);
      assert.ok(await js("!document.querySelector('#review script, #review img')"), "tidak ada HTML yang tersisip");
      await shot("04-periksa-360");
      await js("click('[data-goto=\"1\"]')");
      assert.equal(await js("visibleStep()"), 1);
      assert.equal(await js("document.activeElement.id"), "fullName");
      assert.match(await js("document.querySelector('[data-step=\"1\"] [data-action=next]').textContent"), /kembali ke pemeriksaan/);
      await js(`click('[data-step="1"] [data-action=next]')`);
      assert.equal(await js("visibleStep()"), 3, "langsung kembali ke pemeriksaan");
    });

    await scenario("kirim tanpa centang pernyataan ditolak di frontend", async () => {
      const before = (await rows()).length;
      await js("click('#submit-btn')");
      assert.equal(await js("document.activeElement.id"), "consentTruth");
      assert.equal((await rows()).length, before);
    });

    await scenario("kirim sukses hanya setelah server menyimpan; nomor referensi dari server", async () => {
      assert.equal(await js("document.getElementById('doc-consent-group').hidden"), true, "persetujuan dokumentasi dimatikan lewat config");
      await js("check('consentTruth'); check('consentRules'); check('consentData')");
      await wait(3100); // otomatisasi jauh lebih cepat dari manusia; lewati jebakan waktu anti-bot
      await js("click('#submit-btn')");
      // Status 'mengirim' tampil dan tombol nonaktif
      assert.equal(await js("document.querySelector('#submit-btn').disabled"), true);
      assert.match(await js("document.querySelector('#submit-btn').textContent"), /Mengirim pendaftaran/);
      await waitFor(() => js("!document.querySelector('#success').hidden"), 8000, "panel sukses").catch(async (e) => { throw new Error(e.message + " | status: " + await js("document.querySelector('#submit-status').textContent")); });
      const ref = await js("document.querySelector('#success-ref').textContent");
      assert.match(ref, /^MPB26-0001-[A-Z2-9]{3}$/);
      const data = await rows();
      assert.equal(data.length, 2);
      assert.equal(data[1][1], ref, "nomor referensi di layar sama dengan di sheet");
      assert.equal(data[1][5], "6281234567890");
      assert.equal(data[1][20], "Tidak ditanyakan");
      assert.equal(await js("document.querySelector('#success-name').textContent"), "Ahmad Fauzi");
      assert.equal(await js("sessionStorage.length"), 0, "draft dihapus setelah sukses");
      assert.equal(await js("document.activeElement.id"), "success-title");
      await shot("05-sukses-360");
    });

    await scenario("nomor WhatsApp yang sama ditolak sebagai duplikat, data tetap ada", async () => {
      await load();
      await js(`fillStep1(); click('[data-step="1"] [data-action=next]'); fillStep2(); click('[data-step="2"] [data-action=next]');
                check('consentTruth'); check('consentRules'); check('consentData')`);
      await wait(3100); // server menolak pengiriman yang lebih cepat dari MIN_FILL_MS (3 detik)
      await js("click('#submit-btn')");
      await waitFor(() => js("/sudah terdaftar/.test(document.querySelector('#submit-status').textContent)"), 8000, "pesan duplikat");
      assert.equal(await js("document.querySelector('#success').hidden"), true);
      assert.equal(await js("document.querySelector('#fullName').value"), "Ahmad Fauzi", "isian tidak dikosongkan");
      assert.equal((await rows()).length, 2);
      await shot("06-duplikat-360");
    });

    await scenario("koneksi putus setelah tersimpan -> gagal dikonfirmasi, coba lagi tidak menggandakan data", async () => {
      await js("click('[data-goto=\"1\"][data-focus=\"whatsapp\"]')");
      await js("type('whatsapp', '0857 1234 0000'); click('[data-step=\"1\"] [data-action=next]')");
      assert.equal(await js("visibleStep()"), 3);
      await fetch(MOCK + "/fail-next");
      await js("click('#submit-btn')");
      await waitFor(() => js("/belum dapat dikonfirmasi/.test(document.querySelector('#submit-status').textContent)"), 15000, "pesan gagal").catch(async (e) => { throw new Error(e.message + " | status: " + await js("document.querySelector('#submit-status').textContent + ' | btn: ' + document.querySelector('#submit-btn').textContent")); });
      assert.equal(await js("document.querySelector('#submit-btn').textContent"), "Coba kirim lagi");
      assert.equal(await js("document.querySelector('#submit-btn').disabled"), false);
      assert.equal((await rows()).length, 3, "server sebenarnya sudah menyimpan");
      await shot("07-gagal-360");
      await js("click('#submit-btn')");
      await waitFor(() => js("!document.querySelector('#success').hidden"), 8000, "panel sukses setelah coba lagi");
      const data = await rows();
      assert.equal(data.length, 3, "tidak ada baris ganda");
      assert.equal(await js("document.querySelector('#success-ref').textContent"), data[2][1]);
    });

    await scenario("tampilan tablet & desktop tanpa scroll horizontal", async () => {
      for (const [w, h, name] of [[768, 1024, "08-tablet"], [1366, 900, "09-desktop"]]) {
        await viewport(w, h, false);
        await load();
        assert.equal(await js("document.documentElement.scrollWidth - document.documentElement.clientWidth"), 0, name);
        await shot(name);
      }
      await viewport(360, 780, true);
    });

    await scenario("tanpa backendUrl: peringatan tampil dan pengiriman tidak berpura-pura berhasil", async () => {
      await load();
      await js(`MAPABA_CONFIG.backendUrl = ''`);
      await js(`fillStep1(); radio('campusType','trisakti'); type('whatsapp','081377778888');
                click('[data-step="1"] [data-action=next]'); fillStep2(); click('[data-step="2"] [data-action=next]');
                check('consentTruth'); check('consentRules'); check('consentData'); click('#submit-btn')`);
      assert.match(await js("document.querySelector('#submit-status').textContent"), /belum terhubung/);
      assert.equal(await js("document.querySelector('#success').hidden"), true);
    });

    ws.close();
  } finally {
    browser.kill();
    server.kill();
    await wait(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* abaikan */ }
  }

  console.log(results.join("\n"));
  console.log(`\n${results.length - failures} lulus, ${failures} gagal`);
  process.exit(failures ? 1 : 0);
}

const HELPERS = `
  window.click = (sel) => document.querySelector(sel).click();
  window.type = (id, v) => { const el = document.getElementById(id); el.focus(); el.value = '';
    for (const ch of v) { el.value += ch; el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.dispatchEvent(new Event('change', { bubbles: true })); el.blur(); };
  window.radio = (name, v) => { const el = document.querySelector('input[name="' + name + '"][value="' + v + '"]'); el.click(); };
  window.check = (id) => { const el = document.getElementById(id); if (!el.checked) el.click(); };
  window.select = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  window.visibleStep = () => Number(document.querySelector('.step:not([hidden])').dataset.step);
  window.fillStep1 = () => { type('fullName','Ahmad Fauzi'); type('nickname','Fauzi'); type('whatsapp','0812-3456-7890');
    type('email','fauzi@example.com'); radio('campusType','trisakti'); type('faculty','Fakultas Hukum');
    type('studyProgram','Ilmu Hukum'); select('semester','3'); type('nim','010001'); };
  window.fillStep2 = () => { type('motivation','Ingin <b>belajar</b> berorganisasi.'); radio('infoSource','instagram');
    radio('pmiiExperience','belum'); type('emergencyName','Siti Aminah'); select('emergencyRelation','orang_tua');
    type('emergencyPhone','081298765432'); type('needs','Alergi udang'); };
`;

main().catch((e) => { console.error(e); process.exit(1); });
