var logHistoryText = [];
var albumsListCache = [];

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

  logHistoryText.push("[" + timeStr + "] [" + level + "] " + title + (detailMsg ? " -> " + detailMsg : ""));

  var row = document.createElement("div");
  row.className = "log-row";
  row.innerHTML =
    '<span class="log-time">' + timeStr + '</span>' +
    '<span class="' + tagClass + '">[' + escapeHtml(level) + ']</span> ' +
    '<strong>' + escapeHtml(title) + '</strong>' +
    (detailMsg ? '<br><span style="color:#9BA3B2;">&nbsp;&nbsp;&#8627; ' + escapeHtml(detailMsg) + '</span>' : '');
  box.appendChild(row);
  box.scrollTop = box.scrollHeight;
}

function copyDiagnosticLog() {
  prompt("Salin laporan log diagnostik berikut:", logHistoryText.join("\n"));
}

/* =========================================================
   MANAJEMEN GRUP ALBUM & KOLOM SELECT PENCARIAN ALBUM
   ========================================================= */
function fetchAlbumsForSync() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/albums?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      albumsListCache = res.albums || [];
      populateAlbumSelectElement("upload-album-select", "");
      populateAlbumSelectElement("cloud-album-select", "");
      renderSyncAlbumsList();
    }
  };
  xhr.send();
}

function populateAlbumSelectElement(selectId, keyword) {
  var sel = document.getElementById(selectId);
  if (!sel) return;
  var currentVal = sel.value;
  sel.innerHTML = '<option value="">-- Di Luar Album (Tanpa Grup) --</option>';

  var kw = (keyword || "").toLowerCase();
  for (var i = 0; i < albumsListCache.length; i++) {
    var alb = albumsListCache[i];
    if (!kw || alb.name.toLowerCase().indexOf(kw) !== -1) {
      var opt = document.createElement("option");
      opt.value = alb.name;
      opt.textContent = "Album: " + alb.name + " (" + alb.track_count + " Lagu)";
      sel.appendChild(opt);
    }
  }
  sel.value = currentVal;
}

function filterAlbumSelect(inputId, selectId) {
  var kw = document.getElementById(inputId).value.trim();
  populateAlbumSelectElement(selectId, kw);
  var sel = document.getElementById(selectId);
  if (kw && sel.options.length > 1) {
    sel.selectedIndex = 1;
  }
}

function renderSyncAlbumsList() {
  var listEl = document.getElementById("sync-albums-list");
  var badgeEl = document.getElementById("album-total-badge");
  if (badgeEl) badgeEl.textContent = albumsListCache.length + " Album";
  if (!listEl) return;
  listEl.innerHTML = "";

  if (albumsListCache.length === 0) {
    listEl.innerHTML = '<div style="text-align:center; color:var(--text-light); font-size:11px; padding:8px;">Belum ada grup album yang dibuat.</div>';
    return;
  }

  for (var i = 0; i < albumsListCache.length; i++) {
    var alb = albumsListCache[i];
    var row = document.createElement("div");
    row.className = "tx-row-item";
    row.innerHTML =
      '<div class="tx-cell-info">' +
        '<div style="font-weight:800; color:var(--text-dark);">' + escapeHtml(alb.name) + '</div>' +
        '<div style="font-size:11px; color:var(--text-muted);">' + alb.track_count + ' Lagu di dalam grup</div>' +
      '</div>' +
      '<div class="tx-cell-amt">' +
        '<button type="button" class="pill-mini-btn" style="color:var(--red-err);" onclick="deleteAlbumGroup(\'' + alb.id + '\', \'' + escapeHtml(alb.name).replace(/'/g, "") + '\')">Hapus Grup</button>' +
      '</div>';
    listEl.appendChild(row);
  }
}

function updateNewAlbumCoverLabel(inputEl) {
  var lbl = document.getElementById("new-album-cover-text");
  if (inputEl.files && inputEl.files.length > 0) {
    lbl.textContent = "Sampul Album: " + inputEl.files[0].name;
    lbl.style.color = "#14171F";
  } else {
    lbl.textContent = "+ Pilih Gambar Sampul Album (Opsional)";
  }
}

function createNewAlbumGroup() {
  var nameInput = document.getElementById("new-album-name");
  var coverInput = document.getElementById("new-album-cover");
  var name = nameInput.value.trim();
  if (!name) {
    alert("Masukkan nama album baru terlebih dahulu.");
    return;
  }

  var formData = new FormData();
  formData.append("name", name);
  if (coverInput.files && coverInput.files.length > 0) {
    formData.append("cover_file", coverInput.files[0]);
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/albums", true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      logDetail("OK", "Grup Album Dibuat: " + name, "Kini tersedia di daftar pilihan Select Album.");
      nameInput.value = "";
      coverInput.value = "";
      updateNewAlbumCoverLabel(coverInput);
      fetchAlbumsForSync();
    } else {
      alert("Gagal membuat album.");
    }
  };
  xhr.send(formData);
}

function deleteAlbumGroup(albumId, albumName) {
  if (!confirm("Hapus grup album '" + albumName + "'? (Lagu di dalamnya tidak akan terhapus dan akan dipindahkan ke Luar Album)")) return;
  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/albums/" + encodeURIComponent(albumId), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      logDetail("WARN", "Grup Album Dihapus: " + albumName, "Seluruh lagu di dalamnya telah dipindahkan ke Luar Album.");
      fetchAlbumsForSync();
    }
  };
  xhr.send();
}

/* =========================================================
   UPLOAD LAGU & LINK CLOUD DENGAN SELECT ALBUM
   ========================================================= */
function updateSelectedFileName(inputEl) {
  var labelEl = document.getElementById("file-picker-text");
  if (!labelEl) return;
  if (inputEl.files && inputEl.files.length > 0) {
    var f = inputEl.files[0];
    labelEl.textContent = f.name + " (" + (f.size / (1024 * 1024)).toFixed(1) + " MB)";
    labelEl.style.color = "#14171F";
  } else {
    labelEl.textContent = "+ Pilih File MP3 / M4A (100MB+) dari Perangkat";
  }
}

function updateUploadCoverLabel(inputEl) {
  var lbl = document.getElementById("upload-cover-text");
  if (!lbl) return;
  if (inputEl.files && inputEl.files.length > 0) {
    lbl.textContent = "Gambar Lagu: " + inputEl.files[0].name;
    lbl.style.color = "#14171F";
  } else {
    lbl.textContent = "+ Pilih Gambar Sampul Khusus Lagu Ini (Opsional)";
  }
}

function scanServerFolder() {
  document.getElementById("sync-progress-bar").style.width = "50%";
  logDetail("INFO", "Memindai Folder music/", "Menyinkronkan file fisik dengan MongoDB...");

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/scan", true);
  xhr.onload = function() {
    document.getElementById("sync-progress-bar").style.width = "100%";
    if (xhr.status >= 200 && xhr.status < 300) {
      var res = JSON.parse(xhr.responseText);
      var rep = res.scan_report;
      logDetail("OK", "Scan Folder music/ Selesai", "Aktif: " + rep.scanned_count + " lagu | Dibersihkan: " + rep.removed_count);
      fetchAlbumsForSync();
      runServerDiagnostics();
    }
  };
  xhr.send();
}

function uploadMp3ToServer() {
  var fileInput = document.getElementById("upload-mp3-input");
  var albumSelect = document.getElementById("upload-album-select");
  var coverInput = document.getElementById("upload-cover-input");

  if (!fileInput.files || fileInput.files.length === 0) {
    alert("Pilih file MP3/M4A terlebih dahulu.");
    return;
  }
  var file = fileInput.files[0];
  var chosenAlbum = albumSelect ? albumSelect.value : "";
  logDetail("INFO", "Mengunggah: " + file.name, "Grup Album: " + (chosenAlbum || "Di Luar Album"));

  var formData = new FormData();
  formData.append("file", file);
  formData.append("album", chosenAlbum);
  if (coverInput && coverInput.files && coverInput.files.length > 0) {
    formData.append("cover_file", coverInput.files[0]);
  }

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
      logDetail("OK", "Upload Berhasil", file.name + " masuk ke: " + (chosenAlbum || "Di Luar Album"));
      fileInput.value = "";
      if (coverInput) { coverInput.value = ""; updateUploadCoverLabel(coverInput); }
      updateSelectedFileName(fileInput);
      fetchAlbumsForSync();
      runServerDiagnostics();
    } else {
      logDetail("ERR", "Upload Gagal", xhr.responseText);
    }
  };
  xhr.send(formData);
}

function addCloudTrackLink() {
  var title = document.getElementById("cloud-track-title").value.trim();
  var url = document.getElementById("cloud-track-url").value.trim();
  var album = document.getElementById("cloud-album-select").value;
  var coverUrl = document.getElementById("cloud-track-cover").value.trim();
  var sizeMB = parseFloat(document.getElementById("cloud-track-size").value || "100");
  if (!title || !url) { alert("Masukkan Judul dan URL Cloud MP3."); return; }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/cloud", true);
  xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      logDetail("OK", "Link Cloud Ditambahkan: " + title, "Album: " + (album || "Di Luar Album"));
      document.getElementById("cloud-track-title").value = "";
      document.getElementById("cloud-track-url").value = "";
      document.getElementById("cloud-track-cover").value = "";
      fetchAlbumsForSync();
      runServerDiagnostics();
    }
  };
  xhr.send(JSON.stringify({ title: title, url: url, album: album, cover_url: coverUrl, size_mb: sizeMB }));
}

function runServerDiagnostics() {
  var xhr = new XMLHttpRequest();
  xhr.open("GET", "/api/diagnostics?t=" + new Date().getTime(), true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      var d = JSON.parse(xhr.responseText);
      document.getElementById("stat-db-engine").textContent = "MONGODB";
      document.getElementById("stat-track-count").textContent = d.track_count;
      document.getElementById("stat-total-mb").textContent = d.total_audio_mb + " MB";
      var badge = document.getElementById("menu-track-badge");
      if (badge) badge.textContent = d.track_count;

      logDetail("OK", d.server, "Lagu: " + d.track_count + " | Album: " + (d.album_count || 0) + " (" + d.total_audio_mb + " MB)");
    }
  };
  xhr.send();
}

window.addEventListener("load", function() {
  fetchAlbumsForSync();
  runServerDiagnostics();
});