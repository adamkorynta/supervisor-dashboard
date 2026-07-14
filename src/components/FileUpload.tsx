/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Upload, FileText, Check, AlertCircle, Settings, Users, BriefcaseBusiness } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeTimesheet, normalizeProjections, normalizeProjectSnapshots, mergeSupervisors, DEFAULT_MAPPING, ColumnMapping, validateMapping } from '@/lib/normalization';
import { useData } from '@/lib/DataContext';
import { ProjectionEntry, ProjectSnapshot, SupervisorMapping } from '@/types';
import { DEFAULT_SUPERVISOR_DATA } from '@/lib/seedData';
import ColumnMappingUI from './ColumnMappingUI';
import SchemaInspection from './SchemaInspection';

export default function FileUpload({ onSuccess }: { onSuccess?: () => void }) {
  const { data, setData, setDataBounds, setIsLoading } = useData();
  const [timesheetData, setTimesheetData] = useState<any[] | null>(null);
  const [timesheetHeaders, setTimesheetHeaders] = useState<string[]>([]);
  const [supervisorData, setSupervisorData] = useState<SupervisorMapping[] | null>(DEFAULT_SUPERVISOR_DATA);
  const [supervisorHeaders, setSupervisorHeaders] = useState<string[]>([]);
  const [projectionData, setProjectionData] = useState<any[] | null>(null);
  const [projectionHeaders, setProjectionHeaders] = useState<string[]>([]);
  const [projectData, setProjectData] = useState<any[] | null>(null);
  const [projectHeaders, setProjectHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_MAPPING);
  const [showMapping, setShowMapping] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(
    DEFAULT_SUPERVISOR_DATA ? { type: 'info', message: 'Default supervisor mapping loaded.' } : null
  );

  // Recovery effect to handle component resets during large file uploads
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).tempTimesheetData && !timesheetData) {
      console.log(`[FileUpload] Recovery effect - Restoring ${ (window as any).tempTimesheetData.length } rows from window storage`);
      setTimesheetData((window as any).tempTimesheetData);
      setTimesheetHeaders((window as any).tempTimesheetHeaders || []);
      setStatus({ type: 'success', message: 'Data recovered after view refresh. Ready to generate.' });
    }
    if (typeof window !== 'undefined' && (window as any).tempProjectData && !projectData) {
      console.log(`[FileUpload] Recovery effect - Restoring ${ (window as any).tempProjectData.length } project rows from window storage`);
      setProjectData((window as any).tempProjectData);
      setProjectHeaders((window as any).tempProjectHeaders || []);
      setStatus({ type: 'success', message: `Project snapshot loaded with ${ (window as any).tempProjectData.length } rows. Click "Generate Analytics Dashboard" to save.` });
    }
    if (typeof window !== 'undefined' && (window as any).tempProjectionData && !projectionData) {
      console.log(`[FileUpload] Recovery effect - Restoring ${ (window as any).tempProjectionData.length } projection rows from window storage`);
      setProjectionData((window as any).tempProjectionData);
      setProjectionHeaders((window as any).tempProjectionHeaders || []);
      setStatus({ type: 'success', message: 'Projections loaded. Click "Generate Analytics Dashboard" to save.' });
    }
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'timesheet' | 'supervisor' | 'projections' | 'projects') => {
    console.log(`[FileUpload] handleFileUpload triggered for ${type}`);
    const file = e.target.files?.[0];
    if (!file) return;

    // Use a unique key for this upload session to see if it changes
    const uploadId = Math.random().toString(36).substring(7);
    console.log(`[FileUpload] Starting upload session: ${uploadId}`);

    setUploadProgress({ percent: 10, stage: 'Reading file...' });
    try {
      const parsedResults = await parseFile(file, type, (percent) => {
        setUploadProgress({ percent: 10 + (percent * 0.8), stage: `Parsing ${type}...` });
      });
      
      console.log(`[FileUpload][${uploadId}] Data parsed. Rows: ${parsedResults.data.length}`);
      
      if (type === 'timesheet') {
        setUploadProgress({ percent: 95, stage: 'Validating mapping...' });
        
        console.log(`[FileUpload][${uploadId}] Saving data to window to prevent loss during re-render`);
        if (typeof window !== 'undefined') {
          (window as any).tempTimesheetData = parsedResults.data;
          (window as any).tempTimesheetHeaders = parsedResults.headers;
        }

        console.log(`[FileUpload][${uploadId}] Calling setTimesheetData with ${parsedResults.data.length} rows`);
        
        // Wrap state updates in a small timeout to ensure they happen after any re-renders
        setTimeout(() => {
          setTimesheetData(parsedResults.data);
          setTimesheetHeaders(parsedResults.headers);
          console.log(`[FileUpload][${uploadId}] State updates triggered via timeout.`);
        }, 100);
        
        const validation = validateMapping(parsedResults.headers, mapping);
        console.log(`[FileUpload][${uploadId}] Validation result:`, validation);
        if (validation.isValid) {
          setStatus({ type: 'success', message: 'Timesheet uploaded and auto-mapped successfully. Please click "Generate Analytics Dashboard" below to save and view results.' });
          setShowMapping(false);
        } else {
          setStatus({ type: 'info', message: `Timesheet uploaded. Missing fields: ${validation.missingFields.join(', ')}. Please complete the required column mappings, then click "Generate Analytics Dashboard" to save.` });
          setShowMapping(true);
        }
      } else if (type === 'supervisor') {
        setUploadProgress({ percent: 95, stage: 'Processing supervisors...' });
        const mappings: SupervisorMapping[] = parsedResults.data.map((row: any) => ({
          employeeId: String(row['Employee ID'] || row['ID'] || ''),
          employeeName: String(row['Employee Name'] || row['Name'] || ''),
          supervisorId: String(row['Supervisor ID'] || row['Manager ID'] || ''),
          supervisorName: String(row['Supervisor Name'] || row['Manager Name'] || ''),
          utilizationGoal: row['Utilization Goal'] || row['Target'] || row['Goal'] || undefined,
        }));
        setSupervisorData(mappings);
        setSupervisorHeaders(parsedResults.headers);
        setStatus({ type: 'info', message: 'Supervisor chain uploaded.' });
      } else if (type === 'projections') {
        setUploadProgress({ percent: 95, stage: 'Processing projections...' });
        const parsedProjections = normalizeProjections(parsedResults.data);
        if (typeof window !== 'undefined') {
          (window as any).tempProjectionData = parsedResults.data;
          (window as any).tempProjectionHeaders = parsedResults.headers;
        }
        setProjectionData(parsedResults.data);
        setProjectionHeaders(parsedResults.headers);
        if (parsedProjections.length > 0) {
          const employeeCount = new Set(parsedProjections.map(p => p.employeeName)).size;
          setStatus({ type: 'success', message: `Projections uploaded: ${parsedProjections.length} weekly rows for ${employeeCount} employees. Please click "Generate Analytics Dashboard" to save.` });
        } else {
          setStatus({ type: 'error', message: 'Projection file uploaded, but no projection rows were recognized. Check that the workbook includes the 2_Workload sheet.' });
        }
      } else if (type === 'projects') {
        setUploadProgress({ percent: 95, stage: 'Processing project snapshot...' });
        if (typeof window !== 'undefined') {
          (window as any).tempProjectData = parsedResults.data;
          (window as any).tempProjectHeaders = parsedResults.headers;
        }
        setProjectData(parsedResults.data);
        setProjectHeaders(parsedResults.headers);
        setStatus({ type: 'success', message: `Project snapshot uploaded with ${parsedResults.data.length} rows. Please click "Generate Analytics Dashboard" to save.` });
      }
    } catch (err) {
      setStatus({ type: 'error', message: `Error parsing file: ${err}` });
    } finally {
      setUploadProgress(null);
    }
  };

  const parseFile = (file: File, type: 'timesheet' | 'supervisor' | 'projections' | 'projects', onProgress?: (percent: number) => void): Promise<{ data: any[], headers: string[] }> => {
    console.log(`[FileUpload] Starting parseFile: ${file.name} (${file.size} bytes)`);
    return new Promise((resolve, reject) => {
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            console.log(`[FileUpload] Papa.parse complete. Rows: ${results.data.length}, Errors:`, results.errors);
            onProgress?.(100);
            resolve({ data: results.data, headers: results.meta.fields || [] });
          },
          error: (err) => {
            console.error(`[FileUpload] Papa.parse error:`, err);
            reject(err);
          },
        });
      } else {
        const reader = new FileReader();
        reader.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress?.((e.loaded / e.total) * 100);
          }
        };
        reader.onload = (e) => {
          try {
            console.log(`[FileUpload] FileReader onload triggered`);
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            console.log(`[FileUpload] XLSX workbook read. Sheets:`, workbook.SheetNames);
            const sheetName = workbook.SheetNames.find(n => n.includes('Workload')) || workbook.SheetNames[0];
            console.log(`[FileUpload] Using sheet: ${sheetName}`);
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[];
            const headers = (json[0] as string[]) || [];
            
            const parsedData = type === 'projections'
              ? json
              : XLSX.utils.sheet_to_json(sheet);
            
            console.log(`[FileUpload] XLSX conversion complete. Rows: ${parsedData.length}`);
            onProgress?.(100);
            resolve({ data: parsedData, headers: headers || [] });
          } catch (xlsxErr) {
            console.error(`[FileUpload] XLSX parsing error:`, xlsxErr);
            reject(xlsxErr);
          }
        };
        reader.onerror = (err) => {
          console.error(`[FileUpload] FileReader error:`, err);
          reject(err);
        };
        reader.readAsArrayBuffer(file);
      }
    });
  };

  const processData = async () => {
    console.log('[FileUpload] processData started');
    if (!timesheetData && !data?.entries?.length) {
      console.warn('[FileUpload] Cannot process: no uploaded or persisted timesheet entries are available');
      setStatus({ type: 'error', message: 'Upload a timesheet file before generating the dashboard.' });
      return;
    }
    
    console.log(`[FileUpload] Processing ${timesheetData ? timesheetData.length : data?.entries?.length || 0} timesheet rows with current mapping...`);

    setIsLoading(true);
    setUploadProgress({ percent: 10, stage: 'Normalizing timesheet data...' });
    
    // Brief delay to allow UI to update
    await new Promise(resolve => setTimeout(resolve, 300));

    let normalizedEntries;
    try {
      normalizedEntries = timesheetData
        ? normalizeTimesheet(timesheetData, mapping)
        : (data?.entries || []);
      console.log(`[FileUpload] Timesheet data produced ${normalizedEntries.length} entries.`);
    } catch (normError) {
      console.error('[FileUpload] Normalization failed:', normError);
      setStatus({ type: 'error', message: `Normalization failed: ${normError instanceof Error ? normError.message : String(normError)}` });
      setIsLoading(false);
      setUploadProgress(null);
      return;
    }
    
    // Capture logs from window and also print them to console for visibility
    const logs = (typeof window !== 'undefined' ? (window as any).normalizationLogs : []) || [];
    setDebugLogs(logs);
    console.log('%c--- NORMALIZATION DEBUG LOGS START ---', 'color: white; background: #28a745; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    if (logs.length === 0) {
      console.log('%c[Normalization] No logs found in window.normalizationLogs', 'color: #dc3545; font-weight: bold;');
    } else {
      logs.forEach((log: string) => console.log(`%c[Normalization] %c${log}`, 'color: #28a745; font-weight: bold;', 'color: inherit;'));
    }
    console.log('%c--- NORMALIZATION DEBUG LOGS END ---', 'color: white; background: #28a745; font-weight: bold; padding: 4px 8px; border-radius: 4px;');
    
    setUploadProgress({ percent: 40, stage: 'Calculating data bounds...' });
    
    // Calculate data bounds
    if (normalizedEntries.length > 0) {
      const dates = normalizedEntries.map(e => e.date.getTime());
      setDataBounds({
        start: new Date(Math.min(...dates)),
        end: new Date(Math.max(...dates))
      });
    }

    setUploadProgress({ percent: 50, stage: 'Normalizing projections...' });
    let projections: ProjectionEntry[] = [];
    if (projectionData) {
      projections = normalizeProjections(projectionData);
      console.log(`[FileUpload] Projection normalization produced ${projections.length} entries for ${new Set(projections.map(p => p.employeeName)).size} employees.`);
    } else if (data?.projections) {
      projections = data.projections;
    }

    let projects: ProjectSnapshot[] = data?.projects || [];
    if (projectData) {
      projects = normalizeProjectSnapshots(projectData);
    }

    setUploadProgress({ percent: 60, stage: 'Merging supervisor chain...' });
    const effectiveSupervisors = supervisorData === DEFAULT_SUPERVISOR_DATA && data?.supervisors?.length
      ? data.supervisors
      : supervisorData || data?.supervisors || [];

    const { entries: finalEntries, unmatchedEmployees } = mergeSupervisors(
      normalizedEntries, 
      effectiveSupervisors
    );

    const finalData = {
      entries: finalEntries,
      supervisors: effectiveSupervisors,
      projections,
      projects,
      unmatchedEmployees,
      rawTimesheetHeaders: timesheetHeaders.length > 0 ? timesheetHeaders : data?.rawTimesheetHeaders || [],
      rawSupervisorHeaders: supervisorHeaders.length > 0 ? supervisorHeaders : data?.rawSupervisorHeaders || [],
      rawProjectionHeaders: projectionHeaders.length > 0 ? projectionHeaders : data?.rawProjectionHeaders || [],
      rawProjectHeaders: projectHeaders.length > 0 ? projectHeaders : data?.rawProjectHeaders || [],
    };

    setUploadProgress({ percent: 80, stage: 'Saving to server...' });

    setData(finalData);
    
    console.log(`[FileUpload] Sending data to server. Size approx: ${Math.round(JSON.stringify(finalData).length / 1024 / 1024 * 100) / 100} MB`);

    try {
      console.log('[FileUpload] Initiating POST /api/data...');
      // Save to server for persistence
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(finalData),
      });
      
      console.log(`[FileUpload] Server response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[FileUpload] Server error (${response.status}):`, errorText);
        throw new Error(`Server responded with ${response.status}: ${errorText}`);
      }
      
      setUploadProgress({ percent: 100, stage: 'Completed!' });
      setStatus({ type: 'success', message: `Data processed successfully. Saved ${projections.length} projection rows.` });
      
      if (onSuccess) {
        setTimeout(onSuccess, 800);
      }
    } catch (err) {
      console.error('Failed to save data to server:', err);
      setStatus({ type: 'error', message: 'Data processed but failed to save to server.' });
    } finally {
      setIsLoading(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  };

  useEffect(() => {
    console.log(`[FileUpload] Effect - timesheetData changed: ${!!timesheetData}`);
    if (timesheetData) {
      console.log(`[FileUpload] Effect - timesheetData rows: ${timesheetData.length}`);
    }
  }, [timesheetData]);

  const isValid = validateMapping(timesheetHeaders, mapping).isValid;
  console.log(`[FileUpload] Render - timesheetData: ${!!timesheetData}, isValid: ${isValid}`);
  if (timesheetData) {
    console.log(`[FileUpload] timesheetData length: ${timesheetData.length}`);
    console.log(`[FileUpload] timesheetHeaders:`, timesheetHeaders);
    if (!isValid) {
      const validation = validateMapping(timesheetHeaders, mapping);
      console.log(`[FileUpload] Validation missing fields:`, validation.missingFields);
    }
  } else {
    console.log(`[FileUpload] Render - timesheetData is NULL`);
  }

  return (
    <div className="container-xl py-4" data-debug-timesheet={!!timesheetData} id="file-upload-root">

      <div className="card mb-4 border-0 shadow-sm rounded-3">
        <div className="card-body p-4 d-flex align-items-center">
          <div className="bg-primary bg-opacity-10 text-primary rounded-3 p-3 me-3">
            <Upload size={24} />
          </div>
          <div>
            <h4 className="fw-bold mb-0">Data Management</h4>
            <p className="text-muted small mb-0">Upload files to populate your dashboard. <span className="fw-bold text-primary">Note: You must click "Generate Analytics Dashboard" at the bottom to save your changes to the server.</span> Check browser console for detailed processing logs.</p>
          </div>
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-md-6 col-xl-3">
          <UploadCard
            title="Timesheet Export"
            description="Upload CSV or XLSX exported worklogs"
            icon={<FileText size={32} className="text-primary" />}
            onUpload={(e) => handleFileUpload(e, 'timesheet')}
            isLoaded={!!timesheetData}
            progress={uploadProgress?.stage.includes('timesheet') ? uploadProgress.percent : undefined}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <UploadCard
            title="Supervisor Chain"
            description="Upload employee-to-manager mapping"
            icon={<Users size={32} className="text-primary" />}
            onUpload={(e) => handleFileUpload(e, 'supervisor')}
            isLoaded={!!supervisorData && supervisorData !== DEFAULT_SUPERVISOR_DATA}
            progress={uploadProgress?.stage.includes('supervisor') ? uploadProgress.percent : undefined}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <UploadCard
            title="Projections"
            description="Upload weekly 4-week projections"
            icon={<Upload size={32} className="text-primary" />}
            onUpload={(e) => handleFileUpload(e, 'projections')}
            isLoaded={!!projectionData}
            progress={uploadProgress?.stage.includes('projections') ? uploadProgress.percent : undefined}
          />
        </div>
        <div className="col-md-6 col-xl-3">
          <UploadCard
            title="Project Snapshot"
            description="Upload current project status and budgets"
            icon={<BriefcaseBusiness size={32} className="text-primary" />}
            onUpload={(e) => handleFileUpload(e, 'projects')}
            isLoaded={!!projectData || !!data?.projects?.length}
            progress={uploadProgress?.stage.includes('project') ? uploadProgress.percent : undefined}
          />
        </div>
      </div>

      {uploadProgress && !uploadProgress.stage.includes('timesheet') && !uploadProgress.stage.includes('supervisor') && (
        <div className="card mb-4 border-0 shadow-sm overflow-hidden">
          <div className="card-body p-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="fw-bold text-primary">{uploadProgress.stage}</span>
              <span className="fw-bold text-primary">{Math.round(uploadProgress.percent)}%</span>
            </div>
            <div className="progress" style={{ height: '8px' }}>
              <div 
                className="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                role="progressbar" 
                style={{ width: `${uploadProgress.percent}%` }}
                aria-valuenow={uploadProgress.percent} 
                aria-valuemin={0} 
                aria-valuemax={100}
              ></div>
            </div>
          </div>
        </div>
      )}

      {status && (
        <div className={`alert d-flex align-items-center mb-4 ${
          status.type === 'success' ? 'alert-success' : status.type === 'error' ? 'alert-danger' : 'alert-info'
        }`} role="alert">
          <div className="me-3">
            {status.type === 'success' ? <Check size={24} /> : <AlertCircle size={24} />}
          </div>
          <div className="flex-grow-1 fw-bold">
            {status.message}
            {(debugLogs.length > 0 || (typeof window !== 'undefined' && (window as any).normalizationLogs?.length > 0)) && (
              <div className="mt-2">
                <button 
                  onClick={() => {
                    if (debugLogs.length === 0 && typeof window !== 'undefined') {
                      setDebugLogs((window as any).normalizationLogs || []);
                    }
                    setShowLogs(!showLogs);
                  }} 
                  className="btn btn-sm btn-link p-0 text-decoration-none fw-bold"
                  style={{ fontSize: '0.8rem' }}
                >
                  {showLogs ? 'Hide Processing Logs' : 'Show Processing Logs'}
                </button>
                {showLogs && (
                  <div className="mt-2 p-2 bg-dark text-light rounded small font-monospace" style={{ maxHeight: '300px', overflowY: 'auto', fontSize: '0.75rem', border: '1px solid #444' }}>
                    {(debugLogs.length > 0 ? debugLogs : (window as any).normalizationLogs || []).map((log: string, i: number) => (
                      <div key={i} className="mb-1 border-bottom border-secondary pb-1">{log}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {status.type === 'info' && timesheetHeaders.length > 0 && !showMapping && (
            <button 
              onClick={() => setShowMapping(true)}
              className="btn btn-primary btn-sm ms-3"
            >
              Manual Mapping
            </button>
          )}
        </div>
      )}

      {showMapping && (
        <div className="card mb-4 border-0 shadow-sm">
          <div className="card-header bg-white border-0 pt-4 px-4 d-flex align-items-center justify-content-between">
            <h5 className="fw-bold mb-0 d-flex align-items-center gap-2">
              <Settings className="text-primary" />
              Configure Schema Mapping
            </h5>
            <button 
              onClick={() => setShowMapping(false)}
              className="btn-close"
            ></button>
          </div>
          <div className="card-body p-4">
            <ColumnMappingUI 
              headers={timesheetHeaders} 
              mapping={mapping} 
              onChange={(newMapping) => {
                setMapping(newMapping);
                setStatus({ type: 'success', message: 'Mapping updated. Ready to process.' });
              }} 
            />
          </div>
        </div>
      )}

      {timesheetData ? (
        <div className="text-center py-4 border-top mt-4 bg-light rounded" id="generate-button-container" style={{ minHeight: '150px', display: 'block' }}>
          <p className="small text-muted mb-2">Timesheet loaded with {timesheetData.length} rows</p>
          <button
            id="real-generate-button"
            onClick={() => {
              console.log('[FileUpload] "Generate Analytics Dashboard" button clicked');
              processData();
            }}
            disabled={!isValid}
            className={`btn btn-lg px-5 fw-bold shadow-sm ${
              isValid
                ? 'btn-primary'
                : 'btn-secondary opacity-50'
            }`}
          >
            Generate Analytics Dashboard
          </button>
          {!isValid && (
            <div className="text-danger small fw-bold mt-3 d-flex align-items-center justify-content-center gap-2">
              <AlertCircle size={16} />
              Please complete the required field mappings above
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4 border-top mt-4">
          <p className="text-muted small">No timesheet data loaded yet. Please upload a file above.</p>
        </div>
      )}
    </div>
  );
}

function UploadCard({ title, description, icon, onUpload, isLoaded, progress }: { 
  title: string; 
  description: string; 
  icon: React.ReactNode; 
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isLoaded: boolean;
  progress?: number;
}) {
  return (
    <div className={`card h-100 border-0 shadow-sm text-center p-4 transition-all ${
      isLoaded ? 'bg-success bg-opacity-10 border border-success border-opacity-25' : ''
    }`}>
      <div className="card-body">
        <div className={`rounded-circle p-4 d-inline-block mb-3 ${
          isLoaded ? 'bg-success bg-opacity-25' : 'bg-light'
        }`}>
          {isLoaded ? <Check size={32} className="text-success" /> : icon}
        </div>
        <h5 className="fw-bold mb-2">{title}</h5>
        <p className="text-muted small mb-4">{description}</p>
        
        {progress !== undefined ? (
          <div className="mt-3">
            <div className="progress" style={{ height: '6px' }}>
              <div 
                className="progress-bar progress-bar-striped progress-bar-animated bg-primary" 
                role="progressbar" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="text-primary small fw-bold mt-2">Parsing... {Math.round(progress)}%</div>
          </div>
        ) : (
          <label className={`btn w-100 fw-bold py-2 ${
            isLoaded ? 'btn-outline-secondary' : 'btn-primary'
          }`}>
            {isLoaded ? 'Replace File' : 'Choose File'}
            <input type="file" className="d-none" accept=".csv,.xlsx" onChange={onUpload} />
          </label>
        )}
      </div>
    </div>
  );
}
