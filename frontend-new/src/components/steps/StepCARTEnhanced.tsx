import { motion, AnimatePresence } from "framer-motion";
import { 
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  Send, 
  CheckCircle, 
  Clock, 
  AlertCircle, 
  Download, 
  Mail, 
  Users, 
  Shield, 
  DollarSign, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  ExternalLink,
  Eye,
  X,
  Plus,
  Edit,
  Save,
  Loader2
} from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Progress } from "../ui/progress";
import { useState, useEffect, useRef } from "react";
import type { Vendor } from "../../types";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, WidthType } from "docx";
import { saveAs } from "file-saver";
import { PostCartApiService } from "../../lib/postCartApi";

// Enhanced vendor evaluation types
interface VendorEvaluation {
  vendorName: string;
  productTitle: string;
  price?: { value: number; currency: string; sourceText?: string };
  availability?: { inStock?: boolean; leadTimeDays?: number; sourceText?: string };
  delivery?: { toLocation?: string; promiseDays?: number; terms?: string; sourceText?: string };
  warranty?: string;
  link: string;
  domain: string;
  contact?: { email?: string; phone?: string; formUrl?: string };
  evidence: Array<{ label: string; snippet: string; xpathOrSelector?: string }>;
  lastCheckedAt: string;
  score: number;
  completeness: {
    hasPrice: boolean;
    hasStockOrLead: boolean;
    hasDeliveryToTarget: boolean;
    hasVendorIdentity: boolean;
    overall: "complete" | "partial" | "missing";
    missingFields: Array<"price"|"availability"|"delivery"|"contact">;
  };
  flags: {
    isOfficialOEM?: boolean;
    isDistributor?: boolean;
    isMarketplace?: boolean;
    possibleMismatch?: boolean;
  };
}

interface StepCARTEnhancedProps {
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
  popStart?: string;
}

export function StepCARTEnhanced({
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
  popStart = "",
}: StepCARTEnhancedProps) {
  
  // Enhanced state management
  const [evaluatedVendors, setEvaluatedVendors] = useState<VendorEvaluation[]>([]);
  const [selectedPath, setSelectedPath] = useState<'rfq' | 'procurement' | null>(null);
  const [pathRecommendation, setPathRecommendation] = useState<'rfq' | 'procurement' | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [showEvidence, setShowEvidence] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [botAnalysis, setBotAnalysis] = useState<any>(null);
  const hasEvaluatedRef = useRef(false);
  
  // RFQ form state
  const [rfqData, setRfqData] = useState({
    title: `${productName} RFQ`,
    quantity: parseInt(quantity) || 1,
    needBy: '',
    dueDate: '',
    notes: ''
  });
  
  // Procurement form state
  const [procData, setProcData] = useState({
    title: `Procurement Request – ${productName}`,
    department: 'IT',
    budgetCode: 'CAP-2025-NET',
    approver: '',
    needBy: popStart, // Initialize with POP Start from Step 1
    justification: projectScope,
    type: procurementType,
    serviceProgram: serviceProgram,
    technicalPOC: technicalPOC,
    projectsSupported: projectKeys.join(', '),
    estimatedCost: parseFloat(budget) || 0,
    competitionType: 'Competitive',
    multipleVendorsAvailable: selectedVendors.length > 1,
    scopeBrief: projectScope,
    vendorEvaluation: [] as Array<{name: string, contact: string, status: string}>,
    vendorEvaluationDescription: ''
  });

  // Evaluate vendors on component mount - only once
  useEffect(() => {
    if (selectedVendors.length > 0 && !hasEvaluatedRef.current) {
      evaluateVendors();
      hasEvaluatedRef.current = true;
    }
  }, [selectedVendors]);

  // Auto-recommend and auto-select path based on vendor completeness and bot analysis
  useEffect(() => {
    if (botAnalysis) {
      // Use bot analysis status for recommendation
      if (botAnalysis.status === 'ready') {
        setPathRecommendation('procurement');
        setSelectedPath('procurement'); // Auto-select procurement when all vendors ready
      } else if (botAnalysis.status === 'partial' && botAnalysis.complete_vendors > 0) {
        setPathRecommendation('procurement'); // Can still proceed with complete vendors
        setSelectedPath('procurement'); // Auto-select procurement when some vendors ready
      } else {
        setPathRecommendation('rfq');
        // Don't auto-select RFQ, let user choose
      }
    } else if (evaluatedVendors.length > 0) {
      // Fallback to heuristic if bot analysis not available
      const hasIncompleteVendors = evaluatedVendors.some(v => v.completeness.overall !== 'complete');
      const recPath = hasIncompleteVendors ? 'rfq' : 'procurement';
      setPathRecommendation(recPath);
      if (!hasIncompleteVendors) {
        setSelectedPath('procurement'); // Auto-select when all complete
      }
    }
  }, [evaluatedVendors, botAnalysis]);

  // Evaluate vendors using LLM-based API
  const evaluateVendors = async () => {
    setIsEvaluating(true);
    
    try {
      console.log("Evaluating vendors with LLM:", selectedVendors.length);
      
      // Call LLM-based vendor evaluation API
      const result = await PostCartApiService.evaluateVendors(
        selectedVendors,
        productName,
        parseFloat(budget) || 0,
        parseInt(quantity) || 1
      );
      
      console.log("Evaluation result:", result);
      
      // Transform LLM results to VendorEvaluation format
      const evaluations: VendorEvaluation[] = result.evaluated_vendors.map((vendor: any, index: number) => {
        const pricing = vendor.pricing || {};
        const availability = vendor.availability || {};
        const delivery = vendor.delivery || {};
        const contact = vendor.contact || {};
        const business = vendor.business_info || {};
        
        // Determine missing fields
        const missingFields: Array<"price"|"availability"|"delivery"|"contact"> = [];
        if (!pricing.unit_price) missingFields.push('price');
        if (!availability.lead_time_days && !availability.in_stock) missingFields.push('availability');
        if (!delivery.ships_to_wichita) missingFields.push('delivery');
        if (!contact.sales_email && !contact.sales_phone) missingFields.push('contact');
        
        const overall = missingFields.length === 0 ? 'complete' : 
                       missingFields.length <= 2 ? 'partial' : 'missing';
        
        // Calculate score based on completeness
        const baseScore = 50;
        const priceScore = pricing.unit_price ? 15 : 0;
        const availabilityScore = (availability.lead_time_days || availability.in_stock) ? 15 : 0;
        const deliveryScore = delivery.ships_to_wichita ? 10 : 0;
        const contactScore = (contact.sales_email || contact.sales_phone) ? 10 : 0;
        const score = baseScore + priceScore + availabilityScore + deliveryScore + contactScore;
        
        return {
          vendorName: vendor.vendor_name || `Vendor ${index + 1}`,
          productTitle: vendor.product_model || productName,
          price: pricing.unit_price ? {
            value: pricing.unit_price,
            currency: pricing.currency || 'USD',
            sourceText: pricing.notes || 'Extracted from vendor page'
          } : undefined,
          availability: availability.lead_time_days || availability.in_stock !== undefined ? {
            inStock: availability.in_stock || false,
            leadTimeDays: availability.lead_time_days,
            sourceText: availability.notes || 'Extracted from vendor page'
          } : undefined,
          delivery: delivery.ships_to_wichita ? {
            toLocation: 'Wichita, KS',
            promiseDays: delivery.delivery_days,
            terms: delivery.shipping_method || delivery.terms,
            sourceText: delivery.shipping_method || 'Extracted from vendor page'
          } : undefined,
          warranty: business.warranty || 'Unknown',
          link: contact.contact_url || selectedVendors[index]?.purchase_url || '#',
          domain: new URL(contact.contact_url || selectedVendors[index]?.purchase_url || 'https://vendor.com').hostname.replace('www.', ''),
          contact: (contact.sales_email || contact.sales_phone) ? {
            email: contact.sales_email,
            phone: contact.sales_phone,
            formUrl: contact.contact_url
          } : undefined,
          evidence: [
            { 
              label: 'Price', 
              snippet: pricing.unit_price 
                ? `$${typeof pricing.unit_price === 'number' ? pricing.unit_price.toFixed(2) : pricing.unit_price}` 
                : 'Not found' 
            },
            { 
              label: 'Stock', 
              snippet: availability.in_stock 
                ? 'In stock' 
                : availability.notes || availability.lead_time_days 
                  ? `${availability.lead_time_days} days` 
                  : 'Unknown' 
            },
            { label: 'Delivery', snippet: delivery.ships_to_wichita ? `Ships to Wichita in ${delivery.delivery_days || 'N/A'} days` : 'Not confirmed' },
            { label: 'Contact', snippet: contact.sales_email || contact.sales_phone || 'Missing' }
          ],
          lastCheckedAt: new Date().toISOString(),
          score,
          completeness: {
            hasPrice: !!pricing.unit_price,
            hasStockOrLead: !!(availability.lead_time_days || availability.in_stock !== undefined),
            hasDeliveryToTarget: !!delivery.ships_to_wichita,
            hasVendorIdentity: true,
            overall,
            missingFields
          },
          flags: {
            isOfficialOEM: vendor.quality_indicators?.is_oem || false,
            isDistributor: vendor.quality_indicators?.is_distributor || false,
            isMarketplace: false,
            possibleMismatch: false
          }
        };
      });
      
      setEvaluatedVendors(evaluations);
      
      // Store evaluation description for procurement doc
      if (result.evaluation_description) {
        setProcData(prev => ({
          ...prev,
          vendorEvaluationDescription: result.evaluation_description
        }));
      }
      
      // Store bot analysis if available
      if (result.analysis) {
        setBotAnalysis(result.analysis);
        console.log("Bot analysis:", result.analysis);
      }
      
      console.log("Vendor evaluation complete:", evaluations.length);
      
    } catch (error) {
      console.error('Error evaluating vendors:', error);
      alert('Failed to evaluate vendors. Please try again.');
    } finally {
      setIsEvaluating(false);
    }
  };

  // Generate RFQ email template
  const generateRFQEmail = () => {
    const vendor = evaluatedVendors[0];
    const subject = `RFQ: ${productName} — Qty ${rfqData.quantity} — ${rfqData.needBy}`;
    const body = `Hello ${vendor?.vendorName || 'Vendor'},

We would like a formal quote for:
• Product: ${productName}
• Quantity: ${rfqData.quantity}
• Delivery: to Wichita, KS by ${rfqData.needBy}
• Requirements: ${projectScope}
• Warranty/Support: please specify
• Validity: 30 days preferred

Please include:
• Unit price and extended total (USD)
• Availability or lead time
• Taxes, shipping, and any fees
• Payment terms and return policy
• Point of contact for fulfillment

${rfqData.notes ? `Notes: ${rfqData.notes}` : ''}

Kindly respond by ${rfqData.dueDate}. Thank you!

Best regards,
${technicalPOC || 'Procurement Team'}`;

    return { subject, body };
  };

  // Generate procurement document data
  const generateProcurementDoc = () => {
    return {
      title: procData.title,
      department: procData.department,
      budgetCode: procData.budgetCode,
      approver: procData.approver,
      needBy: procData.needBy,
      justification: procData.justification,
      type: procData.type,
      serviceProgram: procData.serviceProgram,
      projectsSupported: procData.projectsSupported,
      estimatedCost: procData.estimatedCost,
      competitionType: procData.competitionType,
      multipleVendorsAvailable: procData.multipleVendorsAvailable,
      scopeBrief: procData.scopeBrief,
      vendorEvaluation: evaluatedVendors.map(v => ({
        name: v.vendorName,
        contact: v.contact?.email || 'Contact info missing',
        status: v.completeness.overall === 'complete' ? 'Quote available' : 'Quote requested'
      }))
    };
  };

  // Generate HTML preview of procurement document
  const generateProcurementPreview = (): string => {
    const procDoc = generateProcurementDoc();
    const popEnd = procData.needBy ? new Date(new Date(procData.needBy).getTime() + 365*24*60*60*1000).toISOString().split('T')[0] : 'TBD';
    const vendorEvalDesc = procData.vendorEvaluationDescription || evaluatedVendors.map((v, idx) => 
      `${idx + 1}. ${v.vendorName}. ${v.contact?.email ? 'Contact: ' + v.contact.email : 'Contact info to be added'}. ${v.completeness.overall === 'complete' ? 'Quote available.' : 'Quote requested.'}`
    ).join('\n\n');
    const techPOC = procData.technicalPOC || technicalPOC;
    
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Procurement Document Preview</title>
  <style>
    body { 
      font-family: 'Segoe UI', Arial, sans-serif; 
      color: #333; 
      max-width: 960px; 
      margin: 0 auto; 
      padding: 24px; 
      line-height: 1.6;
    }
    h1 { 
      font-size: 32px; 
      margin: 0 0 16px;
      color: #0066cc;
      font-weight: 600;
      border-bottom: 3px solid #0066cc;
      padding-bottom: 12px;
      text-align: center;
    }
    h2 { 
      font-size: 22px; 
      margin: 32px 0 16px;
      color: #0066cc; 
      font-weight: 600;
      border-bottom: 2px solid #e0e0e0;
      padding-bottom: 8px;
    }
    .field-group {
      margin: 16px 0;
      padding: 12px;
      background: #fafafa;
      border-radius: 4px;
      border-left: 3px solid #0066cc;
    }
    .field-label {
      font-weight: 600;
      color: #0066cc;
      font-size: 14px;
      display: block;
      margin-bottom: 6px;
    }
    .field-value {
      color: #333;
      font-size: 15px;
      margin-left: 0;
    }
    .field-hint {
      font-size: 12px;
      color: #888;
      font-style: italic;
      margin-top: 4px;
    }
    .section-description {
      font-size: 13px;
      color: #666;
      margin-bottom: 12px;
      padding: 8px 12px;
      background: #f0f0f0;
      border-radius: 4px;
      border-left: 3px solid #888;
    }
    .info-box {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 16px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-box strong {
      display: block;
      margin-bottom: 8px;
      color: #1976d2;
    }
    ul, ol {
      margin: 12px 0;
      padding-left: 28px;
    }
    li {
      margin: 8px 0;
      line-height: 1.8;
    }
    .editable {
      position: relative;
      border: 1px solid #ddd;
      padding: 12px;
      border-radius: 4px;
      min-height: 60px;
    }
    .copy-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: #0066cc;
      color: white;
      border: none;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
    }
    .copy-btn:hover {
      background: #0052a3;
    }
  </style>
</head>
<body>
  <h1>Procurements & Role Players</h1>
  
  <h2>What kind of procurement do you need?*</h2>
  <div class="field-group">
    <span class="field-value">Contract, Subcontract, Purchase Order, Credit Card Auth</span>
  </div>
  <div class="field-group">
    <span class="field-label">Selected:</span>
    <span class="field-value">${procDoc.type}</span>
  </div>

  <h2>General Information</h2>
  
  <div class="field-group">
    <span class="field-label">Service Program*</span>
    <span class="field-value">${procDoc.serviceProgram}</span>
  </div>

  <div class="field-group">
    <span class="field-label">KMI Technical POC*</span>
    <span class="field-value">${techPOC || 'To be assigned'}</span>
  </div>

  <div class="field-group">
    <span class="field-label">Estimated Costs*</span>
    <span class="field-value">$${procDoc.estimatedCost.toLocaleString()}</span>
  </div>

  <div class="field-group">
    <span class="field-label">POP Start Required</span>
    <span class="field-value">${procData.needBy || 'N/A'}</span>
  </div>

  <div class="field-group">
    <span class="field-label">KMI Project(s) Supported*</span>
    <span class="field-value">${procDoc.projectsSupported}</span>
    <div class="field-hint">Use N/A if Not Applicable</div>
  </div>

  <div class="field-group">
    <span class="field-label">POP Completion Date</span>
    <span class="field-value">${popEnd}</span>
  </div>

  <h2>Suggested Procurement Type*</h2>
  <div class="field-group">
    <span class="field-label">Suggested Procurement Type:</span>
    <span class="field-value">${procDoc.type}</span>
    <div class="field-hint">Note - Final Procurement Type Determined by Administration</div>
  </div>

  <h2>Procurement Instrument Definitions</h2>
  <div class="info-box">
    <strong>Contract:</strong> A formal, legally binding agreement between a buyer and a vendor that outlines detailed terms, deliverables, timelines, and responsibilities for complex or high-value goods or services.
    <br><br>
    <strong>Purchase Order:</strong> A simplified procurement instrument used to authorize a vendor to provide goods or services.
    <br><br>
    <strong>Credit Card:</strong> A direct purchasing method using an organizational credit card to quickly acquire goods or services without formal contracts or purchase orders.
    <br><br>
    <strong>Corporate Account Order:</strong> A procurement made through a vendor with whom Knowmadics has an established account or purchasing relationship (i.e. Verizon Wireless).
  </div>

  <h2>Scope Brief*</h2>
  <div class="section-description">Please briefly describe the purpose of the procurement and what the supplier will provide.</div>
  <div class="editable">
    <button class="copy-btn" onclick="copyToClipboard('scope-brief')">Copy</button>
    <div id="scope-brief" style="white-space: pre-wrap; padding-right: 80px;">${procDoc.scopeBrief}</div>
  </div>

  <h2>Competition Type*</h2>
  <div class="field-group">
    <span class="field-label">Competition Type:</span>
    <span class="field-value">${procDoc.competitionType}</span>
  </div>

  ${procDoc.competitionType === 'Competitive' ? `
  <div class="info-box">
    <strong>Competitive Procurement:</strong> A Competitive Procurement is a purchasing process in which multiple vendors have been evaluated on criteria such as price, quality, delivery time, and vendor capability.
  </div>
  ` : ''}

  <div class="field-group">
    <span class="field-label">Multiple Vendors Available?</span>
    <span class="field-value">${procDoc.multipleVendorsAvailable ? 'Yes' : 'No'}</span>
  </div>

  <h2>Describe Vendor Evaluation*</h2>
  <div class="section-description">Please include vendor name and contact information of all vendors evaluated.</div>
  <div class="editable">
    <button class="copy-btn" onclick="copyToClipboard('vendor-eval-desc')">Copy</button>
    <div id="vendor-eval-desc" style="white-space: pre-wrap; padding-right: 80px;">${vendorEvalDesc}</div>
  </div>

  <h2>Evaluation Documentation (if any)</h2>
  <div class="field-group">
    <span class="field-value">No attachments</span>
  </div>

  <script>
    function copyToClipboard(elementId) {
      const element = document.getElementById(elementId);
      const text = element.innerText;
      
      navigator.clipboard.writeText(text).then(function() {
        const btn = event.target;
        const originalText = btn.innerText;
        btn.innerText = 'Copied!';
        btn.style.background = '#28a745';
        
        setTimeout(function() {
          btn.innerText = originalText;
          btn.style.background = '#0066cc';
        }, 2000);
      }).catch(function(err) {
        alert('Failed to copy text: ' + err);
      });
    }
  </script>
</body>
</html>`;
  };

  // Show preview modal
  const handlePreview = () => {
    const html = generateProcurementPreview();
    setPreviewHtml(html);
    setShowPreview(true);
  };

  // Generate DOCX document
  const generateDocx = async (content: Paragraph[], filename: string) => {
    const doc = new Document({
      sections: [{
        children: content
      }]
    });
    
    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
  };

  // Generate and download RFQ document as DOCX
  const generateAndDownloadRFQ = async () => {
    const rfqEmail = generateRFQEmail();
    
    const content: Paragraph[] = [
      new Paragraph({
        text: "RFQ Document",
        heading: HeadingLevel.HEADING_1,
      }),
      new Paragraph({
        text: rfqData.title,
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Generated: ", bold: true }),
          new TextRun({ text: new Date().toLocaleDateString() }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Quantity: ", bold: true }),
          new TextRun({ text: rfqData.quantity.toString() }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Need By: ", bold: true }),
          new TextRun({ text: rfqData.needBy }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Email Details",
        heading: HeadingLevel.HEADING_3,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "To: ", bold: true }),
          new TextRun({ text: evaluatedVendors[0]?.vendorName || 'Vendor' }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Subject: ", bold: true }),
          new TextRun({ text: rfqEmail.subject }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: rfqEmail.body }),
      new Paragraph({ text: "" }),
      new Paragraph({ text: "---" }),
      new Paragraph({
        text: "Vendor Information",
        heading: HeadingLevel.HEADING_3,
      }),
      ...evaluatedVendors.map(v => 
        new Paragraph({
          text: `- ${v.vendorName}: ${v.price ? '$' + v.price.value : 'Price TBD'}`,
        })
      ),
    ];
    
    await generateDocx(content, `RFQ_${productName.replace(/\s+/g, '_')}_${Date.now()}.docx`);
  };

  // Generate and download Procurement document as DOCX
  const generateAndDownloadProcurement = async () => {
    const procDoc = generateProcurementDoc();
    const popEnd = procData.needBy ? new Date(new Date(procData.needBy).getTime() + 365*24*60*60*1000).toISOString().split('T')[0] : 'TBD';
    
    const content: Paragraph[] = [
      new Paragraph({
        text: "Procurements & Role Players",
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "What kind of procurement do you need?*",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: procDoc.type }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "General Information",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Service Program*", bold: true }),
          new TextRun({ text: "\n" + (procDoc.serviceProgram || 'Applied Research') }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "KMI Technical POC*", bold: true }),
          new TextRun({ text: "\n" + (technicalPOC || 'To be assigned') }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Estimated Costs*", bold: true }),
          new TextRun({ text: "\n$" + procDoc.estimatedCost.toLocaleString() }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "POP Start", bold: true }),
          new TextRun({ text: "\n" + (procData.needBy || 'Required') }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "KMI Project(s) Supported*", bold: true }),
          new TextRun({ text: "\n" + (procDoc.projectsSupported || 'Use N/A if Not Applicable') }),
        ],
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "POP Completion Date", bold: true }),
          new TextRun({ text: "\n" + popEnd }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Suggested Procurement Type*",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: "Note - Final Procurement Type Determined by Administration" }),
      new Paragraph({ text: procDoc.type }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Procurement Instrument Definitions",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: "Contract: A formal, legally binding agreement between a buyer and a vendor that outlines detailed terms, deliverables, timelines, and responsibilities for complex or high-value goods or services." }),
      new Paragraph({ text: "Purchase Order: A simplified procurement instrument used to authorize a vendor to provide goods or services." }),
      new Paragraph({ text: "Credit Card: A direct purchasing method using an organizational credit card to quickly acquire goods or services without formal contracts or purchase orders." }),
      new Paragraph({ text: "Corporate Account Order: A procurement made through a vendor with whom Knowmadics has an established account or purchasing relationship (i.e. Verizon Wireless)." }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Scope Brief*",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: "Please briefly describe the purpose of the procurement and what the supplier will provide." }),
      new Paragraph({ text: procDoc.scopeBrief }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Competition Type*",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: procDoc.competitionType }),
      new Paragraph({ 
        text: procDoc.competitionType === 'Competitive' 
          ? "A Competitive Procurement is a purchasing process in which multiple vendors have been evaluated on criteria such as price, quality, delivery time, and vendor capability."
          : `This procurement is being handled as a ${procDoc.competitionType} process.`
      }),
      new Paragraph({
        children: [
          new TextRun({ text: "Multiple Vendors Available?", bold: true }),
          new TextRun({ text: "\n" + (procDoc.multipleVendorsAvailable ? 'Yes' : 'No') }),
        ],
      }),
      new Paragraph({ text: "" }),
      new Paragraph({
        text: "Describe Vendor Evaluation*",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({ text: "Please include vendor name and contact information of all vendors evaluated." }),
      ...(procData.vendorEvaluationDescription || evaluatedVendors.map((v, idx) => 
        `${idx + 1}. ${v.vendorName}. ${v.contact?.email ? 'Contact: ' + v.contact.email : 'Contact info to be added'}. ${v.completeness.overall === 'complete' ? 'Quote available.' : 'Quote requested.'}`
      )).split('\n\n').map(text => new Paragraph({ text }))
    ];
    
    await generateDocx(content, `Procurement_${productName.replace(/\s+/g, '_')}_${Date.now()}.docx`);
  };

  // Get procurement type explanation
  const getProcurementTypeExplanation = (type: string): string => {
    const explanations: Record<string, string> = {
      'Contract': "Contract: A formal, legally binding agreement between a buyer and a vendor that outlines detailed terms, deliverables, timelines, and responsibilities for complex or high-value goods or services.",
      'Purchase Order': "Purchase Order: A simplified procurement instrument used to authorize a vendor to provide goods or services.",
      'Credit Card': "Credit Card: A direct purchasing method using an organizational credit card to quickly acquire goods or services without formal contracts or purchase orders.",
      'Corporate Account Order': "Corporate Account Order: A procurement made through a vendor with whom Knowmadics has an established account or purchasing relationship (i.e. Verizon Wireless)."
    };
    return explanations[type] || `Procurement Type: ${type}`;
  };

  // Bot validation for missing critical information
  const getProcurementReadiness = () => {
    // Use bot analysis if available (more accurate)
    if (botAnalysis) {
      // Check if we have any complete vendors ready to proceed
      const isReady = botAnalysis.status === 'ready' || (botAnalysis.complete_vendors > 0 && botAnalysis.status === 'partial');
      return {
        missingPrices: botAnalysis.incomplete_vendors || 0,
        missingContacts: 0, // Bot analysis doesn't track this separately
        incompleteVendors: botAnalysis.incomplete_vendors || 0,
        isReady: isReady,
        warnings: []
      };
    }
    
    // Fallback to heuristic if bot analysis not available
    const missingPrices = evaluatedVendors.filter(v => !v.price).length;
    const missingContacts = evaluatedVendors.filter(v => !v.contact || (!v.contact.email && !v.contact.phone)).length;
    const incompleteVendors = evaluatedVendors.filter(v => v.completeness.overall !== 'complete').length;
    
    return {
      missingPrices,
      missingContacts,
      incompleteVendors,
      isReady: missingPrices === 0 && missingContacts === 0,
      warnings: []
    };
  };

  // Handle form submission with bot validation
  const handleSubmit = async () => {
    console.log('handleSubmit called:', { selectedPath, procData });
    
    if (selectedPath === 'rfq') {
      await generateAndDownloadRFQ();
      setDownloadSuccess('RFQ document downloaded successfully!');
      setTimeout(() => setDownloadSuccess(null), 5000);
      // Still call onNext for flow continuation
      const rfqEmail = generateRFQEmail();
      onNext({
        type: 'rfq',
        selectedVendors: selectedVendors, // Include selectedVendors for validation
        data: {
          ...rfqData,
          email: rfqEmail,
          vendors: evaluatedVendors
        }
      });
    } else if (selectedPath === 'procurement') {
      // Bot validation before allowing procurement
      const readiness = getProcurementReadiness();
      
      if (!readiness.isReady) {
        const issues = [];
        if (readiness.missingPrices > 0) {
          issues.push(`❌ ${readiness.missingPrices} vendor(s) missing price information`);
        }
        if (readiness.missingContacts > 0) {
          issues.push(`❌ ${readiness.missingContacts} vendor(s) missing contact information`);
        }
        
        const message = `⚠️ Procurement Blocked: Missing Critical Information\n\n${issues.join('\n')}\n\n⚠️ You must generate RFQs first to obtain complete vendor information before submitting for procurement approval.`;
        alert(message);
        return;
      }
      
      // Show preview first before downloading
      handlePreview();
    } else {
      console.error('No path selected!');
    }
  };

  // Separate function for confirmed download
  const handleConfirmedDownload = async () => {
    if (selectedPath === 'procurement') {
      await generateAndDownloadProcurement();
      setDownloadSuccess('Procurement document downloaded successfully!');
      setTimeout(() => setDownloadSuccess(null), 5000);
      // Still call onNext for flow continuation
      const procDoc = generateProcurementDoc();
      onNext({
        type: 'procurement',
        selectedVendors: selectedVendors, // Include selectedVendors for validation
        data: {
          ...procDoc,
          vendors: evaluatedVendors
        }
      });
    }
  };

  // Validation
  const isRFQValid = rfqData.title.trim() && rfqData.quantity > 0 && rfqData.needBy;
  const readiness = getProcurementReadiness();
  const isProcValid = procData.needBy.trim() && procData.estimatedCost > 0 && readiness.isReady;
  
  console.log('Validation:', { 
    isRFQValid, 
    isProcValid, 
    selectedPath, 
    procDataNeedBy: procData.needBy,
    procDataEstimatedCost: procData.estimatedCost,
    readinessReady: readiness.isReady
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CART - Vendor Evaluation & Output</h1>
            <p className="text-muted-foreground">Evaluate selected vendors and choose your output path</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onBack}>
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>
        </div>

        {/* Download Success Message */}
        {downloadSuccess && (
          <Card className="border-green-500 bg-green-500/10">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-medium">{downloadSuccess}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Vendor Evaluation Section */}
        <Card className="border-blue-500/30 bg-blue-500/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Vendor Evaluation Results
            </CardTitle>
            <CardDescription>
              {isEvaluating ? 'Evaluating vendor information...' : `Evaluated ${evaluatedVendors.length} vendors`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isEvaluating ? (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Analyzing vendor data and completeness...</span>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Bot Analysis & Recommendations */}
                {botAnalysis && (
                  <div className={`rounded-lg border-2 p-4 ${
                    botAnalysis.status === 'ready' ? 'border-green-500 bg-green-50' : 
                    botAnalysis.status === 'partial' ? 'border-orange-500 bg-orange-50' : 
                    'border-yellow-500 bg-yellow-50'
                  }`}>
                    <div className="flex items-center gap-2 mb-3">
                      {botAnalysis.status === 'ready' ? (
                        <>
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                          <h3 className="font-bold text-green-800">Ready for Procurement</h3>
                        </>
                      ) : botAnalysis.status === 'partial' ? (
                        <>
                          <AlertTriangle className="h-5 w-5 text-orange-600" />
                          <h3 className="font-bold text-orange-800">Partially Ready</h3>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-5 w-5 text-yellow-600" />
                          <h3 className="font-bold text-yellow-800">RFQ Required</h3>
                        </>
                      )}
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-white rounded p-3">
                        <p className="text-sm font-semibold mb-1">Bot Analysis:</p>
                        <p className="text-sm">{botAnalysis.recommendation}</p>
                      </div>
                      
                      {botAnalysis.complete_vendors !== undefined && (
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span>{botAnalysis.complete_vendors} complete vendor(s) ready</span>
                          {botAnalysis.incomplete_vendors > 0 && (
                            <>
                              <AlertTriangle className="h-4 w-4 text-orange-600" />
                              <span>{botAnalysis.incomplete_vendors} incomplete vendor(s)</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {botAnalysis.documents && botAnalysis.documents.rfq_draft && (
                        <div className="bg-white rounded-lg border p-3">
                          <p className="text-sm font-semibold mb-2">Auto-Generated RFQ Draft:</p>
                          <pre className="text-xs bg-gray-50 p-2 rounded whitespace-pre-wrap overflow-x-auto">
                            {botAnalysis.documents.rfq_draft}
                          </pre>
                        </div>
                      )}
                      
                      {botAnalysis.bot_check && botAnalysis.bot_check.block_next_step && (
                        <div className="bg-red-100 border border-red-300 rounded p-3">
                          <p className="text-sm font-semibold text-red-800">
                            ⚠️ Cannot proceed: {botAnalysis.bot_check.block_reason}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {evaluatedVendors.map((vendor, index) => (
                  <Card key={index} className="border shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h3 className="font-semibold">{vendor.vendorName}</h3>
                            <Badge variant={vendor.completeness.overall === 'complete' ? 'default' : 
                                         vendor.completeness.overall === 'partial' ? 'secondary' : 'destructive'}>
                              {vendor.completeness.overall}
                            </Badge>
                            <Badge variant="outline">Score: {vendor.score}</Badge>
                          </div>
                          
                          {/* Quality indicators */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                            <div className="flex items-center gap-2">
                              {vendor.completeness.hasPrice ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm">Price</span>
                              {vendor.price && (
                                <span className="text-xs text-muted-foreground">
                                  ${vendor.price.value.toLocaleString()}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {vendor.completeness.hasStockOrLead ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm">Availability</span>
                              {vendor.availability && (
                                <span className="text-xs text-muted-foreground">
                                  {vendor.availability.inStock ? 'In stock' : `${vendor.availability.leadTimeDays}d lead`}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {vendor.completeness.hasDeliveryToTarget ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm">Delivery</span>
                              {vendor.delivery && (
                                <span className="text-xs text-muted-foreground">
                                  ≤{vendor.delivery.promiseDays}d to {vendor.delivery.toLocation}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2">
                              {vendor.completeness.hasVendorIdentity ? (
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm">Contact</span>
                              {vendor.contact && (
                                <span className="text-xs text-muted-foreground">
                                  {vendor.contact.email}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Missing fields */}
                          {vendor.completeness.missingFields.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-3">
                              {vendor.completeness.missingFields.map(field => (
                                <Badge key={field} variant="destructive" className="text-xs">
                                  Missing {field}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => setShowEvidence(showEvidence === vendor.vendorName ? null : vendor.vendorName)}>
                              <Eye className="h-4 w-4 mr-1" />
                              View Evidence
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={vendor.link} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-1" />
                                Visit Site
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Evidence panel */}
                      <AnimatePresence>
                        {showEvidence === vendor.vendorName && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 p-3 bg-muted/50 rounded-lg"
                          >
                            <h4 className="font-medium mb-2">Evidence & Sources</h4>
                            <div className="space-y-2">
                              {vendor.evidence.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center text-sm">
                                  <span className="font-medium">{item.label}:</span>
                                  <span className="text-muted-foreground">{item.snippet}</span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Path Selection */}
        {!isEvaluating && evaluatedVendors.length > 0 && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Choose Output Path
              </CardTitle>
              <CardDescription>
                {pathRecommendation === 'rfq' 
                  ? 'Some vendors are missing critical information. We recommend generating RFQs to gather complete details.'
                  : 'All vendors have complete information. You can proceed directly to procurement approval.'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card 
                  className={`cursor-pointer transition-all ${
                    selectedPath === 'rfq' ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-blue-300'
                  }`}
                  onClick={() => setSelectedPath('rfq')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Send className="h-5 w-5 text-blue-500" />
                      <h3 className="font-semibold">Generate RFQ</h3>
                      {pathRecommendation === 'rfq' && (
                        <Badge variant="default">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Send formal quote requests to vendors for missing information
                    </p>
                  </CardContent>
                </Card>
                
                <Card 
                  className={`cursor-pointer transition-all ${
                    selectedPath === 'procurement' ? 'border-green-500 bg-green-500/10' : 'border-border hover:border-green-300'
                  }`}
                  onClick={() => setSelectedPath('procurement')}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <FileText className="h-5 w-5 text-green-500" />
                      <h3 className="font-semibold">Procurement Document</h3>
                      {pathRecommendation === 'procurement' && (
                        <Badge variant="default">Recommended</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Create internal procurement approval document
                    </p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>
        )}

        {/* RFQ Form */}
        {selectedPath === 'rfq' && (
          <Card className="border-blue-500/30 bg-blue-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                RFQ Generation
              </CardTitle>
              <CardDescription>Fill in the details for your RFQ request</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">RFQ Title</label>
                  <Input
                    value={rfqData.title}
                    onChange={(e) => setRfqData({...rfqData, title: e.target.value})}
                    placeholder="Network Switch RFQ"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Quantity</label>
                  <Input
                    type="number"
                    value={rfqData.quantity}
                    onChange={(e) => setRfqData({...rfqData, quantity: parseInt(e.target.value) || 1})}
                    min="1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Need By</label>
                  <Input
                    type="date"
                    value={rfqData.needBy}
                    onChange={(e) => setRfqData({...rfqData, needBy: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Due Date for Responses</label>
                  <Input
                    type="date"
                    value={rfqData.dueDate}
                    onChange={(e) => setRfqData({...rfqData, dueDate: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Additional Notes</label>
                <Textarea
                  value={rfqData.notes}
                  onChange={(e) => setRfqData({...rfqData, notes: e.target.value})}
                  placeholder="Any specific requirements or notes..."
                  rows={3}
                />
              </div>
              
              {/* RFQ Preview */}
              <Card className="border-muted">
                <CardHeader>
                  <CardTitle className="text-sm">RFQ Email Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div><strong>Subject:</strong> {generateRFQEmail().subject}</div>
                    <div><strong>To:</strong> {evaluatedVendors[0]?.contact?.email || 'vendor@example.com'}</div>
                    <div className="mt-2">
                      <strong>Body:</strong>
                      <pre className="mt-1 p-2 bg-muted rounded text-xs whitespace-pre-wrap">
                        {generateRFQEmail().body}
                      </pre>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        )}

        {/* Procurement Form */}
        {selectedPath === 'procurement' && (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Procurement Document
              </CardTitle>
              <CardDescription>Fill in the details for your procurement approval</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* What kind of procurement do you need? */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">What kind of procurement do you need?*</h3>
                <p className="text-sm text-muted-foreground mb-2">Contract, Subcontract, Purchase Order, Credit Card Auth</p>
                <p className="text-sm font-medium">Selected: {procData.type}</p>
              </div>

              {/* General Information */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-3">General Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Service Program <span className="text-red-500">*</span></label>
                    <Input value={serviceProgram} disabled={true} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">KMI Technical POC <span className="text-red-500">*</span></label>
                    <Input value={procData.technicalPOC || technicalPOC || 'To be assigned'} disabled={true} />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Estimated Costs <span className="text-red-500">*</span></label>
                    <Input
                      type="number"
                      value={procData.estimatedCost}
                      onChange={(e) => setProcData({...procData, estimatedCost: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Need By (POP Start) <span className="text-red-500">*</span></label>
                    <Input
                      type="date"
                      value={procData.needBy}
                      onChange={(e) => setProcData({...procData, needBy: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">KMI Project(s) Supported <span className="text-red-500">*</span></label>
                    <Input
                      value={procData.projectsSupported}
                      onChange={(e) => setProcData({...procData, projectsSupported: e.target.value})}
                      placeholder="e.g., KMI-355, BAILIWICK-AISN"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">POP Completion Date</label>
                    <Input
                      type="date"
                      value={procData.needBy ? new Date(new Date(procData.needBy).getTime() + 365*24*60*60*1000).toISOString().split('T')[0] : ''}
                      disabled={true}
                    />
                  </div>
                </div>
              </div>

              {/* Suggested Procurement Type */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Suggested Procurement Type*</h3>
                <p className="text-xs text-muted-foreground mb-2">Note - Final Procurement Type Determined by Administration</p>
                <p className="text-sm font-medium">{procData.type}</p>
              </div>

              {/* Procurement Instrument Definitions */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Procurement Instrument Definitions</h3>
                <div className="bg-muted p-3 rounded text-sm space-y-2">
                  <p><strong>Contract:</strong> A formal, legally binding agreement between a buyer and a vendor that outlines detailed terms, deliverables, timelines, and responsibilities for complex or high-value goods or services.</p>
                  <p><strong>Purchase Order:</strong> A simplified procurement instrument used to authorize a vendor to provide goods or services.</p>
                  <p><strong>Credit Card:</strong> A direct purchasing method using an organizational credit card to quickly acquire goods or services without formal contracts or purchase orders.</p>
                  <p><strong>Corporate Account Order:</strong> A procurement made through a vendor with whom Knowmadics has an established account or purchasing relationship (i.e. Verizon Wireless).</p>
                </div>
              </div>

              {/* Justification */}
              <div className="border-b pb-4 mb-4">
                <label className="text-sm font-medium">Justification</label>
                <Textarea
                  value={procData.justification}
                  onChange={(e) => setProcData({...procData, justification: e.target.value})}
                  placeholder="Explain why this procurement is needed..."
                  rows={3}
                />
              </div>

              {/* Scope Brief */}
              <div className="border-b pb-4 mb-4">
                <label className="text-sm font-medium">Scope Brief <span className="text-red-500">*</span></label>
                <p className="text-xs text-muted-foreground mb-2">Please briefly describe the purpose of the procurement and what the supplier will provide.</p>
                <Textarea
                  value={procData.scopeBrief}
                  onChange={(e) => setProcData({...procData, scopeBrief: e.target.value})}
                  placeholder="Describe the scope and deliverables..."
                  rows={4}
                />
              </div>

              {/* Competition Type */}
              <div className="border-b pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Competition Type*</h3>
                <div className="mb-2">
                  <label className="text-sm font-medium">Competition Type:</label>
                  <p className="text-sm font-medium">{procData.competitionType}</p>
                </div>
                {procData.competitionType === 'Competitive' && (
                  <div className="bg-muted p-3 rounded text-sm">
                    <strong>Competitive Procurement:</strong> A Competitive Procurement is a purchasing process in which multiple vendors have been evaluated on criteria such as price, quality, delivery time, and vendor capability.
                  </div>
                )}
                <div className="mt-2">
                  <label className="text-sm font-medium">Multiple Vendors Available?</label>
                  <p className="text-sm font-medium">{procData.multipleVendorsAvailable ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {/* Vendor Evaluation */}
              <div className="pb-4 mb-4">
                <h3 className="text-lg font-semibold mb-2">Describe Vendor Evaluation*</h3>
                <p className="text-xs text-muted-foreground mb-2">Please include vendor name and contact information of all vendors evaluated.</p>
                <Textarea
                  value={procData.vendorEvaluationDescription}
                  onChange={(e) => setProcData({...procData, vendorEvaluationDescription: e.target.value})}
                  placeholder="Describe vendor evaluation details..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        {selectedPath && (
          <Card className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={onBack}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                
                <div className="flex gap-2">
                  {selectedPath === 'procurement' && (
                    <Button 
                      variant="outline"
                      onClick={handlePreview}
                      disabled={!isProcValid}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      Preview
                    </Button>
                  )}
                  <Button 
                    onClick={handleSubmit}
                    disabled={
                      (selectedPath === 'rfq' && !isRFQValid) ||
                      (selectedPath === 'procurement' && !isProcValid)
                    }
                    className="gap-2"
                  >
                    {selectedPath === 'rfq' ? (
                      <>
                        <Send className="h-4 w-4" />
                        Generate RFQ
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Create Procurement Doc
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview Modal */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => setShowPreview(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full h-full max-w-6xl max-h-[90vh] m-8 bg-white dark:bg-gray-900 rounded-lg shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-xl font-semibold">Procurement Document Preview</h3>
                <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              
              <div className="flex-1 overflow-auto p-6">
                <iframe
                  srcDoc={previewHtml}
                  className="w-full h-full min-h-[600px] border rounded"
                  title="Procurement Document Preview"
                />
              </div>
              
              <div className="flex items-center justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowPreview(false)}>
                  Close
                </Button>
                <Button 
                  onClick={async () => {
                    setShowPreview(false);
                    await handleConfirmedDownload();
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Confirm & Download
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
