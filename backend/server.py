from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
from dotenv import load_dotenv
from openai import OpenAI
import json
from pypdf import PdfReader
import io
import logging
from datetime import datetime
import pathlib
import re
import uuid
import time

# Import service modules
from specification_service import (
    generate_scope_from_files,
    generate_recommendations,
    get_fallback_scope,
    get_fallback_recommendations,
    FileUploadOut,
    RecoOut,
    Attachment
)
from web_search_service import (
    search_products_web,
    get_fallback_web_search
)
from llm_search_query_builder import (
    generate_search_query_with_llm as generate_natural_search_instruction
)
from simple_web_search import run_web_search
from product_parser_service import (
    parse_search_results
)
from procurement_summarizer import (
    extract_text,
    process_path,
    llm_extract_procurement
)

# Import KPA One-Flow services
from services.procurement_intake import run_intake
from services.procurement_recommend import run_recommendations
from utils.scope_utils import merge_scope_with_answers, normalize_scope
from utils.store import SessionStore
from utils.recs_utils import postprocess_recs

def create_structured_summary(session: dict, answers: dict, intake_result: dict) -> str:
    """
    Create a comprehensive structured summary combining all project details,
    scope, and follow-up answers for generating recommendations.
    """
    sections = []
    
    # 1. Project Overview
    sections.append("=== PROJECT OVERVIEW ===")
    sections.append(f"Product: {session.get('product_name', 'N/A')}")
    sections.append(f"Quantity: {session.get('quantity', 'N/A')}")
    sections.append(f"Budget: ${session.get('budget_usd', 0):,.2f} per unit")
    sections.append(f"Total Budget: ${session.get('budget_usd', 0) * session.get('quantity', 1):,.2f}")
    
    # 2. Project Context (if available)
    if 'project_context' in session:
        ctx = session['project_context']
        sections.append("\n=== PROJECT CONTEXT ===")
        sections.append(f"Project Name: {ctx.get('project_name', 'N/A')}")
        sections.append(f"Procurement Type: {ctx.get('procurement_type', 'N/A')}")
        sections.append(f"Service Program: {ctx.get('service_program', 'N/A')}")
        sections.append(f"Technical POC: {ctx.get('technical_poc', 'N/A')}")
    
    # 3. Original Scope and Requirements
    sections.append("\n=== ORIGINAL SCOPE & REQUIREMENTS ===")
    sections.append(session.get('scope_text', 'No scope provided'))
    
    # 4. Follow-up Questions and Answers
    if answers:
        sections.append("\n=== CLARIFYING QUESTIONS & ANSWERS ===")
        for question, answer in answers.items():
            if answer and answer.strip():
                sections.append(f"Q: {question}")
                sections.append(f"A: {answer}")
                sections.append("")
    
    # 5. Requirements Summary from Intake
    if intake_result and intake_result.get('requirements_summary'):
        sections.append("=== AI-GENERATED REQUIREMENTS SUMMARY ===")
        sections.append(intake_result['requirements_summary'])
    
    # 6. Additional Context
    sections.append("\n=== ADDITIONAL CONTEXT ===")
    if session.get('vendors'):
        sections.append(f"Preferred Vendors: {', '.join(session['vendors'])}")
    
    if session.get('uploaded_summaries'):
        sections.append("Uploaded Documents:")
        for i, summary in enumerate(session['uploaded_summaries'], 1):
            if summary and summary.strip():
                sections.append(f"  {i}. {summary[:200]}{'...' if len(summary) > 200 else ''}")
    
    # 7. Final Consolidated Requirements
    sections.append("\n=== CONSOLIDATED REQUIREMENTS FOR RECOMMENDATIONS ===")
    sections.append("Based on all the above information, generate recommendations that:")
    sections.append(f"- Match the product category: {session.get('product_name', 'N/A')}")
    sections.append(f"- Fit within budget: ${session.get('budget_usd', 0):,.2f} per unit")
    sections.append(f"- Meet quantity requirement: {session.get('quantity', 'N/A')} units")
    
    if answers:
        sections.append("- Address the following specific requirements:")
        for question, answer in answers.items():
            if answer and answer.strip() and answer.lower() not in ['na', 'n/a', 'no', 'none']:
                sections.append(f"  • {answer}")
    
    return "\n".join(sections)

def generate_user_friendly_summary(session: dict, answers: dict, structured_summary: str) -> str:
    """
    Generate a user-friendly project summary using LLM based on all collected information.
    This summary will be shown to the user for review and editing before recommendations.
    """
    try:
        from services.openai_client import client
        
        if not client:
            # Fallback to structured summary if no OpenAI client
            return structured_summary
        
        # Create a prompt for generating user-friendly summary
        prompt = f"""
You are a procurement assistant. Based on the following comprehensive project information, create a clear, user-friendly project summary that the user can review and edit before generating recommendations.

PROJECT INFORMATION:
{structured_summary}

Please create a well-structured, easy-to-read summary that includes:
1. Project Overview (name, type, POC)
2. Product Requirements (what they need, quantity, budget)
3. Key Specifications (based on their answers to follow-up questions)
4. Additional Requirements (warranty, delivery, accessories, etc.)
5. Preferred Vendors (if any)

Format it in a way that's easy for the user to review and make changes if needed.
Make it professional but conversational.
"""
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a helpful procurement assistant. Create clear, user-friendly project summaries."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1500
        )
        
        return response.choices[0].message.content.strip()
        
    except Exception as e:
        logger.error(f"Error generating user-friendly summary: {str(e)}")
        # Fallback to structured summary
        return structured_summary

# Load environment variables - prefer .env.local over .env
load_dotenv('.env.local')
load_dotenv('.env')  # Fallback

log_dir = pathlib.Path("logs")
log_dir.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(log_dir / "api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

token_logger = logging.getLogger("token_usage")
token_handler = logging.FileHandler(log_dir / "token_usage.log")
token_handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
token_logger.addHandler(token_handler)
token_logger.setLevel(logging.INFO)

app = FastAPI(title="Knowmadics KIBA3 API")

# Initialize KPA One-Flow session store
kpa_session_store = SessionStore(ttl_seconds=60*30)  # 30-minute TTL

# Persistent sessions for KIBA Vendor Search Results Stack (no TTL in dev)
kiba_session_store = SessionStore(ttl_seconds=None)

# Configure CORS - allow frontend on localhost ports
# Note: Cannot use allow_origins=["*"] with allow_credentials=True
cors_origins = [
    "http://localhost:3000",
    "http://localhost:3001", 
    "http://localhost:5173",
    "http://localhost:5174",  # Frontend running on 5174
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",  # Frontend running on 5174
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENAI_MODEL = os.getenv("OPENAI_CHAT_MODEL", "gpt-4o-2024-08-06")  # Latest GPT-4o for best recommendations
MAX_FILE_MB = int(os.getenv("MAX_FILE_MB", "10"))
MAX_TOTAL_MB = int(os.getenv("MAX_TOTAL_MB", "30"))

try:
    import docx
except ImportError:
    docx = None

try:
    import pandas as pd
except ImportError:
    pd = None

try:
    from PIL import Image
    import base64
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

def get_client() -> Optional[OpenAI]:
    """Get OpenAI client with robust connection handling."""
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key:
        return None
    try:
        # Create client with extended timeout for web search (o4-mini can take 60-120s)
        return OpenAI(
            api_key=key,
            timeout=180.0,  # 3 minute timeout for web search operations
            max_retries=2   # Retry up to 2 times on connection errors
        )
    except Exception as e:
        logger.error(f"Error creating OpenAI client: {e}")
        return None

def ensure_client() -> Optional[OpenAI]:
    """
    Ensure OpenAI client is available and connected.
    If global client is None or has issues, create a new one.
    """
    global client
    if client is None:
        logger.warning("OpenAI client is None, attempting to reconnect...")
        client = get_client()
        if client:
            logger.info("Successfully reconnected OpenAI client")
        else:
            logger.error("Failed to reconnect OpenAI client - check API key")
    return client

def call_with_retry(func, *args, max_retries=2, **kwargs):
    """
    Call OpenAI API function with automatic retry on connection errors.
    
    Args:
        func: The function to call
        max_retries: Maximum number of retries (default: 2)
        *args, **kwargs: Arguments to pass to the function
        
    Returns:
        Result from the function call
        
    Raises:
        Exception: Re-raises the last exception if all retries fail
    """
    last_error = None
    for attempt in range(max_retries + 1):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            last_error = e
            error_str = str(e).lower()
            
            # Check if it's a connection/timeout error worth retrying
            if any(keyword in error_str for keyword in ['timeout', 'connection', 'network', 'rate limit']):
                if attempt < max_retries:
                    logger.warning(f"API call failed (attempt {attempt + 1}/{max_retries + 1}): {e}")
                    logger.info("Retrying with fresh client connection...")
                    
                    # Refresh the client connection
                    global client
                    client = get_client()
                    
                    # Wait a bit before retrying (exponential backoff)
                    import time
                    time.sleep(2 ** attempt)
                    continue
            
            # If not a retryable error or out of retries, raise immediately
            raise
    
    # If we get here, all retries failed
    raise last_error

client = get_client()

class Citation(BaseModel):
    file_id: str
    file_name: str
    quote: str
    page_hint: Optional[int] = None

class ScopeTrace(BaseModel):
    constraints: List[str] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    open_questions: List[str] = Field(default_factory=list)
    citations: List[Citation] = Field(default_factory=list)

class ScopeOut(BaseModel):
    summarized_bullets: List[str] = Field(default_factory=list)
    trace: ScopeTrace = Field(default_factory=ScopeTrace)

class Attachment(BaseModel):
    id: str
    name: str
    mime: str
    size: int
    summary: Optional[str] = None
    text_preview: Optional[str] = None

class FileUploadOut(BaseModel):
    attachments: List[Attachment]
    scope: ScopeOut

class SpecRequirement(BaseModel):
    key: str
    value: str

class CandidateVendor(BaseModel):
    name: str
    notes: Optional[str] = None

class SpecVariant(BaseModel):
    id: str
    title: str
    summary: str
    quantity: int
    est_unit_price_usd: float
    est_total_usd: float
    lead_time_days: int
    profile: str
    metrics: Dict[str, Any] = Field(default_factory=dict)
    must: List[SpecRequirement] = Field(default_factory=list)
    should: List[SpecRequirement] = Field(default_factory=list)
    nice: List[SpecRequirement] = Field(default_factory=list)
    preferred_vendors: Optional[List[CandidateVendor]] = None
    risks: Optional[List[str]] = None
    rationale_summary: List[str] = Field(default_factory=list)

class RecoOut(BaseModel):
    variants: List[SpecVariant]
    decision_notes: str

def extract_json_block(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*", "", t).strip("` \n")
    s, e = t.find("{"), t.rfind("}")
    return t[s:e+1] if s!=-1 and e!=-1 and e>s else t

def read_any(name: str, mime: str, raw: bytes) -> str:
    nm = (name or "").lower()
    m = (mime or "").lower()
    try:
        if nm.endswith(".pdf") or "pdf" in m:
                pdf_file = io.BytesIO(raw)
                reader = PdfReader(pdf_file)
                text = ""
                for page in reader.pages:
                    text += page.extract_text() + "\n"
                return text or ""
        if nm.endswith(".docx") or "officedocument.wordprocessingml.document" in m:
            if docx:
                d = docx.Document(io.BytesIO(raw))
                return "\n".join(p.text for p in d.paragraphs if p.text)
        if nm.endswith(".xlsx") or "spreadsheetml.sheet" in m:
            if pd:
                df = pd.read_excel(io.BytesIO(raw))
                return df.head(50).to_csv(index=False)
        if nm.endswith(".csv") or "text/csv" in m:
            if pd:
                df = pd.read_csv(io.BytesIO(raw))
                return df.head(100).to_csv(index=False)
        if m.startswith("text/") or nm.endswith((".txt",".md",".log",".cfg",".ini")):
            return raw.decode(errors="ignore")
    except Exception as e:
        logger.warning(f"Error reading file {name}: {e}")
    return ""

def unit_anchor(pd: Dict[str, Any]) -> float:
    q = float(pd.get("quantity") or 1)
    b = float(pd.get("budget_total") or 0)
    return (b / q) if q > 0 else 0.0

def contains_compliance(scope: str, pd: Dict[str, Any]) -> bool:
    blob = f"{scope} {json.dumps(pd, ensure_ascii=False)}".lower()
    keys = ["ndaa","taa","mil-std","mil std","ip65","ip66","ip67","wide-temp","wide temperature","industrial","dfars","nist"]
    return any(k in blob for k in keys)

def scope_prompt(files: List[Dict[str, Any]]) -> str:
    bundles = []
    for f in files:
        bundles.append({
            "id": f["id"], "name": f["name"],
            "text_excerpt": (f.get("text_preview") or "")[:4000]
        })
    schema = {
      "attachments": [{"id":"att-1","summary":"1-3 sentences"}],
      "scope": {
        "summarized_bullets": ["...","..."],
        "trace": {
          "constraints": ["..."],
          "assumptions": ["..."],
          "open_questions": ["..."],
          "citations": [{"file_id":"att-1","file_name":"Scope.pdf","quote":"short quote","page_hint":3}]
        }
      }
    }
    return f"""
You are a procurement analyst extracting sourcing requirements from documents.

**CRITICAL:** Focus ONLY on information relevant to SOURCING and PROCUREMENT:
- What product/item/service needs to be sourced
- Technical specifications and features required
- Budget constraints and pricing guidance  
- Timeline, delivery, and lead time requirements
- Quality standards and compliance (NDAA, TAA, MIL-STD, certifications)
- Vendor preferences or restrictions
- Quantities and volumes needed

**If the document is a policy, procedure guide, or general business document:**
- Extract ONLY the procurement-relevant sections
- Focus on specs, budgets, timelines, compliance requirements
- Ignore procedural steps, organizational charts, or non-sourcing content

Return STRICT JSON only (no markdown, no explanations). Do NOT include internal reasoning.
Provide:
1) **For each file:** A 1–3 sentence summary focusing ONLY on procurement-relevant content
2) **Scope bullets (6–12):** Key requirements that help source the right product:
   - Product specifications and features
   - Budget and pricing constraints
   - Delivery and timeline requirements  
   - Quality/compliance standards
   - Vendor requirements
   - Quantities needed
3) **Trace object:** Constraints, assumptions, open questions, and citations

JSON schema to follow:
{json.dumps(schema, indent=2)}

FILES:
{json.dumps(bundles, ensure_ascii=False, indent=2)}

**Remember:** Extract ONLY what helps determine WHAT to buy, HOW MUCH to spend, WHEN it's needed, and WHO can supply it. Ignore everything else.
"""

def variant_prompt(pc: Dict[str, Any], pd: Dict[str, Any], scope_bullets: List[str], uploaded_summaries: List[str]) -> str:
    anchor = unit_anchor(pd)
    compliance_flag = "on" if contains_compliance("\n".join(scope_bullets), pd) else "off"
    schema = {
      "variants":[
        {
          "id":"performance",
          "title":"Performance-optimized",
          "summary":"1–2 lines",
          "quantity":1,
          "est_unit_price_usd":0,
          "est_total_usd":0,
          "lead_time_days":30,
          "profile":"performance",
          "metrics":{"MetricA":"","MetricB":"","MetricC":""},
          "must":[{"key":"...","value":"..."}],
          "should":[{"key":"...","value":"..."}],
          "nice":[{"key":"...","value":"..."}],
          "preferred_vendors":[{"name":"Vendor"}],
          "risks":["optional"],
          "rationale_summary": ["3 short bullets that justify this option"]
        }
      ],
      "decision_notes":"When to pick which"
    }
    summaries_text = "\n- ".join(uploaded_summaries[:10])
    return f"""
You are a procurement architect at Knowmadics.

Return STRICT JSON only (no markdown, no extra text). Each variant must be self-contained and numerically specific.
Keep MUST minimal; move preferences to SHOULD/NICE. Prefer short lead times.

If compliance is required (NDAA/TAA/MIL-STD/IP-rating/wide-temp), include a compliance variant.
compliance_flag={compliance_flag}; unit_anchor={anchor:.2f}; quantity={pd.get("quantity")}; preferred_vendors={(pd.get("preferred_vendors") or [])[:6]}

JSON schema:
{json.dumps(schema, indent=2)}

PROJECT_CONTEXT:
{json.dumps(pc, indent=2)}

PRODUCT_DETAILS:
{json.dumps(pd, indent=2)}

SCOPE_BULLETS:
{json.dumps(scope_bullets, ensure_ascii=False, indent=2)}

UPLOADED_SUMMARIES (first 10):
- {summaries_text}
"""

@app.get("/health")
async def health():
    """Health check endpoint with OpenAI connection verification."""
    api_key_configured = bool(os.getenv("OPENAI_API_KEY"))
    client_active = client is not None
    
    # Try to ensure client connection if it's not active
    if not client_active and api_key_configured:
        test_client = ensure_client()
        client_active = test_client is not None
    
    return {
        "status": "healthy",
        "openai_configured": api_key_configured,
        "openai_connected": client_active,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/api/files/upload")
async def files_upload(files: List[UploadFile] = File(...)):
    total = 0
    bins: List[Dict[str, Any]] = []
    for idx, f in enumerate(files[:15]):
        raw = await f.read()
        total += len(raw)
        if total > MAX_TOTAL_MB * 1024 * 1024:
            return JSONResponse({"error": f"Total upload exceeds {MAX_TOTAL_MB} MB"}, status_code=400)
        txt = read_any(f.filename, f.content_type or "", raw)
        
        # Include more context for better AI analysis
        bins.append({
            "id": f"att-{idx+1}",
            "name": f.filename or "upload",
            "mime": f.content_type or "application/octet-stream",
            "size": len(raw),
            "text_preview": (txt or "")[:2500]  # Increased from 1200 to 2500 for better context
        })

    # Ensure client connection is intact
    active_client = ensure_client()
    if not active_client:
        scope = {
            "summarized_bullets": ["(LLM unavailable) Provide mission, constraints, qty, timeline here."],
            "trace": {
              "constraints": [], "assumptions": [], "open_questions": [], "citations": []
            }
        }
        atts = []
        for b in bins:
            atts.append({
              "id": b["id"], "name": b["name"], "mime": b["mime"],
              "size": b["size"], "summary": (b.get("text_preview") or "")[:300],
              "text_preview": b.get("text_preview") or ""
            })
        return JSONResponse(FileUploadOut(attachments=atts, scope=ScopeOut(**scope)).model_dump())

    user = scope_prompt(bins)
    try:
        resp = active_client.chat.completions.create(
            model=OPENAI_MODEL,
            temperature=0.2,
            max_tokens=1200,  # Increased from 900 to allow more detailed extraction
            messages=[
                {"role":"system","content": "You are a procurement analyst. Return STRICT JSON extracting only procurement-relevant requirements: product specs, budget, timeline, compliance, vendor needs. Ignore non-sourcing content."},
                {"role":"user","content": user}
            ]
        )

        if resp.usage:
            token_logger.info(json.dumps({
                "endpoint": "/api/files/upload",
                "model": OPENAI_MODEL,
                "prompt_tokens": resp.usage.prompt_tokens,
                "completion_tokens": resp.usage.completion_tokens,
                "total_tokens": resp.usage.total_tokens
            }))

        content = extract_json_block(resp.choices[0].message.content or "{}")
        data = json.loads(content)

        att_map = {b["id"]: b for b in bins}
        attachments: List[Attachment] = []
        for a in data.get("attachments", []):
            src = att_map.get(a.get("id"))
            if not src: continue
            attachments.append(Attachment(
                id=src["id"], name=src["name"], mime=src["mime"], size=src["size"],
                summary=a.get("summary") or "", text_preview=src.get("text_preview") or ""
            ))

        scope = data.get("scope", {}) or {}
        bullets = scope.get("summarized_bullets") or []
        tr = scope.get("trace") or {}
        trace = ScopeTrace(
            constraints=tr.get("constraints") or [],
            assumptions=tr.get("assumptions") or [],
            open_questions=tr.get("open_questions") or [],
            citations=[Citation(**c) for c in (tr.get("citations") or []) if c.get("file_id")]
        )
        return JSONResponse(FileUploadOut(attachments=attachments, scope=ScopeOut(summarized_bullets=bullets, trace=trace)).model_dump())

    except Exception as e:
        logger.error(f"Error in files_upload: {e}")
        atts = [Attachment(id=b["id"], name=b["name"], mime=b["mime"], size=b["size"], summary=(b.get("text_preview") or "")[:300], text_preview=b.get("text_preview") or "") for b in bins]
        scope = ScopeOut(summarized_bullets=["(Error summarizing) Paste the scope here manually."], trace=ScopeTrace())
        return JSONResponse(FileUploadOut(attachments=atts, scope=scope).model_dump())

@app.post("/api/files/analyze")
async def files_analyze_enhanced(files: List[UploadFile] = File(...)):
    """
    Enhanced file analysis using the procurement summarizer.
    Extracts structured procurement data from uploaded files.
    """
    try:
        total = 0
        temp_files = []
        results = []
        
        # Save files temporarily for processing
        temp_dir = pathlib.Path("temp_uploads")
        temp_dir.mkdir(exist_ok=True)
        
        for idx, f in enumerate(files[:15]):
            raw = await f.read()
            total += len(raw)
            if total > MAX_TOTAL_MB * 1024 * 1024:
                # Cleanup temp files
                for temp_file in temp_files:
                    if temp_file.exists():
                        temp_file.unlink()
                return JSONResponse({"error": f"Total upload exceeds {MAX_TOTAL_MB} MB"}, status_code=400)
            
            # Save to temp file
            temp_path = temp_dir / f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{idx}_{f.filename}"
            with open(temp_path, 'wb') as temp_file:
                temp_file.write(raw)
            temp_files.append(temp_path)
            
            # Extract text using procurement summarizer
            try:
                text = extract_text(str(temp_path))
                
                # Use LLM to extract structured procurement data
                if text and os.getenv("OPENAI_API_KEY"):
                    procurement_data = llm_extract_procurement(text)
                    results.append({
                        "id": f"att-{idx+1}",
                        "name": f.filename or "upload",
                        "mime": f.content_type or "application/octet-stream",
                        "size": len(raw),
                        "text_preview": text[:2500],
                        "procurement_items": procurement_data.get("items", []),
                        "overall_summary": procurement_data.get("overall_summary", ""),
                    })
                else:
                    results.append({
                        "id": f"att-{idx+1}",
                        "name": f.filename or "upload",
                        "mime": f.content_type or "application/octet-stream",
                        "size": len(raw),
                        "text_preview": text[:2500],
                        "procurement_items": [],
                        "overall_summary": "Text extracted but LLM unavailable",
                    })
                    
            except Exception as e:
                logger.error(f"Error processing {f.filename}: {e}")
                results.append({
                    "id": f"att-{idx+1}",
                    "name": f.filename or "upload",
                    "mime": f.content_type or "application/octet-stream",
                    "size": len(raw),
                    "error": str(e),
                })
        
        # Cleanup temp files
        for temp_file in temp_files:
            if temp_file.exists():
                temp_file.unlink()
        
        # Log token usage if any LLM calls were made
        if os.getenv("OPENAI_API_KEY"):
            token_logger.info(json.dumps({
                "endpoint": "/api/files/analyze",
                "model": "gpt-4o-mini",
                "files_processed": len(results)
            }))
        
        return JSONResponse({
            "files": results,
            "total_files": len(results),
            "status": "success"
        })
        
    except Exception as e:
        logger.error(f"Error in files_analyze_enhanced: {e}", exc_info=True)
        return JSONResponse({"error": f"Error analyzing files: {str(e)}"}, status_code=500)

@app.options("/api/generate_recommendations")
async def generate_recommendations_options():
    """Handle CORS preflight for generate_recommendations."""
    return JSONResponse(
        content={},
        status_code=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        }
    )

@app.post("/api/generate_recommendations")
async def generate_recommendations_endpoint(req: Request):
    """Generate specification variants and recommendations."""
    try:
        try:
            body = await req.json()
        except Exception as e:
            logger.error(f"Error parsing request body: {e}")
            return JSONResponse({"error": "Invalid JSON in request body"}, status_code=400)
        
        pc = body.get("project_context", {})
        pd = body.get("product_details", {})
        scope_text = (body.get("combined_scope") or "").strip()
        uploaded_summaries = body.get("uploaded_summaries", []) or []

        # Extract scope bullets
        scope_bullets = [b for b in (body.get("scope_bullets") or []) if isinstance(b, str) and b.strip()]
        if not scope_bullets and scope_text:
            scope_bullets = [ln.strip("•- ").strip() for ln in scope_text.splitlines() if ln.strip()]

        # Generate recommendations using specification service
        # Ensure client connection is intact
        active_client = ensure_client()
        if not active_client:
            result = get_fallback_recommendations(pd)
        else:
            result = generate_recommendations(
                active_client, pc, pd, scope_bullets, uploaded_summaries, 
                OPENAI_MODEL, token_logger
            )
        
        return JSONResponse(result.model_dump())
        
    except Exception as e:
        logger.error(f"Error in generate_recommendations: {e}", exc_info=True)
        return JSONResponse({"error": f"Error generating recommendations: {str(e)}"}, status_code=500)

@app.post("/api/suggest-vendors")
async def suggest_vendors(req: Request):
    """Suggest vendors based on product and category using AI."""
    try:
        body = await req.json()
        product = body.get("product", "")
        category = body.get("category", "")
        
        if not product:
            return JSONResponse({"vendors": []})
        
        # Ensure client connection
        active_client = ensure_client()
        if not active_client:
            # Return generic vendors if OpenAI unavailable
            return JSONResponse({"vendors": ["Dell", "HP", "Lenovo", "CDW", "Amazon Business"]})
        
        prompt = f"""Based on the product '{product}' in category '{category}', suggest 5-7 well-known, reputable USA-based vendors or suppliers.

Return ONLY a JSON array of vendor names, like: ["Vendor1", "Vendor2", "Vendor3"]

Focus on:
- Major distributors and manufacturers
- Government contractors (if applicable)
- Authorized resellers
- Direct manufacturers"""
        
        resp = active_client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            max_tokens=200,
            messages=[
                {"role":"system","content":"Return STRICT JSON array of vendor names only."},
                {"role":"user","content":prompt}
            ]
        )
        
        if resp.usage:
            token_logger.info(json.dumps({
                "endpoint": "/api/suggest-vendors",
                "model": "gpt-4o-mini",
                "total_tokens": resp.usage.total_tokens
            }))
        
        content = extract_json_block(resp.choices[0].message.content or "[]")
        vendors = json.loads(content)
        
        return JSONResponse({"vendors": vendors if isinstance(vendors, list) else []})
    
    except Exception as e:
        logger.error(f"Vendor suggestion failed: {e}")
        return JSONResponse({"vendors": ["Dell", "HP", "Lenovo", "CDW", "Amazon Business"]})

@app.get("/api/token_usage")
async def get_token_usage():
    try:
        log_file = log_dir / "token_usage.log"
        if not log_file.exists():
            return JSONResponse({
                "total_tokens": 0,
                "total_cost_usd": 0.0,
                "by_endpoint": {}
            })

        total_tokens = 0
        by_endpoint: Dict[str, Dict[str, int]] = {}

        with open(log_file, 'r') as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    parts = line.split(' - ', 1)
                    if len(parts) < 2:
                        continue
                    data = json.loads(parts[1])
                    endpoint = data.get("endpoint", "unknown")
                    tokens = data.get("total_tokens", 0)
                    total_tokens += tokens

                    if endpoint not in by_endpoint:
                        by_endpoint[endpoint] = {"total_tokens": 0, "calls": 0}
                    by_endpoint[endpoint]["total_tokens"] += tokens
                    by_endpoint[endpoint]["calls"] += 1
                except (json.JSONDecodeError, IndexError):
                    continue

        cost_per_1k = 0.00015
        total_cost = (total_tokens / 1000) * cost_per_1k

        return JSONResponse({
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "by_endpoint": by_endpoint
        })
    except Exception as e:
        logger.error(f"Error reading token usage: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

# ----------------------------------------------------------------------------
# WEB SEARCH ENDPOINT
# ----------------------------------------------------------------------------

@app.post("/api/web_search")
async def web_search_endpoint(req: Request):
    """
    Web search using OpenAI o4-mini with comprehensive natural language instructions.
    
    Two modes:
    1. Automatic: Send 'selection' data (from recommendation) - builds query automatically
    2. Manual: Send 'query' string directly
    """
    global CURRENT_SELECTION
    
    try:
        body = await req.json()
        
        # MODE 1: Automatic query building from selection
        if "selection" in body and body["selection"]:
            selection = body["selection"]
            CURRENT_SELECTION = selection
            
            # Build natural language search instruction automatically
            # This includes ALL constant constraints (USA vendors, HTTPS, in-stock, etc.)
            # PLUS the variable product specs from the selected recommendation
            query = generate_natural_search_instruction(selection)
            
            logger.info(f"Auto-generated search query from selection")
            logger.info(f"Query: {query[:200]}...")
        
        # MODE 2: Manual query (user provides query string directly)
        else:
            query = body.get("query", "")
            if not query.strip():
                return JSONResponse({"error": "Query or selection is required"}, status_code=400)
            logger.info(f"Manual search query: {query[:100]}")
        
        # Ensure client connection is intact
        active_client = ensure_client()
        if not active_client:
            result = get_fallback_web_search()
            return JSONResponse(result)
        
        # Execute web search with the query (auto-generated or manual)
        # SIMPLE: Query → o4-mini → output_text → return
        result = search_products_web(
            client=active_client,
            query=query
        )
        
        # Add the query that was used (for logging/debugging)
        result["search_query_used"] = query
        
        # Return raw output_text - let frontend display as-is
        return JSONResponse(result)
            
    except Exception as e:
        logger.error(f"Error in web_search: {e}")
        return JSONResponse({
            "error": str(e),
            "output_text": ""
        }, status_code=500)

# ----------------------------------------------------------------------------
# VENDOR FINDER ENDPOINT
# ----------------------------------------------------------------------------

# Simple vendor search is now imported directly

@app.post("/api/vendor_finder")
async def vendor_finder_endpoint(req: Request):
    """
    Find reputable US vendors for a selected recommendation.
    
    Expected payload:
    {
        "selected_variant": {...},
        "kpa_recommendations": {...},
        "page": 0,
        "page_size": 10,
        "top_n": 120,
        "batch_id": "batch-1",
        "refresh": false
    }
    """
    try:
        body = await req.json()
        
        selected_variant = body.get("selected_variant", {})
        kpa_recommendations = body.get("kpa_recommendations", {})
        generated_query = body.get("generated_query", "")
        page = body.get("page", 0)
        page_size = body.get("page_size", 10)
        max_results = body.get("max_results", 10)
        refresh = body.get("refresh", False)
        
        if not selected_variant:
            return JSONResponse({"error": "selected_variant is required"}, status_code=400)
        
        product_name = selected_variant.get('title', 'Unknown Product')
        budget = selected_variant.get('est_unit_price_usd', 0)
        
        # Extract specs from recommendations
        selected_specs = []
        if kpa_recommendations and kpa_recommendations.get("vendor_search", {}).get("spec_fragments"):
            selected_specs = kpa_recommendations["vendor_search"]["spec_fragments"]
        
        logger.info(f"🔍 Finding vendors for: {product_name}")
        logger.info(f"   Budget: ${budget}, Specs: {selected_specs}")
        
        # Build an enhanced, constraint-aware query for consistent high-quality results
        def build_enhanced_query(base_q: str) -> str:
            base = (base_q or "").strip()
            core = base if base else f"best {product_name} {' '.join(selected_specs)} vendors"
            # Enforce constraints inline to guide the search model
            constraints = [
                "US vendors only",
                "provide direct purchase links",
                "no broken links",
                "authorized retailers or distributors",
                "exclude marketplaces with unreliable listings",
                "10 reputable vendors max"
            ]
            constraint_text = "; ".join(constraints)
            return f"{core}. Constraints: {constraint_text}."

        raw_query = generated_query if isinstance(generated_query, str) else ""
        search_query = build_enhanced_query(raw_query)

        # Execute search
        web_search_output = run_web_search(search_query)
        
        logger.info(f"✅ Web search completed for: {product_name}")
        
        # Format response (return query and raw output exactly)
        # Optional: lightweight link validation (best effort)
        try:
            import re, requests
            urls = re.findall(r"https?://[^\s)]+", web_search_output or "")
            validated = []
            seen = set()
            for u in urls[:30]:  # cap to avoid long checks
                if u in seen:
                    continue
                seen.add(u)
                status = None
                try:
                    r = requests.head(u, timeout=5, allow_redirects=True)
                    status = r.status_code
                except Exception:
                    status = None
                validated.append({"url": u, "status": status})
        except Exception:
            validated = []

        response = {
            "query": search_query,
            "selected_name": product_name,
            "selected_specs": selected_specs,
            "page": page,
            "page_size": page_size,
            "results": [],
            "summary": {
                "found": 0,
                "missing_fields_count": 0,
                "notes": f"Web search results for {product_name}"
            },
            "output_text": web_search_output,
            "validated_links": validated
        }
        
        return JSONResponse(response)
        
    except Exception as e:
        logger.error(f"Error in vendor finder: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

def generate_vendor_search_query(selected_variant: dict, kpa_recommendations: dict = None) -> str:
    """Generate enhanced search query for vendor finding."""
    product_name = selected_variant.get("title", "")
    summary = selected_variant.get("summary", "")
    price = selected_variant.get("est_unit_price_usd", 0)
    
    # Build query with vendor focus
    query_parts = [
        f'"{product_name}"',
        "US vendor",
        "in stock",
        f"under ${price:.0f}" if price > 0 else "",
        "deliver to Wichita KS",
        "within 30 days"
    ]
    
    # Add vendor-specific terms
    if kpa_recommendations:
        vendor_search = kpa_recommendations.get("vendor_search", {})
        if vendor_search.get("spec_fragments"):
            query_parts.extend(vendor_search["spec_fragments"][:3])
    
    return " ".join(filter(None, query_parts))

# ----------------------------------------------------------------------------
# SEARCH QUERY BUILDER ENDPOINTS
# ----------------------------------------------------------------------------

# In-memory state (replace with DB if needed)
CURRENT_SELECTION: dict = {}
CURRENT_QUERY: dict = {}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SIMPLE SEARCH QUERY BUILDER - Directly from variant (no LLM needed)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def build_search_query_from_variant(selection: dict) -> dict:
    """
    Build search query DIRECTLY from selected variant.
    No LLM needed - just extract product name and ALL metrics.
    """
    product_name = selection.get("product_name", "product")
    variant = selection.get("selected_variant", {})
    metrics = variant.get("metrics", {})
    must = variant.get("must", [])
    
    # Start with product name
    query_parts = [product_name]
    
    # Add ALL metric values
    for key, value in metrics.items():
        if value and str(value).lower() not in ["", "none", "n/a", "false", "true"]:
            query_parts.append(str(value))
    
    # Add must-have requirements
    for req in must:
        if isinstance(req, dict):
            key_val = req.get("key", "")
            if key_val:
                # Extract just the main term (e.g., "NDAA" from "NDAA §889 compliance")
                main_term = key_val.split()[0]
                if len(main_term) > 2:
                    query_parts.append(main_term)
        elif isinstance(req, str) and req:
            main_term = req.split()[0]
            if len(main_term) > 2:
                query_parts.append(main_term)
    
    # Build simple query
    solid_query = " ".join(query_parts)
    
    # Build subtitle for UI
    subtitle_parts = []
    delivery_loc = selection.get("delivery_location")
    if delivery_loc:
        city = delivery_loc.get("city", "")
        state = delivery_loc.get("state", "")
        if city and state:
            subtitle_parts.append(f"{city}, {state}")
        elif state:
            subtitle_parts.append(state)
    
    delivery_window = selection.get("delivery_window_days")
    if delivery_window:
        subtitle_parts.append(f"within {delivery_window} days")
    
    qty = variant.get("quantity", 1)
    if qty > 1:
        subtitle_parts.append(f"Qty: {qty}")
    
    return {
        "solid_query": solid_query,
        "alternates": [],  # Can add variations later if needed
        "display_subtitle": " • ".join(subtitle_parts) if subtitle_parts else "USA delivery"
    }

@app.post("/api/search-query/build")
async def build_search_query(req: Request):
    """Build comprehensive search query using LLM-based intelligent builder."""
    global CURRENT_SELECTION, CURRENT_QUERY
    
    try:
        body = await req.json()
        
        # Store selection
        CURRENT_SELECTION = body
        
        # Add delivery location defaults if not provided
        if "delivery_location" not in CURRENT_SELECTION:
            CURRENT_SELECTION["delivery_location"] = {"city": "Wichita", "state": "KS"}
        if "delivery_window_days" not in CURRENT_SELECTION:
            CURRENT_SELECTION["delivery_window_days"] = 30
        
        logger.info(f"🔨 Building comprehensive search query with LLM...")
        
        # Use new LLM-based query builder for intelligent, natural queries
        query_text = generate_natural_search_instruction(CURRENT_SELECTION)
        
        logger.info(f"✅ Generated query length: {len(query_text)} chars")
        logger.info(f"📝 Query preview: {query_text[:200]}...")
        
        # Build response in expected format
        CURRENT_QUERY = {
            "solid_query": query_text,
            "alternates": [],  # LLM generates one perfect query
            "display_subtitle": f"AI-optimized query • {len(query_text)} chars"
        }
        
        return JSONResponse(CURRENT_QUERY)
    except Exception as e:
        logger.error(f"Error building search query with LLM: {e}")
        # Fallback to simple query
        CURRENT_QUERY = build_search_query_from_variant(CURRENT_SELECTION)
        return JSONResponse(CURRENT_QUERY)

@app.patch("/api/search-query")
async def edit_search_query(req: Request):
    """Edit the search query text (simple replacement)."""
    global CURRENT_QUERY
    
    try:
        body = await req.json()
        new_query = body.get("solid_query", "")
        
        if not CURRENT_QUERY:
            return JSONResponse(
                {"error": "Build the query first (/api/search-query/build)."}, 
                status_code=400
            )
        
        # Simple replacement - just update the query text
        CURRENT_QUERY["solid_query"] = new_query.strip()
        
        logger.info(f"Updated search query to: {new_query[:100]}")
        
        return JSONResponse({
            "solid_query": CURRENT_QUERY["solid_query"], 
            "alternates": CURRENT_QUERY.get("alternates", []),
            "display_subtitle": CURRENT_QUERY.get("display_subtitle", "")
        })
    except Exception as e:
        logger.error(f"Error editing search query: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

@app.get("/api/search-query")
async def get_search_query():
    """Get the current search query."""
    if not CURRENT_QUERY:
        return JSONResponse(
            {"error": "No query yet. Call /api/search-query/build."}, 
            status_code=404
        )
    return JSONResponse(CURRENT_QUERY)


# ----------------------------------------------------------------------------
# RFQ GENERATION ENDPOINTS
# ----------------------------------------------------------------------------

# Import RFQ service
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), "rfq"))
from rfq_service import RFQPayload, generate_rfq_html, save_rfq, validate_payload  # pyright: ignore[reportMissingImports]

# Import Post-Cart service
from post_cart_service import PostCartService

@app.post("/api/rfq/generate")
async def generate_rfq_endpoint(req: Request):
    """
    Generate RFQ document from user selection and vendor choices.
    
    Expected payload:
    {
      "procurement_kind": "Purchase Order",
      "service_program": "Applied Research",
      "kmi_technical_poc": "Name",
      "projects_supported": ["KMI-355"],
      "estimated_cost": 30000,
      "pop_start": "2025-11-01",
      "pop_end": "2025-12-15",
      "product_name": "...",
      "scope_brief": "...",
      "selected_variant": {...},
      "ai_ranked_vendors": [{...}],
      "selected_vendor_ids": ["vendor1", "vendor2"]
    }
    """
    try:
        body = await req.json()
        
        # Validate payload
        is_valid, error_msg = validate_payload(body)
        if not is_valid:
            return JSONResponse({"error": error_msg}, status_code=400)
        
        # Create RFQ payload
        rfq_payload = RFQPayload(
            procurement_kind=body.get("procurement_kind", "Purchase Order"),
            service_program=body.get("service_program", "Applied Research"),
            kmi_technical_poc=body.get("kmi_technical_poc", ""),
            projects_supported=body.get("projects_supported", []),
            estimated_cost=float(body.get("estimated_cost", 0)),
            pop_start=body.get("pop_start", ""),
            pop_end=body.get("pop_end", ""),
            suggested_type=body.get("suggested_type", "Purchase Order"),
            competition_type=body.get("competition_type", "Competitive"),
            product_name=body.get("product_name", ""),
            scope_brief=body.get("scope_brief", ""),
            selected_variant=body.get("selected_variant"),
            ai_ranked_vendors=body.get("ai_ranked_vendors", []),
            selected_vendor_ids=body.get("selected_vendor_ids", []),
            attachments=body.get("attachments", [])
        )
        
        # Generate and save RFQ
        result = save_rfq(rfq_payload, format="html")
        
        logger.info(f"Generated RFQ: {result['rfq_id']} for {len(rfq_payload.selected_vendors)} vendors")
        
        return JSONResponse(result)
        
    except Exception as e:
        logger.error(f"Error generating RFQ: {e}", exc_info=True)
        return JSONResponse({"error": f"Error generating RFQ: {str(e)}"}, status_code=500)

@app.get("/api/rfq/download/{filename}")
async def download_rfq(filename: str):
    """Download generated RFQ file."""
    from fastapi.responses import FileResponse
    
    file_path = pathlib.Path(__file__).parent / "rfq" / "generated" / filename
    
    if not file_path.exists():
        return JSONResponse({"error": "File not found"}, status_code=404)
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="text/html" if filename.endswith(".html") else "application/pdf"
    )


# ----------------------------------------------------------------------------
# PROCUREMENT SUMMARY DOCUMENT ENDPOINTS (Draft + Finalize + Download)
# ----------------------------------------------------------------------------

# Import Procurement Document service
from procurement_doc.schema import ProcurementDocumentV1  # pyright: ignore[reportMissingImports]
from procurement_doc.service import render_draft_html, finalize_and_store  # pyright: ignore[reportMissingImports]


@app.post("/api/procurements")
async def upsert_procurement(req: Request):
    """Create/Update procurement payload (idempotent by meta.requestId). Stored only on finalize; draft rendering is stateless here."""
    try:
        body = await req.json()
        # Validate minimal shape; deeper validation can be added later
        meta = (body or {}).get("meta", {})
        if not meta.get("requestId"):
            return JSONResponse({"error": "meta.requestId is required"}, status_code=400)
        # Echo back for now; frontends can hold the working copy
        return JSONResponse({"ok": True, "payload": body})
    except Exception as e:
        logger.error(f"Error upserting procurement: {e}", exc_info=True)
        return JSONResponse({"error": f"Error: {str(e)}"}, status_code=500)


@app.get("/api/procurements/{request_id}")
async def get_procurement(request_id: str):
    """Fetch finalized payload if exists; otherwise 404."""
    try:
        root = pathlib.Path(__file__).parent / "procurement_doc" / "generated" / "procurements" / request_id
        if not root.exists():
            return JSONResponse({"error": "Not found"}, status_code=404)
        # Choose latest version by directory order (only v1.0.0 for now)
        versions = sorted([p.name for p in root.iterdir() if p.is_dir()])
        if not versions:
            return JSONResponse({"error": "No versions"}, status_code=404)
        latest = versions[-1]
        payload_path = root / latest / "payload.json"
        if not payload_path.exists():
            return JSONResponse({"error": "No payload"}, status_code=404)
        return JSONResponse(json.loads(payload_path.read_text("utf-8")))
    except Exception as e:
        logger.error(f"Error fetching procurement: {e}", exc_info=True)
        return JSONResponse({"error": f"Error: {str(e)}"}, status_code=500)


@app.post("/api/procurements/{request_id}/draft")
async def render_procurement_draft(request_id: str, req: Request):
    """Render HTML draft (returns {html, warnings})."""
    try:
        body = await req.json()
        # Force ids and timestamps
        now = datetime.now().isoformat()
        body.setdefault("docVersion", "1.0.0")
        body.setdefault("meta", {})
        body["meta"].update({
            "requestId": request_id,
            "lastUpdatedAt": now,
        })

        # Construct schema object and render
        payload = ProcurementDocumentV1(**body)  # type: ignore[arg-type]
        html, info = render_draft_html(payload)
        return JSONResponse({"html": html, **info})
    except Exception as e:
        logger.error(f"Error rendering procurement draft: {e}", exc_info=True)
        return JSONResponse({"error": f"Error: {str(e)}"}, status_code=500)


@app.post("/api/procurements/{request_id}/final")
async def finalize_procurement(request_id: str, req: Request):
    """Finalize: freeze HTML, stamp version+hash, store, return download links."""
    try:
        body = await req.json()
        now = datetime.now().isoformat()
        body.setdefault("docVersion", "1.0.0")
        body.setdefault("meta", {})
        body["meta"].update({
            "requestId": request_id,
            "lastUpdatedAt": now,
        })

        payload = ProcurementDocumentV1(**body)  # type: ignore[arg-type]
        result = finalize_and_store(payload)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error finalizing procurement: {e}", exc_info=True)
        return JSONResponse({"error": f"Error: {str(e)}"}, status_code=500)


@app.get("/api/procurements/{request_id}/download")
async def download_procurement(request_id: str, format: str = "html", version: str = "1.0.0"):
    from fastapi.responses import FileResponse
    try:
        base = pathlib.Path(__file__).parent / "procurement_doc" / "generated" / "procurements" / request_id / version
        if format == "html":
            file_path = base / "final.html"
            if not file_path.exists():
                return JSONResponse({"error": "Final document not found"}, status_code=404)
            return FileResponse(path=str(file_path), filename=f"{request_id}-v{version}.html", media_type="text/html")
        elif format in ("pdf", "docx"):
            return JSONResponse({"error": f"{format.upper()} not implemented"}, status_code=501)
        else:
            return JSONResponse({"error": "Unsupported format"}, status_code=400)
    except Exception as e:
        logger.error(f"Error downloading procurement doc: {e}", exc_info=True)
        return JSONResponse({"error": f"Error: {str(e)}"}, status_code=500)

# ----------------------------------------------------------------------------
# KPA ONE-FLOW API ENDPOINTS
# ----------------------------------------------------------------------------

@app.post("/api/intake_recommendations")
async def intake_recommendations(req: Request):
    """
    Start KPA One-Flow intake process.
    Generates follow-up questions based on initial product details.
    """
    try:
        body = await req.json()
        
        # Extract and validate required fields
        product_name = (body.get("product_name") or "").strip()
        budget_usd = float(body.get("budget_usd") or 0)
        quantity = int(body.get("quantity") or 1)
        scope_text = (body.get("scope_text") or "").strip()
        
        if not product_name:
            raise HTTPException(400, "product_name is required")
        if quantity < 1:
            raise HTTPException(400, "quantity must be >= 1")
        if budget_usd < 0:
            raise HTTPException(400, "budget_usd must be >= 0")
        
        # Normalize scope from multiple sources
        scope = normalize_scope(
            scope_text,
            body.get("uploaded_summaries") or [],
            body.get("project_context") or {},
            body.get("vendors") or []
        )
        
        # Use existing session or create new one
        session_id = body.get("session_id") or str(uuid.uuid4())
        
        # Run intake process
        intake = run_intake(product_name, budget_usd, quantity, scope)
        
        # Prevent repeated questions by checking session history
        prev_session = kpa_session_store.get(session_id) or {}
        asked_questions = set(prev_session.get("asked_questions") or [])
        
        # Filter out already asked questions
        new_questions = [
            q for q in (intake.get("missing_info_questions") or [])
            if q not in asked_questions
        ]
        intake["missing_info_questions"] = new_questions
        
        # Update session with new data
        session_data = {
            "product_name": product_name,
            "budget_usd": budget_usd,
            "quantity": quantity,
            "scope_text": scope,
            "intake_result": intake,
            "answers": prev_session.get("answers") or {},
            "asked_questions": list(asked_questions.union(new_questions)),
            "ts": time.time()
        }
        kpa_session_store.set(session_id, session_data)
        
        logger.info(f"Intake completed for session {session_id}: {len(new_questions)} new questions")
        
        return JSONResponse({
            "session_id": session_id,
            "intake": intake
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in intake_recommendations: {e}", exc_info=True)
        return JSONResponse(
            {"error": f"Intake failed: {str(e)}"}, 
            status_code=500
        )


@app.post("/api/submit_followups")
async def submit_followups(req: Request):
    """
    Submit follow-up answers and generate final recommendations.
    """
    try:
        # Parse JSON directly
        body = await req.json()
        logger.info(f"Parsed request body: {body}")
        
        # Ensure body is a dict
        if not isinstance(body, dict):
            logger.error(f"Expected dict, got {type(body)}: {body}")
            raise HTTPException(400, "Invalid request body format")
        
        session_id = body.get("session_id")
        
        if not session_id:
            raise HTTPException(400, "session_id is required")
        
        # Get session data
        session = kpa_session_store.get(session_id)
        if not session:
            raise HTTPException(400, "Invalid or expired session_id")
        
        # Merge new answers with existing ones
        new_answers = body.get("followup_answers") or {}
        merged_answers = {**(session.get("answers") or {}), **new_answers}
        
        # Update session with answers (don't generate recommendations yet)
        session.update({
            "answers": merged_answers,
            "ts": time.time()
        })
        kpa_session_store.set(session_id, session)
        
        logger.info(f"Follow-up answers saved for session {session_id}: {len(merged_answers)} answers")
        
        return JSONResponse({
            "session_id": session_id,
            "answers": merged_answers,
            "message": "Answers saved successfully. Ready to generate project summary."
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in submit_followups: {e}", exc_info=True)
        return JSONResponse(
            {"error": f"Follow-up submission failed: {str(e)}"}, 
            status_code=500
        )


@app.get("/api/session/{session_id}")
async def get_session(session_id: str):
    """
    Get full session data for rehydrating Step 3 after navigation.
    """
    session = kpa_session_store.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found or expired")
    
    return JSONResponse({
        "session_id": session_id,
        "version": session.get("version") or 0,
        "intake": session.get("intake_result") or {},
        "answers": session.get("answers") or {},
        "recommendations": session.get("recommendations") or None
    })


@app.patch("/api/session/{session_id}/answers")
async def patch_answers(session_id: str, req: Request):
    """
    Patch answers (save edits without regenerating yet).
    """
    try:
        session = kpa_session_store.get(session_id)
        if not session:
            raise HTTPException(404, "Session not found or expired")
        
        body = await req.json()
        updates = body.get("followup_answers") or {}
        merged_answers = {**(session.get("answers") or {}), **updates}
        
        session.update({
            "answers": merged_answers,
            "ts": time.time()
        })
        kpa_session_store.set(session_id, session)
        
        return JSONResponse({
            "session_id": session_id,
            "answers": merged_answers,
            "version": session.get("version") or 0
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in patch_answers: {e}", exc_info=True)
        return JSONResponse(
            {"error": f"Answer update failed: {str(e)}"}, 
            status_code=500
        )


@app.post("/api/session/{session_id}/regenerate")
async def regenerate(session_id: str):
    """
    Regenerate recommendations with current answers (explicit re-run).
    """
    try:
        session = kpa_session_store.get(session_id)
        if not session:
            raise HTTPException(404, "Session not found or expired")
        
        # Create comprehensive structured summary for regeneration
        structured_summary = create_structured_summary(
            session, 
            session.get("answers") or {}, 
            session.get("intake_result", {})
        )
        
        logger.info(f"Regenerating with structured summary: {len(structured_summary)} characters")
        
        recs = run_recommendations(
            session["product_name"], 
            session["budget_usd"], 
            session["quantity"], 
            structured_summary
        )
        recs = postprocess_recs(recs)
        
        session.update({
            "merged_scope": structured_summary,
            "recommendations": recs,
            "version": (session.get("version") or 0) + 1,
            "ts": time.time()
        })
        kpa_session_store.set(session_id, session)
        
        logger.info(f"Recommendations regenerated for session {session_id}: {len(recs.get('recommendations', []))} options")
        
        return JSONResponse({
            "session_id": session_id,
            "version": session["version"],
            "recommendations": recs
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in regenerate: {e}", exc_info=True)
        return JSONResponse(
            {"error": f"Regeneration failed: {str(e)}"}, 
            status_code=500
        )


@app.post("/api/session/{session_id}/generate_summary")
async def generate_project_summary(session_id: str):
    """
    Generate comprehensive project summary after follow-up questions are answered.
    This allows user to review and edit before generating recommendations.
    """
    try:
        session = kpa_session_store.get(session_id)
        if not session:
            raise HTTPException(404, "Session not found or expired")
        
        # Create comprehensive structured summary
        structured_summary = create_structured_summary(
            session, 
            session.get("answers") or {}, 
            session.get("intake_result", {})
        )
        
        # Generate a user-friendly project summary using LLM
        project_summary = generate_user_friendly_summary(
            session,
            session.get("answers") or {},
            structured_summary
        )
        
        # Store the generated summary in session
        session.update({
            "project_summary": project_summary,
            "structured_summary": structured_summary,
            "ts": time.time()
        })
        kpa_session_store.set(session_id, session)
        
        logger.info(f"Project summary generated for session {session_id}: {len(project_summary)} characters")
        
        return JSONResponse({
            "session_id": session_id,
            "project_summary": project_summary,
            "structured_summary": structured_summary
        })
        
    except Exception as e:
        logger.error(f"Error generating project summary: {str(e)}")
        return JSONResponse(
            {"error": f"Project summary generation failed: {str(e)}"}, 
            status_code=500
        )


@app.post("/api/session/{session_id}/generate_recommendations")
async def generate_final_recommendations(session_id: str):
    """
    Generate final recommendations after user has reviewed and confirmed the project summary.
    """
    try:
        session = kpa_session_store.get(session_id)
        if not session:
            raise HTTPException(404, "Session not found or expired")
        
        # Use the stored structured summary or create a new one
        structured_summary = session.get("structured_summary")
        if not structured_summary:
            structured_summary = create_structured_summary(
                session, 
                session.get("answers") or {}, 
                session.get("intake_result", {})
            )
        
        logger.info(f"Generating final recommendations with structured summary: {len(structured_summary)} characters")
        logger.info(f"Session data: product_name={session.get('product_name')}, budget_usd={session.get('budget_usd')}, quantity={session.get('quantity')}")
        logger.info(f"Structured summary preview: {structured_summary[:300]}...")
        
        # Generate final recommendations using structured summary
        recs = run_recommendations(
            session["product_name"],
            session["budget_usd"],
            session["quantity"],
            structured_summary
        )
        
        # Postprocess recommendations (sort, validate, etc.)
        recs = postprocess_recs(recs)
        
        # Update session with final recommendations
        session.update({
            "recommendations": recs,
            "version": (session.get("version") or 0) + 1,
            "ts": time.time()
        })
        kpa_session_store.set(session_id, session)
        
        logger.info(f"Final recommendations generated for session {session_id}: {len(recs.get('recommendations', []))} options")
        
        return JSONResponse({
            "session_id": session_id,
            "version": session["version"],
            "recommendations": recs
        })
        
    except Exception as e:
        logger.error(f"Error generating final recommendations: {str(e)}")
        return JSONResponse(
            {"error": f"Recommendation generation failed: {str(e)}"}, 
            status_code=500
        )


# ----------------------------------------------------------------------------
# POST-CART PHASE ENDPOINTS
# ----------------------------------------------------------------------------

# Initialize Post-Cart service
post_cart_service = PostCartService()

@app.post("/api/post-cart/evaluate-vendors")
async def evaluate_vendors_endpoint(req: Request):
    """Evaluate vendor information using LLM to extract complete details and perform bot validation"""
    try:
        body = await req.json()
        from vendor_evaluation_service import (
            evaluate_vendors_with_llm, 
            format_vendor_evaluation_description,
            get_complete_vendor_analysis
        )
        from services.openai_client import get_client
        
        vendors = body.get("vendors", [])
        product_name = body.get("product_name", "Product")
        budget_usd = float(body.get("budget_usd", 0))
        quantity = int(body.get("quantity", 1))
        
        if not vendors:
            return JSONResponse({"error": "No vendors provided"}, status_code=400)
        
        # Evaluate vendors using LLM
        client = get_client()
        evaluated = evaluate_vendors_with_llm(vendors, client, product_name, budget_usd, quantity)
        
        # Format description for procurement document
        description = format_vendor_evaluation_description(evaluated)
        
        # Get complete analysis including validation and document generation
        complete_analysis = get_complete_vendor_analysis(evaluated, product_name, quantity, client)
        
        return JSONResponse({
            "evaluated_vendors": evaluated,
            "evaluation_description": description,
            "summary": {
                "total_vendors": len(evaluated),
                "vendors_in_stock": sum(1 for v in evaluated if v.get('availability', {}).get('in_stock', False)),
                "avg_lead_time": int(sum(v.get('availability', {}).get('lead_time_days', 30) if isinstance(v.get('availability', {}).get('lead_time_days'), (int, float)) else 30 for v in evaluated) / len(evaluated)) if evaluated else 30
            },
            # New bot validation and document generation fields
            "analysis": complete_analysis
        })
    except Exception as e:
        logger.error(f"Error evaluating vendors: {e}", exc_info=True)
        return JSONResponse({"error": f"Error evaluating vendors: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/g1-evaluate")
async def evaluate_g1_endpoint(req: Request):
    """Evaluate G1 decision gate for procurement readiness"""
    try:
        body = await req.json()
        result = post_cart_service.evaluate_g1(body)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error evaluating G1: {e}", exc_info=True)
        return JSONResponse({"error": f"Error evaluating G1: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/g1-explain")
async def explain_g1_endpoint(req: Request):
    """Return a plain-language explanation and fixes for a given G1 result.
    This is a lightweight, deterministic helper (no LLM required for MVP)."""
    try:
        body = await req.json()
        g1 = body.get("g1Result", {})
        passed = bool(g1.get("passed"))
        reasons = g1.get("reasonCodes", []) or []
        missing = g1.get("missingItems", []) or []
        approvers = g1.get("requiredApprovers", []) or []

        summary = "Ready for Approvals" if passed else "Recommend RFQs"
        fixes = []
        if not passed:
            for r in reasons:
                if r == "MISSING_PRICE":
                    fixes.append("Provide unit price, currency, and quantity for each item per vendor.")
                elif r == "INSUFFICIENT_EVIDENCE":
                    fixes.append("Attach quote evidence or vendor contact details (email/URL).")
                elif r == "INSUFFICIENT_SPECS":
                    fixes.append("Add specs per line (UOM, lead time, delivery terms, validity).")
                elif r == "SOLE_SOURCE_JUST_REQUIRED":
                    fixes.append("Add Sole Source Justification or switch to RFQs.")
                elif r == "CONTRACT_REQUIRED":
                    fixes.append("Upload executed contract or adjust procurement type.")
                else:
                    fixes.append(f"Resolve: {r}.")

        approver_explain = [f"{a}: required by policy/rules" for a in approvers]
        return JSONResponse({"summary": summary, "fixes": fixes, "approverExplain": approver_explain})
    except Exception as e:
        logger.error(f"Error explaining G1: {e}", exc_info=True)
        return JSONResponse({"error": f"Error explaining G1: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/pr")
async def create_pr_endpoint(req: Request):
    """Create a new PR (Path A - Direct Procurement Approvals)"""
    try:
        body = await req.json()
        result = post_cart_service.create_pr(body)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error creating PR: {e}", exc_info=True)
        return JSONResponse({"error": f"Error creating PR: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/approvals/route")
async def start_approval_routing_endpoint(req: Request):
    """Start approval routing for a PR"""
    try:
        body = await req.json()
        pr_id = body.get("prId")
        approval_route = body.get("approvalRoute", {})
        
        if not pr_id:
            return JSONResponse({"error": "PR ID is required"}, status_code=400)
        
        result = post_cart_service.start_approval_routing(pr_id, approval_route)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error starting approval routing: {e}", exc_info=True)
        return JSONResponse({"error": f"Error starting approval routing: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/approvals/{pr_id}/action")
async def submit_approval_action_endpoint(pr_id: str, req: Request):
    """Submit approval action for a PR"""
    try:
        body = await req.json()
        role = body.get("role")
        action = body.get("action")
        comment = body.get("comment")
        
        if not role or not action:
            return JSONResponse({"error": "Role and action are required"}, status_code=400)
        
        # For now, just return success - full implementation would update PR status
        return JSONResponse({"success": True, "message": f"Approval action {action} submitted for {role}"})
    except Exception as e:
        logger.error(f"Error submitting approval action: {e}", exc_info=True)
        return JSONResponse({"error": f"Error submitting approval action: {str(e)}"}, status_code=500)

@app.get("/api/post-cart/pr/{pr_id}")
async def get_pr_status_endpoint(pr_id: str):
    """Get PR status"""
    try:
        result = post_cart_service.get_pr_status(pr_id)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error getting PR status: {e}", exc_info=True)
        return JSONResponse({"error": f"Error getting PR status: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/generate")
async def generate_rfq_endpoint(req: Request):
    """Generate RFQ (Path B - RFQ Generation & Management)"""
    try:
        body = await req.json()
        result = post_cart_service.generate_rfq(body)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error generating RFQ: {e}", exc_info=True)
        return JSONResponse({"error": f"Error generating RFQ: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/draft")
async def draft_rfq_endpoint(req: Request):
    """Draft an RFQ message (subject + markdown body) for a vendor."""
    try:
        body = await req.json()
        vendor = body.get("vendor", {})
        items = body.get("lineItems", [])
        due = body.get("dueDate")
        terms = body.get("terms", {})
        v_name = vendor.get("name") or vendor.get("id") or "Vendor"
        subject = f"Request for Quote – {v_name}"
        lines = "\n".join([f"- {it.get('desc','Item')} x{it.get('qty',1)} ({it.get('uom','EA')})" for it in items])
        body_md = (
            f"Hello {v_name},\n\n"
            f"Please provide a quote for the following items by {due}:\n\n"
            f"{lines}\n\n"
            f"Terms:\n- Delivery: {terms.get('delivery','FOB Destination')}\n- Payment: {terms.get('payment','Net 30')}\n\n"
            f"Thank you,\nProcurement Team"
        )
        return JSONResponse({"subject": subject, "body_md": body_md})
    except Exception as e:
        logger.error(f"Error drafting RFQ: {e}", exc_info=True)
        return JSONResponse({"error": f"Error drafting RFQ: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/email/prepare")
async def prepare_email_endpoint(req: Request):
    """Prepare a simple email payload for various intents (rfq_send, reminder, approver_request)."""
    try:
        body = await req.json()
        intent = body.get("intent", "generic")
        recipient = body.get("recipient", "")
        context = body.get("context", {})
        subject = f"{intent.replace('_',' ').title()}"
        body_text = f"Hello,\n\nThis is an automated message regarding: {intent}.\n\nDetails:\n{json.dumps(context, indent=2)}\n\nRegards,\nProcurement"
        body_html = f"<p>Hello,</p><p>This is an automated message regarding: <b>{intent}</b>.</p><pre>{json.dumps(context, indent=2)}</pre><p>Regards,<br/>Procurement</p>"
        return JSONResponse({"subject": subject, "body_text": body_text, "body_html": body_html})
    except Exception as e:
        logger.error(f"Error preparing email: {e}", exc_info=True)
        return JSONResponse({"error": f"Error preparing email: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/{rfq_id}/send")
async def send_rfq_endpoint(rfq_id: str):
    """Send RFQ to vendors"""
    try:
        result = post_cart_service.send_rfq(rfq_id)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error sending RFQ: {e}", exc_info=True)
        return JSONResponse({"error": f"Error sending RFQ: {str(e)}"}, status_code=500)

@app.get("/api/post-cart/rfq/{rfq_id}")
async def get_rfq_status_endpoint(rfq_id: str):
    """Get RFQ status and responses"""
    try:
        result = post_cart_service.get_rfq_status(rfq_id)
        return JSONResponse(result)
    except Exception as e:
        logger.error(f"Error getting RFQ status: {e}", exc_info=True)
        return JSONResponse({"error": f"Error getting RFQ status: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/{rfq_id}/response")
async def upload_rfq_response_endpoint(rfq_id: str, req: Request):
    """Upload RFQ response from vendor"""
    try:
        body = await req.json()
        vendor_id = body.get("vendorId")
        response_data = body.get("response", {})
        
        if not vendor_id:
            return JSONResponse({"error": "Vendor ID is required"}, status_code=400)
        
        # For now, just return success - full implementation would store response
        return JSONResponse({"success": True, "message": f"RFQ response uploaded for vendor {vendor_id}"})
    except Exception as e:
        logger.error(f"Error uploading RFQ response: {e}", exc_info=True)
        return JSONResponse({"error": f"Error uploading RFQ response: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/{rfq_id}/comparison")
async def generate_comparison_matrix_endpoint(rfq_id: str):
    """Generate comparison matrix for RFQ responses"""
    try:
        # For now, return mock comparison data
        comparison_data = {
            "vendors": ["Vendor A", "Vendor B"],
            "criteria": ["Price", "Lead Time", "Quality"],
            "scores": {
                "Vendor A": {"Price": 8, "Lead Time": 7, "Quality": 9},
                "Vendor B": {"Price": 9, "Lead Time": 8, "Quality": 7}
            },
            "weightedTotal": {"Vendor A": 8.0, "Vendor B": 8.0},
            "recommendation": "Vendor A"
        }
        return JSONResponse(comparison_data)
    except Exception as e:
        logger.error(f"Error generating comparison matrix: {e}", exc_info=True)
        return JSONResponse({"error": f"Error generating comparison matrix: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/rfq/{rfq_id}/finalize")
async def finalize_rfq_selection_endpoint(rfq_id: str, req: Request):
    """Finalize RFQ selection and create PR"""
    try:
        body = await req.json()
        selected_vendor_id = body.get("selectedVendorId")
        justification = body.get("justification")
        
        if not selected_vendor_id:
            return JSONResponse({"error": "Selected vendor ID is required"}, status_code=400)
        
        # For now, return mock PR ID - full implementation would create actual PR
        pr_id = f"PR-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{str(uuid.uuid4())[:8]}"
        return JSONResponse({"prId": pr_id, "message": "RFQ selection finalized and PR created"})
    except Exception as e:
        logger.error(f"Error finalizing RFQ selection: {e}", exc_info=True)
        return JSONResponse({"error": f"Error finalizing RFQ selection: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/documents/upload")
async def upload_document_endpoint(req: Request):
    """Upload document for PR or RFQ"""
    try:
        # For now, return mock document reference
        doc_ref = {
            "type": "Quote",
            "url": "/api/post-cart/documents/mock-doc-123/download",
            "filename": "quote.pdf",
            "hash": "abc123def456",
            "uploadedAt": datetime.now().isoformat()
        }
        return JSONResponse(doc_ref)
    except Exception as e:
        logger.error(f"Error uploading document: {e}", exc_info=True)
        return JSONResponse({"error": f"Error uploading document: {str(e)}"}, status_code=500)

@app.get("/api/post-cart/documents/{doc_id}/download")
async def download_document_endpoint(doc_id: str):
    """Download document"""
    try:
        # For now, return mock file content
        return JSONResponse({"message": f"Download endpoint for document {doc_id} - not implemented yet"})
    except Exception as e:
        logger.error(f"Error downloading document: {e}", exc_info=True)
        return JSONResponse({"error": f"Error downloading document: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/pr/{pr_id}/compliance-docs")
async def generate_compliance_documents_endpoint(pr_id: str):
    """Generate compliance documents (Cover Sheet, Comparison, SSJ)"""
    try:
        # For now, return mock document URLs
        compliance_docs = {
            "coverSheet": "/api/post-cart/documents/cover-sheet.pdf",
            "comparison": "/api/post-cart/documents/comparison.pdf",
            "ssj": "/api/post-cart/documents/ssj.pdf" if pr_id else None
        }
        return JSONResponse(compliance_docs)
    except Exception as e:
        logger.error(f"Error generating compliance documents: {e}", exc_info=True)
        return JSONResponse({"error": f"Error generating compliance documents: {str(e)}"}, status_code=500)

@app.post("/api/post-cart/po/issue")
async def issue_po_endpoint(req: Request):
    """Issue PO when PR is approved"""
    try:
        body = await req.json()
        pr_id = body.get("prId")
        
        if not pr_id:
            return JSONResponse({"error": "PR ID is required"}, status_code=400)
        
        # For now, return mock PO number
        po_number = f"PO-{datetime.now().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8]}"
        return JSONResponse({"poNumber": po_number, "message": f"PO {po_number} issued successfully"})
    except Exception as e:
        logger.error(f"Error issuing PO: {e}", exc_info=True)
        return JSONResponse({"error": f"Error issuing PO: {str(e)}"}, status_code=500)

# ----------------------------------------------------------------------------
# KIBA SESSIONS (Results Stack + State Persistence)
# ----------------------------------------------------------------------------

from copy import deepcopy

def _default_kiba_session(session_id: str) -> Dict[str, Any]:
    now = datetime.now().isoformat()
    return {
        "sessionId": session_id,
        "status": "open",
        "currentStep": "request",
        "steps": {
            "request": {},
            "vendorSearch": {"runs": [], "activeRunId": None},
            "evaluation": {"shortlistVendorIds": [], "notesByVendorId": {}, "attachments": []},
            "selection": {"selectedVendorId": None, "rationale": None, "terms": None, "totalAwardAmount": None},
        },
        "audit": [{"at": now, "by": "system", "event": "session_init"}],
        "version": 1,
    }


@app.get("/api/kiba/sessions/{session_id}")
async def kiba_get_session(session_id: str):
    session = kiba_session_store.get(session_id)
    if not session:
        session = _default_kiba_session(session_id)
        kiba_session_store.set(session_id, session)
    return JSONResponse(session)


@app.patch("/api/kiba/sessions/{session_id}")
async def kiba_patch_session(session_id: str, req: Request):
    try:
        body = await req.json()
        client_version = body.get("version")
        patch = {k: v for k, v in body.items() if k != "version"}

        session = kiba_session_store.get(session_id)
        if not session:
            session = _default_kiba_session(session_id)

        # optimistic concurrency
        if client_version is not None and client_version != session.get("version"):
            return JSONResponse({"error": "version_conflict", "serverVersion": session.get("version")}, status_code=409)

        # shallow merge for top-level; nested callers should send full step objects
        updated = {**session, **patch}
        updated["version"] = int(session.get("version", 1)) + 1
        updated.setdefault("audit", []).append({
            "at": datetime.now().isoformat(),
            "by": "user",
            "event": "patch",
            "payload": list(patch.keys()),
        })

        kiba_session_store.set(session_id, updated)
        return JSONResponse(updated)
    except Exception as e:
        logger.error(f"kiba_patch_session error: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/kiba/sessions/{session_id}/runs")
async def kiba_create_run(session_id: str, req: Request):
    try:
        body = await req.json()
        run = body.get("run") or {}
        if not isinstance(run, dict):
            return JSONResponse({"error": "invalid_run"}, status_code=400)

        session = kiba_session_store.get(session_id)
        if not session:
            session = _default_kiba_session(session_id)

        runs = session["steps"]["vendorSearch"].get("runs") or []
        runs = runs + [run]
        session["steps"]["vendorSearch"]["runs"] = runs
        session["steps"]["vendorSearch"]["activeRunId"] = run.get("runId")
        session["version"] = int(session.get("version", 1)) + 1
        session.setdefault("audit", []).append({
            "at": datetime.now().isoformat(),
            "by": "user",
            "event": "run_created",
            "payload": {"runId": run.get("runId")},
        })

        kiba_session_store.set(session_id, session)
        return JSONResponse(session)
    except Exception as e:
        logger.error(f"kiba_create_run error: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.post("/api/kiba/sessions/{session_id}/close")
async def kiba_close_session(session_id: str):
    try:
        session = kiba_session_store.get(session_id)
        if not session:
            return JSONResponse({"error": "not_found"}, status_code=404)

        # Basic validations
        runs = session["steps"]["vendorSearch"].get("runs") or []
        shortlist = session["steps"]["evaluation"].get("shortlistVendorIds") or []
        selected = session["steps"]["selection"].get("selectedVendorId")
        if len(runs) < 1 or len(shortlist) < 1 or not selected:
            return JSONResponse({"error": "validation_failed"}, status_code=400)

        session = deepcopy(session)
        session["status"] = "closed"
        session["final"] = {
            "activeRunId": session["steps"]["vendorSearch"].get("activeRunId"),
            "vendorsSnapshot": next((r.get("vendorsSnapshot") for r in runs if r.get("runId") == session["steps"]["vendorSearch"].get("activeRunId")), {}),
            "selection": session["steps"]["selection"],
            "steps": session["steps"],
        }
        session["version"] = int(session.get("version", 1)) + 1
        session.setdefault("audit", []).append({
            "at": datetime.now().isoformat(),
            "by": "user",
            "event": "closed",
        })

        kiba_session_store.set(session_id, session)
        return JSONResponse(session)
    except Exception as e:
        logger.error(f"kiba_close_session error: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)

# ----------------------------------------------------------------------------
# START SERVER
# ----------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
