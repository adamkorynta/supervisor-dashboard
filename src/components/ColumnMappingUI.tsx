/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React from 'react';
import { ColumnMapping } from '@/lib/normalization';

interface ColumnMappingUIProps {
  headers: string[];
  mapping: ColumnMapping;
  onChange: (newMapping: ColumnMapping) => void;
}

export default function ColumnMappingUI({ headers, mapping, onChange }: ColumnMappingUIProps) {
  const fields: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
    { key: 'employeeName', label: 'Employee Name', required: true },
    { key: 'postingDate', label: 'Posting Date', required: false },
    { key: 'transactionDate', label: 'Transaction Date', required: false },
    { key: 'hours', label: 'Hours', required: true },
    { key: 'project', label: 'Project Name', required: true },
    { key: 'projectCode', label: 'Project Code', required: false },
    { key: 'taskName', label: 'Task Name', required: false },
    { key: 'taskCode', label: 'Task Code', required: false },
    { key: 'employeeId', label: 'Employee ID', required: false },
    { key: 'client', label: 'Client', required: false },
    { key: 'billable', label: 'Billable Flag', required: false },
    { key: 'cost', label: 'Cost/Effort', required: false },
    { key: 'rate', label: 'Hourly Rate', required: false },
    { key: 'branch', label: 'Branch/Org', required: false },
  ];

  const handleFieldChange = (key: keyof ColumnMapping, value: string) => {
    onChange({ ...mapping, [key]: value });
  };

  return (
    <div className="card border-0 shadow-sm rounded-3">
      <div className="card-header bg-light border-0 px-4 py-3">
        <h6 className="mb-0 fw-bold text-dark">Column Mapping</h6>
      </div>
      <div className="card-body p-4">
        <div className="row g-3">
          {fields.map(field => (
            <div key={field.key} className="col-12 col-md-6">
              <label className="form-label small fw-bold text-muted d-flex justify-content-between">
                {field.label}
                {field.required && <span className="text-danger small">Required</span>}
              </label>
              <select
                value={(mapping[field.key] as string) || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="form-select form-select-sm border-0 bg-light shadow-none"
              >
                <option value="">-- Select Column --</option>
                {headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
