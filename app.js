// *** IndexedDB Setup ***
let db;
const DB_NAME = 'TaskMasterDB';
const TASK_STORE = 'tasks';
const SETTINGS_STORE = 'settings';

async function initDB() {
    db = await idb.openDB(DB_NAME, 1, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(TASK_STORE)) {
                const taskStore = db.createObjectStore(TASK_STORE, { keyPath: 'id' });
                taskStore.createIndex('category', 'category');
                taskStore.createIndex('completed', 'completed');
                taskStore.createIndex('priority', 'priority');
                taskStore.createIndex('dueDate', 'dueDate');
                taskStore.createIndex('order', 'order');
                taskStore.createIndex('parentId', 'parentId');
            }
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
let currentSort = 'order';
let currentSearch = '';
let settings = {
    id: 'main-settings',
    defaultCategory: 'personal',
    defaultPriority: 'medium',
    defaultReminderHours: 2,
    pinEnabled: false,
    pin: null,
    theme: 'light',
    focusMode: false, // *** NEW
    showArchived: false // *** NEW
};
let pendingImportData = null;
let lastFocusedElement = null;
let collapsedTasks = new Set();
let quickFilters = { // *** NEW: Quick filter state
    priorities: new Set(),
    tags: new Set(),
    dueDateRange: null
};
let currentView = 'list'; // *** NEW: 'list' or 'matrix'

// *** NEW: Collapsed state ***
function loadCollapsedState() {
    try {
        const saved = localStorage.getItem('collapsedTasks');
        if (saved) {
            collapsedTasks = new Set(JSON.parse(saved));
        }
    } catch (e) {
        console.error("Error loading collapsed state:", e);
        collapsedTasks = new Set();
    }
}

function saveCollapsedState() {
    try {
        localStorage.setItem('collapsedTasks', JSON.stringify([...collapsedTasks]));
    } catch (e) {
        console.error("Error saving collapsed state:", e);
    }
}

function toggleCollapseTask(taskId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    if (collapsedTasks.has(taskId)) {
        collapsedTasks.delete(taskId);
    } else {
        collapsedTasks.add(taskId);
    }
    
    saveCollapsedState();
    renderTasks();
}

// *** NEW: Subtask stats ***
function getSubtaskStats(taskId) {
    const allSubtasks = tasks.filter(t => t.parentId === taskId);
    if (allSubtasks.length === 0) return null;
    
    const completed = allSubtasks.filter(t => t.completed).length;
    const total = allSubtasks.length;
    const percentage = Math.round((completed / total) * 100);
    
    return { completed, total, percentage };
}

// *** NEW: Due date status ***
function getDueDateClass(dueDate) {
    if (!dueDate) return '';
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffMs = due.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    
    if (diffMs < 0) return 'overdue';
    if (diffHours < 24) return 'due-soon';
    if (diffHours < 72) return 'due-upcoming';
    
    return '';
}

// *** NEW: Tab badges ***
function updateTabBadges() {
    const pendingTasks = tasks.filter(t => !t.completed && !t.archived);
    
    const counts = {
        all: tasks.filter(t => !t.archived).length,
        personal: pendingTasks.filter(t => t.category === 'personal').length,
        office: pendingTasks.filter(t => t.category === 'office').length,
        misc: pendingTasks.filter(t => t.category === 'misc').length,
        recurring: pendingTasks.filter(t => t.repeat).length,
        completed: tasks.filter(t => t.completed && !t.archived).length
    };
    
    Object.keys(counts).forEach(key => {
        const badge = document.getElementById(`badge-${key}`);
        if (badge) {
            badge.textContent = counts[key];
            badge.style.display = counts[key] > 0 ? 'inline-block' : 'none';
        }
    });
}

// *** ENHANCED: AI Insights with more intelligence ***
function generateEnhancedAIInsights(tasks) {
    const insights = [];
    const activeTasks = tasks.filter(t => !t.archived);
    const pending = activeTasks.filter(t => !t.completed);
    const completed = activeTasks.filter(t => t.completed);
    
    // Priority insights
    const urgent = pending.filter(t => t.priority === 'urgent');
    const high = pending.filter(t => t.priority === 'high');
    
    if (urgent.length > 0) {
        insights.push({
            type: 'warning',
            icon: 'fa-exclamation-triangle',
            message: `${urgent.length} urgent task${urgent.length > 1 ? 's require' : ' requires'} immediate attention!`,
            action: () => {
                quickFilters.priorities.clear();
                quickFilters.priorities.add('urgent');
                applyQuickFilters();
            },
            actionLabel: 'Show Urgent'
        });
    }
    
    // Overdue insights
    const now = new Date();
    const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < now);
    if (overdue.length > 0) {
        insights.push({
            type: 'danger',
            icon: 'fa-clock',
            message: `${overdue.length} task${overdue.length > 1 ? 's are' : ' is'} overdue. Time to catch up!`,
            action: () => {
                setSortOption('dueDate');
                filterTasks('all');
            },
            actionLabel: 'Sort by Date'
        });
    }
    
    // Today's tasks
    const today = new Date().toDateString();
    const dueToday = pending.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
    });
    
    if (dueToday.length > 0) {
        insights.push({
            type: 'info',
            icon: 'fa-calendar-day',
            message: `${dueToday.length} task${dueToday.length > 1 ? 's' : ''} due today. Let's get them done!`,
            action: () => toggleFocusMode(),
            actionLabel: 'Focus Mode'
        });
    }
    
    // Productivity trends
    const last7Days = completed.filter(t => {
        if (!t.completedAt) return false;
        const completedDate = new Date(t.completedAt);
        const daysDiff = (now - completedDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
    });
    
    if (last7Days.length >= 5) {
        insights.push({
            type: 'success',
            icon: 'fa-trophy',
            message: `Great momentum! You completed ${last7Days.length} tasks in the last 7 days.`,
            action: () => showInsights(),
            actionLabel: 'View Stats'
        });
    } else if (completed.length > 0 && last7Days.length === 0) {
        insights.push({
            type: 'warning',
            icon: 'fa-chart-line',
            message: `No tasks completed recently. Time to make progress!`,
            action: () => {
                setSortOption('priority');
                filterTasks('all');
            },
            actionLabel: 'Prioritize'
        });
    }
    
    // Workload balance
    const byCategory = {
        personal: pending.filter(t => t.category === 'personal').length,
        office: pending.filter(t => t.category === 'office').length,
        misc: pending.filter(t => t.category === 'misc').length
    };
    
    const maxCat = Math.max(...Object.values(byCategory));
    const imbalanced = maxCat > 10 && maxCat > (pending.length * 0.7);
    
    if (imbalanced) {
        const heavyCat = Object.keys(byCategory).find(k => byCategory[k] === maxCat);
        insights.push({
            type: 'info',
            icon: 'fa-balance-scale',
            message: `Your ${heavyCat} tasks are piling up (${maxCat}). Consider delegating or prioritizing.`,
            action: () => filterTasks(heavyCat),
            actionLabel: `View ${capitalize(heavyCat)}`
        });
    }
    
    // Time estimate warnings
    const withEstimates = pending.filter(t => t.estimatedMinutes);
    if (withEstimates.length > 0) {
        const totalMinutes = withEstimates.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
        const totalHours = Math.round(totalMinutes / 60 * 10) / 10;
        
        if (totalHours > 40) {
            insights.push({
                type: 'warning',
                icon: 'fa-hourglass-half',
                message: `${totalHours} hours of estimated work ahead. Break it into smaller chunks!`,
                action: () => setSortOption('dueDate'),
                actionLabel: 'Plan Schedule'
            });
        }
    }
    
    // Completion rate
    if (activeTasks.length > 0) {
        const completionRate = Math.round((completed.length / activeTasks.length) * 100);
        if (completionRate >= 70) {
            insights.push({
                type: 'success',
                icon: 'fa-star',
                message: `Outstanding! ${completionRate}% completion rate. You're crushing it! 🎉`,
                action: () => showInsights(),
                actionLabel: 'Celebrate'
            });
        }
    }
    
    // No pending tasks
    if (pending.length === 0 && activeTasks.length > 0) {
        insights.push({
            type: 'success',
            icon: 'fa-check-double',
            message: `All caught up! No pending tasks. Time to relax or plan ahead.`,
            action: () => openAdvancedForm(),
            actionLabel: 'Add New Task'
        });
    }
    
    // Default message
    if (insights.length === 0 && activeTasks.length > 0) {
        insights.push({
            type: 'info',
            icon: 'fa-lightbulb',
            message: 'Your task list is well-balanced. Keep up the good work!',
            action: null,
            actionLabel: null
        });
    }
    
    if (activeTasks.length === 0) {
        insights.push({
            type: 'info',
            icon: 'fa-inbox',
            message: 'No tasks yet. Start by adding your first task!',
            action: () => openAdvancedForm(),
            actionLabel: 'Add Task'
        });
    }
    
    return insights;
}

// *** NEW: Render Enhanced AI Dashboard ***
function renderAIDashboard() {
    const container = document.getElementById('aiDashboard');
    if (!container) return;
    
    const activeTasks = tasks.filter(t => !t.archived);
    const pending = activeTasks.filter(t => !t.completed);
    const completed = activeTasks.filter(t => t.completed);
    const insights = generateEnhancedAIInsights(tasks);
    
    // Calculate metrics
    const now = new Date();
    const today = new Date().toDateString();
    const overdue = pending.filter(t => t.dueDate && new Date(t.dueDate) < now);
    const dueToday = pending.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
    });
    
    const urgent = pending.filter(t => t.priority === 'urgent');
    const completionRate = activeTasks.length > 0 ? Math.round((completed.length / activeTasks.length) * 100) : 0;
    
    // Calculate productivity score (0-100)
    let productivityScore = 50; // Base score
    if (overdue.length === 0) productivityScore += 15;
    if (urgent.length === 0) productivityScore += 10;
    if (completionRate > 70) productivityScore += 25;
    else if (completionRate > 40) productivityScore += 15;
    if (dueToday.length > 0 && dueToday.length <= 5) productivityScore += 10;
    productivityScore = Math.min(100, productivityScore);
    
    const scoreClass = productivityScore >= 80 ? 'excellent' : productivityScore >= 60 ? 'good' : productivityScore >= 40 ? 'fair' : 'needs-improvement';
    
    // Top insight
    const topInsight = insights[0] || {
        type: 'info',
        icon: 'fa-lightbulb',
        message: 'All systems operational',
        action: null,
        actionLabel: null
    };
    
    container.innerHTML = `
        <div class="ai-dashboard-grid">
            <div class="ai-metric-card productivity-score ${scoreClass}">
                <div class="metric-icon">
                    <i class="fas fa-tachometer-alt"></i>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${productivityScore}</div>
                    <div class="metric-label">Productivity Score</div>
                    <div class="metric-subtext">${scoreClass.replace('-', ' ')}</div>
                </div>
            </div>
            
            <div class="ai-metric-card ${overdue.length > 0 ? 'alert' : ''}">
                <div class="metric-icon">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${overdue.length}</div>
                    <div class="metric-label">Overdue</div>
                    ${overdue.length > 0 ? '<div class="metric-subtext">needs attention</div>' : '<div class="metric-subtext">on track</div>'}
                </div>
            </div>
            
            <div class="ai-metric-card ${dueToday.length > 0 ? 'highlight' : ''}">
                <div class="metric-icon">
                    <i class="fas fa-calendar-day"></i>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${dueToday.length}</div>
                    <div class="metric-label">Due Today</div>
                    <div class="metric-subtext">${dueToday.length > 0 ? 'focus now' : 'clear day'}</div>
                </div>
            </div>
            
            <div class="ai-metric-card ${urgent.length > 0 ? 'urgent' : ''}">
                <div class="metric-icon">
                    <i class="fas fa-fire"></i>
                </div>
                <div class="metric-content">
                    <div class="metric-value">${urgent.length}</div>
                    <div class="metric-label">Urgent Tasks</div>
                    <div class="metric-subtext">${urgent.length > 0 ? 'immediate action' : 'all good'}</div>
                </div>
            </div>
        </div>
        
        <div class="ai-insight-banner ${topInsight.type}">
            <div class="insight-icon">
                <i class="fas ${topInsight.icon}"></i>
            </div>
            <div class="insight-message">${topInsight.message}</div>
            ${topInsight.action ? `
                <button class="insight-action-btn" onclick="(${topInsight.action.toString()})()">
                    ${topInsight.actionLabel}
                </button>
            ` : ''}
        </div>
        
        ${insights.length > 1 ? `
            <div class="ai-more-insights">
                <button class="view-all-insights-btn" onclick="showAllInsights()">
                    <i class="fas fa-brain"></i> View All ${insights.length} Insights
                </button>
            </div>
        ` : ''}
    `;
}

// *** NEW: Show all insights modal ***
function showAllInsights() {
    lastFocusedElement = document.activeElement;
    const insights = generateEnhancedAIInsights(tasks);
    
    const content = `
        <div class="all-insights-container">
            ${insights.map(insight => `
                <div class="insight-item ${insight.type}">
                    <div class="insight-item-icon">
                        <i class="fas ${insight.icon}"></i>
                    </div>
                    <div class="insight-item-content">
                        <p>${insight.message}</p>
                        ${insight.action ? `
                            <button class="btn btn-sm btn-primary" onclick="closeInfoModal(); (${insight.action.toString()})();">
                                ${insight.actionLabel}
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    showInfoModal('<i class="fas fa-brain"></i> AI Insights & Recommendations', content);
}

// *** NEW: Quick Filters Panel ***
function renderQuickFilters() {
    const container = document.getElementById('quickFiltersPanel');
    if (!container) return;
    
    const activeTasks = tasks.filter(t => !t.archived && !t.completed);
    
    // Get all unique tags
    const allTags = new Set();
    activeTasks.forEach(t => {
        if (t.tags) t.tags.forEach(tag => allTags.add(tag));
    });
    
    const hasActiveFilters = quickFilters.priorities.size > 0 || quickFilters.tags.size > 0 || quickFilters.dueDateRange;
    
    container.innerHTML = `
        <div class="quick-filters-header">
            <span><i class="fas fa-filter"></i> Quick Filters</span>
            ${hasActiveFilters ? `
                <button class="clear-filters-btn" onclick="clearQuickFilters()">
                    <i class="fas fa-times"></i> Clear All
                </button>
            ` : ''}
        </div>
        
        <div class="filter-section">
            <div class="filter-label">Priority</div>
            <div class="filter-chips">
                ${['urgent', 'high', 'medium', 'low'].map(p => `
                    <button class="filter-chip priority-${p} ${quickFilters.priorities.has(p) ? 'active' : ''}"
                            onclick="togglePriorityFilter('${p}')">
                        <i class="fas fa-flag"></i> ${capitalize(p)}
                    </button>
                `).join('')}
            </div>
        </div>
        
        ${allTags.size > 0 ? `
            <div class="filter-section">
                <div class="filter-label">Tags</div>
                <div class="filter-chips">
                    ${[...allTags].slice(0, 6).map(tag => `
                        <button class="filter-chip ${quickFilters.tags.has(tag) ? 'active' : ''}"
                                onclick="toggleTagFilter('${escapeHtml(tag)}')">
                            #${escapeHtml(tag)}
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <div class="filter-section">
            <div class="filter-label">Due Date</div>
            <div class="filter-chips">
                <button class="filter-chip ${quickFilters.dueDateRange === 'overdue' ? 'active' : ''}"
                        onclick="toggleDueDateFilter('overdue')">
                    <i class="fas fa-exclamation-circle"></i> Overdue
                </button>
                <button class="filter-chip ${quickFilters.dueDateRange === 'today' ? 'active' : ''}"
                        onclick="toggleDueDateFilter('today')">
                    <i class="fas fa-calendar-day"></i> Today
                </button>
                <button class="filter-chip ${quickFilters.dueDateRange === 'week' ? 'active' : ''}"
                        onclick="toggleDueDateFilter('week')">
                    <i class="fas fa-calendar-week"></i> This Week
                </button>
            </div>
        </div>
    `;
}

function togglePriorityFilter(priority) {
    if (quickFilters.priorities.has(priority)) {
        quickFilters.priorities.delete(priority);
    } else {
        quickFilters.priorities.add(priority);
    }
    applyQuickFilters();
}

function toggleTagFilter(tag) {
    if (quickFilters.tags.has(tag)) {
        quickFilters.tags.delete(tag);
    } else {
        quickFilters.tags.add(tag);
    }
    applyQuickFilters();
}

function toggleDueDateFilter(range) {
    if (quickFilters.dueDateRange === range) {
        quickFilters.dueDateRange = null;
    } else {
        quickFilters.dueDateRange = range;
    }
    applyQuickFilters();
}

function clearQuickFilters() {
    quickFilters.priorities.clear();
    quickFilters.tags.clear();
    quickFilters.dueDateRange = null;
    applyQuickFilters();
}

function applyQuickFilters() {
    renderQuickFilters();
    renderTasks();
}

// *** NEW: Focus Mode ***
function toggleFocusMode() {
    settings.focusMode = !settings.focusMode;
    saveSettings();
    
    document.body.classList.toggle('focus-mode', settings.focusMode);
    
    const btn = document.getElementById('focusModeBtn');
    if (btn) {
        btn.innerHTML = settings.focusMode 
            ? '<i class="fas fa-eye-slash"></i> Exit Focus' 
            : '<i class="fas fa-bullseye"></i> Focus Mode';
        btn.classList.toggle('active', settings.focusMode);
    }
    
    renderTasks();
    showToast(settings.focusMode ? 'Focus Mode ON - Showing only priority tasks' : 'Focus Mode OFF', 'info');
}

// *** NEW: Task Cloning ***
function cloneTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const now = Date.now();
    const clonedTask = {
        ...task,
        id: now.toString(),
        title: task.title + ' (Copy)',
        completed: false,
        completedAt: null,
        createdAt: new Date(now).toISOString(),
        order: now,
        previousInstanceId: null
    };
    
    tasks.push(clonedTask);
    saveTasks();
    renderTasks();
    showToast('Task cloned successfully', 'success');
}

// *** NEW: Archive Task ***
async function archiveTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    task.archived = true;
    task.archivedAt = new Date().toISOString();
    
    await saveTasks();
    renderTasks();
    renderAIDashboard();
    showToast('Task archived', 'success');
}

// *** NEW: Batch Edit ***
function openBatchEdit() {
    if (selectedTasks.size === 0) {
        showToast('No tasks selected', 'info');
        return;
    }
    
    lastFocusedElement = document.activeElement;
    
    const content = `
        <div class="batch-edit-form">
            <p>Editing ${selectedTasks.size} selected task(s)</p>
            
            <div class="form-group">
                <label>Change Category</label>
                <select id="batchCategory" class="form-control">
                    <option value="">-- No Change --</option>
                    <option value="personal">Personal</option>
                    <option value="office">Office</option>
                    <option value="misc">Misc Work</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Change Priority</label>
                <select id="batchPriority" class="form-control">
                    <option value="">-- No Change --</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>
            
            <div class="form-group">
                <label>Add Tag</label>
                <input type="text" id="batchAddTag" class="form-control" placeholder="tag name">
            </div>
            
            <div class="form-group">
                <button class="btn btn-primary" onclick="applyBatchEdit()">
                    <i class="fas fa-check"></i> Apply Changes
                </button>
                <button class="btn btn-secondary" onclick="closeInfoModal()">Cancel</button>
            </div>
        </div>
    `;
    
    showInfoModal('<i class="fas fa-edit"></i> Batch Edit Tasks', content);
}

async function applyBatchEdit() {
    const category = document.getElementById('batchCategory').value;
    const priority = document.getElementById('batchPriority').value;
    const addTag = document.getElementById('batchAddTag').value.trim();
    
    let changesCount = 0;
    
    selectedTasks.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        if (category) {
            task.category = category;
            changesCount++;
        }
        if (priority) {
            task.priority = priority;
            changesCount++;
        }
        if (addTag && !task.tags.includes(addTag)) {
            task.tags.push(addTag);
            changesCount++;
        }
    });
    
    if (changesCount > 0) {
        await saveTasks();
        renderTasks();
        renderAIDashboard();
        closeInfoModal();
        selectedTasks.clear();
        showToast(`Updated ${selectedTasks.size} tasks`, 'success');
    } else {
        showToast('No changes applied', 'info');
    }
}

// *** NEW: View Toggle (List/Matrix) ***
function toggleView(view) {
    currentView = view;
    
    document.querySelectorAll('.view-toggle-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const btn = document.querySelector(`[data-view="${view}"]`);
    if (btn) btn.classList.add('active');
    
    renderTasks();
}

// *** NEW: Eisenhower Matrix View ***
function renderEisenhowerMatrix() {
    const container = document.getElementById('tasksContainer');
    const activeTasks = getFilteredTasks();
    
    const matrix = {
        urgentImportant: activeTasks.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high') && t.dueDate && getDueDateClass(t.dueDate) !== ''),
        notUrgentImportant: activeTasks.filter(t => !t.completed && (t.priority === 'urgent' || t.priority === 'high') && (!t.dueDate || getDueDateClass(t.dueDate) === '')),
        urgentNotImportant: activeTasks.filter(t => !t.completed && (t.priority === 'medium' || t.priority === 'low') && t.dueDate && getDueDateClass(t.dueDate) !== ''),
        notUrgentNotImportant: activeTasks.filter(t => !t.completed && (t.priority === 'medium' || t.priority === 'low') && (!t.dueDate || getDueDateClass(t.dueDate) === ''))
    };
    
    container.innerHTML = `
        <div class="eisenhower-matrix">
            <div class="matrix-quadrant urgent-important">
                <div class="quadrant-header">
                    <h3><i class="fas fa-fire"></i> Do First</h3>
                    <span class="quadrant-subtitle">Urgent & Important</span>
                </div>
                <div class="quadrant-tasks">
                    ${matrix.urgentImportant.map(t => renderMatrixTask(t)).join('') || '<p class="empty-quadrant">No tasks</p>'}
                </div>
            </div>
            
            <div class="matrix-quadrant not-urgent-important">
                <div class="quadrant-header">
                    <h3><i class="fas fa-calendar-alt"></i> Schedule</h3>
                    <span class="quadrant-subtitle">Not Urgent but Important</span>
                </div>
                <div class="quadrant-tasks">
                    ${matrix.notUrgentImportant.map(t => renderMatrixTask(t)).join('') || '<p class="empty-quadrant">No tasks</p>'}
                </div>
            </div>
            
            <div class="matrix-quadrant urgent-not-important">
                <div class="quadrant-header">
                    <h3><i class="fas fa-user-friends"></i> Delegate</h3>
                    <span class="quadrant-subtitle">Urgent but Not Important</span>
                </div>
                <div class="quadrant-tasks">
                    ${matrix.urgentNotImportant.map(t => renderMatrixTask(t)).join('') || '<p class="empty-quadrant">No tasks</p>'}
                </div>
            </div>
            
            <div class="matrix-quadrant not-urgent-not-important">
                <div class="quadrant-header">
                    <h3><i class="fas fa-trash-alt"></i> Eliminate</h3>
                    <span class="quadrant-subtitle">Not Urgent & Not Important</span>
                </div>
                <div class="quadrant-tasks">
                    ${matrix.notUrgentNotImportant.map(t => renderMatrixTask(t)).join('') || '<p class="empty-quadrant">No tasks</p>'}
                </div>
            </div>
        </div>
    `;
}

function renderMatrixTask(task) {
    return `
        <div class="matrix-task" data-task-id="${task.id}">
            <div class="matrix-task-header">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} 
                       onchange="toggleTask('${task.id}')">
                <span class="matrix-task-title">${escapeHtml(task.title)}</span>
            </div>
            ${task.dueDate ? `<div class="matrix-task-due">${formatDate(task.dueDate)}</div>` : ''}
            <div class="matrix-task-actions">
                <button class="task-btn-sm" onclick="editTask('${task.id}')" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
            </div>
        </div>
    `;
}

// Initialize App
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await initDB();
        await loadSettings();
        await loadTasks();
        loadCollapsedState();
        
        applyTheme();
        checkPinProtection();
        setupEventListeners();
        checkReminders();
        renderAIDashboard(); // *** NEW
        renderAISummary();
        renderQuickFilters(); // *** NEW
        
        handleHashChange();
        
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('action') === 'add-task') {
            openAdvancedForm();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
        
        setInterval(checkReminders, 60000);
        
        // *** NEW: Update dashboard every minute ***
        setInterval(() => {
            renderAIDashboard();
        }, 60000);
        
    } catch (error) {
        console.error("Failed to initialize the app:", error);
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

    const aiSummaryHeader = document.querySelector('.ai-summary-header');
    if (aiSummaryHeader) {
        aiSummaryHeader.addEventListener('click', toggleAISummary);
    }
    
    document.getElementById('sortSelect').addEventListener('change', (e) => setSortOption(e.target.value));
    
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase();
            if(clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !currentSearch);
            renderTasks();
        });
    }
    
    window.addEventListener('hashchange', handleHashChange);
}

function handleHashChange() {
    let hash = window.location.hash.substring(1);
    if (!hash) {
        hash = 'all';
    }
    
    const validFilters = ['all', 'personal', 'office', 'misc', 'recurring', 'completed'];
    if (validFilters.includes(hash)) {
        currentFilter = hash;
    } else {
        currentFilter = 'all';
        window.location.hash = 'all';
    }
    
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));
    
    const tabToActive = [...tabs].find(tab => tab.onclick && tab.onclick.toString().includes(`'${currentFilter}'`));
    if (tabToActive) {
        tabToActive.classList.add('active');
    }
    
    renderTasks();
}

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
        saveSettings();
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
    saveSettings();
}

function applyTheme() {
    document.documentElement.setAttribute('data-theme', settings.theme);
    const icon = document.getElementById('themeIcon');
    if(icon) {
        icon.className = settings.theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Task Management - ENHANCED Quick Add
async function quickAddTask() {
    const input = document.getElementById('quickTaskInput');
    let title = input.value.trim();
    
    if (!title) return;
    
    let category = settings.defaultCategory;
    const categoryMatch = title.match(/@(personal|office|misc)/i);
    if (categoryMatch) {
        category = categoryMatch[1].toLowerCase();
        title = title.replace(categoryMatch[0], '').trim();
    }
    
    let priority = settings.defaultPriority;
    const priorityMatch = title.match(/!(urgent|high|medium|low)/i);
    if (priorityMatch) {
        priority = priorityMatch[1].toLowerCase();
        title = title.replace(priorityMatch[0], '').trim();
    }
    
    const tags = [];
    const tagMatches = title.matchAll(/#(\w+)/g);
    for (const match of tagMatches) {
        tags.push(match[1]);
        title = title.replace(match[0], '').trim();
    }
    
    // *** NEW: Parse time estimate (e.g., "30m" or "2h") ***
    let estimatedMinutes = null;
    const timeMatch = title.match(/(\d+)(m|h)/i);
    if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        estimatedMinutes = unit === 'h' ? value * 60 : value;
        title = title.replace(timeMatch[0], '').trim();
    }
    
    const now = Date.now();
    
    const task = {
        id: now.toString(),
        title: title,
        description: '',
        category: category,
        priority: priority,
        dueDate: null,
        reminder: null,
        repeat: false,
        repeatFrequency: null,
        tags: tags,
        completed: false,
        createdAt: new Date(now).toISOString(),
        order: now,
        parentId: null,
        estimatedMinutes: estimatedMinutes, // *** NEW
        archived: false // *** NEW
    };
    
    tasks.push(task);
    await saveTasks();
    renderTasks();
    renderAIDashboard();
    renderAISummary(); 
    input.value = '';
    
    if (categoryMatch || priorityMatch || tags.length > 0 || timeMatch) {
        showToast('Task added with parsed attributes!', 'success');
    } else {
        showToast('Task added! Try @category !priority #tag 30m', 'success');
    }
}

function openAdvancedForm() {
    lastFocusedElement = document.activeElement;
    
    currentEditingTask = null;
    document.getElementById('modalTitle').textContent = 'Add New Task';
    document.getElementById('taskForm').reset();
    document.getElementById('taskId').value = '';
    document.getElementById('taskParentId').value = '';
    document.getElementById('taskCategory').value = settings.defaultCategory;
    document.getElementById('taskPriority').value = settings.defaultPriority;
    
    // *** NEW: Reset time estimate field ***
    const estimateField = document.getElementById('taskEstimate');
    if (estimateField) estimateField.value = '';
    
    document.getElementById('taskModal').classList.remove('hidden');
    
    setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

function openSubtaskForm(parentId) {
    openAdvancedForm();
    document.getElementById('modalTitle').textContent = 'Add New Subtask';
    document.getElementById('taskParentId').value = parentId;
    
    const parentTask = tasks.find(t => t.id === parentId);
    if (parentTask) {
        document.getElementById('taskCategory').value = parentTask.category;
        document.getElementById('taskPriority').value = parentTask.priority;
    }
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.add('hidden');
    currentEditingTask = null;
    
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
    const parentId = document.getElementById('taskParentId').value || null;
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
    
    // *** NEW: Get time estimate ***
    const estimateField = document.getElementById('taskEstimate');
    const estimatedMinutes = estimateField ? parseInt(estimateField.value) || null : null;
    
    if (!title) {
        showToast('Task title is required', 'error');
        return;
    }

    if (taskId) {
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
            task.parentId = parentId;
            task.estimatedMinutes = estimatedMinutes; // *** NEW
        }
        showToast('Task updated successfully', 'success');
    } else {
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
            order: now,
            parentId: parentId,
            estimatedMinutes: estimatedMinutes, // *** NEW
            archived: false // *** NEW
        };
        tasks.push(task);
        showToast('Task added successfully', 'success');
    }
    
    await saveTasks();
    renderTasks();
    renderAIDashboard();
    renderAISummary(); 
    closeTaskModal();
}

function editTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    
    lastFocusedElement = document.activeElement;
    
    currentEditingTask = task;
    document.getElementById('modalTitle').textContent = 'Edit Task';
    document.getElementById('taskId').value = task.id;
    document.getElementById('taskParentId').value = task.parentId || '';
    document.getElementById('taskTitle').value = task.title;
    document.getElementById('taskDescription').value = task.description || '';
    document.getElementById('taskCategory').value = task.category;
    document.getElementById('taskPriority').value = task.priority;
    document.getElementById('taskDueDate').value = task.dueDate || '';
    document.getElementById('taskReminder').value = task.reminder || '';
    document.getElementById('taskRepeat').checked = task.repeat;
    document.getElementById('taskTags').value = task.tags.join(', ');
    
    // *** NEW: Set time estimate ***
    const estimateField = document.getElementById('taskEstimate');
    if (estimateField) {
        estimateField.value = task.estimatedMinutes || '';
    }
    
    if (task.repeat) {
        document.getElementById('repeatOptions').classList.remove('hidden');
        document.getElementById('repeatFrequency').value = task.repeatFrequency || 'daily';
    }
    
    document.getElementById('taskModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('taskTitle').focus(), 100);
}

async function deleteTask(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const nextInstance = tasks.find(t => t.previousInstanceId === taskId);
    if (nextInstance) {
        showInfoModal('Deletion Blocked', 'Cannot delete this completed recurring task because its next instance has already been created. Please delete the pending instance first.');
        return;
    }
    
    const tasksToDelete = [taskId];
    const findChildren = (parentId) => {
        const children = tasks.filter(t => t.parentId === parentId);
        children.forEach(child => {
            tasksToDelete.push(child.id);
            findChildren(child.id);
        });
    };
    findChildren(taskId);
    
    const message = tasksToDelete.length > 1 ?
        `Are you sure you want to delete this task and its ${tasksToDelete.length - 1} subtask(s)?` :
        'Are you sure you want to delete this task?';

    showConfirmModal('Confirm Deletion', message, async () => {
        tasks = tasks.filter(t => !tasksToDelete.includes(t.id));
        await saveTasks();
        
        tasksToDelete.forEach(id => selectedTasks.delete(id));
        
        renderTasks();
        renderAIDashboard();
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

    if (!isChecked) {
        currentTaskIds.forEach(id => selectedTasks.delete(id));
    }
    
    updateBulkActionUI();
}

function deleteSelectedTasks() {
     if (selectedTasks.size === 0) {
        showToast('No tasks selected for deletion.', 'info');
        return;
    }
    
    const finalTasksToDelete = new Set(selectedTasks);
    const findChildren = (parentId) => {
        const children = tasks.filter(t => t.parentId === parentId);
        children.forEach(child => {
            finalTasksToDelete.add(child.id);
            findChildren(child.id);
        });
    };
    [...selectedTasks].forEach(taskId => findChildren(taskId));
    
    const count = finalTasksToDelete.size;
    const message = count > selectedTasks.size ?
        `Are you sure you want to delete ${selectedTasks.size} selected task(s) and their subtasks (total ${count})?` :
        `Are you sure you want to delete ${count} selected task(s)?`;

    showConfirmModal('Confirm Bulk Deletion', message, async () => {
        const tasksToDeleteArr = Array.from(finalTasksToDelete);
        let nextInstanceCount = 0;
        
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
             await saveTasks();
             renderTasks();
             renderAIDashboard();
             return;
        }

        tasks = tasks.filter(t => !finalTasksToDelete.has(t.id));
        selectedTasks = new Set();
        await saveTasks();
        renderTasks();
        renderAIDashboard();
        renderAISummary();
        showToast('Selected tasks deleted successfully', 'success');
    });
}

async function clearAllTasks() {
    showConfirmModal('Confirm Clear All', 'Are you sure you want to delete ALL tasks permanently? This cannot be undone.', async () => {
        tasks = [];
        selectedTasks = new Set();
        await saveTasks();
        renderTasks();
        renderAIDashboard();
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
    
    // *** NEW: Show batch edit button ***
    const batchEditBtn = document.getElementById('batchEditBtn');
    if (batchEditBtn) {
        batchEditBtn.style.display = count > 0 ? 'inline-block' : 'none';
    }
    
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
            newTask.order = Date.now();

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
    
    await saveTasks();
    renderTasks();
    renderAIDashboard();
    renderAISummary(); 
}

function filterTasks(filter) {
    window.location.hash = filter;
}

function setSortOption(sortKey) {
    currentSort = sortKey;
    document.getElementById('sortSelect').value = currentSort;
    renderTasks();
}

// *** ENHANCED: Get filtered tasks with quick filters and focus mode ***
function getFilteredTasks() {
    let processedTasks = tasks.filter(t => !t.archived || settings.showArchived);
    
    // Apply search
    let searchedTaskIds = new Set();
    if (currentSearch) {
        const searchMatches = processedTasks.filter(t => 
            t.title.toLowerCase().includes(currentSearch) ||
            (t.description && t.description.toLowerCase().includes(currentSearch)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(currentSearch)))
        );
        
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
    
    // Apply tab filter
    let filteredTasks = [];
    if (currentSearch) {
        filteredTasks = processedTasks;
    } else if (currentFilter === 'all') {
        filteredTasks = processedTasks;
    } else if (currentFilter === 'completed') {
        filteredTasks = processedTasks.filter(t => t.completed);
    } else if (currentFilter === 'recurring') {
        filteredTasks = processedTasks.filter(t => !t.completed && t.repeat);
    } else {
        filteredTasks = processedTasks.filter(t => 
            !t.completed && 
            !t.repeat && 
            t.category === currentFilter
        );
    }
    
    // *** NEW: Apply quick filters ***
    if (quickFilters.priorities.size > 0) {
        filteredTasks = filteredTasks.filter(t => quickFilters.priorities.has(t.priority));
    }
    
    if (quickFilters.tags.size > 0) {
        filteredTasks = filteredTasks.filter(t => 
            t.tags && t.tags.some(tag => quickFilters.tags.has(tag))
        );
    }
    
    if (quickFilters.dueDateRange) {
        const now = new Date();
        const today = new Date().toDateString();
        const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        
        filteredTasks = filteredTasks.filter(t => {
            if (!t.dueDate) return false;
            const due = new Date(t.dueDate);
            
            if (quickFilters.dueDateRange === 'overdue') {
                return due < now && !t.completed;
            } else if (quickFilters.dueDateRange === 'today') {
                return due.toDateString() === today && !t.completed;
            } else if (quickFilters.dueDateRange === 'week') {
                return due >= now && due <= weekEnd && !t.completed;
            }
            return true;
        });
    }
    
    // *** NEW: Apply focus mode ***
    if (settings.focusMode) {
        const now = new Date();
        const today = new Date().toDateString();
        
        filteredTasks = filteredTasks.filter(t => {
            if (t.completed) return false;
            
            // Show if urgent/high priority
            if (t.priority === 'urgent' || t.priority === 'high') return true;
            
            // Show if due today or overdue
            if (t.dueDate) {
                const due = new Date(t.dueDate);
                if (due.toDateString() === today || due < now) return true;
            }
            
            return false;
        });
    }
    
    return filteredTasks;
}

// *** ENHANCED: renderTasks ***
function renderTasks() {
    const container = document.getElementById('tasksContainer');
    const bulkActionsContainer = document.getElementById('bulkActionsContainer');
    
    // *** NEW: Check view mode ***
    if (currentView === 'matrix') {
        renderEisenhowerMatrix();
        bulkActionsContainer.classList.add('hidden');
        return;
    }
    
    const filteredTasks = getFilteredTasks();

    // Build task tree
    const taskMap = new Map(filteredTasks.map(task => [task.id, { ...task, children: [] }]));
    const taskTree = [];
    
    for (const task of taskMap.values()) {
        if (task.parentId && taskMap.has(task.parentId)) {
            taskMap.get(task.parentId).children.push(task);
        } else {
            taskTree.push(task);
        }
    }
    
    // Sort with completed last
    const sortTasksWithCompletedLast = (taskList) => {
        const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
        
        taskList.sort((a, b) => {
            if (a.completed !== b.completed) {
                return a.completed ? 1 : -1;
            }
            
            let comparison = 0;

            switch (currentSort) {
                case 'priority':
                    comparison = priorityOrder[a.priority] - priorityOrder[b.priority];
                    break;
                case 'dueDate':
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
                    comparison = new Date(b.createdAt) - new Date(a.createdAt);
                    break;
            }
            
            if (comparison !== 0) return comparison;
            return (a.order || 0) - (b.order || 0);
        });
        
        taskList.forEach(task => {
            if (task.children && task.children.length > 0) {
                sortTasksWithCompletedLast(task.children);
            }
        });
    };
    
    sortTasksWithCompletedLast(taskTree);

    // Render bulk actions
    if (filteredTasks.length > 0) {
        bulkActionsContainer.classList.remove('hidden');
        bulkActionsContainer.querySelector('#selectAllCheckbox').checked = false;
        bulkActionsContainer.querySelector('#selectAllCheckbox').indeterminate = false;
        document.getElementById('sortSelect').value = currentSort;
    } else {
        bulkActionsContainer.classList.add('hidden');
        selectedTasks.clear();
    }
    
    // Render HTML
    if (taskTree.length === 0) {
        let message = "No tasks found";
        let subMessage = "Add a new task to get started!";
        
        if (settings.focusMode) {
            message = "No priority tasks";
            subMessage = "All caught up! Turn off Focus Mode to see all tasks.";
        } else if (currentSearch) {
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
        updateTabBadges();
        return;
    }
    
    // Render tasks
    const renderTaskHTML = (task, level) => {
        const displayLevel = Math.min(level, 3);
        const subtaskClass = displayLevel > 0 ? `subtask subtask-level-${displayLevel}` : '';
        const draggable = (currentSort === 'order' && !currentSearch && displayLevel === 0) ? 'true' : 'false';
        
        const hasChildren = task.children && task.children.length > 0;
        const isCollapsed = collapsedTasks.has(task.id);
        
        const stats = getSubtaskStats(task.id);
        const dueDateClass = getDueDateClass(task.dueDate);
        
        let taskHTML = `
        <div class="task-card ${task.completed ? 'completed' : ''} ${subtaskClass} ${dueDateClass}" 
             data-task-id="${task.id}" 
             draggable="${draggable}"
             ondragstart="handleDragStart(event)">
            
            <div class="task-header">
                <div class="task-title-section">
                    ${hasChildren ? `
                    <button class="collapse-btn" 
                            onclick="toggleCollapseTask('${task.id}', event)" 
                            title="${isCollapsed ? 'Expand' : 'Collapse'} subtasks"
                            aria-label="${isCollapsed ? 'Expand' : 'Collapse'} subtasks">
                        <i class="fas fa-chevron-${isCollapsed ? 'right' : 'down'}"></i>
                    </button>
                    ` : '<span class="collapse-spacer"></span>'}
                    
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
                        <div class="task-title">
                            ${escapeHtml(task.title)}
                            ${stats ? `<span class="subtask-progress" title="Subtask Progress">(${stats.completed}/${stats.total})</span>` : ''}
                            ${task.estimatedMinutes ? `<span class="time-estimate" title="Estimated Time"><i class="fas fa-clock"></i> ${formatMinutes(task.estimatedMinutes)}</span>` : ''}
                        </div>
                        ${stats ? `
                        <div class="subtask-progress-bar">
                            <div class="subtask-progress-fill" style="width: ${stats.percentage}%"></div>
                        </div>
                        ` : ''}
                    </div>
                </div>
                <div class="task-actions">
                    ${displayLevel < 3 && !task.completed ? `
                    <button class="task-btn" onclick="openSubtaskForm('${task.id}')" title="Add Subtask" aria-label="Add Subtask">
                        <i class="fas fa-plus-circle"></i>
                    </button>
                    ` : ''}
                    <button class="task-btn" onclick="cloneTask('${task.id}')" title="Clone Task" aria-label="Clone Task">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="task-btn" onclick="editTask('${task.id}')" title="Edit" aria-label="Edit Task">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${task.completed ? `
                    <button class="task-btn" onclick="archiveTask('${task.id}')" title="Archive" aria-label="Archive Task">
                        <i class="fas fa-archive"></i>
                    </button>
                    ` : ''}
                    <button class="task-btn" onclick="deleteTask('${task.id}')" title="Delete" aria-label="Delete Task">
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
                    <span class="task-badge badge-date ${dueDateClass}">
                        <i class="fas fa-calendar${dueDateClass === 'overdue' ? '-times' : ''}"></i> 
                        ${formatDate(task.dueDate)}
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
                    ${task.tags.map(tag => `<span class="tag" onclick="quickFilterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
        </div>
        `;
        
        if (hasChildren && !isCollapsed) {
            taskHTML += task.children.map(child => renderTaskHTML(child, level + 1)).join('');
        }
        
        return taskHTML;
    };
    
    container.innerHTML = taskTree.map(task => renderTaskHTML(task, 0)).join('');

    updateBulkActionUI();
    updateTabBadges();
}

// *** NEW: Quick filter by clicking tag ***
function quickFilterByTag(tag) {
    quickFilters.tags.clear();
    quickFilters.tags.add(tag);
    applyQuickFilters();
}

// Drag and Drop
function handleDragStart(event) {
    const taskCard = event.target.closest('.task-card');
    if (taskCard.draggable) {
        event.dataTransfer.setData('text/plain', taskCard.dataset.taskId);
        event.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            taskCard.classList.add('dragging');
        }, 0);
    } else {
        event.preventDefault();
    }
}

function handleDragOver(event) {
    const taskCard = event.target.closest('.task-card[draggable="true"]');
    const container = event.target.closest('.tasks-container');
    
    if (taskCard || container) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }
}

async function handleDrop(event) {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    const draggedTask = tasks.find(t => t.id === draggedId);
    
    const draggingElement = document.querySelector('.task-card.dragging');
    if (draggingElement) {
        draggingElement.classList.remove('dragging');
    }

    if (!draggedTask) return;
    
    const targetCard = event.target.closest('.task-card[draggable="true"]');
    let targetOrder = Date.now();
    
    const topLevelTasks = tasks
        .filter(t => !t.parentId)
        .sort((a, b) => (a.order || 0) - (b.order || 0));
    
    if (targetCard) {
        const targetId = targetCard.dataset.taskId;
        if (targetId === draggedId) return;
        
        const targetTask = tasks.find(t => t.id === targetId);
        if (!targetTask) return;
        
        const targetIndex = topLevelTasks.findIndex(t => t.id === targetId);
        
        const rect = targetCard.getBoundingClientRect();
        const isBefore = event.clientY < rect.top + rect.height / 2;

        if (isBefore) {
            if (targetIndex === 0) {
                targetOrder = (targetTask.order || 0) - 1000;
            } else {
                const prevTask = topLevelTasks[targetIndex - 1];
                targetOrder = ((prevTask.order || 0) + (targetTask.order || 0)) / 2;
            }
        } else {
            if (targetIndex === topLevelTasks.length - 1) {
                targetOrder = (targetTask.order || 0) + 1000;
            } else {
                const nextTask = topLevelTasks[targetIndex + 1];
                targetOrder = ((targetTask.order || 0) + (nextTask.order || 0)) / 2;
            }
        }
        
    } else {
        if(topLevelTasks.length > 0) {
            const maxOrder = topLevelTasks[topLevelTasks.length - 1].order || 0;
            targetOrder = maxOrder + 1000;
        }
    }
    
    draggedTask.order = targetOrder;
    
    setSortOption('order');
    await saveTasks();
    renderTasks();
}

// Reminders
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
            icon: 'android-chrome-192x192.png',
            badge: 'android-chrome-192x192.png'
        };
        
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(`Task Reminder: ${task.title}`, options);
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

// AI INSIGHTS (Legacy function for old summary panel)
function renderAISummary() {
    const insights = generateEnhancedAIInsights(tasks);
    const container = document.getElementById('aiSummaryContent');
    
    if (!container) return;
    
    if (insights.length === 0 || tasks.length === 0) {
        container.innerHTML = '<p class="ai-summary-item"><i class="fas fa-lightbulb"></i> Start adding tasks to get personalized insights.</p>';
        return;
    }
    
    container.innerHTML = insights.slice(0, 3).map(insight => `
        <p class="ai-summary-item ${insight.type}">
            <i class="fas ${insight.icon}"></i>
            ${insight.message}
        </p>
    `).join('');
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

// *** ENHANCED: showInsights with more metrics ***
function showInsights() {
    lastFocusedElement = document.activeElement;
    
    const activeTasks = tasks.filter(t => !t.archived);
    const total = activeTasks.length;
    const completed = activeTasks.filter(t => t.completed).length;
    const pending = total - completed;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    const pendingTasks = activeTasks.filter(t => !t.completed);
    
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
    
    const now = new Date();
    const overdue = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate) < now;
    });
    
    const today = new Date().toDateString();
    const dueToday = pendingTasks.filter(t => {
        if (!t.dueDate) return false;
        return new Date(t.dueDate).toDateString() === today;
    });
    
    // *** NEW: Calculate productivity metrics ***
    const last7Days = completed.filter(t => {
        if (!t.completedAt) return false;
        const completedDate = new Date(t.completedAt);
        const daysDiff = (now - completedDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 7;
    });
    
    const last30Days = completed.filter(t => {
        if (!t.completedAt) return false;
        const completedDate = new Date(t.completedAt);
        const daysDiff = (now - completedDate) / (1000 * 60 * 60 * 24);
        return daysDiff <= 30;
    });
    
    const avgPerWeek = last30Days.length > 0 ? Math.round((last30Days.length / 30) * 7 * 10) / 10 : 0;
    
    // Time estimates
    const withEstimates = pendingTasks.filter(t => t.estimatedMinutes);
    const totalEstimatedMinutes = withEstimates.reduce((sum, t) => sum + (t.estimatedMinutes || 0), 0);
    const totalEstimatedHours = Math.round(totalEstimatedMinutes / 60 * 10) / 10;
    
    const insights = generateEnhancedAIInsights(tasks);
    
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
            <h3><i class="fas fa-chart-line"></i> Productivity Trends</h3>
            <div class="stat-grid">
                <div class="stat-item">
                    <div class="stat-value">${last7Days.length}</div>
                    <div class="stat-label">Last 7 Days</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${last30Days.length}</div>
                    <div class="stat-label">Last 30 Days</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${avgPerWeek}</div>
                    <div class="stat-label">Avg/Week</div>
                </div>
                ${totalEstimatedMinutes > 0 ? `
                <div class="stat-item">
                    <div class="stat-value">${totalEstimatedHours}h</div>
                    <div class="stat-label">Est. Work Left</div>
                </div>
                ` : ''}
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
            <h3><i class="fas fa-brain"></i> AI Insights & Recommendations</h3>
            ${insights.map(insight => `
                <p class="ai-summary-item ${insight.type}" style="margin: 0.75rem 0;">
                    <i class="fas ${insight.icon}"></i>
                    ${insight.message}
                    ${insight.action ? `
                        <button class="btn btn-sm btn-primary" onclick="closeInsightsModal(); (${insight.action.toString()})();" style="margin-left: 0.5rem;">
                            ${insight.actionLabel}
                        </button>
                    ` : ''}
                </p>
            `).join('')}
        </div>
    `;
    
    document.getElementById('insightsContent').innerHTML = content;
    document.getElementById('insightsModal').classList.remove('hidden');
    
    setTimeout(() => document.getElementById('insightsModal').querySelector('.close-btn').focus(), 100);
}

function generateAIInsights(tasks) {
    // Wrapper for enhanced insights
    return generateEnhancedAIInsights(tasks);
}

function closeInsightsModal() {
    document.getElementById('insightsModal').classList.add('hidden');
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

// Settings
function openSettings() {
    lastFocusedElement = document.activeElement;
    
    document.getElementById('defaultCategory').value = settings.defaultCategory;
    document.getElementById('defaultPriority').value = settings.defaultPriority;
    document.getElementById('defaultReminderHours').value = settings.defaultReminderHours;
    document.getElementById('enablePin').checked = settings.pinEnabled;
    
    if (settings.pinEnabled) {
        document.getElementById('pinSettings').classList.remove('hidden');
    }
    
    document.getElementById('settingsModal').classList.remove('hidden');
    
    setTimeout(() => document.getElementById('settingsModal').querySelector('.close-btn').focus(), 100);
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

async function saveSettings() {
    settings.defaultCategory = document.getElementById('defaultCategory').value;
    settings.defaultPriority = document.getElementById('defaultPriority').value;
    settings.defaultReminderHours = parseInt(document.getElementById('defaultReminderHours').value);
    
    try {
        await db.put(SETTINGS_STORE, settings);
        showToast('Settings saved successfully', 'success');
    } catch (e) {
        console.error("Error saving settings:", e);
        showToast('Error saving settings', 'error');
    }
}

async function loadSettings() {
    let saved = await db.get(SETTINGS_STORE, 'main-settings');
    if (saved) {
        settings = { ...settings, ...saved };
    } else {
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
        version: '1.3-pro', // *** UPDATED: Version
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
        'Value': '1.3-pro' // *** UPDATED: Version
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
    const tasksWithDates = tasks.filter(t => !t.completed && t.dueDate);
    
    if (tasksWithDates.length === 0) {
        showToast('No tasks with due dates to export', 'info');
        return;
    }
    
    let icsContent = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//TaskMaster Pro//EN\n';
    
    tasksWithDates.forEach(task => {
        const dueDate = new Date(task.dueDate);
        const uid = task.id + '@taskmasterpro.com';
        
        icsContent += 'BEGIN:VEVENT\n';
        icsContent += `UID:${uid}\n`;
        icsContent += `DTSTAMP:${formatICSDate(new Date())}\n`;
        icsContent += `DTSTART:${formatICSDate(dueDate)}\n`;
        icsContent += `SUMMARY:${escapeICS(task.title)}\n`;
        if (task.description) {
            icsContent += `DESCRIPTION:${escapeICS(task.description)}\n`;
        }
        icsContent += `PRIORITY:${getPriorityNumber(task.priority)}\n`;
        icsContent += `CATEGORIES:${capitalize(task.category)}\n`;
        icsContent += 'END:VEVENT\n';
    });
    
    icsContent += 'END:VCALENDAR';
    
    const filename = getTimestampedFilename('tasks', 'ics');
    downloadFile(icsContent, filename, 'text/calendar');
    showToast(`${tasksWithDates.length} task(s) exported to ${filename}. Import this file to Google Calendar.`, 'success');
}

function isDuplicate(newTask, existingTask) {
    return newTask.title === existingTask.title &&
           newTask.category === existingTask.category &&
           newTask.dueDate === existingTask.dueDate;
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
            parentId: t.parentId || null
        }));
        renderTasks(); // Render after loading
    } catch (e) {
        console.error("Error loading tasks from IndexedDB:", e);
        tasks = [];
    }
}

// *** NEW: Format minutes for display ***
function formatMinutes(minutes) {
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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

// *** UPDATED: Modal Controls ***
function showInfoModal(title, content) {
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
    
    setTimeout(() => infoModal.querySelector('.btn-secondary').focus(), 100);
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.classList.add('hidden');
    }
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

function showConfirmModal(title, message, onConfirm) {
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
    const newConfirmOkBtn = confirmOkBtn.cloneNode(true);
    confirmOkBtn.parentNode.replaceChild(newConfirmOkBtn, confirmOkBtn);
    
    newConfirmOkBtn.addEventListener('click', () => {
        onConfirm();
        closeConfirmModal();
    });

    confirmModal.classList.remove('hidden');
    setTimeout(() => newConfirmOkBtn.focus(), 100);
}

function closeConfirmModal() {
    const confirmModal = document.getElementById('confirmModal');
    if (confirmModal) {
        confirmModal.classList.add('hidden');
    }
    if (lastFocusedElement) {
        try { lastFocusedElement.focus(); } catch(e) {}
    }
}

function showAbout() {
    showInfoModal(
        '<i class="fas fa-check-circle"></i> About TaskMaster Pro',
        `<p><strong>Version: 1.4 Ultimate Edition</strong></p>
         <p>A comprehensive task management application with:</p>
         <ul style="list-style-position: inside; padding-left: 1rem;">
            <li>AI-Powered Dashboard & Insights</li>
            <li>Collapsible Subtasks (3 levels)</li>
            <li>Eisenhower Matrix View</li>
            <li>Focus Mode & Quick Filters</li>
            <li>Time Estimates & Tracking</li>
            <li>Batch Editing & Task Cloning</li>
            <li>Drag & Drop Reordering</li>
            <li>Advanced Search & Filtering</li>
         </ul>
         <p style="margin-top: 1rem;">Developed with ❤️ by <strong>Santosh Phuyal</strong></p>
         <p style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 1rem;">
            All data stored securely in your browser's IndexedDB.
         </p>`
    );
}

function showHelp() {
     showInfoModal(
        '<i class="fas fa-question-circle"></i> Help & Shortcuts',
        `<h3 style="margin-top: 0;">✨ New Features</h3>
        <ul style="list-style-position: inside; padding-left: 1rem;">
            <li><strong>AI Dashboard:</strong> Get smart insights and productivity scores</li>
            <li><strong>Quick Add:</strong> "Buy milk @office !high #groceries 30m"</li>
            <li><strong>Focus Mode:</strong> Shows only urgent/today's tasks</li>
            <li><strong>Matrix View:</strong> Eisenhower urgent/important grid</li>
            <li><strong>Quick Filters:</strong> Filter by priority, tags, due date</li>
            <li><strong>Batch Edit:</strong> Select multiple tasks and edit together</li>
            <li><strong>Clone Tasks:</strong> Duplicate tasks with one click</li>
            <li><strong>Time Estimates:</strong> Track how long tasks take</li>
        </ul>
        
        <h3 style="margin-top: 1.5rem;">⌨️ Keyboard Shortcuts</h3>
        <ul style="list-style-position: inside; padding-left: 1rem;">
            <li><kbd>Ctrl+N</kbd> - New task</li>
            <li><kbd>Ctrl+F</kbd> - Focus search</li>
            <li><kbd>Ctrl+I</kbd> - Show detailed insights</li>
            <li><kbd>Ctrl+,</kbd> - Open settings</li>
            <li><kbd>1-6</kbd> - Switch between tabs</li>
            <li><kbd>ESC</kbd> - Close any modal</li>
        </ul>
        
        <h3 style="margin-top: 1.5rem;">🎯 Quick Add Syntax</h3>
        <ul style="list-style-position: inside; padding-left: 1rem;">
            <li><strong>@category</strong> - @personal, @office, @misc</li>
            <li><strong>!priority</strong> - !urgent, !high, !medium, !low</li>
            <li><strong>#tags</strong> - #work #important</li>
            <li><strong>Time</strong> - 30m (minutes) or 2h (hours)</li>
        </ul>
        
        <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
            💡 Tip: Click on tags to quick-filter, and use the chevron to collapse subtasks!
        </p>`
    );
}

function showPrivacy() {
    showInfoModal(
        '<i class="fas fa-shield-alt"></i> Privacy Policy',
        `<p>All your data is stored locally on your device using your browser's <strong>IndexedDB</strong>.</p>
         <p>✅ No data is sent to any external servers</p>
         <p>✅ Your tasks and settings remain private and under your control</p>
         <p>✅ Data persists across browser sessions</p>
         <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
            Note: Clearing browser data will delete all tasks. Use Export to backup!
         </p>`
    );
}

// *** UPDATED: Keyboard Shortcuts ***
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
            closeTaskModal();
            closeSettingsModal();
            closeInsightsModal();
            closeInfoModal();
            closeConfirmModal();
        }
        return;
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        openAdvancedForm();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.focus();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        showInsights();
    }
    
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        openSettings();
    }
    
    // *** NEW: Ctrl+B for batch edit ***
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        openBatchEdit();
    }
    
    // *** NEW: Ctrl+M for matrix view ***
    if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        toggleView(currentView === 'list' ? 'matrix' : 'list');
    }
    
    if (e.key === 'Escape') {
        closeTaskModal();
        closeSettingsModal();
        closeInsightsModal();
        closeInfoModal();
        closeConfirmModal();
    }
    
    if (e.key >= '1' && e.key <= '6' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const filters = ['all', 'personal', 'office', 'misc', 'recurring', 'completed'];
        const index = parseInt(e.key) - 1;
        if (filters[index]) {
            filterTasks(filters[index]);
        }
    }
});

window.addEventListener('load', () => {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});