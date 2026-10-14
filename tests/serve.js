/*
 * Server lokal untuk pengembangan & pengujian.
 *
 *   node tests/serve.js            -> sajikan situs di http://localhost:8080
 *   node tests/serve.js --mock     -> plus mock backend yang menjalankan gas/Code.gs
 *                                     asli dan meniru perilaku Apps Script:
 *                                     POST /exec -> 302 ke origin lain (echo) yang
 *                                     mengizinkan CORS, seperti script.googleusercontent.com.
 *
 * Mock HANYA untuk pengujian lokal. Integrasi sebenarnya tetap harus diuji
 * pada URL Apps Script & GitHub Pages yang asli (lihat README).
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 8080);
const MOCK = process.argv.includes("--mock");
const MOCK_PORT = PORT + 10;
const ECHO_PORT = PORT + 11;
let failOnce = process.env.MOCK_FAIL === "network-once"; // putus koneksi SETELAH data tersimpan (sekali)

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".svg": "image/svg+xml", ".webp": "image/webp", ".jpg": "image/jpeg" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || /[\\/](tests|gas|node_modules|\.git)[\\/]/.test(file.slice(ROOT.length))) {
    res.writeHead(404); return res.end("Not found");
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("Not found"); }
    let body = buf;
    if (MOCK && p === "/index.html") {
      body = buf.toString().replace("connect-src https://script.google.com",
        `connect-src http://127.0.0.1:${MOCK_PORT} http://127.0.0.1:${ECHO_PORT} https://script.google.com`);
    }
    if (MOCK && p === "/js/config.js") {
      body = buf.toString() + `\nwindow.MAPABA_CONFIG.backendUrl = "http://127.0.0.1:${MOCK_PORT}/exec";\n` +
        (process.env.MOCK_TIMEOUT ? `window.MAPABA_CONFIG.requestTimeoutMs = ${Number(process.env.MOCK_TIMEOUT)};\n` : "");
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  });
}).listen(PORT, () => console.log(`Situs: http://localhost:${PORT}${MOCK ? " (mock backend aktif)" : ""}`));

if (MOCK) {
  const { loadGas } = require("./gas-mock");
  const gas = loadGas();
  const echoes = new Map();
  global.__mockGas = gas;

  // Meniru script.google.com: tidak ada header CORS pada respons akhir,
  // hanya redirect 302 (yang di Apps Script sungguhan membawa ACAO).
  http.createServer((req, res) => {
    if (req.method === "GET" && req.url.startsWith("/rows")) {
      // Endpoint khusus pengujian untuk memeriksa isi "sheet".
      const sh = gas.sheet();
      const rows = [];
      if (sh) for (let r = 1; r <= sh.getLastRow(); r++) rows.push(sh.rowValues(r));
      res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
      return res.end(JSON.stringify(rows));
    }
    if (req.method === "GET" && req.url.startsWith("/fail-next")) {
      failOnce = true; // pengujian: putuskan koneksi pada POST berikutnya setelah data tersimpan
      res.writeHead(204, { "Access-Control-Allow-Origin": "*" });
      return res.end();
    }
    if (req.method !== "POST" || !req.url.startsWith("/exec")) { res.writeHead(404); return res.end(); }
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      const type = req.headers["content-type"] || "";
      let e;
      if (type.startsWith("application/x-www-form-urlencoded")) {
        e = { parameter: Object.fromEntries(new URLSearchParams(body)), postData: { contents: body } };
      } else {
        e = { parameter: {}, postData: { contents: body } };
      }
      const out = gas.ctx.doPost(e);
      if (failOnce && !e.parameter.transport) {
        // Data SUDAH tersimpan, tetapi respons tidak bisa dibaca browser (tanpa CORS),
        // meniru gangguan jaringan/CORS setelah penyimpanan.
        failOnce = false;
        res.writeHead(502, { "Content-Type": "text/html" });
        return res.end("<html>Bad gateway</html>");
      }
      if (out.html !== undefined) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(out.html);
      }
      const id = crypto.randomUUID();
      echoes.set(id, out.content);
      res.writeHead(302, { Location: `http://127.0.0.1:${ECHO_PORT}/echo?id=${id}`, "Access-Control-Allow-Origin": "*" });
      res.end();
    });
  }).listen(MOCK_PORT, () => console.log(`Mock Apps Script: http://127.0.0.1:${MOCK_PORT}/exec`));

  // Meniru script.googleusercontent.com/macros/echo
  http.createServer((req, res) => {
    const id = new URL(req.url, "http://x").searchParams.get("id");
    const content = echoes.get(id);
    echoes.delete(id);
    res.writeHead(content ? 200 : 404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(content || "");
  }).listen(ECHO_PORT);
}
