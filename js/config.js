/*
 * Konfigurasi terpusat halaman pendaftaran MAPABA.
 *
 * Ubah nilai di sini saja ketika panitia memperbarui informasi.
 * File ini PUBLIK (ikut ter-deploy ke GitHub Pages). Jangan pernah menaruh
 * password, token, ID spreadsheet, atau kredensial apa pun di sini.
 */
window.MAPABA_CONFIG = {
  // --- Informasi acara (sesuai proposal) ---
  // Nomor angkatan (XXV/XXVI) sengaja tidak ditampilkan sampai panitia
  // mengonfirmasi versi final.
  eventName: "MAPABA PMII Trisakti 2026",
  eventLongName: "Masa Penerimaan Anggota Baru (MAPABA) PMII Komisariat Trisakti",
  pageTitle: "Pendaftaran MAPABA PMII Trisakti 2026",
  theme:
    "Rekonstruksi Gerakan: Meneguhkan Trilogi PMII & Trisakti sebagai Manifestasi Identitas Kader Progresif-Transformatif",
  dateText: "6–9 November 2026",
  locationText: "Bogor",
  organizer: "PMII Komisariat Universitas Trisakti",

  // Logo & gambar header dipasang langsung di index.html (folder assets/).

  // --- Backend (URL Web App Google Apps Script, berakhiran /exec) ---
  // URL ini memang publik; keamanan data ada di sisi Apps Script & Sheets.
  backendUrl: "https://script.google.com/macros/s/AKfycbxdnI9qWRhNpcS_prcIOLrRl1hKpF5m6KJrDeKRi8Bz_fqCJFx9T4NdWXc6bnlJtUd5/exec",

  // --- Kontak panitia ---
  // Tampil di halaman sukses (tombol chat WhatsApp) dan saat pengiriman gagal.
  // Kosongkan jika belum ada narahubung yang valid.
  contacts: [
    { label: "Sahabat Izzan", whatsapp: "+62 895-2978-8070" },
    { label: "Sahabat Alghifari", whatsapp: "+62 896-1361-7474" },
  ],

  // --- Aturan form ---
  // HARUS sama dengan Script Property REQUIRE_EMERGENCY_CONTACT di Apps Script.
  // true  = kontak darurat wajib (kegiatan menginap, perlu persetujuan panitia).
  // false = kontak darurat opsional.
  requireEmergencyContact: true,

  // Tampilkan persetujuan dokumentasi foto/video sebagai pilihan TERPISAH
  // (tidak wajib, tidak memengaruhi pendaftaran).
  askDocumentationConsent: false,

  // Tampilkan keterangan "menunggu verifikasi panitia" setelah berhasil.
  requiresVerification: true,

  // Batas waktu (ms) menunggu jawaban server per percobaan.
  requestTimeoutMs: 25000,
};
