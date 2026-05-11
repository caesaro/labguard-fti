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

LAB_INTERFACE_MATCH="vlan"

WAN_INTERFACE_LIST=""
WAN_INTERFACE=""
UPLINK_INTERFACE="out inet"

LABGUARD_NAT_BLOCK_PREFIX="FTI"
LABGUARD_NAT_PLACE_BEFORE="0"
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
