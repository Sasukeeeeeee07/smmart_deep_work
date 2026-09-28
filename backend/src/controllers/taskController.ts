import { Request, Response } from 'express';
import { Task, TaskStatus } from '../models/Task';
import { TaskHistory } from '../models/TaskHistory';

// @desc    Get all tasks (with optional filters)
// @route   GET /api/tasks
// @access  Private
export const getTasks = async (req: Request, res: Response) => {
  try {
    const { status, priority, assignedTo } = req.query;

    const filter: Record<string, any> = {};
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (assignedTo) filter.assignedTo = assignedTo;

    const tasks = await Task.find(filter)
      .populate('assignedTo', 'firstName lastName email department')
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch tasks' } });
  }
};

// @desc    Get a single task with its history
// @route   GET /api/tasks/:id
// @access  Private
export const getTask = async (req: Request, res: Response) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assignedTo', 'firstName lastName email department')
      .populate('createdBy', 'name email');

    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    const history = await TaskHistory.find({ task: task._id })
      .populate('changedBy', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { ...task.toObject(), history } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch task' } });
  }
};

// @desc    Create a new task
// @route   POST /api/tasks
// @access  Private (Admin/Manager)
export const createTask = async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assignedTo, dueDate } = req.body;

    const task = await Task.create({
      title,
      description,
      priority,
      assignedTo: assignedTo || undefined,
      dueDate: dueDate || undefined,
      createdBy: req.user!._id,
      status: TaskStatus.TODO,
    });

    const populated = await task.populate([
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'name email' },
    ]);

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create task' } });
  }
};

// @desc    Update task details (title, description, priority, assignee, dueDate)
// @route   PUT /api/tasks/:id
// @access  Private (Admin/Manager)
export const updateTask = async (req: Request, res: Response) => {
  try {
    const { title, description, priority, assignedTo, dueDate } = req.body;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      { title, description, priority, assignedTo: assignedTo || undefined, dueDate: dueDate || undefined },
      { new: true, runValidators: true }
    )
      .populate('assignedTo', 'firstName lastName email')
      .populate('createdBy', 'name email');

    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update task' } });
  }
};

// @desc    Update task status and log history
// @route   PATCH /api/tasks/:id/status
// @access  Private
export const updateTaskStatus = async (req: Request, res: Response) => {
  try {
    const { status, note } = req.body;

    if (!Object.values(TaskStatus).includes(status)) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid status value' } });
    }

    const task = await Task.findById(req.params.id);

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
    await TaskHistory.create({
      task: task._id,
      changedBy: req.user!._id,
      fromStatus,
      toStatus: status,
      note: note || undefined,
    });

    const populated = await task.populate([
      { path: 'assignedTo', select: 'firstName lastName email' },
      { path: 'createdBy', select: 'name email' },
    ]);

    res.json({ success: true, data: populated });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update task status' } });
  }
};

// @desc    Delete a task
// @route   DELETE /api/tasks/:id
// @access  Private (Admin/Manager)
export const deleteTask = async (req: Request, res: Response) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
    }

    // Clean up history
    await TaskHistory.deleteMany({ task: task._id });

    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete task' } });
  }
};
