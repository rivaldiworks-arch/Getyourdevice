# GETYOURDEVICE

Storefront e-commerce gadget Indonesia yang berjalan sepenuhnya di browser dan dapat langsung di-deploy sebagai situs statis di Vercel.

## Fitur

- Katalog, pencarian, kategori, pengurutan, serta rekomendasi berdasarkan kebutuhan dan anggaran
- Detail produk lengkap dengan spesifikasi, kontrol jumlah, dan rekomendasi produk terkait
- Keranjang dengan kontrol jumlah dan validasi stok
- Alur **Beli Sekarang**, checkout, pilihan pengiriman, dan pilihan pembayaran
- Status loading, kosong, error, dan sukses yang jelas
- Panel admin lokal untuk tambah, edit, hapus produk, dan memperbarui status pesanan
- Penyimpanan produk, keranjang, dan pesanan melalui `localStorage`
- Layout responsif serta navigasi dan formulir yang aksesibel

## Menjalankan secara lokal

Situs dapat dibuka langsung dari `index.html`, atau dijalankan melalui server statis:

```bash
python3 -m http.server 4173
```

Kemudian buka `http://localhost:4173`.

## Verifikasi

Jalankan pemeriksaan statis berikut setelah mengubah HTML, CSS, atau JavaScript:

```bash
node scripts/verify-static-site.mjs
```

Pemeriksaan ini memvalidasi sintaks JavaScript, referensi aset utama, elemen yang dibutuhkan alur belanja, fungsi perdagangan utama, dan sisa penanda konflik Git.

## Batasan versi statis

Checkout dan pembayaran masih berupa simulasi. Implementasi produksi tetap memerlukan backend/database, autentikasi admin dan pelanggan, payment gateway, kalkulasi ongkir berbasis alamat, penyimpanan gambar, notifikasi, dan pemrosesan pesanan yang aman.
