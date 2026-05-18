const STORAGE_KEY = "wine-order-count-static-v1";
const STORE_STORAGE_PREFIX = "wineAppState_store";
const STORE_REGISTRY_KEY = "wine-order-count-store-registry-v1";
const DEFAULT_STORE_KEY = "defaultStoreNumber";
const UNSELECTED_STORE_CACHE_KEY = "__unselected__";
const GLOBAL_CUSTOM_PRODUCTS_KEY = "wine-order-count-global-custom-products-v1";
const GLOBAL_PRODUCT_STORE_NUMBER = "__global_product_catalog__";
const SUPABASE_SAVE_DEBOUNCE_MS = 750;
const SUPABASE_URL = "https://bhuwrwqkwuuzjomskjky.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_iiViQ666fswJ84JaNeNIiw_pHHWR_8A";
const DEFAULT_TARGET_WEEKS = 2;
const SKU_HEADER_ALIASES = [
  "jde",
  "sku",
  "upc",
  "jde/upc",
  "jde/upc #",
  "jde upc",
  "jde upc #",
  "jde #",
  "upc #",
  "sku #",
  "item number",
  "product number",
  "sku / id",
  "sku/id",
  "id",
  "barcode",
  "product code",
];

const CATEGORY_CONFIG = CATEGORY_ORDER.map(name => ({
  name,
  upcs: PRODUCT_CATALOG
    .filter(product => product.category === name)
    .map(product => product.sku),
}));

const categoryByUpc = new Map();
const orderByUpc = new Map();
CATEGORY_CONFIG.forEach((category, categoryIndex) => {
  category.upcs.forEach((upc, itemIndex) => {
    const key = normalizeUpc(upc);
    categoryByUpc.set(key, { name: category.name, categoryIndex, itemIndex });
    orderByUpc.set(key, `${String(categoryIndex).padStart(2, "0")}:${String(itemIndex).padStart(3, "0")}`);
  });
});

const dom = {
  salesInput: document.getElementById("salesFileInput"),
  inventoryInput: document.getElementById("inventoryFileInput"),
  uploadSalesButton: document.getElementById("uploadSalesButton"),
  uploadInventoryButton: document.getElementById("uploadInventoryButton"),
  storeSelect: document.getElementById("storeSelect"),
  addStoreButton: document.getElementById("addStoreButton"),
  refreshStoresButton: document.getElementById("refreshStoresButton"),
  reloadStoreButton: document.getElementById("reloadStoreButton"),
  settingsReloadStoreButton: document.getElementById("settingsReloadStoreButton"),
  currentStoreText: document.getElementById("currentStoreText"),
  syncStatusText: document.getElementById("syncStatusText"),
  saveProgressButton: document.getElementById("saveProgressButton"),
  exportInventoryButton: document.getElementById("exportInventoryButton"),
  exportOrdersButton: document.getElementById("exportOrdersButton"),
  settingsButton: document.getElementById("settingsButton"),
  addProductButton: document.getElementById("addProductButton"),
  statusBanner: document.getElementById("statusBanner"),
  lastSavedText: document.getElementById("lastSavedText"),
  inventorySearchInput: document.getElementById("inventorySearchInput"),
  clearInventorySearchButton: document.getElementById("clearInventorySearchButton"),
  inventorySummary: document.getElementById("inventorySummary"),
  orderingSummary: document.getElementById("orderingSummary"),
  inventoryTable: document.getElementById("inventoryTable"),
  orderingTable: document.getElementById("orderingTable"),
  unmatchedList: document.getElementById("unmatchedList"),
  applyDeductionButton: document.getElementById("applyDeductionButton"),
  sortOrderingBySalesToggle: document.getElementById("sortOrderingBySalesToggle"),
  deductionStatus: document.getElementById("deductionStatus"),
  toast: document.getElementById("toast"),
  targetWeeksInput: document.getElementById("targetWeeksInput"),
  settingsCurrentStoreText: document.getElementById("settingsCurrentStoreText"),
  defaultStoreText: document.getElementById("defaultStoreText"),
  makeDefaultStoreButton: document.getElementById("makeDefaultStoreButton"),
  clearDefaultStoreButton: document.getElementById("clearDefaultStoreButton"),
  clearSalesButton: document.getElementById("clearSalesButton"),
  clearStockHistoryButton: document.getElementById("clearStockHistoryButton"),
  clearInventoryButton: document.getElementById("clearInventoryButton"),
  clearSaleFlagsButton: document.getElementById("clearSaleFlagsButton"),
  restoreDeletedItemsButton: document.getElementById("restoreDeletedItemsButton"),
  clearAllButton: document.getElementById("clearAllButton"),
  clearAppCacheButton: document.getElementById("clearAppCacheButton"),
  helpGuideButton: document.getElementById("helpGuideButton"),
  saleOnlyToggle: document.getElementById("saleOnlyToggle"),
  settingsExportInventoryButton: document.getElementById("settingsExportInventoryButton"),
  settingsExportOrdersButton: document.getElementById("settingsExportOrdersButton"),
  historyModal: document.getElementById("historyModal"),
  historyModalBody: document.getElementById("historyModalBody"),
  closeHistoryModalButton: document.getElementById("closeHistoryModalButton"),
};

let storeRegistry = loadStoreRegistry();
let currentStoreNumber = storeRegistry.currentStore;
let globalCustomProducts = loadLocalGlobalCustomProducts();
let globalSaleFlags = {};
let globalSaleTableAvailable = true;
let state = defaultState();
let saveTimer = null;
let supabaseSaveTimer = null;
let editingProductId = null;
const transferringProductIds = new Set();
let syncStatus = "Local backup saved";
let isSwitchingStore = false;
let supabaseClientPromise = null;
let currentStoreChannel = null;
let currentSaleStatusChannel = null;
let saleClearInProgress = false;
let stockHistoryClearInProgress = false;

bindEvents();
render();
registerServiceWorker();
initializeSupabaseSync();

function defaultState() {
  return {
    storeNumber: currentStoreNumber || "",
    inventory: { products: catalogProducts() },
    productOverrides: {},
    deletedItems: [],
    skuAliases: {},
    uploads: {
      sales: null,
      inventory: null,
    },
    sales: { sessions: [], activeSessionId: null },
    processing: {
      matched: [],
      unmatched: [],
      deductions: [],
      recommendations: [],
    },
    inventoryHistory: [],
    stockHistoryClearedAt: null,
    settings: {
      targetWeeks: DEFAULT_TARGET_WEEKS,
      showSaleOnly: false,
      inventorySearch: "",
      sortOrderingBySales: false,
    },
    lastSaved: null,
  };
}

function loadLocalGlobalCustomProducts() {
  try {
    return normalizeCustomProducts(JSON.parse(localStorage.getItem(GLOBAL_CUSTOM_PRODUCTS_KEY) || "[]"));
  } catch {
    return [];
  }
}

function saveLocalGlobalCustomProducts() {
  localStorage.setItem(GLOBAL_CUSTOM_PRODUCTS_KEY, JSON.stringify(globalCustomProducts));
}

function normalizeCustomProducts(products = []) {
  const seen = new Set();
  return (products || [])
    .map((product, index) => {
      const sku = normalizeUpc(product?.sku || product?.id || product?.sourceSku);
      const description = cleanText(product?.description || product?.name || product?.productName);
      if (!sku || !description || seen.has(sku)) return null;
      seen.add(sku);
      const category = CATEGORY_ORDER.includes(product?.category) ? product.category : "Other Products";
      return {
        sku,
        description,
        category,
        orderIndex: Number.isFinite(Number(product?.orderIndex)) ? Number(product.orderIndex) : index,
        createdAt: product?.createdAt || new Date().toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aCategory = CATEGORY_ORDER.indexOf(a.category);
      const bCategory = CATEGORY_ORDER.indexOf(b.category);
      const aCategoryOrder = aCategory >= 0 ? aCategory : 99;
      const bCategoryOrder = bCategory >= 0 ? bCategory : 99;
      if (aCategoryOrder !== bCategoryOrder) return aCategoryOrder - bCategoryOrder;
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return a.description.localeCompare(b.description);
    });
}

function loadStoreRegistry() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_REGISTRY_KEY) || "{}");
    const stores = [...new Set((parsed.stores || []).map(cleanText).filter(Boolean))];
    const defaultStore = getDefaultStoreNumber();
    const currentStore = defaultStore || "";
    if (currentStore && !stores.includes(currentStore)) stores.unshift(currentStore);
    return { stores, currentStore };
  } catch {
    const defaultStore = getDefaultStoreNumber();
    return {
      stores: defaultStore ? [defaultStore] : [],
      currentStore: defaultStore || "",
    };
  }
}

function saveStoreRegistry() {
  const stores = [...new Set((storeRegistry.stores || []).map(cleanText).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  localStorage.setItem(STORE_REGISTRY_KEY, JSON.stringify({
    stores,
    currentStore: cleanText(currentStoreNumber),
  }));
}

function getDefaultStoreNumber() {
  return cleanText(localStorage.getItem(DEFAULT_STORE_KEY));
}

function storageKeyForStore(storeNumber) {
  const safeStore = encodeURIComponent(cleanText(storeNumber) || UNSELECTED_STORE_CACHE_KEY);
  return `${STORE_STORAGE_PREFIX}_${safeStore}`;
}

function migrateLegacyStorageIfNeeded(storeNumber) {
  if (!cleanText(storeNumber)) return;
  const storeKey = storageKeyForStore(storeNumber);
  if (localStorage.getItem(storeKey)) return;
  const oldStoreKey = `${STORAGE_KEY}_store_${encodeURIComponent(cleanText(storeNumber))}`;
  const legacyState = localStorage.getItem(oldStoreKey);
  if (legacyState) localStorage.setItem(storeKey, legacyState);
}

async function getSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm")
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return supabaseClientPromise;
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

async function getSupabaseStoreState(storeNumber) {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("store_app_state")
    .select("app_state, updated_at")
    .eq("store_number", String(storeNumber))
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data?.app_state ? { ...data.app_state, supabaseUpdatedAt: data.updated_at } : null;
}

async function loadSupabaseStores() {
  console.log("Loading stores...");
  const supabase = await getSupabaseClient();
  const { data: storeRows, error: storeError } = await supabase
    .from("stores")
    .select("*")
    .order("store_number", { ascending: true });
  console.log("Stores result:", { data: storeRows, error: storeError });
  if (storeError) {
    console.error("Failed to load stores:", storeError);
    throw storeError;
  }

  let appStateRows = [];
  const { data, error: appStateError } = await supabase
    .from("store_app_state")
    .select("store_number")
    .order("store_number", { ascending: true });
  if (appStateError) {
    console.error("Failed to load store_app_state store numbers; continuing with stores table only:", appStateError);
  } else {
    appStateRows = data || [];
  }

  const stores = [...new Set([
    ...(storeRows || []).map(row => cleanText(row.store_number)),
    ...(appStateRows || []).map(row => cleanText(row.store_number)),
  ].filter(storeNumber => storeNumber && !isInternalStoreNumber(storeNumber)))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  console.log("Stores loaded:", stores);
  return stores;
}

async function upsertSupabaseStore(storeNumber) {
  const supabase = await getSupabaseClient();
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("stores")
    .upsert({
      store_number: String(storeNumber),
      updated_at: updatedAt,
    });
  if (error) throw error;
}

function isInternalStoreNumber(storeNumber) {
  const text = cleanText(storeNumber);
  return text === GLOBAL_PRODUCT_STORE_NUMBER || /^__.*__$/.test(text);
}

async function loadGlobalCustomProductsFromCloud() {
  const remoteState = await getSupabaseStoreState(GLOBAL_PRODUCT_STORE_NUMBER);
  return normalizeCustomProducts(remoteState?.customProducts || remoteState?.products || []);
}

async function refreshGlobalCustomProducts({ silent = false } = {}) {
  try {
    const remoteProducts = await withTimeout(loadGlobalCustomProductsFromCloud(), 7000, "Product list loading timed out");
    if (remoteProducts.length || !globalCustomProducts.length) {
      globalCustomProducts = normalizeCustomProducts([...globalCustomProducts, ...remoteProducts]);
      saveLocalGlobalCustomProducts();
    }
    state.inventory.products = mergeProductsWithCatalog(state.inventory?.products || [], state);
    if (!silent) {
      render();
      showToast("Product list refreshed.");
    }
    return true;
  } catch (error) {
    console.warn("Shared product list could not be loaded; using local product list.", error);
    globalCustomProducts = loadLocalGlobalCustomProducts();
    state.inventory.products = mergeProductsWithCatalog(state.inventory?.products || [], state);
    return false;
  }
}

async function saveGlobalCustomProductsToCloud() {
  saveLocalGlobalCustomProducts();
  const supabase = await getSupabaseClient();
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from("store_app_state")
    .upsert({
      store_number: GLOBAL_PRODUCT_STORE_NUMBER,
      app_state: {
        customProducts: globalCustomProducts,
        updatedAt,
      },
      updated_at: updatedAt,
    });
  if (error) throw error;
}

async function loadSupabaseGlobalSaleFlags() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("global_product_sale_status")
    .select("product_id, on_sale, updated_at");
  if (error) {
    if (isMissingSupabaseTableError(error, "global_product_sale_status")) {
      globalSaleTableAvailable = false;
    }
    throw error;
  }
  globalSaleTableAvailable = true;
  return Object.fromEntries((data || [])
    .map(row => [normalizeUpc(row.product_id), row.on_sale === true])
    .filter(([productId]) => productId));
}

async function refreshGlobalSaleFlagsFromSupabase({ silent = false } = {}) {
  try {
    globalSaleFlags = await loadSupabaseGlobalSaleFlags();
    if (globalSaleTableAvailable && !Object.keys(globalSaleFlags).length) {
      await seedGlobalSaleFlagsFromStoreStates();
    }
    applyGlobalSaleFlagsToState();
    return true;
  } catch (error) {
    console.error("Global sale status load failed:", error);
    if (isMissingSupabaseTableError(error, "global_product_sale_status")) {
      globalSaleTableAvailable = false;
      await loadGlobalSaleFlagsFromStoreStates();
      if (!silent) {
        setStatus("Global sale status table is missing. Using synced store sale flags for now.", true);
      }
      applyGlobalSaleFlagsToState();
      return true;
    } else if (!silent) {
      showSupabaseError(error);
    }
    return false;
  }
}

async function loadGlobalSaleFlagsFromStoreStates() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("store_app_state")
    .select("app_state");
  if (error) {
    console.error("Failed to load fallback sale flags from store states:", error);
    throw error;
  }

  const flags = {};
  for (const row of data || []) {
    for (const [key, value] of Object.entries(row.app_state?.saleFlags || {})) {
      const normalizedKey = normalizeUpc(key);
      if (normalizedKey && value === true) flags[normalizedKey] = true;
    }
    const products = row.app_state?.inventory?.products || row.app_state?.inventoryData?.products || [];
    for (const product of products) {
      if (product?.onSale !== true) continue;
      const productId = saleStatusKey(product);
      if (productId) flags[productId] = true;
    }
  }
  globalSaleFlags = flags;
  return flags;
}

async function seedGlobalSaleFlagsFromStoreStates() {
  const supabase = await getSupabaseClient();
  const { data, error } = await supabase
    .from("store_app_state")
    .select("app_state");
  if (error) {
    console.error("Failed to seed global sale status from store states:", error);
    return;
  }

  const saleRows = new Map();
  for (const row of data || []) {
    const products = row.app_state?.inventory?.products || row.app_state?.inventoryData?.products || [];
    for (const product of products) {
      if (product?.onSale !== true) continue;
      const productId = saleStatusKey(product);
      if (productId) saleRows.set(productId, {
        product_id: productId,
        on_sale: true,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (!saleRows.size) return;
  const { error: upsertError } = await supabase
    .from("global_product_sale_status")
    .upsert([...saleRows.values()]);
  if (upsertError) {
    console.error("Failed to seed global sale status rows:", upsertError);
    return;
  }
  globalSaleFlags = Object.fromEntries([...saleRows.keys()].map(productId => [productId, true]));
}

async function saveGlobalSaleStatus(product, onSale, { silent = false } = {}) {
  const productId = saleStatusKey(product);
  if (!productId) return false;
  const updatedAt = new Date().toISOString();
  console.log("Toggling sale globally:", { productId, sku: product.id, newSaleStatus: onSale === true });
  globalSaleFlags[productId] = onSale === true;
  applyGlobalSaleFlagsToState();
  recalculateRecommendations();
  render();
  if (!globalSaleTableAvailable) {
    return saveGlobalSaleStatusFallback(productId, onSale, updatedAt, { silent });
  }
  try {
    const supabase = await getSupabaseClient();
    const { error } = await supabase
      .from("global_product_sale_status")
      .upsert({
        product_id: productId,
        on_sale: onSale === true,
        sale_price: null,
        sale_note: null,
        sale_start: null,
        sale_end: null,
        updated_at: updatedAt,
      });
    console.log("Sale update result:", { data: null, error });
    if (error) throw error;
    await updateAllStoreStateSaleFlags(productId, onSale, updatedAt);
    setSyncStatus("Sale status synced");
    if (!silent) setStatus(`${productId} sale status updated globally.`);
    return true;
  } catch (error) {
    console.log("Sale update result:", { data: null, error });
    if (isMissingSupabaseTableError(error, "global_product_sale_status")) {
      globalSaleTableAvailable = false;
      return saveGlobalSaleStatusFallback(productId, onSale, updatedAt, { silent });
    }
    console.error("Global sale status save failed:", error);
    setSyncStatus("Sync failed");
    showSupabaseError(error);
    return false;
  }
}

async function saveGlobalSaleStatusFallback(productId, onSale, updatedAt, { silent = false } = {}) {
  try {
    await updateAllStoreStateSaleFlags(productId, onSale, updatedAt);
    setSyncStatus("Sale status synced");
    if (!silent) setStatus(`${productId} sale status updated across stores.`);
    return true;
  } catch (error) {
    console.error("Global sale status fallback save failed:", error);
    setSyncStatus("Sync failed");
    showSupabaseError(error);
    return false;
  }
}

async function updateAllStoreStateSaleFlags(productId, onSale, updatedAt = new Date().toISOString()) {
  const supabase = await getSupabaseClient();
  const { data: storeRows, error: storeError } = await supabase
    .from("stores")
    .select("store_number");
  if (storeError) {
    console.error("Failed to load stores for global sale update:", storeError);
  }

  const { data, error } = await supabase
    .from("store_app_state")
    .select("store_number, app_state");
  if (error) {
    console.error("Failed to load store states for global sale fallback:", error);
    throw error;
  }

  const target = normalizeUpc(productId);
  const appStateByStore = new Map((data || []).map(row => [cleanText(row.store_number), row.app_state || {}]));
  for (const store of storeRows || []) {
    const storeNumber = cleanText(store.store_number);
    if (storeNumber && !appStateByStore.has(storeNumber)) {
      appStateByStore.set(storeNumber, defaultStoreAppStateForSaleSync(storeNumber));
    }
  }
  const rowsToSave = [];
  for (const [storeNumber, appState] of appStateByStore.entries()) {
    const products = appState.inventory?.products || appState.inventoryData?.products || appState.inventoryFileData?.products || [];
    let changed = false;
    for (const product of products) {
      const keys = saleStatusKeys(product);
      if (keys.includes(target)) {
        setProductSaleFields(product, onSale === true);
        product.lastUpdated = product.lastUpdated || updatedAt;
        changed = true;
      }
    }
    if (!appState.saleFlags) appState.saleFlags = {};
    const currentFlag = appState.saleFlags[target] === true;
    if (currentFlag !== (onSale === true)) {
      if (onSale === true) {
        appState.saleFlags[target] = true;
      } else {
        delete appState.saleFlags[target];
      }
      changed = true;
    }
    if (changed) {
      appState.updatedAt = updatedAt;
      appState.lastUpdated = updatedAt;
      rowsToSave.push({
        store_number: storeNumber,
        app_state: appState,
        updated_at: updatedAt,
      });
    }
  }

  if (!rowsToSave.length) return;
  const { error: upsertError } = await supabase
    .from("store_app_state")
    .upsert(rowsToSave);
  console.log("Sale update result:", { table: "store_app_state", rows: rowsToSave.length, error: upsertError });
  if (upsertError) {
    console.error("Failed to save global sale fallback store states:", upsertError);
    throw upsertError;
  }
  globalSaleFlags[target] = onSale === true;
}

async function clearGlobalSaleFlags() {
  console.log("Clearing all sales...");
  console.log("Clearing sale table/fields:", {
    table: "global_product_sale_status",
    fields: ["on_sale", "sale_price", "sale_note", "sale_start", "sale_end"],
    fallbackTable: "store_app_state",
    fallbackFields: ["app_state.inventory.products[].onSale", "app_state.saleFlags"],
  });
  const updatedAt = new Date().toISOString();
  const productIds = [...new Set([
    ...PRODUCT_CATALOG.map(product => normalizeUpc(product.sku)),
    ...(state.inventory?.products || []).map(product => saleStatusKey(product)),
    ...Object.keys(globalSaleFlags || {}).map(normalizeUpc),
  ].filter(Boolean))];

  globalSaleFlags = Object.fromEntries(productIds.map(productId => [productId, false]));
  applyGlobalSaleFlagsToState();
  recalculateRecommendations();
  render();

  if (!globalSaleTableAvailable) {
    await updateEveryStoreSaleFlag(false, updatedAt);
    return;
  }

  const supabase = await getSupabaseClient();
  if (productIds.length) {
    const { error: upsertError } = await supabase
      .from("global_product_sale_status")
      .upsert(productIds.map(productId => ({
        product_id: productId,
        on_sale: false,
        sale_price: null,
        sale_note: null,
        sale_start: null,
        sale_end: null,
        updated_at: updatedAt,
      })));
    console.log("Clear all sales result:", { data: null, error: upsertError });
    if (upsertError) {
      if (isMissingSupabaseTableError(upsertError, "global_product_sale_status")) {
        globalSaleTableAvailable = false;
        await updateEveryStoreSaleFlag(false, updatedAt);
        return;
      }
      throw upsertError;
    }
  }

  const { error: updateError } = await supabase
    .from("global_product_sale_status")
    .update({
      on_sale: false,
      sale_price: null,
      sale_note: null,
      sale_start: null,
      sale_end: null,
      updated_at: updatedAt,
    })
    .neq("product_id", "");
  console.log("Clear all sales result:", { data: null, error: updateError });
  if (updateError) {
    if (isMissingSupabaseTableError(updateError, "global_product_sale_status")) {
      globalSaleTableAvailable = false;
      await updateEveryStoreSaleFlag(false, updatedAt);
      return;
    }
    throw updateError;
  }
  await updateEveryStoreSaleFlag(false, updatedAt);
}

async function updateEveryStoreSaleFlag(onSale, updatedAt = new Date().toISOString()) {
  const supabase = await getSupabaseClient();
  const { data: storeRows, error: storeError } = await supabase
    .from("stores")
    .select("store_number");
  if (storeError) {
    console.error("Failed to load stores for Clear All Sales:", storeError);
  }

  const { data, error } = await supabase
    .from("store_app_state")
    .select("store_number, app_state");
  if (error) throw error;

  const appStateByStore = new Map((data || []).map(row => [cleanText(row.store_number), row.app_state || {}]));
  for (const store of storeRows || []) {
    const storeNumber = cleanText(store.store_number);
    if (storeNumber && !appStateByStore.has(storeNumber)) {
      appStateByStore.set(storeNumber, defaultStoreAppStateForSaleSync(storeNumber));
    }
  }

  const rowsToSave = [];
  for (const [storeNumber, appState] of appStateByStore.entries()) {
    const products = appState.inventory?.products || appState.inventoryData?.products || appState.inventoryFileData?.products || [];
    for (const product of products) {
      setProductSaleFields(product, onSale === true);
    }
    appState.saleFlags = onSale === true
      ? Object.fromEntries(products.flatMap(product => saleStatusKeys(product).map(key => [key, true])))
      : {};
    appState.updatedAt = updatedAt;
    appState.lastUpdated = updatedAt;
    rowsToSave.push({
      store_number: storeNumber,
      app_state: appState,
      updated_at: updatedAt,
    });
  }
  if (!rowsToSave.length) return;
  const { error: upsertError } = await supabase
    .from("store_app_state")
    .upsert(rowsToSave);
  console.log("Clear all sales result:", { table: "store_app_state", rows: rowsToSave.length, error: upsertError });
  if (upsertError) throw upsertError;
  if (!onSale) globalSaleFlags = {};
}

function defaultStoreAppStateForSaleSync(storeNumber) {
  const appState = {
    ...defaultState(),
    storeNumber,
    lastSaved: null,
    updatedAt: null,
    lastUpdated: null,
  };
  appState.inventory = { products: catalogProducts(appState) };
  return appState;
}

async function saveSupabaseStoreState(storeNumber, appState) {
  const supabase = await getSupabaseClient();
  const updatedAt = new Date().toISOString();
  const payload = {
    ...appState,
    updatedAt,
  };
  const { data, error } = await supabase
    .from("store_app_state")
    .upsert({
      store_number: String(storeNumber),
      app_state: payload,
      updated_at: updatedAt,
    })
    .select("store_number, updated_at")
    .single();
  if (error) throw error;
  await upsertSupabaseStore(storeNumber);
  return { data, appState: payload };
}

async function insertSupabaseInventoryHistory(entry) {
  const storeNumber = selectedSupabaseStoreNumber();
  if (!storeNumber) return false;
  const payload = {
    store_number: storeNumber,
    product_id: entry.productId,
    product_name: entry.productName,
    change_amount: entry.changeAmount || 0,
    quantity_type: entry.quantityType || "unit",
    created_at: entry.createdAt,
    user_name: entry.userName || null,
    source: entry.source || "manual_adjustment",
    event_type: entry.eventType || "adjustment",
    transfer_direction: entry.transferDirection || null,
    case_quantity: entry.caseQuantity ?? null,
    unit_equivalent: entry.unitEquivalent ?? null,
  };
  try {
    const supabase = await getSupabaseClient();
    if ((entry.eventType || "adjustment") === "transfer") {
      console.log("Inserting transfer history:", payload);
    }
    let { data, error } = await supabase
      .from("inventory_adjustment_history")
      .insert(payload)
      .select("id");
    if ((entry.eventType || "adjustment") === "transfer") {
      console.log("Transfer history insert result:", { data, error });
    }
    if (error && String(error.message || "").includes("column")) {
      console.warn("Inventory history transfer columns are missing. Run docs/supabase-setup.sql to enable transfer history rows.", error);
      if ((entry.eventType || "adjustment") === "adjustment") {
        const fallback = await supabase
          .from("inventory_adjustment_history")
          .insert({
            store_number: storeNumber,
            product_id: entry.productId,
            product_name: entry.productName,
            change_amount: entry.changeAmount || 0,
            quantity_type: entry.quantityType || "unit",
            created_at: entry.createdAt,
            user_name: entry.userName || null,
            source: entry.source || "manual_adjustment",
          })
          .select("id");
        data = fallback.data;
        error = fallback.error;
      }
    }
    if (error) throw error;
    return true;
  } catch (error) {
    console.error("Inventory history insert failed:", error);
    return false;
  }
}

async function loadSupabaseInventoryHistory(productId) {
  const storeNumber = selectedSupabaseStoreNumber();
  if (!storeNumber) return;
  const cutoff = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000)).toISOString();
  try {
    const supabase = await getSupabaseClient();
    let { data, error } = await supabase
      .from("inventory_adjustment_history")
      .select("product_id, product_name, change_amount, quantity_type, created_at, user_name, source, event_type, transfer_direction, case_quantity, unit_equivalent")
      .eq("store_number", storeNumber)
      .eq("product_id", productId)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false });
    if (error && String(error.message || "").includes("column")) {
      console.warn("Inventory history transfer columns are missing. Run docs/supabase-setup.sql to enable transfer history rows.", error);
      const fallback = await supabase
        .from("inventory_adjustment_history")
        .select("product_id, product_name, change_amount, quantity_type, created_at, user_name, source")
        .eq("store_number", storeNumber)
        .eq("product_id", productId)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }
    if (error) throw error;
    const remoteEntries = (data || []).map(row => ({
      id: `${row.product_id}-${row.created_at}-${row.event_type || "adjustment"}-${row.change_amount}-${row.quantity_type || "unit"}-${row.transfer_direction || ""}`,
      storeNumber,
      productId: row.product_id,
      productName: row.product_name,
      changeAmount: row.change_amount,
      quantityType: row.quantity_type || "unit",
      createdAt: row.created_at,
      userName: row.user_name || "",
      source: row.source || "manual_adjustment",
      eventType: row.event_type || "adjustment",
      transferDirection: row.transfer_direction || "",
      caseQuantity: row.case_quantity == null ? null : Number(row.case_quantity),
      unitEquivalent: row.unit_equivalent == null ? null : Number(row.unit_equivalent),
    }));
    mergeInventoryHistory(remoteEntries);
  } catch (error) {
    console.error("Inventory history load failed:", error);
  }
}

function mergeInventoryHistory(entries) {
  const byKey = new Map((state.inventoryHistory || []).map(entry => [
    inventoryHistoryKey(entry),
    entry,
  ]));
  for (const entry of entries) {
    if (isClearedStockHistoryEntry(entry)) continue;
    byKey.set(inventoryHistoryKey(entry), entry);
  }
  state.inventoryHistory = [...byKey.values()]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5000);
}

function isStockAdjustmentHistoryEntry(entry) {
  return (entry?.eventType || "adjustment") !== "transfer";
}

function isClearedStockHistoryEntry(entry) {
  if (!isStockAdjustmentHistoryEntry(entry)) return false;
  const clearedAt = Date.parse(state.stockHistoryClearedAt || "");
  const createdAt = Date.parse(entry?.createdAt || "");
  return Number.isFinite(clearedAt)
    && Number.isFinite(createdAt)
    && createdAt <= clearedAt;
}

function inventoryHistoryKey(entry) {
  return [
    normalizeUpc(entry.productId),
    entry.createdAt || "",
    entry.eventType || "adjustment",
    entry.changeAmount || 0,
    entry.quantityType || "unit",
    entry.transferDirection || "",
    entry.caseQuantity ?? "",
    entry.unitEquivalent ?? "",
    entry.source || "",
  ].join("|");
}

async function createSupabaseStoreIfMissing(storeNumber) {
  await upsertSupabaseStore(storeNumber);
  const existing = await getSupabaseStoreState(storeNumber);
  if (!existing) {
    state = defaultState();
    state.storeNumber = storeNumber;
    saveLocalBackup();
    await saveSupabaseStoreState(storeNumber, serializeStateForSupabase());
  }
}

function catalogProducts(meta = {}) {
  const overrides = meta.productOverrides || {};
  const deleted = new Set((meta.deletedItems || []).map(normalizeUpc));
  const products = PRODUCT_CATALOG.map(product => ({
    id: normalizeUpc(overrides[normalizeUpc(product.sku)]?.sku || product.sku),
    sourceSku: normalizeUpc(product.sku),
    name: cleanText(overrides[normalizeUpc(product.sku)]?.description || product.description),
    category: product.category,
    quantity: 0,
    originalQuantity: 0,
    backstock: 0,
    originalBackstock: 0,
    lastUpdated: null,
    notes: "",
    overrideCases: "",
    onSale: globalSaleStatusForProduct({ sourceSku: product.sku, id: overrides[normalizeUpc(product.sku)]?.sku || product.sku }, false),
    isCatalogProduct: true,
  })).filter(product => !deleted.has(product.sourceSku));
  const customProducts = globalCustomProducts
    .filter(product => !deleted.has(normalizeUpc(product.sku)))
    .map(product => ({
      id: normalizeUpc(overrides[normalizeUpc(product.sku)]?.sku || product.sku),
      sourceSku: normalizeUpc(product.sku),
      name: cleanText(overrides[normalizeUpc(product.sku)]?.description || product.description),
      category: product.category || "Other Products",
      quantity: 0,
      originalQuantity: 0,
      backstock: 0,
      originalBackstock: 0,
      lastUpdated: null,
      notes: "",
      overrideCases: "",
      onSale: globalSaleStatusForProduct({ sourceSku: product.sku, id: overrides[normalizeUpc(product.sku)]?.sku || product.sku }, false),
      isCatalogProduct: false,
      isCustomProduct: true,
    }));
  const combined = [...products, ...customProducts];
  applyGlobalSaleFlagsToProducts(combined);
  return combined;
}

function mergeProductsWithCatalog(products, meta = state) {
  const overrides = meta.productOverrides || {};
  const deleted = new Set((meta.deletedItems || []).map(normalizeUpc));
  const byId = new Map();
  const bySource = new Map();
  for (const product of products || []) {
    const id = normalizeUpc(product.id || product.sku);
    if (!id) continue;
    const sourceSku = sourceSkuForProduct(product, meta);
    const normalized = {
      ...product,
      id,
      sourceSku,
      name: cleanText(product.name || product.description) || "Unnamed product",
    };
    byId.set(id, normalized);
    bySource.set(sourceSku, normalized);
  }

  const catalogSource = [
    ...PRODUCT_CATALOG.map(product => ({ ...product, isCustomProduct: false })),
    ...globalCustomProducts.map(product => ({
      sku: product.sku,
      description: product.description,
      category: product.category || "Other Products",
      isCustomProduct: true,
    })),
  ];

  const mergedCatalog = catalogSource
    .filter(catalogProduct => !deleted.has(normalizeUpc(catalogProduct.sku)))
    .map(catalogProduct => {
    const sourceSku = normalizeUpc(catalogProduct.sku);
    const override = overrides[sourceSku] || {};
    const id = normalizeUpc(override.sku || catalogProduct.sku);
    const existing = bySource.get(sourceSku) || byId.get(id) || byId.get(sourceSku);
    return {
      id,
      sourceSku,
      name: cleanText(override.description || catalogProduct.description),
      category: catalogProduct.category,
      quantity: existing?.quantity ?? 0,
      originalQuantity: existing?.originalQuantity ?? existing?.quantity ?? 0,
      backstock: existing?.backstock ?? 0,
      originalBackstock: existing?.originalBackstock ?? existing?.backstock ?? 0,
      lastUpdated: existing?.lastUpdated || null,
      notes: existing?.notes || "",
      overrideCases: existing?.overrideCases ?? "",
      onSale: globalSaleStatusForProduct({ sourceSku, id, onSale: existing?.onSale }, existing?.onSale || false),
      isCatalogProduct: catalogProduct.isCustomProduct !== true,
      isCustomProduct: catalogProduct.isCustomProduct === true,
    };
  });

  const globalCustomSkuSet = new Set(globalCustomProducts.map(product => normalizeUpc(product.sku)));
  const unknownProducts = [...byId.values()]
    .filter(product => {
      if (deleted.has(product.sourceSku) || deleted.has(product.id)) return false;
      if (skuToProductMap.has(product.sourceSku) || skuToProductMap.has(product.id)) return false;
      if (globalCustomSkuSet.has(product.sourceSku) || globalCustomSkuSet.has(product.id)) return false;
      return true;
    })
    .map(product => ({
      id: product.id,
      sourceSku: product.sourceSku || product.id,
      name: product.name || "Unnamed product",
      category: "Other Products",
      quantity: product.quantity ?? 0,
      originalQuantity: product.originalQuantity ?? product.quantity ?? 0,
      backstock: product.backstock ?? 0,
      originalBackstock: product.originalBackstock ?? product.backstock ?? 0,
      lastUpdated: product.lastUpdated || null,
      notes: product.notes || "",
      overrideCases: product.overrideCases ?? "",
      onSale: globalSaleStatusForProduct(product, product.onSale || false),
      isCatalogProduct: false,
    }));

  const merged = sortProducts([...mergedCatalog, ...unknownProducts]);
  applyGlobalSaleFlagsToProducts(merged);
  return merged;
}

function sourceSkuForProduct(product, meta = state) {
  const id = normalizeUpc(product.sourceSku || product.id || product.sku);
  if (product.sourceSku) return id;
  const productId = normalizeUpc(product.id || product.sku);
  const overrides = meta.productOverrides || {};
  for (const [sourceSku, override] of Object.entries(overrides)) {
    if (normalizeUpc(override?.sku) === productId) return normalizeUpc(sourceSku);
  }
  return productId;
}

function saleStatusKeys(productOrId) {
  if (!productOrId) return [];
  if (typeof productOrId !== "object") return [normalizeUpc(productOrId)].filter(Boolean);
  return [...new Set([
    normalizeUpc(productOrId.sourceSku || ""),
    normalizeUpc(productOrId.id || productOrId.sku || ""),
    normalizeUpc(productOrId.sku || ""),
  ].filter(Boolean))];
}

function saleStatusKey(productOrId) {
  return saleStatusKeys(productOrId)[0] || "";
}

function hasGlobalSaleFlag(productOrId) {
  return saleStatusKeys(productOrId)
    .some(key => Object.hasOwn(globalSaleFlags || {}, key));
}

function globalSaleStatusForProduct(product, fallback = false) {
  for (const key of saleStatusKeys(product)) {
    if (Object.hasOwn(globalSaleFlags || {}, key)) return globalSaleFlags[key] === true;
  }
  return fallback === true;
}

function applyGlobalSaleFlagsToProducts(products = []) {
  for (const product of products) {
    if (hasGlobalSaleFlag(product)) {
      product.onSale = globalSaleStatusForProduct(product, product.onSale);
    }
  }
}

function applyGlobalSaleFlagsToState() {
  applyGlobalSaleFlagsToProducts(state.inventory?.products || []);
}

function applySaleFlagsMapToProducts(products = [], saleFlags = {}) {
  const normalizedFlags = Object.fromEntries(Object.entries(saleFlags || {})
    .map(([key, value]) => [normalizeUpc(key), value === true]));
  for (const product of products) {
    for (const key of saleStatusKeys(product)) {
      if (Object.hasOwn(normalizedFlags, key)) {
        setProductSaleFields(product, normalizedFlags[key]);
        break;
      }
    }
  }
}

function setProductSaleFields(product, onSale) {
  if (!product) return;
  product.onSale = onSale === true;
  if (!onSale) {
    delete product.salePrice;
    delete product.sale_price;
    delete product.saleNote;
    delete product.sale_note;
    delete product.saleStart;
    delete product.sale_start;
    delete product.saleEnd;
    delete product.sale_end;
  }
}

function isMissingSupabaseTableError(error, tableName = "") {
  const haystack = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const table = String(tableName || "").toLowerCase();
  return haystack.includes("42p01")
    || haystack.includes("pgrst205")
    || haystack.includes("404")
    || haystack.includes("could not find")
    || haystack.includes("does not exist")
    || haystack.includes("relation")
    || (table && haystack.includes(table) && haystack.includes("schema cache"));
}

function isMissingSupabaseColumnError(error, columnName = "") {
  const haystack = [
    error?.code,
    error?.message,
    error?.details,
    error?.hint,
  ].map(value => String(value || "").toLowerCase()).join(" ");
  const column = String(columnName || "").toLowerCase();
  return haystack.includes("42703")
    || haystack.includes("column")
    || haystack.includes("schema cache")
    || (column && haystack.includes(column));
}

function loadState(storeNumber = currentStoreNumber || "") {
  try {
    migrateLegacyStorageIfNeeded(storeNumber);
    const raw = localStorage.getItem(storageKeyForStore(storeNumber));
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const hydrated = {
      ...defaultState(),
      ...parsed,
      storeNumber,
      productOverrides: parsed.productOverrides || {},
      deletedItems: parsed.deletedItems || [],
      skuAliases: parsed.skuAliases || {},
      uploads: {
        sales: parsed.uploads?.sales || parsed.uploadedSalesData || null,
        inventory: parsed.uploads?.inventory || parsed.uploadedInventoryData || null,
      },
      sales: {
        sessions: parsed.sales?.sessions || [],
        activeSessionId: parsed.sales?.activeSessionId || null,
      },
      processing: {
        matched: parsed.processing?.matched || [],
        unmatched: parsed.processing?.unmatched || [],
        deductions: parsed.processing?.deductions || [],
        recommendations: parsed.processing?.recommendations || [],
      },
      inventoryHistory: parsed.inventoryHistory || parsed.inventoryAdjustmentHistory || [],
      stockHistoryClearedAt: parsed.stockHistoryClearedAt || null,
      settings: {
        targetWeeks: Number(parsed.settings?.targetWeeks) || DEFAULT_TARGET_WEEKS,
        showSaleOnly: parsed.settings?.showSaleOnly === true,
        inventorySearch: cleanText(parsed.settings?.inventorySearch || ""),
        sortOrderingBySales: parsed.settings?.sortOrderingBySales === true,
      },
      lastSaved: parsed.lastSaved || null,
    };
    hydrated.inventory = {
      products: mergeProductsWithCatalog(parsed.inventory?.products || [], hydrated),
    };
    applyGlobalSaleFlagsToProducts(hydrated.inventory.products);
    return hydrated;
  } catch {
    return defaultState();
  }
}

function saveLocalBackup() {
  state.lastSaved = new Date().toISOString();
  state.updatedAt = state.lastSaved;
  state.storeNumber = currentStoreNumber;
  localStorage.setItem(storageKeyForStore(currentStoreNumber), JSON.stringify(state));
  saveStoreRegistry();
  renderLastSaved();
}

function saveLocalCache(storeNumber, appState) {
  localStorage.setItem(storageKeyForStore(storeNumber), JSON.stringify(appState));
  saveStoreRegistry();
}

function saveState({ showConfirmation = false } = {}) {
  saveLocalBackup();
  setSyncStatus("Local backup saved");
  scheduleSupabaseSave();
  if (showConfirmation) showToast("Save queued.");
}

async function saveStateNowToSupabase({ successMessage = "Project saved", silent = false } = {}) {
  saveLocalBackup();
  if (!selectedSupabaseStoreNumber()) {
    setSyncStatus("Local backup saved");
    if (!silent) showToast("Select or add a store number before saving.");
    return false;
  }

  try {
    await syncCurrentStoreToSupabase({ throwOnError: true, silent: true });
    if (!silent) showToast(successMessage);
    return true;
  } catch (error) {
    setSyncStatus("Sync failed, local backup saved");
    console.error("Supabase error:", error);
    if (!silent) showToast("Cloud save failed. Project saved on this device.");
    return false;
  }
}

async function saveInventoryMutationToSupabase({ silent = false } = {}) {
  saveLocalBackup();
  if (!selectedSupabaseStoreNumber()) {
    setSyncStatus("Local backup saved");
    if (!silent) showToast("Select or add a store number before saving inventory.");
    return false;
  }
  try {
    await syncCurrentStoreToSupabase({ throwOnError: true, silent: true });
    return true;
  } catch (error) {
    setSyncStatus("Sync failed, local backup saved");
    showSupabaseError(error);
    if (!silent) showToast("Inventory save failed. Changes are saved locally only.");
    return false;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(), 250);
}

function scheduleSupabaseSave() {
  clearTimeout(supabaseSaveTimer);
  if (isSwitchingStore) return;
  supabaseSaveTimer = setTimeout(() => syncCurrentStoreToSupabase({ silent: true }), SUPABASE_SAVE_DEBOUNCE_MS);
}

async function syncCurrentStoreToSupabase({ throwOnError = false, silent = false } = {}) {
  const storeNumber = selectedSupabaseStoreNumber();
  if (!storeNumber) {
    setSyncStatus("Local backup saved");
    if (!silent) showToast("Select or add a store number before saving.");
    return false;
  }
  try {
    setSyncStatus(`Saving Store ${storeNumber}...`);
    const appState = serializeStateForSupabase();
    console.log("Saving to Supabase store:", storeNumber, appState);
    const result = await saveSupabaseStoreState(storeNumber, appState);
    if (storeNumber === currentStoreNumber) {
      state.updatedAt = result.appState.updatedAt;
      saveLocalCache(storeNumber, state);
    }
    console.log("Supabase save result:", result);
    if (storeNumber === currentStoreNumber) setSyncStatus(`Store ${storeNumber} synced`);
    return true;
  } catch (error) {
    if (storeNumber === currentStoreNumber) {
      setSyncStatus("Sync failed, local backup saved");
      if (!silent) showSupabaseError(error);
      if (silent) setStatus("Offline mode: changes are saved on this device and will sync when the connection returns.");
    }
    if (silent) console.error("Supabase error:", error);
    if (throwOnError) throw error;
    return false;
  }
}

async function saveProjectNow() {
  clearTimeout(saveTimer);
  clearTimeout(supabaseSaveTimer);
  const savedToSupabase = await saveStateNowToSupabase({ successMessage: "Project saved", silent: true });
  if (savedToSupabase) {
    showToast("Project saved.");
    setStatus(`Project saved for Store ${currentStoreNumber}.`);
  } else if (!selectedSupabaseStoreNumber()) {
    showToast("Select or add a store number before saving.");
  } else {
    showToast("Cloud save failed. Project saved on this device.");
  }
}

function selectedSupabaseStoreNumber() {
  const storeNumber = cleanText(currentStoreNumber);
  return storeNumber;
}

function serializeStateForSupabase() {
  const cleanState = JSON.parse(JSON.stringify(state));
  const products = cleanState.inventory?.products || [];
  return {
    ...cleanState,
    storeNumber: currentStoreNumber,
    inventoryCounts: Object.fromEntries(products.map(product => [product.id, product.quantity || 0])),
    frontStock: Object.fromEntries(products.map(product => [product.id, product.quantity || 0])),
    backStock: Object.fromEntries(products.map(product => [product.id, product.backstock || 0])),
    saleFlags: Object.fromEntries(products.map(product => [product.id, product.onSale === true])),
    salesData: cleanState.sales?.sessions || [],
    inventoryData: cleanState.inventory || { products: [] },
    uploads: cleanState.uploads || { sales: null, inventory: null },
    uploadedSalesData: cleanState.uploads?.sales || null,
    uploadedInventoryData: cleanState.uploads?.inventory || null,
    parsedSalesRows: cleanState.uploads?.sales?.parsedRows
      || cleanState.sales?.sessions?.find(session => session.id === cleanState.sales?.activeSessionId)?.salesRows
      || [],
    parsedInventoryRows: cleanState.uploads?.inventory?.parsedRows || [],
    importedSalesFileData: cleanState.sales || { sessions: [], activeSessionId: null },
    inventoryFileData: cleanState.inventory || { products: [] },
    productOverrides: cleanState.productOverrides || {},
    customProducts: globalCustomProducts,
    productEdits: cleanState.productOverrides || {},
    editedSkus: Object.fromEntries(Object.entries(cleanState.productOverrides || {}).map(([sourceSku, override]) => [sourceSku, override?.sku || sourceSku])),
    editedDescriptions: Object.fromEntries(Object.entries(cleanState.productOverrides || {}).map(([sourceSku, override]) => [sourceSku, override?.description || ""])),
    orderRecommendations: cleanState.processing?.recommendations || [],
    inventoryHistory: cleanState.inventoryHistory || [],
    inventoryAdjustmentHistory: cleanState.inventoryHistory || [],
    stockHistoryClearedAt: cleanState.stockHistoryClearedAt || null,
    categoryState: cleanState.categoryState || {},
    settings: cleanState.settings || {},
    clientLastSaved: cleanState.lastSaved || null,
    updatedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

function hydrateStateFromRemote(remoteState, storeNumber) {
  if (remoteState.customProducts?.length) {
    globalCustomProducts = normalizeCustomProducts([...globalCustomProducts, ...remoteState.customProducts]);
    saveLocalGlobalCustomProducts();
  }
  const base = {
    ...defaultState(),
    ...remoteState,
    storeNumber,
    productOverrides: remoteState.productOverrides || remoteState.productEdits || {},
    deletedItems: remoteState.deletedItems || [],
    customProducts: remoteState.customProducts || [],
    skuAliases: remoteState.skuAliases || {},
    uploads: remoteState.uploads || {
      sales: remoteState.uploadedSalesData || null,
      inventory: remoteState.uploadedInventoryData || null,
    },
    sales: remoteState.sales || remoteState.importedSalesFileData || {
      sessions: remoteState.salesData || [],
      activeSessionId: remoteState.activeSessionId || remoteState.salesData?.[0]?.id || null,
    },
    processing: remoteState.processing || {
      matched: [],
      unmatched: [],
      deductions: [],
      recommendations: remoteState.orderRecommendations || [],
    },
    inventoryHistory: remoteState.inventoryHistory || remoteState.inventoryAdjustmentHistory || [],
    stockHistoryClearedAt: remoteState.stockHistoryClearedAt || null,
    settings: {
      ...defaultState().settings,
      ...(remoteState.settings || {}),
    },
    lastSaved: remoteState.clientLastSaved || remoteState.lastSaved || null,
  };
  base.inventory = {
    products: mergeProductsWithCatalog(
      remoteState.inventory?.products
        || remoteState.inventoryData?.products
        || remoteState.inventoryFileData?.products
        || [],
      base,
    ),
  };
  applySaleFlagsMapToProducts(base.inventory.products, remoteState.saleFlags || {});
  applyGlobalSaleFlagsToProducts(base.inventory.products);
  if (base.uploads?.sales?.parsedRows?.length && !base.sales.sessions.length) {
    const restoredSession = {
      id: base.uploads.sales.sessionId || datasetId(base.uploads.sales.fileName || "restored-sales", base.uploads.sales.parsedRows.length, Date.now()),
      fileName: base.uploads.sales.fileName || "Restored sales data",
      timestamp: base.uploads.sales.importedAt || new Date().toISOString(),
      rows: base.uploads.sales.parsedRows.length,
      salesRows: base.uploads.sales.parsedRows,
    };
    base.sales = { sessions: [restoredSession], activeSessionId: restoredSession.id };
  }
  return base;
}

function bindEvents() {
  on(dom.storeSelect, "change", event => switchStore(event.target.value));
  on(dom.addStoreButton, "click", addStore);
  on(dom.refreshStoresButton, "click", refreshStoresAndCurrentData);
  on(dom.reloadStoreButton, "click", reloadCurrentStoreData);
  on(dom.settingsReloadStoreButton, "click", reloadCurrentStoreData);
  on(dom.uploadSalesButton, "click", () => dom.salesInput?.click());
  on(dom.uploadInventoryButton, "click", () => dom.inventoryInput?.click());
  on(dom.salesInput, "change", event => handleSalesFile(event.target.files?.[0]));
  on(dom.inventoryInput, "change", event => handleInventoryFile(event.target.files?.[0]));
  on(dom.saveProgressButton, "click", saveProjectNow);
  on(dom.exportInventoryButton, "click", exportInventoryCsv);
  on(dom.exportOrdersButton, "click", exportOrdersCsv);
  on(dom.settingsButton, "click", () => activateTab("settings"));
  on(dom.addProductButton, "click", addProductToMainList);
  on(dom.makeDefaultStoreButton, "click", makeCurrentStoreDefault);
  on(dom.clearDefaultStoreButton, "click", clearDefaultStore);
  on(dom.applyDeductionButton, "click", applySalesDeduction);
  on(dom.clearSalesButton, "click", clearSalesData);
  on(dom.clearStockHistoryButton, "click", clearStockHistoryForCurrentStore);
  on(dom.clearInventoryButton, "click", clearInventoryCounts);
  on(dom.clearSaleFlagsButton, "click", clearAllSaleFlags);
  on(dom.restoreDeletedItemsButton, "click", restoreDeletedInventoryItems);
  on(dom.clearAllButton, "click", clearAllLocalData);
  on(dom.clearAppCacheButton, "click", clearAppCache);
  on(dom.helpGuideButton, "click", openHelpGuide);
  on(dom.closeHistoryModalButton, "click", closeInventoryHistory);
  on(dom.inventorySearchInput, "input", () => {
    state.settings.inventorySearch = dom.inventorySearchInput.value;
    renderInventoryTable();
    dom.clearInventorySearchButton.hidden = !cleanText(state.settings.inventorySearch || "");
  });
  on(dom.clearInventorySearchButton, "click", () => {
    state.settings.inventorySearch = "";
    dom.inventorySearchInput.value = "";
    dom.clearInventorySearchButton.hidden = true;
    renderInventoryTable();
    dom.inventorySearchInput.focus();
  });
  on(dom.historyModal, "click", event => {
    if (event.target === dom.historyModal) closeInventoryHistory();
  });
  on(dom.settingsExportInventoryButton, "click", exportInventoryCsv);
  on(dom.settingsExportOrdersButton, "click", exportOrdersCsv);
  on(dom.targetWeeksInput, "change", () => {
    state.settings.targetWeeks = Math.max(0.5, Number(dom.targetWeeksInput.value) || DEFAULT_TARGET_WEEKS);
    recalculateRecommendations();
    saveState();
  });
  on(dom.saleOnlyToggle, "change", () => {
    state.settings.showSaleOnly = dom.saleOnlyToggle.checked;
    render();
    saveState();
  });
  on(dom.sortOrderingBySalesToggle, "change", () => {
    state.settings.sortOrderingBySales = dom.sortOrderingBySalesToggle.checked;
    renderOrderingTable();
    saveState();
  });

  document.querySelectorAll(".tab-button").forEach(button => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  on(dom.inventoryTable, "click", handleInventoryClick);
  on(dom.inventoryTable, "change", handleInventoryChange);
  on(dom.orderingTable, "change", handleOrderingChange);
  on(dom.statusBanner, "click", event => {
    if (event.target.closest("#retryStoreLoadButton")) initializeSupabaseSync();
  });
  window.addEventListener("online", () => {
    setStatus("Back online. Syncing latest changes.");
    syncCurrentStoreToSupabase();
  });
  window.addEventListener("offline", () => {
    setSyncStatus("Offline mode");
    setStatus("Offline mode: changes are saved on this device and will sync when the connection returns.");
  });
}

function on(element, eventName, handler) {
  if (!element) {
    console.warn("Optional UI element missing during event binding:", eventName);
    return;
  }
  element.addEventListener(eventName, handler);
}

async function initializeSupabaseSync() {
  renderStoreSelector();
  try {
    await refreshGlobalCustomProducts({ silent: true });
    const storesLoaded = await refreshStoresFromSupabase();
    if (!storesLoaded) {
      state = loadState(currentStoreNumber || "");
      render();
      return;
    }
    await refreshGlobalSaleFlagsFromSupabase({ silent: true });
    if (selectedSupabaseStoreNumber()) {
      await loadSelectedStoreFromSupabase();
    } else {
      state = defaultState();
      applyGlobalSaleFlagsToState();
      render();
      setSyncStatus("Local backup saved");
    }
  } catch (error) {
    if (selectedSupabaseStoreNumber()) {
      state = loadState(currentStoreNumber);
      render();
    }
    setSyncStatus("Sync failed, local backup saved");
    console.error("App initialization failed:", error);
    showStoreLoadError(error);
  }
}

async function refreshStoresAndCurrentData() {
  await refreshGlobalCustomProducts({ silent: true });
  await refreshStoresFromSupabase({ showConfirmation: true });
  if (selectedSupabaseStoreNumber()) {
    await loadSelectedStoreFromSupabase();
  }
}

async function reloadCurrentStoreData() {
  if (!selectedSupabaseStoreNumber()) {
    showToast("Select a store before reloading store data.");
    return;
  }
  await refreshGlobalCustomProducts({ silent: true });
  await loadSelectedStoreFromSupabase();
}

function renderAll() {
  render();
}

function applyAppState(incomingState, storeNumber = currentStoreNumber) {
  state = hydrateStateFromRemote(incomingState, storeNumber);
  refreshProcessingFromActiveSales();
}

function isIncomingStateNewer(incomingState, remoteUpdatedAt = null) {
  const incomingTime = Date.parse(remoteUpdatedAt || incomingState?.updatedAt || incomingState?.lastUpdated || incomingState?.clientLastSaved || "");
  const localTimes = [state?.updatedAt, state?.lastUpdated, state?.lastSaved]
    .map(value => Date.parse(value || ""))
    .filter(Number.isFinite);
  const localTime = localTimes.length ? Math.max(...localTimes) : NaN;
  if (!Number.isFinite(incomingTime)) return true;
  if (!Number.isFinite(localTime)) return true;
  return incomingTime > localTime;
}

async function subscribeToCurrentStore(storeNumber) {
  const normalizedStore = cleanText(storeNumber);
  const supabase = await getSupabaseClient();
  if (currentStoreChannel) {
    await supabase.removeChannel(currentStoreChannel);
    currentStoreChannel = null;
  }
  if (!normalizedStore) return;

  console.log("Subscribing to Supabase realtime store:", normalizedStore);
  currentStoreChannel = supabase
    .channel(`store-sync-${normalizedStore}`)
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "store_app_state",
        filter: `store_number=eq.${normalizedStore}`,
      },
      payload => {
        console.log("Realtime store update received:", payload);
        const incomingState = payload.new?.app_state;
        const remoteUpdatedAt = payload.new?.updated_at || incomingState?.updatedAt;
        if (!incomingState) return;
        if (!isIncomingStateNewer(incomingState, remoteUpdatedAt)) return;
        applyAppState(incomingState, normalizedStore);
        saveLocalCache(normalizedStore, state);
        renderAll();
        setSyncStatus("Store updated");
        setStatus(`Store ${normalizedStore} updated.`);
      },
    )
    .subscribe(status => {
      console.log("Realtime status:", status);
      console.log("Supabase realtime status:", status);
      if (status === "SUBSCRIBED") {
        setSyncStatus("Listening for live updates");
        setStatus("Listening for live store updates");
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setSyncStatus("Offline mode");
      }
    });
}

async function subscribeToGlobalSaleStatuses() {
  if (!globalSaleTableAvailable) {
    console.warn("Global sale status realtime skipped because global_product_sale_status is unavailable.");
    return;
  }
  const supabase = await getSupabaseClient();
  if (currentSaleStatusChannel) {
    await supabase.removeChannel(currentSaleStatusChannel);
    currentSaleStatusChannel = null;
  }

  console.log("Subscribing to Supabase realtime global sale status");
  currentSaleStatusChannel = supabase
    .channel("global-sale-status-sync")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "global_product_sale_status",
      },
      payload => {
        console.log("Realtime global sale update received:", payload);
        const row = payload.new || payload.old;
        const productId = normalizeUpc(row?.product_id);
        if (!productId) return;
        if (payload.eventType === "DELETE") {
          delete globalSaleFlags[productId];
        } else {
          globalSaleFlags[productId] = payload.new?.on_sale === true;
        }
        applyGlobalSaleFlagsToState();
        refreshProcessingFromActiveSales();
        saveLocalCache(currentStoreNumber, state);
        renderAll();
        setStatus("Sale status updated.");
      },
    )
    .subscribe(status => {
      console.log("Supabase global sale realtime status:", status);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Global sale realtime unavailable; manual reload and store-state fallback remain active.");
      }
    });
}

async function safeSubscribeToGlobalSaleStatuses() {
  try {
    await subscribeToGlobalSaleStatuses();
  } catch (error) {
    console.warn("Global sale realtime subscription failed; continuing without realtime.", error);
  }
}

async function safeSubscribeToCurrentStore(storeNumber) {
  // TODO: Re-enable realtime after store loading is stable.
  console.log("Realtime disabled during store-loading repair:", storeNumber);
}

async function refreshStoresFromSupabase({ showConfirmation = false } = {}) {
  try {
    const remoteStores = await withTimeout(loadSupabaseStores(), 10000, "Store loading timed out");
    console.log("Selected store before refresh:", currentStoreNumber);
    const defaultStore = getDefaultStoreNumber();
    const mergedStores = [...new Set(remoteStores.map(cleanText).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    storeRegistry.stores = mergedStores;
    if (!currentStoreNumber && defaultStore && storeRegistry.stores.includes(defaultStore)) {
      currentStoreNumber = defaultStore;
    } else if (!currentStoreNumber && storeRegistry.stores.length) {
      currentStoreNumber = storeRegistry.stores[0];
    } else if (!storeRegistry.stores.includes(currentStoreNumber)) {
      currentStoreNumber = storeRegistry.stores[0] || "";
    }
    storeRegistry.currentStore = currentStoreNumber;
    saveStoreRegistry();
    renderStoreSelector();
    renderDefaultStoreSettings();
    console.log("Selected store:", currentStoreNumber);
    if (!storeRegistry.stores.length) {
      setStatus("No stores found. Add a store to begin.");
    } else if (showConfirmation) {
      showToast("Stores refreshed.");
    }
    return true;
  } catch (error) {
    setSyncStatus("Offline mode");
    console.error("Failed to load stores:", error);
    showStoreLoadError(error);
    return false;
  }
}

async function addStore() {
  const storeNumber = cleanText(prompt("Enter store number:"));
  if (!storeNumber) {
    showToast("Store number cannot be blank.");
    return;
  }
  currentStoreNumber = storeNumber;
  storeRegistry.currentStore = storeNumber;
  if (!storeRegistry.stores.includes(storeNumber)) {
    storeRegistry.stores.push(storeNumber);
    storeRegistry.stores.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }
  saveStoreRegistry();
  state = defaultState();
  state.storeNumber = currentStoreNumber;
  editingProductId = null;
  render();
  try {
    setSyncStatus(`Saving Store ${storeNumber}...`);
    await upsertSupabaseStore(storeNumber);
    await createSupabaseStoreIfMissing(storeNumber);
    await refreshStoresFromSupabase();
    await loadSelectedStoreFromSupabase({ createIfMissing: true });
    showToast(`Store ${storeNumber} selected.`);
  } catch (error) {
    setSyncStatus("Sync failed, local backup saved");
    showSupabaseError(error);
  }
}

async function switchStore(storeNumber) {
  const nextStore = cleanText(storeNumber);
  if (nextStore === currentStoreNumber) return;
  isSwitchingStore = true;
  clearTimeout(saveTimer);
  clearTimeout(supabaseSaveTimer);
  currentStoreNumber = nextStore;
  storeRegistry.currentStore = nextStore;
  if (nextStore && !storeRegistry.stores.includes(nextStore)) storeRegistry.stores.push(nextStore);
  saveStoreRegistry();
  state = defaultState();
  state.storeNumber = currentStoreNumber;
  editingProductId = null;
  render();
  isSwitchingStore = false;
  if (!nextStore) await safeSubscribeToCurrentStore("");
  await loadSelectedStoreFromSupabase();
}

function makeCurrentStoreDefault() {
  const storeNumber = cleanText(currentStoreNumber);
  if (!storeNumber) {
    showToast("Select or add a store number before setting a default.");
    return;
  }
  localStorage.setItem(DEFAULT_STORE_KEY, storeNumber);
  renderDefaultStoreSettings();
  setStatus(`Store ${storeNumber} is now the default store.`);
  showToast("Default store saved.");
}

function clearDefaultStore() {
  const defaultStore = getDefaultStoreNumber();
  if (!defaultStore) {
    showToast("No default store is set.");
    return;
  }
  if (!confirm(`Clear default store ${defaultStore}?`)) return;
  localStorage.removeItem(DEFAULT_STORE_KEY);
  renderDefaultStoreSettings();
  setStatus("Default store cleared. The store selector will open blank on startup.");
  showToast("Default store cleared.");
}

async function loadSelectedStoreFromSupabase({ createIfMissing = false } = {}) {
  const storeNumber = selectedSupabaseStoreNumber();
  if (!storeNumber) {
    setSyncStatus("Local backup saved");
    return;
  }
  try {
    console.log("Selected store:", storeNumber);
    console.log("Loading inventory for store:", storeNumber);
    setSyncStatus(`Loading Store ${storeNumber}...`);
    await refreshGlobalCustomProducts({ silent: true });
    await refreshGlobalSaleFlagsFromSupabase({ silent: true });
    const remoteState = await withTimeout(getSupabaseStoreState(storeNumber), 10000, "Inventory loading timed out");
    console.log("Loaded from Supabase store:", storeNumber, remoteState);
    if (storeNumber !== currentStoreNumber) return;
    if (remoteState) {
      applyAppState(remoteState, storeNumber);
      console.log("Inventory loaded:", state.inventory?.products || []);
      saveLocalCache(storeNumber, state);
      render();
      setSyncStatus(`Store ${storeNumber} loaded`);
      setStatus(`Store ${storeNumber} loaded.`);
      await safeSubscribeToCurrentStore(storeNumber);
      return;
    }
    state = defaultState();
    state.storeNumber = storeNumber;
    applyGlobalSaleFlagsToState();
    console.log("Inventory loaded:", state.inventory?.products || []);
    saveLocalBackup();
    render();
    if (createIfMissing) {
      await createSupabaseStoreIfMissing(storeNumber);
      await safeSubscribeToCurrentStore(storeNumber);
    } else {
      setStatus(`Store ${storeNumber} has no saved data yet. Starting with a blank store state.`);
      await safeSubscribeToCurrentStore(storeNumber);
    }
  } catch (error) {
    if (storeNumber === currentStoreNumber) {
      state = loadState(storeNumber);
      render();
      setSyncStatus("Sync failed, local backup saved");
      setStatus("Inventory could not be loaded for this store. Local backup is being used.", true);
      console.error("Inventory could not be loaded for this store:", error);
      showSupabaseError(error);
    }
  }
}

async function handleInventoryFile(file) {
  if (!file) return;
  try {
    setStatus(`Reading ${file.name}...`);
    const rows = await parseFileRows(file);
    const imported = parseInventoryRows(rows);
    state.inventory.products = mergeProductsWithCatalog([
      ...state.inventory.products,
      ...imported,
    ]);
    state.uploads.inventory = {
      fileName: file.name,
      importedAt: new Date().toISOString(),
      rowCount: imported.length,
      rawRows: rows,
      parsedRows: imported,
    };
    recalculateRecommendations();
    const synced = await saveStateNowToSupabase({ successMessage: "Inventory file saved", silent: true });
    setStatus(synced
      ? `Loaded ${imported.length} inventory products from ${file.name}. Saved for Store ${currentStoreNumber}.`
      : `Loaded ${imported.length} inventory products from ${file.name}. Saved on this device; select a store or retry sync to share it.`);
    showToast("Inventory file loaded.");
    activateTab("inventory");
  } catch (error) {
    setStatus(readableError(error), true);
    showToast(readableError(error));
  } finally {
    dom.inventoryInput.value = "";
  }
}

async function handleSalesFile(file) {
  if (!file) return;
  try {
    setStatus(`Reading ${file.name}...`);
    const rows = await parseFileRows(file);
    const parsedSales = parseSalesRows(rows);
    const session = {
      id: datasetId(file.name, parsedSales.rows.length, Date.now()),
      fileName: file.name,
      timestamp: new Date().toISOString(),
      rows: parsedSales.rows.length,
      salesRows: parsedSales.rows,
    };
    state.uploads.sales = {
      fileName: file.name,
      sessionId: session.id,
      importedAt: session.timestamp,
      rowCount: parsedSales.rows.length,
      rawRows: rows,
      parsedRows: parsedSales.rows,
    };
    state.sales.activeSessionId = session.id;
    state.sales.sessions = [session, ...state.sales.sessions.filter(item => item.id !== session.id)].slice(0, 20);
    processSalesRows(parsedSales.rows);
    const synced = await saveStateNowToSupabase({ successMessage: "Sales file saved", silent: true });
    setStatus(synced
      ? `Loaded ${parsedSales.rows.length} sales rows from ${file.name}. Saved for Store ${currentStoreNumber}.`
      : `Loaded ${parsedSales.rows.length} sales rows from ${file.name}. Saved on this device; select a store or retry sync to share it.`);
    showToast("Sales file loaded.");
    activateTab("ordering");
  } catch (error) {
    setStatus(readableError(error), true);
    showToast(readableError(error));
  } finally {
    dom.salesInput.value = "";
  }
}

function parseInventoryRows(rows) {
  if (!rows.length) throw new Error("Inventory file is empty.");
  const header = rows[0].map(cell => String(cell || "").trim());
  const upcIndex = findColumn(header, SKU_HEADER_ALIASES);
  const descriptionIndex = findColumn(header, ["description", "product", "product name", "name", "item description", "item"]);
  const quantityIndex = findColumn(header, ["quantity", "front", "front units", "front of house", "front - units"]);
  const backstockIndex = findColumn(header, ["backstock", "backstock cases", "back of house", "back - cases"]);

  if (upcIndex < 0) throw new Error(`Could not find JDE/UPC column. Detected columns: ${detectedHeaderSummary(header)}`);
  if (descriptionIndex < 0) throw new Error(`Could not find Description column. Detected columns: ${detectedHeaderSummary(header)}`);

  const products = [];
  const seen = new Set();
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const id = normalizeUpc(row[upcIndex]);
    const name = cleanText(row[descriptionIndex]);
    if (!id && !name) continue;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    products.push({
      id,
      name: name || "Unnamed product",
      quantity: quantityIndex >= 0 ? parseWholeNumber(row[quantityIndex]) : undefined,
      originalQuantity: quantityIndex >= 0 ? parseWholeNumber(row[quantityIndex]) : undefined,
      backstock: backstockIndex >= 0 ? parseWholeNumber(row[backstockIndex]) : undefined,
      originalBackstock: backstockIndex >= 0 ? parseWholeNumber(row[backstockIndex]) : undefined,
      lastUpdated: new Date().toISOString(),
      notes: "",
      overrideCases: "",
      onSale: false,
    });
  }
  if (!products.length) throw new Error("Inventory file did not contain any usable product rows.");
  return products;
}

function parseSalesRows(rows) {
  if (!rows.length) throw new Error("Sales file is empty.");
  const header = rows[0].map(cell => String(cell || "").trim());
  const upcIndex = findColumn(header, SKU_HEADER_ALIASES);
  const descriptionIndex = columnOrFallback(header, ["description", "product", "product name", "name", "item description", "item"], 2);
  const packIndex = columnOrFallback(header, ["pack", "size", "package", "sub brand", "description", "item"], 3);
  const unitsIndex = columnOrFallback(header, ["units sold", "units", "quantity sold", "sold"], 4);
  if (upcIndex < 0) throw new Error(`Could not find JDE/UPC column. Detected columns: ${detectedHeaderSummary(header)}`);
  if (unitsIndex < 0) throw new Error(`Could not find Units column. Detected columns: ${detectedHeaderSummary(header)}`);

  const salesRows = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rawUpc = cleanText(row[upcIndex]);
    const id = normalizeUpc(rawUpc);
    const pack = cleanText(row[packIndex]);
    let description = cleanText(row[descriptionIndex]);
    if (looksLikeCode(description) && pack && !looksLikeCode(pack)) {
      description = pack;
    }
    const unitsSold = parseNumber(row[unitsIndex]);
    if (!id && !description && unitsSold == null) continue;
    if (description.toLowerCase() === "total" || description.toLowerCase() === "summary") continue;
    salesRows.push({
      rowNumber: rowIndex + 1,
      id,
      description: description || "Unnamed product",
      pack,
      unitsSold,
      unitsPerCase: parseCaseSize(`${pack} ${description}`),
    });
  }
  if (!salesRows.length) throw new Error("Sales file did not contain any usable sales rows.");
  return { rows: salesRows };
}

function processSalesRows(salesRows) {
  const productById = new Map(
    state.inventory.products
      .filter(product => productCategoryInfo(product))
      .flatMap(product => {
        const keys = new Set([product.id, product.sourceSku, resolveSku(product.sourceSku)]);
        return [...keys].filter(Boolean).map(key => [normalizeUpc(key), product]);
      }),
  );
  const salesById = new Map();
  const unmatched = [];

  for (const row of salesRows) {
    const resolvedId = resolveSku(row.id);
    const product = productById.get(resolvedId);
    if (!resolvedId || !product) {
      unmatched.push({ ...row, status: "Unmatched", reason: "No inventory JDE/UPC match" });
      continue;
    }
    const current = salesById.get(product.id) || {
      id: product.id,
      unitsSold: 0,
      unitsPerCase: row.unitsPerCase || parseCaseSize(`${product.name}`),
      description: product.name || row.description,
      pack: row.pack,
      rows: [],
    };
    current.unitsSold += Number(row.unitsSold || 0);
    current.unitsPerCase = current.unitsPerCase || row.unitsPerCase || parseCaseSize(`${product.name} ${row.pack}`);
    current.rows.push(row.rowNumber);
    salesById.set(product.id, current);
  }

  state.processing.matched = [...salesById.values()];
  state.processing.unmatched = unmatched;
  recalculateRecommendations();
}

function recalculateRecommendations() {
  const salesById = new Map(state.processing.matched.map(item => [item.id, item]));
  state.processing.recommendations = sortProducts(state.inventory.products)
    .filter(product => productCategoryInfo(product))
    .map((product, originalOrderIndex) => {
      const sales = salesById.get(product.id);
      const unitsSold = safeFiniteNumber(sales?.unitsSold, 0);
      const frontUnits = stockQuantityNumber(product.quantity);
      const backstockCases = stockQuantityNumber(product.backstock);
      const caseSize = positiveFiniteNumber(sales?.unitsPerCase)
        || positiveFiniteNumber(parseCaseSize(`${product.name}`));
      const needsCaseSize = Number(backstockCases || 0) > 0;
      const needsReview = frontUnits == null
        || backstockCases == null
        || !Number.isFinite(unitsSold)
        || (needsCaseSize && !caseSize);
      const totalUnitsOnHand = needsReview
        ? null
        : (backstockCases * (caseSize || 0)) + frontUnits;
      const weeksInfo = orderingWeeksInfo({
        averageWeeklySales: unitsSold,
        totalUnitsOnHand,
        needsReview,
      });
      const netUnitsNeeded = weeksInfo.type === "needs-review" ? 0 : Math.max(0, unitsSold - totalUnitsOnHand);
      const calculatedCases = unitsSold > 0 && caseSize ? Math.ceil(netUnitsNeeded / caseSize) : 0;
      const overrideCases = product.overrideCases === "" || product.overrideCases == null
        ? null
        : Math.max(0, Number(product.overrideCases) || 0);
      const orderCases = overrideCases ?? calculatedCases;
      const unitOrder = caseSize ? orderCases * caseSize : 0;
      return {
        id: product.id,
        name: product.name,
        originalOrderIndex,
        unitsSold,
        unitsPerCase: caseSize || null,
        front: frontUnits ?? 0,
        backstock: backstockCases ?? 0,
        totalUnitsOnHand,
        weeksOfProduct: weeksInfo.value,
        weeksOfProductLabel: weeksInfo.label,
        weeksSortPriority: weeksInfo.sortPriority,
        weeksStatus: weeksInfo.type,
        orderCases,
        unitOrder,
        status: weeksInfo.type === "needs-review"
          ? "Needs Review"
          : unitsSold <= 0 || (weeksInfo.value != null && weeksInfo.value >= 2)
          ? "Do Not Order"
          : "Order Needed",
        notes: product.notes || "",
        overrideCases: product.overrideCases ?? "",
      };
    });
  render();
}

function positiveFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function safeFiniteNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function stockQuantityNumber(value) {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function orderingWeeksInfo({ averageWeeklySales, totalUnitsOnHand, needsReview = false }) {
  const sales = safeFiniteNumber(averageWeeklySales, null);
  const stock = safeFiniteNumber(totalUnitsOnHand, null);
  if (needsReview || sales == null || stock == null || stock < 0 || sales < 0) {
    return { type: "needs-review", value: null, label: "Needs review", sortPriority: 3 };
  }
  if (sales > 0) {
    const weeks = stock / sales;
    if (!Number.isFinite(weeks)) {
      return { type: "needs-review", value: null, label: "Needs review", sortPriority: 3 };
    }
    return {
      type: "calculated",
      value: weeks,
      label: `${weeks.toFixed(1)} weeks`,
      sortPriority: 0,
    };
  }
  if (stock > 0) {
    return { type: "no-recent-sales", value: null, label: "No recent sales", sortPriority: 2 };
  }
  return { type: "no-sales-data", value: null, label: "No sales data", sortPriority: 1 };
}

async function parseFileRows(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) {
    return parseCsv(await file.text());
  }
  if (!name.endsWith(".xlsx")) {
    throw new Error("Invalid format. Upload an XLSX or CSV file.");
  }
  if (!window.XLSX) {
    throw new Error(
      "XLSX support is not loaded. The app needs the SheetJS xlsx.full.min.js file to read Excel files. Make sure xlsx.full.min.js is included in the project and loaded before app.js.",
    );
  }
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook is missing a worksheet.");
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error("The first worksheet could not be loaded.");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  rows.push(row);
  return rows.filter(items => items.some(value => cleanText(value)));
}

function render() {
  renderStoreSelector();
  renderDefaultStoreSettings();
  renderSyncStatus();
  renderLastSaved();
  dom.targetWeeksInput.value = state.settings.targetWeeks;
  dom.saleOnlyToggle.checked = state.settings.showSaleOnly === true;
  dom.sortOrderingBySalesToggle.checked = state.settings.sortOrderingBySales === true;
  dom.inventorySearchInput.value = state.settings.inventorySearch || "";
  dom.clearInventorySearchButton.hidden = !cleanText(state.settings.inventorySearch || "");
  renderInventorySummary();
  renderOrderingSummary();
  renderInventoryTable();
  renderOrderingTable();
  renderUnmatched();
}

function renderStoreSelector() {
  const blankOption = `<option value="" ${currentStoreNumber ? "" : "selected"}></option>`;
  const storeOptions = storeRegistry.stores
    .map(storeNumber => `<option value="${escapeHtml(storeNumber)}" ${storeNumber === currentStoreNumber ? "selected" : ""}>${escapeHtml(storeNumber)}</option>`)
    .join("");
  dom.storeSelect.innerHTML = `${blankOption}${storeOptions}`;
  dom.currentStoreText.textContent = currentStoreNumber ? `Current store: ${currentStoreNumber}` : "No store selected";
}

function renderDefaultStoreSettings() {
  const defaultStore = getDefaultStoreNumber();
  dom.settingsCurrentStoreText.textContent = currentStoreNumber || "None selected";
  dom.defaultStoreText.textContent = defaultStore || "None set";
  dom.clearDefaultStoreButton.disabled = !defaultStore;
  dom.clearSaleFlagsButton.disabled = saleClearInProgress;
  dom.clearSaleFlagsButton.textContent = saleClearInProgress ? "Clearing sales..." : "Clear All Sales";
}

function renderSyncStatus() {
  dom.syncStatusText.textContent = syncStatus;
  dom.syncStatusText.className = `sync-status ${syncStatusClass(syncStatus)}`;
}

function renderLastSaved() {
  dom.lastSavedText.textContent = state.lastSaved ? formatDateTime(state.lastSaved) : "Never";
}

function renderInventorySummary() {
  const visible = state.inventory.products.filter(product => productCategoryInfo(product));
  const totalFront = visible.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
  const totalBack = visible.reduce((sum, product) => sum + Number(product.backstock || 0), 0);
  dom.inventorySummary.innerHTML = [
    metric("Products", visible.length),
    metric("Front Units", totalFront),
    metric("Backstock Cases", totalBack),
  ].join("");
}

function renderOrderingSummary() {
  const recommendations = state.processing.recommendations || [];
  const orderNeeded = recommendations.filter(item => item.status === "Order Needed").length;
  const totalUnitsSold = recommendations.reduce((sum, item) => sum + Number(item.unitsSold || 0), 0);
  const active = state.sales.sessions.find(session => session.id === state.sales.activeSessionId);
  dom.orderingSummary.innerHTML = [
    metric("Sales Rows", active?.rows || 0),
    metric("Matched", state.processing.matched.length),
    metric("Unmatched", state.processing.unmatched.length),
    metric("Units Sold", formatNumber(totalUnitsSold)),
    metric("Order Needed", orderNeeded),
  ].join("");
}

function renderInventoryTable() {
  const sortedProducts = sortProducts(state.inventory.products);
  const filteredProducts = state.settings.showSaleOnly
    ? sortedProducts.filter(product => product.onSale)
    : sortedProducts;
  const searchFilteredProducts = filterInventoryProductsBySearch(filteredProducts);
  const visibleProducts = searchFilteredProducts.filter(product => productCategoryInfo(product));
  const unknownProducts = searchFilteredProducts.filter(product => !productCategoryInfo(product));

  let html = `<table><thead><tr>
    <th class="center-cell">Info</th><th>JDE/UPC</th><th>Description</th><th class="center-cell">Backstock</th>
    <th class="center-cell">Transfer</th><th class="center-cell">Front</th><th>Notes</th><th class="center-cell">Sale</th><th class="center-cell">Actions</th>
  </tr></thead><tbody>`;
  for (const section of CATEGORY_CONFIG) {
    const products = visibleProducts.filter(product => productCategoryInfo(product)?.name === section.name);
    if (!products.length) continue;
    html += `<tr class="category-row"><td colspan="9">${escapeHtml(section.name)}</td></tr>`;
    for (const product of products) {
      html += inventoryRowHtml(product);
    }
  }
  if (unknownProducts.length) {
    html += `<tr class="category-row"><td colspan="9">Other Products</td></tr>`;
    for (const product of unknownProducts) {
      html += inventoryRowHtml(product);
    }
  }
  if (!visibleProducts.length && !unknownProducts.length && cleanText(state.settings.inventorySearch || "")) {
    html += `<tr><td colspan="9"><div class="empty-state">No inventory items match your search.</div></td></tr>`;
  }
  html += "</tbody></table>";
  dom.inventoryTable.innerHTML = html;
}

function filterInventoryProductsBySearch(products) {
  const query = normalizeSearchText(state.settings.inventorySearch || "");
  const compactQuery = compactSearchText(query);
  if (!query) return products;
  return products.filter(product => {
    const searchableText = inventorySearchableText(product);
    return searchableText.normalized.includes(query) || searchableText.compact.includes(compactQuery);
  });
}

function inventorySearchableText(product) {
  const catalogProduct = skuToProductMap.get(normalizeUpc(product?.sourceSku))
    || skuToProductMap.get(normalizeUpc(product?.id));
  const recommendation = (state.processing.recommendations || []).find(item => {
    const itemId = normalizeUpc(item.id);
    return itemId === normalizeUpc(product?.id) || itemId === normalizeUpc(product?.sourceSku);
  });
  const values = [
    product?.id,
    product?.sku,
    product?.sourceSku,
    product?.item_number,
    product?.itemNumber,
    product?.lcbo_number,
    product?.lcboNumber,
    product?.product_id,
    product?.productId,
    product?.name,
    product?.product_name,
    product?.productName,
    product?.description,
    catalogProduct?.sku,
    catalogProduct?.description,
    product?.size,
    product?.bottle_size,
    product?.bottleSize,
    product?.volume,
    product?.format,
    product?.case_size,
    product?.caseSize,
    product?.pack_size,
    product?.packSize,
    product?.units_per_case,
    product?.unitsPerCase,
    product?.pack,
    product?.overrideCases,
    recommendation?.unitsPerCase,
    recommendation?.pack,
    recommendation?.name,
    recommendation?.description,
  ].filter(value => value !== null && value !== undefined && value !== "");
  const normalized = normalizeSearchText(values.join(" "));
  return {
    normalized,
    compact: compactSearchText(normalized),
  };
}

function inventoryRowHtml(product) {
  const isEditing = editingProductId === product.id;
  const rowTitle = product.onSale ? "This item is currently marked as on sale." : "";
  if (isEditing) {
    return `<tr class="${product.onSale ? "sale-item-row" : ""}" data-id="${escapeHtml(product.id)}" title="${rowTitle}">
      <td class="center-cell">${historyButton(product)}</td>
      <td><input class="edit-input sku-edit-input" data-edit-field="sku" data-id="${escapeHtml(product.id)}" value="${escapeHtml(product.id)}" /></td>
      <td><input class="edit-input description-edit-input" data-edit-field="description" data-id="${escapeHtml(product.id)}" value="${escapeHtml(product.name)}" /></td>
      <td class="number-cell">${quantityControl(product.id, "backstock", product.backstock || 0)}</td>
      <td class="center-cell">${transferControl(product)}</td>
      <td class="number-cell">${quantityControl(product.id, "quantity", product.quantity || 0)}</td>
      <td><input class="notes-input" data-field="notes" data-id="${escapeHtml(product.id)}" value="${escapeHtml(product.notes || "")}" /></td>
      <td class="center-cell"><input type="checkbox" data-field="onSale" data-id="${escapeHtml(product.id)}" ${product.onSale ? "checked" : ""} title="This item is currently marked as on sale." /></td>
      <td class="center-cell row-actions">
        <button class="action-button save-action" data-action="saveEdit" data-id="${escapeHtml(product.id)}" title="Save product edits">Save</button>
        <button class="action-button" data-action="cancelEdit" data-id="${escapeHtml(product.id)}" title="Cancel product edits">Cancel</button>
      </td>
    </tr>`;
  }

  return `<tr class="${product.onSale ? "sale-item-row" : ""}" data-id="${escapeHtml(product.id)}" title="${rowTitle}">
    <td class="center-cell">${historyButton(product)}</td>
    <td>${escapeHtml(product.id)}</td>
    <td class="desc-cell product-name-cell" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}${saleBadge(product)}</td>
    <td class="number-cell">${quantityControl(product.id, "backstock", product.backstock || 0)}</td>
    <td class="center-cell">${transferControl(product)}</td>
    <td class="number-cell">${quantityControl(product.id, "quantity", product.quantity || 0)}</td>
    <td><input class="notes-input" data-field="notes" data-id="${escapeHtml(product.id)}" value="${escapeHtml(product.notes || "")}" /></td>
    <td class="center-cell"><input type="checkbox" data-field="onSale" data-id="${escapeHtml(product.id)}" ${product.onSale ? "checked" : ""} title="This item is currently marked as on sale." /></td>
    <td class="center-cell row-actions">
      <button class="icon-action edit-icon" data-action="editProduct" data-id="${escapeHtml(product.id)}" title="Edit product" aria-label="Edit product">${actionIcon("edit")}</button>
      <button class="icon-action danger-icon" data-action="deleteProduct" data-id="${escapeHtml(product.id)}" title="Delete product" aria-label="Delete product">${actionIcon("trash")}</button>
    </td>
  </tr>`;
}

function renderOrderingTable() {
  const recommendations = displayedOrderingRecommendations();
  if (!recommendations.length) {
    dom.orderingTable.innerHTML = `<div class="empty-state">Upload a sales file to calculate order recommendations from the built-in catalog.</div>`;
    dom.applyDeductionButton.disabled = true;
    dom.deductionStatus.textContent = "";
    return;
  }

  const activeId = state.sales.activeSessionId;
  const alreadyDeducted = state.processing.deductions.some(item => item.sessionId === activeId);
  dom.applyDeductionButton.disabled = !activeId || alreadyDeducted;
  dom.deductionStatus.textContent = alreadyDeducted
    ? "Sales deduction already applied for this sales file."
    : "Deducts Units Sold from Front only.";

  let html = `<table><thead><tr>
    <th>JDE/UPC</th><th>Description</th><th class="center-cell">Units Sold</th>
    <th class="center-cell">Total Units On Hand</th><th class="center-cell">Weeks</th>
    <th class="center-cell">Order Cases</th><th class="center-cell">Unit Order</th>
    <th class="center-cell">Override</th><th>Status</th><th>Notes</th>
  </tr></thead><tbody>`;
  if (state.settings.sortOrderingBySales === true) {
    for (const item of recommendations) {
      html += orderingRecommendationRow(item);
    }
  } else {
    for (const section of CATEGORY_CONFIG) {
      const rows = recommendations.filter(item => productCategoryInfo(getProduct(item.id) || item)?.name === section.name);
      if (!rows.length) continue;
      html += `<tr class="category-row"><td colspan="10">${escapeHtml(section.name)}</td></tr>`;
      for (const item of rows) {
        html += orderingRecommendationRow(item);
      }
    }
  }
  html += "</tbody></table>";
  dom.orderingTable.innerHTML = html;
}

function displayedOrderingRecommendations() {
  const baseRecommendations = state.settings.showSaleOnly
    ? (state.processing.recommendations || []).filter(item => getProduct(item.id)?.onSale)
    : state.processing.recommendations || [];
  const recommendations = [...baseRecommendations];
  if (state.settings.sortOrderingBySales !== true) {
    return recommendations.sort(compareOrderingDefaultOrder);
  }
  return recommendations.sort((a, b) => {
    const salesDifference = safeFiniteNumber(b.unitsSold, 0) - safeFiniteNumber(a.unitsSold, 0);
    if (salesDifference !== 0) return salesDifference;
    return compareOrderingDefaultOrder(a, b);
  });
}

function compareOrderingDefaultOrder(a, b) {
  if (a?.id === b?.id) return 0;
  const aIndex = orderingOriginalIndex(a);
  const bIndex = orderingOriginalIndex(b);
  if (aIndex !== bIndex) return aIndex - bIndex;
  const sorted = sortProducts([getProduct(a.id) || a, getProduct(b.id) || b]);
  if (sorted[0]?.id === a.id) return -1;
  if (sorted[0]?.id === b.id) return 1;
  return 0;
}

function orderingOriginalIndex(item) {
  if (Number.isFinite(Number(item?.originalOrderIndex))) return Number(item.originalOrderIndex);
  const product = getProduct(item?.id);
  if (!product) return Number.MAX_SAFE_INTEGER;
  const sortedProducts = sortProducts(state.inventory.products);
  const index = sortedProducts.findIndex(row => row.id === product.id);
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
}

function orderingRecommendationRow(item) {
  const statusClass = item.status === "Order Needed" ? "status-order" : "status-ok";
  const onSale = getProduct(item.id)?.onSale === true;
  return `<tr class="${onSale ? "sale-item-row" : ""}" data-id="${escapeHtml(item.id)}" title="${onSale ? "This item is currently marked as on sale." : ""}">
    <td>${escapeHtml(item.id)}</td>
    <td class="desc-cell product-name-cell" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}${onSale ? saleBadge({ onSale: true }) : ""}</td>
    <td class="number-cell">${formatNumber(item.unitsSold)}</td>
    <td class="number-cell">${formatOrderingNumber(item.totalUnitsOnHand)}</td>
    <td class="number-cell weeks-cell">${escapeHtml(formatWeeksOfStock(item))}</td>
    <td class="number-cell">${item.orderCases}</td>
    <td class="number-cell">${formatNumber(item.unitOrder)}</td>
    <td class="number-cell"><input class="small-number" type="number" min="0" data-field="overrideCases" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.overrideCases ?? "")}" /></td>
    <td><span class="status-pill ${statusClass}">${escapeHtml(item.status)}</span></td>
    <td class="desc-cell" title="${escapeHtml(item.notes || "")}">${escapeHtml(item.notes || "")}</td>
  </tr>`;
}

function renderUnmatched() {
  const unmatched = state.settings.showSaleOnly ? [] : state.processing.unmatched || [];
  if (!unmatched.length) {
    dom.unmatchedList.innerHTML = `<div class="small-muted">No unmatched rows.</div>`;
    return;
  }
  dom.unmatchedList.innerHTML = unmatched.map(row => `
    <div class="unmatched-item">
      <strong>Row ${row.rowNumber}</strong> |
      UPC: ${escapeHtml(row.id || "-")} |
      ${escapeHtml(row.description || "Unnamed product")} |
      ${escapeHtml(row.reason || "Unmatched")}
    </div>
  `).join("");
}

async function updateInventoryProduct(product, updates, { historySource = "manual_adjustment" } = {}) {
  if (!product || !updates || typeof updates !== "object") return false;
  const previousValues = {
    quantity: Number(product.quantity || 0),
    backstock: Number(product.backstock || 0),
    onSale: product.onSale === true,
    notes: product.notes || "",
  };
  const pendingHistory = [];

  if (Object.hasOwn(updates, "quantity")) {
    const nextQuantity = Math.max(0, parseWholeNumber(updates.quantity));
    product.quantity = nextQuantity;
    const delta = nextQuantity - previousValues.quantity;
    if (delta !== 0) pendingHistory.push(createInventoryAdjustment(product, delta, "unit", historySource));
  }

  if (Object.hasOwn(updates, "backstock")) {
    const nextBackstock = Math.max(0, parseWholeNumber(updates.backstock));
    product.backstock = nextBackstock;
    const delta = nextBackstock - previousValues.backstock;
    if (delta !== 0) pendingHistory.push(createInventoryAdjustment(product, delta, "case", historySource));
  }

  if (Object.hasOwn(updates, "onSale")) {
    product.onSale = updates.onSale === true;
  }

  if (Object.hasOwn(updates, "notes")) {
    product.notes = cleanText(updates.notes);
  }

  const changed = product.quantity !== previousValues.quantity
    || product.backstock !== previousValues.backstock
    || product.onSale !== previousValues.onSale
    || product.notes !== previousValues.notes;
  if (!changed) return false;

  product.lastUpdated = new Date().toISOString();
  recalculateRecommendations();
  render();

  const saleChanged = product.onSale !== previousValues.onSale;
  if (saleChanged) {
    const globalSaleSaved = await saveGlobalSaleStatus(product, product.onSale, { silent: true });
    if (!globalSaleSaved) {
      product.onSale = previousValues.onSale;
      recalculateRecommendations();
      render();
      showToast("Sale status could not be saved.");
      return false;
    }
  }

  if (saleChanged && !pendingHistory.length && !Object.hasOwn(updates, "notes")) {
    saveLocalBackup();
    return true;
  }

  const saved = await saveInventoryMutationToSupabase({ silent: true });
  if (saved) {
    for (const entry of pendingHistory) {
      commitInventoryAdjustment(entry);
    }
    if (pendingHistory.length) {
      saveLocalBackup();
      scheduleSupabaseSave();
    }
  }
  return saved;
}

async function transferCase(product, direction) {
  if (!product || transferringProductIds.has(product.id)) return false;

  const caseSize = unitsPerCaseForProduct(product);
  const currentBackstockCases = Math.max(0, parseWholeNumber(product.backstock));
  const currentFrontUnits = Math.max(0, parseWholeNumber(product.quantity));
  let nextBackstockCases = currentBackstockCases;
  let nextFrontUnits = currentFrontUnits;

  if (direction === "back_to_front") {
    if (currentBackstockCases <= 0) {
      showToast("No backstock cases available to move.");
      setStatus("No backstock cases available to move.", true);
      return false;
    }
    nextBackstockCases = currentBackstockCases - 1;
    nextFrontUnits = currentFrontUnits + caseSize;
  } else if (direction === "front_to_back") {
    if (currentFrontUnits < caseSize) {
      showToast("You need a full case in front stock to move it back to backstock.");
      setStatus("You need a full case in front stock to move it back to backstock.", true);
      return false;
    }
    nextBackstockCases = currentBackstockCases + 1;
    nextFrontUnits = currentFrontUnits - caseSize;
  } else {
    return false;
  }

  const beforeTotalUnits = currentFrontUnits + (currentBackstockCases * caseSize);
  const afterTotalUnits = nextFrontUnits + (nextBackstockCases * caseSize);
  if (beforeTotalUnits !== afterTotalUnits) {
    console.error("Blocked stock transfer because totals did not match.", {
      product,
      direction,
      caseSize,
      beforeTotalUnits,
      afterTotalUnits,
    });
    showToast("Transfer blocked because total inventory would change.");
    setStatus("Transfer blocked because total inventory would change.", true);
    return false;
  }

  const previousValues = {
    quantity: product.quantity,
    backstock: product.backstock,
    lastUpdated: product.lastUpdated,
  };

  transferringProductIds.add(product.id);
  product.quantity = nextFrontUnits;
  product.backstock = nextBackstockCases;
  product.lastUpdated = new Date().toISOString();
  recalculateRecommendations();
  render();

  try {
    console.log("Transferring case between backstock and front stock:", {
      productId: product.id,
      direction,
      caseSize,
      previousFrontUnits: currentFrontUnits,
      nextFrontUnits,
      previousBackstockCases: currentBackstockCases,
      nextBackstockCases,
    });
    const saved = await saveInventoryMutationToSupabase({ silent: true });
    if (!saved) throw new Error("Inventory transfer was not saved to Supabase.");
    const historySaved = await commitInventoryAdjustment(createInventoryTransfer(product, direction, caseSize), { warnOnFailure: true });
    saveLocalBackup();
    scheduleSupabaseSave();
    const message = direction === "back_to_front"
      ? "Moved 1 case to front stock."
      : "Moved 1 case to backstock.";
    if (historySaved) {
      setStatus(`${message} Total inventory is unchanged.`);
      showToast(message);
    }
    return true;
  } catch (error) {
    console.error("Inventory transfer save failed:", error);
    product.quantity = previousValues.quantity;
    product.backstock = previousValues.backstock;
    product.lastUpdated = previousValues.lastUpdated;
    recalculateRecommendations();
    saveLocalBackup();
    setStatus("Transfer could not be saved.", true);
    showToast("Transfer could not be saved.");
    return false;
  } finally {
    transferringProductIds.delete(product.id);
    render();
  }
}

function handleInventoryClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = getProduct(button.dataset.id);
  if (!product) return;
  if (button.dataset.action === "editProduct") {
    editingProductId = product.id;
    renderInventoryTable();
    return;
  }
  if (button.dataset.action === "cancelEdit") {
    editingProductId = null;
    renderInventoryTable();
    return;
  }
  if (button.dataset.action === "saveEdit") {
    saveProductEdit(product);
    return;
  }
  if (button.dataset.action === "deleteProduct") {
    deleteInventoryItem(product);
    return;
  }
  if (button.dataset.action === "showHistory") {
    openInventoryHistory(product);
    return;
  }
  if (button.dataset.action === "transferCase") {
    transferCase(product, button.dataset.direction);
    return;
  }
  const field = button.dataset.field;
  const delta = Number(button.dataset.delta);
  const previousValue = Number(product[field] || 0);
  const nextValue = Math.max(0, previousValue + delta);
  updateInventoryProduct(product, { [field]: nextValue }, { historySource: historySourceForField(field) });
}

function handleInventoryChange(event) {
  const input = event.target;
  const id = input.dataset.id;
  const field = input.dataset.field;
  if (!id || !field) return;
  const product = getProduct(id);
  if (!product) return;
  if (field === "quantity" || field === "backstock") {
    const nextValue = Math.max(0, parseWholeNumber(input.value));
    updateInventoryProduct(product, { [field]: nextValue }, { historySource: historySourceForField(field) });
  } else if (field === "onSale") {
    updateInventoryProduct(product, { onSale: input.checked });
  } else {
    updateInventoryProduct(product, { [field]: input.value });
  }
}

function saveProductEdit(product) {
  const sourceSku = product.sourceSku || product.id;
  const skuInput = dom.inventoryTable.querySelector(`input[data-edit-field="sku"][data-id="${cssEscape(product.id)}"]`);
  const descriptionInput = dom.inventoryTable.querySelector(`input[data-edit-field="description"][data-id="${cssEscape(product.id)}"]`);
  const newSku = normalizeUpc(skuInput?.value || "");
  const newDescription = cleanText(descriptionInput?.value || "");
  if (!newSku) {
    showToast("Enter a SKU/JDE/UPC before saving.");
    return;
  }
  if (!newDescription) {
    showToast("Enter a product description before saving.");
    return;
  }
  if (skuExistsOnAnotherProduct(newSku, sourceSku)) {
    showToast("That SKU already exists. Please use a different SKU.");
    return;
  }

  const oldSku = product.id;
  state.productOverrides[sourceSku] = {
    sku: newSku,
    description: newDescription,
  };
  if (newSku !== sourceSku) {
    state.skuAliases[sourceSku] = newSku;
    state.skuAliases[oldSku] = newSku;
  } else {
    delete state.skuAliases[sourceSku];
    delete state.skuAliases[oldSku];
  }
  moveProcessingSku(oldSku, newSku);
  editingProductId = null;
  state.inventory.products = mergeProductsWithCatalog(state.inventory.products, state);
  refreshProcessingFromActiveSales();
  saveState();
  setStatus(`Updated ${newSku}.`);
  showToast("Product saved.");
}

function deleteInventoryItem(product) {
  if (!confirm("Are you sure you want to delete this inventory item? This cannot be undone.")) return;
  const sourceSku = product.sourceSku || product.id;
  state.deletedItems = [...new Set([...(state.deletedItems || []), sourceSku].map(normalizeUpc))];
  delete state.productOverrides[sourceSku];
  const deleteKeys = [sourceSku, product.id].map(normalizeUpc);
  for (const [aliasFrom, aliasTo] of Object.entries(state.skuAliases || {})) {
    const from = normalizeUpc(aliasFrom);
    const to = normalizeUpc(aliasTo);
    if (deleteKeys.includes(from) || deleteKeys.includes(to)) {
      delete state.skuAliases[aliasFrom];
    }
  }
  state.inventory.products = state.inventory.products.filter(item => {
    const itemSource = item.sourceSku || item.id;
    return item.id !== product.id && itemSource !== sourceSku;
  });
  state.processing.matched = (state.processing.matched || []).filter(item => item.id !== product.id && item.id !== sourceSku);
  state.processing.recommendations = (state.processing.recommendations || []).filter(item => item.id !== product.id && item.id !== sourceSku);
  editingProductId = null;
  state.inventory.products = mergeProductsWithCatalog(state.inventory.products, state);
  refreshProcessingFromActiveSales();
  saveState();
  setStatus(`Deleted ${product.id}.`);
  showToast("Inventory item deleted.");
}

function restoreDeletedInventoryItems() {
  if (!state.deletedItems?.length) {
    showToast("There are no deleted built-in items to restore.");
    return;
  }
  if (!confirm("Restore deleted built-in inventory items? Saved counts for current visible products will be kept.")) return;
  state.deletedItems = [];
  state.inventory.products = mergeProductsWithCatalog(state.inventory.products, state);
  refreshProcessingFromActiveSales();
  saveState();
  setStatus("Deleted inventory items restored.");
  showToast("Deleted inventory items restored.");
}

async function addProductToMainList() {
  await refreshGlobalCustomProducts({ silent: true });
  const rawSku = prompt("Enter JDE/UPC/SKU for the new product:");
  if (rawSku === null) return;
  const sku = normalizeUpc(rawSku);
  if (!sku) {
    showToast("Enter a SKU/JDE/UPC before adding a product.");
    return;
  }
  if (skuExistsOnAnotherProduct(sku, "")) {
    showToast("That SKU already exists. Please use a different SKU.");
    return;
  }

  const rawDescription = prompt("Enter product description:");
  if (rawDescription === null) return;
  const description = cleanText(rawDescription);
  if (!description) {
    showToast("Enter a product description before adding a product.");
    return;
  }

  const categoryHelp = CATEGORY_ORDER.map((category, index) => `${index + 1}. ${category}`).join("\n");
  const rawCategory = prompt(`Choose a category for this product:\n${categoryHelp}\n\nLeave blank for Other Products:`);
  const category = normalizeCategoryChoice(rawCategory);
  const orderIndex = globalCustomProducts.filter(product => product.category === category).length;
  const product = {
    sku,
    description,
    category,
    orderIndex,
    createdAt: new Date().toISOString(),
  };

  globalCustomProducts = normalizeCustomProducts([...globalCustomProducts, product]);
  state.deletedItems = (state.deletedItems || []).filter(item => normalizeUpc(item) !== sku);
  state.inventory.products = mergeProductsWithCatalog(state.inventory.products, state);
  refreshProcessingFromActiveSales();
  saveLocalGlobalCustomProducts();
  saveState();
  render();

  dom.addProductButton.disabled = true;
  try {
    await withTimeout(saveGlobalCustomProductsToCloud(), 10000, "Product list save timed out");
    if (selectedSupabaseStoreNumber()) {
      await saveStateNowToSupabase({ successMessage: "Product added", silent: true });
    }
    setStatus(`${sku} added to the main product list.`);
    showToast("Product added to the main product list.");
  } catch (error) {
    console.error("Add product sync failed:", error);
    setStatus("Product added on this device. Use Save Progress again when online.", true);
    showToast("Product added on this device.");
  } finally {
    dom.addProductButton.disabled = false;
  }
}

function normalizeCategoryChoice(value) {
  const text = cleanText(value || "");
  if (!text) return "Other Products";
  const numericIndex = Number(text);
  if (Number.isInteger(numericIndex) && numericIndex >= 1 && numericIndex <= CATEGORY_ORDER.length) {
    return CATEGORY_ORDER[numericIndex - 1];
  }
  return CATEGORY_ORDER.find(category => category.toLowerCase() === text.toLowerCase()) || "Other Products";
}

function skuExistsOnAnotherProduct(sku, currentSourceSku) {
  const normalizedSku = normalizeUpc(sku);
  const normalizedSource = normalizeUpc(currentSourceSku);
  const catalogProduct = skuToProductMap.get(normalizedSku);
  if (catalogProduct && normalizeUpc(catalogProduct.sku) !== normalizedSource) return true;
  if (globalCustomProducts.some(product => {
    const customSku = normalizeUpc(product.sku);
    return customSku === normalizedSku && customSku !== normalizedSource;
  })) return true;
  return state.inventory.products.some(product => {
    const productSource = normalizeUpc(product.sourceSku || product.id);
    if (productSource === normalizedSource) return false;
    return normalizeUpc(product.id) === normalizedSku || productSource === normalizedSku;
  });
}

function moveProcessingSku(oldSku, newSku) {
  const oldNormalized = normalizeUpc(oldSku);
  const newNormalized = normalizeUpc(newSku);
  for (const collectionName of ["matched", "unmatched", "recommendations"]) {
    state.processing[collectionName] = (state.processing[collectionName] || []).map(item => {
      if (normalizeUpc(item.id) !== oldNormalized) return item;
      return { ...item, id: newNormalized };
    });
  }
}

function actionIcon(name) {
  if (name === "trash") {
    return `<svg class="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18"></path>
      <path d="M8 6V4h8v2"></path>
      <path d="M19 6l-1 14H6L5 6"></path>
      <path d="M10 11v6"></path>
      <path d="M14 11v6"></path>
    </svg>`;
  }
  return `<svg class="row-action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 20h4.5L19.2 9.3l-4.5-4.5L4 15.5V20Z"></path>
    <path d="M13.5 6 18 10.5"></path>
    <path d="M15.2 4.5 17 2.7a1.6 1.6 0 0 1 2.3 0l2 2a1.6 1.6 0 0 1 0 2.3l-1.8 1.8"></path>
  </svg>`;
}

function historyButton(product) {
  return `<button class="info-icon-button" data-action="showHistory" data-id="${escapeHtml(product.id)}" title="Inventory history" aria-label="Inventory history for ${escapeHtml(product.name)}">i</button>`;
}

function historySourceForField(field) {
  if (field === "quantity") return "manual_front_adjustment";
  if (field === "backstock") return "manual_backstock_adjustment";
  return "manual_adjustment";
}

function historyQuantityTypeForSource(source = "") {
  const text = String(source);
  if (text.includes("backstock") || text.includes("case")) return "case";
  return "unit";
}

function createInventoryAdjustment(product, changeAmount, quantityTypeOrSource = "unit", source = "manual_adjustment") {
  const amount = Math.trunc(Number(changeAmount || 0));
  if (!product || amount === 0) return null;
  const knownQuantityType = quantityTypeOrSource === "case" || quantityTypeOrSource === "unit";
  const quantityType = knownQuantityType ? quantityTypeOrSource : historyQuantityTypeForSource(quantityTypeOrSource);
  const resolvedSource = knownQuantityType ? source : quantityTypeOrSource;
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    storeNumber: currentStoreNumber || "",
    productId: product.id,
    productName: product.name || "Unnamed product",
    eventType: "adjustment",
    changeAmount: amount,
    quantityType,
    createdAt: new Date().toISOString(),
    userName: "",
    source: resolvedSource,
  };
}

async function commitInventoryAdjustment(entry, { warnOnFailure = false } = {}) {
  if (!entry) return false;
  state.inventoryHistory = [entry, ...(state.inventoryHistory || [])].slice(0, 5000);
  saveLocalBackup();
  const inserted = await insertSupabaseInventoryHistory(entry);
  if (!inserted && warnOnFailure) {
    setStatus("Transfer saved, but history could not be recorded.", true);
    showToast("Transfer saved, but history could not be recorded.");
  }
  return inserted;
}

function recordInventoryAdjustment(product, changeAmount, source = "manual_adjustment") {
  commitInventoryAdjustment(createInventoryAdjustment(product, changeAmount, historyQuantityTypeForSource(source), source));
}

function createInventoryTransfer(product, transferDirection, caseSize) {
  if (!product || (transferDirection !== "back_to_front" && transferDirection !== "front_to_back")) return null;
  const unitEquivalent = Math.max(1, parseWholeNumber(caseSize) || 12);
  return {
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    storeNumber: currentStoreNumber || "",
    productId: product.id,
    productName: product.name || "Unnamed product",
    eventType: "transfer",
    transferDirection,
    caseQuantity: 1,
    unitEquivalent,
    changeAmount: 0,
    quantityType: "case",
    createdAt: new Date().toISOString(),
    userName: "",
    source: "case_transfer",
  };
}

function historyEntriesForProduct(productId) {
  const id = normalizeUpc(productId);
  const cutoff = Date.now() - (14 * 24 * 60 * 60 * 1000);
  const storeNumber = selectedSupabaseStoreNumber();
  return (state.inventoryHistory || [])
    .filter(entry => normalizeUpc(entry.productId) === id)
    .filter(entry => cleanText(entry.storeNumber || storeNumber) === storeNumber)
    .filter(entry => !isClearedStockHistoryEntry(entry))
    .filter(entry => Date.parse(entry.createdAt) >= cutoff);
}

function groupedHistoryForProduct(productId) {
  const groups = new Map();
  for (const entry of historyEntriesForProduct(productId)) {
    const created = new Date(entry.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    const eventType = entry.eventType === "transfer" ? "transfer" : "adjustment";
    const dateKey = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;

    if (eventType === "transfer") {
      const transferDirection = entry.transferDirection === "front_to_back" ? "front_to_back" : "back_to_front";
      const unitEquivalent = Math.max(1, parseWholeNumber(entry.unitEquivalent) || 12);
      const key = `${normalizeUpc(entry.productId)}:${dateKey}:transfer:${transferDirection}:${unitEquivalent}`;
      const existing = groups.get(key) || {
        eventType,
        transferDirection,
        caseQuantity: 0,
        unitEquivalent,
        totalUnitEquivalent: 0,
        latestAt: entry.createdAt,
      };
      const caseQuantity = Math.max(1, parseWholeNumber(entry.caseQuantity) || 1);
      existing.caseQuantity += caseQuantity;
      existing.totalUnitEquivalent += unitEquivalent * caseQuantity;
      if (Date.parse(entry.createdAt) > Date.parse(existing.latestAt)) {
        existing.latestAt = entry.createdAt;
      }
      groups.set(key, existing);
      continue;
    }

    const direction = Number(entry.changeAmount || 0) >= 0 ? "added" : "removed";
    const quantityType = entry.quantityType === "case" ? "case" : "unit";
    const key = `${normalizeUpc(entry.productId)}:${dateKey}:adjustment:${direction}:${quantityType}`;
    const existing = groups.get(key) || {
      eventType,
      direction,
      quantityType,
      total: 0,
      latestAt: entry.createdAt,
    };
    existing.total += Math.abs(Number(entry.changeAmount || 0));
    if (Date.parse(entry.createdAt) > Date.parse(existing.latestAt)) {
      existing.latestAt = entry.createdAt;
    }
    groups.set(key, existing);
  }
  return [...groups.values()]
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

async function openInventoryHistory(product) {
  await loadSupabaseInventoryHistory(product.id);
  const groups = groupedHistoryForProduct(product.id);
  const listHtml = groups.length
    ? `<ul class="history-list">${groups.map(group => `
        <li>${historyGroupText(group)}</li>
      `).join("")}</ul>`
    : `<div class="empty-state">No inventory changes recorded in the last 14 days.</div>`;
  dom.historyModalBody.innerHTML = `
    <div class="history-product-name">${escapeHtml(product.name || "Unnamed product")}</div>
    <div class="small-muted">SKU ${escapeHtml(product.id)}</div>
    ${listHtml}
  `;
  dom.historyModal.hidden = false;
}

function closeInventoryHistory() {
  dom.historyModal.hidden = true;
  dom.historyModalBody.innerHTML = "";
}

function refreshProcessingFromActiveSales() {
  const active = state.sales.sessions.find(session => session.id === state.sales.activeSessionId);
  if (active?.salesRows?.length) {
    processSalesRows(active.salesRows);
    return;
  }
  recalculateRecommendations();
}

function handleOrderingChange(event) {
  const input = event.target;
  if (input.dataset.field !== "overrideCases") return;
  const product = getProduct(input.dataset.id);
  if (!product) return;
  product.overrideCases = input.value === "" ? "" : Math.max(0, parseWholeNumber(input.value));
  product.lastUpdated = new Date().toISOString();
  recalculateRecommendations();
  scheduleSave();
}

function applySalesDeduction() {
  const activeId = state.sales.activeSessionId;
  if (!activeId) {
    showToast("Load a sales file before applying deduction.");
    return;
  }
  if (state.processing.deductions.some(item => item.sessionId === activeId)) {
    showToast("Sales deduction already applied for this file.");
    return;
  }
  const matched = state.processing.matched || [];
  if (!matched.length) {
    showToast("No matched sales rows to deduct.");
    return;
  }
  const confirmed = confirm("Deduct Units Sold from Front inventory only? Backstock will not be changed.");
  if (!confirmed) return;

  let deductedUnits = 0;
  let shortageRows = 0;
  for (const row of matched) {
    const product = getProduct(row.id);
    if (!product) continue;
    const before = Number(product.quantity || 0);
    const units = Math.max(0, Math.ceil(row.unitsSold || 0));
    const deducted = Math.min(before, units);
    product.quantity = Math.max(0, before - units);
    recordInventoryAdjustment(product, product.quantity - before, "sales_deduction_front");
    product.lastUpdated = new Date().toISOString();
    deductedUnits += deducted;
    if (units > before) shortageRows += 1;
  }
  state.processing.deductions.unshift({
    sessionId: activeId,
    appliedAt: new Date().toISOString(),
    rows: matched.length,
    deductedUnits,
    shortageRows,
  });
  recalculateRecommendations();
  saveState();
  setStatus(`Deducted ${deductedUnits} units from Front. Backstock unchanged.`);
  showToast("Sales deduction applied.");
}

function clearSalesData() {
  if (!confirm("Clear all prior sales data? Inventory counts will not be changed.")) return;
  state.sales = { sessions: [], activeSessionId: null };
  state.uploads.sales = null;
  state.processing = { matched: [], unmatched: [], deductions: [], recommendations: [] };
  saveState();
  setStatus("Sales data cleared. Inventory was not changed.");
  showToast("Sales data cleared.");
}

function clearInventoryCounts() {
  if (!confirm("Clear all inventory count data? Product names and order lineup will remain.")) return;
  for (const product of state.inventory.products) {
    recordInventoryAdjustment(product, -Number(product.quantity || 0), "clear_front_count");
    recordInventoryAdjustment(product, -Number(product.backstock || 0), "clear_backstock_count");
    product.quantity = 0;
    product.backstock = 0;
    product.lastUpdated = new Date().toISOString();
  }
  recalculateRecommendations();
  saveState();
  setStatus("Inventory counts cleared.");
  showToast("Inventory count data cleared.");
}

async function clearStockHistoryForCurrentStore() {
  const storeNumber = selectedSupabaseStoreNumber();
  console.log("Clear Stock History clicked");
  console.log("Selected store for history clear:", currentStoreNumber);
  console.log("Selected store ID:", storeNumber);
  console.log("History source/table used by popup:", {
    localState: "state.inventoryHistory",
    supabaseTable: "inventory_adjustment_history",
  });
  if (!storeNumber) {
    showToast("Select or add a store before clearing stock history.");
    setStatus("Select or add a store before clearing stock history.", true);
    return;
  }
  if (stockHistoryClearInProgress) return;
  const confirmed = confirm("Clear Stock History?\n\nThis will remove stock addition and deduction history for the currently selected store only. Inventory counts will not be changed.");
  if (!confirmed) return;

  stockHistoryClearInProgress = true;
  dom.clearStockHistoryButton.disabled = true;
  setStatus("Clearing history...");
  console.log("Clearing stock history for store:", storeNumber);

  const previousHistory = [...(state.inventoryHistory || [])];
  const previousClearedAt = state.stockHistoryClearedAt || null;
  try {
    const deleteResult = await clearSupabaseStockAdjustmentHistory(storeNumber);
    const nextHistory = previousHistory.filter(entry => !isCurrentStoreStockAdjustment(entry, storeNumber));
    const removedLocalRows = previousHistory.length - nextHistory.length;
    state.stockHistoryClearedAt = new Date().toISOString();
    state.inventoryHistory = nextHistory;
    saveLocalBackup();
    const savedToSupabase = await saveStateNowToSupabase({ successMessage: "Stock history cleared for this store.", silent: true });
    closeInventoryHistory();
    render();
    console.log("History after clear:", state.inventoryHistory);
    if (deleteResult.missingTable && removedLocalRows === 0) {
      setStatus("Stock history is not available for this store. No history was cleared.", true);
      showToast("Stock history is not available for this store.");
    } else if (deleteResult.missingTable) {
      setStatus("Stock history cleared on this device. Shared history is not available for this store.", true);
      showToast("Stock history cleared on this device.");
    } else if (!savedToSupabase) {
      setStatus("Stock history cleared on this device. Use Save Progress again when online.", true);
      showToast("Stock history cleared on this device.");
    } else {
      setStatus("Stock history cleared for this store.");
      showToast("Stock history cleared for this store.");
    }
  } catch (error) {
    state.inventoryHistory = previousHistory;
    state.stockHistoryClearedAt = previousClearedAt;
    saveLocalBackup();
    console.error("Clear stock history failed:", error);
    console.error("Clear stock history failed details:", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      name: error?.name,
    });
    setStatus("Could not clear stock history.", true);
    showToast("Could not clear stock history.");
  } finally {
    stockHistoryClearInProgress = false;
    dom.clearStockHistoryButton.disabled = false;
  }
}

function isCurrentStoreStockAdjustment(entry, storeNumber) {
  const entryStore = cleanText(entry.storeNumber || storeNumber);
  if (entryStore !== cleanText(storeNumber)) return false;
  return (entry.eventType || "adjustment") !== "transfer";
}

async function clearSupabaseStockAdjustmentHistory(storeNumber) {
  const tableName = "inventory_adjustment_history";
  const supabase = await getSupabaseClient();
  const attempts = [
    {
      label: "store_number + event_type adjustment",
      filters: { store_number: storeNumber, event_type: "adjustment" },
      run: () => supabase
        .from(tableName)
        .delete()
        .eq("store_number", storeNumber)
        .eq("event_type", "adjustment")
        .select("id"),
      canFallback: error => isMissingSupabaseColumnError(error, "event_type"),
    },
    {
      label: "store_number + transfer_direction is null",
      filters: { store_number: storeNumber, transfer_direction: null },
      run: () => supabase
        .from(tableName)
        .delete()
        .eq("store_number", storeNumber)
        .is("transfer_direction", null)
        .select("id"),
      canFallback: error => isMissingSupabaseColumnError(error, "transfer_direction"),
    },
    {
      label: "store_number + change_amount present",
      filters: { store_number: storeNumber, change_amount: "not null" },
      run: () => supabase
        .from(tableName)
        .delete()
        .eq("store_number", storeNumber)
        .not("change_amount", "is", null)
        .select("id"),
      canFallback: () => false,
    },
  ];

  for (const attempt of attempts) {
    console.log("Deleting adjustment history with filters:", attempt.filters);
    console.log("Clearing stock history with:", {
      selectedStore: currentStoreNumber,
      selectedStoreId: storeNumber,
      tableName,
      filters: attempt.filters,
    });
    const { data, error } = await attempt.run();
    console.log("Clear stock history result:", { attempt: attempt.label, data, error });
    if (!error) return { rows: data || [] };
    if (isMissingSupabaseTableError(error, tableName)) {
      console.warn("Stock history is not set up yet:", error);
      return { rows: [], missingTable: true, error };
    }
    if (attempt.canFallback(error)) {
      console.warn(`Clear stock history fallback after ${attempt.label} failed:`, error);
      continue;
    }
    throw error;
  }

  return { rows: [] };
}

async function clearAllSaleFlags() {
  if (saleClearInProgress) return;
  if (!confirm("Clear All Sales?\n\nThis will remove sale status from every item in every store. Inventory counts will not be changed.")) return;
  saleClearInProgress = true;
  renderDefaultStoreSettings();
  setStatus("Clearing sales...");
  try {
    await clearGlobalSaleFlags();
    for (const product of state.inventory.products) {
      setProductSaleFields(product, false);
      product.lastUpdated = new Date().toISOString();
    }
    state.settings.showSaleOnly = false;
    recalculateRecommendations();
    render();
    saveLocalBackup();
    setStatus("All sales cleared.");
    showToast("All sales cleared.");
  } catch (error) {
    console.error("Clear sale flags failed:", error);
    showSupabaseError(error);
    setStatus("Could not clear sales.", true);
    showToast("Could not clear sales.");
  } finally {
    saleClearInProgress = false;
    renderDefaultStoreSettings();
  }
}

function clearAllLocalData() {
  if (!currentStoreNumber) {
    showToast("Select or add a store before clearing store data.");
    return;
  }
  if (!confirm(`Clear all saved data for Store ${currentStoreNumber}? This will also sync the cleared state when available.`)) return;
  localStorage.removeItem(storageKeyForStore(currentStoreNumber));
  state = defaultState();
  render();
  saveState();
  setStatus(`Store ${currentStoreNumber} data cleared.`);
  showToast("Store data cleared.");
}

async function clearAppCache() {
  if (!confirm("Clear cached app files and reload? Saved store data will not be deleted.")) return;
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    setStatus("Cache cleared. Reloading...");
    showToast("Cache cleared.");
    location.reload(true);
  } catch (error) {
    console.error("Cache clear failed:", error);
    setStatus(`Cache clear failed: ${error?.message || "Unknown error"}`, true);
  }
}

function openHelpGuide() {
  window.open("assets/help/user_guide.pdf", "_blank", "noopener");
}

function exportInventoryCsv() {
  const rows = [["Product Name", "SKU / ID", "Quantity", "Backstock Cases", "Last Updated", "Notes"]];
  for (const product of sortProducts(state.inventory.products)) {
    rows.push([
      product.name,
      product.id,
      product.quantity || 0,
      product.backstock || 0,
      product.lastUpdated || "",
      product.notes || "",
    ]);
  }
  downloadCsv(`inventory_export_${fileTimestamp()}.csv`, rows);
}

function exportOrdersCsv() {
  const rows = [["JDE/UPC", "Description", "Units Sold", "Units Per Case", "Total Units On Hand", "Weeks of Product", "Order Cases", "Unit Order", "Status", "Notes"]];
  for (const item of state.processing.recommendations || []) {
    rows.push([
      item.id,
      item.name,
      item.unitsSold,
      item.unitsPerCase,
      formatOrderingNumber(item.totalUnitsOnHand),
      formatWeeksOfStock(item),
      item.orderCases,
      item.unitOrder,
      item.status,
      item.notes || "",
    ]);
  }
  downloadCsv(`order_recommendations_${fileTimestamp()}.csv`, rows);
}

function downloadCsv(fileName, rows) {
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`Exported ${fileName}.`);
}

function quantityControl(id, field, value) {
  return `<span class="quantity-control">
    <button data-action="adjust" data-field="${field}" data-id="${escapeHtml(id)}" data-delta="-1">-</button>
    <input type="number" min="0" data-field="${field}" data-id="${escapeHtml(id)}" value="${Number(value || 0)}" />
    <button data-action="adjust" data-field="${field}" data-id="${escapeHtml(id)}" data-delta="1">+</button>
  </span>`;
}

function transferControl(product) {
  const caseSize = unitsPerCaseForProduct(product);
  const isSaving = transferringProductIds.has(product.id);
  const backstockCases = Math.max(0, parseWholeNumber(product.backstock));
  const frontUnits = Math.max(0, parseWholeNumber(product.quantity));
  const backToFrontDisabled = isSaving || backstockCases <= 0;
  const frontToBackDisabled = isSaving || frontUnits < caseSize;
  return `<span class="transfer-control" title="1 case = ${caseSize} units">
    <button class="transfer-button" data-action="transferCase" data-direction="back_to_front" data-id="${escapeHtml(product.id)}" ${backToFrontDisabled ? "disabled" : ""} title="Move 1 case to front stock" aria-label="Move 1 case from backstock to front stock">&#9654;</button>
    <button class="transfer-button" data-action="transferCase" data-direction="front_to_back" data-id="${escapeHtml(product.id)}" ${frontToBackDisabled ? "disabled" : ""} title="Move 1 case to backstock" aria-label="Move 1 case from front stock to backstock">&#9664;</button>
  </span>`;
}

function unitsPerCaseForProduct(product) {
  const explicitFields = [
    product?.unitsPerCase,
    product?.units_per_case,
    product?.caseSize,
    product?.case_size,
    product?.bottlesPerCase,
    product?.bottles_per_case,
    product?.packSize,
    product?.pack_size,
  ];
  for (const value of explicitFields) {
    const parsed = parseWholeNumber(value);
    if (parsed > 0) return parsed;
    const parsedPack = parseCaseSize(value);
    if (parsedPack) return parsedPack;
  }

  const recommendation = (state.processing.recommendations || []).find(item => {
    const itemId = normalizeUpc(item.id);
    return itemId === normalizeUpc(product?.id) || itemId === normalizeUpc(product?.sourceSku);
  });
  if (recommendation?.unitsPerCase) {
    const parsed = parseWholeNumber(recommendation.unitsPerCase);
    if (parsed > 0) return parsed;
  }

  const parsedFromText = parseCaseSize(`${product?.pack || ""} ${product?.name || ""}`);
  if (parsedFromText) return parsedFromText;

  console.warn("Missing case size for product, defaulting to 12", product);
  return 12;
}

function saleBadge(item) {
  return item?.onSale ? ` <span class="sale-badge">ON SALE</span>` : "";
}

function formatWeeksOfStock(item) {
  const label = cleanText(item?.weeksOfProductLabel || "");
  if (label) return label;
  return orderingWeeksInfo({
    averageWeeklySales: item?.unitsSold,
    totalUnitsOnHand: item?.totalUnitsOnHand,
    needsReview: item?.weeksStatus === "needs-review",
  }).label;
}

function sortProducts(products) {
  return [...products].sort((a, b) => {
    const aOrder = productCategoryInfo(a);
    const bOrder = productCategoryInfo(b);
    const aCategory = aOrder?.categoryIndex ?? 99;
    const bCategory = bOrder?.categoryIndex ?? 99;
    if (aCategory !== bCategory) return aCategory - bCategory;
    const aItem = aOrder?.itemIndex ?? 9999;
    const bItem = bOrder?.itemIndex ?? 9999;
    if (aItem !== bItem) return aItem - bItem;
    return (a.name || "").localeCompare(b.name || "");
  });
}

function getProduct(id) {
  const normalized = normalizeUpc(id);
  return state.inventory.products.find(product => normalizeUpc(product.id) === normalized);
}

function productCategoryInfo(productOrId) {
  if (!productOrId) return null;
  const directId = typeof productOrId === "object"
    ? normalizeUpc(productOrId.id)
    : normalizeUpc(productOrId);
  const sourceSku = typeof productOrId === "object"
    ? normalizeUpc(productOrId.sourceSku || productOrId.id)
    : directId;
  const fixed = fixedProductOrderIndex.get(sourceSku) || fixedProductOrderIndex.get(directId);
  if (fixed) {
    return {
      name: fixed.category,
      categoryIndex: fixed.categoryIndex,
      itemIndex: fixed.itemIndex,
      globalIndex: fixed.globalIndex,
    };
  }
  const customInfo = customProductCategoryInfo(sourceSku) || customProductCategoryInfo(directId);
  if (customInfo) return customInfo;
  return categoryByUpc.get(sourceSku) || categoryByUpc.get(directId) || null;
}

function customProductCategoryInfo(sku) {
  const normalizedSku = normalizeUpc(sku);
  if (!normalizedSku) return null;
  const product = globalCustomProducts.find(item => normalizeUpc(item.sku) === normalizedSku);
  if (!product || !CATEGORY_ORDER.includes(product.category)) return null;
  const categoryIndex = CATEGORY_ORDER.indexOf(product.category);
  const builtInCount = PRODUCT_CATALOG.filter(item => item.category === product.category).length;
  const customInCategory = globalCustomProducts
    .filter(item => item.category === product.category)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  const customIndex = Math.max(0, customInCategory.findIndex(item => normalizeUpc(item.sku) === normalizedSku));
  return {
    name: product.category,
    categoryIndex,
    itemIndex: builtInCount + customIndex,
    globalIndex: PRODUCT_CATALOG.length + globalCustomProducts.findIndex(item => normalizeUpc(item.sku) === normalizedSku),
  };
}

function resolveSku(value) {
  const sku = normalizeUpc(value);
  if (!sku) return "";
  const alias = normalizeUpc(state.skuAliases?.[sku]);
  if (alias) return alias;
  const override = state.productOverrides?.[sku];
  if (override?.sku) return normalizeUpc(override.sku);
  return sku;
}

function cssEscape(value) {
  if (window.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/["\\]/g, "\\$&");
}

function findColumn(header, aliases) {
  const normalizedAliases = aliases.flatMap(headerVariants);
  return header.findIndex(value => {
    const variants = headerVariants(value);
    return variants.some(variant => normalizedAliases.includes(variant));
  });
}

function columnOrFallback(header, aliases, fallback) {
  const found = findColumn(header, aliases);
  return found >= 0 ? found : fallback;
}

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/#/g, "")
    .replace(/[\/\-_]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return cleanText(value).toLowerCase();
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/[^a-z0-9.]+/g, "");
}

function compactHeader(value) {
  return normalizeHeader(value).replace(/\s+/g, "");
}

function headerVariants(value) {
  return [normalizeHeader(value), compactHeader(value)].filter(Boolean);
}

function detectedHeaderSummary(header) {
  const detected = header.map(cleanText).filter(Boolean);
  if (!detected.length) return "none";
  const preview = detected.slice(0, 12).join(", ");
  return detected.length > 12 ? `${preview}...` : preview;
}

function normalizeUpc(value) {
  let text = cleanText(value);
  if (/^\d+\.0$/.test(text)) text = text.slice(0, -2);
  return text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Legacy safety shim for older cached app shells that may still call the old
// realtime helper name before the latest script fully replaces their cache.
async function subscribeToStore(storeNumber) {
  return subscribeToCurrentStore(storeNumber);
}

function parseWholeNumber(value) {
  const parsed = Math.floor(Number(String(value ?? "").replace(/,/g, "")));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseNumber(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCaseSize(value) {
  const text = cleanText(value);
  const packMatch = text.match(/(?:^|[^\d.])\d+(?:\.\d+)?\s*\/\s*(\d+(?:\.\d+)?)/);
  if (packMatch) return Number(packMatch[1]);
  const rules = [
    [/\b750\s*m\s*l\b|\b750ml\b/i, 12],
    [/\b1\s*l\b|\b1l\b/i, 12],
    [/\b355\s*m\s*l\b|\b355ml\b/i, 24],
    [/\b200\s*m\s*l\b|\b200ml\b/i, 24],
    [/\b1\.5\s*l\b|\b1\.5l\b/i, 6],
    [/\b4\s*l\b|\b4l\b/i, 4],
  ];
  for (const [pattern, size] of rules) {
    if (pattern.test(text)) return size;
  }
  return null;
}

function looksLikeCode(value) {
  const text = cleanText(value);
  return /^[0-9]{5,}$/.test(text) || /^[A-Z0-9]{5,}$/.test(text);
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function setStatus(message, isError = false) {
  dom.statusBanner.textContent = message;
  dom.statusBanner.classList.toggle("error", isError);
}

function showStoreLoadError(error) {
  console.error("Store loading error:", error);
  dom.statusBanner.innerHTML = `
    <span>Stores could not be loaded. Check your connection and try again.</span>
    <button id="retryStoreLoadButton" class="secondary-button status-retry-button" type="button">Retry</button>
  `;
  dom.statusBanner.classList.add("error");
}

function showSupabaseError(error) {
  console.error("Supabase error:", error);
  console.error("Supabase error details:", {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    name: error?.name,
  });
  setStatus("Cloud sync error. Your changes are saved on this device.", true);
}

function setSyncStatus(message) {
  syncStatus = message;
  renderSyncStatus();
}

function syncStatusClass(message) {
  if (message.includes("synced") || message.includes("loaded") || message.includes("updated")) return "synced";
  if (message.includes("Saving Store") || message.includes("Loading Store") || message.includes("Listening for live updates")) return "syncing";
  if (message === "Offline mode") return "syncing";
  if (message.includes("Sync failed")) return "error";
  return "local";
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  setTimeout(() => dom.toast.classList.remove("show"), 2400);
}

function activateTab(name) {
  document.querySelectorAll(".tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === name);
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `${name}Tab`);
  });
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatOrderingNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "Needs review";
  return formatNumber(number);
}

function formatDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHistoryDateTime(value) {
  return new Date(value).toLocaleString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function historyQuantityLabel(quantityType, amount) {
  const singular = quantityType === "case" ? "case" : "unit";
  return Number(amount) === 1 ? singular : `${singular}s`;
}

function historyGroupText(group) {
  if (group.eventType === "transfer") {
    const directionText = group.transferDirection === "front_to_back"
      ? "from front stock to backstock"
      : "from backstock to front stock";
    const cases = Math.max(1, Number(group.caseQuantity || 0));
    const units = Math.max(1, Number(group.totalUnitEquivalent || group.unitEquivalent || 0));
    return `<strong>${formatNumber(cases)}</strong> ${historyQuantityLabel("case", cases)} moved ${directionText} on ${formatHistoryDateTime(group.latestAt)} <span class="small-muted">(${formatNumber(units)} ${historyQuantityLabel("unit", units)})</span>`;
  }
  return `<strong>${formatNumber(group.total)}</strong> ${historyQuantityLabel(group.quantityType, group.total)} ${group.direction} on ${formatHistoryDateTime(group.latestAt)}`;
}

function fileTimestamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}${min}`;
}

function datasetId(fileName, rowCount, timestamp) {
  return `${fileName.toLowerCase()}|${rowCount}|${timestamp}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readableError(error) {
  return error?.message || "The file could not be loaded. Check the format and try again.";
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      // Offline caching is a convenience only; the app still works without it.
    });
  });
}







