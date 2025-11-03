import { motion } from "framer-motion";
import { ChevronLeft, FileText, Loader2, CheckCircle2, ExternalLink, AlertTriangle, DollarSign, Package } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Separator } from "../ui/separator";
import { Badge } from "../ui/badge";
import { API_BASE } from "../../lib/api";
import type { SpecVariant, Attachment, RFQResult } from "../../types";

interface StepRFQProps {
  selectedProject: string;
  procurementType: string;
  serviceProgram: string;
  technicalPOC: string;
  popStart: string;
  popCompletion: string;
  productName: string;
  category: string;
  quantity: string;
  budget: string;
  projectScope: string;
  attachments: Attachment[];
  selectedVariants: SpecVariant[];
  searchOutputText: string;
  vendors: string[];
  generatedRFQ: RFQResult | null;
  setGeneratedRFQ: (value: RFQResult | null) => void;
  generatingRFQ: boolean;
  setGeneratingRFQ: (value: boolean) => void;
  onBack: () => void;
}

export function StepRFQ({
  selectedProject,
  procurementType,
  serviceProgram,
  technicalPOC,
  popStart,
  popCompletion,
  productName,
  category,
  quantity,
  budget,
  projectScope,
  attachments,
  selectedVariants,
  searchOutputText,
  vendors,
  generatedRFQ,
  setGeneratedRFQ,
  generatingRFQ,
  setGeneratingRFQ,
  onBack,
}: StepRFQProps) {
  
  // Pricing validation logic
  const validatePricing = () => {
    const issues: string[] = [];
    
    // Check if selected variants have pricing
    selectedVariants.forEach((variant, index) => {
      if (!variant.est_unit_price_usd || variant.est_unit_price_usd === 0) {
        issues.push(`Variant ${index + 1} (${variant.title}) is missing pricing information`);
      }
    });
    
    // Check if budget is reasonable compared to variant pricing
    const totalVariantCost = selectedVariants.reduce((sum, variant) => 
      sum + (variant.est_total_usd || 0), 0
    );
    const budgetAmount = parseFloat(budget) || 0;
    
    if (budgetAmount > 0 && totalVariantCost > 0) {
      const variance = Math.abs(totalVariantCost - budgetAmount) / budgetAmount;
      if (variance > 0.5) { // 50% variance
        issues.push(`Selected variants total cost ($${totalVariantCost.toLocaleString()}) differs significantly from budget ($${budgetAmount.toLocaleString()})`);
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues
    };
  };
  
  const pricingValidation = validatePricing();
  
  const generateRFQ = async () => {
    setGeneratingRFQ(true);
    
    try {
      const mockVendor = {
        id: "vendor1",
        name: vendors[0] || productName || "Primary Vendor",
        location: "USA",
        contact: "sales@vendor.com",
        score: 0.90,
        price_estimate: selectedVariants[0]?.est_unit_price_usd || parseFloat(budget) || 0,
        lead_time_days: selectedVariants[0]?.lead_time_days || 30
      };
      
      const rfqPayload = {
        procurement_kind: procurementType || "Purchase Order",
        service_program: serviceProgram || "Applied Research",
        kmi_technical_poc: technicalPOC || "",
        projects_supported: selectedProject ? [selectedProject] : [],
        pop_start: popStart || "",
        pop_end: popCompletion || "",
        suggested_type: procurementType || "Purchase Order",
        competition_type: "Sole Source",
        product_name: productName || "",
        scope_brief: projectScope || "",
        selected_variant: selectedVariants.length > 0 ? selectedVariants[0] : null,
        estimated_cost: selectedVariants.length > 0 ? selectedVariants[0].est_total_usd : parseFloat(budget) || 0,
        ai_ranked_vendors: [mockVendor],
        selected_vendor_ids: ["vendor1"],
        attachments: attachments.map(a => ({
          id: a.id,
          name: a.name,
          type: a.mime,
          summary: a.summary || ""
        }))
      };
      
      const response = await fetch(`${API_BASE}/api/rfq/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rfqPayload)
      });
      
      if (!response.ok) {
        throw new Error(`RFQ generation failed: ${response.statusText}`);
      }
      
      const result = await response.json();
      setGeneratedRFQ(result);
      window.open(`${API_BASE}${result.html_url}`, '_blank');
      
    } catch (error) {
      console.error('Error generating RFQ:', error);
      alert('Error generating RFQ. Please try again.');
    } finally {
      setGeneratingRFQ(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
      {/* Header */}
      <Card className="border-primary/40 bg-gradient-to-r from-primary/10 to-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
              <FileText className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold mb-1">Generate Request for Quotation (RFQ)</h3>
              <p className="text-sm text-muted-foreground">
                Review the collected information and generate your professional RFQ document
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pricing Validation */}
      {!pricingValidation.isValid && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5" />
              Pricing Validation Issues
            </CardTitle>
            <CardDescription className="text-amber-700 dark:text-amber-300">
              Please address these issues before generating the RFQ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pricingValidation.issues.map((issue, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-800 dark:text-amber-200">{issue}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing Summary */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-green-800 dark:text-green-200">
            <DollarSign className="h-5 w-5" />
            Pricing Summary
          </CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            Review pricing information before generating RFQ
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {selectedVariants.map((variant, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-lg border">
                <div className="flex items-center gap-3">
                  <Package className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="font-medium">{variant.title}</h4>
                    <p className="text-sm text-muted-foreground">Quantity: {variant.quantity}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-green-600">
                    ${variant.est_unit_price_usd?.toLocaleString() || 'N/A'} per unit
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Total: ${variant.est_total_usd?.toLocaleString() || 'N/A'}
                  </p>
                </div>
              </div>
            ))}
            
            <div className="border-t pt-4">
              <div className="flex justify-between items-center text-lg font-semibold">
                <span>Total Project Cost:</span>
                <span className="text-green-600">
                  ${selectedVariants.reduce((sum, variant) => sum + (variant.est_total_usd || 0), 0).toLocaleString()}
                </span>
              </div>
              {budget && (
                <div className="flex justify-between items-center text-sm text-muted-foreground mt-1">
                  <span>Budget:</span>
                  <span>${parseFloat(budget).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Auto-Filled Information Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Auto-Filled Information
          </CardTitle>
          <CardDescription>Collected from Steps 1-4</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Step 1 Data */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-primary">Step 1: Project Context</h4>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Project:</span> {selectedProject || "Not specified"}</p>
                <p><span className="text-muted-foreground">Type:</span> {procurementType || "Purchase Order"}</p>
                <p><span className="text-muted-foreground">Program:</span> {serviceProgram || "Applied Research"}</p>
                <p><span className="text-muted-foreground">POC:</span> {technicalPOC || "Not specified"}</p>
                {popStart && popCompletion && (
                  <p><span className="text-muted-foreground">POP:</span> {popStart} to {popCompletion}</p>
                )}
              </div>
            </div>
            
            {/* Step 2 Data */}
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-primary">Step 2: Product Details</h4>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Product:</span> {productName || "Not specified"}</p>
                <p><span className="text-muted-foreground">Category:</span> {category || "Not specified"}</p>
                <p><span className="text-muted-foreground">Quantity:</span> {quantity || "Not specified"}</p>
                <p><span className="text-muted-foreground">Budget:</span> ${budget ? parseFloat(budget).toLocaleString() : "Not specified"}</p>
              </div>
            </div>
            
            {/* Step 3 Data */}
            {selectedVariants.length > 0 && (
              <div className="space-y-2 md:col-span-2">
                <h4 className="text-sm font-semibold text-primary">Step 3: Selected Variant</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Variant:</span> <span className="font-semibold">{selectedVariants[0].title}</span></p>
                  <p><span className="text-muted-foreground">Unit Price:</span> ${selectedVariants[0].est_unit_price_usd.toLocaleString()}</p>
                  <p><span className="text-muted-foreground">Total Cost:</span> <span className="font-semibold">${selectedVariants[0].est_total_usd.toLocaleString()}</span></p>
                  <p><span className="text-muted-foreground">Lead Time:</span> {selectedVariants[0].lead_time_days} days</p>
                </div>
              </div>
            )}
          </div>
          
          {projectScope && (
            <>
              <Separator />
              <div>
                <h4 className="text-sm font-semibold text-primary mb-2">Scope of Work</h4>
                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3 max-h-32 overflow-y-auto">
                  {projectScope}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Vendor Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor Selection</CardTitle>
          <CardDescription>
            {searchOutputText ? "Vendors from search results will be included" : "Complete search step for vendor data"}
          </CardDescription>
        </CardHeader>
        {searchOutputText && (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              ✓ Vendor data available from Step 4 search results
            </p>
          </CardContent>
        )}
      </Card>

      {/* Generate RFQ */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Ready to Generate RFQ</h3>
              <p className="text-sm text-muted-foreground">
                All information from Steps 1-4 will be automatically included
              </p>
            </div>
            <Button
              onClick={generateRFQ}
              disabled={generatingRFQ || !selectedVariants.length || !pricingValidation.isValid}
              size="lg"
              className="gap-2"
            >
              {generatingRFQ ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Generate RFQ Document
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Generated RFQ Result */}
      {generatedRFQ && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold mb-2">✅ RFQ Generated Successfully!</h3>
                  <div className="text-sm space-y-1 mb-4">
                    <p><strong>RFQ ID:</strong> {generatedRFQ.rfq_id}</p>
                    <p><strong>Date:</strong> {generatedRFQ.created_at}</p>
                    <p><strong>Vendors:</strong> {generatedRFQ.vendor_count}</p>
                    <p><strong>Type:</strong> {generatedRFQ.is_competitive ? 'Competitive Procurement' : 'Sole Source'}</p>
                  </div>
                  <div className="flex gap-3">
                    <Button asChild>
                      <a
                        href={`${API_BASE}${generatedRFQ.html_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="gap-2"
                      >
                        <ExternalLink className="h-4 w-4" />
                        View RFQ
                      </a>
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => window.open(`${API_BASE}${generatedRFQ.html_url}`, '_blank')}
                      className="gap-2"
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button onClick={onBack} variant="outline" className="gap-2">
          <ChevronLeft className="h-4 w-4" />
          Back to Search
        </Button>
        <Button
          onClick={() => window.location.reload()}
          variant="outline"
        >
          🆕 Start New Request
        </Button>
      </div>
    </motion.div>
  );
}


