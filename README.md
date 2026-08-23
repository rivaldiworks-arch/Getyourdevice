# GETYOURDEVICE

Storefront gadget Indonesia berbasis HTML/CSS/JavaScript dengan katalog dan checkout yang tersambung ke Supabase melalui Vercel Functions. UI storefront tetap statis dan keranjang tetap tersimpan lokal di browser.

## Arsitektur Supabase

- Browser memanggil `GET /api/products`; function membaca produk aktif dari `public.products` menggunakan Supabase REST API.
- Checkout mengirim **hanya** ID produk dan jumlah ke `POST /api/orders`. Function memanggil RPC `create_storefront_order`.
- RPC mengunci baris produk, membaca harga dan stok langsung dari database, menghitung subtotal/ongkir/total, lalu menulis `customers`, `orders`, dan `order_items` dalam satu transaksi. Harga atau total dari browser tidak pernah dipercaya.
- RLS tetap aktif. Tidak ada service-role key dan tidak ada kredensial di source. Anon key hanya berada di environment serverless (meskipun key tersebut bersifat publishable).
- Keranjang tetap menggunakan `localStorage`. Pesanan yang baru dibuat hanya dicache di memori untuk tampilan sesi; Supabase adalah sumber data permanennya.

## Konfigurasi Vercel

Tambahkan untuk Production, Preview, dan Development:

```text
SUPABASE_URL=https://PROJECT.supabase.co
SUPABASE_ANON_KEY=publishable-or-anon-key
```

Jangan memakai `SUPABASE_SERVICE_ROLE_KEY`. Deploy ulang sesudah mengubah environment variables.

## SQL yang harus dijalankan

1. Periksa bahwa tabel yang sudah ada memakai nama kolom yang tercantum dalam migration.
2. Jalankan `supabase/migrations/001_storefront_order_rpc.sql` di Supabase SQL Editor. RPC ini diperlukan sebelum checkout dapat disimpan.
3. Jalankan `supabase/seed/products.sql` untuk memasukkan/memperbarui katalog demo secara idempotent.
4. Pastikan RLS `products` memiliki policy `SELECT` untuk produk aktif bagi role `anon`. Jangan tambahkan policy anonymous untuk insert/update/delete tabel.

Tabel yang dipakai adalah `products`, `customers`, `orders`, dan `order_items`. `admin_profiles` disiapkan untuk fase autentikasi berikutnya.

> Karena skema tabel dibuat sebelum repository ini, sesuaikan nama kolom pada migration jika skema aktual berbeda. SQL sengaja tidak mengubah atau menonaktifkan RLS.

## Pengembangan lokal

Vercel Functions tidak berjalan melalui server statis biasa. Gunakan Vercel CLI dan file `.env.local` yang tidak di-commit:

```bash
vercel dev
```

Untuk sekadar melihat fallback katalog demo tanpa API:

```bash
python3 -m http.server 4173
```

Lalu buka `http://localhost:4173`. Kegagalan API akan menampilkan katalog fallback dan pesan yang jelas; checkout memerlukan `vercel dev` serta RPC yang sudah dipasang.

## Admin

UI admin dipertahankan, tetapi perubahan produk dan status tidak ditulis secara publik. Kontrol edit/hapus berada dalam mode demo dan memberi pemberitahuan. Langkah berikutnya adalah Supabase Auth, menghubungkan pengguna ke `admin_profiles`, serta policy/RPC khusus role admin. Jangan membuka write policy untuk `anon`.

## Verifikasi

```bash
node scripts/verify-static-site.mjs
```

Pemeriksaan memvalidasi sintaks JavaScript, aset/elemen utama, fungsi perdagangan, dan penanda konflik Git.
