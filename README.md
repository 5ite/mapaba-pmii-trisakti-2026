# Pendaftaran MAPABA PMII Trisakti 2026

Form pendaftaran Masa Penerimaan Anggota Baru (MAPABA) PMII Komisariat Universitas Trisakti.

- **Frontend:** HTML, CSS, dan JavaScript murni (tanpa framework, tanpa proses build), di-hosting di **GitHub Pages**.
- **Backend:** **Google Apps Script** (web app) yang memvalidasi data lalu menyimpannya ke **Google Sheets**.

Peserta mengisi form dalam 3 langkah (Data diri, Tentang kamu, lalu Periksa & kirim). Halaman baru menyatakan pendaftaran **berhasil** setelah Apps Script mengonfirmasi bahwa baris data sudah tertulis di spreadsheet dan mengirim balik nomor referensi. Nomor referensi hanya dicatat di sheet untuk panitia; peserta melihat kartu tanda pendaftaran berisi nama, kegiatan, tanggal, lokasi, status verifikasi, dan kontak panitia.

---

## Daftar isi

1. [Struktur file](#struktur-file)
2. [Konfigurasi yang perlu diisi](#konfigurasi-yang-perlu-diisi)
3. [Gambar & logo](#gambar--logo)
4. [Panduan deployment langkah demi langkah](#panduan-deployment-langkah-demi-langkah)
5. [Cara kerja pengiriman (CORS & Apps Script)](#cara-kerja-pengiriman-cors--apps-script)
6. [Struktur Google Sheets](#struktur-google-sheets)
7. [Keamanan, privasi, dan batasannya](#keamanan-privasi-dan-batasannya)
8. [Pengujian](#pengujian)
9. [Menangani masalah](#menangani-masalah)
10. [Keputusan yang masih menunggu panitia](#keputusan-yang-masih-menunggu-panitia)

---

## Struktur file

```
/
├── index.html            Halaman pendaftaran (satu-satunya halaman)
├── css/style.css         Seluruh gaya, mobile-first
├── js/
│   ├── config.js         ← KONFIGURASI ACARA & URL BACKEND (publik)
│   ├── validation.js     Aturan validasi & normalisasi (dipakai juga oleh tes)
│   └── app.js            Logika langkah form, ringkasan, dan pengiriman
├── assets/
│   ├── logo/             Logo PMII & PMII Trisakti (+ favicon) — versi .webp yang dipakai halaman
│   └── images/           Wordmark MAPABA & ilustrasi maskot — versi .webp yang dipakai halaman
├── gas/
│   ├── Code.gs           Backend Google Apps Script
│   └── appsscript.json   Manifest Apps Script (zona waktu, izin, akses web app)
├── tests/                Tes otomatis (Node.js), tidak ikut dipakai di halaman
├── package.json          Hanya untuk menjalankan tes; situs tidak butuh npm
├── .nojekyll             Agar GitHub Pages menyajikan file apa adanya
└── README.md
```

Folder `gas/` dan `tests/` ikut ada di repository, tetapi tidak berisi rahasia apa pun. ID spreadsheet dan pengaturan backend disimpan di **Script Properties** Apps Script, bukan di GitHub.

---

## Konfigurasi yang perlu diisi

### Frontend: `js/config.js`

| Kunci | Isi | Catatan |
|---|---|---|
| `backendUrl` | URL web app Apps Script (berakhiran `/exec`) | **Wajib.** Selama kosong, halaman menampilkan peringatan dan tidak bisa mengirim data. |
| `contacts` | `[{ label: "Sahabat Izzan", whatsapp: "+62 895-2978-8070" }, ...]` | Tampil di halaman sukses (tombol **Chat** ke WhatsApp dengan pesan pembuka berisi nama peserta) dan saat pengiriman gagal. Saat ini: Sahabat Izzan & Sahabat Alghifari. |
| `requireEmergencyContact` | `true` / `false` | **Harus sama** dengan Script Property `REQUIRE_EMERGENCY_CONTACT`. |
| `askDocumentationConsent` | `true` / `false` | Menampilkan persetujuan foto/video sebagai pilihan terpisah yang tidak wajib. |
| `requiresVerification` | `true` / `false` | Menampilkan status "Menunggu verifikasi panitia" setelah berhasil. |
| `eventName`, `theme`, `dateText`, `locationText`, `organizer` | Teks acara | Diambil dari proposal. Nomor angkatan sengaja tidak ditampilkan. |

> `config.js` bersifat **publik**. Jangan pernah menaruh password, token, ID spreadsheet, atau kredensial Google di file ini. URL `/exec` memang boleh publik karena peserta harus bisa mengaksesnya.

### Backend: Script Properties (Apps Script → ⚙️ Project Settings → Script Properties)

| Properti | Default | Fungsi |
|---|---|---|
| `SPREADSHEET_ID` | *(kosong)* | Hanya perlu diisi jika script **tidak** dibuat dari dalam spreadsheet (lihat langkah 2). |
| `REQUIRE_EMERGENCY_CONTACT` | `true` | Kontak darurat wajib atau tidak. Samakan dengan `config.js`. |
| `REGISTRATION_OPEN` | `true` | Ubah ke `false` untuk menutup pendaftaran tanpa deploy ulang. |
| `REF_PREFIX` | `MPB26` | Awalan nomor referensi (huruf besar/angka, 2–12 karakter). |
| `MAX_PER_MINUTE` | `40` | Batas total pendaftaran per menit (rem darurat jika dibanjiri spam). |
| `MIN_FILL_MS` | `3000` | Pengiriman yang lebih cepat dari ini (ms sejak mulai mengisi) dianggap bot. |
| `ALLOWED_ORIGINS` | *(kosong)* | Origin frontend, dipisah koma. Contoh: `https://namaakun.github.io,http://localhost:8080`. |
| `REF_COUNTER` | *(otomatis)* | Penghitung nomor referensi. **Jangan diubah** setelah pendaftaran dibuka. |

Fungsi `setup()` mengisi nilai default ini secara otomatis.

---

## Gambar & logo

Halaman memakai versi **WebP yang sudah dikecilkan** agar cepat dibuka di HP (total ±95 KB di layar HP), bukan file asli berukuran besar:

| Dipakai halaman | Dibuat dari | Keterangan |
|---|---|---|
| `assets/logo/pmii.webp`, `assets/logo/pmii-trisakti.webp` | `logopmii.png`, `pmii-trisakti.png` | Logo di kiri atas header |
| `assets/logo/favicon.png` | `pmii-trisakti.png` | Ikon tab browser |
| `assets/images/mapaba-wordmark-600.webp` / `-1000.webp` | `Mapaba Vintage Arching Wordmark.png` | Judul "MAPABA" (teks alternatif `MAPABA` untuk pembaca layar) |
| `assets/images/mapaba-crew-640.webp` / `-1100.webp` | `Blue Blazer Animal Crew.png` | Ilustrasi maskot, dekoratif |

Catatan: file asli `Blue Blazer Animal Crew.png` tidak punya transparansi sungguhan, karena pola kotak-kotak abu-putihnya ikut tersimpan sebagai gambar. Latar itu sudah dihapus pada versi `.webp`. Jika panitia punya versi PNG yang benar-benar transparan, atau ingin mengganti gambar, buat ulang file `.webp` dengan nama yang sama (lebar 640 & 1100 px untuk maskot, 600 & 1000 px untuk wordmark). Tidak perlu mengubah kode.

File asli tetap disimpan di repository sebagai sumber, tetapi tidak dimuat oleh halaman.

---

## Panduan deployment langkah demi langkah

### 1. Buat Google Spreadsheet

1. Buka <https://sheets.google.com> dengan **akun Google milik panitia** (sebaiknya akun organisasi, bukan akun pribadi yang bisa hilang aksesnya).
2. Buat spreadsheet kosong, beri nama misalnya `Pendaftar MAPABA 2026`.
3. **Jangan** ubah pengaturan berbagi menjadi "Siapa saja yang memiliki link". Bagikan hanya ke email panitia yang berwenang (tombol *Share* → masukkan email → *Viewer* atau *Editor* sesuai kebutuhan).

### 2. Buat proyek Google Apps Script

Cara yang disarankan karena paling sederhana dan tidak perlu ID spreadsheet:

1. Di spreadsheet tadi, buka menu **Extensions → Apps Script**.
2. Proyek Apps Script baru terbuka dan otomatis terikat (*bound*) ke spreadsheet ini.
3. Ganti nama proyek, misalnya `Backend MAPABA 2026`.

<details>
<summary>Alternatif: proyek Apps Script terpisah (standalone)</summary>

Buat proyek di <https://script.google.com>, lalu isi Script Property `SPREADSHEET_ID` (langkah 3). ID ada di URL spreadsheet: `https://docs.google.com/spreadsheets/d/`**`INI_ID_NYA`**`/edit`.
</details>

### 3. Atur ID spreadsheet secara aman

- **Jika memakai cara bound (Extensions → Apps Script):** tidak perlu apa-apa. Script otomatis memakai spreadsheet induknya.
- **Jika standalone:** buka ⚙️ **Project Settings → Script Properties → Add script property**, isi `SPREADSHEET_ID` dengan ID spreadsheet.

ID spreadsheet **tidak boleh** ditaruh di `js/config.js` atau di file mana pun di GitHub. ID saja memang tidak memberi akses, tetapi tidak ada alasan untuk menyebarkannya.

### 4. Pasang `Code.gs` dan jalankan `setup()`

1. Di editor Apps Script, buka file `Code.gs` bawaan, hapus seluruh isinya, lalu tempelkan isi [`gas/Code.gs`](gas/Code.gs) dari repository ini. Simpan dengan `Ctrl+S`.
2. *(Disarankan)* Pasang manifest: ⚙️ **Project Settings** → centang **Show "appsscript.json" manifest file in editor**. Kembali ke **Editor**, buka `appsscript.json`, lalu ganti isinya dengan [`gas/appsscript.json`](gas/appsscript.json). Manifest ini mengatur zona waktu `Asia/Jakarta`, runtime V8, dan izin minimum (hanya Spreadsheet).
3. Di toolbar, pilih fungsi **`setup`** lalu klik **Run**.
4. Google akan meminta izin. Klik **Review permissions**, pilih akun panitia, lalu **Allow**. Jika muncul peringatan "Google hasn't verified this app", klik **Advanced → Go to (nama proyek) (unsafe)**. Ini normal untuk script buatan sendiri.
5. Periksa spreadsheet: sekarang ada sheet **Pendaftar** dengan header berwarna navy, baris header dibekukan, dan dropdown pada kolom *Status pendaftaran*.
6. Periksa ⚙️ **Script Properties**: nilai default sudah terisi. Sesuaikan jika perlu.

`setup()` aman dijalankan ulang karena tidak pernah menghapus data. Jika header sheet berbeda dan sheet sudah berisi data, fungsi ini berhenti dengan pesan error agar kolom tidak tertukar.

### 5. Deploy sebagai web app dan atur izin aksesnya

1. Klik **Deploy → New deployment**.
2. Klik ikon ⚙️ di samping *Select type*, lalu pilih **Web app**.
3. Isi:
   - **Description:** `v1`
   - **Execute as:** **Me** (akun panitia)
   - **Who has access:** **Anyone**
4. Klik **Deploy** dan salin **Web app URL** (bentuknya `https://script.google.com/macros/s/AKfy.../exec`).

**Mengapa pengaturan ini dipakai, dan apa konsekuensinya:**

- **"Anyone"** (bukan *"Anyone with Google account"*) diperlukan agar peserta bisa mendaftar **tanpa login Google**. Pilihan *"Anyone with Google account"* akan memaksa login dan mengalihkan ke halaman login, sehingga pengiriman dari GitHub Pages gagal.
- **"Execute as: Me"** membuat script berjalan dengan izin akun panitia, sehingga bisa menulis ke spreadsheet tanpa peserta punya akses ke spreadsheet itu.
- **Konsekuensinya:** siapa pun yang mengetahui URL `/exec` dapat mengirim permintaan POST ke script, termasuk bot. Karena itu script selalu memvalidasi ulang semua data, punya honeypot, jebakan waktu, batas per menit, dan cek duplikat. Script **hanya menambah baris** dan **tidak pernah mengembalikan data pendaftar**: `doGet` hanya menjawab status layanan, dan pesan duplikat tidak membocorkan data orang lain. Spreadsheet sendiri tetap privat.
- Akses ke spreadsheet tetap hanya untuk orang yang dibagikan secara eksplisit. Web app tidak membuka akses baca ke sheet.

### 6. Isi URL backend di frontend

Buka `js/config.js` dan isi:

```js
backendUrl: "https://script.google.com/macros/s/AKfy.../exec",
```

Lalu isi juga Script Property `ALLOWED_ORIGINS` dengan origin GitHub Pages, misalnya `https://namaakun.github.io` (tanpa path dan tanpa garis miring di akhir). Tambahkan `http://localhost:8080` selama masih menguji di komputer sendiri.

### 7. Menguji pengiriman

**a. Cek endpoint hidup.** Buka URL `/exec` di browser. Harus muncul:

```json
{"ok":true,"status":"alive","service":"mapaba-registration"}
```

**b. Cek penolakan data kosong** (opsional, butuh `curl`):

```bash
curl -L -H "Content-Type: text/plain" -d "{}" "https://script.google.com/macros/s/AKfy.../exec"
# -> {"ok":false,"status":"rejected",...}  dan tidak ada baris baru di sheet
```

**c. Dari localhost.** Jangan membuka `index.html` dengan klik dua kali (`file://`), karena origin-nya `null` dan jalur cadangan iframe tidak akan berfungsi. Jalankan server lokal:

```bash
npm run serve          # atau: node tests/serve.js
# buka http://localhost:8080
```

Isi form, lalu kirim. Pastikan halaman sukses muncul dan baris baru tercatat di sheet dengan nama yang sama.

**d. Dari GitHub Pages (wajib).** Perilaku CORS dan redirect di domain asli bisa berbeda dari localhost, jadi ulangi uji kirim dari URL GitHub Pages yang sebenarnya, **di HP dan di laptop**, setidaknya dengan Chrome Android dan Safari iOS.

### 8. Aktifkan GitHub Pages

1. Buat repository di GitHub, lalu push isi folder ini:
   ```bash
   git add .
   git commit -m "Form pendaftaran MAPABA 2026"
   git remote add origin https://github.com/NAMA_AKUN/NAMA_REPO.git
   git push -u origin main
   ```
2. Di GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pilih branch **`main`** dan folder **`/ (root)`**, lalu klik **Save**.
3. Tunggu 1–2 menit. Situs tersedia di `https://NAMA_AKUN.github.io/NAMA_REPO/`.
4. Pastikan origin `https://NAMA_AKUN.github.io` sudah ada di `ALLOWED_ORIGINS` (langkah 6).

### 9. Memeriksa data yang masuk

- Buka sheet **Pendaftar**. Setiap pendaftaran tercatat di satu baris dengan status awal **Menunggu verifikasi**.
- Ubah status lewat dropdown (*Terverifikasi*, *Perlu dihubungi*, *Ditolak*, *Batal*) setelah panitia memverifikasi.
- Gunakan **Data → Create a filter** untuk menyaring per fakultas, status, dan sebagainya.
- Kolom *Nomor WhatsApp* berformat `628xxxxxxxxxx`, sehingga bisa langsung dipakai di `https://wa.me/628xxxxxxxxxx`.
- Jangan menyisipkan kolom baru **di antara** kolom yang ada (script menulis berdasarkan urutan kolom). Kolom catatan panitia boleh ditambahkan **di sebelah kanan** kolom terakhir.

### 10. Mengubah kode Apps Script setelah deploy

Setiap perubahan `Code.gs` **tidak otomatis aktif** di URL `/exec`. Untuk menerapkannya:

1. **Deploy → Manage deployments** → pilih deployment yang aktif → ikon ✏️ **Edit**.
2. Pada **Version**, pilih **New version**, lalu klik **Deploy**.
3. URL `/exec` **tetap sama**, jadi `config.js` tidak perlu diubah.

> ⚠️ Jangan memakai **New deployment** untuk pembaruan, karena itu membuat URL baru dan frontend yang lama tetap mengirim ke versi lama. Jika terpaksa memakai URL baru, perbarui `backendUrl` dan push ulang.

Mengubah **Script Properties** langsung berlaku tanpa deploy ulang.

---

## Cara kerja pengiriman (CORS & Apps Script)

GitHub Pages (`*.github.io`) dan Apps Script (`script.google.com`) berbeda origin. Apps Script tidak bisa mengatur header CORS sendiri, dan setiap respons `/exec` dialihkan (302) ke `script.googleusercontent.com`. Karena itu:

1. **Jalur utama: `fetch` POST dengan `Content-Type: text/plain`.** Tipe ini termasuk *simple request*, jadi browser **tidak** mengirim preflight `OPTIONS` (yang tidak didukung Apps Script). Browser mengikuti redirect ke `script.googleusercontent.com`, yang membalas dengan `Access-Control-Allow-Origin: *`, sehingga JSON balasan **bisa dibaca dan diperiksa**. Mode `no-cors` **tidak** dipakai.
2. **Jalur cadangan: form POST ke iframe tersembunyi + `postMessage`.** Jika `fetch` gagal di level jaringan/CORS/timeout, data dikirim ulang lewat form tersembunyi. Apps Script membalas halaman HtmlService yang memanggil `window.top.postMessage(...)` **setelah** data tersimpan. Frontend hanya menerima pesan yang:
   - berasal dari origin `https://*-script.googleusercontent.com`,
   - dikirim dari dalam iframe yang dibuat frontend itu sendiri,
   - membawa `nonce` acak yang cocok dengan permintaan.
3. **Sukses hanya diakui** jika balasan berisi `status: "success"`, nomor referensi berformat benar, dan `submissionId` yang sama dengan yang dikirim. Selain itu, halaman menampilkan "Pengiriman belum dapat dikonfirmasi" dan data tetap dipertahankan.
4. **Idempoten.** Setiap pengisian punya `submissionId` (UUID) yang tersimpan di sheet. Jika peserta menekan "Coba kirim lagi" atau jalur cadangan mengirim ulang data yang sebenarnya sudah tersimpan, server mengembalikan nomor referensi yang **sama** tanpa menambah baris. Jika peserta mengubah isian setelah percobaan gagal, ID baru dibuat, dan jika data lama ternyata sudah tersimpan, cek duplikat nomor WhatsApp yang akan menangkapnya.
5. Di server, penulisan dilakukan di dalam `LockService` (mencegah tabrakan saat banyak peserta mengirim bersamaan), diikuti `SpreadsheetApp.flush()`, lalu baris dibaca ulang untuk verifikasi sebelum membalas sukses.

Jika backend dipindah ke layanan lain, perbarui juga **Content-Security-Policy** di `<head>` `index.html` (`connect-src`, `frame-src`, `form-action`).

---

## Struktur Google Sheets

Sheet **Pendaftar**, satu baris per pendaftaran:

| # | Kolom | Contoh / format |
|---|---|---|
| 1 | Timestamp | `14/10/2026 10:15:02` (WIB, dibuat server) |
| 2 | Nomor referensi | `MPB26-0001-K7Q` (dibuat server) |
| 3 | Status pendaftaran | `Menunggu verifikasi` (dropdown) |
| 4 | Nama lengkap | |
| 5 | Nama panggilan | |
| 6 | Nomor WhatsApp | `6281234567890` (teks) |
| 7 | Email | huruf kecil, boleh kosong |
| 8 | Perguruan tinggi | `Universitas Trisakti` atau nama kampus lain |
| 9 | Fakultas | |
| 10 | Program studi | |
| 11 | Semester | `3` atau `Lainnya: ...` |
| 12 | NIM | teks, boleh kosong |
| 13 | Alasan mengikuti MAPABA | boleh kosong |
| 14 | Sumber informasi | `Instagram`, `Lainnya: ...`, dst. |
| 15 | Pengalaman kegiatan PMII sebelumnya | `Pernah` / `Belum pernah` |
| 16 | Nama kontak darurat | |
| 17 | Hubungan kontak darurat | `Orang tua`, `Keluarga`, `Teman`, `Lainnya` |
| 18 | Nomor kontak darurat | `628...` (teks) |
| 19 | Kebutuhan kegiatan (alergi/pantangan/aksesibilitas) | boleh kosong |
| 20 | Status persetujuan | `Menyetujui 3 pernyataan (...)` |
| 21 | Persetujuan dokumentasi | `Bersedia` / `Tidak bersedia` / `Tidak ditanyakan` |
| 22 | ID pengiriman (sistem) | UUID untuk mencegah data ganda. Jangan diubah. |

Kolom 21–22 adalah tambahan dari daftar di brief: persetujuan dokumentasi harus terpisah dari persetujuan data, dan ID pengiriman dibutuhkan agar percobaan ulang tidak menggandakan data.

---

## Keamanan, privasi, dan batasannya

**Yang sudah diterapkan:**

- Validasi di frontend **dan** validasi ulang penuh di server (format, opsi yang sah, batas panjang setiap field). Tes otomatis memastikan aturan keduanya sama.
- Normalisasi: spasi dirapikan, karakter kontrol dibuang, nomor HP diseragamkan ke `62...`, email dibuat huruf kecil.
- Pencegahan *formula injection*: teks yang diawali `=`, `+`, `-`, atau `@` disimpan sebagai teks biasa, bukan formula.
- Semua data yang ditampilkan ulang (ringkasan, halaman sukses) memakai `textContent`, tidak pernah `innerHTML`.
- Honeypot tersembunyi, jebakan waktu pengisian minimum, dan batas total pendaftaran per menit.
- Cek duplikat berdasarkan nomor WhatsApp. Data lama tidak pernah ditimpa atau dihapus.
- Pesan error ke peserta tidak memuat detail teknis. Detail hanya dicatat di log Apps Script (*Executions*), tanpa data pribadi.
- Tidak ada endpoint yang mengembalikan data pendaftar. Nomor referensi bukan kunci akses ke data apa pun.
- Content-Security-Policy membatasi skrip, gaya, dan tujuan koneksi.
- Draft isian disimpan di `sessionStorage` (hilang saat tab ditutup, lebih aman di perangkat bersama) dan dihapus setelah berhasil.
- Kebutuhan kesehatan hanya ditanyakan sebatas alergi, pantangan, atau aksesibilitas, bersifat opsional, dan disertai penjelasan.

**Batasan yang masih ada (wajib dipahami panitia):**

- URL `/exec` **publik**. Bot yang menulis permintaan sendiri bisa melewati honeypot dan jebakan waktu. Batas per menit hanya mengurangi banjir data, tidak mencegahnya, dan saat batas tercapai peserta asli juga diminta menunggu.
- Apps Script tidak memberi akses ke IP pengirim, jadi tidak ada pembatasan per orang. `ALLOWED_ORIGINS` hanya berlaku di jalur iframe; permintaan `fetch` atau `curl` tidak bisa dibatasi per origin.
- Cek duplikat hanya berdasarkan nomor WhatsApp. Satu orang dengan dua nomor tetap bisa mendaftar dua kali.
- Tidak ada CAPTCHA. Jika spam benar-benar terjadi, pertimbangkan menambah verifikasi (misalnya Cloudflare Turnstile) dengan validasi token di server.
- **Pantau** sheet dan menu *Executions* di Apps Script secara berkala selama pendaftaran dibuka. Hapus baris spam secara manual dan, jika perlu, tutup sementara dengan `REGISTRATION_OPEN=false`.
- Keamanan data pada akhirnya bergantung pada **pengaturan berbagi spreadsheet**. Batasi akses ke panitia yang perlu, aktifkan verifikasi 2 langkah di akun pemilik, dan hapus atau arsipkan data setelah kegiatan selesai sesuai kebijakan organisasi.

---

## Pengujian

### Tes otomatis

Membutuhkan Node.js 18+ (tes E2E butuh Node 22+ dan Chrome/Edge). Tidak ada dependensi npm.

```bash
npm test                  # 27 tes unit: validasi, backend (Code.gs asli + mock Sheets), paritas aturan
node tests/e2e.js         # 13 skenario di Chrome headless dengan mock Apps Script
SHOTS=hasil node tests/e2e.js   # sekaligus menyimpan screenshot 360px, tablet, desktop
```

`tests/serve.js --mock` menjalankan `gas/Code.gs` yang asli di Node dan meniru perilaku Apps Script (POST → 302 ke origin lain yang mengizinkan CORS), sehingga alur `fetch` bisa diuji ujung ke ujung. **Mock ini tidak menggantikan uji pada Apps Script & GitHub Pages yang sebenarnya.**

Yang dicakup tes E2E: navigasi maju/mundur tanpa kehilangan data, error muncul dan fokus berpindah ke field pertama yang salah, penyaringan karakter nomor, field kondisional, draft bertahan saat halaman dimuat ulang, tombol "Ubah" di ringkasan, ringkasan aman dari HTML, persetujuan wajib, status "Mengirim pendaftaran..." dengan tombol nonaktif, sukses hanya setelah server menyimpan (nomor referensi tercatat di sheet tetapi tidak ditampilkan), kartu sukses & kontak panitia tidak keluar dari layar di 320/360/414px, penolakan duplikat tanpa mengosongkan form, gangguan setelah data tersimpan lalu "Coba kirim lagi" tanpa baris ganda, tidak ada scroll horizontal di 360px/768px/1366px, serta perilaku saat `backendUrl` kosong.

### Daftar uji manual (lakukan setelah deploy sungguhan)

- [ ] URL `/exec` di browser menampilkan `{"ok":true,"status":"alive",...}`.
- [ ] Halaman GitHub Pages terbuka di HP (Chrome Android & Safari iOS) dan laptop.
- [ ] Tidak ada peringatan "Formulir belum terhubung ke server".
- [ ] Logo resmi tampil (jika sudah diisi).
- [ ] Lanjut dengan form kosong → pesan error jelas di dekat field.
- [ ] Nomor `0812-3456-7890`, `+62 812 3456 7890`, dan `81234567890` diterima; `021...` dan `12345` ditolak.
- [ ] Kembali dari langkah 2 ke langkah 1 → isian tetap ada.
- [ ] Tombol "Ubah" di ringkasan membuka langkah yang benar, lalu kembali ke pemeriksaan.
- [ ] Kirim → tombol berubah menjadi "Mengirim pendaftaran..." dan tidak bisa ditekan dua kali.
- [ ] Halaman sukses menampilkan kartu berisi nama, kegiatan, tanggal, lokasi, dan cap "Menunggu verifikasi", serta dua kontak panitia.
- [ ] Tombol "Chat" membuka WhatsApp ke nomor panitia yang benar dengan pesan pembuka berisi nama peserta.
- [ ] Baris baru muncul di sheet dengan nomor referensi; nomor WA tidak berubah menjadi angka ilmiah.
- [ ] Mendaftar ulang dengan nomor WA yang sama → pesan "sudah terdaftar", tidak ada baris baru.
- [ ] Mode pesawat saat menekan Kirim → pesan "belum dapat dikonfirmasi", data tetap ada. Nyalakan internet lagi, tekan "Coba kirim lagi" → berhasil, hanya satu baris.
- [ ] `REGISTRATION_OPEN=false` → pesan "Pendaftaran sedang ditutup". Kembalikan ke `true`.
- [ ] Buka link spreadsheet di jendela penyamaran (tanpa login) → **akses ditolak**.
- [ ] Navigasi seluruh form hanya dengan keyboard (Tab, Shift+Tab, Spasi, Enter).
- [ ] Hapus baris uji dari sheet sebelum pendaftaran dibuka. `REF_COUNTER` boleh dibiarkan (nomor berlanjut) atau dihapus dari Script Properties agar mulai dari 1 lagi, **hanya jika sheet sudah kosong**.

### Belum bisa diuji di lingkungan pengembangan

Bagian berikut membutuhkan akun Google dan deployment milik panitia, jadi **belum diuji**:

- Deploy Apps Script sungguhan, layar izin, dan perilaku redirect/CORS `script.google.com` yang asli.
- Jalur cadangan iframe + `postMessage` dengan HtmlService yang asli (kode server dan validasi pesan sudah dites di level unit, tetapi belum di Google).
- `LockService`, `CacheService`, dan format sel Google Sheets yang asli (diuji dengan mock).
- GitHub Pages di domain asli dan perangkat HP fisik (layout sudah diuji di Chrome headless dengan emulasi 360px).

---

## Menangani masalah

| Gejala | Kemungkinan penyebab & solusi |
|---|---|
| Selalu "Pengiriman belum dapat dikonfirmasi" | `backendUrl` salah (harus berakhiran `/exec`, bukan `/dev`), akses web app bukan **Anyone**, atau perubahan kode belum di-deploy sebagai *New version*. Buka URL `/exec` di browser jendela penyamaran; harus muncul JSON `alive` tanpa diminta login. |
| Muncul halaman login Google saat membuka `/exec` | *Who has access* masih *Only myself* / *Anyone with Google account*. Ubah ke **Anyone** dan deploy ulang. |
| "Pendaftaran tidak dapat diproses" | Honeypot terisi (biasanya karena ekstensi autofill), pengiriman terlalu cepat, atau origin tidak ada di `ALLOWED_ORIGINS`. Periksa *Executions* di Apps Script. |
| Peserta mengaku sudah daftar tapi ditolak "sudah terdaftar" | Cari nomornya di kolom *Nomor WhatsApp* (format `628...`). Jika pendaftaran lama adalah kesalahan, panitia bisa menghapus baris itu secara manual, lalu minta peserta mengirim ulang. |
| Perlu memperbaiki data peserta | Edit langsung di sheet. Jangan ubah kolom *Nomor referensi* dan *ID pengiriman*. |
| "Server sedang sibuk" terus-menerus | Batas `MAX_PER_MINUTE` tercapai (mungkin ada spam). Periksa sheet; naikkan batas jika memang ramai peserta asli. |
| Error `setup` soal header berbeda | Kolom sheet pernah diubah manual. Kembalikan urutan header sesuai tabel di atas atau pindahkan data ke sheet baru. |
| Mengubah `Code.gs` tapi perilaku tidak berubah | Lupa **Manage deployments → Edit → New version**. |

---

## Keputusan yang masih menunggu panitia

Bagian berikut sengaja **tidak diisi atau dikarang**, dan dibuat mudah diubah:

1. **Nomor angkatan MAPABA** (XXV atau XXVI): tidak ditampilkan di mana pun. Tambahkan ke `eventName` di `config.js` jika sudah final.
2. **Logo & gambar header**: sudah terpasang dari file yang disediakan panitia (lihat [Gambar & logo](#gambar--logo)).
3. **Kontak panitia**: sudah diisi (Sahabat Izzan, Sahabat Alghifari). Ubah di `contacts` pada `config.js` jika narahubung berganti.
4. **Kontak darurat wajib?** Saat ini **wajib** (`true`) karena kegiatan 4 hari di Bogor kemungkinan menginap. Konfirmasikan ke panitia; jika tidak disetujui, ubah ke `false` di `config.js` **dan** Script Property `REQUIRE_EMERGENCY_CONTACT`.
5. **Email & NIM**: saat ini opsional. Jika panitia mewajibkan, ubah aturannya di `js/validation.js` dan `gas/Code.gs` (tes paritas akan gagal jika hanya satu yang diubah).
6. **Persetujuan dokumentasi foto/video**: saat ini **dimatikan** (`askDocumentationConsent: false`), jadi kolom sheet *Persetujuan dokumentasi* berisi `Tidak ditanyakan`. Jika panitia membutuhkannya, ubah ke `true`. Pilihan ini akan muncul sebagai centang terpisah yang tidak wajib.
7. **Venue, biaya, dan batas akhir pendaftaran**: tidak ditampilkan karena belum ada informasinya. Gunakan `REGISTRATION_OPEN=false` untuk menutup pendaftaran.
