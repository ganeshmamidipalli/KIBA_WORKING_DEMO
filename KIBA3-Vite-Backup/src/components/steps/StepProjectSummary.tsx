import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Edit3, CheckCircle2, AlertCircle, Loader2, FileText, Calendar, DollarSign, Users, Package } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import * as api from "../../lib/api";
import type { Attachment, IntakeData } from "../../types";

interface StepProjectSummaryProps {
  // Project Context
  procurementType: string;
  serviceProgram: string;
  technicalPOC: string;
  selectedProject: string;
  popStart: string;
  popCompletion: string;
  // Product Details
  productName: string;
  category: string;
  quantity: string;
  budget: string;
  projectScope: string;
  attachments: Attachment[];
  vendors: string[];
  
  // KPA One-Flow props
  kpaSessionId: string | null;
  setKpaSessionId: (value: string | null) => void;
  setIntakeData: (value: IntakeData | null) => void;
  setKpaRecommendations: (value: any) => void;
  
  // Callbacks
  onEdit: (step: number) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export function StepProjectSummary({
  procurementType,
  serviceProgram,
  technicalPOC,
  selectedProject,
  popStart,
  popCompletion,
  productName,
  category,
  quantity,
  budget,
  projectScope,
  attachments,
  vendors,
  // KPA One-Flow props
  kpaSessionId,
  setKpaSessionId,
  setIntakeData,
  // Callbacks
  onEdit,
  onConfirm,
  onBack,
}: StepProjectSummaryProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [comprehensiveSummary, setComprehensiveSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);


  // Fetch comprehensive summary on mount
  useEffect(() => {
    const fetchSummary = async () => {
      if (!kpaSessionId) return;
      
      setLoadingSummary(true);
      try {
        const response = await api.generateProjectSummary(kpaSessionId);
        setComprehensiveSummary(response.project_summary);
      } catch (error) {
        console.error("Error fetching comprehensive summary:", error);
      } finally {
        setLoadingSummary(false);
      }
    };

    fetchSummary();
  }, [kpaSessionId]);

  const handleConfirm = async () => {
    setIsConfirming(true);
    
    console.log("StepProjectSummary: Confirming project summary...");
    console.log("Session ID:", kpaSessionId);
    
    try {
      // Just proceed to next step - recommendations will be generated there
      onConfirm();
      
    } catch (error) {
      console.error("StepProjectSummary: Error:", error);
      alert("Error proceeding to recommendations. Please try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const totalBudget = parseFloat(budget) * parseInt(quantity);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
      {/* Header */}
      <div className="text-center space-y-4 pb-6">
        <div className="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-full border border-blue-200 dark:border-blue-800">
          <CheckCircle2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Project Confirmation</h2>
        </div>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Review the comprehensive project summary below. You can edit any details if needed before generating recommendations.
        </p>
      </div>

      {/* Comprehensive Project Summary */}
      <Card className="border-primary/20 shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
          <CardTitle className="flex items-center gap-3 text-xl">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            Comprehensive Project Summary
          </CardTitle>
          <CardDescription className="text-base">
            This summary includes all project details, follow-up answers, and AI analysis.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loadingSummary ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Generating comprehensive project summary...</p>
                  <p className="text-sm text-muted-foreground">This may take a few moments</p>
                </div>
              </div>
            </div>
          ) : comprehensiveSummary ? (
            <div className="space-y-0">
              <div className="p-8 bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-900/50 dark:to-gray-900/50">
                <div className="prose prose-lg dark:prose-invert max-w-none prose-headings:text-slate-800 dark:prose-headings:text-slate-200 prose-headings:font-semibold prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-strong:text-primary prose-strong:font-semibold prose-ul:text-slate-700 dark:prose-ul:text-slate-300 prose-ol:text-slate-700 dark:prose-ol:text-slate-300 prose-li:text-slate-700 dark:prose-li:text-slate-300 prose-blockquote:border-l-primary prose-blockquote:bg-slate-100 dark:prose-blockquote:bg-slate-800/50 prose-blockquote:text-slate-700 dark:prose-blockquote:text-slate-300 prose-code:bg-slate-200 dark:prose-code:bg-slate-700 prose-code:text-slate-800 dark:prose-code:text-slate-200 prose-pre:bg-slate-100 dark:prose-pre:bg-slate-800 prose-pre:border prose-pre:border-slate-200 dark:prose-pre:border-slate-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-4 pb-2 border-b border-slate-200 dark:border-slate-700">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200 mb-3 mt-6">
                          {children}
                        </h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-lg font-medium text-slate-800 dark:text-slate-200 mb-2 mt-4">
                          {children}
                        </h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-4 leading-relaxed text-slate-700 dark:text-slate-300">
                          {children}
                        </p>
                      ),
                      ul: ({ children }) => (
                        <ul className="mb-4 space-y-2 pl-6">
                          {children}
                        </ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="mb-4 space-y-2 pl-6">
                          {children}
                        </ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-slate-700 dark:text-slate-300">
                          {children}
                        </li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-primary">
                          {children}
                        </strong>
                      ),
                      code: ({ children }) => (
                        <code className="px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded text-sm font-mono">
                          {children}
                        </code>
                      ),
                      pre: ({ children }) => (
                        <pre className="p-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-x-auto mb-4">
                          {children}
                        </pre>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary pl-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-r-lg mb-4 italic text-slate-700 dark:text-slate-300">
                          {children}
                        </blockquote>
                      ),
                      table: ({ children }) => (
                        <div className="overflow-x-auto mb-4">
                          <table className="min-w-full border border-slate-200 dark:border-slate-700 rounded-lg">
                            {children}
                          </table>
                        </div>
                      ),
                      th: ({ children }) => (
                        <th className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-left font-semibold text-slate-800 dark:text-slate-200">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {comprehensiveSummary}
                  </ReactMarkdown>
                </div>
              </div>
              
              <div className="p-6 bg-amber-50 dark:bg-amber-950/20 border-t border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      Review this summary carefully
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                      If you need to make major changes, you can edit details below.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="space-y-4">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-lg font-medium">Unable to load project summary</p>
                  <p className="text-sm text-muted-foreground">Please try again or contact support if the issue persists</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Edit Options */}
      <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-gray-800/50">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Edit3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            Quick Edit Options
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            If you need to make changes, you can edit specific sections below.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Button
              variant="outline"
              onClick={() => onEdit(1)}
              className="gap-4 h-auto p-6 flex flex-col items-start hover:bg-blue-50 dark:hover:bg-blue-950/20 hover:border-blue-300 dark:hover:border-blue-700 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                  <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="text-left">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Project Context</span>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Edit project name, procurement type, service program, and POC details
                  </p>
                </div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              onClick={() => onEdit(2)}
              className="gap-4 h-auto p-6 flex flex-col items-start hover:bg-green-50 dark:hover:bg-green-950/20 hover:border-green-300 dark:hover:border-green-700 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3 w-full">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg group-hover:bg-green-200 dark:group-hover:bg-green-900/50 transition-colors">
                  <Package className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-left">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Product Details</span>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Edit product name, quantity, budget, scope, and vendor preferences
                  </p>
                </div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>


      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-6 border-t border-slate-200 dark:border-slate-700">
        <Button 
          onClick={onBack} 
          variant="outline" 
          className="gap-2 px-6 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Questions
        </Button>
        <Button 
          onClick={handleConfirm} 
          disabled={isConfirming || !comprehensiveSummary} 
          className="gap-2 px-8 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          {isConfirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Proceeding...
            </>
          ) : (
            <>
              Confirm & Continue
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
