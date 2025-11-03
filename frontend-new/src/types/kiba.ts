export type StepKey = 'request' | 'vendorSearch' | 'evaluation' | 'selection' | 'previewClose';

export interface Vendor {
  id: string;
  name: string;
  quoteAmount?: number;
  leadTimeDays?: number;
  badges?: string[];
  meta?: Record<string, unknown>;
}

export interface VendorRun {
  runId: string;
  createdAt: string;
  createdBy: string;
  query: string;
  filters: Record<string, unknown>;
  source: 'internalCatalog' | 'externalAPI' | 'manual';
  resultVendorIds: string[];
  vendorsSnapshot: Record<string, Vendor>;
  notes?: string;
  pinnedVendorIds?: string[];
  failed?: boolean;
  errorMessage?: string;
}

export interface KibaSession {
  sessionId: string;
  status: 'open' | 'closed';
  currentStep: StepKey;
  steps: {
    request: {
      program?: string;
      poc?: { name: string; email?: string };
      projects?: string[];
      estimatedCost?: number;
      pop?: { start?: string; end?: string };
    };
    vendorSearch: {
      runs: VendorRun[];
      activeRunId?: string | null;
    };
    evaluation: {
      shortlistVendorIds: string[];
      notesByVendorId: Record<string, string>;
      attachments?: Array<{ id: string; title: string; vendorId?: string }>;
    };
    selection: {
      selectedVendorId?: string | null;
      rationale?: string;
      terms?: string;
      totalAwardAmount?: number;
    };
  };
  audit: Array<{ at: string; by: string; event: string; payload?: unknown }>;
  version: number;
  final?: any;
}




