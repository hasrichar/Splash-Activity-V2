/* =========================================================
   MODUL KEUANGAN (static/js/finance.js)
   Format Kurensi Otomatis: IDR Titik Ribuan & Koma Desimal
   ========================================================= */

var transactionsCache = [];

/* 1. Fungsi Cadangan Keamanan Teks HTML */
function safeEscapeHtml(str) {
  if (typeof escapeHtml === "function") {
    return escapeHtml(str);
  }
  return String(str || "").replace(/[&<>"']/g, function(m) {
    return ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[m];
  });
}

/* 2. Fungsi Format Tampilan Angka ke "IDR 25.000" atau "IDR 25.000,50" */
function formatIdrCurrency(num) {
  var n = parseFloat(num || 0);
  if (isNaN(n)) n = 0;

  var isNeg = n < 0;
  var absVal = Math.abs(n);
  var hasDecimal = (absVal % 1) !== 0;

  var parts = absVal.toFixed(hasDecimal ? 2 : 0).split(".");
  var intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  var decPart = (parts.length > 1 && hasDecimal) ? "," + parts[1] : "";

  return (isNeg ? "-IDR " : "IDR ") + intPart + decPart;
}

/* Sinkronkan dengan fungsi global jika dipanggil dari tempat lain */
window.formatRupiah = formatIdrCurrency;

/* 3. Format Real-Time Saat Pengguna Mengetik di Kolom Nominal */
function formatIdrLiveInput(inputEl) {
  if (!inputEl) return;
  var raw = inputEl.value || "";

  // Hanya izinkan angka 0-9 dan tanda koma (,) untuk desimal
  var cleaned = raw.replace(/[^0-9,]/g, "");
  if (!cleaned) {
    inputEl.value = "";
    return;
  }

  // Pisahkan bagian ribuan (sebelum koma) dan desimal (setelah koma)
  var commaParts = cleaned.split(",");
  var intRaw = commaParts[0].replace(/^0+(?=\d)/, "");
  if (intRaw === "" && commaParts.length > 1) {
    intRaw = "0";
  }

  // Tambahkan titik setiap 3 digit ribuan
  var formattedInt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  var finalDisplay = "IDR " + formattedInt;

  // Jika pengguna mengetik tanda koma, tambahkan maksimal 2 angka desimal
  if (commaParts.length > 1) {
    var decPart = commaParts.slice(1).join("").slice(0, 2);
    finalDisplay += "," + decPart;
  }

  inputEl.value = finalDisplay;
}

/* 4. Ubah String "IDR 25.000,50" Menjadi Angka Murni (25000.5) untuk MongoDB */
function parseIdrStringToNumber(str) {
  if (!str) return 0;
  var onlyNumAndComma = String(str).replace(/[^0-9,]/g, "");
  if (!onlyNumAndComma) return 0;

  var parts = onlyNumAndComma.split(",");
  var intPart = parts[0] || "0";
  var decPart = parts.length > 1 ? "." + parts[1].slice(0, 2) : "";

  var parsed = parseFloat(intPart + decPart);
  return isNaN(parsed) ? 0 : parsed;
}

/* 5. Ambil Data Transaksi dari Server Flask (MongoDB) */
function loadTransactions() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/transactions?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var res = JSON.parse(xhr.responseText);
        transactionsCache = res.transactions || [];
        renderFinanceUI(transactionsCache);
      } catch (e) {
        console.error("Gagal membaca JSON transaksi:", e);
      }
    }
  };
  xhr.send();
}

/* 6. Simpan Transaksi Baru ke Server Flask (MongoDB) */
function addTransaction() {
  var typeEl = document.getElementById("tx-type");
  var catEl = document.getElementById("tx-cat");
  var amountEl = document.getElementById("tx-amount");
  var noteEl = document.getElementById("tx-note");

  if (!typeEl || !catEl || !amountEl) return;

  var type = typeEl.value;
  var category = catEl.value;
  var amountVal = parseIdrStringToNumber(amountEl.value);
  var note = (noteEl && noteEl.value.trim()) ? noteEl.value.trim() : category;

  if (!amountVal || amountVal <= 0) {
    alert("Masukkan nominal IDR yang valid (Contoh: IDR 25.000).");
    amountEl.focus();
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/transactions", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      amountEl.value = "";
      if (noteEl) noteEl.value = "";
      loadTransactions();
    } else {
      alert("Gagal menyimpan transaksi ke database.");
    }
  };
  xhr.onerror = function() {
    alert("Koneksi ke server terputus.");
  };
  xhr.send(JSON.stringify({
    type: type,
    category: category,
    amount: amountVal,
    note: note
  }));
}

/* 7. Hapus Transaksi Berdasarkan ID */
function deleteTransaction(id) {
  if (!id) return;
  if (!confirm("Hapus catatan transaksi ini?")) return;

  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/transactions/" + encodeURIComponent(id), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      loadTransactions();
    }
  };
  xhr.send();
}

/* 8. Render Daftar Riwayat & Ringkasan Saldo ke Layar */
function renderFinanceUI(items) {
  var totalIn = 0;
  var totalOut = 0;
  var listEl = document.getElementById("tx-list");
  if (!listEl) return;

  listEl.innerHTML = "";

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var amt = parseFloat(it.amount || 0);
    if (it.type === "IN") {
      totalIn += amt;
    } else {
      totalOut += amt;
    }

    var isIncome = (it.type === "IN");
    var signPrefix = isIncome ? "+ " : "- ";
    var amtClass = isIncome ? "amt-in" : "amt-out";

    var row = document.createElement("div");
    row.className = "tx-row-item";
    row.innerHTML =
      '<div class="tx-cell-info">' +
        '<div style="font-weight:700; color:var(--text-dark);">' + safeEscapeHtml(it.note) + '</div>' +
        '<div style="font-size:11px; color:var(--text-muted);">' + safeEscapeHtml(it.category) + ' &bull; ' + safeEscapeHtml(it.date) + '</div>' +
      '</div>' +
      '<div class="tx-cell-amt">' +
        '<span class="' + amtClass + '">' + signPrefix + formatIdrCurrency(amt) + '</span>' +
        '<button type="button" class="pill-mini-btn" onclick="deleteTransaction(\'' + safeEscapeHtml(it.id) + '\')">X</button>' +
      '</div>';
    listEl.appendChild(row);
  }

  if (items.length === 0) {
    listEl.innerHTML =
      '<div style="text-align:center; color:var(--text-light); padding:16px 10px;">' +
        'Belum ada riwayat transaksi.' +
      '</div>';
  }

  var balanceEl = document.getElementById("total-balance");
  var incomeEl = document.getElementById("total-income");
  var expenseEl = document.getElementById("total-expense");
  var countEl = document.getElementById("tx-count-label");

  if (balanceEl) balanceEl.textContent = formatIdrCurrency(totalIn - totalOut);
  if (incomeEl) incomeEl.textContent = formatIdrCurrency(totalIn);
  if (expenseEl) expenseEl.textContent = formatIdrCurrency(totalOut);
  if (countEl) countEl.textContent = items.length + " Transaksi";
}

/* 9. Inisialisasi Otomatis Saat Halaman Finance Dibuka */
window.addEventListener("load", function() {
  var amountInput = document.getElementById("tx-amount");
  if (amountInput) {
    // Pastikan format IDR langsung aktif meskipun atribut oninput di HTML belum terpasang
    amountInput.addEventListener("input", function() {
      formatIdrLiveInput(this);
    });
  }

  var noteInput = document.getElementById("tx-note");
  if (noteInput) {
    noteInput.addEventListener("keypress", function(e) {
      if ((e.keyCode || e.which) === 13) {
        e.preventDefault();
        addTransaction();
      }
    });
  }

  loadTransactions();
});