'use strict';

(() => {
  const byId = (id) => document.getElementById(id);
  const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });
  const date = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
  const state = {
    products: [], cart: new Map(), orders: [], apiKey: '',
    catalogLoading: false, ordersLoading: false, checkoutLoading: false, statusLoading: false,
    catalogLoaded: false, ordersLoaded: false,
  };

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function notice(id, message = '', kind = '', retry) {
    const target = byId(id);
    target.replaceChildren();
    target.hidden = !message;
    target.className = `notice${kind ? ` ${kind}` : ''}`;
    if (!message) return;
    target.append(document.createTextNode(message));
    if (retry) {
      const button = node('button', 'notice-action', 'Coba lagi');
      button.type = 'button';
      button.addEventListener('click', retry);
      target.append(button);
    }
  }

  // Pesan lokal tidak menampilkan body error upstream atau credential pengguna.
  function errorMessage(error, action) {
    if (error.status === 400) return 'Data pesanan belum sesuai. Periksa nama dan jumlah produk (1–100 per produk).';
    if (error.status === 401) return 'API key ditolak. Masukkan key gateway yang benar, lalu aktifkan kembali.';
    if (error.status === 404) return 'Produk atau pesanan tidak ditemukan. Perbarui data sebelum melanjutkan.';
    if (error.status === 409) return 'Stok berubah atau tidak mencukupi. Periksa stok terbaru dan sesuaikan keranjangmu.';
    if (error.status === 429) return `Batas akses tercapai. Tunggu ${error.retryAfter || 10} detik, lalu coba kembali secara manual.`;
    if (error.status === 503) return action === 'checkout'
      ? 'Layanan produk belum tersedia. Pesanan belum dikonfirmasi; periksa riwayat sebelum mencoba kembali.'
      : 'Layanan sedang belum tersedia. Kamu dapat mencoba kembali sebentar lagi.';
    if (error.status === 502) return 'Respons layanan belum dapat diproses. Coba lagi setelah layanan kembali normal.';
    return action === 'checkout'
      ? 'Konfirmasi pesanan terputus. Periksa riwayat sebelum mengirim ulang untuk menghindari pesanan ganda.'
      : 'Data belum dapat dimuat. Periksa koneksi atau status layanan, lalu coba lagi.';
  }

  async function request(route, { authenticated = false, body } = {}) {
    const response = await fetch(route, {
      method: body === undefined ? 'GET' : 'POST',
      mode: 'same-origin', redirect: 'error', credentials: 'same-origin', cache: 'no-store',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(authenticated ? { 'x-api-key': state.apiKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const error = new Error('Request failed');
      error.status = response.status;
      const retryAfter = Number(response.headers.get('retry-after'));
      if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter < 3600) error.retryAfter = Math.ceil(retryAfter);
      try { await response.body?.cancel(); } catch { /* Preserve the HTTP status if cleanup fails. */ }
      throw error;
    }
    return response.json();
  }

  // Ilustrasi lokal dibuat dari koordinat tetap; data API hanya masuk melalui textContent.
  function productArt(category, index) {
    const art = node('div', `product-art ${category === 'kuliner' ? 'coffee' : category === 'kerajinan' ? 'craft' : 'fashion'}`);
    art.setAttribute('aria-hidden', 'true');
    art.append(node('span', 'product-number', `LOKAL / ${String(index + 1).padStart(2, '0')}`));
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 120 120');
    function shape(tag, attributes) {
      const element = document.createElementNS(ns, tag);
      for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
      svg.append(element);
    }
    if (category === 'kuliner') {
      shape('ellipse', { cx: '60', cy: '101', rx: '31', ry: '5', fill: '#bdc1a6', opacity: '.45' });
      shape('path', { d: 'M36 25h48l6 73H30z', fill: '#b99461', stroke: '#7b6745', 'stroke-width': '1.5', 'stroke-linejoin': 'round' });
      shape('path', { d: 'M36 25l6-12h36l6 12M36 29h48', fill: '#a37b4e', stroke: '#7b6745', 'stroke-width': '1.5' });
      shape('rect', { x: '37', y: '43', width: '46', height: '40', rx: '2', fill: '#eef0dc' });
      shape('ellipse', { cx: '60', cy: '62', rx: '8', ry: '11', fill: '#3e6451', transform: 'rotate(30 60 62)' });
      shape('path', { d: 'M65 53c-10 7 1 11-10 18M46 91h28', fill: 'none', stroke: '#eef0dc', 'stroke-width': '1.5', 'stroke-linecap': 'round' });
    } else if (category === 'kerajinan') {
      shape('ellipse', { cx: '60', cy: '104', rx: '34', ry: '5', fill: '#ba9c72', opacity: '.3' });
      shape('path', { d: 'M42 43V30c0-25 36-25 36 0v13', fill: 'none', stroke: '#997244', 'stroke-width': '6' });
      shape('path', { d: 'M27 40h66l-5 60H32z', fill: '#c49c63', stroke: '#937044', 'stroke-width': '1.5', 'stroke-linejoin': 'round' });
      for (let y = 49; y < 99; y += 8) shape('path', { d: `M30 ${y}h60`, stroke: '#e3c698', 'stroke-width': '3', opacity: '.8' });
      for (let x = 36; x < 88; x += 9) shape('path', { d: `M${x} 43v56`, stroke: '#9a7546', 'stroke-width': '3', opacity: '.55' });
      shape('path', { d: 'M27 41h66', stroke: '#80643f', 'stroke-width': '3' });
      shape('rect', { x: '49', y: '56', width: '23', height: '14', rx: '2', fill: '#eee4cb' });
      shape('path', { d: 'M56 63h10', stroke: '#997244', 'stroke-width': '1' });
    } else {
      shape('path', { d: 'M41 23L18 37l13 24 12-7v47h37V54l12 7 12-24-23-14-12 4H53z', fill: '#789882', stroke: '#466c55', 'stroke-width': '1.5', 'stroke-linejoin': 'round' });
      shape('path', { d: 'M48 24c0 19 27 19 27 0', fill: '#dfe7df', stroke: '#466c55', 'stroke-width': '2' });
      for (const [x, y] of [[51, 52], [68, 52], [59, 67], [51, 82], [68, 82]]) shape('path', { d: `M${x} ${y - 5}l4 5-4 5-4-5z`, fill: 'none', stroke: '#d8e3ca', 'stroke-width': '1.5' });
      shape('path', { d: 'M44 95h35', stroke: '#52765d', 'stroke-width': '1.5' });
    }
    art.append(svg);
    return art;
  }

  function emptyState(title, description, retry) {
    const panel = node('div', 'empty-state');
    panel.append(node('span', 'empty-symbol', '↗'), node('h3', '', title), node('p', '', description));
    if (retry) {
      const button = node('button', 'button', 'Coba lagi');
      button.type = 'button'; button.addEventListener('click', retry); panel.append(button);
    }
    return panel;
  }

  function renderProducts() {
    const container = byId('products');
    container.replaceChildren();
    if (!state.products.length) {
      container.append(emptyState(state.catalogLoaded ? 'Belum ada produk' : 'Katalog belum tersedia', 'Perbarui katalog untuk memuat pilihan produk lokal.', loadProducts));
      return;
    }
    state.products.forEach((product, index) => {
      const card = node('article', 'product-card');
      const body = node('div', 'product-body');
      const category = node('p', 'product-category', product.category);
      const name = node('h3', '', product.name);
      const seller = node('p', 'product-seller', product.seller);
      const priceRow = node('div', 'product-price-row');
      priceRow.append(node('strong', 'product-price', money.format(product.price)), node('span', `stock-pill${product.stock ? '' : ' empty'}`, product.stock ? `Stok ${product.stock}` : 'Stok habis'));
      const actions = node('div', 'product-actions');
      const quantity = node('input', 'quantity-input');
      quantity.type = 'number'; quantity.min = '1'; quantity.max = String(Math.min(100, product.stock)); quantity.step = '1'; quantity.value = '1';
      quantity.setAttribute('aria-label', `Jumlah ${product.name}`);
      quantity.disabled = !product.stock || state.checkoutLoading;
      const add = node('button', 'add-button', '+ Keranjang');
      add.type = 'button'; add.disabled = !product.stock || state.checkoutLoading;
      add.setAttribute('aria-label', `Tambahkan ${product.name} ke keranjang`);
      add.addEventListener('click', () => {
        const amount = Number(quantity.value);
        const current = state.cart.get(product.id) || 0;
        if (!Number.isSafeInteger(amount) || amount < 1 || amount > 100) {
          notice('catalog-notice', 'Masukkan jumlah bulat antara 1 dan 100.', 'warning');
          quantity.focus(); return;
        }
        if (current + amount > product.stock || current + amount > 100) {
          notice('catalog-notice', `Jumlah di keranjang melebihi stok atau batas 100 untuk ${product.name}.`, 'warning');
          return;
        }
        state.cart.set(product.id, current + amount);
        notice('catalog-notice', `${product.name} ditambahkan ke keranjang.`);
        notice('checkout-notice'); renderCart();
      });
      actions.append(quantity, add);
      body.append(category, name, seller, priceRow, actions);
      card.append(productArt(product.category, index), body); container.append(card);
    });
  }

  function cartIsValid() {
    return state.cart.size > 0 && [...state.cart].every(([id, quantity]) => {
      const product = state.products.find((item) => item.id === id);
      return product && quantity > 0 && quantity <= product.stock && quantity <= 100;
    });
  }

  function renderCart() {
    const container = byId('cart-items');
    container.replaceChildren();
    let count = 0;
    let total = 0;
    if (!state.cart.size) {
      const empty = node('div', 'cart-empty');
      empty.append(node('span', '', '+'));
      const text = node('p', '', 'Belum ada pilihan.'); text.append(node('br'), document.createTextNode('Tambahkan produk yang kamu suka.'));
      empty.append(text); container.append(empty);
    }
    for (const [id, quantity] of state.cart) {
      const product = state.products.find((item) => item.id === id);
      const name = product?.name || 'Produk tidak tersedia';
      const item = node('div', 'cart-item');
      const top = node('div', 'cart-item-top');
      const remove = node('button', 'remove-item', '×');
      remove.type = 'button'; remove.disabled = state.checkoutLoading;
      remove.setAttribute('aria-label', `Hapus ${name} dari keranjang`);
      remove.addEventListener('click', () => { state.cart.delete(id); renderCart(); });
      top.append(node('p', 'cart-item-name', name), remove);
      const bottom = node('div', 'cart-item-bottom');
      const stepper = node('div', 'quantity-stepper');
      const minus = node('button', '', '−'); minus.type = 'button'; minus.disabled = state.checkoutLoading;
      minus.setAttribute('aria-label', `Kurangi jumlah ${name}`);
      minus.addEventListener('click', () => {
        if (quantity <= 1) state.cart.delete(id); else state.cart.set(id, quantity - 1);
        renderCart();
      });
      const plus = node('button', '', '+'); plus.type = 'button';
      plus.disabled = state.checkoutLoading || !product || quantity >= Math.min(100, product.stock);
      plus.setAttribute('aria-label', `Tambah jumlah ${name}`);
      plus.addEventListener('click', () => { state.cart.set(id, quantity + 1); renderCart(); });
      stepper.append(minus, node('span', '', quantity), plus);
      bottom.append(stepper, node('strong', 'cart-item-price', money.format((product?.price || 0) * quantity)));
      item.append(top, bottom);
      if (!product || quantity > product.stock) item.append(node('p', 'cart-stock-warning', product ? `Stok tersisa ${product.stock}. Kurangi jumlah atau hapus produk.` : 'Hapus produk ini sebelum melanjutkan.'));
      container.append(item);
      count += quantity; total += (product?.price || 0) * quantity;
    }
    byId('cart-count').textContent = `${count} item`;
    byId('cart-total').textContent = money.format(total);
    byId('checkout').disabled = state.checkoutLoading || !state.apiKey || !cartIsValid();
    byId('checkout').firstElementChild.textContent = state.checkoutLoading ? 'Memproses pesanan…' : 'Buat pesanan';
    byId('checkout-form').setAttribute('aria-busy', String(state.checkoutLoading));
    byId('customer-name').disabled = state.checkoutLoading;
    byId('checkout-help').textContent = state.checkoutLoading ? 'Tunggu konfirmasi. Jangan tutup halaman atau kirim ulang.'
      : !state.cart.size ? 'Tambahkan produk dan aktifkan API key untuk memesan.'
        : !state.apiKey ? 'Aktifkan API key di panel akses untuk melanjutkan.'
          : !cartIsValid() ? 'Sesuaikan jumlah keranjang dengan stok terbaru.'
            : 'Stok dan harga akhir dikonfirmasi oleh layanan produk.';
    updateAccess();
  }

  function updateAccess() {
    byId('access-badge').textContent = state.apiKey ? 'Aktif di sesi ini' : 'Belum aktif';
    byId('access-badge').classList.toggle('active', Boolean(state.apiKey));
    byId('clear-key').hidden = !state.apiKey;
    // Jangan ganti credential ketika request terautentikasi masih berlangsung.
    for (const id of ['api-key', 'use-key', 'clear-key']) byId(id).disabled = state.checkoutLoading || state.ordersLoading;
    byId('refresh-orders').disabled = state.ordersLoading || state.checkoutLoading;
    byId('checkout').disabled = state.checkoutLoading || state.ordersLoading || state.catalogLoading || !state.apiKey || !cartIsValid();
  }

  function forgetKey(message = 'API key dihapus dari sesi ini.', isError = false) {
    state.apiKey = ''; state.orders = []; state.ordersLoaded = false;
    byId('api-key').value = '';
    byId('key-notice').textContent = message;
    byId('key-notice').classList.toggle('error', isError);
    renderCart(); renderOrders();
  }

  async function loadProducts() {
    if (state.catalogLoading) return;
    state.catalogLoading = true;
    byId('refresh-products').disabled = true;
    byId('refresh-products').textContent = state.catalogLoaded ? 'Memperbarui…' : 'Memuat…';
    byId('products').setAttribute('aria-busy', 'true');
    updateAccess();
    notice('catalog-notice');
    try {
      const payload = await request('/product-service/products');
      if (!Array.isArray(payload.data) || payload.data.some((product) => !product || typeof product.id !== 'string' || typeof product.name !== 'string'
        || typeof product.category !== 'string' || typeof product.seller !== 'string'
        || !Number.isSafeInteger(product.price) || product.price < 0 || !Number.isSafeInteger(product.stock) || product.stock < 0)) throw new Error('Invalid catalog');
      state.products = payload.data; state.catalogLoaded = true;
      byId('product-count').textContent = state.products.length;
      renderProducts(); renderCart();
    } catch (error) {
      notice('catalog-notice', errorMessage(error, 'catalog'), 'error', loadProducts);
      if (!state.catalogLoaded) renderProducts();
    } finally {
      state.catalogLoading = false;
      byId('refresh-products').disabled = state.checkoutLoading;
      byId('refresh-products').textContent = '↻ Perbarui stok';
      byId('products').setAttribute('aria-busy', 'false');
      updateAccess();
    }
  }

  function renderOrders() {
    const container = byId('orders');
    container.replaceChildren();
    if (!state.ordersLoaded) {
      container.append(emptyState('Riwayat ada di sini', state.apiKey ? 'Pilih “Muat pesanan” untuk melihat riwayat terbaru.' : 'Aktifkan API key di panel akses, lalu pilih “Muat pesanan”.'));
      return;
    }
    if (!state.orders.length) {
      container.append(emptyState('Belum ada pesanan', 'Produk pilihanmu menunggu. Mulai dari tab Produk lokal.'));
      return;
    }
    [...state.orders].reverse().forEach((order) => {
      const card = node('article', 'order-card');
      const heading = node('div', 'order-card-heading');
      const identity = node('div');
      identity.append(node('h3', 'order-name', order.customerName));
      const timestamp = new Date(order.createdAt);
      identity.append(node('p', 'order-date', Number.isNaN(timestamp.getTime()) ? 'Waktu belum tersedia' : date.format(timestamp)));
      heading.append(identity, node('span', 'order-status', order.status === 'pending' ? 'Menunggu proses' : String(order.status || 'Tercatat')));
      const items = node('ul', 'order-items');
      order.items.forEach((item) => {
        const row = node('li');
        row.append(node('span', '', `${item.quantity} × ${item.name}`), node('span', '', money.format(item.subtotal))); items.append(row);
      });
      const total = node('div', 'order-total'); total.append(node('span', '', 'Total pesanan'), node('strong', '', money.format(order.total)));
      card.append(heading, node('p', 'order-id', order.id), items, total); container.append(card);
    });
  }

  async function loadOrders() {
    if (state.ordersLoading) return;
    if (!state.apiKey) {
      notice('orders-notice', 'Aktifkan API key di panel akses sebelum memuat pesanan.', 'warning');
      byId('api-key').focus(); return;
    }
    state.ordersLoading = true;
    byId('orders').setAttribute('aria-busy', 'true');
    byId('refresh-orders').textContent = 'Memuat pesanan…';
    updateAccess(); notice('orders-notice', 'Memuat riwayat pesanan…');
    try {
      const payload = await request('/order-service/orders', { authenticated: true });
      if (!Array.isArray(payload.data) || payload.data.some((order) => !order || typeof order.id !== 'string' || !Array.isArray(order.items)
        || typeof order.customerName !== 'string' || !Number.isSafeInteger(order.total) || order.total < 0
        || order.items.some((item) => !item || typeof item.name !== 'string' || !Number.isSafeInteger(item.quantity)
          || !Number.isSafeInteger(item.subtotal) || item.subtotal < 0))) throw new Error('Invalid orders');
      state.orders = payload.data; state.ordersLoaded = true;
      renderOrders();
      notice('orders-notice', `${state.orders.length} pesanan dimuat. Pilih “Muat pesanan” untuk memperbarui kembali.`);
    } catch (error) {
      if (error.status === 401) forgetKey(errorMessage(error, 'orders'), true);
      notice('orders-notice', errorMessage(error, 'orders'), 'error', loadOrders);
    } finally {
      state.ordersLoading = false;
      byId('orders').setAttribute('aria-busy', 'false');
      byId('refresh-orders').textContent = '↻ Muat pesanan'; updateAccess();
    }
  }

  function showTab(name, focus = false) {
    for (const tab of ['products', 'orders']) {
      const selected = tab === name;
      byId(`tab-${tab}`).setAttribute('aria-selected', String(selected));
      byId(`tab-${tab}`).tabIndex = selected ? 0 : -1;
      byId(`tab-${tab}`).classList.toggle('active', selected);
      byId(`${tab}-panel`).hidden = !selected;
    }
    if (focus) byId(`tab-${name}`).focus();
  }

  async function checkStatus() {
    if (state.statusLoading) return;
    state.statusLoading = true;
    byId('check-status').disabled = true; byId('status-text').textContent = 'Memeriksa layanan…';
    try {
      const result = await request('/readyz');
      if (result.status !== 'ok') throw new Error('Not ready');
      byId('check-status').dataset.state = 'ok'; byId('status-text').textContent = 'Semua layanan siap';
    } catch {
      byId('check-status').dataset.state = 'error'; byId('status-text').textContent = 'Layanan belum siap';
    } finally {
      state.statusLoading = false; byId('check-status').disabled = false;
    }
  }

  byId('checkout-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.checkoutLoading || state.ordersLoading || state.catalogLoading || !state.apiKey || !cartIsValid()) return;
    const customerName = byId('customer-name').value.trim();
    if (!customerName) {
      notice('checkout-notice', 'Isi nama pemesan terlebih dahulu.', 'warning'); byId('customer-name').focus(); return;
    }
    state.checkoutLoading = true;
    const items = [...state.cart].map(([productId, quantity]) => ({ productId, quantity }));
    renderCart(); renderProducts(); byId('refresh-products').disabled = true; notice('checkout-notice');
    try {
      const result = await request('/order-service/orders', { authenticated: true, body: { customerName, items } });
      if (!result.data || typeof result.data.id !== 'string') throw new Error('Invalid confirmation');
      state.cart.clear(); renderCart();
      notice('checkout-notice', 'Pesanan berhasil dibuat. Stok dan riwayat sedang diperbarui.');
      await Promise.all([loadProducts(), loadOrders()]);
      notice('checkout-notice', 'Pesanan berhasil dibuat. Terima kasih sudah memilih produk lokal!');
      const view = node('button', 'notice-action', 'Lihat pesanan'); view.type = 'button';
      view.addEventListener('click', () => showTab('orders', true)); byId('checkout-notice').append(view);
    } catch (error) {
      if (error.status === 401) forgetKey(errorMessage(error, 'checkout'), true);
      notice('checkout-notice', errorMessage(error, 'checkout'), 'error');
      if (error.status === 409) await loadProducts();
    } finally {
      state.checkoutLoading = false;
      renderCart(); renderProducts(); byId('refresh-products').disabled = state.catalogLoading;
    }
  });

  byId('key-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.checkoutLoading || state.ordersLoading) return;
    const key = byId('api-key').value.trim(); byId('api-key').value = '';
    if (!key) return;
    state.apiKey = key; state.orders = []; state.ordersLoaded = false;
    byId('key-notice').textContent = 'Key aktif di sesi ini. Pilih “Muat pesanan” untuk memeriksa akses.';
    byId('key-notice').classList.remove('error');
    notice('orders-notice'); notice('checkout-notice'); renderCart(); renderOrders();
  });
  byId('clear-key').addEventListener('click', () => forgetKey());
  byId('refresh-products').addEventListener('click', loadProducts);
  byId('refresh-orders').addEventListener('click', loadOrders);
  byId('check-status').addEventListener('click', checkStatus);
  for (const name of ['products', 'orders']) {
    byId(`tab-${name}`).addEventListener('click', () => showTab(name));
    byId(`tab-${name}`).addEventListener('keydown', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        showTab(event.key === 'Home' ? 'products' : event.key === 'End' ? 'orders' : name === 'products' ? 'orders' : 'products', true);
      }
    });
  }
  renderCart(); loadProducts(); checkStatus();
})();
