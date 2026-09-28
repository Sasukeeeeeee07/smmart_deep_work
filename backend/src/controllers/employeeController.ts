import { Request, Response } from 'express';
import { Employee } from '../models/Employee';
import { User, Role } from '../models/User';

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (Admin/Manager)
export const getEmployees = async (req: Request, res: Response) => {
  try {
    const employees = await Employee.find().populate('user', 'name email role');
    res.json({ success: true, data: employees });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to fetch employees' } });
  }
};

// @desc    Create a new employee
// @route   POST /api/employees
// @access  Private (Admin/Manager)
export const createEmployee = async (req: Request, res: Response) => {
  try {
    const { firstName, lastName, email, department, position, status, password, role } = req.body;
    
    // Check if employee or user already exists
    const employeeExists = await Employee.findOne({ email });
    const userExists = await User.findOne({ email });
    if (employeeExists || userExists) {
      return res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Employee or User already exists with this email' } });
    }
    
    // Create the User first
    const user = await User.create({
      name: `${firstName} ${lastName}`,
      email,
      passwordHash: password || 'defaultpassword123', // require password from frontend
      role: role || Role.EMPLOYEE,
    });

    // Create Employee linked to User
    const employee = await Employee.create({
      firstName,
      lastName,
      email,
      department,
      position,
      status: status || 'Active',
      user: user._id,
    });
    
    res.status(201).json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to create employee and user' } });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (Admin/Manager)
export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    
    if (!employee) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
    }
    
    res.json({ success: true, data: employee });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to update employee' } });
  }
};

// @desc    Delete employee
// @route   DELETE /api/employees/:id
// @access  Private (Admin/Manager)
export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
    }
    
    res.json({ success: true, data: {} });
  } catch (error) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Failed to delete employee' } });
  }
};
