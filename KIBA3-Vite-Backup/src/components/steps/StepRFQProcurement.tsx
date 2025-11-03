import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, FileText, Send, CheckCircle, Clock, AlertCircle, Download, Mail, Users, Shield, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Progress } from "../ui/progress";
import { useState, useEffect } from "react";
import type { Vendor, RFQResult, CartDecision, ChecklistItem, G1Context, LineItem, ProcurementContext, PR, RFQ } from "../../types";
import { PostCartApiService } from "../../lib/postCartApi";

interface StepRFQProcurementProps {
  selectedVendors: Vendor[];
  onNext: (data: any) => void;
  onBack: () => void;
  currentStep: number;
  // Additional props for Post-Cart phase
  productName?: string;
  budget?: string;
  quantity?: string;
  projectScope?: string;
  procurementType?: string;
  serviceProgram?: string;
  technicalPOC?: string;
  projectKeys?: string[];
}

export function StepRFQProcurement({
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
}: StepRFQProcurementProps) {
  // Legacy state for backward compatibility
  const [rfqStatus, setRfqStatus] = useState<Record<string, 'pending' | 'sent' | 'received' | 'approved'>>({});
  const [generatingRFQ, setGeneratingRFQ] = useState(false);
  const [rfqDocuments, setRfqDocuments] = useState<Record<string, any>>({});

  // Post-Cart phase state
  const [cartDecision, setCartDecision] = useState<CartDecision | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedPath, setSelectedPath] = useState<'APPROVALS' | 'RFQ' | null>(null);
  const [pr, setPR] = useState<PR | null>(null);
  const [rfq, setRFQ] = useState<RFQ | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmedVendors, setConfirmedVendors] = useState(false);

  // Editable vendor fields in CART
  const [vendorRows, setVendorRows] = useState<Array<{
    id: string; name: string; productName: string; website?: string; contact?: string;
    price?: number; currency?: string; leadDays?: number; deliveryTerms?: string; quoteValidity?: string;
  }>>(
    selectedVendors.map((v: any) => ({
      id: v.id,
      name: v.name || v.vendor_name || 'Vendor',
      productName: v.productName || v.model || '',
      website: v.website || v.purchase_url || '',
      contact: v.contact || '',
      price: typeof v.price === 'number' ? v.price : undefined,
      currency: 'USD',
      leadDays: v.leadDays || 30,
      deliveryTerms: 'FOB Destination',
      quoteValidity: '30 days'
    }))
  );

  const updateRow = (id: string, patch: Partial<(typeof vendorRows)[number]>) => {
    setVendorRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const missingForApprovals = (r: (typeof vendorRows)[number]) => {
    const m: string[] = [];
    if (!r.contact) m.push('Email');
    if (!(r.price && r.price > 0)) m.push('Price');
    if (!r.currency) m.push('Currency');
    if (!(r.leadDays && r.leadDays > 0)) m.push('Lead Time');
    if (!r.deliveryTerms) m.push('Delivery Terms');
    if (!r.quoteValidity) m.push('Quote Validity');
    return m;
  };

  // Procurements & Role Players form state
  const [procurementKind, setProcurementKind] = useState<'Contract' | 'Subcontract' | 'Purchase Order' | 'Credit Card Auth'>(
    'Purchase Order'
  );
  const [serviceProgramVal, setServiceProgramVal] = useState<string>(serviceProgram || 'Applied Research');
  const [technicalPOCVal, setTechnicalPOCVal] = useState<string>(technicalPOC || '');
  const [estimatedCost, setEstimatedCost] = useState<number>(() => {
    const q = (selectedVendors?.[0] as any)?.price || 0;
    return q > 0 ? q : 0;
  });
  const [projectKeysVal, setProjectKeysVal] = useState<string>(Array.isArray(projectKeys) ? projectKeys.join(', ') : '');
  const [popStart, setPopStart] = useState<string>('');
  const [popEnd, setPopEnd] = useState<string>('');
  const [suggestedType, setSuggestedType] = useState<string>('Purchase Order');
  const [competitionType, setCompetitionType] = useState<'Competitive' | 'Sole Source'>(selectedVendors.length > 1 ? 'Competitive' : 'Sole Source');
  const [multipleVendorsAvailable, setMultipleVendorsAvailable] = useState<boolean>(selectedVendors.length > 1);
  const [scopeBrief, setScopeBrief] = useState<string>('');
  const [vendorEvaluationNotes, setVendorEvaluationNotes] = useState<string>('');

  // Debug: Log selected vendors when component mounts
  console.log("StepRFQProcurement: Received selectedVendors:", selectedVendors);
  console.log("StepRFQProcurement: Number of selected vendors:", selectedVendors?.length || 0);

  // Evaluate G1 decision gate on component mount
  useEffect(() => {
    evaluateG1Decision();
  }, [selectedVendors]);

  // Evaluate G1 decision gate (server-side)
  const evaluateG1Decision = async () => {
    if (selectedVendors.length === 0) return;

    setIsEvaluating(true);
    try {
      // Create G1 context (fallback-safe mapping from vendor shape)
      const g1Context: G1Context = {
        selectedVendors: selectedVendors.map((v: any) => ({
          id: v.id,
          name: v.name || v.vendor_name || "Vendor",
          productName: v.productName || v.model || "",
          price: typeof v.price === 'number' ? v.price : 0,
          contact: v.contact || "",
          website: v.website || v.purchase_url || ""
        })),
        items: createLineItemsFromVendors(),
        pricing: createPricingFromVendors(),
        procurementContext: createProcurementContext()
      };

      // Evaluate using backend API
      const decision = await PostCartApiService.evaluateG1(g1Context);
      setCartDecision(decision);
      
      console.log("G1 Decision:", decision);
    } catch (error) {
      console.error("Error evaluating G1 decision:", error);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Create line items from selected vendors
  const createLineItemsFromVendors = (): LineItem[] => {
    return vendorRows.map((row) => ({
      sku: `ITEM-${row.id}`,
      desc: row.productName || productName,
      qty: parseInt(quantity) || 1,
      uom: "EA",
      unitPrice: row.price || 0,
      currency: row.currency || 'USD',
      leadDays: row.leadDays || 30,
      deliveryTerms: row.deliveryTerms || 'FOB Destination',
      quoteValidity: row.quoteValidity || '30 days'
    }));
  };

  // Create pricing data from vendors
  const createPricingFromVendors = (): Record<string, LineItem[]> => {
    const pricing: Record<string, LineItem[]> = {};
    vendorRows.forEach((row) => {
      pricing[row.id] = [{
        sku: `ITEM-${row.id}`,
        desc: row.productName || productName,
        qty: parseInt(quantity) || 1,
        uom: "EA",
        unitPrice: row.price || 0,
        currency: row.currency || 'USD',
        leadDays: row.leadDays || 30,
        deliveryTerms: row.deliveryTerms || 'FOB Destination',
        quoteValidity: row.quoteValidity || '30 days'
      }];
    });
    return pricing;
  };

  // Create procurement context
  const createProcurementContext = (): ProcurementContext => {
    return {
      budgeted: true, // Assume budgeted for now
      spendType: "Direct",
      competitive: selectedVendors.length > 1,
      estimatedCost: estimatedCost || parseFloat(budget) || 0,
      contractRequired: false,
      pmisProjectIds: projectKeys,
      justifications: [],
      procurementType: mapProcurementType(procurementType),
      spendPlanStatus: "APPROVED",
      isSoleSource: selectedVendors.length === 1,
      subcontracting: false,
      popGt30d: true,
      customerTCs: false,
      contractExecuted: false
    };
  };

  // Map procurement type to enum
  const mapProcurementType = (type: string): ProcurementContext['procurementType'] => {
    switch (type) {
      case "Purchase Order": return "PROC_COMPETITIVE";
      case "Sole Source": return "PROC_SOLE_SOURCE";
      case "Bids & Proposals": return "BIDS_AND_PROPOSALS";
      case "ROMS": return "ROMS";
      default: return "PROC_COMPETITIVE";
    }
  };

  // Handle path selection
  const handlePathSelection = async (path: 'APPROVALS' | 'RFQ') => {
    setSelectedPath(path);
    setIsProcessing(true);

    try {
      if (path === 'APPROVALS') {
        await handleProceedToApprovals();
      } else {
        await handleGenerateRFQs();
      }
    } catch (error) {
      console.error(`Error in ${path} path:`, error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Guard for approvals readiness
  const approvalsReady = !!cartDecision?.g1Result?.passed && !!serviceProgramVal && !!technicalPOCVal && (estimatedCost || 0) > 0 && vendorRows.every(r => missingForApprovals(r).length === 0);

  // RFQ Draft previews
  const [rfqDrafts, setRfqDrafts] = useState<Record<string, {subject: string; body_md: string}>>({});
  const loadRfqDrafts = async () => {
    const drafts: Record<string, {subject: string; body_md: string}> = {};
    for (const r of vendorRows) {
      if (!r.contact) continue; // need an email to send
      try {
        const d = await PostCartApiService.draftRFQ({
          vendor: { id: r.id, name: r.name, contact: r.contact },
          lineItems: createLineItemsFromVendors(),
          dueDate: new Date(Date.now() + 14*24*60*60*1000).toISOString(),
          terms: { delivery: r.deliveryTerms || 'FOB Destination', payment: 'Net 30' }
        });
        drafts[r.id] = d;
      } catch (e) { /* ignore individual errors */ }
    }
    setRfqDrafts(drafts);
  };

  // Handle Proceed to Approvals (Path A)
  const handleProceedToApprovals = async () => {
    if (!cartDecision) return;

    try {
      // Create PR
      const prData = {
        projectKeys: projectKeys,
        spendType: "Direct" as const,
        budgeted: true,
        estimatedCost: estimatedCost || parseFloat(budget) || 0,
        competitive: selectedVendors.length > 1,
        vendor: {
          id: (selectedVendors[0] as any).id,
          name: (selectedVendors[0] as any).name || (selectedVendors[0] as any).vendor_name || "Vendor",
          contact: (selectedVendors[0] as any).contact || "",
          website: (selectedVendors[0] as any).website || (selectedVendors[0] as any).purchase_url || ""
        },
        lineItems: createLineItemsFromVendors(),
        documents: [], // Will be populated with uploaded docs
        justification: {
          type: competitionType === 'Sole Source' ? 'SSJ' : 'Budgeted',
          text: competitionType === 'Sole Source' ? 'Sole Source Justification pending/attached' : 'Approved budget allocation'
        }
      };

      const createdPR = await PostCartApiService.createPR(prData);
      setPR(createdPR);

      // Start approval routing
      const approvalRoute = {
        required: cartDecision.g1Result.requiredApprovers,
        roster: [], // Will be populated by backend
        decisions: []
      };

      await PostCartApiService.startApprovalRouting(createdPR.id, approvalRoute);
      
      console.log("PR created and approval routing started:", createdPR);
    } catch (error) {
      console.error("Error creating PR:", error);
    }
  };

  // Handle Generate RFQs (Path B)
  const handleGenerateRFQs = async () => {
    try {
      // Create RFQ
      const rfqData = {
        lineItems: createLineItemsFromVendors(),
        vendors: selectedVendors.map(vendor => ({
          vendorId: (vendor as any).id,
          vendorName: (vendor as any).name || (vendor as any).vendor_name || "Vendor",
          contact: (vendor as any).contact || "",
          status: "PENDING" as const
        })),
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
        terms: {
          delivery: "FOB Destination",
          payment: "Net 30"
        }
      };

      const createdRFQ = await PostCartApiService.generateRFQ(rfqData);
      setRFQ(createdRFQ);

      // Send RFQs
      await PostCartApiService.sendRFQ(createdRFQ.id);
      
      console.log("RFQ created and sent:", createdRFQ);
    } catch (error) {
      console.error("Error creating RFQ:", error);
    }
  };

  // Generate RFQ for selected vendors
  const generateRFQ = async () => {
    setGeneratingRFQ(true);
    try {
      // Simulate RFQ generation
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mark all as sent
      const newStatus = { ...rfqStatus };
      selectedVendors.forEach(vendor => {
        newStatus[vendor.id] = 'sent';
      });
      setRfqStatus(newStatus);
      
      // Generate RFQ documents
      const documents = {};
      selectedVendors.forEach(vendor => {
        documents[vendor.id] = {
          vendorName: vendor.name,
          productName: vendor.productName,
          price: vendor.price,
          email: vendor.contact,
          rfqId: `RFQ-${Date.now()}-${vendor.id}`,
          status: 'sent',
          sentDate: new Date().toISOString(),
        };
      });
      setRfqDocuments(documents);
      
    } catch (error) {
      console.error('Error generating RFQ:', error);
    } finally {
      setGeneratingRFQ(false);
    }
  };

  // Update vendor status
  const updateVendorStatus = (vendorId: string, status: 'pending' | 'sent' | 'received' | 'approved') => {
    setRfqStatus(prev => ({
      ...prev,
      [vendorId]: status
    }));
  };

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'sent':
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Send className="w-3 h-3 mr-1" />Sent</Badge>;
      case 'received':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />Received</Badge>;
      case 'approved':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Calculate completion percentage
  const completedVendors = Object.values(rfqStatus).filter(status => status === 'approved').length;
  const totalVendors = selectedVendors.length;
  const completionPercentage = totalVendors > 0 ? (completedVendors / totalVendors) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-4xl space-y-4 px-4"
    >
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            CART - Post-Selection Phase
          </CardTitle>
          <CardDescription>
            Decision gate: Choose between direct procurement approvals or RFQ generation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Selected Vendors (editable) */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Selected Vendors</CardTitle>
              <CardDescription>Fill missing fields. Required for Approvals: email, price, currency, lead time, terms, validity.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-2">Vendor</th>
                      <th className="py-2 pr-2">Email</th>
                      <th className="py-2 pr-2">Website</th>
                      <th className="py-2 pr-2">Price</th>
                      <th className="py-2 pr-2">Currency</th>
                      <th className="py-2 pr-2">Lead Days</th>
                      <th className="py-2 pr-2">Delivery Terms</th>
                      <th className="py-2 pr-2">Validity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorRows.map((r) => {
                      const miss = missingForApprovals(r);
                      const missingSet = new Set(miss);
                      const cell = (key: string, input: React.ReactNode) => (
                        <td className={`py-1 pr-2 ${missingSet.has(key) ? 'bg-amber-50' : ''}`}>{input}</td>
                      );
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="py-1 pr-2 font-medium">{r.name}</td>
                          {cell('Email', <Input value={r.contact || ''} onChange={e=>updateRow(r.id,{contact:e.target.value})} placeholder="sales@vendor.com" />)}
                          <td className="py-1 pr-2"><Input value={r.website || ''} onChange={e=>updateRow(r.id,{website:e.target.value})} placeholder="https://..." /></td>
                          {cell('Price', <Input type="number" value={r.price ?? ''} onChange={e=>updateRow(r.id,{price: parseFloat(e.target.value)||0})} placeholder="0" />)}
                          {cell('Currency', <Input value={r.currency || 'USD'} onChange={e=>updateRow(r.id,{currency:e.target.value})} />)}
                          {cell('Lead Time', <Input type="number" value={r.leadDays ?? 0} onChange={e=>updateRow(r.id,{leadDays: parseInt(e.target.value)||0})} />)}
                          {cell('Delivery Terms', <Input value={r.deliveryTerms || ''} onChange={e=>updateRow(r.id,{deliveryTerms:e.target.value})} />)}
                          {cell('Quote Validity', <Input value={r.quoteValidity || ''} onChange={e=>updateRow(r.id,{quoteValidity:e.target.value})} />)}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2 mt-3">
                <Button variant="outline" onClick={() => { setConfirmedVendors(true); loadRfqDrafts(); }} disabled={confirmedVendors}>
                  {confirmedVendors ? 'Vendors Confirmed' : 'Confirm Vendors'}
                </Button>
              </div>
            </CardContent>
          </Card>
          {/* Procurements & Role Players */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Procurements & Role Players</CardTitle>
              <CardDescription>Fill details to proceed with Approvals or Generate RFQs</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Procurement Kind</label>
                  <Input value={procurementKind} onChange={e=>setProcurementKind(e.target.value as any)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Service Program</label>
                  <Input value={serviceProgramVal} onChange={e=>setServiceProgramVal(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">KMI Technical POC</label>
                  <Input value={technicalPOCVal} onChange={e=>setTechnicalPOCVal(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Estimated Costs (USD)</label>
                  <Input type="number" value={String(estimatedCost ?? '')} onChange={e=>setEstimatedCost(parseFloat(e.target.value)||0)} />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs text-muted-foreground">KMI Project(s) Supported (comma separated)</label>
                  <Input value={projectKeysVal} onChange={e=>setProjectKeysVal(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">POP Start</label>
                  <Input type="date" value={popStart} onChange={e=>setPopStart(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">POP Completion</label>
                  <Input type="date" value={popEnd} onChange={e=>setPopEnd(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Suggested Procurement Type</label>
                  <Input value={suggestedType} onChange={e=>setSuggestedType(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Competition Type</label>
                  <Input value={competitionType} onChange={e=>setCompetitionType((e.target.value as any) || 'Competitive')} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Multiple Vendors Available?</label>
                  <Input value={multipleVendorsAvailable ? 'Yes' : 'No'} onChange={e=>setMultipleVendorsAvailable(e.target.value.toLowerCase().startsWith('y'))} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Scope Brief */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Scope Brief</CardTitle>
              <CardDescription>Describe the purpose and what the supplier will provide</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={scopeBrief} onChange={e=>setScopeBrief(e.target.value)} placeholder="Briefly describe the scope..." />
            </CardContent>
          </Card>

          {/* Vendor Evaluation */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Vendor Evaluation</CardTitle>
              <CardDescription>List vendors evaluated and contacts; upload quotes in next step</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea value={vendorEvaluationNotes} onChange={e=>setVendorEvaluationNotes(e.target.value)} placeholder="We have reached out to ... (names, contacts)" />
            </CardContent>
          </Card>
          {/* G1 Decision Gate */}
          {isEvaluating ? (
            <Card className="bg-yellow-50 border-yellow-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="font-medium">Evaluating procurement readiness...</span>
                </div>
              </CardContent>
            </Card>
          ) : cartDecision ? (
            <Card className={`border-2 ${cartDecision.g1Result.passed ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  {cartDecision.g1Result.passed ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-orange-600" />
                  )}
                  Decision Gate G1 - {cartDecision.g1Result.pass ? 'PASSED' : 'REQUIRES RFQ'}
                </CardTitle>
                <CardDescription>
                  {cartDecision.reason}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Readiness Progress */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Readiness</span>
                    <span className="text-sm text-gray-600">{cartDecision.readinessPercentage.toFixed(0)}%</span>
                  </div>
                  <Progress value={cartDecision.readinessPercentage} className="h-2" />
                </div>

                {/* Checklist */}
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Requirements Checklist</h4>
                  {cartDecision.checklist.map((item) => (
                    <div key={item.id} className="flex items-center gap-2 text-sm">
                      {item.status === 'PASS' ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : item.status === 'FAIL' ? (
                        <AlertCircle className="w-4 h-4 text-red-600" />
                      ) : (
                        <Clock className="w-4 h-4 text-yellow-600" />
                      )}
                      <span className={item.status === 'PASS' ? 'text-green-700' : item.status === 'FAIL' ? 'text-red-700' : 'text-yellow-700'}>
                        {item.label}
                      </span>
                      {item.message && (
                        <span className="text-xs text-gray-500 ml-2">({item.message})</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Missing Items */}
                {cartDecision.g1Result.missingItems.length > 0 && (
                  <div className="bg-red-50 p-3 rounded-lg">
                    <h5 className="font-medium text-red-800 text-sm mb-2">Missing Items:</h5>
                    <ul className="text-xs text-red-700 space-y-1">
                      {cartDecision.g1Result.missingItems.map((item, index) => (
                        <li key={index}>• {item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommendations */}
                {cartDecision.g1Result.recommendations.length > 0 && (
                  <div className="bg-blue-50 p-3 rounded-lg">
                    <h5 className="font-medium text-blue-800 text-sm mb-2">Recommendations:</h5>
                    <ul className="text-xs text-blue-700 space-y-1">
                      {cartDecision.g1Result.recommendations.map((rec, index) => (
                        <li key={index}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Required Approvers */}
                {cartDecision.g1Result.requiredApprovers.length > 0 && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <h5 className="font-medium text-gray-800 text-sm mb-2">Required Approvers:</h5>
                    <div className="flex flex-wrap gap-1">
                      {cartDecision.g1Result.requiredApprovers.map((role) => (
                        <Badge key={role} variant="outline" className="text-xs">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : null}

          {/* Path Selection */}
          {cartDecision && !selectedPath && (
            <Card className="border-2 border-blue-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Choose Procurement Path
                </CardTitle>
                <CardDescription>
                  Select how to proceed based on the G1 evaluation
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Path A: Proceed to Approvals */}
                  <Card 
                    className={`cursor-pointer transition-all ${
                      cartDecision.g1Result.passed 
                        ? 'border-green-200 hover:border-green-300 bg-green-50' 
                        : 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                    onClick={() => cartDecision.g1Result.passed && handlePathSelection('APPROVALS')}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Shield className="h-5 w-5 text-green-600" />
                        <h4 className="font-semibold">Path A: Proceed to Approvals</h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Direct procurement approval workflow with {cartDecision.g1Result.requiredApprovers.length} approvers
                      </p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>Complete pricing available</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>All documents ready</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3 text-green-600" />
                          <span>Business rules satisfied</span>
                        </div>
                      </div>
                      {!cartDecision.g1Result.passed && (
                        <div className="mt-2 text-xs text-red-600">
                          Requires G1 pass to proceed
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Path B: Generate RFQs */}
                  <Card 
                    className="cursor-pointer transition-all border-orange-200 hover:border-orange-300 bg-orange-50"
                    onClick={() => handlePathSelection('RFQ')}
                  >
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-5 w-5 text-orange-600" />
                        <h4 className="font-semibold">Path B: Generate RFQs</h4>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Generate and send RFQs to gather missing information or for competitive sourcing
                      </p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-orange-600" />
                          <span>Missing pricing or documents</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-orange-600" />
                          <span>Custom requirements needed</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-orange-600" />
                          <span>Competitive sourcing required</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Processing State */}
          {isProcessing && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 animate-spin" />
                  <span className="font-medium">
                    {selectedPath === 'APPROVALS' ? 'Creating PR and starting approval workflow...' : 'Generating and sending RFQs...'}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Success States */}
          {pr && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h4 className="font-semibold text-green-800">PR Created Successfully</h4>
                </div>
                <p className="text-sm text-green-700">
                  PR #{pr.id} has been created and approval workflow has been initiated.
                </p>
                <div className="mt-2 text-xs text-green-600">
                  Required approvers: {pr.approvals.required.join(', ')}
                </div>
              </CardContent>
            </Card>
          )}

          {rfq && (
            <Card className="bg-orange-50 border-orange-200">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-orange-600" />
                  <h4 className="font-semibold text-orange-800">RFQ Generated and Sent</h4>
                </div>
                <p className="text-sm text-orange-700">
                  RFQ #{rfq.id} has been generated and sent to {rfq.vendors.length} vendors.
                </p>
                <div className="mt-2 text-xs text-orange-600">
                  Due date: {new Date(rfq.dueDate).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Selected Vendors List */}
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Selected Vendors ({selectedVendors.length})</h3>
            
            {selectedVendors.map((vendor, index) => (
              <Card key={vendor.id} className="border-l-4 border-l-blue-500">
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold text-lg">{vendor.name}</h4>
                        {getStatusBadge(rfqStatus[vendor.id] || 'pending')}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                        <div>
                          <span className="font-medium">Product:</span> {vendor.productName}
                        </div>
                        <div>
                          <span className="font-medium">Price:</span> ${vendor.price?.toLocaleString()}
                        </div>
                        <div>
                          <span className="font-medium">Contact:</span> {vendor.contact}
                        </div>
                        <div>
                          <span className="font-medium">Website:</span> 
                          <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline ml-1">
                            Visit Site
                          </a>
                        </div>
                      </div>

                      {/* RFQ Document Info */}
                      {rfqDocuments[vendor.id] && (
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <FileText className="w-4 h-4 text-gray-600" />
                            <span className="font-medium text-sm">RFQ Document</span>
                          </div>
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>RFQ ID: {rfqDocuments[vendor.id].rfqId}</div>
                            <div>Sent: {new Date(rfqDocuments[vendor.id].sentDate).toLocaleDateString()}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 ml-4">
                      {rfqStatus[vendor.id] === 'sent' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateVendorStatus(vendor.id, 'received')}
                          className="text-green-600 border-green-600 hover:bg-green-50"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Mark Received
                        </Button>
                      )}
                      
                      {rfqStatus[vendor.id] === 'received' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateVendorStatus(vendor.id, 'approved')}
                          className="text-blue-600 border-blue-600 hover:bg-blue-50"
                        >
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Approve
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="outline"
                        className="text-gray-600 border-gray-300 hover:bg-gray-50"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            <div className="flex gap-3">
              {Object.keys(rfqStatus).length === 0 && (
                <Button 
                  onClick={generateRFQ}
                  disabled={generatingRFQ}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {generatingRFQ ? (
                    <>
                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                      Generating RFQ...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Generate RFQ Documents
                    </>
                  )}
                </Button>
              )}

              {completionPercentage === 100 && (
                <Button 
                  onClick={() => onNext({ 
                    selectedVendors, 
                    rfqStatus, 
                    rfqDocuments,
                    completionPercentage 
                  })}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Proceed to RFQ Generation
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
