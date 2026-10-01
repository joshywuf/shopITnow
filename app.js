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
      ? `<button onclick="go('profile')">Profile</button><button onclick="logout()">Log out</button>`
      : `<button onclick="go('login')">Log in</button><button class="primary" onclick="go('signup')">Sign up</button>`);
}
function go(v) {
  ({ shop: viewShop, cart: viewCart, login: () => viewAuth('login'), signup: () => viewAuth('signup'), admin: viewAdmin, profile: viewProfile })[v]();
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
        <div class="btns">
          <button ${p.stock > 0 ? '' : 'disabled'} onclick="addToCart(${p.id})">Add to cart</button>
          <button class="primary" ${p.stock > 0 ? '' : 'disabled'} onclick="buyNow(${p.id})">Buy now</button>
        </div>
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
function buyNow(id) { addToCart(id); go('cart'); }
function changeQty(id, d) {
  const i = cart.find(x => x.id === id); if (!i) return;
  i.qty += d; if (i.qty <= 0) cart = cart.filter(x => x.id !== id);
  saveCart(); viewCart();
}
let myProfile = null;
async function viewCart() {
  myProfile = null;
  if (user) {
    const { data } = await sb.from('profiles').select('full_name,address,phone,verification').eq('id', user.id).maybeSingle();
    myProfile = data;
  }
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const hasAddr = !!myProfile?.address;
  $('#view').innerHTML = `<div class="bar"><h1>Your cart</h1></div>` + (cart.length ? `
    <div class="panel">
      ${cart.map(i => `<div class="row">
        ${i.image_url ? `<img src="${esc(i.image_url)}" alt="">` : ''}
        <div class="grow"><strong>${esc(i.name)}</strong><br><span class="stock">${money(i.price)} each</span></div>
        <div><button onclick="changeQty(${i.id},-1)" aria-label="Remove one">−</button>
          <strong style="padding:0 10px">${i.qty}</strong>
          <button onclick="changeQty(${i.id},1)" aria-label="Add one">+</button></div>
        <strong>${money(i.price * i.qty)}</strong></div>`).join('')}
      <div class="row"><h2 style="margin:0">Total ${money(total)}</h2></div>
    </div>
    <div class="panel" style="margin-top:18px">
      <h2 style="margin-top:0">Delivery address</h2>
      ${user ? `${hasAddr ? `<label class="opt"><input type="radio" name="addr" value="profile" checked onchange="toggleAddr()"><span>Use my profile address<br><span class="stock">${esc(myProfile.address)}</span></span></label>` : ''}
        <label class="opt"><input type="radio" name="addr" value="new" ${hasAddr ? '' : 'checked'} onchange="toggleAddr()"><span>Use a different address</span></label>
        <div id="newbox" ${hasAddr ? 'hidden' : ''}>
          <label for="newaddr">Address</label><textarea id="newaddr" rows="2"></textarea>
          <label for="newphone">Phone (optional)</label><input id="newphone" type="tel">
        </div>` : '<p class="stock">Log in to choose where to deliver your order.</p>'}
      <p><button class="primary" onclick="checkout()">Place order</button></p>
    </div>` : '<p class="empty">Your cart is empty. <a href="#" onclick="go(\'shop\');return false">Browse the shop</a></p>');
}
function toggleAddr() { $('#newbox').hidden = document.querySelector('input[name=addr]:checked').value !== 'new'; }
async function checkout() {
  if (!user) { toast('Log in to place your order'); return go('login'); }
  const { data: pr } = await sb.from('profiles').select('verification').eq('id', user.id).maybeSingle();
  if (role !== 'admin' && pr?.verification !== 'verified') { toast('Verify your profile before ordering'); return go('profile'); }
  const mode = document.querySelector('input[name=addr]:checked')?.value;
  const ship_name = myProfile?.full_name || user.email;
  const ship_address = mode === 'profile' ? myProfile?.address : $('#newaddr')?.value.trim();
  const ship_phone = (mode === 'profile' ? myProfile?.phone : ($('#newphone')?.value.trim() || myProfile?.phone)) || null;
  if (!ship_address) return toast('Add a delivery address');
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const items = cart.map(({ id, name, price, qty }) => ({ id, name, price, qty }));
  const { error } = await sb.from('orders').insert({ user_id: user.id, user_email: user.email, ship_name, ship_address, ship_phone, items, total });
  if (error) return toast(error.message);
  cart = []; saveCart(); toast('Order placed. Thank you!'); go('shop');
}

// ---------- admin ----------
async function viewAdmin() {
  if (role !== 'admin') { toast('Admins only'); return go('shop'); }
  await loadProducts();
  $('#view').innerHTML = `
    <div class="bar"><h1>Admin</h1></div>
    <div class="tabs">${[['products', 'Products'], ['orders', 'Orders'], ['customers', 'Customers']].map(([k, l]) =>
      `<button class="${adminTab === k ? 'on' : ''}" onclick="adminTab='${k}';viewAdmin()">${l}</button>`).join('')}</div>
    <div id="adm"></div>`;
  ({ products: adminProducts, orders: adminOrders, customers: adminCustomers })[adminTab]();
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
  $('#adm').innerHTML = `<div class="panel">${data.length ? data.map(o => `<div class="row" data-s="${esc(o.status)}">
    <div class="grow"><strong>#${o.id}</strong> · ${esc(o.ship_name || o.user_email)}<br>
      <span class="stock">${esc(o.user_email)}${o.ship_phone ? ' · ' + esc(o.ship_phone) : ''}</span><br>
      ${o.ship_address ? 'Deliver to: ' + esc(o.ship_address) + '<br>' : '<span class="stock">No address (older order)</span><br>'}
      <span class="stock">${new Date(o.created_at).toLocaleString()}</span><br>
      ${o.items.map(i => `${esc(i.name)} × ${Number(i.qty)}`).join(', ')}</div>
    <strong>${money(o.total)}</strong>
    <select class="st" data-s="${esc(o.status)}" onchange="setStatus(${o.id},this)">
      ${['pending', 'processing', 'paid', 'shipped', 'completed', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <button class="danger" onclick="deleteOrder(${o.id})">Remove</button></div>`).join('') : '<p class="empty">No orders yet.</p>'}</div>`;
}
async function deleteOrder(id) {
  if (!confirm('Remove order #' + id + '? This cannot be undone.')) return;
  const { data, error } = await sb.from('orders').delete().eq('id', id).select();
  if (error || !data.length) return toast(error?.message || 'Could not remove. Run the new SQL update first.');
  toast('Order removed'); adminOrders();
}
async function setStatus(id, el) {
  const status = el.value;
  const { error } = await sb.from('orders').update({ status }).eq('id', id);
  if (error) { toast(error.message); return adminOrders(); }
  el.dataset.s = status; el.closest('.row').dataset.s = status; toast('Order marked ' + status);
}

// ---------- admin: customers + verification ----------
async function adminCustomers() {
  const { data, error } = await sb.from('profiles').select('*').neq('role', 'admin').order('submitted_at', { ascending: false, nullsFirst: false });
  if (error) return toast(error.message);
  $('#adm').innerHTML = `<div class="panel">${data.length ? data.map(c => `<div class="row" data-s="${esc(c.verification)}">
    <div class="grow"><strong>${esc(c.full_name || 'No name yet')}</strong> <span class="st" data-s="${esc(c.verification)}">${esc(c.verification)}</span><br>
      <span class="stock">${esc(c.email)}${c.phone ? ' · ' + esc(c.phone) : ' · no phone'}</span>
      ${c.address ? `<br>${esc(c.address)}` : ''}${c.id_number ? `<br>${esc(c.id_type)}: ${esc(c.id_number)}` : ''}</div>
    <div>${c.id_photo ? `<button onclick="viewId('${esc(c.id_photo)}')">View ID photo</button> ` : ''}
      ${c.submitted_at ? `<button class="primary" onclick="verify('${c.id}','verified')">Verify</button>
      <button class="danger" onclick="verify('${c.id}','rejected')">Reject</button>` : '<span class="stock">Not submitted</span>'}</div>
  </div>`).join('') : '<p class="empty">No customers yet.</p>'}</div>`;
}
async function verify(id, status) {
  const { error } = await sb.rpc('set_verification', { p_user: id, p_status: status });
  if (error) return toast(error.message);
  toast('Marked ' + status); adminCustomers();
}
async function viewId(path) {
  const { data, error } = await sb.storage.from('id-documents').createSignedUrl(path, 120);
  if (error) return toast(error.message);
  const d = document.createElement('div'); d.className = 'lightbox'; d.onclick = () => d.remove();
  d.innerHTML = `<img src="${data.signedUrl}" alt="ID photo">`; document.body.append(d);
}

// ---------- customer profile ----------
async function viewProfile() {
  if (!user) { toast('Log in first'); return go('login'); }
  const { data: p } = await sb.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const v = p?.verification || 'unverified';
  const { data: orders } = await sb.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  const msg = { unverified: 'Fill in your details and send them to be verified.', pending: 'Your details are waiting for the shop to check them.',
    verified: 'Your account is verified.', rejected: 'Your details were rejected. Update them and send again.' }[v];
  $('#view').innerHTML = `
    <div class="bar"><h1>My profile</h1><span class="st" data-s="${v}">${v}</span></div>
    <form class="panel" onsubmit="saveProfile(event)">
      <p class="stock">${msg}</p>
      <label for="fn">Full name</label><input id="fn" required value="${esc(p?.full_name)}">
      <label for="pe">Email</label><input id="pe" value="${esc(user.email)}" disabled>
      <label for="pp">Phone (optional)</label><input id="pp" type="tel" value="${esc(p?.phone)}">
      <label for="pa">Address</label><textarea id="pa" rows="2" required>${esc(p?.address)}</textarea>
      <div class="two">
        <div><label for="it">ID type</label><select id="it">${['National ID', "Driver's license", 'Passport', 'School ID', 'Other'].map(t => `<option ${t === p?.id_type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label for="in">ID number</label><input id="in" required value="${esc(p?.id_number)}"></div>
      </div>
      <label for="ip">ID photo${p?.id_photo ? ' (uploaded; choose a file only to replace it)' : ''}</label>
      <input id="ip" type="file" accept="image/*" ${p?.id_photo ? '' : 'required'}>
      <p><button class="primary">Send for verification</button></p>
    </form>
    <h2 style="margin:28px 0 12px">My orders</h2>
    <div class="panel">${orders?.length ? orders.map(o => `<div class="row" data-s="${esc(o.status)}">
      <div class="grow"><strong>Order #${o.id}</strong><br><span class="stock">${new Date(o.created_at).toLocaleDateString()} · ${o.items.map(i => `${esc(i.name)} × ${Number(i.qty)}`).join(', ')}</span></div>
      <strong>${money(o.total)}</strong><span class="st" data-s="${esc(o.status)}">${esc(o.status)}</span></div>`).join('') : '<p class="empty">No orders yet.</p>'}</div>`;
}
async function saveProfile(e) {
  e.preventDefault();
  let photo = ''; const f = $('#ip').files[0];
  if (f) {
    const path = `${user.id}/${Date.now()}-${f.name.replace(/[^\w.-]/g, '_')}`;
    const up = await sb.storage.from('id-documents').upload(path, f);
    if (up.error) return toast(up.error.message);
    photo = path;
  }
  const { error } = await sb.rpc('submit_profile', { p_name: $('#fn').value.trim(), p_address: $('#pa').value.trim(),
    p_phone: $('#pp').value.trim(), p_id_type: $('#it').value, p_id_number: $('#in').value.trim(), p_id_photo: photo });
  if (error) return toast(error.message);
  toast('Sent for verification'); viewProfile();
}

init();
