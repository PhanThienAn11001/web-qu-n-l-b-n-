import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';
import { createRepository } from './repository.js';
import { calculateActualStock, calculateDistributedStock, createId, sanitizeText, toPositiveInteger } from './utils.js';

dotenv.config({ quiet: true });

const app = express();
const port = Number(process.env.PORT || 4317);
const repository = createRepository();
const authSecret = process.env.AUTH_SECRET || 'kho-viet-local-secret';
const tokenMaxAgeMs = 1000 * 60 * 60 * 12;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (request, response) => {
  response.json({ status: 'ok' });
});

app.post('/api/auth/login', asyncHandler(async (request, response) => {
  const name = sanitizeText(request.body.name);
  const nameKey = name.toLowerCase();
  const password = String(request.body.password || '');
  const state = await repository.read();
  const user = state.users.find((item) => item.name.toLowerCase() === nameKey && item.active !== false);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw unauthorized('Tên đăng nhập hoặc mật khẩu không đúng');
  }

  await addLog(state, user, 'Đăng nhập', `${user.name} đăng nhập hệ thống.`);
  await repository.write(state);

  response.json({
    token: signToken({ userId: user.id }),
    user: sanitizeUser(user),
  });
}));

app.get('/api/dashboard', requireAuth, asyncHandler(async (request, response) => {
  const state = request.state;
  const isAdmin = request.user.role === 'admin';
  const products = state.products.map((product) => enrichProduct(product, state.distributions, state.activityLogs));
  const stats = {
    totalActualStock: products.reduce((sum, product) => sum + product.actualStock, 0),
    totalShopStock: products.reduce((sum, product) => sum + product.distributedStock, 0),
    lowStockCount: products.filter((product) => product.actualStock <= product.lowStockThreshold).length,
    shopCount: state.shops.length,
  };

  response.json({
    currentUser: sanitizeUser(request.user),
    products,
    shops: state.shops,
    distributions: state.distributions,
    users: isAdmin ? state.users.map(sanitizeUser) : [],
    activityLogs: isAdmin
      ? state.activityLogs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      : [],
    stats,
  });
}));

app.post('/api/inventory/import', requireAuth, asyncHandler(async (request, response) => {
  const payload = parseImportPayload(request.body);
  const state = request.state;
  let product = findImportProduct(state, payload);

  if (!product) {
    product = {
      id: createId('product'),
      name: payload.productName,
      sku: payload.sku || createProductSku(payload.productName, state.products.length + 1),
      size: payload.size,
      totalImported: 0,
      totalExported: 0,
      factoryReturnDefects: 0,
      unfixableDefects: 0,
      fixableDefects: 0,
      lowStockThreshold: 10,
    };
    state.products.push(product);
  }

  product.totalImported += payload.quantity;
  product.fixableDefects = Number(product.fixableDefects || 0) + payload.fixableDefects;
  product.factoryReturnDefects = Number(product.factoryReturnDefects || 0) + payload.factoryReturnDefects;
  product.unfixableDefects = Number(product.unfixableDefects || 0) + payload.unfixableDefects;
  if (payload.image) product.image = payload.image;

  const totalAllocated = payload.shopAllocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
  const importedActualStock = payload.quantity - payload.factoryReturnDefects - payload.unfixableDefects;

  if (totalAllocated > importedActualStock) {
    throw badRequest('Tổng số lượng phân bổ cho shop phải bằng tổng sản phẩm thực tế');
  }

  payload.shopAllocations.forEach((allocation) => {
    findShop(state, allocation.shopId);
    const distribution = getDistribution(state, product.id, allocation.shopId);
    distribution.quantity += allocation.quantity;
  });

  await addLog(
    state,
    request.user,
    'Nhập',
    `${request.user.name} nhập ${payload.quantity} sản phẩm ${product.name}.`,
    {
      type: 'import',
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      size: product.size || payload.size,
      quantity: payload.quantity,
      shopIds: payload.shopAllocations.map((allocation) => allocation.shopId),
      shopAllocations: payload.shopAllocations,
      image: product.image || '',
    },
  );
  await repository.write(state);

  response.status(201).json({ message: 'Đã ghi nhận nhập kho', product: enrichProduct(product, state.distributions) });
}));

app.post('/api/inventory/distribute', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const payload = parseInventoryPayload(request.body, { requireShop: true });
  const state = request.state;
  const product = findProduct(state, payload.productId);
  const shop = findShop(state, payload.shopId);
  const actualStock = calculateActualStock(product);
  const currentDistributed = calculateDistributedStock(product.id, state.distributions);

  if (currentDistributed + payload.quantity > actualStock) {
    throw badRequest('Tổng phân bổ không được vượt quá tồn thực tế');
  }

  const distribution = getDistribution(state, product.id, shop.id);
  distribution.quantity += payload.quantity;

  await addLog(state, request.user, 'Phân bổ kho', `Phân bổ ${payload.quantity} sản phẩm ${product.name} về ${shop.name}. ${payload.note}`);
  await repository.write(state);

  response.status(201).json({ message: 'Đã phân bổ tồn kho', distribution });
}));

app.post('/api/inventory/export', requireAuth, asyncHandler(async (request, response) => {
  const payload = parseInventoryPayload(request.body, { requireShop: true });
  const state = request.state;
  const product = findProduct(state, payload.productId);
  const shop = findShop(state, payload.shopId);
  const distribution = getDistribution(state, product.id, shop.id);

  if (payload.quantity > distribution.quantity) {
    throw badRequest('Số lượng xuất không được vượt quá tồn tại cửa hàng');
  }

  if (payload.quantity > calculateActualStock(product)) {
    throw badRequest('Số lượng xuất không được vượt quá tồn kho thực tế');
  }

  distribution.quantity -= payload.quantity;
  product.totalExported = Number(product.totalExported || 0) + payload.quantity;
  await addLog(state, request.user, 'Xuất', `${request.user.name} xuất ${payload.quantity} sản phẩm ${product.name} tại ${shop.name}. ${payload.note}`, {
    type: 'export',
    productId: product.id,
    productName: product.name,
    sku: payload.sku || product.sku,
    size: payload.size || product.size || '',
    quantity: payload.quantity,
    shopId: shop.id,
    shopName: shop.name,
    image: product.image || '',
  });
  await repository.write(state);

  response.status(201).json({ message: 'Đã ghi nhận xuất', distribution });
}));


app.post('/api/inventory/cancel-export', requireAuth, asyncHandler(async (request, response) => {
  const payload = parseInventoryPayload(request.body, { requireShop: true });
  const state = request.state;
  const product = findProduct(state, payload.productId);
  const shop = findShop(state, payload.shopId);
  const distribution = getDistribution(state, product.id, shop.id);
  const netExported = calculateNetExportedForShop(state, product.id, shop.id);

  if (payload.quantity > netExported) {
    throw badRequest('Số lượng hủy xuất không được lớn hơn số lượng đã xuất trước đó');
  }

  distribution.quantity += payload.quantity;
  product.totalExported = Math.max(Number(product.totalExported || 0) - payload.quantity, 0);
  await addLog(state, request.user, 'Hủy xuất', `${request.user.name} hủy xuất ${payload.quantity} sản phẩm ${product.name} tại ${shop.name}. ${payload.note}`, {
    type: 'cancel-export',
    productId: product.id,
    productName: product.name,
    sku: payload.sku || product.sku,
    size: payload.size || product.size || '',
    quantity: payload.quantity,
    shopId: shop.id,
    shopName: shop.name,
    image: product.image || '',
  });
  await repository.write(state);

  response.status(201).json({ message: 'Đã ghi nhận hủy xuất', distribution });
}));

app.put('/api/products/:id/image', requireAuth, asyncHandler(async (request, response) => {
  const state = request.state;
  const product = findProduct(state, request.params.id);
  const image = sanitizeImage(request.body.image);

  if (image) {
    product.image = image;
  } else {
    delete product.image;
  }

  await addLog(state, request.user, image ? 'Cập nhật hình ảnh' : 'Xóa hình ảnh', `${request.user.name} cập nhật hình ảnh sản phẩm ${product.name}.`);
  await repository.write(state);

  response.json({ message: image ? 'Đã cập nhật hình ảnh' : 'Đã xóa hình ảnh', product: enrichProduct(product, state.distributions) });
}));

app.delete('/api/products/:id', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const product = findProduct(state, request.params.id);

  state.products = state.products.filter((item) => item.id !== product.id);
  state.distributions = state.distributions.filter((item) => item.productId !== product.id);
  state.activityLogs = state.activityLogs.filter((item) => item.metadata?.productId !== product.id);
  await addLog(state, request.user, 'Xóa sản phẩm', `Xóa sản phẩm ${product.name}.`, {
    type: 'delete-product',
    productId: product.id,
    productName: product.name,
    sku: product.sku,
  });
  await repository.write(state);

  response.json({ message: 'Đã xóa sản phẩm' });
}));

app.delete('/api/shops/:shopId/products/:productId', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const shop = findShop(state, request.params.shopId);
  const product = findProduct(state, request.params.productId);
  const distribution = state.distributions.find((item) => item.productId === product.id && item.shopId === shop.id);
  const removedQuantity = Number(distribution?.quantity || 0);

  state.distributions = state.distributions.filter((item) => !(item.productId === product.id && item.shopId === shop.id));
  await addLog(state, request.user, 'Xóa sản phẩm khỏi shop', `Xóa ${product.name} khỏi ${shop.name}.`, {
    type: 'remove-shop-product',
    productId: product.id,
    productName: product.name,
    sku: product.sku,
    size: product.size || '',
    shopId: shop.id,
    shopName: shop.name,
    quantity: removedQuantity,
  });
  await repository.write(state);

  response.json({ message: 'Đã xóa sản phẩm khỏi shop' });
}));

app.put('/api/me/avatar', requireAuth, asyncHandler(async (request, response) => {
  const state = request.state;
  const user = findUser(state, request.user.id);
  user.avatar = sanitizeImage(request.body.avatar);

  await addLog(state, user, 'Sửa ảnh đại diện', `${user.name} cập nhật ảnh đại diện.`);
  await repository.write(state);

  response.json({ message: 'Đã cập nhật ảnh đại diện', user: sanitizeUser(user) });
}));

app.post('/api/shops', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const shop = parseShopPayload(request.body);

  state.shops.push({ id: createId('shop'), ...shop });
  await addLog(state, request.user, 'Thêm shop', `Thêm shop ${shop.name}.`);
  await repository.write(state);

  response.status(201).json({ message: 'Đã thêm shop' });
}));

app.put('/api/shops/:id', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const shop = findShop(state, request.params.id);
  const payload = parseShopPayload(request.body);

  Object.assign(shop, payload);
  await addLog(state, request.user, 'Sửa shop', `Cập nhật shop ${shop.name}.`);
  await repository.write(state);

  response.json({ message: 'Đã cập nhật shop' });
}));

app.delete('/api/shops/:id', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const shop = findShop(state, request.params.id);

  const hasStock = state.distributions.some(
  (item) => item.shopId === shop.id && Number(item.quantity || 0) > 0
);

if (hasStock) {
  throw badRequest('Không thể xóa shop còn tồn kho');
}
  state.shops = state.shops.filter((item) => item.id !== shop.id);
  state.distributions = state.distributions.filter((item) => item.shopId !== shop.id);
  await addLog(state, request.user, 'Xóa shop', `Xóa shop ${shop.name}.`);
  await repository.write(state);

  response.json({ message: 'Đã xóa shop' });
}));

app.post('/api/users', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const payload = parseUserPayload(request.body, { requirePassword: true });

  if (state.users.some((user) => user.name.toLowerCase() === payload.name.toLowerCase())) {
    throw badRequest('Tên tài khoản đã tồn tại');
  }

  const user = {
    id: createId('user'),
    name: payload.name,
    role: payload.role,
    active: payload.active,
    avatar: payload.avatar,
    permissions: permissionsForRole(payload.role),
    passwordHash: hashPassword(payload.password),
  };

  state.users.push(user);
  await addLog(state, request.user, 'Thêm tài khoản', `Thêm tài khoản ${user.name}.`);
  await repository.write(state);

  response.status(201).json({ message: 'Đã thêm tài khoản', user: sanitizeUser(user) });
}));

app.put('/api/users/:id', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const user = findUser(state, request.params.id);
  const payload = parseUserPayload(request.body, { requirePassword: false });

  if (state.users.some((item) => item.id !== user.id && item.name.toLowerCase() === payload.name.toLowerCase())) {
    throw badRequest('Tên tài khoản đã tồn tại');
  }
  if (user.id === request.user.id && payload.active === false) {
    throw badRequest('Không thể khóa chính tài khoản đang đăng nhập');
  }

  Object.assign(user, {
    name: payload.name,
    role: payload.role,
    active: payload.active,
    avatar: payload.avatar,
    permissions: permissionsForRole(payload.role),
  });
  if (payload.password) {
    user.passwordHash = hashPassword(payload.password);
  }

  await addLog(state, request.user, 'Sửa tài khoản', `Cập nhật tài khoản ${user.name}.`);
  await repository.write(state);

  response.json({ message: 'Đã cập nhật tài khoản', user: sanitizeUser(user) });
}));

app.delete('/api/users/:id', requireAuth, requireAdmin, asyncHandler(async (request, response) => {
  const state = request.state;
  const user = findUser(state, request.params.id);

  if (user.id === request.user.id) throw badRequest('Không thể xóa chính tài khoản đang đăng nhập');
  if (user.role === 'admin' && state.users.filter((item) => item.role === 'admin').length <= 1) {
    throw badRequest('Hệ thống cần ít nhất một tài khoản admin');
  }

  state.users = state.users.filter((item) => item.id !== user.id);
  await addLog(state, request.user, 'Xóa tài khoản', `Xóa tài khoản ${user.name}.`);
  await repository.write(state);

  response.json({ message: 'Đã xóa tài khoản' });
}));

app.use((error, request, response, next) => {
  const status = error.status || 500;
  const message = status === 500 ? 'Máy chủ không thể xử lý yêu cầu' : error.message;
  if (status === 500) {
    console.error(error);
  }
  response.status(status).json({ message });
});

app.listen(port, () => {
  console.log(`API server running at http://localhost:${port}`);
});

async function requireAuth(request, response, next) {
  try {
    const token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = verifyToken(token);
    const state = await repository.read();
    const user = state.users.find((item) => item.id === payload.userId && item.active !== false);

    if (!user) throw unauthorized('Phiên đăng nhập không hợp lệ');
    request.state = state;
    request.user = user;
    next();
  } catch (error) {
    next(error.status ? error : unauthorized('Vui lòng đăng nhập'));
  }
}

function requireAdmin(request, response, next) {
  if (request.user.role !== 'admin') {
    next(forbidden('Tài khoản này không có quyền thao tác admin'));
    return;
  }
  next();
}

function parseInventoryPayload(body, { requireShop }) {
  const productId = sanitizeText(body.productId);
  const shopId = sanitizeText(body.shopId);
  const sku = sanitizeText(body.sku);
  const size = sanitizeText(body.size);
  const note = sanitizeText(body.note);
  const quantity = toPositiveInteger(body.quantity);

  if (!productId) throw badRequest('Vui lòng chọn sản phẩm');
  if (requireShop && !shopId) throw badRequest('Vui lòng chọn shop');
  if (!quantity) throw badRequest('Số lượng phải là số nguyên dương');

  return { productId, shopId, sku, size, quantity, note };
}

function parseImportPayload(body) {
  const productId = sanitizeText(body.productId);
  const productName = sanitizeText(body.productName);
  const sku = sanitizeText(body.sku);
  const quantity = toPositiveInteger(body.quantity);
  const size = sanitizeText(body.size);
  const fixableDefects = toNonNegativeInteger(body.fixableDefects);
  const factoryReturnDefects = toNonNegativeInteger(body.factoryReturnDefects);
  const unfixableDefects = toNonNegativeInteger(body.unfixableDefects);
  const image = sanitizeImage(body.image);
  const shopAllocations = Array.isArray(body.shopAllocations)
    ? body.shopAllocations
        .map((allocation) => ({
          shopId: sanitizeText(allocation.shopId),
          quantity: toNonNegativeInteger(allocation.quantity),
        }))
        .filter((allocation) => allocation.shopId && allocation.quantity > 0)
    : [];

  if (!productId && !productName) throw badRequest('Vui lòng nhập tên sản phẩm');
  if (!quantity) throw badRequest('Số lượng phải là số nguyên dương');
  if (fixableDefects + factoryReturnDefects + unfixableDefects > quantity) {
    throw badRequest('Tổng số lượng lỗi không được vượt quá số lượng nhập');
  }

  return {
    productId,
    productName,
    sku,
    quantity,
    size,
    fixableDefects,
    factoryReturnDefects,
    unfixableDefects,
    image,
    shopAllocations,
  };
}

function toNonNegativeInteger(value) {
  const number = Number(value || 0);
  if (!Number.isInteger(number) || number < 0) return 0;
  return number;
}

function sanitizeImage(value) {
  const image = String(value || '');
  if (!image) return '';
  if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) {
    throw badRequest('Hình ảnh không hợp lệ');
  }
  if (image.length > 750000) {
    throw badRequest('Hình ảnh quá lớn');
  }
  return image;
}

function parseShopPayload(body) {
  const name = sanitizeText(body.name);
  const address = sanitizeText(body.address);
  const manager = sanitizeText(body.manager);
  const image = sanitizeImage(body.image);

  if (!name) throw badRequest('Vui lòng nhập tên shop');
  return { name, address, manager, image };
}

function parseUserPayload(body, { requirePassword }) {
  const name = sanitizeText(body.name);
  const role = sanitizeText(body.role) === 'admin' ? 'admin' : 'staff';
  const password = String(body.password || '');
  const active = body.active !== false;
  const avatar = sanitizeImage(body.avatar);

  if (!name) throw badRequest('Vui lòng nhập tên tài khoản');
  if (requirePassword && password.length < 6) throw badRequest('Mật khẩu phải có ít nhất 6 ký tự');
  if (password && password.length < 6) throw badRequest('Mật khẩu phải có ít nhất 6 ký tự');

  return { name, role, password, active, avatar };
}

function findProduct(state, productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) throw badRequest('Sản phẩm không tồn tại');
  return product;
}

function findImportProduct(state, payload) {
  const productNameKey = normalizeProductField(payload.productName);
  const sizeKey = normalizeProductField(payload.size);

  if (payload.productId) {
    const product = findProduct(state, payload.productId);
    if (normalizeProductField(product.size) === sizeKey) return product;
  }

  return state.products.find((item) => (
    normalizeProductField(item.name) === productNameKey &&
    normalizeProductField(item.size) === sizeKey
  ));
}

function normalizeProductField(value) {
  return sanitizeText(value).toLowerCase();
}

function findShop(state, shopId) {
  const shop = state.shops.find((item) => item.id === shopId);
  if (!shop) throw badRequest('Shop không tồn tại');
  return shop;
}

function findUser(state, userId) {
  const user = state.users.find((item) => item.id === userId);
  if (!user) throw badRequest('Tài khoản không tồn tại');
  return user;
}

function getDistribution(state, productId, shopId) {
  let distribution = state.distributions.find((item) => item.productId === productId && item.shopId === shopId);
  if (!distribution) {
    distribution = { id: createId('dist'), productId, shopId, quantity: 0 };
    state.distributions.push(distribution);
  }
  return distribution;
}

function calculateNetExportedForShop(state, productId, shopId) {
  return state.activityLogs.reduce((sum, log) => {
    const metadata = log.metadata || {};
    if (metadata.productId !== productId || metadata.shopId !== shopId) return sum;
    if (metadata.type === 'export') return sum + Number(metadata.quantity || 0);
    if (metadata.type === 'cancel-export') return sum - Number(metadata.quantity || 0);
    return sum;
  }, 0);
}

function createProductSku(name, sequence) {
  const prefix = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'SP';
  return `${prefix}-${String(sequence).padStart(3, '0')}`;
}

function enrichProduct(product, distributions, activityLogs = []) {
  const actualStock = calculateActualStock(product);
  const distributedStock = calculateDistributedStock(product.id, distributions);
  return {
    ...product,
    actualStock,
    distributedStock,
    availableForDistribution: Math.max(actualStock - distributedStock, 0),
    exportedByShop: calculateNetExportedByShop(activityLogs, product.id),
    allocations: distributions.filter((distribution) => distribution.productId === product.id && Number(distribution.quantity || 0) > 0),
  };
}

function calculateNetExportedByShop(activityLogs, productId) {
  const exportedByShop = {};
  activityLogs.forEach((log) => {
    const metadata = log.metadata || {};
    if (metadata.productId !== productId || !metadata.shopId) return;
    const quantity = Number(metadata.quantity || 0);
    if (metadata.type === 'export') exportedByShop[metadata.shopId] = (exportedByShop[metadata.shopId] || 0) + quantity;
    if (metadata.type === 'cancel-export') exportedByShop[metadata.shopId] = (exportedByShop[metadata.shopId] || 0) - quantity;
  });
  return Object.fromEntries(Object.entries(exportedByShop).filter(([, quantity]) => quantity > 0));
}

async function addLog(state, user, action, description, metadata = {}) {
  state.activityLogs.push({
    id: createId('log'),
    action,
    description: description.trim(),
    userId: user.id,
    userName: user.name,
    metadata,
    createdAt: new Date().toISOString(),
  });
}

function sanitizeUser(user) {
  const { passwordHash, email, ...safeUser } = user;
  return safeUser;
}

function permissionsForRole(role) {
  if (role === 'admin') return 'system:admin,inventory:read,inventory:write,shop:manage,user:manage,log:read';
  return 'inventory:import,inventory:export';
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash = '') {
  const [scheme, salt, expected] = passwordHash.split('$');
  if (scheme !== 'pbkdf2' || !salt || !expected) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
}

function signToken(payload) {
  const tokenPayload = {
    ...payload,
    exp: Date.now() + tokenMaxAgeMs,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const body = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token) {
  const [body, signature] = token.split('.');
  if (!body || !signature) throw unauthorized('Vui lòng đăng nhập');

  const expected = crypto.createHmac('sha256', authSecret).update(body).digest('base64url');
  if (signature.length !== expected.length) {
    throw unauthorized('Phiên đăng nhập không hợp lệ');
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw unauthorized('Phiên đăng nhập không hợp lệ');
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload.exp || Date.now() > payload.exp) throw unauthorized('Phiên đăng nhập đã hết hạn');
  return payload;
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function unauthorized(message) {
  const error = new Error(message);
  error.status = 401;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.status = 403;
  return error;
}

function asyncHandler(handler) {
  return (request, response, next) => Promise.resolve(handler(request, response, next)).catch(next);
}

