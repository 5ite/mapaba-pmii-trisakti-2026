/*
 * Aturan validasi & normalisasi form MAPABA.
 *
 * Dipakai di browser (window.MapabaValidation) dan di Node untuk pengujian.
 * Backend (gas/Code.gs) punya salinan aturan yang sama dan tetap memvalidasi
 * ulang semuanya — validasi di sini hanya untuk kenyamanan peserta.
 * Jika mengubah aturan di sini, ubah juga di gas/Code.gs (tes `npm test`
 * membandingkan keduanya).
 */
(function (root) {
  "use strict";

  var LIMITS = {
    fullName: 100,
    nickname: 40,
    whatsapp: 20,
    email: 100,
    campusOther: 120,
    faculty: 100,
    studyProgram: 100,
    semesterOther: 40,
    nim: 30,
    motivation: 1000,
    infoSourceOther: 100,
    emergencyName: 100,
    emergencyPhone: 20,
    needs: 500,
  };

  var OPTIONS = {
    campusType: { trisakti: "Universitas Trisakti", other: "Perguruan tinggi lainnya" },
    infoSource: {
      instagram: "Instagram",
      teman: "Teman",
      kader: "Pengurus atau kader PMII",
      kampus: "Informasi kampus",
      lainnya: "Lainnya",
    },
    pmiiExperience: { pernah: "Pernah", belum: "Belum pernah" },
    emergencyRelation: {
      orang_tua: "Orang tua",
      keluarga: "Keluarga",
      teman: "Teman",
      lainnya: "Lainnya",
    },
  };

  var SEMESTERS = [];
  for (var s = 1; s <= 14; s++) SEMESTERS.push(String(s));

  var STEP_FIELDS = {
    1: ["fullName", "nickname", "whatsapp", "email", "campusType", "campusOther",
        "faculty", "studyProgram", "semester", "semesterOther", "nim"],
    2: ["motivation", "infoSource", "infoSourceOther", "pmiiExperience",
        "emergencyName", "emergencyRelation", "emergencyPhone", "needs"],
    3: ["consentTruth", "consentRules", "consentData"],
  };

  var NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’,-]*$/u;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var NIM_RE = /^[A-Za-z0-9][A-Za-z0-9.\/\- ]*$/;
  var PHONE_RE = /^628[1-9]\d{7,10}$/;
  // eslint-disable-next-line no-control-regex
  var CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‍﻿]/g;

  function str(v) {
    return v === undefined || v === null ? "" : String(v);
  }

  /** Teks satu baris: buang karakter kontrol, rapikan spasi. */
  function cleanLine(v) {
    return str(v).replace(CONTROL_RE, "").replace(/\s+/g, " ").trim();
  }

  /** Teks multi-baris: pertahankan baris baru, maksimal satu baris kosong. */
  function cleanMulti(v) {
    return str(v)
      .replace(/\r\n?/g, "\n")
      .replace(CONTROL_RE, "")
      .replace(/[ \t]+/g, " ")
      .replace(/ *\n */g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Normalisasi nomor HP Indonesia ke format 62xxxxxxxxxx.
   * Menerima 08..., +628..., 628..., atau 8...; spasi/strip/titik/kurung dibuang.
   * Mengembalikan "" jika format tidak valid.
   */
  function normalizePhone(raw) {
    var v = str(raw).trim();
    if (!v) return "";
    if (/[^0-9+\s().-]/.test(v)) return "";
    var plus = v.charAt(0) === "+";
    var digits = v.replace(/[^0-9]/g, "");
    if (plus && digits.indexOf("62") !== 0) return "";
    if (digits.indexOf("62") === 0) digits = digits.slice(2);
    else if (digits.charAt(0) === "0") digits = digits.slice(1);
    var out = "62" + digits;
    return PHONE_RE.test(out) ? out : "";
  }

  /** 6281234567890 -> "+62 812-3456-7890" untuk ditampilkan. */
  function formatPhone(normalized) {
    var n = str(normalized);
    if (n.indexOf("62") !== 0) return n;
    var rest = n.slice(2);
    var parts = [rest.slice(0, 3), rest.slice(3, 7), rest.slice(7)].filter(Boolean);
    return "+62 " + parts.join("-");
  }

  function isTrue(v) {
    return v === true || v === "true" || v === "on" || v === "1";
  }

  /** Hasilkan salinan data yang sudah dibersihkan (dipakai untuk dikirim). */
  function normalize(data) {
    var d = data || {};
    var out = {
      fullName: cleanLine(d.fullName),
      nickname: cleanLine(d.nickname),
      whatsapp: normalizePhone(d.whatsapp) || cleanLine(d.whatsapp),
      email: cleanLine(d.email).toLowerCase(),
      campusType: cleanLine(d.campusType),
      campusOther: cleanLine(d.campusOther),
      faculty: cleanLine(d.faculty),
      studyProgram: cleanLine(d.studyProgram),
      semester: cleanLine(d.semester),
      semesterOther: cleanLine(d.semesterOther),
      nim: cleanLine(d.nim).toUpperCase(),
      motivation: cleanMulti(d.motivation),
      infoSource: cleanLine(d.infoSource),
      infoSourceOther: cleanLine(d.infoSourceOther),
      pmiiExperience: cleanLine(d.pmiiExperience),
      emergencyName: cleanLine(d.emergencyName),
      emergencyRelation: cleanLine(d.emergencyRelation),
      emergencyPhone: normalizePhone(d.emergencyPhone) || cleanLine(d.emergencyPhone),
      needs: cleanMulti(d.needs),
      consentTruth: isTrue(d.consentTruth),
      consentRules: isTrue(d.consentRules),
      consentData: isTrue(d.consentData),
      consentDocumentation: isTrue(d.consentDocumentation),
    };
    if (out.campusType !== "other") out.campusOther = "";
    if (out.semester !== "lainnya") out.semesterOther = "";
    if (out.infoSource !== "lainnya") out.infoSourceOther = "";
    return out;
  }

  /**
   * Validasi data. opts.requireEmergencyContact menentukan apakah kontak
   * darurat wajib. opts.fields membatasi field yang dicek (per langkah).
   * Mengembalikan objek { namaField: "pesan error" } — kosong berarti valid.
   */
  function validate(raw, opts) {
    opts = opts || {};
    var d = normalize(raw);
    var only = opts.fields ? toSet(opts.fields) : null;
    var errors = {};

    function check(field, fn) {
      if (only && !only[field]) return;
      var msg = fn(d[field]);
      if (msg) errors[field] = msg;
    }
    function tooLong(field, v) {
      return v.length > LIMITS[field]
        ? "Terlalu panjang. Maksimal " + LIMITS[field] + " karakter (sekarang " + v.length + ")."
        : "";
    }
    function name(field, emptyMsg, required) {
      return function (v) {
        if (!v) return required ? emptyMsg : "";
        if (v.length < 2) return "Tulis minimal 2 huruf.";
        if (!NAME_RE.test(v)) return "Gunakan huruf saja. Angka dan simbol tidak perlu ditulis.";
        return tooLong(field, v);
      };
    }
    function text(field, emptyMsg) {
      return function (v) {
        if (!v) return emptyMsg;
        if (v.length < 2) return "Tulis minimal 2 karakter.";
        return tooLong(field, v);
      };
    }
    function optionalText(field) {
      return function (v) { return tooLong(field, v); };
    }
    function choice(map, emptyMsg) {
      return function (v) {
        if (!v) return emptyMsg;
        return Object.prototype.hasOwnProperty.call(map, v) ? "" : "Pilih salah satu opsi yang tersedia.";
      };
    }
    function phone(field, emptyMsg, required) {
      return function (v) {
        var rawV = cleanLine(raw && raw[field]);
        if (!rawV) return required ? emptyMsg : "";
        if (/[^0-9+\s().-]/.test(rawV)) return "Nomor hanya boleh berisi angka. Contoh: 081234567890.";
        if (!PHONE_RE.test(v)) {
          return "Format nomor belum sesuai. Gunakan nomor HP Indonesia, contoh: 081234567890 (10–13 digit, diawali 08).";
        }
        return "";
      };
    }

    check("fullName", name("fullName", "Nama lengkap wajib diisi.", true));
    check("nickname", name("nickname", "Nama panggilan wajib diisi.", true));
    check("whatsapp", phone("whatsapp", "Nomor WhatsApp wajib diisi agar panitia bisa menghubungimu.", true));
    check("email", function (v) {
      if (!v) return "";
      if (!EMAIL_RE.test(v)) return "Format email belum benar. Contoh: nama@gmail.com.";
      return tooLong("email", v);
    });
    check("campusType", choice(OPTIONS.campusType, "Pilih asal perguruan tinggimu."));
    check("campusOther", function (v) {
      if (d.campusType !== "other") return "";
      if (!v) return "Tulis nama perguruan tinggimu.";
      if (v.length < 3) return "Tulis nama perguruan tinggi dengan lengkap.";
      return tooLong("campusOther", v);
    });
    check("faculty", text("faculty", "Fakultas wajib diisi."));
    check("studyProgram", text("studyProgram", "Program studi wajib diisi."));
    check("semester", function (v) {
      if (!v) return "Pilih semester yang sedang kamu jalani.";
      return v === "lainnya" || SEMESTERS.indexOf(v) !== -1 ? "" : "Pilih salah satu semester yang tersedia.";
    });
    check("semesterOther", function (v) {
      if (d.semester !== "lainnya") return "";
      if (!v) return "Jelaskan singkat, misalnya “baru lulus” atau “cuti akademik”.";
      return tooLong("semesterOther", v);
    });
    check("nim", function (v) {
      if (!v) return "";
      if (!NIM_RE.test(v)) return "NIM hanya boleh berisi huruf, angka, titik, garis miring, atau tanda hubung.";
      return tooLong("nim", v);
    });

    check("motivation", optionalText("motivation"));
    check("infoSource", choice(OPTIONS.infoSource, "Pilih dari mana kamu tahu tentang MAPABA."));
    check("infoSourceOther", function (v) {
      if (d.infoSource !== "lainnya") return "";
      if (!v) return "Sebutkan singkat sumber informasinya.";
      return tooLong("infoSourceOther", v);
    });
    check("pmiiExperience", choice(OPTIONS.pmiiExperience, "Pilih salah satu: pernah atau belum pernah."));

    var ecRequired = !!opts.requireEmergencyContact;
    var ecStarted = ecRequired || !!(d.emergencyName || d.emergencyRelation || cleanLine(raw && raw.emergencyPhone));
    check("emergencyName", name("emergencyName", "Nama kontak darurat wajib diisi.", ecStarted));
    check("emergencyRelation", function (v) {
      if (!v) return ecStarted ? "Pilih hubunganmu dengan kontak darurat." : "";
      return Object.prototype.hasOwnProperty.call(OPTIONS.emergencyRelation, v) ? "" : "Pilih salah satu opsi yang tersedia.";
    });
    check("emergencyPhone", function (v) {
      var msg = phone("emergencyPhone", "Nomor WhatsApp kontak darurat wajib diisi.", ecStarted)(v);
      if (msg) return msg;
      if (v && v === d.whatsapp) return "Gunakan nomor orang lain yang bisa dihubungi jika terjadi sesuatu, bukan nomormu sendiri.";
      return "";
    });
    check("needs", optionalText("needs"));

    var consentMsg = "Centang pernyataan ini untuk melanjutkan pendaftaran.";
    check("consentTruth", function (v) { return v ? "" : consentMsg; });
    check("consentRules", function (v) { return v ? "" : consentMsg; });
    check("consentData", function (v) { return v ? "" : consentMsg; });

    return errors;
  }

  function validateStep(step, raw, opts) {
    var o = {};
    for (var k in opts) o[k] = opts[k];
    o.fields = STEP_FIELDS[step] || [];
    return validate(raw, o);
  }

  function toSet(arr) {
    var o = {};
    for (var i = 0; i < arr.length; i++) o[arr[i]] = true;
    return o;
  }

  var api = {
    LIMITS: LIMITS,
    OPTIONS: OPTIONS,
    SEMESTERS: SEMESTERS,
    STEP_FIELDS: STEP_FIELDS,
    normalizePhone: normalizePhone,
    formatPhone: formatPhone,
    normalize: normalize,
    validate: validate,
    validateStep: validateStep,
  };

  if (typeof module === "object" && module.exports) module.exports = api;
  else root.MapabaValidation = api;
})(this);
