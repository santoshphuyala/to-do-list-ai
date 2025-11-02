// Global State
let tasks = [];
let currentFilter = 'all';
let currentEditingTask = null;
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
    renderAISummary(); // Render AI summary on load
    
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

    // Add listener for new AI summary toggle
    document.querySelector('.ai-summary-header').addEventListener('click', toggleAISummary);
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

// Theme Toggle
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
    renderAISummary(); // Update AI summary
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
    renderAISummary(); // Update AI summary
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
        showToast('Cannot delete completed recurring task. Delete the pending instance first.', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this task?')) return;
    
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    renderTasks();
    renderAISummary(); // Update AI summary
    showToast('Task deleted successfully', 'success');
}

// *** MODIFIED FUNCTION ***
// This function now handles un-checking recurring tasks intelligently
function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const isCompleting = !task.completed; // Is the action to *complete* the task?

    if (isCompleting) {
        // === MARKING AS COMPLETE ===
        task.completed = true;
        task.completedAt = new Date().toISOString();
        
        // Handle repetitive tasks: Create the next instance
        if (task.repeat) {
            const newTask = { ...task }; // Clone the task
            newTask.id = Date.now().toString(); // New ID
            newTask.completed = false;
            newTask.completedAt = null;
            newTask.createdAt = new Date().toISOString();
            // *** THIS IS THE CRITICAL ADDITION ***
            // Link this new task to the one just-completed
            newTask.previousInstanceId = task.id; 

            // Calculate next due date
            if (task.dueDate) {
                const nextDate = new Date(task.dueDate);
                switch (task.repeatFrequency) {
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
                // Format to 'YYYY-MM-DDTHH:MM'
                newTask.dueDate = new Date(nextDate.getTime() - (nextDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                
                // Update reminder based on new due date
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
        // === MARKING AS PENDING (UN-CHECKING) ===
        task.completed = false;
        task.completedAt = null;

        // If it was a recurring task, find and remove the *next* instance that was created.
        if (task.repeat) {
            // Find the task that was generated by *this* task's completion
            const nextInstanceIndex = tasks.findIndex(t => t.previousInstanceId === task.id);
            
            if (nextInstanceIndex > -1) {
                // Remove it from the array
                tasks.splice(nextInstanceIndex, 1);
                showToast('Next recurring instance removed.', 'info');
            }
        }
    }
    
    saveTasks();
    // Re-render tasks, which will move the task from 'Completed' back to its correct pending tab
    renderTasks();
    renderAISummary(); // Update AI summary
}


function filterTasks(filter) {
    currentFilter = filter;
    
    // Update active tab
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    // Use event.target if available, otherwise find by filter
    if (event && event.target) {
         event.target.classList.add('active');
    } else {
        // Fallback for when filter is called without an event (e.g. on load)
        const tabToActive = [...tabs].find(tab => tab.onclick.toString().includes(`'${filter}'`));
        if (tabToActive) {
            tabToActive.classList.add('active');
        }
    }
   
    
    renderTasks();
}

// UPDATED renderTasks function for new tabs
function renderTasks() {
    const container = document.getElementById('tasksContainer');
    
    let filteredTasks = tasks;
    
    // Apply filter
    if (currentFilter === 'completed') {
        // Show ALL completed tasks (recurring or not)
        filteredTasks = tasks.filter(t => t.completed);
    } else if (currentFilter === 'recurring') {
        // Show all PENDING recurring tasks
        filteredTasks = tasks.filter(t => !t.completed && t.repeat);
    } else if (currentFilter === 'all') {
        // 'All' should show all PENDING, NON-RECURRING tasks
        filteredTasks = tasks.filter(t => !t.completed && !t.repeat);
    } else {
        // Category filters (personal, office, misc)
        // Show PENDING, NON-RECURRING tasks of that category
        filteredTasks = tasks.filter(t => !t.completed && !t.repeat && t.category === currentFilter);
    }
    
    // Sort by priority and due date
    filteredTasks.sort((a, b) => {
        // If 'completed' tab, sort by completed date descending
        if (currentFilter === 'completed') {
            if (!a.completedAt) return 1; // Move nulls to bottom
            if (!b.completedAt) return -1;
            return new Date(b.completedAt) - new Date(a.completedAt);
        }

        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        
        if (priorityDiff !== 0) return priorityDiff;
        
        if (a.dueDate && b.dueDate) {
            return new Date(a.dueDate) - new Date(b.dueDate);
        } else if (a.dueDate) {
            return -1; // Tasks with due dates come first
        } else if (b.dueDate) {
            return 1;
        }
        
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    if (filteredTasks.length === 0) {
        let message = "No tasks found";
        let subMessage = "Add a new task to get started!";
        
        switch (currentFilter) {
            case 'completed':
                message = "No completed tasks";
                subMessage = "Get to work and check some tasks off your list!";
                break;
            case 'recurring':
                message = "No recurring tasks";
                subMessage = "Create a task and check 'Repetitive Task' to add one.";
                break;
            case 'all':
                message = "All tasks complete!";
                subMessage = "Add a new task or enjoy your free time.";
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
}

// Reminders
function checkReminders() {
    const now = new Date();
    
    tasks.forEach(task => {
        if (!task.completed && task.reminder) {
            const reminderTime = new Date(task.reminder);
            const timeDiff = reminderTime.getTime() - now.getTime();
            
            // Show notification if reminder is within 1 minute of firing
            if (timeDiff > 0 && timeDiff <= 60 * 1000) {
                // Check if we've already notified for this reminder
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

// ============================================
// AI INSIGHTS FUNCTIONS (NEW & MODIFIED)
// ============================================

// NEW: Function to render the summary at the top
function renderAISummary() {
    const insights = generateAIInsights(tasks);
    const container = document.getElementById('aiSummaryContent');
    
    if (insights.length === 0 || tasks.length === 0) {
        container.innerHTML = '<p class="ai-summary-item"><i class="fas fa-lightbulb"></i> Start adding tasks to get personalized insights.</p>';
        return;
    }
    
    // Show top 3 insights
    container.innerHTML = insights.slice(0, 3).map(insight => `
        <p class="ai-summary-item">
            <i class="fas fa-lightbulb"></i>
            ${insight}
        </p>
    `).join('');
}

// NEW: Function to toggle the summary visibility
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


// MODIFIED: This function now just shows the full modal report
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
    
    // AI-powered insights (all of them)
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
                    <div class="stat-value" style="color: #ef4444;">${byPriority.urgent}</div>
                    <div class="stat-label">Urgent</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #f97316;">${byPriority.high}</div>
                    <div class="stat-label">High</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #f59e0b;">${byPriority.medium}</div>
                    <div class="stat-label">Medium</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #10b981;">${byPriority.low}</div>
                    <div class="stat-label">Low</div>
                </div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-calendar-alt"></i> Schedule Overview (Pending)</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value" style="color: #ef4444;">${overdue.length}</div>
                    <div class="stat-label">Overdue</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #f59e0b;">${dueToday.length}</div>
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

// This function remains the same
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
    
    // Add a default message if no other insights are generated
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
    // Save settings from form
    settings.defaultCategory = document.getElementById('defaultCategory').value;
    settings.defaultPriority = document.getElementById('defaultPriority').value;
    settings.defaultReminderHours = parseInt(document.getElementById('defaultReminderHours').value);
    
    // Note: PIN settings are saved in savePinSettings()
    
    localStorage.setItem('taskmaster_settings', JSON.stringify(settings));
    showToast('Settings saved successfully', 'success');
}

function loadSettings() {
    const saved = localStorage.getItem('taskmaster_settings');
    if (saved) {
        settings = { ...settings, ...JSON.parse(saved) };
    }
}

// ============================================
// IMPORT/EXPORT FUNCTIONS (Enhanced)
// ============================================

// Helper function to generate timestamped filename
function getTimestampedFilename(baseName, extension) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    return `${baseName}_${timestamp}.${extension}`;
}

// Export to JSON with metadata and timestamp
function exportToJSON() {
    const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        totalTasks: tasks.length,
        tasks: tasks
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const filename = getTimestampedFilename('tasks', 'json');
    downloadFile(dataStr, filename, 'application/json');
    showToast(`Tasks exported to ${filename}`, 'success');
}

// Export to CSV with timestamp
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

// Export to Excel with timestamp and metadata
function exportToExcel() {
    // Check if XLSX library is loaded
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
    
    // Add metadata sheet
    const metadata = [{
        'Property': 'Exported At',
        'Value': timestamp
    }, {
        'Property': 'Total Tasks',
        'Value': tasks.length
    }, {
        'Property': 'Version',
        'Value': '1.0'
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

// Export to PDF with timestamp
function exportToPDF() {
    // Check if jsPDF library is loaded
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
        if (y > pageHeight - 30) { // Add more margin at bottom
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
        
        y += 3; // Extra space between tasks
    });
    
    const filename = getTimestampedFilename('tasks', 'pdf');
    doc.save(filename);
    showToast(`Tasks exported to ${filename}`, 'success');
}

// Export to Google Calendar with timestamp
function exportToGoogleCalendar() {
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TaskMaster Pro//EN\n';
    icsContent += `X-WR-CALNAME:TaskMaster Pro Tasks\n`;
    icsContent += `X-PUBLISHED-TTL:PT1H\n`;
    
    tasks.forEach(task => {
        if (task.dueDate && !task.completed) { // Only export pending tasks with due dates
            const start = new Date(task.dueDate);
            const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hour duration
            
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
            
            // Add reminder
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

            // Add recurrence
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

// Enhanced duplicate detection
function isDuplicate(newTask, existingTask) {
    // Check by ID first (most reliable)
    if (newTask.id && existingTask.id && newTask.id === existingTask.id) {
        return true;
    }
    
    // Check by title and created date (strong match)
    if (newTask.title === existingTask.title && 
        newTask.createdAt === existingTask.createdAt) {
        return true;
    }
    
    // Check by title, category, and due date (likely duplicate)
    if (newTask.title.toLowerCase().trim() === existingTask.title.toLowerCase().trim() &&
        newTask.category === existingTask.category &&
        newTask.dueDate === existingTask.dueDate) {
        return true;
    }
    
    return false;
}

// Enhanced import function with smart duplicate detection
function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            let importedData = null;
            let importedTasks = [];
            
            // Parse different file formats
            if (file.name.endsWith('.json')) {
                importedData = JSON.parse(content);
                
                // Check if it's our enhanced export format with metadata
                if (importedData.tasks && Array.isArray(importedData.tasks)) {
                    importedTasks = importedData.tasks;
                    console.log(`Importing from export dated: ${importedData.exportedAt}`);
                } else if (Array.isArray(importedData)) {
                    importedTasks = importedData;
                } else {
                    throw new Error('Invalid JSON format');
                }
                
            } else if (file.name.endsWith('.csv')) {
                importedTasks = parseCSV(content);
                
            } else if (file.name.endsWith('.xlsx')) {
                // Check if XLSX library is loaded
                if (typeof XLSX === 'undefined') {
                    showToast('Excel library not loaded. Please check your connection.', 'error');
                    return;
                }
                const workbook = XLSX.read(content, { type: 'binary' });
                
                // Try to read from Tasks sheet first, fallback to first sheet
                let sheetName = 'Tasks';
                if (!workbook.Sheets[sheetName]) {
                    sheetName = workbook.SheetNames[0];
                }
                
                const sheet = workbook.Sheets[sheetName];
                const rawData = XLSX.utils.sheet_to_json(sheet, {raw: false}); // raw: false to parse dates
                
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
            
            // Validate imported tasks
            if (!Array.isArray(importedTasks) || importedTasks.length === 0) {
                showToast('No valid tasks found in file', 'error');
                return;
            }
            
            // Smart duplicate detection and incremental import
            let newCount = 0;
            let duplicateCount = 0;
            let skippedCount = 0;
            
            importedTasks.forEach(importedTask => {
                // Ensure task has required fields
                if (!importedTask.title || String(importedTask.title).trim() === '') {
                    skippedCount++;
                    return; // Skip invalid tasks
                }
                
                // Check for duplicates
                let isDup = false;
                
                for (let i = 0; i < tasks.length; i++) {
                    if (isDuplicate(importedTask, tasks[i])) {
                        isDup = true;
                        break;
                    }
                }
                
                if (isDup) {
                    duplicateCount++;
                } else {
                    // Ensure unique ID
                    if (!importedTask.id || tasks.some(t => t.id === importedTask.id)) {
                        importedTask.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    }
                    
                    // Add new task
                    tasks.push(importedTask);
                    newCount++;
                }
            });
            
            // Save and refresh if there are new tasks
            if (newCount > 0) {
                saveTasks();
                renderTasks();
                renderAISummary(); // Update insights
            }
            
            // Show detailed import results
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
    
    // Read file based on type
    if (file.name.endsWith('.xlsx')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsText(file);
    }
    
    // Reset file input
    event.target.value = '';
}

// Enhanced CSV parser
function parseCSV(content) {
    // Remove comment lines (starting with #)
    const lines = content.split('\n').filter(line => line.trim() && !line.trim().startsWith('#'));
    
    if (lines.length < 2) {
        return [];
    }
    
    // Regex to split CSV, handling quotes
    const splitCsvLine = (line) => {
        const result = [];
        let current = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                if (inQuote && line[i+1] === '"') {
                    current += '"';
                    i++; // Skip next quote
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

    const idIndex = getHeaderIndex('ID');
    const titleIndex = getHeaderIndex('Title');
    const descIndex = getHeaderIndex('Description');
    const catIndex = getHeaderIndex('Category');
    const prioIndex = getHeaderIndex('Priority');
    const dueIndex = getHeaderIndex('Due Date');
    const reminderIndex = getHeaderIndex('Reminder');
    const repeatIndex = getHeaderIndex('Repeat');
    const freqIndex = getHeaderIndex('Repeat Frequency');
    const tagsIndex = getHeaderIndex('Tags');
    const completedIndex = getHeaderIndex('Completed');
    const createdIndex = getHeaderIndex('Created At');
    const completedAtIndex = getHeaderIndex('Completed At');
    const prevIdIndex = getHeaderIndex('Previous Instance ID');


    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = splitCsvLine(lines[i]);
        const task = {};

        task.id = values[idIndex] || (Date.now().toString() + Math.random().toString(36).substr(2, 9));
        task.title = values[titleIndex] || '';
        task.description = values[descIndex] || '';
        task.category = values[catIndex] || 'personal';
        task.priority = values[prioIndex] || 'medium';
        task.dueDate = values[dueIndex] || null;
        task.reminder = values[reminderIndex] || null;
        task.repeat = String(values[repeatIndex]).toLowerCase() === 'true' || String(values[repeatIndex]).toLowerCase() === 'yes';
        task.repeatFrequency = values[freqIndex] || null;
        task.tags = values[tagsIndex] ? values[tagsIndex].split(';').map(t => t.trim()).filter(t => t) : [];
        task.completed = String(values[completedIndex]).toLowerCase() === 'true' || String(values[completedIndex]).toLowerCase() === 'yes';
        task.createdAt = values[createdIndex] || new Date().toISOString();
        task.completedAt = values[completedAtIndex] || null;
        task.previousInstanceId = values[prevIdIndex] || null;
        
        if (task.title) {
            tasks.push(task);
        }
    }
    
    return tasks;
}

// ============================================
// STORAGE FUNCTIONS
// ============================================

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
            // Data migration/sanitization if needed
            tasks = tasks.map(t => ({
                ...t,
                tags: Array.isArray(t.tags) ? t.tags : [],
                priority: t.priority || 'medium',
                category: t.category || 'personal',
                previousInstanceId: t.previousInstanceId || null // Ensure new field exists
            }));
            renderTasks();
        } catch (e) {
            console.error("Error parsing tasks from localStorage:", e);
            tasks = [];
        }
    }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return; // Guard against toast not existing
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
    // Show toast
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
        if (isNaN(date.getTime())) { // Check for invalid date
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
        
        // Check if it's this year
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString([], timeFormat);
        }
        
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], timeFormat);
    } catch (e) {
        console.error("Error formatting date:", dateString, e);
        return dateString; // fallback
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

// ============================================
// INFORMATION PAGES (Using custom modal instead of alert)
// ============================================

// Reusable function to show a simple info modal
function showInfoModal(title, content) {
    // Check if modal exists, if not, create it
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


function showAbout() {
    showInfoModal(
        '<i class="fas fa-check-circle"></i> About TaskMaster Pro',
        `<p><strong>Version: 1.1 (Robust Toggle)</strong></p>
         <p>A comprehensive task management application with AI-powered insights, recurring tasks, and offline support.</p>
         <p>Developed with ❤️ by <strong>Santosh Phuyal</strong></p>`
    );
}

function showHelp() {
     showInfoModal(
        '<i class="fas fa-question-circle"></i> Help',
        `<ul style="list-style-position: inside; padding-left: 1rem;">
            <li><strong>Quick Add:</strong> Type task title and press Enter.</li>
            <li><strong>Advanced Add:</strong> Click the sliders icon (<i class="fas fa-sliders-h"></i>) for more options.</li>
            <li><strong>AI Summary:</strong> Click the header at the top to see quick insights.</li>
            <li><strong>Full Report:</strong> Click the chart icon (<i class="fas fa-chart-line"></i>) in the header for a full report.</li>
            <li><strong>Recurring Tasks:</strong> Check the 'Repetitive Task' box. View all pending recurring tasks in the 'Recurring' tab.</li>
            <li><strong>Complete Task:</strong> Click the checkbox. Completed recurring tasks will generate their next occurrence.</li>
            <li><strong>Un-check Task:</strong> Click a completed task's checkbox. This will move it back to pending and *remove* the next recurring instance if one was created.</li>
            <li><strong>Edit/Delete:</strong> Use the <i class="fas fa-edit"></i> and <i class="fas fa-trash"></i> icons on each task.</li>
            <li><strong>Export/Import:</strong> Access from Settings (<i class="fas fa-cog"></i>).</li>
            <li><strong>PIN Protection:</strong> Enable from Settings for app protection.</li>
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

// ============================================
// INITIALIZATION
// ============================================

// Request notification permission on load
window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});

