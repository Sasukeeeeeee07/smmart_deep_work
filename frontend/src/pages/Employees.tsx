import { useState, useEffect } from 'react';
import { employeeService, faceService } from '../services/api';
import { Users, Plus, Trash2, Edit2, X, Loader2, AlertCircle, ScanFace } from 'lucide-react';
import FaceEnrollModal from '../components/FaceEnrollModal';

const ROLES = ['EMPLOYEE', 'MANAGER', 'ADMIN'] as const;
type Role = typeof ROLES[number];

const ROLE_STYLE: Record<Role, { bg: string; color: string }> = {
  ADMIN:    { bg: 'rgba(11, 94, 215, 0.1)',   color: 'var(--forest)' },
  MANAGER:  { bg: 'rgba(217, 142, 4, 0.1)', color: 'var(--amber-w)' },
  EMPLOYEE: { bg: 'var(--surface-2)',         color: 'var(--ink-3)' },
};

const emptyForm = { firstName: '', lastName: '', email: '', password: '', role: 'EMPLOYEE' as Role, department: '', position: '' };

/* ── Shared Field ──────────────────────────────────────────────────────── */
const Field = ({
  label, id, children, optional
}: { label: string; id: string; children: React.ReactNode; optional?: boolean }) => (
  <div>
    <label htmlFor={id} className="block text-xs font-medium mb-1.5" style={{ color: 'var(--ink-3)' }}>
      {label} {optional && <span style={{ color: 'var(--ink-4)' }}>(optional)</span>}
    </label>
    {children}
  </div>
);

/* ── Modal Shell ─────────────────────────────────────────────────────── */
const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) => (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center p-4"
    style={{ background: 'rgba(30, 32, 36, 0.4)', backdropFilter: 'blur(4px)' }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div
      className="w-full animate-fade-up"
      style={{
        maxWidth: 480,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 20,
        boxShadow: 'var(--shadow-xl)',
      }}
    >
      <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="font-semibold" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: 16, color: 'var(--ink)' }}>
          {title}
        </h3>
        <button onClick={onClose} className="btn btn-ghost p-1.5 rounded-lg">
          <X size={16} />
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  </div>
);

/* ── Main ──────────────────────────────────────────────────────────────── */
const Employees = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState('');
  const [showAdd, setShowAdd]     = useState(false);
  const [editing, setEditing]     = useState<any>(null);
  const [newEmp, setNewEmp]       = useState(emptyForm);

  // Face ID: who is enrolled, and whose enrolment modal is open
  const [faceEnrolled, setFaceEnrolled] = useState<Set<string>>(new Set());
  const [faceFor, setFaceFor] = useState<{ id: string; name: string } | null>(null);

  const fetchFaceStatus = async () => {
    try {
      const list = await faceService.listEnrolled();
      setFaceEnrolled(new Set(list.map(f => String(f.employeeId))));
    } catch { /* silent: the column just shows "Not set up" */ }
  };

  const removeFace = async (id: string, name: string) => {
    if (!window.confirm(`Remove ${name}'s Face ID? They won't be able to start sessions on a Face ID desk until it is set up again.`)) return;
    try {
      await faceService.remove(id);
      await fetchFaceStatus();
    } catch {
      alert('Could not remove Face ID. Try again.');
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = await employeeService.getAllEmployees();
      setEmployees(data);
    } catch { /* silent */ }
    finally { setLoading(false); }
    fetchFaceStatus();
  };

  useEffect(() => { 
    document.title = 'Employees — smmart Desk';
    fetchEmployees(); 
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      await employeeService.createEmployee(newEmp);
      setShowAdd(false);
      setNewEmp(emptyForm);
      fetchEmployees();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || 'Failed to create member.');
    } finally { setSaving(false); }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError('');
    try {
      const { id, ...data } = editing;
      if (!data.password) delete data.password;
      await employeeService.updateEmployee(id, data);
      setEditing(null);
      fetchEmployees();
    } catch (err: any) {
      setFormError(err.response?.data?.error?.message || 'Failed to update member.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this team member?')) return;
    try { await employeeService.deleteEmployee(id); fetchEmployees(); } catch {}
  };

  const EmpForm = ({ data, setData, onSubmit, isEdit }: any) => (
    <form onSubmit={onSubmit} className="space-y-4">
      {formError && (
        <div
          className="flex items-start gap-2.5 p-3 rounded-xl text-sm"
          style={{ background: 'rgba(182, 83, 75, 0.07)', border: '1px solid rgba(182, 83, 75, 0.2)', color: 'var(--error)' }}
        >
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          {formError}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" id="firstName">
          <input id="firstName" required className="input-base" value={data.firstName}
            onChange={e => setData({ ...data, firstName: e.target.value })} />
        </Field>
        <Field label="Last name" id="lastName">
          <input id="lastName" required className="input-base" value={data.lastName}
            onChange={e => setData({ ...data, lastName: e.target.value })} />
        </Field>
      </div>
      <Field label="Email" id="empEmail">
        <input id="empEmail" required type="email" className="input-base" value={data.email}
          onChange={e => setData({ ...data, email: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={isEdit ? 'New password' : 'Password'} id="empPw" optional={isEdit}>
          <input id="empPw" type="password" minLength={8} className="input-base" value={data.password}
            placeholder={isEdit ? 'Leave blank to keep' : ''}
            onChange={e => setData({ ...data, password: e.target.value })} required={!isEdit} />
        </Field>
        <Field label="Role" id="empRole">
          <select id="empRole" className="input-base" value={data.role}
            onChange={e => setData({ ...data, role: e.target.value })}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Department" id="empDept">
          <input id="empDept" required className="input-base" value={data.department}
            onChange={e => setData({ ...data, department: e.target.value })} />
        </Field>
        <Field label="Position" id="empPos">
          <input id="empPos" required className="input-base" value={data.position}
            onChange={e => setData({ ...data, position: e.target.value })} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={() => { setShowAdd(false); setEditing(null); setFormError(''); }}
          className="btn btn-secondary text-sm">Cancel</button>
        <button type="submit" disabled={saving} className="btn btn-primary text-sm">
          {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : isEdit ? 'Save changes' : 'Add member'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="section-label mb-0.5">Workspace</p>
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)', letterSpacing: '-0.01em' }}>
            Team
          </h1>
        </div>

        <button onClick={() => { setShowAdd(true); setFormError(''); setNewEmp(emptyForm); }} className="btn btn-primary text-sm">
          <Plus size={15} /> Add member
        </button>
      </div>

      {/* Table card */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users size={28} style={{ color: 'var(--ink-4)', marginBottom: 10 }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink-3)' }}>No team members yet</p>
            <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>Add someone to get started</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  {['Name', 'Department', 'Role', 'Status', 'Face ID', ''].map(h => (
                    <th key={h} className="section-label px-5 py-3.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, i) => {
                  const role = (emp.user?.role || 'EMPLOYEE') as Role;
                  const rs = ROLE_STYLE[role] || ROLE_STYLE.EMPLOYEE;
                  return (
                    <tr
                      key={emp._id}
                      style={{
                        borderBottom: i < employees.length - 1 ? '1px solid var(--border)' : undefined,
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex items-center justify-center shrink-0 text-xs font-bold"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '50%',
                              background: 'rgba(11, 94, 215, 0.1)',
                              color: 'var(--forest)',
                              fontFamily: 'DM Sans, sans-serif',
                            }}
                          >
                            {(emp.firstName?.[0] || '').toUpperCase()}{(emp.lastName?.[0] || '').toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                              {emp.firstName} {emp.lastName}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--ink-4)' }}>{emp.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--ink-2)' }}>{emp.department}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className="pill"
                          style={{ color: rs.color, background: rs.bg, borderColor: 'transparent' }}
                        >
                          {role.charAt(0) + role.slice(1).toLowerCase()}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: 'var(--ink-4)' }}>{emp.position}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="pill" style={{ color: 'var(--success)', background: 'rgba(74, 124, 89, 0.1)', borderColor: 'rgba(74, 124, 89, 0.2)' }}>
                          <span className="status-dot" style={{ background: 'var(--success)' }} />
                          {emp.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {(() => {
                          const name = `${emp.firstName} ${emp.lastName}`.trim();
                          const enrolled = faceEnrolled.has(String(emp._id));
                          return (
                            <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <span className="pill shrink-0" style={enrolled
                                ? { color: 'var(--success)', background: 'rgba(74, 124, 89, 0.1)', borderColor: 'rgba(74, 124, 89, 0.2)' }
                                : { color: 'var(--ink-4)', background: 'var(--surface-2)', borderColor: 'var(--border)' }}>
                                <ScanFace size={11} />
                                {enrolled ? 'Set up' : 'Not set up'}
                              </span>
                              <button
                                onClick={() => setFaceFor({ id: emp._id, name })}
                                className="btn btn-ghost px-2 py-1 rounded-lg text-xs"
                                title={enrolled ? 'Set up Face ID again' : 'Set up Face ID'}
                              >
                                {enrolled ? 'Redo' : 'Set up'}
                              </button>
                              {enrolled && (
                                <button
                                  onClick={() => removeFace(emp._id, name)}
                                  className="btn btn-ghost px-2 py-1 rounded-lg text-xs"
                                  style={{ color: 'var(--ink-4)' }}
                                  title="Remove Face ID"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditing({ id: emp._id, firstName: emp.firstName, lastName: emp.lastName, email: emp.email, department: emp.department, position: emp.position, role, status: emp.status, password: '' });
                              setFormError('');
                            }}
                            className="btn btn-ghost p-2 rounded-lg text-xs"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(emp._id)}
                            className="btn btn-ghost p-2 rounded-lg text-xs"
                            style={{ color: 'var(--ink-4)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--error)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--ink-4)')}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {faceFor && (
        <FaceEnrollModal
          employeeId={faceFor.id}
          employeeName={faceFor.name}
          onClose={() => setFaceFor(null)}
          onEnrolled={fetchFaceStatus}
        />
      )}
      {showAdd && (
        <Modal title="Add team member" onClose={() => { setShowAdd(false); setFormError(''); }}>
          <EmpForm data={newEmp} setData={setNewEmp} onSubmit={handleAdd} isEdit={false} />
        </Modal>
      )}
      {editing && (
        <Modal title="Edit team member" onClose={() => { setEditing(null); setFormError(''); }}>
          <EmpForm data={editing} setData={setEditing} onSubmit={handleEdit} isEdit={true} />
        </Modal>
      )}
    </div>
  );
};

export default Employees;
