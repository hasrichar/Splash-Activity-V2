var playlistCache = [];
var transactionsCache = [];
var currentTrackIndex = -1;
var loopMode = "ALL";
var logHistoryText = [];
var hwAudio = null;
var WAVEFORM_BAR_COUNT = 44;

function getTimestamp() {
  var d = new Date();
  return ("0" + d.getHours()).slice(-2) + ":" +
         ("0" + d.getMinutes()).slice(-2) + ":" +
         ("0" + d.getSeconds()).slice(-2);
}

function logDetail(level, title, detailMsg) {
  var box = document.getElementById("sync-log");
  if (!box) return;
  var timeStr = getTimestamp();
  var tagClass = "tag-info";
  if (level === "OK") tagClass = "tag-ok";
  else if (level === "WARN") tagClass = "tag-warn";
  else if (level === "ERR") tagClass = "tag-err";

  var plain = "[" + timeStr + "] [" + level + "] " + title + (detailMsg ? " -> " + detailMsg : "");
  logHistoryText.push(plain);

  var row = document.createElement("div");
  row.className = "log-row";
  row.innerHTML =
    '<span class="log-time">' + timeStr + '</span>' +
    '<span class="' + tagClass + '">[' + escapeHtml(level) + ']</span> ' +
    '<strong>' + escapeHtml(title) + '</strong>' +
    (detailMsg ? '<br><span style="color:#A4AAB7;">&nbsp;&nbsp;&#8627; ' + escapeHtml(detailMsg) + '</span>' : '');
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function copyDiagnosticLog() {
  prompt("Salin laporan log diagnostik berikut:", logHistoryText.join("\n"));
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function(m) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m];
  });
}

function initWaveformBars() {
  var container = document.getElementById("waveform-container");
  container.innerHTML = "";
  var pattern = [28, 45, 35, 68, 52, 85, 40, 60, 95, 72, 48, 30, 55, 80, 62, 38, 90, 100, 65, 42, 58, 76];
  for (var i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    var bar = document.createElement("div");
    bar.className = "wf-bar";
    bar.style.height = pattern[i % pattern.length] + "%";
    container.appendChild(bar);
  }
}

function updateWaveformProgress(pct) {
  var bars = document.getElementById("waveform-container").children;
  var activeCount = Math.round((pct / 100) * bars.length);
  for (var i = 0; i < bars.length; i++) {
    bars[i].className = (i < activeCount) ? "wf-bar played" : "wf-bar";
  }
}

function seekByWaveform(e) {
  if (!hwAudio || !hwAudio.duration) return;
  var rect = document.getElementById("waveform-container").getBoundingClientRect();
  var ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  hwAudio.currentTime = ratio * hwAudio.duration;
  updateWaveformProgress(ratio * 100);
}

function switchTab(tabName) {
  var views = ["library", "player", "sync", "finance"];
  var titles = {
    library: "Library",
    player: "Now Playing",
    sync: "Server & Diagnostic Log",
    finance: "Vault Keuangan"
  };
  for (var i = 0; i < views.length; i++) {
    var v = views[i];
    document.getElementById("view-" + v).className = (v === tabName) ? "view-section active" : "view-section";
    document.getElementById("tab-btn-" + v).className = (v === tabName) ? "dock-tab active" : "dock-tab";
  }
  document.getElementById("header-view-title").textContent = titles[tabName] || "Charcoal";
}

function fetchTracksFromServer() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/tracks?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      playlistCache = res.tracks || [];
      document.getElementById("db-status").textContent = "DB: " + res.engine;
      document.getElementById("stat-db-engine").textContent = res.engine;
      document.getElementById("stat-track-count").textContent = playlistCache.length;

      var totalMB = 0;
      for (var i = 0; i < playlistCache.length; i++) {
        totalMB += parseFloat(playlistCache[i].size_mb || 0);
      }
      document.getElementById("stat-total-mb").textContent = totalMB.toFixed(1) + " MB";
      renderPlaylistUI();
    }
  };
  xhr.send();
}

function scanServerFolder() {
  document.getElementById("sync-progress-bar").style.width = "40%";
  logDetail("INFO", "Memindai Folder music/", "Mengecek file MP3 dan menyinkronkan ke MongoDB...");

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/scan", true);
  xhr.onload = function() {
    document.getElementById("sync-progress-bar").style.width = "100%";
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      var rep = res.scan_report;
      playlistCache = res.tracks || [];
      renderPlaylistUI();
      logDetail("OK", "Sinkronisasi Folder music Selesai",
        "Terdeteksi " + rep.scanned_count + " lagu (" + rep.removed_count + " entri lama dibersihkan).");
      fetchTracksFromServer();
    } else {
      logDetail("ERR", "Gagal Memindai music", "HTTP Status: " + xhr.status);
    }
  };
  xhr.send();
}

function uploadMp3ToServer() {
  var fileInput = document.getElementById("upload-mp3-input");
  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Pilih file MP3/M4A terlebih dahulu.");
    return;
  }
  var file = fileInput.files[0];
  var sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  logDetail("INFO", "Mengunggah ke music/: " + file.name, "Ukuran: " + sizeMB + " MB...");

  var formData = new FormData();
  formData.append("file", file);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/upload", true);
  xhr.upload.onprogress = function(e) {
    if (e.lengthComputable) {
      var pct = Math.round((e.loaded / e.total) * 100);
      document.getElementById("sync-progress-bar").style.width = pct + "%";
      document.getElementById("sync-badge").textContent = "UPLOAD " + pct + "%";
    }
  };
  xhr.onload = function() {
    document.getElementById("sync-badge").textContent = "HTTP 206 READY";
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      logDetail("OK", "Upload Berhasil: " + res.filename, "Tersimpan di music/ dan tercatat di MongoDB.");
      fileInput.value = "";
      fetchTracksFromServer();
    } else {
      logDetail("ERR", "Upload Gagal", xhr.responseText);
    }
  };
  xhr.send(formData);
}

function addCloudTrackLink() {
  var title = document.getElementById("cloud-track-title").value.trim();
  var url = document.getElementById("cloud-track-url").value.trim();
  var sizeMB = parseFloat(document.getElementById("cloud-track-size").value || "100");
  if (!title || !url) {
    alert("Masukkan Judul dan URL Cloud MP3.");
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/cloud", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      logDetail("OK", "Link Cloud Tersimpan di MongoDB: " + title, url);
      document.getElementById("cloud-track-title").value = "";
      document.getElementById("cloud-track-url").value = "";
      fetchTracksFromServer();
    }
  };
  xhr.send(JSON.stringify({ title: title, url: url, size_mb: sizeMB }));
}

function runServerDiagnostics() {
  switchTab("sync");
  logDetail("INFO", "Menjalankan Pemeriksaan Diagnostik...", "Memverifikasi MongoDB dan folder music/...");

  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/diagnostics?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var d = JSON.parse(xhr.responseText);
      logDetail("OK", d.server, "Database: " + d.db_engine + " | Lagu: " + d.track_count + " (" + d.total_audio_mb + " MB)");
      if (d.corrupt_or_missing && d.corrupt_or_missing.length > 0) {
        logDetail("ERR", "File Hilang / 0 Byte", d.corrupt_or_missing.join(", "));
      } else {
        logDetail("OK", "Verifikasi Berhasil", "Semua lagu siap diputar dengan HTTP 206 Byte-Range Streaming.");
      }
    }
  };
  xhr.send();
}

function renderPlaylistUI() {
  var container = document.getElementById("playlist-container");
  container.innerHTML = "";
  document.getElementById("lib-meta-summary").textContent =
    "Album \u2022 " + playlistCache.length + " Lagu \u2022 HTTP 206 Stream";

  if (playlistCache.length === 0) {
    container.innerHTML =
      '<div class="white-card" style="text-align:center; color:var(--slate-secondary); padding:24px 14px;">' +
        'Belum ada lagu.<br>Taruh file <strong>.mp3</strong> di dalam folder <code>music/</code> lalu ketuk <strong>Scan Server</strong>.' +
      '</div>';
    return;
  }

  for (var i = 0; i < playlistCache.length; i++) {
    (function(idx) {
      var tr = playlistCache[idx];
      var isCurrent = (idx === currentTrackIndex);
      var numStr = ("0" + (idx + 1)).slice(-2);
      var leftIndicator = isCurrent
        ? '<div class="eq-bars"><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div><div class="eq-bar"></div></div>'
        : numStr;

      var row = document.createElement("div");
      row.className = isCurrent ? "track-item active" : "track-item";
      row.onclick = function() { playTrackAtIndex(idx); };
      row.innerHTML =
        '<div class="track-num-col">' + leftIndicator + '</div>' +
        '<div class="track-main-col">' +
          '<div class="track-item-title">' + escapeHtml(tr.title) + '</div>' +
          '<div class="track-item-sub">' + tr.source_type + ' Stream &bull; ' + tr.size_mb + ' MB</div>' +
        '</div>' +
        '<button class="track-more-btn" onclick="event.stopPropagation(); confirmDeleteTrack(\'' + escapeHtml(tr.filename) + '\', \'' + escapeHtml(tr.title).replace(/'/g, "") + '\')">&bull;&bull;&bull;</button>';
      container.appendChild(row);
    })(i);
  }
}

function playTrackAtIndex(idx) {
  if (idx < 0 || idx >= playlistCache.length) return;
  currentTrackIndex = idx;
  var track = playlistCache[idx];

  document.getElementById("np-title").textContent = track.title;
  document.getElementById("np-meta").textContent = "Membuka Stream HTTP 206 (" + track.size_mb + " MB)...";
  document.getElementById("mini-np-text").textContent = track.title;
  renderPlaylistUI();

  hwAudio.src = track.stream_url;
  document.title = track.title + " - Charcoal";

  logDetail("INFO", "Memutar Lagu: " + track.title, "Stream URL: " + track.stream_url + " (" + track.size_mb + " MB)");

  var playPromise = hwAudio.play();
  if (playPromise !== undefined) {
    playPromise.then(function() {
      updatePlayerUI(true);
      logDetail("OK", "Playback Berhasil", "Audio diputar via HTTP 206 tanpa membebani RAM Safari.");
    }).catch(function() {
      updatePlayerUI(false);
      document.getElementById("np-meta").textContent = "Ketuk Play untuk memulai";
    });
  } else {
    updatePlayerUI(true);
  }
}

function playAllFromStart() {
  if (playlistCache.length === 0) { switchTab("sync"); return; }
  playTrackAtIndex(0);
  switchTab("player");
}

function shuffleAndPlay() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex(Math.floor(Math.random() * playlistCache.length));
}

function togglePlayPause() {
  if (playlistCache.length === 0) { switchTab("sync"); return; }
  if (currentTrackIndex === -1) { playTrackAtIndex(0); return; }
  if (hwAudio.paused) {
    hwAudio.play();
    updatePlayerUI(true);
  } else {
    hwAudio.pause();
    updatePlayerUI(false);
  }
}

function playNextTrack() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex((currentTrackIndex + 1) % playlistCache.length);
}

function playPrevTrack() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex((currentTrackIndex - 1 + playlistCache.length) % playlistCache.length);
}

function toggleLoopMode() {
  loopMode = (loopMode === "ALL") ? "ONE" : "ALL";
  hwAudio.loop = (loopMode === "ONE");
  document.getElementById("btn-loop").textContent = loopMode;
}

function confirmDeleteTrack(filename, title) {
  if (!confirm("Hapus lagu '" + title + "'?")) return;
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/tracks/" + encodeURIComponent(filename), true);
  xhr.onload = function() { fetchTracksFromServer(); };
  xhr.send();
}

function updatePlayerUI(isPlaying) {
  var track = (currentTrackIndex >= 0 && playlistCache[currentTrackIndex]) ? playlistCache[currentTrackIndex] : null;
  var trackName = track ? track.title : "Belum Ada Lagu";
  document.getElementById("np-title").textContent = trackName;
  document.getElementById("np-meta").textContent = track ? (track.size_mb + " MB \u2022 HTTP 206 Stream") : "Pilih lagu dari Library";
  document.getElementById("btn-play-main").innerHTML = isPlaying ? "&#10074;&#10074;" : "&#9654;";
  document.getElementById("mini-play-btn").innerHTML = isPlaying ? "&#10074;&#10074;" : "&#9654;";
  document.getElementById("np-art-box").className = isPlaying ? "np-artwork-wrap playing" : "np-artwork-wrap";
  document.getElementById("mini-np-text").textContent = trackName;
  document.getElementById("mini-state-badge").textContent = isPlaying ? "Streaming Aktif \u2022 " + (track ? track.size_mb + " MB" : "") : "Dijeda";
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ":" + ("0" + s).slice(-2);
}

function formatRupiah(num) {
  var str = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (num < 0 ? "-Rp " : "Rp ") + str;
}

function loadTransactions() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/transactions?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      transactionsCache = res.transactions || [];
      renderFinanceUI(transactionsCache);
    }
  };
  xhr.send();
}

function addTransaction() {
  var type = document.getElementById("tx-type").value;
  var category = document.getElementById("tx-cat").value;
  var amountRaw = parseInt(document.getElementById("tx-amount").value, 10);
  var note = document.getElementById("tx-note").value.trim() || category;
  if (!amountRaw || amountRaw <= 0) {
    alert("Masukkan nominal yang valid.");
    return;
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/transactions", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      document.getElementById("tx-amount").value = "";
      document.getElementById("tx-note").value = "";
      logDetail("OK", "Transaksi Disimpan ke MongoDB", type + " " + formatRupiah(amountRaw));
      loadTransactions();
    }
  };
  xhr.send(JSON.stringify({ type: type, category: category, amount: amountRaw, note: note }));
}

function deleteTransaction(id) {
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/transactions/" + encodeURIComponent(id), true);
  xhr.onload = function() { loadTransactions(); };
  xhr.send();
}

function renderFinanceUI(items) {
  var totalIn = 0, totalOut = 0;
  var listEl = document.getElementById("tx-list");
  listEl.innerHTML = "";

  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (it.type === "IN") totalIn += it.amount;
    else totalOut += it.amount;

    var row = document.createElement("div");
    row.className = "fin-row";
    row.innerHTML =
      '<div>' +
        '<div style="font-weight:700;">' + escapeHtml(it.note) + '</div>' +
        '<div style="font-size:11px; color:var(--slate-secondary);">' + escapeHtml(it.category) + ' &bull; ' + escapeHtml(it.date) + '</div>' +
      '</div>' +
      '<div style="display:flex; align-items:center; gap:8px;">' +
        '<span class="fin-amt ' + it.type + '">' + (it.type === "IN" ? "+" : "-") + formatRupiah(it.amount) + '</span>' +
        '<button class="icon-pill-btn" onclick="deleteTransaction(\'' + it.id + '\')">X</button>' +
      '</div>';
    listEl.appendChild(row);
  }

  document.getElementById("total-balance").textContent = formatRupiah(totalIn - totalOut);
  document.getElementById("total-income").textContent = formatRupiah(totalIn);
  document.getElementById("total-expense").textContent = formatRupiah(totalOut);
  document.getElementById("tx-count-label").textContent = items.length + " Transaksi";
}

window.addEventListener("load", function() {
  hwAudio = document.getElementById("hw-audio");
  initWaveformBars();

  hwAudio.addEventListener("loadedmetadata", function() {
    document.getElementById("time-dur").textContent = formatTime(hwAudio.duration);
  });
  hwAudio.addEventListener("ended", function() {
    if (loopMode === "ONE") { hwAudio.currentTime = 0; hwAudio.play(); }
    else { playNextTrack(); }
  });
  hwAudio.addEventListener("timeupdate", function() {
    var cur = hwAudio.currentTime;
    var dur = hwAudio.duration;
    document.getElementById("time-cur").textContent = formatTime(cur);
    document.getElementById("time-dur").textContent = formatTime(dur);
    if (dur > 0) updateWaveformProgress((cur / dur) * 100);
  });

  fetchTracksFromServer();
  loadTransactions();
  runServerDiagnostics();
});