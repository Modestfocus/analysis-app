import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import HomeAuthPage from "@/pages/home-auth-page";
import UploadPage from "@/pages/upload";
import DashboardPage from "@/pages/dashboard";
import ChartsPage from "@/pages/charts";
import NotesPage from "@/pages/notes";

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeAuthPage} />
      <Route path="/upload" component={UploadPage} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/charts" component={ChartsPage} />
      <Route path="/notes" component={NotesPage} />
      <Route>404 - Page Not Found</Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
