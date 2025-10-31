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
    if (!confirm('Are you sure you want to delete this task?')) return;
    
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasks();
    renderTasks();
    showToast('Task deleted successfully', 'success');
}

function toggleTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date().toISOString() : null;
    
    // Handle repetitive tasks
    if (task.completed && task.repeat) {
        const newTask = { ...task };
        newTask.id = Date.now().toString();
        newTask.completed = false;
        newTask.completedAt = null;
        newTask.createdAt = new Date().toISOString();
        
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
            newTask.dueDate = nextDate.toISOString().slice(0, 16);
            
            // Update reminder
            if (task.reminder) {
                const reminderDate = new Date(nextDate);
                reminderDate.setHours(reminderDate.getHours() - settings.defaultReminderHours);
                newTask.reminder = reminderDate.toISOString().slice(0, 16);
            }
        }
        
        tasks.push(newTask);
    }
    
    saveTasks();
    renderTasks();
}

function filterTasks(filter) {
    currentFilter = filter;
    
    // Update active tab
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    renderTasks();
}

function renderTasks() {
    const container = document.getElementById('tasksContainer');
    
    let filteredTasks = tasks;
    
    // Apply filter
    if (currentFilter !== 'all') {
        if (currentFilter === 'completed') {
            filteredTasks = tasks.filter(t => t.completed);
        } else {
            filteredTasks = tasks.filter(t => !t.completed && t.category === currentFilter);
        }
    } else {
        filteredTasks = tasks.filter(t => !t.completed);
    }
    
    // Sort by priority and due date
    filteredTasks.sort((a, b) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        
        if (priorityDiff !== 0) return priorityDiff;
        
        if (a.dueDate && b.dueDate) {
            return new Date(a.dueDate) - new Date(b.dueDate);
        }
        
        return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    if (filteredTasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <h3>No tasks found</h3>
                <p>Add a new task to get started!</p>
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
            const timeDiff = reminderTime - now;
            
            // Show notification if reminder is within 5 minutes
            if (timeDiff > 0 && timeDiff <= 5 * 60 * 1000) {
                showNotification(task);
            }
        }
    });
}

function showNotification(task) {
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Task Reminder', {
            body: task.title,
            icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✓</text></svg>',
            badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">✓</text></svg>'
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// Insights
function showInsights() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const byCategory = {
        personal: tasks.filter(t => t.category === 'personal' && !t.completed).length,
        office: tasks.filter(t => t.category === 'office' && !t.completed).length,
        misc: tasks.filter(t => t.category === 'misc' && !t.completed).length
    };
    
    const byPriority = {
        urgent: tasks.filter(t => t.priority === 'urgent' && !t.completed).length,
        high: tasks.filter(t => t.priority === 'high' && !t.completed).length,
        medium: tasks.filter(t => t.priority === 'medium' && !t.completed).length,
        low: tasks.filter(t => t.priority === 'low' && !t.completed).length
    };
    
    const overdue = tasks.filter(t => {
        if (t.completed || !t.dueDate) return false;
        return new Date(t.dueDate) < new Date();
    }).length;
    
    const today = new Date().toDateString();
    const dueToday = tasks.filter(t => {
        if (t.completed || !t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
    }).length;
    
    // AI-powered insights
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
            <h3><i class="fas fa-folder-open"></i> By Category</h3>
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
            <h3><i class="fas fa-flag"></i> By Priority</h3>
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
            <h3><i class="fas fa-calendar-alt"></i> Schedule Overview</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value" style="color: #ef4444;">${overdue}</div>
                    <div class="stat-label">Overdue</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" style="color: #f59e0b;">${dueToday}</div>
                    <div class="stat-label">Due Today</div>
                </div>
            </div>
        </div>
        
        <div class="insight-card">
            <h3><i class="fas fa-brain"></i> AI Insights</h3>
            ${insights.map(insight => `
                <p style="margin: 0.75rem 0; padding: 0.75rem; background: var(--light-color); border-radius: 8px;">
                    <i class="fas fa-lightbulb" style="color: var(--warning-color);"></i>
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
    const thisWeek = pending.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        return dueDate >= today && dueDate <= weekFromNow;
    });
    
    if (thisWeek.length > 0) {
        insights.push(`You have ${thisWeek.length} task${thisWeek.length > 1 ? 's' : ''} due this week. Plan your time accordingly.`);
    }
    
    const completed = tasks.filter(t => t.completed);
    if (completed.length > 0) {
        const completionRate = Math.round((completed.length / tasks.length) * 100);
        if (completionRate >= 70) {
            insights.push(`Great job! You've completed ${completionRate}% of your tasks. Keep up the excellent work!`);
        } else if (completionRate >= 40) {
            insights.push(`You're making progress with ${completionRate}% completion rate. Keep going!`);
        } else {
            insights.push(`Your completion rate is ${completionRate}%. Focus on completing a few tasks each day to improve.`);
        }
    }
    
    if (pending.length === 0) {
        insights.push(`Amazing! You have no pending tasks. Enjoy your free time or plan ahead for upcoming projects.`);
    }
    
    if (insights.length === 0) {
        insights.push('Start adding tasks to get personalized insights and recommendations.');
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

// Import/Export
function exportToJSON() {
    const dataStr = JSON.stringify(tasks, null, 2);
    downloadFile(dataStr, 'tasks.json', 'application/json');
    showToast('Tasks exported to JSON', 'success');
}

function exportToCSV() {
    let csv = 'ID,Title,Description,Category,Priority,Due Date,Reminder,Repeat,Repeat Frequency,Tags,Completed,Created At\n';
    
    tasks.forEach(task => {
        csv += `"${task.id}","${escapeCSV(task.title)}","${escapeCSV(task.description)}","${task.category}","${task.priority}","${task.dueDate || ''}","${task.reminder || ''}","${task.repeat}","${task.repeatFrequency || ''}","${task.tags.join(';')}","${task.completed}","${task.createdAt}"\n`;
    });
    
    downloadFile(csv, 'tasks.csv', 'text/csv');
    showToast('Tasks exported to CSV', 'success');
}

function exportToExcel() {
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
        'Created At': task.createdAt
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, 'tasks.xlsx');
    
    showToast('Tasks exported to Excel', 'success');
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text('TaskMaster Pro - Tasks Report', 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 28);
    
    let y = 40;
    const lineHeight = 7;
    const pageHeight = doc.internal.pageSize.height;
    
    tasks.forEach((task, index) => {
        if (y > pageHeight - 20) {
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
    
    doc.save('tasks.pdf');
    showToast('Tasks exported to PDF', 'success');
}

function exportToGoogleCalendar() {
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TaskMaster Pro//EN\n';
    
    tasks.forEach(task => {
        if (task.dueDate) {
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
            icsContent += 'END:VEVENT\n';
        }
    });
    
    icsContent += 'END:VCALENDAR';
    
    downloadFile(icsContent, 'tasks.ics', 'text/calendar');
    showToast('Calendar file created. Import it into Google Calendar.', 'success');
}

function importFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            let importedTasks = [];
            
            if (file.name.endsWith('.json')) {
                importedTasks = JSON.parse(content);
            } else if (file.name.endsWith('.csv')) {
                importedTasks = parseCSV(content);
            } else if (file.name.endsWith('.xlsx')) {
                const workbook = XLSX.read(content, { type: 'binary' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                importedTasks = XLSX.utils.sheet_to_json(firstSheet);
                importedTasks = importedTasks.map(row => ({
                    id: Date.now().toString() + Math.random(),
                    title: row.Title || '',
                    description: row.Description || '',
                    category: row.Category || 'personal',
                    priority: row.Priority || 'medium',
                    dueDate: row['Due Date'] || null,
                    reminder: row.Reminder || null,
                    repeat: row.Repeat === 'Yes',
                    repeatFrequency: row['Repeat Frequency'] || null,
                    tags: row.Tags ? row.Tags.split(',').map(t => t.trim()) : [],
                    completed: row.Completed === 'Yes',
                    createdAt: row['Created At'] || new Date().toISOString()
                }));
            }
            
            if (Array.isArray(importedTasks) && importedTasks.length > 0) {
                // Merge with existing tasks (avoid duplicates by title)
                const existingTitles = new Set(tasks.map(t => t.title));
                const newTasks = importedTasks.filter(t => !existingTitles.has(t.title));
                
                tasks.push(...newTasks);
                saveTasks();
                renderTasks();
                showToast(`Imported ${newTasks.length} tasks successfully`, 'success');
            } else {
                showToast('No valid tasks found in file', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            showToast('Error importing file', 'error');
        }
    };
    
    if (file.name.endsWith('.xlsx')) {
        reader.readAsBinaryString(file);
    } else {
        reader.readAsText(file);
    }
    
    // Reset input
    event.target.value = '';
}

function parseCSV(content) {
    const lines = content.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const tasks = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        const task = {};
        
        headers.forEach((header, index) => {
            const value = values[index] ? values[index].replace(/"/g, '').trim() : '';
            
            switch (header) {
                case 'ID':
                    task.id = value || Date.now().toString();
                    break;
                case 'Title':
                    task.title = value;
                    break;
                case 'Description':
                    task.description = value;
                    break;
                case 'Category':
                    task.category = value || 'personal';
                    break;
                case 'Priority':
                    task.priority = value || 'medium';
                    break;
                case 'Due Date':
                    task.dueDate = value || null;
                    break;
                case 'Reminder':
                    task.reminder = value || null;
                    break;
                case 'Repeat':
                    task.repeat = value === 'true' || value === 'Yes';
                    break;
                case 'Repeat Frequency':
                    task.repeatFrequency = value || null;
                    break;
                case 'Tags':
                    task.tags = value ? value.split(';').map(t => t.trim()) : [];
                    break;
                case 'Completed':
                    task.completed = value === 'true' || value === 'Yes';
                    break;
                case 'Created At':
                    task.createdAt = value || new Date().toISOString();
                    break;
            }
        });
        
        if (task.title) {
            tasks.push(task);
        }
    }
    
    return tasks;
}

// Storage
function saveTasks() {
    localStorage.setItem('taskmaster_tasks', JSON.stringify(tasks));
}

function loadTasks() {
    const saved = localStorage.getItem('taskmaster_tasks');
    if (saved) {
        tasks = JSON.parse(saved);
        renderTasks();
    }
}

// Utility Functions
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    
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
    link.click();
    URL.revokeObjectURL(url);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeCSV(text) {
    if (!text) return '';
    return text.replace(/"/g, '""');
}

function escapeICS(text) {
    if (!text) return '';
    return text.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const taskDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    const diffDays = Math.floor((taskDate - today) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Tomorrow ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === -1) return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatICSDate(date) {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function getPriorityNumber(priority) {
    const map = { low: 9, medium: 5, high: 3, urgent: 1 };
    return map[priority] || 5;
}

// Information Pages
function showAbout() {
    alert('TaskMaster Pro v1.0\n\nA comprehensive task management application with AI-powered insights.\n\nDeveloped by Santosh Phuyal');
}

function showHelp() {
    alert('Help:\n\n1. Quick Add: Type task title and press Enter\n2. Advanced Add: Click the sliders icon for more options\n3. Complete Task: Click the checkbox\n4. Edit Task: Click the edit icon\n5. Delete Task: Click the trash icon\n6. View Insights: Click the chart icon in header\n7. Export/Import: Access from Settings\n8. Set PIN: Enable from Settings for app protection');
}

function showPrivacy() {
    alert('Privacy Policy:\n\nAll your data is stored locally on your device. No data is sent to external servers. Your tasks and settings remain private and under your control.');
}

// Request notification permission on load
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}