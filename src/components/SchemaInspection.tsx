/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React from 'react';

interface SchemaInspectionProps {
  data: any[];
  headers: string[];
  title: string;
}

export default function SchemaInspection({ data, headers, title }: SchemaInspectionProps) {
  if (!data || data.length === 0) return null;

  // Show only first 5 rows for inspection
  const previewData = data.slice(0, 5);

  return (
    <div className="card border-0 shadow-sm rounded-3 overflow-hidden">
      <div className="card-header bg-light border-0 px-4 py-3 d-flex justify-content-between align-items-center">
        <h6 className="mb-0 fw-bold text-dark">{title} Preview</h6>
        <span className="badge bg-white text-dark border fw-normal">{data.length} rows</span>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover align-middle mb-0">
          <thead className="table-light">
            <tr>
              {headers.map(h => (
                <th key={h} className="px-3 py-2 border-0 text-uppercase text-muted font-monospace" style={{ fontSize: '10px' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, i) => (
              <tr key={i}>
                {headers.map(h => (
                  <td key={h} className="px-3 py-2 border-0 text-dark-emphasis font-monospace truncate" style={{ fontSize: '10px', maxWidth: '150px' }}>
                    {String(row[h] || '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
