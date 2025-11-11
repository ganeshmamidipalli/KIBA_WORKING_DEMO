import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, CheckCircle2, Circle, AlertCircle, CheckCircle, Plus } from "lucide-react";
import { useTheme } from "./components/theme-provider";
import { Button } from "./components/ui/button";
import { Progress } from "./components/ui/progress";
import { cn } from "./lib/utils";
import { useStepManager } from "./hooks/useStepManager";
import { STEP_CONFIGS } from "./lib/stepConfigs";
import type { SpecVariant, Attachment, RFQResult, IntakeData, KPARecommendations } from "./types";

// Step Components (to be created)
import { StepProjectContext } from "./components/steps/StepProjectContext";
import { StepProductDetails } from "./components/steps/StepProductDetails";
import { StepSpecifications } from "./components/steps/StepSpecifications";
import { StepVendorSearch } from "./components/steps/StepVendorSearch";
import { StepRFQProcurementSimple } from "./components/steps/StepRFQProcurementSimple";
import { StepCARTEnhanced } from "./components/steps/StepCARTEnhanced";

// Use step configurations from the centralized config
const getStepTitle = (step: number): string => {
  const stepInfo = STEP_CONFIGS.find(s => s.id === step);
  return stepInfo?.title || `Step ${step}`;
};

export default function App() {
  const { theme, setTheme } = useTheme();
  const stepManager = useStepManager();
  const [notifications, setNotifications] = useState<Array<{id: string, type: 'success' | 'error' | 'info', message: string}>>([]);

  // Notification functions
  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Step 1: Project Context
  const [procurementType, setProcurementType] = useState("");
  const [serviceProgram, setServiceProgram] = useState("");
  const [technicalPOC, setTechnicalPOC] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [popStart, setPopStart] = useState("");
  const [popCompletion, setPopCompletion] = useState("");

  // Step 2: Product Details
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [budget, setBudget] = useState("");
  const [projectScope, setProjectScope] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);

  // Step 3: Specifications
  const [variants, setVariants] = useState<SpecVariant[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<SpecVariant[]>([]);
  const [generatingRecommendations, setGeneratingRecommendations] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<any>(null);

  // KPA One-Flow state
  const [kpaSessionId, setKpaSessionId] = useState<string | null>(null);
  const [intakeData, setIntakeData] = useState<IntakeData | null>(null);
  const [followupAnswers, setFollowupAnswers] = useState<Record<string, string>>({});
  const [kpaRecommendations, setKpaRecommendations] = useState<KPARecommendations | null>(null);

  // Step 4: Vendor Search
  // Load persisted search data
  const loadSearchData = () => {
    try {
      const savedQuery = localStorage.getItem('kiba3_search_query');
      const savedOutput = localStorage.getItem('kiba3_search_output');
      const savedVendors = localStorage.getItem('kiba3_selected_vendors');
      return {
        query: savedQuery || "",
        output: savedOutput || "",
        vendors: savedVendors ? JSON.parse(savedVendors) : []
      };
    } catch (error) {
      console.error('Error loading persisted search data:', error);
      return { query: "", output: "", vendors: [] };
    }
  };

  const persistedSearchData = loadSearchData();
  const [searchQuery, setSearchQuery] = useState(persistedSearchData.query);
  const [searchOutputText, setSearchOutputText] = useState(persistedSearchData.output);
  const [searching, setSearching] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<any[]>(persistedSearchData.vendors);
  
  // Persist search query
  useEffect(() => {
    if (searchQuery) {
      localStorage.setItem('kiba3_search_query', searchQuery);
    }
  }, [searchQuery]);
  
  // Persist search output
  useEffect(() => {
    if (searchOutputText) {
      localStorage.setItem('kiba3_search_output', searchOutputText);
    }
  }, [searchOutputText]);
  
  // Persist selected vendors
  useEffect(() => {
    if (selectedVendors.length > 0) {
      localStorage.setItem('kiba3_selected_vendors', JSON.stringify(selectedVendors));
    } else {
      localStorage.removeItem('kiba3_selected_vendors');
    }
  }, [selectedVendors]);

  // Step 5: RFQ
  const [generatedRFQ, setGeneratedRFQ] = useState<RFQResult | null>(null);
  const [generatingRFQ, setGeneratingRFQ] = useState(false);

  // Enhanced step navigation with error handling
  const handleNext = async (stepData?: any) => {
    try {
      console.log("App: handleNext called, current step:", stepManager.currentStep);
      console.log("App: Step data:", stepData);
      
      // Update global state with step data
      if (stepData) {
        if (stepData.productName) {
          console.log("App: Setting productName:", stepData.productName);
          setProductName(stepData.productName);
        }
        if (stepData.category) {
          setCategory(stepData.category);
        }
        if (stepData.quantity) {
          setQuantity(stepData.quantity);
        }
        if (stepData.budget) {
          setBudget(stepData.budget);
        }
        if (stepData.projectScope) {
          setProjectScope(stepData.projectScope);
        }
        if (stepData.selectedVendors) {
          console.log("App: Setting selectedVendors:", stepData.selectedVendors);
          setSelectedVendors(stepData.selectedVendors);
          // Persist immediately
          localStorage.setItem('kiba3_selected_vendors', JSON.stringify(stepData.selectedVendors));
        }
        if (stepData.rawOutput) {
          console.log("App: Setting searchOutputText:", stepData.rawOutput);
          setSearchOutputText(stepData.rawOutput);
          localStorage.setItem('kiba3_search_output', stepData.rawOutput);
        }
        if (stepData.generatedQuery) {
          console.log("App: Setting searchQuery:", stepData.generatedQuery);
          setSearchQuery(stepData.generatedQuery);
          localStorage.setItem('kiba3_search_query', stepData.generatedQuery);
        }
        if (stepData.kpaRecommendations) {
          console.log("App: Setting kpaRecommendations:", stepData.kpaRecommendations);
          setKpaRecommendations(stepData.kpaRecommendations);
        }
        if (stepData.selectedVariants) {
          console.log("App: Setting selectedVariants:", stepData.selectedVariants);
          setSelectedVariants(stepData.selectedVariants);
        }
      }
      
      const result = await stepManager.completeCurrentStep(stepData);
      
      if (result.success) {
        console.log("App: Step completed successfully, new current step:", stepManager.currentStep);
        addNotification('success', `Step completed! Moving to ${getStepTitle(stepManager.currentStep)}`);
      } else {
        console.log("App: Step completion failed:", result.error);
        addNotification('error', `Step completion failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in handleNext:', error);
      addNotification('error', 'An unexpected error occurred');
    }
  };

  const handleBack = async () => {
    try {
      const result = await stepManager.goBack();
      
      if (result.success) {
        addNotification('info', `Returning to ${getStepTitle(stepManager.currentStep)}`);
      } else {
        addNotification('error', `Cannot go back: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in handleBack:', error);
      addNotification('error', 'An unexpected error occurred');
    }
  };

  const jumpToStep = async (step: number) => {
    try {
      if (stepManager.canAccessStep(step)) {
        const result = await stepManager.navigateToStep(step);
        
        if (result.success) {
          addNotification('info', `Navigated to ${getStepTitle(step)}`);
        } else {
          addNotification('error', `Cannot access step: ${result.error}`);
        }
      } else {
        addNotification('error', 'Cannot access this step. Complete previous steps first.');
      }
    } catch (error) {
      console.error('Error in jumpToStep:', error);
      addNotification('error', 'An unexpected error occurred');
    }
  };

  // Reset all state and start new request
  const handleNewRequest = async () => {
    try {
      // Reset step manager
      const result = await stepManager.reset();
      
      if (result.success) {
        // Reset all form state
        setProcurementType("");
        setServiceProgram("");
        setTechnicalPOC("");
        setSelectedProject("");
        setPopStart("");
        setPopCompletion("");
        setProductName("");
        setCategory("");
        setQuantity("");
        setBudget("");
        setProjectScope("");
        setAttachments([]);
        setVendors([]);
        setVariants([]);
        setSelectedVariants([]);
        setGeneratingRecommendations(false);
        setAiRecommendation(null);
        setKpaSessionId(null);
        setIntakeData(null);
        setFollowupAnswers({});
        setKpaRecommendations(null);
        setSearchQuery("");
        setSearchOutputText("");
        setSearching(false);
        setSelectedVendors([]);
        setGeneratedRFQ(null);
        setGeneratingRFQ(false);
        
        // Clear persisted search data
        localStorage.removeItem('kiba3_search_query');
        localStorage.removeItem('kiba3_search_output');
        localStorage.removeItem('kiba3_selected_vendors');
        localStorage.removeItem('kiba3_vendor_search_batches');
        localStorage.removeItem('kiba3_vendor_search_selected');
        localStorage.removeItem('kiba3_vendor_search_base_query');
        
        addNotification('success', 'New request started! All data has been reset.');
      } else {
        addNotification('error', `Failed to reset: ${result.error}`);
      }
    } catch (error) {
      console.error('Error in handleNewRequest:', error);
      addNotification('error', 'An unexpected error occurred while resetting');
    }
  };

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-lg font-bold text-primary-foreground">K</span>
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-tight">
                KIBA Procurement AI
              </h1>
              <p className="text-xs text-muted-foreground">
                Knowmadics Assistant
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              onClick={handleNewRequest}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New Request
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="border-b bg-muted/30">
        <div className="container py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-sm font-medium">
                Step {stepManager.currentStep} of {STEP_CONFIGS.length}: {getStepTitle(stepManager.currentStep)}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {Math.round(stepManager.progress)}% Complete
            </span>
          </div>
          <Progress value={stepManager.progress} className="h-1.5" />
        </div>
      </div>

      <div className="container py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar - Steps Navigation */}
          <div className="lg:col-span-1">
            <div className="sticky top-24 space-y-1">
              {STEP_CONFIGS.map((step) => {
                const isActive = stepManager.currentStep === step.id;
                const isCompleted = stepManager.completedSteps.includes(step.id);
                const isLocked = !stepManager.canAccessStep(step.id);

                return (
                  <motion.button
                    key={step.id}
                    onClick={() => jumpToStep(step.id)}
                    disabled={isLocked}
                    whileHover={!isLocked ? { x: 4 } : {}}
                    whileTap={!isLocked ? { scale: 0.98 } : {}}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all",
                      isActive && "bg-primary/10 border border-primary/20",
                      isCompleted && !isActive && "bg-muted/50",
                      isLocked && "opacity-50 cursor-not-allowed",
                      !isActive && !isCompleted && !isLocked && "hover:bg-muted/50"
                    )}
                  >
                    <div
                      className={cn(
                        "flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center transition-colors",
                        isActive && "bg-primary text-primary-foreground",
                        isCompleted && !isActive && "bg-primary/20 text-primary",
                        !isActive && !isCompleted && "bg-muted text-muted-foreground"
                      )}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4" fill={isActive ? "currentColor" : "none"} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div
                        className={cn(
                          "text-sm font-medium truncate",
                          isActive && "text-foreground",
                          isCompleted && !isActive && "text-muted-foreground",
                          !isActive && !isCompleted && "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              <motion.div
                key={stepManager.currentStep}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6"
              >
                {/* Render current step component */}
                {stepManager.currentStep === 1 && (
                  <StepProjectContext
                    procurementType={procurementType}
                    setProcurementType={setProcurementType}
                    serviceProgram={serviceProgram}
                    setServiceProgram={setServiceProgram}
                    technicalPOC={technicalPOC}
                    setTechnicalPOC={setTechnicalPOC}
                    selectedProject={selectedProject}
                    setSelectedProject={setSelectedProject}
                    popStart={popStart}
                    setPopStart={setPopStart}
                    popCompletion={popCompletion}
                    setPopCompletion={setPopCompletion}
                    onNext={handleNext}
                  />
                )}

                {stepManager.currentStep === 2 && (
                  <StepProductDetails
                    productName={productName}
                    setProductName={setProductName}
                    category={category}
                    setCategory={setCategory}
                    quantity={quantity}
                    setQuantity={setQuantity}
                    budget={budget}
                    setBudget={setBudget}
                    projectScope={projectScope}
                    setProjectScope={setProjectScope}
                    attachments={attachments}
                    setAttachments={setAttachments}
                    vendors={vendors}
                    setVendors={setVendors}
                    // KPA One-Flow props
                    kpaSessionId={kpaSessionId}
                    setKpaSessionId={setKpaSessionId}
                    setIntakeData={setIntakeData}
                    projectContext={{
                      project_name: selectedProject,
                      procurement_type: procurementType,
                      service_program: serviceProgram,
                      technical_poc: technicalPOC
                    }}
                    onNext={handleNext}
                    onBack={handleBack}
                  />
                )}

                {stepManager.currentStep === 3 && (
                  <StepSpecifications
                    productName={productName}
                    quantity={quantity}
                    budget={budget}
                    projectScope={projectScope}
                    attachments={attachments}
                    procurementType={procurementType}
                    serviceProgram={serviceProgram}
                    technicalPOC={technicalPOC}
                    selectedProject={selectedProject}
                    vendors={vendors}
                    variants={variants}
                    setVariants={setVariants}
                    selectedVariants={selectedVariants}
                    setSelectedVariants={setSelectedVariants}
                    generatingRecommendations={generatingRecommendations}
                    setGeneratingRecommendations={setGeneratingRecommendations}
                    aiRecommendation={aiRecommendation}
                    setAiRecommendation={setAiRecommendation}
                    // KPA One-Flow props
                    kpaSessionId={kpaSessionId}
                    intakeData={intakeData}
                    setIntakeData={setIntakeData}
                    followupAnswers={followupAnswers}
                    setFollowupAnswers={setFollowupAnswers}
                    kpaRecommendations={kpaRecommendations}
                    setKpaRecommendations={setKpaRecommendations}
                    // Step identification
                    currentStep={stepManager.currentStep}
                    onNext={handleNext}
                    onBack={handleBack}
                  />
                )}

                {stepManager.currentStep === 4 && (
                  <StepSpecifications
                    productName={productName}
                    quantity={quantity}
                    budget={budget}
                    projectScope={projectScope}
                    attachments={attachments}
                    procurementType={procurementType}
                    serviceProgram={serviceProgram}
                    technicalPOC={technicalPOC}
                    selectedProject={selectedProject}
                    vendors={vendors}
                    variants={variants}
                    setVariants={setVariants}
                    selectedVariants={selectedVariants}
                    setSelectedVariants={setSelectedVariants}
                    generatingRecommendations={generatingRecommendations}
                    setGeneratingRecommendations={setGeneratingRecommendations}
                    aiRecommendation={aiRecommendation}
                    setAiRecommendation={setAiRecommendation}
                    // KPA One-Flow props
                    kpaSessionId={kpaSessionId}
                    intakeData={intakeData}
                    setIntakeData={setIntakeData}
                    followupAnswers={followupAnswers}
                    setFollowupAnswers={setFollowupAnswers}
                    kpaRecommendations={kpaRecommendations}
                    setKpaRecommendations={setKpaRecommendations}
                    // Step identification
                    currentStep={stepManager.currentStep}
                    onNext={handleNext}
                    onBack={handleBack}
                  />
                )}

                {stepManager.currentStep === 5 && (
                  <StepVendorSearch
                    productName={productName}
                    selectedVariants={selectedVariants}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    searchOutputText={searchOutputText}
                    setSearchOutputText={setSearchOutputText}
                    searching={searching}
                    setSearching={setSearching}
                    kpaRecommendations={kpaRecommendations}
                    onNext={handleNext}
                    onBack={handleBack}
                  />
                )}

                {stepManager.currentStep === 6 && (
                  <StepCARTEnhanced
                    selectedVendors={selectedVendors}
                    onNext={handleNext}
                    onBack={handleBack}
                    currentStep={stepManager.currentStep}
                    productName={productName}
                    budget={budget}
                    quantity={quantity}
                    projectScope={projectScope}
                    procurementType={procurementType}
                    serviceProgram={serviceProgram}
                    technicalPOC={technicalPOC}
                    projectKeys={selectedProject ? [selectedProject] : []}
                    popStart={popStart}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        <AnimatePresence>
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              className={`flex items-center gap-3 p-4 rounded-lg shadow-lg border ${
                notification.type === 'success' 
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : notification.type === 'error'
                  ? 'bg-red-50 border-red-200 text-red-800'
                  : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              {notification.type === 'success' && <CheckCircle className="h-5 w-5" />}
              {notification.type === 'error' && <AlertCircle className="h-5 w-5" />}
              {notification.type === 'info' && <Circle className="h-5 w-5" />}
              <span className="text-sm font-medium">{notification.message}</span>
              <button
                onClick={() => removeNotification(notification.id)}
                className="ml-2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}




