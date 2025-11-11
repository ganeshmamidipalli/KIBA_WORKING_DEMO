import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  Search, 
  Loader2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  DollarSign
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { findVendors } from "../../lib/api";
import { generateVendorFollowupQuestions, validateQuestionSelection } from "../../lib/api";
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
  // Storage keys for persistence
  const STORAGE_KEY_BATCHES = 'kiba3_vendor_search_batches';
  const STORAGE_KEY_SELECTED = 'kiba3_vendor_search_selected';
  const STORAGE_KEY_BASE_QUERY = 'kiba3_vendor_search_base_query';
  
  // Load persisted data on mount
  const loadPersistedData = () => {
    try {
      const savedBatches = localStorage.getItem(STORAGE_KEY_BATCHES);
      const savedSelected = localStorage.getItem(STORAGE_KEY_SELECTED);
      const savedBaseQuery = localStorage.getItem(STORAGE_KEY_BASE_QUERY);
      
      if (savedBatches) {
        const parsedBatches = JSON.parse(savedBatches);
        if (Array.isArray(parsedBatches) && parsedBatches.length > 0) {
          return {
            batches: parsedBatches,
            selected: savedSelected ? new Set(JSON.parse(savedSelected)) : new Set(),
            baseQuery: savedBaseQuery || ""
          };
        }
      }
    } catch (error) {
      console.error('Error loading persisted vendor search data:', error);
    }
    return { batches: [], selected: new Set(), baseQuery: "" };
  };

  const persistedData = loadPersistedData();
  
  const [batches, setBatches] = useState<Batch[]>(persistedData.batches);
  const [selected, setSelected] = useState<Set<string>>(persistedData.selected);
  const [searchPhase, setSearchPhase] = useState<'idle' | 'thinking' | 'results'>(
    persistedData.batches.length > 0 ? 'results' : 'idle'
  );
  const [currentThinkingStep, setCurrentThinkingStep] = useState(0);
  const [refineInput, setRefineInput] = useState("");
  const [followUpQuestions, setFollowUpQuestions] = useState<string[]>([]);
  const [showFollowUpSuggestions, setShowFollowUpSuggestions] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [validatingSelection, setValidatingSelection] = useState(false);
  const [validationResult, setValidationResult] = useState<{approved: boolean, message?: string, moreQuestions?: string[]} | null>(null);
  
  // Abort controller for canceling searches
  const abortControllerRef = useRef<AbortController | null>(null);

  // First run flag to ensure we only show thinking on initial search
  const firstRunRef = useRef(persistedData.batches.length === 0);
  
  // Track if we've started the first search to prevent re-runs
  const hasSearchedRef = useRef(persistedData.batches.length > 0);
  
  // Track the base query to prevent cumulative refinement
  const baseQueryRef = useRef<string>(persistedData.baseQuery);
  
  // Persist batches whenever they change
  useEffect(() => {
    try {
      if (batches.length > 0) {
        localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(batches));
        console.log('StepVendorSearch: Persisted batches to localStorage:', batches.length);
      } else {
        localStorage.removeItem(STORAGE_KEY_BATCHES);
      }
    } catch (error) {
      console.error('Error persisting batches:', error);
    }
  }, [batches]);
  
  // Persist selected vendors whenever they change
  useEffect(() => {
    try {
      if (selected.size > 0) {
        localStorage.setItem(STORAGE_KEY_SELECTED, JSON.stringify(Array.from(selected)));
        console.log('StepVendorSearch: Persisted selected vendors to localStorage:', selected.size);
      } else {
        localStorage.removeItem(STORAGE_KEY_SELECTED);
      }
    } catch (error) {
      console.error('Error persisting selected vendors:', error);
    }
  }, [selected]);
  
  // Helper function to persist base query
  const persistBaseQuery = () => {
    try {
      if (baseQueryRef.current) {
        localStorage.setItem(STORAGE_KEY_BASE_QUERY, baseQueryRef.current);
      }
    } catch (error) {
      console.error('Error persisting base query:', error);
    }
  };
  
  // Parse vendors from output text
  const parseVendorsFromOutput = (text: string, modelName: string): VendorItem[] => {
    const results: VendorItem[] = [];
    let id = 1;
    const sections = text.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
    const urlRegex = /(https?:\/\/[^\s)]+)\b/g;

    // Patterns that indicate informational/introductory text (not vendors)
    const infoPatterns = [
      /^here are/i,
      /^below are/i,
      /^these are/i,
      /^you can/i,
      /^all links/i,
      /^no third-party/i,
      /^reputable.*retailers/i,
      /^authorized.*retailers/i,
      /^u\.?s\.?-based/i,
      /^where you can purchase/i,
      /^product page/i,
      /^marketplace listings/i,
    ];

    // Check if section is informational text
    const isInformationalText = (section: string): boolean => {
      const firstLine = section.split("\n")[0] || "";
      const lowerFirstLine = firstLine.toLowerCase();
      
      // Check for informational patterns
      if (infoPatterns.some(pattern => pattern.test(lowerFirstLine))) {
        return true;
      }
      
      // Check if it's just the product name (matches modelName exactly or closely)
      const normalizedProduct = modelName.toLowerCase().trim();
      const normalizedFirstLine = firstLine.toLowerCase().trim();
      if (normalizedFirstLine === normalizedProduct || 
          normalizedFirstLine.includes(normalizedProduct) && firstLine.length < 100) {
        return true;
      }
      
      // Check if section is too long without URLs (likely descriptive text)
      const urls = Array.from(section.matchAll(urlRegex));
      if (section.length > 200 && urls.length === 0) {
        return true;
      }
      
      // Check if it's a sentence describing vendors rather than listing one
      if (firstLine.includes('where') && firstLine.includes('can') && firstLine.length > 50) {
        return true;
      }
      
      return false;
    };

    for (const sec of sections) {
      // Skip informational sections
      if (isInformationalText(sec)) {
        continue;
      }

      const firstLine = sec.split("\n")[0] || "";
      const nameMatch = firstLine
        .replace(/^[-•\d.\s]+/, "")
        .replace(/\s{2,}.*/, "")
        .trim();

      const urls = Array.from(sec.matchAll(urlRegex)).map(m => m[1]);
      
      // Skip if no vendor name and no URL (not a valid vendor entry)
      if (!nameMatch && urls.length === 0) continue;
      
      // Skip if name matches product name exactly (it's product info, not vendor)
      const normalizedName = nameMatch.toLowerCase().trim();
      const normalizedProduct = modelName.toLowerCase().trim();
      if (normalizedName === normalizedProduct && urls.length === 0) {
        continue;
      }

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

      // Only add if it has a valid vendor name (not just product name) or a URL
      const hasValidVendorName = vendor.vendor_name && 
                                  vendor.vendor_name.toLowerCase() !== normalizedProduct &&
                                  vendor.vendor_name.length > 2;
      
      if ((hasValidVendorName || vendor.purchase_url) && 
          !results.some(v => v.vendor_name === vendor.vendor_name || 
                            (v.purchase_url && v.purchase_url === vendor.purchase_url))) {
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
    
    // Store base query on first search (without refinement)
    if (!withThoughts && baseQueryRef.current === "") {
      baseQueryRef.current = query;
      persistBaseQuery();
    }
    
    try {
      setSearching(true);
      
      // Always show thinking animation for user feedback
      if (showThinking) {
        setSearchPhase('thinking');
        await animateThinkingSteps();
      }

      const selectedVariant = selectedVariants[0];
      // For refine, use base query + new thoughts (not cumulative)
      const baseQuery = baseQueryRef.current || query;
      const combinedQuery = withThoughts 
        ? `${baseQuery}. + ${withThoughts}`
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

      // Update batches immediately so UI shows results
      setBatches(prev => {
        // Create new batch with vendors
        const now = new Date().toLocaleTimeString('en-US', { hour12: false });
        const batchNumber = prev.length + 1;
        const newBatch: Batch = {
          id: Date.now(),
          title: `Batch #${batchNumber} – Search Results`,
          query: combinedQuery,
          items: vendors,
          createdAt: now,
          expanded: true
        };
        
        // Collapse previous batches and add new batch at the end (below previous batches)
        const updated = prev.map(b => ({ ...b, expanded: false }));
        const newBatches = [...updated, newBatch]; // New batches appear below
        console.log('Updated batches, new count:', newBatches.length);
        
        // Persist batches immediately
        try {
          localStorage.setItem(STORAGE_KEY_BATCHES, JSON.stringify(newBatches));
          console.log('StepVendorSearch: Persisted batches immediately:', newBatches.length);
        } catch (error) {
          console.error('Error persisting batches:', error);
        }
        
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
    console.log('StepVendorSearch: toggleVendorSelection called with vendorId:', vendorId);
    const newSelected = new Set(selected);
    if (newSelected.has(vendorId)) {
      newSelected.delete(vendorId);
      console.log('StepVendorSearch: Unselecting vendor, new selection size:', newSelected.size);
    } else {
      if (newSelected.size >= MAX_SELECTIONS) {
        alert(`Maximum ${MAX_SELECTIONS} vendors can be selected.`);
        return;
      }
      newSelected.add(vendorId);
      console.log('StepVendorSearch: Selecting vendor, new selection size:', newSelected.size);
    }
    setSelected(newSelected);
    console.log('StepVendorSearch: Updated selected set:', Array.from(newSelected));
  };

  // Auto-run search exactly once on first entry into this step
  useEffect(() => {
    console.log('StepVendorSearch: Auto-search effect triggered', {
      selectedVariantsLength: selectedVariants.length,
      hasSearched: hasSearchedRef.current,
      batchesLength: batches.length,
      searching,
      searchQuery: searchQuery?.trim()
    });

    if (selectedVariants.length === 0) {
      console.log('StepVendorSearch: No selected variants, skipping auto-search');
      return;
    }

    // Check if we should auto-run search
    if (!hasSearchedRef.current && batches.length === 0 && !searching) {
      hasSearchedRef.current = true;
      console.log('StepVendorSearch: Auto-running initial search');
      
      // Generate search query from recommendations if available
      let initialQuery = searchQuery?.trim();
      if (!initialQuery && kpaRecommendations && selectedVariants.length > 0) {
        // Generate query from KPA recommendations
        const selectedVariant = selectedVariants[0];
        const selectedRecommendation = kpaRecommendations.recommendations?.find(
          rec => rec.id === selectedVariant.id
        );
        
        if (selectedRecommendation?.vendor_search) {
          const vendorSearch = selectedRecommendation.vendor_search;
          initialQuery = vendorSearch.query_seed || "";
          initialQuery = initialQuery
            .replace(/\{MODEL\}/g, vendorSearch.model_name || productName)
            .replace(/\{SPECBITS\}/g, vendorSearch.spec_fragments?.join(" ") || "")
            .replace(/\{REGION\}/g, vendorSearch.region_hint || "")
            .replace(/\{BUDGET\}/g, vendorSearch.budget_hint_usd?.toString() || "");
          
          if (!initialQuery || initialQuery === vendorSearch.query_seed) {
            const model = vendorSearch.model_name || productName;
            const specs = vendorSearch.spec_fragments?.join(" ") || "";
            const budget = vendorSearch.budget_hint_usd ? `under $${vendorSearch.budget_hint_usd}` : "";
            initialQuery = `best ${model} ${specs} ${budget} vendors suppliers distributors`.trim();
          }
          setSearchQuery(initialQuery);
        }
      }
      
      if (!initialQuery) {
        initialQuery = selectedVariants[0]?.title || productName || 'vendor search';
      }
      
      console.log('StepVendorSearch: Initial query:', initialQuery);
      // Use setTimeout to ensure state is ready
      setTimeout(() => {
        performSearch(initialQuery);
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariants.length, batches.length, searching]);

  // Restore batches from searchOutputText when returning to this step
  useEffect(() => {
    if (searchOutputText && batches.length === 0) {
      const vendors = parseVendorsFromOutput(searchOutputText, productName);
      if (vendors.length > 0) {
        console.log('Restoring vendors from searchOutputText:', vendors.length);
        const restoredBatch: Batch = {
          id: Date.now(),
          title: 'Batch #1 – Search Results (Restored)',
          query: searchQuery || 'Initial search',
          items: vendors,
          createdAt: new Date().toLocaleTimeString('en-US', { hour12: false }),
          expanded: true
        };
        setBatches([restoredBatch]);
        setSearchPhase('results');
        hasSearchedRef.current = true;
        // Restore baseQueryRef for refine search to work
        if (baseQueryRef.current === "" && searchQuery) {
          baseQueryRef.current = searchQuery;
          persistBaseQuery();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOutputText, batches.length]); // Only run when searchOutputText or batches state changes

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
  }, [searchOutputText, batches, searching, productName, searchQuery]);

  // Generate intelligent follow-up questions based on user thoughts and current results
  const generateFollowUpQuestions = async (userThoughts: string, currentBatches: Batch[]): Promise<string[]> => {
    const totalVendors = currentBatches.reduce((sum, b) => sum + b.items.length, 0);
    
    try {
      const response = await generateVendorFollowupQuestions({
        user_thoughts: userThoughts,
        current_batches: currentBatches.map(b => ({
          id: b.id,
          title: b.title,
          query: b.query,
          item_count: b.items.length
        })),
        product_name: productName,
        total_vendors_found: totalVendors
      });
      
      return response.questions || [];
    } catch (error) {
      console.error("Error generating follow-up questions:", error);
      // Fallback to simple questions
      const questions: string[] = [];
      if (totalVendors < 5) {
        questions.push("Find more vendors with better pricing");
      }
      if (userThoughts.toLowerCase().includes("price") || userThoughts.toLowerCase().includes("cost")) {
        questions.push("Search for vendors with volume discounts");
      }
      if (userThoughts.toLowerCase().includes("delivery") || userThoughts.toLowerCase().includes("ship")) {
        questions.push("Find vendors with faster delivery to Wichita, KS");
      }
      return questions.slice(0, 3);
    }
  };

  // Validate user's selected question and determine if search can proceed
  const handleQuestionSelection = async (question: string) => {
    setSelectedQuestion(question);
    setValidatingSelection(true);
    setValidationResult(null);
    
    try {
      const selectedVariant = selectedVariants[0];
      const response = await validateQuestionSelection({
        user_thoughts: refineInput.trim(),
        selected_question: question,
        current_batches: batches.map(b => ({
          id: b.id,
          title: b.title,
          query: b.query,
          item_count: b.items.length
        })),
        product_name: productName,
        selected_variant: selectedVariant,
        kpa_recommendations: kpaRecommendations
      });
      
      setValidationResult(response);
      
      if (response.approved) {
        // LLM approved - proceed with search
        const searchQuery = response.search_query || question;
        const lastQuery = batches.length > 0 ? batches[batches.length - 1].query : (searchQuery || baseQueryRef.current);
        performSearch(lastQuery, searchQuery);
        setRefineInput("");
        setFollowUpQuestions([]);
        setShowFollowUpSuggestions(false);
        setSelectedQuestion(null);
        setValidationResult(null);
      } else if (response.more_questions && response.more_questions.length > 0) {
        // LLM needs more clarification - show more questions
        setFollowUpQuestions(response.more_questions);
        setShowFollowUpSuggestions(true);
      }
      
    } catch (error) {
      console.error("Error validating question selection:", error);
      // Fallback: proceed with search
      const lastQuery = batches.length > 0 ? batches[batches.length - 1].query : (searchQuery || baseQueryRef.current);
      performSearch(lastQuery, question);
      setRefineInput("");
      setFollowUpQuestions([]);
      setShowFollowUpSuggestions(false);
      setSelectedQuestion(null);
    } finally {
      setValidatingSelection(false);
    }
  };

  const handleRefineSearch = async () => {
    if (!refineInput.trim()) return;
    
    const userThoughts = refineInput.trim();
    
    // Proceed with search directly (questions already shown below if needed)
    const lastQuery = batches.length > 0 ? batches[batches.length - 1].query : (searchQuery || baseQueryRef.current);
    performSearch(lastQuery, userThoughts);
    setRefineInput("");
    setFollowUpQuestions([]);
    setShowFollowUpSuggestions(false);
    
    // Generate new follow-up questions after search completes
    setTimeout(async () => {
      setBatches(currentBatches => {
        generateFollowUpQuestions("", currentBatches).then(newQuestions => {
          // Don't auto-show questions after search - wait for user input
          setFollowUpQuestions([]);
          setShowFollowUpSuggestions(false);
        });
        return currentBatches;
      });
    }, 1500);
  };

  // Generate follow-up questions when user types thoughts
  useEffect(() => {
    // Clear previous timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Don't generate questions if input is empty or too short
    if (!refineInput.trim() || refineInput.trim().length < 10) {
      setFollowUpQuestions([]);
      setShowFollowUpSuggestions(false);
      return;
    }

    // Debounce: Wait 1 second after user stops typing
    const timer = setTimeout(async () => {
      setGeneratingQuestions(true);
      try {
        const questions = await generateFollowUpQuestions(refineInput.trim(), batches);
        if (questions.length > 0) {
          setFollowUpQuestions(questions);
          setShowFollowUpSuggestions(true);
        } else {
          setFollowUpQuestions([]);
          setShowFollowUpSuggestions(false);
        }
      } catch (error) {
        console.error("Error generating questions:", error);
        setFollowUpQuestions([]);
        setShowFollowUpSuggestions(false);
      } finally {
        setGeneratingQuestions(false);
      }
    }, 1000); // 1 second debounce

    setDebounceTimer(timer);

    // Cleanup
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [refineInput, batches.length]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
    };
  }, []);

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
                          // Extract domain from URL for cleaner display
                          const getDomain = (url: string) => {
                            try {
                              return new URL(url).hostname.replace('www.', '');
                            } catch {
                              return url.length > 40 ? url.substring(0, 40) + '...' : url;
                            }
                          };
                          
                          // Format price
                          const formatPrice = (price: string | undefined) => {
                            if (!price) return null;
                            // Try to extract numeric value
                            const match = price.match(/[\d,]+\.?\d*/);
                            if (match) {
                              const num = parseFloat(match[0].replace(/,/g, ''));
                              return isNaN(num) ? price : `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                            return price;
                          };
                          
                      return (
                            <div
                              key={vendor.id}
                              className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                                isSelected 
                                  ? "border-green-500 bg-green-500/10" 
                                  : "border-muted hover:border-primary/50"
                              }`}
                            >
                              {/* Checkbox */}
                              <div className="flex-shrink-0 pt-1">
                                <input 
                                  type="checkbox" 
                                  checked={isSelected}
                                  onChange={() => toggleVendorSelection(vendor.id)}
                                  className="w-5 h-5 rounded border-muted-foreground cursor-pointer"
                                />
                              </div>
                              
                              {/* Main Content */}
                              <div className="flex-1 min-w-0 space-y-2">
                                {/* Vendor Name */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-base text-gray-900">
                                      {vendor.vendor_name}
                                    </h4>
                                    {/* Product/Model Name */}
                                    {(vendor.product_name || vendor.model) && (
                                      <div className="text-sm text-gray-600 mt-1">
                                        {vendor.product_name && vendor.product_name !== vendor.vendor_name && (
                                          <span>{vendor.product_name}</span>
                                        )}
                                        {vendor.model && vendor.model !== vendor.product_name && (
                                          <span className="ml-1">{vendor.model}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Price Badge */}
                                  {vendor.price && (
                                    <div className="flex items-center gap-1 px-3 py-1 bg-blue-50 rounded-md border border-blue-200">
                                      <DollarSign className="h-4 w-4 text-blue-600" />
                                      <span className="font-semibold text-blue-900 text-sm">
                                        {formatPrice(vendor.price)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                
                                {/* Link and Delivery Info */}
                                <div className="flex items-center gap-4 flex-wrap">
                                  {vendor.purchase_url && (
                                    <a
                                      href={vendor.purchase_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span className="max-w-[200px] truncate">
                                        {getDomain(vendor.purchase_url)}
                                      </span>
                                    </a>
                                  )}
                                  
                                  {vendor.delivery && (
                                    <span className="text-xs text-gray-500">
                                      {vendor.delivery}
                                    </span>
                                  )}
                                  
                                  {vendor.inStock !== undefined && (
                                    <span className={`text-xs px-2 py-0.5 rounded ${
                                      vendor.inStock 
                                        ? 'bg-green-100 text-green-700' 
                                        : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                      {vendor.inStock ? 'In Stock' : 'Check Availability'}
                                    </span>
                                  )}
                                </div>
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
              <CardDescription>
                {batches.length > 0 
                  ? `Add your thoughts or select a follow-up question to search again. Results will appear as Batch #${batches.length + 1} below.`
                  : "Add your thoughts and search again"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Refine Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Add your thoughts or specific requirements for the next search..."
                  value={refineInput}
                  onChange={(e) => setRefineInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && refineInput.trim() && !searching && !generatingQuestions) {
                      handleRefineSearch();
                    }
                  }}
                  disabled={searching}
                />
                <Button 
                  onClick={handleRefineSearch}
                  disabled={!refineInput.trim() || searching || generatingQuestions}
                  className="gap-2"
                >
                  {searching ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : generatingQuestions ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      Search Again (Batch #{batches.length + 1})
                    </>
                  )}
                </Button>
              </div>

              {/* Follow-up Question Suggestions - Show below input based on user's thoughts */}
              {generatingQuestions && refineInput.trim().length >= 10 && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground p-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing your thoughts and generating follow-up questions...
                </div>
              )}
              
              {showFollowUpSuggestions && followUpQuestions.length > 0 && !generatingQuestions && refineInput.trim().length >= 10 && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-900">
                    💡 Based on your input and selected specifications, select a question to refine your search:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {followUpQuestions.map((question, idx) => (
                      <Button
                        key={idx}
                        variant={selectedQuestion === question ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleQuestionSelection(question)}
                        disabled={searching || generatingQuestions || validatingSelection}
                        className={`text-xs ${
                          selectedQuestion === question 
                            ? "bg-blue-600 hover:bg-blue-700 text-white" 
                            : "bg-white hover:bg-blue-100 border-blue-300"
                        }`}
                      >
                        {selectedQuestion === question && validatingSelection ? (
                          <>
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            Validating...
                          </>
                        ) : (
                          question
                        )}
                      </Button>
                    ))}
                  </div>
                  
                  {/* Validation result */}
                  {validationResult && (
                    <div className={`mt-3 p-2 rounded text-xs ${
                      validationResult.approved 
                        ? "bg-green-100 text-green-800 border border-green-300" 
                        : "bg-yellow-100 text-yellow-800 border border-yellow-300"
                    }`}>
                      {validationResult.approved ? (
                        <span>✅ {validationResult.message || "Approved! Starting search..."}</span>
                      ) : (
                        <div>
                          <span>⚠️ {validationResult.message || "Need more clarification"}</span>
                          {validationResult.moreQuestions && validationResult.moreQuestions.length > 0 && (
                            <div className="mt-2">
                              <p className="font-medium">Please select one:</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {validationResult.moreQuestions.map((q, i) => (
                                  <Button
                                    key={i}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleQuestionSelection(q)}
                                    disabled={validatingSelection}
                                    className="text-xs h-6 px-2"
                                  >
                                    {q}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!validatingSelection && !validationResult && (
                    <p className="text-xs text-blue-700 mt-2">
                      Select a question above to refine your search. The system will validate your selection before searching.
                    </p>
                  )}
                </div>
              )}
              
              {/* Info about batch ordering */}
              {batches.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  💡 New search results will appear below Batch #{batches.length}. You can continue refining until you find the vendors you need.
                </p>
              )}
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
            const selectedVendorItems = allVendors.filter(v => selected.has(v.id));
            
            // Map VendorItem to Vendor interface format, preserving purchase_url as website
            const selectedVendors = selectedVendorItems.map(v => ({
              id: v.id,
              name: v.vendor_name,
              productName: v.product_name || v.model || productName,
              price: typeof v.price === 'string' ? parseFloat(v.price.replace(/[^0-9.]/g, '')) || 0 : (typeof v.price === 'number' ? v.price : 0),
              contact: '',
              website: v.purchase_url || '', // Preserve purchase_url as website
              description: v.notes,
              deliveryTime: v.delivery,
              // Keep original fields for reference
              purchase_url: v.purchase_url,
              vendor_name: v.vendor_name,
              model: v.model
            }));
            
            console.log('StepVendorSearch: Next button clicked');
            console.log('StepVendorSearch: Batches count:', batches.length);
            console.log('StepVendorSearch: All vendors:', allVendors.length);
            console.log('StepVendorSearch: Selected IDs:', Array.from(selected));
            console.log('StepVendorSearch: Selected vendors:', selectedVendors);
            console.log('StepVendorSearch: Calling onNext with data:', { selectedVendors });
            
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
