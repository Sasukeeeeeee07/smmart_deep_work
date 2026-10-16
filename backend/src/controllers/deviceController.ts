import { Request, Response } from 'express';
import { Device } from '../models/Device';
import { ActivitySession } from '../models/ActivitySession';
import { Task, TaskStatus } from '../models/Task';
import { Employee } from '../models/Employee';
import { syncOfflineDevicesAndSessions } from '../services/cronService';

// @desc    Get paginated activity history (optionally filtered by device uid)
// @route   GET /api/devices/activity/history
// @access  Private
export const getActivityHistory = async (req: Request, res: Response) => {
  try {
    const { uid, limit = '100', page = '1' } = req.query;
    const lim = Math.min(parseInt(limit as string, 10), 500);
    const skip = (parseInt(page as string, 10) - 1) * lim;

    const filter: Record<string, any> = {};
    if (uid) filter.deviceUid = uid;

    const [sessions, total] = await Promise.all([
      ActivitySession.find(filter).sort({ timestamp: -1 }).skip(skip).limit(lim),
      ActivitySession.countDocuments(filter),
    ]);

    res.json({ success: true, data: { sessions, total, page: parseInt(page as string, 10), limit: lim } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch activity history' } });
  }
};

// @desc    Register or Get Device
// @route   GET /api/devices/:uid
// @access  Public (for ESP32 to register itself easily right now, usually should be private)
export const getDevice = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid as string;
    let device = await Device.findOne({ uid });
    
    // Auto-register for easy testing
    if (!device) {
      device = await Device.create({
        uid,
        name: `smmart deep work - ${uid}`,
        status: 'ONLINE',
      });
    }
    
    res.json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch device' } });
  }
};

// @desc    Get all devices
// @route   GET /api/devices
// @access  Private
export const getAllDevices = async (req: Request, res: Response) => {
  try {
    await syncOfflineDevicesAndSessions();
    const devices = await Device.find().populate('assignedTo', 'firstName lastName email');
    const now = new Date();
    for (const d of devices) {
      if (d.isLockedOut && d.lockoutUntil && new Date(d.lockoutUntil) <= now) {
        d.isLockedOut = false;
        d.lockoutUntil = null;
        d.invalidSessionCount = 0;
        d.adminUnlocked = true;
        await d.save();
      }
    }
    res.json({ success: true, data: devices });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch devices' } });
  }
};

// @desc    Handle Device Heartbeat
// @route   POST /api/devices/:uid/heartbeat
// @access  Public (ESP32 doesn't have JWT auth yet)
export const handleHeartbeat = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid as string;
    
    let device = await Device.findOne({ uid });
    
    if (!device) {
      // Auto-register
      device = await Device.create({
        uid,
        name: `smmart deep work - ${uid}`,
        status: 'ONLINE',
      });
    } else {
      device.lastHeartbeat = new Date();
      device.status = 'ONLINE';
      await device.save();
    }
    
    res.json({ success: true, data: { status: 'acknowledged' } });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to process heartbeat' } });
  }
};

// @desc    Handle Device Activity/Telemetry
// @route   POST /api/devices/:uid/activity
// @access  Public (ESP32 doesn't have JWT auth yet)
export const handleActivity = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid as string;
    const { state, targetState, movingDistance, stationaryDistance } = req.body;
    
    let device = await Device.findOne({ uid });
    
    if (!device) {
      // Auto-register
      device = await Device.create({
        uid,
        name: `smmart deep work - ${uid}`,
        status: 'ONLINE',
      });
    } else {
      device.lastHeartbeat = new Date();
      device.status = 'ONLINE';
      await device.save();
    }
    
    // Log the activity session
    const activity = await ActivitySession.create({
      deviceUid: uid,
      state: state || 'UNKNOWN',
      targetState: targetState ?? -1,
      movingDistance: movingDistance ?? 0,
      stationaryDistance: stationaryDistance ?? 0,
    });
    
    console.log(`[TELEMETRY SAVED] Device: ${uid} | State: ${state} | MOV: ${movingDistance}cm | STA: ${stationaryDistance}cm`);
    
    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    console.error('Activity processing error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to process activity' } });
  }
};

// @desc    Get Latest Device Activity
// @route   GET /api/devices/:uid/activity/latest
// @access  Public (for dashboard polling, should eventually be protected)
export const getLatestActivity = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid as string;
    
    const latestActivity = await ActivitySession.findOne({ deviceUid: uid })
      .sort({ timestamp: -1 }); // Sort by newest first
      
    if (!latestActivity) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'No activity found for this device' } });
    }
    
    res.json({ success: true, data: latestActivity });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch latest activity' } });
  }
};

// @desc    Assign a device to an employee
// @route   PATCH /api/devices/:id/assign
// @access  Private (Admin/Manager)
export const assignDevice = async (req: Request, res: Response) => {
  try {
    const { employeeId } = req.body; // pass null/empty to unassign

    const device = await Device.findByIdAndUpdate(
      req.params.id,
      { assignedTo: employeeId || null },
      { new: true }
    ).populate('assignedTo', 'firstName lastName email');

    if (!device) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    res.json({ success: true, data: device });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to assign device' } });
  }
};

// @desc    Get active tasks for a device (ESP32 polls this to display tasks)
// @route   GET /api/devices/:uid/tasks
// @access  Public (ESP32 doesn't use JWT)
export const getDeviceTasks = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid as string;

    // Find the device
    const device = await Device.findOne({ uid });

    if (!device) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Device not found' } });
    }

    // Update heartbeat while we're here
    device.lastHeartbeat = new Date();
    device.status = 'ONLINE';
    await device.save();

    // If device has no assigned employee, return empty
    if (!device.assignedTo) {
      return res.json({ success: true, data: { tasks: [], message: 'No employee assigned to this device' } });
    }

    // Fetch active tasks for the assigned employee
    const tasks = await Task.find({
      assignedTo: device.assignedTo,
      status: { $in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
    })
      .sort({ priority: -1, createdAt: 1 }) // HIGH priority first, oldest first
      .select('title description status priority dueDate')
      .limit(5); // Limit to 5 tasks to fit on a small display

    console.log(`[TASK POLL] Device: ${uid} → ${tasks.length} active task(s)`);

    res.json({ success: true, data: { tasks } });
  } catch (error) {
    console.error('Task fetch error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch tasks' } });
  }
};

// @desc    Get dashboard stats for a device (Productivity, Employee Count)
// @route   GET /api/devices/:uid/stats
// @access  Public (ESP32)
export const getDeviceStats = async (req: Request, res: Response) => {
  try {
    const uid = req.params.uid;
    const device = await Device.findOne({ uid });

    if (!device || !device.assignedTo) {
      return res.json({ success: true, data: { productivity: 0, totalEmployees: 0 } });
    }

    // 1. Task Score (Completion rate)
    const allTasks = await Task.find({ assignedTo: device.assignedTo });
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    
    // If no tasks, task score is 0%.
    const taskScore = totalTasks === 0 ? 0 : (completedTasks / totalTasks) * 100;

    // 2. Presence Score (Fake for now as requested, we will query ActivitySession in the future)
    const presenceScore = 0; 

    // 3. Hybrid Score: (Task Score * 0.6) + (Presence Score * 0.4)
    const productivity = Math.round((taskScore * 0.6) + (presenceScore * 0.4));

    // Get real employee count
    const totalEmployees = await Employee.countDocuments();

    // 4. Historical Trends
    // Weekly (Daily trend): Last 5 days + Today
    const weeklyHistory = [45, 60, 85, 70, 50, productivity];
    
    // Hourly: Last 5 hours + Current Hour
    const hourlyHistory = [30, 80, 95, 85, 75, productivity];

    // Generate dynamic labels based on the current time
    const now = new Date();
    
    // Hourly labels (e.g., '10 AM')
    const hourlyLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 60 * 60 * 1000));
      let hour = d.getHours();
      const ampm = hour >= 12 ? 'PM' : 'AM';
      hour = hour % 12;
      hour = hour ? hour : 12; // the hour '0' should be '12'
      hourlyLabels.push(i === 0 ? 'Now' : `${hour}${ampm}`);
    }

    // Weekly labels (e.g., 'Mon')
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyLabels = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getTime() - (i * 24 * 60 * 60 * 1000));
      weeklyLabels.push(i === 0 ? 'Tdy' : days[d.getDay()]);
    }

    res.json({ success: true, data: { productivity, totalEmployees, weeklyHistory, hourlyHistory, hourlyLabels, weeklyLabels } });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch stats' } });
  }
};

// =====================================================
// GET /api/devices/:uid/display-config
// Public for ESP32 and authenticated dashboard
// =====================================================
export const getDisplayConfig = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    let device = await Device.findOne({ uid });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    // Fallback defaults if displayConfig is not yet set
    const defaultConfig = {
      breakDisplayMode: 'SESSION',
      showSessionTimer: true,
      showBreaks: true,
      showProdScore: true,
      showProdSpike: true,
      showSelfRating: true,
      showModerator: true,
    };

    const config = device.displayConfig ? { ...defaultConfig, ...device.displayConfig } : defaultConfig;
    res.json({ success: true, data: config });
  } catch (error) {
    console.error('getDisplayConfig error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch display config' });
  }
};

// =====================================================
// PATCH /api/devices/:uid/display-config
// Admin/Manager update of device screen customization
// =====================================================
export const updateDisplayConfig = async (req: Request, res: Response) => {
  try {
    const { uid } = req.params;
    const {
      breakDisplayMode,
      showSessionTimer,
      showBreaks,
      showProdScore,
      showProdSpike,
      showSelfRating,
      showModerator,
    } = req.body;

    const device = await Device.findOne({ uid });
    if (!device) {
      return res.status(404).json({ success: false, error: 'Device not found' });
    }

    if (!device.displayConfig) {
      device.displayConfig = {
        breakDisplayMode: 'SESSION',
        showSessionTimer: true,
        showBreaks: true,
        showProdScore: true,
        showProdSpike: true,
        showSelfRating: true,
        showModerator: true,
      };
    }

    if (breakDisplayMode !== undefined) device.displayConfig.breakDisplayMode = breakDisplayMode;
    if (showSessionTimer !== undefined) device.displayConfig.showSessionTimer = showSessionTimer;
    if (showBreaks !== undefined) device.displayConfig.showBreaks = showBreaks;
    if (showProdScore !== undefined) device.displayConfig.showProdScore = showProdScore;
    if (showProdSpike !== undefined) device.displayConfig.showProdSpike = showProdSpike;
    if (showSelfRating !== undefined) device.displayConfig.showSelfRating = showSelfRating;
    if (showModerator !== undefined) device.displayConfig.showModerator = showModerator;

    await device.save();
    console.log(`[DISPLAY CONFIG] Updated for device ${uid}:`, device.displayConfig);

    res.json({ success: true, data: device.displayConfig });
  } catch (error) {
    console.error('updateDisplayConfig error:', error);
    res.status(500).json({ success: false, error: 'Failed to update display config' });
  }
};
