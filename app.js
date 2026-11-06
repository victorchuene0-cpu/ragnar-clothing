const WHATSAPP_NUMBER = "27665411726";
// Shoppers can narrow by WHO it's for (audience) and by product type (category).
const DEPARTMENTS = ["Men", "Women", "Teens", "Kids"];
const DEFAULT_AUDIENCE = ["Men", "Women"];   // items saved before audiences existed are treated as adult unisex until the owner sets one
// Product types are edited by the owner (admin -> Categories) and stored in settings/site. These are only the starting set.
const DEFAULT_CATEGORIES = ["Hoodies", "Sweaters", "Tracksuits", "Hats"];
let categories = DEFAULT_CATEGORIES.slice();
let products = [];
let catalogLoaded = false;
let catalogFailed = false;
let cart = [];                                // lives in memory only: a refresh empties it, so a price change can never leave a stale price in a bag
let filters = { aud: null, cat: null, q: "" };

const $ = (id) => document.getElementById(id);
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;   // textContent only: owner-written text can never inject markup
  return e;
}

// ---------- Icons (Font Awesome Free 6.4, CC BY 4.0) drawn from the sprite at the top of index.html ----------
const SVGNS = "http://www.w3.org/2000/svg";
const ICON_DIMS = { "bag-shopping": [448, 512], "box-open": [640, 512], "circle-check": [512, 512], "trash-can": [448, 512], "eye": [576, 512], "arrow-right": [448, 512], "check": [448, 512] };
function icon(name, cls) {
  const d = ICON_DIMS[name], s = document.createElementNS(SVGNS, "svg"), u = document.createElementNS(SVGNS, "use");
  s.setAttribute("class", "ic" + (cls ? " " + cls : ""));
  s.setAttribute("viewBox", "0 0 " + d[0] + " " + d[1]);
  s.setAttribute("width", (d[0] / d[1]).toFixed(3) + "em");
  s.setAttribute("height", "1em");
  s.setAttribute("aria-hidden", "true");
  u.setAttribute("href", "#i-" + name);
  s.appendChild(u);
  return s;
}

// R1,250.00 — two decimals like the design, a comma between thousands.
function fmtR(n) {
  const v = Math.round(Number(n) * 100) / 100;
  const parts = v.toFixed(2).split(".");
  return "R" + parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + parts[1];
}

// ---------- Store info (delivery fee, wording, contact) — edited by the owner in admin -> Store info, kept in settings/site ----------
const INFO_TEXT_FIELDS = { deliveryText: 600, returnsText: 2000, privacyText: 2000, bizName: 80, bizAddress: 200, bizPhone: 30, bizEmail: 100, bizReg: 40 };
function parseSiteInfo(data) {
  const d = data || {}, out = {};
  Object.keys(INFO_TEXT_FIELDS).forEach(k => { out[k] = typeof d[k] === "string" ? d[k].trim().slice(0, INFO_TEXT_FIELDS[k]) : ""; });
  const f = typeof d.deliveryFee === "number" ? d.deliveryFee : NaN;
  out.deliveryFee = Number.isFinite(f) && f >= 0 && f <= 10000 ? f : null;   // null = "to be confirmed per order"
  return out;
}
let siteInfo = parseSiteInfo({});

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

// Photos are stored inside the product as a small data URL. Only accept that exact shape.
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
const DEFAULT_SIZES = ["S", "M", "L", "XL"];
const SIZE_ORDER = ["One size", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
function sizeRank(s) {
  const i = SIZE_ORDER.indexOf(s);
  if (i !== -1) return i;
  const m = /^\s*(\d+)/.exec(s);           // age sizes like "5-6 yrs" sort by their first number
  return m ? 100 + Number(m[1]) : 1000;
}
function sizeSort(a, b) { return sizeRank(a) - sizeRank(b) || a.localeCompare(b); }
function sizesFor(p) { return (Array.isArray(p.sizes) && p.sizes.length ? p.sizes : DEFAULT_SIZES).slice().sort(sizeSort); }
function isSoldOut(p) { const cs = colorsFor(p); return !!p.soldOut || (cs.length > 0 && cs.every(c => c.soldOut)); }   // every colour gone = the item is gone

// Lowest and highest price still possible given what the shopper has chosen so far.
function priceSpan(p, size, color) {
  const sizes = sizesFor(p), colors = colorsFor(p);
  const sx = (size ? [size] : sizes).map(s => sizeExtraFor(p, s));
  const open = colors.filter(c => !c.soldOut);
  const cx = !colors.length ? [0] : (color ? [color] : (open.length ? open : colors)).map(c => c.extra);
  const b = basePrice(p);
  return { lo: b + Math.min(...sx) + Math.min(...cx), hi: b + Math.max(...sx) + Math.max(...cx) };
}
// Nothing to choose = nothing to wait for: a single size / single colour is picked for the shopper.
function autoSize(p) { const s = sizesFor(p); return s.length === 1 ? s[0] : null; }
function autoColor(p) { const cs = colorsFor(p); return cs.length === 1 && !cs[0].soldOut && !isSoldOut(p) ? cs[0] : null; }

// ---------- Open / close for modals, menu, bag ----------
const openLayers = [];   // [{ el, opener }] most recent last
function lockScroll() { document.body.classList.toggle("no-scroll", openLayers.length > 0); }
function focusables(root) { return Array.from(root.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')).filter(e => e.offsetParent !== null || e === document.activeElement); }
function openLayer(el, opener, focusEl) {
  if (!openLayers.some(l => l.el === el)) openLayers.push({ el, opener: opener || document.activeElement });
  lockScroll();
  if (focusEl) focusEl.focus({ preventScroll: true });
}
function closeLayer(el) {
  const i = openLayers.findIndex(l => l.el === el);
  if (i === -1) return;
  const opener = openLayers[i].opener;
  openLayers.splice(i, 1);
  lockScroll();
  if (opener && opener.focus && document.contains(opener)) { try { opener.focus(); } catch (e) { /* ignore */ } }
}
function showModal(el, opener, focusEl) { el.classList.remove("hidden"); el.classList.add("flex"); openLayer(el, opener, focusEl); }
function hideModal(el) { el.classList.add("hidden"); el.classList.remove("flex"); closeLayer(el); }
function isShown(el) { return !el.classList.contains("hidden"); }

document.addEventListener("keydown", (e) => {
  const top = openLayers[openLayers.length - 1];
  if (e.key === "Escape") {
    if (top) { closeTop(top.el); return; }
    if (isShown($("searchBar"))) closeSearch(false);
    return;
  }
  if (e.key === "Tab" && top && top.el.id !== "cartDrawer") {            // keep Tab inside the open dialog
    const f = focusables(top.el);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
function closeTop(el) {
  if (el.id === "mobileNav") closeMenu();
  else if (el.id === "productModal") closeProduct();
  else if (el.id === "checkoutModal") closeCheckout();
  else if (el.id === "receiptModal") hideModal(el);          // Escape closes it but keeps the bag; only "Back To Storefront" empties the bag
  else if (el.id === "cartDrawer") closeCart();
}

// ---------- Toasts ----------
function showToast(message) {
  const box = $("toastContainer");
  const t = h("div", "bg-ragnar-card border border-ragnar-accent text-white px-4 py-3 rounded-lg shadow-2xl text-xs font-bold uppercase tracking-wider flex items-center gap-3 transition-opacity duration-300 pointer-events-auto");
  t.appendChild(icon("circle-check", "text-ragnar-accent"));
  t.appendChild(h("span", "", message));
  box.appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 3000);
}

// ---------- Views: the store, Notices, Delivery & returns ----------
const VIEWS = { home: "viewHome", notices: "viewNotices", info: "viewInfo" };
function showView(name) {
  Object.keys(VIEWS).forEach(k => { $(VIEWS[k]).hidden = k !== name; });
}
function navigate(id) {
  if (id === "notices") { showView("notices"); window.scrollTo(0, 0); return; }
  if (id === "info") { showView("info"); window.scrollTo(0, 0); return; }
  showView("home");
  const target = id ? $(id) : null;
  if (target) target.scrollIntoView({ behavior: "smooth" }); else window.scrollTo(0, 0);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || a.target === "_blank") return;
  e.preventDefault();
  if (isShown($("mobileNav"))) closeMenu();
  navigate(a.getAttribute("href").slice(1));
});
document.querySelectorAll(".back-home").forEach(b => b.addEventListener("click", () => navigate("")));
$("noticeMore").addEventListener("click", () => navigate("notices"));

// ---------- Phone menu ----------
function openMenu() { const m = $("mobileNav"); showModal(m, $("mobileMenuBtn"), $("closeMobileNav")); $("mobileMenuBtn").setAttribute("aria-expanded", "true"); }
function closeMenu() { hideModal($("mobileNav")); $("mobileMenuBtn").setAttribute("aria-expanded", "false"); }
$("mobileMenuBtn").addEventListener("click", openMenu);
$("closeMobileNav").addEventListener("click", closeMenu);

// ---------- Search ----------
function placeSearchBar() { $("searchBar").style.top = Math.max(0, document.querySelector("header").getBoundingClientRect().bottom) + "px"; }
let searchScrolled = false;
function openSearch() {
  placeSearchBar();
  $("searchBar").classList.remove("hidden");
  $("searchBtn").setAttribute("aria-expanded", "true");
  searchScrolled = false;
  $("searchInput").focus();
}
function closeSearch(clear) {
  $("searchBar").classList.add("hidden");
  $("searchBtn").setAttribute("aria-expanded", "false");
  if (clear) { $("searchInput").value = ""; filters.q = ""; renderProducts(); }
}
$("searchBtn").addEventListener("click", () => { if (isShown($("searchBar"))) closeSearch(false); else openSearch(); });
$("closeSearch").addEventListener("click", () => closeSearch(true));
window.addEventListener("scroll", () => { if (isShown($("searchBar"))) placeSearchBar(); }, { passive: true });
$("searchInput").addEventListener("input", (e) => {
  filters.q = e.target.value.trim().toLowerCase();
  showView("home");
  renderProducts();
  if (filters.q && !searchScrolled) { searchScrolled = true; $("catalog").scrollIntoView({ behavior: "smooth" }); }
});

// ---------- Catalog: filters + grid ----------
function matchesQuery(p, q) {
  if (!q) return true;
  const hay = [p.name, p.category, p.note, p.description].concat(audiencesFor(p)).concat(colorsFor(p).map(c => c.name)).join(" ").toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}
function scopeByAudience() { return filters.aud ? inDept(filters.aud) : products; }
function renderFilters() {
  const depts = DEPARTMENTS.filter(d => inDept(d).length > 0);
  if (filters.aud && !depts.includes(filters.aud)) filters.aud = null;
  const audRow = $("audRow");
  audRow.innerHTML = "";
  audRow.hidden = depts.length < 2;
  if (depts.length >= 2) {
    [null].concat(depts).forEach(d => {
      const b = h("button", "aud-btn" + (d === filters.aud ? " active" : ""), d === null ? "Everyone" : d);
      b.type = "button";
      b.setAttribute("aria-pressed", d === filters.aud ? "true" : "false");
      b.addEventListener("click", () => { filters.aud = d; renderFilters(); renderProducts(); });
      audRow.appendChild(b);
    });
  }
  const scope = scopeByAudience();
  const cats = categoryOrder(scope).filter(c => scope.some(p => p.category === c));
  if (filters.cat && !cats.includes(filters.cat)) filters.cat = null;
  const row = $("catRow");
  row.innerHTML = "";
  [null].concat(cats).forEach(c => {
    const b = h("button", "filter-btn" + (c === filters.cat ? " active" : ""), c === null ? "All Items" : c);
    b.type = "button";
    b.setAttribute("aria-pressed", c === filters.cat ? "true" : "false");
    b.addEventListener("click", () => { filters.cat = c; renderFilters(); renderProducts(); });
    row.appendChild(b);
  });
}

function emptyState(msg, withIcon) {
  const box = h("div", "col-span-full py-16 text-center text-ragnar-textMuted");
  if (withIcon) box.appendChild(icon("box-open", "text-4xl mb-3 block mx-auto"));
  box.appendChild(h("p", "uppercase text-sm tracking-wider font-bold", msg));
  return box;
}
function noPhoto(cls) {
  const box = h("div", cls + " bg-ragnar-dark flex items-center justify-center");
  const img = h("img", "w-1/3 opacity-10");
  img.src = "logo-mark.png"; img.alt = "";
  box.appendChild(img);
  return box;
}
function buildCard(p) {
  const sold = isSoldOut(p), cover = coverImage(p);
  const card = h("div", "product-card bg-ragnar-card border border-ragnar-border rounded-lg overflow-hidden group flex flex-col justify-between transition-transform duration-300");

  const top = h("div", "relative overflow-hidden cursor-pointer");
  top.addEventListener("click", () => openProduct(p, eyeBtn));
  if (cover) {
    const img = h("img", "product-img w-full h-56 sm:h-72 object-cover transition-transform duration-500" + (sold ? " opacity-50 grayscale" : ""));
    img.src = cover; img.alt = p.name || ""; img.loading = "lazy"; img.decoding = "async";
    top.appendChild(img);
  } else {
    top.appendChild(noPhoto("product-img w-full h-56 sm:h-72 transition-transform duration-500"));
  }
  if (sold) top.appendChild(h("span", "absolute top-3 left-3 bg-white text-black font-extrabold text-[9px] uppercase px-2 py-1 rounded tracking-wider", "Sold Out"));
  else if (p.isNew === true) top.appendChild(h("span", "absolute top-3 left-3 bg-ragnar-accent text-black font-extrabold text-[9px] uppercase px-2 py-1 rounded tracking-wider", "New Drop"));
  const eyeBtn = h("button", "absolute bottom-3 right-3 bg-black/80 hover:bg-ragnar-accent hover:text-black text-white p-2.5 rounded-full backdrop-blur transition shadow");
  eyeBtn.type = "button";
  eyeBtn.setAttribute("aria-label", "Quick view " + (p.name || "item"));
  eyeBtn.appendChild(icon("eye", "text-xs"));
  eyeBtn.addEventListener("click", (e) => { e.stopPropagation(); openProduct(p, eyeBtn); });
  top.appendChild(eyeBtn);
  card.appendChild(top);

  const body = h("div", "p-4 flex flex-col flex-1 justify-between");
  const info = h("div");
  info.appendChild(h("span", "text-[10px] text-ragnar-accent uppercase font-bold tracking-widest block mb-1", p.category || ""));
  info.appendChild(h("h3", "font-syne font-bold text-sm uppercase text-white line-clamp-1 group-hover:text-ragnar-accent transition", p.name || ""));
  body.appendChild(info);

  const span = priceSpan(p, autoSize(p), autoColor(p));
  const foot = h("div", "mt-4 flex items-center justify-between gap-2 pt-3 border-t border-ragnar-border");
  const priceBox = h("div", "min-w-0");
  if (span.lo !== span.hi) priceBox.appendChild(h("span", "block text-[9px] text-ragnar-textMuted uppercase tracking-widest font-bold", "From"));
  priceBox.appendChild(h("span", "font-syne font-extrabold text-sm sm:text-base text-white block", fmtR(span.lo)));
  foot.appendChild(priceBox);
  const add = h("button", "bg-ragnar-dark border border-ragnar-border hover:border-ragnar-accent text-white hover:text-ragnar-accent text-xs font-bold uppercase px-2.5 sm:px-3 py-1.5 rounded transition whitespace-nowrap shrink-0", sold ? "Sold out" : "Add +");
  add.type = "button";
  add.setAttribute("aria-label", (sold ? "Sold out: " : "Add to bag: ") + (p.name || "item"));
  if (sold) { add.disabled = true; add.classList.add("opacity-50", "cursor-not-allowed"); }
  else add.addEventListener("click", () => quickAdd(p, add));
  foot.appendChild(add);
  body.appendChild(foot);
  card.appendChild(body);
  return card;
}
function renderProducts() {
  const grid = $("productGrid");
  grid.innerHTML = "";
  if (catalogFailed) { grid.appendChild(emptyState("The catalog is temporarily unavailable.", true)); return; }
  if (!catalogLoaded) { grid.appendChild(emptyState("Loading…", false)); return; }
  const shown = scopeByAudience().filter(p => (!filters.cat || p.category === filters.cat) && matchesQuery(p, filters.q));
  if (shown.length === 0) {
    grid.appendChild(emptyState(products.length === 0 ? "Nothing in the store yet. Check back soon." : "No streetwear items matched your query.", true));
    return;
  }
  shown.forEach(p => grid.appendChild(buildCard(p)));
}

// "Add +" on a card: add straight away when there is nothing to choose, otherwise open the quick view to choose.
function quickAdd(p, opener) {
  const size = autoSize(p), colors = colorsFor(p);
  if (size && colors.length <= 1) addToCart(p, size, autoColor(p));
  else openProduct(p, opener);
}

// ---------- Quick view ----------
let modal = { p: null, size: null, color: null };
function modalPhoto(src, alt) {
  const img = $("modalImage"), none = $("modalNoImage");
  if (src) { img.src = src; img.alt = alt || ""; img.hidden = false; none.hidden = true; }
  else { img.removeAttribute("src"); img.hidden = true; none.hidden = false; }
}
function paintModalPrice() {
  const s = priceSpan(modal.p, modal.size, modal.color);
  $("modalPrice").textContent = (s.lo === s.hi ? "" : "From ") + fmtR(s.lo);
}
function openProduct(p, opener) {
  const sold = isSoldOut(p), sizes = sizesFor(p), colors = colorsFor(p);
  modal = { p, size: autoSize(p), color: autoColor(p) };
  $("modalCategory").textContent = p.category || "";
  $("modalTitle").textContent = p.name || "";
  const desc = (p.description || "").trim() || (p.note || "").trim();
  $("modalDesc").textContent = desc;
  $("modalDesc").hidden = !desc;
  $("modalError").textContent = "";
  const cover = coverImage(p);
  modalPhoto(modal.color && modal.color.image ? modal.color.image : cover, p.name);

  const cWrap = $("colorWrap"), cBox = $("colorOptions");
  cBox.innerHTML = "";
  cWrap.hidden = colors.length === 0;
  $("colorLabel").textContent = colors.length === 1 ? "Colour" : "Select Colour";
  colors.forEach(c => {
    const b = h("button", "size-btn" + (c === modal.color || (modal.color && c.name === modal.color.name) ? " active" : ""), c.name);
    b.type = "button";
    b.disabled = sold || c.soldOut;
    if (c.soldOut) b.setAttribute("aria-label", c.name + " (sold out)");
    b.setAttribute("aria-pressed", modal.color && c.name === modal.color.name ? "true" : "false");
    b.addEventListener("click", () => {
      cBox.querySelectorAll("button").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("active"); b.setAttribute("aria-pressed", "true");
      modal.color = c;
      $("modalError").textContent = "";
      modalPhoto(c.image || cover, (p.name || "") + " — " + c.name);
      paintModalPrice();
    });
    cBox.appendChild(b);
  });

  const sBox = $("sizeOptions");
  sBox.innerHTML = "";
  $("sizeLabel").textContent = sizes.length === 1 ? "Size" : "Select Size";
  sizes.forEach(s => {
    const b = h("button", "size-btn" + (s === modal.size ? " active" : ""), s);
    b.type = "button";
    b.disabled = sold;
    b.setAttribute("aria-pressed", s === modal.size ? "true" : "false");
    b.addEventListener("click", () => {
      sBox.querySelectorAll("button").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); });
      b.classList.add("active"); b.setAttribute("aria-pressed", "true");
      modal.size = s;
      $("modalError").textContent = "";
      paintModalPrice();
    });
    sBox.appendChild(b);
  });
  paintModalPrice();
  const addBtn = $("addToCartModalBtn");
  addBtn.disabled = sold;
  $("addToCartLabel").textContent = sold ? "Sold Out" : "Add To Bag";
  showModal($("productModal"), opener, $("closeProductModal"));
}
function closeProduct() { hideModal($("productModal")); }
$("closeProductModal").addEventListener("click", closeProduct);
$("productModal").addEventListener("click", (e) => { if (e.target === $("productModal")) closeProduct(); });
$("addToCartModalBtn").addEventListener("click", () => {
  const { p, size, color } = modal;
  if (!p || isSoldOut(p)) return;
  const colors = colorsFor(p), err = $("modalError");
  if (colors.length && !color && !size) { err.textContent = "Pick a colour and a size first."; return; }
  if (colors.length && !color) { err.textContent = "Pick a colour first."; return; }
  if (!size) { err.textContent = "Pick a size first."; return; }
  closeProduct();
  addToCart(p, size, color);
});

// ---------- Bag ----------
const QTY_MAX = 20;
let method = "Delivery";
// What delivery costs for the chosen method. fee === null means the owner hasn't set a fee, so the total can't include it yet.
function deliveryFor(m) {
  if (m === "Collection") return { fee: 0, label: "Collection, no fee", msg: "Collection (no fee)" };
  const f = siteInfo.deliveryFee;
  if (f === null) return { fee: null, label: "To be confirmed", msg: "to be confirmed (please tell me the cost)" };
  const text = f === 0 ? "Free" : fmtR(f);
  return { fee: f, label: text, msg: text };
}
function cartItemsTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }
function renderCart() {
  const box = $("cartItemsContainer");
  $("cartBadgeCount").textContent = cart.reduce((s, i) => s + i.qty, 0);
  box.innerHTML = "";
  if (cart.length === 0) {
    const empty = h("div", "text-center py-12 text-ragnar-textMuted");
    empty.appendChild(icon("bag-shopping", "text-4xl mb-3 block opacity-40 mx-auto"));
    empty.appendChild(h("p", "uppercase text-xs font-bold tracking-wider", "Your shopping bag is currently empty."));
    box.appendChild(empty);
  }
  cart.forEach((item, idx) => {
    const row = h("div", "flex items-center gap-4 bg-ragnar-black p-3 rounded-lg border border-ragnar-border");
    if (item.image) { const im = h("img", "w-16 h-16 object-cover rounded"); im.src = item.image; im.alt = item.name; row.appendChild(im); }
    else row.appendChild(noPhoto("w-16 h-16 rounded shrink-0"));
    const mid = h("div", "flex-1 min-w-0");
    mid.appendChild(h("h4", "font-syne font-bold text-xs uppercase text-white truncate", item.name));
    const meta = h("p", "text-[10px] text-ragnar-textMuted uppercase mt-0.5");
    meta.appendChild(document.createTextNode("Size: "));
    meta.appendChild(h("span", "text-ragnar-accent font-bold", item.size));
    if (item.color) {
      meta.appendChild(document.createTextNode(" · Colour: "));
      meta.appendChild(h("span", "text-ragnar-accent font-bold", item.color));
    }
    mid.appendChild(meta);
    mid.appendChild(h("p", "font-bold text-xs text-white mt-1", fmtR(item.price * item.qty)));
    row.appendChild(mid);
    const side = h("div", "flex flex-col items-end gap-2");
    const rm = h("button", "text-ragnar-textMuted hover:text-red-500 text-xs");
    rm.type = "button"; rm.setAttribute("aria-label", "Remove " + item.name + " from your bag");
    rm.appendChild(icon("trash-can"));
    rm.addEventListener("click", () => { cart.splice(idx, 1); renderCart(); });
    const qty = h("div", "flex items-center border border-ragnar-border rounded bg-ragnar-card");
    const minus = h("button", "px-2 py-0.5 text-xs text-ragnar-textMuted hover:text-white", "-");
    minus.type = "button"; minus.setAttribute("aria-label", "One less " + item.name);
    minus.addEventListener("click", () => { item.qty -= 1; if (item.qty <= 0) cart.splice(idx, 1); renderCart(); });
    const plus = h("button", "px-2 py-0.5 text-xs text-ragnar-textMuted hover:text-white", "+");
    plus.type = "button"; plus.setAttribute("aria-label", "One more " + item.name);
    plus.addEventListener("click", () => { if (item.qty < QTY_MAX) { item.qty += 1; renderCart(); } });
    qty.appendChild(minus); qty.appendChild(h("span", "px-2 text-xs font-bold text-white", String(item.qty))); qty.appendChild(plus);
    side.appendChild(rm); side.appendChild(qty);
    row.appendChild(side);
    box.appendChild(row);
  });

  const sub = cartItemsTotal();
  const d = deliveryFor(method);
  $("cartSubtotal").textContent = fmtR(sub);
  $("cartShippingLabel").textContent = method === "Collection" ? "Collection" : "Delivery";
  $("cartShipping").textContent = cart.length ? d.label : "—";
  const label = cart.length && d.fee === null ? "Total (excl. delivery)" : "Grand Total";
  const total = cart.length ? sub + (d.fee || 0) : 0;
  $("cartGrandLabel").textContent = label;
  $("cartGrandTotal").textContent = fmtR(total);
  $("checkoutTotalLabel").textContent = label.replace("Grand ", "");
  $("checkoutTotal").textContent = fmtR(total);
}
function addToCart(p, size, color) {
  const colorName = color ? color.name : "";
  const existing = cart.find(i => i.id === p.id && i.size === size && i.color === colorName);   // same item, size AND colour = one line
  if (existing) { if (existing.qty < QTY_MAX) existing.qty += 1; }
  else cart.push({ id: p.id, name: p.name, price: priceFor(p, size, color), size, color: colorName, image: (color && color.image) || coverImage(p), qty: 1 });
  renderCart();
  showToast("Added " + p.name + " (" + size + (colorName ? ", " + colorName : "") + ") to your bag!");
  openCart();
}
function openCart(opener) {
  const d = $("cartDrawer");
  d.classList.remove("translate-x-full");
  d.classList.add("is-open");
  $("cartScrim").classList.remove("hidden");
  $("cartToggleBtn").setAttribute("aria-expanded", "true");
  openLayer(d, opener || $("cartToggleBtn"), $("closeCartBtn"));
}
function closeCart() {
  const d = $("cartDrawer");
  d.classList.add("translate-x-full");
  d.classList.remove("is-open");
  $("cartScrim").classList.add("hidden");
  $("cartToggleBtn").setAttribute("aria-expanded", "false");
  closeLayer(d);
}
$("cartToggleBtn").addEventListener("click", () => openCart());
$("closeCartBtn").addEventListener("click", closeCart);
$("cartScrim").addEventListener("click", closeCart);

// ---------- Delivery details (kept on the customer's own device only) ----------
const DETAILS_KEY = "ragnar_delivery_details";
const FIELD_IDS = { name: "custName", phone: "custPhone", street: "custStreet", suburb: "custSuburb", city: "custCity", province: "custProvince", postal: "custPostal", notes: "custNotes" };
const val = (k) => $(FIELD_IDS[k]).value.trim();
const radioVal = (name) => { const r = document.querySelector('#checkoutForm input[name="' + name + '"]:checked'); return r ? r.value : ""; };
function toggleAddress() {
  method = radioVal("method") || "Delivery";
  $("addressFields").hidden = method === "Collection";
  renderCart();
}
function saveDetails() {
  const data = { method: radioVal("method"), pay: radioVal("payMethod") };
  Object.keys(FIELD_IDS).forEach(k => { data[k] = val(k); });
  try { localStorage.setItem(DETAILS_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked — fine */ }
}
function loadDetails() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(DETAILS_KEY) || "null"); } catch (e) { /* ignore */ }
  if (!data || typeof data !== "object") return;
  Object.keys(FIELD_IDS).forEach(k => { if (typeof data[k] === "string" && data[k]) $(FIELD_IDS[k]).value = data[k]; });
  const pick = (name, v) => { const r = Array.from(document.querySelectorAll('#checkoutForm input[name="' + name + '"]')).find(x => x.value === v); if (r) r.checked = true; };
  if (data.method) pick("method", data.method);
  if (data.pay) pick("payMethod", data.pay);
}
$("checkoutForm").addEventListener("input", saveDetails);
$("checkoutForm").addEventListener("change", () => { saveDetails(); toggleAddress(); });
loadDetails();
toggleAddress();

function openCheckout() {
  if (cart.length === 0) { showToast("Add items to your bag first!"); return; }
  closeCart();
  $("checkoutError").textContent = "";
  toggleAddress();
  showModal($("checkoutModal"), $("proceedCheckoutBtn"), $("custName"));
}
function closeCheckout() { hideModal($("checkoutModal")); }
$("proceedCheckoutBtn").addEventListener("click", openCheckout);
$("closeCheckoutModal").addEventListener("click", closeCheckout);

function validateDetails() {
  const required = ["name", "phone"];
  if (method === "Delivery") required.push("street", "suburb", "city", "province", "postal");
  Object.keys(FIELD_IDS).forEach(k => $(FIELD_IDS[k]).classList.remove("invalid"));
  let firstBad = null;
  required.forEach(k => { if (!val(k)) { $(FIELD_IDS[k]).classList.add("invalid"); if (!firstBad) firstBad = $(FIELD_IDS[k]); } });
  if (firstBad) {
    $("checkoutError").textContent = "Please fill in the highlighted fields so we can deliver your order.";
    firstBad.scrollIntoView({ block: "center", behavior: "smooth" });
    firstBad.focus();
    return false;
  }
  $("checkoutError").textContent = "";
  return true;
}

let lastOrderUrl = "";
$("checkoutForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (cart.length === 0) return;
  toggleAddress();
  if (!validateDetails()) return;
  saveDetails();
  const ref = "RAG-" + Math.floor(100000 + Math.random() * 900000);   // shown to the shopper and sent in the message; never stored anywhere
  const pay = radioVal("payMethod") || "Yoco card link";
  const lines = cart.map(i => `- ${i.name} (Size: ${i.size}${i.color ? ", Colour: " + i.color : ""}) x${i.qty} — ${fmtR(i.price * i.qty)}`).join("\n");
  const itemsTotal = cartItemsTotal();
  const dl = deliveryFor(method);
  const totalText = dl.fee === null ? `Total (excl. delivery): ${fmtR(itemsTotal)}` : `Total: ${fmtR(itemsTotal + dl.fee)}`;
  const totals = `Items: ${fmtR(itemsTotal)}\nDelivery: ${dl.msg}\n${totalText}`;
  let details = `Name: ${val("name")}\nContact: ${val("phone")}\nMethod: ${method === "Collection" ? "I'll collect" : "Delivery"}`;
  let addr = "";
  if (method === "Delivery") {
    addr = `${val("street")}, ${val("suburb")}, ${val("city")}, ${val("province")}, ${val("postal")}`;
    details += `\nAddress: ${addr}`;
    if (val("notes")) details += `\nNotes: ${val("notes")}`;
  }
  const msg = `Hi! I'd like to order (ref ${ref}):\n${lines}\n\n${totals}\nPayment: ${pay}\n\n${details}`;
  lastOrderUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
  window.open(lastOrderUrl, "_blank");
  closeCheckout();
  showReceipt(ref, addr, pay, totalText);
});

function showReceipt(ref, addr, pay, totalText) {
  $("receiptRef").textContent = "#" + ref;
  $("receiptRetry").href = lastOrderUrl;
  const box = $("receiptDetails");
  box.innerHTML = "";
  const row = (label, text) => {
    const p = h("p");
    p.appendChild(h("strong", "text-white", label + " "));
    p.appendChild(document.createTextNode(text));
    box.appendChild(p);
  };
  row("Customer:", val("name"));
  row("Contact:", val("phone"));
  row(method === "Collection" ? "Delivery:" : "Address:", method === "Collection" ? "I'll collect" : addr);
  row("Payment:", pay);
  box.appendChild(h("hr", "border-ragnar-border my-2"));
  box.appendChild(h("p", "text-white font-bold", "Line Items:"));
  cart.forEach(i => box.appendChild(h("p", "", "• " + i.name + " [" + i.size + (i.color ? ", " + i.color : "") + "] x" + i.qty + " - " + fmtR(i.price * i.qty))));
  box.appendChild(h("hr", "border-ragnar-border my-2"));
  box.appendChild(h("p", "text-sm font-bold text-ragnar-accent", totalText.replace("Total", "TOTAL DUE")));
  showModal($("receiptModal"), $("cartToggleBtn"), $("closeReceiptBtn"));
}
$("closeReceiptBtn").addEventListener("click", () => { cart = []; renderCart(); hideModal($("receiptModal")); });
$("downloadReceiptBtn").addEventListener("click", () => window.print());

// ---------- Home page text, hero photo, countdown, socials (written by the owner in admin -> Homepage) ----------
const HOME_TEXT = {   // settings key -> [element id, max length]
  announcement: ["announceText", 120], heroBadge: ["heroBadge", 60], heroTitle: ["heroTitle", 30], heroAccent: ["heroAccent", 30], heroText: ["heroText", 240],
  aboutTitle: ["aboutTitle", 60], aboutText: ["aboutText", 400],
  f1Title: ["f1Title", 40], f1Text: ["f1Text", 200], f2Title: ["f2Title", 40], f2Text: ["f2Text", 200], f3Title: ["f3Title", 40], f3Text: ["f3Text", 200]
};
const HOME_DEFAULTS = {};
Object.keys(HOME_TEXT).forEach(k => { HOME_DEFAULTS[k] = $(HOME_TEXT[k][0]).textContent.trim(); });   // the wording written in index.html is the fallback
function safeSocial(url, hosts) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && hosts.includes(u.hostname) ? u.href : "";
  } catch (e) { return ""; }
}
let dropAt = null, cdTimer = null;
function stopCountdown() { clearInterval(cdTimer); cdTimer = null; dropAt = null; $("countdown").hidden = true; }
function tickCountdown() {
  const left = dropAt - Date.now();
  if (!(left > 0)) { stopCountdown(); return; }
  const s = Math.floor(left / 1000), pad = (n) => String(n).padStart(2, "0");
  $("cdDays").textContent = pad(Math.floor(s / 86400));
  $("cdHours").textContent = pad(Math.floor((s % 86400) / 3600));
  $("cdMins").textContent = pad(Math.floor((s % 3600) / 60));
  $("cdSecs").textContent = pad(s % 60);
}
function setDrop(ms) {
  stopCountdown();
  if (typeof ms === "number" && Number.isFinite(ms) && ms > Date.now()) {   // a countdown only ever shows a real, future date the owner set
    dropAt = ms;
    $("countdown").hidden = false;
    tickCountdown();
    cdTimer = setInterval(tickCountdown, 1000);
  }
}
function applyHome(data) {
  const d = data || {};
  Object.keys(HOME_TEXT).forEach(k => {
    const v = typeof d[k] === "string" ? d[k].trim().slice(0, HOME_TEXT[k][1]) : "";
    $(HOME_TEXT[k][0]).textContent = v || HOME_DEFAULTS[k];
  });
  $("announceBar").hidden = d.announcementHidden === true || noticeShowing;
  setDrop(d.dropDate);
  [["socIg", d.instagramUrl, ["instagram.com", "www.instagram.com"]], ["socTt", d.tiktokUrl, ["tiktok.com", "www.tiktok.com", "vm.tiktok.com"]]].forEach(([id, raw, hosts]) => {
    const link = typeof raw === "string" ? safeSocial(raw.trim(), hosts) : "";
    $(id).hidden = !link;
    if (link) $(id).href = link;
  });
  homeData = d;
}
let homeData = {};
function applyHeroPhoto(data) {
  const src = safeImage(data && data.image);
  $("heroBg").style.backgroundImage = src ? 'url("' + src + '")' : "";
  $("heroMark").hidden = !!src;
}

// ---------- Notices & community link (posted from admin.html) ----------
let notices = [];
let noticesFailed = false;
let noticeShowing = false;
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
function fmtDate(ms) { return new Date(ms).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); }

function renderBanner(live) {
  const el = $("noticeBanner");
  const top = live.find(n => n.level === "important");
  let dismissed = null;
  try { dismissed = localStorage.getItem(DISMISS_KEY); } catch (e) { /* storage blocked — fine */ }
  if (!top || top.id === dismissed) { el.hidden = true; noticeShowing = false; }
  else {
    el.dataset.id = top.id;
    $("noticeTitle").textContent = top.title || "Notice";
    $("noticeText").textContent = top.message || "";
    el.hidden = false; noticeShowing = true;
  }
  $("announceBar").hidden = homeData.announcementHidden === true || noticeShowing;
}
function renderNotices() {
  const list = $("noticeList");
  const live = noticesFailed ? [] : notices.filter(isLive);
  list.innerHTML = "";
  if (noticesFailed) list.appendChild(h("p", "text-sm text-ragnar-textMuted", "Notices are unavailable right now."));
  else if (live.length === 0) list.appendChild(h("p", "text-sm text-ragnar-textMuted", "No notices right now."));
  live.forEach(n => {
    const important = n.level === "important";
    const card = h("article", "bg-ragnar-card border rounded-lg p-5 " + (important ? "border-ragnar-accent" : "border-ragnar-border"));
    const meta = h("div", "flex items-center justify-between gap-3 mb-2");
    meta.appendChild(h("span", "text-[10px] font-bold uppercase tracking-widest " + (important ? "text-ragnar-accent" : "text-ragnar-textMuted"), important ? "Important" : "Update"));
    meta.appendChild(h("time", "text-[11px] text-ragnar-textMuted", n.createdAt ? fmtDate(n.createdAt) : ""));
    card.appendChild(meta);
    card.appendChild(h("h3", "font-syne font-bold uppercase text-white mb-1", n.title || ""));
    card.appendChild(h("p", "text-sm text-ragnar-textMuted leading-relaxed whitespace-pre-line", n.message || ""));
    list.appendChild(card);
  });
  renderBanner(live);
}
$("noticeClose").addEventListener("click", () => {
  const el = $("noticeBanner");
  try { localStorage.setItem(DISMISS_KEY, el.dataset.id || ""); } catch (e) { /* ignore */ }
  el.hidden = true; noticeShowing = false;
  $("announceBar").hidden = homeData.announcementHidden === true;
});

// ---------- Delivery, returns, contact, privacy (written by the owner in admin -> Store info) ----------
const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
function infoSection(title) {
  const sec = h("section", "bg-ragnar-card border border-ragnar-border rounded-lg p-6");
  sec.appendChild(h("h3", "font-syne font-bold uppercase text-white mb-3", title));
  return sec;
}
function infoText(sec, text) { sec.appendChild(h("p", "text-sm text-ragnar-textMuted leading-relaxed whitespace-pre-line mb-3", text)); }
function hasContact(s) { return !!(s.bizName || s.bizAddress || s.bizPhone || s.bizEmail || s.bizReg); }
function hasInfo(s) { return s.deliveryFee !== null || !!(s.deliveryText || s.returnsText || s.privacyText) || hasContact(s); }

function renderInfo() {
  const root = $("infoSections"), s = siteInfo;
  root.innerHTML = "";
  if (s.deliveryFee !== null || s.deliveryText) {
    const sec = infoSection("Delivery");
    if (s.deliveryFee !== null) infoText(sec, s.deliveryFee === 0 ? "Delivery fee: free" : "Delivery fee: " + fmtR(s.deliveryFee));
    if (s.deliveryText) infoText(sec, s.deliveryText);
    root.appendChild(sec);
  }
  if (s.returnsText) { const sec = infoSection("Returns & refunds"); infoText(sec, s.returnsText); root.appendChild(sec); }
  if (hasContact(s)) {
    const sec = infoSection("Contact");
    const dl = h("dl", "grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm mb-4");
    const row = (label, value, href) => {
      const dd = h("dd", "text-white break-words");
      if (href) { const a = h("a", "text-ragnar-accent hover:underline", value); a.href = href; dd.appendChild(a); } else dd.textContent = value;
      dl.appendChild(h("dt", "text-ragnar-textMuted uppercase text-[11px] font-bold tracking-wider pt-0.5", label)); dl.appendChild(dd);
    };
    if (s.bizName) row("Business", s.bizName);
    if (s.bizAddress) row("Address", s.bizAddress);
    if (s.bizPhone) row("Phone", s.bizPhone);
    if (s.bizEmail) row("Email", s.bizEmail, EMAIL_RE.test(s.bizEmail) ? "mailto:" + s.bizEmail : "");
    if (s.bizReg) row("Registration no.", s.bizReg);
    sec.appendChild(dl);
    const wa = h("a", "btn-gold px-6 py-3 text-xs inline-block", "Message us on WhatsApp");
    wa.href = "https://wa.me/" + WHATSAPP_NUMBER; wa.target = "_blank"; wa.rel = "noopener";
    sec.appendChild(wa);
    root.appendChild(sec);
  }
  if (s.privacyText) { const sec = infoSection("Privacy"); infoText(sec, s.privacyText); root.appendChild(sec); }
  // The links to this page only exist while there is something to show.
  const show = hasInfo(s);
  $("footerInfo").hidden = !show;
  $("mobileInfoLink").hidden = !show;
  if (!show && !$("viewInfo").hidden) navigate("");
  $("deliveryHint").textContent = s.deliveryFee === null ? "Fee confirmed on WhatsApp" : (s.deliveryFee === 0 ? "Free delivery" : "Delivery fee " + fmtR(s.deliveryFee));
}

// ---------- Live from Firestore — public read, write locked to the signed-in admin only (see firestore.rules) ----------
db.collection("notices").orderBy("createdAt", "desc").limit(30).onSnapshot(
  (snap) => { notices = snap.docs.map(d => ({ id: d.id, ...d.data() })); noticesFailed = false; renderNotices(); },
  () => { noticesFailed = true; renderNotices(); }
);
db.doc("settings/site").onSnapshot(
  (snap) => {
    const data = snap.exists ? (snap.data() || {}) : {};
    const nextCats = cleanCategories(data.categories);
    if (JSON.stringify(nextCats) !== JSON.stringify(categories)) { categories = nextCats; if (catalogLoaded) { renderFilters(); renderProducts(); } }
    const link = safeWhatsAppLink(data.communityLink || "");
    $("communityBox").hidden = !link;
    $("footerCommunity").hidden = !link;
    if (link) { $("communityBtn").href = link; $("footerCommunity").href = link; }
    siteInfo = parseSiteInfo(data);
    applyHome(data);
    renderInfo();
    renderCart();                            // the delivery fee may have changed
  },
  () => { /* settings unreadable — the store simply shows its built-in wording */ }
);
db.doc("settings/hero").onSnapshot(
  (snap) => applyHeroPhoto(snap.exists ? snap.data() : null),
  () => { /* no hero photo */ }
);
db.collection("products").orderBy("createdAt", "asc").onSnapshot(
  (snap) => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    catalogLoaded = true; catalogFailed = false;
    renderFilters(); renderProducts();
  },
  () => { catalogFailed = true; renderProducts(); }
);

// ---------- Start-up ----------
document.querySelectorAll(".yr").forEach(e => { e.textContent = String(new Date().getFullYear()); });
renderFilters();
renderCart();
