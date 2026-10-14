"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadGas } = require("./gas-mock");

const uuid = () => require("crypto").randomUUID();

function valid(over = {}) {
  return Object.assign({
    fullName: "Ahmad Fauzi",
    nickname: "Fauzi",
    whatsapp: "0812-3456-7890",
    email: "Fauzi@Example.com",
    campusType: "trisakti",
    campusOther: "",
    faculty: "Fakultas Hukum",
    studyProgram: "Ilmu Hukum",
    semester: "3",
    semesterOther: "",
    nim: "010001",
    motivation: "Ingin belajar organisasi.",
    infoSource: "instagram",
    infoSourceOther: "",
    pmiiExperience: "belum",
    emergencyName: "Siti Aminah",
    emergencyRelation: "orang_tua",
    emergencyPhone: "081298765432",
    needs: "",
    consentTruth: true,
    consentRules: true,
    consentData: true,
    consentDocumentation: false,
    documentationAsked: true,
    submissionId: uuid(),
    website: "",
    elapsedMs: 60000,
  }, over);
}

const plain = (o) => JSON.parse(JSON.stringify(o));
const submit = (g, data) => plain(g.ctx.handleSubmission_(data));
const dataRows = (g) => (g.sheet() ? g.sheet().getLastRow() - 1 : 0);

test("pendaftaran valid tersimpan dengan format yang benar", () => {
  const g = loadGas();
  const res = submit(g, valid());
  assert.equal(res.ok, true);
  assert.equal(res.status, "success");
  assert.match(res.ref, /^MPB26-0001-[A-Z2-9]{3}$/);
  assert.equal(dataRows(g), 1);
  assert.ok(g.state.flushes >= 1, "harus flush sebelum membalas sukses");

  const row = g.sheet().rowValues(2);
  const headers = g.sheet().rowValues(1);
  const byHeader = Object.fromEntries(headers.map((h, i) => [h, row[i]]));
  assert.equal(headers.length, 22);
  assert.ok(byHeader["Timestamp"] instanceof Date || Object.prototype.toString.call(byHeader["Timestamp"]) === "[object Date]");
  assert.equal(byHeader["Nomor referensi"], res.ref);
  assert.equal(byHeader["Status pendaftaran"], "Menunggu verifikasi");
  assert.equal(byHeader["Nomor WhatsApp"], "6281234567890", "nomor disimpan sebagai teks 62...");
  assert.equal(byHeader["Nomor kontak darurat"], "6281298765432");
  assert.equal(byHeader["NIM"], "010001", "angka 0 di depan NIM tidak hilang");
  assert.equal(byHeader["Email"], "fauzi@example.com");
  assert.equal(byHeader["Perguruan tinggi"], "Universitas Trisakti");
  assert.equal(byHeader["Semester"], 3);
  assert.equal(byHeader["Sumber informasi"], "Instagram");
  assert.equal(byHeader["Hubungan kontak darurat"], "Orang tua");
  assert.equal(byHeader["Persetujuan dokumentasi"], "Tidak bersedia");
  assert.match(byHeader["Status persetujuan"], /3 pernyataan/);
});

test("kirim ulang dengan ID pengiriman yang sama tidak membuat baris ganda", () => {
  const g = loadGas();
  const data = valid();
  const a = submit(g, data);
  const b = submit(g, data);
  assert.equal(b.status, "success");
  assert.equal(b.ref, a.ref);
  assert.equal(dataRows(g), 1);
});

test("nomor WhatsApp yang sama (format berbeda) terdeteksi duplikat", () => {
  const g = loadGas();
  submit(g, valid());
  const res = submit(g, valid({ whatsapp: "+62 812 3456 7890", fullName: "Orang Lain", emergencyPhone: "081311112222" }));
  assert.equal(res.status, "duplicate");
  assert.equal(res.ok, false);
  assert.equal(res.ref, undefined, "tidak membocorkan nomor referensi pendaftar lain");
  assert.equal(dataRows(g), 1);
});

test("data tidak tersimpan jika validasi server gagal", () => {
  const g = loadGas();
  const res = submit(g, valid({ fullName: "", whatsapp: "12345", consentData: false, semester: "20" }));
  assert.equal(res.status, "validation_error");
  assert.deepEqual(Object.keys(res.errors).sort(), ["consentData", "fullName", "semester", "whatsapp"]);
  assert.equal(dataRows(g), 0);
});

test("honeypot dan pengiriman terlalu cepat ditolak tanpa disimpan", () => {
  const g = loadGas();
  assert.equal(submit(g, valid({ website: "http://spam" })).status, "rejected");
  assert.equal(submit(g, valid({ elapsedMs: 200 })).status, "rejected");
  assert.equal(submit(g, valid({ submissionId: "bukan-uuid" })).status, "rejected");
  assert.equal(submit(g, null).status, "rejected");
  assert.equal(dataRows(g), 0);
});

test("teks berawalan = disimpan sebagai teks, bukan formula", () => {
  const g = loadGas();
  submit(g, valid({ faculty: '=HYPERLINK("http://x","klik")', motivation: "+cmd" }));
  const row = g.sheet().rowValues(2);
  assert.ok(row.includes('=HYPERLINK("http://x","klik")'));
  assert.ok(row.includes("+cmd"));
  assert.ok(!row.some((v) => v && typeof v === "object" && v.formula));
});

test("kontak darurat mengikuti Script Property REQUIRE_EMERGENCY_CONTACT", () => {
  const noEc = { emergencyName: "", emergencyRelation: "", emergencyPhone: "" };
  const g1 = loadGas();
  const r1 = submit(g1, valid(noEc));
  assert.equal(r1.status, "validation_error");
  assert.ok(r1.errors.emergencyName && r1.errors.emergencyPhone && r1.errors.emergencyRelation);

  const g2 = loadGas({ props: { REQUIRE_EMERGENCY_CONTACT: "false" } });
  assert.equal(submit(g2, valid(noEc)).status, "success");

  // Opsional, tetapi jika diisi sebagian harus lengkap.
  const r3 = submit(g2, valid({ emergencyName: "Budi", emergencyRelation: "", emergencyPhone: "", whatsapp: "081355556666" }));
  assert.equal(r3.status, "validation_error");
});

test("nomor kontak darurat tidak boleh sama dengan nomor peserta", () => {
  const g = loadGas();
  const res = submit(g, valid({ emergencyPhone: "+6281234567890" }));
  assert.equal(res.status, "validation_error");
  assert.ok(res.errors.emergencyPhone);
});

test("pendaftaran bisa ditutup lewat REGISTRATION_OPEN", () => {
  const g = loadGas({ props: { REGISTRATION_OPEN: "false" } });
  assert.equal(submit(g, valid()).status, "closed");
  assert.equal(dataRows(g), 0);
});

test("lock tidak didapat -> busy, tanpa menyimpan", () => {
  const g = loadGas({ lockAvailable: false });
  assert.equal(submit(g, valid()).status, "busy");
  assert.equal(dataRows(g), 0);
});

test("batas pendaftaran per menit", () => {
  const g = loadGas({ props: { MAX_PER_MINUTE: "2" } });
  assert.equal(submit(g, valid({ whatsapp: "081200000001" })).status, "success");
  assert.equal(submit(g, valid({ whatsapp: "081200000002" })).status, "success");
  assert.equal(submit(g, valid({ whatsapp: "081200000003" })).status, "busy");
});

test("nomor referensi berurutan dan unik", () => {
  const g = loadGas();
  const refs = ["081200000011", "081200000012", "081200000013"].map((w) => submit(g, valid({ whatsapp: w })).ref);
  assert.deepEqual(refs.map((r) => r.split("-")[1]), ["0001", "0002", "0003"]);
  assert.equal(new Set(refs).size, 3);
});

test("baris melebihi ukuran sheet tetap bisa ditulis", () => {
  const g = loadGas();
  submit(g, valid({ whatsapp: "081200000021" }));
  const sh = g.sheet();
  // Paksa sheet "penuh": pindahkan baris terakhir ke batas maksimum.
  sh.getRange(1000, 1, 1, 1).setValues([["isi"]]);
  const res = submit(g, valid({ whatsapp: "081200000022" }));
  assert.equal(res.status, "success");
  assert.equal(sh.getLastRow(), 1001);
});

test("doPost JSON (fetch) mengembalikan JSON", () => {
  const g = loadGas();
  const out = g.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(valid()) } });
  assert.equal(out.mime, "application/json");
  const body = JSON.parse(out.content);
  assert.equal(body.status, "success");
});

test("doPost iframe mengirim postMessage ke origin peminta dengan JSON yang aman", () => {
  const g = loadGas();
  const nonce = uuid();
  const data = valid({ motivation: "</script><script>alert(1)</script>" });
  const out = g.ctx.doPost({ parameter: { transport: "iframe", nonce, origin: "https://contoh.github.io", payload: JSON.stringify(data) } });
  assert.equal(out.xfo, "ALLOWALL");
  assert.match(out.html, /window\.top\.postMessage\(/);
  assert.match(out.html, /"https:\/\/contoh\.github\.io"\);/);
  assert.ok(!out.html.includes("</script><script>alert"), "konten pengguna tidak boleh memutus tag script");
  // Ambil pesan dan pastikan bisa diparse kembali.
  const m = /postMessage\(("(?:[^"\\]|\\.)*"),/.exec(out.html);
  const msg = JSON.parse(JSON.parse(m[1]));
  assert.equal(msg.type, "mapaba-registration-result");
  assert.equal(msg.nonce, nonce);
  assert.equal(msg.result.status, "success");
});

test("ALLOWED_ORIGINS menolak origin lain pada jalur iframe sebelum menyimpan", () => {
  const g = loadGas({ props: { ALLOWED_ORIGINS: "https://pmii.github.io, http://localhost:8080" } });
  const bad = g.ctx.doPost({ parameter: { transport: "iframe", nonce: "n", origin: "https://jahat.example", payload: JSON.stringify(valid()) } });
  assert.match(bad.html, /rejected/);
  assert.equal(dataRows(g), 0);
  const ok = g.ctx.doPost({ parameter: { transport: "iframe", nonce: "n", origin: "http://localhost:8080", payload: JSON.stringify(valid()) } });
  assert.match(ok.html, /success/);
});

test("error internal tidak membocorkan detail", () => {
  const g = loadGas();
  g.ctx.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error("rahasia: spreadsheet id 123"); };
  const out = g.ctx.doPost({ parameter: {}, postData: { contents: JSON.stringify(valid()) } });
  const body = JSON.parse(out.content);
  assert.equal(body.status, "server_error");
  assert.ok(!out.content.includes("rahasia"));
});

test("doGet tidak mengembalikan data peserta", () => {
  const g = loadGas();
  submit(g, valid());
  const out = g.ctx.doGet({ parameter: {} });
  assert.deepEqual(Object.keys(JSON.parse(out.content)).sort(), ["ok", "service", "status"]);
});

test("setup aman dijalankan ulang dan tidak menimpa data", () => {
  const g = loadGas();
  g.ctx.setup();
  submit(g, valid());
  g.ctx.setup();
  assert.equal(dataRows(g), 1);
  assert.equal(g.props.REQUIRE_EMERGENCY_CONTACT, "true");
});
