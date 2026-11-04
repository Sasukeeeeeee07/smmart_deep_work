"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addMissedTask = exports.getMissedTasks = exports.deleteTask = exports.updateTaskStatus = exports.updateTask = exports.createTask = exports.getTask = exports.getTasks = void 0;
const Task_1 = require("../models/Task");
const TaskHistory_1 = require("../models/TaskHistory");
const Employee_1 = require("../models/Employee");
const penaltyService_1 = require("../services/penaltyService");
// @desc    Get all tasks (with optional filters)
// @route   GET /api/tasks
// @access  Private
const getTasks = async (req, res) => {
    try {
        const { status, priority, assignedTo } = req.query;
        // Anything past its due date and not done becomes a missed task (and leaves the board)
        await (0, penaltyService_1.flagOverdueTasks)();
        const filter = { missed: { $ne: true } };
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
        const { title, description, priority, assignedTo, dueDate, dueHasTime } = req.body;
        const task = await Task_1.Task.create({
            title,
            description,
            priority,
            assignedTo: assignedTo || undefined,
            dueDate: dueDate || undefined,
            dueHasTime: !!dueDate && dueHasTime === true,
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
        const { title, description, priority, assignedTo, dueDate, dueHasTime } = req.body;
        const task = await Task_1.Task.findByIdAndUpdate(req.params.id, { title, description, priority, assignedTo: assignedTo || undefined, dueDate: dueDate || undefined, dueHasTime: !!dueDate && dueHasTime === true, deadlineAlertSent: false }, { new: true, runValidators: true })
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
// ── Missed tasks ("tasks I did not do") ────────────────────────────────────
async function myEmployeeIds(req) {
    const emps = await Employee_1.Employee.find({ $or: [{ user: req.user._id }, { email: req.user.email }] }).select('_id');
    return emps.map(e => e._id);
}
// @desc    Missed tasks of the current user (created by them or assigned to them) + penalty summary
// @route   GET /api/tasks/missed
// @access  Private
const getMissedTasks = async (req, res) => {
    try {
        await (0, penaltyService_1.flagOverdueTasks)();
        const empIds = await myEmployeeIds(req);
        const tasks = await Task_1.Task.find({
            missed: true,
            $or: [{ createdBy: req.user._id }, { assignedTo: { $in: empIds } }],
        })
            .populate('assignedTo', 'firstName lastName email')
            .sort({ missedAt: -1 });
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthPenalty = tasks
            .filter(t => t.missedAt && t.missedAt >= monthStart)
            .reduce((sum, t) => sum + (t.penaltyPoints || 0), 0);
        res.json({ success: true, data: { tasks, penaltyPerTask: penaltyService_1.MISSED_TASK_PENALTY, monthPenalty } });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch missed tasks' } });
    }
};
exports.getMissedTasks = getMissedTasks;
// @desc    Log a task the user did not do. Costs MISSED_TASK_PENALTY SDW points.
// @route   POST /api/tasks/missed
// @access  Private
const addMissedTask = async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        if (!title) {
            return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Title is required' } });
        }
        const [empId] = await myEmployeeIds(req);
        const task = await Task_1.Task.create({
            title,
            description: req.body.description ? String(req.body.description).trim() : undefined,
            assignedTo: empId || undefined,
            createdBy: req.user._id,
            status: Task_1.TaskStatus.TODO,
        });
        const missed = await (0, penaltyService_1.markTaskMissed)(String(task._id), 'MANUAL');
        res.status(201).json({ success: true, data: missed || task });
    }
    catch (error) {
        res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to log missed task' } });
    }
};
exports.addMissedTask = addMissedTask;
