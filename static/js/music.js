var playlistCache = [];
var registeredAlbums = [];
var currentTrackIndex = -1;
var loopMode = "ALL";
var hwAudio = null;
var expandedAlbums = {};
var renderLibraryToken = 0;

var SVG_PLAY = '<svg class="svg-ic" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
var SVG_PAUSE = '<svg class="svg-ic" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
var SVG_MORE = '<svg class="svg-ic" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';

function renderMusicLibrarySkeletons() {
  var albumsWrap = document.getElementById("albums-section-wrap");
  var albumsContainer = document.getElementById("albums-container");
  var ungroupedContainer = document.getElementById("playlist-container");
  var albumsTitle = document.getElementById("albums-count-title");
  var ungroupedTitle = document.getElementById("lib-meta-summary");

  if (albumsWrap) albumsWrap.style.display = "block";
  if (albumsTitle) albumsTitle.textContent = "Grup Album (Memuat...)";
  if (ungroupedTitle) ungroupedTitle.textContent = "Daftar Lagu (Memuat...)";

  if (albumsContainer) {
    var albHtml = "";
    for (var a = 0; a < 2; a++) {
      albHtml +=
        '<div class="skeleton-album-card">' +
          '<div class="ag-col-art"><div class="skeleton-art-box shimmer-block"></div></div>' +
          '<div class="ag-col-info">' +
            '<div class="skeleton-bar-title shimmer-block"></div>' +
            '<div class="skeleton-bar-sub shimmer-block"></div>' +
          '</div>' +
          '<div class="ag-col-btn" style="width:115px; text-align:right;">' +
            '<div class="skeleton-pill-btn shimmer-block" style="margin-right:4px;"></div>' +
            '<div class="skeleton-pill-btn shimmer-block"></div>' +
          '</div>' +
        '</div>';
    }
    albumsContainer.innerHTML = albHtml;
  }

  if (ungroupedContainer) {
    var trHtml = "";
    for (var t = 0; t < 5; t++) {
      trHtml +=
        '<div class="skeleton-track-row">' +
          '<div class="tr-col-thumb"><div class="skeleton-thumb-box shimmer-block"></div></div>' +
          '<div class="tr-col-info">' +
            '<div class="skeleton-bar-title shimmer-block" style="width:' + (55 + (t % 3) * 12) + '%;"></div>' +
            '<div class="skeleton-bar-sub shimmer-block" style="width:' + (35 + (t % 2) * 15) + '%;"></div>' +
          '</div>' +
          '<div class="tr-col-act">' +
            '<div class="skeleton-thumb-box shimmer-block" style="width:24px; height:24px; border-radius:12px; margin-left:auto;"></div>' +
          '</div>' +
        '</div>';
    }
    ungroupedContainer.innerHTML = trHtml;
  }
}

function fetchTracksAndAlbums() {
  renderMusicLibrarySkeletons();

  var albumsDone = false;
  var tracksDone = false;

  function onAllFetched() {
    if (albumsDone && tracksDone) {
      var badge = document.getElementById("menu-track-badge");
      if (badge) badge.textContent = playlistCache.length;
      renderMusicLibraryUI();
    }
  }

  var xhr1 = new XMLHttpRequest();
  xhr1.open("GET", "/api/albums?t=" + new Date().getTime(), true);
  xhr1.onload = function() {
    if (xhr1.status >= 200 && xhr1.status < 300) {
      try {
        registeredAlbums = JSON.parse(xhr1.responseText).albums || [];
      } catch (e) {
        registeredAlbums = [];
      }
    }
    albumsDone = true;
    onAllFetched();
  };
  xhr1.onerror = function() {
    albumsDone = true;
    onAllFetched();
  };
  xhr1.send();

  var xhr2 = new XMLHttpRequest();
  xhr2.open("GET", "/api/tracks?t=" + new Date().getTime(), true);
  xhr2.onload = function() {
    if (xhr2.status >= 200 && xhr2.status < 300) {
      try {
        playlistCache = JSON.parse(xhr2.responseText).tracks || [];
      } catch (e) {
        playlistCache = [];
      }
    }
    tracksDone = true;
    onAllFetched();
  };
  xhr2.onerror = function() {
    tracksDone = true;
    onAllFetched();
  };
  xhr2.send();
}

function quickScanMusic() {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/scan", true);
  xhr.onload = function() { fetchTracksAndAlbums(); };
  xhr.send();
}

function createTrackRowElement(tr, globalIdx) {
  var row = document.createElement("div");
  row.className = ((globalIdx === currentTrackIndex) ? "track-row-item active" : "track-row-item") + " progressive-fade-in";
  row.onclick = function() { playTrackAtIndex(globalIdx); };

  var thumbContent;
  if (tr.cover_url) {
    thumbContent = '<img class="tr-thumb-img progressive-img" src="' + escapeHtml(tr.cover_url) + '" alt="" onload="this.className+=\' img-ready\'" onerror="this.style.display=\'none\'">';
  } else {
    thumbContent = (globalIdx + 1);
  }

  var subText = tr.album
    ? (escapeHtml(tr.album) + " &bull; " + tr.size_mb + " MB")
    : (tr.size_mb + " MB &bull; Di Luar Album");

  row.innerHTML =
    '<div class="tr-col-thumb"><div class="tr-thumb-box">' + thumbContent + '</div></div>' +
    '<div class="tr-col-info">' +
      '<div class="tr-title">' + escapeHtml(tr.title) + '</div>' +
      '<div class="tr-sub">' + subText + '</div>' +
    '</div>' +
    '<div class="tr-col-act">' +
      '<button type="button" class="tr-del-btn" onclick="event.stopPropagation(); openEditTrackModal(' + globalIdx + ')">' + SVG_MORE + '</button>' +
    '</div>';
  return row;
}

function renderMusicLibraryUI() {
  var albumsWrap = document.getElementById("albums-section-wrap");
  var albumsContainer = document.getElementById("albums-container");
  var ungroupedContainer = document.getElementById("playlist-container");

  albumsContainer.innerHTML = "";
  ungroupedContainer.innerHTML = "";

  var albumsMap = {};
  var albumCoverMap = {};
  var albumNames = [];

  for (var r = 0; r < registeredAlbums.length; r++) {
    var rName = registeredAlbums[r].name;
    albumsMap[rName] = [];
    albumCoverMap[rName] = registeredAlbums[r].cover_url || "";
    albumNames.push(rName);
  }

  var ungroupedIndices = [];
  for (var i = 0; i < playlistCache.length; i++) {
    var tr = playlistCache[i];
    var alb = (tr.album || "").trim();
    if (alb) {
      if (!albumsMap[alb]) {
        albumsMap[alb] = [];
        albumNames.push(alb);
      }
      albumsMap[alb].push(i);
      if (!albumCoverMap[alb] && tr.cover_url) {
        albumCoverMap[alb] = tr.cover_url;
      }
    } else {
      ungroupedIndices.push(i);
    }
  }

  // 1. Render Kartu Grup Album
  if (albumNames.length > 0) {
    albumsWrap.style.display = "block";
    document.getElementById("albums-count-title").textContent = "Grup Album (" + albumNames.length + ")";

    for (var a = 0; a < albumNames.length; a++) {
      (function(albName) {
        var idxList = albumsMap[albName] || [];
        var albumCover = albumCoverMap[albName] || "";

        var card = document.createElement("div");
        card.className = "album-group-card progressive-fade-in";

        var artHtml = albumCover
          ? '<img class="ag-art-img progressive-img" src="' + escapeHtml(albumCover) + '" alt="" onload="this.className+=\' img-ready\'" onerror="this.style.display=\'none\'">'
          : escapeHtml(albName.charAt(0).toUpperCase());

        var playBtnHtml = idxList.length > 0
          ? '<button type="button" class="pill-mini-btn" onclick="event.stopPropagation(); playTrackAtIndex(' + idxList[0] + ')">Putar</button>'
          : '';

        var header = document.createElement("div");
        header.className = "album-group-header";
        header.onclick = function() { toggleAlbumFolder(albName); };
        header.innerHTML =
          '<div class="ag-col-art"><div class="ag-art-box">' + artHtml + '</div></div>' +
          '<div class="ag-col-info">' +
            '<div class="ag-title">' + escapeHtml(albName) + '</div>' +
            '<div class="ag-sub">' + idxList.length + ' Lagu dalam Grup</div>' +
          '</div>' +
          '<div class="ag-col-btn" style="width:115px;">' +
            '<button type="button" class="pill-mini-btn" style="margin-right:3px;" onclick="event.stopPropagation(); openAssignToAlbumModal(\'' + escapeHtml(albName).replace(/'/g, "") + '\')">+ Lagu</button>' +
            playBtnHtml +
          '</div>';

        var drawer = document.createElement("div");
        drawer.className = expandedAlbums[albName] ? "album-tracks-drawer open" : "album-tracks-drawer";
        if (idxList.length === 0) {
          drawer.innerHTML = '<div style="text-align:center; color:var(--text-light); font-size:11px; padding:8px;">Album masih kosong. Ketuk <strong>+ Lagu</strong> untuk memasukkan lagu.</div>';
        } else {
          for (var m = 0; m < idxList.length; m++) {
            drawer.appendChild(createTrackRowElement(playlistCache[idxList[m]], idxList[m]));
          }
        }

        card.appendChild(header);
        card.appendChild(drawer);
        albumsContainer.appendChild(card);
      })(albumNames[a]);
    }
  } else {
    albumsWrap.style.display = "none";
  }

  // 2. Render Lagu di Luar Album (Progressive Chunked Loading)
  document.getElementById("lib-meta-summary").textContent =
    "Lagu di Luar Album (" + ungroupedIndices.length + " Lagu)";

  renderLibraryToken++;
  var currentToken = renderLibraryToken;

  if (ungroupedIndices.length === 0) {
    ungroupedContainer.innerHTML =
      '<div class="clean-card" style="text-align:center; color:var(--text-muted); padding:16px 12px; font-size:12px;">' +
        (playlistCache.length === 0
          ? 'Belum ada lagu. Ketuk <strong>Refresh Lagu</strong> atau buka menu <strong>Integrations</strong>.'
          : 'Semua lagu sudah berada di dalam grup Album di atas.') +
      '</div>';
  } else {
    var CHUNK_SIZE = 12;
    var uIdx = 0;
    function renderNextTrackChunk() {
      if (currentToken !== renderLibraryToken) return;
      var limit = Math.min(uIdx + CHUNK_SIZE, ungroupedIndices.length);
      for (; uIdx < limit; uIdx++) {
        var gIdx = ungroupedIndices[uIdx];
        ungroupedContainer.appendChild(createTrackRowElement(playlistCache[gIdx], gIdx));
      }
      if (uIdx < ungroupedIndices.length) {
        setTimeout(renderNextTrackChunk, 16);
      }
    }
    renderNextTrackChunk();
  }
}

function toggleAlbumFolder(albName) {
  expandedAlbums[albName] = !expandedAlbums[albName];
  renderMusicLibraryUI();
}

/* =========================================================
   MODAL 1: PINDAHKAN LAGU KE ALBUM (DARI LAGU -> ALBUM)
   ========================================================= */
function populateModalAlbumDropdown(selectedAlbum, filterKw) {
  var sel = document.getElementById("edit-track-album-select");
  sel.innerHTML = '<option value="">-- Di Luar Album (Tanpa Grup) --</option>';

  var kw = (filterKw || "").toLowerCase();
  for (var i = 0; i < registeredAlbums.length; i++) {
    var name = registeredAlbums[i].name;
    if (!kw || name.toLowerCase().indexOf(kw) !== -1) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = "Album: " + name;
      sel.appendChild(opt);
    }
  }
  sel.value = selectedAlbum || "";
}

function filterModalAlbumSelect(kw) {
  var currentVal = document.getElementById("edit-track-album-select").value;
  populateModalAlbumDropdown(currentVal, kw);
  var sel = document.getElementById("edit-track-album-select");
  if (kw && sel.options.length > 1) {
    sel.selectedIndex = 1;
  }
}

function openEditTrackModal(idx) {
  var tr = playlistCache[idx];
  if (!tr) return;

  document.getElementById("edit-track-filename").value = tr.filename;
  document.getElementById("edit-track-title").value = tr.title || "";
  document.getElementById("edit-album-filter").value = "";
  populateModalAlbumDropdown(tr.album || "", "");

  document.getElementById("edit-track-cover-url").value = tr.cover_url || "";
  document.getElementById("edit-track-cover-file").value = "";
  document.getElementById("edit-cover-label").textContent = "+ Pilih File Gambar (JPG/PNG) dari Perangkat";

  document.getElementById("edit-modal-backdrop").className = "modal-backdrop open";
  document.getElementById("edit-modal-box").className = "modal-box open";
}

function closeEditTrackModal() {
  document.getElementById("edit-modal-backdrop").className = "modal-backdrop";
  document.getElementById("edit-modal-box").className = "modal-box";
}

function updateCoverFileLabel(inputEl) {
  var lbl = document.getElementById("edit-cover-label");
  if (inputEl.files && inputEl.files.length > 0) {
    lbl.textContent = "Gambar dipilih: " + inputEl.files[0].name;
    lbl.style.color = "#14171F";
  } else {
    lbl.textContent = "+ Pilih File Gambar (JPG/PNG) dari Perangkat";
  }
}

function saveTrackMetaChanges() {
  var fname = document.getElementById("edit-track-filename").value;
  var title = document.getElementById("edit-track-title").value.trim();
  var album = document.getElementById("edit-track-album-select").value;
  var coverUrl = document.getElementById("edit-track-cover-url").value.trim();
  var fileInput = document.getElementById("edit-track-cover-file");

  var formData = new FormData();
  formData.append("filename", fname);
  formData.append("title", title);
  formData.append("album", album);
  formData.append("cover_url", coverUrl);
  if (fileInput.files && fileInput.files.length > 0) {
    formData.append("cover_file", fileInput.files[0]);
  }

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/meta", true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      if (album) expandedAlbums[album] = true;
      closeEditTrackModal();
      fetchTracksAndAlbums();
    }
  };
  xhr.send(formData);
}

function removeTrackFromAlbum() {
  document.getElementById("edit-track-album-select").value = "";
  saveTrackMetaChanges();
}

function deleteTrackFromModal() {
  var fname = document.getElementById("edit-track-filename").value;
  var title = document.getElementById("edit-track-title").value;
  if (!confirm("Hapus lagu '" + title + "' secara permanen?")) return;

  var xhr = new XMLHttpRequest();
  xhr.open("DELETE", "/api/tracks/" + encodeURIComponent(fname), true);
  xhr.onload = function() {
    closeEditTrackModal();
    fetchTracksAndAlbums();
  };
  xhr.send();
}

/* =========================================================
   MODAL 2: SEBALIKNYA (TARIK LAGU DARI LUAR KE ALBUM INI)
   ========================================================= */
function openAssignToAlbumModal(albumName) {
  document.getElementById("assign-target-album").value = albumName;
  document.getElementById("assign-modal-title").textContent = "Ke Album: " + albumName;

  var sel = document.getElementById("assign-track-select");
  sel.innerHTML = "";
  var count = 0;

  for (var i = 0; i < playlistCache.length; i++) {
    var tr = playlistCache[i];
    if (tr.album !== albumName) {
      var opt = document.createElement("option");
      opt.value = tr.filename;
      opt.textContent = tr.title + (tr.album ? " (Dari: " + tr.album + ")" : " (Di Luar Album)");
      sel.appendChild(opt);
      count++;
    }
  }

  if (count === 0) {
    alert("Semua lagu sudah berada di dalam album '" + albumName + "'.");
    return;
  }

  document.getElementById("assign-modal-backdrop").className = "modal-backdrop open";
  document.getElementById("assign-modal-box").className = "modal-box open";
}

function closeAssignToAlbumModal() {
  document.getElementById("assign-modal-backdrop").className = "modal-backdrop";
  document.getElementById("assign-modal-box").className = "modal-box";
}

function confirmAssignTrackToAlbum() {
  var targetAlbum = document.getElementById("assign-target-album").value;
  var filename = document.getElementById("assign-track-select").value;
  if (!filename) return;

  var formData = new FormData();
  formData.append("filename", filename);
  formData.append("album", targetAlbum);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/tracks/meta", true);
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      expandedAlbums[targetAlbum] = true;
      closeAssignToAlbumModal();
      fetchTracksAndAlbums();
    }
  };
  xhr.send(formData);
}

/* =========================================================
   KONTROL PEMUTAR UTAMA
   ========================================================= */
function playTrackAtIndex(idx) {
  if (idx < 0 || idx >= playlistCache.length) return;
  currentTrackIndex = idx;
  var track = playlistCache[idx];
  if (track.album) expandedAlbums[track.album] = true;

  updateNowPlayingCover(track);
  document.getElementById("np-title").textContent = track.title;
  document.getElementById("np-meta").textContent = (track.album ? track.album + " \u2022 " : "") + track.size_mb + " MB";
  renderMusicLibraryUI();

  hwAudio.src = track.stream_url;
  var playPromise = hwAudio.play();
  if (playPromise !== undefined) {
    playPromise.then(function() { updatePlayerUI(true); }).catch(function() {
      updatePlayerUI(false);
      document.getElementById("np-meta").textContent = "Ketuk Play untuk memulai";
    });
  } else {
    updatePlayerUI(true);
  }
}

function updateNowPlayingCover(track) {
  var imgEl = document.getElementById("np-cover-img");
  var dotEl = document.getElementById("np-art-dot");
  if (track && track.cover_url) {
    imgEl.className = "progressive-img";
    imgEl.onload = function() {
      imgEl.className = "progressive-img img-ready";
    };
    imgEl.src = track.cover_url;
    imgEl.style.display = "block";
    dotEl.style.display = "none";
  } else {
    imgEl.src = "";
    imgEl.className = "";
    imgEl.style.display = "none";
    dotEl.style.display = "block";
  }
}

function togglePlayPause() {
  if (playlistCache.length === 0) return;
  if (currentTrackIndex === -1) { playTrackAtIndex(0); return; }
  if (hwAudio.paused) { hwAudio.play(); updatePlayerUI(true); }
  else { hwAudio.pause(); updatePlayerUI(false); }
}

function playNextTrack() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex((currentTrackIndex + 1) % playlistCache.length);
}

function playPrevTrack() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex((currentTrackIndex - 1 + playlistCache.length) % playlistCache.length);
}

function shuffleAndPlay() {
  if (playlistCache.length === 0) return;
  playTrackAtIndex(Math.floor(Math.random() * playlistCache.length));
}

function toggleLoopMode() {
  loopMode = (loopMode === "ALL") ? "ONE" : "ALL";
  hwAudio.loop = (loopMode === "ONE");
  document.getElementById("btn-loop").textContent = loopMode;
}

function seekByLinearBar(e) {
  if (!hwAudio || !hwAudio.duration) return;
  var rect = document.getElementById("scrubber-box").getBoundingClientRect();
  var clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
  var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  hwAudio.currentTime = ratio * hwAudio.duration;
  document.getElementById("np-bar-fill").style.width = Math.round(ratio * 100) + "%";
}

function updatePlayerUI(isPlaying) {
  var track = (currentTrackIndex >= 0 && playlistCache[currentTrackIndex]) ? playlistCache[currentTrackIndex] : null;
  document.getElementById("np-title").textContent = track ? track.title : "Belum Ada Lagu";
  document.getElementById("np-meta").textContent = track
    ? ((track.album ? track.album + " \u2022 " : "Di Luar Album \u2022 ") + (isPlaying ? "Sedang Diputar" : "Dijeda"))
    : "Pilih lagu di bawah";
  document.getElementById("btn-play-main").innerHTML = isPlaying ? SVG_PAUSE : SVG_PLAY;
}

function formatTime(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  return Math.floor(sec / 60) + ":" + ("0" + Math.floor(sec % 60)).slice(-2);
}

window.addEventListener("load", function() {
  hwAudio = document.getElementById("hw-audio");
  hwAudio.addEventListener("loadedmetadata", function() {
    document.getElementById("time-dur").textContent = formatTime(hwAudio.duration);
  });
  hwAudio.addEventListener("ended", function() {
    if (loopMode === "ONE") { hwAudio.currentTime = 0; hwAudio.play(); }
    else { playNextTrack(); }
  });
  hwAudio.addEventListener("timeupdate", function() {
    var cur = hwAudio.currentTime, dur = hwAudio.duration;
    document.getElementById("time-cur").textContent = formatTime(cur);
    document.getElementById("time-dur").textContent = formatTime(dur);
    if (dur > 0) document.getElementById("np-bar-fill").style.width = Math.round((cur / dur) * 100) + "%";
  });
  fetchTracksAndAlbums();
});