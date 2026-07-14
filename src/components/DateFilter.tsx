/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '@/lib/DataContext';
import { 
  startOfWeek, endOfWeek, 
  startOfMonth, endOfMonth, 
  startOfYear, endOfYear,
  subWeeks, subMonths, subYears,
  format, isAfter, isBefore, startOfDay, endOfDay, parse
} from 'date-fns';
import { Calendar, ChevronDown, X } from 'lucide-react';
import { Dropdown, Form, Button, ButtonGroup } from 'react-bootstrap';

export default function DateFilter() {
  const { timeRange, setTimeRange, dataBounds } = useData();
  const [selectedLabel, setSelectedLabel] = useState('Last Week');
  const [customRange, setCustomRange] = useState({
    start: '',
    end: ''
  });
  const [showCustom, setShowCustom] = useState(false);

  const getLastFriday = (reference: Date) => {
    const localRef = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
    const day = localRef.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    
    // Target: Most recent Friday
    // If today is Friday (5), diffToFriday = (5 + 2) % 7 = 0. lastFriday = today.
    // If today is Saturday (6), diffToFriday = (6 + 2) % 7 = 1. lastFriday = yesterday.
    // If today is Monday (1), diffToFriday = (1 + 2) % 7 = 3. lastFriday = last Monday - 3 = last Friday.
    let diffToFriday = (day + 2) % 7;
    
    const lastFriday = new Date(localRef.getFullYear(), localRef.getMonth(), localRef.getDate());
    lastFriday.setDate(lastFriday.getDate() - diffToFriday);
    return lastFriday;
  };

  const getFirstFriday = (reference: Date) => {
    // Start at the first day of the month/year provided by reference
    const firstDay = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const day = firstDay.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
    
    // Target: First Friday of the month
    // If 1st is Friday (5), diffToFriday = 0.
    // If 1st is Saturday (6), diffToFriday = 6.
    // If 1st is Thursday (4), diffToFriday = 1.
    // Formula: (5 - day + 7) % 7
    let diffToFriday = (5 - day + 7) % 7;
    
    const firstFriday = new Date(firstDay.getFullYear(), firstDay.getMonth(), firstDay.getDate());
    firstFriday.setDate(firstFriday.getDate() + diffToFriday);
    return firstFriday;
  };

  const presets = [
    {
      label: 'All Time',
      range: null
    },
    {
      label: 'Last Week',
      range: () => {
        // Use local date parts to avoid timezone shifts when today is near midnight
        const now = new Date();
        const lastFriday = getLastFriday(now);
        
        const lastSaturday = new Date(lastFriday.getFullYear(), lastFriday.getMonth(), lastFriday.getDate());
        lastSaturday.setDate(lastFriday.getDate() - 6);
        
        return { start: startOfDay(lastSaturday), end: endOfDay(lastFriday) };
      }
    },
    {
      label: 'Month to Date',
      range: () => {
        const now = new Date();
        const reference = (dataBounds?.end && isBefore(dataBounds.end, now)) ? dataBounds.end : now;
        const lastFriday = getLastFriday(reference);
        const firstFriday = getFirstFriday(lastFriday);
        return { start: startOfDay(firstFriday), end: endOfDay(lastFriday) };
      }
    },
    {
      label: 'Year to Date',
      range: () => {
        const now = new Date();
        const reference = (dataBounds?.end && isBefore(dataBounds.end, now)) ? dataBounds.end : now;
        const lastFriday = getLastFriday(reference);
        const firstFridayOfYear = getFirstFriday(startOfYear(lastFriday));
        return { start: startOfDay(firstFridayOfYear), end: endOfDay(lastFriday) };
      }
    },
    {
      label: 'One Full Year Back',
      range: () => {
        const now = new Date();
        const reference = (dataBounds?.end && isBefore(dataBounds.end, now)) ? dataBounds.end : now;
        const lastFriday = getLastFriday(reference);
        return { start: subYears(lastFriday, 1), end: endOfDay(lastFriday) };
      }
    }
  ];

  const applyPreset = (label: string, range: { start: Date; end: Date } | null) => {
    setSelectedLabel(label);
    setTimeRange(range);
    setShowCustom(false);
  };

  const handleCustomApply = (e: React.FormEvent) => {
    e.preventDefault();
    if (customRange.start && customRange.end) {
      // Use parse to ensure "YYYY-MM-DD" is treated as local date
      const start = startOfDay(parse(customRange.start, 'yyyy-MM-dd', new Date()));
      const end = endOfDay(parse(customRange.end, 'yyyy-MM-dd', new Date()));
      setSelectedLabel('Custom Range');
      setTimeRange({ start, end });
    }
  };

  // Initialize custom range and default filter from data bounds if available
  useEffect(() => {
    if (dataBounds) {
      setCustomRange({
        start: format(dataBounds.start, 'yyyy-MM-dd'),
        end: format(dataBounds.end, 'yyyy-MM-dd')
      });
      
      // If we just uploaded new data (dataBounds changed), and we are in "All Time" mode,
      // stay in All Time. If we are in "Last Week", we should stay in "Last Week" 
      // but let it re-evaluate if it's based on dataBounds.
      // Currently presets are NOT based on dataBounds (except MTD/YTD).
      
      // If no time range is set yet, default to Last Week
      if (!timeRange && selectedLabel === 'Last Week') {
        const lastWeekPreset = presets.find(p => p.label === 'Last Week');
        if (lastWeekPreset && typeof lastWeekPreset.range === 'function') {
          setTimeRange(lastWeekPreset.range());
        }
      }
    }
  }, [dataBounds]);

  return (
    <div className="d-flex align-items-center gap-2">
      <div className="d-flex align-items-center gap-2">
        <Dropdown>
          <Dropdown.Toggle variant="light" size="sm" className="d-flex align-items-center gap-2 border shadow-sm">
            <Calendar size={16} className="text-primary" />
            <span>{selectedLabel}</span>
          </Dropdown.Toggle>

          <Dropdown.Menu className="shadow-sm border-0 p-2" style={{ minWidth: '200px' }}>
            {presets.map((preset) => (
              <Dropdown.Item
                key={preset.label}
                onClick={() => applyPreset(preset.label, typeof preset.range === 'function' ? preset.range() : preset.range)}
                className="rounded-2"
              >
                {preset.label}
              </Dropdown.Item>
            ))}
            <Dropdown.Divider />
            <Dropdown.Item onClick={() => setShowCustom(!showCustom)} className="rounded-2">
              Custom Range...
            </Dropdown.Item>
            
            {showCustom && (
              <div className="p-3 bg-light rounded-3 mt-2 border">
                <Form onSubmit={handleCustomApply}>
                  <Form.Group className="mb-2">
                    <Form.Label className="small fw-bold">Start Date</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={customRange.start}
                      onChange={(e) => setCustomRange({ ...customRange, start: e.target.value })}
                    />
                  </Form.Group>
                  <Form.Group className="mb-3">
                    <Form.Label className="small fw-bold">End Date</Form.Label>
                    <Form.Control
                      type="date"
                      size="sm"
                      value={customRange.end}
                      onChange={(e) => setCustomRange({ ...customRange, end: e.target.value })}
                    />
                  </Form.Group>
                  <Button type="submit" variant="primary" size="sm" className="w-100 fw-bold">
                    Apply Range
                  </Button>
                </Form>
              </div>
            )}
          </Dropdown.Menu>
        </Dropdown>

        {(selectedLabel !== 'All Time' || dataBounds) && (
          <div className="text-muted small fw-medium border-start ps-2 d-none d-md-block">
            {(() => {
              const range = timeRange || dataBounds;
              if (range) {
                return `${format(range.start, 'MMM d, yyyy')} - ${format(range.end, 'MMM d, yyyy')}`;
              }
              return null;
            })()}
          </div>
        )}
      </div>

      {selectedLabel !== 'All Time' && (
        <Button 
          variant="link" 
          size="sm" 
          className="text-muted p-0 text-decoration-none"
          onClick={() => applyPreset('All Time', null)}
        >
          <X size={16} />
        </Button>
      )}
    </div>
  );
}
