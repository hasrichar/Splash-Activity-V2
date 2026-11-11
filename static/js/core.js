function toggleMenuDrawer(openState) {
  var drawer = document.getElementById("menu-drawer");
  var backdrop = document.getElementById("menu-backdrop");
  var triggerBtn = document.querySelector(".menu-trigger-btn");
  if (!drawer || !backdrop) return;

  if (openState) {
    drawer.className = "menu-drawer open";
    backdrop.className = "menu-backdrop open";
    if (triggerBtn) triggerBtn.className = "menu-trigger-btn btn-active-anchor";
  } else {
    drawer.className = "menu-drawer";
    backdrop.className = "menu-backdrop";
    if (triggerBtn) triggerBtn.className = "menu-trigger-btn";
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function(m) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[m];
  });
}

function formatRupiah(num) {
  var str = Math.abs(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (num < 0 ? "-Rp " : "Rp ") + str;
}

// Efek "Shrinks back in on pick" (Nomor 1 Anchor Pop) saat memilih item menu
window.addEventListener("load", function() {
  var items = document.querySelectorAll(".drawer-item");
  for (var i = 0; i < items.length; i++) {
    items[i].addEventListener("click", function(e) {
      var targetUrl = this.getAttribute("href");
      if (!targetUrl) return;
      e.preventDefault();

      // Kecilkan kembali menu ke ujung tombol, lalu pindah halaman
      toggleMenuDrawer(false);
      setTimeout(function() {
        window.location.href = targetUrl;
      }, 150);
    });
  }
});