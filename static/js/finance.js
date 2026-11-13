/* =========================================================
   MODUL FINANCE VAULT (static/js/finance.js)
   5 Fitur Utama + Pure ES5 (Safari iOS 10.3.4 Compatible)
   ========================================================= */

var transactionsCache = [];
var accountsCache = [];
var budgetsCache = [];
var billsCache = [];
var receiptBase64 = "";
var activeMonthFilter = "ALL";

/* Palet Warna Kategori untuk Diagram */
var CATEGORY_COLORS = {
  "Makan & Kopi": "#F59E0B",
  "Kebutuhan": "#3B82F6",
  "Tagihan & Cicilan": "#EF4444",
  "Hardware/IT": "#8B5CF6",
  "Investasi": "#10B981",
  "Gaji/Proyek": "#14B8A6",
  "Transfer Antar Rekening": "#3B82F6",
  "Lainnya": "#64748B"
};

var CATEGORY_ICONS = {
  "Makan & Kopi": "☕",
  "Kebutuhan": "🛒",
  "Tagihan & Cicilan": "🔔",
  "Hardware/IT": "💻",
  "Investasi": "📈",
  "Gaji/Proyek": "💰",
  "Transfer Antar Rekening": "⇄",
  "Lainnya": "💳"
};

/* 1. Cadangan Keamanan Teks HTML */
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

/* 1b. Mode Privasi Saldo (Privacy Mode) */
var isPrivacyMode = (function() {
  try {
    return localStorage.getItem("finance_privacy_mode") === "true";
  } catch (e) {
    return false;
  }
})();

function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  try {
    localStorage.setItem("finance_privacy_mode", isPrivacyMode ? "true" : "false");
  } catch (e) {}
  updatePrivacyEyeButton();
  updateHeroWalletBalance();
  renderAccountsUI();
  renderTransactionsList();
}

function updatePrivacyEyeButton() {
  var btn = document.getElementById("privacy-toggle-btn");
  if (!btn) return;
  btn.textContent = isPrivacyMode ? "🙈" : "👁️";
  btn.title = isPrivacyMode ? "Tampilkan Nominal (Privasi Aktif)" : "Sembunyikan Nominal (Privasi)";
}

/* 2. Format Kurensi IDR */
function formatIdrCurrency(num, allowPrivacyMask) {
  if (isPrivacyMode && allowPrivacyMask === true) {
    return "IDR ••••••";
  }

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

window.formatRupiah = formatIdrCurrency;

/* 3. Live Format Saat Mengetik Nominal */
function formatIdrLiveInput(inputEl) {
  if (!inputEl) return;
  var raw = inputEl.value || "";

  var cleaned = raw.replace(/[^0-9,]/g, "");
  if (!cleaned) {
    inputEl.value = "";
    return;
  }

  var commaParts = cleaned.split(",");
  var intRaw = commaParts[0].replace(/^0+(?=\d)/, "");
  if (intRaw === "" && commaParts.length > 1) {
    intRaw = "0";
  }

  var formattedInt = intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  var finalDisplay = "IDR " + formattedInt;

  if (commaParts.length > 1) {
    var decPart = commaParts.slice(1).join("").slice(0, 2);
    finalDisplay += "," + decPart;
  }

  inputEl.value = finalDisplay;
}

/* 4. Parse String IDR ke Float */
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

/* 5. Ambil Semua Data Keuangan (Transactions, Accounts, Budgets, Bills) */
function loadAllFinanceData() {
  loadTransactions();
  loadAccounts();
  loadBudgets();
  loadBills();
}

function loadTransactions() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/transactions?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var res = JSON.parse(xhr.responseText);
        transactionsCache = res.transactions || [];
        updateMonthFilterDropdown();
        renderFinanceUI();
      } catch (e) {
        console.error("Gagal baca JSON transaksi:", e);
      }
    }
  };
  xhr.send();
}

function loadAccounts() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/accounts?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var res = JSON.parse(xhr.responseText);
        accountsCache = res.accounts || [];
        renderAccountsUI();
        updateAccountSelectOptions();
        updateHeroWalletBalance();
      } catch (e) {
        console.error("Gagal baca accounts:", e);
      }
    }
  };
  xhr.send();
}

function loadBudgets() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/budgets?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var res = JSON.parse(xhr.responseText);
        budgetsCache = res.budgets || [];
        renderBudgetsUI();
      } catch (e) {
        console.error("Gagal baca budgets:", e);
      }
    }
  };
  xhr.send();
}

function loadBills() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/bills?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var res = JSON.parse(xhr.responseText);
        billsCache = res.bills || [];
        renderBillsUI();
      } catch (e) {
        console.error("Gagal baca bills:", e);
      }
    }
  };
  xhr.send();
}

/* =========================================================
   NAVIGASI CEPAT & ANIMASI MENUJU BAGIAN
   ========================================================= */
function scrollToFinanceSection(e, sectionId) {
  if (e && e.preventDefault) e.preventDefault();
  var targetEl = document.getElementById(sectionId);
  if (!targetEl) return;

  var headerOffset = 62;
  var elemRect = targetEl.getBoundingClientRect();
  var currentScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
  var targetY = Math.max(0, Math.round(elemRect.top + currentScrollY - headerOffset));

  smoothScrollTo(targetY, 320, function() {
    highlightTargetSection(targetEl);
  });
}

function smoothScrollTo(targetY, duration, callback) {
  var startY = window.pageYOffset || document.documentElement.scrollTop || 0;
  var diff = targetY - startY;
  if (Math.abs(diff) < 2) {
    if (typeof callback === "function") callback();
    return;
  }

  var startTime = null;

  function step(currentTime) {
    if (!startTime) startTime = currentTime;
    var timeElapsed = currentTime - startTime;
    var progress = timeElapsed / duration;
    if (progress > 1) progress = 1;

    // Easing: easeOutCubic (kompatibel penuh Safari iOS 10 & browser modern)
    var ease = 1 - Math.pow(1 - progress, 3);
    var newY = Math.round(startY + (diff * ease));
    window.scrollTo(0, newY);

    if (progress < 1) {
      if (window.requestAnimationFrame) {
        window.requestAnimationFrame(step);
      } else {
        setTimeout(function() { step(new Date().getTime()); }, 16);
      }
    } else {
      if (typeof callback === "function") callback();
    }
  }

  if (window.requestAnimationFrame) {
    window.requestAnimationFrame(step);
  } else {
    step(new Date().getTime());
  }
}

function highlightTargetSection(targetEl) {
  if (!targetEl) return;
  targetEl.className = targetEl.className.replace(/\bsection-highlight-active\b/g, "").trim();
  void targetEl.offsetWidth; // Force reflow
  targetEl.className = targetEl.className + " section-highlight-active";

  setTimeout(function() {
    targetEl.className = targetEl.className.replace(/\bsection-highlight-active\b/g, "").trim();
  }, 900);
}

/* =========================================================
   FITUR 1: PENCATATAN TRANSAKSI, SCAN STRUK, & QUICK TEMPLATE
   ========================================================= */
function fillQuickTx(type, cat, amt, note) {
  var typeEl = document.getElementById("tx-type");
  var catEl = document.getElementById("tx-cat");
  var amtEl = document.getElementById("tx-amount");
  var noteEl = document.getElementById("tx-note");

  if (typeEl) typeEl.value = type;
  if (catEl) catEl.value = cat;
  if (amtEl) amtEl.value = formatIdrCurrency(amt);
  if (noteEl) noteEl.value = note;
}

function handleReceiptScan(inputEl) {
  var lbl = document.getElementById("tx-receipt-label");
  if (!inputEl || !inputEl.files || !inputEl.files[0]) {
    receiptBase64 = "";
    if (lbl) lbl.textContent = "📷 Pindai / Lampirkan Foto Struk Belanja (Opsional)";
    return;
  }

  var file = inputEl.files[0];
  var rawName = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ");

  // Auto-fill note jika masih kosong
  var noteEl = document.getElementById("tx-note");
  if (noteEl && !noteEl.value.trim()) {
    noteEl.value = "Struk " + rawName;
  }

  if (lbl) lbl.textContent = "⏳ Memproses foto struk...";

  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      try {
        var canvas = document.createElement("canvas");
        var maxSize = 400; // Ukuran ringkas untuk MongoDB & Vercel
        var w = img.width;
        var h = img.height;
        if (w > h && w > maxSize) {
          h = Math.round(h * (maxSize / w));
          w = maxSize;
        } else if (h > maxSize) {
          w = Math.round(w * (maxSize / h));
          h = maxSize;
        }
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          receiptBase64 = canvas.toDataURL("image/jpeg", 0.7);
        } else {
          receiptBase64 = e.target.result;
        }
      } catch (err) {
        receiptBase64 = e.target.result;
      }
      var sizeKb = Math.round((receiptBase64.length * 3 / 4) / 1024);
      if (lbl) {
        lbl.textContent = "✅ Foto Struk Terlampir (" + sizeKb + " KB)";
        lbl.style.color = "var(--green-ok)";
      }
    };
    img.onerror = function() {
      receiptBase64 = "";
      if (lbl) lbl.textContent = "❌ Gagal memuat gambar.";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function onTxTypeChange(val) {
  var targetBox = document.getElementById("tx-target-account-box");
  var catSelect = document.getElementById("tx-cat");
  var accLbl = document.getElementById("tx-account-lbl");

  if (val === "TRF") {
    if (targetBox) targetBox.style.display = "block";
    if (catSelect) catSelect.disabled = true;
    if (accLbl) accLbl.textContent = "Dari Rekening Asal";
  } else {
    if (targetBox) targetBox.style.display = "none";
    if (catSelect) catSelect.disabled = false;
    if (accLbl) accLbl.textContent = "Sumber Rekening";
  }
}

function addTransaction() {
  var typeEl = document.getElementById("tx-type");
  var catEl = document.getElementById("tx-cat");
  var accEl = document.getElementById("tx-account");
  var targetAccEl = document.getElementById("tx-target-account");
  var amountEl = document.getElementById("tx-amount");
  var noteEl = document.getElementById("tx-note");
  var receiptFileEl = document.getElementById("tx-receipt-file");
  var receiptLabelEl = document.getElementById("tx-receipt-label");

  if (!typeEl || !amountEl) return;

  var type = typeEl.value;
  var category = (type === "TRF") ? "Transfer Antar Rekening" : (catEl ? catEl.value : "Lainnya");
  var account = accEl ? accEl.value : "Rekening Bank";
  var targetAccount = (type === "TRF" && targetAccEl) ? targetAccEl.value : "";
  var amountVal = parseIdrStringToNumber(amountEl.value);
  var note = (noteEl && noteEl.value.trim()) ? noteEl.value.trim() : ((type === "TRF") ? "Transfer ke " + targetAccount : category);

  if (!amountVal || amountVal <= 0) {
    alert("Masukkan nominal IDR yang valid (Contoh: IDR 25.000).");
    amountEl.focus();
    return;
  }

  if (type === "TRF" && account === targetAccount) {
    alert("Rekening asal dan rekening tujuan tidak boleh sama.");
    return;
  }

  var payload = {
    type: type,
    category: category,
    account: account,
    target_account: targetAccount,
    amount: amountVal,
    note: note,
    receipt_image: receiptBase64 || ""
  };

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/transactions", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      amountEl.value = "";
      if (noteEl) noteEl.value = "";
      receiptBase64 = "";
      if (receiptFileEl) receiptFileEl.value = "";
      if (receiptLabelEl) {
        receiptLabelEl.textContent = "📷 Pindai / Lampirkan Foto Struk Belanja (Opsional)";
        receiptLabelEl.style.color = "";
      }
      loadAllFinanceData();
    } else {
      alert("Gagal menyimpan transaksi ke database.");
    }
  };
  xhr.onerror = function() {
    alert("Koneksi ke server terputus.");
  };
  xhr.send(JSON.stringify(payload));
}

function openEditTxModal(id) {
  var tx = null;
  for (var i = 0; i < transactionsCache.length; i++) {
    if (transactionsCache[i].id === id) {
      tx = transactionsCache[i];
      break;
    }
  }
  if (!tx) return;

  document.getElementById("edit-tx-id").value = tx.id;
  document.getElementById("edit-tx-type").value = tx.type || "OUT";
  document.getElementById("edit-tx-cat").value = tx.category || "Lainnya";
  document.getElementById("edit-tx-amount").value = formatIdrCurrency(tx.amount || 0, false);
  document.getElementById("edit-tx-note").value = tx.note || "";

  updateAccountSelectOptions();

  var accSel = document.getElementById("edit-tx-account");
  if (accSel && tx.account) accSel.value = tx.account;

  var targetSel = document.getElementById("edit-tx-target-account");
  if (targetSel && tx.target_account) targetSel.value = tx.target_account;

  onEditTxTypeChange(tx.type || "OUT");

  var backdrop = document.getElementById("edit-tx-modal-backdrop");
  var box = document.getElementById("edit-tx-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop open";
  if (box) box.className = "modal-box open";
}

function closeEditTxModal() {
  var backdrop = document.getElementById("edit-tx-modal-backdrop");
  var box = document.getElementById("edit-tx-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop";
  if (box) box.className = "modal-box";
}

function onEditTxTypeChange(val) {
  var targetBox = document.getElementById("edit-tx-target-box");
  var catBox = document.getElementById("edit-tx-cat-box");
  if (val === "TRF") {
    if (targetBox) targetBox.style.display = "block";
    if (catBox) catBox.style.display = "none";
  } else {
    if (targetBox) targetBox.style.display = "none";
    if (catBox) catBox.style.display = "block";
  }
}

function saveEditedTx() {
  var id = document.getElementById("edit-tx-id").value;
  var type = document.getElementById("edit-tx-type").value;
  var cat = (type === "TRF") ? "Transfer Antar Rekening" : document.getElementById("edit-tx-cat").value;
  var amt = parseIdrStringToNumber(document.getElementById("edit-tx-amount").value);
  var note = document.getElementById("edit-tx-note").value.trim() || cat;
  var acc = document.getElementById("edit-tx-account").value;
  var targetAcc = (type === "TRF") ? document.getElementById("edit-tx-target-account").value : "";

  if (!id || amt <= 0) {
    alert("Masukkan nominal IDR yang valid.");
    return;
  }
  if (type === "TRF" && acc === targetAcc) {
    alert("Rekening sumber dan rekening tujuan tidak boleh sama.");
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("PUT", "/api/transactions/" + encodeURIComponent(id), true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      closeEditTxModal();
      loadAllFinanceData();
    } else {
      alert("Gagal memperbarui transaksi.");
    }
  };
  xhr.send(JSON.stringify({
    type: type,
    category: cat,
    amount: amt,
    note: note,
    account: acc,
    target_account: targetAcc
  }));
}

function deleteTransaction(id) {
  if (!id) return;
  if (!confirm("Hapus catatan transaksi ini?")) return;

  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/transactions/" + encodeURIComponent(id), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      loadAllFinanceData();
    }
  };
  xhr.send();
}

function viewReceiptImage(base64Url) {
  if (!base64Url) return;
  var w = window.open("");
  if (w) {
    w.document.write('<html><head><title>Struk Belanja</title><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="margin:0; background:#0B0F19; display:flex; align-items:center; justify-content:center; min-height:100vh;"><img src="' + base64Url + '" style="max-width:100%; max-height:100vh; border-radius:8px;"></body></html>');
  }
}

/* =========================================================
   FITUR 2: PENGANGGARAN (BUDGETING) & ALERT
   ========================================================= */
function saveBudgetLimit() {
  var catEl = document.getElementById("budget-cat-select");
  var limitEl = document.getElementById("budget-limit-input");
  if (!catEl || !limitEl) return;

  var category = catEl.value;
  var limitVal = parseIdrStringToNumber(limitEl.value);

  if (limitVal <= 0) {
    alert("Masukkan batas anggaran IDR yang valid.");
    limitEl.focus();
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/budgets", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      limitEl.value = "";
      loadBudgets();
    } else {
      alert("Gagal menetapkan batas anggaran.");
    }
  };
  xhr.send(JSON.stringify({ category: category, limit: limitVal }));
}

function deleteBudget(id) {
  if (!confirm("Hapus batas anggaran ini?")) return;
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/budgets/" + encodeURIComponent(id), true);
  xhr.onload = function() {
    loadBudgets();
  };
  xhr.send();
}

function renderBudgetsUI() {
  var listEl = document.getElementById("budget-bars-list");
  var statusBadge = document.getElementById("budget-status-badge");
  if (!listEl) return;

  listEl.innerHTML = "";
  if (budgetsCache.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; color:var(--text-light); font-size:11px; padding:10px;">Belum ada batas anggaran. Tetapkan di atas.</div>';
    if (statusBadge) {
      statusBadge.textContent = "Aman";
      statusBadge.style.color = "var(--green-ok)";
    }
    updateAlertBanner();
    return;
  }

  // Hitung pengeluaran bulan ini (OUT) per kategori
  var currentMonthStr = getCurrentMonthPrefix();
  var expensesMap = {};
  var totalExpenseMonth = 0;

  for (var i = 0; i < transactionsCache.length; i++) {
    var t = transactionsCache[i];
    if (t.type === "OUT") {
      var isCurrent = !t.date || t.date.indexOf(currentMonthStr) !== -1 || isTimestampThisMonth(t.timestamp);
      if (isCurrent) {
        var amt = parseFloat(t.amount || 0);
        expensesMap[t.category] = (expensesMap[t.category] || 0) + amt;
        totalExpenseMonth += amt;
      }
    }
  }

  var maxRatioFound = 0;

  for (var b = 0; b < budgetsCache.length; b++) {
    var bg = budgetsCache[b];
    var spent = (bg.category === "TOTAL") ? totalExpenseMonth : (expensesMap[bg.category] || 0);
    var limit = parseFloat(bg.limit || 1);
    var ratio = Math.round((spent / limit) * 100);
    if (ratio > maxRatioFound) maxRatioFound = ratio;

    var barClass = "normal";
    if (ratio >= 100) {
      barClass = "danger";
    } else if (ratio >= 80) {
      barClass = "warn";
    }

    var item = document.createElement("div");
    item.className = "budget-item";
    item.innerHTML =
      '<div class="budget-item-top">' +
        '<span class="budget-item-name">' + safeEscapeHtml(bg.category) + ' (' + ratio + '%)</span>' +
        '<span class="budget-item-amt">' + formatIdrCurrency(spent) + ' / ' + formatIdrCurrency(limit) + '</span>' +
      '</div>' +
      '<div class="budget-bar-track">' +
        '<div class="budget-bar-fill ' + barClass + '" style="width:' + Math.min(ratio, 100) + '%;"></div>' +
      '</div>';
    listEl.appendChild(item);
  }

  if (statusBadge) {
    if (maxRatioFound >= 100) {
      statusBadge.textContent = "Over Budget!";
      statusBadge.style.color = "var(--red-err)";
    } else if (maxRatioFound >= 80) {
      statusBadge.textContent = "Waspada (80%)";
      statusBadge.style.color = "var(--yellow-warn)";
    } else {
      statusBadge.textContent = "Aman (" + maxRatioFound + "%)";
      statusBadge.style.color = "var(--green-ok)";
    }
  }

  updateAlertBanner(maxRatioFound);
}

/* =========================================================
   FITUR 3: PELACAKAN REKENING BANK & INVESTASI
   ========================================================= */
function toggleAddAccountBox() {
  var box = document.getElementById("add-account-box");
  if (!box) return;
  box.style.display = (box.style.display === "none" || !box.style.display) ? "block" : "none";
}

function saveAccountAsset() {
  var nameEl = document.getElementById("acc-name");
  var typeEl = document.getElementById("acc-type");
  var balEl = document.getElementById("acc-balance");

  if (!nameEl || !typeEl || !balEl) return;
  var name = nameEl.value.trim();
  var type = typeEl.value;
  var initBal = parseIdrStringToNumber(balEl.value);

  if (!name) {
    alert("Masukkan nama rekening / akun.");
    nameEl.focus();
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/accounts", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      nameEl.value = "";
      balEl.value = "";
      toggleAddAccountBox();
      loadAccounts();
    } else {
      alert("Gagal menyimpan akun.");
    }
  };
  xhr.send(JSON.stringify({ name: name, type: type, initial_balance: initBal }));
}

function deleteAccount(id, name) {
  if (!confirm("Hapus akun '" + name + "'?")) return;
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/accounts/" + encodeURIComponent(id), true);
  xhr.onload = function() {
    loadAccounts();
  };
  xhr.send();
}

function renderAccountsUI() {
  var grid = document.getElementById("accounts-grid");
  if (!grid) return;

  grid.innerHTML = "";
  if (accountsCache.length === 0) {
    grid.innerHTML = '<div style="grid-column:span 2; text-align:center; color:var(--text-light); font-size:11px; padding:10px;">Belum ada rekening tercatat.</div>';
    return;
  }

  var TYPE_ICONS = {
    "Bank": "🏦",
    "E-Wallet": "📱",
    "Investasi": "📈",
    "Tunai": "💵"
  };

  for (var i = 0; i < accountsCache.length; i++) {
    var acc = accountsCache[i];
    var icon = TYPE_ICONS[acc.type] || "💳";
    var card = document.createElement("div");
    card.className = "acc-card";
    card.innerHTML =
      '<div class="acc-card-top">' +
        '<span>' + icon + ' ' + safeEscapeHtml(acc.type) + '</span>' +
        '<div style="white-space:nowrap;">' +
          '<button type="button" class="pill-mini-btn" style="padding:3px 8px; font-size:10px; margin-left:3px;" onclick="openEditAccountModal(\'' + acc.id + '\')">Edit</button>' +
          '<button type="button" class="pill-mini-btn btn-mini-danger" style="padding:3px 8px; font-size:10px; margin-left:3px;" onclick="deleteAccount(\'' + acc.id + '\', \'' + safeEscapeHtml(acc.name).replace(/'/g, "") + '\')">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="acc-card-name">' + safeEscapeHtml(acc.name) + '</div>' +
      '<div class="acc-card-val">' + formatIdrCurrency(acc.current_balance, true) + '</div>';
    grid.appendChild(card);
  }
}

function openEditAccountModal(id) {
  var acc = null;
  for (var i = 0; i < accountsCache.length; i++) {
    if (accountsCache[i].id === id) {
      acc = accountsCache[i];
      break;
    }
  }
  if (!acc) return;

  document.getElementById("edit-acc-id").value = acc.id;
  document.getElementById("edit-acc-name").value = acc.name || "";
  document.getElementById("edit-acc-type").value = acc.type || "Bank";
  document.getElementById("edit-acc-balance").value = formatIdrCurrency(acc.initial_balance || 0, false);

  var backdrop = document.getElementById("edit-acc-modal-backdrop");
  var box = document.getElementById("edit-acc-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop open";
  if (box) box.className = "modal-box open";
}

function closeEditAccountModal() {
  var backdrop = document.getElementById("edit-acc-modal-backdrop");
  var box = document.getElementById("edit-acc-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop";
  if (box) box.className = "modal-box";
}

function saveEditedAccount() {
  var id = document.getElementById("edit-acc-id").value;
  var name = document.getElementById("edit-acc-name").value.trim();
  var type = document.getElementById("edit-acc-type").value;
  var initBal = parseIdrStringToNumber(document.getElementById("edit-acc-balance").value);

  if (!id || !name) {
    alert("Nama akun wajib diisi.");
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("PUT", "/api/accounts/" + encodeURIComponent(id), true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      closeEditAccountModal();
      loadAllFinanceData();
    } else {
      alert("Gagal memperbarui data rekening.");
    }
  };
  xhr.send(JSON.stringify({
    name: name,
    type: type,
    initial_balance: initBal
  }));
}

function updateAccountSelectOptions() {
  var selects = [
    document.getElementById("tx-account"),
    document.getElementById("tx-target-account"),
    document.getElementById("edit-tx-account"),
    document.getElementById("edit-tx-target-account"),
    document.getElementById("bill-account-select"),
    document.getElementById("edit-bill-account")
  ];

  var TYPE_ICONS = {
    "Bank": "🏦",
    "E-Wallet": "📱",
    "Investasi": "📈",
    "Tunai": "💵"
  };

  for (var s = 0; s < selects.length; s++) {
    var sel = selects[s];
    if (!sel) continue;

    var currentVal = sel.value;
    sel.innerHTML = "";

    if (accountsCache.length === 0) {
      sel.innerHTML = '<option value="Rekening Bank">🏦 Rekening Bank</option>';
      continue;
    }

    for (var i = 0; i < accountsCache.length; i++) {
      var acc = accountsCache[i];
      var icon = TYPE_ICONS[acc.type] || "💳";
      var opt = document.createElement("option");
      opt.value = acc.name;
      opt.textContent = icon + " " + acc.name;
      sel.appendChild(opt);
    }

    if (currentVal) sel.value = currentVal;
  }
}

function calculateTotalAssets() {
  var totalIn = 0;
  var totalOut = 0;
  for (var i = 0; i < transactionsCache.length; i++) {
    var t = transactionsCache[i];
    var amt = parseFloat(t.amount || 0);
    if (t.type === "IN") {
      totalIn += amt;
    } else if (t.type === "OUT") {
      totalOut += amt;
    }
  }

  var totalInitial = 0;
  for (var a = 0; a < accountsCache.length; a++) {
    totalInitial += parseFloat(accountsCache[a].initial_balance || 0);
  }

  return (totalIn - totalOut) + totalInitial;
}

function updateHeroWalletBalance() {
  var balanceEl = document.getElementById("total-balance");
  if (!balanceEl) return;
  balanceEl.textContent = formatIdrCurrency(calculateTotalAssets(), true);
  updatePrivacyEyeButton();
}

/* =========================================================
   FITUR 4: PENGINGAT TAGIHAN & PEMBAYARAN (RECURRING & EDIT)
   ========================================================= */
var INDO_MONTH_NAMES = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"
];

function getIsoMonthString(d) {
  var dateObj = d || new Date();
  var m = ("0" + (dateObj.getMonth() + 1)).slice(-2);
  return dateObj.getFullYear() + "-" + m;
}

function formatIsoMonthToIndo(isoStr) {
  if (!isoStr) return "";
  var parts = isoStr.split("-");
  if (parts.length < 2) return isoStr;
  var y = parts[0];
  var mIdx = parseInt(parts[1], 10) - 1;
  return (INDO_MONTH_NAMES[mIdx] || parts[1]) + " " + y;
}

function populateBillMonthDropdowns() {
  var filterSel = document.getElementById("bills-month-filter");
  var addMonthSel = document.getElementById("bill-month-select");
  var editMonthSel = document.getElementById("edit-bill-month");

  var now = new Date();
  var curIso = getIsoMonthString(now);

  var monthOptions = [];
  for (var offset = -2; offset <= 6; offset++) {
    var d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    var iso = getIsoMonthString(d);
    var label = formatIsoMonthToIndo(iso) + (iso === curIso ? " (Bulan Ini)" : "");
    monthOptions.push({ iso: iso, label: label });
  }

  if (filterSel && filterSel.options.length <= 2) {
    var curFilterVal = filterSel.value || curIso;
    filterSel.innerHTML =
      '<option value="' + curIso + '">Bulan Ini (' + formatIsoMonthToIndo(curIso) + ')</option>' +
      '<option value="ALL">Semua Bulan</option>';
    for (var f = 0; f < monthOptions.length; f++) {
      if (monthOptions[f].iso !== curIso) {
        var optF = document.createElement("option");
        optF.value = monthOptions[f].iso;
        optF.textContent = monthOptions[f].label;
        filterSel.appendChild(optF);
      }
    }
    filterSel.value = (curFilterVal === "ALL") ? "ALL" : (curFilterVal || curIso);
  }

  if (addMonthSel && addMonthSel.options.length === 0) {
    for (var a = 0; a < monthOptions.length; a++) {
      var optA = document.createElement("option");
      optA.value = monthOptions[a].iso;
      optA.textContent = "Bulan: " + monthOptions[a].label;
      addMonthSel.appendChild(optA);
    }
    addMonthSel.value = curIso;
  }

  if (editMonthSel && editMonthSel.options.length === 0) {
    for (var e = 0; e < monthOptions.length; e++) {
      var optE = document.createElement("option");
      optE.value = monthOptions[e].iso;
      optE.textContent = "Bulan: " + monthOptions[e].label;
      editMonthSel.appendChild(optE);
    }
    editMonthSel.value = curIso;
  }
}

function toggleAddBillBox() {
  var box = document.getElementById("add-bill-box");
  if (!box) return;
  var isHidden = (box.style.display === "none" || !box.style.display);
  box.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    populateBillMonthDropdowns();
    updateAccountSelectOptions();
  }
}

function addBillReminder() {
  var nameEl = document.getElementById("bill-name");
  var amountEl = document.getElementById("bill-amount");
  var dayEl = document.getElementById("bill-due-day");
  var monthEl = document.getElementById("bill-month-select");
  var accEl = document.getElementById("bill-account-select");
  var recurEl = document.getElementById("bill-is-recurring");

  if (!nameEl || !amountEl || !dayEl) return;
  var name = nameEl.value.trim();
  var amount = parseIdrStringToNumber(amountEl.value);
  var dueDay = parseInt(dayEl.value, 10);
  var dueMonth = monthEl ? monthEl.value : getIsoMonthString();
  var account = accEl ? accEl.value : "Rekening Bank";
  var isRecurring = recurEl ? recurEl.checked : true;

  if (!name || amount <= 0 || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
    alert("Masukkan data tagihan yang valid (Nama, Nominal IDR, dan Tgl 1-31).");
    return;
  }

  var payload = {
    name: name,
    amount: amount,
    due_day: dueDay,
    due_month: dueMonth,
    account: account,
    is_recurring: isRecurring
  };

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/bills", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      nameEl.value = "";
      amountEl.value = "";
      dayEl.value = "";
      toggleAddBillBox();
      loadBills();
    } else {
      alert("Gagal menyimpan pengingat tagihan.");
    }
  };
  xhr.send(JSON.stringify(payload));
}

function toggleBillRecurring(id) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/bills/" + encodeURIComponent(id) + "/toggle-recurring", true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      loadBills();
    } else {
      alert("Gagal mengubah status berulang tagihan.");
    }
  };
  xhr.send();
}

function payBill(id, name, targetMonth) {
  var monthLabel = formatIsoMonthToIndo(targetMonth || getIsoMonthString());
  if (!confirm("Tandai tagihan '" + name + "' lunas untuk " + monthLabel + " dan catat ke pengeluaran bulan ini?")) return;

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/bills/" + encodeURIComponent(id) + "/pay", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      loadAllFinanceData();
    } else {
      alert("Gagal mencatat pembayaran tagihan.");
    }
  };
  xhr.send(JSON.stringify({ month: targetMonth || getIsoMonthString() }));
}

function unpayBill(id, name) {
  if (!confirm("Ulangi pengingat tagihan '" + name + "' (batalkan status lunas)?")) return;

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/bills/" + encodeURIComponent(id) + "/unpay", true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      loadAllFinanceData();
    } else {
      alert("Gagal mengulang pengingat tagihan.");
    }
  };
  xhr.send();
}

function openEditBillModal(id) {
  var bill = null;
  for (var i = 0; i < billsCache.length; i++) {
    if (billsCache[i].id === id) {
      bill = billsCache[i];
      break;
    }
  }
  if (!bill) return;

  document.getElementById("edit-bill-id").value = bill.id;
  document.getElementById("edit-bill-name").value = bill.name || "";
  document.getElementById("edit-bill-amount").value = formatIdrCurrency(bill.amount);
  document.getElementById("edit-bill-due-day").value = bill.due_day || 1;

  populateBillMonthDropdowns();
  updateAccountSelectOptions();

  var monthSel = document.getElementById("edit-bill-month");
  if (monthSel) {
    monthSel.value = bill.due_month || getIsoMonthString();
  }

  var accSel = document.getElementById("edit-bill-account");
  if (accSel && bill.account) {
    accSel.value = bill.account;
  }

  var recurCheck = document.getElementById("edit-bill-is-recurring");
  if (recurCheck) {
    recurCheck.checked = (bill.is_recurring !== false);
  }

  var paidCtrl = document.getElementById("edit-bill-paid-control");
  if (paidCtrl) {
    if (bill.paid_month) {
      paidCtrl.innerHTML =
        '<div style="text-align:center; font-size:11px; color:var(--green-ok); font-weight:700; margin:6px 0 4px 0;">' +
          '✓ Sudah dibayar untuk ' + formatIsoMonthToIndo(bill.paid_month) +
        '</div>' +
        '<button type="button" class="btn-full-soft" style="color:var(--red-err); margin-bottom:0;" onclick="unpayBillFromModal(\'' + bill.id + '\', \'' + safeEscapeHtml(bill.name).replace(/'/g, "") + '\')">↺ Reset Status Bayar (Ulang Pengingat)</button>';
    } else {
      paidCtrl.innerHTML = '';
    }
  }

  var backdrop = document.getElementById("edit-bill-modal-backdrop");
  var box = document.getElementById("edit-bill-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop open";
  if (box) box.className = "modal-box open";
}

function closeEditBillModal() {
  var backdrop = document.getElementById("edit-bill-modal-backdrop");
  var box = document.getElementById("edit-bill-modal-box");
  if (backdrop) backdrop.className = "modal-backdrop";
  if (box) box.className = "modal-box";
}

function unpayBillFromModal(id, name) {
  closeEditBillModal();
  unpayBill(id, name);
}

function saveEditedBill() {
  var id = document.getElementById("edit-bill-id").value;
  var nameEl = document.getElementById("edit-bill-name");
  var amountEl = document.getElementById("edit-bill-amount");
  var dayEl = document.getElementById("edit-bill-due-day");
  var monthEl = document.getElementById("edit-bill-month");
  var accEl = document.getElementById("edit-bill-account");
  var recurEl = document.getElementById("edit-bill-is-recurring");

  if (!id || !nameEl || !amountEl || !dayEl) return;

  var name = nameEl.value.trim();
  var amount = parseIdrStringToNumber(amountEl.value);
  var dueDay = parseInt(dayEl.value, 10);
  var dueMonth = monthEl ? monthEl.value : getIsoMonthString();
  var account = accEl ? accEl.value : "Rekening Bank";
  var isRecurring = recurEl ? recurEl.checked : true;

  if (!name || amount <= 0 || isNaN(dueDay) || dueDay < 1 || dueDay > 31) {
    alert("Masukkan data tagihan yang valid (Hari 1-31).");
    return;
  }

  var payload = {
    name: name,
    amount: amount,
    due_day: dueDay,
    due_month: dueMonth,
    account: account,
    is_recurring: isRecurring
  };

  var xhr = new XMLHttpRequest();
  xhr.open("PUT", "/api/bills/" + encodeURIComponent(id), true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      closeEditBillModal();
      loadBills();
    } else {
      alert("Gagal memperbarui jadwal tagihan.");
    }
  };
  xhr.send(JSON.stringify(payload));
}

function deleteBill(id, name) {
  if (!confirm("Hapus jadwal tagihan '" + name + "'?")) return;
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/bills/" + encodeURIComponent(id), true);
  xhr.onload = function() {
    loadBills();
  };
  xhr.send();
}

function renderBillsUI() {
  var listEl = document.getElementById("bills-list");
  var summaryBar = document.getElementById("bills-summary-bar");
  if (!listEl) return;

  populateBillMonthDropdowns();

  var filterSel = document.getElementById("bills-month-filter");
  var activeMonth = (filterSel && filterSel.value) ? filterSel.value : getIsoMonthString();
  var isFilterAll = (activeMonth === "ALL");
  var currentIso = getIsoMonthString();

  listEl.innerHTML = "";
  if (billsCache.length === 0) {
    if (summaryBar) summaryBar.textContent = "Belum ada tagihan rutin yang dijadwalkan.";
    listEl.innerHTML = '<div style="text-align:center; color:var(--text-light); font-size:11px; padding:10px;">Belum ada tagihan rutin yang dijadwalkan. Ketuk <strong>+ Jadwal Tagihan</strong> untuk menambahkan.</div>';
    return;
  }

  var today = new Date();
  var todayDay = today.getDate();
  var targetMonth = isFilterAll ? currentIso : activeMonth;

  var totalBillAmt = 0;
  var totalPaidAmt = 0;
  var totalUnpaidAmt = 0;
  var unpaidCount = 0;

  for (var i = 0; i < billsCache.length; i++) {
    var bill = billsCache[i];
    var isRecurring = (bill.is_recurring !== false);
    var isPaid = (bill.paid_month === targetMonth);
    var amt = parseFloat(bill.amount || 0);

    totalBillAmt += amt;
    if (isPaid) {
      totalPaidAmt += amt;
    } else {
      totalUnpaidAmt += amt;
      unpaidCount++;
    }

    var dueDay = parseInt(bill.due_day, 10) || 1;
    var badgeText = "";
    var badgeClass = "";
    var showPayBtn = !isPaid;

    var monthLabel = formatIsoMonthToIndo(targetMonth);

    if (isPaid) {
      badgeText = "✓ Lunas (" + monthLabel + ")";
      badgeClass = "paid";
    } else if (todayDay > dueDay && targetMonth <= currentIso) {
      badgeText = "Lewat Tempo (" + (todayDay - dueDay) + " hr)";
      badgeClass = "urgent";
    } else if (dueDay === todayDay && targetMonth === currentIso) {
      badgeText = "Tempo Hari Ini!";
      badgeClass = "urgent";
    } else if (dueDay - todayDay <= 3 && dueDay > todayDay && targetMonth === currentIso) {
      badgeText = "Tempo H-" + (dueDay - todayDay);
      badgeClass = "soon";
    } else {
      badgeText = "Tempo Tgl " + dueDay + " " + monthLabel;
      badgeClass = "soon";
    }

    var recurBtnHtml = isRecurring
      ? '<button type="button" class="pill-mini-btn" style="color:var(--blue-brand); font-weight:700; margin-left:6px; padding:2px 7px; font-size:10px;" title="Klik untuk ubah jadi Sekali Bayar" onclick="toggleBillRecurring(\'' + bill.id + '\')">🔁 Berulang</button>'
      : '<button type="button" class="pill-mini-btn" style="color:var(--text-light); margin-left:6px; padding:2px 7px; font-size:10px;" title="Klik untuk ubah jadi Berulang" onclick="toggleBillRecurring(\'' + bill.id + '\')">⚡ 1x Bayar</button>';

    var row = document.createElement("div");
    row.className = "bill-row-item";
    row.innerHTML =
      '<div style="flex:1; min-width:0; padding-right:8px;">' +
        '<div style="font-weight:700; color:var(--text-dark); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
          safeEscapeHtml(bill.name) +
        '</div>' +
        '<div style="margin-top:3px; display:flex; flex-wrap:wrap; align-items:center;">' +
          '<span class="bill-due-badge ' + badgeClass + '">' + badgeText + '</span>' +
          recurBtnHtml +
        '</div>' +
        '<div style="font-size:11px; color:var(--text-light); margin-top:3px;">' +
          '💳 ' + safeEscapeHtml(bill.account || "Rekening Bank") +
        '</div>' +
      '</div>' +
      '<div style="text-align:right; flex-shrink:0;">' +
        '<div style="font-weight:800; color:var(--text-dark); font-size:13px;">' + formatIdrCurrency(bill.amount) + '</div>' +
        '<div style="margin-top:5px; white-space:nowrap;">' +
          (showPayBtn
            ? '<button type="button" class="pill-mini-btn btn-mini-green" style="font-weight:700; padding:3px 8px; margin-left:3px;" onclick="payBill(\'' + bill.id + '\', \'' + safeEscapeHtml(bill.name).replace(/'/g, "") + '\', \'' + targetMonth + '\')">Bayar</button>'
            : '<button type="button" class="pill-mini-btn" style="color:var(--text-light); padding:3px 8px; margin-left:3px;" onclick="unpayBill(\'' + bill.id + '\', \'' + safeEscapeHtml(bill.name).replace(/'/g, "") + '\')">↺ Ulang</button>'
          ) +
          '<button type="button" class="pill-mini-btn" style="padding:3px 8px; margin-left:3px;" onclick="openEditBillModal(\'' + bill.id + '\')">Edit</button>' +
          '<button type="button" class="pill-mini-btn btn-mini-danger" style="padding:3px 8px; margin-left:3px;" onclick="deleteBill(\'' + bill.id + '\', \'' + safeEscapeHtml(bill.name).replace(/'/g, "") + '\')">✕</button>' +
        '</div>' +
      '</div>';
    listEl.appendChild(row);
  }

  if (summaryBar) {
    summaryBar.innerHTML =
      'Periode: <strong>' + formatIsoMonthToIndo(targetMonth) + '</strong> &bull; ' +
      'Belum Bayar: <span style="color:' + (unpaidCount > 0 ? 'var(--red-err)' : 'var(--green-ok)') + ';">' + formatIdrCurrency(totalUnpaidAmt) + ' (' + unpaidCount + ')</span>';
  }
}

/* =========================================================
   ALERT BANNER OTOMATIS
   ========================================================= */
function updateAlertBanner(budgetMaxRatio) {
  var banner = document.getElementById("finance-alert-banner");
  if (!banner) return;

  var messages = [];
  var isDanger = false;

  if (typeof budgetMaxRatio === "number" && budgetMaxRatio >= 100) {
    messages.push("⚠️ <strong>Peringatan Anggaran:</strong> Pengeluaran Anda telah melampaui batas anggaran bulanan (" + budgetMaxRatio + "%).");
    isDanger = true;
  } else if (typeof budgetMaxRatio === "number" && budgetMaxRatio >= 80) {
    messages.push("⚡ <strong>Perhatian:</strong> Pengeluaran Anda telah mencapai " + budgetMaxRatio + "% dari batas anggaran.");
  }

  // Cek tagihan jatuh tempo
  var today = new Date();
  var todayDay = today.getDate();
  var currentMonthStr = today.getFullYear() + "-" + ("0" + (today.getMonth() + 1)).slice(-2);

  for (var i = 0; i < billsCache.length; i++) {
    var b = billsCache[i];
    if (b.paid_month !== currentMonthStr) {
      var dDay = parseInt(b.due_day, 10);
      if (todayDay > dDay) {
        messages.push("🚨 Tagihan <strong>" + safeEscapeHtml(b.name) + "</strong> telah melewati batas tempo!");
        isDanger = true;
      } else if (dDay - todayDay <= 3) {
        messages.push("🔔 Tagihan <strong>" + safeEscapeHtml(b.name) + "</strong> segera jatuh tempo (" + (dDay === todayDay ? "Hari ini" : "H-" + (dDay - todayDay)) + ").");
      }
    }
  }

  if (messages.length > 0) {
    banner.style.display = "block";
    banner.className = "alert-banner " + (isDanger ? "danger" : "warn");
    banner.innerHTML = messages.join("<br>");
  } else {
    banner.style.display = "none";
    banner.innerHTML = "";
  }
}

/* =========================================================
   FITUR 5: VISUALISASI & ANALISIS DATA (SVG CHARTS)
   ========================================================= */
function updateMonthFilterDropdown() {
  var chartSel = document.getElementById("chart-month-filter");
  var txSel = document.getElementById("tx-filter-month");

  var monthsSet = {};
  for (var i = 0; i < transactionsCache.length; i++) {
    var t = transactionsCache[i];
    var m = extractMonthYearFromDate(t.date, t.timestamp);
    if (m) monthsSet[m] = true;
  }

  var monthList = [];
  for (var mKey in monthsSet) {
    if (monthsSet.hasOwnProperty(mKey)) {
      monthList.push(mKey);
    }
  }

  var selects = [chartSel, txSel];
  for (var s = 0; s < selects.length; s++) {
    var sel = selects[s];
    if (!sel) continue;

    var currentVal = sel.value || "ALL";
    sel.innerHTML = '<option value="ALL">Semua Bulan</option>';
    for (var j = 0; j < monthList.length; j++) {
      var opt = document.createElement("option");
      opt.value = monthList[j];
      opt.textContent = "Bulan: " + monthList[j];
      sel.appendChild(opt);
    }
    sel.value = currentVal;
  }
}

function renderFinanceCharts() {
  var sel = document.getElementById("chart-month-filter");
  var filterMonth = sel ? sel.value : "ALL";

  var catExpenseMap = {};
  var totalIn = 0;
  var totalOut = 0;

  for (var i = 0; i < transactionsCache.length; i++) {
    var t = transactionsCache[i];
    var m = extractMonthYearFromDate(t.date, t.timestamp);
    if (filterMonth === "ALL" || m === filterMonth) {
      var amt = parseFloat(t.amount || 0);
      if (t.type === "IN") {
        totalIn += amt;
      } else {
        totalOut += amt;
        var cat = t.category || "Lainnya";
        catExpenseMap[cat] = (catExpenseMap[cat] || 0) + amt;
      }
    }
  }

  renderBarChart(totalIn, totalOut);
  renderPieChart(catExpenseMap, totalOut);
}

/* Render Diagram Batang Pure SVG (Pemasukan vs Pengeluaran) */
function renderBarChart(totalIn, totalOut) {
  var container = document.getElementById("bar-chart-container");
  if (!container) return;

  var maxVal = Math.max(totalIn, totalOut, 1);
  var heightIn = Math.round((totalIn / maxVal) * 80);
  var heightOut = Math.round((totalOut / maxVal) * 80);

  var svgHtml =
    '<svg viewBox="0 0 280 115" style="width:100%; height:115px; display:block;">' +
      '<!-- Garis Kisi -->' +
      '<line x1="20" y1="90" x2="260" y2="90" stroke="var(--border-line)" stroke-width="1"/>' +
      '<line x1="20" y1="50" x2="260" y2="50" stroke="var(--border-line)" stroke-width="1" stroke-dasharray="3,3"/>' +
      '<line x1="20" y1="10" x2="260" y2="10" stroke="var(--border-line)" stroke-width="1" stroke-dasharray="3,3"/>' +

      '<!-- Batang Pemasukan -->' +
      '<rect x="65" y="' + (90 - heightIn) + '" width="45" height="' + heightIn + '" rx="6" fill="#10B981" />' +
      '<text x="87" y="104" font-size="10" font-weight="700" fill="var(--text-muted)" text-anchor="middle">Masuk</text>' +
      '<text x="87" y="' + Math.max(90 - heightIn - 4, 12) + '" font-size="9" font-weight="700" fill="#10B981" text-anchor="middle">' + formatShortNum(totalIn) + '</text>' +

      '<!-- Batang Pengeluaran -->' +
      '<rect x="170" y="' + (90 - heightOut) + '" width="45" height="' + heightOut + '" rx="6" fill="#EF4444" />' +
      '<text x="192" y="104" font-size="10" font-weight="700" fill="var(--text-muted)" text-anchor="middle">Keluar</text>' +
      '<text x="192" y="' + Math.max(90 - heightOut - 4, 12) + '" font-size="9" font-weight="700" fill="#EF4444" text-anchor="middle">' + formatShortNum(totalOut) + '</text>' +
    '</svg>';

  container.innerHTML = svgHtml;
}

/* Render Diagram Donat Pure SVG dengan Legend */
function renderPieChart(catMap, totalOut) {
  var svgCell = document.getElementById("pie-chart-svg");
  var legendCell = document.getElementById("pie-chart-legend");
  if (!svgCell || !legendCell) return;

  svgCell.innerHTML = "";
  legendCell.innerHTML = "";

  if (totalOut <= 0) {
    svgCell.innerHTML =
      '<svg viewBox="0 0 100 100" style="width:100px; height:100px;">' +
        '<circle cx="50" cy="50" r="36" fill="transparent" stroke="var(--border-line)" stroke-width="14"/>' +
        '<text x="50" y="54" font-size="9" font-weight="700" fill="var(--text-muted)" text-anchor="middle">Rp 0</text>' +
      '</svg>';
    legendCell.innerHTML = '<div style="font-size:11px; color:var(--text-light);">Belum ada pengeluaran di periode ini.</div>';
    return;
  }

  var circumference = 2 * Math.PI * 36; // ~226.19
  var accumulatedOffset = 0;
  var circlesHtml = "";
  var legendHtml = "";

  for (var cat in catMap) {
    if (catMap.hasOwnProperty(cat)) {
      var val = catMap[cat];
      var pct = val / totalOut;
      var sliceLen = pct * circumference;
      var color = CATEGORY_COLORS[cat] || "#64748B";

      circlesHtml +=
        '<circle cx="50" cy="50" r="36" fill="transparent" ' +
        'stroke="' + color + '" stroke-width="14" ' +
        'stroke-dasharray="' + sliceLen.toFixed(1) + ' ' + (circumference - sliceLen).toFixed(1) + '" ' +
        'stroke-dashoffset="' + (-accumulatedOffset).toFixed(1) + '" ' +
        'transform="rotate(-90 50 50)"/>';

      accumulatedOffset += sliceLen;

      legendHtml +=
        '<div class="pie-leg-item">' +
          '<span class="pie-leg-color" style="background:' + color + ';"></span>' +
          '<span class="pie-leg-name">' + safeEscapeHtml(cat) + '</span>' +
          '<span class="pie-leg-val">' + Math.round(pct * 100) + '%</span>' +
        '</div>';
    }
  }

  svgCell.innerHTML =
    '<svg viewBox="0 0 100 100" style="width:105px; height:105px; display:inline-block;">' +
      circlesHtml +
      '<text x="50" y="48" font-size="8" font-weight="700" fill="var(--text-muted)" text-anchor="middle">TOTAL</text>' +
      '<text x="50" y="58" font-size="9" font-weight="800" fill="var(--text-dark)" text-anchor="middle">' + formatShortNum(totalOut) + '</text>' +
    '</svg>';

  legendCell.innerHTML = legendHtml;
}

function formatShortNum(n) {
  var num = Math.abs(parseFloat(n || 0));
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + "jt";
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(0) + "rb";
  }
  return num.toString();
}

/* =========================================================
   RENDER RIWAYAT TRANSAKSI & HERO WALLET
   ========================================================= */
var txSearchQuery = "";
function onTxSearchInput(val) {
  txSearchQuery = (val || "").trim().toLowerCase();
  renderTransactionsList();
}

function exportTransactionsCsv() {
  window.location.href = "/api/transactions/export.csv";
}

function renderFinanceUI() {
  var totalIn = 0;
  var totalOut = 0;

  for (var i = 0; i < transactionsCache.length; i++) {
    var it = transactionsCache[i];
    var amt = parseFloat(it.amount || 0);
    if (it.type === "IN") {
      totalIn += amt;
    } else if (it.type === "OUT") {
      totalOut += amt;
    }
  }

  // Update Hero Card
  var incomeEl = document.getElementById("total-income");
  var expenseEl = document.getElementById("total-expense");
  var countEl = document.getElementById("tx-count-label");
  var ratioEl = document.getElementById("cashflow-ratio-pill");

  if (incomeEl) incomeEl.textContent = formatIdrCurrency(totalIn, true);
  if (expenseEl) expenseEl.textContent = formatIdrCurrency(totalOut, true);
  if (countEl) countEl.textContent = transactionsCache.length + " Transaksi • Sinkronisasi Aktif";

  if (ratioEl) {
    if (totalIn > 0) {
      var ratio = Math.round(((totalIn - totalOut) / totalIn) * 100);
      ratioEl.textContent = (ratio >= 0 ? "+" : "") + ratio + "% Rasio";
      ratioEl.style.background = ratio >= 0 ? "rgba(16, 185, 129, 0.35)" : "rgba(239, 68, 68, 0.35)";
    } else {
      ratioEl.textContent = "0% Rasio";
      ratioEl.style.background = "rgba(255, 255, 255, 0.22)";
    }
  }

  updateHeroWalletBalance();

  renderTransactionsList();
  renderFinanceCharts();
  renderBudgetsUI();
}

function renderTransactionsList() {
  var listEl = document.getElementById("tx-list");
  var summaryBar = document.getElementById("tx-summary-bar");
  var filterCatSel = document.getElementById("tx-filter-cat");
  var filterMonthSel = document.getElementById("tx-filter-month");

  var filterCat = filterCatSel ? filterCatSel.value : "ALL";
  var filterMonth = filterMonthSel ? filterMonthSel.value : "ALL";

  if (!listEl) return;
  listEl.innerHTML = "";

  var displayedCount = 0;

  for (var i = 0; i < transactionsCache.length; i++) {
    var it = transactionsCache[i];
    var itMonth = extractMonthYearFromDate(it.date, it.timestamp);

    if (filterCat !== "ALL" && it.category !== filterCat) {
      continue;
    }
    if (filterMonth !== "ALL" && itMonth !== filterMonth) {
      continue;
    }

    if (txSearchQuery) {
      var searchable = (
        (it.note || "") + " " +
        (it.category || "") + " " +
        (it.account || "") + " " +
        (it.target_account || "") + " " +
        (it.amount || "")
      ).toLowerCase();
      if (searchable.indexOf(txSearchQuery) === -1) {
        continue;
      }
    }

    displayedCount++;
    var amt = parseFloat(it.amount || 0);
    var isIncome = (it.type === "IN");
    var isTransfer = (it.type === "TRF");

    var signPrefix = isIncome ? "+ " : (isTransfer ? "⇄ " : "- ");
    var amtClass = isIncome ? "amt-in" : (isTransfer ? "amt-trf" : "amt-out");
    var icon = isTransfer ? "⇄" : (CATEGORY_ICONS[it.category] || "💳");

    var receiptHtml = "";
    if (it.receipt_image) {
      receiptHtml = '<img class="tx-receipt-thumb" src="' + it.receipt_image + '" alt="Struk" onclick="viewReceiptImage(\'' + it.receipt_image + '\')" title="Klik untuk lihat struk">';
    }

    var subDetail = "";
    if (isTransfer) {
      subDetail = 'Transfer: ' + safeEscapeHtml(it.account) + ' ➔ ' + safeEscapeHtml(it.target_account || "Akun Lain") + ' &bull; ' + safeEscapeHtml(it.date);
    } else {
      subDetail = safeEscapeHtml(it.category) + (it.account ? ' &bull; ' + safeEscapeHtml(it.account) : '') + ' &bull; ' + safeEscapeHtml(it.date);
    }

    var row = document.createElement("div");
    row.className = "tx-row-item";
    row.innerHTML =
      '<div class="tx-cell-info" style="display:flex; align-items:center; flex:1; min-width:0; padding-right:8px;">' +
        receiptHtml +
        '<div style="overflow:hidden; flex:1; min-width:0;">' +
          '<div style="font-weight:700; color:var(--text-dark); font-size:12.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
            icon + ' ' + safeEscapeHtml(it.note) +
          '</div>' +
          '<div style="font-size:11px; color:var(--text-muted); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' +
            subDetail +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="tx-cell-amt" style="text-align:right; flex-shrink:0;">' +
        '<div class="' + amtClass + '" style="font-size:12.5px; font-weight:800;">' + signPrefix + formatIdrCurrency(amt, true) + '</div>' +
        '<div style="margin-top:5px; white-space:nowrap;">' +
          '<button type="button" class="pill-mini-btn" style="padding:3px 8px; font-size:10px; margin-left:3px;" onclick="openEditTxModal(\'' + safeEscapeHtml(it.id) + '\')">Edit</button>' +
          '<button type="button" class="pill-mini-btn btn-mini-danger" style="padding:3px 8px; font-size:10px; margin-left:3px;" onclick="deleteTransaction(\'' + safeEscapeHtml(it.id) + '\')">✕</button>' +
        '</div>' +
      '</div>';
    listEl.appendChild(row);
  }

  if (summaryBar) {
    if (displayedCount === 0) {
      summaryBar.textContent = "Tidak ada transaksi yang cocok.";
    } else {
      summaryBar.innerHTML =
        'Menampilkan <strong>' + displayedCount + ' transaksi</strong>' +
        (filterMonth !== "ALL" ? ' &bull; Periode: ' + filterMonth : '') +
        (txSearchQuery ? ' &bull; Pencarian: "' + safeEscapeHtml(txSearchQuery) + '"' : '');
    }
  }

  if (displayedCount === 0) {
    listEl.innerHTML =
      '<div style="text-align:center; color:var(--text-light); padding:16px 10px; font-size:12px;">' +
        (txSearchQuery
          ? 'Tidak ada transaksi yang cocok dengan kata kunci "' + safeEscapeHtml(txSearchQuery) + '".'
          : 'Belum ada catatan transaksi pada filter ini.') +
      '</div>';
  }
}

/* =========================================================
   HELPER BULAN & TANGGAL
   ========================================================= */
function getCurrentMonthPrefix() {
  var d = new Date();
  var m = ("0" + (d.getMonth() + 1)).slice(-2);
  var y = d.getFullYear();
  return m + "/" + y; // DD/MM/YYYY
}

function isTimestampThisMonth(ts) {
  if (!ts) return false;
  var d = new Date(parseInt(ts, 10));
  var now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function extractMonthYearFromDate(dateStr, ts) {
  if (dateStr) {
    var parts = dateStr.split(" ")[0].split("/");
    if (parts.length === 3) {
      return parts[1] + "/" + parts[2];
    }
  }
  if (ts) {
    var d = new Date(parseInt(ts, 10));
    return ("0" + (d.getMonth() + 1)).slice(-2) + "/" + d.getFullYear();
  }
  return "";
}

/* =========================================================
   INISIALISASI SAAT HALAMAN DIMUAT
   ========================================================= */
window.addEventListener("load", function() {
  var amountInput = document.getElementById("tx-amount");
  if (amountInput) {
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

  loadAllFinanceData();
});
