import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { findVendors } from "../../lib/api";
import type { SpecVariant, KPARecommendations } from "../../types";

interface VendorItem {
  id: string;
  vendor_name: string;
  product_name: string;
  model: string;
  price?: string;
  inStock?: boolean;
  delivery?: string;
  score?: number;
  purchase_url?: string;
  notes?: string;
  isSelected?: boolean;
}

interface Batch {
  id: number;
  title: string;
  query: string;
  items: VendorItem[];
  createdAt: string;
  expanded: boolean;
}

interface StepVendorSearchProps {
  productName: string;
  selectedVariants: SpecVariant[];
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  searchOutputText: string;
  setSearchOutputText: (value: string) => void;
  searching: boolean;
  setSearching: (value: boolean) => void;
  kpaRecommendations: KPARecommendations | null;
  onNext: (data?: any) => void;
  onBack: () => void;
}

// Minimal thinking steps for first run only
const THINKING_STEPS = [
  "Analyzing requirements…",
  "Building search query…", 
  "Searching vendors…",
  "Validating vendor data…",
  "Extracting pricing & availability…",
  "Finalizing results…"
];

const MAX_SELECTIONS = 10;

export function StepVendorSearch({
  productName,
  selectedVariants,
  searchQuery,
  setSearchQuery,
  searchOutputText,
  setSearchOutputText,
  searching,
  setSearching,
  kpaRecommendations,
  onNext,
  onBack,
}: StepVendorSearchProps) {
  
  // Core state
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchPhase, setSearchPhase] = useState<'idle' | 'thinking' | 'results'>('idle');
  const [currentThinkingStep, setCurrentThinkingStep] = useState(0);
  const [refineInput, setRefineInput] = useState("");
  
  // Abort controller for canceling searches
  const abortControllerRef = useRef<AbortController | null>(null);

  // First run flag to ensure we only show thinking on initial search
  const firstRunRef = useRef(true);
  
  // Track if we've started the first search to prevent re-runs
  const hasSearchedRef = useRef(false);
  
  // Parse vendors from output text
  const parseVendorsFromOutput = (text: string, modelName: string): VendorItem[] => {
    const results: VendorItem[] = [];
    let id = 1;
    const sections = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const urlRegex = /(https?:\/\/[^\s)]+)\b/g;

    for (const sec of sections) {
      const firstLine = sec.split("\n")[0] || "";
      const nameMatch = firstLine
        .replace(/^[-•\d.\s]+/, "")
        .replace(/\s{2,}.*/, "")
        .trim();

      const urls = Array.from(sec.matchAll(urlRegex)).map(m => m[1]);
      if (!nameMatch && urls.length === 0) continue;

      const vendor: VendorItem = {
        id: `vendor-${id++}`,
        vendor_name: nameMatch || urls[0] || `Vendor ${id}`,
        product_name: modelName,
        model: modelName,
        price: undefined,
        inStock: undefined,
        delivery: undefined,
        score: undefined,
        purchase_url: urls[0] || '',
        notes: sec.length > 300 ? sec.slice(0, 300) + '…' : sec,
        isSelected: false
      };

      if (!results.some(v => v.vendor_name === vendor.vendor_name || (v.purchase_url && v.purchase_url === vendor.purchase_url))) {
        results.push(vendor);
      }
    }

    return results;
  };

  // Generate search query from recommendations
  const generateSearchQuery = (): string => {
    if (!kpaRecommendations || selectedVariants.length === 0) {
      return searchQuery;
    }

    const selectedVariant = selectedVariants[0];
    const selectedRecommendation = kpaRecommendations.recommendations.find(
      rec => rec.id === selectedVariant.id
    );

    if (!selectedRecommendation || !selectedRecommendation.vendor_search) {
      return searchQuery;
    }

    const vendorSearch = selectedRecommendation.vendor_search;
    let enhancedQuery = vendorSearch.query_seed || "";

    enhancedQuery = enhancedQuery
      .replace(/\{MODEL\}/g, vendorSearch.model_name || productName)
      .replace(/\{SPECBITS\}/g, vendorSearch.spec_fragments?.join(" ") || "")
      .replace(/\{REGION\}/g, vendorSearch.region_hint || "")
      .replace(/\{BUDGET\}/g, vendorSearch.budget_hint_usd?.toString() || "");

    if (!enhancedQuery || enhancedQuery === vendorSearch.query_seed) {
      const model = vendorSearch.model_name || productName;
      const specs = vendorSearch.spec_fragments?.join(" ") || "";
      const budget = vendorSearch.budget_hint_usd ? `under $${vendorSearch.budget_hint_usd}` : "";
      enhancedQuery = `best ${model} ${specs} ${budget} vendors suppliers distributors`.trim();
    }

    // Update the parent state
    setSearchQuery(enhancedQuery);

    return enhancedQuery;
  };

  // Thinking steps animation (first run only)
  const animateThinkingSteps = async () => {
    for (let i = 0; i < THINKING_STEPS.length; i++) {
      setCurrentThinkingStep(i);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  };

  // Perform vendor search
  const performSearch = async (query: string, withThoughts?: string) => {
    if (selectedVariants.length === 0) return;

    // Cancel any existing search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Show thinking on first run only
    const showThinking = firstRunRef.current && batches.length === 0;
    
    try {
      setSearching(true);
      
      // Always show thinking animation for user feedback
      if (showThinking) {
        setSearchPhase('thinking');
        await animateThinkingSteps();
      }

      const selectedVariant = selectedVariants[0];
      const combinedQuery = withThoughts 
        ? `${query}. + ${withThoughts}`
        : query;

      console.log('Starting vendor search with query:', combinedQuery);

      const result = await findVendors(
                selectedVariant,
                kpaRecommendations,
                0,
        10,
                false,
                combinedQuery
              );

      if (controller.signal.aborted) {
        console.log('Search was aborted');
        return;
      }

      const outputText = result.output_text || "";
      console.log('Search completed, output length:', outputText.length);
      setSearchOutputText(outputText);

      // Parse vendors immediately
      const vendors = parseVendorsFromOutput(outputText, selectedVariant.title || productName);
      console.log('Parsed vendors:', vendors.length);

      // Create new batch with vendors
      const now = new Date().toLocaleTimeString('en-US', { hour12: false });
      const newBatch: Batch = {
        id: Date.now(),
        title: `Batch #${batches.length + 1} – Search Results`,
        query: combinedQuery,
        items: vendors,
        createdAt: now,
        expanded: true
      };

      // Update batches immediately so UI shows results
      setBatches(prev => {
        const updated = prev.map(b => ({ ...b, expanded: false }));
        const newBatches = [newBatch, ...updated];
        console.log('Updated batches, new count:', newBatches.length);
        return newBatches;
      });

      setSearchPhase('results');
      firstRunRef.current = false;
      console.log('Search phase set to results');

    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Search failed:', error);
        // Show error to user but don't crash
        setSearchPhase('results');
      }
    } finally {
      setSearching(false);
      abortControllerRef.current = null;
    }
  };

  // Handle vendor selection
  const toggleVendorSelection = (vendorId: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(vendorId)) {
      newSelected.delete(vendorId);
    } else {
      if (newSelected.size >= MAX_SELECTIONS) {
        alert(`Maximum ${MAX_SELECTIONS} vendors can be selected.`);
        return;
      }
      newSelected.add(vendorId);
    }
    setSelected(newSelected);
  };

  // Auto-run first search ONLY on first visit when no batches exist
  // This prevents re-running when user navigates back to this step
  useEffect(() => {
    // Skip if we've already searched or if we already have batches
    if (hasSearchedRef.current || batches.length > 0 || searching || selectedVariants.length === 0) {
      return;
    }

    // Mark that we've started the search
    hasSearchedRef.current = true;
    
    const query = generateSearchQuery();
    if (query.trim()) {
      console.log('Auto-running first search...');
      performSearch(query);
    }
  }, [selectedVariants]); // Only re-run when selectedVariants changes

  // Parse results when output text changes - update UI immediately
  useEffect(() => {
    if (searchOutputText && batches.length > 0 && !searching) {
      const lastBatch = batches[0];
      if (lastBatch && lastBatch.items.length === 0) {
        const vendors = parseVendorsFromOutput(searchOutputText, productName);
        console.log('Parsing vendors from output:', vendors.length);
        setBatches(prev => prev.map((b, i) => 
          i === 0 ? { ...b, items: vendors } : b
        ));
      }
    }
  }, [searchOutputText, batches, searching]);

  const handleRefineSearch = () => {
    if (!refineInput.trim()) return;
    const lastQuery = batches[0]?.query || searchQuery;
    performSearch(lastQuery, refineInput.trim());
    setRefineInput("");
  };

  const handleBack = () => {
    // Cancel any in-flight search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    onBack();
  };

  const toggleBatchExpansion = (batchId: number) => {
    setBatches(prev => prev.map(b => 
      b.id === batchId ? { ...b, expanded: !b.expanded } : b
    ));
  };

  // No variant selected
  if (selectedVariants.length === 0) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
        <Card>
          <CardContent className="pt-12 pb-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No Variant Selected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Please go back and select a recommendation variant first.
            </p>
            <Button onClick={handleBack} variant="outline">
              Back to Recommendations
            </Button>
          </CardContent>
        </Card>
                    </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl font-bold mb-2">Vendor Search</h2>
        <p className="text-muted-foreground text-sm">Find and select vendors for procurement</p>
              </div>

      {/* Thinking Phase - Shows full chain of thoughts */}
      {searchPhase === 'thinking' && (
            <Card className="border-blue-500/30 bg-blue-500/5">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
              Vendor Search in Progress
                </CardTitle>
              </CardHeader>
          <CardContent className="py-6">
            <div className="space-y-2">
              {THINKING_STEPS.map((step, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-3 p-2 rounded ${
                    idx === currentThinkingStep
                      ? "bg-blue-100 text-blue-800"
                      : idx < currentThinkingStep
                      ? "bg-green-50 text-green-700"
                          : "bg-gray-50 text-gray-500"
                      }`}
                    >
                  {idx < currentThinkingStep && (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {idx === currentThinkingStep && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {idx > currentThinkingStep && (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  )}
                      <span className="text-sm">{step}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

      {/* Results Phase */}
      {searchPhase === 'results' && batches.length > 0 && (
        <>
          {/* Batches */}
          <div className="space-y-4">
            {batches.map((batch) => (
              <Card key={batch.id} className={batch.expanded ? "border-primary" : "border-muted"}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base flex items-center gap-2">
                        {batch.title}
                        <span className="text-sm font-normal text-muted-foreground">
                          ({batch.items.length} vendors)
                        </span>
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Query: {batch.query} • {batch.createdAt}
                      </CardDescription>
                  </div>
                  <Button 
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleBatchExpansion(batch.id)}
                    >
                      {batch.expanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                  {batch.expanded && (
                    <div className="space-y-2">
                      {batch.items.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                          No vendors found in this batch.
                        </p>
                      ) : (
                        batch.items.map((vendor, idx) => {
                          const isSelected = selected.has(vendor.id);
                      return (
                            <div
                              key={vendor.id}
                              className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                                isSelected 
                                  ? "border-green-500 bg-green-500/10" 
                                  : "border-muted hover:border-primary/50"
                              }`}
                            >
                              <div className="flex-shrink-0">
                    <input 
                      type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => toggleVendorSelection(vendor.id)}
                                  className="w-5 h-5 rounded border-muted-foreground"
                    />
                  </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm">
                                  {idx + 1}. {vendor.vendor_name}
                                </div>
                                {vendor.price && (
                                  <div className="text-sm text-muted-foreground">
                                    Price: {vendor.price}
                                  </div>
                                )}
                                {vendor.delivery && (
                                  <div className="text-xs text-muted-foreground">
                                    {vendor.delivery}
                      </div>
                    )}
                                {vendor.purchase_url && (
                                  <a
                                    href={vendor.purchase_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-blue-600 underline text-xs break-all"
                                  >
                                    {vendor.purchase_url}
                            </a>
                          )}
                                {vendor.notes && (
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {vendor.notes}
                                  </div>
                          )}
                        </div>
                      </div>
                    );
                        })
                      )}
                </div>
                  )}
              </CardContent>
            </Card>
            ))}
          </div>

          {/* Refine Search - Only visible after results */}
            <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Refine Search</CardTitle>
              <CardDescription>Add your thoughts and search again</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Input
                  placeholder="Add your thoughts for the next search"
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && refineInput.trim()) {
                      handleRefineSearch();
                    }
                  }}
                />
                  <Button 
                  onClick={handleRefineSearch}
                  disabled={!refineInput.trim() || searching}
                  className="gap-2"
                >
                  <Search className="h-4 w-4" />
                  Search Again
                  </Button>
              </div>
              </CardContent>
            </Card>

          {/* Selection Summary */}
          {selected.size > 0 && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardHeader>
                <CardTitle className="text-base">
                  Selected Vendors ({selected.size}/{MAX_SELECTIONS})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {selected.size} vendor{selected.size > 1 ? 's' : ''} selected for procurement
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}

          {/* Navigation */}
      <div className="flex justify-between sticky bottom-2 bg-background/95 backdrop-blur border rounded-lg px-4 py-3">
        <Button onClick={handleBack} variant="outline" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => {
            // Get selected vendor items
            const allVendors = batches.flatMap(b => b.items);
            const selectedVendors = allVendors.filter(v => selected.has(v.id));
            
                onNext({
                  rawOutput: searchOutputText,
                  generatedQuery: searchQuery,
              selectedVendors: selectedVendors,
                });
              }}
          disabled={selected.size === 0}
              className="gap-2"
            >
          Next Step
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
    </motion.div>
  );
}
