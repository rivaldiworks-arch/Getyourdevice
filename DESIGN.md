# DESIGN.md: getyourdevice (GYD)

Dokumen ini adalah arah desain GYD. Setiap pekerjaan UI dan copy membaca file ini dulu, baru antislop sebagai filter.

## Arahan owner (8 Oktober 2026, ditulis apa adanya)

1. GYD harus menjadi website rekomendasi device yang minimalis tapi elegan. Apple tidak perlu dijadikan cerminan, karena GYD akan diisi brand smartphone lain, bukan hanya Apple.
2. Desain dikerjakan dengan sudut pandang website design builder yang paham web motion graphics, dan motion diterapkan secukupnya di project ini.
3. Jauhkan hal-hal yang membuat desain terlihat seperti buatan AI.
4. Pakai sudut pandang analis pasar yang memahami kebutuhan pembeli online. Pengunjung tidak boleh bingung, dan ilmu marketing dipakai supaya mereka ingin belanja.

Owner menyerahkan keputusan detail ke desainer (Claude) tanpa konfirmasi per langkah. Keputusan di bawah adalah keputusan desainer. Owner bisa mengubah apa pun di sini, dan perubahan owner selalu menang.

## Design Read

Reading this as: toko gadget multi-brand yang membantu pembeli memilih, untuk pembeli online Indonesia yang belanja berdasarkan kebutuhan dan anggaran, dengan bahasa visual minimalis terang dan brand biru-kuning GYD. Dial **ENERGY 2 / RHYTHM 2 / MOTION 2**.

- ENERGY 2: tenang dan bersih, tapi punya satu momen kuat, yaitu hero biru dengan tombol kuning.
- RHYTHM 2: section konsisten dengan beberapa jeda: panel Audio dan Laptop berbentuk split, showcase bergeser ke samping di HP, dan section kepercayaan ditutup dengan logo pembayaran dan kurir.
- MOTION 2: motion punya tugas, berjalan sekali, dan mati total dengan `prefers-reduced-motion`.

## Prinsip belanja (sudut pandang analis pasar)

Pembeli gadget online di Indonesia datang dengan tiga pertanyaan. Desain harus menjawab ketiganya sebelum mereka bertanya.

1. **"Saya harus pilih yang mana?"** GYD adalah toko rekomendasi, jadi aksi utama di hero adalah **Bantu Saya Pilih** (dua pertanyaan: kebutuhan dan anggaran). "Lihat semua produk" jadi aksi kedua.
2. **"Masuk anggaran saya tidak?"** Pembeli mencari dengan pola "HP 2 jutaan". Di atas grid produk ada filter rentang harga (di bawah Rp2 juta, Rp2–5 juta, Rp5–10 juta, di atas Rp10 juta). Rentang yang kosong untuk tampilan saat ini tidak ditawarkan, jadi pembeli tidak pernah menemui jalan buntu. Judul grid menyebut kategori yang sedang aktif.
3. **"Aman tidak belinya?"** Jawabannya selalu fakta yang bisa diperiksa di halaman Bantuan: jenis garansi tertulis di setiap produk (resmi Indonesia, distributor TAM, atau Blibli), dikirim hari yang sama bila dibayar sebelum 12.00 WIB Senin sampai Sabtu, ongkir retur barang rusak ditanggung toko, dan pembayaran lewat Midtrans.

Yang **tidak** dipakai, walaupun umum di toko online: hitung mundur palsu, "stok tinggal 2" yang tidak nyata, "terlaris" tanpa data, rating atau ulasan karangan, dan klaim "terpercaya" atau "terbaik". Trik seperti itu menaikkan klik sesaat tapi menurunkan kepercayaan, dan kepercayaan adalah alasan orang membeli gadget mahal di toko yang belum mereka kenal. Angka, stok, dan harga di halaman selalu dari katalog.

## Warna

Semua warna adalah token di `:root` di baris pertama `styles.css`. Tidak ada `:root` kedua.

| Token | Nilai | Alasan |
|---|---|---|
| `--blue` | #1446a0 | Biru brand dari logo gyd. Dipakai untuk hero, tombol utama di luar hero, dan filter aktif. |
| `--blue-bright` | #2f6fdb | Biru wordmark "device". Hanya untuk wordmark, link, dan fokus. |
| `--yellow` | #ffc629 | Satu aksen. Hanya untuk tombol utama di hero, garis kategori aktif, dan wordmark di atas biru. |
| `--ink` / `--ink-soft` / `--muted` | #141821 / #3b4250 / #5b6472 | Netral abu kebiruan, sengaja tidak memakai abu Apple. `--muted` minimal 4,5:1 di putih dan di `--bg`. |
| `--line` / `--bg` | #e4e7ec / #f6f7f9 | Garis tipis dan permukaan section. |
| `--success` / `--danger` / `--orange` | status | Hanya untuk status nyata: stok, diskon, error. |

Biru dan kuning berasal dari logo GYD, bukan dari palet bawaan AI. Brand produk (Apple, Samsung, Xiaomi, dan lainnya) tampil lewat foto produknya sendiri di atas permukaan netral, jadi tidak ada brand yang terasa sebagai tuan rumah.

## Tipografi

- **Outfit** (`--font-display`): judul dan wordmark. Ini font logo GYD, jadi judul membawa suara brand.
- **Plus Jakarta Sans** (`--font-body`): teks dan UI. Font ini dibuat oleh foundry Indonesia (Tokotype) untuk antarmuka. Angkanya jelas untuk harga Rupiah, dan karakternya netral untuk semua brand.
- Font cadangan sebelum webfont termuat: Segoe UI, Roboto, Arial. Jangan pakai `system-ui`, karena di Linux bisa jatuh ke DejaVu Sans yang jauh lebih lebar dan membuat layout HP melebar.
- Font sistem Apple (SF Pro) tidak dipakai. Label kapital berjarak lebar tidak dipakai. Eyebrow hanya ada kalau menambah informasi yang tidak ada di judul.

## Bentuk dan kedalaman

- Radius kontrol 12px (`--radius-control`) untuk tombol, input, dan chip; kartu 16px (`--radius`). Tidak ada tombol pill. Lingkaran hanya untuk tombol ikon bulat (tambah ke keranjang).
- Header solid putih dengan garis bawah tipis. Tidak ada kaca blur di mana pun.
- Shadow hanya untuk elemen yang benar-benar melayang: modal, drawer, dan hover kartu produk.

## Layout

- Urutan beranda: hero (pilih dengan bantuan) → kategori → produk baru → promo → semua produk dengan filter harga → panel Audio → smartphone → panel Laptop → stok tersedia → alasan belanja di GYD dan logo pembayaran/kurir → footer.
- Panel Audio dan Laptop, tile kategori, dan strip produk di hero memakai foto dan harga dari katalog. Panel disembunyikan kalau tidak ada produk yang stoknya tersedia.
- HP: header hanya logo, aksi, dan pencarian (117 px). Kategori ada di tile, menu, dan judul grid. Semua kontrol minimal 44×44 px.

## Motion

Setiap animasi menjawab satu pertanyaan pembeli dan berjalan sekali.

| Motion | Tugasnya |
|---|---|
| Ikon garis gadget di hero tergambar sendiri saat halaman dibuka (`stroke-dashoffset`, bertahap) | Memperkenalkan isi toko (semua jenis gadget) sebelum pembeli membaca. |
| Ikon hero bergeser sedikit mengikuti kursor, yang besar lebih jauh (mouse saja) | Memberi kedalaman pada hero tanpa loop terus-menerus. |
| Strip produk di hero bergerak pelan dan berhenti saat di-hover atau difokus | Menunjukkan produk nyata yang sedang ready. Ini satu-satunya loop, dan alasannya adalah konten nyata. |
| Judul section naik dari balik mask saat masuk layar | Menandai awal bagian baru saat scroll. |
| Kartu produk masuk berurutan setiap grid berubah | Memberi tanda bahwa hasil filter sudah diperbarui. |
| Badge keranjang berdenyut saat produk ditambahkan | Konfirmasi bahwa produk benar-benar masuk keranjang. |

Dengan `prefers-reduced-motion: reduce`, semua motion di atas mati, dan strip produk menjadi strip yang bisa di-scroll.

## Copy

- Bahasa Indonesia sapaan "Anda", kalimat pendek, tanpa em dash, tanpa slogan aforisme ("X lebih banyak. Y lebih cepat.").
- Klaim hanya yang tertulis di halaman Bantuan. Kalau sebuah kalimat butuh fakta yang belum ada, tanyakan ke owner, jangan dikarang.
- CTA menyebut apa yang terjadi: "Bantu Saya Pilih", "Lihat Semua Laptop", "Tambah ke keranjang".

## Utang teknis

`styles.css` masih menyimpan lapisan aturan lama dari beberapa redesign sebelumnya. Token warna, font, radius, dan header sudah satu sumber, tapi banyak aturan layout lama masih saling menimpa. Saat menyentuh sebuah komponen, rapikan aturannya di tempat (hapus aturan lama yang tertimpa), jangan menambah lapisan baru di akhir file.
