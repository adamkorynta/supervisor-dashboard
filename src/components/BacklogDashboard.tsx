/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Info } from 'lucide-react';
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
import {ValueType} from "recharts/types/component/DefaultTooltipContent";

export default function BacklogDashboard() {
  const { data } = useData();
  const [curves, setCurves] = useState<BacklogCurve[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

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
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [data]);

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
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
            <Clock size={24} />
          </div>
          <div>
            <h4 className="fw-bold mb-0">Labor Backlog Curves</h4>
            <p className="text-muted small mb-0">Projected labor spend to completion based on task schedules</p>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {curves.map((curve) => (
          <div key={curve.projectCode} className="col-xl-6">
            <div className="card border-0 shadow-sm rounded-3 h-100">
              <div className="card-header bg-white border-0 pt-4 px-4">
                <div className="d-flex justify-content-between align-items-start">
                  <div>
                    <h5 className="fw-bold mb-1">{curve.projectName}</h5>
                    <div className="small text-muted mb-0">Project Code: {curve.projectCode}</div>
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

                <div style={{ width: '100%', height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={curve.series}
                      margin={{ top: 10, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={(val) => format(new Date(val), 'MMM yy')}
                        tick={{ fontSize: 12 }}
                        minTickGap={30}
                      />
                      <YAxis 
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        tick={{ fontSize: 12 }}
                      />
                      <Tooltip 
                        formatter={(value: ValueType | undefined) => {
                            if (typeof value === 'number') {
                                return [formatCurrency(value), 'Backlog Remaining']
                            }
                            return ['N/A', 'Backlog Remaining'];
                        }}
                        labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
                      />
                      <Legend verticalAlign="top" height={36}/>
                      <Line
                        name="Projected Labor Backlog"
                        type="monotone"
                        dataKey="backlogRemaining"
                        stroke="#0d6efd"
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
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
              </div>
            </div>
          </div>
        ))}
      </div>

      {curves.length === 0 && !isProcessing && (
        <div className="card border-0 shadow-sm p-5 text-center mt-4">
          <p className="text-muted mb-0">No backlog curves generated. Ensure your schedule upload includes valid project codes that match your timesheets.</p>
        </div>
      )}
    </div>
  );
}
