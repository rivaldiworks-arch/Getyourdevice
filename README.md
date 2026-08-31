# GETYOURDEVICE

Storefront HTML/CSS/JavaScript dengan katalog dan checkout Supabase. Phase 3 menambahkan fondasi order management dan pengelolaan pesanan admin tanpa merombak storefront atau pembayaran.

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
4. `supabase/migrations/004_order_management.sql` — normalisasi kolom order/item secara additive, snapshot pelanggan dan produk, nomor `GYD-YYYYMMDD-XXXX` dari database, status/trigger/index, admin RLS, serta pembaruan kompatibel RPC checkout. **Jalankan migration ini manual** sebelum membuka tab Pesanan.

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
