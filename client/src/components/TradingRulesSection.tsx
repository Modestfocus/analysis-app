import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Edit3, Plus, GripVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Rule {
  id: string;
  content: string;
  order: number;
}

interface TradingRulesSectionProps {
  userId: string;
}

export function TradingRulesSection({ userId }: TradingRulesSectionProps) {
  const [rules, setRules] = useState<Rule[]>([
    { id: "1", content: "Never risk more than 2% of account per trade", order: 0 },
    { id: "2", content: "Always use stop loss orders", order: 1 },
    { id: "3", content: "Take profits at predetermined levels", order: 2 },
  ]);
  const [newRuleContent, setNewRuleContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const { toast } = useToast();

  const handleAddRule = () => {
    if (!newRuleContent.trim()) {
      toast({
        title: "Empty Rule",
        description: "Please enter a trading rule",
        variant: "destructive",
      });
      return;
    }

    const newRule: Rule = {
      id: Date.now().toString(),
      content: newRuleContent.trim(),
      order: rules.length,
    };

    setRules([...rules, newRule]);
    setNewRuleContent("");
    
    toast({
      title: "Rule Added",
      description: "Your trading rule has been added successfully",
    });
  };

  const handleEditStart = (rule: Rule) => {
    setEditingId(rule.id);
    setEditContent(rule.content);
  };

  const handleEditSave = (ruleId: string) => {
    if (!editContent.trim()) {
      toast({
        title: "Empty Rule",
        description: "Rule content cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setRules(rules.map(rule => 
      rule.id === ruleId 
        ? { ...rule, content: editContent.trim() }
        : rule
    ));
    
    setEditingId(null);
    setEditContent("");
    
    toast({
      title: "Rule Updated",
      description: "Your trading rule has been updated successfully",
    });
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditContent("");
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(rule => rule.id !== ruleId));
    
    toast({
      title: "Rule Deleted",
      description: "Trading rule has been removed",
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="text-center py-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Trading Rules</h3>
        <p className="text-gray-500 text-sm">
          Define and manage your personal trading rules and strategies
        </p>
      </div>

      {/* Add New Rule */}
      <div className="space-y-3 pb-4 border-b">
        <div className="flex space-x-2">
          <Input
            placeholder="Add a new trading rule..."
            value={newRuleContent}
            onChange={(e) => setNewRuleContent(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, handleAddRule)}
            className="flex-1"
          />
          <Button 
            onClick={handleAddRule}
            size="sm"
            className="px-3"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No trading rules defined yet.</p>
            <p className="text-sm">Add your first rule above to get started.</p>
          </div>
        ) : (
          rules
            .sort((a, b) => a.order - b.order)
            .map((rule) => (
              <div
                key={rule.id}
                className="group flex items-start space-x-3 py-3 px-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {/* Drag Handle */}
                <div className="flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                  <GripVertical className="h-4 w-4 text-gray-400" />
                </div>

                {/* Bullet Point */}
                <div className="flex-shrink-0 mt-2">
                  <div className="w-1.5 h-1.5 bg-gray-600 rounded-full"></div>
                </div>

                {/* Rule Content */}
                <div className="flex-1 min-w-0">
                  {editingId === rule.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            handleEditSave(rule.id);
                          } else if (e.key === 'Escape') {
                            handleEditCancel();
                          }
                        }}
                        className="text-sm"
                        autoFocus
                      />
                      <div className="flex space-x-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditSave(rule.id)}
                          className="h-7 px-3 text-xs"
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleEditCancel}
                          className="h-7 px-3 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p 
                      className="text-gray-800 leading-relaxed cursor-text"
                      onClick={() => handleEditStart(rule)}
                    >
                      {rule.content}
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                {editingId !== rule.id && (
                  <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditStart(rule)}
                        className="h-7 w-7 p-0 hover:bg-gray-200"
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteRule(rule.id)}
                        className="h-7 w-7 p-0 hover:bg-red-100 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {/* Footer Info */}
      {rules.length > 0 && (
        <div className="pt-4 border-t">
          <p className="text-xs text-gray-500 text-center">
            {rules.length} trading rule{rules.length !== 1 ? 's' : ''} defined
          </p>
        </div>
      )}
    </div>
  );
}