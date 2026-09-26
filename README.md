# GETYOURDEVICE

Storefront HTML/CSS/JavaScript dengan katalog, checkout Supabase, payment domain provider-neutral, Midtrans Sandbox QRIS, dan fondasi shipping provider-neutral.

## Arsitektur

- Storefront tetap membaca produk aktif melalui `GET /api/products` dan memakai fallback katalog ketika API tidak tersedia.
- Checkout mengirim ID produk dan kuantitas ke `POST /api/orders`. Phase 6 memakai server-created shipping quote lalu memanggil RPC `create_storefront_order_v3`; harga produk, stok, ongkir snapshot, dan grand total tetap ditetapkan server/database.
- `/admin.html` memakai Supabase email/password Auth. Browser mendapat **publishable/anon key** dari `/api/config`, lalu mengirim access token pengguna ke REST API.
- Otorisasi tidak bergantung pada UI: RLS memeriksa `public.admin_profiles` melalui `public.is_admin()`. Pengguna terautentikasi tanpa role `admin` tidak dapat membaca produk nonaktif atau menulis data.
- `SUPABASE_SERVICE_ROLE_KEY` tidak boleh pernah masuk browser, source code, atau log. Phase 5C menggunakannya **hanya sebagai server-side Vercel secret** untuk write payment yang sudah diverifikasi backend. Admin UI tetap menggunakan anon key + JWT pengguna + RLS.

## SQL yang wajib dijalankan manual

Jalankan berurutan di **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/001_storefront_order_rpc.sql` — RPC checkout dan policy baca katalog yang sudah ada.
2. `supabase/migrations/002_admin_foundation.sql` — alignment skema produk yang bersifat additive, `admin_profiles`, helper role, trigger timestamp, dan seluruh policy RLS admin.
3. `supabase/migrations/003_product_storage.sql` — bucket publik `product-images`, batas 5 MB/tipe MIME gambar, dan policy public-read/admin-write. **Migration ini harus dijalankan manual** di SQL Editor sebelum fitur unggah dipakai.
4. `supabase/migrations/004_order_management.sql` — normalisasi kolom order/item secara additive, snapshot pelanggan dan produk, nomor `GYD-YYYYMMDD-XXXX` dari database, status/trigger/index, admin RLS, serta pembaruan kompatibel RPC checkout.
5. `supabase/migrations/005_checkout_hardening.sql` — melepaskan hanya constraint `NOT NULL` legacy pada `orders.whatsapp`, `order_items.unit_price`, dan `order_items.total_price` bila kolomnya ada; menambah `order_notes`; serta mengganti RPC checkout dengan validasi, harga/stok transaksional, dan sinkronisasi `grand_total` legacy. **Jalankan migration ini manual sebelum deploy kode Phase 4.**
6. `supabase/migrations/006_payment_infrastructure.sql` — menambah snapshot `orders.payment_status`/`payment_reference`, capability-token hash/expiry untuk guest payment access, tabel payment provider-neutral, indeks unik referensi provider, transition guard, sinkronisasi snapshot, RPC pembuatan intent manual yang mengambil nominal dari order, dan RLS admin-read-only.
7. `supabase/migrations/007_phase5_rpc_schema_compat.sql` — compatibility hotfix RPC capability-token untuk database yang sempat menjalankan draft awal Phase 5.
8. `supabase/migrations/008_phase5_pgcrypto_search_path.sql` — memastikan RPC security-definer dapat memakai `pgcrypto` dari schema `extensions`.
9. `supabase/migrations/009_shipping_infrastructure.sql` — membuat `shipping_quotes`, snapshot provider/service/ETA pada order, field tracking, dan RPC `create_storefront_order_v3` yang hanya dapat dipanggil `service_role`. **Jalankan 009 sebelum merge/deploy Phase 6.**
10. `supabase/migrations/010_product_shipping_dimensions.sql` — menambah `weight_grams`, `length_cm`, `width_cm`, dan `height_cm` ke produk. Semua nullable agar listing lama tetap berfungsi dan dapat dilengkapi saat edit produk.
11. `supabase/migrations/011_shipment_booking_tracking.sql` — menambah snapshot berat/dimensi pada `order_items`, Biteship shipment/tracking IDs, shipment status/environment, biaya aktual, timestamp booking/event, dan memperbarui RPC checkout v3 agar parcel data dibekukan saat order dibuat.\n12. `supabase/migrations/012_secure_customer_order_access.sql` — menambah capability token terpisah untuk akses riwayat pesanan guest selama 365 hari dan RPC checkout v4.
13. `supabase/migrations/013_api_rate_limiting.sql` — menambah fixed-window rate limiter atomik untuk endpoint publik checkout/payment/shipping/order history. Satu row per bucket+client menjaga storage tetap bounded; hanya `service_role` yang dapat mengonsumsi limiter.
14. `supabase/migrations/014_checkout_idempotency.sql` — menambah idempotency key per checkout agar retry/double-submit mengembalikan order yang sama, bukan membuat order kedua.
15. `supabase/migrations/015_payment_provider_environment.sql` — menambah `payments.provider_environment` (`sandbox`/`production`) agar QR dari environment Midtrans lain tidak pernah ditampilkan ke customer. Additive, tanpa backfill. **Jalankan 015 sebelum deploy kode Phase 7D.**
16. `supabase/migrations/016_paid_order_confirmation.sql` — order `pending` otomatis menjadi `confirmed` saat payment `paid`, dan menambah `orders.paid_notified_at` agar email pembayaran ke penjual terkirim tepat sekali. **Jalankan 016 sebelum deploy kode Phase 7E.**
17. `supabase/migrations/017_revoke_legacy_checkout_rpcs.sql` — mencabut akses `anon`/`authenticated` ke RPC checkout lama (`create_storefront_order`, `create_storefront_order_v2`) dan `next_order_number()`. Sebelumnya siapa pun dengan anon key publik dapat membuat order langsung ke database, melewati rate limit, validasi ongkir, idempotency, dan allow-list metode pembayaran, sekaligus mengurangi stok. Tidak dipakai kode sejak Phase 7C.
18. `supabase/migrations/018_restore_stock_on_cancel.sql` — mengembalikan stok saat order dibatalkan dari `pending`/`confirmed`/`processing` (tepat sekali, ditandai `orders.stock_restored_at`). Order yang sudah dikirim/selesai tidak di-restock. Membuka kembali order yang dibatalkan memotong stok lagi dan ditolak bila stok tidak cukup. Termasuk perbaikan satu kali untuk order yang sudah dibatalkan sebelum trigger ada.
19. `supabase/migrations/019_virtual_account_payments.sql` — menambah `payments.va_bank`, `va_number`, dan `biller_code` untuk instruksi Transfer Bank via Midtrans Virtual Account. Additive. **Jalankan 019 sebelum deploy kode Phase 8A.**
20. `supabase/migrations/020_order_status_flow.sql` — status pesanan mengikuti alur (transisi di luar alur ditolak database), COD hanya untuk Ambil di Toko, dan pembatalan otomatis pesanan QRIS/Transfer Bank yang tidak dibayar (pg_cron tiap 15 menit, stok dikembalikan). **Jalankan 020 sebelum deploy kode Phase 8C.**

## Payment infrastructure (Phase 5)

Status pembayaran canonical adalah `unpaid`, `pending`, `paid`, `failed`, `expired`, dan `refunded`; status ini terpisah dari status fulfillment order. `POST /api/orders` sekarang menerbitkan capability token acak 256-bit untuk order non-COD; hanya hash SHA-256 dan masa berlaku 24 jam yang disimpan di database. `POST /api/payments/create` menerima tepat salah satu `orderNumber` atau `orderId` plus `paymentToken`, sehingga nomor order yang dapat ditebak tidak cukup untuk membaca atau membuat payment intent milik pelanggan lain. RPC database mengunci dan membaca order, mengambil `orders.total` sebagai nominal otoritatif, menggunakan ulang intent aktif, menolak order yang sudah `paid`/`refunded`, serta tidak membuat transaksi untuk COD. Transfer Bank dan QRIS menghasilkan record provider `manual` berstatus `unpaid`, tanpa detail bank atau QR palsu.

`POST /api/payments/webhook` adalah boundary tertutup: pada Phase 5 semua provider ditolak dan tidak ada status yang dapat diubah melalui callback publik. Adapter gateway berikutnya wajib memverifikasi signature terhadap raw body sebelum memanggil RPC update yang sempit dan idempotent. Response storefront tidak menyertakan `provider_payload`.

RLS `payments` tidak memberi akses langsung kepada anon atau pengguna authenticated biasa. Authenticated admin yang lolos `public.is_admin()` hanya mendapat akses baca; write langsung tidak diberikan. API memakai `SUPABASE_URL` dan `SUPABASE_ANON_KEY` yang sudah digunakan proyek—tidak ada environment variable atau service-role key baru. Setelah migration diterapkan, detail Pesanan admin menampilkan status/metode/provider/referensi/ID transaksi/waktu pembayaran/kedaluwarsa.

Integrasi gateway nyata masih perlu menambahkan adapter `createPayment`, `getPayment`, `normalizeStatus`, dan `verifyWebhook`, secret server-side provider, verifikasi signature raw-body, serta RPC update webhook yang atomik. Redirect browser tidak boleh dijadikan bukti pembayaran.

`002_admin_foundation.sql` tidak menghapus atau menimpa produk seed. Kolom yang belum ada ditambahkan, sementara baris lama dipertahankan. Jalankan `supabase/seed/products.sql` **hanya jika** katalog demo belum ada; seed bersifat idempotent tetapi akan memperbarui produk demo dengan UUID yang sama.

### Membuat admin pertama

1. Di **Authentication → Users**, buat/invite user email/password.
2. Salin UUID user tersebut.
3. Jalankan berikut dengan UUID dan nama yang benar:

```sql
insert into public.admin_profiles (id, full_name, role)
values ('UUID-DARI-AUTH-USERS', 'Nama Admin', 'admin')
on conflict (id) do update set full_name=excluded.full_name, role='admin';
```

Tidak ada pendaftaran admin publik. Ini disengaja agar pengguna tidak dapat menaikkan rolenya sendiri. Setelah itu buka `/admin.html` dan masuk menggunakan email/password user tersebut.

## Environment Vercel

Tambahkan untuk Production, Preview, dan Development, kemudian deploy ulang:

```text
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_ANON_KEY=publishable-or-anon-key
```

Anon/publishable key aman berada di browser bila RLS benar. `SUPABASE_SERVICE_ROLE_KEY` hanya boleh disimpan sebagai server-side secret untuk endpoint payment dan tidak boleh dikirim ke frontend. Untuk pengembangan penuh gunakan `vercel dev`. Server statis biasa dapat menampilkan storefront fallback, tetapi endpoint auth/API tidak akan tersedia.

## Midtrans Sandbox QRIS (Phase 5C)

QRIS nyata diintegrasikan melalui Midtrans Core API dari backend Vercel. Server Key tidak pernah dikirim ke browser. Charge QRIS menggunakan amount dari row payment/order di database, bukan nominal dari client. Midtrans menggunakan Basic Auth dengan Server Key dan endpoint Sandbox `https://api.sandbox.midtrans.com/v2/charge`.

Environment server-side yang diperlukan di Vercel untuk Preview dan Production selama sandbox testing:

```text
MIDTRANS_SERVER_KEY=<sandbox server key>
MIDTRANS_ENV=sandbox
SUPABASE_SERVICE_ROLE_KEY=<server-only Supabase service-role key>
```

Jangan commit atau tampilkan nilai ketiga secret tersebut di browser. Aktivasi production dijelaskan di bagian Phase 7D.

Set Payment Notification URL di dashboard Midtrans Sandbox ke:

```text
https://getyourdevice.vercel.app/api/payments/webhook
```

Webhook memverifikasi `signature_key`, lalu melakukan GET Status ke Midtrans sebagai challenge sebelum menyinkronkan payment status ke Supabase. QRIS `pending` dipetakan ke payment `pending`; `settlement/capture` ke `paid`; `expire` ke `expired`; dan `deny/cancel/failure` ke `failed`.

Phase 5C baru mengaktifkan gateway Midtrans untuk QRIS. Transfer Bank tetap berada di rail manual/provider-neutral sampai Virtual Account Midtrans ditambahkan secara eksplisit.

## Shipping infrastructure (Phase 6)

Checkout tidak lagi mempercayai harga ongkir dari browser. Setelah alamat tervalidasi, storefront memanggil `POST /api/shipping/quotes`. Backend membuat quote berumur 30 menit di `public.shipping_quotes`; quote dikunci ke kota, kode pos, dan fingerprint isi keranjang.

Untuk Phase 6A provider masih `internal` dengan empat service class yang sama seperti prototipe lama: Reguler, Express, Same Day / Instant, dan Ambil di Toko. Bedanya, nominal tidak lagi hard-coded sebagai sumber kebenaran di browser. Struktur quote sudah provider-neutral sehingga adapter kurir nyata dapat mengganti sumber tarif tanpa mengubah contract checkout.

Saat order dibuat, `POST /api/orders` memverifikasi quote terhadap alamat dan cart, lalu menggunakan service-role server-side untuk memanggil `create_storefront_order_v3`. RPC menyalin snapshot `shipping_provider`, `shipping_service_code`, `shipping_service_name`, ETA, quote ID, dan shipping cost ke order. Quote yang sudah dipakai tidak dapat digunakan lagi. Admin detail order menampilkan snapshot layanan dan nomor resi bila tersedia.

Field tracking yang disiapkan: `tracking_number`, `tracking_url`, `shipped_at`, dan `delivered_at`. Phase 6A belum membeli label, booking pickup, atau mengambil live rate dari kurir eksternal; itu masuk adapter courier berikutnya.

## Biteship live courier rates (Phase 6B)

Admin form produk memiliki field berat paket (gram), panjang, lebar, dan tinggi (cm). Field ini boleh kosong untuk listing lama; bila satu field diisi, keempatnya harus lengkap dan bernilai positif.

Jika semua item dalam cart sudah memiliki data fisik dan environment Biteship tersedia, `POST /api/shipping/quotes` mengambil tarif live melalui `POST https://api.biteship.com/v1/rates/couriers`. Origin dan destination Phase 6B menggunakan postal code; ini cukup untuk standard courier rates tetapi bukan instant courier yang memerlukan koordinat. Default courier query: `jne,jnt,sicepat,anteraja,ninja,pos,tiki`.

Environment server-side:

```text
BITESHIP_API_KEY=<biteship_test... untuk testing, biteship_live... untuk production>
SHIPPING_ORIGIN_POSTAL_CODE=10140
# Optional:
BITESHIP_COURIERS=jne,jnt,sicepat,anteraja,ninja,pos,tiki
```

API key tidak boleh masuk browser atau repository. Alamat pickup lengkap tidak disimpan di source code; simpan di dashboard/provider atau server-side configuration saat Phase 6C booking shipment dibuat.

Untuk menjaga checkout tetap berjalan selama katalog lama belum dilengkapi dimensi, Phase 6B memakai tarif internal fallback bila data fisik item belum lengkap atau live rate sementara gagal. UI menandai apakah tarif berasal dari Biteship live atau fallback. Begitu seluruh item cart memiliki weight/dimensions, Biteship otomatis menjadi sumber tarif.

## Shipment booking + tracking (Phase 6C)

Admin order detail dapat membuat shipment Biteship lewat `POST /api/shipping/book`. Endpoint ini memverifikasi JWT admin server-side, mengambil snapshot order/item dari Supabase, lalu membuat Biteship order menggunakan `reference_id = order_number` agar retry tetap idempotent. Jika API mengembalikan error duplicate reference, backend mengambil Biteship order yang sudah ada alih-alih membuat shipment kedua.

Di sandbox (`biteship_test.`) admin boleh membuat shipment test walaupun payment belum `paid`, karena test order Biteship tidak melibatkan kurir nyata. Saat nanti memakai live key, booking diblokir sampai `orders.payment_status = paid`.

Environment tambahan yang wajib untuk booking:

```text
SHIPPING_ORIGIN_CONTACT_NAME=<nama PIC pickup>
SHIPPING_ORIGIN_CONTACT_PHONE=<nomor PIC pickup>
SHIPPING_ORIGIN_ADDRESS=<alamat pickup lengkap>
# optional:
SHIPPING_ORIGIN_CONTACT_EMAIL=<email pickup>
SHIPPING_ORIGIN_NOTE=<catatan pickup>
SHIPPING_ORIGIN_ORGANIZATION=GETYOURDEVICE
```

Tracking utama memakai Biteship tracking ID melalui `POST /api/shipping/track` dari admin. Biteship webhook tersedia di:

```text
https://getyourdevice.vercel.app/api/shipping/webhook
```

Webhook menerima event `order.status`, `order.waybill_id`, dan `order.price`. Untuk autentikasi, konfigurasi pasangan custom header yang sama di Vercel dan dashboard Biteship:

```text
BITESHIP_WEBHOOK_HEADER_NAME=x-getyourdevice-webhook-secret
BITESHIP_WEBHOOK_HEADER_SECRET=<secret acak yang panjang>
```

Di Biteship Webhook, isi **Headers Signature Key** dengan nilai dari `BITESHIP_WEBHOOK_HEADER_NAME` dan **Headers Signature Secret** dengan nilai secret yang sama. Endpoint membandingkan header secara timing-safe dan mengabaikan event yang tidak dikenal. Webhook memperbarui shipment status, AWB/resi, tracking URL, actual shipping cost, serta timestamp shipped/delivered tanpa mengubah grand total customer ketika Biteship melaporkan perubahan biaya aktual.

## Production hardening — secure customer orders (Phase 7A)

Checkout sekarang menerbitkan capability token acak 256-bit yang khusus untuk **membaca pesanan customer**. Token ini berbeda dari payment token: payment token tetap berumur pendek untuk payment intent, sedangkan order-access token disimpan sebagai hash SHA-256 di database dengan expiry 365 hari.

Browser menyimpan maksimal 20 capability token order di `localStorage` pada perangkat yang membuat pesanan. Menu **Pesanan** menggunakan `POST /api/orders/detail` untuk mengambil status order/payment/shipping terbaru, item snapshot, resi, dan tracking URL. Nomor order saja tidak cukup untuk membaca detail; backend membandingkan hash dengan `timingSafeEqual` dan tidak pernah mengembalikan hash/token/provider payload.

Konsekuensinya: riwayat pesanan tetap tersedia setelah refresh atau browser ditutup, tetapi hanya di browser yang masih memiliki capability tersebut. Belum ada login customer atau recovery lintas perangkat pada Phase 7A.

Baseline security headers ditetapkan melalui `vercel.json`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, dan `Permissions-Policy`. Admin HTML diberi `Cache-Control: no-store` dan `X-Robots-Tag: noindex, nofollow`.

## Production hardening — API abuse protection (Phase 7B)

Endpoint publik yang melakukan write atau lookup berbasis capability sekarang melewati guard server-side sebelum business logic dijalankan. Guard mewajibkan `application/json`, membatasi ukuran body, memberi `Cache-Control: no-store`, dan memakai fixed-window limiter atomik di Supabase. Identitas client di-HMAC menggunakan secret server-side sehingga alamat client mentah tidak disimpan ke tabel limiter.

Batas awal dibuat cukup longgar untuk traffic customer normal:
- `POST /api/orders`: 20 request / 60 menit / client
- `POST /api/shipping/quotes`: 120 request / 15 menit / client
- `POST /api/payments/create`: 40 request / 15 menit / client
- `POST /api/orders/detail`: 240 request / 15 menit / client

Jika batas terlampaui API mengembalikan HTTP `429` dan `Retry-After`. Limiter bersifat fail-open bila storage limiter sementara tidak tersedia agar checkout tidak tumbang hanya karena komponen proteksi; validasi authoritative order/payment/shipping tetap berjalan di backend. Request publik juga mendapatkan `X-Request-ID` untuk korelasi log tanpa mencatat payload customer.

## Production hardening — checkout idempotency (Phase 7C)

Storefront sekarang membuat idempotency key acak 256-bit untuk satu logical checkout attempt dan menyimpannya di `sessionStorage`, sehingga refresh di tab yang sama tetap memakai key yang sama. Key dikirim lewat header `Idempotency-Key`; database hanya menyimpan SHA-256 digest-nya.

`create_storefront_order_v5` memakai advisory transaction lock berdasarkan digest tersebut. Jika request yang sama datang bersamaan atau di-retry setelah response jaringan hilang, request berikutnya menunggu transaksi pertama lalu mengembalikan order yang sudah dibuat dengan `reused=true`. Replay window dibatasi 24 jam. Quote, destination, dan cart fingerprint tetap divalidasi secara authoritative untuk first write.

Payment capability dan customer order-access capability diturunkan secara deterministik dengan HMAC server-side dari idempotency key. Karena itu retry terhadap order yang sama menghasilkan capability token yang sama tanpa menyimpan raw token di database. Existing payment intent flow sudah bersifat reuse-per-order, sehingga replay checkout tidak membuat payment intent aktif kedua.

Setelah response order diterima dengan sukses, browser menghapus idempotency key checkout agar transaksi berikutnya memakai key baru.

## Alur status pesanan (Phase 8C)

Status pesanan bergerak sendiri mengikuti alur; admin tidak lagi memilih status bebas:

| Dari | Ke | Pemicu |
|---|---|---|
| pending | confirmed | Pembayaran Midtrans lunas (webhook), atau admin **Konfirmasi Pesanan** untuk COD |
| pending | cancelled | Otomatis bila tidak dibayar sampai batas 24 jam dan tidak ada link Snap/VA yang masih berlaku; atau admin |
| confirmed | processing | Admin klik **Buat Pengiriman Biteship**, kurir dialokasikan (webhook Biteship) |
| processing | shipped | Paket diambil kurir (webhook Biteship) |
| shipped | completed | Paket diterima (webhook Biteship) |
| confirmed / pending COD | completed | Pesanan **Ambil di Toko**: admin **Tandai Sudah Diambil** |
| confirmed | shipped | Pesanan dengan tarif cadangan (tanpa Biteship): admin **Tandai Sudah Dikirim** |

- `completed` dan `cancelled` bersifat final. Trigger `orders_guard_status` menolak lompatan lain (`INVALID_ORDER_STATUS_TRANSITION`) untuk semua penulis: webhook, admin, maupun SQL lewat API. Webhook Biteship melewati event yang tidak memajukan alur, tanpa gagal. Pengiriman yang dibatalkan kurir hanya dicatat di `shipping_status`; pesanan (yang biasanya sudah dibayar) tidak ikut dibatalkan.
- Panel admin **Alur pesanan** hanya menampilkan langkah yang sah untuk tahap pesanan itu, beserta penjelasan langkah berikutnya.
- **COD hanya untuk Ambil di Toko** (bayar tunai saat mengambil). Kurir tidak bisa dibooking sebelum pesanan dibayar dan tidak diinstruksikan menagih tunai, sehingga COD via kurir tidak dapat dipenuhi. Checkout menonaktifkan COD untuk opsi kurir; database menolaknya (`COD_REQUIRES_PICKUP`).
- Pesanan yang dibatalkan otomatis diberi `orders.auto_cancelled_at`. Pembayaran yang tetap masuk setelahnya tetap dicatat dan email penjual menandainya **PERLU REFUND**.

## Label pengiriman (Phase 8D)

Biteship tidak menyediakan API label, jadi admin mencetak label sendiri langsung dari detail pesanan:

- Setelah **Buat Pengiriman Biteship**, klik **Cetak Label**. Browser membuka dialog cetak dengan label **100 × 150 mm** (ukuran printer thermal/resi). Pilih printer label, atau **Simpan sebagai PDF**; nama file otomatis `Label <nomor pesanan> <resi>`.
- Isi label: nama toko, kurir dan layanan, **barcode resi (Code 128)** beserta nomornya, penerima (nama, telepon, alamat, kota, kode pos), pengirim, nomor pesanan, tanggal, berat total, jumlah barang, isi paket (maks. 6 baris, sisanya diringkas), dan catatan pembeli. Booking mode uji Biteship diberi tanda **LABEL UJI COBA**.
- Data label berasal dari `POST /api/shipping/label` (khusus admin). Pengirim memakai `SHIPPING_ORIGIN_*` yang sama dengan booking. Bila resi belum ada di database, endpoint menanyakannya sekali ke Biteship dan menyimpannya; bila kurir belum menerbitkan resi, admin mendapat pesan untuk mencoba lagi.
- Barcode diuji dengan pemindai ZXing terhadap tangkapan layar label dalam mode cetak, untuk format resi numerik, berawalan huruf, campuran, dan bertanda hubung.

## Login admin: lupa password (Phase 8E)

- Kolom password punya tombol mata untuk menampilkan atau menyembunyikan isinya.
- **Lupa password?** di halaman login mengirim link reset lewat Supabase Auth (`POST /auth/v1/recover`). Pesan konfirmasinya sama untuk email terdaftar maupun tidak, agar tidak membocorkan akun admin.
- Link reset kembali ke `admin.html`. Token di URL langsung dihapus dari address bar, admin membuat password baru (minimal 12 karakter, huruf besar, huruf kecil, angka, simbol), lalu otomatis masuk ke dashboard. Link kedaluwarsa atau sudah dipakai menampilkan permintaan link baru.

Setup Supabase (sekali):

1. **Authentication → URL Configuration → Redirect URLs**: tambahkan `https://getyourdevice.vercel.app/admin.html`. Tanpa ini Supabase mengarahkan link ke Site URL dan form password baru tidak muncul.
2. Email bawaan Supabase hanya untuk uji coba: terbatas beberapa email per jam dan hanya terkirim ke anggota tim project Supabase. Untuk pengiriman yang andal, pasang SMTP sendiri (misalnya Resend) di **Authentication → Emails → SMTP Settings**.

Jalur darurat bila email tidak sampai: set password lewat **SQL Editor** Supabase:

```sql
update auth.users set encrypted_password = crypt('<password baru>', gen_salt('bf')), updated_at = now()
where email = '<email admin>';
```

## Verifikasi & CI

Semua script `scripts/verify-*.mjs` dijalankan oleh GitHub Actions (`.github/workflows/verify.yml`) pada setiap pull request dan push ke `main`. Jalankan secara lokal sebelum membuka PR:

```bash
node scripts/verify-all.mjs
```

Test browser (`scripts/e2e-*.mjs`) menjalankan storefront di Chromium dengan API yang di-mock, pada lebar desktop dan ponsel. CI menjalankannya sebagai job terpisah. Lokal:

```bash
npm install --no-save playwright@1.56.1 @zxing/library@0.21.3
npx playwright install chromium
for test in scripts/e2e-*.mjs; do node "$test"; done
```

Script verifikasi adalah contract check statis; bila sebuah phase sengaja mengubah contract (misalnya versi RPC checkout), perbarui assertion di PR yang sama agar CI tetap hijau.

## Production readiness — Midtrans production & secret separation (Phase 7D)

### Secret HMAC terpisah

Capability token checkout (payment + order-access) dan identitas client rate limiter di-HMAC dengan `SERVER_HMAC_SECRET`, bukan lagi dengan `SUPABASE_SERVICE_ROLE_KEY`. Rotasi credential database tidak lagi mengubah nilai turunan, dan kebocoran satu secret tidak membuka tujuan lain. Setiap turunan memakai purpose string (`payment`, `order-access`, `rate-limit`) sehingga output satu tujuan tidak dapat dipakai untuk tujuan lain.

Secret wajib minimal 32 karakter dan harus berbeda dari service role key. Buat dengan:

```bash
openssl rand -hex 32
```

Jika secret tidak ada atau tidak valid, checkout dan endpoint publik mengembalikan `503` (fail closed); rate limiter tidak pernah dimatikan diam-diam. Gangguan storage limiter tetap fail open seperti Phase 7B. Mengganti secret tidak memutus token yang sudah dimiliki customer (database hanya menyimpan hash token); yang terdampak hanya replay checkout yang sama dalam 24 jam.

### Validasi konfigurasi Midtrans

- `MIDTRANS_ENV=sandbox` wajib memakai key berawalan `SB-Mid-server-`; `MIDTRANS_ENV=production` wajib `Mid-server-`. Salah pasang menghasilkan `503 Gateway pembayaran belum dikonfigurasi` sebelum ada charge, bukan 401 samar dari Midtrans.
- `MIDTRANS_ENV=production` ditolak pada `VERCEL_ENV=preview`/`development`, sehingga deploy preview tidak pernah menagih uang sungguhan.
- `MIDTRANS_QRIS_ACQUIRER` (opsional, Config): `gopay` (default) atau `airpay shopee`. Pilih acquirer QRIS yang channel-nya aktif di akun Midtrans. Channel yang belum aktif — Midtrans membalas 402 "payment channel is not activated" atau 404 "Merchant pop id is not found" — dikembalikan sebagai `503 QRIS Midtrans belum aktif untuk merchant ini.`, bukan 500.

### Siklus QRIS per attempt

Midtrans menolak `order_id` yang sudah pernah dipakai. Sebelumnya `order_id` = nomor order, sehingga setelah QR kedaluwarsa customer tidak dapat membayar order tersebut lagi (API selalu 500 atau mengembalikan QR mati). Sekarang:

- `order_id` Midtrans = `<nomor order>-<12 hex payment id>`, deterministik per attempt: retry attempt yang sama tetap idempotent, attempt baru mendapat transaksi baru.
- QR yang masih berlaku dipakai ulang tanpa memanggil Midtrans.
- QR yang melewati `expires_at` dicek ke Midtrans (GET Status) sebagai sumber kebenaran: `settlement` → customer melihat pembayaran diterima; `expire/deny/cancel` → attempt ditutup dan QR baru dibuat; masih `pending` → QR yang sama dikembalikan. Webhook yang terlewat tidak lagi membuat customer terjebak.
- Payment Midtrans dari environment lain (termasuk row lama tanpa `provider_environment`, yang dianggap sandbox) ditutup sebagai `expired` dan diganti attempt baru di environment aktif.
- Webhook mengabaikan notifikasi berulang dengan status sama agar snapshot status order tidak ditimpa.

### Bayar QRIS dari menu Pesanan

Saat checkout, browser menyimpan payment capability token bersama order-access token (`gyd_order_access`). Kartu pesanan QRIS yang belum lunas menampilkan tombol **Bayar dengan QRIS** / **Tampilkan QRIS** selama jendela pembayaran 24 jam (`paymentDeadline` dari `POST /api/orders/detail`). Tombol memanggil `POST /api/payments/create`, yang memakai ulang QR yang masih berlaku atau membuat attempt baru.

Modal pembayaran menampilkan hitung mundur masa berlaku QR, memeriksa status setiap 8 detik selama tab aktif, dan menawarkan **Buat QR Baru** setelah QR kedaluwarsa. Setelah jendela 24 jam lewat, tombol diganti catatan untuk menghubungi toko. Pesanan yang dibuat sebelum fitur ini tidak memiliki token pembayaran tersimpan dan menampilkan catatan yang sama.

### Checklist aktivasi production

1. Jalankan migration `015_payment_provider_environment.sql` di Supabase SQL Editor.
2. Di Vercel → Settings → Environment Variables, set `SERVER_HMAC_SECRET` untuk **Production dan Preview** (nilai berbeda per environment dianjurkan).
3. Deploy/merge kode Phase 7D. Pastikan checkout sandbox masih berjalan.
4. Khusus environment **Production**: `MIDTRANS_SERVER_KEY=<Mid-server-...>` dan `MIDTRANS_ENV=production`. Preview tetap `SB-Mid-server-...` + `sandbox`.
5. Di dashboard Midtrans **Production**: aktifkan channel QRIS dan set Payment Notification URL ke `https://getyourdevice.vercel.app/api/payments/webhook`.
6. Redeploy Production agar env baru terbaca.
7. Uji satu transaksi QRIS nominal kecil hingga admin menampilkan `paid`. Jika status tidak berubah dalam 1–2 menit, periksa log webhook sebelum membuka toko.

## Operasional toko (Phase 7E)

### Metode pembayaran di checkout

Checkout hanya menawarkan **QRIS** (default) dan **COD**. Transfer Bank tetap merupakan nilai valid di database untuk order lama, tetapi `POST /api/orders` menolaknya (`CHECKOUT_PAYMENT_METHODS`) sampai tersedia rail pembayaran nyata seperti Midtrans Virtual Account; tanpa itu customer tidak pernah menerima instruksi pembayaran.

### Konfirmasi otomatis

Trigger payment (migration 016) mengubah order `pending` menjadi `confirmed` begitu payment `paid`, dari jalur mana pun (webhook Midtrans, sinkronisasi status di API pembayaran, atau admin). Order yang sudah diproses admin tidak diubah. Order yang sudah `cancelled` tetap `cancelled` walaupun pembayaran masuk; kasus ini memerlukan refund manual.

### Email notifikasi penjual

Dikirim melalui [Resend](https://resend.com), best effort: kegagalan email tidak pernah menggagalkan checkout atau webhook.

- **Pesanan COD baru** — saat order COD dibuat, karena perlu tindakan toko.
- **Pembayaran diterima** — saat order QRIS lunas. Pengiriman diklaim lewat `paid_notified_at` sehingga retry webhook tidak menggandakan email; bila pengiriman gagal, klaim dilepas dan retry berikutnya mencoba lagi.

```text
RESEND_API_KEY=<re_...>
ORDER_NOTIFY_EMAIL=<email penjual; pisahkan dengan koma untuk lebih dari satu>
# Optional:
ORDER_NOTIFY_FROM=GETYOURDEVICE <pesanan@domain-anda>   # default onboarding@resend.dev
SITE_URL=https://getyourdevice.vercel.app               # untuk tautan Admin di email
```

Tanpa domain terverifikasi, pengirim default `onboarding@resend.dev` hanya dapat mengirim ke email pemilik akun Resend; cukup untuk notifikasi penjual. Bila `RESEND_API_KEY` atau `ORDER_NOTIFY_EMAIL` kosong, notifikasi dilewati tanpa error.

### Biteship live

Dengan `BITESHIP_API_KEY` berawalan `biteship_live.`, booking shipment mewajibkan payment `paid` dan membuat pengiriman kurir sungguhan (bersaldo). Tarif live hanya dipakai bila semua produk di cart memiliki berat dan dimensi; lengkapi data fisik produk di admin sebelum go-live, jika tidak checkout memakai tarif fallback internal.

## Transfer Bank via Virtual Account (Phase 8A)

Transfer Bank kembali tersedia dan dibayar melalui Midtrans Core API:

- **BNI, BRI, Permata, CIMB Niaga** — `payment_type: bank_transfer`, customer menerima nomor Virtual Account.
- **Mandiri** — `payment_type: echannel` (Bill Payment), customer menerima **kode perusahaan (biller code)** dan **kode bayar (bill key)**.
- VA berlaku 24 jam. Setiap attempt memakai `order_id` Midtrans sendiri seperti QRIS: VA yang masih berlaku dipakai ulang, VA kedaluwarsa diganti dengan nomor baru, dan webhook yang sama menandai pembayaran `paid` serta mengonfirmasi order.
- Selama VA masih aktif, permintaan dengan bank lain tetap mengembalikan VA yang sama, karena menerbitkan VA kedua saat yang pertama masih bisa dibayar dapat membuat customer membayar dua kali.
- Checkout menampilkan pemilih bank; nomor VA tampil di popup sukses dan dapat dibuka kembali dari **Pesanan** (tombol **Bayar via Transfer Bank / Lihat Nomor Virtual Account**) lengkap dengan tombol salin.
- QRIS otomatis dinonaktifkan di checkout, dan ditolak oleh API (`409 QRIS_LIMIT`), untuk total di atas Rp10.000.000 sesuai batas QRIS Bank Indonesia.

Environment (semuanya **Config**, opsional):

```text
# Metode yang ditawarkan di checkout, berurutan. Default: Transfer Bank,QRIS,COD
CHECKOUT_PAYMENT_METHODS=Transfer Bank,COD        # sembunyikan QRIS sampai Midtrans mengaktifkannya
# Bank VA yang ditawarkan. Default: bni,bri,mandiri,permata,cimb
MIDTRANS_VA_BANKS=bni,bri,mandiri,permata,cimb
```

Storefront membaca daftar ini dari `GET /api/config` (`checkout.paymentMethods`, `checkout.vaBanks`) sehingga hanya menampilkan metode yang aktif; `POST /api/orders` dan `POST /api/payments/create` menegakkan aturan yang sama di server.

## Midtrans Snap checkout (Phase 8B)

Akun Midtrans production toko ini menolak semua channel lewat Core API (`402 Payment channel is not activated` untuk VA, `Merchant pop id is not found` untuk QRIS), sementara channel yang sama berjalan normal lewat **Snap** (halaman pembayaran Midtrans). Karena itu integrasi default sekarang Snap:

- `POST /api/payments/create` membuat transaksi Snap (`/snap/v1/transactions`) dan mengembalikan `checkoutUrl`. Customer memilih bank VA, QRIS, atau e-wallet di halaman Midtrans. Tidak ada migrasi database: link disimpan di `payments.payment_url`.
- `enabled_payments` dibatasi per metode toko: **Transfer Bank** → VA dari `MIDTRANS_VA_BANKS` (`bni_va`, `bri_va`, `echannel`, `permata_va`, `cimb_va`) + `other_va`; **QRIS** → `other_qris`, `gopay`, `shopeepay`. Channel yang belum aktif otomatis tidak ditampilkan oleh Midtrans.
- Link berlaku 24 jam dan dipakai ulang selama masih berlaku. Link kedaluwarsa yang belum dipakai diganti attempt baru (`order_id` baru); bila ternyata sudah dibayar, API melaporkan `paid` tanpa membuat link baru. Batas QRIS Rp10.000.000 tetap berlaku.
- Setelah bayar, Midtrans mengarahkan customer ke `SITE_URL/#pesanan` (default `https://getyourdevice.vercel.app`). Status tetap ditentukan webhook, bukan redirect.
- Webhook menjawab `200 ignored` untuk notifikasi yang `order_id`-nya bukan milik toko (Payment Link, transaksi dashboard), setelah signature diverifikasi, sehingga Midtrans berhenti mengirim ulang.
- Order VA Core API lama tetap tampil dengan nomor VA-nya.

Environment (**Config**, opsional):

```text
# snap (default) atau core. Pakai core hanya bila Midtrans sudah mengaktifkan channel Core API.
MIDTRANS_INTEGRATION=snap
```

## Product schema final

`public.products` menggunakan: `id`, `name`, `brand`, `category`, `description`, `specifications jsonb`, `price`, `original_price`, `stock`, `image_url`, `rating`, `is_active`, `created_at`, dan `updated_at`. Admin dapat mencari/filter, menambah, mengedit, mengubah harga/stok/status, dan menghapus dengan konfirmasi.

RLS mengizinkan `anon` dan pengguna biasa membaca hanya `is_active = true`. Hanya pengguna terautentikasi dengan baris `admin_profiles.role = 'admin'` yang dapat membaca semua produk atau melakukan insert/update/delete.

## Gambar produk (Phase 2)

Admin dapat memilih JPG/JPEG, PNG, atau WebP berukuran maksimal 5 MB. Browser mengunggah langsung dengan anon key dan JWT admin; policy Storage memanggil `public.is_admin()`, sehingga tidak ada service-role key di browser. Nama object memakai UUID agar tidak bertabrakan. Saat gambar diganti atau produk dihapus, aplikasi hanya menghapus URL yang origin-nya sama dengan project Supabase dan path-nya tepat berada di bucket `product-images`; URL eksternal tidak pernah dihapus.

Untuk menguji: jalankan migration 003, masuk ke `/admin.html`, tambah/edit produk, pilih file, periksa pratinjau, lalu simpan. Pastikan kartu storefront menampilkan gambar sesudah halaman toko dimuat ulang. Jika tidak memilih file baru ketika mengedit, URL gambar saat ini tetap dipertahankan.

## Order management (Phase 3)

Tab **Pesanan** menampilkan order terbaru, pencarian nomor/pelanggan, filter status, jumlah item, metode pembayaran/pengiriman, detail pelanggan dan item, ringkasan nilai, serta pembaruan status. Status database yang didukung adalah `pending`, `confirmed`, `processing`, `shipped`, `completed`, dan `cancelled`; order baru default ke `pending`. Pembatalan tidak mengembalikan stok secara otomatis.

Nomor order dibuat oleh trigger database dan counter harian transaction-safe, bukan browser. RLS menolak akses tabel untuk anon dan hanya mengizinkan JWT authenticated yang lolos `public.is_admin()` untuk membaca order/item atau memperbarui order. RPC checkout tetap menjadi satu-satunya permukaan tulis order storefront dan tetap menghitung harga/stok di database.

Migration 004 mempertahankan data lama, menambahkan kolom yang belum tersedia, menyalin snapshot customer lama bila relasi `customer_id` tersedia, dan menyelaraskan snapshot harga lama dari kolom `price`. Constraint status dibuat `NOT VALID`: perubahan baru tetap terlindungi tanpa menggagalkan migration bila data historis memiliki status di luar vocabulary baru.

## Pengembangan dan verifikasi

```bash
vercel dev
node scripts/verify-static-site.mjs
```

Untuk sekadar memeriksa storefront fallback: `python3 -m http.server 4173` lalu buka `http://localhost:4173`. Admin memerlukan Vercel Functions dan project Supabase yang sudah menjalankan migration.

## Checkout hardening (Phase 4)

Checkout memvalidasi setiap field di browser dan API, menormalisasi nomor Indonesia secara konservatif, mengunci tombol selama request, dan baru menghapus keranjang sesudah respons `201`. Ringkasan browser hanya bersifat tampilan; RPC tetap mengambil harga produk aktif, mengunci row stok, menghitung total, dan mengurangi stok dalam transaksi yang sama. Metode pembayaran canonical Phase 4 adalah Transfer Bank, COD, dan QRIS; QRIS hanya menangkap pilihan order dan tidak menandai pembayaran berhasil. Tarif pengiriman Phase 6A berasal dari shipping quote server-side dengan TTL 30 menit. Provider masih internal/static sampai adapter kurir nyata diaktifkan, tetapi browser tidak lagi menjadi sumber kebenaran ongkir.

Customer guest tetap dibuat satu record per order. Deduplication sengaja tidak diterapkan karena tidak ada identitas customer terautentikasi dan penggabungan berdasarkan email/telepon berisiko mencampur pelanggan berbeda.
