/* =========================================================
   SUPRA GHINA - js/api.js
   LAPISAN DATA. Semua halaman (website publik & admin) hanya
   mengambil/menyimpan data lewat objek SG.api di file ini.

   Saat ini: ADAPTER LOKAL (localStorage di browser ini) untuk prototype.
   Nanti: ganti isi fungsi-fungsi di bawah dengan fetch() ke backend
   (lihat docs/DATABASE.md bagian "Kontrak API"). Halaman tidak perlu diubah.

   PENTING:
   - Data lokal hanya ada di browser yang dipakai admin. Pengunjung lain
     TIDAK melihatnya. Untuk data bersama dibutuhkan backend + database.
   - Login di sini hanya mengunci tampilan prototype, BUKAN keamanan sungguhan.
   ========================================================= */
(function (g) {
  "use strict";
  var SG = (g.SG = g.SG || {});
  var E = SG.engine;
  var CFG = g.SUPRA_CONFIG || {};

  var KEY = "sg.db.v1";
  var KEY_SESI = "sg.sesi.v1";
  var memori = null; // cadangan jika localStorage diblokir browser

  /* ---------- struktur awal (nama tabel mengikuti docs/DATABASE.md) ---------- */
  function dbBaru() {
    var urutan = [1, 2, 3, 4, 5, 6, 0];
    return {
      versi: 1,
      // false = jadwal di bawah masih CONTOH (belum dipastikan pemilik)
      jadwal_terkonfirmasi: false,
      users: [],
      categories: [
        { id: "sembako", nama: "Sembako" },
        { id: "minuman", nama: "Minuman" },
        { id: "makanan-ringan", nama: "Makanan ringan" },
        { id: "rumah-tangga", nama: "Kebutuhan rumah tangga" },
        { id: "lainnya", nama: "Produk lainnya" }
      ],
      products: [],
      promotions: [],
      operating_hours: urutan.map(function (h, i) { return { id: i + 1, hari: h, jam_buka: "07:00", jam_tutup: "21:00", aktif: true }; }),
      store_status: null,
      operational_logs: [],
      transactions: [],
      transaction_items: [],
      stock_movements: [],
      shifts: [],
      settings: { batas_stok_terbatas: CFG.batasStokTerbatas == null ? 5 : CFG.batasStokTerbatas },
      seq: {}
    };
  }

  function lengkapi(d) {
    var dasar = dbBaru();
    for (var k in dasar) if (d[k] === undefined) d[k] = dasar[k];
    return d;
  }

  function muat() {
    try {
      var t = g.localStorage.getItem(KEY);
      if (t) return lengkapi(JSON.parse(t));
    } catch (e) { /* abaikan, pakai cadangan */ }
    return memori || (memori = dbBaru());
  }

  function simpan(db) {
    try { g.localStorage.setItem(KEY, JSON.stringify(db)); memori = null; }
    catch (e) { memori = db; }
  }

  function idBaru(db, tabel) {
    db.seq[tabel] = (db.seq[tabel] || 0) + 1;
    return db.seq[tabel];
  }

  function selesai(v) { return Promise.resolve(v); }
  function gagal(pesan) { return Promise.reject(new Error(pesan)); }
  function salin(x) { return JSON.parse(JSON.stringify(x)); }
  function iso(d) { return new Date(d).toISOString(); }

  /* ---------- sesi & login (PROTOTYPE) ---------- */
  function bacaSesi() {
    try {
      var s = JSON.parse(g.sessionStorage.getItem(KEY_SESI) || "null");
      if (!s || s.sampai < Date.now()) return null;
      return s;
    } catch (e) { return null; }
  }
  function penggunaAktif() {
    var s = bacaSesi();
    if (!s) return null;
    var u = muat().users.filter(function (x) { return x.id === s.userId; })[0];
    return u ? { id: u.id, nama: u.nama, email: u.email, role: u.role } : null;
  }
  function perluLogin() {
    var u = penggunaAktif();
    return u ? Promise.resolve(u) : Promise.reject(new Error("Silakan login terlebih dahulu."));
  }

  function heksKeByte(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function byteKeHeks(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }

  function hashSandi(sandi, garamHeks, iterasi) {
    if (!g.crypto || !g.crypto.subtle) return Promise.reject(new Error("Browser ini tidak mendukung WebCrypto. Buka lewat Live Server (localhost) atau HTTPS."));
    var enc = new TextEncoder();
    return g.crypto.subtle.importKey("raw", enc.encode(sandi), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return g.crypto.subtle.deriveBits({ name: "PBKDF2", salt: heksKeByte(garamHeks), iterations: iterasi, hash: "SHA-256" }, key, 256);
    }).then(byteKeHeks);
  }

  var gagalLogin = { jumlah: 0, sampai: 0 };

  var auth = {
    adaAdmin: function () { return selesai(muat().users.length > 0); },
    sesi: penggunaAktif,

    // Membuat admin pertama. Hanya bisa jika belum ada user.
    buatAdminPertama: function (d) {
      var db = muat();
      if (db.users.length) return gagal("Admin sudah dibuat. Silakan login.");
      var nama = (d.nama || "").trim(), email = (d.email || "").trim().toLowerCase(), sandi = d.sandi || "";
      if (!nama) return gagal("Nama wajib diisi.");
      if (!/^\S+@\S+\.\S+$/.test(email)) return gagal("Format email tidak valid.");
      if (sandi.length < 8) return gagal("Kata sandi minimal 8 karakter.");
      var garam = byteKeHeks(g.crypto.getRandomValues(new Uint8Array(16)));
      var iterasi = 150000;
      return hashSandi(sandi, garam, iterasi).then(function (h) {
        var dbBaruAdmin = muat();
        var user = { id: idBaru(dbBaruAdmin, "users"), nama: nama, email: email, role: "admin", sandi_hash: h, garam: garam, iterasi: iterasi };
        dbBaruAdmin.users.push(user);
        simpan(dbBaruAdmin);
        return auth.login(email, sandi);
      });
    },

    login: function (email, sandi) {
      if (Date.now() < gagalLogin.sampai) {
        return gagal("Terlalu banyak percobaan. Coba lagi dalam " + Math.ceil((gagalLogin.sampai - Date.now()) / 1000) + " detik.");
      }
      var db = muat();
      var u = db.users.filter(function (x) { return x.email === String(email || "").trim().toLowerCase(); })[0];
      var umum = "Email atau kata sandi salah.";
      function salah() {
        gagalLogin.jumlah++;
        if (gagalLogin.jumlah >= 5) { gagalLogin.sampai = Date.now() + 30000; gagalLogin.jumlah = 0; }
        return Promise.reject(new Error(umum));
      }
      if (!u) return salah();
      return hashSandi(sandi || "", u.garam, u.iterasi).then(function (h) {
        if (h !== u.sandi_hash) return salah();
        gagalLogin.jumlah = 0;
        g.sessionStorage.setItem(KEY_SESI, JSON.stringify({ userId: u.id, sampai: Date.now() + 8 * 3600 * 1000 }));
        return penggunaAktif();
      });
    },

    logout: function () { try { g.sessionStorage.removeItem(KEY_SESI); } catch (e) { /* abaikan */ } return selesai(true); }
  };

  /* ---------- fungsi bantu status ---------- */
  function konteksDari(db) {
    return { jadwal: salin(db.operating_hours), jadwalTerkonfirmasi: !!db.jadwal_terkonfirmasi, override: db.store_status ? salin(db.store_status) : null };
  }

  // Menutup log status manual yang sedang aktif/menunggu (saat diganti atau dibatalkan)
  function akhiriLogManual(db, sekarang, user) {
    var ov = db.store_status;
    if (!ov) return;
    var log = db.operational_logs.filter(function (l) { return l.id === ov.log_id; })[0];
    if (!log) return;
    var m = new Date(log.waktu_mulai).getTime();
    var s = log.waktu_selesai ? new Date(log.waktu_selesai).getTime() : Infinity;
    var akhir = Math.min(s, Math.max(sekarang.getTime(), m));
    if (s === Infinity || akhir < s) { log.diakhiri_oleh = user.id; log.diakhiri_nama = user.nama; }
    log.waktu_selesai = new Date(akhir).toISOString();
  }

  function tulisLog(db, data, user) {
    var log = {
      id: idBaru(db, "operational_logs"),
      status: data.status,
      waktu_mulai: data.waktu_mulai,
      waktu_selesai: data.waktu_selesai || null,
      alasan: data.alasan || "",
      admin_id: user.id,
      admin_nama: user.nama,
      sumber: "admin",           // nanti bisa: "kasir" (shift) atau "sistem"
      dibuat: iso(new Date())
    };
    db.operational_logs.push(log);
    return log;
  }

  function statusProduk(p, db) {
    var st = E.statusStok(p.stok, db.settings.batas_stok_terbatas);
    var x = salin(p);
    x.status_stok = st;
    x.tersedia = st.tersedia; // turunan dari stok, bukan diisi manual
    return x;
  }

  function aktifPromo(p, sekarang) {
    if (!p.aktif) return "nonaktif";
    if (p.mulai && new Date(p.mulai) > sekarang) return "terjadwal";
    if (p.selesai && new Date(p.selesai) < sekarang) return "berakhir";
    return "berlangsung";
  }

  /* =========================================================
     OBJEK PUBLIK: SG.api
     ========================================================= */
  SG.api = {
    mode: "lokal",

    /* ----- dipakai website publik (tanpa login) ----- */
    publik: {
      konteksStatus: function () {
        var db = muat();
        var ctx = konteksDari(db);
        ctx.sumber = "lokal";
        if (!ctx.jadwalTerkonfirmasi) {
          if (CFG.jadwalStatis && CFG.jadwalStatis.length) {
            ctx.jadwal = salin(CFG.jadwalStatis);
            ctx.jadwalTerkonfirmasi = true;
            ctx.sumber = "config";
          } else {
            ctx.jadwal = [];
          }
        }
        return selesai(ctx);
      },
      produk: function () {
        var db = muat();
        return selesai({ kategori: salin(db.categories), produk: db.products.map(function (p) { return statusProduk(p, db); }) });
      },
      promo: function () {
        var db = muat(), now = new Date();
        return selesai(db.promotions.filter(function (p) { return aktifPromo(p, now) === "berlangsung"; }).map(salin));
      }
    },

    auth: auth,

    /* ----- operasional toko (admin) ----- */
    operasional: {
      konteks: function () { return perluLogin().then(function () { return konteksDari(muat()); }); },

      simpanJadwal: function (baris) {
        return perluLogin().then(function (user) {
          var db = muat();
          var bersih = [];
          for (var i = 0; i < baris.length; i++) {
            var b = baris[i];
            if (b.aktif) {
              if (!/^\d{2}:\d{2}$/.test(b.jam_buka) || !/^\d{2}:\d{2}$/.test(b.jam_tutup)) throw new Error(E.NAMA_HARI[b.hari] + ": jam belum diisi.");
              if (E.keMenit(b.jam_tutup) <= E.keMenit(b.jam_buka)) throw new Error(E.NAMA_HARI[b.hari] + ": jam tutup harus setelah jam buka.");
            }
            var lama = E.recHari(db.operating_hours, Number(b.hari));
            bersih.push({ id: lama ? lama.id : idBaru(db, "operating_hours"), hari: Number(b.hari), jam_buka: b.jam_buka, jam_tutup: b.jam_tutup, aktif: !!b.aktif });
          }
          db.operating_hours = bersih;
          db.jadwal_terkonfirmasi = true;
          var now = iso(new Date());
          tulisLog(db, { status: "jadwal_diubah", waktu_mulai: now, waktu_selesai: now, alasan: "Jadwal operasional diperbarui" }, user);
          simpan(db);
          return salin(bersih);
        });
      },

      setStatus: function (d) {
        return perluLogin().then(function (user) {
          if (E.STATUS_MANUAL.indexOf(d.status) < 0) throw new Error("Status tidak dikenal.");
          var now = new Date();
          var mulai = d.mulai ? new Date(d.mulai) : now;
          var akhir = d.selesai ? new Date(d.selesai) : null;
          if (isNaN(mulai.getTime())) throw new Error("Waktu mulai tidak valid.");
          if (akhir && isNaN(akhir.getTime())) throw new Error("Waktu selesai tidak valid.");
          if (akhir && akhir <= mulai) throw new Error("Waktu selesai harus setelah waktu mulai.");
          if (akhir && akhir <= now) throw new Error("Waktu selesai sudah lewat.");
          var db = muat();
          akhiriLogManual(db, now, user);
          var log = tulisLog(db, { status: d.status, waktu_mulai: iso(mulai), waktu_selesai: akhir ? iso(akhir) : null, alasan: (d.alasan || "").trim() }, user);
          db.store_status = { id: 1, status: d.status, alasan: log.alasan, mulai: log.waktu_mulai, selesai: log.waktu_selesai, admin_id: user.id, log_id: log.id };
          simpan(db);
          return salin(db.store_status);
        });
      },

      kembaliOtomatis: function () {
        return perluLogin().then(function (user) {
          var db = muat();
          akhiriLogManual(db, new Date(), user);
          db.store_status = null;
          simpan(db);
          return true;
        });
      },

      log: function () {
        return perluLogin().then(function () {
          return salin(muat().operational_logs).sort(function (a, b) { return new Date(b.dibuat) - new Date(a.dibuat) || b.id - a.id; });
        });
      },

      // Shift kasir: BELUM terhubung. Disiapkan sebagai titik sambung (lihat docs/DATABASE.md).
      shift: function () { return selesai({ terhubung: false, shifts: salin(muat().shifts) }); }
    },

    /* ----- produk & stok (admin) ----- */
    produk: {
      kategori: function () { return perluLogin().then(function () { return salin(muat().categories); }); },
      daftar: function () { return perluLogin().then(function () { var db = muat(); return db.products.map(function (p) { return statusProduk(p, db); }); }); },
      simpan: function (p) {
        return perluLogin().then(function (user) {
          var db = muat();
          var nama = (p.nama || "").trim();
          if (!nama) throw new Error("Nama produk wajib diisi.");
          if (!db.categories.some(function (c) { return c.id === p.kategori; })) throw new Error("Kategori tidak valid.");
          var harga = p.harga === "" || p.harga == null ? null : Number(p.harga);
          if (harga !== null && (isNaN(harga) || harga < 0)) throw new Error("Harga tidak valid.");
          var stok = p.stok === "" || p.stok == null ? null : Number(p.stok);
          if (stok !== null && (isNaN(stok) || stok < 0 || Math.floor(stok) !== stok)) throw new Error("Stok harus bilangan bulat 0 atau lebih.");
          var rec = p.id ? db.products.filter(function (x) { return x.id === p.id; })[0] : null;
          if (rec) {
            var stokLama = rec.stok;
            rec.nama = nama; rec.kategori = p.kategori; rec.harga = harga; rec.gambar = (p.gambar || "").trim();
            if (stok !== stokLama) {
              rec.stok = stok;
              if (stok !== null) db.stock_movements.push({ id: idBaru(db, "stock_movements"), product_id: rec.id, tipe: "penyesuaian", jumlah: stok - (stokLama || 0), keterangan: "Diubah dari form produk", tanggal: iso(new Date()), admin_nama: user.nama });
            }
          } else {
            rec = { id: idBaru(db, "products"), nama: nama, kategori: p.kategori, harga: harga, stok: stok, tersedia: true, gambar: (p.gambar || "").trim() };
            db.products.push(rec);
            if (stok) db.stock_movements.push({ id: idBaru(db, "stock_movements"), product_id: rec.id, tipe: "awal", jumlah: stok, keterangan: "Stok awal", tanggal: iso(new Date()), admin_nama: user.nama });
          }
          rec.tersedia = E.statusStok(rec.stok, db.settings.batas_stok_terbatas).tersedia;
          simpan(db);
          return statusProduk(rec, db);
        });
      },
      hapus: function (id) {
        return perluLogin().then(function () {
          var db = muat();
          db.products = db.products.filter(function (p) { return p.id !== id; });
          simpan(db);
          return true;
        });
      }
    },

    stok: {
      pergerakan: function () {
        return perluLogin().then(function () { return salin(muat().stock_movements).sort(function (a, b) { return new Date(b.tanggal) - new Date(a.tanggal) || b.id - a.id; }); });
      },
      // tipe: "masuk" | "keluar" | "penyesuaian" (penyesuaian = isi stok sebenarnya)
      catat: function (m) {
        return perluLogin().then(function (user) {
          var db = muat();
          var p = db.products.filter(function (x) { return x.id === m.product_id; })[0];
          if (!p) throw new Error("Produk tidak ditemukan.");
          if (p.stok === null || p.stok === undefined) throw new Error("Produk ini belum melacak stok. Isi stok awal lewat menu Produk.");
          var jml = Number(m.jumlah);
          if (isNaN(jml) || jml < 0 || Math.floor(jml) !== jml) throw new Error("Jumlah harus bilangan bulat 0 atau lebih.");
          var delta;
          if (m.tipe === "masuk") delta = jml;
          else if (m.tipe === "keluar") { if (jml > p.stok) throw new Error("Jumlah keluar melebihi stok (" + p.stok + ")."); delta = -jml; }
          else if (m.tipe === "penyesuaian") delta = jml - p.stok;
          else throw new Error("Tipe pergerakan tidak dikenal.");
          p.stok += delta;
          p.tersedia = E.statusStok(p.stok, db.settings.batas_stok_terbatas).tersedia;
          db.stock_movements.push({ id: idBaru(db, "stock_movements"), product_id: p.id, tipe: m.tipe, jumlah: delta, keterangan: (m.keterangan || "").trim(), tanggal: iso(new Date()), admin_nama: user.nama });
          simpan(db);
          return statusProduk(p, db);
        });
      }
    },

    /* ----- promo (admin) ----- */
    promo: {
      daftar: function () {
        return perluLogin().then(function () {
          var now = new Date();
          return muat().promotions.map(function (p) { var x = salin(p); x.status = aktifPromo(p, now); return x; });
        });
      },
      simpan: function (p) {
        return perluLogin().then(function () {
          var db = muat();
          var nama = (p.nama || "").trim();
          if (!nama) throw new Error("Nama promo wajib diisi.");
          var mulai = p.mulai ? iso(p.mulai) : null, akhir = p.selesai ? iso(p.selesai) : null;
          if (mulai && akhir && new Date(akhir) <= new Date(mulai)) throw new Error("Tanggal selesai harus setelah tanggal mulai.");
          var rec = p.id ? db.promotions.filter(function (x) { return x.id === p.id; })[0] : null;
          if (!rec) { rec = { id: idBaru(db, "promotions") }; db.promotions.push(rec); }
          rec.nama = nama; rec.deskripsi = (p.deskripsi || "").trim(); rec.mulai = mulai; rec.selesai = akhir; rec.aktif = !!p.aktif;
          simpan(db);
          return salin(rec);
        });
      },
      hapus: function (id) {
        return perluLogin().then(function () { var db = muat(); db.promotions = db.promotions.filter(function (p) { return p.id !== id; }); simpan(db); return true; });
      }
    },

    /* ----- transaksi: belum ada sumber data (menunggu aplikasi kasir) ----- */
    transaksi: {
      terhubung: false,
      daftar: function () { return perluLogin().then(function () { return salin(muat().transactions); }); }
    },

    /* ----- pengaturan & data ----- */
    pengaturan: {
      ambil: function () { return perluLogin().then(function () { return salin(muat().settings); }); },
      simpan: function (s) {
        return perluLogin().then(function () {
          var batas = Number(s.batas_stok_terbatas);
          if (isNaN(batas) || batas < 1 || Math.floor(batas) !== batas) throw new Error("Batas stok terbatas harus bilangan bulat minimal 1.");
          var db = muat();
          db.settings.batas_stok_terbatas = batas;
          db.products.forEach(function (p) { p.tersedia = E.statusStok(p.stok, batas).tersedia; });
          simpan(db);
          return salin(db.settings);
        });
      },
      // Ekspor tanpa tabel users (berisi hash kata sandi)
      ekspor: function () {
        return perluLogin().then(function () { var d = salin(muat()); delete d.users; return JSON.stringify(d, null, 2); });
      },
      impor: function (teks) {
        return perluLogin().then(function () {
          var d;
          try { d = JSON.parse(teks); } catch (e) { throw new Error("File bukan JSON yang valid."); }
          ["categories", "products", "promotions", "operating_hours", "operational_logs", "stock_movements"].forEach(function (k) {
            if (!Array.isArray(d[k])) throw new Error("Data tidak lengkap: tabel '" + k + "' tidak ditemukan.");
          });
          var db = muat();
          var users = db.users;
          var baru = lengkapi(d);
          baru.users = users;
          simpan(baru);
          return true;
        });
      },
      reset: function () {
        return perluLogin().then(function () {
          try { g.localStorage.removeItem(KEY); g.sessionStorage.removeItem(KEY_SESI); } catch (e) { /* abaikan */ }
          memori = null;
          return true;
        });
      },
      // Dipakai di layar login (lupa kata sandi prototype). Menghapus semua data LOKAL browser ini.
      resetTanpaLogin: function () {
        try { g.localStorage.removeItem(KEY); g.sessionStorage.removeItem(KEY_SESI); } catch (e) { /* abaikan */ }
        memori = null;
        return selesai(true);
      }
    },

    // Ekspos untuk tampilan
    util: { statusPromo: aktifPromo }
  };
})(window);
