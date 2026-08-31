# GETYOURDEVICE

Storefront HTML/CSS/JavaScript dengan katalog dan checkout Supabase. Phase 1 menambahkan portal admin terpisah tanpa merombak storefront atau alur checkout.

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

## Orders: batasan Phase 1

Halaman admin membaca `orders` serta `order_items` secara read-only bila kedua tabel ada. Migration hanya menambahkan policy baca admin dan tidak mengubah struktur tabel. Implementasi checkout saat ini mengasumsikan kolom `orders.customer_id`, `order_number`, `status`, `payment_method`, `shipping_method`, `shipping_cost`, `subtotal`, `total`, serta kolom item yang digunakan di `001_storefront_order_rpc.sql`. Jika database aktual berbeda, catat/perbaiki ketidaksesuaian di fase checkout berikutnya; jangan memigrasikan agresif pada Phase 1.

## Pengembangan dan verifikasi

```bash
vercel dev
node scripts/verify-static-site.mjs
```

Untuk sekadar memeriksa storefront fallback: `python3 -m http.server 4173` lalu buka `http://localhost:4173`. Admin memerlukan Vercel Functions dan project Supabase yang sudah menjalankan migration.
