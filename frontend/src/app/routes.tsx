import { lazy, Suspense } from "react";
import { Navigate, createBrowserRouter, useRouteError } from "react-router-dom";
import { AlertTriangle, RefreshCcw } from "lucide-react";

import { AdminShell } from "../admin/AdminShell";
import { Shell } from "./Shell";
import { useAuth } from "./AuthContext";
import { LoginPage } from "../pages/LoginPage";

// ── Lazy page imports ──────────────────────────────────────────────────────
const DashboardPage       = lazy(() => import("../pages/DashboardPage").then(m => ({ default: m.DashboardPage })));
const EmployeesPage       = lazy(() => import("../pages/EmployeesPage").then(m => ({ default: m.EmployeesPage })));
const PayrollPage         = lazy(() => import("../pages/PayrollPage").then(m => ({ default: m.PayrollPage })));
const BillingPage         = lazy(() => import("../pages/BillingPage").then(m => ({ default: m.BillingPage })));
const InventoryPage       = lazy(() => import("../pages/InventoryPage").then(m => ({ default: m.InventoryPage })));
const PosPage             = lazy(() => import("../pages/PosPage").then(m => ({ default: m.PosPage })));
const TransactionsPage    = lazy(() => import("../pages/TransactionsPage").then(m => ({ default: m.TransactionsPage })));
const SettingsPage        = lazy(() => import("../pages/SettingsPage").then(m => ({ default: m.SettingsPage })));
const AccountingFinancePage = lazy(() => import("../pages/AccountingFinancePage").then(m => ({ default: m.AccountingFinancePage })));
const DocumentsPage       = lazy(() => import("../pages/DocumentsPage").then(m => ({ default: m.DocumentsPage })));
const CompanyPage         = lazy(() => import("../pages/CompanyPage").then(m => ({ default: m.CompanyPage })));
const ReportsHubPage      = lazy(() => import("../pages/ReportsHubPage").then(m => ({ default: m.ReportsHubPage })));
const ReportsTerasPage    = lazy(() => import("../pages/ReportsTerasPage").then(m => ({ default: m.ReportsTerasPage })));
const ChatPage            = lazy(() => import("../pages/ChatPage").then(m => ({ default: m.ChatPage })));
const WorkPage            = lazy(() => import("../pages/WorkPage").then(m => ({ default: m.WorkPage })));
const CalendarPage        = lazy(() => import("../pages/CalendarPage").then(m => ({ default: m.CalendarPage })));
const NotesPage           = lazy(() => import("../pages/NotesPage").then(m => ({ default: m.NotesPage })));
const ProjectsPage        = lazy(() => import("../pages/ProjectsPage").then(m => ({ default: m.ProjectsPage })));
const MeetingsPage        = lazy(() => import("../pages/MeetingsPage").then(m => ({ default: m.MeetingsPage })));
const HelpCenterPage      = lazy(() => import("../pages/HelpCenterPage").then(m => ({ default: m.HelpCenterPage })));
const SafeModePage        = lazy(() => import("../pages/SafeModePage").then(m => ({ default: m.SafeModePage })));
const ClientsPage         = lazy(() => import("../pages/ClientsPage").then(m => ({ default: m.ClientsPage })));
const InvestmentsPage     = lazy(() => import("../pages/InvestmentsPage").then(m => ({ default: m.InvestmentsPage })));
const BudgetPage          = lazy(() => import("../pages/BudgetPage").then(m => ({ default: m.BudgetPage })));
const AssistantsPage      = lazy(() => import("../pages/AssistantsPage").then(m => ({ default: m.AssistantsPage })));
const DeclarationsPage    = lazy(() => import("../pages/DeclarationsPage").then(m => ({ default: m.DeclarationsPage })));
const LegislationPage     = lazy(() => import("../pages/LegislationPage"));
const EmployeeProfilePage = lazy(() => import("../pages/EmployeeProfilePage").then(m => ({ default: m.EmployeeProfilePage })));
const ActivationPage      = lazy(() => import("../pages/ActivationPage").then(m => ({ default: m.ActivationPage })));
const AuditLogsPage       = lazy(() => import("../pages/AuditLogsPage").then(m => ({ default: m.AuditLogsPage })));
const NotFoundPage        = lazy(() => import("../pages/NotFoundPage").then(m => ({ default: m.NotFoundPage })));
const AnalyticsPage       = lazy(() => import("../pages/AnalyticsPage").then(m => ({ default: m.AnalyticsPage })));
const AgendaFiscalPage    = lazy(() => import("../pages/AgendaFiscalPage").then(m => ({ default: m.AgendaFiscalPage })));

// ── Groups module ──────────────────────────────────────────────────────────
const GroupsListPage        = lazy(() => import("../pages/groups/GroupsListPage").then(m => ({ default: m.GroupsListPage })));
const GroupLayout           = lazy(() => import("../pages/groups/GroupLayout").then(m => ({ default: m.GroupLayout })));
const GroupDashboardPage    = lazy(() => import("../pages/groups/GroupDashboardPage").then(m => ({ default: m.GroupDashboardPage })));
const GroupMembersPage      = lazy(() => import("../pages/groups/GroupMembersPage").then(m => ({ default: m.GroupMembersPage })));
const GroupContributionsPage = lazy(() => import("../pages/groups/GroupContributionsPage").then(m => ({ default: m.GroupContributionsPage })));
const GroupTransactionsPage = lazy(() => import("../pages/groups/GroupTransactionsPage").then(m => ({ default: m.GroupTransactionsPage })));
const GroupExpensesPage     = lazy(() => import("../pages/groups/GroupExpensesPage").then(m => ({ default: m.GroupExpensesPage })));
const GroupCalendarPage     = lazy(() => import("../pages/groups/GroupCalendarPage").then(m => ({ default: m.GroupCalendarPage })));
const GroupMeetingsPage     = lazy(() => import("../pages/groups/GroupMeetingsPage").then(m => ({ default: m.GroupMeetingsPage })));
const GroupBirthdaysPage    = lazy(() => import("../pages/groups/GroupBirthdaysPage").then(m => ({ default: m.GroupBirthdaysPage })));
const GroupChatPage         = lazy(() => import("../pages/groups/GroupChatPage").then(m => ({ default: m.GroupChatPage })));
const GroupDocumentsPage    = lazy(() => import("../pages/groups/GroupDocumentsPage").then(m => ({ default: m.GroupDocumentsPage })));
const GroupVotesPage        = lazy(() => import("../pages/groups/GroupVotesPage").then(m => ({ default: m.GroupVotesPage })));
const GroupLeadershipPage   = lazy(() => import("../pages/groups/GroupLeadershipPage").then(m => ({ default: m.GroupLeadershipPage })));
const GroupAIAssistantPage  = lazy(() => import("../pages/groups/GroupAIAssistantPage").then(m => ({ default: m.GroupAIAssistantPage })));
const GroupReportsPage      = lazy(() => import("../pages/groups/GroupReportsPage").then(m => ({ default: m.GroupReportsPage })));
const GroupSettingsPage     = lazy(() => import("../pages/groups/GroupSettingsPage").then(m => ({ default: m.GroupSettingsPage })));

// ── Lazy admin page imports ────────────────────────────────────────────────
const AdminCompaniesPage    = lazy(() => import("../admin/pages/AdminCompaniesPage").then(m => ({ default: m.AdminCompaniesPage })));
const AdminCompanyDetailPage = lazy(() => import("../admin/pages/AdminCompanyDetailPage").then(m => ({ default: m.AdminCompanyDetailPage })));
const AdminDashboardPage    = lazy(() => import("../admin/pages/AdminDashboardPage").then(m => ({ default: m.AdminDashboardPage })));
const AdminLogsPage         = lazy(() => import("../admin/pages/AdminLogsPage").then(m => ({ default: m.AdminLogsPage })));
const AdminLimulePage       = lazy(() => import("../admin/pages/AdminLimulePage").then(m => ({ default: m.AdminLimulePage })));
const AdminTicketDetailPage = lazy(() => import("../admin/pages/AdminTicketDetailPage").then(m => ({ default: m.AdminTicketDetailPage })));
const AdminTicketsPage      = lazy(() => import("../admin/pages/AdminTicketsPage").then(m => ({ default: m.AdminTicketsPage })));
const AdminUsersPage        = lazy(() => import("../admin/pages/AdminUsersPage").then(m => ({ default: m.AdminUsersPage })));
const AdminAnalyticsPage    = lazy(() => import("../admin/pages/AdminAnalyticsPage").then(m => ({ default: m.AdminAnalyticsPage })));
const AdminBroadcastPage    = lazy(() => import("../admin/pages/AdminBroadcastPage").then(m => ({ default: m.AdminBroadcastPage })));
const AdminSystemPage       = lazy(() => import("../admin/pages/AdminSystemPage").then(m => ({ default: m.AdminSystemPage })));
const AdminOnboardingPage   = lazy(() => import("../admin/pages/AdminOnboardingPage").then(m => ({ default: m.AdminOnboardingPage })));

// ── Route error boundary (replaces React Router's ugly default) ───────────
function RouteErrorElement() {
  const error = useRouteError() as Error | null;
  const msg = error instanceof Error ? error.message : String(error ?? "Erreur inattendue");
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-500/10">
        <AlertTriangle size={28} className="text-red-500" />
      </div>
      <div>
        <p className="text-base font-bold text-red-700 dark:text-red-400">Une erreur s'est produite</p>
        <p className="mt-1 max-w-sm text-sm text-red-600/80 dark:text-red-300/70">{msg}</p>
      </div>
      <button
        onClick={() => window.location.reload()}
        className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
      >
        <RefreshCcw size={14} /> Recharger la page
      </button>
    </div>
  );
}

// ── Suspense fallback spinner ──────────────────────────────────────────────
function LazyRoute({ page: Page }: { page: React.ComponentType }) {
  return (
    <Suspense fallback={
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
      </div>
    }>
      <Page />
    </Suspense>
  );
}

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
  { path: "/login", element: <LoginPage />, errorElement: <RouteErrorElement /> },
  {
    path: "/admin",
    element: <AdminProtectedRoute />,
    errorElement: <RouteErrorElement />,
    children: [
      { index: true,                   element: <LazyRoute page={AdminDashboardPage} /> },
      { path: "companies",             element: <LazyRoute page={AdminCompaniesPage} /> },
      { path: "companies/:companyId",  element: <LazyRoute page={AdminCompanyDetailPage} /> },
      { path: "users",                 element: <LazyRoute page={AdminUsersPage} /> },
      { path: "tickets",               element: <LazyRoute page={AdminTicketsPage} /> },
      { path: "tickets/:ticketId",     element: <LazyRoute page={AdminTicketDetailPage} /> },
      { path: "limule",                element: <LazyRoute page={AdminLimulePage} /> },
      { path: "logs",                  element: <LazyRoute page={AdminLogsPage} /> },
      { path: "analytics",             element: <LazyRoute page={AdminAnalyticsPage} /> },
      { path: "broadcast",             element: <LazyRoute page={AdminBroadcastPage} /> },
      { path: "system",                element: <LazyRoute page={AdminSystemPage} /> },
      { path: "onboarding",            element: <LazyRoute page={AdminOnboardingPage} /> },
    ],
  },
  {
    path: "/",
    element: <ProtectedRoute />,
    errorElement: <RouteErrorElement />,
    children: [
      { index: true,                   element: <LazyRoute page={DashboardPage} /> },
      { path: "activation",            element: <LazyRoute page={ActivationPage} /> },
      { path: "company",               element: <LazyRoute page={CompanyPage} /> },
      { path: "employees",             element: <LazyRoute page={EmployeesPage} /> },
      { path: "employees/:id",         element: <LazyRoute page={EmployeeProfilePage} /> },
      { path: "documents",             element: <LazyRoute page={DocumentsPage} /> },
      { path: "payroll",               element: <LazyRoute page={PayrollPage} /> },
      { path: "billing",               element: <LazyRoute page={BillingPage} /> },
      { path: "pos",                   element: <LazyRoute page={PosPage} /> },
      { path: "inventory",             element: <LazyRoute page={InventoryPage} /> },
      { path: "inventory-pos",         element: <Navigate to="/pos" replace /> },
      { path: "chat",                  element: <LazyRoute page={ChatPage} /> },
      { path: "work",                  element: <LazyRoute page={WorkPage} /> },
      { path: "calendar",              element: <LazyRoute page={CalendarPage} /> },
      { path: "notes",                 element: <LazyRoute page={NotesPage} /> },
      { path: "reports",               element: <LazyRoute page={ReportsHubPage} /> },
      { path: "reports-teras",         element: <LazyRoute page={ReportsTerasPage} /> },
      { path: "assistants",            element: <LazyRoute page={AssistantsPage} /> },
      { path: "declarations",          element: <LazyRoute page={DeclarationsPage} /> },
      { path: "settings",              element: <LazyRoute page={SettingsPage} /> },
      { path: "accounting",            element: <LazyRoute page={AccountingFinancePage} /> },
      { path: "projects",              element: <LazyRoute page={ProjectsPage} /> },
      { path: "meetings",              element: <LazyRoute page={MeetingsPage} /> },
      { path: "help",                  element: <LazyRoute page={HelpCenterPage} /> },
      { path: "safe-mode",             element: <LazyRoute page={SafeModePage} /> },
      { path: "clients",               element: <LazyRoute page={ClientsPage} /> },
      { path: "investments",           element: <LazyRoute page={InvestmentsPage} /> },
      { path: "budget",                element: <LazyRoute page={BudgetPage} /> },
      { path: "transactions",          element: <LazyRoute page={TransactionsPage} /> },
      { path: "legislation",           element: <LazyRoute page={LegislationPage} /> },
      { path: "audit",                 element: <LazyRoute page={AuditLogsPage} /> },
      { path: "analytics",             element: <LazyRoute page={AnalyticsPage} /> },
      { path: "fiscal",                element: <LazyRoute page={AgendaFiscalPage} /> },
      { path: "groups",                element: <LazyRoute page={GroupsListPage} /> },
      {
        path: "groups/:groupId",
        element: <Suspense fallback={<div className="flex h-64 items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-600 border-t-transparent" /></div>}><GroupLayout /></Suspense>,
        children: [
          { index: true,               element: <LazyRoute page={GroupDashboardPage} /> },
          { path: "dashboard",         element: <LazyRoute page={GroupDashboardPage} /> },
          { path: "members",           element: <LazyRoute page={GroupMembersPage} /> },
          { path: "contributions",     element: <LazyRoute page={GroupContributionsPage} /> },
          { path: "transactions",      element: <LazyRoute page={GroupTransactionsPage} /> },
          { path: "expenses",          element: <LazyRoute page={GroupExpensesPage} /> },
          { path: "calendar",          element: <LazyRoute page={GroupCalendarPage} /> },
          { path: "meetings",          element: <LazyRoute page={GroupMeetingsPage} /> },
          { path: "birthdays",         element: <LazyRoute page={GroupBirthdaysPage} /> },
          { path: "chat",              element: <LazyRoute page={GroupChatPage} /> },
          { path: "documents",         element: <LazyRoute page={GroupDocumentsPage} /> },
          { path: "votes",             element: <LazyRoute page={GroupVotesPage} /> },
          { path: "leadership",        element: <LazyRoute page={GroupLeadershipPage} /> },
          { path: "ai-assistant",      element: <LazyRoute page={GroupAIAssistantPage} /> },
          { path: "reports",           element: <LazyRoute page={GroupReportsPage} /> },
          { path: "settings",          element: <LazyRoute page={GroupSettingsPage} /> },
        ],
      },
      { path: "*",                     element: <LazyRoute page={NotFoundPage} /> },
    ]
  }
]);
