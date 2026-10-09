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
document.getElementById("nav-home-btn").addEventListener("click", goHome);
document.getElementById("back-to-home").addEventListener("click", goHome);
document.getElementById("hero-shop-btn").addEventListener("click", () => goCategory(CATEGORIES[0]));
document.querySelectorAll(".nav-link").forEach(btn => {
  btn.addEventListener("click", () => btn.dataset.cat ? goCategory(btn.dataset.cat) : goHome());
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

function buildProductCard(p) {
  const card = document.createElement("div");
  card.className = "product-card";
  card.innerHTML = `<div class="product-swatch"></div><div class="product-name"></div><div class="product-price"></div>
    <div class="size-row">${["S","M","L","XL"].map(s => `<button type="button" class="size-pill" data-size="${s}">${s}</button>`).join("")}</div>
    <button type="button" class="add-btn">Add to bag</button>`;
  card.querySelector(".product-name").textContent = p.name;
  card.querySelector(".product-price").textContent = fmtR(p.price) + (p.note ? " · " + p.note : "");
  let size = "M";
  const pills = card.querySelectorAll(".size-pill");
  pills.forEach(pill => {
    if (pill.dataset.size === size) pill.classList.add("active");
    pill.addEventListener("click", () => { pills.forEach(x => x.classList.remove("active")); pill.classList.add("active"); size = pill.dataset.size; });
  });
  card.querySelector(".add-btn").addEventListener("click", () => addToCart(p, size));
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

// Live from Firestore — public read, write locked to the signed-in admin only (see firestore.rules)
db.collection("products").orderBy("createdAt", "asc").onSnapshot(
  (snap) => {
    products = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHomeTiles();
    if (currentCategory) renderCategoryGrid();
  },
  () => { document.getElementById("home-tiles").innerHTML = '<p class="empty-note">Catalog is temporarily unavailable.</p>'; }
);
