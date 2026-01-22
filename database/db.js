const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/taskmanager';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    avatar: { type: String, default: '' },
    role: { type: String, default: 'user' },
    created_at: { type: Date, default: Date.now }
});

// Board Schema
const boardSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String, default: '' },
    color: { type: String, default: '#5c6ac4' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now }
});

// Board Member Schema
const boardMemberSchema = new mongoose.Schema({
    board_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, default: 'member' }
});

// Column Schema
const columnSchema = new mongoose.Schema({
    board_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
    name: { type: String, required: true },
    color: { type: String, default: '#e0e0e0' },
    position: { type: Number, default: 0 }
});

// Task Schema
const taskSchema = new mongoose.Schema({
    board_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
    column_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Column' },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    priority: { type: String, default: 'low' },
    due_date: { type: Date },
    position: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now }
});

// Task Assignee Schema
const taskAssigneeSchema = new mongoose.Schema({
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// Label Schema
const labelSchema = new mongoose.Schema({
    board_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Board' },
    name: { type: String, required: true },
    color: { type: String, default: '#3498db' }
});

// Task Label Schema
const taskLabelSchema = new mongoose.Schema({
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    label_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Label' }
});

// Subtask Schema
const subtaskSchema = new mongoose.Schema({
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    title: { type: String, required: true },
    completed: { type: Boolean, default: false },
    position: { type: Number, default: 0 }
});

// Comment Schema
const commentSchema = new mongoose.Schema({
    task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Board = mongoose.model('Board', boardSchema);
const BoardMember = mongoose.model('BoardMember', boardMemberSchema);
const Column = mongoose.model('Column', columnSchema);
const Task = mongoose.model('Task', taskSchema);
const TaskAssignee = mongoose.model('TaskAssignee', taskAssigneeSchema);
const Label = mongoose.model('Label', labelSchema);
const TaskLabel = mongoose.model('TaskLabel', taskLabelSchema);
const Subtask = mongoose.model('Subtask', subtaskSchema);
const Comment = mongoose.model('Comment', commentSchema);

// Helper wrapper to maintain compatibility with existing routes
// This wrapper makes Mongoose models work like the NeDB API
function createWrapper(Model) {
    return {
        find: async (query = {}) => {
            const docs = await Model.find(query).lean();
            return docs.map(d => ({ ...d, _id: d._id.toString() }));
        },
        findOne: async (query) => {
            // Convert string _id to ObjectId if needed
            if (query._id && typeof query._id === 'string') {
                try {
                    query._id = new mongoose.Types.ObjectId(query._id);
                } catch (e) {
                    return null;
                }
            }
            const doc = await Model.findOne(query).lean();
            if (doc) {
                return { ...doc, _id: doc._id.toString() };
            }
            return null;
        },
        insert: async (data) => {
            const doc = new Model(data);
            await doc.save();
            const obj = doc.toObject();
            return { ...obj, _id: obj._id.toString() };
        },
        update: async (query, update) => {
            if (query._id && typeof query._id === 'string') {
                try {
                    query._id = new mongoose.Types.ObjectId(query._id);
                } catch (e) {
                    return 0;
                }
            }
            const result = await Model.updateMany(query, update);
            return result.modifiedCount;
        },
        remove: async (query, options = {}) => {
            if (query._id && typeof query._id === 'string') {
                try {
                    query._id = new mongoose.Types.ObjectId(query._id);
                } catch (e) {
                    return 0;
                }
            }
            // Convert string IDs in query
            for (let key of Object.keys(query)) {
                if (key.endsWith('_id') && typeof query[key] === 'string') {
                    query[key] = query[key];
                }
            }
            if (options.multi) {
                const result = await Model.deleteMany(query);
                return result.deletedCount;
            } else {
                const result = await Model.deleteOne(query);
                return result.deletedCount;
            }
        }
    };
}

module.exports = {
    users: createWrapper(User),
    boards: createWrapper(Board),
    boardMembers: createWrapper(BoardMember),
    columns: createWrapper(Column),
    tasks: createWrapper(Task),
    taskAssignees: createWrapper(TaskAssignee),
    labels: createWrapper(Label),
    taskLabels: createWrapper(TaskLabel),
    subtasks: createWrapper(Subtask),
    comments: createWrapper(Comment),
    mongoose
};
