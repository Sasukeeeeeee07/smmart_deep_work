import React, { useState, useEffect } from 'react';
import { User, Mail, Phone, Briefcase, Target, Clock, Shield, Check, Save, Coins, Building2, CalendarDays, BadgeCheck } from 'lucide-react';
import { formatRupees, timeValue, WORKING_DAYS_PER_YEAR, WORKING_HOURS_PER_DAY } from '../utils/timeCurrency';

const WORK_EXPERIENCE = [
  {
    company: 'Scad Technologies',
    role: 'Software Developer',
    period: 'Dec 2025 – Present',
    type: 'Full-time',
    current: true,
    note: '',
  },
  {
    company: 'Cognifyz IT Solutions Pvt. Ltd.',
    role: 'Software Development Intern',
    period: '19 Jun 2026 – 19 Jul 2026',
    type: 'Internship',
    current: false,
    note: 'Internship Completion Certificate issued 19 Jul 2026',
  },
];

export default function Profile() {
  const userStr = localStorage.getItem('user');
  const initialUser = userStr ? JSON.parse(userStr) : null;
  const workspaceMode = localStorage.getItem('workspaceMode') || 'individual';

  const [formData, setFormData] = useState({
    name: initialUser?.name || `${initialUser?.firstName || ''} ${initialUser?.lastName || ''}`.trim() || 'Focus Professional',
    email: initialUser?.email || 'user@smmart.ai',
    phone: initialUser?.phone || '+91 98765 43210',
    designation: initialUser?.designation || (workspaceMode === 'individual' ? 'Solo Performer' : 'Executive Leader'),
    department: initialUser?.department || 'Deep Work & Strategy',
    dailyTargetHours: initialUser?.dailyTargetHours || '4',
    preferredBreakInterval: initialUser?.preferredBreakInterval || '45',
    focusMotto: initialUser?.focusMotto || 'Deep work is the superpower of the 21st century.',
    annualIncome: '',
  });

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    document.title = 'Profile — smmart Desk';
    // Load any saved local profile overrides
    const savedProfile = localStorage.getItem('smmart_profile');
    if (savedProfile) {
      try {
        setFormData(prev => ({ ...prev, ...JSON.parse(savedProfile) }));
      } catch {}
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Update local storage user
    const updatedUser = {
      ...(initialUser || {}),
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      designation: formData.designation,
      department: formData.department,
    };
    localStorage.setItem('user', JSON.stringify(updatedUser));
    localStorage.setItem('smmart_profile', JSON.stringify(formData));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12 animate-fade-in select-none">
      {/* Top Banner / Header */}
      <div
        className="p-6 md:p-8 rounded-3xl border shadow-xs relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(11, 94, 215, 0.08) 0%, rgba(74, 124, 89, 0.04) 100%)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-md shrink-0"
              style={{ background: 'var(--forest)' }}
            >
              {formData.name
                .split(' ')
                .map((n: string) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight" style={{ fontFamily: 'DM Sans, sans-serif', color: 'var(--ink)' }}>
                  {formData.name}
                </h1>
                <span
                  className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-wider"
                  style={{
                    background: 'rgba(11, 94, 215, 0.1)',
                    borderColor: 'rgba(11, 94, 215, 0.25)',
                    color: 'var(--forest)',
                  }}
                >
                  {workspaceMode === 'individual' ? 'Individual Mode' : 'Entrepreneur Mode'}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-4)' }}>
                {formData.designation} • {formData.department}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5" style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--ink-3)' }}>
              <Shield size={13} style={{ color: 'var(--forest)' }} />
              <span>Verified Desk User</span>
            </span>
          </div>
        </div>
      </div>

      {/* Main Form Card */}
      <form onSubmit={handleSubmit} className="p-6 md:p-8 rounded-3xl border shadow-xs space-y-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
              Personal & Professional Profile
            </h2>
            <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
              Configure your user identity, deep work targets, and focus habits
            </p>
          </div>
          {saved && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 text-xs font-bold animate-fade-in">
              <Check size={14} />
              <span>Changes Saved!</span>
            </div>
          )}
        </div>

        {/* Input Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <User size={13} />
              <span>Full Name</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
              placeholder="e.g. Sarah Jenkins"
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <Mail size={13} />
              <span>Email Address</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
              placeholder="user@smmart.ai"
            />
          </div>

          {/* Phone */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <Phone size={13} />
              <span>Contact Phone</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
              placeholder="+91 98765 43210"
            />
          </div>

          {/* Designation */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <Briefcase size={13} />
              <span>Designation / Role</span>
            </label>
            <input
              type="text"
              name="designation"
              value={formData.designation}
              onChange={handleChange}
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
              placeholder="Senior Strategist"
            />
          </div>

          {/* Daily Deep Work Target */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <Target size={13} />
              <span>Daily Deep Work Goal (Hours)</span>
            </label>
            <select
              name="dailyTargetHours"
              value={formData.dailyTargetHours}
              onChange={handleChange}
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
            >
              <option value="2">2 Hours (Standard)</option>
              <option value="3">3 Hours (Intensive)</option>
              <option value="4">4 Hours (High Performer)</option>
              <option value="6">6 Hours (Extreme Flow)</option>
            </select>
          </div>

          {/* Preferred Break Interval */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
              <Clock size={13} />
              <span>Focus Pacing Interval</span>
            </label>
            <select
              name="preferredBreakInterval"
              value={formData.preferredBreakInterval}
              onChange={handleChange}
              className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
            >
              <option value="30">30 minutes focus block</option>
              <option value="45">45 minutes focus block</option>
              <option value="60">60 minutes focus block</option>
              <option value="90">90 minutes ultradian block</option>
            </select>
          </div>
        </div>

        {/* Annual income -> value of your time */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
            <Coins size={13} />
            <span>Annual Income (₹)</span>
          </label>
          <input
            type="number"
            name="annualIncome"
            min="0"
            inputMode="numeric"
            value={formData.annualIncome}
            onChange={handleChange}
            className="input-base text-xs py-2 px-3.5 rounded-xl w-full"
            placeholder="e.g. 1000000"
          />
          {Number(formData.annualIncome) > 0 && (() => {
            const tv = timeValue(Number(formData.annualIncome));
            return (
              <p className="text-xs font-semibold flex items-center gap-4 flex-wrap pt-1" style={{ color: 'var(--ink-2)' }}>
                <span>Per day: <strong style={{ color: 'var(--ink)' }}>{formatRupees(tv.perDay)}</strong></span>
                <span>Per minute: <strong style={{ color: 'var(--ink)' }}>{formatRupees(tv.perMinute, 2)}</strong></span>
                <span style={{ color: 'var(--ink-4)' }}>({WORKING_DAYS_PER_YEAR} working days × {WORKING_HOURS_PER_DAY} hrs)</span>
              </p>
            );
          })()}
        </div>

        {/* Focus Motto / Vision */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-3)' }}>
            Personal Focus Objective / Motto
          </label>
          <textarea
            name="focusMotto"
            rows={2}
            value={formData.focusMotto}
            onChange={handleChange}
            className="input-base text-xs py-2 px-3.5 rounded-xl w-full resize-none"
            placeholder="Write your primary deep work motivation..."
          />
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-sm text-white transition-all hover:opacity-95"
            style={{ background: 'var(--forest)' }}
          >
            <Save size={14} />
            <span>Save Profile</span>
          </button>
        </div>
      </form>

      {/* Work Experience */}
      <div className="p-6 md:p-8 rounded-3xl border shadow-xs space-y-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="border-b pb-4" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)', fontFamily: 'DM Sans, sans-serif' }}>
            Work Experience
          </h2>
          <p className="text-xs" style={{ color: 'var(--ink-4)' }}>
            Professional roles and internships
          </p>
        </div>

        <ol className="space-y-5">
          {WORK_EXPERIENCE.map((job, i) => (
            <li key={job.company} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center border"
                  style={{
                    background: job.current ? 'rgba(11, 94, 215, 0.1)' : 'var(--surface)',
                    borderColor: job.current ? 'rgba(11, 94, 215, 0.25)' : 'var(--border)',
                    color: 'var(--forest)',
                  }}
                >
                  <Building2 size={18} />
                </div>
                {i < WORK_EXPERIENCE.length - 1 && (
                  <div className="w-px flex-1 mt-2" style={{ background: 'var(--border)' }} />
                )}
              </div>

              <div className="min-w-0 flex-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{job.role}</h3>
                  {job.current && (
                    <span
                      className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border tracking-wider"
                      style={{ background: 'rgba(11, 94, 215, 0.1)', borderColor: 'rgba(11, 94, 215, 0.25)', color: 'var(--forest)' }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--ink-2)' }}>{job.company}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: 'var(--ink-4)' }}>
                  <span className="flex items-center gap-1.5">
                    <CalendarDays size={13} />
                    {job.period}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Briefcase size={13} />
                    {job.type}
                  </span>
                </div>
                {job.note && (
                  <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: 'var(--ink-3)' }}>
                    <BadgeCheck size={13} style={{ color: 'var(--forest)' }} />
                    {job.note}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
