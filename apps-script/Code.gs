/**
 * Graham Bytes Web App backend for Google Apps Script.
 * Deploy as Web App:
 * - Execute as: Me
 * - Who has access: Anyone
 */

const API_KEY = '4e1675f34ce90c629fbbb5b8dcf218dea20ece5db37e022f2d6676a6c77bb44f';
const SPREADSHEET_ID = ''; // Optional: put your Sheet ID here if this script is standalone.
const BACKEND_VERSION = 'orders-columns-v5-strict-write-2026-02-21';
const ORDER_DEDUPE_TTL_SECONDS = 180;

const SHEET_CONFIG = {
  orders: ['id', 'timestamp', 'userId', 'flavor', 'size', 'toppings', 'quantity', 'price'],
  points: ['timestamp', 'userId', 'points']
};

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};
    validateKey_(params.key);

    const route = String(params.route || '').toLowerCase();
    if (route === 'health') return handleHealth_();
    if (route === 'init') return handleInit_();
    if (route === 'orders') return handleGetOrders_(params);
    if (route === 'points') return handleGetPoints_(params);

    return jsonOutput_({ error: 'Invalid route.' });
  } catch (error) {
    return jsonOutput_({ error: error.message || String(error) });
  }
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    validateKey_(body.key);

    const route = String(((e && e.parameter && e.parameter.route) || body.route || '')).toLowerCase();
    if (route === 'init') return handleInit_();
    if (route === 'orders') {
      const intent = normalizeText_(body.intent || body.action).toLowerCase();
      const maybeItems = normalizeItems_(body.items);
      const hasItems = Array.isArray(maybeItems) && maybeItems.length > 0;
      const hasUser = !!normalizeText_(body.userId);

      // Allow POST-based fetch only when explicitly non-write or no items.
      if (intent === 'fetch' || (!hasItems && hasUser)) {
        return handleGetOrders_(body);
      }

      // Strict write gate: only explicit create intent can write.
      if (intent !== 'create') {
        throw new Error('Orders POST blocked. Use GET for history, or POST with intent=create for writes.');
      }

      return handlePostOrder_(body);
    }
    if (route === 'points') return handlePostPoints_(body);

    return jsonOutput_({ error: 'Invalid route.' });
  } catch (error) {
    return jsonOutput_({ error: error.message || String(error) });
  }
}

function handleInit_() {
  const orders = getOrCreateSheet_('orders');
  const points = getOrCreateSheet_('points');

  return jsonOutput_({
    ok: true,
    route: 'init',
    backendVersion: BACKEND_VERSION,
    sheets: {
      orders: String(orders.getName()),
      points: String(points.getName())
    }
  });
}

function handleHealth_() {
  const orders = getOrCreateSheet_('orders');
  const points = getOrCreateSheet_('points');
  const ordersHeader = getHeaderMap_(orders).headers;
  const pointsHeader = getHeaderMap_(points).headers;

  return jsonOutput_({
    ok: true,
    route: 'health',
    backendVersion: BACKEND_VERSION,
    ordersHeaders: ordersHeader,
    pointsHeaders: pointsHeader
  });
}

/**
 * Run this once from Apps Script editor (Run button) to create required tabs.
 */
function setupGrahamBytesSheets() {
  getOrCreateSheet_('orders');
  getOrCreateSheet_('points');
}

/**
 * Optional one-time migration:
 * Converts legacy orders rows that stored JSON in "items"/"itemsJson"
 * into column-based rows: id,timestamp,userId,flavor,size,toppings,quantity,price
 */
function migrateLegacyOrdersRows() {
  const sheet = getOrCreateSheet_('orders');
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return;

  const headers = values[0].map(function (h) { return String(h || '').trim().toLowerCase(); });
  const idx = {
    id: headers.indexOf('id'),
    timestamp: headers.indexOf('timestamp'),
    userId: headers.indexOf('userid'),
    flavor: headers.indexOf('flavor'),
    size: headers.indexOf('size'),
    toppings: headers.indexOf('toppings'),
    quantity: headers.indexOf('quantity') >= 0 ? headers.indexOf('quantity') : headers.indexOf('qty'),
    price: headers.indexOf('price'),
    items: headers.indexOf('items') >= 0 ? headers.indexOf('items') : headers.indexOf('itemsjson')
  };

  const output = [SHEET_CONFIG.orders];

  for (var r = 1; r < values.length; r++) {
    const row = values[r];

    const hasColumnShape = idx.flavor >= 0 && idx.size >= 0 && idx.quantity >= 0 && idx.price >= 0;
    const flavor = hasColumnShape ? String(row[idx.flavor] || '').trim() : '';

    // Already in column format, keep it.
    if (flavor) {
      output.push([
        String((idx.id >= 0 ? row[idx.id] : '') || Utilities.getUuid()),
        row[idx.timestamp] || '',
        row[idx.userId] || '',
        row[idx.flavor] || '',
        row[idx.size] || '',
        row[idx.toppings] || '',
        row[idx.quantity] || 1,
        row[idx.price] || 0
      ]);
      continue;
    }

    // Legacy JSON row.
    if (idx.items < 0) continue;
    const items = parseJsonSafe_(String(row[idx.items] || ''), []);
    if (!Array.isArray(items) || !items.length) continue;

    const timestamp = idx.timestamp >= 0 ? row[idx.timestamp] : new Date().toISOString();
    const userId = idx.userId >= 0 ? row[idx.userId] : '';
    const orderId = idx.id >= 0 && row[idx.id] ? String(row[idx.id]) : Utilities.getUuid();

    items.forEach(function (rawItem) {
      const item = normalizeOrderItem_(rawItem);
      output.push([
        orderId,
        timestamp,
        userId,
        item.flavor,
        item.size,
        item.toppings,
        item.quantity,
        item.price
      ]);
    });
  }

  sheet.clearContents();
  sheet.getRange(1, 1, output.length, output[0].length).setValues(output);
}

function handlePostOrder_(body) {
  const intent = normalizeText_(body.intent || body.action).toLowerCase();
  if (intent !== 'create') {
    throw new Error('Order write rejected. Missing intent=create.');
  }

  const userId = normalizeText_(body.userId);
  const items = normalizeItems_(body.items);
  const clientOrderId = normalizeText_(body.clientOrderId || body.orderId);

  if (!userId) throw new Error('userId is required.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('items is required.');

  const sheet = getOrCreateSheet_('orders');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    let schema = ensureOrdersSchemaReady_(sheet);
    const orderId = clientOrderId || Utilities.getUuid();

    // Idempotency check inside lock to avoid race-condition duplicates.
    if (clientOrderId) {
      const existing = findOrderSummaryById_(sheet, orderId, userId, schema);
      if (existing) {
        return jsonOutput_({
          ok: true,
          route: 'orders',
          id: orderId,
          timestamp: existing.timestamp,
          total: existing.total,
          deduped: true
        });
      }
    }

    const timestamp = new Date().toISOString();
    const filteredItems = items.filter(function (it) {
      if (!it) return false;
      const nameOrFlavor = normalizeText_(it.name || it.flavor);
      const qty = Math.max(0, Math.round(Number(it.qty || it.quantity || 0) || 0));
      const price = Number(it.price || 0) || 0;
      return !!nameOrFlavor || qty > 0 || price > 0;
    });

    if (!filteredItems.length) throw new Error('No valid items to create order.');

    const normalizedItems = filteredItems.map(function (rawItem) {
      return normalizeOrderItem_(rawItem);
    });

    const total = Number(normalizedItems.reduce(function (sum, item) {
      return sum + (item.quantity * item.price);
    }, 0).toFixed(2));

    // Additional server-side dedupe: same user + same payload + same total in short window.
    const dedupeFingerprint = buildOrderFingerprint_(userId, normalizedItems, total);
    const cachedOrderId = getCachedOrderIdByFingerprint_(dedupeFingerprint);
    if (cachedOrderId) {
      const existingByFingerprint = findOrderSummaryById_(sheet, cachedOrderId, userId, schema);
      if (existingByFingerprint) {
        return jsonOutput_({
          ok: true,
          route: 'orders',
          id: cachedOrderId,
          timestamp: existingByFingerprint.timestamp,
          total: existingByFingerprint.total,
          deduped: true,
          dedupeSource: 'fingerprint'
        });
      }
    }

    var appended = 0;

    normalizedItems.forEach(function (item) {

      if (schema.isNew) {
        const row = new Array(schema.headers.length).fill('');
        row[schema.idx.id] = orderId;
        row[schema.idx.timestamp] = timestamp;
        row[schema.idx.userId] = userId;
        row[schema.idx.flavor] = item.flavor;
        row[schema.idx.size] = item.size;
        row[schema.idx.toppings] = item.toppings;
        row[schema.idx.quantity] = item.quantity;
        row[schema.idx.price] = item.price;
        sheet.appendRow(row);
        appended += 1;
        return;
      }

      // Legacy fallback schema: id,timestamp,userId,items,total,status
      const legacyRow = new Array(schema.headers.length).fill('');
      legacyRow[schema.idx.id] = orderId;
      legacyRow[schema.idx.timestamp] = timestamp;
      legacyRow[schema.idx.userId] = userId;
      legacyRow[schema.idx.items] = JSON.stringify([{
        name: item.flavor + (item.size ? ' - ' + item.size : ''),
        flavor: item.flavor,
        size: item.size,
        toppings: item.toppings ? item.toppings.split(/\s*,\s*/).filter(Boolean) : [],
        qty: item.quantity,
        price: item.price
      }]);
      legacyRow[schema.idx.total] = item.quantity * item.price;
      if (schema.idx.status >= 0) legacyRow[schema.idx.status] = 'submitted';
      sheet.appendRow(legacyRow);
      appended += 1;
    });

    cacheOrderFingerprint_(dedupeFingerprint, orderId);

    return jsonOutput_({
      ok: true,
      route: 'orders',
      id: orderId,
      timestamp: timestamp,
      total: total,
      appendedRows: appended
    });
  } finally {
    lock.releaseLock();
  }
}

function findOrderSummaryById_(sheet, orderId, userId, schemaArg) {
  const schema = schemaArg || getOrdersSchema_(sheet);
  if (!schema || (!schema.isNew && !schema.isLegacy)) return null;

  const targetOrderId = normalizeText_(orderId);
  const targetUserId = normalizeUserId_(userId);
  const rows = readBodyRows_(sheet);
  var summary = null;

  rows.forEach(function (row) {
    const rowOrderId = normalizeText_(row[schema.idx.id]);
    const rowUserId = normalizeUserId_(row[schema.idx.userId]);
    if (!rowOrderId || rowOrderId !== targetOrderId) return;
    if (!rowUserId || rowUserId !== targetUserId) return;

    if (!summary) {
      summary = {
        timestamp: row[schema.idx.timestamp] || null,
        total: 0
      };
    }

    if (schema.isNew) {
      const quantity = Math.max(1, Math.round(toNumber_(row[schema.idx.quantity]) || 1));
      const price = Math.max(0, toNumber_(row[schema.idx.price]) || 0);
      summary.total += quantity * price;
      return;
    }

    summary.total += Math.max(0, toNumber_(row[schema.idx.total]) || 0);
  });

  if (!summary) return null;
  summary.total = Number(summary.total.toFixed(2));
  return summary;
}

function handleGetOrders_(params) {
  const userId = normalizeText_(params.userId);
  if (!userId) throw new Error('userId is required.');

  const sheet = getOrCreateSheet_('orders');
  const schema = ensureOrdersSchemaReady_(sheet);
  const requestedUser = normalizeUserId_(userId);
  const rows = readBodyRows_(sheet);
  const grouped = {};

  rows.forEach(function (row) {
    const rowUserId = normalizeUserId_(row[schema.idx.userId]);
    if (!rowUserId || rowUserId !== requestedUser) {
      return;
    }

    if (schema.isNew) {
      const id = normalizeText_(row[schema.idx.id]) || ('generated-' + Utilities.getUuid());
      const timestamp = row[schema.idx.timestamp] || '';
      const flavor = normalizeText_(row[schema.idx.flavor]);
      const size = normalizeText_(row[schema.idx.size]);
      const toppingsText = normalizeText_(row[schema.idx.toppings]);
      const quantity = Math.max(1, Math.round(toNumber_(row[schema.idx.quantity]) || 1));
      const price = Math.max(0, toNumber_(row[schema.idx.price]) || 0);

      if (!grouped[id]) {
        grouped[id] = {
          id: id,
          timestamp: timestamp,
          userId: userId,
          items: [],
          total: 0,
          status: 'submitted'
        };
      }

      grouped[id].items.push({
        name: flavor + (size ? ' - ' + size : ''),
        flavor: flavor,
        size: size,
        toppings: toppingsText ? toppingsText.split(/\s*[;,]\s*/).filter(Boolean) : [],
        qty: quantity,
        price: price
      });
      grouped[id].total += quantity * price;
      return;
    }

    // Legacy format: id,timestamp,userId,items,total,status
    const legacyId = normalizeText_(row[schema.idx.id]) || ('legacy-' + Utilities.getUuid());
    const legacyItems = parseJsonSafe_(row[schema.idx.items], []);
    grouped[legacyId] = {
      id: legacyId,
      timestamp: row[schema.idx.timestamp] || '',
      userId: userId,
      items: Array.isArray(legacyItems) ? legacyItems : [],
      total: Math.max(0, toNumber_(row[schema.idx.total]) || 0),
      status: normalizeText_(row[schema.idx.status] || 'submitted') || 'submitted'
    };
  });

  const orders = Object.keys(grouped)
    .map(function (key) {
      const order = grouped[key];
      order.total = Number((toNumber_(order.total) || 0).toFixed(2));
      return order;
    })
    .sort(function (a, b) {
      return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
    });

  return jsonOutput_({ orders: orders });
}

function getOrdersSchema_(sheet) {
  const header = getHeaderMap_(sheet);
  const idx = {
    id: getHeaderIndex_(header.indexByName, ['id']),
    timestamp: getHeaderIndex_(header.indexByName, ['timestamp', 'createdat', 'created_at']),
    userId: getHeaderIndex_(header.indexByName, ['userid', 'user_id']),
    flavor: getHeaderIndex_(header.indexByName, ['flavor']),
    size: getHeaderIndex_(header.indexByName, ['size']),
    toppings: getHeaderIndex_(header.indexByName, ['toppings']),
    quantity: getHeaderIndex_(header.indexByName, ['quantity', 'qty']),
    price: getHeaderIndex_(header.indexByName, ['price']),
    items: getHeaderIndex_(header.indexByName, ['items', 'itemsjson']),
    total: getHeaderIndex_(header.indexByName, ['total']),
    status: getHeaderIndex_(header.indexByName, ['status'])
  };

  const isNew = idx.id >= 0
    && idx.timestamp >= 0
    && idx.userId >= 0
    && idx.flavor >= 0
    && idx.size >= 0
    && idx.toppings >= 0
    && idx.quantity >= 0
    && idx.price >= 0;

  const isLegacy = idx.id >= 0
    && idx.timestamp >= 0
    && idx.userId >= 0
    && idx.items >= 0
    && idx.total >= 0;

  return {
    headers: header.headers,
    idx: idx,
    isNew: isNew,
    isLegacy: isLegacy
  };
}

function ensureOrdersSchemaReady_(sheet) {
  let schema = getOrdersSchema_(sheet);
  if (schema.isNew) return schema;

  // Auto-migrate known legacy layout once.
  if (schema.isLegacy) {
    migrateLegacyOrdersRows();
    schema = getOrdersSchema_(sheet);
    if (schema.isNew) return schema;
  }

  throw new Error(
    'Orders sheet headers are unsupported. Expected columns: ' +
    SHEET_CONFIG.orders.join(', ')
  );
}

function getHeaderMap_(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function (h) { return normalizeText_(h).toLowerCase(); });

  const indexByName = {};
  headers.forEach(function (h, idx) {
    if (!h || indexByName[h] !== undefined) return;
    indexByName[h] = idx;
  });

  return { headers: headers, indexByName: indexByName };
}

function getHeaderIndex_(indexByName, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    const key = normalizeText_(candidates[i]).toLowerCase();
    if (key && indexByName[key] !== undefined) {
      return indexByName[key];
    }
  }
  return -1;
}

function handlePostPoints_(body) {
  const userId = String(body.userId || '').trim();
  const points = Math.round(toNumber_(body.points));

  if (!userId) throw new Error('userId is required.');
  if (!isFinite(points)) throw new Error('points is required.');

  const sheet = getOrCreateSheet_('points');
  const timestamp = new Date().toISOString();
  sheet.appendRow([timestamp, userId, points]);

  const total = getPointsTotalForUser_(sheet, userId);
  return jsonOutput_({
    ok: true,
    route: 'points',
    points: total
  });
}

function handleGetPoints_(params) {
  const userId = String(params.userId || '').trim();
  if (!userId) throw new Error('userId is required.');

  const sheet = getOrCreateSheet_('points');
  const total = getPointsTotalForUser_(sheet, userId);

  return jsonOutput_({ points: total });
}

function getPointsTotalForUser_(sheet, userId) {
  const header = getHeaderMap_(sheet);
  var userIdCol = getHeaderIndex_(header.indexByName, ['userid', 'user_id']);
  var pointsCol = getHeaderIndex_(header.indexByName, ['points', 'balance']);
  if (userIdCol < 0) userIdCol = 1;
  if (pointsCol < 0) pointsCol = 2;
  const requestedUser = normalizeUserId_(userId);

  return readBodyRows_(sheet).reduce(function (sum, row) {
    if (normalizeUserId_(row[userIdCol]) !== requestedUser) return sum;
    return sum + (toNumber_(row[pointsCol]) || 0);
  }, 0);
}

function getOrCreateSheet_(name) {
  const ss = getSpreadsheet_();
  const normalized = String(name).toLowerCase();

  let sheet = ss.getSheets().find(function (s) {
    return String(s.getName()).toLowerCase() === normalized;
  });

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const headers = SHEET_CONFIG[normalized];
  if (!headers) throw new Error('Missing sheet config for ' + name);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }

  return sheet;
}

function readBodyRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  const lastCol = sheet.getLastColumn();
  return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID) return SpreadsheetApp.openById(SPREADSHEET_ID);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('Spreadsheet not configured. Set SPREADSHEET_ID.');
  return active;
}

function parseBody_(e) {
  const params = (e && e.parameter) || {};
  const raw = String((e && e.postData && e.postData.contents) || '').trim();

  if (!raw) return params;

  const asJson = parseJsonSafe_(raw, null);
  if (asJson && typeof asJson === 'object') {
    return Object.assign({}, params, asJson);
  }

  // Fallback for form-encoded body sent as plain text.
  const form = {};
  raw.split('&').forEach(function (pair) {
    const idx = pair.indexOf('=');
    const rawKey = idx >= 0 ? pair.slice(0, idx) : pair;
    const rawVal = idx >= 0 ? pair.slice(idx + 1) : '';
    const key = decodeURIComponent(rawKey || '').trim();
    const val = decodeURIComponent((rawVal || '').replace(/\+/g, ' '));
    if (key) form[key] = val;
  });

  if (form.items) {
    form.items = parseJsonSafe_(form.items, form.items);
  }

  return Object.assign({}, params, form);
}

function normalizeItems_(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return parseJsonSafe_(value, []);
  return [];
}

function normalizeOrderItem_(item) {
  const obj = (item && typeof item === 'object') ? item : {};
  const flavor = String(obj.flavor || obj.name || 'Unknown').trim();
  const size = String(obj.size || 'Standard').trim();
  const toppingsList = Array.isArray(obj.toppings) ? obj.toppings : [];
  const toppings = toppingsList.length ? toppingsList.join(', ') : String(obj.toppings || 'None').trim();
  const quantity = Math.max(1, Math.round(toNumber_(obj.qty || obj.quantity || 1) || 1));
  const price = Math.max(0, toNumber_(obj.price) || 0);

  return {
    flavor: flavor || 'Unknown',
    size: size || 'Standard',
    toppings: toppings || 'None',
    quantity: quantity,
    price: price
  };
}

function validateKey_(key) {
  if (!key || String(key) !== API_KEY) throw new Error('Invalid API key.');
}

function toNumber_(value) {
  const num = Number(value);
  return isFinite(num) ? num : NaN;
}

function parseJsonSafe_(text, fallbackValue) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return fallbackValue;
  }
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function normalizeText_(value) {
  return String(value || '').trim();
}

function normalizeUserId_(value) {
  return normalizeText_(value).toLowerCase();
}

function buildOrderFingerprint_(userId, normalizedItems, total) {
  const canonicalItems = (Array.isArray(normalizedItems) ? normalizedItems : [])
    .map(function (item) {
      return {
        flavor: normalizeText_(item.flavor).toLowerCase(),
        size: normalizeText_(item.size).toLowerCase(),
        toppings: normalizeText_(item.toppings).toLowerCase(),
        quantity: Math.max(1, Math.round(toNumber_(item.quantity) || 1)),
        price: Math.max(0, Number((toNumber_(item.price) || 0).toFixed(2)))
      };
    })
    .sort(function (a, b) {
      const ka = [a.flavor, a.size, a.toppings, a.quantity, a.price].join('|');
      const kb = [b.flavor, b.size, b.toppings, b.quantity, b.price].join('|');
      return ka < kb ? -1 : (ka > kb ? 1 : 0);
    });

  const payload = JSON.stringify({
    userId: normalizeUserId_(userId),
    total: Number((toNumber_(total) || 0).toFixed(2)),
    items: canonicalItems
  });

  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload);
  return toHex_(bytes);
}

function toHex_(byteArray) {
  return byteArray.map(function (b) {
    const value = (b < 0) ? b + 256 : b;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function getCachedOrderIdByFingerprint_(fingerprint) {
  if (!fingerprint) return '';
  try {
    return CacheService.getScriptCache().get('ordfp:' + fingerprint) || '';
  } catch (_error) {
    return '';
  }
}

function cacheOrderFingerprint_(fingerprint, orderId) {
  if (!fingerprint || !orderId) return;
  try {
    CacheService.getScriptCache().put('ordfp:' + fingerprint, String(orderId), ORDER_DEDUPE_TTL_SECONDS);
  } catch (_error) {
    // Ignore cache failures; idempotency by clientOrderId still applies.
  }
}
