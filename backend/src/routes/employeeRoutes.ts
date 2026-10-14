import express from 'express';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../controllers/employeeController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all employee routes
router.use(protect);

router.route('/')
  .get(getEmployees)
  .post(authorize('ADMIN', 'MANAGER'), createEmployee);

router.route('/:id')
  .put(authorize('ADMIN', 'MANAGER'), updateEmployee)
  .delete(authorize('ADMIN', 'MANAGER'), deleteEmployee);

export default router;
