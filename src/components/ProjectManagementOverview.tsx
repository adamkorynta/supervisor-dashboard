/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useEffect, useState } from 'react';
import { BriefcaseBusiness, CalendarClock, CircleAlert, CircleCheck, CircleHelp, Search } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useData } from '@/lib/DataContext';
import { buildProjectSummaries, ProjectRisk, ProjectSummary } from '@/lib/projectAnalytics';
import { formatCurrency } from '@/types';
import { format } from 'date-fns';

interface ProjectManagementOverviewProps {
  onSelectProject: (projectCode: string) => void;
}

const riskStyles: Record<ProjectRisk, { label: string; color: string; badge: string; icon: React.ReactNode }> = {
  'on-track': { label: 'On target', color: '#198754', badge: 'bg-success-subtle text-success', icon: <CircleCheck size={16} /> },
  watch: { label: 'Watch', color: '#f0ad4e', badge: 'bg-warning-subtle text-warning', icon: <CalendarClock size={16} /> },
  'at-risk': { label: 'At risk', color: '#dc3545', badge: 'bg-danger-subtle text-danger', icon: <CircleAlert size={16} /> },
  'over-budget': { label: 'Over budget', color: '#842029', badge: 'bg-danger text-white', icon: <CircleAlert size={16} /> },
  unknown: { label: 'Unknown', color: '#6c757d', badge: 'bg-secondary-subtle text-secondary', icon: <CircleHelp size={16} /> }
};

export default function ProjectManagementOverview({ onSelectProject }: ProjectManagementOverviewProps) {
  const { data } = useData();
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!data) {
      setSummaries([]);
      setIsProcessing(false);
      return;
    }

    setIsProcessing(true);
    const timeoutId = window.setTimeout(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

      const nextSummaries = buildProjectSummaries(data.projects || [], data.entries).sort((a, b) => {
      const aFinishDate = a.project.finishDate || a.project.dueDate;
      const bFinishDate = b.project.finishDate || b.project.dueDate;
      const aIsPast = aFinishDate ? aFinishDate.getTime() < today.getTime() : false;
      const bIsPast = bFinishDate ? bFinishDate.getTime() < today.getTime() : false;

      if (aIsPast !== bIsPast) return aIsPast ? 1 : -1;

      const managerCompare = (a.project.projectManager || '').localeCompare(b.project.projectManager || '');
      return managerCompare || b.effortSpent - a.effortSpent;
    });

      setSummaries(nextSummaries);
      setIsProcessing(false);
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [data]);

  if (!data) return null;

  const filteredSummaries = searchTerm.trim()
    ? summaries.filter(summary => {
      const lowerSearch = searchTerm.toLowerCase();
      return summary.project.projectName.toLowerCase().includes(lowerSearch) ||
        summary.project.projectCode.toLowerCase().includes(lowerSearch) ||
        (summary.project.projectManager || '').toLowerCase().includes(lowerSearch);
    })
    : summaries;

  if (!data.projects || data.projects.length === 0) {
    return (
      <div className="card border-0 shadow-sm p-5 text-center">
        <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 mx-auto mb-3">
          <BriefcaseBusiness size={28} />
        </div>
        <h4 className="fw-bold">Project snapshot needed</h4>
        <p className="text-muted mb-0">Upload the Organization Project Summary export in Data Management to populate project management analytics.</p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
            <BriefcaseBusiness size={24} />
          </div>
          <div>
            <h4 className="fw-bold mb-0">Project Management Overview</h4>
            <p className="text-muted small mb-0">Project budget, burn rate, and delivery risk by manager</p>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm overflow-hidden position-relative">
        {isProcessing && (
          <div
            className="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center bg-white bg-opacity-75"
            style={{ zIndex: 2, minHeight: '240px' }}
          >
            <div className="spinner-border text-primary mb-3" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <div className="fw-bold text-primary">Processing project overview...</div>
            <div className="small text-muted">Cross-referencing project snapshots with timesheet effort</div>
          </div>
        )}
        <div className="card-header bg-white pt-4 px-4">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <h6 className="metric-label mb-0">Project Burn Risk</h6>
            <div className="position-relative" style={{ width: 'min(100%, 360px)' }}>
              <Search size={16} className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
              <input
                type="search"
                className="form-control form-control-sm ps-5"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="px-4 border-0 small text-muted text-uppercase">Project</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Manager</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Spent</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Budget</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Remaining</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Weekly Burn</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Monthly Burn</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Trend</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Start</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Finish</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.map(summary => {
                const riskStyle = riskStyles[summary.risk];
                return (
                  <tr key={summary.project.id} onClick={() => onSelectProject(summary.project.projectCode)} style={{ cursor: 'pointer' }}>
                    <td className="px-4 py-3">
                      <div className="fw-bold text-dark">{summary.project.projectName}</div>
                      <div className="small text-muted">{summary.project.projectCode}</div>
                    </td>
                    <td className="px-4 py-3 small">{summary.project.projectManager || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-end fw-bold">{formatCurrency(summary.effortSpent)}</td>
                    <td className="px-4 py-3 text-end">{formatCurrency(summary.budgetHours)}</td>
                    <td className={`px-4 py-3 text-end fw-bold ${summary.remainingHours < 0 ? 'text-danger' : 'text-success'}`}>{formatCurrency(summary.remainingHours)}</td>
                    <td className="px-4 py-3 text-end">{formatCurrency(summary.weeklyBurnRate)}</td>
                    <td className="px-4 py-3 text-end">{formatCurrency(summary.monthlyBurnRate)}</td>
                    <td className="px-4 py-3" title={summary.riskDescription}>
                      <div className="d-flex align-items-center gap-2">
                        <span className={`badge rounded-pill d-inline-flex align-items-center gap-1 ${riskStyle.badge}`}>
                          {riskStyle.icon}{riskStyle.label}
                        </span>
                        <div style={{ width: 90, height: 28, position: 'relative' }}>
                          <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <LineChart data={summary.sparkline.length ? summary.sparkline : [{ label: 'No data', hours: 0 }]}>
                              <Tooltip formatter={(value) => [formatCurrency(Number(value || 0)), 'Weekly effort']} labelFormatter={(label) => String(label)} />
                              <Line type="monotone" dataKey="hours" stroke={riskStyle.color} strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 small text-muted">{summary.project.startDate ? format(summary.project.startDate, 'MMM d, yyyy') : '-'}</td>
                    <td className="px-4 py-3 small text-muted">{summary.project.finishDate || summary.project.dueDate ? format(summary.project.finishDate || summary.project.dueDate!, 'MMM d, yyyy') : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isProcessing && filteredSummaries.length === 0 && (
            <div className="text-center py-5 text-muted">
              No projects match your search.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
