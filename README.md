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

Jangan commit atau tampilkan nilai ketiga secret tersebut di browser. Saat Production Midtrans aktif, ganti `MIDTRANS_SERVER_KEY` dengan Production Server Key dan `MIDTRANS_ENV=production`; source code tetap sama.

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
