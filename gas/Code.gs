/**
 * Backend pendaftaran MAPABA PMII Trisakti 2026 (Google Apps Script).
 *
 * Fungsi:
 *  - doPost(e): menerima pendaftaran, memvalidasi ulang, menyimpan ke Sheets.
 *  - doGet(e):  pemeriksaan kesehatan endpoint (TIDAK mengembalikan data peserta).
 *  - setup():   jalankan SEKALI dari editor untuk menyiapkan sheet & properti.
 *
 * Konfigurasi disimpan di Script Properties (Project Settings > Script Properties):
 *  SPREADSHEET_ID            (opsional) ID spreadsheet. Kosongkan jika script
 *                            dibuat dari menu Extensions > Apps Script di spreadsheet.
 *  REQUIRE_EMERGENCY_CONTACT "true" / "false" — harus sama dengan js/config.js.
 *  REGISTRATION_OPEN         "true" / "false" — tutup pendaftaran tanpa deploy ulang.
 *  REF_PREFIX                Awalan nomor referensi, mis. "MPB26".
 *  MAX_PER_MINUTE            Batas total pendaftaran per menit (perlindungan banjir spam).
 *  MIN_FILL_MS               Waktu pengisian minimum (ms) sebelum dianggap bot.
 *  ALLOWED_ORIGINS           Daftar origin frontend dipisah koma, mis.
 *                            "https://namaakun.github.io,http://localhost:8080".
 */

var SHEET_NAME = 'Pendaftar';
var STATUS_DEFAULT = 'Menunggu verifikasi';
var STATUS_OPTIONS = ['Menunggu verifikasi', 'Terverifikasi', 'Perlu dihubungi', 'Ditolak', 'Batal'];

var COLUMNS = [
  { key: 'timestamp', header: 'Timestamp', width: 150 },
  { key: 'ref', header: 'Nomor referensi', width: 150, text: true },
  { key: 'status', header: 'Status pendaftaran', width: 160 },
  { key: 'fullName', header: 'Nama lengkap', width: 200 },
  { key: 'nickname', header: 'Nama panggilan', width: 130 },
  { key: 'whatsapp', header: 'Nomor WhatsApp', width: 140, text: true },
  { key: 'email', header: 'Email', width: 200 },
  { key: 'campus', header: 'Perguruan tinggi', width: 200 },
  { key: 'faculty', header: 'Fakultas', width: 180 },
  { key: 'studyProgram', header: 'Program studi', width: 180 },
  { key: 'semester', header: 'Semester', width: 90 },
  { key: 'nim', header: 'NIM', width: 130, text: true },
  { key: 'motivation', header: 'Alasan mengikuti MAPABA', width: 280 },
  { key: 'infoSource', header: 'Sumber informasi', width: 180 },
  { key: 'pmiiExperience', header: 'Pengalaman kegiatan PMII sebelumnya', width: 150 },
  { key: 'emergencyName', header: 'Nama kontak darurat', width: 180 },
  { key: 'emergencyRelation', header: 'Hubungan kontak darurat', width: 150 },
  { key: 'emergencyPhone', header: 'Nomor kontak darurat', width: 150, text: true },
  { key: 'needs', header: 'Kebutuhan kegiatan (alergi/pantangan/aksesibilitas)', width: 260 },
  { key: 'consent', header: 'Status persetujuan', width: 220 },
  { key: 'docConsent', header: 'Persetujuan dokumentasi', width: 150 },
  { key: 'submissionId', header: 'ID pengiriman (sistem)', width: 120, text: true },
];

var DEFAULT_PROPS = {
  REQUIRE_EMERGENCY_CONTACT: 'true',
  REGISTRATION_OPEN: 'true',
  REF_PREFIX: 'MPB26',
  MAX_PER_MINUTE: '40',
  MIN_FILL_MS: '3000',
  ALLOWED_ORIGINS: '',
};

var MAX_BODY_CHARS = 20000;

// ------------------------------------------------------------------
// Aturan validasi — salinan dari js/validation.js (jaga tetap sama).
// ------------------------------------------------------------------

var LIMITS = {
  fullName: 100, nickname: 40, whatsapp: 20, email: 100, campusOther: 120,
  faculty: 100, studyProgram: 100, semesterOther: 40, nim: 30, motivation: 1000,
  infoSourceOther: 100, emergencyName: 100, emergencyPhone: 20, needs: 500,
};

var OPTIONS = {
  campusType: { trisakti: 'Universitas Trisakti', other: 'Perguruan tinggi lainnya' },
  infoSource: {
    instagram: 'Instagram', teman: 'Teman', kader: 'Pengurus atau kader PMII',
    kampus: 'Informasi kampus', lainnya: 'Lainnya',
  },
  pmiiExperience: { pernah: 'Pernah', belum: 'Belum pernah' },
  emergencyRelation: { orang_tua: 'Orang tua', keluarga: 'Keluarga', teman: 'Teman', lainnya: 'Lainnya' },
};

var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’,-]*$/u;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var NIM_RE = /^[A-Za-z0-9][A-Za-z0-9.\/\- ]*$/;
var PHONE_RE = /^628[1-9]\d{7,10}$/;
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// eslint-disable-next-line no-control-regex
var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200D\uFEFF]/g;

function str_(v) { return v === undefined || v === null ? '' : String(v); }
function cleanLine_(v) { return str_(v).replace(CONTROL_RE, '').replace(/\s+/g, ' ').trim(); }
function cleanMulti_(v) {
  return str_(v).replace(/\r\n?/g, '\n').replace(CONTROL_RE, '').replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
function isTrue_(v) { return v === true || v === 'true' || v === 'on' || v === '1'; }
function has_(map, k) { return Object.prototype.hasOwnProperty.call(map, k); }

function normalizePhone_(raw) {
  var v = str_(raw).trim();
  if (!v) return '';
  if (/[^0-9+\s().-]/.test(v)) return '';
  var plus = v.charAt(0) === '+';
  var digits = v.replace(/[^0-9]/g, '');
  if (plus && digits.indexOf('62') !== 0) return '';
  if (digits.indexOf('62') === 0) digits = digits.slice(2);
  else if (digits.charAt(0) === '0') digits = digits.slice(1);
  var out = '62' + digits;
  return PHONE_RE.test(out) ? out : '';
}

function normalize_(d) {
  d = d || {};
  var out = {
    fullName: cleanLine_(d.fullName),
    nickname: cleanLine_(d.nickname),
    whatsappRaw: cleanLine_(d.whatsapp),
    whatsapp: normalizePhone_(d.whatsapp),
    email: cleanLine_(d.email).toLowerCase(),
    campusType: cleanLine_(d.campusType),
    campusOther: cleanLine_(d.campusOther),
    faculty: cleanLine_(d.faculty),
    studyProgram: cleanLine_(d.studyProgram),
    semester: cleanLine_(d.semester),
    semesterOther: cleanLine_(d.semesterOther),
    nim: cleanLine_(d.nim).toUpperCase(),
    motivation: cleanMulti_(d.motivation),
    infoSource: cleanLine_(d.infoSource),
    infoSourceOther: cleanLine_(d.infoSourceOther),
    pmiiExperience: cleanLine_(d.pmiiExperience),
    emergencyName: cleanLine_(d.emergencyName),
    emergencyRelation: cleanLine_(d.emergencyRelation),
    emergencyPhoneRaw: cleanLine_(d.emergencyPhone),
    emergencyPhone: normalizePhone_(d.emergencyPhone),
    needs: cleanMulti_(d.needs),
    consentTruth: isTrue_(d.consentTruth),
    consentRules: isTrue_(d.consentRules),
    consentData: isTrue_(d.consentData),
    consentDocumentation: isTrue_(d.consentDocumentation),
    documentationAsked: d.documentationAsked === undefined ? true : isTrue_(d.documentationAsked),
  };
  if (out.campusType !== 'other') out.campusOther = '';
  if (out.semester !== 'lainnya') out.semesterOther = '';
  if (out.infoSource !== 'lainnya') out.infoSourceOther = '';
  return out;
}

/** Mengembalikan { field: pesan } — kosong berarti valid. */
function validate_(d, requireEmergencyContact) {
  var e = {};
  function tooLong(f, v) { return v.length > LIMITS[f] ? 'Terlalu panjang. Maksimal ' + LIMITS[f] + ' karakter.' : ''; }
  function name(f, required, emptyMsg) {
    var v = d[f];
    if (!v) return required ? emptyMsg : '';
    if (v.length < 2) return 'Tulis minimal 2 huruf.';
    if (!NAME_RE.test(v)) return 'Gunakan huruf saja. Angka dan simbol tidak perlu ditulis.';
    return tooLong(f, v);
  }
  function text(f, emptyMsg) {
    var v = d[f];
    if (!v) return emptyMsg;
    if (v.length < 2) return 'Tulis minimal 2 karakter.';
    return tooLong(f, v);
  }
  function phone(f, raw, required, emptyMsg) {
    if (!raw) return required ? emptyMsg : '';
    if (/[^0-9+\s().-]/.test(raw)) return 'Nomor hanya boleh berisi angka. Contoh: 081234567890.';
    if (!d[f]) return 'Format nomor belum sesuai. Gunakan nomor HP Indonesia, contoh: 081234567890 (10–13 digit, diawali 08).';
    return '';
  }
  function choice(map, v, emptyMsg) {
    if (!v) return emptyMsg;
    return has_(map, v) ? '' : 'Pilih salah satu opsi yang tersedia.';
  }
  function set(f, msg) { if (msg) e[f] = msg; }

  set('fullName', name('fullName', true, 'Nama lengkap wajib diisi.'));
  set('nickname', name('nickname', true, 'Nama panggilan wajib diisi.'));
  set('whatsapp', phone('whatsapp', d.whatsappRaw, true, 'Nomor WhatsApp wajib diisi agar panitia bisa menghubungimu.'));
  if (d.email) set('email', !EMAIL_RE.test(d.email) ? 'Format email belum benar. Contoh: nama@gmail.com.' : tooLong('email', d.email));
  set('campusType', choice(OPTIONS.campusType, d.campusType, 'Pilih asal perguruan tinggimu.'));
  if (d.campusType === 'other') {
    set('campusOther', !d.campusOther ? 'Tulis nama perguruan tinggimu.'
      : d.campusOther.length < 3 ? 'Tulis nama perguruan tinggi dengan lengkap.' : tooLong('campusOther', d.campusOther));
  }
  set('faculty', text('faculty', 'Fakultas wajib diisi.'));
  set('studyProgram', text('studyProgram', 'Program studi wajib diisi.'));
  var sem = d.semester;
  var semOk = sem === 'lainnya' || (/^\d{1,2}$/.test(sem) && Number(sem) >= 1 && Number(sem) <= 14 && String(Number(sem)) === sem);
  set('semester', !sem ? 'Pilih semester yang sedang kamu jalani.' : semOk ? '' : 'Pilih salah satu semester yang tersedia.');
  if (sem === 'lainnya') set('semesterOther', !d.semesterOther ? 'Jelaskan singkat keterangan semestermu.' : tooLong('semesterOther', d.semesterOther));
  if (d.nim) set('nim', !NIM_RE.test(d.nim) ? 'NIM hanya boleh berisi huruf, angka, titik, garis miring, atau tanda hubung.' : tooLong('nim', d.nim));

  set('motivation', tooLong('motivation', d.motivation));
  set('infoSource', choice(OPTIONS.infoSource, d.infoSource, 'Pilih dari mana kamu tahu tentang MAPABA.'));
  if (d.infoSource === 'lainnya') set('infoSourceOther', !d.infoSourceOther ? 'Sebutkan singkat sumber informasinya.' : tooLong('infoSourceOther', d.infoSourceOther));
  set('pmiiExperience', choice(OPTIONS.pmiiExperience, d.pmiiExperience, 'Pilih salah satu: pernah atau belum pernah.'));

  var ecStarted = !!requireEmergencyContact || !!(d.emergencyName || d.emergencyRelation || d.emergencyPhoneRaw);
  set('emergencyName', name('emergencyName', ecStarted, 'Nama kontak darurat wajib diisi.'));
  if (d.emergencyRelation) set('emergencyRelation', has_(OPTIONS.emergencyRelation, d.emergencyRelation) ? '' : 'Pilih salah satu opsi yang tersedia.');
  else if (ecStarted) set('emergencyRelation', 'Pilih hubunganmu dengan kontak darurat.');
  var ecPhoneMsg = phone('emergencyPhone', d.emergencyPhoneRaw, ecStarted, 'Nomor WhatsApp kontak darurat wajib diisi.');
  if (!ecPhoneMsg && d.emergencyPhone && d.emergencyPhone === d.whatsapp) {
    ecPhoneMsg = 'Gunakan nomor orang lain yang bisa dihubungi jika terjadi sesuatu, bukan nomormu sendiri.';
  }
  set('emergencyPhone', ecPhoneMsg);
  set('needs', tooLong('needs', d.needs));

  var consentMsg = 'Centang pernyataan ini untuk melanjutkan pendaftaran.';
  if (!d.consentTruth) e.consentTruth = consentMsg;
  if (!d.consentRules) e.consentRules = consentMsg;
  if (!d.consentData) e.consentData = consentMsg;
  return e;
}

// ------------------------------------------------------------------
// Endpoint
// ------------------------------------------------------------------

function doGet() {
  // Sengaja tidak mengembalikan data apa pun selain status layanan.
  return jsonResponse_({ ok: true, status: 'alive', service: 'mapaba-registration' });
}

function doPost(e) {
  var params = (e && e.parameter) || {};
  var isIframe = params.transport === 'iframe';
  var result;
  try {
    if (isIframe && !originAllowed_(params.origin)) {
      result = fail_('rejected', 'Asal permintaan tidak dikenali.');
    } else {
      result = handleSubmission_(parseBody_(e));
    }
  } catch (err) {
    console.error('doPost error: ' + (err && err.stack ? err.stack : err));
    result = fail_('server_error', 'Terjadi gangguan di server. Silakan coba lagi.');
  }
  console.log('submission result: ' + result.status + (result.ref ? ' ' + result.ref : ''));
  return isIframe ? iframeResponse_(result, params.nonce, params.origin) : jsonResponse_(result);
}

function parseBody_(e) {
  var raw = '';
  if (e && e.parameter && typeof e.parameter.payload === 'string') raw = e.parameter.payload;
  else if (e && e.postData && typeof e.postData.contents === 'string') raw = e.postData.contents;
  if (!raw || raw.length > MAX_BODY_CHARS) return null;
  try {
    var obj = JSON.parse(raw);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch (err) {
    return null;
  }
}

function fail_(status, message, extra) {
  var r = { ok: false, status: status, message: message };
  if (extra) for (var k in extra) r[k] = extra[k];
  return r;
}

/** Inti pemrosesan. Dipisah dari doPost agar bisa diuji. */
function handleSubmission_(raw) {
  if (!raw) return fail_('rejected', 'Data tidak dapat dibaca.');
  var props = getProps_();

  // Honeypot & jebakan waktu: bot sederhana biasanya mengisi semua kolom
  // dan mengirim dalam hitungan milidetik. Tidak disimpan.
  if (cleanLine_(raw.website)) return fail_('rejected', 'Pendaftaran tidak dapat diproses.');
  var elapsed = Number(raw.elapsedMs);
  if (!isFinite(elapsed) || elapsed < Number(props.MIN_FILL_MS)) return fail_('rejected', 'Pendaftaran tidak dapat diproses.');

  if (props.REGISTRATION_OPEN !== 'true') {
    return fail_('closed', 'Pendaftaran sedang ditutup.');
  }

  var submissionId = str_(raw.submissionId);
  if (!UUID_RE.test(submissionId)) return fail_('rejected', 'Data tidak lengkap.');
  submissionId = submissionId.toLowerCase();

  var d = normalize_(raw);
  var errors = validate_(d, props.REQUIRE_EMERGENCY_CONTACT === 'true');
  if (Object.keys(errors).length) {
    return fail_('validation_error', 'Ada data yang perlu diperbaiki.', { errors: errors });
  }

  if (!withinRateLimit_(Number(props.MAX_PER_MINUTE))) {
    return fail_('busy', 'Server sedang sibuk. Coba lagi sebentar lagi.');
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return fail_('busy', 'Server sedang sibuk. Coba lagi sebentar lagi.');
  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    var idCol = colIndex_('submissionId');
    var waCol = colIndex_('whatsapp');
    var refCol = colIndex_('ref');
    var nameCol = colIndex_('fullName');

    if (lastRow > 1) {
      var n = lastRow - 1;
      var ids = sheet.getRange(2, idCol, n, 1).getValues();
      var phones = sheet.getRange(2, waCol, n, 1).getValues();
      for (var i = 0; i < n; i++) {
        // Idempoten: pengiriman ulang dengan ID yang sama -> hasil yang sama.
        if (str_(ids[i][0]).toLowerCase() === submissionId) {
          var row = sheet.getRange(i + 2, 1, 1, COLUMNS.length).getValues()[0];
          return success_(str_(row[refCol - 1]), str_(row[nameCol - 1]), submissionId);
        }
      }
      for (var j = 0; j < n; j++) {
        var existing = normalizePhone_(str_(phones[j][0])) || str_(phones[j][0]).replace(/\D/g, '');
        if (existing && existing === d.whatsapp) {
          // Tidak menimpa data lama dan tidak membocorkan data pendaftar lain.
          return fail_('duplicate', 'Nomor WhatsApp ini sudah terdaftar.');
        }
      }
    }

    var ref = nextRef_(props.REF_PREFIX, lastRow);
    var values = buildRow_(d, ref, submissionId);
    var target = lastRow + 1;
    if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 200);
    // Kolom nomor (WA, NIM, referensi) disimpan sebagai teks agar angka 0/62
    // di depan tidak hilang atau berubah menjadi notasi ilmiah.
    var textCells = [];
    COLUMNS.forEach(function (c, idx) { if (c.text) textCells.push(colLetter_(idx + 1) + target); });
    sheet.getRangeList(textCells).setNumberFormat('@');
    sheet.getRange(target, 1, 1, COLUMNS.length).setValues([values]);
    SpreadsheetApp.flush();

    // Verifikasi: baca kembali baris yang baru ditulis sebelum menyatakan sukses.
    var check = sheet.getRange(target, idCol).getValue();
    if (str_(check).toLowerCase() !== submissionId) {
      throw new Error('Verifikasi penulisan gagal');
    }
    return success_(ref, d.fullName, submissionId);
  } finally {
    lock.releaseLock();
  }
}

function success_(ref, name, submissionId) {
  return {
    ok: true,
    status: 'success',
    ref: ref,
    name: name,
    submissionId: submissionId,
    message: 'Pendaftaran tersimpan dan menunggu verifikasi panitia.',
  };
}

function buildRow_(d, ref, submissionId) {
  var campus = d.campusType === 'other' ? d.campusOther : OPTIONS.campusType.trisakti;
  var semester = d.semester === 'lainnya' ? 'Lainnya: ' + d.semesterOther : Number(d.semester);
  var source = d.infoSource === 'lainnya' ? 'Lainnya: ' + d.infoSourceOther : OPTIONS.infoSource[d.infoSource];
  var docConsent = !d.documentationAsked ? 'Tidak ditanyakan' : d.consentDocumentation ? 'Bersedia' : 'Tidak bersedia';
  var map = {
    timestamp: new Date(),
    ref: ref,
    status: STATUS_DEFAULT,
    fullName: d.fullName,
    nickname: d.nickname,
    whatsapp: d.whatsapp,
    email: d.email,
    campus: campus,
    faculty: d.faculty,
    studyProgram: d.studyProgram,
    semester: semester,
    nim: d.nim,
    motivation: d.motivation,
    infoSource: source,
    pmiiExperience: OPTIONS.pmiiExperience[d.pmiiExperience],
    emergencyName: d.emergencyName,
    emergencyRelation: d.emergencyRelation ? OPTIONS.emergencyRelation[d.emergencyRelation] : '',
    emergencyPhone: d.emergencyPhone,
    needs: d.needs,
    consent: 'Menyetujui 3 pernyataan (data benar, ketentuan panitia, penggunaan data)',
    docConsent: docConsent,
    submissionId: submissionId,
  };
  return COLUMNS.map(function (c) {
    var v = map[c.key];
    return typeof v === 'string' && !c.text ? safeCell_(v) : v;
  });
}

/** Cegah formula injection: teks yang diawali = + - @ disimpan sebagai teks biasa. */
function safeCell_(v) {
  return /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function nextRef_(prefix, lastRow) {
  var store = PropertiesService.getScriptProperties();
  var current = Number(store.getProperty('REF_COUNTER')) || 0;
  // Jika properti hilang, jangan sampai nomor mundur di bawah jumlah baris.
  var seq = Math.max(current, Math.max(lastRow - 1, 0)) + 1;
  store.setProperty('REF_COUNTER', String(seq));
  var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var suffix = '';
  for (var i = 0; i < 3; i++) suffix += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  var p = /^[A-Z0-9]{2,12}$/.test(prefix) ? prefix : 'MPB26';
  return p + '-' + ('0000' + seq).slice(-4) + '-' + suffix;
}

function withinRateLimit_(max) {
  if (!(max > 0)) return true;
  var cache = CacheService.getScriptCache();
  var key = 'rl_' + Math.floor(Date.now() / 60000);
  var count = Number(cache.get(key) || 0) + 1;
  cache.put(key, String(count), 120);
  return count <= max;
}

// ------------------------------------------------------------------
// Respons
// ------------------------------------------------------------------

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function iframeResponse_(result, nonce, origin) {
  var target = /^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(str_(origin)) ? str_(origin) : null;
  var message = JSON.stringify({
    type: 'mapaba-registration-result',
    nonce: str_(nonce).slice(0, 64),
    result: result,
  });
  var script = target
    ? '<script>try{window.top.postMessage(' + scriptJson_(message) + ',' + scriptJson_(target) + ');}catch(e){}</script>'
    : '';
  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + script + '</body></html>';
  return HtmlService.createHtmlOutput(html).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** JSON yang aman disisipkan di dalam tag <script>. */
function scriptJson_(v) {
  return JSON.stringify(v)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function originAllowed_(origin) {
  var list = str_(getProps_().ALLOWED_ORIGINS).split(',')
    .map(function (s) { return s.trim().replace(/\/$/, ''); })
    .filter(function (s) { return s; });
  if (!list.length) return true; // belum dikonfigurasi: izinkan (lihat README)
  return list.indexOf(str_(origin)) !== -1;
}

// ------------------------------------------------------------------
// Spreadsheet & properti
// ------------------------------------------------------------------

function getProps_() {
  var stored = PropertiesService.getScriptProperties().getProperties();
  var out = {};
  for (var k in DEFAULT_PROPS) out[k] = has_(stored, k) && stored[k] !== '' ? String(stored[k]).trim() : DEFAULT_PROPS[k];
  out.SPREADSHEET_ID = str_(stored.SPREADSHEET_ID).trim();
  out.REQUIRE_EMERGENCY_CONTACT = out.REQUIRE_EMERGENCY_CONTACT.toLowerCase();
  out.REGISTRATION_OPEN = out.REGISTRATION_OPEN.toLowerCase();
  out.REF_PREFIX = out.REF_PREFIX.toUpperCase();
  return out;
}

function getSpreadsheet_() {
  var id = getProps_().SPREADSHEET_ID;
  var ss = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Spreadsheet tidak ditemukan. Isi Script Property SPREADSHEET_ID.');
  return ss;
}

function getSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) writeHeaders_(sheet);
  return sheet;
}

function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function colIndex_(key) {
  for (var i = 0; i < COLUMNS.length; i++) if (COLUMNS[i].key === key) return i + 1;
  throw new Error('Kolom tidak dikenal: ' + key);
}

function writeHeaders_(sheet) {
  var headers = COLUMNS.map(function (c) { return c.header; });
  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0a1a3f')
    .setWrap(true).setVerticalAlignment('middle');
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);
  sheet.setRowHeight(1, 44);
}

/**
 * Jalankan SEKALI dari editor Apps Script (pilih fungsi "setup" lalu Run).
 * Menyiapkan sheet "Pendaftar", header, format kolom, dropdown status,
 * dan nilai default Script Properties. Aman dijalankan ulang: tidak
 * menghapus data yang sudah ada.
 */
function setup() {
  var store = PropertiesService.getScriptProperties();
  var stored = store.getProperties();
  for (var k in DEFAULT_PROPS) if (!has_(stored, k)) store.setProperty(k, DEFAULT_PROPS[k]);

  var sheet = getSheet_();
  var current = sheet.getRange(1, 1, 1, COLUMNS.length).getValues()[0];
  var expected = COLUMNS.map(function (c) { return c.header; });
  if (current.join('|') !== expected.join('|')) {
    if (sheet.getLastRow() > 1) {
      throw new Error('Header sheet "' + SHEET_NAME + '" berbeda dari yang diharapkan dan sheet sudah berisi data. ' +
        'Periksa manual agar data tidak tertukar kolom.');
    }
    writeHeaders_(sheet);
  }

  var maxRows = sheet.getMaxRows();
  COLUMNS.forEach(function (c, i) {
    sheet.setColumnWidth(i + 1, c.width);
    if (c.text) sheet.getRange(2, i + 1, maxRows - 1, 1).setNumberFormat('@');
  });
  sheet.getRange(2, colIndex_('timestamp'), maxRows - 1, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
  ['motivation', 'needs'].forEach(function (key) {
    sheet.getRange(2, colIndex_(key), maxRows - 1, 1).setWrap(true);
  });

  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_OPTIONS, true).setAllowInvalid(false).build();
  sheet.getRange(2, colIndex_('status'), maxRows - 1, 1).setDataValidation(rule);

  console.log('Setup selesai. Sheet: ' + SHEET_NAME + ', kolom: ' + COLUMNS.length);
}
