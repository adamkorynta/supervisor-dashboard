/*
 * Copyright (c) 2026
 * United States Army Corps of Engineers - Hydrologic Engineering Center (USACE/HEC)
 * All Rights Reserved.  USACE PROPRIETARY/CONFIDENTIAL.
 * Source may not be released without written approval from HEC
 */

import type { Metadata } from "next";
import "../styles/globals.css";
import { DataProvider } from "@/lib/DataContext";

export const metadata: Metadata = {
  title: "GEI Timesheet Analytics",
  description: "Interactive supervisor and employee analytics for GEI Consultants",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <DataProvider>
          {children}
        </DataProvider>
      </body>
    </html>
  );
}
