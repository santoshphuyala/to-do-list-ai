// ============================================
// SHOPPING LIST PWA - APP.JS
// Developer: Santosh Phuyal
// Version: 2.0
// ============================================

// ============================================
// CONSTANTS AND DEFAULT DATA
// ============================================

const DB_NAME = 'ShoppingListDB';
const DB_VERSION = 1;
const STORE_NAME = 'appData';
const MAX_UNDO_STEPS = 50;

const DEFAULT_CATEGORIES = [
    { id: 'produce', name: 'Produce', color: '#10b981', icon: '🥬' },
    { id: 'dairy', name: 'Dairy', color: '#3b82f6', icon: '🥛' },
    { id: 'meat', name: 'Meat & Seafood', color: '#ef4444', icon: '🥩' },
    { id: 'bakery', name: 'Bakery', color: '#f59e0b', icon: '🍞' },
    { id: 'frozen', name: 'Frozen', color: '#6366f1', icon: '🧊' },
    { id: 'beverages', name: 'Beverages', color: '#8b5cf6', icon: '🥤' },
    { id: 'snacks', name: 'Snacks', color: '#ec4899', icon: '🍿' },
    { id: 'household', name: 'Household', color: '#14b8a6', icon: '🧹' },
    { id: 'personal', name: 'Personal Care', color: '#f97316', icon: '🧴' },
    { id: 'other', name: 'Other', color: '#6b7280', icon: '📦' }
];

// ============================================
// STATE MANAGEMENT
// ============================================

let db = null;
let deferredPrompt = null;
let pendingImportData = [];
let undoTimeout = null;

let state = {
    currentListId: 'default',
    lists: {
        'default': {
            id: 'default',
            name: 'Shopping List',
            items: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    },
    categories: [...DEFAULT_CATEGORIES],
    templates: [],
    filter: 'all',
    searchQuery: '',
    darkMode: false,
    lastBackupTimestamp: null,
    changesSinceBackup: [],
    undoStack: [],
    redoStack: [],
    analytics: {
        itemHistory: []
    }
};

// ============================================
// INDEXEDDB OPERATIONS
// ============================================

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB error:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('IndexedDB initialized successfully');
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id' });
                console.log('Object store created');
            }
        };
    });
}

async function saveToIndexedDB() {
    if (!db) {
        console.warn('Database not initialized');
        return;
    }

    updateSyncStatus(false);

    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const data = {
                id: 'appState',
                ...state,
                savedAt: new Date().toISOString()
            };

            const request = store.put(data);

            request.onsuccess = () => {
                updateSyncStatus(true);
                resolve();
            };

            request.onerror = () => {
                console.error('Save error:', request.error);
                updateSyncStatus(true);
                reject(request.error);
            };
        } catch (error) {
            console.error('Transaction error:', error);
            updateSyncStatus(true);
            reject(error);
        }
    });
}

async function loadFromIndexedDB() {
    if (!db) return null;

    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get('appState');

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    try {
        // Initialize IndexedDB
        await initDB();
        
        // Load saved state
        const savedState = await loadFromIndexedDB();
        if (savedState) {
            state = { ...state, ...savedState };
            delete state.id;
            delete state.savedAt;
        }

        // Ensure default list exists
        if (!state.lists['default']) {
            state.lists['default'] = {
                id: 'default',
                name: 'Shopping List',
                items: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
        }

        // Apply dark mode if saved
        if (state.darkMode) {
            document.documentElement.classList.add('dark-mode');
            document.getElementById('darkModeBtn').textContent = '☀️';
        }

        // Update UI
        document.getElementById('currentListName').textContent = getCurrentList().name;
        updateCurrentDate();
        renderList();
        updateStats();
        populateCategoryDropdown();
        updateBackupInfo();

        // Setup event listeners
        setupEventListeners();
        
        // Check for shared import
        checkImportUrl();

        // Register service worker
        registerServiceWorker();

        // Setup PWA install prompt
        setupInstallPrompt();

        // Online/Offline status
        updateOnlineStatus();
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);

        console.log('App initialized successfully');

    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Error loading data', 'error');
    }
}

function setupEventListeners() {
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
            const dropdown = document.getElementById('mainDropdown');
            if (dropdown) {
                dropdown.classList.remove('active');
            }
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleKeyboardShortcuts);

    // Prevent form submission on enter in modals
    document.querySelectorAll('.modal input').forEach(input => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.target.closest('form')) {
                e.preventDefault();
            }
        });
    });
}

function handleKeyboardShortcuts(e) {
    // Check if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        // Allow Escape to close modals
        if (e.key === 'Escape') {
            closeAllModals();
        }
        return;
    }

    if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
            case 'n':
                e.preventDefault();
                openAddModal();
                break;
            case 'z':
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
                break;
            case 'y':
                e.preventDefault();
                redo();
                break;
            case 'f':
                e.preventDefault();
                document.getElementById('searchInput').focus();
                break;
            case 'd':
                e.preventDefault();
                toggleDarkMode();
                break;
            case 's':
                e.preventDefault();
                exportJSON();
                break;
        }
    }

    if (e.key === 'Escape') {
        closeAllModals();
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal-overlay.active').forEach(modal => {
        modal.classList.remove('active');
    });
}

// ============================================
// SERVICE WORKER & PWA
// ============================================

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('Service Worker registered:', registration.scope);
            })
            .catch(error => {
                console.log('Service Worker registration failed:', error);
            });
    }
}

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        
        // Show install banner after a delay
        setTimeout(() => {
            const banner = document.getElementById('installBanner');
            if (banner && !localStorage.getItem('installBannerDismissed')) {
                banner.classList.add('visible');
            }
        }, 3000);
    });

    window.addEventListener('appinstalled', () => {
        console.log('App installed');
        deferredPrompt = null;
        document.getElementById('installBanner').classList.remove('visible');
    });
}

function installPWA() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(choiceResult => {
            if (choiceResult.outcome === 'accepted') {
                showToast('App installed successfully!', 'success');
            }
            deferredPrompt = null;
        });
    }
    document.getElementById('installBanner').classList.remove('visible');
}

function dismissInstallBanner() {
    document.getElementById('installBanner').classList.remove('visible');
    localStorage.setItem('installBannerDismissed', 'true');
}

function updateOnlineStatus() {
    const dot = document.getElementById('syncDot');
    const status = document.getElementById('syncStatus');
    
    if (navigator.onLine) {
        dot.classList.remove('offline');
        status.textContent = 'Online';
    } else {
        dot.classList.add('offline');
        status.textContent = 'Offline';
    }
}

// ============================================
// UI HELPERS
// ============================================

function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = now.toLocaleDateString('en-US', options);
}

function updateSyncStatus(saved) {
    const dot = document.getElementById('syncDot');
    const status = document.getElementById('syncStatus');
    
    if (!navigator.onLine) {
        dot.classList.add('offline');
        status.textContent = 'Offline';
        return;
    }
    
    if (saved) {
        dot.classList.remove('pending');
        dot.classList.remove('offline');
        status.textContent = 'Saved';
    } else {
        dot.classList.add('pending');
        status.textContent = 'Saving...';
    }
}

function showToast(message, type = 'default') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function toggleDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('mainDropdown');
    dropdown.classList.toggle('active');
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function getDateString() {
    return new Date().toISOString().split('T')[0];
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
    });
}

function formatCurrency(amount) {
    return '$' + parseFloat(amount || 0).toFixed(2);
}

// ============================================
// LIST MANAGEMENT
// ============================================

function getCurrentList() {
    return state.lists[state.currentListId] || state.lists['default'];
}

function openListsModal() {
    renderListsGrid();
    openModal('listsModal');
}

function renderListsGrid() {
    const grid = document.getElementById('listsGrid');
    const listsArray = Object.values(state.lists);
    
    if (listsArray.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <p>No lists yet</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = listsArray.map(list => {
        const itemCount = list.items.length;
        const completedCount = list.items.filter(i => i.completed).length;
        const listDate = formatDate(list.createdAt);
        
        return `
            <div class="list-card ${list.id === state.currentListId ? 'active' : ''}" 
                 onclick="switchToList('${list.id}')">
                <div class="list-card-header">
                    <span class="list-card-name">
                        📋 ${escapeHtml(list.name)}
                    </span>
                    <span class="list-card-date">${listDate}</span>
                </div>
                <div class="list-card-meta">
                    <span>📝 ${itemCount} items</span>
                    <span>✅ ${completedCount} done</span>
                    ${list.id !== 'default' ? `
                        <button class="item-action-btn delete" 
                                onclick="event.stopPropagation(); deleteList('${list.id}')" 
                                title="Delete">🗑️</button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function createNewList() {
    const name = prompt('Enter list name:');
    if (!name || !name.trim()) return;

    const id = generateId();
    const now = new Date().toISOString();
    
    state.lists[id] = {
        id,
        name: name.trim(),
        items: [],
        createdAt: now,
        updatedAt: now
    };

    state.currentListId = id;
    saveToIndexedDB();
    document.getElementById('currentListName').textContent = name.trim();
    closeModal('listsModal');
    renderList();
    updateStats();
    showToast(`Created: ${name.trim()}`, 'success');
}

function switchToList(id) {
    if (!state.lists[id]) return;
    
    state.currentListId = id;
    document.getElementById('currentListName').textContent = getCurrentList().name;
    saveToIndexedDB();
    closeModal('listsModal');
    state.filter = 'all';
    state.searchQuery = '';
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    updateFilterButtons();
    renderList();
    updateStats();
}

function deleteList(id) {
    if (id === 'default') {
        showToast('Cannot delete default list', 'error');
        return;
    }

    const list = state.lists[id];
    if (!list) return;

    if (confirm(`Delete "${list.name}" and all its items?`)) {
        delete state.lists[id];
        
        if (state.currentListId === id) {
            state.currentListId = 'default';
            document.getElementById('currentListName').textContent = getCurrentList().name;
        }
        
        saveToIndexedDB();
        renderListsGrid();
        renderList();
        updateStats();
        showToast('List deleted', 'success');
    }
}

// ============================================
// ITEM CRUD OPERATIONS
// ============================================

function quickAdd(event) {
    event.preventDefault();
    const input = document.getElementById('quickAddInput');
    const text = input.value.trim();
    
    if (!text) return;

    const parsed = parseQuickInput(text);
    const now = new Date().toISOString();
    
    const item = {
        id: generateId(),
        name: parsed.name,
        quantity: parsed.quantity || '',
        unit: parsed.unit || '',
        price: parsed.price || 0,
        category: 'other',
        priority: 'normal',
        notes: '',
        completed: false,
        createdAt: now,
        updatedAt: now,
        addedDate: getDateString()
    };

    // Save state for undo
    saveStateForUndo();

    getCurrentList().items.unshift(item);
    getCurrentList().updatedAt = now;
    trackChange('add', item);
    trackItemHistory(item.name);
    
    input.value = '';
    saveToIndexedDB();
    renderList();
    updateStats();
    showToast(`Added: ${item.name}`);
}

function parseQuickInput(text) {
    const result = { name: text, quantity: '', unit: '', price: 0 };
    
    // Extract price: $5, $5.99, 5$, etc.
    const pricePattern = /\$(\d+\.?\d*)|(\d+\.?\d*)\$/;
    const priceMatch = text.match(pricePattern);
    if (priceMatch) {
        result.price = parseFloat(priceMatch[1] || priceMatch[2]) || 0;
        text = text.replace(pricePattern, '').trim();
    }

    // Pattern: "item x3" or "item ×3"
    const xPattern = /^(.+?)\s*[x×]\s*(\d+)$/i;
    let match = text.match(xPattern);
    if (match) {
        result.name = match[1].trim();
        result.quantity = match[2];
        return result;
    }

    // Pattern: "2 kg apples" or "2kg apples"
    const unitPattern = /^(\d+\.?\d*)\s*(kg|g|lb|oz|L|ml|pcs|dozen|pack|box|bag|bottle|can)?\s+(.+)$/i;
    match = text.match(unitPattern);
    if (match) {
        result.quantity = match[1];
        result.unit = match[2] || '';
        result.name = match[3].trim();
        return result;
    }

    // Pattern: "3 apples"
    const simplePattern = /^(\d+)\s+(.+)$/;
    match = text.match(simplePattern);
    if (match) {
        result.quantity = match[1];
        result.name = match[2].trim();
        return result;
    }

    result.name = text.trim();
    return result;
}

function openAddModal() {
    document.getElementById('itemModalTitle').textContent = 'Add Item';
    document.getElementById('editItemId').value = '';
    document.getElementById('itemName').value = '';
    document.getElementById('itemQuantity').value = '';
    document.getElementById('itemUnit').value = '';
    document.getElementById('itemPrice').value = '';
    document.getElementById('itemCategory').value = 'other';
    document.getElementById('itemPriority').value = 'normal';
    document.getElementById('itemNotes').value = '';
    openModal('itemModal');
    
    setTimeout(() => {
        document.getElementById('itemName').focus();
    }, 100);
}

function openEditModal(id) {
    const item = getCurrentList().items.find(i => i.id === id);
    if (!item) return;

    document.getElementById('itemModalTitle').textContent = 'Edit Item';
    document.getElementById('editItemId').value = id;
    document.getElementById('itemName').value = item.name || '';
    document.getElementById('itemQuantity').value = item.quantity || '';
    document.getElementById('itemUnit').value = item.unit || '';
    document.getElementById('itemPrice').value = item.price || '';
    document.getElementById('itemCategory').value = item.category || 'other';
    document.getElementById('itemPriority').value = item.priority || 'normal';
    document.getElementById('itemNotes').value = item.notes || '';
    openModal('itemModal');
}

function saveItem() {
    const id = document.getElementById('editItemId').value;
    const name = document.getElementById('itemName').value.trim();
    
    if (!name) {
        showToast('Please enter an item name', 'error');
        return;
    }

    const now = new Date().toISOString();
    const itemData = {
        name,
        quantity: document.getElementById('itemQuantity').value.trim(),
        unit: document.getElementById('itemUnit').value,
        price: parseFloat(document.getElementById('itemPrice').value) || 0,
        category: document.getElementById('itemCategory').value,
        priority: document.getElementById('itemPriority').value,
        notes: document.getElementById('itemNotes').value.trim(),
        updatedAt: now
    };

    // Save state for undo
    saveStateForUndo();

    if (id) {
        // Update existing item
        const index = getCurrentList().items.findIndex(i => i.id === id);
        if (index !== -1) {
            getCurrentList().items[index] = { 
                ...getCurrentList().items[index], 
                ...itemData 
            };
            trackChange('update', getCurrentList().items[index]);
            showToast('Item updated', 'success');
        }
    } else {
        // Add new item
        const newItem = {
            id: generateId(),
            ...itemData,
            completed: false,
            createdAt: now,
            addedDate: getDateString()
        };
        getCurrentList().items.unshift(newItem);
        trackChange('add', newItem);
        trackItemHistory(newItem.name);
        showToast(`Added: ${name}`, 'success');
    }

    getCurrentList().updatedAt = now;
    closeModal('itemModal');
    saveToIndexedDB();
    renderList();
    updateStats();
}

function toggleComplete(id) {
    const item = getCurrentList().items.find(i => i.id === id);
    if (!item) return;
    
    // Save state for undo
    saveStateForUndo();
    
    item.completed = !item.completed;
    item.updatedAt = new Date().toISOString();
    
    if (item.completed) {
        item.completedAt = new Date().toISOString();
    } else {
        delete item.completedAt;
    }
    
    trackChange('update', item);
    saveToIndexedDB();
    renderList();
    updateStats();
    
    if (item.completed) {
        showToast(`Completed: ${item.name}`);
    }
}

function deleteItem(id) {
    const index = getCurrentList().items.findIndex(i => i.id === id);
    if (index === -1) return;
    
    const item = getCurrentList().items[index];
    
    // Save state for undo
    saveStateForUndo();
    
    getCurrentList().items.splice(index, 1);
    trackChange('delete', { id, deletedAt: new Date().toISOString() });
    getCurrentList().updatedAt = new Date().toISOString();
    
    saveToIndexedDB();
    renderList();
    updateStats();
    
    // Show undo bar
    showUndoBar(`Deleted: ${item.name}`);
}

function clearCompleted() {
    const completed = getCurrentList().items.filter(i => i.completed);
    if (completed.length === 0) {
        showToast('No completed items to clear');
        closeDropdown();
        return;
    }
    
    if (confirm(`Remove ${completed.length} completed item(s)?`)) {
        // Save state for undo
        saveStateForUndo();
        
        completed.forEach(item => {
            trackChange('delete', { id: item.id, deletedAt: new Date().toISOString() });
        });
        
        getCurrentList().items = getCurrentList().items.filter(i => !i.completed);
        getCurrentList().updatedAt = new Date().toISOString();
        
        saveToIndexedDB();
        renderList();
        updateStats();
        showToast(`Cleared ${completed.length} item(s)`, 'success');
    }
    closeDropdown();
}

function clearAllItems() {
    if (getCurrentList().items.length === 0) {
        showToast('List is already empty');
        closeDropdown();
        return;
    }
    
    if (confirm('Remove all items from this list?')) {
        // Save state for undo
        saveStateForUndo();
        
        getCurrentList().items.forEach(item => {
            trackChange('delete', { id: item.id, deletedAt: new Date().toISOString() });
        });
        
        getCurrentList().items = [];
        getCurrentList().updatedAt = new Date().toISOString();
        
        saveToIndexedDB();
        renderList();
        updateStats();
        showToast('All items cleared', 'success');
    }
    closeDropdown();
}

function closeDropdown() {
    document.getElementById('mainDropdown').classList.remove('active');
}

// ============================================
// UNDO/REDO SYSTEM
// ============================================

function saveStateForUndo() {
    const currentState = JSON.stringify(getCurrentList().items);
    state.undoStack.push(currentState);
    
    if (state.undoStack.length > MAX_UNDO_STEPS) {
        state.undoStack.shift();
    }
    
    // Clear redo stack on new action
    state.redoStack = [];
}

function undo() {
    if (state.undoStack.length === 0) {
        showToast('Nothing to undo');
        return;
    }
    
    // Save current state to redo stack
    state.redoStack.push(JSON.stringify(getCurrentList().items));
    
    // Restore previous state
    const previousState = state.undoStack.pop();
    getCurrentList().items = JSON.parse(previousState);
    getCurrentList().updatedAt = new Date().toISOString();
    
    saveToIndexedDB();
    renderList();
    updateStats();
    showToast('Undone');
}

function redo() {
    if (state.redoStack.length === 0) {
        showToast('Nothing to redo');
        return;
    }
    
    // Save current state to undo stack
    state.undoStack.push(JSON.stringify(getCurrentList().items));
    
    // Restore next state
    const nextState = state.redoStack.pop();
    getCurrentList().items = JSON.parse(nextState);
    getCurrentList().updatedAt = new Date().toISOString();
    
    saveToIndexedDB();
    renderList();
    updateStats();
    showToast('Redone');
}

function performUndo() {
    undo();
    hideUndoBar();
}

function showUndoBar(message) {
    const undoBar = document.getElementById('undoBar');
    const undoText = document.getElementById('undoBarText');
    
    undoText.textContent = message;
    undoBar.classList.add('visible');
    
    // Clear existing timeout
    if (undoTimeout) {
        clearTimeout(undoTimeout);
    }
    
    // Auto hide after 5 seconds
    undoTimeout = setTimeout(() => {
        hideUndoBar();
    }, 5000);
}

function hideUndoBar() {
    document.getElementById('undoBar').classList.remove('visible');
    if (undoTimeout) {
        clearTimeout(undoTimeout);
        undoTimeout = null;
    }
}

// ============================================
// SEARCH & FILTER
// ============================================

function handleSearch(query) {
    state.searchQuery = query.toLowerCase().trim();
    
    const clearBtn = document.getElementById('searchClear');
    if (query.trim()) {
        clearBtn.classList.add('visible');
    } else {
        clearBtn.classList.remove('visible');
    }
    
    renderList();
}

function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('searchClear').classList.remove('visible');
    state.searchQuery = '';
    renderList();
}

function setFilter(filter) {
    state.filter = filter;
    updateFilterButtons();
    renderList();
}

function updateFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === state.filter);
    });
}

// ============================================
// RENDERING
// ============================================

function renderList() {
    const container = document.getElementById('listContainer');
    let items = [...getCurrentList().items];

    // Apply search filter
    if (state.searchQuery) {
        items = items.filter(i => 
            i.name.toLowerCase().includes(state.searchQuery) ||
            (i.notes && i.notes.toLowerCase().includes(state.searchQuery)) ||
            (i.category && i.category.toLowerCase().includes(state.searchQuery))
        );
    }

    // Apply status filter
    switch (state.filter) {
        case 'pending':
            items = items.filter(i => !i.completed);
            break;
        case 'completed':
            items = items.filter(i => i.completed);
            break;
        case 'high':
            items = items.filter(i => i.priority === 'high');
            break;
        case 'medium':
            items = items.filter(i => i.priority === 'medium');
            break;
    }

    if (items.length === 0) {
        let message = 'Your list is empty';
        let subMessage = 'Start adding items to your shopping list';
        
        if (state.searchQuery) {
            message = 'No items found';
            subMessage = `No items match "${state.searchQuery}"`;
        } else if (state.filter !== 'all') {
            message = 'No items match this filter';
            subMessage = 'Try selecting a different filter';
        }
        
        container.innerHTML = `
            <div class="empty-state fade-in">
                <div class="empty-state-icon">🛒</div>
                <h3>${message}</h3>
                <p>${subMessage}</p>
            </div>
        `;
        return;
    }

    // Group by category
    const grouped = {};
    items.forEach(item => {
        const cat = item.category || 'other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
    });

    // Sort categories by predefined order
    const categoryOrder = state.categories.map(c => c.id);
    const sortedCategories = Object.keys(grouped).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a);
        const indexB = categoryOrder.indexOf(b);
        return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    });

    let html = '';
    sortedCategories.forEach(catId => {
        const category = state.categories.find(c => c.id === catId) || { 
            name: 'Other', 
            icon: '📦' 
        };
        
        html += `
            <div class="category-group fade-in">
                <div class="category-header">
                    ${category.icon} ${category.name} (${grouped[catId].length})
                </div>
                ${grouped[catId].map(item => renderItem(item)).join('')}
            </div>
        `;
    });

    container.innerHTML = html;
    
    // Setup drag and drop
    setupDragAndDrop();
}

function renderItem(item) {
    const quantityDisplay = item.quantity 
        ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` 
        : '';
    
    const priceDisplay = item.price > 0 
        ? `<span class="item-price">💰 ${formatCurrency(item.price)}</span>` 
        : '';
    
    const dateDisplay = item.addedDate 
        ? `<span class="item-date">📅 ${formatDate(item.createdAt)}</span>` 
        : '';
    
    return `
        <div class="list-item ${item.completed ? 'completed' : ''} priority-${item.priority}" 
             data-id="${item.id}"
             draggable="true">
            <div class="drag-handle" title="Drag to reorder">⋮⋮</div>
            <div class="item-checkbox ${item.completed ? 'checked' : ''}" 
                 onclick="toggleComplete('${item.id}')">
                ${item.completed ? '✓' : ''}
            </div>
            <div class="item-content" onclick="openEditModal('${item.id}')">
                <div class="item-name">${escapeHtml(item.name)}</div>
                <div class="item-meta">
                    ${quantityDisplay ? `<span>📦 ${quantityDisplay}</span>` : ''}
                    ${priceDisplay}
                    ${item.notes ? `<span>📝 ${escapeHtml(item.notes)}</span>` : ''}
                    ${dateDisplay}
                </div>
            </div>
            <div class="item-actions">
                <button class="item-action-btn edit" 
                        onclick="openEditModal('${item.id}')" 
                        title="Edit">✏️</button>
                <button class="item-action-btn delete" 
                        onclick="deleteItem('${item.id}')" 
                        title="Delete">🗑️</button>
            </div>
        </div>
    `;
}

function updateStats() {
    const items = getCurrentList().items;
    const total = items.length;
    const done = items.filter(i => i.completed).length;
    const pending = total - done;
    
    // Calculate budget
    const totalBudget = items.reduce((sum, item) => sum + (parseFloat(item.price) || 0), 0);

    document.getElementById('totalCount').textContent = total;
    document.getElementById('doneCount').textContent = done;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('budgetCount').textContent = formatCurrency(totalBudget);
}

// ============================================
// DRAG AND DROP
// ============================================

function setupDragAndDrop() {
    const container = document.getElementById('listContainer');
    const items = container.querySelectorAll('.list-item');
    
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
    });
}

let draggedItemId = null;

function handleDragStart(e) {
    draggedItemId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.list-item').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    if (this.dataset.id !== draggedItemId) {
        this.classList.add('drag-over');
    }
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    
    const targetId = this.dataset.id;
    if (draggedItemId === targetId) return;
    
    const items = getCurrentList().items;
    const draggedIndex = items.findIndex(i => i.id === draggedItemId);
    const targetIndex = items.findIndex(i => i.id === targetId);
    
    if (draggedIndex === -1 || targetIndex === -1) return;
    
    // Save state for undo
    saveStateForUndo();
    
    // Reorder items
    const [draggedItem] = items.splice(draggedIndex, 1);
    items.splice(targetIndex, 0, draggedItem);
    
    getCurrentList().updatedAt = new Date().toISOString();
    saveToIndexedDB();
    renderList();
}

// ============================================
// CATEGORIES
// ============================================

function openCategoriesModal() {
    renderCategoryList();
    openModal('categoriesModal');
    closeDropdown();
}

function renderCategoryList() {
    const list = document.getElementById('categoryList');
    
    list.innerHTML = state.categories.map(cat => {
        const isDefault = DEFAULT_CATEGORIES.some(dc => dc.id === cat.id);
        
        return `
            <div class="category-item">
                <span class="category-item-icon">${cat.icon}</span>
                <span class="category-item-name">${escapeHtml(cat.name)}</span>
                ${!isDefault ? `
                    <button class="item-action-btn delete" 
                            onclick="deleteCategory('${cat.id}')" 
                            title="Delete">🗑️</button>
                ` : ''}
            </div>
        `;
    }).join('');
}

function addCategory() {
    const nameInput = document.getElementById('newCategoryName');
    const iconInput = document.getElementById('newCategoryIcon');
    
    const name = nameInput.value.trim();
    const icon = iconInput.value.trim() || '📦';
    
    if (!name) {
        showToast('Please enter a category name', 'error');
        return;
    }

    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    
    if (state.categories.some(c => c.id === id)) {
        showToast('Category already exists', 'error');
        return;
    }

    state.categories.push({
        id,
        name,
        color: '#6b7280',
        icon
    });

    nameInput.value = '';
    iconInput.value = '';
    
    saveToIndexedDB();
    renderCategoryList();
    populateCategoryDropdown();
    showToast(`Added category: ${name}`, 'success');
}

function deleteCategory(id) {
    const category = state.categories.find(c => c.id === id);
    if (!category) return;
    
    if (confirm(`Delete category "${category.name}"? Items will be moved to "Other".`)) {
        state.categories = state.categories.filter(c => c.id !== id);
        
        // Move items to 'other' category
        Object.values(state.lists).forEach(list => {
            list.items.forEach(item => {
                if (item.category === id) {
                    item.category = 'other';
                }
            });
        });
        
        saveToIndexedDB();
        renderCategoryList();
        populateCategoryDropdown();
        renderList();
        showToast('Category deleted', 'success');
    }
}

function populateCategoryDropdown() {
    const select = document.getElementById('itemCategory');
    select.innerHTML = state.categories.map(cat => 
        `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`
    ).join('');
}

// ============================================
// TEMPLATES
// ============================================

function openTemplatesModal() {
    renderTemplatesGrid();
    openModal('templatesModal');
    closeDropdown();
}

function renderTemplatesGrid() {
    const grid = document.getElementById('templatesGrid');
    
    if (state.templates.length === 0) {
        grid.innerHTML = `
            <div class="empty-templates">
                <div class="empty-templates-icon">📑</div>
                <p>No templates saved yet</p>
                <p style="font-size: 0.8rem; color: var(--gray-400);">
                    Save your current list as a template for quick reuse
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = state.templates.map(template => `
        <div class="template-card" onclick="loadTemplate('${template.id}')">
            <div class="template-icon">📋</div>
            <div class="template-info">
                <div class="template-name">${escapeHtml(template.name)}</div>
                <div class="template-count">${template.items.length} items</div>
            </div>
            <div class="template-actions">
                <button class="item-action-btn delete" 
                        onclick="event.stopPropagation(); deleteTemplate('${template.id}')" 
                        title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');
}

function saveAsTemplate() {
    const items = getCurrentList().items;
    
    if (items.length === 0) {
        showToast('Add some items first', 'error');
        return;
    }
    
    const name = prompt('Enter template name:', getCurrentList().name + ' Template');
    if (!name || !name.trim()) return;
    
    const template = {
        id: generateId(),
        name: name.trim(),
        items: items.map(item => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            category: item.category,
            priority: item.priority,
            price: item.price
        })),
        createdAt: new Date().toISOString()
    };
    
    state.templates.push(template);
    saveToIndexedDB();
    renderTemplatesGrid();
    showToast(`Template "${name.trim()}" saved`, 'success');
}

function loadTemplate(templateId) {
    const template = state.templates.find(t => t.id === templateId);
    if (!template) return;
    
    if (!confirm(`Add ${template.items.length} items from "${template.name}" to your current list?`)) {
        return;
    }
    
    // Save state for undo
    saveStateForUndo();
    
    let addedCount = 0;
    const now = new Date().toISOString();
    
    template.items.forEach(templateItem => {
        // Check if item already exists
        const exists = getCurrentList().items.some(i => 
            i.name.toLowerCase() === templateItem.name.toLowerCase()
        );
        
        if (!exists) {
            getCurrentList().items.push({
                id: generateId(),
                ...templateItem,
                completed: false,
                notes: '',
                createdAt: now,
                updatedAt: now,
                addedDate: getDateString()
            });
            addedCount++;
        }
    });
    
    if (addedCount > 0) {
        getCurrentList().updatedAt = now;
        saveToIndexedDB();
        renderList();
        updateStats();
        showToast(`Added ${addedCount} items from template`, 'success');
    } else {
        showToast('All items already exist in your list', 'warning');
    }
    
    closeModal('templatesModal');
}

function deleteTemplate(id) {
    const template = state.templates.find(t => t.id === id);
    if (!template) return;
    
    if (confirm(`Delete template "${template.name}"?`)) {
        state.templates = state.templates.filter(t => t.id !== id);
        saveToIndexedDB();
        renderTemplatesGrid();
        showToast('Template deleted', 'success');
    }
}

// ============================================
// ANALYTICS
// ============================================

function trackChange(action, item) {
    state.changesSinceBackup.push({
        action,
        item: { ...item },
        timestamp: new Date().toISOString()
    });
}

function trackItemHistory(itemName) {
    if (!state.analytics.itemHistory) {
        state.analytics.itemHistory = [];
    }
    
    state.analytics.itemHistory.push({
        name: itemName.toLowerCase(),
        addedAt: new Date().toISOString()
    });
    
    // Keep only last 1000 entries
    if (state.analytics.itemHistory.length > 1000) {
        state.analytics.itemHistory = state.analytics.itemHistory.slice(-1000);
    }
}

function openAnalyticsModal() {
    renderAnalytics();
    openModal('analyticsModal');
    closeDropdown();
}

function renderAnalytics() {
    const allItems = Object.values(state.lists).flatMap(list => list.items);
    const totalItems = allItems.length;
    const completedItems = allItems.filter(i => i.completed).length;
    const completionRate = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const totalSpent = allItems
        .filter(i => i.completed)
        .reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0);
    
    // Render overview cards
    document.getElementById('analyticsOverview').innerHTML = `
        <div class="analytics-card">
            <div class="analytics-card-value">${totalItems}</div>
            <div class="analytics-card-label">Total Items</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-value">${completionRate}%</div>
            <div class="analytics-card-label">Completion Rate</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-value">${Object.keys(state.lists).length}</div>
            <div class="analytics-card-label">Shopping Lists</div>
        </div>
        <div class="analytics-card">
            <div class="analytics-card-value">${formatCurrency(totalSpent)}</div>
            <div class="analytics-card-label">Total Spent</div>
        </div>
    `;
    
    // Calculate top items
    const itemFrequency = {};
    (state.analytics.itemHistory || []).forEach(entry => {
        const name = entry.name;
        itemFrequency[name] = (itemFrequency[name] || 0) + 1;
    });
    
    const topItems = Object.entries(itemFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    
    // Render top items
    const topItemsList = document.getElementById('topItemsList');
    if (topItems.length === 0) {
        topItemsList.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 20px;">No data yet</p>';
    } else {
        topItemsList.innerHTML = topItems.map((item, index) => `
            <div class="top-item">
                <div class="top-item-rank">${index + 1}</div>
                <div class="top-item-name">${escapeHtml(item[0])}</div>
                <div class="top-item-count">${item[1]} times</div>
            </div>
        `).join('');
    }
    
    // Calculate category distribution
    const categoryCount = {};
    allItems.forEach(item => {
        const cat = item.category || 'other';
        categoryCount[cat] = (categoryCount[cat] || 0) + 1;
    });
    
    const maxCount = Math.max(...Object.values(categoryCount), 1);
    
    // Render category distribution
    const categoryDist = document.getElementById('categoryDistribution');
    if (Object.keys(categoryCount).length === 0) {
        categoryDist.innerHTML = '<p style="color: var(--gray-500); text-align: center; padding: 20px;">No data yet</p>';
    } else {
        categoryDist.innerHTML = Object.entries(categoryCount)
            .sort((a, b) => b[1] - a[1])
            .map(([catId, count]) => {
                const category = state.categories.find(c => c.id === catId) || { name: 'Other', icon: '📦' };
                const percentage = Math.round((count / maxCount) * 100);
                
                return `
                    <div class="category-dist-item">
                        <div class="category-dist-header">
                            <span class="category-dist-name">${category.icon} ${category.name}</span>
                            <span class="category-dist-count">${count} items</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
    }
}

// ============================================
// BACKUP & RESTORE
// ============================================

function openBackupModal() {
    updateBackupInfo();
    openModal('backupModal');
    closeDropdown();
}

function updateBackupInfo() {
    document.getElementById('lastBackupDate').textContent = state.lastBackupTimestamp 
        ? formatDate(state.lastBackupTimestamp) + ' ' + new Date(state.lastBackupTimestamp).toLocaleTimeString()
        : 'Never';
    
    document.getElementById('pendingChanges').textContent = state.changesSinceBackup.length + ' items';
    
    const totalItems = Object.values(state.lists).reduce((sum, list) => sum + list.items.length, 0);
    document.getElementById('totalItemsCount').textContent = totalItems;
}

// Export JSON
function exportJSON() {
    const data = {
        version: '2.0',
        developer: 'Santosh Phuyal',
        exportedAt: new Date().toISOString(),
        type: 'full',
        lists: state.lists,
        categories: state.categories,
        templates: state.templates,
        analytics: state.analytics
    };

    downloadFile(
        JSON.stringify(data, null, 2),
        `shopping-list-backup-${getDateString()}.json`,
        'application/json'
    );

    state.lastBackupTimestamp = new Date().toISOString();
    state.changesSinceBackup = [];
    saveToIndexedDB();
    updateBackupInfo();
    showToast('Full backup exported', 'success');
    closeModal('backupModal');
}

// Export Incremental JSON
function exportIncrementalJSON() {
    if (state.changesSinceBackup.length === 0) {
        showToast('No changes to backup', 'warning');
        return;
    }

    const data = {
        version: '2.0',
        developer: 'Santosh Phuyal',
        exportedAt: new Date().toISOString(),
        type: 'incremental',
        baseTimestamp: state.lastBackupTimestamp,
        changes: state.changesSinceBackup
    };

    downloadFile(
        JSON.stringify(data, null, 2),
        `shopping-list-incremental-${getDateString()}.json`,
        'application/json'
    );

    showToast(`Exported ${state.changesSinceBackup.length} changes`, 'success');
    closeModal('backupModal');
}

// Export Excel
function exportExcel() {
    try {
        const workbook = XLSX.utils.book_new();

        // Export all lists
        Object.values(state.lists).forEach(list => {
            const data = list.items.map(item => ({
                'Name': item.name,
                'Quantity': item.quantity || '',
                'Unit': item.unit || '',
                'Price': item.price || 0,
                'Category': state.categories.find(c => c.id === item.category)?.name || 'Other',
                'Priority': item.priority || 'normal',
                'Notes': item.notes || '',
                'Completed': item.completed ? 'Yes' : 'No',
                'Added Date': item.addedDate || '',
                'Created': item.createdAt || '',
                'Updated': item.updatedAt || ''
            }));

            if (data.length === 0) {
                data.push({ 'Name': '(empty list)' });
            }

            const worksheet = XLSX.utils.json_to_sheet(data);
            
            // Set column widths
            worksheet['!cols'] = [
                { wch: 30 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
                { wch: 15 }, { wch: 10 }, { wch: 30 }, { wch: 10 },
                { wch: 12 }, { wch: 20 }, { wch: 20 }
            ];

            // Sanitize sheet name (max 31 chars, no special chars)
            const sheetName = list.name.replace(/[\\\/\?\*\[\]]/g, '').substring(0, 31);
            XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
        });

        // Add categories sheet
        const catData = state.categories.map(c => ({
            'ID': c.id,
            'Name': c.name,
            'Icon': c.icon
        }));
        const catSheet = XLSX.utils.json_to_sheet(catData);
        XLSX.utils.book_append_sheet(workbook, catSheet, 'Categories');

        XLSX.writeFile(workbook, `shopping-list-${getDateString()}.xlsx`);
        
        state.lastBackupTimestamp = new Date().toISOString();
        state.changesSinceBackup = [];
        saveToIndexedDB();
        updateBackupInfo();
        showToast('Excel backup exported', 'success');
        closeModal('backupModal');
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Error exporting Excel', 'error');
    }
}

// Handle JSON Import
function handleJSONImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.type === 'incremental') {
                // Apply incremental changes
                const changes = data.changes || [];
                if (changes.length === 0) {
                    showToast('No changes in backup file', 'warning');
                    return;
                }
                
                if (confirm(`Apply ${changes.length} changes from incremental backup?`)) {
                    applyIncrementalChanges(changes);
                    showToast(`Applied ${changes.length} changes`, 'success');
                }
            } else {
                // Full restore - show preview
                prepareImportPreview(data, 'json');
            }
        } catch (err) {
            console.error('JSON parse error:', err);
            showToast('Invalid JSON file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Handle Excel Import
function handleExcelImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            
            // Collect all items from all sheets except Categories
            const items = [];
            
            workbook.SheetNames.forEach(sheetName => {
                if (sheetName === 'Categories') return;
                
                const worksheet = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(worksheet);
                
                data.forEach(row => {
                    if (row.Name && row.Name !== '(empty list)') {
                        items.push({
                            name: row.Name,
                            quantity: row.Quantity?.toString() || '',
                            unit: row.Unit || '',
                            price: parseFloat(row.Price) || 0,
                            category: findCategoryId(row.Category) || 'other',
                            priority: (row.Priority || 'normal').toLowerCase(),
                            notes: row.Notes || '',
                            completed: (row.Completed || '').toLowerCase() === 'yes'
                        });
                    }
                });
            });
            
            if (items.length === 0) {
                showToast('No items found in Excel file', 'warning');
                return;
            }
            
            prepareImportPreview({ items }, 'excel');
            
        } catch (err) {
            console.error('Excel parse error:', err);
            showToast('Error reading Excel file', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
}

function findCategoryId(categoryName) {
    if (!categoryName) return 'other';
    const cat = state.categories.find(c => 
        c.name.toLowerCase() === categoryName.toLowerCase()
    );
    return cat ? cat.id : 'other';
}

function applyIncrementalChanges(changes) {
    changes.forEach(change => {
        const listItems = getCurrentList().items;
        const index = listItems.findIndex(i => i.id === change.item.id);

        switch (change.action) {
            case 'add':
                if (index === -1) {
                    listItems.push({
                        ...change.item,
                        addedDate: getDateString()
                    });
                }
                break;
            case 'update':
                if (index !== -1) {
                    listItems[index] = { ...listItems[index], ...change.item };
                }
                break;
            case 'delete':
                if (index !== -1) {
                    listItems.splice(index, 1);
                }
                break;
        }
    });
    
    getCurrentList().updatedAt = new Date().toISOString();
    saveToIndexedDB();
    renderList();
    updateStats();
}

function prepareImportPreview(data, source) {
    let items = [];
    
    if (source === 'json' && data.lists) {
        // Extract all items from all lists
        Object.values(data.lists).forEach(list => {
            if (list.items) {
                items = items.concat(list.items);
            }
        });
    } else if (data.items) {
        items = data.items;
    }
    
    if (items.length === 0) {
        showToast('No items found to import', 'warning');
        return;
    }
    
    // Check for duplicates
    const currentItems = getCurrentList().items;
    const currentNames = new Set(currentItems.map(i => i.name.toLowerCase()));
    
    pendingImportData = items.map(item => ({
        ...item,
        isDuplicate: currentNames.has(item.name.toLowerCase()),
        selected: !currentNames.has(item.name.toLowerCase())
    }));
    
    const newCount = pendingImportData.filter(i => !i.isDuplicate).length;
    const dupCount = pendingImportData.filter(i => i.isDuplicate).length;
    
    // Render preview
    document.getElementById('importSummary').innerHTML = `
        <strong>${items.length}</strong> items found: 
        <span style="color: var(--success)">${newCount} new</span>, 
        <span style="color: var(--gray-500)">${dupCount} duplicates</span>
    `;
    
    renderImportPreview();
    closeModal('backupModal');
    openModal('importPreviewModal');
}

function renderImportPreview() {
    const list = document.getElementById('importPreviewList');
    
    list.innerHTML = pendingImportData.map((item, index) => `
        <div class="import-item">
            <input type="checkbox" 
                   class="import-item-checkbox" 
                   ${item.selected ? 'checked' : ''} 
                   ${item.isDuplicate ? 'disabled' : ''}
                   onchange="toggleImportItem(${index})">
            <span class="import-item-name">${escapeHtml(item.name)}</span>
            <span class="import-item-status ${item.isDuplicate ? 'duplicate' : 'new'}">
                ${item.isDuplicate ? 'Duplicate' : 'New'}
            </span>
        </div>
    `).join('');
}

function toggleImportItem(index) {
    if (!pendingImportData[index].isDuplicate) {
        pendingImportData[index].selected = !pendingImportData[index].selected;
    }
}

function selectAllImport(selectNew) {
    pendingImportData.forEach(item => {
        if (!item.isDuplicate) {
            item.selected = selectNew;
        }
    });
    renderImportPreview();
}

function confirmImport() {
    const selectedItems = pendingImportData.filter(i => i.selected && !i.isDuplicate);
    
    if (selectedItems.length === 0) {
        showToast('No items selected to import', 'warning');
        return;
    }
    
    // Save state for undo
    saveStateForUndo();
    
    const now = new Date().toISOString();
    let importedCount = 0;
    
    selectedItems.forEach(item => {
        const newItem = {
            id: generateId(),
            name: item.name,
            quantity: item.quantity || '',
            unit: item.unit || '',
            price: parseFloat(item.price) || 0,
            category: item.category || 'other',
            priority: item.priority || 'normal',
            notes: item.notes || '',
            completed: false,
            createdAt: now,
            updatedAt: now,
            addedDate: getDateString()
        };
        
        getCurrentList().items.push(newItem);
        trackItemHistory(newItem.name);
        importedCount++;
    });
    
    getCurrentList().updatedAt = now;
    pendingImportData = [];
    
    saveToIndexedDB();
    closeModal('importPreviewModal');
    renderList();
    updateStats();
    showToast(`Imported ${importedCount} items`, 'success');
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================
// SHARE FUNCTIONALITY
// ============================================

function shareList() {
    const list = getCurrentList();
    
    if (list.items.length === 0) {
        showToast('Add some items first', 'warning');
        closeDropdown();
        return;
    }
    
    const shareData = {
        name: list.name,
        date: getDateString(),
        items: list.items.map(i => ({
            n: i.name,
            q: i.quantity,
            u: i.unit,
            c: i.category,
            p: i.price
        }))
    };
    
    try {
        const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
        const shareUrl = `${window.location.origin}${window.location.pathname}?import=${encoded}`;
        
        document.getElementById('shareLink').value = shareUrl;
        openModal('shareModal');
        closeDropdown();
    } catch (error) {
        console.error('Share error:', error);
        showToast('Error creating share link', 'error');
    }
}

function copyShareLink() {
    const input = document.getElementById('shareLink');
    input.select();
    input.setSelectionRange(0, 99999);
    
    try {
        navigator.clipboard.writeText(input.value);
        showToast('Link copied to clipboard!', 'success');
    } catch (error) {
        document.execCommand('copy');
        showToast('Link copied!', 'success');
    }
}

function nativeShare() {
    const list = getCurrentList();
    const shareUrl = document.getElementById('shareLink').value;
    
    if (navigator.share) {
        navigator.share({
            title: list.name,
            text: `Check out my shopping list: ${list.name} (${list.items.length} items)`,
            url: shareUrl
        }).catch(err => {
            if (err.name !== 'AbortError') {
                console.error('Share error:', err);
            }
        });
    } else {
        copyShareLink();
    }
}

function checkImportUrl() {
    const params = new URLSearchParams(window.location.search);
    const importData = params.get('import');
    
    if (importData) {
        try {
            const decoded = decodeURIComponent(atob(importData));
            const data = JSON.parse(decoded);
            
            const itemCount = data.items?.length || 0;
            if (itemCount === 0) return;
            
            setTimeout(() => {
                if (confirm(`Import "${data.name}" with ${itemCount} items?`)) {
                    importSharedList(data);
                }
                
                // Clean URL
                window.history.replaceState({}, '', window.location.pathname);
            }, 500);
            
        } catch (e) {
            console.error('Import URL error:', e);
            window.history.replaceState({}, '', window.location.pathname);
        }
    }
}

function importSharedList(data) {
    const id = generateId();
    const now = new Date().toISOString();
    
    const items = data.items.map(i => ({
        id: generateId(),
        name: i.n,
        quantity: i.q || '',
        unit: i.u || '',
        category: i.c || 'other',
        priority: 'normal',
        price: i.p || 0,
        notes: '',
        completed: false,
        createdAt: now,
        updatedAt: now,
        addedDate: getDateString()
    }));
    
    state.lists[id] = {
        id,
        name: data.name || 'Imported List',
        items,
        createdAt: now,
        updatedAt: now
    };
    
    state.currentListId = id;
    document.getElementById('currentListName').textContent = state.lists[id].name;
    
    saveToIndexedDB();
    renderList();
    updateStats();
    showToast(`Imported: ${data.name}`, 'success');
}

// ============================================
// DARK MODE
// ============================================

function toggleDarkMode() {
    state.darkMode = !state.darkMode;
    document.documentElement.classList.toggle('dark-mode', state.darkMode);
    document.getElementById('darkModeBtn').textContent = state.darkMode ? '☀️' : '🌙';
    saveToIndexedDB();
    showToast(state.darkMode ? 'Dark mode enabled' : 'Light mode enabled');
}

// ============================================
// MODALS
// ============================================

function openShortcutsModal() {
    openModal('shortcutsModal');
    closeDropdown();
}

function openAboutModal() {
    openModal('aboutModal');
    closeDropdown();
}

// ============================================
// INITIALIZATION
// ============================================

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Handle visibility change for saving
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        saveToIndexedDB();
    }
});

// Save before unload
window.addEventListener('beforeunload', () => {
    saveToIndexedDB();
});