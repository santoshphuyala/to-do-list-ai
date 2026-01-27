// *** NEW: IndexedDB Setup ***
let db;
const DB_NAME = 'TaskMasterDB';
const TASK_STORE = 'tasks';
const SETTINGS_STORE = 'settings';

/**
 * Initializes the IndexedDB database and object stores.
 */
async function initDB() {
    db = await idb.openDB(DB_NAME, 1, {
        upgrade(db) {
            // Create the 'tasks' object store if it doesn't exist
            if (!db.objectStoreNames.contains(TASK_STORE)) {
                const taskStore = db.createObjectStore(TASK_STORE, { keyPath: 'id' });
                // Add indexes for efficient querying and sorting
                taskStore.createIndex('category', 'category');
                taskStore.createIndex('completed', 'completed');
                taskStore.createIndex('priority', 'priority');
                taskStore.createIndex('dueDate', 'dueDate');
                taskStore.createIndex('order', 'order');
                taskStore.createIndex('parentId', 'parentId');
            }
            // Create the 'settings' object store
            if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
                db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
            }
        },
    });
}


// Global State
let tasks = [];
let currentFilter = 'all';
let currentEditingTask = null;
let selectedTasks = new Set();
let currentSort = 'dueDate'; // *** UPDATED: Default sort is nearest due date
let currentSearch = ''; // *** NEW: Search state
let activeQuickFilter = null; // *** NEW: Active quick filter (overdue, today, week)
let activePriorityFilter = null; // *** NEW: Active priority filter (urgent, high, medium, low)

// *** NEW: Pagination State ***
let currentPage = 1;
let pageSize = 10;
let totalTasks = 0;
let totalPages = 0;

// *** NEW: Undo/Redo State ***
let history = [];
let historyIndex = -1;
const maxHistorySize = 50;

// *** NEW: Auto-save State ***
let autoSaveTimer = null;
let autoSaveDelay = 2000; // 2 seconds
let hasUnsavedChanges = false;

let settings = {
    id: 'main-settings', // *** NEW: Key for IndexedDB settings object
    defaultCategory: 'personal',
    defaultPriority: 'medium',
    defaultReminderHours: 2,
    pinEnabled: false,
    pin: null,
    theme: 'light'
};
let pendingImportData = null;
let lastFocusedElement = null; // *** NEW: For a11y focus management


// Initialize App
document.addEventListener('DOMContentLoaded', async function() {
    // *** UPDATED: Async initialization for DB ***
    try {
        await initDB();
        await loadSettings();
        await loadTasks();
        
        // *** NEW: Initialize history with initial state ***
        if (history.length === 0) {
            saveToHistory('Initial state');
        }
        
        applyTheme();
        checkPinProtection();
        setupEventListeners();
        checkReminders();
        renderAISummary();
        updateFilterCounts(); // *** NEW: Initialize filter counts
        
        // *** NEW: Handle URL Hash for filters on page load ***
        handleHashChange();

        
        // *** NEW: Handle PWA shortcut action ***
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'add-task') {
            openAdvancedForm();
            // Clean up the URL so it doesn't trigger on refresh
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        // Check reminders every minute
        setInterval(checkReminders, 60000);
        
    } catch (error) {
        console.error("Failed to initialize the app:", error);
        // Use custom modal instead of alert
        showInfoModal("Initialization Error", "Error loading app data. Please try refreshing the page.");
    }
});

// Event Listeners
function setupEventListeners() {
    document.getElementById('quickTaskInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            quickAddTask();
        }
    });

    document.getElementById('pinInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            verifyPin();
        }
    });

    // AI Summary toggle listener (if element exists)
    const aiSummaryHeader = document.querySelector('.ai-summary-header');
    if (aiSummaryHeader) {
        aiSummaryHeader.addEventListener('click', toggleAISummary);
    }
    
    // Listener for the sort dropdown
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => setSortOption(e.target.value));
    }
    
    // *** NEW: Search input listener ***
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase();
            if(clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !currentSearch);
            // Reset pagination when searching
            currentPage = 1;
            renderTasks();
        });
    }
    
    // *** NEW: Keyboard shortcuts for undo/redo ***
    document.addEventListener('keydown', function(e) {
        // Ctrl+Z for undo
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y or Ctrl+Shift+Z for redo
        if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
            e.preventDefault();
            redo();
        }
    });
    
    // *** NEW: URL Hash change listener for filters ***
    window.addEventListener('hashchange', handleHashChange);
}

// *** NEW: Handle URL Hash Change ***
/**
 * Reads the URL hash, updates the filter state, and re-renders the UI.
 */
function handleHashChange() {
    let hash = window.location.hash.substring(1);
    if (!hash) {
        hash = 'all'; // Default filter
    }
    
    // Check if the filter is a valid one from our tabs
    const validFilters = ['all', 'personal', 'office', 'misc', 'recurring', 'completed'];
    if (validFilters.includes(hash)) {
        currentFilter = hash;
    } else {
        currentFilter = 'all';
        window.location.hash = 'all'; // Correct an invalid hash
    }
    
    // Update active tab UI
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    // Find the tab that corresponds to the current filter
    const tabToActive = [...tabs].find(tab => tab.onclick && tab.onclick.toString().includes(`'${currentFilter}'`));
    if (tabToActive) {
        tabToActive.classList.add('active');
    }
    
    renderTasks();
}

// *** NEW: Clear search input ***
function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if(searchInput) searchInput.value = '';
    currentSearch = '';
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if(clearSearchBtn) clearSearchBtn.classList.add('hidden');
    // Reset pagination when clearing search
    currentPage = 1;
    renderTasks();
}

// *** NEW: Quick Filter Functions ***

/**
 * Apply time-based quick filter (overdue, today, week)
 */
function applyQuickFilter(filterType) {
    const btn = document.getElementById(`filter-${filterType}`);
    
    // Toggle the filter
    if (activeQuickFilter === filterType) {
        activeQuickFilter = null;
        btn.classList.remove('active');
    } else {
        // Remove previous active filter
        if (activeQuickFilter) {
            document.getElementById(`filter-${activeQuickFilter}`).classList.remove('active');
        }
        activeQuickFilter = filterType;
        btn.classList.add('active');
    }
    
    // Reset pagination when applying quick filter
    currentPage = 1;
    updateClearFiltersButton();
    renderTasks();
}

/**
 * Apply priority filter
 */
function applyPriorityFilter(priority) {
    const btn = document.getElementById(`filter-${priority}`);
    
    // Toggle filter
    if (activePriorityFilter === priority) {
        activePriorityFilter = null;
        btn.classList.remove('active');
    } else {
        // Remove previous active filter
        if (activePriorityFilter) {
            const prevBtn = document.getElementById(`filter-${activePriorityFilter}`);
            if (prevBtn) prevBtn.classList.remove('active');
        }
        
        activePriorityFilter = priority;
        btn.classList.add('active');
    }
    
    // Reset pagination when applying priority filter
    currentPage = 1;
    updateClearFiltersButton();
    renderTasks();
}

/**
 * Clear all quick filters
 */
function clearQuickFilters() {
    // Clear quick filter
    if (activeQuickFilter) {
        const btn = document.getElementById(`filter-${activeQuickFilter}`);
        if (btn) btn.classList.remove('active');
        activeQuickFilter = null;
    }
    
    // Clear priority filter
    if (activePriorityFilter) {
        const btn = document.getElementById(`filter-${activePriorityFilter}`);
        if (btn) btn.classList.remove('active');
        activePriorityFilter = null;
    }
    
    // Reset pagination when clearing filters
    currentPage = 1;
    updateClearFiltersButton();
    renderTasks();
}

/**
 * Show/hide clear filters button
 */
function updateClearFiltersButton() {
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
        if (activeQuickFilter || activePriorityFilter) {
            clearBtn.style.display = 'flex';
        } else {
            clearBtn.style.display = 'none';
        }
    }
}

/**
 * Update filter counts
 */
function updateFilterCounts() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const pendingTasks = tasks.filter(t => !t.completed);
    
    // Count overdue
    const overdueCount = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < today;
    }).length;
    
    // Count today
    const todayCount = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate < tomorrow;
    }).length;
    
    // Count this week
    const weekCount = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= today && dueDate < weekEnd;
    }).length;
    
    // Count by priority
    const urgentCount = pendingTasks.filter(t => t.priority === 'urgent').length;
    const highCount = pendingTasks.filter(t => t.priority === 'high').length;
    const mediumCount = pendingTasks.filter(t => t.priority === 'medium').length;
    const lowCount = pendingTasks.filter(t => t.priority === 'low').length;
    
    // Update UI
    const updateCount = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = count;
    };
    
    updateCount('count-overdue', overdueCount);
    updateCount('count-today', todayCount);
    updateCount('count-week', weekCount);
    updateCount('count-urgent', urgentCount);
    updateCount('count-high', highCount);
    updateCount('count-medium', mediumCount);
    updateCount('count-low', lowCount);
}

/**
 * Check if task matches quick filter criteria
 */
function matchesQuickFilter(task) {
    if (!activeQuickFilter) return true;
    if (task.completed) return false; // Quick filters only apply to pending tasks
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    if (!task.dueDate) return false;
    const dueDate = new Date(task.dueDate);
    
    switch (activeQuickFilter) {
        case 'overdue':
            return dueDate < today;
        case 'today':
            return dueDate >= today && dueDate < tomorrow;
        case 'week':
            return dueDate >= today && dueDate < weekEnd;
        default:
            return true;
    }
}

/**
 * Check if task matches priority filter
 */
function matchesPriorityFilter(task) {
    if (!activePriorityFilter) return true;
    return task.priority === activePriorityFilter && !task.completed;
}

// PIN Protection
function checkPinProtection() {
    if (settings.pinEnabled && settings.pin) {
        document.getElementById('pinLockScreen').classList.remove('hidden');
        document.getElementById('mainApp').style.display = 'none';
    }
}

function verifyPin() {
    const enteredPin = document.getElementById('pinInput').value;
    if (enteredPin === settings.pin) {
        document.getElementById('pinLockScreen').classList.add('hidden');
        document.getElementById('mainApp').style.display = 'block';
        document.getElementById('pinInput').value = '';
        document.getElementById('pinError').classList.add('hidden');
    } else {
        document.getElementById('pinError').classList.remove('hidden');
        document.getElementById('pinInput').value = '';
    }
}

function togglePinSetting() {
    const enabled = document.getElementById('enablePin').checked;
    const pinSettings = document.getElementById('pinSettings');
    
    if (enabled) {
        pinSettings.classList.remove('hidden');
    } else {
        pinSettings.classList.add('hidden');
        settings.pinEnabled = false;
        settings.pin = null;
        saveSettings(); // Async, but we don't need to wait
    }
}

async function savePinSettings() {
    const newPin = document.getElementById('newPin').value;
    const confirmPin = document.getElementById('confirmPin').value;
    
    if (newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
        showToast('PIN must be exactly 6 digits', 'error');
        return;
    }
    
    if (newPin !== confirmPin) {
        showToast('PINs do not match', 'error');
        return;
    }
    
    settings.pinEnabled = true;
    settings.pin = newPin;
    await saveSettings();
    showToast('PIN saved successfully', 'success');
    
    document.getElementById('newPin').value = '';
    document.getElementById('confirmPin').value = '';
}

// Theme Toggle
function toggleDarkMode() {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveSettings(); // Async, but we don't need to wait
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const icon = document.getElementById('themeIcon');
    if(icon) {
        icon.className = settings.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// *** NEW: Enhanced Quick Add Input Animation ***
const quickInput = document.getElementById('quickTaskInput');
if (quickInput) {
    quickInput.addEventListener('focus', () => {
        quickInput.parentElement.style.transform = 'scale(1.02)';
    });
    
    quickInput.addEventListener('blur', () => {
        quickInput.parentElement.style.transform = 'scale(1)';
    });
    
    // Shake animation on empty submit
    const originalQuickAddTask = window.quickAddTask;
    window.quickAddTask = function() {
        const input = document.getElementById('quickTaskInput');
        if (!input.value.trim()) {
            input.parentElement.style.animation = 'shake 0.5s';
            setTimeout(() => {
                input.parentElement.style.animation = '';
            }, 500);
            input.focus();
            return;
        }
        originalQuickAddTask();
    };
}

// Task Management
async function quickAddTask() {
    const input = document.getElementById('quickTaskInput');
    const title = input.value.trim();
    
    if (!title) return;
    
    const now = Date.now();
    
    const task = {
        id: now.toString(),
        title: title,
        description: '',
        category: settings.defaultCategory,
        priority: settings.defaultPriority,
        dueDate: null,
        reminder: null,
        repeat: false,
        repeatFrequency: null,
        tags: [],
        completed: false,
        createdAt: new Date(now).toISOString(),
        order: now, // *** NEW: For manual sorting
        parentId: null // *** NEW: For subtasks
    };
    
    tasks.push(task);
    saveToHistory('Quick add task: ' + title);
    await saveTasks(); // *** UPDATED: Await DB save
    renderTasks();
    renderAISummary(); 
    input.value = '';
    showToast('Task added successfully', 'success');
}

function openAdvancedForm() {
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    currentEditingTask = null;
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskParentId').value = ''; // *** NEW: Clear parent ID
    document.getElementById('taskCategory').value = settings.defaultCategory;
    document.getElementById('taskPriority').value = settings.defaultPriority;
    document.getElementById('taskModal').classList.remove('hidden');
    
    // *** NEW: a11y focus ***
    // Use setTimeout to ensure element is visible before focusing
    setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

// *** NEW: Open subtask form ***
function openSubtaskForm(parentId) {
    openAdvancedForm(); // Re-use the same modal
    document.getElementById('modalTitle').textContent = 'Add New Subtask';
    document.getElementById('taskParentId').value = parentId;
    
    // Inherit category/priority from parent
    const parentTask = tasks.find(t => t.id === parentId);
    if (parentTask) {
        document.getElementById('taskCategory').value = parentTask.category;
        document.getElementById('taskPriority').value = parentTask.priority;
    }
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    currentEditingTask = null;
    
    // Reset form and parent ID
    document.getElementById('taskForm').reset();
    document.getElementById('taskParentId').value = '';
    document.getElementById('modalTitle').textContent = 'Add New Task';
    
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try {
            lastFocusedElement.focus();
        } catch (e) {
            console.warn("Could not focus last element:", e);
        }
    }
}

function toggleRepeatOptions() {
    const isChecked = document.getElementById('taskRepeat').checked;
    const repeatOptions = document.getElementById('repeatOptions');
    
    if (isChecked) {
        repeatOptions.classList.remove('hidden');
    } else {
        repeatOptions.classList.add('hidden');
    }
}

async function saveTask(event) {
    event.preventDefault();
    
    const taskId = document.getElementById('taskId').value;
    const parentId = document.getElementById('taskParentId').value || null; // *** NEW
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const category = document.getElementById('taskCategory').value;
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const reminder = document.getElementById('taskReminder').value;
    const repeat = document.getElementById('taskRepeat').checked;
    const repeatFrequency = repeat ? document.getElementById('repeatFrequency').value : null;
    const tags = document.getElementById('taskTags').value
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag);
    
    if (!title) {
        showToast('Task title is required', 'error');
        return;
    }

    if (taskId) {
        // Edit existing task
        const task = tasks.find(t => t.id === taskId);
        if (task) {
            task.title = title;
            task.description = description;
            task.category = category;
            task.priority = priority;
            task.dueDate = dueDate || null;
            task.reminder = reminder || null;
            task.repeat = repeat;
            task.repeatFrequency = repeatFrequency;
            task.tags = tags;
            task.parentId = parentId; // Allow changing parent
        }
        showToast('Task updated successfully', 'success');
    } else {
        // Create new task
        const now = Date.now();
        const task = {
            id: now.toString(),
            title,
            description,
            category,
            priority,
            dueDate: dueDate || null,
            reminder: reminder || null,
            repeat,
            repeatFrequency,
            tags,
            completed: false,
            createdAt: new Date(now).toISOString(),
            order: now, // *** NEW
            parentId: parentId, // *** NEW
        };
        tasks.push(task);
        saveToHistory('Added task: ' + title);
        showToast('Task added successfully', 'success');
    }
    
    await saveTasks(); // *** UPDATED: Await DB save
    renderTasks();
    renderAISummary(); 
    closeTaskModal();
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    currentEditingTask = task;
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskParentId').value = task.parentId || ''; // *** NEW
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskReminder').value = task.reminder || '';
    document.getElementById('taskRepeat').checked = task.repeat;
    document.getElementById('taskTags').value = task.tags.join(', ');
    
    if (task.repeat) {
        document.getElementById('repeatOptions').classList.remove('hidden');
        document.getElementById('repeatFrequency').value = task.repeatFrequency || 'daily';
    }
    
    document.getElementById('taskModal').classList.remove('hidden');
    // *** NEW: a11y focus ***
    setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Prevent deletion of a completed recurring task if its next instance exists
    const nextInstance = tasks.find(t => t.previousInstanceId === taskId);
    if (nextInstance) {
        showInfoModal('Deletion Blocked', 'Cannot delete this completed recurring task because its next instance has already been created. Please delete the pending instance first.');
        return;
    }
    
    // *** NEW: Find all descendant tasks ***
    const tasksToDelete = [taskId];
    const findChildren = (parentId) => {
        const children = tasks.filter(t => t.parentId === parentId);
        children.forEach(child => {
            tasksToDelete.push(child.id);
            findChildren(child.id); // Recurse
        });
    };
    findChildren(taskId);
    
    const message = tasksToDelete.length > 1 ?
        `Are you sure you want to delete this task and its ${tasksToDelete.length - 1} subtask(s)?` :
        'Are you sure you want to delete this task?';

    showConfirmModal('Confirm Deletion', message, async () => {
        tasks = tasks.filter(t => !tasksToDelete.includes(t.id));
        await saveTasks(); // *** UPDATED: Await DB save
        
        // Clear selection
        tasksToDelete.forEach(id => selectedTasks.delete(id));
        
        renderTasks();
        renderAISummary(); 
        showToast('Task(s) deleted successfully', 'success');
    });
}

// Bulk Actions
function toggleTaskSelection(taskId, isChecked) {
    if (isChecked) {
        selectedTasks.add(taskId);
    } else {
        selectedTasks.delete(taskId);
    }
    
    updateBulkActionUI();
}

function toggleSelectAll(event) {
    const isChecked = event.target.checked;
    const taskCheckboxes = document.querySelectorAll('.task-checkbox-multi');
    
    // Get currently rendered (filtered) task IDs
    const currentTaskIds = Array.from(taskCheckboxes).map(cb => cb.value);

    taskCheckboxes.forEach(checkbox => {
        const taskId = checkbox.value;
        if (isChecked) {
            if (!checkbox.checked) {
                checkbox.checked = true;
                selectedTasks.add(taskId);
            }
        } else {
             if (checkbox.checked) {
                checkbox.checked = false;
                selectedTasks.delete(taskId);
            }
        }
    });

    // Handle the case where the global Set might contain IDs from other filters.
    if (!isChecked) {
        // If unchecking all, remove only the currently visible tasks from the global set
        currentTaskIds.forEach(id => selectedTasks.delete(id));
    }
    
    updateBulkActionUI();
}

function deleteSelectedTasks() {
     if (selectedTasks.size === 0) {
        showToast('No tasks selected for deletion.', 'info');
        return;
    }
    
    // *** NEW: Expand selection to include all subtasks ***
    const finalTasksToDelete = new Set(selectedTasks);
    const findChildren = (parentId) => {
        const children = tasks.filter(t => t.parentId === parentId);
        children.forEach(child => {
            finalTasksToDelete.add(child.id);
            findChildren(child.id); // Recurse
        });
    };
    // Iterate over a copy of the set to avoid modification during iteration issues
    [...selectedTasks].forEach(taskId => findChildren(taskId));
    
    const count = finalTasksToDelete.size;
    const message = count > selectedTasks.size ?
        `Are you sure you want to delete ${selectedTasks.size} selected task(s) and their subtasks (total ${count})?` :
        `Are you sure you want to delete ${count} selected task(s)?`;

    showConfirmModal('Confirm Bulk Deletion', message, async () => {
        // Filter out all tasks whose IDs are in the finalTasksToDelete set
        const tasksToDeleteArr = Array.from(finalTasksToDelete);
        let nextInstanceCount = 0;
        
        // Check for recurring task blocks
        const tasksToKeep = tasksToDeleteArr.filter(id => {
            const isCompletedRecurring = tasks.find(t => t.id === id && t.completed && t.repeat);
            const nextInstance = tasks.find(t => t.previousInstanceId === id);
            if (isCompletedRecurring && nextInstance) {
                nextInstanceCount++;
                return true; 
            }
            return false;
        });
        
        if (nextInstanceCount > 0) {
             showInfoModal('Deletion Blocked', `Cannot delete ${nextInstanceCount} completed recurring task(s) because their next instance(s) are still pending. Please delete the pending instance(s) first.`);
             const deletableTaskIds = tasksToDeleteArr.filter(id => !tasksToKeep.includes(id));
             tasks = tasks.filter(t => !deletableTaskIds.includes(t.id));
             selectedTasks = new Set();
             await saveTasks(); // *** UPDATED
             renderTasks();
             return;
        }

        tasks = tasks.filter(t => !finalTasksToDelete.has(t.id));
        selectedTasks = new Set();
        await saveTasks(); // *** UPDATED
        renderTasks();
        renderAISummary();
        showToast('Selected tasks deleted successfully', 'success');
    });
}

async function clearAllTasks() {
    showConfirmModal('Confirm Clear All', 'Are you sure you want to delete ALL tasks permanently? This cannot be undone.', async () => {
        tasks = [];
        selectedTasks = new Set();
        await saveTasks(); // *** UPDATED
        renderTasks();
        renderAISummary();
        closeSettingsModal();
        showToast('All tasks cleared successfully', 'success');
    });
}

function updateBulkActionUI() {
    const count = selectedTasks.size;
    const btn = document.getElementById('deleteSelectedBtn');
    
    if (btn) {
        btn.textContent = `Delete Selected (${count})`;
        btn.disabled = count === 0;
    }
    
    // Check if the "Select All" checkbox should be indeterminate/checked
    const visibleTasksCount = document.querySelectorAll('.task-checkbox-multi').length;
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    
    if (selectAllCheckbox) {
         if (visibleTasksCount > 0 && count === visibleTasksCount) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else if (count > 0 && count < visibleTasksCount) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        } else if (count === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else {
             // count > 0 and visibleTasksCount === 0 (or some other edge case)
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = selectedTasks.size > 0;
        }
    }
}

async function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isCompleting = !task.completed;

    if (isCompleting) {
        task.completed = true;
        task.completedAt = new Date().toISOString();
        
        if (task.repeat) {
            const newTask = { ...task };
            newTask.id = Date.now().toString();
            newTask.completed = false;
            newTask.completedAt = null;
            newTask.createdAt = new Date().toISOString();
            newTask.previousInstanceId = task.id; 
            newTask.order = Date.now(); // Give it a new order
            // Note: We keep the parentId if it was a recurring subtask

            if (task.dueDate) {
                const nextDate = new Date(task.dueDate);
                switch (task.repeatFrequency) {
                    case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
                    case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
                    case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
                    case 'yearly': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
                }
                newTask.dueDate = new Date(nextDate.getTime() - (nextDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                
                if (task.reminder) {
                    const originalDueDate = new Date(task.dueDate);
                    const originalReminderDate = new Date(task.reminder);
                    const diffMs = originalDueDate.getTime() - originalReminderDate.getTime();
                    
                    const newReminderTime = new Date(nextDate.getTime() - diffMs);
                    newTask.reminder = new Date(newReminderTime.getTime() - (newReminderTime.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                }
            }
            
            tasks.push(newTask);
            showToast(`Next recurring task created for '${task.title}'`, 'success');
        }
    } else {
        task.completed = false;
        task.completedAt = null;

        if (task.repeat) {
            const nextInstanceIndex = tasks.findIndex(t => t.previousInstanceId === task.id);
            
            if (nextInstanceIndex > -1) {
                tasks.splice(nextInstanceIndex, 1);
                showToast('Next recurring instance removed.', 'info');
            }
        }
    }
    
    await saveTasks(); // *** UPDATED: Await DB save
    renderTasks();
    renderAISummary(); 
}

// Update Filter Logic
function filterTasks(filter) {
    // *** UPDATED: Set URL Hash, which triggers handleHashChange() ***
    window.location.hash = filter;
    // Reset pagination when filter changes
    currentPage = 1;
}

// NEW: Sort Logic
function setSortOption(sortKey) {
    currentSort = sortKey;
    document.getElementById('sortSelect').value = currentSort; // Ensure UI consistency
    renderTasks();
}

// *** MAJORLY UPDATED: renderTasks for Tabular Layout with Pagination ***
function renderTasks() {
    try {
        console.log('renderTasks called - checking table structure');
        const tableBody = document.getElementById('tasksTableBody');
        const paginationContainer = document.getElementById('paginationContainer');
        
        console.log('tableBody:', tableBody, 'paginationContainer:', paginationContainer);
        
        // Check if elements exist - if not, this might be the old structure
        if (!tableBody || !paginationContainer) {
            console.warn('New table structure not found, falling back to container-based rendering');
            renderTasksFallback();
            return;
        }
    
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    if (!bulkActionsContainer) {
        console.warn('Bulk actions container not found');
    }
    
    let processedTasks = tasks;
    
    // 1. Apply Search Filter
    let searchedTaskIds = new Set();
    if (currentSearch) {
        const searchMatches = processedTasks.filter(t => 
            t.title.toLowerCase().includes(currentSearch) ||
            (t.description && t.description.toLowerCase().includes(currentSearch)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(currentSearch)))
        );
        
        // If a task matches, we need to show it *and* all its parents
        const getParentIds = (task) => {
            let ids = new Set();
            let current = task;
            while (current && current.parentId) {
                ids.add(current.parentId);
                current = tasks.find(t => t.id === current.parentId);
            }
            return ids;
        };
        
        searchMatches.forEach(task => {
            searchedTaskIds.add(task.id);
            const parentIds = getParentIds(task);
            parentIds.forEach(id => searchedTaskIds.add(id));
        });
        
        processedTasks = processedTasks.filter(t => searchedTaskIds.has(t.id));
    }

    // 1.5. Apply Quick Filters (time-based and priority)
    if (activeQuickFilter || activePriorityFilter) {
        processedTasks = processedTasks.filter(t => {
            return matchesQuickFilter(t) && matchesPriorityFilter(t);
        });
    }
    
   
    
    // 2. Apply Tab Filter (e.g., 'all', 'personal', 'completed')
    let filteredTasks = [];
    if (currentSearch) {
        // If searching, use search results but exclude completed tasks unless in completed tab
        filteredTasks = processedTasks;
        if (currentFilter !== 'completed') {
            filteredTasks = filteredTasks.filter(t => !t.completed);
        }
    } else if (currentFilter === 'all') {
        // *** UPDATED: In 'all' tab, hide completed tasks and show repetitive tasks only if due within 15 days ***
        filteredTasks = processedTasks.filter(t => {
            // Don't show completed tasks in main tabs
            if (t.completed) return false;
            
            // For repetitive/recurring tasks, only show if due within 15 days
            if (t.repeat) {
                return isTaskDueWithin15Days(t);
            }
            
            // Show all non-repetitive pending tasks
            return true;
        });
    } else if (currentFilter === 'completed') {
        // Show all completed tasks (no filtering)
        filteredTasks = processedTasks.filter(t => t.completed);
    } else if (currentFilter === 'recurring') {
        // *** UPDATED: Recurring tab shows only uncompleted repetitive tasks ***
        filteredTasks = processedTasks.filter(t => !t.completed && t.repeat);
    } else {
        // *** UPDATED: Category filters exclude completed tasks and apply 15-day horizon for repetitive tasks ***
        filteredTasks = processedTasks.filter(t => {
            // Only show tasks in the current category
            if (t.category !== currentFilter) return false;
            
            // Don't show completed tasks in category views
            if (t.completed) return false;
            
            // For repetitive tasks, only show if due within 15 days
            if (t.repeat) {
                return isTaskDueWithin15Days(t);
            }
            
            // Show all non-repetitive pending tasks in this category
            return true;
        });
    }

    // 4. Apply Sorting
    const sortTasks = (taskList, sortBy) => {
        return taskList.sort((a, b) => {
            // Always sort completed tasks below pending tasks
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            
            switch (sortBy) {
                case 'priority':
                    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
                    return priorityOrder[a.priority] - priorityOrder[b.priority];
                case 'dueDate':
                    if (!a.dueDate && !b.dueDate) return 0;
                    if (!a.dueDate) return 1;
                    if (!b.dueDate) return -1;
                    return new Date(a.dueDate) - new Date(b.dueDate);
                case 'title':
                    return a.title.localeCompare(b.title);
                case 'order':
                default:
                    return (a.order || 0) - (b.order || 0);
            }
        });
    };
    
    filteredTasks = sortTasks(filteredTasks, currentSort);
    
    // 5. Build Task Tree (for subtasks)
    const taskMap = new Map(filteredTasks.map(task => [task.id, { ...task, children: [] }]));
    const taskTree = [];
    
    for (const task of taskMap.values()) {
        if (task.parentId && taskMap.has(task.parentId)) {
            // This is a subtask, add it to its parent's children array
            taskMap.get(task.parentId).children.push(task);
        } else {
            // This is a top-level task (or its parent is filtered out)
            taskTree.push(task);
        }
    }
    
    // Flatten the tree for table display with indentation
    const flattenedTasks = [];
    const flattenTasks = (tasks, level = 0) => {
        for (const task of tasks) {
            task.level = level;
            flattenedTasks.push(task);
            if (task.children && task.children.length > 0) {
                flattenTasks(task.children, level + 1);
            }
        }
    };
    flattenTasks(taskTree);
    
    // Apply pagination to flattened tasks
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedTasks = flattenedTasks.slice(startIndex, endIndex);
    
    // 5. Render Table Rows
    if (paginatedTasks.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <i class="fas fa-inbox" style="font-size: 2rem; margin-bottom: 0.5rem; display: block;"></i>
                    ${totalTasks === 0 ? 'No tasks found' : 'No tasks on this page'}
                </td>
            </tr>
        `;
    } else {
        tableBody.innerHTML = paginatedTasks.map(task => renderTaskTableRow(task)).join('');
    }
    
    // 6. Render Pagination Controls
    renderPaginationControls();
    
    // 7. Update UI Elements
    updateBulkActionUI();
    updateFilterCounts();
    
    } catch (error) {
        console.error('Error in renderTasks:', error);
        renderTasksFallback();
    }
}

// *** NEW: Fallback renderTasks function for old structure ***
function renderTasksFallback() {
    const container = document.getElementById('tasksContainer');
    if (!container) {
        console.error('Tasks container not found');
        return;
    }
    
    // Simple fallback - show a message about the new structure
    container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
            <h3>Table Structure Not Found</h3>
            <p>Please refresh the page to load the new tabular layout.</p>
        </div>
    `;
}

// *** NEW: Add Subtask Function ***
function addSubtask(parentId) {
    const parentTask = tasks.find(t => t.id === parentId);
    if (!parentTask) return;
    
    // Set the parent ID in the hidden field
    document.getElementById('taskParentId').value = parentId;
    
    // Update modal title
    document.getElementById('modalTitle').textContent = `Add Subtask to: ${parentTask.title}`;
    
    // Clear form
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    
    // Set default category and priority from parent
    document.getElementById('taskCategory').value = parentTask.category;
    document.getElementById('taskPriority').value = parentTask.priority;
    
    // Show modal
    document.getElementById('taskModal').classList.remove('hidden');
}

// *** NEW: Toggle Task Completion ***
function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const wasCompleted = task.completed;
    task.completed = !task.completed;
    
    // Handle recurring tasks
    if (task.completed && task.repeat) {
        createNextRecurringTask(task);
    }
    
    saveToHistory(task.completed ? 'Completed task: ' + task.title : 'Uncompleted task: ' + task.title);
    scheduleAutoSave();
    renderTasks();
    renderAISummary();
    
    showToast(task.completed ? 'Task marked as completed' : 'Task marked as incomplete', 'success');
}

// *** NEW: Create Next Recurring Task ***
function createNextRecurringTask(completedTask) {
    const nextDueDate = calculateNextDueDate(completedTask.dueDate, completedTask.repeatFrequency);
    
    const newTask = {
        id: Date.now().toString(),
        title: completedTask.title,
        description: completedTask.description,
        category: completedTask.category,
        priority: completedTask.priority,
        dueDate: nextDueDate,
        reminder: completedTask.reminder,
        repeat: completedTask.repeat,
        repeatFrequency: completedTask.repeatFrequency,
        tags: [...completedTask.tags],
        parentId: completedTask.parentId,
        completed: false,
        createdAt: new Date().toISOString(),
        order: completedTask.order
    };
    
    tasks.push(newTask);
}

// *** NEW: Calculate Next Due Date for Recurring Tasks ***
function calculateNextDueDate(currentDueDate, frequency) {
    const dueDate = new Date(currentDueDate);
    const nextDate = new Date(dueDate);
    
    switch (frequency) {
        case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
        case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
        case 'monthly':
            nextDate.setMonth(nextDate.getMonth() + 1);
            break;
        case 'yearly':
            nextDate.setFullYear(nextDate.getFullYear() + 1);
            break;
    }
    
    return nextDate.toISOString();
}
// *** NEW: Render individual task as table row ***
function renderTaskTableRow(task) {
    const isSelected = selectedTasks.has(task.id);
    const priorityClass = `priority-${task.priority}`;
    const categoryClass = `category-${task.category}`;
    const dueDateClass = getDueDateClass(task.dueDate);
    const dueDateFormatted = task.dueDate ? formatDate(task.dueDate) : 'No due date';
    const indentLevel = task.level || 0;
    const indentStyle = indentLevel > 0 ? `padding-left: ${indentLevel * 2}rem;` : '';
    const isSubtask = indentLevel > 0;
    
    return `
        <tr class="task-row ${task.completed ? 'completed' : ''} ${isSelected ? 'selected' : ''} ${isSubtask ? 'subtask-row' : ''}" data-task-id="${task.id}">
            <td>
                <input type="checkbox" 
                       class="task-checkbox-multi" 
                       value="${task.id}"
                       ${isSelected ? 'checked' : ''} 
                       onchange="toggleTaskSelection('${task.id}', this.checked)">
            </td>
            <td style="${indentStyle}">
                <div class="task-content-wrapper">
                    <div class="task-title-section">
                        ${isSubtask ? '<i class="fas fa-level-up-alt subtask-icon"></i>' : ''}
                        <input type="checkbox" 
                               class="task-complete-checkbox" 
                               ${task.completed ? 'checked' : ''} 
                               onchange="toggleTask('${task.id}')"
                               title="Mark as completed">
                        <div class="task-title ${task.completed ? 'completed-text' : ''}">${escapeHtml(task.title)}</div>
                    </div>
                    ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                    ${task.tags && task.tags.length > 0 ? `
                        <div class="task-tags">
                            ${task.tags.map(tag => `<span class="task-tag">${escapeHtml(tag)}</span>`).join('')}
                        </div>
                    ` : ''}
                    ${task.repeat ? `
                        <div class="task-recurring-indicator">
                            <i class="fas fa-redo"></i> Recurring (${capitalize(task.repeatFrequency)})
                        </div>
                    ` : ''}
                </div>
            </td>
            <td>
                <span class="category-badge ${categoryClass}">${capitalize(task.category)}</span>
            </td>
            <td>
                <span class="priority-badge ${priorityClass}">${capitalize(task.priority)}</span>
            </td>
            <td>
                <div class="due-date-cell ${dueDateClass}">${dueDateFormatted}</div>
            </td>
            <td>
                <div class="task-actions">
                    ${!isSubtask ? `
                        <button class="task-action-btn" onclick="addSubtask('${task.id}')" title="Add Subtask">
                            <i class="fas fa-plus-circle"></i>
                        </button>
                    ` : ''}
                    <button class="task-action-btn" onclick="editTask('${task.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="task-action-btn" onclick="deleteTask('${task.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// *** NEW: Render pagination controls ***
function renderPaginationControls() {
    const paginationInfo = document.getElementById('paginationInfo');
    const pageNumbers = document.getElementById('pageNumbers');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    // Update pagination info
    const startItem = totalTasks === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const endItem = Math.min(currentPage * pageSize, totalTasks);
    paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${totalTasks} tasks`;
    
    // Update page buttons
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    
    // Generate page numbers
    let pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
        // Show all pages if total is small
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        // Show smart pagination
        if (currentPage <= 3) {
            pages = [1, 2, 3, 4, '...', totalPages];
        } else if (currentPage >= totalPages - 2) {
            pages = [1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
        } else {
            pages = [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
        }
    }
    
    pageNumbers.innerHTML = pages.map(page => {
        if (page === '...') {
            return '<span class="page-number disabled">...</span>';
        }
        return `<button class="page-number ${page === currentPage ? 'active' : ''}" onclick="goToPage(${page})">${page}</button>`;
    }).join('');
}

// *** NEW: Pagination navigation functions ***
function goToPage(page) {
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        renderTasks();
    }
}

function goToPreviousPage() {
    if (currentPage > 1) {
        currentPage--;
        renderTasks();
    }
}

function goToNextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        renderTasks();
    }
}

function changePageSize() {
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (!pageSizeSelect) return;
    
    pageSize = parseInt(pageSizeSelect.value);
    currentPage = 1; // Reset to first page when changing page size
    renderTasks();
}

function changePageSizeTop() {
    const pageSizeSelectTop = document.getElementById('pageSizeSelectTop');
    if (!pageSizeSelectTop) return;
    
    pageSize = parseInt(pageSizeSelectTop.value);
    currentPage = 1; // Reset to first page when changing page size
    
    // Sync both selectors
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (pageSizeSelect) {
        pageSizeSelect.value = pageSize;
    }
    
    renderTasks();
}

// *** NEW: Undo/Redo Functions ***
function saveToHistory(action) {
    // Remove any states after current index
    history = history.slice(0, historyIndex + 1);
    
    // Add new state to history
    history.push({
        tasks: JSON.parse(JSON.stringify(tasks)),
        action: action,
        timestamp: new Date().toISOString()
    });
    
    // Limit history size
    if (history.length > maxHistorySize) {
        history.shift();
    } else {
        historyIndex++;
    }
    
    updateUndoRedoButtons();
}

function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        tasks = JSON.parse(JSON.stringify(history[historyIndex].tasks));
        renderTasks();
        renderAISummary();
        updateFilterCounts();
        updateUndoRedoButtons();
        scheduleAutoSave();
        showToast('Undo: ' + history[historyIndex + 1].action, 'info');
    }
}

function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        tasks = JSON.parse(JSON.stringify(history[historyIndex].tasks));
        renderTasks();
        renderAISummary();
        updateFilterCounts();
        updateUndoRedoButtons();
        scheduleAutoSave();
        showToast('Redo: ' + history[historyIndex].action, 'info');
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.disabled = historyIndex <= 0;
    }
    
    if (redoBtn) {
        redoBtn.disabled = historyIndex >= history.length - 1;
    }
}

// *** NEW: Auto-save Functions ***
function scheduleAutoSave() {
    hasUnsavedChanges = true;
    
    // Clear existing timer
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
    }
    
    // Schedule new auto-save
    autoSaveTimer = setTimeout(() => {
        autoSave();
    }, autoSaveDelay);
}

async function autoSave() {
    if (!hasUnsavedChanges) return;
    
    try {
        await saveTasks();
        hasUnsavedChanges = false;
        showAutoSaveIndicator();
        console.log('Auto-saved at', new Date().toLocaleTimeString());
    } catch (error) {
        console.error('Auto-save failed:', error);
        showToast('Auto-save failed', 'error');
    }
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 2000);
    }
}

// *** NEW: Enhanced saveTasks with history tracking ***
async function saveTasks() {
    try {
        // Use a transaction to clear and re-populate
        const tx = db.transaction(TASK_STORE, 'readwrite');
        const store = tx.objectStore(TASK_STORE);
        await store.clear();
        
        // Add all tasks
        for (const task of tasks) {
            await store.add(task);
        }
        
        console.log('Tasks saved successfully');
    } catch (error) {
        console.error("Error saving tasks:", error);
        throw error;
    }
}

// *** NEW: Quick Export Menu Functions ***
function showQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = 'block';
        
        // Position the menu relative to the export button
        const exportBtn = event.target.closest('.icon-btn');
        const rect = exportBtn.getBoundingClientRect();
        menu.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        menu.style.right = (window.innerWidth - rect.right) + 'px';
        
        // Close menu when clicking outside
        setTimeout(() => {
            document.addEventListener('click', hideQuickExportMenuOnClickOutside);
        }, 100);
    }
}

function hideQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = 'none';
        document.removeEventListener('click', hideQuickExportMenuOnClickOutside);
    }
}

function hideQuickExportMenuOnClickOutside(event) {
    const menu = document.getElementById('quickExportMenu');
    const exportBtn = event.target.closest('.icon-btn[onclick*="showQuickExportMenu"]');
    
    if (menu && !menu.contains(event.target) && !exportBtn) {
        hideQuickExportMenu();
    }
}

// *** NEW: Smart Import System ***
let importData = [];
let importAnalysis = {
    total: 0,
    new: 0,
    duplicates: 0,
    updated: 0,
    fileType: '',
    tasks: []
};

// *** NEW: Duplicate Detection Algorithm ***
function detectDuplicate(importTask, existingTasks) {
    const matchTitle = document.getElementById('matchTitle').checked;
    const matchCategory = document.getElementById('matchCategory').checked;
    const matchPriority = document.getElementById('matchPriority').checked;
    const matchDueDate = document.getElementById('matchDueDate').checked;
    
    return existingTasks.find(existingTask => {
        let matches = 0;
        let totalChecks = 0;
        
        if (matchTitle) {
            totalChecks++;
            if (importTask.title.toLowerCase().trim() === existingTask.title.toLowerCase().trim()) {
                matches++;
            }
        }
        
        if (matchCategory) {
            totalChecks++;
            if (importTask.category === existingTask.category) {
                matches++;
            }
        }
        
        if (matchPriority) {
            totalChecks++;
            if (importTask.priority === existingTask.priority) {
                matches++;
            }
        }
        
        if (matchDueDate) {
            totalChecks++;
            if (importTask.dueDate === existingTask.dueDate) {
                matches++;
            }
        }
        
        // Consider it a duplicate if at least 50% of checked fields match
        return totalChecks > 0 && (matches / totalChecks) >= 0.5;
    });
}

// *** NEW: Analyze Import Data ***
function analyzeImportData(data, fileType) {
    importAnalysis = {
        total: data.length,
        new: 0,
        duplicates: 0,
        updated: 0,
        fileType: fileType,
        tasks: []
    };
    
    data.forEach(importTask => {
        const duplicate = detectDuplicate(importTask, tasks);
        
        const analysis = {
            task: importTask,
            status: duplicate ? 'duplicate' : 'new',
            duplicate: duplicate,
            changes: []
        };
        
        if (duplicate) {
            importAnalysis.duplicates++;
            
            // Check for differences for update option
            const changes = [];
            if (importTask.description !== duplicate.description) {
                changes.push('description');
            }
            if (importTask.priority !== duplicate.priority) {
                changes.push('priority');
            }
            if (importTask.dueDate !== duplicate.dueDate) {
                changes.push('due date');
            }
            
            analysis.changes = changes;
            if (changes.length > 0) {
                analysis.status = 'updated';
                importAnalysis.updated++;
            }
        } else {
            importAnalysis.new++;
        }
        
        importAnalysis.tasks.push(analysis);
    });
    
    return importAnalysis;
}

// *** NEW: Update Import Preview UI ***
function updateImportPreview() {
    // Update stats
    document.getElementById('fileType').textContent = importAnalysis.fileType.toUpperCase();
    document.getElementById('totalTasks').textContent = importAnalysis.total;
    document.getElementById('newTasksCount').textContent = importAnalysis.new;
    document.getElementById('duplicateTasksCount').textContent = importAnalysis.duplicates;
    
    // Update option counts
    document.getElementById('newCount').textContent = importAnalysis.new;
    document.getElementById('updateCount').textContent = importAnalysis.updated;
    document.getElementById('newUpdateCount').textContent = importAnalysis.new;
    
    // Render preview table
    renderPreviewTable();
}

// *** NEW: Render Preview Table ***
function renderPreviewTable() {
    const tbody = document.getElementById('previewTableBody');
    const showDuplicatesOnly = document.getElementById('showDuplicatesOnly').checked;
    const showNewOnly = document.getElementById('showNewOnly').checked;
    
    let filteredTasks = importAnalysis.tasks;
    
    if (showDuplicatesOnly) {
        filteredTasks = filteredTasks.filter(t => t.status === 'duplicate' || t.status === 'updated');
    } else if (showNewOnly) {
        filteredTasks = filteredTasks.filter(t => t.status === 'new');
    }
    
    tbody.innerHTML = filteredTasks.map(analysis => {
        const task = analysis.task;
        const statusClass = analysis.status === 'new' ? 'new' : 
                           analysis.status === 'updated' ? 'updated' : 'duplicate';
        
        return `
            <tr>
                <td>
                    <span class="status-badge ${statusClass}">${analysis.status}</span>
                </td>
                <td>${escapeHtml(task.title)}</td>
                <td>
                    <span class="category-badge category-${task.category}">${capitalize(task.category)}</span>
                </td>
                <td>
                    <span class="priority-badge priority-${task.priority}">${capitalize(task.priority)}</span>
                </td>
                <td>${task.dueDate ? formatDate(task.dueDate) : 'No due date'}</td>
            </tr>
        `;
    }).join('');
}

// *** NEW: Filter Preview ***
function filterPreview() {
    renderPreviewTable();
}

// *** NEW: Enhanced Import Handlers ***
function handleImportMerge() {
    const newTasks = importAnalysis.tasks
        .filter(analysis => analysis.status === 'new')
        .map(analysis => ({
            ...analysis.task,
            id: Date.now().toString() + Math.random(),
            createdAt: new Date().toISOString()
        }));
    
    tasks.push(...newTasks);
    saveToHistory(`Incremental import: ${newTasks.length} tasks added`);
    saveTasks();
    renderTasks();
    renderAISummary();
    
    showToast(`${newTasks.length} new tasks imported successfully`, 'success');
    closeImportModal();
}

function handleImportUpdate() {
    const newTasks = [];
    const updatedTasks = [];
    
    importAnalysis.tasks.forEach(analysis => {
        if (analysis.status === 'new') {
            newTasks.push({
                ...analysis.task,
                id: Date.now().toString() + Math.random(),
                createdAt: new Date().toISOString()
            });
        } else if (analysis.status === 'updated' && analysis.duplicate) {
            // Update existing task
            const existingTask = tasks.find(t => t.id === analysis.duplicate.id);
            if (existingTask) {
                if (analysis.changes.includes('description')) {
                    existingTask.description = analysis.task.description;
                }
                if (analysis.changes.includes('priority')) {
                    existingTask.priority = analysis.task.priority;
                }
                if (analysis.changes.includes('due date')) {
                    existingTask.dueDate = analysis.task.dueDate;
                }
                updatedTasks.push(existingTask);
            }
        }
    });
    
    tasks.push(...newTasks);
    saveToHistory(`Update import: ${newTasks.length} added, ${updatedTasks.length} updated`);
    saveTasks();
    renderTasks();
    renderAISummary();
    
    showToast(`${newTasks.length} new tasks added, ${updatedTasks.length} tasks updated`, 'success');
    closeImportModal();
}

function handleImportOverwrite() {
    if (!confirm('This will delete all existing tasks and replace them with the imported tasks. This action cannot be undone. Continue?')) {
        return;
    }
    
    const newTasks = importAnalysis.tasks.map(analysis => ({
        ...analysis.task,
        id: Date.now().toString() + Math.random(),
        createdAt: new Date().toISOString()
    }));
    
    tasks = newTasks;
    saveToHistory(`Overwrite import: ${newTasks.length} tasks replaced all existing tasks`);
    saveTasks();
    renderTasks();
    renderAISummary();
    
    showToast(`${newTasks.length} tasks imported (all previous tasks replaced)`, 'success');
    closeImportModal();
}

function handleImportCancel() {
    closeImportModal();
}

function closeImportModal() {
    document.getElementById('importOptionsModal').classList.add('hidden');
    importData = [];
    importAnalysis = { total: 0, new: 0, duplicates: 0, updated: 0, fileType: '', tasks: [] };
}

// *** NEW: Enhanced Import File Function ***
async function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    let fileType = '';
    let data = [];
    
    try {
        if (fileName.endsWith('.json')) {
            fileType = 'json';
            const text = await file.text();
            const parsedData = JSON.parse(text);
            
            // Handle both formats: direct array or object with tasks property
            if (Array.isArray(parsedData)) {
                data = parsedData;
            } else if (parsedData && parsedData.tasks && Array.isArray(parsedData.tasks)) {
                data = parsedData.tasks;
            } else {
                throw new Error('Invalid JSON format. Expected an array of tasks or an object with a "tasks" array.');
            }
        } else if (fileName.endsWith('.xlsx')) {
            fileType = 'excel';
            data = await parseExcel(file);
        } else {
            showToast('Unsupported file format. Please use JSON or Excel files.', 'error');
            return;
        }
        
        // Validate data structure
        if (!Array.isArray(data) || data.length === 0) {
            showToast('Invalid file format or no tasks found', 'error');
            return;
        }
        
        // Normalize task data
        data = data.map(item => normalizeTaskData(item));
        
        // Analyze import data
        analyzeImportData(data, fileType);
        
        // Update preview UI
        updateImportPreview();
        
        // Show import modal
        document.getElementById('importOptionsModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Import error:', error);
        showToast('Error importing file: ' + error.message, 'error');
    }
    
    // Reset file input
    event.target.value = '';
}

// *** NEW: Normalize Task Data ***
function normalizeTaskData(item) {
    return {
        id: item.id || '',
        title: item.title || item.Title || item.task || item.Task || '',
        description: item.description || item.Description || item.notes || item.Notes || '',
        category: item.category || item.Category || 'personal',
        priority: item.priority || item.Priority || 'medium',
        dueDate: item.dueDate || item.due_date || item.DueDate || item.Due || null,
        reminder: item.reminder || item.Reminder || null,
        repeat: item.repeat || item.Repeat || false,
        repeatFrequency: item.repeatFrequency || item.repeat_frequency || item.Frequency || null,
        tags: Array.isArray(item.tags) ? item.tags : 
               (item.tags || item.Tags || item.tag || item.Tag ? 
                (item.tags || item.Tags || item.tag || item.Tag).toString().split(',').map(t => t.trim()).filter(t => t) : []),
        completed: item.completed || item.Completed || false,
        parentId: item.parentId || item.parent_id || null,
        createdAt: item.createdAt || item.created_at || item.Created || new Date().toISOString(),
        order: item.order || item.Order || Date.now()
    };
}

// *** NEW: Get due date class for styling ***
function getDueDateClass(dueDate) {
    if (!dueDate) return '';
    
    const now = new Date();
    const due = new Date(dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    
    if (dueDay < today) {
        return 'due-date-overdue';
    } else if (dueDay.getTime() === today.getTime()) {
        return 'due-date-today';
    } else if (dueDay <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) {
        return 'due-date-soon';
    }
    return '';
}

// *** NEW: Quick Export Menu Functions ***
function showQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function hideQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = 'none';
    }
}


// *** NEW: Drag and Drop Handlers ***
function handleDragStart(event) {
    const taskCard = event.target.closest('.task-card');
    // Check if the element is actually draggable
    if (taskCard.draggable) {
        event.dataTransfer.setData('text/plain', taskCard.dataset.taskId);
        event.dataTransfer.effectAllowed = 'move';
        // Add a slight delay so the browser can capture the drag image
        setTimeout(() => {
            taskCard.classList.add('dragging');
        }, 0);
    } else {
        event.preventDefault(); // Don't allow drag
    }
}

function handleDragOver(event) {
    // Only allow dropping on the container or on other draggable (top-level) tasks
    const taskCard = event.target.closest('.task-card[draggable="true"]');
    const container = event.target.closest('.tasks-container');
    
    if (taskCard || container) {
        event.preventDefault(); // Necessary to allow drop
        event.dataTransfer.dropEffect = 'move';
    }
}

async function handleDrop(event) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    const draggedTask = tasks.find(t => t.id === draggedId);
    
    // Clean up dragging class
    const draggingElement = document.querySelector('.task-card.dragging');
    if (draggingElement) {
        draggingElement.classList.remove('dragging');
    }

    if (!draggedTask) return;
    
    // Find the card we are dropping *on* or *before*
    const targetCard = event.target.closest('.task-card[draggable="true"]');
    let targetOrder = Date.now(); // Default to last if dropped in empty space
    
    // Get the current list of top-level tasks, sorted by order
    const topLevelTasks = tasks
        .filter(t => !t.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    if (targetCard) {
        const targetId = targetCard.dataset.taskId;
        if (targetId === draggedId) return; // Dropped on itself
        
        const targetTask = tasks.find(t => t.id === targetId);
        if (!targetTask) return;
        
        const targetIndex = topLevelTasks.findIndex(t => t.id === targetId);
        
        // Check if we're dropping in the top half or bottom half of the target card
        const rect = targetCard.getBoundingClientRect();
        const isBefore = event.clientY < rect.top + rect.height / 2;

        if (isBefore) {
            // Drop *before* the target card
            if (targetIndex === 0) {
                // Dropped before the first item
                targetOrder = (targetTask.order || 0) - 1000; // Place it before
            } else {
                // Dropped between target and previous
                const prevTask = topLevelTasks[targetIndex - 1];
                targetOrder = ((prevTask.order || 0) + (targetTask.order || 0)) / 2;
            }
        } else {
            // Drop *after* the target card
            if (targetIndex === topLevelTasks.length - 1) {
                // Dropped after the last item
                targetOrder = (targetTask.order || 0) + 1000; // Place it after
            } else {
                // Dropped between target and next
                const nextTask = topLevelTasks[targetIndex + 1];
                targetOrder = ((targetTask.order || 0) + (nextTask.order || 0)) / 2;
            }
        }
        
    } else {
        // Dropped in empty space, put at the end
        if(topLevelTasks.length > 0) {
            const maxOrder = topLevelTasks[topLevelTasks.length - 1].order || 0;
            targetOrder = maxOrder + 1000;
        }
    }
    
    draggedTask.order = targetOrder;
    
    // Set sort to manual, save, and re-render
    setSortOption('order'); // This will call renderTasks
    await saveTasks();
    renderTasks();
// *** NEW: Toggle Subtask Collapse ***
function toggleSubtaskCollapse(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.collapsed = !task.collapsed;
    saveTasks(); // Save state
    renderTasks(); // Re-render
}

// *** NEW: Quick Export Menu Functions ***
function showQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

function hideQuickExportMenu() {
    const menu = document.getElementById('quickExportMenu');
    if (menu) {
        menu.style.display = 'none';
    }
}

// *** NEW: Close export menu when clicking outside ***
document.addEventListener('click', function(event) {
    const menu = document.getElementById('quickExportMenu');
    const exportBtn = event.target.closest('button[onclick*="showQuickExportMenu"]');
    
    if (menu && menu.style.display === 'block' && !menu.contains(event.target) && !exportBtn) {
        hideQuickExportMenu();
    }
});
}


// Reminders
function checkReminders() {
    const now = new Date();
    
    tasks.forEach(task => {
        if (!task.completed && task.reminder) {
            const reminderTime = new Date(task.reminder);
            const timeDiff = reminderTime.getTime() - now.getTime();
            
            // Check if reminder is due within the next minute
            if (timeDiff > 0 && timeDiff <= 60 * 1000) {
                // Use IndexedDB to check if notified, or fall back to localStorage
                // For simplicity, we'll stick to localStorage for notification state
                // as it's non-critical, ephemeral data.
                const notified = localStorage.getItem(`notified_${task.id}`);
                if (notified !== task.reminder) {
                    showNotification(task);
                    localStorage.setItem(`notified_${task.id}`, task.reminder);
                }
            }
        }
    });
}

function showNotification(task) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const options = {
            body: `Due: ${formatDate(task.dueDate) || 'No due date'}`,
            icon: 'android-chrome-192x192.png', // Use app icon
            badge: 'android-chrome-192x192.png' // Use app icon
        };
        
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(`Task Reminder: ${task.title}`, options);
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// AI INSIGHTS FUNCTIONS
function renderAISummary() {
    const insights = generateAIInsights(tasks);
    const container = document.getElementById('aiSummaryContent');
    
    if (!container) return; // Guard against missing element
    
    if (insights.length === 0 || tasks.length === 0) {
        container.innerHTML = '<p class="ai-summary-item"><i class="fas fa-lightbulb"></i> Start adding tasks to get personalized insights.</p>';
        return;
    }
    
    // *** ENHANCED: Show more insights with better formatting ***
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const pendingTasks = tasks.filter(t => !t.completed);
    const overdue = pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;
    const dueToday = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === new Date().toDateString();
    }).length;
    
    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
            <div style="text-align: center; padding: 0.75rem; background: var(--primary-color); color: white; border-radius: 8px;">
                <div style="font-size: 1.5rem; font-weight: bold;">${total}</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">Total Tasks</div>
            </div>
            <div style="text-align: center; padding: 0.75rem; background: var(--success-color); color: white; border-radius: 8px;">
                <div style="font-size: 1.5rem; font-weight: bold;">${completed}</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">Completed</div>
            </div>
            <div style="text-align: center; padding: 0.75rem; background: var(--warning-color); color: white; border-radius: 8px;">
                <div style="font-size: 1.5rem; font-weight: bold;">${pending}</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">Pending</div>
            </div>
            <div style="text-align: center; padding: 0.75rem; background: ${completionRate >= 70 ? 'var(--success-color)' : completionRate >= 40 ? 'var(--warning-color)' : 'var(--danger-color)'}; color: white; border-radius: 8px;">
                <div style="font-size: 1.5rem; font-weight: bold;">${completionRate}%</div>
                <div style="font-size: 0.85rem; opacity: 0.9;">Completion</div>
            </div>
        </div>
        
        ${overdue > 0 || dueToday > 0 ? `
        <div style="display: flex; gap: 0.5rem; margin-bottom: 1rem; flex-wrap: wrap;">
            ${overdue > 0 ? `
            <div style="flex: 1; min-width: 150px; padding: 0.5rem 0.75rem; background: var(--danger-color); color: white; border-radius: 6px; font-size: 0.9rem;">
                <i class="fas fa-exclamation-circle"></i> ${overdue} Overdue
            </div>
            ` : ''}
            ${dueToday > 0 ? `
            <div style="flex: 1; min-width: 150px; padding: 0.5rem 0.75rem; background: var(--warning-color); color: white; border-radius: 6px; font-size: 0.9rem;">
                <i class="fas fa-clock"></i> ${dueToday} Due Today
            </div>
            ` : ''}
        </div>
        ` : ''}
        
        <div style="border-top: 2px solid var(--border-color); padding-top: 1rem;">
            <h4 style="margin: 0 0 0.75rem 0; font-size: 0.95rem; color: var(--text-secondary);">
                <i class="fas fa-lightbulb"></i> Smart Recommendations
            </h4>
    `;
    
    insights.forEach(insight => {
        html += `
            <p class="ai-summary-item" style="margin: 0.5rem 0; padding: 0.5rem; background: var(--hover-bg); border-radius: 6px;">
                <i class="fas fa-check-circle" style="color: var(--primary-color);"></i>
                ${insight}
            </p>
        `;
    });
    
    html += `</div>`;
    
    container.innerHTML = html;
}
function toggleAISummary() {
    const content = document.getElementById('aiSummaryContent');
    const btn = document.getElementById('toggleSummaryBtn');
    
    if (!content || !btn) return;
    
    const icon = btn.querySelector('i');
    content.classList.toggle('hidden');
    
    if (content.classList.contains('hidden')) {
        icon.className = 'fas fa-chevron-down';
        btn.title = 'Show Insights';
    } else {
        icon.className = 'fas fa-chevron-up';
        btn.title = 'Hide Insights';
    }
}

function showInsights() {
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const pendingTasks = tasks.filter(t => !t.completed);
    
    const byCategory = {
        personal: pendingTasks.filter(t => t.category === 'personal').length,
        office: pendingTasks.filter(t => t.category === 'office').length,
        misc: pendingTasks.filter(t => t.category === 'misc').length
    };
    
    const byPriority = {
        urgent: pendingTasks.filter(t => t.priority === 'urgent').length,
        high: pendingTasks.filter(t => t.priority === 'high').length,
        medium: pendingTasks.filter(t => t.priority === 'medium').length,
        low: pendingTasks.filter(t => t.priority === 'low').length
    };
    
    const overdue = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < new Date();
    });
    
    const today = new Date().toDateString();
    const dueToday = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
    });
    
    const insights = generateAIInsights(tasks);
    
    const content = `
        <div class="insight-card">
            <h3><i class="fas fa-chart-pie"></i> Task Statistics</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${total}</div>
                    <div class="stat-label">Total Tasks</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${completed}</div>
                    <div class="stat-label">Completed</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${pending}</div>
                    <div class="stat-label">Pending</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${completionRate}%</div>
                    <div class="stat-label">Completion Rate</div>
                </div>
            </div>
            
            <h4 style="margin-top: 1.5rem;">Overall Progress</h4>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${completionRate}%"></div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-folder-open"></i> Pending By Category</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${byCategory.personal}</div>
                    <div class="stat-label">Personal</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${byCategory.office}</div>
                    <div class="stat-label">Office</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${byCategory.misc}</div>
                    <div class="stat-label">Misc Work</div>
                </div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-flag"></i> Pending By Priority</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value" style="color: var(--danger-color);">${byPriority.urgent}</div>
                    <div class="stat-label">Urgent</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #f97316;">${byPriority.high}</div>
                    <div class="stat-label">High</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: var(--warning-color);">${byPriority.medium}</div>
                    <div class="stat-label">Medium</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: var(--success-color);">${byPriority.low}</div>
                    <div class="stat-label">Low</div>
                </div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-calendar-alt"></i> Schedule Overview (Pending)</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value" style="color: var(--danger-color);">${overdue.length}</div>
                    <div class="stat-label">Overdue</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: var(--warning-color);">${dueToday.length}</div>
                    <div class="stat-label">Due Today</div>
                </div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-brain"></i> All AI Insights</h3>
            ${insights.map(insight => `
                <p class="ai-summary-item" style="margin: 0.75rem 0;">
                    <i class="fas fa-lightbulb"></i>
                    ${insight}
                </p>
            `).join('')}
        </div>
    `;
    
    document.getElementById('insightsContent').innerHTML = content;
    document.getElementById('insightsModal').classList.remove('hidden');
    
    // *** NEW: a11y focus ***
    setTimeout(() => document.getElementById('insightsModal').querySelector('.close-btn').focus(), 100);
}




function generateAIInsights(tasks) {
    const insights = [];
    
    const pending = tasks.filter(t => !t.completed);
    const urgent = pending.filter(t => t.priority === 'urgent');
    const high = pending.filter(t => t.priority === 'high');
    
    if (urgent.length > 0) {
        insights.push(`You have ${urgent.length} urgent task${urgent.length > 1 ? 's' : ''} that need${urgent.length === 1 ? 's' : ''} immediate attention.`);
    }
    
    if (high.length > 3) {
        insights.push(`You have ${high.length} high-priority tasks. Consider breaking them down into smaller, manageable chunks.`);
    }
    
    const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
    if (overdue.length > 0) {
        insights.push(`${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue. Prioritize completing ${overdue.length > 1 ? 'these' : 'this'} first.`);
    }
    
    const today = new Date();
    // Fix: This was creating a date at midnight UTC, not local
    const thisWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const thisWeekEnd = new Date(thisWeekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const thisWeek = pending.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate >= thisWeekStart && dueDate < thisWeekEnd;
    });
    
    if (thisWeek.length > 0) {
        insights.push(`You have ${thisWeek.length} task${thisWeek.length > 1 ? 's' : ''} due this week. Plan your time accordingly.`);
    }
    
    const completed = tasks.filter(t => t.completed);
    if (tasks.length > 0) {
        const completionRate = Math.round((completed.length / tasks.length) * 100);
        if (completed.length > 0) {
            if (completionRate >= 70) {
                insights.push(`Great job! You've completed ${completionRate}% of your tasks. Keep up the excellent work!`);
            } else if (completionRate >= 40) {
                insights.push(`You're making progress with a ${completionRate}% completion rate. Keep going!`);
            } else {
                insights.push(`Your completion rate is ${completionRate}%. Focus on completing a few tasks each day to improve.`);
            }
        }
    }
    
    if (pending.length === 0 && tasks.length > 0) {
        insights.push(`Amazing! You have no pending tasks. Enjoy your free time or plan ahead for upcoming projects.`);
    }
    
    if (insights.length === 0 && tasks.length > 0) {
        insights.push('Your task list is looking manageable. Keep up the good work!');
    }
    
    return insights;
}

// *** NEW: Helper function to check if a task is due within the next 15 days ***
/**
 * Checks if a task's due date is within the next 15 days.
 * Used to filter repetitive tasks in the "All" and category tabs.
 * @param {Object} task - The task object to check
 * @returns {boolean} - True if task is due within 15 days or has no due date, false otherwise
 */
function isTaskDueWithin15Days(task) {
    if (!task.dueDate) {
        // Tasks without due dates are shown by default
        // Change to 'return false' if you want to hide repetitive tasks without due dates
        return true;
    }
    
    const now = new Date();
    const dueDate = new Date(task.dueDate);
    const fifteenDaysFromNow = new Date(now.getTime() + (15 * 24 * 60 * 60 * 1000));
    
    // Show if due date is in the past (overdue) or within the next 15 days
    return dueDate <= fifteenDaysFromNow;
}
function closeInsightsModal() {
    document.getElementById('insightsModal').classList.add('hidden');
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

// Settings
function openSettings() {
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    document.getElementById('defaultCategory').value = settings.defaultCategory;
    document.getElementById('defaultPriority').value = settings.defaultPriority;
    document.getElementById('defaultReminderHours').value = settings.defaultReminderHours;
    document.getElementById('enablePin').checked = settings.pinEnabled;
    
    if (settings.pinEnabled) {
        document.getElementById('pinSettings').classList.remove('hidden');
    }
    
    document.getElementById('settingsModal').classList.remove('hidden');
    
    // *** NEW: a11y focus ***
    setTimeout(() => document.getElementById('settingsModal').querySelector('.close-btn').focus(), 100);
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

async function saveSettings() {
    settings.defaultCategory = document.getElementById('defaultCategory').value;
    settings.defaultPriority = document.getElementById('defaultPriority').value;
    settings.defaultReminderHours = parseInt(document.getElementById('defaultReminderHours').value);
    
    // *** UPDATED: Save to IndexedDB ***
    try {
        await db.put(SETTINGS_STORE, settings);
        showToast('Settings saved successfully', 'success');
    } catch (e) {
        console.error("Error saving settings:", e);
        showToast('Error saving settings', 'error');
    }
}

async function loadSettings() {
    // *** UPDATED: Load from IndexedDB ***
    let saved = await db.get(SETTINGS_STORE, 'main-settings');
    if (saved) {
        settings = { ...settings, ...saved };
    } else {
        // First load, save default settings
        await db.put(SETTINGS_STORE, settings);
    }
}

// Import/Export
function getTimestampedFilename(baseName, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${baseName}_${timestamp}.${extension}`;
}

function exportToJSON() {
    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.2-pro', // *** UPDATED: Version
        totalTasks: tasks.length,
        tasks: tasks
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const filename = getTimestampedFilename('tasks', 'json');
    downloadFile(dataStr, filename, 'application/json');
    showToast(`Tasks exported to ${filename}`, 'success');
}

function exportToExcel() {
    if (typeof XLSX === 'undefined') {
        showToast('Excel export library not loaded. Please check your connection.', 'error');
        return;
    }
    

    const timestamp = new Date().toISOString();
    
    // *** UPDATED: Added new fields
    const data = tasks.map(task => ({
        'ID': task.id,
        'Title': task.title,
        'Description': task.description,
        'Category': task.category,
        'Priority': task.priority,
        'Due Date': task.dueDate || '',
        'Reminder': task.reminder || '',
        'Repeat': task.repeat ? 'Yes' : 'No',
        'Repeat Frequency': task.repeatFrequency || '',
        'Tags': task.tags.join(', '),
        'Completed': task.completed ? 'Yes' : 'No',
        'Created At': task.createdAt,
        'Completed At': task.completedAt || '',
        'Previous Instance ID': task.previousInstanceId || '',
        'Order': task.order || '',
        'Parent ID': task.parentId || ''
    }));
    
    const metadata = [{
        'Property': 'Exported At',
        'Value': timestamp
    }, {
        'Property': 'Total Tasks',
        'Value': tasks.length
    }, {
        'Property': 'Version',
        'Value': '1.2-pro' // *** UPDATED: Version
    }];
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wsMeta = XLSX.utils.json_to_sheet(metadata);
    const wb = XLSX.utils.book_new();
    
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata');
    
    const filename = getTimestampedFilename('tasks', 'xlsx');
    XLSX.writeFile(wb, filename);
    
    showToast(`Tasks exported to ${filename}`, 'success');
}

function exportToPDF() {
    if (typeof jspdf === 'undefined') {
        showToast('PDF export library not loaded. Please check your connection.', 'error');
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const exportTime = new Date().toLocaleString();
    
    doc.setFontSize(18);
    doc.text('TaskMaster Pro - Tasks Report', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Exported on: ${exportTime}`, 14, 28);
    doc.text(`Total Tasks: ${tasks.length}`, 14, 34);
    
    let y = 45;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.height;
    
    // *** UPDATED: Render hierarchically ***
    const renderTaskToPDF = (task, level) => {
        if (y > pageHeight - 30) {
            doc.addPage();
            y = 20;
        }
        
        const indent = 14 + (level * 10);
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${level > 0 ? '↳ ' : ''}${task.title}`, indent, y);
        y += lineHeight;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        if (task.description) {
            const lines = doc.splitTextToSize(`Description: ${task.description}`, 180 - (level * 10));
            doc.text(lines, indent, y);
            y += lines.length * lineHeight;
        }
        
        doc.text(`Category: ${capitalize(task.category)} | Priority: ${capitalize(task.priority)} | Status: ${task.completed ? 'Completed' : 'Pending'}`, indent, y);
        y += lineHeight;
        
        if (task.dueDate) {
            doc.text(`Due: ${formatDate(task.dueDate)}`, indent, y);
            y += lineHeight;
        }
        
        if (task.tags.length > 0) {
            doc.text(`Tags: ${task.tags.join(', ')}`, indent, y);
            y += lineHeight;
        }
        
        y += 3; // Spacing
        
        // Find and render children
        const children = tasks.filter(t => t.parentId === task.id);
        children.forEach(child => renderTaskToPDF(child, level + 1));
    };
    
    // Start rendering with top-level tasks
    const topLevelTasks = tasks.filter(t => !t.parentId);
    topLevelTasks.forEach(task => renderTaskToPDF(task, 0));
    
    const filename = getTimestampedFilename('tasks', 'pdf');
    doc.save(filename);
    showToast(`Tasks exported to ${filename}`, 'success');
}

function exportToGoogleCalendar() {
    // ... (function is unchanged) ...
}

function isDuplicate(newTask, existingTask) {
    // ... (function is unchanged) ...
}

// *** NEW: Functions for Import Options Modal ***

// *** NEW: Excel parsing function for smart import ***
async function parseExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, {header: 1});
                
                if (jsonData.length < 2) {
                    resolve([]);
                    return;
                }
                
                const headers = jsonData[0];
                const tasks = [];
                
                for (let i = 1; i < jsonData.length; i++) {
                    const task = {};
                    headers.forEach((header, index) => {
                        task[header] = jsonData[i][index] || '';
                    });
                    tasks.push(task);
                }
                
                resolve(tasks);
            } catch (error) {
                reject(error);
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

// *** NEW: Smart Import System Functions (already implemented above) ***

// Utility Functions

// *** UPDATED: STORAGE FUNCTIONS (IndexedDB) ***
/**
 * Saves the entire tasks array to IndexedDB.
 */
async function saveTasks() {
    try {
        // Use a transaction to clear and re-populate
        const tx = db.transaction(TASK_STORE, 'readwrite');
        await tx.objectStore(TASK_STORE).clear();
        // Use Promise.all for efficient parallel inserts
        await Promise.all(tasks.map(task => tx.objectStore(TASK_STORE).put(task)));
        await tx.done;
    } catch (e) {
        console.error("Error saving tasks to IndexedDB:", e);
        showToast("Error saving tasks. Storage might be full.", "error");
    }
}

/**
 * Loads all tasks from IndexedDB into the global 'tasks' array.
 */
async function loadTasks() {
    try {
        tasks = await db.getAll(TASK_STORE);
        // Ensure data integrity on load (add new properties if missing)
        tasks = tasks.map(t => ({
            ...t,
            tags: Array.isArray(t.tags) ? t.tags : [],
            priority: t.priority || 'medium',
            category: t.category || 'personal',
            previousInstanceId: t.previousInstanceId || null,
            order: t.order || new Date(t.createdAt).getTime(),
            parentId: t.parentId || null,
            collapsed: t.collapsed || false // *** NEW: Preserve collapse state ***
        }));
        renderTasks(); // Render after loading
    } catch (e) {
        console.error("Error loading tasks from IndexedDB:", e);
        tasks = [];
    }
}

// UTILITY FUNCTIONS
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[&<>"']/g, function(m) {
        return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        }[m];
    });
}

function escapeCSV(text) {
    if (!text && typeof text !== 'boolean' && typeof text !== 'number') return '""';
    let str = String(text);
    if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return `"${str}"`; // Always quote for safety
}

function escapeICS(text) {
    if (!text) return '';
    return String(text).replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(dateString) {
    if (!dateString) return '';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
             throw new Error("Invalid date string");
        }
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        
        const diffDays = Math.floor((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        const timeFormat = { hour: '2-digit', minute: '2-digit' };
        
        if (diffDays === 0) return 'Today ' + date.toLocaleTimeString([], timeFormat);
        if (diffDays === 1) return 'Tomorrow ' + date.toLocaleTimeString([], timeFormat);
        if (diffDays === -1) return 'Yesterday ' + date.toLocaleTimeString([], timeFormat);
        
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], timeFormat);
        }
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], timeFormat);
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return dateString;
    }
}

function formatICSDate(date) {
    if (!date) return '';
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function getPriorityNumber(priority) {
    const map = { low: 9, medium: 5, high: 3, urgent: 1 };
    return map[priority] || 5;
}

// MODAL CONTROLS (Updated for a11y)

// Reusable function to show a simple info modal
function showInfoModal(title, content) {
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    let infoModal = document.getElementById('infoModal');
    if (!infoModal) {
        infoModal = document.createElement('div');
        infoModal.id = 'infoModal';
        infoModal.className = 'modal hidden';
        infoModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="infoModalTitle"></h2>
                    <button class="close-btn" onclick="closeInfoModal()" aria-label="Close modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="infoModalContent" style="padding: 1.5rem; line-height: 1.6;"></div>
                <div class="modal-footer" style="padding: 1.5rem; justify-content: flex-end; border-top: 2px solid var(--border-color); display: flex;">
                    <button class="btn btn-secondary" onclick="closeInfoModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(infoModal);
    }
    
    document.getElementById('infoModalTitle').innerHTML = title;
    document.getElementById('infoModalContent').innerHTML = content;
    infoModal.classList.remove('hidden');
    
    // *** NEW: a11y focus ***
    setTimeout(() => infoModal.querySelector('.btn-secondary').focus(), 100);
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.classList.add('hidden');
    }
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

// Reusable function for custom confirmation dialog
function showConfirmModal(title, message, onConfirm) {
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    
    let confirmModal = document.getElementById('confirmModal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'confirmModal';
        confirmModal.className = 'modal hidden';
        confirmModal.innerHTML = `
            <div class="modal-content small-modal">
                <div class="modal-header">
                    <h2 id="confirmModalTitle"></h2>
                    <button class="close-btn" onclick="closeConfirmModal()" aria-label="Close modal">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="confirmModalMessage" style="padding: 1.5rem; line-height: 1.6;"></div>
                <div class="modal-footer" style="padding: 1.5rem; display: flex; gap: 1rem; justify-content: flex-end; border-top: 2px solid var(--border-color);">
                    <button class="btn btn-secondary" id="confirmCancelBtn" onclick="closeConfirmModal()">Cancel</button>
                    <button class="btn btn-danger" id="confirmOkBtn">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);
    }

    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;
    
    const confirmOkBtn = document.getElementById('confirmOkBtn');
    
    // Clear previous event listener by replacing the node
    const newConfirmOkBtn = confirmOkBtn.cloneNode(true);
    confirmOkBtn.parentNode.replaceChild(newConfirmOkBtn, confirmOkBtn);
    
    // Add new event listener
    newConfirmOkBtn.addEventListener('click', () => {
        onConfirm(); // This might be async
        closeConfirmModal();
    });

    confirmModal.classList.remove('hidden');
    
    // *** NEW: a11y focus ***
    setTimeout(() => newConfirmOkBtn.focus(), 100);
}

function closeConfirmModal() {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.classList.add('hidden');
    }
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

// *** UPDATED: About/Help/Privacy Modals ***
function showAbout() {
    showInfoModal(
        '<i class="fas fa-check-circle"></i> About TaskMaster Pro',
        `<p><strong>Version: 1.3 (Pro Features)</strong></p>
         <p>A comprehensive task management application with subtasks, drag-and-drop, search, and persistent IndexedDB storage.</p>
         <p>Developed with ❤️ by <strong>Santosh Phuyal</strong></p>
         <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 1rem;">
            Note: While PIN protection hides your tasks, all data is stored unencrypted in your browser.
         </p>`
    );
}

function showHelp() {
     showInfoModal(
        '<i class="fas fa-question-circle"></i> Help',
        `<ul style="list-style-position: inside; padding-left: 1rem;">
            <li><strong>Search:</strong> Use the search bar to find tasks by title, description, or tags.</li>
            <li><strong>Subtasks:</strong> Click the <i class="fas fa-plus-circle"></i> icon on a task to add a subtask.</li>
            <li><strong>Drag & Drop:</strong> In the 'Manual Order' sort view, you can drag and drop top-level tasks to reorder them.</li>
            <li><strong>Filters:</strong> Use the tabs or your browser's back/forward buttons to change filters.</li>
            <li><strong>Storage:</strong> Your data is now saved securely in your browser's IndexedDB.</li>
            <li><strong>Bulk Delete:</strong> Use the leftmost checkbox on each task to select multiple items, then click **Delete Selected**.</li>
            <li><strong>Complete Task:</strong> Click the inner checkbox. Completed recurring tasks will generate their next occurrence.</li>
         </ul>`
    );
}

function showPrivacy() {
    showInfoModal(
        '<i class="fas fa-shield-alt"></i> Privacy Policy',
        // *** UPDATED: Mention IndexedDB ***
        `<p>All your data is stored locally on your device using your browser's <strong>IndexedDB</strong>.</p>
         <p>No data is sent to any external servers. Your tasks and settings remain private and under your control.</p>`
    );
}


// *** NEW: Close export menu when clicking outside ***
document.addEventListener('click', function(event) {
    const menu = document.getElementById('quickExportMenu');
    const exportBtn = event.target.closest('button[onclick*="showQuickExportMenu"]');
    
    if (menu && menu.style.display === 'block' && !menu.contains(event.target) && !exportBtn) {
        hideQuickExportMenu();
    }
});

// INITIALIZATION
window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});