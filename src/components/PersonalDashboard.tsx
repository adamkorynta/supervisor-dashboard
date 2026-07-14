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
  getLatestCompletedDataDate,
  normalizeTargetPercentage
} from '@/lib/dashboardMetrics';
import AnalyticsChart from '@/components/AnalyticsChart';
import DrillDownModal from '@/components/DrillDownModal';
import { User, Clock, Briefcase, TrendingUp, AlertCircle, List } from 'lucide-react';
import { formatHours, TimesheetEntry, getCategoryColor } from '@/types';
import { startOfDay, endOfDay } from 'date-fns';

const WORK_DISTRIBUTION_BUCKETS = [
  'PPL/Holiday',
  'Admin',
  'Business Development',
  'Billable'
] as const;

type WorkDistributionBucket = typeof WORK_DISTRIBUTION_BUCKETS[number];

function getWorkDistributionBucket(entry: TimesheetEntry): WorkDistributionBucket {
  if (entry.category === 'PPL' || entry.category === 'Holiday') return 'PPL/Holiday';
  if (entry.category === 'BizDev') return 'Business Development';
  if (entry.billable || entry.category === 'Billable') return 'Billable';
  return 'Admin';
}

export default function PersonalDashboard() {
  const { data, timeRange } = useData();
  const [selectedEmployee, setSelectedEmployee] = useState<string>('');
  const [drillDownEntries, setDrillDownEntries] = useState<TimesheetEntry[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDataPointClick = (entries: TimesheetEntry[]) => {
    setDrillDownEntries(entries);
    setIsModalOpen(true);
  };

  const employees = useMemo(() => {
    if (!data) return [];
    
    let filteredEntries = data.entries;
    if (timeRange) {
      const startTime = startOfDay(timeRange.start).getTime();
      const endTime = endOfDay(timeRange.end).getTime();
      filteredEntries = data.entries.filter(e => {
        const entryTime = e.date.getTime();
        return entryTime >= startTime && entryTime <= endTime;
      });
    }
    
    return Array.from(new Set(filteredEntries.map(e => e.employeeName))).sort();
  }, [data, timeRange]);

  // Set default employee or update if current selection is filtered out
  useMemo(() => {
    if (employees.length > 0) {
      if (!selectedEmployee || !employees.includes(selectedEmployee)) {
        setSelectedEmployee(employees[0]);
      }
    } else if (selectedEmployee) {
      setSelectedEmployee('');
    }
  }, [employees, selectedEmployee]);

  const personalEntries = useMemo(() => {
    if (!data || !selectedEmployee) return [];
    return data.entries.filter(e => e.employeeName === selectedEmployee);
  }, [data, selectedEmployee]);

  const filteredEntriesByTime = useMemo(() => {
    if (!personalEntries) return [];
    if (!timeRange) return personalEntries;
    
    const startTime = startOfDay(timeRange.start).getTime();
    const endTime = endOfDay(timeRange.end).getTime();
    
    return personalEntries.filter(d => {
      const entryTime = d.date.getTime();
      return entryTime >= startTime && entryTime <= endTime;
    });
  }, [personalEntries, timeRange]);

  const latestPersonalDataDate = useMemo(() => {
    return getLatestCompletedDataDate(personalEntries);
  }, [personalEntries]);

  const handleViewAllRecords = () => {
    setDrillDownEntries(filteredEntriesByTime);
    setIsModalOpen(true);
  };

  const metrics = useMemo(() => {
    if (personalEntries.length === 0) return null;
    return queryData(personalEntries, {
      metrics: ['totalHours', 'billablePercentage', 'revisedUtilization', 'totalCost'],
      timeRange: timeRange || undefined
    })[0];
  }, [personalEntries, timeRange]);

  const employeeTarget = useMemo(() => {
    if (!data || !selectedEmployee) return null;
    return data.supervisors.find(s => s.employeeName === selectedEmployee)?.utilizationGoal || null;
  }, [data, selectedEmployee]);

  const employeeTargets = useMemo(() => {
    const targets = new Map<string, number>();
    const target = normalizeTargetPercentage(employeeTarget);
    if (selectedEmployee && target !== null) targets.set(selectedEmployee, target);
    return targets;
  }, [employeeTarget, selectedEmployee]);

  const utilizationStatus = useMemo(() => {
    if (!metrics || employeeTarget === null) return { color: 'text-info', label: '' };
    const util = metrics.revisedUtilization;
    const diff = util - employeeTarget;
    
    if (diff >= 5) return { color: 'text-success', label: 'Exceeds Target' };
    if (diff <= -5) return { color: 'text-danger', label: 'Underperforming' };
    return { color: 'text-info', label: 'On Track' };
  }, [metrics, employeeTarget]);

  const projectMix = useMemo(() => {
    if (personalEntries.length === 0) return [];
    return queryData(personalEntries, {
      groupBy: 'project',
      metrics: ['totalHours'],
      sort: { field: 'totalHours', order: 'desc' },
      timeRange: timeRange || undefined
    }).map((p: any) => ({
      ...p,
      category: p.originalEntries[0]?.category || 'Unknown'
    }));
  }, [personalEntries, timeRange]);

  const workDistribution = useMemo(() => {
    if (filteredEntriesByTime.length === 0) return [];

    const bucketEntries = new Map<WorkDistributionBucket, TimesheetEntry[]>(
      WORK_DISTRIBUTION_BUCKETS.map(bucket => [bucket, []])
    );

    filteredEntriesByTime.forEach(entry => {
      bucketEntries.get(getWorkDistributionBucket(entry))!.push(entry);
    });

    return WORK_DISTRIBUTION_BUCKETS
      .map(bucket => {
        const originalEntries = bucketEntries.get(bucket) || [];
        return {
          bucket,
          totalHours: originalEntries.reduce((sum, entry) => sum + entry.hours, 0),
          originalEntries
        };
      })
      .filter(row => row.totalHours > 0);
  }, [filteredEntriesByTime]);

  const itIssues = useMemo(() => {
    if (personalEntries.length === 0) return { totalHours: 0, entries: [] };
    
    const entries = personalEntries.filter(entry => entry.category === 'IT');
    const filteredByTime = queryData(entries, {
      metrics: ['totalHours'],
      timeRange: timeRange || undefined
    });
    
    return {
      totalHours: filteredByTime[0]?.totalHours || 0,
      entries: filteredByTime[0]?.originalEntries || []
    };
  }, [personalEntries, timeRange]);

  const trends = useMemo(() => {
    const employeeProjections = (data?.projections || []).filter(p => p.employeeName === selectedEmployee);
    if (personalEntries.length === 0 && employeeProjections.length === 0) return { utilization: [] };

    const utilizationTrend = buildWeeklyUtilizationTrend(personalEntries, employeeProjections, timeRange, employeeTargets, {
      latestDataDate: latestPersonalDataDate
    });

    if (utilizationTrend.length === 0 && employeeProjections.length > 0) {
      return {
        utilization: buildWeeklyUtilizationTrend([], employeeProjections, timeRange, employeeTargets, {
          latestDataDate: latestPersonalDataDate
        })
      };
    }

    // Add trendline calculation
    const trendlineData = [...utilizationTrend];
    if (trendlineData.length >= 2) {
      const actualTrendPoints = trendlineData.filter(d => typeof d.revisedUtilization === 'number');
      const regressionPoints = actualTrendPoints.length >= 2 ? actualTrendPoints : trendlineData;
      const n = regressionPoints.length;
      let sumX = 0;
      let sumY = 0;
      let sumXY = 0;
      let sumXX = 0;

      regressionPoints.forEach((d, i) => {
        const y = d.revisedUtilization || 0;
        sumX += i;
        sumY += y;
        sumXY += i * y;
        sumXX += i * i;
      });

      const denominator = n * sumXX - sumX * sumX;
      const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator;
      const intercept = (sumY - slope * sumX) / n;

      trendlineData.forEach((d, i) => {
        d.trendline = slope * i + intercept;
      });

    }

    return { utilization: trendlineData };
  }, [personalEntries, data?.projections, selectedEmployee, timeRange, employeeTargets, latestPersonalDataDate]);

  if (!data) return null;

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
              <User size={24} />
            </div>
            <div>
              <h4 className="fw-bold mb-0">Individual Insights</h4>
              <p className="text-muted small mb-0">Analyze individual contribution</p>
            </div>
          </div>
          <div className="ms-md-auto d-flex align-items-center gap-3" style={{ minWidth: '420px' }}>
            <button 
              onClick={handleViewAllRecords}
              className="btn btn-outline-primary d-flex align-items-center gap-2 px-3 fw-bold ms-md-auto text-nowrap"
            >
              <List size={18} />
              <span>View All Records</span>
            </button>
            <select 
              value={selectedEmployee} 
              onChange={(e) => setSelectedEmployee(e.target.value)}
              className="form-select border-0 bg-light fw-bold"
            >
              {employees.map(emp => (
                <option key={emp} value={emp}>{emp}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard title="Personal Hours" value={formatHours(metrics?.totalHours)} icon={<Clock size={20} />} />
        </div>
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard title="Billable Ratio" value={`${metrics?.billablePercentage?.toFixed(2) || '0'}%`} icon={<Briefcase size={20} />} color="text-warning" />
        </div>
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard 
            title="Revised Util." 
            value={`${metrics?.revisedUtilization?.toFixed(2) || '0'}%`} 
            icon={<TrendingUp size={20} />} 
            color={utilizationStatus.color}
            subtitle={utilizationStatus.label}
          />
        </div>
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard title="IT Issues" value={formatHours(itIssues.totalHours)} icon={<AlertCircle size={20} />} color="text-danger" onClick={() => itIssues.entries.length > 0 && handleDataPointClick(itIssues.entries)} />
        </div>
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard title="Target Util." value={employeeTarget !== null ? `${employeeTarget}%` : 'N/A'} icon={<TrendingUp size={20} />} color="text-muted" />
        </div>
        <div className="col-12 col-sm-6 col-lg-6ths">
          <MetricCard title="Contribution" value={`$${metrics?.totalCost?.toLocaleString() || '0'}`} icon={<TrendingUp size={20} />} color="text-success" />
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100 overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Utilization vs Target</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart 
                spec={{
                  type: 'line',
                  xField: 'date',
                  yField: 'revisedUtilization',
                  series: ['revisedUtilization', 'target', 'trendline', 'projection'],
                  formatting: { decimalPlaces: 1, yAxisSuffix: '%' }
                }} 
                data={trends.utilization} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
        <div className="col-12 col-xl-6">
          <div className="card border-0 shadow-sm h-100 overflow-hidden">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4">
              <h6 className="metric-label mb-0">Work Distribution</h6>
            </div>
            <div className="card-body">
              <AnalyticsChart 
                spec={{
                  type: 'pie',
                  xField: 'bucket',
                  yField: 'totalHours',
                  formatting: { decimalPlaces: 2 }
                }} 
                data={workDistribution} 
                onDataPointClick={handleDataPointClick}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white border-bottom-0 pt-4 px-4 d-flex align-items-center justify-content-between">
              <h6 className="metric-label mb-0">Project Breakdown</h6>
              <div className="text-muted">
                <Briefcase size={16} />
              </div>
            </div>
            <div className="card-body px-4 pb-4">
              {projectMix.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="px-3 border-0 small text-muted text-uppercase">Project Name</th>
                        <th className="px-3 border-0 small text-muted text-uppercase">Category</th>
                        <th className="px-3 border-0 small text-muted text-uppercase text-end">Hours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projectMix.map((p: any) => {
                        const match = p.project.match(/^([^|]+)\s*\|\s*(.*)$/);
                        const name = match ? match[2].trim() : p.project;

                        return (
                          <tr 
                            key={p.project} 
                            onClick={() => handleDataPointClick(p.originalEntries)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="px-3 border-0 small fw-bold text-truncate">{name}</td>
                            <td className="px-3 border-0 small">
                              <span className={`badge rounded-pill ${getCategoryColor(p.category)}`}>
                                {p.category}
                              </span>
                            </td>
                            <td className="px-3 border-0 text-end font-monospace small">{formatHours(p.totalHours)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-5 text-muted">
                  No project data for this period.
                </div>
              )}
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
