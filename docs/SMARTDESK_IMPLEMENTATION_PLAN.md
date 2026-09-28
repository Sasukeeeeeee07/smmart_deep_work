# SmartDesk Implementation Plan

## Repository Audit

1. **Existing project structure**: Empty directory (`/Users/tchitchi/Desktop/IOT Backend`).
2. **Existing backend**: None found.
3. **Existing frontend**: None found.
4. **Existing database**: None found.
5. **Existing ESP32 firmware modules**: None found in this repository.
6. **Existing APIs**: None found.
7. **Existing task implementation**: None found.
8. **Existing authentication**: None found.
9. **Existing device communication**: None found.
10. **Recommended files to create/change**: We need to initialize the entire monorepo structure from scratch, including the backend (Node.js/Express/Mongoose), frontend (React/Vite), and shared configuration.

## Proposed Architecture

As outlined in the master specification and adapted to use MongoDB:
- **Database**: MongoDB (managed via Docker and accessed via Mongoose).
- **Backend**: Node.js + TypeScript + Express.js, providing REST APIs, authentication (JWT), and device heartbeat/activity tracking endpoints.
- **Frontend**: React + TypeScript + Vite + Tailwind CSS dashboard for employee and task management.
- **Device (ESP32)**: Acts as a client to the backend, pulling tasks and sending activity states/heartbeats.

## Implementation Order (Milestones)

1. **Milestone 1 — Backend Foundation**
   - Project setup, TypeScript, Express, MongoDB (Docker), Mongoose, health endpoint, error handling, structured logging.
2. **Milestone 2 — Authentication**
   - User model, login, JWT generation, roles, auth middleware.
3. **Milestone 3 — Employees**
   - Employee CRUD, Active/inactive state management.
4. **Milestone 4 — Tasks (First major business milestone)**
   - Task CRUD, status, priority, due date, assignment, filtering, and task history.
5. **Milestone 5 — Devices**
   - Device registration, assignment, heartbeat, online/offline status detection.
6. **Milestone 6 — Activity**
   - Activity sessions, state transitions (ACTIVE/IDLE/AWAY), duration calculation.
7. **Milestone 7 — Notifications**
   - Notification model and APIs.
8. **Milestone 8 — Web Dashboard**
   - Overview, employees, tasks, activity, notifications, devices, and analytics pages.
9. **Milestone 9 — ESP32 Integration**
   - Device authentication, heartbeat endpoints, task/activity synchronization.

## Database Design (Initial MVP with Mongoose)

Mongoose Models to be created:
- **User**: Authentication, roles (ADMIN, MANAGER, EMPLOYEE).
- **Employee**: Employee details, referenced to User `ObjectId`.
- **Device**: Device UID, assigned employee `ObjectId`, status, heartbeat tracking.
- **Task**: Title, description, status (TODO, IN_PROGRESS, COMPLETED), priority, assignment `ObjectId`.
- **TaskHistory**: Audit log of task transitions.
- **ActivitySession**: Tracking ACTIVE/IDLE/AWAY states and duration.
- **Notification**: System, task, and device notifications.

## API Design

- **Health**: `GET /api/health`
- **Auth**: `POST /api/auth/login`, `POST /api/auth/register` (for admin setup)
- **Employees**: `GET /api/employees`, `POST /api/employees`, etc.
- **Devices**: `GET /api/devices`, `POST /api/devices/:deviceUid/heartbeat`, `POST /api/devices/:deviceUid/activity`
- **Tasks**: `GET /api/tasks`, `POST /api/tasks`, `PATCH /api/tasks/:id/status`
- **Notifications**: `GET /api/notifications`, `PATCH /api/notifications/read-all`

## Risks

- **Offline Device Behavior**: Ensuring devices don't lose activity data if the backend is temporarily unreachable. We will need a lightweight local queue on the ESP32.
- **Duplicate Activity Events**: We must ensure the backend handles idempotent activity state changes gracefully to avoid duplicate session creation.
- **ESP32 Firmware Code**: Currently missing from this repo. If there is existing firmware code in another repository, it must be aligned with this new backend API schema.

## Open Questions

- Are the existing ESP32 firmware modules located in a different repository that I should have access to, or will those be developed later?
- Do you want to proceed with initializing Milestone 1 (Backend Foundation)?
