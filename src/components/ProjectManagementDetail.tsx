/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarClock, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleHelp, List, Search } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';
import { useData } from '@/lib/DataContext';
import AnalyticsChart from '@/components/AnalyticsChart';
import DrillDownModal from '@/components/DrillDownModal';
import {
  buildContributorData,
  buildContributorEffortData,
  buildFundingRemainingTimeSeries,
  buildProjectSummary,
  buildProjectTaskSummaries,
  buildProjectTimeSeries,
  buildTaskContributorData,
  buildTaskEffortTimeSeries,
  buildTaskFundingRemainingTimeSeries,
  getProjectDisplayName,
  getProjectEntries,
  ProjectRisk
} from '@/lib/projectAnalytics';
import { formatCurrency, TimesheetEntry } from '@/types';
import { format } from 'date-fns';

interface ProjectManagementDetailProps {
  selectedProjectCode?: string;
  onSelectedProjectChange?: (projectCode: string) => void;
}

const riskStyles: Record<ProjectRisk, { label: string; color: string; badge: string; icon: React.ReactNode }> = {
  'on-track': { label: 'On target', color: '#198754', badge: 'bg-success-subtle text-success', icon: <CircleCheck size={16} /> },
  watch: { label: 'Watch', color: '#f0ad4e', badge: 'bg-warning-subtle text-warning', icon: <CalendarClock size={16} /> },
  'at-risk': { label: 'At risk', color: '#dc3545', badge: 'bg-danger-subtle text-danger', icon: <CircleAlert size={16} /> },
  'over-budget': { label: 'Over budget', color: '#842029', badge: 'bg-danger text-white', icon: <CircleAlert size={16} /> },
  unknown: { label: 'Unknown', color: '#6c757d', badge: 'bg-secondary-subtle text-secondary', icon: <CircleHelp size={16} /> }
};

export default function ProjectManagementDetail({ selectedProjectCode, onSelectedProjectChange }: ProjectManagementDetailProps) {
  const { data } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [localSelectedCode, setLocalSelectedCode] = useState(selectedProjectCode || '');
  const [drillDownEntries, setDrillDownEntries] = useState<TimesheetEntry[]>([]);
  const [drillDownTitle, setDrillDownTitle] = useState('Timesheet Records');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedTaskKey, setExpandedTaskKey] = useState('');

  useEffect(() => {
    if (selectedProjectCode) setLocalSelectedCode(selectedProjectCode);
  }, [selectedProjectCode]);

  const projects = data?.projects || [];

  const selectedProject = useMemo(() => {
    if (projects.length === 0) return undefined;
    return projects.find(project => project.projectCode === localSelectedCode) || projects[0];
  }, [projects, localSelectedCode]);

  useEffect(() => {
    if (!localSelectedCode && selectedProject?.projectCode) {
      setLocalSelectedCode(selectedProject.projectCode);
      onSelectedProjectChange?.(selectedProject.projectCode);
    }
  }, [localSelectedCode, selectedProject, onSelectedProjectChange]);

  const filteredProjects = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return projects.filter(project => (
      project.projectName.toLowerCase().includes(lowerSearch) ||
      project.projectCode.toLowerCase().includes(lowerSearch) ||
      (project.projectManager || '').toLowerCase().includes(lowerSearch)
    ));
  }, [projects, searchTerm]);

  const projectEntries = useMemo(() => {
    if (!data || !selectedProject) return [];
    return getProjectEntries(data.entries, selectedProject);
  }, [data, selectedProject]);

  const summary = useMemo(() => {
    if (!selectedProject) return undefined;
    return buildProjectSummary(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const taskSummaries = useMemo(() => {
    if (!selectedProject) return [];
    return buildProjectTaskSummaries(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const timeSeries = useMemo(() => {
    if (!selectedProject) return { rows: [], series: [] };
    return buildProjectTimeSeries(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const remainingTimeSeries = useMemo(() => {
    if (!selectedProject) return { rows: [], series: [] };
    return buildFundingRemainingTimeSeries(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const taskRemainingTimeSeries = useMemo(() => {
    if (!selectedProject) return [];
    return buildTaskFundingRemainingTimeSeries(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const taskEffortTimeSeries = useMemo(() => {
    if (!selectedProject) return [];
    return buildTaskEffortTimeSeries(selectedProject, projectEntries);
  }, [selectedProject, projectEntries]);

  const taskEffortTimeSeriesByKey = useMemo(() => {
    return new Map(taskEffortTimeSeries.map(taskSeries => [
      getTaskKey(taskSeries.taskName, taskSeries.taskCode),
      taskSeries
    ]));
  }, [taskEffortTimeSeries]);

  const taskRemainingTimeSeriesByKey = useMemo(() => {
    return new Map(taskRemainingTimeSeries.map(taskSeries => [
      getTaskKey(taskSeries.taskName, taskSeries.taskCode),
      taskSeries
    ]));
  }, [taskRemainingTimeSeries]);

  const taskContributorMixByKey = useMemo(() => {
    return new Map(taskSummaries.map(task => [
      getTaskKey(task.taskName, task.taskCode),
      buildContributorEffortData(task.entries)
    ]));
  }, [taskSummaries]);

  const contributorData = useMemo(() => buildContributorData(projectEntries), [projectEntries]);

  const taskContributorData = useMemo(() => buildTaskContributorData(taskSummaries), [taskSummaries]);

  const openDrillDown = (entries: TimesheetEntry[], title: string) => {
    setDrillDownEntries(entries);
    setDrillDownTitle(title);
    setIsModalOpen(true);
  };

  useEffect(() => {
    setExpandedTaskKey('');
  }, [selectedProject?.projectCode]);

  if (!data) return null;

  if (projects.length === 0) {
    return (
      <div className="card border-0 shadow-sm p-5 text-center">
        <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 mx-auto mb-3">
          <BriefcaseBusiness size={28} />
        </div>
        <h4 className="fw-bold">Project snapshot needed</h4>
        <p className="text-muted mb-0">Upload the Organization Project Summary export in Data Management to view project detail.</p>
      </div>
    );
  }

  if (!selectedProject || !summary) return null;

  return (
    <div className="container-fluid p-0">
      <DrillDownModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        entries={drillDownEntries}
        title={drillDownTitle}
      />

      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex flex-wrap align-items-center gap-3">
          <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3">
            <BriefcaseBusiness size={24} />
          </div>
          <div className="flex-grow-1">
            <h4 className="fw-bold mb-0">Project Management Detail</h4>
            <p className="text-muted small mb-0">
              {getProjectDisplayName(selectedProject)}
              {(selectedProject.startDate || selectedProject.finishDate) && (
                <span className="ms-2">
                  {selectedProject.startDate ? format(selectedProject.startDate, 'MMM d, yyyy') : '-'} to {selectedProject.finishDate ? format(selectedProject.finishDate, 'MMM d, yyyy') : '-'}
                </span>
              )}
            </p>
          </div>
          <div className="position-relative" style={{ minWidth: 320 }}>
            <Search size={16} className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
            <input
              className="form-control ps-5"
              list="project-options"
              value={searchTerm}
              placeholder="Search projects..."
              onChange={(event) => setSearchTerm(event.target.value)}
            />
            <datalist id="project-options">
              {filteredProjects.map(project => (
                <option key={project.id} value={getProjectDisplayName(project)} />
              ))}
            </datalist>
          </div>
          <select
            className="form-select"
            style={{ maxWidth: 420 }}
            value={selectedProject.projectCode}
            onChange={(event) => {
              setLocalSelectedCode(event.target.value);
              onSelectedProjectChange?.(event.target.value);
              setSearchTerm('');
            }}
          >
            {filteredProjects.map(project => (
              <option key={project.id} value={project.projectCode}>{getProjectDisplayName(project)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard title="Effort Spent" value={formatCurrency(summary.effortSpent)} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard title="Budget Effort" value={formatCurrency(summary.budgetHours)} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard title="Remaining" value={formatCurrency(summary.remainingHours)} danger={summary.remainingHours < 0} />
        </div>
        <div className="col-12 col-sm-6 col-xl-3">
          <MetricCard title="Weekly Burn" value={formatCurrency(summary.weeklyBurnRate)} />
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white pt-4 px-4">
              <h6 className="metric-label mb-0">Monthly Project Spending</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart
                spec={{
                  type: 'line',
                  xField: 'month',
                  yField: 'total',
                  series: timeSeries.series,
                  formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                }}
                data={timeSeries.rows}
              />
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white pt-4 px-4">
              <h6 className="metric-label mb-0">Monthly Project Funding</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart
                spec={{
                  type: 'line',
                  xField: 'month',
                  yField: 'remaining',
                  series: ['remaining', 'trendline'],
                  formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                }}
                data={remainingTimeSeries.rows}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm overflow-hidden mb-4">
        <div className="card-header bg-white pt-4 px-4">
          <h6 className="metric-label mb-0">Task Budget Detail</h6>
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th className="px-4 border-0 small text-muted text-uppercase">Task</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Finish</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Effort Spent</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Budgeted Effort</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Remaining</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Weekly Burn</th>
                <th className="px-4 border-0 small text-muted text-uppercase text-end">Monthly Burn</th>
                <th className="px-4 border-0 small text-muted text-uppercase">Trend</th>
              </tr>
            </thead>
            <tbody>
              {taskSummaries.map((task, index) => {
                const riskStyle = riskStyles[task.risk];
                const taskKey = getTaskKey(task.taskName, task.taskCode);
                const taskEffortSeries = taskEffortTimeSeriesByKey.get(taskKey);
                const taskRemainingSeries = taskRemainingTimeSeriesByKey.get(taskKey);
                const taskContributorMix = taskContributorMixByKey.get(taskKey) || [];
                const hasTaskCharts = Boolean(taskEffortSeries || taskRemainingSeries);
                const isExpanded = expandedTaskKey === taskKey;
                return (
                  <React.Fragment key={`${task.taskCode || 'no-code'}-${task.taskName}-${index}`}>
                    <tr onClick={() => openDrillDown(task.entries, `${task.taskName} Records`)} style={{ cursor: task.entries.length ? 'pointer' : 'default' }}>
                      <td className="px-4 py-3">
                        <div className="d-flex align-items-start gap-2">
                          <button
                            type="button"
                            className="btn btn-link btn-sm p-0 text-primary flex-shrink-0"
                            disabled={!hasTaskCharts}
                            title={hasTaskCharts ? 'Show task charts' : 'No task charts available'}
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedTaskKey(isExpanded ? '' : taskKey);
                            }}
                            style={{ lineHeight: 1, marginTop: 2 }}
                          >
                            {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                          </button>
                          <div>
                            <div className="fw-bold">{task.taskName}</div>
                            {task.taskCode && <div className="small text-muted">Task {task.taskCode}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 small text-muted">{task.finishDate ? format(task.finishDate, 'MMM d, yyyy') : '-'}</td>
                      <td className="px-4 py-3 text-end">{formatCurrency(task.effortSpent)}</td>
                      <td className="px-4 py-3 text-end">{task.budgetHours ? formatCurrency(task.budgetHours) : '-'}</td>
                      <td className={`px-4 py-3 text-end fw-bold ${task.remainingHours < 0 ? 'text-danger' : 'text-success'}`}>
                        {task.budgetHours ? formatCurrency(task.remainingHours) : '-'}
                      </td>
                      <td className="px-4 py-3 text-end">{formatCurrency(task.weeklyBurnRate)}</td>
                      <td className="px-4 py-3 text-end">{formatCurrency(task.monthlyBurnRate)}</td>
                      <td className="px-4 py-3" title={task.riskDescription}>
                        <div className="d-flex align-items-center gap-2">
                          <span className={`badge rounded-pill d-inline-flex align-items-center gap-1 ${riskStyle.badge}`}>
                            {riskStyle.icon}{riskStyle.label}
                          </span>
                          <div style={{ width: 90, height: 28, position: 'relative' }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                              <LineChart data={task.sparkline.length ? task.sparkline : [{ label: 'No data', hours: 0 }]}>
                                <Tooltip formatter={(value) => [formatCurrency(Number(value || 0)), 'Weekly effort']} labelFormatter={(label) => String(label)} />
                                <Line type="monotone" dataKey="hours" stroke={riskStyle.color} strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && hasTaskCharts && (
                      <tr>
                        <td colSpan={8} className="bg-light px-4 py-4">
                          <div className="d-flex align-items-start justify-content-between gap-3 mb-3">
                            <div>
                              <div className="metric-label mb-1">Task Charts</div>
                              <div className="fw-bold">{task.taskName}</div>
                            </div>
                            {taskRemainingSeries && (
                              <div className="text-end">
                                <div className="small text-muted">Budget</div>
                                <div className="fw-bold text-primary">{formatCurrency(taskRemainingSeries.budgetHours)}</div>
                              </div>
                            )}
                          </div>
                          <div className="row g-4">
                            {taskEffortSeries && (
                              <div className="col-12 col-xl-6">
                                <div className="bg-white rounded-3 border p-3 h-100">
                                  <div className="metric-label mb-2">Weekly Task Spending</div>
                                  <AnalyticsChart
                                    spec={{
                                      type: 'line',
                                      xField: 'week',
                                      yField: 'total',
                                      series: taskEffortSeries.series,
                                      hideLegend: true,
                                      formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                                    }}
                                    data={taskEffortSeries.rows}
                                  />
                                </div>
                              </div>
                            )}
                            {taskRemainingSeries && (
                              <div className="col-12 col-xl-6">
                                <div className="bg-white rounded-3 border p-3 h-100">
                                  <div className="metric-label mb-2">Weekly Task Funding</div>
                                  <AnalyticsChart
                                    spec={{
                                      type: 'line',
                                      xField: 'week',
                                      yField: 'remaining',
                                      series: taskRemainingSeries.series,
                                      hideLegend: true,
                                      formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                                    }}
                                    data={taskRemainingSeries.rows}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="row g-4 mt-1">
                            <div className="col-12 col-xl-6">
                              <div className="bg-white rounded-3 border p-3 h-100">
                                <div className="metric-label mb-3">Task Burn Forecast</div>
                                <div className="row g-3">
                                  <div className="col-12 col-sm-6">
                                    <div className="small text-muted">Forecast burn</div>
                                    <div className="fw-bold fs-5">{formatCurrency(task.weightedWeeklyBurnRate || task.weeklyBurnRate)}</div>
                                    <div className="small text-muted">4-week half-life</div>
                                  </div>
                                  <div className="col-12 col-sm-6">
                                    <div className="small text-muted">Budget remaining</div>
                                    <div className={`fw-bold fs-5 ${task.remainingHours < 0 ? 'text-danger' : 'text-success'}`}>
                                      {formatCurrency(task.remainingHours)}
                                    </div>
                                  </div>
                                  <div className="col-12 col-sm-6">
                                    <div className="small text-muted">Budget runway</div>
                                    <div className="fw-bold">
                                      {task.weeksUntilBudgetExhausted !== undefined ? `${task.weeksUntilBudgetExhausted.toFixed(1)} weeks` : 'No burn yet'}
                                    </div>
                                  </div>
                                  <div className="col-12 col-sm-6">
                                    <div className="small text-muted">Budget runs out</div>
                                    <div className="fw-bold">
                                      {task.budgetExhaustionDate ? format(task.budgetExhaustionDate, 'MMM d, yyyy') : '-'}
                                    </div>
                                  </div>
                                  <div className="col-12">
                                    <div className="small text-muted">Forecast</div>
                                    <div className="small">{task.riskDescription}</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="col-12 col-xl-6">
                              <div className="bg-white rounded-3 border p-3 h-100">
                                <div className="metric-label mb-2">Contributor Mix by Task</div>
                                <AnalyticsChart
                                  spec={{
                                    type: 'pie',
                                    xField: 'employeeName',
                                    yField: 'effort',
                                    hideLegend: true,
                                    formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                                  }}
                                  data={taskContributorMix.slice(0, 8)}
                                />
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
          {taskSummaries.length === 0 && (
            <div className="text-center py-5 text-muted">No task-level rows are available for this project.</div>
          )}
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white pt-4 px-4 d-flex align-items-center justify-content-between">
              <h6 className="metric-label mb-0">Contributors</h6>
              <button
                className="btn btn-outline-primary btn-sm d-flex align-items-center gap-2"
                onClick={() => openDrillDown(projectEntries, `${selectedProject.projectName} Records`)}
              >
                <List size={16} /> Records
              </button>
            </div>
            <div className="card-body" style={{ height: 1000 }}>
              <AnalyticsChart
                spec={{
                  type: 'sankey',
                  xField: 'name',
                  yField: 'value',
                  hideLegend: true,
                  formatting: { decimalPlaces: 0, yAxisPrefix: '$' }
                }}
                data={taskContributorData.sankeyData}
                onDataPointClick={(entries) => openDrillDown(entries, 'Contributor Records')}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getTaskKey(taskName: string, taskCode?: string): string {
  return `${taskCode || 'no-code'}::${taskName}`;
}

function MetricCard({ title, value, danger }: { title: string; value: string; danger?: boolean }) {
  return (
    <div className="dashboard-card">
      <div className="metric-label">{title}</div>
      <div className={`metric-value ${danger ? 'text-danger' : ''}`}>{value}</div>
    </div>
  );
}
