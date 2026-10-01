/* =========================================================
   SUPRA GHINA - admin/admin.js
   Admin Dashboard (prototype). Semua data lewat SG.api
   (js/api.js). Logika status & laporan ada di
   js/status-engine.js.
   ========================================================= */
(function () {
  "use strict";
  var SG = window.SG, api = SG.api, E = SG.engine;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var view = $("#view"), modal = $("#modal"), toastEl = $("#toast");

  /* ---------- helper umum ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function rupiah(n) { return n === null || n === undefined ? "-" : "Rp " + Number(n).toLocaleString("id-ID"); }
  function p2(n) { return E.pad(n); }
  function keInputDT(d) { return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + "T" + p2(d.getHours()) + ":" + p2(d.getMinutes()); }
  function keInputTgl(isoStr) { if (!isoStr) return ""; var d = new Date(isoStr); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  function tglLokal(str, akhirHari) {
    if (!str) return null;
    var p = str.split("-").map(Number);
    return akhirHari ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59) : new Date(p[0], p[1] - 1, p[2], 0, 0, 0);
  }
  function badge(kelas, teks) { return '<span class="adm-badge adm-badge--' + kelas + '"><span class="dot dot--' + kelas + '" aria-hidden="true"></span>' + esc(teks) + "</span>"; }

  var timerToast = null;
  function toast(pesan, galat) {
    toastEl.textContent = pesan;
    toastEl.classList.toggle("adm-toast--error", !!galat);
    toastEl.classList.add("is-show");
    clearTimeout(timerToast);
    timerToast = setTimeout(function () { toastEl.classList.remove("is-show"); }, galat ? 5000 : 3200);
  }
  function jalankan(fn) {
    return Promise.resolve().then(fn).catch(function (e) {
      if (e && /login/i.test(e.message)) { mulai(); return; }
      toast((e && e.message) || "Terjadi kesalahan.", true);
    });
  }

  /* ---------- modal ---------- */
  function bukaModal(judul, isi) {
    modal.innerHTML = '<div class="adm-modal__box"><div class="adm-modal__head"><h2>' + esc(judul) + '</h2><button type="button" class="adm-x" data-aksi="tutup-modal" aria-label="Tutup">&times;</button></div>' + isi + "</div>";
    if (!modal.open) modal.showModal();
  }
  function tutupModal() { if (modal.open) modal.close(); }
  modal.addEventListener("click", function (e) { if (e.target === modal) tutupModal(); });

  function tanya(judul, teks, labelOk) {
    return new Promise(function (selesai) {
      bukaModal(judul, "<p>" + teks + '</p><div class="adm-form__actions"><button type="button" class="btn btn--ghost" data-tidak>Batal</button><button type="button" class="btn btn--primary" data-ya>' + esc(labelOk || "Ya, lanjutkan") + "</button></div>");
      var jawab = false;
      modal.querySelector("[data-ya]").onclick = function () { jawab = true; tutupModal(); };
      modal.querySelector("[data-tidak]").onclick = function () { tutupModal(); };
      modal.addEventListener("close", function () { selesai(jawab); }, { once: true });
    });
  }

  /* =========================================================
     LOGIN
     ========================================================= */
  function tampilAuth(adaAdmin) {
    $("#appView").hidden = true;
    $("#authView").hidden = false;
    var f = $("#authForm");
    if (!adaAdmin) {
      f.innerHTML =
        "<h2>Buat akun admin pertama</h2>" +
        '<p class="adm-hint">Akun ini disimpan di browser ini saja. Kata sandi disimpan sebagai hash (PBKDF2), bukan teks biasa.</p>' +
        '<form data-form="setup" novalidate>' +
        '<div class="adm-field"><label for="aNama">Nama</label><input type="text" id="aNama" autocomplete="name" required></div>' +
        '<div class="adm-field"><label for="aEmail">Email</label><input type="email" id="aEmail" autocomplete="username" required></div>' +
        '<div class="adm-field"><label for="aSandi">Kata sandi</label><input type="password" id="aSandi" autocomplete="new-password" minlength="8" required><small>Minimal 8 karakter.</small></div>' +
        '<div class="adm-field"><label for="aSandi2">Ulangi kata sandi</label><input type="password" id="aSandi2" autocomplete="new-password" required></div>' +
        '<p class="adm-error" data-error></p>' +
        '<button type="submit" class="btn btn--primary">Buat akun & masuk</button></form>';
    } else {
      f.innerHTML =
        "<h2>Masuk</h2>" +
        '<form data-form="login" novalidate>' +
        '<div class="adm-field"><label for="aEmail">Email</label><input type="email" id="aEmail" autocomplete="username" required></div>' +
        '<div class="adm-field"><label for="aSandi">Kata sandi</label><input type="password" id="aSandi" autocomplete="current-password" required></div>' +
        '<p class="adm-error" data-error></p>' +
        '<button type="submit" class="btn btn--primary">Masuk</button></form>' +
        '<p class="adm-hint" style="margin-top:1rem">Lupa kata sandi? Karena ini prototype lokal, satu-satunya cara adalah ' +
        '<button type="button" class="adm-linkbtn" data-aksi="reset-login">menghapus semua data prototype di browser ini</button>.</p>';
    }
    var pertama = f.querySelector("input");
    if (pertama) pertama.focus();
  }

  function setGalat(form, pesan) { var el = form.querySelector("[data-error]"); if (el) el.textContent = pesan || ""; }

  /* =========================================================
     KARTU STATUS TOKO
     ========================================================= */
  function htmlStatusCard(ctx, s) {
    var ov = ctx.override, now = new Date(), info = "";
    if (s.sumber === "manual") info = "Diatur manual dan diprioritaskan di atas jadwal otomatis.";
    else if (!ctx.jadwalTerkonfirmasi) info = "Jadwal belum dikonfirmasi pemilik (masih jadwal contoh).";
    else info = "Mengikuti jadwal operasional otomatis.";

    var tertunda = ov && new Date(ov.mulai) > now
      ? '<p class="adm-status__src">Terjadwal: ' + esc(E.NAMA_STATUS[ov.status]) + " mulai " + esc(E.tanggalJam(new Date(ov.mulai))) + ".</p>" : "";

    var tombol = (s.kode === "buka"
      ? '<button type="button" class="btn btn--danger adm-btn-sm" data-aksi="tutup-sekarang">Tutup Sekarang</button>'
      : '<button type="button" class="btn btn--primary adm-btn-sm" data-aksi="buka-sekarang">Buka Sekarang</button>') +
      '<button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="status-khusus" data-status="tutup_sementara">Tutup Sementara</button>' +
      (ov ? '<button type="button" class="btn btn--accent adm-btn-sm" data-aksi="kembali-otomatis">Kembali ke jadwal otomatis</button>' : "");

    return '<section class="adm-card adm-status adm-status--' + s.kelas + '" id="statusCard" aria-label="Status toko saat ini"><div>' +
      badge(s.kelas, s.label) + "<h2>" + esc(s.judul) + "</h2>" +
      '<p class="adm-status__lines">' + (s.baris.map(esc).join("<br>") || "&nbsp;") + "</p>" +
      '<p class="adm-status__src">' + esc(info) + "</p>" + tertunda +
      '</div><div class="adm-actions">' + tombol + "</div></section>";
  }

  function htmlBannerJadwal(ctx) {
    if (ctx.jadwalTerkonfirmasi) return "";
    return '<div class="adm-notice adm-notice--warn"><p><strong>Jadwal masih contoh.</strong> Jam 07.00 - 21.00 di bawah belum dipastikan pemilik toko, ' +
      "sehingga website publik menampilkan \"Jam operasional belum diatur\". Periksa jadwal lalu klik <strong>Simpan Jadwal</strong> untuk mengonfirmasi.</p>" +
      '<a class="btn btn--accent adm-btn-sm" href="#/operasional">Atur jadwal</a></div>';
  }

  /* ---------- riwayat ---------- */
  var NAMA_AWAL = { buka: "Toko dibuka (manual)", tutup: "Toko ditutup", tutup_sementara: "Toko ditutup sementara", libur: "Toko libur" };

  function bangunRiwayat(logs, now) {
    var ev = [];
    logs.forEach(function (l) {
      if (l.status === "jadwal_diubah") {
        ev.push({ waktu: new Date(l.waktu_mulai), kelas: "libur", judul: "Jadwal operasional diperbarui", meta: "oleh " + l.admin_nama });
        return;
      }
      var mulai = new Date(l.waktu_mulai), kelas = E.KELAS_STATUS[l.status] || "libur";
      var meta = [];
      if (l.alasan) meta.push("Alasan: " + l.alasan);
      meta.push("oleh " + l.admin_nama);
      ev.push({ waktu: mulai, kelas: kelas, judul: (mulai > now ? "Dijadwalkan: " : "") + (NAMA_AWAL[l.status] || l.status), meta: meta.join(". ") });
      if (l.waktu_selesai && l.waktu_selesai !== l.waktu_mulai && new Date(l.waktu_selesai) <= now) {
        ev.push({
          waktu: new Date(l.waktu_selesai), kelas: "buka",
          judul: "Kembali mengikuti jadwal otomatis",
          meta: l.diakhiri_nama ? "oleh " + l.diakhiri_nama : "Status manual berakhir sesuai waktu yang ditetapkan"
        });
      }
    });
    ev.sort(function (a, b) { return b.waktu - a.waktu; });
    return ev;
  }

  function htmlTimeline(ev, kosong) {
    if (!ev.length) return '<div class="adm-empty"><strong>Belum ada riwayat</strong>' + esc(kosong || "Perubahan status akan tercatat di sini.") + "</div>";
    return '<ul class="adm-timeline">' + ev.map(function (e) {
      return '<li><span class="dot dot--' + e.kelas + '" aria-hidden="true"></span><div><p class="adm-timeline__title">' + esc(e.judul) +
        '</p><p class="adm-timeline__meta">' + esc(E.tanggalJam(e.waktu)) + "<br>" + esc(e.meta) + "</p></div></li>";
    }).join("") + "</ul>";
  }

  /* =========================================================
     HALAMAN
     ========================================================= */
  var JUDUL = { dashboard: "Dashboard", produk: "Produk", stok: "Stok", promo: "Promo", transaksi: "Transaksi", operasional: "Operasional Toko", laporan: "Laporan Operasional", pengaturan: "Pengaturan" };
  var halaman = {};

  /* ----- Dashboard ----- */
  halaman.dashboard = function () {
    return Promise.all([api.operasional.konteks(), api.operasional.log(), api.produk.daftar(), api.promo.daftar()]).then(function (r) {
      var ctx = r[0], logs = r[1], produk = r[2], promo = r[3], now = new Date();
      var s = E.hitungStatus(ctx, now);
      var rec = E.recHari(ctx.jadwal, now.getDay());
      var jamIni = rec && rec.aktif ? E.formatJam(rec.jam_buka) + " - " + E.formatJam(rec.jam_tutup) : "Libur";
      var menipis = produk.filter(function (p) { return p.status_stok.kode === "terbatas"; }).length;
      var habis = produk.filter(function (p) { return p.status_stok.kode === "habis"; }).length;
      var berlangsung = promo.filter(function (p) { return p.status === "berlangsung"; }).length;

      return htmlBannerJadwal(ctx) + htmlStatusCard(ctx, s) +
        '<div class="adm-grid">' +
        stat("Jam operasional hari ini", jamIni, E.NAMA_HARI[now.getDay()] + (ctx.jadwalTerkonfirmasi ? "" : " (jadwal contoh)")) +
        stat("Produk", produk.length, menipis + " stok terbatas, " + habis + " habis") +
        stat("Promo berlangsung", berlangsung, promo.length + " promo tercatat") +
        stat("Transaksi hari ini", "-", "Menunggu aplikasi kasir terhubung") +
        "</div>" +
        '<section class="adm-card"><h2>Aktivitas terbaru</h2>' + htmlTimeline(bangunRiwayat(logs, now).slice(0, 5)) +
        '<p style="margin:1rem 0 0"><a class="adm-link" href="#/operasional">Lihat semua riwayat</a></p></section>';
    });
  };
  function stat(label, nilai, catatan) {
    return '<div class="adm-stat"><p class="adm-stat__label">' + esc(label) + '</p><p class="adm-stat__value">' + esc(nilai) + '</p><p class="adm-stat__note">' + esc(catatan) + "</p></div>";
  }

  /* ----- Operasional Toko ----- */
  halaman.operasional = function () {
    return Promise.all([api.operasional.konteks(), api.operasional.log(), api.operasional.shift()]).then(function (r) {
      var ctx = r[0], logs = r[1], shift = r[2], now = new Date();
      var s = E.hitungStatus(ctx, now);

      var jadwalHtml = E.URUTAN_HARI.map(function (h) {
        var rec = E.recHari(ctx.jadwal, h) || { jam_buka: "07:00", jam_tutup: "21:00", aktif: false };
        var nama = E.NAMA_HARI[h];
        return '<div class="adm-sched__row"><span class="adm-sched__day">' + nama + "</span>" +
          '<label class="adm-check"><input type="checkbox" name="aktif-' + h + '"' + (rec.aktif ? " checked" : "") + "> Buka</label>" +
          '<div class="adm-sched__times"><input type="time" name="buka-' + h + '" value="' + rec.jam_buka + '" aria-label="Jam buka ' + nama + '"' + (rec.aktif ? "" : " disabled") + ">" +
          "<span>sampai</span>" +
          '<input type="time" name="tutup-' + h + '" value="' + rec.jam_tutup + '" aria-label="Jam tutup ' + nama + '"' + (rec.aktif ? "" : " disabled") + "></div></div>";
      }).join("");

      return htmlBannerJadwal(ctx) + htmlStatusCard(ctx, s) +
        '<div class="adm-two"><div>' +
        '<section class="adm-card"><h2>Jadwal operasional</h2><p class="adm-hint">Hari tanpa centang "Buka" dihitung libur. Jam di sini bukan data final sampai Anda menyimpannya.</p>' +
        '<form data-form="jadwal" novalidate><div class="adm-sched">' + jadwalHtml + '</div><p class="adm-error" data-error></p>' +
        '<button type="submit" class="btn btn--primary">SIMPAN JADWAL</button></form></section>' +

        '<section class="adm-card"><h2>Status khusus</h2><p class="adm-hint">Status manual mengalahkan jadwal otomatis selama masih aktif.</p>' +
        '<div class="adm-actions">' +
        '<button type="button" class="btn btn--primary adm-btn-sm" data-aksi="status-khusus" data-status="buka">Buka</button>' +
        '<button type="button" class="btn btn--danger adm-btn-sm" data-aksi="status-khusus" data-status="tutup">Tutup</button>' +
        '<button type="button" class="btn btn--accent adm-btn-sm" data-aksi="status-khusus" data-status="tutup_sementara">Tutup Sementara</button>' +
        '<button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="status-khusus" data-status="libur">Libur</button>' +
        "</div></section></div><div>" +

        '<section class="adm-card"><h2>Uji status (simulasi)</h2><p class="adm-hint">Lihat status pada waktu tertentu dengan jadwal dan status manual saat ini. Tidak mengubah data.</p>' +
        '<div class="adm-field"><label for="simWaktu">Waktu simulasi</label><input type="datetime-local" id="simWaktu" value="' + keInputDT(now) + '"></div>' +
        '<button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="uji-status">Uji status</button><div id="simHasil" style="margin-top:1rem" aria-live="polite"></div></section>' +

        '<section class="adm-card"><h2>Shift kasir</h2>' +
        '<div class="adm-notice adm-notice--info"><p><strong>Belum terhubung.</strong> ' + (shift.terhubung ? "" : "Aplikasi kasir belum dibuat, jadi shift belum bisa dimulai dari sini.") + "</p></div>" +
        '<p class="adm-hint">Alur yang disiapkan: Mulai shift, toko BUKA, transaksi, tutup shift, toko TUTUP, laporan. Kolom <code>sumber</code> pada riwayat sudah disiapkan untuk mencatat "kasir".</p>' +
        '<div class="adm-actions"><button type="button" class="btn btn--primary adm-btn-sm" disabled>Mulai Shift</button><button type="button" class="btn btn--ghost adm-btn-sm" disabled>Tutup Shift</button></div></section>' +
        "</div></div>" +

        '<section class="adm-card"><h2>Riwayat operasional</h2>' + htmlTimeline(bangunRiwayat(logs, now)) + "</section>";
    });
  };

  /* ----- Laporan ----- */
  var lapor = { rentang: "bulan", awal: "", akhir: "" };

  function aturRentang(now) {
    if (lapor.rentang === "custom") {
      var a = tglLokal(lapor.awal), z = tglLokal(lapor.akhir);
      if (a && z && a <= z) return { awal: a, akhir: z };
      return null;
    }
    return E.rentangPreset(lapor.rentang, now);
  }
  function labelRentang(r) {
    if (lapor.rentang === "bulan") return E.NAMA_BULAN[r.awal.getMonth()] + " " + r.awal.getFullYear();
    if (E.sama(r.awal, r.akhir)) return E.tanggalPanjang(r.awal);
    return E.tanggalPanjang(r.awal) + " sampai " + E.tanggalPanjang(r.akhir);
  }

  halaman.laporan = function () {
    return Promise.all([api.operasional.konteks(), api.operasional.log()]).then(function (r) {
      var ctx = r[0], logs = r[1], now = new Date();
      var chips = [["hari", "Hari ini"], ["minggu", "Minggu ini"], ["bulan", "Bulan ini"], ["custom", "Custom"]].map(function (c) {
        return '<button type="button" class="adm-chip' + (lapor.rentang === c[0] ? " is-active" : "") + '" data-aksi="rentang" data-rentang="' + c[0] + '" aria-pressed="' + (lapor.rentang === c[0]) + '">' + c[1] + "</button>";
      }).join("");
      var custom = lapor.rentang === "custom"
        ? '<form class="adm-custom" data-form="rentang" novalidate><div class="adm-field"><label for="lAwal">Dari</label><input type="date" id="lAwal" value="' + esc(lapor.awal) + '"></div>' +
          '<div class="adm-field"><label for="lAkhir">Sampai</label><input type="date" id="lAkhir" value="' + esc(lapor.akhir) + '"></div>' +
          '<button type="submit" class="btn btn--primary adm-btn-sm">Terapkan</button></form><p class="adm-error" data-error></p>' : "";

      var rg = aturRentang(now), isi = "";
      if (!rg) {
        isi = '<div class="adm-empty"><strong>Pilih rentang tanggal</strong>Isi tanggal awal dan akhir, lalu klik Terapkan.</div>';
      } else {
        var data = E.laporan({ jadwal: ctx.jadwal, logs: logs }, rg.awal, rg.akhir, now);
        var ev = bangunRiwayat(logs, now).filter(function (e) { return e.waktu >= rg.awal && e.waktu < E.tambahHari(rg.akhir, 1); });
        isi = '<h2 style="font-family:var(--font-judul);margin:0 0 .2rem;color:var(--hijau-tua)">LAPORAN OPERASIONAL</h2><p class="adm-hint">' + esc(labelRentang(rg)) + "</p>" +
          '<div class="adm-grid">' +
          stat("Hari buka", data.hariBuka, "hari") +
          stat("Hari libur", data.hariLibur, "hari") +
          stat("Tutup sementara", data.kaliTutupSementara, "kejadian") +
          stat("Total jam operasional", E.durasiTeks(data.menitBuka), "sampai saat ini") +
          stat("Waktu rata-rata buka", data.rataBuka || "-", "pukul") +
          stat("Waktu rata-rata tutup", data.rataTutup || "-", "pukul") +
          "</div>" +
          '<h2 style="font-family:var(--font-judul);font-size:1.1rem;margin:1rem 0 .6rem;color:var(--hijau-tua)">Riwayat perubahan status</h2>' + htmlTimeline(ev, "Tidak ada perubahan status pada rentang ini.");
      }
      return htmlBannerJadwal(ctx) +
        '<section class="adm-card"><div class="adm-chips" role="group" aria-label="Rentang laporan">' + chips + "</div>" + custom + isi + "</section>" +
        '<div class="adm-notice adm-notice--info"><p><strong>Cara menghitung:</strong> berdasarkan jadwal operasional saat ini ditambah perubahan status manual, hanya sampai waktu sekarang. ' +
        "Ini belum jam aktual. Jam aktual baru tersedia setelah shift kasir terhubung.</p></div>";
    });
  };

  /* ----- Produk ----- */
  halaman.produk = function () {
    return Promise.all([api.produk.daftar(), api.produk.kategori()]).then(function (r) {
      var daftar = r[0], kat = {}; r[1].forEach(function (k) { kat[k.id] = k.nama; });
      var isi = !daftar.length
        ? '<div class="adm-empty"><strong>Belum ada produk</strong>Klik "Tambah Produk". Website publik memakai data contoh sampai ada produk di sini.</div>'
        : '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Nama</th><th>Kategori</th><th class="num">Harga</th><th class="num">Stok</th><th>Status stok</th><th><span class="sr-only">Aksi</span></th></tr></thead><tbody>' +
          daftar.map(function (p) {
            return "<tr><td>" + esc(p.nama) + "</td><td>" + esc(kat[p.kategori] || p.kategori) + '</td><td class="num">' + rupiah(p.harga) + '</td><td class="num">' + (p.stok === null ? "-" : p.stok) +
              "</td><td>" + (p.status_stok.label ? badge(p.status_stok.kelas, p.status_stok.label) : '<span class="adm-hint" style="margin:0">Stok tidak dilacak</span>') +
              '</td><td><div class="adm-actions"><button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="edit-produk" data-id="' + p.id + '">Edit</button>' +
              '<button type="button" class="btn btn--danger adm-btn-sm" data-aksi="hapus-produk" data-id="' + p.id + '">Hapus</button></div></td></tr>';
          }).join("") + "</tbody></table></div>";
      return '<section class="adm-card"><div class="adm-toolbar"><p class="adm-hint" style="margin:0">Status "Tersedia / Stok terbatas / Habis" dihitung otomatis dari stok.</p>' +
        '<button type="button" class="btn btn--primary adm-btn-sm" data-aksi="tambah-produk">Tambah Produk</button></div>' + isi + "</section>";
    });
  };

  /* ----- Stok ----- */
  halaman.stok = function () {
    return Promise.all([api.produk.daftar(), api.stok.pergerakan(), api.pengaturan.ambil()]).then(function (r) {
      var produk = r[0], gerak = r[1], set = r[2], nama = {};
      produk.forEach(function (p) { nama[p.id] = p.nama; });
      var tabel = !produk.length
        ? '<div class="adm-empty"><strong>Belum ada produk</strong>Tambahkan produk dulu di menu Produk.</div>'
        : '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Produk</th><th class="num">Stok</th><th>Status</th><th></th></tr></thead><tbody>' +
          produk.map(function (p) {
            return "<tr><td>" + esc(p.nama) + '</td><td class="num">' + (p.stok === null ? "-" : p.stok) + "</td><td>" +
              (p.status_stok.label ? badge(p.status_stok.kelas, p.status_stok.label) : "Tidak dilacak") + "</td><td>" +
              (p.stok === null ? "" : '<button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="catat-stok" data-id="' + p.id + '">Catat stok</button>') + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      var riwayat = !gerak.length ? '<div class="adm-empty"><strong>Belum ada pergerakan stok</strong></div>'
        : '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Waktu</th><th>Produk</th><th>Tipe</th><th class="num">Jumlah</th><th>Keterangan</th></tr></thead><tbody>' +
          gerak.slice(0, 30).map(function (m) {
            return "<tr><td>" + esc(E.tanggalJam(new Date(m.tanggal))) + "</td><td>" + esc(nama[m.product_id] || "(dihapus)") + "</td><td>" + esc(m.tipe) + '</td><td class="num">' + (m.jumlah > 0 ? "+" : "") + m.jumlah + "</td><td>" + esc(m.keterangan) + "</td></tr>";
          }).join("") + "</tbody></table></div>";
      return '<div class="adm-notice adm-notice--info"><p>Aturan status: stok di atas ' + set.batas_stok_terbatas + " = Tersedia, 1 sampai " + set.batas_stok_terbatas + " = Stok terbatas, 0 = Habis. Batas bisa diubah di Pengaturan.</p></div>" +
        '<section class="adm-card"><h2>Stok produk</h2>' + tabel + '</section><section class="adm-card"><h2>Pergerakan stok</h2>' + riwayat + "</section>";
    });
  };

  /* ----- Promo ----- */
  var NAMA_PROMO = { berlangsung: ["buka", "Berlangsung"], terjadwal: ["sementara", "Terjadwal"], berakhir: ["tutup", "Berakhir"], nonaktif: ["libur", "Nonaktif"] };
  halaman.promo = function () {
    return api.promo.daftar().then(function (daftar) {
      var isi = !daftar.length ? '<div class="adm-empty"><strong>Belum ada promo</strong>Promo yang berlangsung otomatis tampil di website publik.</div>'
        : '<div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Nama</th><th>Periode</th><th>Status</th><th></th></tr></thead><tbody>' +
          daftar.map(function (p) {
            var st = NAMA_PROMO[p.status];
            var periode = (p.mulai ? E.tanggalPanjang(new Date(p.mulai)) : "Sekarang") + " sampai " + (p.selesai ? E.tanggalPanjang(new Date(p.selesai)) : "tanpa batas");
            return "<tr><td><strong>" + esc(p.nama) + "</strong><br><small>" + esc(p.deskripsi) + "</small></td><td>" + esc(periode) + "</td><td>" + badge(st[0], st[1]) +
              '</td><td><div class="adm-actions"><button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="edit-promo" data-id="' + p.id + '">Edit</button>' +
              '<button type="button" class="btn btn--danger adm-btn-sm" data-aksi="hapus-promo" data-id="' + p.id + '">Hapus</button></div></td></tr>';
          }).join("") + "</tbody></table></div>";
      return '<section class="adm-card"><div class="adm-toolbar"><p class="adm-hint" style="margin:0">Hanya promo aktif dan dalam periode yang tampil di website.</p>' +
        '<button type="button" class="btn btn--primary adm-btn-sm" data-aksi="tambah-promo">Tambah Promo</button></div>' + isi + "</section>";
    });
  };

  /* ----- Transaksi ----- */
  halaman.transaksi = function () {
    return api.transaksi.daftar().then(function (daftar) {
      return '<div class="adm-notice adm-notice--info"><p><strong>Menunggu aplikasi kasir.</strong> Halaman ini hanya menampilkan data dari tabel <code>transactions</code>. ' +
        "Belum ada aplikasi kasir yang terhubung, jadi tidak ada data dan tidak ada yang dibuat palsu.</p></div>" +
        '<section class="adm-card"><div class="adm-table-wrap"><table class="adm-table"><thead><tr><th>Tanggal</th><th class="num">Total</th><th>Metode pembayaran</th><th>Kasir</th></tr></thead><tbody>' +
        (daftar.length ? daftar.map(function (t) { return "<tr><td>" + esc(E.tanggalJam(new Date(t.tanggal))) + '</td><td class="num">' + rupiah(t.total) + "</td><td>" + esc(t.metode_pembayaran) + "</td><td>" + esc(t.kasir_id) + "</td></tr>"; }).join("")
          : '<tr><td colspan="4"><div class="adm-empty"><strong>Belum ada transaksi</strong></div></td></tr>') +
        "</tbody></table></div></section>";
    });
  };

  /* ----- Pengaturan ----- */
  halaman.pengaturan = function () {
    return api.pengaturan.ambil().then(function (set) {
      var cfg = window.SUPRA_CONFIG || {};
      return '<div class="adm-two"><div><section class="adm-card"><h2>Stok</h2>' +
        '<form data-form="pengaturan" novalidate><div class="adm-field"><label for="sBatas">Batas "Stok terbatas"</label><input type="number" id="sBatas" min="1" step="1" value="' + set.batas_stok_terbatas + '"><small>Stok 1 sampai angka ini = Stok terbatas. Stok 0 = Habis.</small></div>' +
        '<p class="adm-error" data-error></p><button type="submit" class="btn btn--primary adm-btn-sm">Simpan</button></form></section>' +
        '<section class="adm-card"><h2>Data toko</h2><p class="adm-hint">Nama dan alamat diatur di js/config.js. WhatsApp, Google Maps, dan Instagram diatur di script.js (CONFIG).</p>' +
        "<p><strong>" + esc(cfg.namaToko) + "</strong><br>" + esc(cfg.alamat) + "</p></section></div><div>" +
        '<section class="adm-card"><h2>Penyimpanan data</h2><p class="adm-hint">Mode: <strong>' + esc(api.mode) + "</strong>" + (api.mode === "lokal" ? " (data hanya ada di browser ini, belum ada backend/database)." : ".") + "</p>" +
        '<div class="adm-actions"><button type="button" class="btn btn--ghost adm-btn-sm" data-aksi="ekspor">Ekspor data (JSON)</button>' +
        '<label class="btn btn--ghost adm-btn-sm" style="cursor:pointer">Impor data<input type="file" accept="application/json" id="fileImpor" hidden></label></div>' +
        '<p class="adm-hint" style="margin-top:.8rem">Ekspor tidak menyertakan akun admin. Impor menimpa data produk, promo, jadwal, dan riwayat.</p></section>' +
        '<section class="adm-card"><h2>Reset</h2><p class="adm-hint">Menghapus semua data prototype di browser ini, termasuk akun admin.</p>' +
        '<button type="button" class="btn btn--danger adm-btn-sm" data-aksi="reset">Hapus semua data prototype</button></section></div></div>';
    });
  };

  /* =========================================================
     FORM MODAL
     ========================================================= */
  function formStatus(awal) {
    var now = new Date();
    var pilihan = ["buka", "tutup", "tutup_sementara", "libur"].map(function (k) {
      return '<label class="adm-radio"><input type="radio" name="status" value="' + k + '"' + (k === awal ? " checked" : "") + '><span><span class="dot dot--' + E.KELAS_STATUS[k] + '" aria-hidden="true"></span>' + esc(E.NAMA_STATUS[k]) + "</span></label>";
    }).join("");
    bukaModal("Status khusus",
      '<form data-form="status" novalidate><div class="adm-radio-grid" role="radiogroup" aria-label="Status">' + pilihan + "</div>" +
      '<div class="adm-field"><label for="fAlasan">Alasan</label><input type="text" id="fAlasan" maxlength="140" placeholder="Contoh: Keperluan operasional"></div>' +
      '<div class="adm-field"><label for="fMulai">Mulai</label><input type="datetime-local" id="fMulai" value="' + keInputDT(now) + '"></div>' +
      '<div class="adm-field"><label for="fSampai">Sampai</label><input type="datetime-local" id="fSampai"><small>Kosongkan jika belum tahu. Status akan bertahan sampai Anda memilih "Kembali ke jadwal otomatis".</small></div>' +
      '<p class="adm-error" data-error></p><div class="adm-form__actions"><button type="button" class="btn btn--ghost" data-aksi="tutup-modal">Batal</button><button type="submit" class="btn btn--primary">SIMPAN</button></div></form>');
  }

  function formProduk(p) {
    api.produk.kategori().then(function (kat) {
      p = p || { nama: "", kategori: kat[0].id, harga: "", stok: "", gambar: "" };
      bukaModal(p.id ? "Edit produk" : "Tambah produk",
        '<form data-form="produk" data-id="' + (p.id || "") + '" novalidate>' +
        '<div class="adm-field"><label for="pNama">Nama produk</label><input type="text" id="pNama" value="' + esc(p.nama) + '" required></div>' +
        '<div class="adm-field"><label for="pKat">Kategori</label><select id="pKat">' + kat.map(function (k) { return '<option value="' + esc(k.id) + '"' + (k.id === p.kategori ? " selected" : "") + ">" + esc(k.nama) + "</option>"; }).join("") + "</select></div>" +
        '<div class="adm-field"><label for="pHarga">Harga (Rp)</label><input type="number" id="pHarga" min="0" step="1" value="' + (p.harga === null ? "" : esc(p.harga)) + '"></div>' +
        '<div class="adm-field"><label for="pStok">Stok</label><input type="number" id="pStok" min="0" step="1" value="' + (p.stok === null ? "" : esc(p.stok)) + '"><small>Kosongkan jika stok tidak dilacak. Status Tersedia/Terbatas/Habis dihitung otomatis dari angka ini.</small></div>' +
        '<div class="adm-field"><label for="pGambar">Foto (lokasi file)</label><input type="text" id="pGambar" value="' + esc(p.gambar) + '" placeholder="assets/images/nama-foto.jpg"></div>' +
        '<p class="adm-error" data-error></p><div class="adm-form__actions"><button type="button" class="btn btn--ghost" data-aksi="tutup-modal">Batal</button><button type="submit" class="btn btn--primary">Simpan</button></div></form>');
    });
  }

  function formStok(p) {
    bukaModal("Catat stok: " + p.nama,
      '<p class="adm-hint">Stok saat ini: <strong>' + p.stok + "</strong></p>" +
      '<form data-form="stok" data-id="' + p.id + '" novalidate>' +
      '<div class="adm-field"><label for="sTipe">Jenis pencatatan</label><select id="sTipe"><option value="masuk">Barang masuk (tambah)</option><option value="keluar">Barang keluar (kurangi)</option><option value="penyesuaian">Penyesuaian (isi stok sebenarnya)</option></select></div>' +
      '<div class="adm-field"><label for="sJumlah">Jumlah</label><input type="number" id="sJumlah" min="0" step="1" required></div>' +
      '<div class="adm-field"><label for="sKet">Keterangan</label><input type="text" id="sKet" maxlength="140"></div>' +
      '<p class="adm-error" data-error></p><div class="adm-form__actions"><button type="button" class="btn btn--ghost" data-aksi="tutup-modal">Batal</button><button type="submit" class="btn btn--primary">Simpan</button></div></form>');
  }

  function formPromo(p) {
    p = p || { nama: "", deskripsi: "", mulai: null, selesai: null, aktif: true };
    bukaModal(p.id ? "Edit promo" : "Tambah promo",
      '<form data-form="promo" data-id="' + (p.id || "") + '" novalidate>' +
      '<div class="adm-field"><label for="prNama">Nama promo</label><input type="text" id="prNama" value="' + esc(p.nama) + '" required></div>' +
      '<div class="adm-field"><label for="prDesk">Deskripsi</label><textarea id="prDesk" rows="3">' + esc(p.deskripsi) + "</textarea></div>" +
      '<div class="adm-field"><label for="prMulai">Mulai</label><input type="date" id="prMulai" value="' + keInputTgl(p.mulai) + '"></div>' +
      '<div class="adm-field"><label for="prSelesai">Selesai</label><input type="date" id="prSelesai" value="' + keInputTgl(p.selesai) + '"></div>' +
      '<label class="adm-check"><input type="checkbox" id="prAktif"' + (p.aktif ? " checked" : "") + "> Aktif</label>" +
      '<p class="adm-error" data-error></p><div class="adm-form__actions"><button type="button" class="btn btn--ghost" data-aksi="tutup-modal">Batal</button><button type="submit" class="btn btn--primary">Simpan</button></div></form>');
  }

  /* =========================================================
     AKSI (klik)
     ========================================================= */
  var aksi = {
    "tutup-modal": tutupModal,

    logout: function () { return api.auth.logout().then(mulai); },

    "reset-login": function () {
      return tanya("Hapus data prototype?", "Semua data di browser ini (akun admin, produk, jadwal, riwayat) akan dihapus. Tindakan ini tidak bisa dibatalkan.", "Ya, hapus semua").then(function (ya) {
        if (ya) return api.pengaturan.resetTanpaLogin().then(function () { toast("Data prototype dihapus."); mulai(); });
      });
    },

    "tutup-sekarang": function () {
      return api.operasional.konteks().then(function (ctx) {
        var now = new Date();
        var berikut = ctx.jadwalTerkonfirmasi ? E.bukaBerikutnya(ctx.jadwal, now) : null;
        var teks = berikut ? "Toko ditandai tutup sampai " + esc(E.labelWaktu(berikut, now)) + ", lalu otomatis kembali mengikuti jadwal." : "Toko ditandai tutup sampai Anda memilih \"Kembali ke jadwal otomatis\".";
        return tanya("Tutup toko sekarang?", teks, "Ya, tutup").then(function (ya) {
          if (!ya) return;
          return api.operasional.setStatus({ status: "tutup", mulai: now.toISOString(), selesai: berikut ? berikut.toISOString() : null, alasan: "" }).then(function () { toast("Toko ditandai tutup."); render(); });
        });
      });
    },

    "buka-sekarang": function () {
      return tanya("Buka toko sekarang?", "Toko ditandai buka sampai Anda memilih \"Kembali ke jadwal otomatis\".", "Ya, buka").then(function (ya) {
        if (!ya) return;
        return api.operasional.setStatus({ status: "buka", mulai: new Date().toISOString(), selesai: null, alasan: "" }).then(function () { toast("Toko ditandai buka."); render(); });
      });
    },

    "status-khusus": function (el) { formStatus(el.dataset.status); },

    "kembali-otomatis": function () {
      return api.operasional.kembaliOtomatis().then(function () { toast("Kembali mengikuti jadwal otomatis."); render(); });
    },

    "uji-status": function () {
      var v = $("#simWaktu").value;
      if (!v) { toast("Isi waktu simulasi.", true); return; }
      return api.operasional.konteks().then(function (ctx) {
        var s = E.hitungStatus(ctx, new Date(v));
        $("#simHasil").innerHTML = badge(s.kelas, s.label) + '<p style="margin:.6rem 0 0"><strong>' + esc(s.judul) + "</strong><br>" + s.baris.map(esc).join("<br>") + "</p>";
      });
    },

    rentang: function (el) { lapor.rentang = el.dataset.rentang; render(); },

    "tambah-produk": function () { formProduk(null); },
    "edit-produk": function (el) { return api.produk.daftar().then(function (l) { var p = l.filter(function (x) { return x.id === Number(el.dataset.id); })[0]; if (p) formProduk(p); }); },
    "hapus-produk": function (el) {
      return tanya("Hapus produk?", "Produk akan dihapus dari daftar.", "Ya, hapus").then(function (ya) {
        if (ya) return api.produk.hapus(Number(el.dataset.id)).then(function () { toast("Produk dihapus."); render(); });
      });
    },
    "catat-stok": function (el) { return api.produk.daftar().then(function (l) { var p = l.filter(function (x) { return x.id === Number(el.dataset.id); })[0]; if (p) formStok(p); }); },

    "tambah-promo": function () { formPromo(null); },
    "edit-promo": function (el) { return api.promo.daftar().then(function (l) { var p = l.filter(function (x) { return x.id === Number(el.dataset.id); })[0]; if (p) formPromo(p); }); },
    "hapus-promo": function (el) {
      return tanya("Hapus promo?", "Promo akan dihapus.", "Ya, hapus").then(function (ya) {
        if (ya) return api.promo.hapus(Number(el.dataset.id)).then(function () { toast("Promo dihapus."); render(); });
      });
    },

    ekspor: function () {
      return api.pengaturan.ekspor().then(function (teks) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([teks], { type: "application/json" }));
        a.download = "supra-ghina-data-" + keInputTgl(new Date().toISOString()) + ".json";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        toast("Data diekspor.");
      });
    },

    reset: function () {
      return tanya("Hapus semua data prototype?", "Akun admin, produk, promo, jadwal, dan riwayat di browser ini akan dihapus.", "Ya, hapus semua").then(function (ya) {
        if (ya) return api.pengaturan.reset().then(function () { toast("Data dihapus."); mulai(); });
      });
    }
  };

  document.addEventListener("click", function (e) {
    var el = e.target.closest("[data-aksi]");
    if (!el || !aksi[el.dataset.aksi]) return;
    e.preventDefault();
    jalankan(function () { return aksi[el.dataset.aksi](el); });
  });

  /* =========================================================
     FORM SUBMIT
     ========================================================= */
  var formAksi = {
    setup: function (f) {
      var sandi = $("#aSandi", f).value;
      if (sandi !== $("#aSandi2", f).value) { setGalat(f, "Kata sandi dan ulangannya tidak sama."); return; }
      return api.auth.buatAdminPertama({ nama: $("#aNama", f).value, email: $("#aEmail", f).value, sandi: sandi }).then(mulai);
    },
    login: function (f) { return api.auth.login($("#aEmail", f).value, $("#aSandi", f).value).then(mulai); },

    jadwal: function (f) {
      var baris = E.URUTAN_HARI.map(function (h) {
        return { hari: h, aktif: f.elements["aktif-" + h].checked, jam_buka: f.elements["buka-" + h].value, jam_tutup: f.elements["tutup-" + h].value };
      });
      return api.operasional.simpanJadwal(baris).then(function () { toast("Jadwal disimpan."); render(); });
    },

    status: function (f) {
      var st = f.elements.status.value;
      var mulai = $("#fMulai", f).value, sampai = $("#fSampai", f).value;
      return api.operasional.setStatus({ status: st, alasan: $("#fAlasan", f).value, mulai: mulai ? new Date(mulai).toISOString() : null, selesai: sampai ? new Date(sampai).toISOString() : null })
        .then(function () { tutupModal(); toast("Status disimpan: " + E.NAMA_STATUS[st] + "."); render(); });
    },

    produk: function (f) {
      var id = f.dataset.id ? Number(f.dataset.id) : null;
      return api.produk.simpan({ id: id, nama: $("#pNama", f).value, kategori: $("#pKat", f).value, harga: $("#pHarga", f).value, stok: $("#pStok", f).value, gambar: $("#pGambar", f).value })
        .then(function () { tutupModal(); toast("Produk disimpan."); render(); });
    },

    stok: function (f) {
      return api.stok.catat({ product_id: Number(f.dataset.id), tipe: $("#sTipe", f).value, jumlah: $("#sJumlah", f).value, keterangan: $("#sKet", f).value })
        .then(function () { tutupModal(); toast("Stok dicatat."); render(); });
    },

    promo: function (f) {
      var id = f.dataset.id ? Number(f.dataset.id) : null;
      return api.promo.simpan({ id: id, nama: $("#prNama", f).value, deskripsi: $("#prDesk", f).value, mulai: tglLokal($("#prMulai", f).value), selesai: tglLokal($("#prSelesai", f).value, true), aktif: $("#prAktif", f).checked })
        .then(function () { tutupModal(); toast("Promo disimpan."); render(); });
    },

    rentang: function (f) {
      var a = $("#lAwal", f).value, z = $("#lAkhir", f).value;
      if (!a || !z) { toast("Isi tanggal awal dan akhir.", true); return; }
      if (a > z) { toast("Tanggal awal harus sebelum tanggal akhir.", true); return; }
      lapor.awal = a; lapor.akhir = z; render();
    },

    pengaturan: function (f) {
      return api.pengaturan.simpan({ batas_stok_terbatas: $("#sBatas", f).value }).then(function () { toast("Pengaturan disimpan."); render(); });
    }
  };

  document.addEventListener("submit", function (e) {
    var f = e.target.closest("form[data-form]");
    if (!f) return;
    e.preventDefault();
    setGalat(f, "");
    var fn = formAksi[f.dataset.form];
    if (!fn) return;
    Promise.resolve().then(function () { return fn(f); }).catch(function (err) {
      if (err && /login/i.test(err.message) && f.dataset.form !== "login") { mulai(); return; }
      setGalat(f, (err && err.message) || "Terjadi kesalahan.");
    });
  });

  // Centang "Buka" mengaktifkan/menonaktifkan input jam pada baris itu
  document.addEventListener("change", function (e) {
    var cb = e.target;
    if (cb.type === "checkbox" && cb.name && cb.name.indexOf("aktif-") === 0) {
      cb.closest(".adm-sched__row").querySelectorAll("input[type=time]").forEach(function (t) { t.disabled = !cb.checked; });
    }
    if (cb.id === "fileImpor" && cb.files[0]) {
      var rd = new FileReader();
      rd.onload = function () {
        tanya("Impor data?", "Data produk, promo, jadwal, dan riwayat saat ini akan diganti dengan isi file.", "Ya, impor").then(function (ya) {
          if (ya) jalankan(function () { return api.pengaturan.impor(String(rd.result)).then(function () { toast("Data diimpor."); render(); }); });
        });
      };
      rd.readAsText(cb.files[0]);
      cb.value = "";
    }
  });

  /* =========================================================
     ROUTER & KERANGKA
     ========================================================= */
  var side = $("#side"), scrim = $("#scrim"), sideToggle = $("#sideToggle");
  function setSide(buka) {
    side.classList.toggle("is-open", buka);
    scrim.hidden = !buka;
    sideToggle.setAttribute("aria-expanded", String(buka));
  }
  sideToggle.addEventListener("click", function () { setSide(!side.classList.contains("is-open")); });
  scrim.addEventListener("click", function () { setSide(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setSide(false); });

  function rute() {
    var r = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
    return halaman[r] ? r : "dashboard";
  }

  function render() {
    var r = rute();
    document.querySelectorAll("#adminNav a").forEach(function (a) {
      var aktif = a.dataset.route === r;
      a.classList.toggle("is-active", aktif);
      if (aktif) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("#pageTitle").textContent = JUDUL[r];
    document.title = JUDUL[r] + " | Admin Supra Ghina";
    setSide(false);
    return halaman[r]().then(function (html) { view.innerHTML = html; }).catch(function (e) {
      if (e && /login/i.test(e.message)) { mulai(); return; }
      view.innerHTML = '<div class="adm-notice adm-notice--warn"><p>' + esc((e && e.message) || "Gagal memuat halaman.") + "</p></div>";
    });
  }
  window.addEventListener("hashchange", render);

  // Status berganti sendiri saat jam buka/tutup tiba (tanpa menyentuh form yang sedang diisi)
  setInterval(function () {
    var kartu = $("#statusCard");
    if (!kartu || modal.open) return;
    api.operasional.konteks().then(function (ctx) {
      var tmp = document.createElement("div");
      tmp.innerHTML = htmlStatusCard(ctx, E.hitungStatus(ctx, new Date()));
      var baru = tmp.firstChild;
      if ($("#statusCard") && baru.outerHTML !== $("#statusCard").outerHTML) $("#statusCard").replaceWith(baru);
    }).catch(function () { /* abaikan */ });
  }, 30000);

  function mulai() {
    tutupModal();
    return api.auth.adaAdmin().then(function (ada) {
      var u = api.auth.sesi();
      if (!u) { tampilAuth(ada); return; }
      $("#authView").hidden = true;
      $("#appView").hidden = false;
      $("#userInfo").textContent = u.nama + " (" + u.role + ")";
      return render();
    });
  }

  mulai();
})();
