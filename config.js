/* =========================================================
   SUPRA GHINA - js/config.js
   Pengaturan sistem (bukan data toko). Data toko seperti
   WhatsApp & Google Maps tetap diisi di script.js > CONFIG.
   ========================================================= */
window.SUPRA_CONFIG = {
  namaToko: "SUPRA GHINA",
  alamat: "Jalan Raya Kecila, Desa Kecila, Kecamatan Kemranjen",

  // Alamat backend/API. KOSONGKAN selama belum ada backend.
  // Selama kosong, sistem memakai penyimpanan lokal (localStorage) di browser ini.
  API_BASE_URL: "",

  // JADWAL STATIS UNTUK WEBSITE PUBLIK (GitHub Pages, tanpa backend)
  // Admin Dashboard versi prototype menyimpan data hanya di browser admin,
  // sehingga pengunjung lain TIDAK ikut melihat perubahannya.
  // Jika pemilik sudah memastikan jam buka, isi jadwal di bawah agar pengunjung
  // melihat status BUKA/TUTUP otomatis. Biarkan null jika belum pasti.
  // hari: 0 = Minggu, 1 = Senin, ... 6 = Sabtu
  //
  // Contoh (HAPUS tanda komentar & SESUAIKAN hanya jika jam sudah pasti):
  // jadwalStatis: [
  //   { hari: 1, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 2, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 3, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 4, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 5, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 6, jam_buka: "07:00", jam_tutup: "21:00", aktif: true },
  //   { hari: 0, jam_buka: "07:00", jam_tutup: "21:00", aktif: true }
  // ],
  jadwalStatis: null,

  // Stok 1 sampai angka ini dianggap "Stok terbatas". Stok 0 = "Habis".
  // (Bisa diubah dari Admin > Pengaturan.)
  batasStokTerbatas: 5
};
