"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTask = exports.updateTaskStatus = exports.updateTask = exports.createTask = exports.getTask = exports.getTasks = void 0;
const Task_1 = require("../models/Task");
const TaskHistory_1 = require("../models/TaskHistory");
// @desc    Get all tasks (with optional filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
    try {
        const { status, priority, assignedTo } = req.query;
        const filter = {};
        if (status)
            filter.status = status;
        if (priority)
            filter.priority = priority;
        if (assignedTo)
            filter.assignedTo = assignedTo;
        const tasks = await Task_1.Task.find(filter)
            .populate('assignedTo', 'firstName lastName email department')
            .populate('createdBy', 'name email')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: tasks });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch tasks' } });
    }
};
exports.getTasks = getTasks;
// @desc    Get a single task with its history
// @route   GET /api/tasks/:id
// @access  Private
const getTask = async (req, res) => {
    try {
        const task = await Task_1.Task.findById(req.params.id)
            .populate('assignedTo', 'firstName lastName email department')
            .populate('createdBy', 'name email');
        if (!task) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        const history = await TaskHistory_1.TaskHistory.find({ task: task._id })
            .populate('changedBy', 'name')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: { ...task.toObject(), history } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch task' } });
    }
};
exports.getTask = getTask;
// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private (Admin/Manager)
const createTask = async (req, res) => {
    try {
        const { title, description, priority, assignedTo, dueDate } = req.body;
        const task = await Task_1.Task.create({
            title,
            description,
            priority,
            assignedTo: assignedTo || undefined,
            dueDate: dueDate || undefined,
            createdBy: req.user._id,
            status: Task_1.TaskStatus.TODO,
        });
        const populated = await task.populate([
            { path: 'assignedTo', select: 'firstName lastName email' },
            { path: 'createdBy', select: 'name email' },
        ]);
        res.status(201).json({ success: true, data: populated });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create task' } });
    }
};
exports.createTask = createTask;
// @desc    Update task details (title, description, priority, assignee, dueDate)
// @route   PUT /api/tasks/:id
// @access  Private (Admin/Manager)
const updateTask = async (req, res) => {
    try {
        const { title, description, priority, assignedTo, dueDate } = req.body;
        const task = await Task_1.Task.findByIdAndUpdate(req.params.id, { title, description, priority, assignedTo: assignedTo || undefined, dueDate: dueDate || undefined }, { new: true, runValidators: true })
            .populate('assignedTo', 'firstName lastName email')
            .populate('createdBy', 'name email');
        if (!task) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        res.json({ success: true, data: task });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update task' } });
    }
};
exports.updateTask = updateTask;
// @desc    Update task status and log history
// @route   PATCH /api/tasks/:id/status
// @access  Private
const updateTaskStatus = async (req, res) => {
    try {
        const { status, note } = req.body;
        if (!Object.values(Task_1.TaskStatus).includes(status)) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid status value' } });
        }
        const task = await Task_1.Task.findById(req.params.id);
        if (!task) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        const fromStatus = task.status;
        if (fromStatus === status) {
            return res.json({ success: true, data: task }); // No change needed
        }
        task.status = status;
        await task.save();
        // Log history
        await TaskHistory_1.TaskHistory.create({
            task: task._id,
            changedBy: req.user._id,
            fromStatus,
            toStatus: status,
            note: note || undefined,
        });
        const populated = await task.populate([
            { path: 'assignedTo', select: 'firstName lastName email' },
            { path: 'createdBy', select: 'name email' },
        ]);
        res.json({ success: true, data: populated });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update task status' } });
    }
};
exports.updateTaskStatus = updateTaskStatus;
// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin/Manager)
const deleteTask = async (req, res) => {
    try {
        const task = await Task_1.Task.findByIdAndDelete(req.params.id);
        if (!task) {
            return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
        }
        // Clean up history
        await TaskHistory_1.TaskHistory.deleteMany({ task: task._id });
        res.json({ success: true, data: {} });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete task' } });
    }
};
exports.deleteTask = deleteTask;
