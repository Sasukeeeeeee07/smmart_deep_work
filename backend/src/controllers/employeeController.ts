import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
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
    
    // Create the User first - let User.pre('save') hook hash it consistently
    const user = await User.create({
      name: `${firstName} ${lastName}`.trim(),
      email: email.trim().toLowerCase(),
      passwordHash: password || 'defaultpassword123',
      role: role || Role.EMPLOYEE,
      isActive: true,
    });

    // Create Employee linked to User
    const employee = await Employee.create({
      firstName,
      lastName,
      email,
      department,
      position,
      status: status || 'ACTIVE',
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
    const { firstName, lastName, email, department, position, status, password, role } = req.body;
    
    const employee = await Employee.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Employee not found' } });
    }

    if (firstName) employee.firstName = firstName;
    if (lastName) employee.lastName = lastName;
    if (email) employee.email = email;
    if (department) employee.department = department;
    if (position) employee.position = position;
    if (status) employee.status = status;
    
    await employee.save();

    // Find linked or matching user
    let user = null;
    if (employee.user) {
      user = await User.findById(employee.user);
    }
    if (!user && employee.email) {
      user = await User.findOne({ email: employee.email });
    }

    if (user) {
      if (firstName || lastName) {
        user.name = `${employee.firstName} ${employee.lastName}`;
      }
      if (email) user.email = email;
      if (password) {
        user.passwordHash = password;
      }
      if (role) user.role = role;
      await user.save();

      if (!employee.user || employee.user.toString() !== user._id.toString()) {
        employee.user = user._id;
        await employee.save();
      }
    } else {
      // Create user if one did not exist for this employee
      const newUser = await User.create({
        name: `${employee.firstName} ${employee.lastName}`,
        email: employee.email,
        passwordHash: password || 'defaultpassword123',
        role: role || Role.EMPLOYEE,
        isActive: true,
      });
      employee.user = newUser._id;
      await employee.save();
    }
    
    const populated = await Employee.findById(employee._id).populate('user', 'name email role');
    res.json({ success: true, data: populated });
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
