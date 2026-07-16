/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { Clock, Info, Calendar, Filter } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { useData } from '@/lib/DataContext';
import { buildBacklogCurves, BacklogCurve } from '@/lib/projectAnalytics';
import { formatCurrency } from '@/types';
import { format } from 'date-fns';
import {NameType, ValueType} from "recharts/types/component/DefaultTooltipContent";

export default function BacklogDashboard() {
  const { data } = useData();
  const [curves, setCurves] = useState<BacklogCurve[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Local date range state
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Track visibility of individual task lines: projectCode -> taskId -> boolean
  const [visibleTasks, setVisibleTasks] = useState<Record<string, Record<string, boolean>>>({});

  const toggleTask = (projectCode: string, taskId: string) => {
    setVisibleTasks(prev => {
      const projectTasks = prev[projectCode] || {};
      return {
        ...prev,
        [projectCode]: {
          ...projectTasks,
          [taskId]: !projectTasks[taskId]
        }
      };
    });
  };

  const taskColors = [
    '#6610f2', '#6f42c1', '#d63384', '#fd7e14', '#ffc107', '#20c997', '#0dcaf0',
    '#adb5bd', '#007bff', '#6c757d', '#28a745', '#17a2b8', '#ffc107', '#dc3545'
  ];

  useEffect(() => {
    if (!data?.projectSchedules || data.projectSchedules.length === 0) {
      setCurves([]);
      return;
    }

    setIsProcessing(true);
    // Use a timeout to avoid blocking the UI thread
    const timeoutId = setTimeout(() => {
      const nextCurves = buildBacklogCurves(data.projectSchedules, data.entries);
      setCurves(nextCurves);
      setIsProcessing(false);
      
      // Initialize date range from curves if not set
      if (nextCurves.length > 0) {
        const allStartDates = nextCurves.map(c => c.startDate.getTime());
        const allEndDates = nextCurves.map(c => c.finishDate.getTime());
        const minStart = new Date(Math.min(...allStartDates));
        const maxEnd = new Date(Math.max(...allEndDates));
        
        setStartDate(prev => prev || format(minStart, 'yyyy-MM-dd'));
        setEndDate(prev => prev || format(maxEnd, 'yyyy-MM-dd'));
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [data]);

  // Filter curves data by date window locally
  const filteredCurves = useMemo(() => {
    if (!startDate && !endDate) return curves;
    
    return curves.map(curve => ({
      ...curve,
      series: curve.series.filter(p => {
        const date = p.date;
        if (startDate && date < startDate) return false;
        if (endDate && date > endDate) return false;
        return true;
      })
    }));
  }, [curves, startDate, endDate]);

  if (!data) return null;

  if (!data.projectSchedules || data.projectSchedules.length === 0) {
    return (
      <div className="card border-0 shadow-sm p-5 text-center rounded-4">
        <div className="bg-primary bg-opacity-10 text-primary rounded-circle p-4 d-inline-block mx-auto mb-4">
          <Clock size={48} />
        </div>
        <h2 className="fw-bold mb-3">Project Schedule Needed</h2>
        <p className="text-muted mb-4 mx-auto" style={{ maxWidth: '500px' }}>
          Upload a project task schedule in the Data Management tab to visualize labor backlog curves.
          Expected columns: Task ID, Task Name, Dependency, Start Date, End Date, Labor Hours, Cost ($), etc.
        </p>
      </div>
    );
  }

  return (
    <div className="container-fluid p-0">
      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex align-items-center justify-content-between flex-wrap gap-3">
          <div className="d-flex align-items-center">
            <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
              <Clock size={24} />
            </div>
            <div>
              <h4 className="fw-bold mb-0">Labor Backlog Curves</h4>
              <p className="text-muted small mb-0">Projected labor spend to completion based on task schedules</p>
            </div>
          </div>
          
          <div className="d-flex align-items-center gap-2 bg-light p-2 rounded-3 border">
            <div className="text-muted small fw-bold px-2 d-none d-md-block"><Calendar size={14} className="me-1" /> DATE WINDOW</div>
            <div className="d-flex align-items-center gap-2">
              <input 
                type="date" 
                className="form-control form-control-sm border-0 bg-white" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <span className="text-muted small">to</span>
              <input 
                type="date" 
                className="form-control form-control-sm border-0 bg-white" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {curves.map((curve, idx) => (
          <div key={curve.projectCode || `curve-${idx}`} className="col-xl-6">
            <div className="card border-0 shadow-sm rounded-3 h-100">
              <div className="card-header bg-white border-0 pt-4 px-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="fw-bold mb-1">{curve.projectName}</h5>
                    {curve.projectCode && <div className="small text-muted mb-0">Project Code: {curve.projectCode}</div>}
                  </div>
                  <div className="text-end">
                    <div className="badge bg-primary-subtle text-primary rounded-pill px-3 py-2">
                      Ends {format(curve.finishDate, 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>
              </div>
              <div className="card-body px-4 pb-4">
                <div className="row mb-4 g-3">
                  <div className="col-sm-4">
                    <div className="p-3 bg-light rounded-3 h-100">
                      <div className="text-muted small text-uppercase fw-bold mb-1">Backlog Remaining</div>
                      <div className="h4 fw-bold mb-0 text-primary">{formatCurrency(curve.totalLaborRemaining)}</div>
                    </div>
                  </div>
                  <div className="col-sm-4">
                    <div className="p-3 bg-light rounded-3 h-100">
                      <div className="text-muted small text-uppercase fw-bold mb-1">Avg Monthly Burn</div>
                      <div className="h4 fw-bold mb-0">{formatCurrency(curve.burnRate)}</div>
                    </div>
                  </div>
                  <div className="col-sm-4">
                    <div className="p-3 bg-light rounded-3 h-100">
                      <div className="text-muted small text-uppercase fw-bold mb-1">Est. Completion</div>
                      <div className="h4 fw-bold mb-0 text-success">{format(curve.finishDate, 'MMM yyyy')}</div>
                    </div>
                  </div>
                </div>

                <div style={{ width: '100%', height: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={curve.series}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        domain={[startDate || 'auto', endDate || 'auto']}
                        type="category"
                        tickFormatter={(val) => {
                          try {
                            return format(new Date(val), 'MMM yy');
                          } catch (e) {
                            return val;
                          }
                        }}
                        tick={{ fontSize: 11 }}
                        minTickGap={30}
                      />
                      <YAxis 
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip 
                        formatter={(value: ValueType | undefined, name: NameType | string | undefined) => {
                            if (typeof value === 'number') {
                                return [formatCurrency(value), name]
                            }
                            return ['N/A', name];
                        }}
                        labelFormatter={(label) => {
                          try {
                            return format(new Date(label), 'MMM d, yyyy');
                          } catch (e) {
                            return label;
                          }
                        }}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Line
                        name="Projected Labor Backlog"
                        type="monotone"
                        dataKey="backlogRemaining"
                        stroke="#0d6efd"
                        strokeWidth={3}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                      <Line
                        name="Actual Monthly Burn"
                        type="monotone"
                        dataKey="actualCost"
                        stroke="#dc3545"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                      <Line
                        name="Cumulative Actual Cost"
                        type="monotone"
                        dataKey="cumulativeActualCost"
                        stroke="#198754"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                      {curve.tasks.map((task, idx) => {
                        const taskKey = `task_${task.taskId || task.taskName}`;
                        const isVisible = visibleTasks[curve.projectCode || curve.projectName]?.[task.taskId || task.taskName];
                        if (!isVisible) return null;
                        
                        return (
                          <Line
                            key={taskKey}
                            name={task.taskName}
                            type="monotone"
                            dataKey={taskKey}
                            stroke={taskColors[idx % taskColors.length]}
                            strokeWidth={2}
                            strokeDasharray="3 3"
                            dot={false}
                            connectNulls
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                
                <div className="mt-3 p-3 border rounded-3 bg-info bg-opacity-10">
                  <div className="d-flex gap-2">
                    <Info size={16} className="text-info mt-1" />
                    <div className="small text-dark">
                      <strong>Burn Rate Note:</strong> The backlog curve represents a linear drawdown of remaining labor dollars to zero by the project end date. The average monthly burn rate ({formatCurrency(curve.burnRate)}) is derived from historical timesheet data for this project.
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="d-flex align-items-center mb-3">
                    <Filter size={16} className="me-2 text-muted" />
                    <span className="small fw-bold text-uppercase text-muted">Task Backlog Overlays</span>
                  </div>
                  <div className="d-flex flex-wrap gap-2">
                    {curve.tasks.map((task, idx) => {
                      const taskId = task.taskId || task.taskName;
                      const isVisible = visibleTasks[curve.projectCode || curve.projectName]?.[taskId];
                      const color = taskColors[idx % taskColors.length];
                      
                      return (
                        <button
                          key={taskId}
                          onClick={() => toggleTask(curve.projectCode || curve.projectName, taskId)}
                          className={`btn btn-sm rounded-pill px-3 py-1 d-flex align-items-center gap-2 transition-all ${
                            isVisible 
                              ? 'btn-outline-dark border-2' 
                              : 'btn-light border text-muted'
                          }`}
                          style={isVisible ? { borderColor: color, color: color } : {}}
                        >
                          <div 
                            className="rounded-circle" 
                            style={{ 
                              width: '8px', 
                              height: '8px', 
                              backgroundColor: isVisible ? color : '#dee2e6' 
                            }} 
                          />
                          {task.taskName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {curves.length === 0 && !isProcessing && (
        <div className="card border-0 shadow-sm p-5 text-center mt-4">
        <p className="text-muted mb-0">No backlog curves generated. Ensure your schedule upload includes valid project names or codes that match your timesheets.</p>
        </div>
      )}
    </div>
  );
}
