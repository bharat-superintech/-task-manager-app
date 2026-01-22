const express = require('express');
const db = require('../database/db');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all boards for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        // Get boards where user is creator or member
        const memberBoards = await db.boardMembers.find({ user_id: req.user.id });
        const memberBoardIds = memberBoards.map(m => m.board_id);

        const boards = await db.boards.find({
            $or: [
                { created_by: req.user.id },
                { _id: { $in: memberBoardIds } }
            ]
        });

        // Get additional data for each board
        for (let board of boards) {
            board.id = board._id;

            // Get creator
            const creator = await db.users.findOne({ _id: board.created_by });
            board.creator_name = creator?.name || '';

            // Get task counts
            const tasks = await db.tasks.find({ board_id: board._id });
            board.task_count = tasks.length;
            board.completed_count = tasks.filter(t => t.completed).length;

            // Get members
            const members = await db.boardMembers.find({ board_id: board._id });
            board.members = [];
            for (let m of members) {
                const user = await db.users.findOne({ _id: m.user_id });
                if (user) {
                    board.members.push({
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        avatar: user.avatar,
                        role: m.role
                    });
                }
            }
        }

        res.json({ boards });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get single board with columns and tasks
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const board = await db.boards.findOne({ _id: req.params.id });
        if (!board) {
            return res.status(404).json({ error: 'Board not found' });
        }

        board.id = board._id;

        // Get creator
        const creator = await db.users.findOne({ _id: board.created_by });
        board.creator_name = creator?.name || '';

        // Get columns
        const columns = await db.columns.find({ board_id: board._id }).sort({ position: 1 });

        // Get tasks for each column
        for (let column of columns) {
            column.id = column._id;
            const tasks = await db.tasks.find({ column_id: column._id }).sort({ position: 1 });

            for (let task of tasks) {
                task.id = task._id;

                // Get assignees
                const assignees = await db.taskAssignees.find({ task_id: task._id });
                task.assignees = [];
                for (let a of assignees) {
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
                        task.labels.push({ id: label._id, name: label.name, color: label.color });
                    }
                }

                // Get subtask count
                const subtasks = await db.subtasks.find({ task_id: task._id });
                task.subtask_count = {
                    total: subtasks.length,
                    completed: subtasks.filter(s => s.completed).length
                };

                // Get comment count
                const comments = await db.comments.find({ task_id: task._id });
                task.comment_count = comments.length;
            }

            column.tasks = tasks;
        }

        // Get members
        const membersData = await db.boardMembers.find({ board_id: board._id });
        const members = [];
        for (let m of membersData) {
            const user = await db.users.findOne({ _id: m.user_id });
            if (user) {
                members.push({ id: user._id, name: user.name, email: user.email, avatar: user.avatar, role: m.role });
            }
        }

        // Get labels
        const labels = await db.labels.find({ board_id: board._id });
        labels.forEach(l => l.id = l._id);

        res.json({ board, columns, members, labels });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create board
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { name, description, color } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Board name is required' });
        }

        const board = await db.boards.insert({
            name,
            description: description || '',
            color: color || '#5c6ac4',
            created_by: req.user.id,
            created_at: new Date()
        });

        board.id = board._id;

        // Add creator as admin
        await db.boardMembers.insert({
            board_id: board._id,
            user_id: req.user.id,
            role: 'admin'
        });

        // Create default columns
        const defaultColumns = [
            { name: 'To Do', color: '#e74c3c', position: 0 },
            { name: 'In Progress', color: '#f39c12', position: 1 },
            { name: 'Review', color: '#9b59b6', position: 2 },
            { name: 'Done', color: '#27ae60', position: 3 }
        ];

        for (let col of defaultColumns) {
            await db.columns.insert({
                board_id: board._id,
                name: col.name,
                color: col.color,
                position: col.position
            });
        }

        res.json({ board });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update board
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        const { name, description, color } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (color) updateData.color = color;

        await db.boards.update({ _id: req.params.id }, { $set: updateData });
        const board = await db.boards.findOne({ _id: req.params.id });
        board.id = board._id;

        res.json({ board });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete board
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        const boardId = req.params.id;

        // Delete all related data
        const tasks = await db.tasks.find({ board_id: boardId });
        for (let task of tasks) {
            await db.taskAssignees.remove({ task_id: task._id }, { multi: true });
            await db.taskLabels.remove({ task_id: task._id }, { multi: true });
            await db.subtasks.remove({ task_id: task._id }, { multi: true });
            await db.comments.remove({ task_id: task._id }, { multi: true });
        }

        await db.tasks.remove({ board_id: boardId }, { multi: true });
        await db.columns.remove({ board_id: boardId }, { multi: true });
        await db.labels.remove({ board_id: boardId }, { multi: true });
        await db.boardMembers.remove({ board_id: boardId }, { multi: true });
        await db.boards.remove({ _id: boardId });

        res.json({ message: 'Board deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add column
router.post('/:id/columns', authenticateToken, async (req, res) => {
    try {
        const { name, color } = req.body;
        const boardId = req.params.id;

        // Get next position
        const columns = await db.columns.find({ board_id: boardId });
        const position = columns.length;

        const column = await db.columns.insert({
            board_id: boardId,
            name,
            color: color || '#e0e0e0',
            position
        });

        column.id = column._id;
        column.tasks = [];

        res.json({ column });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update column
router.put('/:boardId/columns/:columnId', authenticateToken, async (req, res) => {
    try {
        const { name, color, position } = req.body;
        const updateData = {};

        if (name) updateData.name = name;
        if (color) updateData.color = color;
        if (position !== undefined) updateData.position = position;

        await db.columns.update({ _id: req.params.columnId }, { $set: updateData });
        const column = await db.columns.findOne({ _id: req.params.columnId });
        column.id = column._id;

        res.json({ column });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete column
router.delete('/:boardId/columns/:columnId', authenticateToken, async (req, res) => {
    try {
        const columnId = req.params.columnId;

        // Delete tasks in column
        const tasks = await db.tasks.find({ column_id: columnId });
        for (let task of tasks) {
            await db.taskAssignees.remove({ task_id: task._id }, { multi: true });
            await db.taskLabels.remove({ task_id: task._id }, { multi: true });
            await db.subtasks.remove({ task_id: task._id }, { multi: true });
            await db.comments.remove({ task_id: task._id }, { multi: true });
        }
        await db.tasks.remove({ column_id: columnId }, { multi: true });
        await db.columns.remove({ _id: columnId });

        res.json({ message: 'Column deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reorder columns
router.put('/:id/columns/reorder', authenticateToken, async (req, res) => {
    try {
        const { columnIds } = req.body;

        for (let i = 0; i < columnIds.length; i++) {
            await db.columns.update({ _id: columnIds[i] }, { $set: { position: i } });
        }

        res.json({ message: 'Columns reordered' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add board member
router.post('/:id/members', authenticateToken, async (req, res) => {
    try {
        const { userId, role } = req.body;

        // Check if already member
        const existing = await db.boardMembers.findOne({ board_id: req.params.id, user_id: userId });
        if (!existing) {
            await db.boardMembers.insert({
                board_id: req.params.id,
                user_id: userId,
                role: role || 'member'
            });
        }

        // Return updated members list
        const membersData = await db.boardMembers.find({ board_id: req.params.id });
        const members = [];
        for (let m of membersData) {
            const user = await db.users.findOne({ _id: m.user_id });
            if (user) {
                members.push({ id: user._id, name: user.name, email: user.email, avatar: user.avatar, role: m.role });
            }
        }

        res.json({ members });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Remove board member
router.delete('/:id/members/:userId', authenticateToken, async (req, res) => {
    try {
        await db.boardMembers.remove({ board_id: req.params.id, user_id: req.params.userId });
        res.json({ message: 'Member removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create label
router.post('/:id/labels', authenticateToken, async (req, res) => {
    try {
        const { name, color } = req.body;

        const label = await db.labels.insert({
            board_id: req.params.id,
            name,
            color: color || '#3498db'
        });

        label.id = label._id;
        res.json({ label });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete label
router.delete('/:boardId/labels/:labelId', authenticateToken, async (req, res) => {
    try {
        await db.taskLabels.remove({ label_id: req.params.labelId }, { multi: true });
        await db.labels.remove({ _id: req.params.labelId });
        res.json({ message: 'Label deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
