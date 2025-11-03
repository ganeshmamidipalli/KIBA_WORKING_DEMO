import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Upload, X, TestTube } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Separator } from "../ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import * as api from "../../lib/api";
import { TEST_PRODUCTS, getTestProductById } from "../../lib/testProducts";
import type { Attachment, IntakeData } from "../../types";
import { useState } from "react";

const MAX_FILE_MB = 10;
const MAX_TOTAL_MB = 30;
const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg";

interface StepProductDetailsProps {
  productName: string;
  setProductName: (value: string) => void;
  category: string;
  setCategory: (value: string) => void;
  quantity: string;
  setQuantity: (value: string) => void;
  budget: string;
  setBudget: (value: string) => void;
  projectScope: string;
  setProjectScope: (value: string) => void;
  attachments: Attachment[];
  setAttachments: (value: Attachment[]) => void;
  vendors: string[];
  setVendors: (value: string[]) => void;
  // KPA One-Flow props
  kpaSessionId: string | null;
  setKpaSessionId: (value: string | null) => void;
  setIntakeData: (value: IntakeData | null) => void;
  projectContext: {
    project_name: string;
    procurement_type: string;
    service_program: string;
    technical_poc: string;
  };
  onNext: () => void;
  onBack: () => void;
}

function prettySize(n: number) {
  const mb = n / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(2)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

export function StepProductDetails({
  productName,
  setProductName,
  category,
  setCategory,
  quantity,
  setQuantity,
  budget,
  setBudget,
  projectScope,
  setProjectScope,
  attachments,
  setAttachments,
  vendors,
  setVendors,
  // KPA One-Flow props
  kpaSessionId,
  setKpaSessionId,
  setIntakeData,
  projectContext,
  onNext,
  onBack,
}: StepProductDetailsProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  // Removed unused loadingVendors state
  const [analyzing, setAnalyzing] = useState(false);
  
  // KPA One-Flow state
  const [startingIntake, setStartingIntake] = useState(false);
  
  // Test product selection
  const [selectedTestProduct, setSelectedTestProduct] = useState<string>("");

  // Handle test product selection
  const handleTestProductSelect = (productId: string) => {
    if (productId === "custom") {
      setSelectedTestProduct("");
      return;
    }

    const testProduct = getTestProductById(productId);
    if (testProduct) {
      setSelectedTestProduct(productId);
      setProductName(testProduct.name);
      setCategory(testProduct.category);
      setQuantity(testProduct.quantity);
      setBudget(testProduct.budget);
      setProjectScope(testProduct.projectScope);
      setVendors(testProduct.vendors);
    }
  };

  const handleContinue = async () => {
    // Validate required fields
    if (!productName.trim()) {
      alert("Please enter a Product Name");
      return;
    }
    if (!quantity || parseInt(quantity) <= 0) {
      alert("Please enter a valid Quantity");
      return;
    }
    if (!budget || parseFloat(budget) <= 0) {
      alert("Please enter a valid Budget");
      return;
    }

    // Start KPA One-Flow intake process
    setStartingIntake(true);
    try {
      const intakeRequest = {
        session_id: kpaSessionId || undefined,
        product_name: productName,
        budget_usd: parseFloat(budget),
        quantity: parseInt(quantity),
        scope_text: projectScope,
        vendors: vendors,
        uploaded_summaries: attachments.map(a => a.summary || a.text_preview || '').filter(s => s),
        project_context: {
          project_name: projectContext.project_name,
          procurement_type: projectContext.procurement_type,
          service_program: projectContext.service_program,
          technical_poc: projectContext.technical_poc
        }
      };

      console.log("StepProductDetails: Starting KPA One-Flow intake...");
      const response = await api.startIntake(intakeRequest);
      
      // Store session ID and intake data
      setKpaSessionId(response.session_id);
      setIntakeData(response.intake);
      
      // Store session ID in localStorage for persistence
      localStorage.setItem("kiba3_session_id", response.session_id);
      
      console.log("StepProductDetails: KPA One-Flow intake completed:", response);
      console.log("StepProductDetails: Calling onNext() to proceed to next step");
      
      // Prepare step data for the step manager
      const stepData = {
        productName,
        category,
        quantity,
        budget,
        projectScope,
        attachments,
        vendors,
        kpaSessionId: response.session_id,
        intakeData: response.intake,
        followupAnswers: {} // Initialize empty followup answers
      };
      
      console.log('StepProductDetails: Prepared stepData:', stepData);
      console.log('StepProductDetails: productName value:', productName);
      console.log('StepProductDetails: productName type:', typeof productName);
      console.log('StepProductDetails: Calling onNext with stepData');
      
      // Proceed to next step with data
      onNext(stepData);
    } catch (error) {
      console.error("StepProductDetails: Error starting KPA One-Flow intake:", error);
      alert("Error starting intake process. Please try again.");
    } finally {
      setStartingIntake(false);
    }
  };

  const uploadFiles = async (files: File[]) => {
    if (!files.length) return;

    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_MB * 1024 * 1024) {
      alert(`Total upload exceeds ${MAX_TOTAL_MB} MB`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        alert(`${f.name} exceeds ${MAX_FILE_MB} MB`);
        return;
      }
    }

    setUploading(true);
    setUploadProgress([]);

    try {
      setUploadProgress(["📤 Uploading files..."]);

      const result = await api.uploadFiles(files);

      setUploadProgress((p) => [...p, `✅ Uploaded ${result.attachments.length} file(s)`]);
      setUploadProgress((p) => [...p, "🤖 Extracting text from documents..."]);
      setUploadProgress((p) => [...p, "🧠 Analyzing content with AI..."]);
      setUploadProgress((p) => [...p, "📝 Generating comprehensive summary..."]);

      const newAttachments: Attachment[] = result.attachments.map((att: any) => ({
        id: att.id,
        name: att.name,
        mime: att.mime,
        size: att.size,
        text_preview: att.summary || att.text_preview
      }));

      setAttachments([...attachments, ...newAttachments]);

      if (result.scope && result.scope.summarized_bullets.length > 0) {
        const scopeText = result.scope.summarized_bullets.join('\n');
        setProjectScope(projectScope ? `${projectScope}\n\n${scopeText}` : scopeText);
      }

      setUploadProgress((p) => [...p, "✅ Complete! Scope added to Project Scope"]);

      setTimeout(() => {
        setUploadProgress([]);
        setUploading(false);
      }, 2000);

    } catch (error) {
      console.error('Upload error:', error);
      setUploadProgress(["❌ Upload failed. Make sure backend is running on port 8000"]);
      setTimeout(() => {
        setUploadProgress([]);
        setUploading(false);
      }, 3000);
    }
  };

  const analyzeFilesEnhanced = async (files: File[]) => {
    if (!files.length) return;

    console.log('[Enhanced Analyzer] Starting with', files.length, 'files');

    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL_MB * 1024 * 1024) {
      alert(`Total upload exceeds ${MAX_TOTAL_MB} MB`);
      return;
    }
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        alert(`${f.name} exceeds ${MAX_FILE_MB} MB`);
        return;
      }
    }

    setAnalyzing(true);
    setUploadProgress([]);

    try {
      setUploadProgress(["📤 Uploading files for enhanced analysis..."]);
      console.log('[Enhanced Analyzer] Calling API...');

      const result = await api.analyzeFiles(files);
      console.log('[Enhanced Analyzer] API response:', result);

      setUploadProgress((p) => [...p, `✅ Analyzed ${result.total_files} file(s)`]);
      setUploadProgress((p) => [...p, "🔍 Processing with Procurement Summarizer..."]);
      setUploadProgress((p) => [...p, "📊 Extracting structured procurement data..."]);

      // Process results and auto-fill form fields
      const allItems: any[] = [];
      result.files.forEach((file: any) => {
        if (file.procurement_items && file.procurement_items.length > 0) {
          allItems.push(...file.procurement_items);
        }
      });

      // Auto-fill product details if found
      if (allItems.length > 0) {
        const firstItem = allItems[0];
        
        if (firstItem.product_name && !productName) {
          setProductName(firstItem.product_name);
          setUploadProgress((p) => [...p, `✓ Product: ${firstItem.product_name}`]);
        }
        
        if (firstItem.category && !category) {
          setCategory(firstItem.category);
          setUploadProgress((p) => [...p, `✓ Category: ${firstItem.category}`]);
        }
        
        if (firstItem.quantity && !quantity) {
          const qty = typeof firstItem.quantity === 'number' ? firstItem.quantity.toString() : firstItem.quantity;
          setQuantity(qty);
          setUploadProgress((p) => [...p, `✓ Quantity: ${qty}`]);
        }
        
        if (firstItem.budget && !budget) {
          const budgetVal = typeof firstItem.budget === 'number' ? firstItem.budget.toString() : firstItem.budget.toString().replace(/[^0-9.]/g, '');
          setBudget(budgetVal);
          setUploadProgress((p) => [...p, `✓ Budget: $${budgetVal}`]);
        }
        
        // Build comprehensive scope from all items
        const scopeParts = allItems.map((item) => {
          let part = item.summary || '';
          if (item.notes) part += `\nNotes: ${item.notes}`;
          if (item.timeline) part += `\nTimeline: ${item.timeline}`;
          return part;
        }).filter(Boolean);
        
        if (scopeParts.length > 0) {
          const newScope = scopeParts.join('\n\n');
          setProjectScope(projectScope ? `${projectScope}\n\n${newScope}` : newScope);
          setUploadProgress((p) => [...p, `✓ Extracted ${allItems.length} procurement item(s)`]);
        }
      }

      // Add overall summaries to scope
      const summaries = result.files
        .map((f: any) => f.overall_summary)
        .filter((s: string) => s && s.trim())
        .join('\n\n');
      
      if (summaries && !allItems.length) {
        setProjectScope(projectScope ? `${projectScope}\n\n${summaries}` : summaries);
      }

      setUploadProgress((p) => [...p, "✅ Enhanced analysis complete!"]);

      setTimeout(() => {
        setUploadProgress([]);
        setAnalyzing(false);
      }, 3000);

    } catch (error) {
      console.error('[Enhanced Analyzer] Error:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      setUploadProgress([
        "❌ Analysis failed",
        `Error: ${errorMsg}`,
        "Check browser console for details",
        "Make sure backend is running on port 8000"
      ]);
      setTimeout(() => {
        setUploadProgress([]);
        setAnalyzing(false);
      }, 5000);
    }
  };

  const fetchVendorSuggestions = async (product: string) => {
    if (!product || product.length < 3) {
      setVendors([]);
      return;
    }

    try {
      const result = await api.suggestVendors(product, category);
      setVendors(result.vendors);
    } catch (error) {
      console.error('Vendor suggestion error:', error);
      setVendors([]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter((x) => x.id !== id));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
      <Card className="border-border">
        <CardHeader>
          <CardTitle>Product Details</CardTitle>
          <CardDescription>
            Specify the product or service you need to procure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Test Product Selection */}
          <Card className="border-blue-200 bg-blue-50/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <TestTube className="h-4 w-4 text-blue-600" />
                Quick Test Products
              </CardTitle>
              <CardDescription className="text-xs">
                Select a pre-filled product for quick testing (development only)
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-3">
                <Select value={selectedTestProduct} onValueChange={handleTestProductSelect}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose a test product or enter custom details" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="custom">Custom Product (Manual Entry)</SelectItem>
                    {TEST_PRODUCTS.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} - ${parseInt(product.budget).toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {selectedTestProduct && selectedTestProduct !== "custom" && (
                  <div className="text-xs text-muted-foreground bg-white p-2 rounded border">
                    <strong>Selected:</strong> {getTestProductById(selectedTestProduct)?.description}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="productName">Product Name <span className="text-destructive">*</span></Label>
              <Input
                id="productName"
                placeholder="e.g., Dell Latitude 5420 Laptop"
                value={productName}
                onChange={(e) => {
                  setProductName(e.target.value);
                  fetchVendorSuggestions(e.target.value);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                placeholder="e.g., Electronics, Software, Services"
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  if (productName) fetchVendorSuggestions(productName);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity <span className="text-destructive">*</span></Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                placeholder="e.g., 10"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="budget">Total Budget (USD) <span className="text-destructive">*</span></Label>
              <Input
                id="budget"
                type="number"
                min={0}
                placeholder="e.g., 50000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div>
              <Label className="text-base font-semibold">Project Scope</Label>
              <p className="text-sm text-muted-foreground mt-1">
                Upload documents to auto-extract scope, or enter manually below
              </p>
            </div>

            <Card className="bg-muted/30">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <input
                          type="file"
                          multiple
                          accept={ACCEPT}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) await uploadFiles(files);
                            e.currentTarget.value = "";
                          }}
                          className="hidden"
                          id="standard-upload"
                          disabled={uploading || analyzing}
                        />
                        <Button 
                          variant="outline" 
                          className="w-full"
                          disabled={uploading || analyzing}
                          onClick={() => document.getElementById('standard-upload')?.click()}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Standard Upload
                        </Button>
                      </div>
                      <div className="flex-1">
                        <input
                          type="file"
                          multiple
                          accept={ACCEPT}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (files.length) await analyzeFilesEnhanced(files);
                            e.currentTarget.value = "";
                          }}
                          className="hidden"
                          id="enhanced-analyze"
                          disabled={uploading || analyzing}
                        />
                        <Button 
                          className="w-full"
                          disabled={uploading || analyzing}
                          onClick={() => document.getElementById('enhanced-analyze')?.click()}
                        >
                          🔍 Enhanced Analyzer
                        </Button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Max {MAX_FILE_MB} MB per file • PDF, DOCX, XLSX/CSV, TXT/MD, PowerPoint, HTML, Images
                    </p>
                    <p className="text-xs text-primary">
                      💡 <strong>Enhanced Analyzer:</strong> Auto-fills product details and extracts structured procurement data
                    </p>
                  </div>

                  {(uploading || analyzing) && uploadProgress.length > 0 && (
                    <Card className="bg-primary/5 border-primary/20">
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          {uploadProgress.map((msg, idx) => (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: idx * 0.1 }}
                              className="text-sm"
                            >
                              {msg}
                            </motion.div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {attachments.length > 0 && (
                    <div className="space-y-2">
                      {attachments.map((att) => (
                        <Card key={att.id} className="bg-card">
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{att.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {att.mime} • {prettySize(att.size)}
                                </p>
                                {att.text_preview && (
                                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                                    {att.text_preview}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeAttachment(att.id)}
                                className="h-8 w-8 flex-shrink-0"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-2">
              <Textarea
                placeholder="Describe the project scope, requirements, and objectives..."
                rows={6}
                value={projectScope}
                onChange={(e) => setProjectScope(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>

          <div className="flex justify-between pt-4">
            <Button onClick={onBack} variant="outline" className="gap-2">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button 
              onClick={handleContinue} 
              disabled={startingIntake}
              className="gap-2"
            >
              {startingIntake ? "Starting Intake..." : "Continue"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

