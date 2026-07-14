/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React from 'react';
import { UserX } from 'lucide-react';

interface SupervisorDiagnosticsProps {
  unmatchedEmployees: string[];
}

export default function SupervisorDiagnostics({ unmatchedEmployees }: SupervisorDiagnosticsProps) {
  if (unmatchedEmployees.length === 0) {
    return null;
  }

  return (
    <div className="alert alert-warning border-0 shadow-sm rounded-3 p-4 mb-4">
      <div className="d-flex align-items-center gap-3 mb-3">
        <div className="bg-warning bg-opacity-25 p-2 rounded-circle text-warning-emphasis">
          <UserX size={20} />
        </div>
        <div>
          <h6 className="alert-heading mb-0 fw-bold">Unmatched Employees ({unmatchedEmployees.length})</h6>
          <p className="small mb-0 opacity-75">
            These employees were not found in the supervisor mapping file and have been automatically assigned to <strong>Shannon R Larson</strong>.
          </p>
        </div>
      </div>
      <div className="bg-white bg-opacity-50 border border-warning border-opacity-25 rounded p-3">
        <ul className="list-unstyled row g-2 mb-0">
          {unmatchedEmployees.map(emp => (
            <li key={emp} className="col-6 col-md-4">
              <div className="text-dark-emphasis small px-2 py-1 bg-white bg-opacity-75 rounded border shadow-sm truncate">
                {emp}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
