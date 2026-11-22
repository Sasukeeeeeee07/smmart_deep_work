import axios from 'axios';

const api = axios.create({
  // VITE_API_URL lets a local build point at a local backend; production uses the Render API.
  baseURL: import.meta.env.VITE_API_URL || 'https://backend-kwid.onrender.com/api',
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Device Services
export const deviceService = {
  getAllDevices: async () => {
    const response = await api.get('/devices');
    return response.data.data;
  },
  getLatestActivity: async (uid: string) => {
    const response = await api.get(`/devices/${uid}/activity/latest`);
    return response.data.data;
  },
  getDisplayConfig: async (uid: string) => {
    const response = await api.get(`/devices/${uid}/display-config`);
    return response.data.data;
  },
  updateDisplayConfig: async (uid: string, config: any) => {
    const response = await api.patch(`/devices/${uid}/display-config`, config);
    return response.data.data;
  },
  /** Admin only. Returns the new key once; the server keeps only its hash. */
  generateKey: async (uid: string): Promise<{ uid: string; key: string; keyCreatedAt: string }> => {
    const response = await api.post(`/devices/${uid}/key`);
    return response.data.data;
  },
};

// Employee Services
export const employeeService = {
  getAllEmployees: async () => {
    const response = await api.get('/employees');
    return response.data.data;
  },
  createEmployee: async (data: any) => {
    const response = await api.post('/employees', data);
    return response.data.data;
  },
  updateEmployee: async (id: string, data: any) => {
    const response = await api.put(`/employees/${id}`, data);
    return response.data.data;
  },
  deleteEmployee: async (id: string) => {
    const response = await api.delete(`/employees/${id}`);
    return response.data.data;
  }
};

// Task Services
export const penaltyService = {
  getSummary: async (range: 'week' | 'month' | 'all') => {
    const response = await api.get('/penalties/summary', { params: { range } });
    return response.data.data;
  },
  getWasted: async (from?: string, to?: string): Promise<{ date: string; minutes: number }[]> => {
    const response = await api.get('/penalties/wasted', { params: { from, to } });
    return response.data.data;
  },
  setWasted: async (date: string, minutes: number) => {
    const response = await api.put(`/penalties/wasted/${date}`, { minutes });
    return response.data.data;
  },
  importWasted: async (entries: { date: string; minutes: number }[]) => {
    const response = await api.post('/penalties/wasted/import', { entries });
    return response.data.data;
  },
};

export const taskService = {
  getAllTasks: async (filters?: { status?: string; priority?: string; assignedTo?: string }) => {
    const response = await api.get('/tasks', { params: filters });
    return response.data.data;
  },
  getTask: async (id: string) => {
    const response = await api.get(`/tasks/${id}`);
    return response.data.data;
  },
  createTask: async (data: any) => {
    const response = await api.post('/tasks', data);
    return response.data.data;
  },
  updateTask: async (id: string, data: any) => {
    const response = await api.put(`/tasks/${id}`, data);
    return response.data.data;
  },
  updateTaskStatus: async (id: string, status: string, note?: string) => {
    const response = await api.patch(`/tasks/${id}/status`, { status, note });
    return response.data.data;
  },
  deleteTask: async (id: string) => {
    const response = await api.delete(`/tasks/${id}`);
    return response.data.data;
  },
  getMissedTasks: async () => {
    const response = await api.get('/tasks/missed');
    return response.data.data;
  },
  addMissedTask: async (data: { title: string; description?: string }) => {
    const response = await api.post('/tasks/missed', data);
    return response.data.data;
  },
};

// Notification Services
export const notificationService = {
  getAll: async () => {
    const response = await api.get('/notifications');
    return response.data.data; // { notifications, unreadCount }
  },
  getUnreadCount: async () => {
    const response = await api.get('/notifications/unread-count');
    return response.data.data.count as number;
  },
  markAsRead: async (id: string) => {
    const response = await api.patch(`/notifications/${id}/read`);
    return response.data.data;
  },
  markAllRead: async () => {
    const response = await api.patch('/notifications/read-all');
    return response.data.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/notifications/${id}`);
    return response.data.data;
  },
};

// Activity Services
export const activityService = {
  getHistory: async (uid?: string, limit = 100) => {
    const params: Record<string, any> = { limit };
    if (uid) params.uid = uid;
    const response = await api.get('/devices/activity/history', { params });
    return response.data.data;
  },
  getLatest: async (uid: string) => {
    const response = await api.get(`/devices/${uid}/activity/latest`);
    return response.data.data;
  },
};

// Session Services
export const sessionService = {
  getAllSessions: async (uid?: string) => {
    const params: Record<string, any> = {};
    if (uid) params.uid = uid;
    const response = await api.get('/sessions/all', { params });
    return response.data.data;
  },
  getAnalytics: async (uid?: string) => {
    const params: Record<string, any> = {};
    if (uid) params.uid = uid;
    const response = await api.get('/sessions/analytics', { params });
    return response.data.data;
  },
  getSDWPoints: async (uid: string) => {
    const response = await api.get(`/sessions/${uid}/sdwpoints`);
    return response.data.data;
  },
  startSession: async (uid: string) => {
    const response = await api.post(`/sessions/${uid}/start`);
    return response.data;
  },
  resumeSession: async (uid: string) => {
    const response = await api.post(`/sessions/${uid}/resume`);
    return response.data;
  },
  sendModeratorCommand: async (uid: string, command: string) => {
    const response = await api.post(`/sessions/${uid}/command`, { command });
    return response.data.data;
  },
  raiseAlarm: async (uid: string, message: string) => {
    const response = await api.post(`/sessions/${uid}/alarm`, { message });
    return response.data.data;
  },
  getCurrentSession: async (uid: string) => {
    const response = await api.get(`/sessions/${uid}/current`);
    return response.data.data;
  },
  extendSession: async (uid: string, extensionMinutes: number) => {
    const response = await api.post(`/sessions/${uid}/extend`, { extensionMinutes });
    return response.data.data;
  },
  stopSound: async (uid: string, sessionId?: string) => {
    const response = await api.post(`/sessions/${uid}/stop-sound`, { sessionId });
    return response.data;
  },
  endSession: async (uid: string, activeMinutes?: number, sessionId?: string) => {
    const response = await api.post(`/sessions/${uid}/end`, { activeMinutes, sessionId });
    return response.data;
  },
  rateSession: async (uid: string, rating: number) => {
    const response = await api.post(`/sessions/${uid}/rate`, { rating });
    return response.data.data;
  },
  getLockoutStatus: async (uid: string) => {
    const response = await api.get(`/sessions/${uid}/lockout-status`);
    return response.data.data;
  },
  testLockout: async (uid: string, seconds: number = 120) => {
    const response = await api.post(`/sessions/${uid}/test-lockout`, { seconds });
    return response.data.data;
  },
  unlockDevice: async (uid: string) => {
    const response = await api.post(`/sessions/${uid}/unlock`);
    return response.data.data;
  },
};

// Face ID Services
export interface FaceStatus { employeeId: string; enrolled: boolean; sampleCount: number; updatedAt: string | null; }
export interface FaceCheck {
  required: boolean;
  checkRequestedAt: string | null;
  lastResult: 'MATCH' | 'MISMATCH' | 'NO_FACE' | 'NOT_ENROLLED' | 'ERROR' | null;
  lastCheckedAt: string | null;
  message: string | null;
}

export const faceService = {
  /** employeeId may be 'me' for the signed-in user. */
  getStatus: async (employeeId: string): Promise<FaceStatus> => {
    const response = await api.get(`/faces/${employeeId}/status`);
    return response.data.data;
  },
  /** Admin/manager: everyone who has Face ID set up. */
  listEnrolled: async (): Promise<{ employeeId: string; sampleCount: number; updatedAt: string }[]> => {
    const response = await api.get('/faces/status');
    return response.data.data;
  },
  enroll: async (employeeId: string, images: string[], consent: boolean): Promise<{ enrolled: boolean; sampleCount: number }> => {
    const response = await api.post(`/faces/${employeeId}/enroll`, { images, consent }, { timeout: 90000 });
    return response.data.data;
  },
  remove: async (employeeId: string) => {
    const response = await api.delete(`/faces/${employeeId}`);
    return response.data.data;
  },
  setDeviceRequired: async (uid: string, required: boolean): Promise<{ required: boolean }> => {
    const response = await api.patch(`/faces/device/${uid}/settings`, { required });
    return response.data.data;
  },
  getDeviceCheck: async (uid: string): Promise<FaceCheck> => {
    const response = await api.get(`/faces/device/${uid}/check`);
    return response.data.data;
  },
};

// User Services
export const userService = {
  getAllUsers: async () => {
    const response = await api.get('/users');
    return response.data.data;
  },
  createUser: async (data: any) => {
    const response = await api.post('/users', data);
    return response.data.data;
  }
};

export default api;
