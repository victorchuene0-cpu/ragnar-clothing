const WHATSAPP_NUMBER = "27665411726";
// Shoppers pick WHO it's for first (department), then the product type.
const DEPARTMENTS = ["Men", "Women", "Teens", "Kids"];
const DEFAULT_AUDIENCE = ["Men", "Women"];   // items saved before audiences existed are treated as adult unisex until the owner sets one
// Product types are edited by the owner (admin -> Categories) and stored in settings/site. These are only the starting set.
const DEFAULT_CATEGORIES = ["Hoodies", "Sweaters", "Tracksuits", "Hats"];
let categories = DEFAULT_CATEGORIES.slice();
const ALL = "__all__";                        // "Everything" inside a department
let products = [];
let catalogLoaded = false;
let cart = [];
let currentDept = null;
let currentType = null;
let currentSize = null;

function fmtR(n) { return "R" + Number(n).toLocaleString("en-ZA"); }

function audiencesFor(p) {
  const a = Array.isArray(p.audience) ? p.audience.filter(x => DEPARTMENTS.includes(x)) : [];
  return a.length ? a : DEFAULT_AUDIENCE;
}
function cleanCategories(raw) {
  if (!Array.isArray(raw)) return DEFAULT_CATEGORIES.slice();   // never saved yet -> starting set
  const seen = new Set(), out = [];
  raw.forEach(v => {
    if (typeof v !== "string") return;
    const t = v.trim().slice(0, 30), k = t.toLowerCase();
    if (t && !seen.has(k)) { seen.add(k); out.push(t); }
  });
  return out.slice(0, 30);
}
// Owner's order first, then any type still used by an item but missing from the list, so nothing ever disappears.
function categoryOrder(items) {
  const out = categories.slice();
  items.forEach(p => { if (p.category && !out.includes(p.category)) out.push(p.category); });
  return out;
}
function inDept(dept) { return products.filter(p => audiencesFor(p).includes(dept)); }

// Product photos are stored inside the product as a small JPEG data URL. Only accept that exact shape.
const IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/]+=*$/;
function safeImage(v) { return typeof v === "string" && IMAGE_RE.test(v) ? v : ""; }
function firstImage(list) {
  for (const p of list) { const i = safeImage(p.image); if (i) return i; }
  return "";
}

function showPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelectorAll(".nav-link").forEach(b => b.classList.remove("active"));
  window.scrollTo(0, 0);
}
function markNav(test) {
  document.querySelectorAll(".nav-link").forEach(b => { if (test(b.dataset)) b.classList.add("active"); });
}
function goHome() {
  currentDept = null; currentType = null; currentSize = null;
  showPage("home");
  markNav(d => d.page === "home");
  renderHomeTiles();
}
function goDept(dept, type) {
  currentDept = dept; currentType = type || null; currentSize = null;
  showPage("category");
  markNav(d => d.dept === dept);
  renderCategoryPage();
}
function goNotices() {
  currentDept = null; currentType = null; currentSize = null;
  showPage("notices");
  markNav(d => d.page === "notices");
}
document.getElementById("nav-home-btn").addEventListener("click", goHome);
document.getElementById("notices-back").addEventListener("click", goHome);
document.getElementById("hero-shop-btn").addEventListener("click", () => {
  document.getElementById("shop-section").scrollIntoView({ behavior: "smooth" });
});
document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.page === "notices") goNotices();
    else if (btn.dataset.dept) goDept(btn.dataset.dept);
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
  const photoSrc = safeImage(p.image);
  if (photoSrc) {
    const photo = document.createElement("img");
    photo.className = "product-photo";
    photo.src = photoSrc;
    photo.alt = p.name || "";
    photo.loading = "lazy";
    photo.decoding = "async";
    card.replaceChild(photo, card.querySelector(".product-swatch"));
  }
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
function makeTile(name, count, onClick, image) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "tile";
  tile.innerHTML = `<div class="tile-swatch"></div><div class="tile-label"><div class="tile-name"></div><div class="tile-count"></div></div>`;
  if (image) {
    const sw = tile.querySelector(".tile-swatch");
    sw.style.backgroundImage = 'url("' + image + '")';
    sw.style.backgroundSize = "cover";
    sw.style.backgroundPosition = "center";
  }
  tile.querySelector(".tile-name").textContent = name;
  tile.querySelector(".tile-count").textContent = count === 1 ? "1 item" : count + " items";
  tile.addEventListener("click", onClick);
  return tile;
}

// Home: one tile per department that actually has stock. Empty departments stay hidden.
function renderHomeTiles() {
  if (!catalogLoaded) return;
  const root = document.getElementById("home-tiles");
  root.innerHTML = "";
  const depts = DEPARTMENTS.filter(d => inDept(d).length > 0);
  document.querySelectorAll(".nav-link[data-dept]").forEach(b => { b.hidden = !depts.includes(b.dataset.dept); });
  if (depts.length === 0) { root.innerHTML = '<p class="empty-note">Nothing here yet — check back soon.</p>'; return; }
  depts.forEach(d => { const list = inDept(d); root.appendChild(makeTile(d, list.length, () => goDept(d), firstImage(list))); });
}

// Department page = type tiles (Hoodies, Sweaters…). Type page = product grid with size/age filter.
function renderCategoryPage() {
  if (!currentDept) return;
  const items = inDept(currentDept);
  const crumb = document.getElementById("breadcrumb");
  crumb.innerHTML = "";
  const crumbBtn = (label, fn) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.addEventListener("click", fn);
    crumb.appendChild(b);
  };
  const sep = () => crumb.appendChild(document.createTextNode(" / "));
  crumbBtn("Home", goHome); sep();

  const tiles = document.getElementById("type-tiles");
  const grid = document.getElementById("category-grid");
  const bar = document.getElementById("size-filter");

  if (!currentType) {
    crumb.appendChild(document.createTextNode(currentDept));
    document.getElementById("category-title").textContent = currentDept;
    grid.hidden = true; bar.hidden = true; tiles.hidden = false;
    renderTypeTiles(items);
  } else {
    crumbBtn(currentDept, () => goDept(currentDept)); sep();
    const typeLabel = currentType === ALL ? "Everything" : currentType;
    crumb.appendChild(document.createTextNode(typeLabel));
    document.getElementById("category-title").textContent = currentDept + " · " + typeLabel;
    tiles.hidden = true; grid.hidden = false;
    renderProductList(items);
  }
}

function renderTypeTiles(items) {
  const root = document.getElementById("type-tiles");
  root.innerHTML = "";
  if (items.length === 0) { root.innerHTML = '<p class="empty-note">Nothing here yet — check back soon.</p>'; return; }
  const entries = [{ key: ALL, label: "Everything", count: items.length, image: firstImage(items) }];
  categoryOrder(items).forEach(c => {
    const list = items.filter(p => p.category === c);
    if (list.length > 0) entries.push({ key: c, label: c, count: list.length, image: firstImage(list) });
  });
  entries.forEach(e => root.appendChild(makeTile(e.label, e.count, () => goDept(currentDept, e.key), e.image)));
}

const SIZE_ORDER = ["One size", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
function sizeRank(s) {
  const i = SIZE_ORDER.indexOf(s);
  if (i !== -1) return i;
  const m = /^\s*(\d+)/.exec(s);           // age sizes like "5-6 yrs" sort by their first number
  return m ? 100 + Number(m[1]) : 1000;
}
function sizeSort(a, b) { return sizeRank(a) - sizeRank(b) || a.localeCompare(b); }

function renderProductList(items) {
  const grid = document.getElementById("category-grid");
  const bar = document.getElementById("size-filter");
  const list = currentType === ALL ? items : items.filter(p => p.category === currentType);

  // Size / age filter: built from what is actually on this page, so it works for adult sizes and kids' ages alike.
  const sizes = Array.from(new Set(list.reduce((acc, p) => acc.concat(sizesFor(p)), []))).sort(sizeSort);
  if (currentSize && !sizes.includes(currentSize)) currentSize = null;
  bar.innerHTML = "";
  if (sizes.length >= 2) {
    const label = document.createElement("span");
    label.className = "filter-label"; label.textContent = "Size / age";
    bar.appendChild(label);
    [null].concat(sizes).forEach(s => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "filter-chip" + (s === currentSize ? " active" : "");
      chip.textContent = s === null ? "All" : s;
      chip.setAttribute("aria-pressed", s === currentSize ? "true" : "false");
      chip.addEventListener("click", () => { currentSize = s; renderProductList(inDept(currentDept)); });
      bar.appendChild(chip);
    });
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }

  const shown = currentSize ? list.filter(p => sizesFor(p).includes(currentSize)) : list;
  grid.innerHTML = "";
  if (shown.length === 0) { grid.innerHTML = '<p class="empty-note">Nothing here yet — check back soon.</p>'; return; }
  shown.forEach(p => grid.appendChild(buildProductCard(p)));
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
    const data = snap.exists ? (snap.data() || {}) : {};
    const nextCats = cleanCategories(data.categories);
    if (JSON.stringify(nextCats) !== JSON.stringify(categories)) {   // only redraw when the list really changed
      categories = nextCats;
      if (catalogLoaded && currentDept) renderCategoryPage();
    }
    const raw = data.communityLink || "";
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
    catalogLoaded = true;
    renderHomeTiles();
    if (currentDept) renderCategoryPage();
  },
  () => { document.getElementById("home-tiles").innerHTML = '<p class="empty-note">Catalog is temporarily unavailable.</p>'; }
);
