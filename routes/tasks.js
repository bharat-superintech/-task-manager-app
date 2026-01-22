const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get my tasks (must be before /:id route)
router.get('/my/assigned', authenticateToken, async (req, res) => {
    try {
        const assignments = await db.taskAssignees.find({ user_id: req.user.id });
        const taskIds = assignments.map(a => a.task_id);

        const tasks = await db.tasks.find({
            _id: { $in: taskIds },
            completed: { $ne: true }
        });

        // Get board and column names for each task
        for (let task of tasks) {
            task.id = task._id;
            const board = await db.boards.findOne({ _id: task.board_id });
            const column = await db.columns.findOne({ _id: task.column_id });
            task.board_name = board?.name || '';
            task.column_name = column?.name || '';
        }

        // Sort by due date
        tasks.sort((a, b) => {
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
        });

        res.json({ tasks });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get task details
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const task = await db.tasks.findOne({ _id: req.params.id });
        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        task.id = task._id;

        // Get creator
        const creator = await db.users.findOne({ _id: task.created_by });
        task.creator_name = creator?.name || '';

        // Get assignees
        const assigneeData = await db.taskAssignees.find({ task_id: task._id });
        task.assignees = [];
        for (let a of assigneeData) {
            const user = await db.users.findOne({ _id: a.user_id });
            if (user) {
                task.assignees.push({ id: user._id, name: user.name, email: user.email, avatar: user.avatar });
            }
        }

        // Get labels
        const taskLabelsData = await db.taskLabels.find({ task_id: task._id });
        task.labels = [];
        for (let tl of taskLabelsData) {
            const label = await db.labels.findOne({ _id: tl.label_id });
            if (label) {
                label.id = label._id;
                task.labels.push(label);
            }
        }

        // Get subtasks
        const subtasks = await db.subtasks.find({ task_id: task._id });
        subtasks.sort((a, b) => (a.position || 0) - (b.position || 0));
        subtasks.forEach(s => s.id = s._id);
        task.subtasks = subtasks;

        // Get comments
        const comments = await db.comments.find({ task_id: task._id });
        for (let c of comments) {
            c.id = c._id;
            const user = await db.users.findOne({ _id: c.user_id });
            c.user_name = user?.name || '';
            c.avatar = user?.avatar || '';
        }
        comments.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        task.comments = comments;

        res.json({ task });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create task
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { board_id, column_id, title, description, priority, due_date } = req.body;

        if (!board_id || !column_id || !title) {
            return res.status(400).json({ error: 'Board, column and title are required' });
        }

        // Get next position
        const tasks = await db.tasks.find({ column_id });
        const position = tasks.length;

        const task = await db.tasks.insert({
            board_id,
            column_id,
            title,
            description: description || '',
            priority: priority || 'low',
            due_date: due_date || null,
            position,
            completed: false,
            created_by: req.user.id,
            created_at: new Date()
        });

        task.id = task._id;
        task.assignees = [];
        task.labels = [];
        task.subtask_count = { total: 0, completed: 0 };
        task.comment_count = 0;

        res.json({ task });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update task
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { title, description, priority, due_date, completed, column_id, position } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description;
        if (priority !== undefined) updateData.priority = priority;
        if (due_date !== undefined) updateData.due_date = due_date;
        if (completed !== undefined) updateData.completed = completed;
        if (column_id !== undefined) updateData.column_id = column_id;
        if (position !== undefined) updateData.position = position;

        if (Object.keys(updateData).length > 0) {
            await db.tasks.update({ _id: req.params.id }, { $set: updateData });
        }

        const task = await db.tasks.findOne({ _id: req.params.id });
        task.id = task._id;

        res.json({ task });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Move task
router.put('/:id/move', authenticateToken, async (req, res) => {
    try {
        const { column_id, position } = req.body;

        await db.tasks.update(
            { _id: req.params.id },
            { $set: { column_id, position } }
        );

        res.json({ message: 'Task moved successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reorder tasks
router.put('/reorder', authenticateToken, async (req, res) => {
    try {
        const { taskIds } = req.body;

        for (let i = 0; i < taskIds.length; i++) {
            await db.tasks.update({ _id: taskIds[i] }, { $set: { position: i } });
        }

        res.json({ message: 'Tasks reordered' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const taskId = req.params.id;

        // Delete related data
        await db.taskAssignees.remove({ task_id: taskId }, { multi: true });
        await db.taskLabels.remove({ task_id: taskId }, { multi: true });
        await db.subtasks.remove({ task_id: taskId }, { multi: true });
        await db.comments.remove({ task_id: taskId }, { multi: true });
        await db.tasks.remove({ _id: taskId });

        res.json({ message: 'Task deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add assignee
router.post('/:id/assignees', authenticateToken, async (req, res) => {
    try {
        const { user_id } = req.body;

        // Check if already assigned
        const existing = await db.taskAssignees.findOne({ task_id: req.params.id, user_id });
        if (!existing) {
            await db.taskAssignees.insert({ task_id: req.params.id, user_id });
        }

        // Return updated assignees
        const assigneeData = await db.taskAssignees.find({ task_id: req.params.id });
        const assignees = [];
        for (let a of assigneeData) {
            const user = await db.users.findOne({ _id: a.user_id });
            if (user) {
                assignees.push({ id: user._id, name: user.name, email: user.email, avatar: user.avatar });
            }
        }

        res.json({ assignees });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove assignee
router.delete('/:id/assignees/:userId', authenticateToken, async (req, res) => {
    try {
        await db.taskAssignees.remove({ task_id: req.params.id, user_id: req.params.userId });
        res.json({ message: 'Assignee removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add label
router.post('/:id/labels', authenticateToken, async (req, res) => {
    try {
        const { label_id } = req.body;

        // Check if already added
        const existing = await db.taskLabels.findOne({ task_id: req.params.id, label_id });
        if (!existing) {
            await db.taskLabels.insert({ task_id: req.params.id, label_id });
        }

        // Return updated labels
        const taskLabelsData = await db.taskLabels.find({ task_id: req.params.id });
        const labels = [];
        for (let tl of taskLabelsData) {
            const label = await db.labels.findOne({ _id: tl.label_id });
            if (label) {
                label.id = label._id;
                labels.push(label);
            }
        }

        res.json({ labels });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove label
router.delete('/:id/labels/:labelId', authenticateToken, async (req, res) => {
    try {
        await db.taskLabels.remove({ task_id: req.params.id, label_id: req.params.labelId });
        res.json({ message: 'Label removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add subtask
router.post('/:id/subtasks', authenticateToken, async (req, res) => {
    try {
        const { title } = req.body;

        // Get next position
        const subtasks = await db.subtasks.find({ task_id: req.params.id });
        const position = subtasks.length;

        const subtask = await db.subtasks.insert({
            task_id: req.params.id,
            title,
            completed: false,
            position
        });

        subtask.id = subtask._id;
        res.json({ subtask });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update subtask
router.put('/:taskId/subtasks/:subtaskId', authenticateToken, async (req, res) => {
    try {
        const { title, completed } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (completed !== undefined) updateData.completed = completed;

        await db.subtasks.update({ _id: req.params.subtaskId }, { $set: updateData });

        const subtask = await db.subtasks.findOne({ _id: req.params.subtaskId });
        subtask.id = subtask._id;

        res.json({ subtask });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete subtask
router.delete('/:taskId/subtasks/:subtaskId', authenticateToken, async (req, res) => {
    try {
        await db.subtasks.remove({ _id: req.params.subtaskId });
        res.json({ message: 'Subtask deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add comment
router.post('/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;

        const comment = await db.comments.insert({
            task_id: req.params.id,
            user_id: req.user.id,
            content,
            created_at: new Date()
        });

        comment.id = comment._id;
        const user = await db.users.findOne({ _id: req.user.id });
        comment.user_name = user?.name || '';
        comment.avatar = user?.avatar || '';

        res.json({ comment });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete comment
router.delete('/:taskId/comments/:commentId', authenticateToken, async (req, res) => {
    try {
        await db.comments.remove({ _id: req.params.commentId });
        res.json({ message: 'Comment deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
