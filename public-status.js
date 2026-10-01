/* =========================================================
   SUPRA GHINA - js/public-status.js
   Menampilkan status BUKA / TUTUP / TUTUP SEMENTARA / LIBUR
   di website publik (navbar, hero, kontak, footer) dan jendela
   "Jam Operasional".

   Cara uji cepat tanpa mengubah jam komputer:
   buka  index.html?simulasi=2026-10-05T22:00
   ========================================================= */
(function (g, d) {
  "use strict";
  var SG = g.SG;
  if (!SG || !SG.api || !SG.engine) return;
  var E = SG.engine;

  var KETERANGAN = {
    buka: "Buka", tutup: "Tutup", tutup_sementara: "Tutup sementara", libur: "Libur", belum_diatur: "Jam belum diatur"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- waktu (mendukung ?simulasi=) ---------- */
  var simulasi = null;
  try {
    var p = new URLSearchParams(g.location.search).get("simulasi");
    if (p) { var t = new Date(p); if (!isNaN(t.getTime())) simulasi = t; }
  } catch (e) { /* abaikan */ }
  function sekarang() { return simulasi ? new Date(simulasi.getTime()) : new Date(); }

  var terakhir = null; // { ctx, status }

  /* ---------- tampilan ---------- */
  function titik(kelas) { return '<span class="dot dot--' + kelas + '" aria-hidden="true"></span>'; }

  function htmlPill(s) {
    return '<button type="button" class="status-pill status-pill--' + s.kelas + '" data-buka-jam aria-haspopup="dialog">' +
      titik(s.kelas) + '<span>' + esc(s.kode === "buka" ? "Buka sekarang" : KETERANGAN[s.kode]) + '</span></button>';
  }

  function htmlKartu(s) {
    var baris = s.baris.map(function (b) { return "<span>" + esc(b) + "</span>"; }).join("");
    return '<div class="status-card status-card--' + s.kelas + '">' +
      '<p class="status-card__title">' + titik(s.kelas) + '<strong>' + esc(s.judul) + '</strong></p>' +
      '<p class="status-card__lines">' + baris + '</p>' +
      '<button type="button" class="status-card__link" data-buka-jam aria-haspopup="dialog">Lihat jam operasional</button></div>';
  }

  function htmlBaris(s) {
    return titik(s.kelas) + '<strong>' + esc(s.judul) + '</strong>' + (s.baris[0] ? '<span class="status-line__detail">' + esc(s.baris[0]) + "</span>" : "");
  }

  function render(ctx, s) {
    d.querySelectorAll('[data-status="pill"]').forEach(function (el) { el.innerHTML = htmlPill(s); });
    d.querySelectorAll('[data-status="kartu"]').forEach(function (el) { el.innerHTML = htmlKartu(s); });
    d.querySelectorAll('[data-status="baris"]').forEach(function (el) { el.innerHTML = htmlBaris(s); });

    // Baris jam operasional di bagian Kontak (tidak menimpa jika sudah diisi lewat script.js)
    if (ctx.jadwalTerkonfirmasi && ctx.jadwal.length) {
      d.querySelectorAll('[data-isi="jam"]').forEach(function (el) {
        el.classList.remove("placeholder");
        el.classList.add("is-filled");
        el.innerHTML = E.ringkasJadwal(ctx.jadwal).map(esc).join("<br>");
      });
    }
    var dlg = d.getElementById("jamDialog");
    if (dlg && dlg.open) isiDialog();
  }

  function isiDialog() {
    if (!terakhir) return;
    var ctx = terakhir.ctx, s = terakhir.status, now = sekarang();
    var el = d.getElementById("jamDialogIsi");
    if (!el) return;

    var tabel = "";
    if (ctx.jadwalTerkonfirmasi && ctx.jadwal.length) {
      tabel = '<table class="jam-table"><tbody>' + E.URUTAN_HARI.map(function (h) {
        var r = E.recHari(ctx.jadwal, h);
        var teks = r && r.aktif ? E.formatJam(r.jam_buka) + " - " + E.formatJam(r.jam_tutup) : "Libur";
        return '<tr' + (h === now.getDay() ? ' class="jam-table__today"' : "") + "><th scope=\"row\">" + E.NAMA_HARI[h] + "</th><td>" + teks + "</td></tr>";
      }).join("") + "</tbody></table>";
    } else {
      tabel = '<p class="placeholder">[JAM OPERASIONAL]</p><p class="jam-note">Jam operasional belum diumumkan. Silakan hubungi kami.</p>';
    }

    el.innerHTML =
      '<p class="jam-status">' + titik(s.kelas) + "<strong>" + esc(s.judul) + "</strong></p>" +
      (s.baris.length ? '<p class="jam-detail">' + s.baris.map(esc).join("<br>") + "</p>" : "") +
      tabel +
      (simulasi ? '<p class="jam-note">Mode simulasi waktu: ' + esc(E.tanggalJam(simulasi)) + "</p>" : "");
  }

  /* ---------- ambil data & hitung ---------- */
  function segarkan() {
    SG.api.publik.konteksStatus().then(function (ctx) {
      var s = E.hitungStatus(ctx, sekarang());
      terakhir = { ctx: ctx, status: s };
      render(ctx, s);
    }).catch(function () {
      var ctx = { jadwal: [], jadwalTerkonfirmasi: false, override: null };
      var s = E.hitungStatus(ctx, sekarang());
      terakhir = { ctx: ctx, status: s };
      render(ctx, s);
    });
  }

  /* ---------- jendela jam operasional ---------- */
  var dialog = d.getElementById("jamDialog");
  d.addEventListener("click", function (e) {
    if (e.target.closest("[data-buka-jam]")) {
      if (dialog && typeof dialog.showModal === "function") { isiDialog(); dialog.showModal(); }
    } else if (dialog && e.target === dialog) {
      dialog.close();
    } else if (e.target.closest("[data-tutup-jam]") && dialog) {
      dialog.close();
    }
  });

  if (simulasi) {
    var banner = d.createElement("div");
    banner.className = "sim-banner";
    banner.textContent = "Simulasi waktu: " + E.tanggalJam(simulasi);
    d.body.appendChild(banner);
  }

  segarkan();
  if (!simulasi) setInterval(segarkan, 30000);               // status berganti otomatis saat jam buka/tutup
  g.addEventListener("storage", segarkan);                    // admin mengubah data di tab lain
  d.addEventListener("visibilitychange", function () { if (!d.hidden) segarkan(); });
})(window, document);
