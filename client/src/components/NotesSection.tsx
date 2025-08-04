import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { 
  Plus, 
  Search, 
  FileText, 
  Clock, 
  Trash2,
  Edit3,
  Save,
  X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDistance } from "date-fns";
import type { Note, InsertNote } from "@shared/schema";

interface NotesSectionProps {
  userId: string;
}

const STORAGE_KEY = 'notes-last-selected';

export function NotesSection({ userId }: NotesSectionProps) {
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user notes
  const { data: notesData, isLoading } = useQuery({
    queryKey: ['notes', userId],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/notes/user/${userId}`);
      const data = await response.json();
      return data.notes as Note[];
    },
  });

  const notes = notesData || [];

  // Filter notes based on search term
  const filteredNotes = notes.filter(note => 
    note.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Create note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (noteData: InsertNote) => {
      const response = await apiRequest('POST', '/api/notes', { body: noteData });
      const data = await response.json();
      return data.note as Note;
    },
    onSuccess: (newNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
      setSelectedNote(newNote);
      setIsEditing(true);
      setEditTitle(newNote.title);
      setEditContent(newNote.content);
      localStorage.setItem(STORAGE_KEY, newNote.id);
      toast({
        title: "Note created",
        description: "Your new note is ready for editing.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create note. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Update note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Note> }) => {
      const response = await apiRequest('PATCH', `/api/notes/${id}`, { body: updates });
      const data = await response.json();
      return data.note as Note;
    },
    onSuccess: (updatedNote) => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
      setSelectedNote(updatedNote);
      setHasUnsavedChanges(false);
      toast({
        title: "Note saved",
        description: "Your changes have been saved.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save note. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      await apiRequest('DELETE', `/api/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', userId] });
      setSelectedNote(null);
      setIsEditing(false);
      localStorage.removeItem(STORAGE_KEY);
      toast({
        title: "Note deleted",
        description: "The note has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete note. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle note creation
  const handleCreateNote = () => {
    const newNoteData: InsertNote = {
      userId,
      title: "Untitled Note",
      content: "",
    };
    createNoteMutation.mutate(newNoteData);
  };

  // Handle note selection
  const handleSelectNote = (note: Note) => {
    if (hasUnsavedChanges) {
      const shouldDiscard = confirm("You have unsaved changes. Do you want to discard them?");
      if (!shouldDiscard) return;
    }
    
    setSelectedNote(note);
    setIsEditing(false);
    setEditTitle(note.title);
    setEditContent(note.content);
    setHasUnsavedChanges(false);
    localStorage.setItem(STORAGE_KEY, note.id);
  };

  // Handle edit mode toggle
  const handleToggleEdit = () => {
    if (isEditing && hasUnsavedChanges) {
      handleSaveNote();
    } else {
      setIsEditing(!isEditing);
      if (!isEditing && selectedNote) {
        setEditTitle(selectedNote.title);
        setEditContent(selectedNote.content);
      }
    }
  };

  // Handle save note
  const handleSaveNote = () => {
    if (!selectedNote) return;
    
    updateNoteMutation.mutate({
      id: selectedNote.id,
      updates: {
        title: editTitle || "Untitled Note",
        content: editContent,
      },
    });
    setIsEditing(false);
  };

  // Handle discard changes
  const handleDiscardChanges = () => {
    if (!selectedNote) return;
    setEditTitle(selectedNote.title);
    setEditContent(selectedNote.content);
    setHasUnsavedChanges(false);
    setIsEditing(false);
  };

  // Handle delete note
  const handleDeleteNote = () => {
    if (!selectedNote) return;
    
    const shouldDelete = confirm("Are you sure you want to delete this note? This action cannot be undone.");
    if (shouldDelete) {
      deleteNoteMutation.mutate(selectedNote.id);
    }
  };

  // Track changes
  useEffect(() => {
    if (selectedNote && isEditing) {
      const hasChanges = editTitle !== selectedNote.title || editContent !== selectedNote.content;
      setHasUnsavedChanges(hasChanges);
    }
  }, [editTitle, editContent, selectedNote, isEditing]);

  // Restore last selected note
  useEffect(() => {
    if (notes.length > 0 && !selectedNote) {
      const lastSelectedId = localStorage.getItem(STORAGE_KEY);
      const lastSelected = lastSelectedId ? notes.find(n => n.id === lastSelectedId) : null;
      const noteToSelect = lastSelected || notes[0];
      setSelectedNote(noteToSelect);
      setEditTitle(noteToSelect.title);
      setEditContent(noteToSelect.content);
    }
  }, [notes, selectedNote]);

  // Generate note preview snippet
  const generatePreview = (content: string, maxLength: number = 100) => {
    const cleaned = content.replace(/\n/g, ' ').trim();
    return cleaned.length > maxLength ? cleaned.substring(0, maxLength) + '...' : cleaned;
  };

  // Auto-save functionality
  const debouncedSave = useCallback(
    debounce(() => {
      if (selectedNote && isEditing && hasUnsavedChanges) {
        handleSaveNote();
      }
    }, 2000),
    [selectedNote, isEditing, hasUnsavedChanges, editTitle, editContent]
  );

  useEffect(() => {
    if (hasUnsavedChanges) {
      debouncedSave();
    }
    return () => {
      debouncedSave.cancel?.();
    };
  }, [hasUnsavedChanges, debouncedSave]);

  if (isLoading) {
    return (
      <div className="flex h-[600px] bg-gray-50 dark:bg-gray-900 rounded-lg">
        <div className="flex items-center justify-center w-full">
          <div className="text-gray-500 dark:text-gray-400">Loading notes...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[600px] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden">
      {/* Left Sidebar - Notes List */}
      <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Notes</h3>
            <Button
              onClick={handleCreateNote}
              size="sm"
              className="h-8 w-8 p-0"
              disabled={createNoteMutation.isPending}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-8 text-sm"
            />
          </div>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 ? (
            <div className="p-4 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {searchTerm ? "No notes found" : "No notes yet"}
              </p>
              {!searchTerm && (
                <Button
                  onClick={handleCreateNote}
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={createNoteMutation.isPending}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create your first note
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  onClick={() => handleSelectNote(note)}
                  className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedNote?.id === note.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-r-2 border-blue-500'
                      : ''
                  }`}
                >
                  <h4 className="font-medium text-gray-900 dark:text-white text-sm mb-1 line-clamp-1">
                    {note.title}
                  </h4>
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <Clock className="h-3 w-3 mr-1" />
                    {formatDistance(new Date(note.updatedAt || note.createdAt!), new Date(), { addSuffix: true })}
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-2">
                    {generatePreview(note.content) || "No content"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Panel - Note Editor */}
      <div className="flex-1 flex flex-col bg-white dark:bg-gray-800">
        {selectedNote ? (
          <>
            {/* Editor Header */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <Clock className="h-4 w-4 mr-1" />
                  {formatDistance(new Date(selectedNote.updatedAt || selectedNote.createdAt!), new Date(), { addSuffix: true })}
                </div>
                {hasUnsavedChanges && (
                  <Badge variant="secondary" className="text-xs">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              <div className="flex items-center space-x-2">
                {isEditing ? (
                  <>
                    <Button
                      onClick={handleSaveNote}
                      size="sm"
                      disabled={updateNoteMutation.isPending}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save
                    </Button>
                    <Button
                      onClick={handleDiscardChanges}
                      variant="ghost"
                      size="sm"
                    >
                      <X className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleToggleEdit}
                      variant="ghost"
                      size="sm"
                    >
                      <Edit3 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                  </>
                )}
                <Button
                  onClick={handleDeleteNote}
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300"
                  disabled={deleteNoteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 p-6 overflow-y-auto">
              {isEditing ? (
                <div className="space-y-4">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Note title..."
                    className="text-xl font-semibold border-none shadow-none p-0 focus-visible:ring-0"
                  />
                  <Separator />
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Start writing your note..."
                    className="min-h-[400px] border-none shadow-none p-0 resize-none focus-visible:ring-0 text-sm leading-relaxed"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {selectedNote.title}
                  </h1>
                  <Separator />
                  <div className="prose prose-gray dark:prose-invert max-w-none">
                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                      {selectedNote.content || "This note is empty."}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select a note to view
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Choose a note from the sidebar or create a new one
              </p>
              <Button
                onClick={handleCreateNote}
                disabled={createNoteMutation.isPending}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Note
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple debounce implementation
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): T & { cancel?: () => void } {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = ((...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), wait);
  }) as T & { cancel?: () => void };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
}