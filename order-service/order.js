'use strict';

class OrderError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = 'OrderError';
    this.status = status;
  }
}

function validateOrderInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new OrderError('Request body must be a JSON object');
  }
  if (typeof body.customerName !== 'string'
    || body.customerName.trim().length === 0
    || body.customerName.trim().length > 100) {
    throw new OrderError('customerName must contain 1 to 100 characters');
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
    throw new OrderError('items must contain 1 to 50 products');
  }

  const items = body.items.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.productId !== 'string'
      || !item.productId.trim()
      || item.productId.trim().length > 100) {
      throw new OrderError(`items[${index}].productId must contain 1 to 100 characters`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) {
      throw new OrderError(`items[${index}].quantity must be an integer from 1 to 100`);
    }
    // Harga/subtotal dari client sengaja tidak disalin; katalog menjadi sumber harga.
    return { productId: item.productId.trim(), quantity: item.quantity };
  });

  return { customerName: body.customerName.trim(), items };
}

function priceOrder(items, productsById, { checkStock = true } = {}) {
  const requestedQuantities = new Map();
  for (const item of items) {
    requestedQuantities.set(item.productId, (requestedQuantities.get(item.productId) || 0) + item.quantity);
  }

  for (const [productId, quantity] of requestedQuantities) {
    const product = productsById.get(productId);
    if (!product || product.id !== productId || typeof product.name !== 'string'
      || !product.name.trim() || !Number.isSafeInteger(product.price) || product.price < 0
      || !Number.isSafeInteger(product.stock) || product.stock < 0) {
      throw new OrderError('Catalog returned invalid product data', 502);
    }
    if (checkStock && quantity > product.stock) {
      throw new OrderError(`Insufficient stock for ${productId}; available: ${product.stock}`);
    }
  }

  const pricedItems = items.map(({ productId, quantity }) => {
    const product = productsById.get(productId);
    const subtotal = product.price * quantity;
    if (!Number.isSafeInteger(subtotal)) {
      throw new OrderError('Catalog price exceeds the supported range', 502);
    }
    return { productId, name: product.name, quantity, unitPrice: product.price, subtotal };
  });
  const total = pricedItems.reduce((sum, item) => sum + item.subtotal, 0);
  if (!Number.isSafeInteger(total)) {
    throw new OrderError('Order total exceeds the supported range', 502);
  }
  return { items: pricedItems, total };
}

module.exports = { OrderError, validateOrderInput, priceOrder };
