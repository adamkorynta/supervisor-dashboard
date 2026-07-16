/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

'use client';

import React, { useRef, useState } from 'react';
import { useData } from '@/lib/DataContext';
import PersonalDashboard from '@/components/PersonalDashboard';
import SupervisorDashboard from '@/components/SupervisorDashboard';
import BranchDashboard from '@/components/BranchDashboard';
import ProjectionsDashboard from '@/components/ProjectionsDashboard';
import ProjectManagementOverview from '@/components/ProjectManagementOverview';
import ProjectManagementDetail from '@/components/ProjectManagementDetail';
import FileUpload from '@/components/FileUpload';
import BacklogDashboard from '@/components/BacklogDashboard';
import DateFilter from '@/components/DateFilter';
import { Upload, User, Users, Clock, Building2, BriefcaseBusiness, FileChartColumn, Table2, TrendingDown } from 'lucide-react';

export default function Home() {
  const { data, isLoading } = useData();
  const [activeTab, setActiveTab] = useState<'branch' | 'employee' | 'supervisor' | 'projections' | 'projectOverview' | 'projectDetail' | 'backlog' | 'upload'>('upload');
  const [selectedProjectCode, setSelectedProjectCode] = useState<string>('');
  const hasHandledInitialNavigation = useRef(false);
  const isProjectManagementTab = activeTab === 'projectOverview' || activeTab === 'projectDetail';

  // Automatically switch to branch statistics when data becomes available
  React.useEffect(() => {
    console.log(`[Home] Effect - data: ${!!data}, isLoading: ${isLoading}, activeTab: ${activeTab}`);
    if (!isLoading && !hasHandledInitialNavigation.current) {
      hasHandledInitialNavigation.current = true;
      if (data && activeTab === 'upload') {
        console.log(`[Home] Automatically switching from upload to branch`);
        setActiveTab('branch');
      }
    }
  }, [data, isLoading, activeTab]);

  const tabs = [
    { id: 'upload', label: 'DATA MANAGEMENT', icon: <Upload size={20} />, disabled: false },
    { id: 'branch', label: 'BRANCH STATISTICS', icon: <Building2 size={20} />, disabled: !data },
    { id: 'supervisor', label: 'SUPERVISOR STATISTICS', icon: <Users size={20} />, disabled: !data },
    { id: 'employee', label: 'EMPLOYEE STATISTICS', icon: <User size={20} />, disabled: !data },
    { id: 'projections', label: 'PROJECTIONS', icon: <Table2 size={20} />, disabled: !data },
    { id: 'projectOverview', label: 'PROJECT MGMT OVERVIEW', icon: <BriefcaseBusiness size={20} />, disabled: !data },
    { id: 'projectDetail', label: 'PROJECT MGMT DETAIL', icon: <FileChartColumn size={20} />, disabled: !data },
    { id: 'backlog', label: 'BACKLOG CURVES', icon: <TrendingDown size={20} />, disabled: !data },
  ];

  return (
    <div className="container-fluid p-0 d-flex min-vh-100" data-active-tab={activeTab}>
      {/* Sidebar Navigation */}
      <aside className="sidebar p-3 d-none d-md-block shadow" style={{ width: '260px', flexShrink: 0, zIndex: 1050 }}>
        <div className="d-flex flex-column align-items-center mb-5 mt-3 px-2">
          <div className="mb-3" style={{ width: '180px' }}>
            <img src="/gei-logo-light.svg" alt="GEI Consultants" className="img-fluid" />
          </div>
          <div className="text-center">
            <div className="small opacity-75 text-uppercase tracking-widest mt-1" style={{ fontSize: '0.65rem', color: 'white' }}>Timesheet Analytics</div>
          </div>
        </div>

        <nav className="nav flex-column gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                if (!tab.disabled) {
                  setActiveTab(tab.id as any);
                }
              }}
              disabled={tab.disabled}
              className={`nav-link border-0 text-start d-flex align-items-center gap-3 px-4 py-3 rounded-3 ${
                activeTab === tab.id ? 'active' : ''
              } ${tab.disabled ? 'disabled' : ''}`}
            >
              <div className={activeTab === tab.id ? 'text-primary' : 'text-white-50'}>
                {tab.icon}
              </div>
              <span className="small text-uppercase tracking-wider fw-bold">{tab.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto p-3 text-center opacity-50 small">
          <div className="border-top border-white border-opacity-25 pt-3">
            &copy; 2026 GEI Consultants
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-grow-1 bg-light">
        <header className="navbar navbar-expand-md navbar-light bg-white border-bottom px-4 py-3 sticky-top">
          <h4 className="navbar-brand mb-0 fw-bold text-dark">Business Dashboard</h4>
          
          <div className="ms-auto d-flex align-items-center gap-3">
            <img src="/gei-logo-dark.svg" alt="GEI Logo" height="30" className="me-2" />
            {!isProjectManagementTab && <DateFilter />}
            
            <button className="btn btn-outline-secondary btn-sm rounded-circle">
              <Clock size={16} />
            </button>
          </div>
        </header>

        <div className="p-4 container-fluid" style={{ maxWidth: '1600px', margin: '0 auto' }}>
          {isLoading ? (
            <div className="d-flex flex-column align-items-center justify-content-center py-5">
              <div className="spinner-border text-primary mb-3" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              <p className="text-muted fw-medium">Loading dashboard data...</p>
            </div>
          ) : !data && activeTab !== 'upload' ? (
            <div className="card text-center p-5 border-0 shadow-sm rounded-4">
              <div className="bg-light rounded-circle p-4 d-inline-block mx-auto mb-4">
                <Upload size={48} className="text-primary" />
              </div>
              <h2 className="fw-bold mb-3">Welcome back!</h2>
              <p className="text-muted mb-4 mx-auto" style={{ maxWidth: '400px' }}>
                Upload your timesheet data to visualize performance and insights in real-time.
              </p>
              <button
                onClick={() => setActiveTab('upload')}
                className="btn btn-primary btn-lg px-5 fw-bold"
              >
                Start Uploading
              </button>
            </div>
          ) : (
            <div>
              {activeTab === 'upload' && (
                <div key="upload-container">
                  <FileUpload onSuccess={() => setActiveTab('branch')} />
                </div>
              )}
              {activeTab === 'branch' && <BranchDashboard />}
              {activeTab === 'supervisor' && <SupervisorDashboard />}
              {activeTab === 'employee' && <PersonalDashboard />}
              {activeTab === 'projections' && <ProjectionsDashboard />}
              {activeTab === 'projectOverview' && (
                <ProjectManagementOverview
                  onSelectProject={(projectCode) => {
                    setSelectedProjectCode(projectCode);
                    setActiveTab('projectDetail');
                  }}
                />
              )}
              {activeTab === 'projectDetail' && (
                <ProjectManagementDetail
                  selectedProjectCode={selectedProjectCode}
                  onSelectedProjectChange={setSelectedProjectCode}
                />
              )}
              {activeTab === 'backlog' && <BacklogDashboard />}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
