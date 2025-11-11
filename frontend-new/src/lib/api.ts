// Prefer configurable API base via Vite env; fall back to localhost:8000
export const API_BASE = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:8000';

export interface GenerateRecommendationsRequest {
  project_context: any;
  product_details: any;
  combined_scope: string;
  uploaded_summaries?: string[];
  scope_bullets?: string[];
}

// KPA One-Flow interfaces
export interface IntakeRequest {
  session_id?: string;
  product_name: string;
  budget_usd: number;
  quantity: number;
  scope_text: string;
  vendors?: string[];
  uploaded_summaries?: string[];
  project_context?: any;
}

export interface IntakeResponse {
  session_id: string;
  intake: {
    status: 'questions' | 'ready';
    requirements_summary: string;
    missing_info_questions: string[];
  };
}

export interface FollowupRequest {
  session_id: string;
  followup_answers: Record<string, string>;
}

export interface FollowupResponse {
  session_id: string;
  answers: Record<string, string>;
  message?: string;
  // Note: Recommendations are NOT returned by submit_followups
  // They are generated separately via generateFinalRecommendations
}

export async function uploadFiles(files: File[]) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE}/api/files/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`File upload failed: ${response.statusText}`);
  }

  return response.json();
}

export async function analyzeFiles(files: File[]) {
  const formData = new FormData();
  files.forEach(file => {
    formData.append('files', file);
  });

  const response = await fetch(`${API_BASE}/api/files/analyze`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`File analysis failed: ${response.statusText}`);
  }

  return response.json();
}

export async function suggestVendors(product: string, category?: string) {
  const response = await fetch(`${API_BASE}/api/suggest-vendors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ product, category }),
  });

  if (!response.ok) {
    throw new Error(`Vendor suggestion failed: ${response.statusText}`);
  }

  return response.json();
}

export async function generateRecommendations(request: GenerateRecommendationsRequest) {
  const response = await fetch(`${API_BASE}/api/generate_recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`Recommendations generation failed: ${response.statusText}`);
  }

  return response.json();
}

export async function getTokenUsage() {
  const response = await fetch(`${API_BASE}/api/token-usage`);

  if (!response.ok) {
    throw new Error('Failed to fetch token usage');
  }

  return response.json();
}

// KPA One-Flow API functions
export async function startIntake(request: IntakeRequest): Promise<IntakeResponse> {
  const response = await fetch(`${API_BASE}/api/intake_recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Intake failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function submitFollowups(request: FollowupRequest): Promise<FollowupResponse> {
  const response = await fetch(`${API_BASE}/api/submit_followups`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Follow-up submission failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export interface ValidateQuestionSelectionRequest {
  user_thoughts: string;
  selected_question: string;
  current_batches: any[];
  product_name: string;
  selected_variant?: any;
  kpa_recommendations?: any;
}

export interface ValidateQuestionSelectionResponse {
  approved: boolean;
  message?: string;
  more_questions?: string[];
  search_query?: string;
}

export async function validateQuestionSelection(request: ValidateQuestionSelectionRequest): Promise<ValidateQuestionSelectionResponse> {
  const response = await fetch(`${API_BASE}/api/vendor_search/validate_question_selection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Question validation failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export interface FollowupQuestionsRequest {
  user_thoughts: string;
  current_batches: any[];
  product_name: string;
  total_vendors_found: number;
}

export interface FollowupQuestionsResponse {
  questions: string[];
  should_search: boolean;
  reason?: string;
}

export async function generateVendorFollowupQuestions(request: FollowupQuestionsRequest): Promise<FollowupQuestionsResponse> {
  const response = await fetch(`${API_BASE}/api/vendor_search/generate_followup_questions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Follow-up questions generation failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function getSession(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch session: ${response.statusText}`);
  }

  return response.json();
}

export async function patchAnswers(sessionId: string, followupAnswers: Record<string, string>) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}/answers`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ followup_answers: followupAnswers }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Answer update failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function regenerateRecommendations(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Regeneration failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function generateProjectSummary(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}/generate_summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Project summary generation failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function generateFinalRecommendations(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}/generate_recommendations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Final recommendations generation failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

export async function getSessionData(sessionId: string) {
  const response = await fetch(`${API_BASE}/api/session/${sessionId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch session data: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

// Procurement Summary Document APIs
export async function upsertProcurement(payload: any) {
  const response = await fetch(`${API_BASE}/api/procurements`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Procurement upsert failed: ${response.statusText}`);
  return response.json();
}

export async function renderProcurementDraft(requestId: string, payload: any) {
  const response = await fetch(`${API_BASE}/api/procurements/${encodeURIComponent(requestId)}/draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Draft render failed: ${response.statusText}`);
  return response.json(); // { html, warnings }
}

export async function finalizeProcurement(requestId: string, payload: any) {
  const response = await fetch(`${API_BASE}/api/procurements/${encodeURIComponent(requestId)}/final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Finalize failed: ${response.statusText}`);
  return response.json(); // { html_url, pdf_url, docx_url, hash, version }
}

export function getProcurementDownloadUrl(requestId: string, format: 'html'|'pdf'|'docx' = 'html', version = '1.0.0') {
  return `${API_BASE}/api/procurements/${encodeURIComponent(requestId)}/download?format=${format}&version=${encodeURIComponent(version)}`;
}

// KIBA Sessions (Results Stack)
export async function kibaGetSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/kiba/sessions/${encodeURIComponent(sessionId)}`);
  if (!res.ok) throw new Error(`Failed to fetch KIBA session: ${res.statusText}`);
  return res.json();
}

export async function kibaPatchSession(sessionId: string, payload: any) {
  const res = await fetch(`${API_BASE}/api/kiba/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) return { conflict: true, data: await res.json() };
  if (!res.ok) throw new Error(`Failed to patch KIBA session: ${res.statusText}`);
  return res.json();
}

export async function kibaCreateRun(sessionId: string, run: any) {
  const res = await fetch(`${API_BASE}/api/kiba/sessions/${encodeURIComponent(sessionId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ run }),
  });
  if (!res.ok) throw new Error(`Failed to create run: ${res.statusText}`);
  return res.json();
}

export async function kibaCloseSession(sessionId: string) {
  const res = await fetch(`${API_BASE}/api/kiba/sessions/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error(`Failed to close session: ${res.statusText}`);
  return res.json();
}

// Search Query Building
export async function buildSearchQuery(selectedVariant: any) {
  const response = await fetch(`${API_BASE}/api/search-query/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selected_variant: selectedVariant
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Search query building failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

// Web Search
export async function webSearch(query: string, maxResults: number = 10) {
  const response = await fetch(`${API_BASE}/api/web_search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: query,
      max_results: maxResults
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Web search failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

// Vendor Finder
export async function findVendors(
  selectedVariant: any,
  kpaRecommendations: any = null,
  page: number = 0,
  pageSize: number = 10,
  refresh: boolean = false,
  generatedQuery?: string
) {
  const response = await fetch(`${API_BASE}/api/vendor_finder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selected_variant: selectedVariant,
      kpa_recommendations: kpaRecommendations,
      page: page,
      page_size: pageSize,
      refresh: refresh,
      generated_query: generatedQuery
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vendor finder failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}

// RFQ Generation
export async function generateRFQ(selectedVendors: any[], productName: string, quantity: number) {
  const response = await fetch(`${API_BASE}/api/generate_rfq`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      selected_vendors: selectedVendors,
      product_name: productName,
      quantity: quantity
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RFQ generation failed: ${response.statusText} - ${errorText}`);
  }

  return response.json();
}
