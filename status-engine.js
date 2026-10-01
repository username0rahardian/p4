/* =========================================================
   SUPRA GHINA - js/status-engine.js
   Logika murni (tanpa DOM, tanpa penyimpanan):
   - hitungStatus  : status toko dari jadwal + status manual + waktu
   - statusStok    : status produk dari angka stok
   - laporan       : ringkasan operasional per rentang tanggal
   Dipakai oleh website publik DAN Admin Dashboard.
   Saat backend dibuat, logika yang sama bisa dipindahkan ke server.
   ========================================================= */
(function (g) {
  "use strict";
  var SG = (g.SG = g.SG || {});

  var NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  var NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  var URUTAN_HARI = [1, 2, 3, 4, 5, 6, 0]; // tampilan Senin..Minggu
  var STATUS_MANUAL = ["buka", "tutup", "tutup_sementara", "libur"];
  var NAMA_STATUS = { buka: "Buka", tutup: "Tutup", tutup_sementara: "Tutup sementara", libur: "Libur", belum_diatur: "Belum diatur" };
  var KELAS_STATUS = { buka: "buka", tutup: "tutup", tutup_sementara: "sementara", libur: "libur", belum_diatur: "libur" };
  var JUDUL_STATUS = { buka: "Buka sekarang", tutup: "Sedang tutup", tutup_sementara: "Tutup sementara", libur: "Libur", belum_diatur: "Jam operasional belum diatur" };

  /* ---------- helper waktu ---------- */
  function pad(n) { return String(n).padStart(2, "0"); }
  function keMenit(hhmm) { var p = String(hhmm).split(":"); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function formatJam(hhmm) { return String(hhmm).replace(":", "."); }
  function jamDate(d) { return pad(d.getHours()) + "." + pad(d.getMinutes()); }
  function awalHari(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function tambahHari(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function sama(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); }
  function tanggalPanjang(d) { return pad(d.getDate()) + " " + NAMA_BULAN[d.getMonth()] + " " + d.getFullYear(); }
  function tanggalJam(d) { return tanggalPanjang(d) + ", " + jamDate(d); }

  function labelWaktu(target, now) {
    if (sama(target, now)) return "pukul " + jamDate(target);
    if (sama(target, tambahHari(now, 1))) return "besok pukul " + jamDate(target);
    return NAMA_HARI[target.getDay()] + ", " + pad(target.getDate()) + " " + NAMA_BULAN[target.getMonth()] + " pukul " + jamDate(target);
  }

  function durasiTeks(menit) {
    var j = Math.floor(menit / 60), m = Math.round(menit % 60);
    if (!j && !m) return "0 jam";
    if (!m) return j + " jam";
    if (!j) return m + " menit";
    return j + " jam " + m + " menit";
  }
  function menitKeJam(menit) { return pad(Math.floor(menit / 60)) + "." + pad(Math.round(menit % 60)); }

  /* ---------- jadwal ---------- */
  function recHari(jadwal, hari) {
    for (var i = 0; i < jadwal.length; i++) if (Number(jadwal[i].hari) === hari) return jadwal[i];
    return null;
  }

  // Waktu buka terdekat SETELAH "dari" (null jika tidak ada dalam 8 hari)
  function bukaBerikutnya(jadwal, dari) {
    for (var i = 0; i <= 7; i++) {
      var hari = tambahHari(awalHari(dari), i);
      var rec = recHari(jadwal, hari.getDay());
      if (!rec || !rec.aktif) continue;
      var m = keMenit(rec.jam_buka);
      var buka = new Date(hari);
      buka.setHours(Math.floor(m / 60), m % 60, 0, 0);
      if (buka > dari) return buka;
    }
    return null;
  }

  // Ringkas jadwal: ["Senin - Minggu: 07.00 - 21.00"] (hari berurutan yang sama digabung)
  function ringkasJadwal(jadwal) {
    var baris = [], awal = null, prev = null;
    function teks(r) { return r && r.aktif ? formatJam(r.jam_buka) + " - " + formatJam(r.jam_tutup) : "Libur"; }
    function tutupGrup() {
      if (!awal) return;
      var a = NAMA_HARI[awal.hari], b = NAMA_HARI[prev.hari];
      baris.push((a === b ? a : a + " - " + b) + ": " + teks(awal.rec));
    }
    URUTAN_HARI.forEach(function (h) {
      var rec = recHari(jadwal, h);
      if (awal && teks(rec) === teks(awal.rec)) { prev = { hari: h, rec: rec }; return; }
      tutupGrup();
      awal = { hari: h, rec: rec }; prev = awal;
    });
    tutupGrup();
    return baris;
  }

  /* ---------- status toko ---------- */
  function overrideAktif(ov, now) {
    if (!ov) return false;
    if (STATUS_MANUAL.indexOf(ov.status) < 0) return false;
    if (new Date(ov.mulai) > now) return false;
    if (ov.selesai && now >= new Date(ov.selesai)) return false;
    return true;
  }

  function hasil(kode, sumber, baris, extra) {
    var r = {
      kode: kode, sumber: sumber,
      label: NAMA_STATUS[kode], kelas: KELAS_STATUS[kode], judul: JUDUL_STATUS[kode],
      baris: baris.filter(Boolean), alasan: "", kembali: null
    };
    if (extra) for (var k in extra) r[k] = extra[k];
    return r;
  }

  /*
    ctx = { jadwal: [{hari, jam_buka, jam_tutup, aktif}], jadwalTerkonfirmasi: bool,
            override: {status, alasan, mulai, selesai} | null }
    Prioritas: status manual aktif > jadwal otomatis.
  */
  function hitungStatus(ctx, now) {
    now = now || new Date();
    var jadwal = ctx.jadwal || [];
    var ov = ctx.override;

    if (overrideAktif(ov, now)) {
      var selesai = ov.selesai ? new Date(ov.selesai) : null;
      var alasan = (ov.alasan || "").trim();
      switch (ov.status) {
        case "buka":
          return hasil("buka", "manual", [selesai ? "Buka sampai " + labelWaktu(selesai, now) : "Toko sedang buka"], { alasan: alasan, kembali: selesai });
        case "tutup":
          return hasil("tutup", "manual", [alasan, selesai ? "Buka kembali " + labelWaktu(selesai, now) : "Belum ada informasi jam buka kembali."], { alasan: alasan, kembali: selesai });
        case "tutup_sementara":
          return hasil("tutup_sementara", "manual", [alasan, selesai ? "Buka kembali " + labelWaktu(selesai, now) : (alasan ? "" : "Hubungi kami untuk informasi lebih lanjut.")], { alasan: alasan, kembali: selesai });
        case "libur":
          return hasil("libur", "manual", [alasan, selesai ? "Buka kembali " + labelWaktu(selesai, now) : ""], { alasan: alasan, kembali: selesai });
      }
    }

    if (!ctx.jadwalTerkonfirmasi || !jadwal.length) {
      return hasil("belum_diatur", "jadwal", ["Hubungi kami untuk informasi jam buka."]);
    }

    var rec = recHari(jadwal, now.getDay());
    var menit = now.getHours() * 60 + now.getMinutes();
    var berikut;

    if (!rec || !rec.aktif) {
      berikut = bukaBerikutnya(jadwal, now);
      return hasil("libur", "jadwal", ["Hari ini libur", berikut ? "Buka kembali " + labelWaktu(berikut, now) : ""], { kembali: berikut });
    }
    if (menit >= keMenit(rec.jam_buka) && menit < keMenit(rec.jam_tutup)) {
      var tutup = new Date(now);
      tutup.setHours(0, keMenit(rec.jam_tutup), 0, 0);
      return hasil("buka", "jadwal", ["Buka sampai pukul " + formatJam(rec.jam_tutup)], { kembali: null, tutupPukul: tutup });
    }
    berikut = bukaBerikutnya(jadwal, now);
    return hasil("tutup", "jadwal", [berikut ? "Buka kembali " + labelWaktu(berikut, now) : ""], { kembali: berikut });
  }

  /* ---------- status stok ---------- */
  // stok kosong/null = stok tidak dilacak (tidak ada label status)
  function statusStok(stok, batas) {
    batas = batas == null ? 5 : Number(batas);
    if (stok === null || stok === undefined || stok === "") return { kode: "tidak_dilacak", label: "", kelas: "libur", tersedia: true };
    stok = Number(stok);
    if (stok <= 0) return { kode: "habis", label: "Habis", kelas: "tutup", tersedia: false };
    if (stok <= batas) return { kode: "terbatas", label: "Stok terbatas", kelas: "sementara", tersedia: true };
    return { kode: "tersedia", label: "Tersedia", kelas: "buka", tersedia: true };
  }

  /* ---------- laporan operasional ---------- */
  var KODE = { tutup: 0, buka: 1, tutupManual: 2, sementara: 3, libur: 4 };

  // Peta 1440 menit untuk satu hari: jadwal dasar, lalu ditimpa status manual (log)
  function petaHari(hari, jadwal, logs) {
    var peta = new Uint8Array(1440);
    var rec = recHari(jadwal, hari.getDay());
    if (!rec || !rec.aktif) peta.fill(KODE.libur);
    else {
      var b = keMenit(rec.jam_buka), t = keMenit(rec.jam_tutup);
      for (var i = b; i < t && i < 1440; i++) peta[i] = KODE.buka;
    }
    var mulaiHari = hari.getTime(), akhirHari = mulaiHari + 86400000;
    logs.forEach(function (l) {
      if (STATUS_MANUAL.indexOf(l.status) < 0) return;
      var s = Math.max(new Date(l.waktu_mulai).getTime(), mulaiHari);
      var e = Math.min(l.waktu_selesai ? new Date(l.waktu_selesai).getTime() : Infinity, akhirHari);
      if (s >= e) return;
      var kode = l.status === "buka" ? KODE.buka : l.status === "tutup" ? KODE.tutupManual : l.status === "libur" ? KODE.libur : KODE.sementara;
      var a = Math.floor((s - mulaiHari) / 60000), z = Math.min(Math.ceil((e - mulaiHari) / 60000), 1440);
      if (z > a) peta.fill(kode, a, z);
    });
    return peta;
  }

  function rentangPreset(nama, now) {
    now = now || new Date();
    var hariIni = awalHari(now);
    if (nama === "hari") return { awal: hariIni, akhir: hariIni };
    if (nama === "minggu") {
      var selisih = (hariIni.getDay() + 6) % 7; // Senin = awal minggu
      return { awal: tambahHari(hariIni, -selisih), akhir: hariIni };
    }
    return { awal: new Date(hariIni.getFullYear(), hariIni.getMonth(), 1), akhir: hariIni };
  }

  /*
    Menghitung dari JADWAL SAAT INI + riwayat status manual, hanya sampai waktu "now".
    Catatan: ini bukan jam aktual. Jam aktual baru ada jika shift kasir sudah terhubung.
  */
  function laporan(ctx, awal, akhir, now) {
    now = now || new Date();
    var jadwal = ctx.jadwal || [], logs = ctx.logs || [];
    var logsUrut = logs.slice().sort(function (a, b) { return new Date(a.waktu_mulai) - new Date(b.waktu_mulai) || (a.id - b.id); });
    var r = { hariBuka: 0, hariLibur: 0, kaliTutupSementara: 0, menitBuka: 0, rataBuka: null, rataTutup: null };
    var sumBuka = 0, sumTutup = 0;

    var d = awalHari(awal), batasAkhir = awalHari(akhir);
    var jumlahHari = 0;
    while (d <= batasAkhir && d <= now && jumlahHari < 400) {
      var peta = petaHari(d, jadwal, logsUrut);
      var batas = sama(d, now) ? now.getHours() * 60 + now.getMinutes() : 1440;
      var buka = 0, pertama = -1, terakhir = -1, libur = 0;
      for (var i = 0; i < batas; i++) {
        if (peta[i] === KODE.buka) { buka++; if (pertama < 0) pertama = i; terakhir = i + 1; }
        else if (peta[i] === KODE.libur) libur++;
      }
      if (buka > 0) { r.hariBuka++; r.menitBuka += buka; sumBuka += pertama; sumTutup += terakhir; }
      else if (libur > 0) r.hariLibur++;
      d = tambahHari(d, 1); jumlahHari++;
    }
    if (r.hariBuka) { r.rataBuka = menitKeJam(sumBuka / r.hariBuka); r.rataTutup = menitKeJam(sumTutup / r.hariBuka); }

    var a = awalHari(awal).getTime(), z = Math.min(awalHari(akhir).getTime() + 86400000, now.getTime());
    logsUrut.forEach(function (l) {
      if (l.status !== "tutup_sementara") return;
      var s = new Date(l.waktu_mulai).getTime();
      var e = l.waktu_selesai ? new Date(l.waktu_selesai).getTime() : Infinity;
      if (e > s && s < z && e > a) r.kaliTutupSementara++;
    });
    return r;
  }

  SG.engine = {
    NAMA_HARI: NAMA_HARI, NAMA_BULAN: NAMA_BULAN, URUTAN_HARI: URUTAN_HARI,
    STATUS_MANUAL: STATUS_MANUAL, NAMA_STATUS: NAMA_STATUS, KELAS_STATUS: KELAS_STATUS,
    pad: pad, keMenit: keMenit, formatJam: formatJam, jamDate: jamDate,
    awalHari: awalHari, tambahHari: tambahHari, sama: sama,
    tanggalPanjang: tanggalPanjang, tanggalJam: tanggalJam, labelWaktu: labelWaktu,
    durasiTeks: durasiTeks, recHari: recHari, bukaBerikutnya: bukaBerikutnya,
    ringkasJadwal: ringkasJadwal, overrideAktif: overrideAktif,
    hitungStatus: hitungStatus, statusStok: statusStok,
    rentangPreset: rentangPreset, laporan: laporan
  };
})(window);
