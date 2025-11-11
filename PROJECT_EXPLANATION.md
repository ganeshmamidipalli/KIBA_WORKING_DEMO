# KIBA3 AI-Powered Procurement Platform - Complete Project Explanation

## 📋 Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Complete Workflow - Step by Step](#complete-workflow)
4. [Data Flow](#data-flow)
5. [Key Features](#key-features)
6. [Technology Stack](#technology-stack)
7. [End-to-End Process](#end-to-end-process)

---

## 🎯 Project Overview

**KIBA3** is an AI-powered procurement platform that automates the entire procurement workflow from initial product requirements to final RFQ (Request for Quotation) generation. It uses OpenAI's GPT models to intelligently analyze requirements, generate recommendations, find vendors, and create procurement documents.

### Purpose
- **Automate** procurement intake and requirements gathering
- **Intelligently** recommend products and vendors using AI
- **Streamline** vendor discovery and evaluation
- **Generate** professional RFQ and procurement documents
- **Manage** the complete procurement workflow

---

## 🏗️ Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **UI Library**: Radix UI + Tailwind CSS
- **State Management**: React Hooks (useState, useEffect)
- **Routing**: Step-based navigation (no router, custom step manager)
- **Styling**: Tailwind CSS with custom animations
- **Icons**: Lucide React

### Backend (Python + FastAPI)
- **Framework**: FastAPI (async Python web framework)
- **Server**: Uvicorn (ASGI server)
- **AI Integration**: OpenAI GPT-4 API
- **File Processing**: PDF, DOCX, Excel, Images
- **Template Engine**: Jinja2 (for RFQ documents)
- **Data Validation**: Pydantic

### Communication
- **API**: RESTful API endpoints
- **Data Format**: JSON
- **CORS**: Enabled for frontend-backend communication

---

## 🔄 Complete Workflow - Step by Step

### **STEP 1: Project Context** (`StepProjectContext`)
**Purpose**: Collect project-level information

**What User Enters**:
- Procurement Type (Purchase Order, Contract, etc.)
- Service Program (Applied Research, etc.)
- KMI Technical POC (Point of Contact)
- Selected Project (e.g., KMI-355, BAILIWICK-AISN)
- POP Start Date (Period of Performance Start)
- POP Completion Date

**Validation**:
- All fields are required
- Must select a project

**Data Stored**:
```javascript
{
  procurementType: "Purchase Order",
  serviceProgram: "Applied Research",
  technicalPOC: "John Doe",
  selectedProject: "KMI-355",
  popStart: "2025-01-01",
  popCompletion: "2025-12-31"
}
```

---

### **STEP 2: Product Details** (`StepProductDetails`)
**Purpose**: Collect product requirements and start AI intake

**What User Enters**:
- Product Name
- Category
- Quantity
- Budget (per unit or total)
- Project Scope (detailed requirements)
- Attachments (PDFs, DOCX, images)

**AI Processing**:
- **Starts KPA One-Flow Intake Process**
- Uploads files to backend
- Backend analyzes files using OpenAI
- Extracts key information from documents
- Generates initial scope summary

**Backend API Call**:
```
POST /api/intake_recommendations
```

**Response**:
- `session_id`: Unique session identifier
- `intake`: Contains missing information questions
- `scope_summary`: AI-generated scope summary

**Data Stored**:
```javascript
{
  productName: "Network Switch",
  quantity: "10",
  budget: "5000",
  projectScope: "...",
  attachments: [...],
  kpaSessionId: "session-123",
  intakeData: {...}
}
```

---

### **STEP 3: AI Follow-up Questions** (`StepSpecifications`)
**Purpose**: Answer AI-generated questions to refine requirements

**What Happens**:
- AI analyzes the product requirements
- Identifies missing or unclear information
- Generates follow-up questions

**Example Questions**:
- "What network protocols are required?"
- "Do you need PoE (Power over Ethernet)?"
- "What is the required port count?"
- "Any specific compliance requirements?"

**User Actions**:
- Answers each question
- Can skip questions (mark as N/A)

**Backend API Call**:
```
POST /api/submit_followups
Body: {
  session_id: "session-123",
  followup_answers: {
    "question-1": "Yes, PoE required",
    "question-2": "48 ports minimum"
  }
}
```

**What Happens Next**:
- Answers are saved to session
- System prepares for recommendation generation

---

### **STEP 4: AI Recommendations** (`StepSpecifications`)
**Purpose**: Generate AI-powered product recommendations

**What Happens Automatically**:
- After follow-up questions are answered (or skipped)
- AI generates product recommendations using:
  - Product requirements
  - Budget constraints
  - Quantity needed
  - Follow-up answers
  - Uploaded documents

**Backend API Call**:
```
POST /api/session/{session_id}/generate_recommendations
```

**Response**:
- Multiple product variants/specifications
- Each variant includes:
  - Product name/model
  - Specifications
  - Estimated price
  - Lead time
  - Compliance info (NDAA, TAA, etc.)

**User Actions**:
- Reviews AI-generated recommendations
- Selects one or more variants
- Can edit specifications if needed

**Data Stored**:
```javascript
{
  kpaRecommendations: {
    variants: [
      {
        product_model: "Cisco Catalyst 9300",
        specifications: {...},
        est_unit_price_usd: 4500,
        lead_time_days: 14,
        compliance: ["NDAA", "TAA"]
      },
      ...
    ]
  },
  selectedVariants: [...]
}
```

---

### **STEP 5: Vendor Search** (`StepVendorSearch`)
**Purpose**: Find and evaluate vendors for selected products

**What Happens**:
1. **Auto-Search Triggered**:
   - When step loads, automatically generates search query
   - Uses selected product variants
   - Creates optimized search query using AI

2. **Search Query Generation**:
   ```
   POST /api/search-query/build
   Body: {
     product_variants: [...],
     requirements: {...}
   }
   ```

3. **Web Search Execution**:
   ```
   POST /api/web_search
   Body: {
     query: "Cisco Catalyst 9300 48-port PoE switch",
     max_results: 20
   }
   ```

4. **Vendor Discovery**:
   - Searches web for vendors
   - Finds vendor websites
   - Extracts vendor information
   - Parses product listings

5. **Vendor Parsing**:
   ```
   POST /api/vendor_finder
   Body: {
     search_results: [...],
     product_name: "..."
   }
   ```

**User Actions**:
- Reviews search results
- Sees vendor batches (groups of vendors)
- Can refine search query
- Selects vendors from results
- Can search multiple times

**Data Stored**:
```javascript
{
  searchQuery: "Cisco Catalyst 9300...",
  searchOutputText: "...",
  batches: [
    {
      vendors: [...],
      query: "...",
      timestamp: "..."
    }
  ],
  selectedVendors: [...]
}
```

**Persistence**:
- Search results saved to localStorage
- Selected vendors persist across page refreshes

---

### **STEP 6: CART (Vendor Evaluation & Document Generation)** (`StepCARTEnhanced`)
**Purpose**: Evaluate vendors and generate procurement documents

#### **6A. Vendor Evaluation** (Automatic)
**What Happens**:
- When vendors are selected, automatic evaluation starts
- Backend visits vendor websites
- Extracts real-time information:
  - Price
  - Availability/Lead time
  - Delivery options
  - Contact information
  - Warranty information

**Backend API Call**:
```
POST /api/vendor_evaluation/evaluate
Body: {
  vendors: [...],
  product_name: "...",
  target_location: "Wichita, KS"
}
```

**Evaluation Results**:
- Vendor completeness score
- Missing information flags
- Price verification
- Contact verification
- Delivery confirmation

#### **6B. Path Selection** (Automatic Recommendation)
**System Recommends**:
- **RFQ Path**: If vendor info is incomplete (missing price/contact)
- **Procurement Path**: If vendor info is complete

#### **6C. RFQ Generation** (If RFQ Path Selected)
**What Happens**:
- Generates RFQ (Request for Quotation) document
- Creates Word document (.docx)
- Includes:
  - Product specifications
  - Quantity
  - Delivery requirements
  - Contact information
  - Terms and conditions

**User Actions**:
- Downloads RFQ document
- Can preview before downloading
- Can send RFQ to vendors

#### **6D. Procurement Document Generation** (If Procurement Path Selected)
**What Happens**:
- Generates procurement document
- Includes all Step 1 information:
  - Service Program
  - KMI Technical POC
  - Estimated Costs
  - POP Start/Completion
  - KMI Projects Supported
- Includes vendor evaluation summary
- Includes competition type
- Includes justification

**Backend Processing**:
- Uses Jinja2 template
- Populates with all collected data
- Generates HTML preview
- Generates DOCX document

**Document Sections**:
1. Procurement Type
2. General Information (all Step 1 fields)
3. Scope Brief
4. Competition Type
5. Vendor Evaluation Description
6. Authorized Signature (Knowmadics + POC)

**User Actions**:
- Reviews preview
- Downloads procurement document
- Can proceed to approvals

---

## 📊 Data Flow

### Frontend → Backend Flow

```
Step 1 (Project Context)
  ↓
Step 2 (Product Details)
  ↓ POST /api/intake_recommendations
  ↓ [Backend: AI analyzes requirements]
  ↓ Returns: session_id, intake_data
  ↓
Step 3 (Follow-up Questions)
  ↓ POST /api/submit_followups
  ↓ [Backend: Saves answers]
  ↓
Step 4 (Recommendations)
  ↓ POST /api/session/{id}/generate_recommendations
  ↓ [Backend: AI generates recommendations]
  ↓ Returns: product variants
  ↓
Step 5 (Vendor Search)
  ↓ POST /api/search-query/build
  ↓ POST /api/web_search
  ↓ POST /api/vendor_finder
  ↓ [Backend: Finds and parses vendors]
  ↓ Returns: vendor list
  ↓
Step 6 (CART)
  ↓ POST /api/vendor_evaluation/evaluate
  ↓ [Backend: Evaluates vendors]
  ↓ POST /api/rfq/generate (if RFQ path)
  ↓ [Backend: Generates RFQ document]
  ↓ Returns: RFQ document
```

### State Persistence

**Frontend State**:
- React useState hooks
- localStorage for persistence
- StepManager for step navigation

**Backend State**:
- SessionStore (in-memory)
- Session-based data storage
- File uploads stored temporarily

---

## ✨ Key Features

### 1. **AI-Powered Intake**
- Analyzes uploaded documents
- Extracts key information
- Identifies missing details
- Generates intelligent questions

### 2. **Smart Recommendations**
- Generates multiple product variants
- Considers budget constraints
- Includes compliance information
- Provides pricing estimates

### 3. **Intelligent Vendor Discovery**
- Web search integration
- Real-time vendor information
- Automated vendor evaluation
- Completeness scoring

### 4. **Automated Document Generation**
- RFQ documents
- Procurement documents
- Professional formatting
- Company branding (Knowmadics)

### 5. **Workflow Management**
- Step-based navigation
- Validation at each step
- Progress tracking
- Data persistence

### 6. **Vendor Evaluation**
- Real-time price checking
- Availability verification
- Contact information extraction
- Delivery confirmation

---

## 🛠️ Technology Stack

### Frontend
- **React 18.3.1** - UI framework
- **TypeScript 5.2.2** - Type safety
- **Vite 5.3.4** - Build tool
- **Tailwind CSS 3.4.9** - Styling
- **Radix UI** - Component library
- **Framer Motion** - Animations
- **docx** - Document generation
- **file-saver** - File downloads

### Backend
- **Python 3.9+** - Programming language
- **FastAPI 0.115.0** - Web framework
- **Uvicorn 0.32.0** - ASGI server
- **OpenAI 2.0.0+** - AI/LLM integration
- **Pydantic 2.9.2** - Data validation
- **pypdf** - PDF processing
- **python-docx** - Word documents
- **beautifulsoup4** - Web scraping
- **Jinja2** - Template engine
- **pandas** - Data processing

---

## 🎬 End-to-End Process

### Complete User Journey

1. **User starts new request**
   - Clicks "New Request" button
   - All previous data cleared

2. **Step 1: Project Context** (2-3 minutes)
   - Fills in project information
   - Selects procurement type
   - Enters POC details
   - Selects project

3. **Step 2: Product Details** (3-5 minutes)
   - Enters product name
   - Specifies quantity and budget
   - Writes project scope
   - Uploads documents (optional)
   - **AI starts analyzing**

4. **Step 3: Follow-up Questions** (2-4 minutes)
   - Reviews AI-generated questions
   - Answers questions
   - Can skip questions

5. **Step 4: Recommendations** (1-2 minutes)
   - **AI generates recommendations**
   - Reviews product variants
   - Selects preferred variants

6. **Step 5: Vendor Search** (3-5 minutes)
   - **Auto-search executes**
   - Reviews vendor results
   - Refines search if needed
   - Selects vendors

7. **Step 6: CART** (5-10 minutes)
   - **Vendor evaluation runs automatically**
   - Reviews evaluation results
   - Chooses path (RFQ or Procurement)
   - Generates documents
   - Downloads final documents

### Total Time: ~20-30 minutes for complete workflow

### Data Persistence

**Throughout the workflow**:
- All data saved to localStorage
- Session ID stored
- Search results persisted
- Selected vendors saved
- Can refresh page without losing data

**"New Request" Button**:
- Clears all data
- Resets to Step 1
- Clears localStorage
- Starts fresh workflow

---

## 🔧 Technical Implementation Details

### Step Manager
- Custom hook: `useStepManager`
- Manages step navigation
- Validates each step
- Persists step data
- Handles step dependencies

### API Client
- Centralized API configuration
- Error handling
- Retry logic
- Type-safe API calls

### State Management
- React hooks (useState, useEffect)
- localStorage for persistence
- StepManager for workflow state
- Context for theme management

### Document Generation
- **RFQ**: Uses docx library (frontend)
- **Procurement**: Uses Jinja2 templates (backend)
- **Preview**: HTML preview before download
- **Download**: File-saver for client-side downloads

### AI Integration
- OpenAI GPT-4 API
- Structured prompts
- Error handling
- Fallback mechanisms
- Token usage tracking

---

## 📝 Summary

**KIBA3** is a complete AI-powered procurement platform that:

1. **Collects** project and product requirements
2. **Analyzes** requirements using AI
3. **Generates** intelligent follow-up questions
4. **Recommends** products using AI
5. **Finds** vendors through web search
6. **Evaluates** vendors automatically
7. **Generates** professional procurement documents

**Key Benefits**:
- ✅ Reduces manual work
- ✅ AI-powered intelligence
- ✅ Automated vendor discovery
- ✅ Professional document generation
- ✅ Complete workflow management
- ✅ Data persistence
- ✅ User-friendly interface

**Result**: A streamlined, intelligent procurement process that saves time and ensures compliance.

