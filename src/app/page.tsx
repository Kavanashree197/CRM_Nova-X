"use client";
import React, { useState } from "react";
import { AuthProvider, useAuth } from "@/components/crm/AuthProvider";
import { ToastProvider } from "@/components/crm/Feedback";
import Sidebar, { View } from "@/components/crm/Sidebar";
import TopNav from "@/components/crm/TopNav";
import Overview from "@/components/crm/pages/Overview";
import MyCases from "@/components/crm/pages/MyCases";
import AllCases from "@/components/crm/pages/AllCases";
import CreateCase from "@/components/crm/pages/CreateCase";
import ActivityLogs from "@/components/crm/pages/ActivityLogs";
import ProductivityReports from "@/components/crm/pages/ProductivityReports";
import TeamPerformance from "@/components/crm/pages/TeamPerformance";
import Settings from "@/components/crm/pages/Settings";
import Login from "@/components/crm/pages/Login";

function Shell() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("overview");
  const [search, setSearch] = useState<string | undefined>(undefined);

  if (!user) return <Login />;

  const onNav = (v: View) => setView(v);
  const onSearch = (q: string) => { setSearch(q); setView("all-cases"); };

  return (
    <div className="app-shell">
      <Sidebar view={view} onNav={onNav} />
      <div className="main">
        <TopNav onNav={onNav} onSearch={onSearch} />
        <div className="main-scroll">
          {view === "overview" && <Overview onOpenCase={()=>{}} onNav={onNav} />}
          {view === "my-cases" && <MyCases onNav={onNav} />}
          {view === "all-cases" && <AllCases initialSearch={search} />}
          {view === "create-case" && <CreateCase onNav={onNav} />}
          {view === "activity-logs" && <ActivityLogs />}
          {view === "reports" && <ProductivityReports />}
          {view === "team" && user.role !== "Resource" && <TeamPerformance />}
          {view === "settings" && user.role === "Admin" && <Settings />}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Shell />
      </ToastProvider>
    </AuthProvider>
  );
}
