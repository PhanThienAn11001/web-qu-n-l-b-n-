import crypto from 'node:crypto';

export function sanitizeText(value) {
  return String(value || '').trim().replace(/[<>]/g, '');
}

export function toPositiveInteger(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return 0;
  return number;
}

export function calculateActualStock(product) {
  return Math.max(
    Number(product.totalImported || 0) -
      Number(product.factoryReturnDefects || 0) -
      Number(product.unfixableDefects || 0) -
      Number(product.totalExported || 0),
    0,
  );
}

export function calculateDistributedStock(productId, distributions) {
  return distributions
    .filter((distribution) => distribution.productId === productId)
    .reduce((sum, distribution) => sum + Number(distribution.quantity || 0), 0);
}

export function createId(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}
