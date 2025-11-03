import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, Send, CheckCircle, Clock, AlertCircle, Download, Mail, Users, Shield, DollarSign, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { useState, useEffect } from "react";
import type { Vendor } from "../../types";

interface StepRFQProcurementSimpleProps {
  selectedVendors: Vendor[];
  onNext: (data: any) => void;
  onBack: () => void;
  currentStep: number;
  productName?: string;
  budget?: string;
  quantity?: string;
  projectScope?: string;
  procurementType?: string;
  serviceProgram?: string;
  technicalPOC?: string;
  projectKeys?: string[];
}

export function StepRFQProcurementSimple({
  selectedVendors,
  onNext,
  onBack,
  currentStep,
  productName = "",
  budget = "0",
  quantity = "1",
  projectScope = "",
  procurementType = "Purchase Order",
  serviceProgram = "Applied Research",
  technicalPOC = "",
  projectKeys = [],
}: StepRFQProcurementSimpleProps) {
  
  // Form state
  const [formData, setFormData] = useState({
    procurementType: procurementType,
    serviceProgram: serviceProgram,
    technicalPOC: technicalPOC,
    estimatedCost: budget,
    projectKeys: projectKeys.join(', '),
    popStart: '',
    popCompletion: '',
    scopeBrief: projectScope || '',
    vendorEvaluation: '',
  });

  // Path selection
  const [selectedPath, setSelectedPath] = useState<'rfq' | 'procurement' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Check if we have enough vendor information
  const hasCompleteVendorInfo = selectedVendors.every(vendor => 
    vendor.price && vendor.price > 0 && vendor.sales_email
  );

  // Auto-suggest path based on vendor info completeness
  useEffect(() => {
    if (hasCompleteVendorInfo) {
      setSelectedPath('procurement');
    } else {
      setSelectedPath('rfq');
    }
  }, [hasCompleteVendorInfo]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!selectedPath) return;
    
    setIsSubmitting(true);
    
    try {
      const submissionData = {
        ...formData,
        selectedPath,
        selectedVendors,
        productName,
        quantity,
      };
      
      onNext(submissionData);
    } catch (error) {
      console.error('Submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-6"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          CART - Choose Your Path
        </h2>
        <p className="text-muted-foreground">Complete the form and choose how to proceed</p>
      </div>

      {/* Selected Vendors Summary */}
      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Selected Vendors ({selectedVendors.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {selectedVendors.map((vendor, index) => (
              <div key={vendor.id} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-medium">{vendor.vendor_name}</div>
                    <div className="text-sm text-muted-foreground">
                      {vendor.price ? `$${vendor.price.toLocaleString()}` : 'Price not available'}
                      {vendor.sales_email && ` • ${vendor.sales_email}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {vendor.price && vendor.price > 0 ? (
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="bg-red-100 text-red-800">
                      <AlertCircle className="w-3 h-3 mr-1" />
                      Missing Info
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Essential Form Fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Essential Details</CardTitle>
          <CardDescription>Fill in the required information to proceed</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Procurement Type</label>
              <Input
                value={formData.procurementType}
                onChange={(e) => handleInputChange('procurementType', e.target.value)}
                placeholder="Purchase Order"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Service Program</label>
              <Input
                value={formData.serviceProgram}
                onChange={(e) => handleInputChange('serviceProgram', e.target.value)}
                placeholder="Advanced Development"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Technical POC</label>
              <Input
                value={formData.technicalPOC}
                onChange={(e) => handleInputChange('technicalPOC', e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Estimated Cost (USD)</label>
              <Input
                type="number"
                value={formData.estimatedCost}
                onChange={(e) => handleInputChange('estimatedCost', e.target.value)}
                placeholder="15000"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Project Keys</label>
              <Input
                value={formData.projectKeys}
                onChange={(e) => handleInputChange('projectKeys', e.target.value)}
                placeholder="KMI-287_SOF_OTA"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">POP Start</label>
              <Input
                type="date"
                value={formData.popStart}
                onChange={(e) => handleInputChange('popStart', e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">POP Completion</label>
              <Input
                type="date"
                value={formData.popCompletion}
                onChange={(e) => handleInputChange('popCompletion', e.target.value)}
              />
            </div>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-2 block">Scope Brief</label>
            <Textarea
              value={formData.scopeBrief}
              onChange={(e) => handleInputChange('scopeBrief', e.target.value)}
              placeholder="Describe the purpose and what the supplier will provide..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Path Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Choose Your Path</CardTitle>
          <CardDescription>Select how to proceed based on your vendor information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RFQ Path */}
            <Card 
              className={`cursor-pointer transition-all ${
                selectedPath === 'rfq' 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedPath('rfq')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedPath === 'rfq' ? 'bg-blue-100' : 'bg-gray-100'
                  }`}>
                    <Send className={`w-5 h-5 ${selectedPath === 'rfq' ? 'text-blue-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Generate RFQs</h3>
                    <p className="text-sm text-muted-foreground">Send requests for quotes</p>
                  </div>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Missing pricing information</li>
                  <li>• Need vendor quotes</li>
                  <li>• Competitive sourcing</li>
                  <li>• Custom requirements</li>
                </ul>
              </CardContent>
            </Card>

            {/* Procurement Path */}
            <Card 
              className={`cursor-pointer transition-all ${
                selectedPath === 'procurement' 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => setSelectedPath('procurement')}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    selectedPath === 'procurement' ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <FileText className={`w-5 h-5 ${selectedPath === 'procurement' ? 'text-green-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Direct Procurement</h3>
                    <p className="text-sm text-muted-foreground">Proceed to approvals</p>
                  </div>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Complete pricing available</li>
                  <li>• All documents ready</li>
                  <li>• Business rules satisfied</li>
                  <li>• Ready for approval</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Recommendation */}
          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span className="font-medium">Recommendation</span>
            </div>
            <p className="text-sm text-muted-foreground">
              {hasCompleteVendorInfo 
                ? "✅ All vendor information is complete. You can proceed with direct procurement."
                : "⚠️ Some vendor information is missing. Consider generating RFQs to gather complete details."
              }
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <Button 
          onClick={handleSubmit}
          disabled={!selectedPath || isSubmitting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? (
            <>
              <Clock className="w-4 h-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {selectedPath === 'rfq' ? 'Generate RFQs' : 'Create Procurement Document'}
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </motion.div>
  );
}
