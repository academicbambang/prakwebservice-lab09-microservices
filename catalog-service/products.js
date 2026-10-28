'use strict';

// Harga menggunakan rupiah bulat; data ini hanya fixture untuk praktikum.
const products = Object.freeze([
  Object.freeze({
    id: 'prod-001',
    name: 'Kopi Arabika Gayo',
    category: 'kuliner',
    price: 85000,
    stock: 40,
    seller: 'Koperasi Kopi Gayo',
  }),
  Object.freeze({
    id: 'prod-002',
    name: 'Tas Anyaman Pandan',
    category: 'kerajinan',
    price: 120000,
    stock: 15,
    seller: 'Rumah Anyaman Nusantara',
  }),
  Object.freeze({
    id: 'prod-003',
    name: 'Kaos Batik UMKM',
    category: 'fashion',
    price: 95000,
    stock: 30,
    seller: 'Batik Lokal Mandiri',
  }),
]);

function filterProducts(source, { category, search } = {}) {
  const normalizedCategory = category?.trim().toLowerCase();
  const normalizedSearch = search?.trim().toLowerCase();

  return source.filter((product) => (
    (!normalizedCategory || product.category.toLowerCase() === normalizedCategory)
    && (!normalizedSearch || product.name.toLowerCase().includes(normalizedSearch))
  ));
}

function findProducts(options) {
  return filterProducts(products, options);
}

function findProduct(id) {
  return products.find((product) => product.id === id) || null;
}

class ReservationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'ReservationError';
    this.status = status;
  }
}

function validateQuantity(quantity, field) {
  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new ReservationError(`${field} must be a positive safe integer`);
  }
}

function createProductStore() {
  // Setiap instance app memiliki stok sendiri; fixture tetap immutable untuk pengujian.
  const state = products.map((product) => ({ ...product }));
  const findInState = (id) => state.find((product) => product.id === id) || null;

  function reserveProducts(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
      throw new ReservationError('items must contain 1 to 50 products');
    }

    const quantities = new Map();
    for (const [index, item] of items.entries()) {
      if (!item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.productId !== 'string' || !item.productId.trim()
        || item.productId.trim().length > 100) {
        throw new ReservationError(`items[${index}].productId must contain 1 to 100 characters`);
      }
      validateQuantity(item.quantity, `items[${index}].quantity`);
      const productId = item.productId.trim();
      const totalQuantity = (quantities.get(productId) || 0) + item.quantity;
      validateQuantity(totalQuantity, `Total quantity for ${productId}`);
      quantities.set(productId, totalQuantity);
    }

    // Seluruh batch diperiksa sebelum mutasi. Tidak ada await di antara cek dan pengurangan.
    const reservations = [...quantities].map(([productId, quantity]) => {
      const product = findInState(productId);
      if (!product) throw new ReservationError(`Unknown product: ${productId}`, 404);
      if (quantity > product.stock) {
        throw new ReservationError(`Insufficient stock for ${productId}; available: ${product.stock}`, 409);
      }
      return { product, quantity };
    });
    for (const { product, quantity } of reservations) product.stock -= quantity;
    return reservations.map(({ product }) => product);
  }

  return {
    findProducts: (options) => filterProducts(state, options),
    findProduct: findInState,
    reserveProduct(id, qty) {
      validateQuantity(qty, 'qty');
      return reserveProducts([{ productId: id, quantity: qty }])[0];
    },
    reserveProducts,
  };
}

module.exports = { products, findProducts, findProduct, createProductStore, ReservationError };
