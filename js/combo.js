/* ==========================================
   GRAHAM BYTES - BUILD YOUR COMBO LOGIC
   ========================================== */

(() => {
    'use strict';

    const STORAGE_KEYS = {
        userId: 'gb_combo_user_id',
        pendingPrefix: 'gb_combo_pending_points:'
    };

    const USER_ID_PATTERN = /^[A-Za-z0-9_-]{3,40}$/;

    const FLAVORS = {
        html: 'HTML (Mango)',
        css: 'CSS (Ube)',
        javascript: 'JavaScript (Banana)'
    };

    const SIZE_PRICES = {
        small: 7,
        medium: 10,
        large: 12
    };

    const TOPPING_PRICE = 2;

    const state = {
        cart: [],
        orders: [],
        userId: '',
        points: 0,
        pendingPoints: 0,
        isSubmitting: false,
        isClaiming: false,
        userRequestToken: 0,
        pendingOrder: null
    };

    const elements = {};

    const touched = {
        itemFlavor: false,
        itemSize: false,
        itemQty: false,
        userId: false
    };

    const currencyFormatter = new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
    });

    const debouncedRenderTotals = debounce(() => {
        renderTotals();
        syncActionStates();
    }, 120);

    const debouncedRefreshUserData = debounce(() => {
        refreshUserData();
    }, 350);

    document.addEventListener('DOMContentLoaded', init);

    function init() {
        cacheElements();

        if (!hasRequiredHelpers()) {
            showToast('error', 'Required API helpers are missing. Load js/random.js before js/combo.js.');
            setButtonDisabled(elements.addOrderBtn, true);
            setButtonDisabled(elements.claimPointsBtn, true);
            return;
        }

        bindEvents();
        loadInitialUser();

        renderCart();
        renderTotals();
        renderPoints();
        renderOrders([]);
        renderPreviewPrice();
        syncActionStates();

        if (state.userId) {
            refreshUserData();
        }
    }

    function cacheElements() {
        elements.itemForm = document.getElementById('item-form');
        elements.itemFlavorInput = document.getElementById('item-flavor');
        elements.itemSizeInput = document.getElementById('item-size');
        elements.itemQtyInput = document.getElementById('item-qty');
        elements.toppingInputs = Array.from(document.querySelectorAll('input[name="toppings"]'));
        elements.unitPrice = document.getElementById('unit-price');

        elements.itemFlavorError = document.getElementById('item-flavor-error');
        elements.itemSizeError = document.getElementById('item-size-error');
        elements.itemQtyError = document.getElementById('item-qty-error');

        elements.cartList = document.getElementById('cart-list');
        elements.cartEmpty = document.getElementById('cart-empty');
        elements.subtotal = document.getElementById('subtotal');
        elements.cartError = document.getElementById('cart-error');
        elements.addOrderBtn = document.getElementById('add-order-btn');

        elements.userIdInput = document.getElementById('user-id');
        elements.userIdError = document.getElementById('user-id-error');

        elements.pointsValue = document.getElementById('points-value');
        elements.pendingPoints = document.getElementById('pending-points');
        elements.pointsLoading = document.getElementById('points-loading');
        elements.claimPointsBtn = document.getElementById('claim-points-btn');

        elements.ordersLoading = document.getElementById('orders-loading');
        elements.orderHistory = document.getElementById('order-history');
        elements.historyEmpty = document.getElementById('history-empty');

        elements.randomTriviaBtn = document.getElementById('random-trivia-btn');
        elements.toastRegion = document.getElementById('toast-region');
        elements.srAnnouncer = document.getElementById('sr-announcer');
    }

    function bindEvents() {
        elements.itemForm.addEventListener('submit', handleItemSubmit);

        elements.itemFlavorInput.addEventListener('change', () => {
            touched.itemFlavor = true;
            validateItemFlavor(true);
            renderPreviewPrice();
        });
        elements.itemSizeInput.addEventListener('change', () => {
            touched.itemSize = true;
            validateItemSize(true);
            renderPreviewPrice();
        });
        elements.itemQtyInput.addEventListener('input', () => validateItemQty(touched.itemQty));
        elements.itemQtyInput.addEventListener('blur', () => {
            touched.itemQty = true;
            validateItemQty(true);
        });

        elements.toppingInputs.forEach((checkbox) => {
            checkbox.addEventListener('change', renderPreviewPrice);
        });

        elements.cartList.addEventListener('click', handleCartClick);
        elements.cartList.addEventListener('input', handleCartInput);
        elements.cartList.addEventListener('change', handleCartChange);

        elements.addOrderBtn.addEventListener('click', handleSubmitOrder);
        elements.claimPointsBtn.addEventListener('click', handleClaimPoints);

        elements.userIdInput.addEventListener('input', handleUserIdInput);
        elements.userIdInput.addEventListener('blur', () => {
            touched.userId = true;
            state.userId = sanitizeText(elements.userIdInput.value);
            elements.userIdInput.value = state.userId;
            validateUserId(true);
        });

        elements.randomTriviaBtn.addEventListener('click', () => {
            if (typeof window.goToRandomTrivia === 'function') {
                window.goToRandomTrivia();
                return;
            }
            showToast('error', 'Random trivia button is unavailable right now.');
        });
    }

    function handleItemSubmit(event) {
        event.preventDefault();

        touched.itemFlavor = true;
        touched.itemSize = true;
        touched.itemQty = true;

        const flavorKey = validateItemFlavor(true);
        const sizeKey = validateItemSize(true);
        const qty = validateItemQty(true);

        if (!flavorKey || !sizeKey || qty === null) {
            showToast('error', 'Please complete flavor, size, and quantity.');
            return;
        }

        const combo = buildCombo(flavorKey, sizeKey);
        const signature = createComboSignature(combo);

        const existingItem = state.cart.find((entry) => entry.signature === signature);
        invalidatePendingOrder();
        if (existingItem) {
            existingItem.qty += qty;
        } else {
            state.cart.push({
                id: createId(),
                signature,
                name: combo.name,
                flavorLabel: combo.flavorLabel,
                sizeLabel: combo.sizeLabel,
                toppings: combo.toppings,
                qty,
                price: combo.unitPrice
            });
        }

        clearCartError();
        renderCart();
        renderTotals();
        syncActionStates();

        resetComboForm();
        showToast('success', `${combo.name} added to your cart.`);
    }

    function buildCombo(flavorKey, sizeKey) {
        const toppings = getSelectedToppings();
        const unitPrice = calculateUnitPrice(sizeKey, toppings.length);
        const flavorLabel = FLAVORS[flavorKey];
        const sizeLabel = `${capitalize(sizeKey)} (${SIZE_PRICES[sizeKey]} pesos)`;
        const toppingLabel = toppings.length ? ` + ${toppings.join(', ')}` : ' + No toppings';

        return {
            flavorLabel,
            sizeLabel,
            toppings,
            unitPrice,
            name: `${flavorLabel} - ${capitalize(sizeKey)}${toppingLabel}`
        };
    }

    function createComboSignature(combo) {
        return `${combo.flavorLabel}|${combo.sizeLabel}|${combo.toppings.slice().sort().join(',')}|${combo.unitPrice}`;
    }

    function resetComboForm() {
        elements.itemForm.reset();
        elements.itemQtyInput.value = '1';

        touched.itemFlavor = false;
        touched.itemSize = false;
        touched.itemQty = false;

        setFieldState(elements.itemFlavorInput, elements.itemFlavorError, '');
        setFieldState(elements.itemSizeInput, elements.itemSizeError, '');
        setFieldState(elements.itemQtyInput, elements.itemQtyError, '');

        renderPreviewPrice();
    }

    function handleCartClick(event) {
        const removeButton = event.target.closest('[data-action="remove"]');
        if (!removeButton) {
            return;
        }

        const itemElement = removeButton.closest('.cart-item');
        if (!itemElement) {
            return;
        }

        const itemId = itemElement.dataset.id;
        const index = state.cart.findIndex((entry) => entry.id === itemId);

        if (index >= 0) {
            invalidatePendingOrder();
            const [removed] = state.cart.splice(index, 1);
            renderCart();
            renderTotals();
            syncActionStates();
            showToast('success', `${removed.flavorLabel} removed from cart.`);
        }
    }

    function handleCartInput(event) {
        const qtyInput = event.target.closest('.cart-qty-input');
        if (!qtyInput) {
            return;
        }

        const itemElement = qtyInput.closest('.cart-item');
        if (!itemElement) {
            return;
        }

        const item = state.cart.find((entry) => entry.id === itemElement.dataset.id);
        if (!item) {
            return;
        }

        const nextQty = parseInteger(qtyInput.value);
        if (nextQty !== null && nextQty > 0) {
            if (item.qty !== nextQty) {
                invalidatePendingOrder();
            }
            item.qty = nextQty;
            qtyInput.setAttribute('aria-invalid', 'false');
            updateLineTotal(itemElement, item);
            debouncedRenderTotals();
        } else {
            qtyInput.setAttribute('aria-invalid', 'true');
        }
    }

    function handleCartChange(event) {
        const qtyInput = event.target.closest('.cart-qty-input');
        if (!qtyInput) {
            return;
        }

        const itemElement = qtyInput.closest('.cart-item');
        if (!itemElement) {
            return;
        }

        const item = state.cart.find((entry) => entry.id === itemElement.dataset.id);
        if (!item) {
            return;
        }

        const nextQty = parseInteger(qtyInput.value);
        if (nextQty === null || nextQty < 1) {
            qtyInput.value = String(item.qty);
            qtyInput.setAttribute('aria-invalid', 'false');
            return;
        }

        if (item.qty !== nextQty) {
            invalidatePendingOrder();
        }
        item.qty = nextQty;
        updateLineTotal(itemElement, item);
        renderTotals();
        syncActionStates();
    }

    async function handleSubmitOrder() {
        if (state.isSubmitting) {
            return;
        }

        clearCartError();
        touched.userId = true;

        const userId = validateUserId(true);
        if (!userId) {
            setCartError('Enter a valid User ID before placing an order.');
            showToast('error', 'Enter a valid User ID first.');
            return;
        }

        if (!state.cart.length) {
            setCartError('Add at least one combo to your cart.');
            showToast('error', 'Your cart is empty.');
            return;
        }

        const total = roundMoney(getSubtotal());
        const items = state.cart.map((item) => ({
            name: item.name,
            flavor: item.flavorLabel,
            size: item.sizeLabel,
            toppings: item.toppings,
            qty: item.qty,
            price: roundMoney(item.price)
        }));
        const orderFingerprint = createOrderFingerprint(userId, items, total);
        const clientOrderId = getReusableOrderId(orderFingerprint);

        state.isSubmitting = true;
        setButtonLoading(elements.addOrderBtn, true);
        syncActionStates();

        try {
            await window.postOrder(userId, items, total, clientOrderId);

            const earnedPoints = calculateEarnedPoints(total);
            addPendingPoints(userId, earnedPoints);

            state.cart = [];
            invalidatePendingOrder();
            renderCart();
            renderTotals();
            await refreshUserData();

            showToast('success', `Order placed. ${earnedPoints} points are ready to claim.`);
        } catch (error) {
            setCartError('Order submission failed. Please try again.');
            showToast('error', `Order failed: ${readableError(error)}`);
        } finally {
            state.isSubmitting = false;
            setButtonLoading(elements.addOrderBtn, false);
            syncActionStates();
        }
    }

    async function handleClaimPoints() {
        if (state.isClaiming) {
            return;
        }

        touched.userId = true;

        const userId = validateUserId(true);
        if (!userId) {
            showToast('error', 'Enter a valid User ID to claim points.');
            return;
        }

        if (state.pendingPoints <= 0) {
            showToast('error', 'No pending points to claim yet.');
            return;
        }

        const pointsToClaim = state.pendingPoints;

        state.isClaiming = true;
        setButtonLoading(elements.claimPointsBtn, true);
        syncActionStates();

        try {
            await window.addPoints(userId, pointsToClaim);
            setPendingPoints(userId, 0);
            state.pendingPoints = 0;
            renderPoints();

            await refreshUserData();
            showToast('success', `${pointsToClaim} points claimed.`);
        } catch (error) {
            showToast('error', `Could not claim points: ${readableError(error)}`);
        } finally {
            state.isClaiming = false;
            setButtonLoading(elements.claimPointsBtn, false);
            syncActionStates();
        }
    }

    function handleUserIdInput() {
        state.userId = sanitizeText(elements.userIdInput.value);
        persistUserId(state.userId);

        validateUserId(touched.userId);

        if (isValidUserId(state.userId)) {
            state.pendingPoints = getPendingPoints(state.userId);
        } else {
            state.pendingPoints = 0;
        }

        renderPoints();
        syncActionStates();
        debouncedRefreshUserData();
    }

    async function refreshUserData() {
        const userId = isValidUserId(state.userId) ? state.userId : null;

        if (!userId) {
            state.points = 0;
            state.pendingPoints = 0;
            state.orders = [];
            renderPoints();
            renderOrders([]);
            syncActionStates();
            return;
        }

        const token = ++state.userRequestToken;

        state.pendingPoints = getPendingPoints(userId);
        renderPoints();
        syncActionStates();

        await Promise.all([
            refreshPoints(userId, token),
            refreshOrders(userId, token)
        ]);
    }

    async function refreshPoints(userId, token) {
        toggleHidden(elements.pointsLoading, false);

        try {
            const response = await window.getPoints(userId);
            if (token !== state.userRequestToken) {
                return;
            }
            state.points = extractPoints(response);
            renderPoints();
        } catch (error) {
            if (token !== state.userRequestToken) {
                return;
            }
            state.points = 0;
            renderPoints();
            showToast('error', `Unable to load points: ${readableError(error)}`);
        } finally {
            if (token === state.userRequestToken) {
                toggleHidden(elements.pointsLoading, true);
                syncActionStates();
            }
        }
    }

    async function refreshOrders(userId, token) {
        toggleHidden(elements.ordersLoading, false);

        try {
            const response = await window.fetchOrders(userId);
            if (token !== state.userRequestToken) {
                return;
            }

            state.orders = coerceOrdersFromRows(extractOrders(response))
                .map((order, index) => normalizeOrder(order, index));

            renderOrders(state.orders);
        } catch (error) {
            if (token !== state.userRequestToken) {
                return;
            }

            state.orders = [];
            renderOrders([]);
            elements.historyEmpty.textContent = 'Could not load order history right now.';
            showToast('error', `Unable to load orders: ${readableError(error)}`);
        } finally {
            if (token === state.userRequestToken) {
                toggleHidden(elements.ordersLoading, true);
            }
        }
    }

    function renderCart() {
        elements.cartList.innerHTML = '';

        if (!state.cart.length) {
            toggleHidden(elements.cartEmpty, false);
            return;
        }

        toggleHidden(elements.cartEmpty, true);

        state.cart.forEach((item) => {
            const listItem = document.createElement('li');
            listItem.className = 'cart-item';
            listItem.dataset.id = item.id;

            const head = document.createElement('div');
            head.className = 'cart-item-head';

            const name = document.createElement('p');
            name.className = 'cart-item-name';
            name.textContent = item.flavorLabel;

            const price = document.createElement('p');
            price.className = 'cart-item-price';
            price.textContent = `${formatCurrency(item.price)} each`;

            const details = document.createElement('p');
            details.className = 'cart-item-price';
            details.textContent = `${item.sizeLabel} • ${item.toppings.length ? item.toppings.join(', ') : 'No toppings'}`;

            head.appendChild(name);
            head.appendChild(price);

            const controls = document.createElement('div');
            controls.className = 'cart-item-controls';

            const qtyWrap = document.createElement('div');
            qtyWrap.className = 'qty-wrap';

            const qtyInput = document.createElement('input');
            qtyInput.className = 'cart-qty-input';
            qtyInput.type = 'number';
            qtyInput.min = '1';
            qtyInput.step = '1';
            qtyInput.inputMode = 'numeric';
            qtyInput.value = String(item.qty);
            qtyInput.setAttribute('aria-label', `Quantity for ${item.flavorLabel}`);

            const lineTotal = document.createElement('span');
            lineTotal.className = 'cart-line-total';
            lineTotal.textContent = formatCurrency(item.qty * item.price);

            qtyWrap.appendChild(qtyInput);
            qtyWrap.appendChild(lineTotal);

            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'remove-btn';
            removeButton.dataset.action = 'remove';
            removeButton.textContent = 'Remove';

            controls.appendChild(qtyWrap);
            controls.appendChild(removeButton);

            listItem.appendChild(head);
            listItem.appendChild(details);
            listItem.appendChild(controls);
            elements.cartList.appendChild(listItem);
        });
    }

    function renderPreviewPrice() {
        const sizeKey = elements.itemSizeInput.value;
        const toppingsCount = getSelectedToppings().length;
        const preview = SIZE_PRICES[sizeKey] ? calculateUnitPrice(sizeKey, toppingsCount) : 0;

        elements.unitPrice.textContent = formatCurrency(preview);
    }

    function renderTotals() {
        elements.subtotal.textContent = formatCurrency(getSubtotal());
    }

    function renderPoints() {
        elements.pointsValue.textContent = numberWithCommas(state.points);
        elements.pendingPoints.textContent = numberWithCommas(state.pendingPoints);
    }

    function renderOrders(orders) {
        elements.orderHistory.innerHTML = '';

        if (!orders.length) {
            toggleHidden(elements.historyEmpty, false);
            elements.historyEmpty.textContent = isValidUserId(state.userId)
                ? 'No orders found yet.'
                : 'Enter a valid user ID to load order history.';
            return;
        }

        toggleHidden(elements.historyEmpty, true);

        orders.forEach((order) => {
            const row = document.createElement('li');
            row.className = 'order-row';

            const top = document.createElement('div');
            top.className = 'order-row-top';

            const time = document.createElement('span');
            time.className = 'order-time';
            time.textContent = formatTimestamp(order.timestamp);

            const status = document.createElement('span');
            status.className = `status-pill ${statusClass(order.status)}`;
            status.textContent = order.status;

            top.appendChild(time);
            top.appendChild(status);

            const bottom = document.createElement('div');
            bottom.className = 'order-row-bottom';

            const itemCount = document.createElement('span');
            itemCount.textContent = `${order.itemCount} item${order.itemCount === 1 ? '' : 's'}`;

            const total = document.createElement('strong');
            total.textContent = formatCurrency(order.total);

            bottom.appendChild(itemCount);
            bottom.appendChild(total);

            row.appendChild(top);
            row.appendChild(bottom);

            elements.orderHistory.appendChild(row);
        });
    }

    function syncActionStates() {
        const validUser = isValidUserId(state.userId);

        const disableSubmit = state.isSubmitting || !validUser || state.cart.length === 0;
        const disableClaim = state.isClaiming || !validUser || state.pendingPoints <= 0;

        setButtonDisabled(elements.addOrderBtn, disableSubmit);
        setButtonDisabled(elements.claimPointsBtn, disableClaim);
    }

    function validateItemFlavor(showError) {
        const value = elements.itemFlavorInput.value;
        const message = value && FLAVORS[value] ? '' : 'Choose one available flavor.';

        if (showError) {
            setFieldState(elements.itemFlavorInput, elements.itemFlavorError, message);
        }

        return message ? null : value;
    }

    function validateItemSize(showError) {
        const value = elements.itemSizeInput.value;
        const message = value && SIZE_PRICES[value] ? '' : 'Choose a size.';

        if (showError) {
            setFieldState(elements.itemSizeInput, elements.itemSizeError, message);
        }

        return message ? null : value;
    }

    function validateItemQty(showError) {
        const parsedQty = parseInteger(elements.itemQtyInput.value);
        let message = '';

        if (parsedQty === null) {
            message = 'Quantity is required.';
        } else if (parsedQty < 1) {
            message = 'Quantity must be at least 1.';
        }

        if (showError) {
            setFieldState(elements.itemQtyInput, elements.itemQtyError, message);
        }

        return message ? null : parsedQty;
    }

    function validateUserId(showError) {
        const value = sanitizeText(elements.userIdInput.value);
        let message = '';

        if (!value) {
            message = 'User ID is required.';
        } else if (!USER_ID_PATTERN.test(value)) {
            message = 'Use 3-40 letters, numbers, "_", or "-".';
        }

        if (showError) {
            setFieldState(elements.userIdInput, elements.userIdError, message);
        }

        if (message) {
            return null;
        }

        state.userId = value;
        return value;
    }

    function setFieldState(input, errorElement, message) {
        input.setAttribute('aria-invalid', message ? 'true' : 'false');
        errorElement.textContent = message || '';
    }

    function setCartError(message) {
        elements.cartError.textContent = message;
    }

    function clearCartError() {
        setCartError('');
    }

    function setButtonLoading(button, isLoading) {
        button.classList.toggle('is-loading', isLoading);
        button.setAttribute('aria-busy', String(isLoading));
    }

    function setButtonDisabled(button, disabled) {
        button.disabled = disabled;
        button.setAttribute('aria-disabled', String(disabled));
    }

    function updateLineTotal(itemElement, item) {
        const lineTotal = itemElement.querySelector('.cart-line-total');
        if (lineTotal) {
            lineTotal.textContent = formatCurrency(item.qty * item.price);
        }
    }

    function getSubtotal() {
        return state.cart.reduce((sum, item) => {
            return sum + (item.qty * item.price);
        }, 0);
    }

    function calculateUnitPrice(sizeKey, toppingsCount) {
        const base = SIZE_PRICES[sizeKey] || 0;
        return roundMoney(base + (Math.max(0, toppingsCount) * TOPPING_PRICE));
    }

    function calculateEarnedPoints(total) {
        return Math.max(1, Math.round(total));
    }

    function getSelectedToppings() {
        return elements.toppingInputs
            .filter((input) => input.checked)
            .map((input) => input.value);
    }

    function formatCurrency(amount) {
        return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
    }

    function formatTimestamp(value) {
        if (!value) {
            return 'Timestamp unavailable';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return new Intl.DateTimeFormat('en-PH', {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    }

    function statusClass(status) {
        const normalized = String(status || '').toLowerCase();

        if (normalized.includes('complete') || normalized.includes('success') || normalized.includes('paid')) {
            return 'status--success';
        }

        if (normalized.includes('pending') || normalized.includes('process')) {
            return 'status--pending';
        }

        return 'status--neutral';
    }

    function extractPoints(payload) {
        const candidates = [
            payload,
            payload && payload.points,
            payload && payload.balance,
            payload && payload.totalPoints,
            payload && payload.data && payload.data.points,
            payload && payload.data && payload.data.balance,
            Array.isArray(payload && payload.data) ? payload.data[0] && payload.data[0].points : null,
            Array.isArray(payload && payload.data) ? payload.data[0] && payload.data[0].balance : null,
            Array.isArray(payload) ? payload[0] && payload[0].points : null
        ];

        for (const candidate of candidates) {
            const parsed = toNumber(candidate);
            if (parsed !== null) {
                return Math.max(0, Math.round(parsed));
            }
        }

        return 0;
    }

    function extractOrders(payload) {
        if (Array.isArray(payload)) {
            return payload;
        }

        if (!payload || typeof payload !== 'object') {
            return [];
        }

        if (Array.isArray(payload.orders)) {
            return payload.orders;
        }

        if (Array.isArray(payload.data)) {
            return payload.data;
        }

        if (Array.isArray(payload.results)) {
            return payload.results;
        }

        const firstArray = Object.values(payload).find((value) => Array.isArray(value));
        return firstArray || [];
    }

    function coerceOrdersFromRows(rawOrders) {
        if (!Array.isArray(rawOrders) || rawOrders.length === 0) {
            return [];
        }

        const rows = rawOrders
            .map((entry) => toOrderRow(entry))
            .filter(Boolean);

        // If payload already contains order objects, keep original behavior.
        if (rows.length !== rawOrders.length) {
            return rawOrders;
        }

        const grouped = new Map();

        rows.forEach((row) => {
            const key = row.id || `${row.timestamp}|${row.userId}`;
            if (!grouped.has(key)) {
                grouped.set(key, {
                    id: row.id || key,
                    timestamp: row.timestamp || null,
                    userId: row.userId || '',
                    items: [],
                    total: 0,
                    status: row.status || 'submitted'
                });
            }

            const order = grouped.get(key);
            order.items.push({
                name: row.flavor + (row.size ? ` - ${row.size}` : ''),
                flavor: row.flavor,
                size: row.size,
                toppings: row.toppings,
                qty: row.quantity,
                price: row.price
            });
            order.total = roundMoney(order.total + (row.quantity * row.price));
            if (!order.timestamp && row.timestamp) {
                order.timestamp = row.timestamp;
            }
            if (row.status) {
                order.status = row.status;
            }
        });

        return Array.from(grouped.values()).sort((a, b) => {
            const aTime = new Date(a.timestamp || 0).getTime();
            const bTime = new Date(b.timestamp || 0).getTime();
            return bTime - aTime;
        });
    }

    function toOrderRow(entry) {
        if (Array.isArray(entry) && entry.length >= 8) {
            return {
                id: String(entry[0] || ''),
                timestamp: entry[1] || null,
                userId: String(entry[2] || ''),
                flavor: String(entry[3] || ''),
                size: String(entry[4] || ''),
                toppings: toToppingsArray(entry[5]),
                quantity: Math.max(1, Math.round(toNumber(entry[6]) || 1)),
                price: Math.max(0, toNumber(entry[7]) || 0),
                status: String(entry[8] || 'submitted')
            };
        }

        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return null;
        }

        const id = String(entry.id || entry.orderId || '').trim();
        const flavor = String(entry.flavor || '').trim();
        const size = String(entry.size || '').trim();
        const qtyRaw = entry.quantity ?? entry.qty;
        const priceRaw = entry.price;
        const hasRowShape = id && flavor && (qtyRaw !== undefined) && (priceRaw !== undefined);

        if (!hasRowShape) {
            return null;
        }

        return {
            id,
            timestamp: entry.timestamp || entry.createdAt || entry.created_at || entry.date || null,
            userId: String(entry.userId || entry.userid || ''),
            flavor,
            size,
            toppings: toToppingsArray(entry.toppings),
            quantity: Math.max(1, Math.round(toNumber(qtyRaw) || 1)),
            price: Math.max(0, toNumber(priceRaw) || 0),
            status: String(entry.status || 'submitted')
        };
    }

    function toToppingsArray(value) {
        if (Array.isArray(value)) {
            return value
                .map((item) => sanitizeText(item))
                .filter(Boolean);
        }

        const text = sanitizeText(value);
        if (!text) {
            return [];
        }

        if (text.toLowerCase() === 'none') {
            return [];
        }

        return text
            .split(/\s*[;,]\s*/)
            .map((item) => sanitizeText(item))
            .filter(Boolean);
    }

    function normalizeOrder(order, index) {
        const total = roundMoney(Math.max(0, toNumber(
            order && (order.total || order.amount || order.subtotal || order.price)
        ) || 0));

        const timestamp = order && (
            order.timestamp ||
            order.createdAt ||
            order.created_at ||
            order.date ||
            order.time
        );

        const status = String(
            (order && (order.status || order.orderStatus || order.state)) || 'Submitted'
        );

        const itemCount = getItemCount(order);

        return {
            id: order && order.id ? order.id : `order-${index + 1}`,
            total,
            timestamp,
            status,
            itemCount
        };
    }

    function getItemCount(order) {
        if (!order || typeof order !== 'object') {
            return 0;
        }

        if (Array.isArray(order.items)) {
            return order.items.reduce((sum, item) => {
                const qty = toNumber(item && (item.qty || item.quantity));
                return sum + (qty && qty > 0 ? Math.round(qty) : 1);
            }, 0);
        }

        const directCount = toNumber(order.itemCount || order.itemsCount || order.count);
        if (directCount !== null && directCount > 0) {
            return Math.round(directCount);
        }

        return 0;
    }

    function hasRequiredHelpers() {
        return ['postOrder', 'fetchOrders', 'addPoints', 'getPoints'].every((fnName) => {
            return typeof window[fnName] === 'function';
        });
    }

    function readableError(error) {
        if (error instanceof Error && error.message) {
            return error.message;
        }
        return 'Unknown error.';
    }

    function parseInteger(value) {
        if (value === '' || value === null || value === undefined) {
            return null;
        }

        const parsed = Number.parseInt(value, 10);
        return Number.isFinite(parsed) ? parsed : null;
    }

    function toNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
            return Number.isFinite(parsed) ? parsed : null;
        }

        return null;
    }

    function sanitizeText(value) {
        return String(value || '').trim().replace(/\s+/g, ' ');
    }

    function numberWithCommas(value) {
        return Number(value || 0).toLocaleString('en-PH');
    }

    function roundMoney(value) {
        return Number((Number(value) || 0).toFixed(2));
    }

    function capitalize(value) {
        const text = String(value || '');
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function createOrderFingerprint(userId, items, total) {
        const normalizedItems = (Array.isArray(items) ? items : []).map((item) => ({
            flavor: sanitizeText(item.flavor),
            size: sanitizeText(item.size),
            toppings: Array.isArray(item.toppings)
                ? item.toppings.map((t) => sanitizeText(t)).filter(Boolean).sort()
                : [],
            qty: Math.max(0, Math.round(toNumber(item.qty) || 0)),
            price: roundMoney(toNumber(item.price) || 0)
        }));

        return JSON.stringify({
            userId: sanitizeText(userId).toLowerCase(),
            total: roundMoney(toNumber(total) || 0),
            items: normalizedItems
        });
    }

    function getReusableOrderId(fingerprint) {
        if (state.pendingOrder && state.pendingOrder.fingerprint === fingerprint) {
            return state.pendingOrder.id;
        }

        const id = createId();
        state.pendingOrder = { id, fingerprint };
        return id;
    }

    function invalidatePendingOrder() {
        state.pendingOrder = null;
    }

    function isValidUserId(value) {
        return USER_ID_PATTERN.test(String(value || ''));
    }

    function showToast(type, message) {
        if (!elements.toastRegion) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.textContent = message;

        elements.toastRegion.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('toast--show');
        });

        setTimeout(() => {
            toast.classList.remove('toast--show');
            toast.classList.add('toast--hide');

            setTimeout(() => {
                toast.remove();
            }, 200);
        }, 2800);

        announce(message);
    }

    function announce(message) {
        if (!elements.srAnnouncer) {
            return;
        }

        elements.srAnnouncer.textContent = '';
        requestAnimationFrame(() => {
            elements.srAnnouncer.textContent = message;
        });
    }

    function toggleHidden(element, shouldHide) {
        if (!element) {
            return;
        }
        element.classList.toggle('hidden', shouldHide);
    }

    function pendingKeyFor(userId) {
        return `${STORAGE_KEYS.pendingPrefix}${String(userId).toLowerCase()}`;
    }

    function getPendingPoints(userId) {
        if (!isValidUserId(userId)) {
            return 0;
        }

        try {
            const stored = localStorage.getItem(pendingKeyFor(userId));
            const parsed = Number.parseInt(stored || '0', 10);
            return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
        } catch (_error) {
            return 0;
        }
    }

    function setPendingPoints(userId, points) {
        if (!isValidUserId(userId)) {
            return;
        }

        try {
            localStorage.setItem(pendingKeyFor(userId), String(Math.max(0, Math.round(points))));
        } catch (_error) {
            // Ignore storage failures in restricted browsers.
        }
    }

    function addPendingPoints(userId, points) {
        const current = getPendingPoints(userId);
        const next = current + Math.max(0, Math.round(points));
        setPendingPoints(userId, next);
        state.pendingPoints = next;
        renderPoints();
        syncActionStates();
    }

    function persistUserId(userId) {
        try {
            if (userId) {
                localStorage.setItem(STORAGE_KEYS.userId, userId);
            } else {
                localStorage.removeItem(STORAGE_KEYS.userId);
            }
        } catch (_error) {
            // Ignore storage failures in restricted browsers.
        }
    }

    function loadInitialUser() {
        elements.itemQtyInput.value = '1';

        try {
            const saved = sanitizeText(localStorage.getItem(STORAGE_KEYS.userId) || '');
            if (!saved) {
                return;
            }

            state.userId = saved;
            elements.userIdInput.value = saved;
            state.pendingPoints = getPendingPoints(saved);
            renderPoints();
        } catch (_error) {
            // Ignore storage failures in restricted browsers.
        }
    }

    function debounce(fn, delayMs) {
        let timeoutId;

        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fn(...args);
            }, delayMs);
        };
    }
})();
