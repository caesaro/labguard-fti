# Labguard FTI UKSW

Labguard FTI UKSW adalah dashboard monitoring dan kontrol jaringan lab berbasis React + Express yang terhubung langsung ke MikroTik RouterOS API.

Fokus utama sistem ini:
- kontrol internet mahasiswa per lab
- monitoring status NAT mahasiswa dan pengajar
- monitoring uplink backbone
- monitoring traffic interface VLAN lab
- pengaturan bandwidth queue tree per lab

Sistem ini tidak mematikan VLAN lab. Yang dikontrol adalah akses internet melalui rule NAT dan queue tree di router.

## Fitur Utama

- Login admin dengan PIN maksimal 6 digit
- Remember session dengan token signed
- Dark mode only
- Access Control per VLAN lab
- Status `Students On / Students Off` berdasarkan NAT mahasiswa di router
- Status `Teacher On / Teacher Off` berdasarkan NAT pengajar di router
- Monitoring uplink `out inet` atau interface uplink lain dari `.env`
- Monitoring traffic interface lab
- Pengaturan bandwidth `queue tree` per lab dalam satuan Mbps
- Dukungan polling ringan:
  - data inti dashboard lebih cepat
  - data pendukung seperti logs dan clients lebih jarang di-refresh

## Stack

- Frontend: React, Vite, Recharts, Motion, Lucide
- Backend: Express.js
- Router integration: RouterOS API socket client (custom)
- Runtime: Node.js

## Cara Kerja Singkat

### Access Control

Saat tombol `Off Inet Mhs` ditekan:
- NAT mahasiswa untuk lab itu di-disable
- internet mahasiswa mati
- VLAN tetap hidup
- NAT pengajar tetap aktif

Saat tombol `On Inet Mhs` ditekan:
- NAT mahasiswa di-enable kembali
- internet mahasiswa kembali aktif

### Access Control per MAC Address (menu terpisah)

Fitur ini punya **menu/tab sendiri** (`Akses MAC` / `MAC Access`) di sebelah tab Access Control,
Site Policy dan Monitoring — terpisah dari toggle lab/VLAN.
Isinya:

- tambah MAC address + keterangan (+ pilihan interface lab, opsional) + **action rule: `drop` / `accept`**
- tombol `Ubah` per entri (edit MAC / keterangan / scope lab / action)
- tombol `Blokir Internet` / `Buka Internet` (entri `drop`) atau `Aktifkan rule` / `Nonaktifkan rule` (entri `accept`) per entri
- tombol `Hapus` per entri (dengan konfirmasi)

Arti action:
- **`drop`** → perangkat itu **diblokir** ke internet (trafik ke WAN di-drop; layanan internal lab tetap jalan)
- **`accept`** → perangkat itu **diizinkan** (rule diletakkan paling atas `chain=forward` hanya untuk trafik ke WAN; NAT lab tetap berjalan normal). Rule ini tidak memblokir apa pun — ia mengecualikan perangkat dari drop di chain forward.
- status rule: `rule aktif` (`disabled=no`) = action berlaku; `rule idle` (`disabled=yes`) = action tidak berlaku → perangkat mengikuti aturan lab/NAT seperti biasa

Saat internet sebuah MAC diblokir:
- dibuat filter rule `chain=forward action=drop src-mac-address=<MAC> out-interface=<WAN>`
  dengan comment bertanda `LABGUARD_MAC_NO_INTERNET:<MAC> | <keterangan>`
- rule di-`place-before` rule forward paling atas, sehingga tidak bisa dilewati rule accept lain
- perangkat **tetap bisa mengakses layanan internal lab** (NAT/lab tidak diubah), hanya trafik ke WAN yang di-drop
- saat internet dibuka kembali, rule hanya di-`disabled=yes` (tidak dihapus) sehingga status tetap terlihat di panel
- entri dihapus = rule dihapus → perangkat **kembali 100% mengikuti kontrol lab** (menu Access Control)

Catatan mekanisme (17 Sep 2026, diuji langsung di router): rule ini **tidak** memakai tabel
`/ip/firewall/nat`. RouterOS 6.49.13 menolak rule NAT berbasis MAC —
`/ip/firewall/nat set disabled=no` pada `chain=srcnat` + `src-mac-address` menjawab
`"failure: source mac address matching not possible in output and postrouting chains"`
(dan `action=drop` tidak dikenal di chain NAT). Jadi MAC hanya bisa di-match di chain filter —
sama seperti pola manual admin (mis. `matikan inet 461 mac ...`). Rule NAT lab/VLAN tidak pernah disentuh.

Rule MAC yang dibuat manual di luar Labguard (mis. `matikan inet 461 mac ...`) ditampilkan
read-only di panel dan **tidak bisa** diubah/dihapus dari Labguard.

### Teacher Status

Status teacher tidak memakai ping device. Status dibaca dari:
- rule NAT pengajar aktif = `Teacher On`
- rule NAT pengajar disabled = `Teacher Off`

### Queue Tree

Bandwidth lab dibaca dari queue tree yang ada di router, lalu bisa diubah dari dashboard.

Input bandwidth di UI memakai satuan:
- `Mbps`

## Struktur Project

```text
.
├─ src/
│  ├─ App.jsx
│  ├─ main.jsx
│  ├─ index.css
│  └─ assets/
├─ server.js
├─ vite.config.js
├─ index.html
├─ package.json
└─ .env
```

## Prasyarat

- Node.js 20+ direkomendasikan
- Router MikroTik dengan API aktif
- User MikroTik yang punya akses:
  - `api`
  - `read`
  - `write`

## Konfigurasi MikroTik

Aktifkan service API:

```routeros
/ip service enable api
/ip service set api port=8728
```

Buat user khusus aplikasi:

```routeros
/user group add name=labguard policy=read,write,api,test
/user add name=labguard group=labguard password=GANTI_PASSWORD_KUAT
```

## Konfigurasi Environment

Contoh `.env`:

```env
PORT="3000"
SERVER_HOST="0.0.0.0"
PUBLIC_HOST=""

ROUTER_IP="192.xx.xx.xx"
ROUTER_USER="labguard"
ROUTER_PASS="GANTI_PASSWORD_KUAT"
ROUTER_API_PORT="8728"
ROUTER_API_TLS="false"
ROUTER_TIMEOUT_MS="8000"

# Cache baca RouterOS (ms). Satu sesi API = 1 baris log login + 1 baris logout di router,
# jadi pembacaan snapshot ditahan sebentar. "0" = matikan cache.
ROUTER_READ_CACHE_MS="8000"
ROUTER_TRAFFIC_CACHE_MS="3000"
ROUTER_READ_TIMEOUT_MS="20000"
MAC_ACCESS_CACHE_MS="10000"
MAC_ACCESS_TIMEOUT_MS="20000"

LAB_INTERFACE_MATCH="vlan"

WAN_INTERFACE_LIST=""
WAN_INTERFACE=""
UPLINK_INTERFACE="out inet"

LABGUARD_NAT_BLOCK_PREFIX="FTI"
LABGUARD_NAT_PLACE_BEFORE="0"

# Kontrol internet per MAC address (Access Control)
LABGUARD_MAC_BLOCK_PREFIX="LABGUARD_MAC_NO_INTERNET"
LABGUARD_MAC_PLACE_BEFORE=""

LAB_TEACHER_HOST_SUFFIX="2"

ADMIN_PIN="xxxxxx"
SESSION_SECRET=""
SESSION_TTL_HOURS="12"
REMEMBER_SESSION_DAYS="30"
```

Catatan:
- kalau `SESSION_SECRET` kosong, server akan auto-generate lalu menulis nilainya ke `.env`
- `WAN_INTERFACE` dipakai untuk pencocokan NAT keluar internet
- `UPLINK_INTERFACE` dipakai untuk monitoring backbone real-time
- `LAB_INTERFACE_MATCH="vlan"` berarti interface yang mengandung kata `vlan` akan masuk ke daftar lab

### Env → UI (satu sumber, tidak ada nilai yang di-hardcode di frontend)

Frontend mengambil nilai env dari `GET /api/config/labs-only-order` saat halaman dimuat:

| Env | Tampil di UI |
|---|---|
| `LABS_ONLY_VLANS` | tombol **Hanya Lab** (menyaring + mengurutkan kartu sesuai daftar env) |
| `WAN_INTERFACE` / `WAN_INTERFACE_LIST` | chip `WAN:` pada tiap entri menu Akses MAC + label kartu uplink (fallback) |
| `UPLINK_INTERFACE` | judul kartu **Backbone Uplink** di menu Pemantauan Trafik |
| `LAB_INTERFACE_MATCH` | daftar interface yang muncul sebagai kartu lab |
| `LAB_TEACHER_HOST_SUFFIX` | baris `NAT DOSEN <ip>` pada kartu lab |

Konsekuensi: **mengubah `.env` butuh restart proses server** (`npm start`; pada `npm run dev` watcher
sudah otomatis restart) dan **muat ulang halaman** agar UI membaca nilai baru.
`LABGUARD_NAT_*` dan `LABGUARD_MAC_*` bersifat internal (nama tag rule di router), tidak ditampilkan di UI.

### Banjir log RouterOS: kenapa ada cache baca

RouterOS menulis **satu baris log per login API** (`user <u> logged in from <ip> via api`) plus satu
baris logout saat koneksi ditutup. Karena `withRouter()` membuka koneksi per panggilan, dulu setiap
tick browser berubah langsung menjadi baris log di router.

Yang menjaga supaya tetap kecil (semua **jalur baca saja**, tidak ada perubahan konfigurasi router):

1. **Satu snapshot, satu koneksi.** `readRouterSnapshot()` mengambil resource + interface + ip address
   + NAT + queue tree dalam satu sesi, lalu di-cache `ROUTER_READ_CACHE_MS`. `/api/router/status` dan
   `/api/interfaces` memakai snapshot yang sama, jadi satu tick core = satu sesi (dulu 3).
2. **Traffic satu koneksi.** Semua `monitor-traffic` (interface lab + uplink) dibaca berurutan dalam
   satu sesi, di-cache `ROUTER_TRAFFIC_CACHE_MS` (dulu 2 sesi per tick).
3. **leases + ARP berurutan.** `/api/router/clients` dulu `Promise.all` dua `runRouterCommand` =
   dua socket; sekarang satu koneksi (dulu 2 sesi per tick aux).
4. **Dedupe in-flight.** Dua request bersamaan pada resource yang sama berbagi satu promise, bukan
   membuka sesi kedua.
5. **Interval polling UI** `CONTROL_REFRESH_MS=10000` dan `AUX_REFRESH_MS=30000` di `src/App.jsx`
   (dulu 3000/20000). Grafik trafik tetap terisi karena riwayat sampel disimpan; yang berubah hanya
   cakupan waktunya (resolusi lebih lebar, bukan rusak).

Aturan saat mengubah kode: **setiap endpoint tulis wajib memanggil `invalidateRouterReadCache('router-snapshot')`**
sesudah menulis, karena frontend langsung memanggil `fetchCoreData()` setelah toggle/bandwidth. Tanpa
invalidasi, UI akan menampilkan status lama (admin bisa menekan tombol dua kali).

## Instalasi

Install dependency:

```bash
npm install
```

## Menjalankan Project

### Development

```bash
npm run dev
```

Script ini menjalankan:
- Express backend
- Vite middleware untuk frontend
- watch untuk file backend penting

### Production Build

```bash
npm run build
```

### Run Production

```bash
npm start
```

## Script

```bash
npm run dev
npm run build
npm run start
npm run preview
npm run lint
```

## Endpoint Utama

Beberapa endpoint backend yang dipakai frontend:

- `POST /api/login`
- `GET /api/router/status`
- `GET /api/interfaces`
- `GET /api/interfaces/traffic`
- `GET /api/router/uplink-traffic`
- `POST /api/interfaces/:id/toggle`
- `POST /api/interfaces/:id/bandwidth`
- `GET /api/mac-access`
- `POST /api/mac-access`
- `PATCH /api/mac-access/:ruleId`
- `DELETE /api/mac-access/:ruleId`
- `GET /api/router/clients`
- `GET /api/logs`

## Pola Data Router yang Dipakai

### NAT Mahasiswa

Status mahasiswa dibaca dari rule NAT mahasiswa per subnet lab.

### NAT Pengajar

Status teacher dibaca dari NAT dengan `src-address` IP teacher, biasanya host `.2` pada subnet lab.

### Queue Tree

Queue tree lab dicocokkan dari pola seperti:
- `461`
- `463`
- `467`
- comment seperti `Qtree461`

## Monitoring dan Refresh

Dashboard memakai polling terpisah:

- data inti:
  - status router
  - interfaces
  - traffic
  - uplink

  lebih sering di-refresh

- data pendukung:
  - clients
  - logs

  lebih jarang di-refresh supaya dashboard lebih ringan

## Catatan Keamanan

- Ganti `ADMIN_PIN` default sebelum dipakai serius
- Ganti `ROUTER_USER` dan `ROUTER_PASS` dengan kredensial yang aman
- Jangan publish `.env` ke repository publik
- Batasi akses API MikroTik ke IP server aplikasi kalau memungkinkan

Contoh pembatasan API:

```routeros
/ip service set api address=192.168.xx.xx/32
```

## Deploy Singkat

Untuk deploy ke Debian / LXC / Proxmox:

1. clone repository
2. install dependency
3. isi `.env`
4. jalankan `npm run build`
5. jalankan `npm start` atau pakai PM2
6. pasang reverse proxy Nginx kalau perlu

## Troubleshooting

### Dashboard gagal konek ke router

Cek:
- `ROUTER_IP`
- `ROUTER_USER`
- `ROUTER_PASS`
- service API MikroTik aktif
- port `8728` bisa diakses dari server

### Students status tidak sinkron

Cek rule NAT mahasiswa di router:
- subnet harus cocok
- out-interface / out-interface-list harus sesuai WAN

### Teacher status tidak sinkron

Cek rule NAT pengajar:
- `src-address` teacher benar
- rule tidak disabled

### Queue tree tidak muncul

Cek apakah queue tree lab memang ada di router dan naming-nya masih sesuai pola lab.

## License

©2026, "Developed by: NCP-Laboran Internal project untuk kebutuhan operasional Lab FTI UKSW.
