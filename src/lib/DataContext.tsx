/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useState, useEffect } from 'react';
import { NormalizedData, TimesheetEntry, SupervisorMapping } from '../types';

interface DataContextType {
  data: NormalizedData | null;
  setData: (data: NormalizedData) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  timeRange: { start: Date; end: Date } | null;
  setTimeRange: (range: { start: Date; end: Date } | null) => void;
  dataBounds: { start: Date; end: Date } | null;
  setDataBounds: (bounds: { start: Date; end: Date } | null) => void;
}

const DataContext = React.createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<NormalizedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<{ start: Date; end: Date } | null>(null);
  const [dataBounds, setDataBounds] = useState<{ start: Date; end: Date } | null>(null);

  useEffect(() => {
    async function loadPersistentData() {
      try {
        const response = await fetch('/api/data');
        const result = await response.json();
        
        if (result && result.entries) {
          // Re-hydrate dates
          const hydratedData: NormalizedData = {
            ...result,
            entries: (result.entries || []).map((e: any) => ({
              ...e,
              date: new Date(e.date),
              postingDate: e.postingDate ? new Date(e.postingDate) : undefined,
              transactionDate: e.transactionDate ? new Date(e.transactionDate) : undefined
            })),
            projections: (result.projections || [])
              .map((p: any) => ({
                ...p,
                date: new Date(p.date)
              }))
              .filter((p: any) =>
                p.date instanceof Date &&
                !Number.isNaN(p.date.getTime()) &&
                p.date.getFullYear() >= 1980 &&
                p.date.getFullYear() <= 2100 &&
                /[a-z]/i.test(String(p.employeeName || ''))
              ),
            projects: (result.projects || []).map((p: any) => ({
              ...p,
              startDate: p.startDate ? new Date(p.startDate) : undefined,
              finishDate: p.finishDate ? new Date(p.finishDate) : undefined,
              dueDate: p.dueDate ? new Date(p.dueDate) : undefined,
              tasks: (p.tasks || []).map((task: any) => ({
                ...task,
                startDate: task.startDate ? new Date(task.startDate) : undefined,
                finishDate: task.finishDate ? new Date(task.finishDate) : undefined,
                dueDate: task.dueDate ? new Date(task.dueDate) : undefined
              }))
            })),
            rawProjectHeaders: result.rawProjectHeaders || []
          };
          setData(hydratedData);
          
          // Set bounds if data exists
          if (hydratedData.entries.length > 0) {
            const dates = hydratedData.entries.map(e => e.date.getTime());
            setDataBounds({
              start: new Date(Math.min(...dates)),
              end: new Date(Math.max(...dates))
            });
          }
        }
      } catch (err) {
        console.error('Failed to load persistent data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadPersistentData();
  }, []);

  return (
    <DataContext.Provider value={{ 
      data, setData, 
      isLoading, setIsLoading, 
      timeRange, setTimeRange,
      dataBounds, setDataBounds
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = React.useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}
