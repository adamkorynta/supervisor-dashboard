/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useMemo, useState } from 'react';
import { useData } from '@/lib/DataContext';
import { queryData } from '@/lib/queryEngine';
import {
  buildWeeklyUtilizationTrend,
  getFridayPostingDate,
  getWeightedTargetForEntries,
  getWeightedTargetForProjections,
  normalizeTargetPercentage
} from '@/lib/dashboardMetrics';
import AnalyticsChart from '@/components/AnalyticsChart';
import DrillDownModal from '@/components/DrillDownModal';
import SupervisorDiagnostics from '@/components/SupervisorDiagnostics';
import { Users, Clock, Briefcase, TrendingUp, List, AlertCircle, Handshake } from 'lucide-react';
import { formatHours, TimesheetEntry } from '@/types';
import { endOfDay, startOfDay } from 'date-fns';

export default function SupervisorDashboard() {
  const { data, timeRange } = useData();
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [followChain, setFollowChain] = useState<boolean>(true);
  const [drillDownEntries, setDrillDownEntries] = useState<TimesheetEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDataPointClick = (entries: TimesheetEntry[]) => {
    setDrillDownEntries(entries);
    setIsModalOpen(true);
  };

  const handleViewAllRecords = () => {
    setDrillDownEntries(teamEntries);
    setIsModalOpen(true);
  };

  const supervisors = useMemo(() => {
    if (!data) return [];
    
    // Get all valid supervisor names from the hierarchy
    const validSupervisorNames = new Set(data.supervisors.map(s => s.supervisorName));
    
    // Filter entries by time range first
    const filteredEntries = timeRange 
      ? queryData(data.entries, { timeRange, metrics: [] })
      : data.entries;
    
    const names = new Set<string>();
    filteredEntries.forEach(e => {
      if (e.managerName && validSupervisorNames.has(e.managerName)) {
        names.add(e.managerName);
      }
    });
    return Array.from(names).sort();
  }, [data, timeRange]);

  // Set default supervisor or reset if invalid
  useMemo(() => {
    if (supervisors.length > 0) {
      if (!selectedSupervisor || !supervisors.includes(selectedSupervisor)) {
        setSelectedSupervisor(supervisors[0]);
      }
    } else if (selectedSupervisor) {
      setSelectedSupervisor('');
    }
  }, [supervisors, selectedSupervisor]);

  const teamMemberNames = useMemo(() => {
    if (!data || !selectedSupervisor) return new Set<string>();

    const members = new Set<string>();
    // Always include the supervisor themselves
    members.add(selectedSupervisor);
    
    const queue = [selectedSupervisor];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);

      // Find everyone who reports to 'current'
      const reports = data.supervisors
        .filter(s => s.supervisorName === current);
      
      reports.forEach(s => {
        members.add(s.employeeName);
        if (followChain) {
          queue.push(s.employeeName);
        }
      });
    }

    // If not followChain, we only want the supervisor and their direct reports
    if (!followChain) {
      const directReports = data.supervisors
        .filter(s => s.supervisorName === selectedSupervisor)
        .map(s => s.employeeName);
      return new Set([selectedSupervisor, ...directReports]);
    }

    return members;
  }, [data, selectedSupervisor, followChain]);

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

  const teamEntries = useMemo(() => {
    if (!data || teamMemberNames.size === 0) return [];
    
    const filteredEntries = timeRange 
      ? queryData(data.entries, { timeRange, metrics: [] })
      : data.entries;

    return filteredEntries.filter((e: any) => teamMemberNames.has(e.employeeName));
  }, [data, teamMemberNames, timeRange]);

  const teamMembers = useMemo(() => {
    if (!data || teamMemberNames.size === 0) return [];
    
    const aggregated = queryData(teamEntries, {
      groupBy: 'employeeName',
      metrics: ['totalHours', 'billablePercentage', 'bizDevPercentage', 'revisedUtilization'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    });

    // Ensure all team members from the hierarchy are included, but filter out those with 0 hours
    const result = Array.from(teamMemberNames).map(name => {
      const existing = aggregated.find((a: any) => a.employeeName === name);
      return existing || {
        employeeName: name,
        totalHours: 0,
        billablePercentage: 0,
        bizDevPercentage: 0,
        revisedUtilization: 0
      };
    }).filter(member => member.totalHours > 0);

    // Re-sort because we added potentially 0-hour members
    return result.sort((a, b) => b.totalHours - a.totalHours);
  }, [teamMemberNames, teamEntries, timeRange, data]);

  const projectWorkloadData = useMemo(() => {
    if (!data || teamMemberNames.size === 0) return { data: [], projects: [] };

    // Group entries by employee and project
    const employeeProjectMap = new Map<string, Map<string, number>>();
    const projectHoursMap = new Map<string, number>();

    teamEntries.forEach(entry => {
      const empName = entry.employeeName;
      const projName = entry.project || 'Unspecified';
      
      // Update global project hours for sorting
      projectHoursMap.set(projName, (projectHoursMap.get(projName) || 0) + entry.hours);

      if (!employeeProjectMap.has(empName)) {
        employeeProjectMap.set(empName, new Map());
      }
      const projMap = employeeProjectMap.get(empName)!;
      projMap.set(projName, (projMap.get(projName) || 0) + entry.hours);
    });

    // Pivot the data for the stacked bar chart
    const pivoted = teamMembers.map(member => {
      const row: any = { 
        employeeName: member.employeeName,
        originalEntries: member.originalEntries // Pass original entries for drill-down
      };
      const projMap = employeeProjectMap.get(member.employeeName);
      
      if (projMap) {
        projMap.forEach((hours, proj) => {
          row[proj] = hours;
        });
      }
      return row;
    });

    // Sort projects by total hours (ascending) so they stack consistently by size with largest at top
    const sortedProjects = Array.from(projectHoursMap.keys()).sort((a, b) => {
      return (projectHoursMap.get(a) || 0) - (projectHoursMap.get(b) || 0);
    });

    return {
      data: pivoted,
      projects: sortedProjects
    };
  }, [teamMembers, teamEntries, teamMemberNames, data]);

  const teamProjectMix = useMemo(() => {
    if (teamEntries.length === 0) return [];
    return queryData(teamEntries, {
      groupBy: 'project',
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    });
  }, [teamEntries, timeRange]);

  const metrics = useMemo(() => {
    if (!data || teamMemberNames.size === 0) return null;
    const baseMetrics = queryData(teamEntries, {
      metrics: ['totalHours', 'billablePercentage', 'bizDevPercentage', 'revisedUtilization', 'projectCount'],
      timeRange: timeRange || undefined
    })[0];

    const projectedRows = (data.projections || []).filter(projection => {
      if (!teamMemberNames.has(projection.employeeName)) return false;
      if (!timeRange) return true;

      const projectionTime = getFridayPostingDate(projection.date).getTime();
      return projectionTime >= startOfDay(timeRange.start).getTime()
        && projectionTime <= endOfDay(timeRange.end).getTime();
    });
    const averageTarget = getWeightedTargetForEntries(teamEntries, employeeTargets)
      ?? getWeightedTargetForProjections(projectedRows, employeeTargets);

    return {
      ...baseMetrics,
      employeeCount: teamMemberNames.size,
      averageTarget
    };
  }, [teamMemberNames, teamEntries, data, employeeTargets, timeRange]);

  const itIssues = useMemo(() => {
    if (teamEntries.length === 0) return { totalHours: 0, entries: [] };
    
    const entries = teamEntries.filter((entry: any) => entry.category === 'IT');
    const filteredByTime = queryData(entries, {
      metrics: ['totalHours'],
      timeRange: timeRange || undefined
    });
    
    return {
      totalHours: filteredByTime[0]?.totalHours || 0,
      entries: filteredByTime[0]?.originalEntries || []
    };
  }, [teamEntries, timeRange]);

  const teamUtilizationStatus = useMemo(() => {
    if (!metrics || metrics.averageTarget === null) return { color: 'text-primary', label: '' };
    const util = metrics.revisedUtilization;
    const diff = util - metrics.averageTarget;
    
    if (diff >= 5) return { color: 'text-success', label: 'Exceeds Target' };
    if (diff <= -5) return { color: 'text-danger', label: 'Underperforming' };
    return { color: 'text-info', label: 'On Track' };
  }, [metrics]);

  const teamUtilizationTrend = useMemo(() => {
    const teamProjections = (data?.projections || []).filter(projection => teamMemberNames.has(projection.employeeName));
    if (teamEntries.length === 0 && teamProjections.length === 0) return [];

    return buildWeeklyUtilizationTrend(teamEntries, teamProjections, timeRange, employeeTargets);
  }, [teamEntries, data?.projections, teamMemberNames, timeRange, employeeTargets]);

  if (!data) return null;

  if (supervisors.length === 0) {
    return (
      <div className="p-5 text-center bg-white rounded-3 border border-light">
        <Users className="mx-auto mb-3 text-secondary" style={{ width: '3rem', height: '3rem' }} />
        <h3 className="h6 fw-bold text-dark">No supervisor data</h3>
        <p className="small text-muted">Upload a supervisor mapping file to see team analytics.</p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      <DrillDownModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        entries={drillDownEntries} 
      />

      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div className="d-flex align-items-center">
            <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
              <Users size={24} />
            </div>
            <div>
              <h4 className="fw-bold mb-0">Team Performance</h4>
              <p className="text-muted small mb-0">Supervisor & Direct Report Analytics</p>
            </div>
          </div>
          <div className="ms-md-auto d-flex align-items-center gap-3" style={{ minWidth: '480px' }}>
            <button 
              onClick={handleViewAllRecords}
              className="btn btn-outline-primary d-flex align-items-center gap-2 px-3 fw-bold text-nowrap"
            >
              <List size={18} />
              <span className="d-none d-lg-inline">View All Records</span>
            </button>
            <div className="form-check form-switch mb-0">
              <input 
                className="form-check-input" 
                type="checkbox" 
                role="switch" 
                id="followChainSwitch"
                checked={followChain}
                onChange={(e) => setFollowChain(e.target.checked)}
              />
              <label className="form-check-label small text-muted text-nowrap" htmlFor="followChainSwitch">
                Include Sub-teams
              </label>
            </div>
            <select 
              value={selectedSupervisor} 
              onChange={(e) => setSelectedSupervisor(e.target.value)}
              className="form-select border-0 bg-light fw-bold"
            >
              {supervisors.map(sup => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <SupervisorDiagnostics unmatchedEmployees={data.unmatchedEmployees} />

      <div className="supervisor-metric-grid mb-4">
        <div>
          <MetricCard title="Team Hours" value={formatHours(metrics?.totalHours)} icon={<Clock size={20} />} />
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
            color={teamUtilizationStatus.color}
            subtitle={teamUtilizationStatus.label}
          />
        </div>
        <div>
          <MetricCard title="IT Issues" value={formatHours(itIssues.totalHours)} icon={<AlertCircle size={20} />} color="text-danger" onClick={() => itIssues.entries.length > 0 && handleDataPointClick(itIssues.entries)} />
        </div>
        <div>
          <MetricCard title="Avg Target" value={metrics?.averageTarget !== null ? `${metrics?.averageTarget?.toFixed(2)}%` : 'N/A'} icon={<TrendingUp size={20} />} color="text-muted" />
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex align-items-center justify-content-between">
              <h6 className="metric-label mb-0">Team Composition</h6>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="px-4 border-0 small text-muted text-uppercase">Member</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-end">Hours</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-end">Billable</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-end">BizDev</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-end">Revised Util.</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-end">Target</th>
                      <th className="px-4 border-0 small text-muted text-uppercase text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((m: any) => {
                      const target = data.supervisors.find(s => s.employeeName === m.employeeName)?.utilizationGoal;
                      let statusColor = 'text-muted';
                      let statusLabel = '-';
                      
                      if (target !== undefined) {
                        const diff = m.revisedUtilization - target;
                        if (diff >= 5) {
                          statusColor = 'text-success';
                          statusLabel = 'Exceeds';
                        } else if (diff <= -5) {
                          statusColor = 'text-danger';
                          statusLabel = 'Under';
                        } else {
                          statusColor = 'text-info';
                          statusLabel = 'Aligned';
                        }
                      }

                      return (
                        <tr 
                          key={m.employeeName} 
                          onClick={() => handleDataPointClick(m.originalEntries)}
                          style={{ cursor: 'pointer' }}
                        >
                          <td className="px-4 border-0 fw-bold">{m.employeeName}</td>
                          <td className="px-4 border-0 text-end font-monospace">{formatHours(m.totalHours)}</td>
                          <td className="px-4 border-0 text-end font-monospace">{m.billablePercentage.toFixed(2)}%</td>
                          <td className="px-4 border-0 text-end font-monospace">{m.bizDevPercentage.toFixed(2)}%</td>
                          <td className="px-4 border-0 text-end font-monospace">
                            <span className={statusColor}>{m.revisedUtilization.toFixed(2)}%</span>
                          </td>
                          <td className="px-4 border-0 text-end font-monospace">{target !== undefined ? `${target}%` : 'N/A'}</td>
                          <td className="px-4 border-0 text-center">
                            {target !== undefined && (
                              <span className={`badge ${statusColor.replace('text-', 'bg-')} bg-opacity-10 ${statusColor} border-0 small`}>
                                {statusLabel}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-12">
          <div className="card border-0 shadow-sm h-100 overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Team Utilization vs Target</h6>
            </div>
            <div className="card-body">
              {teamUtilizationTrend.length > 0 ? (
                  <AnalyticsChart
                      spec={{
                        type: 'line',
                        xField: 'date',
                        yField: 'revisedUtilization',
                        series: ['revisedUtilization', 'target', 'projection'],
                        formatting: { decimalPlaces: 1, yAxisSuffix: '%' }
                      }}
                      data={teamUtilizationTrend}
                      onDataPointClick={handleDataPointClick}
                  />
              ) : (
                  <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                    No trend data for this period
                  </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex align-items-center justify-content-between">
              <h6 className="metric-label mb-0">Individual Workload by Project</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart 
                spec={{
                  type: 'bar',
                  xField: 'employeeName',
                  yField: 'totalHours',
                  series: projectWorkloadData.projects,
                  hideLegend: true,
                  formatting: { decimalPlaces: 2 }
                }} 
                data={projectWorkloadData.data} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-12">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex align-items-center justify-content-between">
              <h6 className="metric-label mb-0">Top Projects</h6>
              <div className="text-muted">
                <Briefcase size={16} />
              </div>
            </div>
            <div className="card-body px-4 pb-4">
              <div className="row">
                <div className="col-12 col-md-6">
                  <div className="d-flex flex-column gap-4 justify-content-center h-100">
                    {teamProjectMix.slice(0, 5).map((p: any) => (
                      <div key={p.project}>
                        <div className="d-flex justify-content-between mb-1">
                          <span className="fw-bold small">{p.project}</span>
                          <span className="text-muted small text-uppercase">{formatHours(p.totalHours)} hrs</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div 
                            className="progress-bar bg-primary" 
                            role="progressbar" 
                            style={{ width: `${(p.totalHours / (teamProjectMix[0]?.totalHours || 1)) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="col-12 col-md-6">
                  <div className="d-flex flex-column gap-4 justify-content-center h-100">
                    {teamProjectMix.slice(5, 10).map((p: any) => (
                      <div key={p.project}>
                        <div className="d-flex justify-content-between mb-1">
                          <span className="fw-bold small">{p.project}</span>
                          <span className="text-muted small text-uppercase">{formatHours(p.totalHours)} hrs</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div 
                            className="progress-bar bg-primary" 
                            role="progressbar" 
                            style={{ width: `${(p.totalHours / (teamProjectMix[0]?.totalHours || 1)) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon, color, subtitle, onClick }: { title: string; value: string | number; icon: React.ReactNode; color?: string; subtitle?: string; onClick?: () => void }) {
  return (
    <div 
      className={`dashboard-card d-flex flex-column justify-content-between ${onClick ? 'cursor-pointer' : ''}`}
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
