// ==========================================
// GRAHAM BYTES - RANDOM TRIVIA REDIRECTOR
// ==========================================

const TOTAL_TRIVIA = 50;

/**
 * Redirects to a random trivia page
 */
function goToRandomTrivia() {
    const randomPage = Math.floor(Math.random() * TOTAL_TRIVIA) + 1;
    const paddedNum = String(randomPage).padStart(3, '0');
    
    // Check if we're on the landing page or a trivia page
    const isTriviaPage = window.location.pathname.includes('/trivia/');
    const basePath = isTriviaPage ? '' : 'trivia/';
    
    window.location.href = `${basePath}trivia-${paddedNum}.html`;
}

/**
 * Gets a random trivia number different from current
 * @param {number|string} currentNum - Current trivia number to exclude (number or padded string)
 * @returns {string} - Padded trivia number
 */
function getRandomTriviaExcluding(currentNum) {
    const current = Number(String(currentNum).replace(/^0+/, '')) || 0;
    let randomPage;
    do {
        randomPage = Math.floor(Math.random() * TOTAL_TRIVIA) + 1;
    } while (randomPage === current && TOTAL_TRIVIA > 1);
    
    return String(randomPage).padStart(3, '0');
}

// Make functions available globally
window.goToRandomTrivia = goToRandomTrivia;
window.getRandomTriviaExcluding = getRandomTriviaExcluding;


// ...existing code...
const DEFAULT_SHEETS_API_URL = 'https://script.google.com/macros/s/AKfycbxCJarOJtGiwWU6QUCTSpIS3C5V9RALrMwUGD6bXj3amav91R-9Y8r4W1lcJRWjOAgT/exec'; // replace with your deployed web app URL
const API_KEY = '4e1675f34ce90c629fbbb5b8dcf218dea20ece5db37e022f2d6676a6c77bb44f'; // DO NOT put a real secret in client-side code
const REQUIRED_SHEETS = ['orders', 'points'];
let hasWarnedOrdersSheetMissing = false;
let hasWarnedPointsSheetMissing = false;
const inFlightOrderRequests = new Map();

function resolveSheetsApiUrl() {
  try {
    const fromStorage = localStorage.getItem('gb_sheets_api_url');
    if (fromStorage && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(fromStorage.trim())) {
      return fromStorage.trim();
    }
  } catch (_error) {
    // Ignore storage access issues.
  }
  return DEFAULT_SHEETS_API_URL;
}

let SHEETS_API_URL = resolveSheetsApiUrl();

window.setSheetsApiUrl = function setSheetsApiUrl(url) {
  const next = String(url || '').trim();
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/i.test(next)) {
    throw new Error('Invalid Apps Script URL. Expected https://script.google.com/macros/s/.../exec');
  }
  SHEETS_API_URL = next;
  localStorage.setItem('gb_sheets_api_url', next);
};

window.resetSheetsApiUrl = function resetSheetsApiUrl() {
  SHEETS_API_URL = DEFAULT_SHEETS_API_URL;
  try {
    localStorage.removeItem('gb_sheets_api_url');
  } catch (_error) {
    // Ignore storage access issues.
  }
};

function hasCustomSheetsApiUrl() {
  return String(SHEETS_API_URL) !== String(DEFAULT_SHEETS_API_URL);
}

function resetSheetsApiUrlOnFailure(reason) {
  if (!hasCustomSheetsApiUrl()) {
    return;
  }
  window.resetSheetsApiUrl();
  console.warn(`Reset Apps Script URL to default after failure: ${reason}`);
}

function buildApiUrl(route, extraQuery = {}) {
  const query = new URLSearchParams({
    route,
    key: API_KEY,
    ...extraQuery
  });
  return `${SHEETS_API_URL}?${query.toString()}`;
}

function parseJsonSafely(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_error) {
    return null;
  }
}

function shouldUseJsonpFallback(error) {
  const msg = String(error && error.message ? error.message : error).toLowerCase();
  return msg.includes('failed to fetch')
    || msg.includes('networkerror')
    || msg.includes('load failed');
}

function serializeForQuery(payload) {
  const out = {};
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = String(value);
      return;
    }
    out[key] = JSON.stringify(value);
  });
  return out;
}

function requestJsonp(route, query, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gbJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const script = document.createElement('script');
    let timeoutId;

    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      try {
        delete window[callbackName];
      } catch (_error) {
        window[callbackName] = undefined;
      }
    };

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error(`JSONP request failed for ${route}. Check deployed Apps Script /exec URL.`));
    };

    timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP request timed out'));
    }, timeoutMs);

    script.src = buildApiUrl(route, {
      ...(query || {}),
      callback: callbackName,
      _ts: Date.now()
    });
    document.head.appendChild(script);
  });
}

function toReadableMessage(payload, rawText, fallbackMessage) {
  if (payload && typeof payload === 'object') {
    if (payload.error) return String(payload.error);
    if (payload.message) return String(payload.message);
  }
  const raw = String(rawText || '').trim();
  if (raw) return raw.slice(0, 220);
  return fallbackMessage;
}

function isMissingSheetError(error) {
  const msg = String(error && error.message ? error.message : error).toLowerCase();
  return msg.includes('getlastrow')
    || msg.includes('appendrow')
    || msg.includes('cannot read properties of null');
}

function toConfigErrorMessage(originalMessage) {
  return `Backend Google Sheet is not configured. Make sure tabs exist: ${REQUIRED_SHEETS.join(', ')}. Original error: ${originalMessage}`;
}

async function requestGet(route, query, fallbackMessage) {
  const fetchGet = async () => {
    const response = await fetch(
      buildApiUrl(route, { ...(query || {}), _ts: Date.now() }),
      { cache: 'no-store' }
    );
    const text = await response.text();
    const parsed = parseJsonSafely(text);
    return { response, text, parsed };
  };

  let res;
  let rawText = '';
  let payload = null;

  try {
    ({ response: res, text: rawText, parsed: payload } = await fetchGet());
    if (res.status === 404 && hasCustomSheetsApiUrl()) {
      resetSheetsApiUrlOnFailure(`GET ${route} returned 404`);
      ({ response: res, text: rawText, parsed: payload } = await fetchGet());
    }
  } catch (error) {
    if (shouldUseJsonpFallback(error)) {
      try {
        const jsonpPayload = await requestJsonp(route, serializeForQuery(query));
        if (jsonpPayload && jsonpPayload.error) {
          throw new Error(String(jsonpPayload.error));
        }
        return jsonpPayload;
      } catch (jsonpError) {
        if (hasCustomSheetsApiUrl()) {
          resetSheetsApiUrlOnFailure(`JSONP GET ${route} failed`);
          const retryPayload = await requestJsonp(route, serializeForQuery(query));
          if (retryPayload && retryPayload.error) {
            throw new Error(String(retryPayload.error));
          }
          return retryPayload;
        }
        throw jsonpError;
      }
    }
    throw error;
  }

  if (!res.ok) {
    throw new Error(toReadableMessage(payload, rawText, `${fallbackMessage}: ${res.status}`));
  }

  if (payload && payload.error) {
    throw new Error(toReadableMessage(payload, rawText, fallbackMessage));
  }

  if (payload === null) {
    throw new Error(toReadableMessage(payload, rawText, `${fallbackMessage}: invalid server response`));
  }

  return payload;
}

async function requestPost(route, bodyPayload) {
  // Send form-style body so Apps Script can read values from e.parameter reliably.
  const form = new URLSearchParams();
  Object.entries(bodyPayload || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string') {
      form.append(key, value);
    } else {
      form.append(key, JSON.stringify(value));
    }
  });

  const requestOptions = {
    method: 'POST',
    body: form
  };

  const fetchPost = async () => {
    const response = await fetch(buildApiUrl(route), requestOptions);
    const text = await response.text();
    const parsed = parseJsonSafely(text);
    return { response, text, parsed };
  };

  let res;
  let rawText = '';
  let payload = null;

  try {
    ({ response: res, text: rawText, parsed: payload } = await fetchPost());
    if (res.status === 404 && hasCustomSheetsApiUrl()) {
      resetSheetsApiUrlOnFailure(`POST ${route} returned 404`);
      ({ response: res, text: rawText, parsed: payload } = await fetchPost());
    }
  } catch (error) {
    if (shouldUseJsonpFallback(error)) {
      try {
        const jsonpPayload = await requestJsonp(route, serializeForQuery(bodyPayload));
        if (jsonpPayload && jsonpPayload.error) {
          throw new Error(String(jsonpPayload.error));
        }
        return jsonpPayload;
      } catch (jsonpError) {
        if (hasCustomSheetsApiUrl()) {
          resetSheetsApiUrlOnFailure(`JSONP POST ${route} failed`);
          const retryPayload = await requestJsonp(route, serializeForQuery(bodyPayload));
          if (retryPayload && retryPayload.error) {
            throw new Error(String(retryPayload.error));
          }
          return retryPayload;
        }
        throw jsonpError;
      }
    }
    throw error;
  }

  if (!res.ok) {
    throw new Error(toReadableMessage(payload, rawText, `${route} failed: ${res.status}`));
  }

  if (payload && payload.error) {
    throw new Error(toReadableMessage(payload, rawText, `${route} failed`));
  }

  if (payload === null) {
    throw new Error(toReadableMessage(payload, rawText, `${route} failed: invalid server response`));
  }

  return payload;
}

function createOrderRequestFingerprint(payload) {
  try {
    return JSON.stringify({
      userId: payload.userId || '',
      total: Number(payload.total || 0),
      clientOrderId: payload.clientOrderId || '',
      items: Array.isArray(payload.items) ? payload.items : []
    });
  } catch (_error) {
    return `${String(payload.userId || '')}|${String(payload.total || 0)}|${Date.now()}`;
  }
}

async function postOrder(userId, items, total, clientOrderId) {
  const payload = { key: API_KEY, userId, items, total, status: 'pending', intent: 'create' };
  if (clientOrderId) {
    payload.clientOrderId = String(clientOrderId);
  }

  const fingerprint = createOrderRequestFingerprint(payload);
  if (inFlightOrderRequests.has(fingerprint)) {
    return inFlightOrderRequests.get(fingerprint);
  }

  const requestPromise = (async () => {
    try {
      return await requestPost('orders', payload);
    } catch (err) {
      if (isMissingSheetError(err)) {
        throw new Error(toConfigErrorMessage(err.message));
      }
      console.error('postOrder network/error', err);
      throw err;
    } finally {
      inFlightOrderRequests.delete(fingerprint);
    }
  })();

  inFlightOrderRequests.set(fingerprint, requestPromise);

  return requestPromise;
}

async function fetchOrders(userId) {
  try {
    return await requestGet('orders', { userId }, 'Fetch orders failed');
  } catch (err) {
    if (isMissingSheetError(err)) {
      if (!hasWarnedOrdersSheetMissing) {
        console.warn('fetchOrders fallback: sheet not ready, returning empty orders.', err);
        hasWarnedOrdersSheetMissing = true;
      }
      return [];
    }
    console.error('fetchOrders network/error', err);
    throw err;
  }
}

async function addPoints(userId, points) {
  const payload = { key: API_KEY, userId, points, intent: 'add' };

  try {
    return await requestPost('points', payload);
  } catch (err) {
    if (isMissingSheetError(err)) {
      throw new Error(toConfigErrorMessage(err.message));
    }
    console.error('addPoints network/error', err);
    throw err;
  }
}

async function getPoints(userId) {
  try {
    return await requestGet('points', { userId }, 'Get points failed');
  } catch (err) {
    if (isMissingSheetError(err)) {
      if (!hasWarnedPointsSheetMissing) {
        console.warn('getPoints fallback: sheet not ready, returning zero points.', err);
        hasWarnedPointsSheetMissing = true;
      }
      return { points: 0 };
    }
    console.error('getPoints network/error', err);
    throw err;
  }
}

// expose API helpers
window.postOrder = postOrder;
window.fetchOrders = fetchOrders;
window.addPoints = addPoints;
window.getPoints = getPoints;
// ...existing code...
