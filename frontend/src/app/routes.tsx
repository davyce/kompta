import { Navigate, createBrowserRouter } from "react-router-dom";

import { AdminShell } from "../admin/AdminShell";
import { AdminCompaniesPage } from "../admin/pages/AdminCompaniesPage";
import { AdminCompanyDetailPage } from "../admin/pages/AdminCompanyDetailPage";
import { AdminDashboardPage } from "../admin/pages/AdminDashboardPage";
import { AdminLogsPage } from "../admin/pages/AdminLogsPage";
import { AdminLimulePage } from "../admin/pages/AdminLimulePage";
import { AdminTicketDetailPage } from "../admin/pages/AdminTicketDetailPage";
import { AdminTicketsPage } from "../admin/pages/AdminTicketsPage";
import { AdminUsersPage } from "../admin/pages/AdminUsersPage";
import { Shell } from "./Shell";
import { useAuth } from "./AuthContext";
import { AssistantsPage } from "../pages/AssistantsPage";
import { ChatPage } from "../pages/ChatPage";
import { DeclarationsPage } from "../pages/DeclarationsPage";
import { ActivationPage } from "../pages/ActivationPage";
import { AccountingFinancePage } from "../pages/AccountingFinancePage";
import { BillingPage } from "../pages/BillingPage";
import { CalendarPage } from "../pages/CalendarPage";
import { CompanyPage } from "../pages/CompanyPage";
import { DashboardPage } from "../pages/DashboardPage";
import { DocumentsPage } from "../pages/DocumentsPage";
import { EmployeesPage } from "../pages/EmployeesPage";
import { InventoryPage } from "../pages/InventoryPage";
import { PosPage } from "../pages/PosPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { PayrollPage } from "../pages/PayrollPage";
import { ReportsHubPage } from "../pages/ReportsHubPage";
import { ReportsTerasPage } from "../pages/ReportsTerasPage";
import { SettingsPage } from "../pages/SettingsPage";
import { WorkPage } from "../pages/WorkPage";
import { NotesPage } from "../pages/NotesPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { EmployeeProfilePage } from "../pages/EmployeeProfilePage";
import { MeetingsPage } from "../pages/MeetingsPage";
import { HelpCenterPage } from "../pages/HelpCenterPage";

function ProtectedRoute() {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Shell />;
}

function AdminProtectedRoute() {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <AdminShell />;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/admin",
    element: <AdminProtectedRoute />,
    children: [
      { index: true, element: <AdminDashboardPage /> },
      { path: "companies", element: <AdminCompaniesPage /> },
      { path: "companies/:companyId", element: <AdminCompanyDetailPage /> },
      { path: "users", element: <AdminUsersPage /> },
      { path: "tickets", element: <AdminTicketsPage /> },
      { path: "tickets/:ticketId", element: <AdminTicketDetailPage /> },
      { path: "limule", element: <AdminLimulePage /> },
      { path: "logs", element: <AdminLogsPage /> },
    ],
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "activation", element: <ActivationPage /> },
      { path: "company", element: <CompanyPage /> },
      { path: "employees", element: <EmployeesPage /> },
      { path: "employees/:id", element: <EmployeeProfilePage /> },
      { path: "documents", element: <DocumentsPage /> },
      { path: "payroll", element: <PayrollPage /> },
      { path: "billing", element: <BillingPage /> },
      { path: "pos", element: <PosPage /> },
      { path: "inventory", element: <InventoryPage /> },
      { path: "inventory-pos", element: <Navigate to="/pos" replace /> },
      { path: "chat", element: <ChatPage /> },
      { path: "work", element: <WorkPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "notes", element: <NotesPage /> },
      { path: "reports", element: <ReportsHubPage /> },
      { path: "reports-teras", element: <ReportsTerasPage /> },
      { path: "assistants", element: <AssistantsPage /> },
      { path: "declarations", element: <DeclarationsPage /> },
      { path: "settings", element: <SettingsPage /> },
      { path: "accounting", element: <AccountingFinancePage /> },
      { path: "projects", element: <ProjectsPage /> },
      { path: "meetings", element: <MeetingsPage /> },
      { path: "help", element: <HelpCenterPage /> },
      { path: "*", element: <NotFoundPage /> }
    ]
  }
]);
