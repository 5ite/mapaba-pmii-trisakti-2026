/*
 * Logika form pendaftaran MAPABA PMII Trisakti 2026.
 * Vanilla JS, tanpa dependensi. Bergantung pada js/config.js dan js/validation.js.
 */
(function () {
  "use strict";

  var CONFIG = window.MAPABA_CONFIG || {};
  var V = window.MapabaValidation;
  var DRAFT_KEY = "mapaba26-draft";
  var CLIENT_VERSION = "1.0.0";
  var NOT_PERSISTED = { consentTruth: 1, consentRules: 1, consentData: 1, website_url: 1 };
  var CONSENT_FIELDS = { consentTruth: 1, consentRules: 1, consentData: 1 };
  // Origin yang sah untuk pesan balasan Apps Script (iframe HtmlService).
  var GAS_ORIGIN_RE = /^https:\/\/([a-z0-9-]+-script\.googleusercontent\.com|script\.google\.com)$/;

  var form = document.getElementById("reg-form");
  var formArea = document.getElementById("form-area");
  var submitBtn = document.getElementById("submit-btn");
  var statusBox = document.getElementById("submit-status");
  var steps = Array.prototype.slice.call(document.querySelectorAll(".step"));
  var progressItems = Array.prototype.slice.call(document.querySelectorAll("[data-progress]"));
  var progressCount = document.getElementById("progress-count");

  var state = {
    step: 1,
    touched: {},
    submitting: false,
    returnToReview: false,
    submissionId: null,
    lastAttemptId: null,
    startedAt: Date.now(),
  };

  var ruleOpts = { requireEmergencyContact: !!CONFIG.requireEmergencyContact };

  // ---------------------------------------------------------------
  // Inisialisasi
  // ---------------------------------------------------------------

  function init() {
    if (!form || !V) return;
    applyConfig();
    buildSemesterOptions();
    restoreDraft();
    if (!state.submissionId) state.submissionId = newId();
    updateConditionals();
    updateCounters();
    renderStep(false);

    form.addEventListener("input", onInput);
    form.addEventListener("change", onChange);
    form.addEventListener("focusout", onBlur);
    form.addEventListener("click", onClick);
    form.addEventListener("submit", onSubmit);
    document.getElementById("copy-ref").addEventListener("click", copyRef);
    window.addEventListener("beforeunload", function (e) {
      if (state.submitting) { e.preventDefault(); e.returnValue = ""; }
    });
  }

  function applyConfig() {
    if (CONFIG.pageTitle) document.title = CONFIG.pageTitle;
    Array.prototype.forEach.call(document.querySelectorAll("[data-config]"), function (el) {
      var v = CONFIG[el.getAttribute("data-config")];
      if (v) el.textContent = v;
    });

    if (!CONFIG.backendUrl) document.getElementById("config-notice").hidden = false;
    if (!CONFIG.askDocumentationConsent) document.getElementById("doc-consent-group").hidden = true;
    if (!CONFIG.requiresVerification) document.getElementById("success-status-row").hidden = true;

    var ecReq = !!CONFIG.requireEmergencyContact;
    Array.prototype.forEach.call(document.querySelectorAll("[data-ec-req]"), function (el) { el.hidden = !ecReq; });
    Array.prototype.forEach.call(document.querySelectorAll("[data-ec-optional]"), function (el) { el.hidden = ecReq; });
    ["emergencyName", "emergencyRelation", "emergencyPhone"].forEach(function (n) {
      if (ecReq) form.elements[n].setAttribute("required", "");
    });
  }

  function buildSemesterOptions() {
    var sel = form.elements.semester;
    var other = sel.querySelector('option[value="lainnya"]');
    V.SEMESTERS.forEach(function (s) {
      var o = document.createElement("option");
      o.value = s;
      o.textContent = "Semester " + s;
      sel.insertBefore(o, other);
    });
  }

  // ---------------------------------------------------------------
  // Data form & draft
  // ---------------------------------------------------------------

  function getData() {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name) return;
      if (el.type === "radio") { if (el.checked) data[el.name] = el.value; else if (!(el.name in data)) data[el.name] = ""; }
      else if (el.type === "checkbox") data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    return data;
  }

  function setValue(name, value) {
    var el = form.elements[name];
    if (!el) return;
    if (el instanceof RadioNodeList || (el.length && el[0] && el[0].type === "radio")) {
      Array.prototype.forEach.call(el, function (r) { r.checked = r.value === value; });
    } else if (el.type === "checkbox") {
      el.checked = !!value;
    } else if (typeof value === "string") {
      el.value = value;
    }
  }

  // sessionStorage: isian bertahan saat halaman dimuat ulang, tetapi hilang
  // ketika tab ditutup (lebih aman di perangkat bersama). Dihapus setelah berhasil.
  function saveDraft() {
    try {
      var data = getData();
      Object.keys(NOT_PERSISTED).forEach(function (k) { delete data[k]; });
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        data: data,
        submissionId: state.submissionId,
        lastAttemptId: state.lastAttemptId,
        startedAt: state.startedAt,
      }));
    } catch (e) { /* penyimpanan tidak tersedia: abaikan */ }
  }

  function restoreDraft() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var draft = JSON.parse(raw);
      Object.keys(draft.data || {}).forEach(function (k) {
        if (!NOT_PERSISTED[k]) setValue(k, draft.data[k]);
      });
      if (typeof draft.submissionId === "string") state.submissionId = draft.submissionId;
      if (typeof draft.lastAttemptId === "string") state.lastAttemptId = draft.lastAttemptId;
      // Waktu mulai dihitung dari awal pengisian, bukan dari saat halaman dimuat ulang.
      if (typeof draft.startedAt === "number" && draft.startedAt < state.startedAt) state.startedAt = draft.startedAt;
    } catch (e) { /* abaikan draft rusak */ }
  }

  function clearDraft() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* abaikan */ }
  }

  var saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 300);
  }

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }

  // ---------------------------------------------------------------
  // Event
  // ---------------------------------------------------------------

  function onInput(e) {
    var el = e.target;
    if (el.hasAttribute("data-phone")) {
      // Hanya izinkan angka, +, spasi, strip, dan kurung.
      var cleaned = el.value.replace(/[^0-9+\s()-]/g, "");
      if (cleaned !== el.value) el.value = cleaned;
    }
    if (el.name && !CONSENT_FIELDS[el.name]) dataChanged();
    if (el.tagName === "TEXTAREA") updateCounters();
    // Hapus pesan error segera setelah isian diperbaiki.
    if (el.name && el.getAttribute("aria-invalid") === "true") validateField(el.name);
    scheduleSave();
  }

  function onChange(e) {
    var el = e.target;
    if (!el.name) return;
    if (!CONSENT_FIELDS[el.name]) dataChanged();
    updateConditionals();
    if (el.type === "radio" || el.type === "checkbox" || el.tagName === "SELECT") {
      state.touched[el.name] = true;
      validateField(el.name);
    }
    scheduleSave();
  }

  function onBlur(e) {
    var el = e.target;
    if (!el.name || el.type === "radio" || el.type === "checkbox") return;
    if (el.value.trim() !== "") state.touched[el.name] = true;
    if (state.touched[el.name]) validateField(el.name);
  }

  function onClick(e) {
    var btn = e.target.closest("[data-action], [data-goto]");
    if (!btn || state.submitting) return;
    var action = btn.getAttribute("data-action");
    if (action === "next") next();
    else if (action === "back") goTo(state.step - 1);
    else if (action === "retry") onSubmit(e);
    else if (btn.hasAttribute("data-goto")) {
      state.returnToReview = true;
      var target = Number(btn.getAttribute("data-goto"));
      goTo(target);
      var field = btn.getAttribute("data-focus");
      if (field) focusField(field);
    }
  }

  // Jika isian berubah setelah percobaan kirim yang belum terkonfirmasi,
  // gunakan ID pengiriman baru agar server tidak mengembalikan data lama.
  function dataChanged() {
    if (state.lastAttemptId && state.lastAttemptId === state.submissionId) {
      state.submissionId = newId();
    }
  }

  // ---------------------------------------------------------------
  // Field kondisional, penghitung karakter
  // ---------------------------------------------------------------

  function updateConditionals() {
    var data = getData();
    Array.prototype.forEach.call(document.querySelectorAll("[data-show-when]"), function (box) {
      var parts = box.getAttribute("data-show-when").split("=");
      var show = data[parts[0]] === parts[1];
      box.hidden = !show;
      var input = box.querySelector("input, select, textarea");
      if (input) {
        if (show) input.setAttribute("required", "");
        else { input.removeAttribute("required"); showError(input.name, ""); }
      }
    });
  }

  function updateCounters() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-count-for]"), function (p) {
      var name = p.getAttribute("data-count-for");
      var len = form.elements[name].value.length;
      p.textContent = len ? len + "/" + V.LIMITS[name] + " karakter" : "";
    });
  }

  // ---------------------------------------------------------------
  // Validasi & pesan error
  // ---------------------------------------------------------------

  function validateField(name) {
    var o = { requireEmergencyContact: ruleOpts.requireEmergencyContact, fields: [name] };
    var errs = V.validate(getData(), o);
    showError(name, errs[name] || "");
    return !errs[name];
  }

  function showErrors(errors, fields) {
    fields.forEach(function (f) { showError(f, errors[f] || ""); });
  }

  function showError(name, msg) {
    var box = document.getElementById(name + "-error");
    if (box) box.textContent = msg;
    var el = form.elements[name];
    if (!el) return;
    var invalid = msg ? "true" : "false";
    if (el.length && el[0] && el[0].type === "radio") {
      var group = el[0].closest(".options");
      if (group) group.setAttribute("data-invalid", invalid);
      Array.prototype.forEach.call(el, function (r) {
        r.setAttribute("aria-invalid", invalid);
        r.setAttribute("aria-describedby", name + "-error");
      });
    } else {
      el.setAttribute("aria-invalid", invalid);
    }
  }

  function focusField(name) {
    var el = form.elements[name];
    if (!el) return;
    var target = el.length && el[0] && el[0].type === "radio"
      ? (Array.prototype.filter.call(el, function (r) { return r.checked; })[0] || el[0])
      : el;
    target.focus({ preventScroll: true });
    var wrap = target.closest(".field, .check, .group") || target;
    wrap.scrollIntoView({ block: "center", behavior: smooth() });
  }

  function smooth() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  }

  function firstErrorField(errors, step) {
    var order = V.STEP_FIELDS[step];
    for (var i = 0; i < order.length; i++) if (errors[order[i]]) return order[i];
    return null;
  }

  // ---------------------------------------------------------------
  // Navigasi langkah
  // ---------------------------------------------------------------

  function stepErrors(step) {
    return V.validateStep(step, getData(), ruleOpts);
  }

  function next() {
    var errs = stepErrors(state.step);
    showErrors(errs, V.STEP_FIELDS[state.step]);
    var first = firstErrorField(errs, state.step);
    if (first) { focusField(first); return; }

    if (state.returnToReview) {
      var err2 = Object.keys(stepErrors(2)).length;
      goTo(state.step === 1 && err2 ? 2 : 3);
    } else {
      goTo(state.step + 1);
    }
  }

  function goTo(step) {
    if (step < 1 || step > 3) return;
    state.step = step;
    if (step === 3) { state.returnToReview = false; renderReview(); }
    clearStatus();
    renderStep(true);
  }

  function renderStep(moveFocus) {
    steps.forEach(function (s) { s.hidden = Number(s.getAttribute("data-step")) !== state.step; });
    progressItems.forEach(function (li) {
      var n = Number(li.getAttribute("data-progress"));
      li.classList.toggle("is-current", n === state.step);
      li.classList.toggle("is-done", n < state.step);
      if (n === state.step) li.setAttribute("aria-current", "step");
      else li.removeAttribute("aria-current");
    });
    progressCount.textContent = "Langkah " + state.step + " dari 3";

    // Label tombol utama saat kembali dari halaman pemeriksaan.
    Array.prototype.forEach.call(form.querySelectorAll('[data-action="next"]'), function (b) {
      var original = b.getAttribute("data-label") || b.textContent;
      b.setAttribute("data-label", original);
      b.textContent = state.returnToReview ? "Simpan & kembali ke pemeriksaan" : original;
    });

    if (moveFocus) {
      var title = document.getElementById("step" + state.step + "-title");
      document.getElementById("form-card").scrollIntoView({ block: "start", behavior: smooth() });
      if (title) title.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------
  // Ringkasan (langkah 3) — selalu pakai textContent, bukan innerHTML
  // ---------------------------------------------------------------

  function label(map, v) { return (map && map[v]) || v || ""; }

  function renderReview() {
    var d = V.normalize(getData());
    var box = document.getElementById("review");
    box.textContent = "";

    var campus = d.campusType === "other" ? d.campusOther : label(V.OPTIONS.campusType, d.campusType);
    var semester = d.semester === "lainnya" ? "Lainnya: " + d.semesterOther : (d.semester ? "Semester " + d.semester : "");
    var source = d.infoSource === "lainnya" ? "Lainnya: " + d.infoSourceOther : label(V.OPTIONS.infoSource, d.infoSource);
    var ec = "";
    if (d.emergencyName) {
      ec = d.emergencyName;
      if (d.emergencyRelation) ec += " (" + label(V.OPTIONS.emergencyRelation, d.emergencyRelation) + ")";
      if (d.emergencyPhone) ec += "\n" + V.formatPhone(d.emergencyPhone);
    }

    box.appendChild(reviewSection("Data diri", 1, "fullName", [
      ["Nama lengkap", d.fullName],
      ["Nama panggilan", d.nickname],
      ["Nomor WhatsApp", V.formatPhone(d.whatsapp)],
      ["Email", d.email],
      ["Perguruan tinggi", campus],
      ["Fakultas", d.faculty],
      ["Program studi", d.studyProgram],
      ["Semester", semester],
      ["NIM", d.nim],
    ]));
    box.appendChild(reviewSection("Partisipasi & kebutuhan", 2, "motivation", [
      ["Alasan mengikuti MAPABA", d.motivation],
      ["Sumber informasi", source],
      ["Pernah ikut kegiatan PMII", label(V.OPTIONS.pmiiExperience, d.pmiiExperience)],
      ["Kontak darurat", ec],
      ["Alergi/pantangan/kebutuhan aksesibilitas", d.needs],
    ]));
  }

  function reviewSection(title, step, focus, rows) {
    var sec = el("section", "review__section");
    var head = el("div", "review__head");
    var h = el("h3", null, title);
    var btn = el("button", "btn btn--ghost btn--small", "Ubah");
    btn.type = "button";
    btn.setAttribute("data-goto", String(step));
    btn.setAttribute("data-focus", focus);
    btn.setAttribute("aria-label", "Ubah " + title.toLowerCase());
    head.appendChild(h);
    head.appendChild(btn);
    var dl = el("dl", "review__list");
    rows.forEach(function (r) {
      var row = el("div", "review__row");
      row.appendChild(el("dt", null, r[0]));
      var dd = el("dd", r[1] ? null : "is-empty", r[1] || "Tidak diisi");
      row.appendChild(dd);
      dl.appendChild(row);
    });
    sec.appendChild(head);
    sec.appendChild(dl);
    return sec;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  // ---------------------------------------------------------------
  // Pengiriman
  // ---------------------------------------------------------------

  function onSubmit(e) {
    if (e) e.preventDefault();
    if (state.submitting) return;

    // Enter di langkah 1/2 = lanjut, bukan kirim.
    if (state.step < 3) { next(); return; }

    var data = getData();
    for (var s = 1; s <= 2; s++) {
      var errsS = V.validateStep(s, data, ruleOpts);
      if (Object.keys(errsS).length) {
        goTo(s);
        showErrors(errsS, V.STEP_FIELDS[s]);
        focusField(firstErrorField(errsS, s));
        return;
      }
    }
    var errs3 = V.validateStep(3, data, ruleOpts);
    showErrors(errs3, V.STEP_FIELDS[3]);
    var first = firstErrorField(errs3, 3);
    if (first) { focusField(first); return; }

    if (!CONFIG.backendUrl) {
      showStatus("error", "Formulir belum terhubung ke server.",
        ["Data belum bisa dikirim karena alamat server pendaftaran belum diatur oleh panitia. Isianmu tetap tersimpan di halaman ini."],
        { contacts: true });
      return;
    }

    var payload = V.normalize(data);
    payload.submissionId = state.submissionId;
    payload.website = data.website_url || "";
    payload.elapsedMs = Date.now() - state.startedAt;
    payload.clientVersion = CLIENT_VERSION;
    payload.documentationAsked = !!CONFIG.askDocumentationConsent;
    if (!payload.documentationAsked) payload.consentDocumentation = false;

    state.lastAttemptId = state.submissionId;
    saveDraft();
    setSubmitting(true);

    send(payload).then(function (res) {
      setSubmitting(false);
      handleResult(res, payload);
    });
  }

  function setSubmitting(on) {
    state.submitting = on;
    submitBtn.disabled = on;
    submitBtn.setAttribute("aria-disabled", on ? "true" : "false");
    Array.prototype.forEach.call(form.querySelectorAll('[data-action="back"], [data-goto], [data-action="retry"], .consents input, #consentDocumentation'), function (b) {
      b.disabled = on;
    });
    submitBtn.textContent = "";
    if (on) {
      var sp = el("span", "spinner");
      sp.setAttribute("aria-hidden", "true");
      submitBtn.appendChild(sp);
      submitBtn.appendChild(document.createTextNode("Mengirim pendaftaran..."));
      showStatus("info", "Sedang mengirim pendaftaranmu.", ["Mohon tunggu dan jangan tutup halaman ini."]);
    } else {
      submitBtn.textContent = state.lastAttemptId ? "Coba kirim lagi" : "Kirim Pendaftaran";
    }
  }

  function handleResult(res, payload) {
    if (res && res.ok === true && res.status === "success") {
      showSuccess(res, payload);
      return;
    }
    var status = res && res.status;

    if (status === "duplicate") {
      submitBtn.textContent = "Kirim Pendaftaran";
      showStatus("error", "Nomor WhatsApp ini sudah terdaftar.", [
        "Pendaftaran dengan nomor WhatsApp yang sama sudah tercatat sebelumnya, jadi tidak dikirim ulang.",
        "Jika kamu sudah pernah mendaftar, kamu tidak perlu mendaftar lagi. Jika nomornya salah ketik, perbaiki lalu kirim kembali.",
      ], { action: { label: "Ubah nomor WhatsApp", goto: 1, focus: "whatsapp" }, contacts: true });
      return;
    }

    if (status === "validation_error" && res.errors && typeof res.errors === "object") {
      submitBtn.textContent = "Kirim Pendaftaran";
      var target = null;
      [1, 2, 3].forEach(function (s) {
        var fields = V.STEP_FIELDS[s];
        var errs = {};
        fields.forEach(function (f) { if (typeof res.errors[f] === "string") errs[f] = res.errors[f]; });
        if (Object.keys(errs).length && target === null) target = { step: s, errs: errs };
      });
      if (target && target.step < 3) {
        goTo(target.step);
        showErrors(target.errs, V.STEP_FIELDS[target.step]);
        focusField(firstErrorField(target.errs, target.step));
      } else {
        if (target) showErrors(target.errs, V.STEP_FIELDS[3]);
        showStatus("error", "Ada data yang perlu diperbaiki.", ["Periksa kembali isianmu, lalu kirim lagi."]);
      }
      return;
    }

    if (status === "busy") {
      showStatus("warn", "Server sedang sibuk.", [
        "Banyak peserta mendaftar bersamaan. Datamu belum terkirim dan masih tersimpan di halaman ini.",
        "Tunggu sekitar satu menit, lalu tekan “Coba kirim lagi”.",
      ], { retry: true });
      return;
    }

    if (status === "closed") {
      submitBtn.textContent = "Kirim Pendaftaran";
      showStatus("warn", "Pendaftaran sedang ditutup.", [
        "Saat ini panitia tidak menerima pendaftaran baru, jadi datamu belum terkirim. Pantau informasi resmi PMII Komisariat Universitas Trisakti.",
      ], { contacts: true });
      return;
    }

    if (status === "rejected") {
      showStatus("error", "Pendaftaran tidak dapat diproses.", [
        "Muat ulang halaman ini, lalu coba kirim kembali. Isianmu akan dipulihkan otomatis.",
      ], { contacts: true });
      return;
    }

    // Kegagalan jaringan, timeout, error server, atau respons yang tidak dikenali.
    showStatus("error", "Pengiriman belum dapat dikonfirmasi.", [
      "Kami belum menerima konfirmasi bahwa pendaftaranmu tersimpan. Datamu masih ada di halaman ini.",
      "Periksa koneksi internet, lalu tekan “Coba kirim lagi”. Jika ternyata data sebelumnya sudah sempat tersimpan, sistem tidak akan mencatatnya dua kali.",
    ], { retry: true, contacts: true });
  }

  function showSuccess(res, payload) {
    clearDraft();
    state.submissionId = null;
    state.lastAttemptId = null;
    document.getElementById("success-name").textContent = res.name || payload.fullName;
    document.getElementById("success-ref").textContent = res.ref;
    document.getElementById("success-event").textContent = CONFIG.eventName || "MAPABA PMII Trisakti 2026";
    if (CONFIG.eventName) {
      document.getElementById("success-desc").textContent =
        "Terima kasih telah mendaftar " + CONFIG.eventName + ". Data pendaftaranmu sudah diterima oleh panitia. " +
        "Pantau WhatsApp atau email yang kamu cantumkan untuk informasi selanjutnya.";
    }
    if (!CONFIG.requiresVerification) {
      document.getElementById("success-note").textContent = "Simpan atau tangkap layar nomor referensi ini.";
    }
    formArea.hidden = true;
    document.getElementById("config-notice").hidden = true;
    var success = document.getElementById("success");
    success.hidden = false;
    form.reset();
    document.getElementById("form-card").scrollIntoView({ block: "start", behavior: smooth() });
    document.getElementById("success-title").focus({ preventScroll: true });
  }

  function clearStatus() { statusBox.textContent = ""; }

  /**
   * Tampilkan pesan status di atas tombol kirim.
   * kind: info | warn | error. opts: { retry, contacts, action: {label, goto, focus} }
   */
  function showStatus(kind, title, lines, opts) {
    opts = opts || {};
    statusBox.textContent = "";
    var box = el("div", "alert alert--" + kind);
    box.appendChild(el("strong", null, title));
    (lines || []).forEach(function (l) { box.appendChild(el("p", null, l)); });

    if (opts.contacts) {
      var contacts = validContacts();
      if (contacts.length) {
        box.appendChild(el("p", null, "Butuh bantuan? Hubungi panitia:"));
        var ul = el("ul");
        contacts.forEach(function (c) {
          var li = el("li");
          var a = el("a", null, c.text);
          a.href = c.href;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          li.appendChild(a);
          ul.appendChild(li);
        });
        box.appendChild(ul);
      }
    }
    if (opts.action) {
      var ab = el("button", "btn btn--ghost btn--small", opts.action.label);
      ab.type = "button";
      ab.setAttribute("data-goto", String(opts.action.goto));
      if (opts.action.focus) ab.setAttribute("data-focus", opts.action.focus);
      box.appendChild(ab);
    }
    statusBox.appendChild(box);
    if (kind !== "info") box.scrollIntoView({ block: "nearest", behavior: smooth() });
  }

  function validContacts() {
    var list = Array.isArray(CONFIG.contacts) ? CONFIG.contacts : [];
    var out = [];
    list.forEach(function (c) {
      if (!c || !c.label) return;
      var wa = c.whatsapp ? V.normalizePhone(c.whatsapp) : "";
      if (wa) out.push({ text: c.label + " — " + V.formatPhone(wa), href: "https://wa.me/" + wa });
      else if (c.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) {
        out.push({ text: c.label + " — " + c.email, href: "mailto:" + c.email });
      }
    });
    return out;
  }

  function copyRef() {
    var ref = document.getElementById("success-ref").textContent;
    var btn = document.getElementById("copy-ref");
    var done = function () {
      btn.textContent = "Tersalin";
      setTimeout(function () { btn.textContent = "Salin"; }, 2000);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(ref).then(done, function () {});
    }
  }

  // ---------------------------------------------------------------
  // Transport ke Google Apps Script
  //
  // 1) fetch POST dengan Content-Type text/plain: termasuk "simple request"
  //    sehingga tidak memicu preflight CORS. Apps Script membalas 302 ke
  //    script.googleusercontent.com yang mengizinkan CORS, sehingga JSON
  //    balasan bisa dibaca dan diperiksa. TIDAK memakai mode "no-cors".
  // 2) Jika fetch gagal di level jaringan/CORS/timeout, kirim ulang via form
  //    POST ke iframe tersembunyi. Apps Script membalas halaman HtmlService
  //    yang memanggil postMessage; origin, sumber, dan nonce divalidasi.
  //
  // Kedua jalur memakai submissionId yang sama. Server menyimpan ID ini dan
  // mengembalikan hasil yang sama jika ID sudah pernah tersimpan, sehingga
  // percobaan ulang tidak membuat baris ganda.
  // ---------------------------------------------------------------

  function send(payload) {
    return sendFetch(payload).catch(function () {
      return sendIframe(payload);
    }).then(function (res) {
      return isValidResponse(res, payload) ? res : { ok: false, status: "invalid_response" };
    }, function () {
      return { ok: false, status: "network_error" };
    });
  }

  function isValidResponse(res, payload) {
    if (!res || typeof res !== "object" || typeof res.ok !== "boolean" || typeof res.status !== "string") return false;
    if (res.ok) {
      // Sukses hanya diterima bila server menyertakan nomor referensi dan
      // mengonfirmasi ID pengiriman yang sama.
      return res.status === "success" &&
        typeof res.ref === "string" && /^[A-Z0-9-]{6,40}$/.test(res.ref) &&
        res.submissionId === payload.submissionId;
    }
    return true;
  }

  function sendFetch(payload) {
    if (!window.fetch) return Promise.reject(new Error("fetch tidak tersedia"));
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, CONFIG.requestTimeoutMs || 25000);
    return fetch(CONFIG.backendUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      credentials: "omit",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      return JSON.parse(text); // halaman error/login Google bukan JSON -> lempar error
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function sendIframe(payload) {
    return new Promise(function (resolve, reject) {
      var nonce = newId();
      var name = "mapaba-gas-" + nonce;
      var iframe = document.createElement("iframe");
      iframe.name = name;
      iframe.className = "hp";
      iframe.setAttribute("aria-hidden", "true");
      iframe.tabIndex = -1;
      iframe.title = "Pengiriman pendaftaran";

      var f = document.createElement("form");
      f.method = "POST";
      f.action = CONFIG.backendUrl;
      f.target = name;
      f.className = "hp";
      f.setAttribute("aria-hidden", "true");
      [["payload", JSON.stringify(payload)], ["transport", "iframe"], ["nonce", nonce], ["origin", location.origin]]
        .forEach(function (kv) {
          var i = document.createElement("input");
          i.type = "hidden";
          i.name = kv[0];
          i.value = kv[1];
          f.appendChild(i);
        });

      var finished = false;
      var timer = setTimeout(function () { finish(null, new Error("timeout")); }, (CONFIG.requestTimeoutMs || 25000) + 5000);

      function fromOurIframe(src) {
        // HtmlService merender halaman di iframe bersarang; telusuri ke atas
        // hingga menemukan iframe yang kita buat.
        var w = src;
        for (var i = 0; i < 5 && w; i++) {
          if (w === iframe.contentWindow) return true;
          if (w === w.parent) break;
          w = w.parent;
        }
        return false;
      }

      function onMessage(ev) {
        if (!GAS_ORIGIN_RE.test(ev.origin)) return;
        if (!fromOurIframe(ev.source)) return;
        var data;
        try { data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data; } catch (e) { return; }
        if (!data || data.type !== "mapaba-registration-result" || data.nonce !== nonce) return;
        finish(data.result, null);
      }

      function finish(result, err) {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        setTimeout(function () { iframe.remove(); f.remove(); }, 0);
        if (err) reject(err); else resolve(result);
      }

      window.addEventListener("message", onMessage);
      document.body.appendChild(iframe);
      document.body.appendChild(f);
      f.submit();
    });
  }

  init();
})();
