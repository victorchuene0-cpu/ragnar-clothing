const WHATSAPP_NUMBER = "27665411726";
const CATEGORIES = ["Hoodies", "Sweaters", "Tracksuits", "Hats"];
let products = [];
let cart = [];
let currentCategory = null;

function fmtR(n) { return "R" + Number(n).toLocaleString("en-ZA"); }

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
  window.scrollTo(0, 0);
}
function goHome() {
  currentCategory = null;
  showPage("home");
  document.querySelector('.nav-link[data-cat=""]').classList.add("active");
  renderHomeTiles();
}
function goCategory(cat) {
  currentCategory = cat;
  showPage("category");
  const b = document.querySelector(`.nav-link[data-cat="${cat}"]`);
  if (b) b.classList.add("active");
  document.getElementById("category-title").textContent = cat;
  document.getElementById("category-title-crumb").textContent = cat;
  renderCategoryGrid();
}
function goNotices() {
  currentCategory = null;
  showPage("notices");
  document.querySelector('.nav-link[data-page="notices"]').classList.add("active");
}
document.getElementById("nav-home-btn").addEventListener("click", goHome);
document.getElementById("back-to-home").addEventListener("click", goHome);
document.getElementById("notices-back").addEventListener("click", goHome);
document.getElementById("hero-shop-btn").addEventListener("click", () => goCategory(CATEGORIES[0]));
document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.page === "notices") goNotices();
    else if (btn.dataset.cat) goCategory(btn.dataset.cat);
    else goHome();
  });
});

function renderCart() {
  const itemsEl = document.getElementById("cart-items");
  document.getElementById("cart-count").textContent = cart.reduce((s, i) => s + i.qty, 0);
  if (cart.length === 0) {
    itemsEl.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
    document.getElementById("cart-total").textContent = fmtR(0);
    return;
  }
  itemsEl.innerHTML = "";
  let total = 0;
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    const label = document.createElement("span");
    label.textContent = `${item.name} (${item.size}) x${item.qty} — ${fmtR(item.price * item.qty)}`;
    const rm = document.createElement("button");
    rm.className = "cart-item-remove"; rm.textContent = "Remove";
    rm.addEventListener("click", () => { cart.splice(idx, 1); renderCart(); });
    row.appendChild(label); row.appendChild(rm);
    itemsEl.appendChild(row);
  });
  document.getElementById("cart-total").textContent = fmtR(total);
}
function addToCart(p, size) {
  const existing = cart.find(i => i.id === p.id && i.size === size);
  if (existing) existing.qty += 1;
  else cart.push({ id: p.id, name: p.name, price: p.price, size, qty: 1 });
  renderCart(); openCart();
}
function openCart() { document.getElementById("cart-drawer").classList.add("open"); document.getElementById("scrim").classList.add("open"); }
function closeCart() { document.getElementById("cart-drawer").classList.remove("open"); document.getElementById("scrim").classList.remove("open"); }
document.getElementById("cart-toggle").addEventListener("click", openCart);
document.getElementById("cart-close").addEventListener("click", closeCart);
document.getElementById("scrim").addEventListener("click", closeCart);
// ---------- Delivery details (kept on the customer's own device only) ----------
const DETAILS_KEY = "ragnar_delivery_details";
const FIELD_IDS = ["name", "phone", "street", "suburb", "city", "province", "postal", "notes"];
const $d = (k) => document.getElementById("d-" + k);

function getMethod() {
  return document.querySelector('#delivery-form input[name="method"]:checked').value;
}
function toggleAddressFields() {
  document.getElementById("address-fields").style.display = getMethod() === "Collection" ? "none" : "grid";
}
function saveDetails() {
  const data = { method: getMethod() };
  FIELD_IDS.forEach(k => { data[k] = $d(k).value.trim(); });
  try { localStorage.setItem(DETAILS_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked — fine */ }
}
function loadDetails() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(DETAILS_KEY) || "null"); } catch (e) { /* ignore */ }
  if (!data) return;
  FIELD_IDS.forEach(k => { if (data[k]) $d(k).value = data[k]; });
  const radio = document.querySelector(`#delivery-form input[name="method"][value="${data.method}"]`);
  if (radio) radio.checked = true;
  toggleAddressFields();
}
document.querySelectorAll("#delivery-form input, #delivery-form select").forEach(el => {
  el.addEventListener("input", saveDetails);
  el.addEventListener("change", () => { saveDetails(); toggleAddressFields(); });
});
loadDetails();

function validateDetails() {
  const required = ["name", "phone"];
  if (getMethod() === "Delivery") required.push("street", "suburb", "city", "province", "postal");
  let firstBad = null;
  FIELD_IDS.forEach(k => $d(k).classList.remove("invalid"));
  required.forEach(k => {
    if (!$d(k).value.trim()) {
      $d(k).classList.add("invalid");
      if (!firstBad) firstBad = $d(k);
    }
  });
  const err = document.getElementById("delivery-error");
  if (firstBad) {
    err.textContent = "Please fill in the highlighted fields so we can deliver your order.";
    firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
    firstBad.focus();
    return false;
  }
  err.textContent = "";
  return true;
}

document.getElementById("checkout-btn").addEventListener("click", (e) => {
  e.preventDefault();
  if (cart.length === 0) return;
  if (!validateDetails()) return;
  saveDetails();
  const lines = cart.map(i => `- ${i.name} (Size: ${i.size}) x${i.qty} — ${fmtR(i.price * i.qty)}`).join("\n");
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const method = getMethod();
  const v = (k) => $d(k).value.trim();
  let details = `Name: ${v("name")}\nContact: ${v("phone")}\n${method === "Collection" ? "Method: I'll collect" : "Method: Delivery"}`;
  if (method === "Delivery") {
    details += `\nAddress: ${v("street")}, ${v("suburb")}, ${v("city")}, ${v("province")}, ${v("postal")}`;
    if (v("notes")) details += `\nNotes: ${v("notes")}`;
  }
  const msg = `Hi! I'd like to order:\n${lines}\n\nTotal: ${fmtR(total)}\n\n${details}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
});

const DEFAULT_SIZES = ["S", "M", "L", "XL"];
function sizesFor(p) { return Array.isArray(p.sizes) && p.sizes.length ? p.sizes : DEFAULT_SIZES; }

function buildProductCard(p) {
  const sizes = sizesFor(p);
  const soldOut = !!p.soldOut;
  const card = document.createElement("div");
  card.className = "product-card" + (soldOut ? " sold-out" : "");
  card.innerHTML = `<div class="product-swatch"></div><div class="product-name"></div><div class="product-price"></div>
    <div class="size-label">${sizes.length === 1 ? "Size" : "Choose a size"}</div>
    <div class="size-row"></div>
    <p class="size-error"></p>
    <button type="button" class="add-btn">Add to bag</button>`;
  card.querySelector(".product-name").textContent = p.name;
  card.querySelector(".product-price").textContent = fmtR(p.price) + (p.note ? " · " + p.note : "");

  const row = card.querySelector(".size-row");
  const err = card.querySelector(".size-error");
  const btn = card.querySelector(".add-btn");
  let size = sizes.length === 1 ? sizes[0] : null;   // never pre-pick a size for the customer
  const pills = sizes.map(s => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = "size-pill" + (s === size ? " active" : "");
    pill.textContent = s;
    pill.disabled = soldOut;
    pill.addEventListener("click", () => {
      pills.forEach(x => x.classList.remove("active"));
      pill.classList.add("active");
      size = s;
      err.textContent = "";
    });
    row.appendChild(pill);
    return pill;
  });

  if (soldOut) {
    btn.textContent = "Sold out";
    btn.disabled = true;
  } else {
    btn.addEventListener("click", () => {
      if (!size) { err.textContent = "Pick a size first."; return; }
      addToCart(p, size);
    });
  }
  return card;
}
function renderHomeTiles() {
  const root = document.getElementById("home-tiles");
  root.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const count = products.filter(p => p.category === cat).length;
    const tile = document.createElement("button");
    tile.className = "tile";
    tile.innerHTML = `<div class="tile-swatch"></div><div class="tile-label"><div class="tile-name"></div><div class="tile-count"></div></div>`;
    tile.querySelector(".tile-name").textContent = cat;
    tile.querySelector(".tile-count").textContent = count === 1 ? "1 item" : count + " items";
    tile.addEventListener("click", () => goCategory(cat));
    root.appendChild(tile);
  });
}
function renderCategoryGrid() {
  const grid = document.getElementById("category-grid");
  grid.innerHTML = "";
  const items = products.filter(p => p.category === currentCategory);
  if (items.length === 0) { grid.innerHTML = '<p class="empty-note">Nothing here yet — check back soon.</p>'; return; }
  items.forEach(p => grid.appendChild(buildProductCard(p)));
}

// ---------- Notices & community link (posted from admin.html) ----------
let notices = [];
let noticesFailed = false;
const DISMISS_KEY = "ragnar_dismissed_notice";

function isLive(n) {
  if (n.active === false) return false;
  if (n.expiresAt && n.expiresAt < Date.now()) return false;
  return true;
}
function safeWhatsAppLink(url) {
  try {
    const u = new URL(url);
    const hostOk = ["chat.whatsapp.com", "whatsapp.com", "www.whatsapp.com"].includes(u.hostname);
    return u.protocol === "https:" && hostOk ? u.href : "";
  } catch (e) { return ""; }
}
function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function renderBanner(live) {
  const el = document.getElementById("notice-banner");
  const top = live.find(n => n.level === "important");
  let dismissed = null;
  try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (e) { /* storage blocked — fine */ }
  if (!top || top.id === dismissed) { el.hidden = true; return; }
  el.dataset.id = top.id;
  document.getElementById("notice-banner-title").textContent = top.title || "Notice";
  document.getElementById("notice-banner-text").textContent = top.message || "";
  el.hidden = false;
}

function renderNotices() {
  const list = document.getElementById("notice-list");
  const live = noticesFailed ? [] : notices.filter(isLive);
  list.innerHTML = "";
  if (noticesFailed) {
    list.innerHTML = '<p class="empty-note">Notices are unavailable right now.</p>';
  } else if (live.length === 0) {
    list.innerHTML = '<p class="empty-note">No notices right now.</p>';
  }
  live.forEach(n => {
    const card = document.createElement("article");
    card.className = "notice-card" + (n.level === "important" ? " important" : "");
    card.innerHTML = '<div class="notice-meta"><span class="notice-tag"></span><time></time></div><h3></h3><p></p>';
    card.querySelector(".notice-tag").textContent = n.level === "important" ? "Important" : "Update";
    card.querySelector("time").textContent = n.createdAt ? fmtDate(n.createdAt) : "";
    card.querySelector("h3").textContent = n.title || "";
    card.querySelector("p").textContent = n.message || "";
    list.appendChild(card);
  });
  renderBanner(live);
}

document.getElementById("notice-banner-more").addEventListener("click", goNotices);
document.getElementById("notice-banner-close").addEventListener("click", () => {
  const el = document.getElementById("notice-banner");
  try { localStorage.setItem(DISMISS_KEY, el.dataset.id || ""); } catch (e) { /* ignore */ }
  el.hidden = true;
});

db.collection("notices").orderBy("createdAt", "desc").limit(30).onSnapshot(
  (snap) => { notices = snap.docs.map(d => ({ id: d.id, ...d.data() })); noticesFailed = false; renderNotices(); },
  () => { noticesFailed = true; renderNotices(); }
);

db.doc("settings/site").onSnapshot(
  (snap) => {
    const raw = snap.exists ? ((snap.data() || {}).communityLink || "") : "";
    const link = safeWhatsAppLink(raw);
    document.getElementById("community-box").hidden = !link;
    document.getElementById("footer-community").hidden = !link;
    if (link) {
      document.getElementById("community-btn").href = link;
      document.getElementById("footer-community").href = link;
    }
  },
  () => { /* settings unreadable — simply no community button */ }
);

// Live from Firestore — public read, write locked to the signed-in admin only (see firestore.rules)
db.collection("products").orderBy("createdAt", "asc").onSnapshot(
  (snap) => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHomeTiles();
    if (currentCategory) renderCategoryGrid();
  },
  () => { document.getElementById("home-tiles").innerHTML = '<p class="empty-note">Catalog is temporarily unavailable.</p>'; }
);
