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
        
        applyTheme();
        checkPinProtection();
        setupEventListeners();
        checkReminders();
        renderAISummary();
        
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

    document.querySelector('.ai-summary-header').addEventListener('click', toggleAISummary);
    
    // Listener for the sort dropdown
    document.getElementById('sortSelect').addEventListener('change', (e) => setSortOption(e.target.value));
    
    // *** NEW: Search input listener ***
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase();
            if(clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !currentSearch);
            renderTasks();
        });
    }
    
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
    renderTasks();
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
}

// NEW: Sort Logic
function setSortOption(sortKey) {
    currentSort = sortKey;
    document.getElementById('sortSelect').value = currentSort; // Ensure UI consistency
    renderTasks();
}

// *** MAJORLY UPDATED: renderTasks for Search, Subtasks, and Drag/Drop ***
function renderTasks() {
    const container = document.getElementById('tasksContainer');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    
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
    
    // 2. Apply Tab Filter (e.g., 'all', 'personal', 'completed')
    let filteredTasks = [];
    if (currentSearch) {
        // If searching, just use the search results (no 15-day filter during search)
        filteredTasks = processedTasks;
    } else if (currentFilter === 'all') {
        // *** UPDATED: In 'all' tab, hide repetitive tasks not due within 15 days ***
        filteredTasks = processedTasks.filter(t => {
            // Always show completed tasks
            if (t.completed) return true;
            
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
        // *** UNCHANGED: Recurring tab always shows ALL repetitive tasks ***
        filteredTasks = processedTasks.filter(t => !t.completed && t.repeat);
    } else {
        // *** UPDATED: Category filters also apply 15-day horizon for repetitive tasks ***
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

    // 3. Build Task Tree (for subtasks)
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
    
    // 4. Apply Sort (with completed tasks always below pending)
    const sortTasks = (taskList) => {
        taskList.sort((a, b) => {
            // *** NEW: Always sort completed tasks below pending tasks ***
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1; // Pending (false) comes first
            }
            
            const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
            let comparison = 0;

            switch (currentSort) {
                case 'priority':
                    comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                    break;
                case 'dueDate':
                    // *** UPDATED: Tasks without due dates go to the end ***
                    const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                    const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                    comparison = dateA - dateB;
                    break;
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'order':
                    comparison = (a.order || 0) - (b.order || 0);
                    break;
                case 'creationDate':
                    comparison = new Date(b.createdAt) - new Date(a.createdAt); // Newest first
                    break;
            }
            // Fallback sort: if comparison is 0, use due date, then manual order
            if (comparison !== 0) return comparison;
            
            // Secondary sort by due date
            const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
            const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
            if (dateA !== dateB) return dateA - dateB;
            
            // Tertiary sort by manual order
            return (a.order || 0) - (b.order || 0);
        });
        
        // Recursively sort children
        taskList.forEach(task => {
            if (task.children && task.children.length > 0) {
                sortTasks(task.children);
            }
        });
    };
    
    sortTasks(taskTree);

    // 5. Render Bulk Actions UI
    if (filteredTasks.length > 0) { // Base this on total filtered tasks, not just top level
        bulkActionsContainer.classList.remove('hidden');
        bulkActionsContainer.querySelector('#selectAllCheckbox').checked = false;
        bulkActionsContainer.querySelector('#selectAllCheckbox').indeterminate = false;
        document.getElementById('sortSelect').value = currentSort;
    } else {
        bulkActionsContainer.classList.add('hidden');
        selectedTasks.clear();
    }
    
    // 6. Render HTML
    if (taskTree.length === 0) {
        let message = "No tasks found";
        let subMessage = "Add a new task to get started!";
        
        if (currentSearch) {
             message = "No tasks match your search";
             subMessage = "Try searching for a different term.";
        } else {
            switch (currentFilter) {
                case 'completed':
                    message = "No completed tasks";
                    subMessage = "Get to work and check some tasks off your list!";
                    break;
                case 'recurring':
                    message = "No pending recurring tasks";
                    subMessage = "Create a task and check 'Repetitive Task' to add one.";
                    break;
                case 'all':
                    message = "Task list empty";
                    subMessage = "Add a new task to your list!";
                    break;
                 default:
                    message = `No tasks in '${capitalize(currentFilter)}'`;
                    subMessage = "Add a new task to this category.";
            }
        }
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>${message}</h3>
                <p>${subMessage}</p>
            </div>
        `;
        return;
    }
    
    // *** ENHANCED: Recursive render function with collapsible subtasks ***
    const renderTaskHTML = (task, level) => {
        // Limit nesting visualization
        const displayLevel = Math.min(level, 3);
        const subtaskClass = displayLevel > 0 ? `subtask subtask-level-${displayLevel}` : '';
        // Disable drag/drop if sorting is not manual, if searching, or if it's a subtask
        const draggable = (currentSort === 'order' && !currentSearch && displayLevel === 0) ? 'true' : 'false';
        
        // *** NEW: Check if task has children ***
        const hasChildren = task.children && task.children.length > 0;
        const isCollapsed = task.collapsed || false; // Track collapse state
        
        // *** NEW: Different styling for subtasks ***
        const subtaskTitleStyle = displayLevel > 0 ? 'color: var(--text-secondary); font-size: 0.95rem;' : '';
        const subtaskBorderStyle = displayLevel > 0 ? 'border-left: 3px solid var(--primary-color); padding-left: 0.5rem;' : '';
        
        let html = `
        <div class="task-card ${task.completed ? 'completed' : ''} ${subtaskClass}" 
             data-task-id="${task.id}" 
             draggable="${draggable}"
             ondragstart="handleDragStart(event)"
             style="${subtaskBorderStyle}">
            
            <div class="task-header">
                <div class="task-title-section">`;
        
        if (hasChildren) {
            html += `
                    <button class="collapse-btn" 
                            onclick="toggleSubtaskCollapse('${task.id}')" 
                            style="background: none; border: none; cursor: pointer; padding: 0.25rem; margin-right: 0.25rem; color: var(--primary-color);"
                            title="${isCollapsed ? 'Expand' : 'Collapse'} subtasks"
                            aria-label="${isCollapsed ? 'Expand' : 'Collapse'} subtasks">
                        <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'}"></i>
                    </button>`;
        } else {
            html += `<span style="width: 24px; display: inline-block;"></span>`;
        }
        
        html += `
                    <input type="checkbox" 
                           class="task-checkbox-multi" 
                           value="${task.id}"
                           ${selectedTasks.has(task.id) ? 'checked' : ''} 
                           onchange="toggleTaskSelection('${task.id}', this.checked)">
                           
                    <input type="checkbox" 
                           class="task-checkbox" 
                           ${task.completed ? 'checked' : ''} 
                           onchange="toggleTask('${task.id}')">
                           
                    <div>
                        <div class="task-title" style="${subtaskTitleStyle}">`;
        
        if (displayLevel > 0) {
            html += `<i class="fas fa-level-up-alt" style="transform: rotate(90deg); margin-right: 0.25rem; font-size: 0.8rem; opacity: 0.6;"></i>`;
        }
        
        html += `${escapeHtml(task.title)}`;
        
        if (hasChildren) {
            html += ` <span style="font-size: 0.8rem; opacity: 0.7;">(${task.children.length})</span>`;
        }
        
        html += `
                        </div>
                    </div>
                </div>
                <div class="task-actions">`;
        
        if (displayLevel < 3) {
            html += `
                    <button class="task-btn" onclick="openSubtaskForm('${task.id}')" title="Add Subtask" aria-label="Add Subtask">
                        <i class="fas fa-plus-circle"></i>
                    </button>`;
        }
        
        html += `
                    <button class="task-btn" onclick="editTask('${task.id}')" title="Edit" aria-label="Edit Task">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="task-btn" onclick="deleteTask('${task.id}')" title="Delete" aria-label="Delete Task">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
        
        if (task.description) {
            html += `<div class="task-description">${escapeHtml(task.description)}</div>`;
        }
        
        html += `
            <div class="task-meta">
                <span class="task-badge badge-category">
                    <i class="fas fa-folder"></i> ${capitalize(task.category)}
                </span>
                <span class="task-badge badge-priority ${task.priority}">
                    <i class="fas fa-flag"></i> ${capitalize(task.priority)}
                </span>`;
        
        if (task.dueDate) {
            html += `
                <span class="task-badge badge-date">
                    <i class="fas fa-calendar"></i> ${formatDate(task.dueDate)}
                </span>`;
        }
        
        if (task.repeat) {
            html += `
                <span class="task-badge badge-repeat">
                    <i class="fas fa-redo"></i> ${capitalize(task.repeatFrequency)}
                </span>`;
        }
        
        html += `
            </div>`;
        
        if (task.tags.length > 0) {
            html += `
            <div class="task-tags">
                ${task.tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
            </div>`;
        }
        
        html += `
        </div>`;
        
        // Render children tasks recursively (collapsible)
        if (hasChildren && !isCollapsed) {
            html += `
        <div class="subtask-container" data-parent-id="${task.id}">
            ${task.children.map(child => renderTaskHTML(child, level + 1)).join('')}
        </div>`;
        }
        
        return html;
    };
    
    container.innerHTML = taskTree.map(task => renderTaskHTML(task, 0)).join('');

    updateBulkActionUI();
}
    
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

function exportToCSV() {
    const timestamp = new Date().toISOString();
    let csv = `# Exported at: ${timestamp}\n`;
    // *** UPDATED: Added new fields
    csv += 'ID,Title,Description,Category,Priority,Due Date,Reminder,Repeat,Repeat Frequency,Tags,Completed,Created At,Completed At,Previous Instance ID,Order,Parent ID\n';
    
    tasks.forEach(task => {
        csv += `${escapeCSV(task.id)},${escapeCSV(task.title)},${escapeCSV(task.description)},${escapeCSV(task.category)},${escapeCSV(task.priority)},${escapeCSV(task.dueDate)},${escapeCSV(task.reminder)},${escapeCSV(task.repeat)},${escapeCSV(task.repeatFrequency)},${escapeCSV(task.tags.join(';'))},${escapeCSV(task.completed)},${escapeCSV(task.createdAt)},${escapeCSV(task.completedAt)},${escapeCSV(task.previousInstanceId)},${escapeCSV(task.order)},${escapeCSV(task.parentId)}\n`;
    });
    
    const filename = getTimestampedFilename('tasks', 'csv');
    downloadFile(csv, filename, 'text/csv');
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

// *** UPDATED: importFile function ***
function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            let importedData = null;
            let importedTasks = [];
            
            if (file.name.endsWith('.json')) {
                importedData = JSON.parse(content);
                if (importedData.tasks && Array.isArray(importedData.tasks)) {
                    importedTasks = importedData.tasks;
                } else if (Array.isArray(importedData)) {
                    importedTasks = importedData;
                } else {
                    throw new Error('Invalid JSON format');
                }
            } else if (file.name.endsWith('.csv')) {
                importedTasks = parseCSV(content);
            } else if (file.name.endsWith('.xlsx')) {
                if (typeof XLSX === 'undefined') {
                    showToast('Excel library not loaded. Please check your connection.', 'error');
                    return;
                }
                const workbook = XLSX.read(content, { type: 'binary' });
                let sheetName = 'Tasks';
                if (!workbook.Sheets[sheetName]) sheetName = workbook.SheetNames[0];
                
                const sheet = workbook.Sheets[sheetName];
                const rawData = XLSX.utils.sheet_to_json(sheet, {raw: false});
                
                // *** UPDATED: Read new fields ***
                importedTasks = rawData.map(row => ({
                    id: row.ID ? String(row.ID) : (Date.now().toString() + Math.random().toString(36).substr(2, 9)),
                    title: row.Title || '',
                    description: row.Description || '',
                    category: row.Category || 'personal',
                    priority: row.Priority || 'medium',
                    dueDate: row['Due Date'] ? new Date(row['Due Date']).toISOString().slice(0, 16) : null,
                    reminder: row.Reminder ? new Date(row.Reminder).toISOString().slice(0, 16) : null,
                    repeat: String(row.Repeat).toLowerCase() === 'yes' || row.Repeat === true,
                    repeatFrequency: row['Repeat Frequency'] || null,
                    tags: row.Tags ? String(row.Tags).split(',').map(t => t.trim()).filter(t => t) : [],
                    completed: String(row.Completed).toLowerCase() === 'yes' || row.Completed === true,
                    createdAt: row['Created At'] ? new Date(row['Created At']).toISOString() : new Date().toISOString(),
                    completedAt: row['Completed At'] ? new Date(row['Completed At']).toISOString() : null,
                    previousInstanceId: row['Previous Instance ID'] || null,
                    order: row['Order'] || null, // Will be populated later if null
                    parentId: row['Parent ID'] || null
                }));
            } else {
                throw new Error('Unsupported file format. Please use JSON, CSV, or XLSX files.');
            }
            
            // Filter out tasks without titles
            const validTasks = importedTasks.filter(task => task.title && String(task.title).trim() !== '');
            const skippedCount = importedTasks.length - validTasks.length;

            if (validTasks.length === 0) {
                showToast(skippedCount > 0 ? `No valid tasks found. ${skippedCount} invalid task(s) skipped.` : 'No tasks found in file', 'info');
                return;
            }
            
            // Show import options
            showImportOptionsModal(validTasks, skippedCount);
            
        } catch (error) {
            console.error('Import error:', error);
            showToast(`Error importing file: ${error.message}`, 'error');
        }
    };
    
    if (file.name.endsWith('.xlsx')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsText(file);
    }
    
    event.target.value = ''; // Reset file input
}

// *** NEW: Functions for Import Options Modal ***
function showImportOptionsModal(importedTasks, skippedCount) {
    pendingImportData = importedTasks; // Store data
    
    let duplicateCount = 0;
    let newCount = 0;

    importedTasks.forEach(importedTask => {
        let isDup = tasks.some(existingTask => isDuplicate(importedTask, existingTask));
        if (isDup) {
            duplicateCount++;
        } else {
            newCount++;
        }
    });

    const totalCount = importedTasks.length;

    // Update modal text
    document.getElementById('importOptionsMessage').innerHTML = `
        Your file contains <strong>${totalCount} task(s)</strong>.
        ${skippedCount > 0 ? ` (<strong>${skippedCount}</strong> invalid tasks were skipped).` : ''}
        How would you like to import them?
    `;
    
    document.getElementById('mergeInfo').innerHTML = `
        <strong>${newCount}</strong> new, <strong>${duplicateCount}</strong> duplicates found.
    `;

    // Show modal
    // *** NEW: a11y focus management ***
    lastFocusedElement = document.activeElement;
    document.getElementById('importOptionsModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('importOptionsModal').querySelector('.merge-btn').focus(), 100);
}

// *** UPDATED: Import handlers (async for saveTasks) ***
async function handleImportMerge() {
    if (!pendingImportData) return;
    
    let newCount = 0;
    let duplicateCount = 0;

    pendingImportData.forEach(importedTask => {
        let isDup = tasks.some(existingTask => isDuplicate(importedTask, existingTask));
        
        if (isDup) {
            duplicateCount++;
        } else {
            // Ensure unique ID and defaults
            if (!importedTask.id || tasks.some(t => t.id === importedTask.id)) {
                importedTask.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
            }
            importedTask.order = importedTask.order || new Date(importedTask.createdAt).getTime();
            importedTask.parentId = importedTask.parentId || null;
            tasks.push(importedTask);
            newCount++;
        }
    });

    let message = '';
    if (newCount > 0) message += `✓ ${newCount} new task(s) merged. `;
    if (duplicateCount > 0) message += `⊗ ${duplicateCount} duplicate(s) skipped. `;
    
    if (newCount > 0) {
        await saveTasks(); // *** UPDATED
        renderTasks();
        renderAISummary();
        showToast(message.trim(), 'success');
    } else {
        showToast(message || 'No new tasks to merge', 'info');
    }
    
    handleImportCancel(); // Close modal and clear data
}

function handleImportOverwrite() {
    if (!pendingImportData) return;

    // Show a final confirmation for destructive action
    showConfirmModal(
        'Confirm Overwrite',
        `Are you sure? This will delete all your current ${tasks.length} tasks and replace them with ${pendingImportData.length} tasks from the file.`,
        async () => { // *** UPDATED: async
            tasks = pendingImportData.map(importedTask => {
                // Ensure unique ID and defaults
                if (!importedTask.id) {
                     importedTask.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                }
                return {
                    ...importedTask,
                    order: importedTask.order || new Date(importedTask.createdAt).getTime(),
                    parentId: importedTask.parentId || null
                };
            });
            
            await saveTasks(); // *** UPDATED
            renderTasks();
            renderAISummary();
            showToast(`✓ ${tasks.length} tasks imported. All previous tasks overwritten.`, 'success');
            handleImportCancel(); // Close modal and clear data
        }
    );
}

function handleImportCancel() {
    pendingImportData = null;
    document.getElementById('importOptionsModal').classList.add('hidden');
    // Clear the file input again in case user wants to select the same file
    document.getElementById('importFile').value = '';
    
    // *** NEW: a11y focus management ***
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}


function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    if (lines.length < 2) return [];
    
    // This CSV parser is simple and may fail with complex quoted strings.
    const splitCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuote && line[i+1] === '"') {
                    current += '"';
                    i++;
                } else {
                    inQuote = !inQuote;
                }
            } else if (char === ',' && !inQuote) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        // Trim quotes from unquoted fields
        return result.map(v => v.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"'));
    };
    
    const headers = splitCsvLine(lines[0]).map(h => h.trim().replace(/"/g, ''));
    const tasks = [];
    
    const getHeaderIndex = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

    // *** UPDATED: Read new fields ***
    const indices = {
        id: getHeaderIndex('ID'), title: getHeaderIndex('Title'), desc: getHeaderIndex('Description'),
        cat: getHeaderIndex('Category'), prio: getHeaderIndex('Priority'), due: getHeaderIndex('Due Date'),
        reminder: getHeaderIndex('Reminder'), repeat: getHeaderIndex('Repeat'), freq: getHeaderIndex('Repeat Frequency'),
        tags: getHeaderIndex('Tags'), completed: getHeaderIndex('Completed'), created: getHeaderIndex('Created At'),
        completedAt: getHeaderIndex('Completed At'), prevId: getHeaderIndex('Previous Instance ID'),
        order: getHeaderIndex('Order'), parentId: getHeaderIndex('Parent ID')
    };

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = splitCsvLine(lines[i]);
        const task = {};

        task.id = values[indices.id] || (Date.now().toString() + Math.random().toString(36).substr(2, 9));
        task.title = values[indices.title] || '';
        task.description = values[indices.desc] || '';
        task.category = values[indices.cat] || 'personal';
        task.priority = values[indices.prio] || 'medium';
        task.dueDate = values[indices.due] || null;
        task.reminder = values[indices.reminder] || null;
        task.repeat = String(values[indices.repeat]).toLowerCase() === 'true' || String(values[indices.repeat]).toLowerCase() === 'yes';
        task.repeatFrequency = values[indices.freq] || null;
        task.tags = values[indices.tags] ? values[indices.tags].split(';').map(t => t.trim()).filter(t => t) : [];
        task.completed = String(values[indices.completed]).toLowerCase() === 'true' || String(values[indices.completed]).toLowerCase() === 'yes';
        task.createdAt = values[indices.created] || new Date().toISOString();
        task.completedAt = values[indices.completedAt] || null;
        task.previousInstanceId = values[indices.prevId] || null;
        
        // *** NEW DEFAULTS ***
        task.order = values[indices.order] ? parseFloat(values[indices.order]) : new Date(task.createdAt).getTime();
        task.parentId = values[indices.parentId] || null;
        
        if (task.title) {
            tasks.push(task);
        }
    }
    
    return tasks;
}

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