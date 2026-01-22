// Task Manager App
const App = {
    user: null,
    currentBoard: null,
    boards: [],
    labels: [],
    members: [],
    columns: [],

    init() {
        this.checkAuth();
        this.bindEvents();
    },

    // ==================== AUTH ====================

    async checkAuth() {
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                this.user = data.user;
                this.showApp();
                this.loadDashboard();
            } else {
                this.showAuth();
            }
        } catch (err) {
            this.showAuth();
        }
    },

    showAuth() {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    },

    showApp() {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById('user-name').textContent = this.user.name;
        document.getElementById('user-avatar').textContent = this.user.name.charAt(0).toUpperCase();
    },

    async login(email, password) {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();
            if (res.ok) {
                this.user = data.user;
                this.showApp();
                this.loadDashboard();
                this.toast('Welcome back!', 'success');
            } else {
                this.toast(data.error, 'error');
            }
        } catch (err) {
            this.toast('Login failed', 'error');
        }
    },

    async register(name, email, password) {
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
            });

            const data = await res.json();
            if (res.ok) {
                this.user = data.user;
                this.showApp();
                this.loadDashboard();
                this.toast('Account created!', 'success');
            } else {
                this.toast(data.error, 'error');
            }
        } catch (err) {
            this.toast('Registration failed', 'error');
        }
    },

    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.user = null;
        this.showAuth();
    },

    // ==================== VIEWS ====================

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-view="${viewId.replace('-view', '')}"]`);
        if (navItem) navItem.classList.add('active');
    },

    // ==================== DASHBOARD ====================

    async loadDashboard() {
        this.showView('dashboard-view');
        await this.loadBoards();
        this.renderDashboard();
    },

    async loadBoards() {
        try {
            const res = await fetch('/api/boards');
            const data = await res.json();
            this.boards = data.boards;
            this.renderBoardsList();
        } catch (err) {
            this.toast('Failed to load boards', 'error');
        }
    },

    renderDashboard() {
        const recentBoardsEl = document.getElementById('recent-boards');
        let html = '';

        this.boards.slice(0, 4).forEach(board => {
            html += this.renderBoardCard(board);
        });

        html += `
            <div class="board-card create-board-card" onclick="App.openModal('new-board-modal')">
                <i class="fas fa-plus"></i>
                <span>Create New Board</span>
            </div>
        `;

        recentBoardsEl.innerHTML = html;
    },

    renderBoardCard(board) {
        const membersHtml = board.members?.slice(0, 3).map(m =>
            `<div class="member-avatar">${m.name.charAt(0)}</div>`
        ).join('') || '';

        return `
            <div class="board-card" onclick="App.openBoard(${board.id})">
                <div class="board-card-header" style="background: ${board.color}">
                    <h3>${this.escapeHtml(board.name)}</h3>
                    <p>${board.description ? this.escapeHtml(board.description.substring(0, 50)) : ''}</p>
                </div>
                <div class="board-card-body">
                    <div class="board-card-stats">
                        ${board.completed_count || 0} / ${board.task_count || 0} tasks
                    </div>
                    <div class="board-card-members">${membersHtml}</div>
                </div>
            </div>
        `;
    },

    renderBoardsList() {
        const boardsListEl = document.getElementById('boards-list');
        boardsListEl.innerHTML = this.boards.map(board => `
            <div class="board-nav-item ${this.currentBoard?.id === board.id ? 'active' : ''}"
                 onclick="App.openBoard(${board.id})">
                <div class="board-nav-color" style="background: ${board.color}"></div>
                <span>${this.escapeHtml(board.name)}</span>
            </div>
        `).join('');
    },

    // ==================== BOARD ====================

    async openBoard(boardId) {
        try {
            const res = await fetch(`/api/boards/${boardId}`);
            const data = await res.json();

            this.currentBoard = data.board;
            this.columns = data.columns;
            this.labels = data.labels;
            this.members = data.members;

            this.showView('board-view');
            this.renderBoard();
            this.renderBoardsList();
        } catch (err) {
            this.toast('Failed to load board', 'error');
        }
    },

    renderBoard() {
        document.getElementById('board-title').textContent = this.currentBoard.name;

        // Render members
        const membersHtml = this.members.slice(0, 5).map(m =>
            `<div class="member-avatar" title="${m.name}">${m.name.charAt(0)}</div>`
        ).join('');
        document.getElementById('board-members').innerHTML = membersHtml;

        // Render columns
        const boardEl = document.getElementById('kanban-board');
        let html = '';

        this.columns.forEach(column => {
            html += this.renderColumn(column);
        });

        html += `
            <div class="add-column-placeholder">
                <button class="add-column-btn-inline" onclick="App.openModal('new-column-modal')">
                    <i class="fas fa-plus"></i> Add Column
                </button>
            </div>
        `;

        boardEl.innerHTML = html;

        // Initialize sortable for tasks
        this.initSortable();
    },

    renderColumn(column) {
        const tasksHtml = column.tasks.map(task => this.renderTaskCard(task)).join('');

        return `
            <div class="kanban-column" data-column-id="${column.id}">
                <div class="column-header" style="border-top-color: ${column.color}">
                    <div class="column-title">
                        <span class="column-name">${this.escapeHtml(column.name)}</span>
                        <span class="column-count">${column.tasks.length}</span>
                    </div>
                    <div class="column-actions">
                        <button class="btn-icon" onclick="App.showAddTaskForm(${column.id})">
                            <i class="fas fa-plus"></i>
                        </button>
                        <button class="btn-icon" onclick="App.deleteColumn(${column.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="column-tasks" data-column-id="${column.id}">
                    ${tasksHtml}
                </div>
                <div class="add-task-form" id="add-task-form-${column.id}" style="display: none;">
                    <input type="text" placeholder="Enter task title..." id="new-task-input-${column.id}"
                           onkeypress="if(event.key==='Enter') App.createTask(${column.id})">
                    <div class="form-actions">
                        <button class="btn btn-secondary btn-sm" onclick="App.hideAddTaskForm(${column.id})">Cancel</button>
                        <button class="btn btn-primary btn-sm" onclick="App.createTask(${column.id})">Add</button>
                    </div>
                </div>
                <button class="add-task-btn" onclick="App.showAddTaskForm(${column.id})">
                    <i class="fas fa-plus"></i> Add Task
                </button>
            </div>
        `;
    },

    renderTaskCard(task) {
        const labelsHtml = task.labels?.map(l =>
            `<div class="task-label-dot" style="background: ${l.color}" title="${l.name}"></div>`
        ).join('') || '';

        const assigneesHtml = task.assignees?.slice(0, 3).map(a =>
            `<div class="assignee-avatar">${a.name.charAt(0)}</div>`
        ).join('') || '';

        let metaHtml = '';
        if (task.due_date) {
            const isOverdue = !task.completed && new Date(task.due_date) < new Date();
            metaHtml += `<span class="${isOverdue ? 'overdue' : ''}"><i class="fas fa-calendar"></i> ${this.formatDate(task.due_date)}</span>`;
        }
        if (task.subtask_count?.total > 0) {
            metaHtml += `<span><i class="fas fa-check-square"></i> ${task.subtask_count.completed}/${task.subtask_count.total}</span>`;
        }
        if (task.comment_count > 0) {
            metaHtml += `<span><i class="fas fa-comment"></i> ${task.comment_count}</span>`;
        }

        return `
            <div class="task-card" data-task-id="${task.id}" onclick="App.openTaskModal(${task.id})">
                <div class="task-card-priority priority-${task.priority}"></div>
                ${labelsHtml ? `<div class="task-card-labels">${labelsHtml}</div>` : ''}
                <div class="task-card-title">${this.escapeHtml(task.title)}</div>
                ${metaHtml ? `<div class="task-card-meta">${metaHtml}</div>` : ''}
                ${assigneesHtml ? `<div class="task-card-assignees">${assigneesHtml}</div>` : ''}
            </div>
        `;
    },

    initSortable() {
        document.querySelectorAll('.column-tasks').forEach(el => {
            new Sortable(el, {
                group: 'tasks',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: (evt) => {
                    const taskId = evt.item.dataset.taskId;
                    const newColumnId = evt.to.dataset.columnId;
                    const newPosition = evt.newIndex;
                    this.moveTask(taskId, newColumnId, newPosition);
                }
            });
        });
    },

    showAddTaskForm(columnId) {
        document.getElementById(`add-task-form-${columnId}`).style.display = 'block';
        document.getElementById(`new-task-input-${columnId}`).focus();
    },

    hideAddTaskForm(columnId) {
        document.getElementById(`add-task-form-${columnId}`).style.display = 'none';
        document.getElementById(`new-task-input-${columnId}`).value = '';
    },

    async createTask(columnId) {
        const input = document.getElementById(`new-task-input-${columnId}`);
        const title = input.value.trim();

        if (!title) return;

        try {
            const res = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    board_id: this.currentBoard.id,
                    column_id: columnId,
                    title
                })
            });

            if (res.ok) {
                const data = await res.json();
                const columnEl = document.querySelector(`.column-tasks[data-column-id="${columnId}"]`);
                columnEl.insertAdjacentHTML('beforeend', this.renderTaskCard(data.task));

                // Update column in memory
                const column = this.columns.find(c => c.id == columnId);
                if (column) {
                    column.tasks.push(data.task);
                }

                this.updateColumnCount(columnId);
                this.hideAddTaskForm(columnId);
                this.toast('Task created', 'success');
            }
        } catch (err) {
            this.toast('Failed to create task', 'error');
        }
    },

    async moveTask(taskId, columnId, position) {
        try {
            await fetch(`/api/tasks/${taskId}/move`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ column_id: columnId, position })
            });

            // Update counts
            document.querySelectorAll('.kanban-column').forEach(col => {
                const colId = col.dataset.columnId;
                const count = col.querySelectorAll('.task-card').length;
                col.querySelector('.column-count').textContent = count;
            });
        } catch (err) {
            this.toast('Failed to move task', 'error');
        }
    },

    updateColumnCount(columnId) {
        const column = document.querySelector(`.kanban-column[data-column-id="${columnId}"]`);
        const count = column.querySelectorAll('.task-card').length;
        column.querySelector('.column-count').textContent = count;
    },

    // ==================== TASK MODAL ====================

    currentTask: null,

    async openTaskModal(taskId) {
        try {
            const res = await fetch(`/api/tasks/${taskId}`);
            const data = await res.json();
            this.currentTask = data.task;
            this.populateTaskModal();
            this.openModal('task-modal');
        } catch (err) {
            this.toast('Failed to load task', 'error');
        }
    },

    populateTaskModal() {
        const task = this.currentTask;

        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title-input').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-due-date').value = task.due_date || '';
        document.getElementById('task-priority').value = task.priority;

        // Labels
        const labelsHtml = task.labels?.map(l => `
            <div class="task-label" style="background: ${l.color}">
                ${l.name}
                <span class="remove-label" onclick="App.removeTaskLabel(${l.id})">&times;</span>
            </div>
        `).join('') || '';
        document.getElementById('task-labels').innerHTML = labelsHtml;

        // Assignees
        const assigneesHtml = task.assignees?.map(a => `
            <div class="assignee-item">
                <div class="assignee-avatar">${a.name.charAt(0)}</div>
                <span>${a.name}</span>
                <span class="remove-assignee" onclick="App.removeAssignee(${a.id})"><i class="fas fa-times"></i></span>
            </div>
        `).join('') || '';
        document.getElementById('task-assignees').innerHTML = assigneesHtml;

        // Subtasks
        const subtasksHtml = task.subtasks?.map(s => `
            <div class="subtask-item ${s.completed ? 'completed' : ''}">
                <input type="checkbox" ${s.completed ? 'checked' : ''} onchange="App.toggleSubtask(${s.id}, this.checked)">
                <span class="subtask-title">${this.escapeHtml(s.title)}</span>
                <span class="delete-subtask" onclick="App.deleteSubtask(${s.id})"><i class="fas fa-trash"></i></span>
            </div>
        `).join('') || '';
        document.getElementById('subtasks-list').innerHTML = subtasksHtml;

        // Comments
        const commentsHtml = task.comments?.map(c => `
            <div class="comment-item">
                <div class="comment-avatar">${c.user_name?.charAt(0) || 'U'}</div>
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-author">${c.user_name || 'User'}</span>
                        <span class="comment-date">${this.formatDateTime(c.created_at)}</span>
                    </div>
                    <div class="comment-text">${this.escapeHtml(c.content)}</div>
                </div>
            </div>
        `).join('') || '';
        document.getElementById('comments-list').innerHTML = commentsHtml;

        // Complete button
        const completeBtn = document.getElementById('complete-task-btn');
        if (task.completed) {
            completeBtn.innerHTML = '<i class="fas fa-undo"></i>';
            completeBtn.classList.add('btn-secondary');
            completeBtn.classList.remove('btn-success');
        } else {
            completeBtn.innerHTML = '<i class="fas fa-check"></i>';
            completeBtn.classList.remove('btn-secondary');
            completeBtn.classList.add('btn-success');
        }
    },

    async saveTaskField(field, value) {
        if (!this.currentTask) return;

        try {
            const body = {};
            body[field] = value;

            await fetch(`/api/tasks/${this.currentTask.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            this.currentTask[field] = value;

            // Update card in board
            const card = document.querySelector(`.task-card[data-task-id="${this.currentTask.id}"]`);
            if (card && field === 'title') {
                card.querySelector('.task-card-title').textContent = value;
            }
        } catch (err) {
            this.toast('Failed to save', 'error');
        }
    },

    async toggleComplete() {
        if (!this.currentTask) return;

        const completed = !this.currentTask.completed;
        await this.saveTaskField('completed', completed);
        this.populateTaskModal();
    },

    async deleteTask() {
        if (!this.currentTask) return;
        if (!confirm('Delete this task?')) return;

        try {
            await fetch(`/api/tasks/${this.currentTask.id}`, { method: 'DELETE' });

            const card = document.querySelector(`.task-card[data-task-id="${this.currentTask.id}"]`);
            if (card) {
                const columnId = card.closest('.column-tasks').dataset.columnId;
                card.remove();
                this.updateColumnCount(columnId);
            }

            this.closeModal('task-modal');
            this.toast('Task deleted', 'success');
        } catch (err) {
            this.toast('Failed to delete task', 'error');
        }
    },

    async addSubtask() {
        const input = document.getElementById('new-subtask-input');
        const title = input.value.trim();
        if (!title || !this.currentTask) return;

        try {
            const res = await fetch(`/api/tasks/${this.currentTask.id}/subtasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });

            if (res.ok) {
                const data = await res.json();
                this.currentTask.subtasks = this.currentTask.subtasks || [];
                this.currentTask.subtasks.push(data.subtask);
                this.populateTaskModal();
                input.value = '';
            }
        } catch (err) {
            this.toast('Failed to add subtask', 'error');
        }
    },

    async toggleSubtask(subtaskId, completed) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/subtasks/${subtaskId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ completed })
            });

            const subtask = this.currentTask.subtasks.find(s => s.id == subtaskId);
            if (subtask) subtask.completed = completed ? 1 : 0;
        } catch (err) {
            this.toast('Failed to update subtask', 'error');
        }
    },

    async deleteSubtask(subtaskId) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/subtasks/${subtaskId}`, { method: 'DELETE' });
            this.currentTask.subtasks = this.currentTask.subtasks.filter(s => s.id != subtaskId);
            this.populateTaskModal();
        } catch (err) {
            this.toast('Failed to delete subtask', 'error');
        }
    },

    async addComment() {
        const input = document.getElementById('new-comment-input');
        const content = input.value.trim();
        if (!content || !this.currentTask) return;

        try {
            const res = await fetch(`/api/tasks/${this.currentTask.id}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                const data = await res.json();
                this.currentTask.comments = this.currentTask.comments || [];
                this.currentTask.comments.push(data.comment);
                this.populateTaskModal();
                input.value = '';
            }
        } catch (err) {
            this.toast('Failed to add comment', 'error');
        }
    },

    async removeAssignee(userId) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/assignees/${userId}`, { method: 'DELETE' });
            this.currentTask.assignees = this.currentTask.assignees.filter(a => a.id != userId);
            this.populateTaskModal();
        } catch (err) {
            this.toast('Failed to remove assignee', 'error');
        }
    },

    async removeTaskLabel(labelId) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/labels/${labelId}`, { method: 'DELETE' });
            this.currentTask.labels = this.currentTask.labels.filter(l => l.id != labelId);
            this.populateTaskModal();
        } catch (err) {
            this.toast('Failed to remove label', 'error');
        }
    },

    // ==================== BOARDS CRUD ====================

    async createBoard(name, description, color) {
        try {
            const res = await fetch('/api/boards', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, description, color })
            });

            if (res.ok) {
                const data = await res.json();
                await this.loadBoards();
                this.openBoard(data.board.id);
                this.closeModal('new-board-modal');
                this.toast('Board created', 'success');
            }
        } catch (err) {
            this.toast('Failed to create board', 'error');
        }
    },

    async createColumn(name, color) {
        try {
            const res = await fetch(`/api/boards/${this.currentBoard.id}/columns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, color })
            });

            if (res.ok) {
                await this.openBoard(this.currentBoard.id);
                this.closeModal('new-column-modal');
                this.toast('Column added', 'success');
            }
        } catch (err) {
            this.toast('Failed to add column', 'error');
        }
    },

    async deleteColumn(columnId) {
        if (!confirm('Delete this column and all its tasks?')) return;

        try {
            await fetch(`/api/boards/${this.currentBoard.id}/columns/${columnId}`, { method: 'DELETE' });
            await this.openBoard(this.currentBoard.id);
            this.toast('Column deleted', 'success');
        } catch (err) {
            this.toast('Failed to delete column', 'error');
        }
    },

    // ==================== LABELS ====================

    openLabelsModal() {
        const labelsHtml = this.labels.map(l => `
            <div class="label-item">
                <div class="label-color" style="background: ${l.color}"></div>
                <span class="label-name">${l.name}</span>
                <span class="delete-label" onclick="App.deleteLabel(${l.id})"><i class="fas fa-trash"></i></span>
            </div>
        `).join('');
        document.getElementById('labels-list').innerHTML = labelsHtml;
        this.openModal('labels-modal');
    },

    async createLabel() {
        const name = document.getElementById('new-label-name').value.trim();
        const color = document.getElementById('new-label-color').value;

        if (!name) return;

        try {
            const res = await fetch(`/api/boards/${this.currentBoard.id}/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, color })
            });

            if (res.ok) {
                const data = await res.json();
                this.labels.push(data.label);
                this.openLabelsModal();
                document.getElementById('new-label-name').value = '';
            }
        } catch (err) {
            this.toast('Failed to create label', 'error');
        }
    },

    async deleteLabel(labelId) {
        try {
            await fetch(`/api/boards/${this.currentBoard.id}/labels/${labelId}`, { method: 'DELETE' });
            this.labels = this.labels.filter(l => l.id != labelId);
            this.openLabelsModal();
        } catch (err) {
            this.toast('Failed to delete label', 'error');
        }
    },

    openLabelPicker() {
        const labelsHtml = this.labels.map(l => `
            <div class="label-item" style="cursor: pointer" onclick="App.addTaskLabel(${l.id})">
                <div class="label-color" style="background: ${l.color}"></div>
                <span class="label-name">${l.name}</span>
            </div>
        `).join('');
        document.getElementById('label-picker-list').innerHTML = labelsHtml;
        this.openModal('label-picker-modal');
    },

    async addTaskLabel(labelId) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/labels`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label_id: labelId })
            });

            const label = this.labels.find(l => l.id == labelId);
            if (label) {
                this.currentTask.labels = this.currentTask.labels || [];
                this.currentTask.labels.push(label);
                this.populateTaskModal();
            }

            this.closeModal('label-picker-modal');
        } catch (err) {
            this.toast('Failed to add label', 'error');
        }
    },

    // ==================== MEMBERS ====================

    openMembersModal() {
        const membersHtml = this.members.map(m => `
            <div class="member-item">
                <div class="member-avatar">${m.name.charAt(0)}</div>
                <div class="member-info">
                    <div class="member-name">${m.name}</div>
                    <div class="member-email">${m.email}</div>
                </div>
                <span class="remove-member" onclick="App.removeMember(${m.id})"><i class="fas fa-times"></i></span>
            </div>
        `).join('');
        document.getElementById('members-list').innerHTML = membersHtml;
        this.openModal('members-modal');
    },

    async searchUsers(query) {
        if (query.length < 2) {
            document.getElementById('user-search-results').innerHTML = '';
            return;
        }

        try {
            const res = await fetch(`/api/users/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();

            const resultsHtml = data.users.map(u => `
                <div class="search-result-item" onclick="App.addMember(${u.id})">
                    <div class="user-avatar">${u.name.charAt(0)}</div>
                    <div>
                        <div>${u.name}</div>
                        <div style="font-size: 12px; color: var(--gray-500)">${u.email}</div>
                    </div>
                </div>
            `).join('');

            document.getElementById('user-search-results').innerHTML = resultsHtml;
        } catch (err) {
            console.error(err);
        }
    },

    async addMember(userId) {
        try {
            const res = await fetch(`/api/boards/${this.currentBoard.id}/members`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            if (res.ok) {
                const data = await res.json();
                this.members = data.members;
                this.openMembersModal();
                this.renderBoard();
                document.getElementById('search-user-input').value = '';
                document.getElementById('user-search-results').innerHTML = '';
            }
        } catch (err) {
            this.toast('Failed to add member', 'error');
        }
    },

    async removeMember(userId) {
        try {
            await fetch(`/api/boards/${this.currentBoard.id}/members/${userId}`, { method: 'DELETE' });
            this.members = this.members.filter(m => m.id != userId);
            this.openMembersModal();
            this.renderBoard();
        } catch (err) {
            this.toast('Failed to remove member', 'error');
        }
    },

    // Assignee picker
    openAssigneePicker() {
        const resultsHtml = this.members.map(u => `
            <div class="search-result-item" onclick="App.addAssignee(${u.id})">
                <div class="user-avatar">${u.name.charAt(0)}</div>
                <div>${u.name}</div>
            </div>
        `).join('');

        document.getElementById('user-picker-results').innerHTML = resultsHtml;
        this.openModal('user-picker-modal');
    },

    async addAssignee(userId) {
        try {
            await fetch(`/api/tasks/${this.currentTask.id}/assignees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });

            const user = this.members.find(m => m.id == userId);
            if (user) {
                this.currentTask.assignees = this.currentTask.assignees || [];
                this.currentTask.assignees.push(user);
                this.populateTaskModal();
            }

            this.closeModal('user-picker-modal');
        } catch (err) {
            this.toast('Failed to add assignee', 'error');
        }
    },

    // ==================== MODALS ====================

    openModal(modalId) {
        document.getElementById(modalId).classList.add('active');
    },

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    },

    // ==================== EVENTS ====================

    bindEvents() {
        // Auth tabs
        document.querySelectorAll('.auth-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}-form`).classList.add('active');
            });
        });

        // Login form
        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            this.login(form.email.value, form.password.value);
        });

        // Register form
        document.getElementById('register-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            this.register(form.name.value, form.email.value, form.password.value);
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // Navigation
        document.querySelectorAll('.nav-item[data-view]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                if (view === 'dashboard') {
                    this.loadDashboard();
                } else if (view === 'my-tasks') {
                    this.showView('my-tasks-view');
                }
            });
        });

        // Back to dashboard
        document.getElementById('back-to-dashboard').addEventListener('click', () => this.loadDashboard());

        // New board
        document.getElementById('new-board-btn').addEventListener('click', () => this.openModal('new-board-modal'));
        document.getElementById('new-board-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            this.createBoard(form.name.value, form.description.value, form.color.value);
        });

        // New column
        document.getElementById('add-column-btn').addEventListener('click', () => this.openModal('new-column-modal'));
        document.getElementById('new-column-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            this.createColumn(form.name.value, form.color.value);
        });

        // Labels
        document.getElementById('manage-labels-btn').addEventListener('click', () => this.openLabelsModal());
        document.getElementById('add-label-btn').addEventListener('click', () => this.createLabel());

        // Members
        document.getElementById('add-member-btn').addEventListener('click', () => this.openMembersModal());
        document.getElementById('search-user-input').addEventListener('input', (e) => this.searchUsers(e.target.value));

        // Task modal
        document.getElementById('task-title-input').addEventListener('blur', (e) => this.saveTaskField('title', e.target.value));
        document.getElementById('task-description').addEventListener('blur', (e) => this.saveTaskField('description', e.target.value));
        document.getElementById('task-due-date').addEventListener('change', (e) => this.saveTaskField('due_date', e.target.value));
        document.getElementById('task-priority').addEventListener('change', (e) => this.saveTaskField('priority', e.target.value));
        document.getElementById('complete-task-btn').addEventListener('click', () => this.toggleComplete());
        document.getElementById('delete-task-btn').addEventListener('click', () => this.deleteTask());
        document.getElementById('add-subtask-btn').addEventListener('click', () => this.addSubtask());
        document.getElementById('new-subtask-input').addEventListener('keypress', (e) => { if (e.key === 'Enter') this.addSubtask(); });
        document.getElementById('add-comment-btn').addEventListener('click', () => this.addComment());
        document.getElementById('add-assignee-btn').addEventListener('click', () => this.openAssigneePicker());
        document.getElementById('add-task-label-btn').addEventListener('click', () => this.openLabelPicker());

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });

        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // ESC to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
            }
        });
    },

    // ==================== HELPERS ====================

    toast(message, type = '') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    },

    formatDateTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => App.init());
