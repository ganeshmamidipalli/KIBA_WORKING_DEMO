export interface SpecRequirement {
  key: string;
  value: string;
}

export interface CandidateVendor {
  name: string;
  notes?: string;
}

export interface SpecVariant {
  id: string;
  title: string;
  summary: string;
  quantity: number;
  est_unit_price_usd: number;
  est_total_usd: number;
  lead_time_days: number;
  profile: string;
  metrics: Record<string, any>;
  must: SpecRequirement[];
  should: SpecRequirement[];
  nice: SpecRequirement[];
  preferred_vendors?: CandidateVendor[];
  risks?: string[];
  rationale_summary: string[];
}

export interface Recommendation {
  recommended_id: string;
  reason: string;
  scores: Record<string, number>;
  checks: Record<string, boolean>;
}

export interface RecommendationsResponse {
  variants: SpecVariant[];
  recommendation?: Recommendation;
  decision_notes: string;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  text_preview?: string;
  summary?: string;
}

export interface Vendor {
  id: string;
  name: string;
  productName: string;
  price: number;
  contact: string;
  website: string;
  description?: string;
  deliveryTime?: string;
  rating?: number;
}

export interface RFQResult {
  rfq_id: string;
  created_at: string;
  vendor_count: number;
  is_competitive: boolean;
  html_url: string;
}

// KPA One-Flow types
export interface IntakeData {
  status: 'questions' | 'ready';
  requirements_summary: string;
  missing_info_questions: string[];
}

export interface KPARecommendation {
  id: string;
  name: string;
  specs: string[];
  estimated_price_usd: number | null;
  meets_budget: boolean;
  value_note: string;
  rationale: string;
  score: number;
  vendor_search: {
    model_name: string;
    spec_fragments: string[];
    region_hint: string | null;
    budget_hint_usd: number | null;
    query_seed: string;
  };
}

export interface KPARecommendations {
  schema_version: string;
  summary: string;
  recommendations: KPARecommendation[];
  recommended_index: number;
  selection_mode: string;
  disclaimer: string;
}

// Post-Cart Phase Types
export interface LineItem {
  sku: string;
  desc: string;
  qty: number;
  uom: string;
  unitPrice: number;
  currency: string;
  leadDays: number;
  deliveryTerms?: string;
  quoteValidity?: string;
}

export interface VendorRef {
  id: string;
  name: string;
  contact: string;
  website?: string;
}

export interface DocRef {
  type: 'Quote' | 'RFQ' | 'Comparison' | 'SSJ' | 'CoverSheet' | 'Spec' | 'Other';
  url: string;
  filename: string;
  hash: string;
  uploadedAt: string;
}

export interface Justification {
  type: 'SSJ' | 'Budgeted' | 'Technical' | 'Other';
  text?: string;
  amount?: number;
}

export interface ApprovalRoute {
  required: ApproverRole[];
  roster: ApproverAssignment[];
  decisions: ApproverDecision[];
}

export interface ApproverAssignment {
  role: ApproverRole;
  userId: string;
  name: string;
  email: string;
}

export interface ApproverDecision {
  role: ApproverRole;
  userId: string;
  decision: 'APPROVED' | 'REJECTED' | 'REQUEST_CHANGES';
  comment?: string;
  timestamp: string;
}

export type ApproverRole = 'PMO' | 'EVP' | 'Finance' | 'Contracts' | 'President';

export interface AuditEntry {
  actor: string;
  action: string;
  timestamp: string;
  delta?: Record<string, any>;
  reason?: string;
}

export interface PR {
  id: string;
  projectKeys: string[];
  spendType: 'Direct' | 'Indirect';
  budgeted: boolean;
  estimatedCost: number;
  competitive: boolean;
  justification?: Justification;
  vendor: VendorRef;
  lineItems: LineItem[];
  documents: DocRef[];
  approvals: ApprovalRoute;
  status: 'PR_DRAFT' | 'PR_SUBMITTED' | 'APPROVALS_IN_FLIGHT' | 'APPROVED' | 'PO_ISSUED' | 'REWORK';
  audit: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface RFQ {
  id: string;
  prCandidateId?: string;
  vendors: VendorRFQ[];
  dueDate: string;
  status: 'RFQ_PREP' | 'RFQ_SENT' | 'RFQ_RESPONSES' | 'VENDOR_EVAL' | 'SELECTION_FINALIZED';
  comparison?: ComparisonSheet;
  audit: AuditEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface VendorRFQ {
  vendorId: string;
  vendorName: string;
  contact: string;
  status: 'PENDING' | 'SENT' | 'RECEIVED' | 'WITHDRAWN';
  sentAt?: string;
  receivedAt?: string;
  response?: VendorResponse;
}

export interface VendorResponse {
  quote: LineItem[];
  deliveryTerms: string;
  paymentTerms: string;
  validity: string;
  attachments: DocRef[];
  notes?: string;
}

export interface ComparisonSheet {
  vendors: string[];
  criteria: string[];
  scores: Record<string, Record<string, number>>;
  weightedTotal: Record<string, number>;
  recommendation: string;
}

// Decision Gate G1 Types
export interface G1Context {
  selectedVendors: Vendor[];
  items: LineItem[];
  pricing: Record<string, LineItem[]>;
  procurementContext: ProcurementContext;
}

export interface ProcurementContext {
  budgeted: boolean;
  spendType: 'Direct' | 'Indirect';
  competitive: boolean;
  estimatedCost: number;
  contractRequired: boolean;
  pmisProjectIds: string[];
  justifications: string[];
  procurementType: ProcurementType;
  spendPlanStatus: 'APPROVED' | 'PENDING' | 'NOT_IN_PLAN';
  isSoleSource: boolean;
  subcontracting: boolean;
  popGt30d: boolean;
  customerTCs: boolean;
  ssjAmount?: number;
  contractExecuted: boolean;
}

export type ProcurementType = 
  | 'CC_APPROVED_SPEND_PLAN'
  | 'CC_NOT_IN_SPEND_PLAN'
  | 'PROC_COMPETITIVE'
  | 'PROC_SOLE_SOURCE'
  | 'BIDS_AND_PROPOSALS'
  | 'ROMS';

export interface G1Result {
  passed: boolean;
  reasonCodes: string[];
  missingItems: string[];
  recommendations: string[];
  requiredApprovers: ApproverRole[];
}

// Cart Decision Types
export interface CartDecision {
  recommendation: 'PROCEED_TO_APPROVALS' | 'GENERATE_RFQS';
  reason: string;
  g1Result: G1Result;
  readinessPercentage: number;
  checklist: ChecklistItem[];
}

export interface ChecklistItem {
  id: string;
  label: string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  message?: string;
  required: boolean;
}


