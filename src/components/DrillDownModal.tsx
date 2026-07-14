/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useState, useMemo } from 'react';
import { TimesheetEntry, formatHours, getCategoryColor } from '../types';
import { X, Table as TableIcon, Search, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { format } from 'date-fns';

interface DrillDownModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: TimesheetEntry[];
  title?: string;
}

type SortField = 'transactionDate' | 'postingDate' | 'employeeName' | 'project' | 'task' | 'category' | 'hours';
type SortOrder = 'asc' | 'desc';

export default function DrillDownModal({ isOpen, onClose, entries, title }: DrillDownModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('transactionDate');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedEntries = useMemo(() => {
    let result = [...entries];

    // Search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(entry => 
        entry.employeeName.toLowerCase().includes(lowerSearch) ||
        (entry.projectName || entry.project || '').toLowerCase().includes(lowerSearch) ||
        (entry.projectCode || '').toLowerCase().includes(lowerSearch) ||
        (entry.taskName || '').toLowerCase().includes(lowerSearch) ||
        (entry.taskCode || '').toLowerCase().includes(lowerSearch) ||
        (entry.description || '').toLowerCase().includes(lowerSearch) ||
        entry.category.toLowerCase().includes(lowerSearch)
      );
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'transactionDate':
          const dateA = a.transactionDate || a.date;
          const dateB = b.transactionDate || b.date;
          comparison = dateA.getTime() - dateB.getTime();
          break;
        case 'postingDate':
          const postA = a.postingDate || a.date;
          const postB = b.postingDate || b.date;
          comparison = postA.getTime() - postB.getTime();
          break;
        case 'employeeName':
          comparison = a.employeeName.localeCompare(b.employeeName);
          break;
        case 'project':
          const projA = (a.projectName || a.project || '').toLowerCase();
          const projB = (b.projectName || b.project || '').toLowerCase();
          comparison = projA.localeCompare(projB);
          break;
        case 'task':
          const taskA = (a.taskName || '').toLowerCase();
          const taskB = (b.taskName || '').toLowerCase();
          comparison = taskA.localeCompare(taskB);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'hours':
          comparison = a.hours - b.hours;
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [entries, searchTerm, sortField, sortOrder]);

  const totals = useMemo(() => {
    return filteredAndSortedEntries.reduce((acc, entry) => {
      acc.totalHours += entry.hours;
      if (entry.category === 'Billable') {
        acc.billableHours += entry.hours;
      } else {
        acc.nonBillableHours += entry.hours;
      }
      return acc;
    }, { totalHours: 0, billableHours: 0, nonBillableHours: 0 });
  }, [filteredAndSortedEntries]);

  if (!isOpen) return null;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown size={12} className="ms-1 opacity-50" />;
    return sortOrder === 'asc' ? 
      <ArrowUp size={12} className="ms-1 text-primary" /> : 
      <ArrowDown size={12} className="ms-1 text-primary" />;
  };

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}>
      <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: '95vw' }}>
        <div className="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
          <div className="modal-header bg-white border-bottom-0 pt-4 px-4 pb-0">
            <div className="d-flex align-items-center gap-3 w-100">
              <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-2">
                <TableIcon size={20} />
              </div>
              <div className="flex-grow-1">
                <h5 className="modal-title fw-bold">{title || 'Timesheet Records'}</h5>
                <p className="text-muted small mb-0">{filteredAndSortedEntries.length} records found</p>
              </div>
              <div className="me-3 position-relative" style={{ width: '300px' }}>
                <Search size={18} className="position-absolute top-50 start-0 translate-middle-y ms-3 text-muted" />
                <input
                  type="text"
                  className="form-control form-control-sm ps-5 bg-light border-0 rounded-pill"
                  placeholder="Search records..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button type="button" className="btn-close shadow-none" onClick={onClose} aria-label="Close"></button>
            </div>
          </div>
          <div className="modal-body p-4">
            {/* Roll-up Totals */}
            <div className="row g-3 mb-4">
              <div className="col-md-4">
                <div className="card border-0 bg-light p-3 rounded-3 h-100">
                  <div className="text-muted small text-uppercase fw-bold mb-1">Total Hours</div>
                  <div className="h4 mb-0 fw-bold text-dark">{formatHours(totals.totalHours)}</div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-success bg-opacity-10 p-3 rounded-3 h-100">
                  <div className="text-success small text-uppercase fw-bold mb-1">Billable Hours</div>
                  <div className="h4 mb-0 fw-bold text-success">{formatHours(totals.billableHours)}</div>
                  <div className="small text-success opacity-75">
                    {totals.totalHours > 0 ? ((totals.billableHours / totals.totalHours) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="card border-0 bg-info bg-opacity-10 p-3 rounded-3 h-100">
                  <div className="text-info small text-uppercase fw-bold mb-1">Non-Billable Hours</div>
                  <div className="h4 mb-0 fw-bold text-info">{formatHours(totals.nonBillableHours)}</div>
                  <div className="small text-info opacity-75">
                    {totals.totalHours > 0 ? ((totals.nonBillableHours / totals.totalHours) * 100).toFixed(1) : 0}% of total
                  </div>
                </div>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle small mb-0">
                <thead className="table-light">
                  <tr>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('transactionDate')}
                    >
                      Trans. Date <SortIcon field="transactionDate" />
                    </th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('postingDate')}
                    >
                      Posting Date <SortIcon field="postingDate" />
                    </th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('employeeName')}
                    >
                      Employee <SortIcon field="employeeName" />
                    </th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('project')}
                    >
                      Project <SortIcon field="project" />
                    </th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('task')}
                    >
                      Task <SortIcon field="task" />
                    </th>
                    <th className="border-0 text-muted text-uppercase fw-bold pb-3" style={{ fontSize: '10px' }}>Description</th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('category')}
                    >
                      Category <SortIcon field="category" />
                    </th>
                    <th 
                      className="border-0 text-muted text-uppercase fw-bold pb-3 text-end cursor-pointer user-select-none" 
                      style={{ fontSize: '10px' }}
                      onClick={() => handleSort('hours')}
                    >
                      Hours <SortIcon field="hours" />
                    </th>
                  </tr>
                </thead>
                <tbody className="border-top-0">
                  {filteredAndSortedEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-3 border-bottom-light fw-bold text-dark">
                        {entry.transactionDate ? format(entry.transactionDate, 'MMM dd, yyyy') : (entry.date ? format(entry.date, 'MMM dd, yyyy') : '-')}
                      </td>
                      <td className="py-3 border-bottom-light text-muted small">
                        {entry.postingDate ? format(entry.postingDate, 'MM/dd/yy') : '-'}
                      </td>
                      <td className="py-3 border-bottom-light fw-bold text-dark">{entry.employeeName}</td>
                      <td className="py-3 border-bottom-light">
                        <span className="text-muted small">{entry.projectCode}</span>
                        <div className="fw-medium text-dark">{entry.projectName || entry.project}</div>
                      </td>
                      <td className="py-3 border-bottom-light">
                        <span className="text-muted small">{entry.taskCode}</span>
                        <div className="fw-medium text-dark">{entry.taskName || '-'}</div>
                      </td>
                      <td className="py-3 border-bottom-light text-muted italic">
                        {entry.description || '-'}
                      </td>
                      <td className="py-3 border-bottom-light">
                        <span className={`badge rounded-pill ${getCategoryColor(entry.category)}`}>
                          {entry.category}
                        </span>
                      </td>
                      <td className="py-3 border-bottom-light text-end fw-bold text-primary">
                        {formatHours(entry.hours)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredAndSortedEntries.length === 0 && (
                <div className="text-center py-5 text-muted">
                  No records found matching your search.
                </div>
              )}
            </div>
          </div>
          <div className="modal-footer border-top-0 p-4">
            <button type="button" className="btn btn-light px-4 fw-bold" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
