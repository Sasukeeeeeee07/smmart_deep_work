import express from 'express';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../controllers/employeeController';
import { protect, authorize } from '../middleware/auth';

const router = express.Router();

// Apply auth middleware to all employee routes
router.use(protect);
router.use(authorize('ADMIN', 'MANAGER'));

router.route('/')
  .get(getEmployees)
  .post(createEmployee);

router.route('/:id')
  .put(updateEmployee)
  .delete(deleteEmployee);

export default router;
