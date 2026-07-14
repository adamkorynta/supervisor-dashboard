/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useMemo, useState } from 'react';
import { startOfDay, endOfDay } from 'date-fns';
import { useData } from '@/lib/DataContext';
import { queryData } from '@/lib/queryEngine';
import {
  getFridayPostingDate,
  getWeightedTargetForEntries,
  getWeightedTargetForProjections,
  normalizeTargetPercentage
} from '@/lib/dashboardMetrics';
import AnalyticsChart from '@/components/AnalyticsChart';
import DrillDownModal from '@/components/DrillDownModal';
import { Building2, Clock, Users, Briefcase, AlertCircle, List, Handshake, TrendingUp } from 'lucide-react';
import { formatHours, TimesheetEntry } from '@/types';

export default function BranchDashboard() {
  const { data, timeRange } = useData();
  const [drillDownEntries, setDrillDownEntries] = useState<TimesheetEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDataPointClick = (entries: TimesheetEntry[]) => {
    setDrillDownEntries(entries);
    setIsModalOpen(true);
  };

  const filteredEntriesByTime = useMemo(() => {
    if (!data) return [];
    if (!timeRange) return data.entries;
    
    const startTime = startOfDay(timeRange.start).getTime();
    const endTime = endOfDay(timeRange.end).getTime();
    
    return data.entries.filter(d => {
      const entryTime = d.date.getTime();
      return entryTime >= startTime && entryTime <= endTime;
    });
  }, [data, timeRange]);

  const handleViewAllRecords = () => {
    setDrillDownEntries(filteredEntriesByTime);
    setIsModalOpen(true);
  };

  const branchMetrics = useMemo(() => {
    if (!data) return [];
    return queryData(data.entries, {
      metrics: ['totalHours', 'billablePercentage', 'bizDevPercentage', 'revisedUtilization', 'projectCount', 'employeeCount'],
      timeRange: timeRange || undefined
    });
  }, [data, timeRange]);

  const employeeTargets = useMemo(() => {
    const targets = new Map<string, number>();
    data?.supervisors.forEach(mapping => {
      const target = normalizeTargetPercentage(mapping.utilizationGoal);
      if (target !== null) targets.set(mapping.employeeName, target);
    });
    data?.entries.forEach(entry => {
      const target = normalizeTargetPercentage(entry.utilizationGoal);
      if (target !== null) targets.set(entry.employeeName, target);
    });
    return targets;
  }, [data]);

  const branchEmployeeNames = useMemo(() => {
    const names = new Set<string>();
    data?.entries.forEach(entry => {
      if (entry.employeeName) names.add(entry.employeeName);
    });
    return names;
  }, [data]);

  const metrics = useMemo(() => {
    const baseMetrics = branchMetrics[0] || {};
    if (!data) return baseMetrics;

    const projectedRows = (data.projections || []).filter(projection => {
      if (branchEmployeeNames.size > 0 && !branchEmployeeNames.has(projection.employeeName)) return false;
      if (!timeRange) return true;

      const projectionTime = getFridayPostingDate(projection.date).getTime();
      return projectionTime >= startOfDay(timeRange.start).getTime()
        && projectionTime <= endOfDay(timeRange.end).getTime();
    });
    const averageTarget = getWeightedTargetForEntries(filteredEntriesByTime, employeeTargets)
      ?? getWeightedTargetForProjections(projectedRows, employeeTargets);

    return {
      ...baseMetrics,
      averageTarget
    };
  }, [branchMetrics, data, branchEmployeeNames, filteredEntriesByTime, employeeTargets, timeRange]);

  const itIssues = useMemo(() => {
    if (filteredEntriesByTime.length === 0) return { totalHours: 0, entries: [] };
    
    const entries = filteredEntriesByTime.filter(entry => entry.category === 'IT');
    return {
      totalHours: entries.reduce((sum, entry) => sum + entry.hours, 0),
      entries
    };
  }, [filteredEntriesByTime]);

  const branchUtilizationStatus = useMemo(() => {
    if (metrics.averageTarget === null || metrics.averageTarget === undefined) {
      return { color: 'text-primary', label: '' };
    }
    const util = metrics.revisedUtilization || 0;
    const diff = util - metrics.averageTarget;
    
    if (diff >= 5) return { color: 'text-success', label: 'Exceeds Target' };
    if (diff <= -5) return { color: 'text-danger', label: 'Underperforming' };
    return { color: 'text-info', label: 'On Track' };
  }, [metrics]);
  
  const topProjectsData = useMemo(() => {
    if (!data) return { projects: [], employees: [] };
    
    // 1. Get the top 5 billable projects by total hours
    const projects = queryData(data.entries, {
      groupBy: 'project',
      filters: [{ field: 'billable', operator: 'eq', value: true }],
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      limit: 5,
      timeRange: timeRange || undefined
    });

    if (projects.length === 0) return { projects: [], employees: [] };

    const topProjectNames = projects.map((p: any) => p.project);
    
    // 2. Get the breakdown of hours by project and employee for these top projects
    const entriesInTopProjects = data.entries.filter(e => 
      e.billable && topProjectNames.includes(e.project)
    );

    // Filter by time range if provided
    let filteredEntries = entriesInTopProjects;
    if (timeRange) {
      const startTime = startOfDay(timeRange.start).getTime();
      const endTime = endOfDay(timeRange.end).getTime();
      filteredEntries = filteredEntries.filter(d => {
        const entryTime = d.date.getTime();
        return entryTime >= startTime && entryTime <= endTime;
      });
    }

    // 3. Aggregate hours by Project AND Employee, and track total employee hours for sorting
    const projectEmployeeMap = new Map<string, Map<string, number>>();
    const employeeTotalHoursMap = new Map<string, number>();

    filteredEntries.forEach(entry => {
      const projectName = entry.project;
      const employeeName = entry.employeeName || 'Unknown';
      
      // Update per-project employee mapping
      if (!projectEmployeeMap.has(projectName)) {
        projectEmployeeMap.set(projectName, new Map());
      }
      const employeeMap = projectEmployeeMap.get(projectName)!;
      employeeMap.set(employeeName, (employeeMap.get(employeeName) || 0) + entry.hours);

      // Update global employee contribution for sorting
      employeeTotalHoursMap.set(employeeName, (employeeTotalHoursMap.get(employeeName) || 0) + entry.hours);
    });

    // 4. Create the final data structure for the stacked chart
    // Each project should be an object with employee names as keys
    const chartData = projects.map((p: any) => {
      const row: any = { 
        project: p.project,
        originalEntries: p.originalEntries // Pass original entries for drill-down
      };
      const employeeMap = projectEmployeeMap.get(p.project);
      if (employeeMap) {
        employeeMap.forEach((hours, employee) => {
          row[employee] = hours;
        });
      }
      return row;
    });

    if (filteredEntries.length === 0) return { projects: chartData, employees: [] };

    // Sort employees by their total contribution (ascending) so largest stacks are at the top
    const sortedEmployees = Array.from(employeeTotalHoursMap.entries())
      .sort((a, b) => a[1] - b[1]) // Sort by total hours ascending
      .map(([name]) => name);

    return {
      projects: chartData,
      employees: sortedEmployees
    };
  }, [data, timeRange]);

  const adminTasks = useMemo(() => {
    if (!data) return [];
    
    return queryData(data.entries, {
      groupBy: 'project',
      filters: [{ field: 'category', operator: 'in', value: ['Admin', 'PPL', 'Holiday', 'Corporate'] }],
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    });
  }, [data, timeRange]);

  const bizDevTasks = useMemo(() => {
    if (!data) return [];
    
    return queryData(data.entries, {
      groupBy: 'project',
      filters: [{ field: 'category', operator: 'eq', value: 'BizDev' }],
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    });
  }, [data, timeRange]);

  const unaccountedTasks = useMemo(() => {
    if (!data) return [];
    
    const results = queryData(data.entries, {
      groupBy: 'project',
      filters: [{ field: 'category', operator: 'eq', value: 'Other' }],
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    });

    // Filter out entries with 0 hours to avoid showing empty charts
    return results.filter((r: any) => r.totalHours > 0);
  }, [data, timeRange]);

  const categoryDistribution = useMemo(() => {
    if (!data) return [];
    
    const results = queryData(data.entries, {
      groupBy: 'category',
      metrics: ['totalHours'],
      timeRange: timeRange || undefined
    });

    const categoryMap: Record<string, string> = {
      'Billable': 'Billable',
      'Admin': 'Admin',
      'PPL': 'PPL',
      'Holiday': 'Holiday',
      'Corporate': 'Admin',
      'BizDev': 'Business Dev',
      'Other': 'Other'
    };

    const categories: Record<string, number> = {
      'Billable': 0,
      'Admin': 0,
      'PPL': 0,
      'Holiday': 0,
      'Business Dev': 0,
      'Other': 0
    };

    const categoryEntries: Record<string, TimesheetEntry[]> = {};

    if (results.length === 0) {
      // Return empty array to trigger "No data available" in AnalyticsChart
      return [];
    }

    results.forEach((r: any) => {
      const targetCategory = categoryMap[r.category] || 'Other';
      if (categories.hasOwnProperty(targetCategory)) {
        categories[targetCategory] += r.totalHours;
        
        // Track original entries for drill-down
        if (!categoryEntries[targetCategory]) categoryEntries[targetCategory] = [];
        categoryEntries[targetCategory].push(...r.originalEntries);
      } else {
        categories['Other'] += r.totalHours;
        if (!categoryEntries['Other']) categoryEntries['Other'] = [];
        categoryEntries['Other'].push(...r.originalEntries);
      }
    });

    const finalData = Object.entries(categories)
      .map(([name, totalHours]) => ({
        name,
        totalHours,
        originalEntries: categoryEntries[name] || []
      }))
      .filter(item => item.totalHours > 0);
    
    return finalData;
  }, [data, timeRange]);

  const parseProject = (projectStr: string) => {
    let code = '-';
    let name = projectStr || '';

    if (name.includes('|')) {
      const parts = name.split('|');
      code = parts[0].trim();
      name = parts[1]?.trim() || parts[0].trim();
    } else if (name.includes('-')) {
      const parts = name.split('-');
      const firstPart = parts[0].trim();
      if (/^\d+$/.test(firstPart)) {
        code = firstPart;
        name = name.substring(name.indexOf('-') + 1).trim();
      }
    }
    return { code, name };
  };

  if (!data) return null;

  return (
    <div className="container-fluid p-0">
      <DrillDownModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        entries={drillDownEntries} 
      />
      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
            <Building2 size={24} />
          </div>
          <div>
            <h4 className="fw-bold mb-0">Branch Statistics</h4>
            <p className="text-muted small mb-0">Comprehensive performance overview</p>
          </div>
          <button 
            onClick={handleViewAllRecords}
            className="btn btn-outline-primary d-flex align-items-center gap-2 px-3 fw-bold ms-md-auto text-nowrap"
          >
            <List size={18} />
            <span>View All Records</span>
          </button>
        </div>
      </div>

      <div className="supervisor-metric-grid mb-4">
        <div>
          <MetricCard title="Branch Hours" value={formatHours(metrics?.totalHours)} icon={<Clock size={20} />} />
        </div>
        <div>
          <MetricCard title="Active Team" value={metrics?.employeeCount || '0'} icon={<Users size={20} />} color="text-info" />
        </div>
        <div>
          <MetricCard title="Billable %" value={`${metrics?.billablePercentage?.toFixed(2) || '0'}%`} icon={<Briefcase size={20} />} color="text-warning" />
        </div>
        <div>
          <MetricCard title="BizDev %" value={`${metrics?.bizDevPercentage?.toFixed(2) || '0'}%`} icon={<Handshake size={20} />} color="text-primary" />
        </div>
        <div>
          <MetricCard 
            title="Revised Util." 
            value={`${metrics?.revisedUtilization?.toFixed(2) || '0'}%`} 
            icon={<TrendingUp size={20} />} 
            color={branchUtilizationStatus.color}
            subtitle={branchUtilizationStatus.label}
          />
        </div>
        <div>
          <MetricCard title="IT Issues" value={formatHours(itIssues.totalHours)} icon={<AlertCircle size={20} />} color="text-danger" onClick={() => itIssues.entries.length > 0 && handleDataPointClick(itIssues.entries)} />
        </div>
        <div>
          <MetricCard title="Avg Target" value={metrics?.averageTarget !== null && metrics?.averageTarget !== undefined ? `${metrics?.averageTarget?.toFixed(2)}%` : 'N/A'} icon={<TrendingUp size={20} />} color="text-muted" />
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100 overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Task Type Split</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart 
                spec={{
                  type: 'pie',
                  xField: 'name',
                  yField: 'totalHours',
                  formatting: { decimalPlaces: 2 }
                }} 
                data={categoryDistribution} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100 overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Overhead Distribution</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart 
                spec={{
                  type: 'pie',
                  xField: 'project',
                  yField: 'totalHours',
                  formatting: { decimalPlaces: 2 }
                }} 
                data={adminTasks} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Top 5 Billable Projects (hours)</h6>
            </div>
            <div className="card-body" style={{ minHeight: '450px' }}>
              <AnalyticsChart 
                spec={{
                  type: 'bar',
                  xField: 'project',
                  yField: 'totalHours',
                  series: topProjectsData.employees,
                  hideLegend: true,
                  formatting: { decimalPlaces: 2 }
                }} 
                data={topProjectsData.projects} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm mb-4 overflow-hidden">
        <div className="card-header bg-white border-bottom-0 pt-4 px-4">
          <h6 className="metric-label mb-0">Business Development</h6>
        </div>
        <div className="card-body">
          {bizDevTasks.length > 0 ? (
            <div className="d-flex flex-column h-100">
              <div className="table-responsive flex-grow-1">
                <table className="table table-sm table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="px-3 border-0 small text-muted text-uppercase">Project Name</th>
                      <th className="px-3 border-0 small text-muted text-uppercase text-end">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bizDevTasks.map((p: any) => {
                      const { name } = parseProject(p.project);
                      return (
                        <tr 
                          key={p.project} 
                          onClick={() => handleDataPointClick(p.originalEntries)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="px-3 border-0 small fw-bold">{name}</td>
                          <td className="px-3 border-0 text-end font-monospace small">{formatHours(p.totalHours)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="text-center py-5 text-muted">
              No business development data for this period.
            </div>
          )}
        </div>
      </div>

      {unaccountedTasks.length > 0 && (
        <div className="card border-0 shadow-sm border-start border-4 border-danger overflow-hidden">
          <div className="card-header bg-white border-bottom-0 pt-4 px-4">
            <div className="d-flex align-items-center text-danger">
              <AlertCircle size={20} className="me-2" />
              <h6 className="metric-label mb-0 text-danger">Unaccounted Time</h6>
            </div>
          </div>
          <div className="card-body">
            <p className="text-muted small mb-4">
              Tasks that are non-billable and do not fall under Admin, PPL, or Business Development.
            </p>
            <AnalyticsChart 
              spec={{
                type: 'bar',
                xField: 'project',
                yField: 'totalHours',
                formatting: { decimalPlaces: 2 }
              }} 
              data={unaccountedTasks} 
              onDataPointClick={handleDataPointClick}
            />
            
            <div className="table-responsive mt-4">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th className="px-3 border-0 small text-muted text-uppercase">Project Name</th>
                    <th className="px-3 border-0 small text-muted text-uppercase text-end">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {unaccountedTasks.map((p: any) => {
                    const { name } = parseProject(p.project);
                    return (
                      <tr 
                        key={p.project} 
                        onClick={() => handleDataPointClick(p.originalEntries)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="px-3 border-0 small fw-bold">{name}</td>
                        <td className="px-3 border-0 text-end font-monospace small">{formatHours(p.totalHours)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, icon, color, subtitle, tooltip, onClick }: { title: string; value: string | number; icon: React.ReactNode; color?: string; subtitle?: string; tooltip?: string; onClick?: () => void }) {
  return (
    <div
      className={`dashboard-card d-flex flex-column justify-content-between ${onClick ? 'cursor-pointer' : ''}`}
      title={tooltip}
      onClick={onClick}
    >
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div className={`p-2 rounded-2 bg-light ${color || 'text-primary'}`}>
          {icon}
        </div>
        {subtitle && (
          <span className={`small fw-bold ${color}`}>{subtitle}</span>
        )}
      </div>
      <div>
        <div className="metric-label">{title}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}
