// ====== 1. PASTE YOUR SUPABASE DETAILS HERE ======
// Supabase dashboard > Project Settings > API
const SUPABASE_URL = 'https://jkxxntouvbwpyzpizgjc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oSFNpIwnIsvLpgbFXVyAfg_SL0OvpzU'; // the "anon / public" key only
const CURRENCY = '₱';
// =================================================

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => CURRENCY + Number(n).toFixed(2);

let user = null, role = 'customer', products = [], search = '';
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let adminTab = 'products';

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2800);
}
const saveCart = () => { localStorage.setItem('cart', JSON.stringify(cart)); renderNav(); };

// ---------- auth + navigation ----------
async function init() {
  const { data: { session } } = await sb.auth.getSession();
  await setUser(session?.user);
  sb.auth.onAuthStateChange((_e, s) => { if ((s?.user?.id || null) !== (user?.id || null)) setUser(s?.user); });
  go('shop');
}
async function setUser(u) {
  user = u || null; role = 'customer';
  if (user) {
    const { data } = await sb.from('profiles').select('role').eq('id', user.id).maybeSingle();
    role = data?.role || 'customer';
  }
  renderNav();
}
function renderNav() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  $('#nav').innerHTML =
    `<button onclick="go('shop')">Shop</button>
     <button onclick="go('cart')">Cart <span class="count">${n}</span></button>` +
    (role === 'admin' ? `<button onclick="go('admin')">Admin</button>` : '') +
    (user
      ? `<button onclick="logout()">Log out</button>`
      : `<button onclick="go('login')">Log in</button><button class="primary" onclick="go('signup')">Sign up</button>`);
}
function go(v) {
  ({ shop: viewShop, cart: viewCart, login: () => viewAuth('login'), signup: () => viewAuth('signup'), admin: viewAdmin })[v]();
  const m = $('#view'); m.classList.remove('enter'); void m.offsetWidth; m.classList.add('enter');
  window.scrollTo(0, 0);
}
async function logout() { await sb.auth.signOut(); await setUser(null); toast('Logged out'); go('shop'); }

function viewAuth(mode) {
  const up = mode === 'signup';
  $('#view').innerHTML = `
  <form class="panel narrow" onsubmit="submitAuth(event,'${mode}')">
    <h1>${up ? 'Create account' : 'Log in'}</h1>
    <label for="em">Email</label><input id="em" type="email" required autocomplete="email">
    <label for="pw">Password</label><input id="pw" type="password" required minlength="6" autocomplete="${up ? 'new-password' : 'current-password'}">
    <p><button class="primary" style="width:100%">${up ? 'Sign up' : 'Log in'}</button></p>
    <p class="stock">${up ? 'Already have an account?' : 'New here?'}
      <a href="#" onclick="go('${up ? 'login' : 'signup'}');return false">${up ? 'Log in' : 'Create an account'}</a></p>
  </form>`;
}
async function submitAuth(e, mode) {
  e.preventDefault();
  const email = $('#em').value.trim(), password = $('#pw').value;
  const { data, error } = mode === 'signup'
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  if (mode === 'signup' && !data.session) { toast('Check your email to confirm your account, then log in'); return go('login'); }
  await setUser(data.user); toast('Welcome!'); go('shop');
}

// ---------- shop ----------
async function loadProducts() {
  const { data, error } = await sb.from('products').select('*').order('created_at', { ascending: false });
  if (error) toast(error.message); else products = data;
}
async function viewShop() {
  $('#view').innerHTML = '<div class="grid">' + '<div class="product skel"></div>'.repeat(6) + '</div>';
  await loadProducts();
  $('#view').innerHTML = `
    <section class="hero">
      <span class="blob b1"></span><span class="blob b2"></span><span class="blob b3"></span>
      <div class="hero-text">
        <h1>Find something you'll love today.</h1>
        <p>Fresh picks added all the time. Add to your cart and check out in seconds.</p>
        <button class="big" onclick="$('#grid').scrollIntoView({behavior:'smooth'})">Start shopping</button>
      </div>
    </section>
    <div class="bar"><h1>All products</h1>
      <input id="q" type="search" placeholder="Search products" style="max-width:280px" value="${esc(search)}" oninput="search=this.value;drawGrid()"></div>
    <div id="grid" class="grid"></div>`;
  drawGrid();
}
function drawGrid() {
  const list = products.filter(p => (p.name + ' ' + (p.description || '')).toLowerCase().includes(search.toLowerCase()));
  $('#grid').innerHTML = list.length ? list.map((p, i) => `
    <article class="product" style="--i:${Math.min(i, 10)}">
      <div class="imgwrap">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy">` : '<div class="noimg">No image</div>'}</div>
      <div class="body">
        <h3>${esc(p.name)}</h3>
        <p>${esc(p.description)}</p>
        <span class="price">${money(p.price)}</span>
        <span class="stock">${p.stock > 0 ? p.stock + ' in stock' : 'Out of stock'}</span>
        <button class="primary" ${p.stock > 0 ? '' : 'disabled'} onclick="addToCart(${p.id})">Add to cart</button>
      </div>
    </article>`).join('') : '<p class="empty" style="grid-column:1/-1">No products found.</p>';
}

// ---------- cart ----------
function addToCart(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const item = cart.find(i => i.id === id);
  if (item) { if (item.qty >= p.stock) return toast('No more stock available'); item.qty++; }
  else cart.push({ id, name: p.name, price: p.price, image_url: p.image_url, qty: 1 });
  saveCart(); $('.count')?.classList.add('bump'); toast(`${p.name} added to cart`);
}
function changeQty(id, d) {
  const i = cart.find(x => x.id === id); if (!i) return;
  i.qty += d; if (i.qty <= 0) cart = cart.filter(x => x.id !== id);
  saveCart(); viewCart();
}
function viewCart() {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  $('#view').innerHTML = `<div class="bar"><h1>Your cart</h1></div>` + (cart.length ? `
    <div class="panel">
      ${cart.map(i => `<div class="row">
        ${i.image_url ? `<img src="${esc(i.image_url)}" alt="">` : ''}
        <div class="grow"><strong>${esc(i.name)}</strong><br><span class="stock">${money(i.price)} each</span></div>
        <div><button onclick="changeQty(${i.id},-1)" aria-label="Remove one">−</button>
          <strong style="padding:0 10px">${i.qty}</strong>
          <button onclick="changeQty(${i.id},1)" aria-label="Add one">+</button></div>
        <strong>${money(i.price * i.qty)}</strong></div>`).join('')}
      <div class="row"><h2 style="margin:0">Total ${money(total)}</h2>
        <button class="primary" onclick="checkout()">Place order</button></div>
    </div>` : '<p class="empty">Your cart is empty. <a href="#" onclick="go(\'shop\');return false">Browse the shop</a></p>');
}
async function checkout() {
  if (!user) { toast('Log in to place your order'); return go('login'); }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const items = cart.map(({ id, name, price, qty }) => ({ id, name, price, qty }));
  const { error } = await sb.from('orders').insert({ user_id: user.id, user_email: user.email, items, total });
  if (error) return toast(error.message);
  cart = []; saveCart(); toast('Order placed. Thank you!'); go('shop');
}

// ---------- admin ----------
async function viewAdmin() {
  if (role !== 'admin') { toast('Admins only'); return go('shop'); }
  await loadProducts();
  $('#view').innerHTML = `
    <div class="bar"><h1>Admin</h1></div>
    <div class="tabs">
      <button class="${adminTab === 'products' ? 'on' : ''}" onclick="adminTab='products';viewAdmin()">Products</button>
      <button class="${adminTab === 'orders' ? 'on' : ''}" onclick="adminTab='orders';viewAdmin()">Orders</button>
    </div><div id="adm"></div>`;
  adminTab === 'products' ? adminProducts() : adminOrders();
}
function adminProducts() {
  $('#adm').innerHTML = `
  <form id="pf" class="panel" onsubmit="saveProduct(event)">
    <h2 id="ptitle" style="margin-top:0">Add a product</h2>
    <label for="pname">Name</label><input id="pname" required>
    <label for="pdesc">Description</label><textarea id="pdesc" rows="3"></textarea>
    <div class="two">
      <div><label for="pprice">Price</label><input id="pprice" type="number" step="0.01" min="0" required></div>
      <div><label for="pstock">Stock</label><input id="pstock" type="number" min="0" value="1" required></div>
    </div>
    <label for="pimage">Image</label><input id="pimage" type="file" accept="image/*">
    <p><button class="primary">Save product</button> <button type="button" onclick="adminProducts()">Clear form</button></p>
  </form>
  <div class="panel" style="margin-top:18px">
    <h2 style="margin-top:0">Your products (${products.length})</h2>
    ${products.length ? products.map(p => `<div class="row">
      ${p.image_url ? `<img src="${esc(p.image_url)}" alt="">` : '<div class="noimg" style="width:56px;height:56px;aspect-ratio:auto">–</div>'}
      <div class="grow"><strong>${esc(p.name)}</strong><br><span class="stock">${money(p.price)} · ${p.stock} in stock</span></div>
      <div><button onclick="editProduct(${p.id})">Edit</button> <button class="danger" onclick="deleteProduct(${p.id})">Delete</button></div>
    </div>`).join('') : '<p class="empty">No products yet. Add your first one above.</p>'}
  </div>`;
}
function editProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  const f = $('#pf'); f.dataset.id = id; f.dataset.img = p.image_url || '';
  $('#ptitle').textContent = 'Edit product';
  $('#pname').value = p.name; $('#pdesc').value = p.description || '';
  $('#pprice').value = p.price; $('#pstock').value = p.stock;
  f.scrollIntoView({ behavior: 'smooth' });
}
async function saveProduct(e) {
  e.preventDefault();
  const f = e.target; let image_url = f.dataset.img || null;
  const file = $('#pimage').files[0];
  if (file) {
    const path = `${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const up = await sb.storage.from('product-images').upload(path, file);
    if (up.error) return toast(up.error.message);
    image_url = sb.storage.from('product-images').getPublicUrl(path).data.publicUrl;
  }
  const row = { name: $('#pname').value.trim(), description: $('#pdesc').value.trim(), price: +$('#pprice').value, stock: +$('#pstock').value, image_url };
  const id = f.dataset.id;
  const { error } = id ? await sb.from('products').update(row).eq('id', id) : await sb.from('products').insert(row);
  if (error) return toast(error.message);
  toast(id ? 'Product updated' : 'Product added'); viewAdmin();
}
async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  const { error } = await sb.from('products').delete().eq('id', id);
  if (error) return toast(error.message);
  toast('Product deleted'); viewAdmin();
}
async function adminOrders() {
  const { data, error } = await sb.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return toast(error.message);
  $('#adm').innerHTML = `<div class="panel">${data.length ? data.map(o => `<div class="row">
    <div class="grow"><strong>#${o.id}</strong> · ${esc(o.user_email)}<br>
      <span class="stock">${new Date(o.created_at).toLocaleString()}</span><br>
      ${o.items.map(i => `${esc(i.name)} × ${Number(i.qty)}`).join(', ')}</div>
    <strong>${money(o.total)}</strong>
    <select style="width:auto" onchange="setStatus(${o.id},this.value)">
      ${['pending', 'paid', 'shipped', 'completed', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
    </select></div>`).join('') : '<p class="empty">No orders yet.</p>'}</div>`;
}
async function setStatus(id, status) {
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  toast(error ? error.message : 'Order updated');
}

init();
