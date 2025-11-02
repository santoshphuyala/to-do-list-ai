// Global State
let tasks = [];
let currentFilter = 'all';
let currentEditingTask = null;
let selectedTasks = new Set(); // To track tasks for bulk actions
let currentSort = 'priority'; // Default sorting option
let settings = {
    defaultCategory: 'personal',
    defaultPriority: 'medium',
    defaultReminderHours: 2,
    pinEnabled: false,
    pin: null,
    theme: 'light'
};

// Initialize App
document.addEventListener('DOMContentLoaded', function() {
    loadSettings();
    loadTasks();
    applyTheme();
    checkPinProtection();
    setupEventListeners();
    checkReminders();
    renderAISummary(); 
    
    // Check reminders every minute
    setInterval(checkReminders, 60000);
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
}

// PIN Protection (Logic remains the same)
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
        saveSettings();
    }
}

function savePinSettings() {
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
    saveSettings();
    showToast('PIN saved successfully', 'success');
    
    document.getElementById('newPin').value = '';
    document.getElementById('confirmPin').value = '';
}

// Theme Toggle (Logic remains the same)
function toggleDarkMode() {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    saveSettings();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const icon = document.getElementById('themeIcon');
    icon.className = settings.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
}

// Task Management
function quickAddTask() {
    const input = document.getElementById('quickTaskInput');
    const title = input.value.trim();
    
    if (!title) return;
    
    const task = {
        id: Date.now().toString(),
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
        createdAt: new Date().toISOString()
    };
    
    tasks.push(task);
    saveTasks();
    renderTasks();
    renderAISummary(); 
    input.value = '';
    showToast('Task added successfully', 'success');
}

function openAdvancedForm() {
    currentEditingTask = null;
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskCategory').value = settings.defaultCategory;
    document.getElementById('taskPriority').value = settings.defaultPriority;
    document.getElementById('taskModal').classList.remove('hidden');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    currentEditingTask = null;
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

function saveTask(event) {
    event.preventDefault();
    
    const taskId = document.getElementById('taskId').value;
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
        }
        showToast('Task updated successfully', 'success');
    } else {
        // Create new task
        const task = {
            id: Date.now().toString(),
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
            createdAt: new Date().toISOString()
        };
        tasks.push(task);
        showToast('Task added successfully', 'success');
    }
    
    saveTasks();
    renderTasks();
    renderAISummary(); 
    closeTaskModal();
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    currentEditingTask = task;
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('taskId').value = task.id;
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
}

function deleteTask(taskId) {
    // Prevent deletion of a completed recurring task if its next instance exists
    const nextInstance = tasks.find(t => t.previousInstanceId === taskId);
    if (nextInstance) {
        showInfoModal('Deletion Blocked', 'Cannot delete this completed recurring task because its next instance has already been created. Please delete the pending instance first.');
        return;
    }

    // Use custom modal instead of confirm()
    showConfirmModal('Confirm Deletion', 'Are you sure you want to delete this task?', () => {
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks();
        // Clear selection if the deleted task was selected
        selectedTasks.delete(taskId); 
        renderTasks();
        renderAISummary(); 
        showToast('Task deleted successfully', 'success');
    });
}

// Bulk Actions
function toggleTaskSelection(taskId, isChecked) {
    if (isChecked) {
        selectedTasks.add(taskId);
    } else {
        selectedTasks.delete(taskId);
    }
    
    // *** FIX: Update the visibility and count of bulk action buttons ***
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
    // Ensure only the currently visible IDs are manipulated for 'Select All'.
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

    showConfirmModal('Confirm Bulk Deletion', `Are you sure you want to delete ${selectedTasks.size} selected task(s)?`, () => {
        // Filter out all tasks whose IDs are in the selectedTasks set
        const tasksToDelete = Array.from(selectedTasks);
        let nextInstanceCount = 0;
        
        // Prevent deletion of completed recurring tasks if next instance exists
        const tasksToKeep = tasksToDelete.filter(id => {
            const isCompletedRecurring = tasks.find(t => t.id === id && t.completed && t.repeat);
            const nextInstance = tasks.find(t => t.previousInstanceId === id);
            if (isCompletedRecurring && nextInstance) {
                nextInstanceCount++;
                return true; // Keep this ID in the tasksToDelete array (effectively preventing deletion)
            }
            return false; // Allow deletion
        });
        
        if (nextInstanceCount > 0) {
             showInfoModal('Deletion Blocked', `Cannot delete ${nextInstanceCount} completed recurring task(s) because their next instance(s) are still pending. Please delete the pending instance(s) first.`);
             // Only delete tasks that did NOT block the operation
             const deletableTaskIds = tasksToDelete.filter(id => !tasksToKeep.includes(id));
             tasks = tasks.filter(t => !deletableTaskIds.includes(t.id));
             selectedTasks = new Set();
             saveTasks();
             renderTasks();
             return;
        }

        // Proceed with full deletion if no blocking tasks
        tasks = tasks.filter(t => !selectedTasks.has(t.id));
        selectedTasks = new Set(); // Clear the selection
        saveTasks();
        renderTasks();
        renderAISummary();
        showToast('Selected tasks deleted successfully', 'success');
    });
}

// NEW: Clear All functionality (Already implemented in your JS)
function clearAllTasks() {
    showConfirmModal('Confirm Clear All', 'Are you sure you want to delete ALL tasks permanently? This cannot be undone.', () => {
        tasks = [];
        selectedTasks = new Set();
        saveTasks();
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
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
    }
}

function toggleTask(taskId) {
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
    
    saveTasks();
    renderTasks();
    renderAISummary(); 
}

// Update Filter Logic
function filterTasks(filter) {
    currentFilter = filter;
    
    // Clear selection state when switching tabs to avoid confusion
    selectedTasks.clear();
    // updateBulkActionUI(); // renderTasks() will call this
    
    // Update active tab
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const tabToActive = [...tabs].find(tab => tab.onclick.toString().includes(`'${filter}'`));
    if (tabToActive) {
        tabToActive.classList.add('active');
    }
   
    renderTasks();
}

// NEW: Sort Logic (Already implemented in your JS)
function setSortOption(sortKey) {
    currentSort = sortKey;
    renderTasks();
}

// UPDATED renderTasks function for new filter, sort, and bulk select
function renderTasks() {
    const container = document.getElementById('tasksContainer');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    
    let filteredTasks = tasks;
    
    // Apply filter
    if (currentFilter === 'all') {
        // 'All' now shows ALL tasks, completed or not
        filteredTasks = tasks;
    } else if (currentFilter === 'completed') {
        // Show ALL completed tasks
        filteredTasks = tasks.filter(t => t.completed);
    } else if (currentFilter === 'recurring') {
        // Show all PENDING recurring tasks
        filteredTasks = tasks.filter(t => !t.completed && t.repeat);
    } else {
        // Category filters (personal, office, misc) - Show PENDING tasks of that category
        filteredTasks = tasks.filter(t => !t.completed && !t.repeat && t.category === currentFilter);
    }
    
    // Apply sort
    filteredTasks.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        
        let comparison = 0;

        switch (currentSort) {
            case 'dueDate':
                const dateA = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                const dateB = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                comparison = dateA - dateB;
                break;
            case 'priority':
                comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                break;
            case 'title':
                comparison = a.title.localeCompare(b.title);
                break;
            case 'creationDate':
                comparison = new Date(b.createdAt) - new Date(a.createdAt); // Newest first
                break;
        }

        if (comparison !== 0) return comparison;
        
        // Fallback sort (e.g., if titles or priorities are the same)
        return new Date(b.createdAt) - new Date(a.createdAt); 
    });

    // Render bulk actions UI
    if (filteredTasks.length > 0) {
        bulkActionsContainer.classList.remove('hidden');
        bulkActionsContainer.querySelector('#selectAllCheckbox').checked = false; // Reset select all
        bulkActionsContainer.querySelector('#selectAllCheckbox').indeterminate = false;
        // updateBulkActionUI(); // This is called at the end
    } else {
        bulkActionsContainer.classList.add('hidden');
        selectedTasks.clear();
    }
    
    if (filteredTasks.length === 0) {
        let message = "No tasks found";
        let subMessage = "Add a new task to get started!";
        
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
        
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>${message}</h3>
                <p>${subMessage}</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}">
            <div class="task-header">
                <div class="task-title-section">
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
                        <div class="task-title">${escapeHtml(task.title)}</div>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn" onclick="editTask('${task.id}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="task-btn" onclick="deleteTask('${task.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
            <div class="task-meta">
                <span class="task-badge badge-category">
                    <i class="fas fa-folder"></i> ${capitalize(task.category)}
                </span>
                <span class="task-badge badge-priority ${task.priority}">
                    <i class="fas fa-flag"></i> ${capitalize(task.priority)}
                </span>
                ${task.dueDate ? `
                    <span class="task-badge badge-date">
                        <i class="fas fa-calendar"></i> ${formatDate(task.dueDate)}
                    </span>
                ` : ''}
                ${task.repeat ? `
                    <span class="task-badge badge-repeat">
                        <i class="fas fa-redo"></i> ${capitalize(task.repeatFrequency)}
                    </span>
                ` : ''}
            </div>
            ${task.tags.length > 0 ? `
                <div class="task-tags">
                    ${task.tags.map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
    `).join('');

    updateBulkActionUI(); // Ensure UI reflects current selection
}

// Reminders (Logic remains the same)
function checkReminders() {
    const now = new Date();
    
    tasks.forEach(task => {
        if (!task.completed && task.reminder) {
            const reminderTime = new Date(task.reminder);
            const timeDiff = reminderTime.getTime() - now.getTime();
            
            if (timeDiff > 0 && timeDiff <= 60 * 1000) {
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
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✓</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✓</text></svg>'
        };
        
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(`Task Reminder: ${task.title}`, options);
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// AI INSIGHTS FUNCTIONS (Logic remains the same)
function renderAISummary() {
    const insights = generateAIInsights(tasks);
    const container = document.getElementById('aiSummaryContent');
    
    if (insights.length === 0 || tasks.length === 0) {
        container.innerHTML = '<p class="ai-summary-item"><i class="fas fa-lightbulb"></i> Start adding tasks to get personalized insights.</p>';
        return;
    }
    
    container.innerHTML = insights.slice(0, 3).map(insight => `
        <p class="ai-summary-item">
            <i class="fas fa-lightbulb"></i>
            ${insight}
        </p>
    `).join('');
}

function toggleAISummary() {
    const content = document.getElementById('aiSummaryContent');
    const btn = document.getElementById('toggleSummaryBtn');
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

function closeInsightsModal() {
    document.getElementById('insightsModal').classList.add('hidden');
}

// Settings
function openSettings() {
    document.getElementById('defaultCategory').value = settings.defaultCategory;
    document.getElementById('defaultPriority').value = settings.defaultPriority;
    document.getElementById('defaultReminderHours').value = settings.defaultReminderHours;
    document.getElementById('enablePin').checked = settings.pinEnabled;
    
    if (settings.pinEnabled) {
        document.getElementById('pinSettings').classList.remove('hidden');
    }
    
    document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function saveSettings() {
    settings.defaultCategory = document.getElementById('defaultCategory').value;
    settings.defaultPriority = document.getElementById('defaultPriority').value;
    settings.defaultReminderHours = parseInt(document.getElementById('defaultReminderHours').value);
    
    localStorage.setItem('taskmaster_settings', JSON.stringify(settings));
    showToast('Settings saved successfully', 'success');
}

function loadSettings() {
    const saved = localStorage.getItem('taskmaster_settings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
}

// Import/Export (Logic remains the same)
function getTimestampedFilename(baseName, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${baseName}_${timestamp}.${extension}`;
}

function exportToJSON() {
    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.1',
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
    csv += 'ID,Title,Description,Category,Priority,Due Date,Reminder,Repeat,Repeat Frequency,Tags,Completed,Created At,Completed At,Previous Instance ID\n';
    
    tasks.forEach(task => {
        csv += `${escapeCSV(task.id)},${escapeCSV(task.title)},${escapeCSV(task.description)},${escapeCSV(task.category)},${escapeCSV(task.priority)},${escapeCSV(task.dueDate)},${escapeCSV(task.reminder)},${escapeCSV(task.repeat)},${escapeCSV(task.repeatFrequency)},${escapeCSV(task.tags.join(';'))},${escapeCSV(task.completed)},${escapeCSV(task.createdAt)},${escapeCSV(task.completedAt)},${escapeCSV(task.previousInstanceId)}\n`;
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
        'Previous Instance ID': task.previousInstanceId || ''
    }));
    
    const metadata = [{
        'Property': 'Exported At',
        'Value': timestamp
    }, {
        'Property': 'Total Tasks',
        'Value': tasks.length
    }, {
        'Property': 'Version',
        'Value': '1.1'
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
    
    tasks.forEach((task, index) => {
        if (y > pageHeight - 30) {
            doc.addPage();
            y = 20;
        }
        
        doc.setFontSize(12);
        doc.setFont(undefined, 'bold');
        doc.text(`${index + 1}. ${task.title}`, 14, y);
        y += lineHeight;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        
        if (task.description) {
            const lines = doc.splitTextToSize(`Description: ${task.description}`, 180);
            doc.text(lines, 14, y);
            y += lines.length * lineHeight;
        }
        
        doc.text(`Category: ${capitalize(task.category)} | Priority: ${capitalize(task.priority)} | Status: ${task.completed ? 'Completed' : 'Pending'}`, 14, y);
        y += lineHeight;
        
        if (task.dueDate) {
            doc.text(`Due: ${formatDate(task.dueDate)}`, 14, y);
            y += lineHeight;
        }
        
        if (task.tags.length > 0) {
            doc.text(`Tags: ${task.tags.join(', ')}`, 14, y);
            y += lineHeight;
        }
        
        y += 3;
    });
    
    const filename = getTimestampedFilename('tasks', 'pdf');
    doc.save(filename);
    showToast(`Tasks exported to ${filename}`, 'success');
}

function exportToGoogleCalendar() {
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TaskMaster Pro//EN\n';
    icsContent += `X-WR-CALNAME:TaskMaster Pro Tasks\n`;
    icsContent += `X-PUBLISHED-TTL:PT1H\n`;
    
    tasks.forEach(task => {
        if (task.dueDate && !task.completed) {
            const start = new Date(task.dueDate);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            
            icsContent += 'BEGIN:VEVENT\n';
            icsContent += `UID:${task.id}@taskmasterpro.com\n`;
            icsContent += `DTSTAMP:${formatICSDate(new Date())}\n`;
            icsContent += `DTSTART:${formatICSDate(start)}\n`;
            icsContent += `DTEND:${formatICSDate(end)}\n`;
            icsContent += `SUMMARY:${escapeICS(task.title)}\n`;
            if (task.description) {
                icsContent += `DESCRIPTION:${escapeICS(task.description)}\n`;
            }
            icsContent += `PRIORITY:${getPriorityNumber(task.priority)}\n`;
            
            if (task.reminder) {
                const reminderDate = new Date(task.reminder);
                const diff = start.getTime() - reminderDate.getTime();
                const minutes = Math.round(diff / 60000);
                if (minutes > 0) {
                    icsContent += 'BEGIN:VALARM\n';
                    icsContent += 'ACTION:DISPLAY\n';
                    icsContent += `DESCRIPTION:${escapeICS(task.title)}\n`;
                    icsContent += `TRIGGER:-PT${minutes}M\n`;
                    icsContent += 'END:VALARM\n';
                }
            }

            if (task.repeat) {
                let rrule = '';
                switch(task.repeatFrequency) {
                    case 'daily': rrule = 'FREQ=DAILY'; break;
                    case 'weekly': rrule = 'FREQ=WEEKLY'; break;
                    case 'monthly': rrule = 'FREQ=MONTHLY'; break;
                    case 'yearly': rrule = 'FREQ=YEARLY'; break;
                }
                if (rrule) {
                    icsContent += `RRULE:${rrule}\n`;
                }
            }
            
            icsContent += 'END:VEVENT\n';
        }
    });
    
    icsContent += 'END:VCALENDAR';
    
    const filename = getTimestampedFilename('tasks', 'ics');
    downloadFile(icsContent, filename, 'text/calendar');
    showToast(`Calendar file created: ${filename}`, 'success');
}

function isDuplicate(newTask, existingTask) {
    if (newTask.id && existingTask.id && newTask.id === existingTask.id) return true;
    if (newTask.title === existingTask.title && existingTask.title && newTask.createdAt === existingTask.createdAt) return true;
    if (newTask.title && existingTask.title && newTask.title.toLowerCase().trim() === existingTask.title.toLowerCase().trim() &&
        newTask.category === existingTask.category &&
        newTask.dueDate === existingTask.dueDate) {
        return true;
    }
    return false;
}

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
                    previousInstanceId: row['Previous Instance ID'] || null
                }));
            } else {
                throw new Error('Unsupported file format. Please use JSON, CSV, or XLSX files.');
            }
            
            if (!Array.isArray(importedTasks) || importedTasks.length === 0) {
                showToast('No valid tasks found in file', 'error');
                return;
            }
            
            let newCount = 0;
            let duplicateCount = 0;
            let skippedCount = 0;
            
            importedTasks.forEach(importedTask => {
                if (!importedTask.title || String(importedTask.title).trim() === '') {
                    skippedCount++;
                    return;
                }
                
                let isDup = tasks.some(existingTask => isDuplicate(importedTask, existingTask));
                
                if (isDup) {
                    duplicateCount++;
                } else {
                    if (!importedTask.id || tasks.some(t => t.id === importedTask.id)) {
                        importedTask.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    }
                    
                    tasks.push(importedTask);
                    newCount++;
                }
            });
            
            if (newCount > 0) {
                saveTasks();
                renderTasks();
                renderAISummary();
            }
            
            let message = '';
            if (newCount > 0) message += `✓ ${newCount} new task(s) imported. `;
            if (duplicateCount > 0) message += `⊗ ${duplicateCount} duplicate(s) skipped. `;
            if (skippedCount > 0) message += `⚠ ${skippedCount} invalid task(s) skipped. `;
            
            if (newCount === 0) {
                showToast(message || 'No new tasks to import', 'info');
            } else {
                showToast(message.trim(), 'success');
            }
            
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
    
    event.target.value = '';
}

function parseCSV(content) {
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    if (lines.length < 2) return [];
    
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
        return result.map(v => v.trim());
    };
    
    const headers = splitCsvLine(lines[0]).map(h => h.trim().replace(/"/g, ''));
    const tasks = [];
    
    const getHeaderIndex = (name) => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

    const indices = {
        id: getHeaderIndex('ID'), title: getHeaderIndex('Title'), desc: getHeaderIndex('Description'),
        cat: getHeaderIndex('Category'), prio: getHeaderIndex('Priority'), due: getHeaderIndex('Due Date'),
        reminder: getHeaderIndex('Reminder'), repeat: getHeaderIndex('Repeat'), freq: getHeaderIndex('Repeat Frequency'),
        tags: getHeaderIndex('Tags'), completed: getHeaderIndex('Completed'), created: getHeaderIndex('Created At'),
        completedAt: getHeaderIndex('Completed At'), prevId: getHeaderIndex('Previous Instance ID')
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
        
        if (task.title) {
            tasks.push(task);
        }
    }
    
    return tasks;
}

// STORAGE FUNCTIONS (Logic remains the same)
function saveTasks() {
    try {
        localStorage.setItem('taskmaster_tasks', JSON.stringify(tasks));
    } catch (e) {
        console.error("Error saving tasks to localStorage:", e);
        showToast("Error saving tasks. Storage might be full.", "error");
    }
}

function loadTasks() {
    const saved = localStorage.getItem('taskmaster_tasks');
    if (saved) {
        try {
            tasks = JSON.parse(saved);
            tasks = tasks.map(t => ({
                ...t,
                tags: Array.isArray(t.tags) ? t.tags : [],
                priority: t.priority || 'medium',
                category: t.category || 'personal',
                previousInstanceId: t.previousInstanceId || null
            }));
            renderTasks();
        } catch (e) {
            console.error("Error parsing tasks from localStorage:", e);
            tasks = [];
        }
    }
}

// UTILITY FUNCTIONS (Logic remains the same)
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeCSV(text) {
    if (!text && typeof text !== 'boolean' && typeof text !== 'number') return '""';
    return `"${String(text).replace(/"/g, '""')}"`;
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

// MODAL CONTROLS (Updated to use custom modals instead of alert/confirm)

// Reusable function to show a simple info modal
function showInfoModal(title, content) {
    let infoModal = document.getElementById('infoModal');
    if (!infoModal) {
        infoModal = document.createElement('div');
        infoModal.id = 'infoModal';
        infoModal.className = 'modal hidden';
        infoModal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="infoModalTitle"></h2>
                    <button class="close-btn" onclick="closeInfoModal()">
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
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.classList.add('hidden');
    }
}

// NEW: Reusable function for custom confirmation dialog
function showConfirmModal(title, message, onConfirm) {
    let confirmModal = document.getElementById('confirmModal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'confirmModal';
        confirmModal.className = 'modal hidden';
        confirmModal.innerHTML = `
            <div class="modal-content small-modal">
                <div class="modal-header">
                    <h2 id="confirmModalTitle"></h2>
                    <button class="close-btn" onclick="closeConfirmModal()">
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
    
    // Clear previous event listener
    const newConfirmOkBtn = confirmOkBtn.cloneNode(true);
    confirmOkBtn.parentNode.replaceChild(newConfirmOkBtn, confirmOkBtn);
    
    // Add new event listener
    newConfirmOkBtn.addEventListener('click', () => {
        onConfirm();
        closeConfirmModal();
    });

    confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.classList.add('hidden');
    }
}

function showAbout() {
    showInfoModal(
        '<i class="fas fa-check-circle"></i> About TaskMaster Pro',
        `<p><strong>Version: 1.2 (Advanced Management)</strong></p>
         <p>A comprehensive task management application with AI-powered insights, recurring tasks, bulk actions, and advanced sorting.</p>
         <p>Developed with ❤️ by <strong>Santosh Phuyal</strong></p>`
    );
}

function showHelp() {
     showInfoModal(
        '<i class="fas fa-question-circle"></i> Help',
        `<ul style="list-style-position: inside; padding-left: 1rem;">
            <li><strong>Quick Add:</strong> Type task title and press Enter.</li>
            <li><strong>Advanced Add:</strong> Click the sliders icon (<i class="fas fa-sliders-h"></i>) for more options.</li>
            <li><strong>All Tab:</strong> Now shows **all** tasks (pending and completed).</li>
            <li><strong>Bulk Delete:</strong> Use the leftmost checkbox on each task to select multiple items, then click **Delete Selected**.</li>
            <li><strong>Clear All:</strong> Use the **Clear All Tasks** button in the Settings modal to delete everything at once.</li>
            <li><strong>Sorting:</strong> Use the **Sort By** dropdown above the task list.</li>
            <li><strong>Complete Task:</strong> Click the inner checkbox. Completed recurring tasks will generate their next occurrence.</li>
            <li><strong>Un-check Task:</strong> Click a completed task's checkbox. This will move it back to pending and *remove* the next recurring instance.</li>
         </ul>`
    );
}

function showPrivacy() {
    showInfoModal(
        '<i class="fas fa-shield-alt"></i> Privacy Policy',
        `<p>All your data is stored locally on your device using your browser's <strong>localStorage</strong>.</p>
         <p>No data is sent to any external servers. Your tasks and settings remain private and under your control.</p>`
    );
}

// INITIALIZATION
window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});