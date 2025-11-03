import { API_BASE } from './api';
import type { 
  PR, 
  RFQ, 
  CartDecision, 
  G1Context, 
  LineItem, 
  VendorRef, 
  DocRef,
  ApprovalRoute,
  VendorRFQ,
  ComparisonSheet
} from '../types';

/**
 * Post-Cart Phase API Service
 * Handles PR creation, RFQ management, and approval workflows
 */

export class PostCartApiService {
  /**
   * Evaluate G1 decision gate
   */
  static async evaluateG1(context: G1Context): Promise<CartDecision> {
    const response = await fetch(`${API_BASE}/api/post-cart/g1-evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context)
    });

    if (!response.ok) {
      throw new Error(`G1 evaluation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Create PR (Path A - Direct Procurement Approvals)
   */
  static async createPR(prData: {
    projectKeys: string[];
    spendType: 'Direct' | 'Indirect';
    budgeted: boolean;
    estimatedCost: number;
    competitive: boolean;
    vendor: VendorRef;
    lineItems: LineItem[];
    documents: DocRef[];
    justification?: {
      type: 'SSJ' | 'Budgeted' | 'Technical' | 'Other';
      text?: string;
      amount?: number;
    };
  }): Promise<PR> {
    const response = await fetch(`${API_BASE}/api/post-cart/pr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prData)
    });

    if (!response.ok) {
      throw new Error(`PR creation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Start approval routing
   */
  static async startApprovalRouting(prId: string, approvalRoute: ApprovalRoute): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/approvals/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prId, approvalRoute })
    });

    if (!response.ok) {
      throw new Error(`Approval routing failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Submit approval action
   */
  static async submitApprovalAction(
    prId: string, 
    role: string, 
    action: 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES',
    comment?: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/approvals/${prId}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, action, comment })
    });

    if (!response.ok) {
      throw new Error(`Approval action failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get PR status
   */
  static async getPRStatus(prId: string): Promise<PR> {
    const response = await fetch(`${API_BASE}/api/post-cart/pr/${prId}`);

    if (!response.ok) {
      throw new Error(`Failed to get PR status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Generate RFQ (Path B - RFQ Generation & Management)
   */
  static async generateRFQ(rfqData: {
    lineItems: LineItem[];
    vendors: VendorRFQ[];
    dueDate: string;
    terms: {
      delivery: string;
      payment: string;
    };
  }): Promise<RFQ> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rfqData)
    });

    if (!response.ok) {
      throw new Error(`RFQ generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Send RFQ to vendors
   */
  static async sendRFQ(rfqId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/${rfqId}/send`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`RFQ sending failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Get RFQ status and responses
   */
  static async getRFQStatus(rfqId: string): Promise<RFQ> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/${rfqId}`);

    if (!response.ok) {
      throw new Error(`Failed to get RFQ status: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload RFQ response
   */
  static async uploadRFQResponse(
    rfqId: string, 
    vendorId: string, 
    responseData: {
      quote: LineItem[];
      deliveryTerms: string;
      paymentTerms: string;
      validity: string;
      attachments: DocRef[];
      notes?: string;
    }
  ): Promise<{ success: boolean; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/${rfqId}/response`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vendorId, response: responseData })
    });

    if (!response.ok) {
      throw new Error(`RFQ response upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Generate comparison matrix
   */
  static async generateComparisonMatrix(rfqId: string): Promise<ComparisonSheet> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/${rfqId}/comparison`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Comparison matrix generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Finalize RFQ selection
   */
  static async finalizeRFQSelection(
    rfqId: string, 
    selectedVendorId: string,
    justification: string
  ): Promise<{ prId: string; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/${rfqId}/finalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedVendorId, justification })
    });

    if (!response.ok) {
      throw new Error(`RFQ finalization failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload document
   */
  static async uploadDocument(
    file: File, 
    type: DocRef['type'],
    metadata?: Record<string, any>
  ): Promise<DocRef> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    if (metadata) {
      formData.append('metadata', JSON.stringify(metadata));
    }

    const response = await fetch(`${API_BASE}/api/post-cart/documents/upload`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Document upload failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Download document
   */
  static async downloadDocument(docId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE}/api/post-cart/documents/${docId}/download`);

    if (!response.ok) {
      throw new Error(`Document download failed: ${response.statusText}`);
    }

    return response.blob();
  }

  /**
   * Generate compliance documents
   */
  static async generateComplianceDocuments(prId: string): Promise<{
    coverSheet: string;
    comparison: string;
    ssj?: string;
  }> {
    const response = await fetch(`${API_BASE}/api/post-cart/pr/${prId}/compliance-docs`, {
      method: 'POST'
    });

    if (!response.ok) {
      throw new Error(`Compliance document generation failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Issue PO
   */
  static async issuePO(prId: string): Promise<{ poNumber: string; message: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/po/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prId })
    });

    if (!response.ok) {
      throw new Error(`PO issuance failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Explain G1 results (LLM-assisted or templated on backend)
   */
  static async explainG1(g1Result: any): Promise<{ summary: string; fixes: string[]; approverExplain?: string[] }> {
    const response = await fetch(`${API_BASE}/api/post-cart/g1-explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ g1Result })
    });
    if (!response.ok) {
      throw new Error(`G1 explanation failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Draft RFQ message for a vendor
   */
  static async draftRFQ(payload: { vendor: { id: string; name: string; contact?: string }, lineItems: LineItem[], dueDate: string, terms: { delivery: string; payment: string } }): Promise<{ subject: string; body_md: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/rfq/draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`RFQ draft failed: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Prepare a generic email
   */
  static async prepareEmail(payload: { intent: string; recipient: string; context: any }): Promise<{ subject: string; body_text: string; body_html: string }> {
    const response = await fetch(`${API_BASE}/api/post-cart/email/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`Email prepare failed: ${response.statusText}`);
    }
    return response.json();
  }
}
