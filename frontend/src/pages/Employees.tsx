import { useState, useEffect } from 'react';
import { employeeService } from '../services/api';
import { Users, Plus, Trash2 } from 'lucide-react';

const Employees = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'EMPLOYEE',
    department: '',
    position: ''
  });

  const fetchEmployees = async () => {
    try {
      const data = await employeeService.getAllEmployees();
      setEmployees(data);
    } catch (error) {
      console.error('Failed to fetch employees', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await employeeService.createEmployee(newEmployee);
      setShowAddModal(false);
      setNewEmployee({ firstName: '', lastName: '', email: '', password: '', role: 'EMPLOYEE', department: '', position: '' });
      fetchEmployees();
    } catch (error: any) {
      console.error('Failed to create employee', error);
      alert(error.response?.data?.error?.message || 'Failed to create employee. Please try again.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this employee?')) {
      try {
        await employeeService.deleteEmployee(id);
        fetchEmployees();
      } catch (error) {
        console.error('Failed to delete employee', error);
      }
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-text-main flex items-center gap-2">
          <Users size={28} className="text-primary-main" />
          Staff & Users
        </h2>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-primary-main hover:bg-primary-hover text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Add Staff Member
        </button>
      </header>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass p-8 rounded-2xl w-full max-w-md border border-surface-light">
            <h3 className="text-xl font-bold text-text-main mb-6">Add New Staff Member</h3>
            <form onSubmit={handleAddEmployee} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">First Name</label>
                  <input required type="text" className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.firstName} onChange={e => setNewEmployee({...newEmployee, firstName: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Last Name</label>
                  <input required type="text" className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.lastName} onChange={e => setNewEmployee({...newEmployee, lastName: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Email</label>
                <input required type="email" className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.email} onChange={e => setNewEmployee({...newEmployee, email: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">Password</label>
                  <input required type="password" minLength={6} className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.password} onChange={e => setNewEmployee({...newEmployee, password: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Role</label>
                  <select className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.role} onChange={e => setNewEmployee({...newEmployee, role: e.target.value})}>
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MANAGER">Manager</option>
                    <option value="ADMIN">Admin</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-text-muted mb-1">Department</label>
                  <input required type="text" className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.department} onChange={e => setNewEmployee({...newEmployee, department: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-text-muted mb-1">Position</label>
                  <input required type="text" className="w-full bg-surface-dark border border-surface-light rounded-lg px-4 py-2 text-white" value={newEmployee.position} onChange={e => setNewEmployee({...newEmployee, position: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-4 mt-6">
                <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-text-muted hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="bg-primary-main hover:bg-primary-hover text-white px-6 py-2 rounded-lg transition-colors">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl border border-surface-light overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-text-muted">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-8 text-center text-text-muted">No employees found. Add one to get started.</div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-dark/50 border-b border-surface-light text-text-muted text-sm uppercase tracking-wider">
                <th className="p-4 font-medium">Name</th>
                <th className="p-4 font-medium">Department</th>
                <th className="p-4 font-medium">Role</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp._id} className="border-b border-surface-light/50 hover:bg-white/5 transition-colors">
                  <td className="p-4">
                    <div className="font-medium text-text-main">{emp.firstName} {emp.lastName}</div>
                    <div className="text-sm text-text-muted">{emp.email}</div>
                  </td>
                  <td className="p-4 text-text-main">{emp.department}</td>
                  <td className="p-4 text-text-muted">
                    <span className={`px-2 py-1 rounded text-xs font-bold border ${emp.user?.role === 'ADMIN' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : emp.user?.role === 'MANAGER' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'} mr-2`}>
                      {emp.user?.role || 'NO ROLE'}
                    </span>
                    {emp.position}
                  </td>
                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                      {emp.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button onClick={() => handleDelete(emp._id)} className="text-red-400 hover:text-red-300 transition-colors p-2">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Employees;
