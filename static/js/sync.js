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

// Fallback alias jika ada kode yang memanggil appendSyncLog
function appendSyncLog(level, msg) {
  logDetail(level, msg, "");
}

// Kompresi Gambar Sampul Otomatis ke Base64 (Kompatibel Safari iOS 10.3.4 / ES5 Callback)
function compressImageToBase64(file, maxSize, quality, callback) {
  if (!file) {
    if (typeof callback === "function") callback("");
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      try {
        var canvas = document.createElement("canvas");
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
          var dataUrl = canvas.toDataURL("image/jpeg", quality || 0.75);
          if (typeof callback === "function") callback(dataUrl);
          return;
        }
      } catch (err) {
        // Fallback jika canvas terhambat
      }
      if (typeof callback === "function") callback(e.target.result || "");
    };
    img.onerror = function() {
      if (typeof callback === "function") callback("");
    };
    img.src = e.target.result;
  };
  reader.onerror = function() {
    if (typeof callback === "function") callback("");
  };
  reader.readAsDataURL(file);
}

function uploadMp3ToServer() {
  var CLOUD_NAME = "p4yya3go";
  var UPLOAD_PRESET = "splash_audio";
  var CLOUDINARY_ENDPOINT = "https://api.cloudinary.com/v1_1/" + CLOUD_NAME + "/video/upload";

  var fileInput = document.getElementById("upload-mp3-input");
  var albumSelect = document.getElementById("upload-album-select");
  var coverInput = document.getElementById("upload-cover-input");
  var bar = document.getElementById("sync-progress-bar");
  var fileLabel = document.getElementById("file-picker-text");
  var coverLabel = document.getElementById("upload-cover-text");

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    logDetail("ERR", "Validasi Gagal", "Pilih file MP3 / M4A terlebih dahulu!");
    alert("Pilih file MP3 / M4A terlebih dahulu!");
    return;
  }

  var audioFile = fileInput.files[0];
  var albumName = albumSelect ? albumSelect.value.trim() : "";
  var sizeMb = parseFloat((audioFile.size / (1024 * 1024)).toFixed(2));
  var cleanTitle = audioFile.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");

  logDetail("INFO", "Mulai Mengunggah Lagu", audioFile.name + " (" + sizeMb + " MB)");
  if (bar) bar.style.width = "5%";

  var coverFile = (coverInput && coverInput.files && coverInput.files[0]) ? coverInput.files[0] : null;

  // 1. Kompres gambar sampul (jika ada) ke Base64 secara asinkron callback
  compressImageToBase64(coverFile, 300, 0.75, function(coverBase64) {
    if (coverFile && coverBase64) {
      logDetail("INFO", "Sampul Terproses", "Gambar sampul dikonversi ke Base64 (~20KB).");
    }

    // 2. Upload file audio langsung dari browser ke Cloudinary (Bypass batas 4.5MB Vercel)
    var cloudForm = new FormData();
    cloudForm.append("file", audioFile);
    cloudForm.append("upload_preset", UPLOAD_PRESET);
    cloudForm.append("resource_type", "video");

    var xhr = new XMLHttpRequest();
    xhr.open("POST", CLOUDINARY_ENDPOINT, true);

    xhr.upload.onprogress = function(e) {
      if (e.lengthComputable && bar) {
        var pct = Math.round((e.loaded / e.total) * 90);
        bar.style.width = pct + "%";
      }
    };

    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        var cloudRes = {};
        try {
          cloudRes = JSON.parse(xhr.responseText);
        } catch (parseErr) {
          logDetail("ERR", "Format Respon Cloudinary Salah", xhr.responseText);
          if (bar) bar.style.width = "0%";
          return;
        }

        var audioUrl = cloudRes.secure_url || cloudRes.url;
        if (!audioUrl) {
          logDetail("ERR", "URL Cloudinary Kosong", xhr.responseText);
          if (bar) bar.style.width = "0%";
          return;
        }

        logDetail("OK", "Audio Terunggah ke Cloudinary", "Menyimpan metadata ke MongoDB Atlas...");
        if (bar) bar.style.width = "95%";

        // 3. Simpan hanya metadata & URL Cloudinary ke MongoDB Atlas via Flask
        var saveXhr = new XMLHttpRequest();
        saveXhr.open("POST", "/api/tracks/cloud", true);
        saveXhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");

        saveXhr.onload = function() {
          if (saveXhr.status >= 200 && saveXhr.status < 300) {
            if (bar) bar.style.width = "100%";
            logDetail("OK", "Lagu Berhasil Disimpan", cleanTitle + " (" + sizeMb + " MB)" + (albumName ? " • Album: " + albumName : ""));

            // Reset input form
            fileInput.value = "";
            if (coverInput) coverInput.value = "";
            if (fileLabel) {
              fileLabel.textContent = "+ Pilih File MP3 / M4A (100MB+) dari Perangkat";
              fileLabel.style.color = "";
            }
            if (coverLabel) {
              coverLabel.textContent = "+ Pilih Gambar Sampul Khusus Lagu Ini (Opsional)";
              coverLabel.style.color = "";
            }

            fetchAlbumsForSync();
            runServerDiagnostics();
          } else {
            var errData = {};
            try {
              errData = JSON.parse(saveXhr.responseText);
            } catch (e) {}
            var msg = errData.message || saveXhr.responseText || ("HTTP " + saveXhr.status);
            logDetail("ERR", "Gagal Menyimpan ke Database", msg);
            if (bar) bar.style.width = "0%";
          }
        };

        saveXhr.onerror = function() {
          logDetail("ERR", "Koneksi Terputus", "Gagal menghubungi backend saat menyimpan metadata lagu.");
          if (bar) bar.style.width = "0%";
        };

        saveXhr.send(JSON.stringify({
          title: cleanTitle,
          url: audioUrl,
          size_mb: sizeMb,
          album: albumName,
          cover_url: coverBase64,
          cover: coverBase64
        }));
      } else {
        var errText = xhr.responseText || ("HTTP " + xhr.status);
        logDetail("ERR", "Gagal Upload ke Cloudinary (" + xhr.status + ")", errText);
        if (bar) bar.style.width = "0%";
      }
    };

    xhr.onerror = function() {
      logDetail("ERR", "Koneksi Terputus", "Gagal menghubungi Cloudinary. Periksa koneksi internet.");
      if (bar) bar.style.width = "0%";
    };

    xhr.send(cloudForm);
  });
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