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

// Store info (delivery fee, delivery/returns/privacy wording, contact details) is edited by the owner in admin -> Store info
// and kept in settings/site. Nothing here is customer data.
const INFO_TEXT_FIELDS = { deliveryText: 600, returnsText: 2000, privacyText: 2000, bizName: 80, bizAddress: 200, bizPhone: 30, bizEmail: 100, bizReg: 40 };
function parseSiteInfo(data) {
  const d = data || {}, out = {};
  Object.keys(INFO_TEXT_FIELDS).forEach(k => { out[k] = typeof d[k] === "string" ? d[k].trim().slice(0, INFO_TEXT_FIELDS[k]) : ""; });
  const f = typeof d.deliveryFee === "number" ? d.deliveryFee : NaN;
  out.deliveryFee = Number.isFinite(f) && f >= 0 && f <= 10000 ? f : null;   // null = "to be confirmed per order"
  return out;
}
let siteInfo = parseSiteInfo({});

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

// ---------- Prices and photos that depend on size and colour ----------
// A product has one base price. Some sizes (sizeExtras: [{size, extra}]) and some colours (colors: [{name, extra, image, soldOut}])
// add whole rands on top. Products saved before this existed have neither, so they behave exactly as before.
const EXTRA_MAX = 10000, MAX_COLORS = 8;
function cleanExtra(v) { return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= EXTRA_MAX ? v : 0; }
function basePrice(p) { const n = Number(p.price); return Number.isFinite(n) && n >= 0 ? n : 0; }
function sizeExtraFor(p, size) {
  const hit = (Array.isArray(p.sizeExtras) ? p.sizeExtras : []).find(x => x && x.size === size);
  return hit ? cleanExtra(hit.extra) : 0;
}
function colorsFor(p) {
  if (!Array.isArray(p.colors)) return [];
  const seen = new Set(), out = [];
  p.colors.forEach(c => {
    if (!c || typeof c.name !== "string") return;
    const name = c.name.trim().slice(0, 30), key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push({ name, extra: cleanExtra(c.extra), image: safeImage(c.image), soldOut: !!c.soldOut });
  });
  return out.slice(0, MAX_COLORS);
}
function priceFor(p, size, color) { return basePrice(p) + sizeExtraFor(p, size) + (color ? color.extra : 0); }
function coverImage(p) {
  const own = safeImage(p.image);
  if (own) return own;
  const c = colorsFor(p).find(x => x.image);
  return c ? c.image : "";
}
function firstImage(list) {
  for (const p of list) { const i = coverImage(p); if (i) return i; }
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
function goInfo() {
  currentDept = null; currentType = null; currentSize = null;
  showPage("info");
  markNav(d => d.page === "info");
}
document.getElementById("nav-home-btn").addEventListener("click", goHome);
document.getElementById("notices-back").addEventListener("click", goHome);
document.getElementById("info-back").addEventListener("click", goHome);
document.getElementById("footer-info").addEventListener("click", (e) => { e.preventDefault(); goInfo(); });
document.getElementById("cart-info-btn").addEventListener("click", () => { closeCart(); goInfo(); });
document.getElementById("hero-shop-btn").addEventListener("click", () => {
  document.getElementById("shop-section").scrollIntoView({ behavior: "smooth" });
});
document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.page === "notices") goNotices();
    else if (btn.dataset.page === "info") goInfo();
    else if (btn.dataset.dept) goDept(btn.dataset.dept);
    else goHome();
  });
});

// ---------- Phone menu (below 1100px the nav links open as a full-screen menu) ----------
const topnavEl = document.querySelector(".topnav");
const menuToggle = document.getElementById("menu-toggle");
function setMenu(open) {
  topnavEl.classList.toggle("menu-open", open);
  menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
  document.body.classList.toggle("no-scroll", open);
  if (open) document.getElementById("menu-close").focus(); else if (document.activeElement && document.activeElement.id === "menu-close") menuToggle.focus();
}
menuToggle.addEventListener("click", () => setMenu(true));
document.getElementById("menu-close").addEventListener("click", () => setMenu(false));
document.getElementById("nav-links").addEventListener("click", (e) => { if (e.target.closest(".nav-link, .nav-extra")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && topnavEl.classList.contains("menu-open")) setMenu(false); });
const wideScreen = window.matchMedia ? window.matchMedia("(min-width:1100px)") : null;   // older browsers: skip, the menu still closes on tap
if (wideScreen && wideScreen.addEventListener) wideScreen.addEventListener("change", (e) => { if (e.matches) setMenu(false); });

// What delivery costs for the chosen method. fee === null means the owner hasn't set a fee, so the total can't include it yet.
function deliveryFor(method) {
  if (method === "Collection") return { fee: 0, label: "Collection, no fee", msg: "Collection (no fee)" };
  const f = siteInfo.deliveryFee;
  if (f === null) return { fee: null, label: "To be confirmed", msg: "to be confirmed (please tell me the cost)" };
  const text = f === 0 ? "Free" : fmtR(f);
  return { fee: f, label: text, msg: text };
}
function renderCart() {
  const itemsEl = document.getElementById("cart-items");
  const lines = document.getElementById("cart-lines");
  document.getElementById("cart-count").textContent = cart.reduce((s, i) => s + i.qty, 0);
  if (cart.length === 0) {
    itemsEl.innerHTML = '<p class="cart-empty">Your bag is empty.</p>';
    lines.hidden = true;
    document.getElementById("cart-total-label").textContent = "Total";
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
    label.textContent = `${item.name} (${item.size}${item.color ? ", " + item.color : ""}) x${item.qty} — ${fmtR(item.price * item.qty)}`;
    const rm = document.createElement("button");
    rm.className = "cart-item-remove"; rm.textContent = "Remove";
    rm.addEventListener("click", () => { cart.splice(idx, 1); renderCart(); });
    row.appendChild(label); row.appendChild(rm);
    itemsEl.appendChild(row);
  });
  const d = deliveryFor(getMethod());
  lines.hidden = false;
  document.getElementById("cart-subtotal").textContent = fmtR(total);
  document.getElementById("cart-delivery").textContent = d.label;
  document.getElementById("cart-total-label").textContent = d.fee === null ? "Total (excl. delivery)" : "Total";
  document.getElementById("cart-total").textContent = fmtR(total + (d.fee || 0));
}
function addToCart(p, size, color) {
  const colorName = color ? color.name : "";
  const existing = cart.find(i => i.id === p.id && i.size === size && i.color === colorName);   // same item, size AND colour = one line
  if (existing) existing.qty += 1;
  else cart.push({ id: p.id, name: p.name, price: priceFor(p, size, color), size, color: colorName, qty: 1 });
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
// Switching between Delivery and Collection changes the delivery line and the total.
document.querySelectorAll('#delivery-form input[name="method"]').forEach(r => r.addEventListener("change", renderCart));
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
  const lines = cart.map(i => `- ${i.name} (Size: ${i.size}${i.color ? ", Colour: " + i.color : ""}) x${i.qty} — ${fmtR(i.price * i.qty)}`).join("\n");
  const itemsTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const method = getMethod();
  const dl = deliveryFor(method);
  const totals = `Items: ${fmtR(itemsTotal)}\nDelivery: ${dl.msg}\n` +
    (dl.fee === null ? `Total (excl. delivery): ${fmtR(itemsTotal)}` : `Total: ${fmtR(itemsTotal + dl.fee)}`);
  const v = (k) => $d(k).value.trim();
  let details = `Name: ${v("name")}\nContact: ${v("phone")}\n${method === "Collection" ? "Method: I'll collect" : "Method: Delivery"}`;
  if (method === "Delivery") {
    details += `\nAddress: ${v("street")}, ${v("suburb")}, ${v("city")}, ${v("province")}, ${v("postal")}`;
    if (v("notes")) details += `\nNotes: ${v("notes")}`;
  }
  const msg = `Hi! I'd like to order:\n${lines}\n\n${totals}\n\n${details}`;
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, "_blank");
});

const DEFAULT_SIZES = ["S", "M", "L", "XL"];
function sizesFor(p) { return Array.isArray(p.sizes) && p.sizes.length ? p.sizes : DEFAULT_SIZES; }

function buildProductCard(p) {
  const sizes = sizesFor(p);
  const colors = colorsFor(p);
  const soldOut = !!p.soldOut || (colors.length > 0 && colors.every(c => c.soldOut));   // every colour gone = the item is gone
  const card = document.createElement("div");
  card.className = "product-card" + (soldOut ? " sold-out" : "");
  card.innerHTML = `<div class="product-swatch"></div><div class="product-name"></div><div class="product-price"></div>` +
    (colors.length ? `<div class="size-label color-label">${colors.length === 1 ? "Colour" : "Choose a colour"}</div><div class="color-row"></div>` : "") +
    `<div class="size-label">${sizes.length === 1 ? "Size" : "Choose a size"}</div>
    <div class="size-row"></div>
    <p class="size-error"></p>
    <button type="button" class="add-btn">Add to bag</button>`;

  // The photo follows the chosen colour. A colour without its own photo falls back to the item's main photo.
  const defaultPhoto = coverImage(p);
  let photoEl = card.querySelector(".product-swatch");
  function showPhoto(src, alt) {
    if (!src) return;
    if (photoEl.tagName !== "IMG") {
      const img = document.createElement("img");
      img.className = "product-photo";
      img.loading = "lazy";
      img.decoding = "async";
      card.replaceChild(img, photoEl);
      photoEl = img;
    }
    photoEl.src = src;
    photoEl.alt = alt || "";
  }
  showPhoto(defaultPhoto, p.name || "");
  card.querySelector(".product-name").textContent = p.name;

  const row = card.querySelector(".size-row");
  const colorRow = card.querySelector(".color-row");
  const err = card.querySelector(".size-error");
  const btn = card.querySelector(".add-btn");
  const priceEl = card.querySelector(".product-price");
  let size = sizes.length === 1 ? sizes[0] : null;   // never pre-pick a size for the customer
  let color = colors.length === 1 && !colors[0].soldOut && !soldOut ? colors[0] : null;   // a single colour is not a choice

  // "From R450" until everything that changes the price has been chosen, then the exact price.
  function paintPrice() {
    const sx = (size ? [size] : sizes).map(s => sizeExtraFor(p, s));
    const open = colors.filter(c => !c.soldOut);
    const cx = !colors.length ? [0] : (color ? [color] : (open.length ? open : colors)).map(c => c.extra);
    const lo = basePrice(p) + Math.min(...sx) + Math.min(...cx);
    const hi = basePrice(p) + Math.max(...sx) + Math.max(...cx);
    priceEl.textContent = (lo === hi ? fmtR(lo) : "From " + fmtR(lo)) + (p.note ? " · " + p.note : "");
  }

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
      paintPrice();
    });
    row.appendChild(pill);
    return pill;
  });

  const chips = colors.map(c => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "color-chip" + (c === color ? " active" : "") + (c.soldOut ? " sold" : "");
    chip.textContent = c.name;
    chip.disabled = soldOut || c.soldOut;
    if (c.soldOut) chip.setAttribute("aria-label", c.name + " (sold out)");
    chip.addEventListener("click", () => {
      chips.forEach(x => x.classList.remove("active"));
      chip.classList.add("active");
      color = c;
      err.textContent = "";
      showPhoto(c.image || defaultPhoto, (p.name || "") + " — " + c.name);
      paintPrice();
    });
    colorRow.appendChild(chip);
    return chip;
  });
  if (color) showPhoto(color.image || defaultPhoto, (p.name || "") + " — " + color.name);
  paintPrice();

  if (soldOut) {
    btn.textContent = "Sold out";
    btn.disabled = true;
  } else {
    btn.addEventListener("click", () => {
      if (colors.length && !color && !size) { err.textContent = "Pick a colour and a size first."; return; }
      if (colors.length && !color) { err.textContent = "Pick a colour first."; return; }
      if (!size) { err.textContent = "Pick a size first."; return; }
      addToCart(p, size, color);
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

// ---------- Store info page: delivery, returns, contact, privacy (written by the owner in admin -> Store info) ----------
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function infoSection(title) {
  const sec = document.createElement("section");
  sec.className = "info-section";
  const h = document.createElement("h3");
  h.textContent = title;
  sec.appendChild(h);
  return sec;
}
function infoText(sec, text) {
  const p = document.createElement("p");
  p.className = "info-text";
  p.textContent = text;                       // textContent only: owner-written text can never inject markup
  sec.appendChild(p);
}
function hasContact(s) { return !!(s.bizName || s.bizAddress || s.bizPhone || s.bizEmail || s.bizReg); }
function hasInfo(s) { return s.deliveryFee !== null || !!(s.deliveryText || s.returnsText || s.privacyText) || hasContact(s); }

function renderInfo() {
  const root = document.getElementById("info-sections");
  const s = siteInfo;
  root.innerHTML = "";
  if (s.deliveryFee !== null || s.deliveryText) {
    const sec = infoSection("Delivery");
    if (s.deliveryFee !== null) infoText(sec, s.deliveryFee === 0 ? "Delivery fee: free" : "Delivery fee: " + fmtR(s.deliveryFee));
    if (s.deliveryText) infoText(sec, s.deliveryText);
    root.appendChild(sec);
  }
  if (s.returnsText) {
    const sec = infoSection("Returns & refunds");
    infoText(sec, s.returnsText);
    root.appendChild(sec);
  }
  if (hasContact(s)) {
    const sec = infoSection("Contact");
    const dl = document.createElement("dl");
    dl.className = "info-contact";
    const row = (label, value, href) => {
      const dt = document.createElement("dt"), dd = document.createElement("dd");
      dt.textContent = label;
      if (href) { const a = document.createElement("a"); a.href = href; a.textContent = value; dd.appendChild(a); }
      else dd.textContent = value;
      dl.appendChild(dt); dl.appendChild(dd);
    };
    if (s.bizName) row("Business", s.bizName);
    if (s.bizAddress) row("Address", s.bizAddress);
    if (s.bizPhone) row("Phone", s.bizPhone);
    if (s.bizEmail) row("Email", s.bizEmail, EMAIL_RE.test(s.bizEmail) ? "mailto:" + s.bizEmail : "");
    if (s.bizReg) row("Registration no.", s.bizReg);
    sec.appendChild(dl);
    const wa = document.createElement("a");
    wa.className = "btn";
    wa.href = "https://wa.me/" + WHATSAPP_NUMBER;
    wa.target = "_blank"; wa.rel = "noopener";
    wa.textContent = "Message us on WhatsApp";
    sec.appendChild(wa);
    root.appendChild(sec);
  }
  if (s.privacyText) {
    const sec = infoSection("Privacy");
    infoText(sec, s.privacyText);
    root.appendChild(sec);
  }
  // The Info link, footer link and cart link only exist while there is something to show.
  const show = hasInfo(s);
  document.querySelector('.nav-link[data-page="info"]').hidden = !show;
  document.getElementById("footer-info").hidden = !show;
  document.getElementById("cart-info-link").hidden = !show;
  if (!show && document.getElementById("page-info").classList.contains("active")) goHome();
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
    siteInfo = parseSiteInfo(data);
    renderInfo();
    renderCart();                            // the delivery fee may have changed
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
