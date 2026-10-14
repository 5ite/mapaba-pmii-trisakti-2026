"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../js/validation.js");
const { loadGas } = require("./gas-mock");

const base = {
  fullName: "Nur Aisyah", nickname: "Ais", whatsapp: "081234567890", email: "",
  campusType: "trisakti", campusOther: "", faculty: "FEB", studyProgram: "Manajemen",
  semester: "1", semesterOther: "", nim: "", motivation: "", infoSource: "teman",
  infoSourceOther: "", pmiiExperience: "pernah", emergencyName: "Ibu Aisyah",
  emergencyRelation: "orang_tua", emergencyPhone: "085711112222", needs: "",
  consentTruth: true, consentRules: true, consentData: true,
};

test("normalisasi nomor WhatsApp", () => {
  const ok = {
    "081234567890": "6281234567890",
    "0812 3456 7890": "6281234567890",
    "0812-3456-7890": "6281234567890",
    "+6281234567890": "6281234567890",
    "+62 812-3456-7890": "6281234567890",
    "6281234567890": "6281234567890",
    "81234567890": "6281234567890",
    "(0812) 3456 7890": "6281234567890",
    "0811234567": "62811234567",
    "0812345678901": "62812345678901",
  };
  for (const [input, want] of Object.entries(ok)) assert.equal(V.normalizePhone(input), want, input);

  for (const bad of ["", "12345", "0212345678", "08123", "081234567890123", "+1 555 1234567", "0812abc4567890", "62012345678", "0800000000"]) {
    assert.equal(V.normalizePhone(bad), "", bad);
  }
});

test("format tampilan nomor", () => {
  assert.equal(V.formatPhone("6281234567890"), "+62 812-3456-7890");
});

test("data dasar valid", () => {
  assert.deepEqual(V.validate(base, { requireEmergencyContact: true }), {});
});

test("pesan error menjelaskan cara memperbaiki", () => {
  const e = V.validate(Object.assign({}, base, { whatsapp: "12345", email: "nama@", fullName: "Andi 123" }), {});
  assert.match(e.whatsapp, /contoh: 081234567890/i);
  assert.match(e.email, /Contoh: nama@gmail\.com/);
  assert.match(e.fullName, /huruf/);
});

test("field kondisional hanya wajib saat opsinya dipilih", () => {
  assert.ok(V.validate(Object.assign({}, base, { campusType: "other" }), {}).campusOther);
  assert.ok(!V.validate(Object.assign({}, base, { campusType: "trisakti", campusOther: "" }), {}).campusOther);
  assert.ok(V.validate(Object.assign({}, base, { semester: "lainnya" }), {}).semesterOther);
  assert.ok(V.validate(Object.assign({}, base, { infoSource: "lainnya" }), {}).infoSourceOther);
  // Nilai field tersembunyi dibuang saat normalisasi.
  assert.equal(V.normalize(Object.assign({}, base, { campusOther: "UI" })).campusOther, "");
});

test("validasi per langkah hanya memeriksa field langkah itu", () => {
  const e = V.validateStep(1, Object.assign({}, base, { consentTruth: false, pmiiExperience: "" }), {});
  assert.deepEqual(e, {});
  const e3 = V.validateStep(3, Object.assign({}, base, { consentTruth: false }), {});
  assert.deepEqual(Object.keys(e3), ["consentTruth"]);
});

test("normalisasi teks: spasi dirapikan, karakter kontrol dibuang", () => {
  const n = V.normalize(Object.assign({}, base, { fullName: "  Nur​   Aisyah ", motivation: "a\r\n\r\n\r\n\r\nb\u0007" }));
  assert.equal(n.fullName, "Nur Aisyah");
  assert.equal(n.motivation, "a\n\nb");
});

// ------------------------------------------------------------------
// Paritas: aturan frontend dan backend harus menghasilkan error yang sama.
// ------------------------------------------------------------------
test("aturan validasi frontend dan backend konsisten", () => {
  const g = loadGas();
  const cases = [
    {},
    { fullName: "" }, { fullName: "A" }, { fullName: "Andi 99" }, { fullName: "x".repeat(101) },
    { fullName: "Muh. Ali-Akbar O'Neil" }, { fullName: "Đặng Thị" },
    { nickname: "" }, { whatsapp: "" }, { whatsapp: "0812" }, { whatsapp: "08a" }, { whatsapp: "+62 811-2345-678" },
    { email: "x@y" }, { email: "ok@mail.co" }, { email: "a".repeat(95) + "@x.com" },
    { campusType: "" }, { campusType: "lain" }, { campusType: "other" }, { campusType: "other", campusOther: "UI" },
    { campusType: "other", campusOther: "Universitas Indonesia" },
    { faculty: "" }, { faculty: "F" }, { studyProgram: "" },
    { semester: "" }, { semester: "0" }, { semester: "15" }, { semester: "03" }, { semester: "14" },
    { semester: "lainnya" }, { semester: "lainnya", semesterOther: "Cuti" },
    { nim: "-123" }, { nim: "0123.45/AB" }, { nim: "x".repeat(31) },
    { motivation: "x".repeat(1001) }, { needs: "x".repeat(501) },
    { infoSource: "" }, { infoSource: "tiktok" }, { infoSource: "lainnya" }, { infoSource: "lainnya", infoSourceOther: "Poster" },
    { pmiiExperience: "" }, { pmiiExperience: "ya" },
    { emergencyName: "" }, { emergencyRelation: "" }, { emergencyRelation: "pacar" }, { emergencyPhone: "" },
    { emergencyPhone: "081234567890" }, { emergencyPhone: "123" },
    { consentTruth: false }, { consentRules: "" }, { consentData: undefined },
  ];
  for (const requireEc of [true, false]) {
    for (const c of cases.concat([{ emergencyName: "", emergencyRelation: "", emergencyPhone: "" }, { emergencyName: "Budi", emergencyRelation: "", emergencyPhone: "" }])) {
      const data = Object.assign({}, base, c);
      const fe = Object.keys(V.validate(data, { requireEmergencyContact: requireEc })).sort();
      const be = Object.keys(JSON.parse(JSON.stringify(g.ctx.validate_(g.ctx.normalize_(data), requireEc)))).sort();
      assert.deepEqual(be, fe, `kasus ${JSON.stringify(c)} (wajib kontak darurat: ${requireEc})`);
    }
  }
  // Normalisasi nomor sama persis.
  for (const p of ["081234567890", "+62 812 3456 7890", "62811", "0812abc", "+1 2025550123"]) {
    assert.equal(g.ctx.normalizePhone_(p), V.normalizePhone(p), p);
  }
  // Batas panjang sama.
  assert.deepEqual(JSON.parse(JSON.stringify(g.ctx.LIMITS)), V.LIMITS);
});
