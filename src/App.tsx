import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
// import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { lazy, Suspense } from 'react';
import PendingInviteHandler from './components/PendingInviteHandler';
const CityBlitz = lazy(() => import('./pages/V2')); // rename later if desired
const SharedMapViewer = lazy(() => import('./pages/SharedMapViewer'));
const FactionStrike = lazy(() => import('./features/strike/FactionStrikePage'));
const OrgAdmin = lazy(() => import('./features/admin/OrgAdminPage'));
const InvitePage = lazy(() => import('./pages/invite'));
const SuperAdmin = lazy(() => import('./features/admin/SuperAdminPage'));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PendingInviteHandler />
        <Routes>
          <Route path="/" element={<Suspense fallback={<div>Loading...</div>}><CityBlitz /></Suspense>} />
          <Route path="/shared/:shareId" element={<Suspense fallback={<div>Loading shared map...</div>}><SharedMapViewer /></Suspense>} />
          <Route path="/faction-strike-planner" element={<Suspense fallback={<div>Loading strike planner...</div>}><FactionStrike /></Suspense>} />
          <Route path="/admin/org/:orgId" element={<Suspense fallback={<div>Loading admin...</div>}><OrgAdmin /></Suspense>} />
          <Route path="/invite" element={<Suspense fallback={<div>Loading invite...</div>}><InvitePage /></Suspense>} />
          <Route path="/super-admin" element={<Suspense fallback={<div>Loading…</div>}><SuperAdmin /></Suspense>} />
          {/* Legacy route removed; single-page app is City Blitz Planner */}
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
