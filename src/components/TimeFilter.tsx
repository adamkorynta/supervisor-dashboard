/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React from 'react';
import { useData } from '@/lib/DataContext';
import { Calendar, ChevronDown } from 'lucide-react';
import { 
  subDays, 
  startOfWeek, 
  endOfWeek, 
  startOfMonth, 
  endOfMonth, 
  startOfYear, 
  endOfYear,
  format
} from 'date-fns';

const RANGES = [
  { label: 'All Time', getValue: () => null },
  { label: 'Last 7 Days', getValue: (anchor: Date) => ({ start: subDays(anchor, 7), end: anchor }) },
  { label: 'Last 30 Days', getValue: (anchor: Date) => ({ start: subDays(anchor, 30), end: anchor }) },
  { label: 'This Week', getValue: (anchor: Date) => ({ start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) }) },
  { label: 'This Month', getValue: (anchor: Date) => ({ start: startOfMonth(anchor), end: endOfMonth(anchor) }) },
  { label: 'This Year', getValue: (anchor: Date) => ({ start: startOfYear(anchor), end: endOfYear(anchor) }) },
];

export default function TimeFilter() {
  const { timeRange, setTimeRange, dataBounds } = useData();
  const [isOpen, setIsOpen] = React.useState(false);

  // Anchor relative dates to the max date in the data if available, otherwise now
  const anchorDate = React.useMemo(() => {
    return dataBounds?.end || new Date();
  }, [dataBounds]);

  const activeRangeLabel = React.useMemo(() => {
    if (!timeRange) return 'All Time';
    const found = RANGES.find(r => {
      const val = r.getValue(anchorDate);
      if (!val) return false;
      return val.start.getTime() === timeRange.start.getTime() && 
             val.end.getTime() === timeRange.end.getTime();
    });
    return found ? found.label : `${format(timeRange.start, 'MMM d')} - ${format(timeRange.end, 'MMM d, yyyy')}`;
  }, [timeRange, anchorDate]);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="d-flex align-items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-pill small fw-medium text-slate-700 transition-all shadow-sm"
      >
        <Calendar size={16} className="text-slate-400" />
        <span>{activeRangeLabel}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-30" 
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-3 shadow-lg z-40 py-2 animate-in fade-in zoom-in-95 duration-100">
            {RANGES.map((range) => (
              <button
                key={range.label}
                onClick={() => {
                  setTimeRange(range.getValue(anchorDate));
                  setIsOpen(false);
                }}
                className={`w-full text-start px-4 py-2 small hover-bg-light transition-all border-0 bg-transparent ${
                  activeRangeLabel === range.label ? 'text-primary fw-bold' : 'text-slate-600'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
