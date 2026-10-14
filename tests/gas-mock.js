/*
 * Mock minimal layanan Google Apps Script untuk menjalankan gas/Code.gs di Node.
 * Meniru perilaku penting Sheets: string angka berubah jadi Number kecuali sel
 * berformat teks ("@"), dan string berawalan "=" dianggap formula.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createSheet(name) {
  const cells = []; // cells[r][c] = { v, fmt }
  let maxRows = 1000;
  const get = (r, c) => (cells[r] && cells[r][c]) || { v: "", fmt: "" };
  const put = (r, c, patch) => {
    if (r > maxRows) throw new Error("Range di luar dimensi sheet");
    cells[r] = cells[r] || [];
    cells[r][c] = Object.assign({}, get(r, c), patch);
  };
  const store = (r, c, v) => {
    const fmt = get(r, c).fmt;
    if (typeof v === "string" && fmt !== "@") {
      if (v.startsWith("'")) v = v.slice(1);
      else if (v.startsWith("=")) v = { formula: v };
      else if (/^[+-]?\d+(\.\d+)?$/.test(v)) v = Number(v);
    }
    put(r, c, { v });
  };
  function range(row, col, nr = 1, nc = 1) {
    const api = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => get(row + i, col + j).v)),
      getValue: () => get(row, col).v,
      setValues: (vals) => { vals.forEach((r, i) => r.forEach((v, j) => store(row + i, col + j, v))); return api; },
      setNumberFormat: (f) => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) put(row + i, col + j, { fmt: f }); return api; },
    };
    ["setFontWeight", "setFontColor", "setBackground", "setWrap", "setVerticalAlignment", "setDataValidation"]
      .forEach((m) => { api[m] = () => api; });
    return api;
  }
  const a1 = (s) => {
    const m = /^([A-Z]+)(\d+)$/.exec(s);
    let col = 0;
    for (const ch of m[1]) col = col * 26 + (ch.charCodeAt(0) - 64);
    return [Number(m[2]), col];
  };
  return {
    name,
    cells,
    getLastRow: () => { for (let r = cells.length - 1; r >= 1; r--) if (cells[r] && cells[r].some((c) => c && c.v !== "")) return r; return 0; },
    getMaxRows: () => maxRows,
    insertRowsAfter: (_after, n) => { maxRows += n; },
    getRange: (r, c, nr, nc) => range(r, c, nr, nc),
    getRangeList: (list) => ({ setNumberFormat: (f) => { list.forEach((s) => { const [r, c] = a1(s); range(r, c).setNumberFormat(f); }); } }),
    setFrozenRows() {}, setFrozenColumns() {}, setRowHeight() {}, setColumnWidth() {},
    rowValues: (r) => (cells[r] || []).slice(1).map((c) => (c ? c.v : "")),
    rowFormats: (r) => (cells[r] || []).slice(1).map((c) => (c ? c.fmt : "")),
  };
}

function loadGas(opts = {}) {
  const props = Object.assign({}, opts.props || {});
  const cache = {};
  const sheets = {};
  const state = { lockAvailable: opts.lockAvailable !== false, flushes: 0 };
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = createSheet(n)),
  };
  const ctx = {
    console: { log() {}, error() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperties: () => Object.assign({}, props),
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    LockService: { getScriptLock: () => ({ tryLock: () => state.lockAvailable, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; } }) },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      flush: () => { state.flushes++; },
      newDataValidation: () => { const b = { requireValueInList: () => b, setAllowInvalid: () => b, build: () => ({}) }; return b; },
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (content) => { const o = { content, setMimeType: (m) => { o.mime = m; return o; } }; return o; },
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: "ALLOWALL" },
      createHtmlOutput: (html) => { const o = { html, setXFrameOptionsMode: (m) => { o.xfo = m; return o; } }; return o; },
    },
  };
  vm.createContext(ctx);
  const code = fs.readFileSync(path.join(__dirname, "..", "gas", "Code.gs"), "utf8");
  vm.runInContext(code, ctx, { filename: "Code.gs" });
  return { ctx, props, cache, sheets, state, sheet: () => sheets.Pendaftar };
}

module.exports = { loadGas };
