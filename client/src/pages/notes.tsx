import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ChartLine, ChartBar, Upload, TrendingUp, StickyNote } from "lucide-react";
import { NotesSection } from "@/components/NotesSection";

export default function NotesPage() {
  const [location] = useLocation();
  
  // Mock user ID for demo - in real app this would come from auth context
  const userId = "demo-user-id";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <h1 className="text-xl font-bold text-gray-900 flex items-center">
              <ChartLine className="text-primary-500 mr-2 h-6 w-6" />
              Chart Analysis Pro
            </h1>
            <div className="flex space-x-1">
              <Button 
                variant={location === "/charts" ? "default" : "secondary"}
                size="sm"
                asChild
              >
                <Link href="/charts">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Charts
                </Link>
              </Button>
              <Button 
                variant={location === "/dashboard" ? "default" : "secondary"}
                size="sm"
                asChild
              >
                <Link href="/dashboard">
                  <ChartBar className="mr-2 h-4 w-4" />
                  Dashboard
                </Link>
              </Button>
              <Button 
                variant={location === "/" || location === "/upload" ? "default" : "secondary"}
                size="sm"
                asChild
              >
                <Link href="/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Link>
              </Button>
              <Button 
                variant={location === "/notes" ? "default" : "secondary"}
                size="sm"
                asChild
              >
                <Link href="/notes">
                  <StickyNote className="mr-2 h-4 w-4" />
                  Notes
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Notes</h2>
            <p className="text-gray-600">
              Create, edit, and organize your trading notes and analysis in an Apple Notes-style interface.
            </p>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <NotesSection userId={userId} />
          </div>
        </div>
      </div>
    </div>
  );
}