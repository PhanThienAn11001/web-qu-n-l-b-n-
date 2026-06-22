import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Boxes,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Menu,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Store,
  Trash2,
  UserCog,
  Users,
  Warehouse,
  X,
} from 'lucide-react';
import { Button } from './components/ui/Button.jsx';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/Card.jsx';
import { Input, Select } from './components/ui/Input.jsx';
import {
  cancelExportStock,
  createShop,
  createUser,
  deleteProduct,
  deleteShop,
  deleteUser,
  exportStock,
  getDashboard,
  importStock,
  login,
  updateProductImage,
  updateMyAvatar,
  updateShop,
  updateUser,
} from './lib/api.js';

const sectionConfig = {
  overview: { label: 'Tổng quan', icon: LayoutDashboard },
  inventory: { label: 'Tồn kho', icon: Boxes },
  statistics: { label: 'Thống kê', icon: BarChart3 },
  shops: { label: 'Shop', icon: Store, adminOnly: true },
  logs: { label: 'Nhật ký', icon: Activity, adminOnly: true },
  users: { label: 'Tài khoản', icon: ShieldCheck, adminOnly: true },
};

const formDefaults = {
  productId: '',
  productName: '',
  sku: '',
  shopId: '',
  quantity: '',
  size: '',
  note: '',
  image: '',
  fixableDefects: '',
  factoryReturnDefects: '',
  unfixableDefects: '',
};

const shopDefaults = { id: '', name: '', image: '' };
const userDefaults = { id: '', name: '', password: '', role: 'staff', active: true, avatar: '' };
const sizeOrder = ['xs', 's', 'm', 'l', 'xl'];

function compareProducts(a, b) {
  const nameCompare = a.name.localeCompare(b.name, 'vi', { sensitivity: 'base' });
  if (nameCompare) return nameCompare;

  const skuCompare = a.sku.localeCompare(b.sku, 'vi', { sensitivity: 'base' });
  if (skuCompare) return skuCompare;

  const aSize = String(a.size || '').trim().toLowerCase();
  const bSize = String(b.size || '').trim().toLowerCase();
  const aSizeIndex = sizeOrder.indexOf(aSize);
  const bSizeIndex = sizeOrder.indexOf(bSize);

  if (aSizeIndex !== -1 || bSizeIndex !== -1) {
    if (aSizeIndex === -1) return 1;
    if (bSizeIndex === -1) return -1;
    if (aSizeIndex !== bSizeIndex) return aSizeIndex - bSizeIndex;
  }

  return aSize.localeCompare(bSize, 'vi', { sensitivity: 'base' });
}

function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value || 0);
}

function productOptionLabel(product) {
  return product.size ? `${product.name} - Size ${product.size}` : product.name;
}

function findProductOption(products, value) {
  const keyword = value.trim().toLowerCase();
  const byLabel = products.find((product) => productOptionLabel(product).toLowerCase() === keyword);
  if (byLabel) return byLabel;

  const byName = products.filter((product) => product.name.toLowerCase() === keyword);
  return byName.length === 1 ? byName[0] : null;
}

function getShopsWithProduct(product, shops, mode = 'stock') {
  if (!product) return [];
  if (mode === 'stock') return Number(product.actualStock || 0) > 0 ? shops : [];
  return shops.filter((shop) => {
    if (mode === 'cancel') return Number(product.exportedByShop?.[shop.id] || 0) > 0;
    return true;
  });
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [currentUser, setCurrentUser] = useState(() => {
    const saved = localStorage.getItem('kho-viet-user');
    return saved ? JSON.parse(saved) : null;
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('kho-viet-token')));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loginForm, setLoginForm] = useState({ name: '', password: '' });
  const [importForm, setImportForm] = useState(formDefaults);
  const [exportForm, setExportForm] = useState(formDefaults);
  const [cancelForm, setCancelForm] = useState(formDefaults);
  const [shopForm, setShopForm] = useState(shopDefaults);
  const [userForm, setUserForm] = useState(userDefaults);
  const [query, setQuery] = useState('');
  const [importPanelOpen, setImportPanelOpen] = useState(false);
  const [exportPanelOpen, setExportPanelOpen] = useState(false);
  const [cancelPanelOpen, setCancelPanelOpen] = useState(false);

  const isAdmin = currentUser?.role === 'admin';
  const products = dashboard?.products || [];
  const shops = dashboard?.shops || [];
  const logs = dashboard?.activityLogs || [];
  const users = dashboard?.users || [];
  const navigation = Object.entries(sectionConfig).filter(([, item]) => !item.adminOnly || isAdmin);

  const filteredProducts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((product) => `${product.name} ${product.sku} ${product.size || ''}`.toLowerCase().includes(keyword));
  }, [products, query]);

  async function loadDashboard() {
    if (!localStorage.getItem('kho-viet-token')) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await getDashboard();
      setDashboard(data);
      setCurrentUser(data.currentUser);
      localStorage.setItem('kho-viet-user', JSON.stringify(data.currentUser));
    } catch (requestError) {
      setError(requestError.message);
      if (requestError.message.includes('đăng nhập') || requestError.message.includes('hết hạn')) logout();
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const session = await login(loginForm);
      localStorage.setItem('kho-viet-token', session.token);
      localStorage.setItem('kho-viet-user', JSON.stringify(session.user));
      setCurrentUser(session.user);
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  function logout() {
    localStorage.removeItem('kho-viet-token');
    localStorage.removeItem('kho-viet-user');
    setCurrentUser(null);
    setDashboard(null);
    setActiveSection('overview');
  }

  async function submitImportStock() {
    const payload = {
      productId: importForm.productId,
      productName: importForm.productName,
      sku: importForm.sku,
      quantity: Number(importForm.quantity),
      size: importForm.size,
      image: importForm.image,
      fixableDefects: Number(importForm.fixableDefects || 0),
      factoryReturnDefects: Number(importForm.factoryReturnDefects || 0),
      unfixableDefects: Number(importForm.unfixableDefects || 0),
    };
    return runAction(() => importStock(payload), () => setImportForm(formDefaults), 'Đã ghi nhận nhập kho');
  }

  async function submitInventoryAction(action, values, reset, message) {
    return runAction(
      () => action({ ...values, quantity: Number(values.quantity) }),
      () => reset(formDefaults),
      message,
    );
  }

  async function runAction(action, reset, successMessage) {
    setNotice('');
    setError('');
    try {
      await action();
      reset();
      if (successMessage) setNotice(successMessage);
      await loadDashboard();
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    }
  }

  async function saveProductImage(product, image) {
    await runAction(() => updateProductImage(product.id, image), () => {}, image ? 'Đã cập nhật ảnh sản phẩm' : 'Đã xóa ảnh sản phẩm');
  }

  async function removeProduct(product) {
    if (!window.confirm(`Xóa sản phẩm ${product.name}?`)) return;
    await runAction(() => deleteProduct(product.id), () => {}, '');
  }

  async function saveMyAvatar(avatar) {
    await runAction(() => updateMyAvatar(avatar), () => {}, '');
  }

  async function saveShop(event) {
    event.preventDefault();
    const payload = { name: shopForm.name, image: shopForm.image };
    await runAction(() => (shopForm.id ? updateShop(shopForm.id, payload) : createShop(payload)), () => setShopForm(shopDefaults), shopForm.id ? 'Đã cập nhật shop' : 'Đã thêm shop');
  }

  async function removeShop(shop) {
    if (!window.confirm(`Xóa ${shop.name}?`)) return;
    await runAction(() => deleteShop(shop.id), () => {}, '');
  }

  async function saveUser(event) {
    event.preventDefault();
    const payload = {
      name: userForm.name,
      password: userForm.password,
      role: userForm.role,
      avatar: userForm.avatar,
      ...(userForm.id ? { active: userForm.active } : {}),
    };
    if (!payload.password) delete payload.password;
    await runAction(() => (userForm.id ? updateUser(userForm.id, payload) : createUser(payload)), () => setUserForm(userDefaults), userForm.id ? 'Đã cập nhật tài khoản' : 'Đã thêm tài khoản');
  }

  async function removeUser(user) {
    if (!window.confirm(`Xóa tài khoản ${user.name}?`)) return;
    await runAction(() => deleteUser(user.id), () => {}, '');
  }

  const stats = dashboard?.stats || { totalActualStock: 0, totalShopStock: 0, shopCount: 0 };
  const salesStats = dashboard?.salesStats || { productRankings: [], shopRankings: [], events: [] };

  if (!currentUser) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50 p-4 text-slate-950">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
                <Warehouse size={22} />
              </div>
              <CardTitle>Đăng nhập</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(error || notice) && <AlertMessage error={error} notice={notice} />}
            <form className="mt-4 space-y-4" onSubmit={handleLogin}>
              <Field label="Tên đăng nhập">
                <Input value={loginForm.name} onChange={(event) => setLoginForm((current) => ({ ...current, name: event.target.value }))} />
              </Field>
              <Field label="Mật khẩu">
                <Input type="password" value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
              </Field>
              <Button className="w-full" type="submit">Đăng nhập</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><Warehouse size={20} /></div>
            <p className="text-sm font-bold text-slate-950">Kho</p>
          </div>
          <Button className="h-9 w-9 p-0 lg:hidden" variant="ghost" onClick={() => setSidebarOpen(false)} aria-label="Đóng menu"><X size={18} /></Button>
        </div>

        <nav className="space-y-1 p-4">
          {navigation.map(([key, item]) => {
            const Icon = item.icon;
            return (
              <button
                key={key}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${activeSection === key ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}
                onClick={() => {
                  setActiveSection(key);
                  setSidebarOpen(false);
                }}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-4">
          <div className="rounded-xl bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <SidebarAvatar image={currentUser.avatar} fallback={currentUser.name} onChange={saveMyAvatar} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-950">{currentUser.name}</p>
                <p className="text-xs text-slate-500">{isAdmin ? 'Admin' : 'Nhân viên'}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Button className="h-10 w-10 p-0 lg:hidden" variant="secondary" onClick={() => setSidebarOpen(true)} aria-label="Mở menu"><Menu size={18} /></Button>
              <h1 className="text-lg font-bold text-slate-950 sm:text-xl">{sectionConfig[activeSection].label}</h1>
            </div>
            <Button variant="secondary" onClick={logout}><LogOut size={16} />Đăng xuất</Button>
          </div>
        </header>

        <main className="space-y-6 p-4 sm:p-6 lg:p-8">
          {(error || notice) && <AlertMessage error={error} notice={notice} />}

          {activeSection === 'overview' && (
            <>
              <section className="grid gap-4 sm:grid-cols-3">
                <StatCard icon={PackageCheck} label="Tồn thực tế" value={formatNumber(stats.totalActualStock)} />
                <StatCard icon={Store} label="Shop đã bán" value={formatNumber(stats.totalShopStock)} />
                <StatCard icon={Warehouse} label="Số shop" value={formatNumber(stats.shopCount)} />
              </section>

              <section className={`grid gap-4 ${isAdmin ? 'xl:grid-cols-[2fr_0.67fr]' : ''}`}>
                <InventoryTable compact limit={6} loading={loading} products={filteredProducts} shops={shops} query={query} setQuery={setQuery} isAdmin={isAdmin} onSaveImage={saveProductImage} onDelete={removeProduct} />
                {isAdmin && <ActivityPanel compact logs={logs} />}
              </section>

              <div className="flex flex-wrap justify-center gap-5 py-3">
                <Button className="min-h-20 min-w-44 rounded-2xl px-8 text-lg" type="button" onClick={() => setImportPanelOpen(true)}><Plus size={32} />Nhập kho</Button>
                <Button className="min-h-20 min-w-44 rounded-2xl px-8 text-lg" type="button" onClick={() => setExportPanelOpen(true)}><ArrowUpFromLine size={32} />Xuất</Button>
                <Button className="min-h-20 min-w-44 rounded-2xl px-8 text-lg" type="button" onClick={() => setCancelPanelOpen(true)}><RotateCcw size={32} />Hủy xuất</Button>
              </div>
            </>
          )}

          {activeSection === 'inventory' && (
            <InventoryTable loading={loading} products={filteredProducts} shops={shops} query={query} setQuery={setQuery} isAdmin={isAdmin} onSaveImage={saveProductImage} onDelete={removeProduct} />
          )}
          {activeSection === 'statistics' && <SalesStatsPage salesStats={salesStats} shops={shops} />}
          {activeSection === 'shops' && isAdmin && <ShopManager shops={shops} products={products} form={shopForm} setForm={setShopForm} onSave={saveShop} onDelete={removeShop} />}
          {activeSection === 'logs' && isAdmin && <LogsPage logs={logs} shops={shops} products={products} />}
          {activeSection === 'users' && isAdmin && <UserManager users={users} currentUser={currentUser} form={userForm} setForm={setUserForm} onSave={saveUser} onDelete={removeUser} />}

          <ImportStockPanel products={products} values={importForm} setValues={setImportForm} open={importPanelOpen} setOpen={setImportPanelOpen} onSubmit={submitImportStock} />
          <InventoryActionModal title="Xuất" icon={ArrowUpFromLine} productLabel="Xuất sản phẩm nào" mode="stock" products={products} shops={shops} values={exportForm} setValues={setExportForm} open={exportPanelOpen} setOpen={setExportPanelOpen} onSubmit={() => submitInventoryAction(exportStock, exportForm, setExportForm, 'Đã ghi nhận xuất')} />
          <InventoryActionModal title="Hủy xuất" icon={RotateCcw} productLabel="Hủy xuất sản phẩm nào" mode="cancel" products={products} shops={shops} values={cancelForm} setValues={setCancelForm} open={cancelPanelOpen} setOpen={setCancelPanelOpen} onSubmit={() => submitInventoryAction(cancelExportStock, cancelForm, setCancelForm, 'Đã ghi nhận hủy xuất')} />
        </main>
      </div>
    </div>
  );
}

function AlertMessage({ error, notice }) {
  return <div className={`rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{error || notice}</div>;
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{value}</p>
        </div>
        <div className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={22} /></div>
      </div>
    </Card>
  );
}

function InventoryTable({ loading, products, shops, query, setQuery, isAdmin, onSaveImage, onDelete, compact = false, limit = null }) {
  const [expandedId, setExpandedId] = useState('');
  const sortedProducts = [...products].sort(compareProducts);
  const visibleProducts = limit ? sortedProducts.slice(0, limit) : sortedProducts;

  function updateImage(product, file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onSaveImage(product, reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <Card>
      <CardHeader className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${compact ? 'px-4 py-3' : ''}`}>
        <CardTitle>Tồn kho sản phẩm</CardTitle>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={18} />
          <Input className="pl-10" placeholder="Tìm sản phẩm hoặc SKU" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className={`w-full min-w-[980px] text-left ${compact ? 'text-xs' : 'text-sm'}`}>
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-5 py-3">Ảnh</th>
              <th className="px-5 py-3">Sản phẩm</th>
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">Size</th>
              <th className="px-5 py-3">Đã nhập</th>
              <th className="px-5 py-3">Tồn thực tế</th>
              <th className="px-5 py-3">Trạng thái</th>
              {isAdmin && <th className="px-5 py-3">Xóa</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-6 text-slate-500" colSpan={isAdmin ? 8 : 7}>Đang tải dữ liệu kho...</td></tr>
            ) : (
              visibleProducts.map((product) => (
                <Fragment key={product.id}>
                  <tr key={product.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setExpandedId(expandedId === product.id ? '' : product.id)}>
                    <td className={compact ? 'px-4 py-2' : 'px-5 py-4'}><ProductImage compact={compact} product={product} canEdit={isAdmin} onUpdate={updateImage} onRemove={() => onSaveImage(product, '')} /></td>
                    <td className={`${compact ? 'px-4 py-2' : 'px-5 py-4'} font-semibold text-slate-950`}>{product.name}</td>
                    <td className={`${compact ? 'px-4 py-2' : 'px-5 py-4'} text-slate-500`}>{product.sku}</td>
                    <td className={compact ? 'px-4 py-2' : 'px-5 py-4'}>{product.size || '-'}</td>
                    <td className={compact ? 'px-4 py-2' : 'px-5 py-4'}>{formatNumber(product.totalImported)}</td>
                    <td className={`${compact ? 'px-4 py-2' : 'px-5 py-4'} font-semibold`}>{formatNumber(product.actualStock)}</td>
                    <td className={compact ? 'px-4 py-2' : 'px-5 py-4'}><StockBadge stock={product.actualStock} /></td>
                    {isAdmin && (
                      <td className={compact ? 'px-4 py-2' : 'px-5 py-4'}>
                        <button
                          className="inline-grid h-10 w-10 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition hover:bg-red-100"
                          title="Xóa sản phẩm"
                          type="button"
                          onClick={(event) => { event.stopPropagation(); onDelete(product); }}
                          aria-label="Xóa sản phẩm"
                        >
                          <Trash2 size={22} strokeWidth={2.5} />
                        </button>
                      </td>
                    )}
                  </tr>
                  {expandedId === product.id && (
                    <tr key={`${product.id}-details`}>
                      <td className="bg-slate-50 px-5 py-4" colSpan={isAdmin ? 8 : 7}>
                        <AllocationStrip product={product} shops={shops} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ProductImage({ product, canEdit, onUpdate, onRemove, compact = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`grid flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white ${compact ? 'h-12 w-12' : 'h-[72px] w-[72px]'}`}>
        {product.image ? <img className="max-h-full max-w-full object-contain" src={product.image} alt={product.name} /> : <Boxes className="text-slate-400" size={18} />}
      </div>
      {canEdit && !compact && (
        <div className="flex flex-col gap-2">
          <label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-100" onClick={(event) => event.stopPropagation()}>
            Thêm
            <input className="hidden" accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => { onUpdate(product, event.target.files?.[0]); event.target.value = ''; }} />
          </label>
          {product.image && <button className="text-left text-xs font-semibold text-red-700" type="button" onClick={(event) => { event.stopPropagation(); onRemove(); }}>Xóa</button>}
        </div>
      )}
    </div>
  );
}

function AllocationStrip({ product, shops }) {
  const soldByShop = Object.entries(product.exportedByShop || {})
    .map(([shopId, quantity]) => ({ shopId, quantity: Number(quantity || 0), shop: shops.find((shop) => shop.id === shopId) }))
    .filter((item) => item.shop && item.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity || a.shop.name.localeCompare(b.shop.name, 'vi', { sensitivity: 'base' }));
  return (
    <div className="flex items-stretch gap-3 overflow-x-auto">
      {soldByShop.length ? soldByShop.map((item) => (
        <div key={item.shopId} className="min-w-[160px] rounded-xl border border-slate-200 bg-white p-3">
          <p className="font-semibold text-slate-950">{item.shop.name}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Đã bán</p>
          <p className="mt-2 text-2xl font-bold">{formatNumber(item.quantity)}</p>
        </div>
      )) : <p className="text-sm text-slate-500">Chưa có shop nào bán sản phẩm này.</p>}
      <div className="ml-auto min-w-[160px] rounded-xl border border-slate-300 bg-slate-950 p-3 text-white">
        <p className="text-sm">Tổng đã bán</p>
        <p className="mt-2 text-2xl font-bold">{formatNumber(product.soldStock)}</p>
      </div>
    </div>
  );
}

function StockBadge({ stock }) {
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stock > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-700'}`}>{stock > 0 ? 'Còn hàng' : 'Hết hàng'}</span>;
}

function ActivityPanel({ logs, compact = false }) {
  return (
    <Card>
      <CardHeader className={compact ? 'px-4 py-3' : ''}><CardTitle>Nhật ký hoạt động</CardTitle></CardHeader>
      <CardContent className={compact ? 'max-h-112 space-y-2 overflow-hidden p-3' : 'space-y-4'}>
        {logs.slice(0, compact ? 6 : 5).map((log) => <LogItem key={log.id} log={log} compact={compact} />)}
      </CardContent>
    </Card>
  );
}

function SalesStatsPage({ salesStats }) {
  const [period, setPeriod] = useState('day');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [selectedShopProductId, setSelectedShopProductId] = useState('');
  const products = salesStats.productRankings || [];
  const shops = salesStats.shopRankings || [];
  const selectedProduct = products.find((product) => product.productId === selectedProductId) || products[0];
  const selectedShop = shops.find((shop) => shop.shopId === selectedShopId) || shops[0];
  const shopProducts = selectedShop?.products || [];
  const selectedShopProduct = shopProducts.find((product) => product.productId === selectedShopProductId) || shopProducts[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-950">Thống kê bán hàng</h2>
        </div>
        <Select className="w-full sm:w-44" value={period} onChange={(event) => setPeriod(event.target.value)}>
          <option value="day">Theo ngày</option>
          <option value="week">Theo tuần</option>
          <option value="month">Theo tháng</option>
          <option value="year">Theo năm</option>
        </Select>
      </div>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <RankingPanel
          emptyText="Chưa có sản phẩm nào được bán."
          items={products}
          selectedId={selectedProduct?.productId || ''}
          title="Danh sách sản phẩm bán chạy nhất"
          onSelect={(item) => setSelectedProductId(item.productId)}
          getId={(item) => item.productId}
          renderTitle={(item) => productOptionLabel({ name: item.productName, size: item.size })}
          renderMeta={(item) => `SKU: ${item.sku || '-'}`}
        />
        <SalesChartCard
          title={selectedProduct ? productOptionLabel({ name: selectedProduct.productName, size: selectedProduct.size }) : 'Biểu đồ sản phẩm'}
          subtitle="Lượt bán của sản phẩm"
          events={salesStats.events || []}
          period={period}
          productId={selectedProduct?.productId}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <RankingPanel
          emptyText="Chưa có shop nào phát sinh bán hàng."
          items={shops}
          selectedId={selectedShop?.shopId || ''}
          title="Danh sách shop có lượt bán nhiều nhất"
          onSelect={(item) => {
            setSelectedShopId(item.shopId);
            setSelectedShopProductId('');
          }}
          getId={(item) => item.shopId}
          renderTitle={(item) => item.shopName}
          renderMeta={() => 'Tổng đã bán'}
        />
        <Card>
          <CardHeader>
            <CardTitle>{selectedShop ? `Sản phẩm đã bán tại ${selectedShop.shopName}` : 'Sản phẩm đã bán tại shop'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {shopProducts.map((product) => (
                <button
                  key={product.productId}
                  type="button"
                  className={`rounded-xl border p-3 text-left transition ${selectedShopProduct?.productId === product.productId ? 'border-slate-950 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                  onClick={() => setSelectedShopProductId(product.productId)}
                >
                  <p className="font-semibold text-slate-950">{productOptionLabel({ name: product.productName, size: product.size })}</p>
                  <p className="mt-1 text-sm text-slate-500">SKU: {product.sku || '-'}</p>
                  <p className="mt-2 text-xl font-bold">{formatNumber(product.quantity)}</p>
                </button>
              ))}
              {!shopProducts.length && <p className="text-sm text-slate-500">Shop này chưa bán sản phẩm nào.</p>}
            </div>
            <SalesLineChart
              events={salesStats.events || []}
              period={period}
              productId={selectedShopProduct?.productId}
              shopId={selectedShop?.shopId}
            />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RankingPanel({ title, items, selectedId, onSelect, getId, renderTitle, renderMeta, emptyText }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, index) => {
          const id = getId(item);
          return (
            <button
              key={id}
              type="button"
              className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${selectedId === id ? 'border-slate-950 bg-slate-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              onClick={() => onSelect(item)}
            >
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400">#{index + 1}</p>
                <p className="truncate font-semibold text-slate-950">{renderTitle(item)}</p>
                <p className="text-sm text-slate-500">{renderMeta(item)}</p>
              </div>
              <p className="text-2xl font-bold text-slate-950">{formatNumber(item.quantity)}</p>
            </button>
          );
        })}
        {!items.length && <p className="text-sm text-slate-500">{emptyText}</p>}
      </CardContent>
    </Card>
  );
}

function SalesChartCard({ title, subtitle, events, period, productId }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </CardHeader>
      <CardContent>
        <SalesLineChart events={events} period={period} productId={productId} />
      </CardContent>
    </Card>
  );
}

function SalesLineChart({ events, period, productId, shopId }) {
  const points = buildSalesSeries(events, { period, productId, shopId });
  if (!productId || !points.length) {
    return <div className="grid h-72 place-items-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500">Chưa có dữ liệu để vẽ biểu đồ.</div>;
  }

  const width = 720;
  const height = 280;
  const padding = 36;
  const maxValue = Math.max(...points.map((point) => point.value), 1);
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => ({
    ...point,
    x: points.length > 1 ? padding + index * xStep : width / 2,
    y: height - padding - (point.value / maxValue) * (height - padding * 2),
  }));
  const path = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-3">
      <svg className="min-w-[620px]" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Biểu đồ lượt bán">
        <line x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} stroke="#cbd5e1" />
        <line x1={padding} x2={padding} y1={padding} y2={height - padding} stroke="#cbd5e1" />
        {[0, 0.5, 1].map((ratio) => {
          const y = height - padding - ratio * (height - padding * 2);
          return (
            <g key={ratio}>
              <line x1={padding} x2={width - padding} y1={y} y2={y} stroke="#e2e8f0" />
              <text x={8} y={y + 4} fontSize="12" fill="#64748b">{formatNumber(Math.round(maxValue * ratio))}</text>
            </g>
          );
        })}
        <path d={path} fill="none" stroke="#0f172a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        {coordinates.map((point, index) => (
          <g key={point.key}>
            <circle cx={point.x} cy={point.y} fill="#0f172a" r="4" />
            <text x={point.x} y={point.y - 10} textAnchor="middle" fontSize="12" fontWeight="700" fill="#0f172a">{formatNumber(point.value)}</text>
            {(index === 0 || index === coordinates.length - 1 || coordinates.length <= 6) && (
              <text x={point.x} y={height - 10} textAnchor="middle" fontSize="11" fill="#64748b">{point.label}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function buildSalesSeries(events, { period, productId, shopId }) {
  const grouped = new Map();
  events
    .filter((event) => event.productId === productId && (!shopId || event.shopId === shopId))
    .forEach((event) => {
      const bucket = getPeriodBucket(event.createdAt, period);
      grouped.set(bucket.key, {
        key: bucket.key,
        label: bucket.label,
        value: (grouped.get(bucket.key)?.value || 0) + Number(event.quantity || 0),
      });
    });

  return [...grouped.values()]
    .filter((point) => point.value > 0)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function getPeriodBucket(value, period) {
  const date = new Date(value);
  const year = date.getFullYear();
  if (period === 'year') return { key: String(year), label: String(year) };
  if (period === 'month') {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return { key: `${year}-${month}`, label: `${month}/${year}` };
  }
  if (period === 'week') {
    const firstDay = new Date(year, 0, 1);
    const week = Math.ceil((((date - firstDay) / 86400000) + firstDay.getDay() + 1) / 7);
    return { key: `${year}-W${String(week).padStart(2, '0')}`, label: `T${week}/${year}` };
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return { key: `${year}-${month}-${day}`, label: `${day}/${month}` };
}

function InventoryActionModal({ title, icon: Icon, productLabel, mode = 'stock', products, shops, values, setValues, open, setOpen, onSubmit }) {
  if (!open) return null;
  const selectedProduct = products.find((product) => product.id === values.productId);
  const eligibleShops = getShopsWithProduct(selectedProduct, shops, mode);

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function updateProduct(value) {
    const product = findProductOption(products, value);
    setValues((current) => ({
      ...current,
      productName: value,
      productId: product?.id || '',
      sku: product?.sku || current.sku,
      size: product?.size || current.size,
      shopId: product ? (getShopsWithProduct(product, shops, mode)[0]?.id || '') : current.shopId,
    }));
  }

  return (
    <Modal onClose={() => setOpen(false)}>
      <form className="space-y-5 p-5" onSubmit={(event) => { event.preventDefault(); onSubmit().then((success) => { if (success) setOpen(false); }); }}>
        <ModalHeader icon={Icon} title={title} onClose={() => setOpen(false)} />
        <Field label={productLabel}>
          <Input list={`${title}-products`} required value={values.productName} onChange={(event) => updateProduct(event.target.value)} />
          <datalist id={`${title}-products`}>{products.map((product) => <option key={product.id} value={productOptionLabel(product)} />)}</datalist>
        </Field>
        <Field label="SKU">
          <Input required value={values.sku} onChange={(event) => updateValue('sku', event.target.value)} />
        </Field>
        <Field label="Bao nhiêu cái">
          <Input min="1" required type="number" value={values.quantity} onChange={(event) => updateValue('quantity', event.target.value.replace(/\D/g, ''))} />
        </Field>
        <Field label="Size">
          <Input value={values.size} onChange={(event) => updateValue('size', event.target.value)} />
        </Field>
        <Field label="Ở shop nào">
          <Select required value={values.shopId} onChange={(event) => updateValue('shopId', event.target.value)}>
            <option value="">Chọn shop</option>
            {eligibleShops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="submit" disabled={Boolean(values.productId) && eligibleShops.length === 0}>Lưu</Button>
        </div>
      </form>
    </Modal>
  );
}

function ImportStockPanel({ products, values, setValues, open, setOpen, onSubmit }) {
  const selectedProduct = products.find((product) => product.id === values.productId);
  const productName = selectedProduct ? productOptionLabel(selectedProduct) : values.productName || '';
  const previewImage = values.image || selectedProduct?.image || '';
  const quantity = Number(values.quantity || 0);
  const fixableDefects = Number(values.fixableDefects || 0);
  const factoryReturnDefects = Number(values.factoryReturnDefects || 0);
  const unfixableDefects = Number(values.unfixableDefects || 0);
  const actualImported = Math.max(quantity - factoryReturnDefects - unfixableDefects, 0);

  if (!open) return null;

  function updateValue(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function focusImportField(event, index) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const form = event.currentTarget.form;
    const next = form?.querySelector(`[data-import-nav="${index + direction}"]`);
    if (!next) return;
    event.preventDefault();
    next.focus();
    if (typeof next.select === 'function') next.select();
  }

  function updateProductName(value) {
    const product = findProductOption(products, value);
    setValues((current) => ({
      ...current,
      productName: product?.name || value,
      productId: product?.id || '',
      sku: product?.sku || current.sku,
      size: product?.size || current.size,
      image: product?.image || current.image || '',
    }));
  }

  function readImage(file) {
    if (!file) return updateValue('image', '');
    const reader = new FileReader();
    reader.onload = () => updateValue('image', reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <Modal onClose={() => setOpen(false)} wide>
      <form className="space-y-6 p-5" onSubmit={(event) => { event.preventDefault(); onSubmit().then((success) => { if (success) setOpen(false); }); }}>
        <ModalHeader icon={ArrowDownToLine} title="Nhập kho" onClose={() => setOpen(false)} />
        <div className="grid gap-4 md:grid-cols-5">
          <Field label="Sản phẩm"><Input data-import-nav="0" onKeyDown={(event) => focusImportField(event, 0)} list="import-products" required value={productName} onChange={(event) => updateProductName(event.target.value)} /><datalist id="import-products">{products.map((product) => <option key={product.id} value={productOptionLabel(product)} />)}</datalist></Field>
          <Field label="SKU"><Input data-import-nav="1" onKeyDown={(event) => focusImportField(event, 1)} value={values.sku} onChange={(event) => updateValue('sku', event.target.value)} /></Field>
          <Field label="Số lượng"><Input data-import-nav="2" onKeyDown={(event) => focusImportField(event, 2)} min="1" required type="number" value={values.quantity} onChange={(event) => updateValue('quantity', event.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Size"><Input data-import-nav="3" onKeyDown={(event) => focusImportField(event, 3)} value={values.size} onChange={(event) => updateValue('size', event.target.value)} /></Field>
          <Field label="Ảnh">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white">{previewImage ? <img className="h-full w-full object-cover" src={previewImage} alt={productName} /> : <ImageIcon className="text-slate-400" size={18} />}</div>
              <Input data-import-nav="4" onKeyDown={(event) => focusImportField(event, 4)} accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => readImage(event.target.files?.[0])} />
            </div>
          </Field>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Tự sửa"><Input min="0" type="number" value={values.fixableDefects} onChange={(event) => updateValue('fixableDefects', event.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Trả xưởng"><Input min="0" type="number" value={values.factoryReturnDefects} onChange={(event) => updateValue('factoryReturnDefects', event.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Không sửa"><Input min="0" type="number" value={values.unfixableDefects} onChange={(event) => updateValue('unfixableDefects', event.target.value.replace(/\D/g, ''))} /></Field>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="text-sm text-slate-500">Tổng thực tế</p><p className="mt-2 text-xl font-bold">{formatNumber(actualImported)}</p></div>
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
          <Button type="submit" disabled={fixableDefects + factoryReturnDefects + unfixableDefects > quantity}>Lưu</Button>
        </div>
      </form>
    </Modal>
  );
}

function LogsPage({ logs, shops, products }) {
  const [mode, setMode] = useState('history');
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id || '');
  const [period, setPeriod] = useState('day');
  const [detail, setDetail] = useState(null);
  const selectedShop = shops.find((shop) => shop.id === selectedShopId);
  const shopLogs = logs
    .filter((log) => ['import', 'export', 'cancel-export'].includes(log.metadata?.type) && (log.metadata?.shopId === selectedShopId || log.metadata?.shopIds?.includes(selectedShopId)))
    .map((log) => normalizeShopLog(log, selectedShopId, shops));
  const visibleLogs = mode === 'shop' ? filterLogsByPeriod(shopLogs, period) : logs;
  const summary = summarizeLogs(visibleLogs);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant={mode === 'history' ? 'primary' : 'secondary'} onClick={() => setMode('history')}>Xem lịch sử thao tác</Button>
        <Button type="button" variant={mode === 'shop' ? 'primary' : 'secondary'} onClick={() => setMode('shop')}>Xem nhập xuất các shop</Button>
      </div>
      {mode === 'shop' && (
        <div className="flex flex-wrap gap-2">
          {shops.map((shop) => <Button key={shop.id} type="button" variant={selectedShopId === shop.id ? 'primary' : 'secondary'} onClick={() => setSelectedShopId(shop.id)}>{shop.name}</Button>)}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{mode === 'shop' ? `Lịch sử nhập xuất: ${selectedShop?.name || ''}` : 'Toàn bộ lịch sử thao tác'}</CardTitle>
            {mode === 'shop' && <p className="mt-1 text-sm text-slate-500">Mặc định xem theo ngày.</p>}
          </div>
          {mode === 'shop' && (
            <Select className="w-full sm:w-44" value={period} onChange={(event) => setPeriod(event.target.value)}>
              <option value="day">Theo ngày</option>
              <option value="week">Theo tuần</option>
              <option value="month">Theo tháng</option>
              <option value="year">Theo năm</option>
            </Select>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'shop' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryBox label="Nhập" value={summary.import} tone="emerald" />
              <SummaryBox label="Xuất" value={summary.export} tone="sky" />
              <SummaryBox label="Hủy xuất" value={summary.cancel} tone="amber" />
            </div>
          )}
          <div className="space-y-3">
            {visibleLogs.map((log) => <LogItem key={log.id} log={log} large={mode === 'history'} onClick={() => setDetail(enrichLogDetail(log, products, shops))} />)}
          </div>
        </CardContent>
      </Card>
      {detail && <LogDetailModal log={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function LogItem({ log, onClick, large = false, compact = false }) {
  return (
    <button type="button" className={`flex w-full gap-3 rounded-xl text-left hover:bg-slate-50 ${large ? 'p-5' : compact ? 'p-1.5' : 'p-2'}`} onClick={onClick}>
      <ActionBadge action={log.action} type={log.metadata?.type} large={large} compact={compact} />
      <div>
        <p className={`${large ? 'text-2xl' : compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-950`}>{log.userName ? `${log.userName} ${actionVerb(log.metadata?.type, log.action)} sản phẩm` : log.action}</p>
        {!compact && <p className={`${large ? 'mt-2 text-xl' : 'text-sm'} text-slate-500`}>{log.description}</p>}
        <p className={`${large ? 'mt-3 text-lg' : compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'} font-semibold text-slate-500`}>Tài khoản: {log.userName || '-'}</p>
        <p className={`${large ? 'mt-2 text-base' : compact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'} text-slate-400`}>{new Date(log.createdAt).toLocaleString('vi-VN', { second: '2-digit', minute: '2-digit', hour: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
      </div>
    </button>
  );
}

function ActionBadge({ action, type, large = false, compact = false }) {
  const tone = type === 'import' ? 'bg-emerald-100 text-emerald-800' : type === 'export' ? 'bg-sky-100 text-sky-800' : type === 'cancel-export' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700';
  return <div className={`mt-1 grid place-items-center rounded-lg px-2 font-bold ${large ? 'h-16 min-w-36 text-xl' : compact ? 'h-7 min-w-14 text-[10px]' : 'h-9 min-w-20 text-xs'} ${tone}`}>{type ? action : <ClipboardList size={large ? 32 : compact ? 14 : 16} />}</div>;
}

function actionVerb(type, fallback) {
  if (type === 'import') return 'nhập';
  if (type === 'export') return 'xuất';
  if (type === 'cancel-export') return 'hủy xuất';
  return fallback.toLowerCase();
}

function SummaryBox({ label, value, tone }) {
  const colors = { emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200', sky: 'bg-sky-50 text-sky-800 border-sky-200', amber: 'bg-amber-50 text-amber-800 border-amber-200' };
  return <div className={`rounded-xl border p-4 ${colors[tone]}`}><p className="text-sm font-semibold">{label}</p><p className="mt-2 text-2xl font-bold">{formatNumber(value)}</p></div>;
}

function filterLogsByPeriod(logs, period) {
  const now = new Date();
  return logs.filter((log) => {
    const date = new Date(log.createdAt);
    if (period === 'day') return date.toDateString() === now.toDateString();
    if (period === 'week') return now - date <= 7 * 24 * 60 * 60 * 1000;
    if (period === 'month') return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    return date.getFullYear() === now.getFullYear();
  });
}

function summarizeLogs(logs) {
  return logs.reduce((sum, log) => {
    const quantity = Number(log.metadata?.quantity || 0);
    if (log.metadata?.type === 'import') sum.import += quantity;
    if (log.metadata?.type === 'export') sum.export += quantity;
    if (log.metadata?.type === 'cancel-export') sum.cancel += quantity;
    return sum;
  }, { import: 0, export: 0, cancel: 0 });
}

function normalizeShopLog(log, shopId, shops) {
  const shop = shops.find((item) => item.id === shopId);
  if (log.metadata?.type !== 'import') {
    return { ...log, metadata: { ...log.metadata, shopId, shopName: log.metadata?.shopName || shop?.name || '' } };
  }
  const allocation = log.metadata?.shopAllocations?.find((item) => item.shopId === shopId);
  return {
    ...log,
    metadata: {
      ...log.metadata,
      shopId,
      shopName: shop?.name || '',
      quantity: allocation?.quantity || 0,
    },
  };
}

function enrichLogDetail(log, products, shops) {
  const product = products.find((item) => item.id === log.metadata?.productId);
  const shop = shops.find((item) => item.id === log.metadata?.shopId) || shops.find((item) => log.metadata?.shopIds?.includes(item.id));
  return { ...log, product, shop };
}

function LogDetailModal({ log, onClose }) {
  const meta = log.metadata || {};
  return (
    <Modal onClose={onClose}>
      <div className="space-y-5 p-5">
        <ModalHeader icon={CalendarDays} title={log.action} onClose={onClose} />
        <div className="flex gap-4">
          <div className="grid h-24 w-24 flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
            {(meta.image || log.product?.image) ? <img className="max-h-full max-w-full object-contain" src={meta.image || log.product.image} alt={meta.productName || log.product?.name} /> : <ImageIcon className="text-slate-400" />}
          </div>
          <div className="grid gap-2 text-sm">
            <p><span className="font-semibold">Tên sản phẩm:</span> {meta.productName || log.product?.name || '-'}</p>
            <p><span className="font-semibold">SKU:</span> {meta.sku || log.product?.sku || '-'}</p>
            <p><span className="font-semibold">Bao nhiêu cái:</span> {formatNumber(meta.quantity)}</p>
            <p><span className="font-semibold">Size:</span> {meta.size || log.product?.size || '-'}</p>
            <p><span className="font-semibold">Ở shop nào:</span> {meta.shopName || log.shop?.name || '-'}</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ShopManager({ shops, products, form, setForm, onSave, onDelete }) {
  const [selectedShopId, setSelectedShopId] = useState(shops[0]?.id || '');
  const [formOpen, setFormOpen] = useState(false);
  const selectedShop = shops.find((shop) => shop.id === selectedShopId);
  const shopProducts = products
    .map((product) => ({ ...product, shopQuantity: Number(product.exportedByShop?.[selectedShopId] || 0) }))
    .filter((product) => product.shopQuantity > 0)
    .sort((a, b) => b.shopQuantity - a.shopQuantity || compareProducts(a, b));
  const shopStockById = new Map(shops.map((shop) => [
    shop.id,
    products.reduce((sum, product) => sum + Number(product.exportedByShop?.[shop.id] || 0), 0),
  ]));

  function startEdit(shop) {
    setForm(shop);
    setFormOpen(true);
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end"><Button type="button" onClick={() => { setForm(shopDefaults); setFormOpen(true); }}><Plus size={16} />Thêm shop</Button></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shops.map((shop) => (
          <button key={shop.id} type="button" className={`overflow-hidden rounded-xl border bg-white text-left shadow-sm ${selectedShopId === shop.id ? 'border-slate-950' : 'border-slate-200'}`} onClick={() => setSelectedShopId(shop.id)}>
            <div className="grid aspect-[5/2] place-items-center bg-slate-100">{shop.image ? <img className="h-full w-full object-cover" src={shop.image} alt={shop.name} /> : <Store className="text-slate-400" />}</div>
            <div className="flex items-center justify-between gap-3 p-4">
              <div><p className="font-semibold">{shop.name}</p><p className="text-sm text-slate-500">Đã bán: {formatNumber(shopStockById.get(shop.id) || 0)}</p></div>
              <div className="flex gap-2">
                <Button className="h-9 px-3" type="button" variant="secondary" onClick={(event) => { event.stopPropagation(); startEdit(shop); }}><Pencil size={16} />Sửa</Button>
                <Button className="h-9 px-3 border-red-200 text-red-700 hover:bg-red-50" type="button" variant="secondary" onClick={(event) => { event.stopPropagation(); onDelete(shop); }}><Trash2 size={16} />Xóa</Button>
              </div>
            </div>
          </button>
        ))}
      </div>
      {selectedShop && (
        <Card>
          <CardHeader><CardTitle>Sản phẩm đã bán trong {selectedShop.name}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {shopProducts.map((product) => <ShopProductCard key={product.id} product={product} />)}
              {!shopProducts.length && <p className="text-sm text-slate-500">Shop này chưa bán sản phẩm nào.</p>}
            </div>
          </CardContent>
        </Card>
      )}
      {formOpen && <ShopFormModal form={form} setForm={setForm} onSave={onSave} onClose={() => setFormOpen(false)} />}
    </div>
  );
}

function ShopProductCard({ product }) {
  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <div className="grid h-20 w-20 flex-none place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{product.image ? <img className="max-h-full max-w-full object-contain" src={product.image} alt={product.name} /> : <Boxes className="text-slate-400" />}</div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-slate-950">{product.name}</p>
        <p className="text-slate-500">SKU: {product.sku}</p>
        <p>Đã bán: {formatNumber(product.shopQuantity)}</p>
        <p>Size: {product.size || '-'}</p>
      </div>
    </div>
  );
}

function ShopFormModal({ form, setForm, onSave, onClose }) {
  return (
    <Modal onClose={onClose}>
      <form className="space-y-4 p-5" onSubmit={(event) => { onSave(event).then?.(() => onClose()); }}>
        <ModalHeader icon={Store} title={form.id ? 'Sửa shop' : 'Thêm shop'} onClose={onClose} />
        <Field label="Tên shop"><Input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
        <ImageField label="Hình ảnh shop" image={form.image} onChange={(image) => setForm((current) => ({ ...current, image }))} />
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4"><Button type="button" variant="secondary" onClick={onClose}>Hủy</Button><Button type="submit">Lưu</Button></div>
      </form>
    </Modal>
  );
}

function UserManager({ users, currentUser, form, setForm, onSave, onDelete }) {
  return (
    <section className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader><CardTitle>{form.id ? 'Sửa tài khoản' : 'Thêm tài khoản'}</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSave}>
            <ImageField label="Ảnh đại diện" image={form.avatar} onChange={(avatar) => setForm((current) => ({ ...current, avatar }))} />
            <Field label="Tên"><Input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></Field>
            <Field label={form.id ? 'Mật khẩu mới' : 'Mật khẩu'}><Input required={!form.id} type="password" minLength="6" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} /></Field>
            <Field label="Quyền"><Select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}><option value="staff">Tài khoản con</option><option value="admin">Admin</option></Select></Field>
            {form.id && <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.active} onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))} />Cho phép đăng nhập</label>}
            <div className="flex gap-2"><Button type="submit"><UserCog size={16} />{form.id ? 'Lưu tài khoản' : 'Thêm tài khoản'}</Button>{form.id && <Button type="button" variant="secondary" onClick={() => setForm(userDefaults)}>Hủy</Button>}</div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Danh sách tài khoản</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Tài khoản</th><th className="px-5 py-3">Quyền</th><th className="px-5 py-3">Trạng thái</th><th className="px-5 py-3">Thao tác</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-5 py-4"><div className="flex items-center gap-3"><Avatar image={user.avatar} fallback={user.name} size="sm" /><p className="font-semibold">{user.name}</p></div></td>
                  <td className="px-5 py-4">{user.role === 'admin' ? 'Admin' : 'Tài khoản con'}</td>
                  <td className="px-5 py-4">{user.active === false ? 'Đã khóa' : 'Đang hoạt động'}</td>
                  <td className="px-5 py-4"><div className="flex gap-2"><Button className="h-9 px-3" type="button" variant="secondary" onClick={() => setForm({ ...user, password: '' })}><Pencil size={16} />Sửa</Button><Button className="h-9 px-3 border-red-200 text-red-700 hover:bg-red-50" type="button" variant="secondary" onClick={() => onDelete(user)} disabled={user.id === currentUser.id}><Trash2 size={16} />Xóa</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}

function ImageField({ label, image, onChange }) {
  function readImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">{image ? <img className="h-full w-full object-cover" src={image} alt="" /> : <ImageIcon className="text-slate-400" size={18} />}</div>
        <Input accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => readImage(event.target.files?.[0])} />
        {image && <Button className="border-red-200 text-red-700 hover:bg-red-50" type="button" variant="secondary" onClick={() => onChange('')}><Trash2 size={16} /></Button>}
      </div>
    </Field>
  );
}

function SidebarAvatar({ image, fallback, onChange }) {
  function readImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result);
    reader.readAsDataURL(file);
  }

  return (
    <label className="cursor-pointer" title="Đổi ảnh đại diện">
      <Avatar image={image} fallback={fallback} size="sm" />
      <input
        className="hidden"
        accept="image/png,image/jpeg,image/webp"
        type="file"
        onChange={(event) => {
          readImage(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
  );
}

function Avatar({ image, fallback, size = 'md' }) {
  const classes = size === 'sm' ? 'h-9 w-9' : 'h-12 w-12';
  return <div className={`grid ${classes} flex-none place-items-center overflow-hidden rounded-full bg-white text-sm font-bold text-slate-700 shadow-sm`}>{image ? <img className="h-full w-full object-cover" src={image} alt={fallback} /> : <Users size={18} />}</div>;
}

function Modal({ children, onClose, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={onClose}>
      <div className={`max-h-[92vh] w-full overflow-y-auto rounded-xl bg-white shadow-sm ${wide ? 'max-w-5xl' : 'max-w-xl'}`} onMouseDown={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ icon: Icon, title, onClose }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Icon size={18} /></div><CardTitle>{title}</CardTitle></div>
      <Button className="h-9 w-9 p-0" type="button" variant="ghost" onClick={onClose} aria-label="Đóng"><X size={18} /></Button>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block space-y-2"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

export default App;

