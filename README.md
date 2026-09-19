# GETYOURDEVICE

Storefront HTML/CSS/JavaScript dengan katalog, checkout Supabase, dan fondasi domain pembayaran yang provider-neutral. Belum ada payment gateway yang terhubung.

## Arsitektur

- Storefront tetap membaca produk aktif melalui `GET /api/products` dan memakai fallback katalog ketika API tidak tersedia.
- Checkout tetap mengirim ID produk dan kuantitas ke `POST /api/orders`, yang memanggil RPC `create_storefront_order_v2`. Harga dan stok dihitung di database.
- `/admin.html` memakai Supabase email/password Auth. Browser mendapat **publishable/anon key** dari `/api/config`, lalu mengirim access token pengguna ke REST API.
- Otorisasi tidak bergantung pada UI: RLS memeriksa `public.admin_profiles` melalui `public.is_admin()`. Pengguna terautentikasi tanpa role `admin` tidak dapat membaca produk nonaktif atau menulis data.
- Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` di Vercel atau source browser. Admin menggunakan anon key + JWT pengguna + RLS.

## SQL yang wajib dijalankan manual

Jalankan berurutan di **Supabase Dashboard → SQL Editor**:

1. `supabase/migrations/001_storefront_order_rpc.sql` — RPC checkout dan policy baca katalog yang sudah ada.
2. `supabase/migrations/002_admin_foundation.sql` — alignment skema produk yang bersifat additive, `admin_profiles`, helper role, trigger timestamp, dan seluruh policy RLS admin.
3. `supabase/migrations/003_product_storage.sql` — bucket publik `product-images`, batas 5 MB/tipe MIME gambar, dan policy public-read/admin-write. **Migration ini harus dijalankan manual** di SQL Editor sebelum fitur unggah dipakai.
4. `supabase/migrations/004_order_management.sql` — normalisasi kolom order/item secara additive, snapshot pelanggan dan produk, nomor `GYD-YYYYMMDD-XXXX` dari database, status/trigger/index, admin RLS, serta pembaruan kompatibel RPC checkout.
5. `supabase/migrations/005_checkout_hardening.sql` — melepaskan hanya constraint `NOT NULL` legacy pada `orders.whatsapp`, `order_items.unit_price`, dan `order_items.total_price` bila kolomnya ada; menambah `order_notes`; serta mengganti RPC checkout dengan validasi, harga/stok transaksional, dan sinkronisasi `grand_total` legacy. **Jalankan migration ini manual sebelum deploy kode Phase 4.**
6. `supabase/migrations/006_payment_infrastructure.sql` — menambah snapshot `orders.payment_status`/`payment_reference`, capability-token hash/expiry untuk guest payment access, tabel payment provider-neutral, indeks unik referensi provider, transition guard, sinkronisasi snapshot, RPC pembuatan intent manual yang mengambil nominal dari order, dan RLS admin-read-only. **Jalankan migration ini manual di Supabase SQL Editor sebelum merge/deploy kode Phase 5**, karena `POST /api/orders` Phase 5 memanggil overload RPC baru dengan payment token.

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

Anon/publishable key aman berada di browser bila RLS benar; service-role key **tidak boleh** digunakan. Untuk pengembangan penuh gunakan `vercel dev`. Server statis biasa dapat menampilkan storefront fallback, tetapi endpoint auth/API tidak akan tersedia.

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

Checkout memvalidasi setiap field di browser dan API, menormalisasi nomor Indonesia secara konservatif, mengunci tombol selama request, dan baru menghapus keranjang sesudah respons `201`. Ringkasan browser hanya bersifat tampilan; RPC tetap mengambil harga produk aktif, mengunci row stok, menghitung total, dan mengurangi stok dalam transaksi yang sama. Metode pembayaran canonical Phase 4 adalah Transfer Bank, COD, dan QRIS; QRIS hanya menangkap pilihan order dan tidak menandai pembayaran berhasil. Tarif pengiriman yang tampil adalah nilai tetap sementara dari RPC, bukan hasil API kurir.

Customer guest tetap dibuat satu record per order. Deduplication sengaja tidak diterapkan karena tidak ada identitas customer terautentikasi dan penggabungan berdasarkan email/telepon berisiko mencampur pelanggan berbeda.
