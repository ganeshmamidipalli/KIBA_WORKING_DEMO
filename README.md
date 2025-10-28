# KIBA3 - AI-Powered Procurement Platform

## 🚀 Overview

KIBA3 is a comprehensive AI-powered procurement platform designed to streamline the entire procurement process from initial requirements gathering to final purchase order generation. The platform leverages advanced AI capabilities to provide intelligent recommendations, vendor matching, and automated RFQ generation.

## 🏗️ Architecture

The project consists of two main components:

- **Backend**: FastAPI-based Python server providing AI-powered procurement APIs
- **Frontend**: React + TypeScript + Vite application with modern UI components

## 📁 Project Structure

```
KIBA3.V1-for-demo-main/
├── backend/                          # Python FastAPI Backend
│   ├── services/                     # Core business logic services
│   │   ├── openai_client.py         # OpenAI API client configuration
│   │   ├── procurement_intake.py    # Initial requirements processing
│   │   ├── procurement_recommend.py # AI recommendation engine
│   │   ├── prompt_templates.py      # LLM prompt templates
│   │   └── schema_definitions.py    # Data models and schemas
│   ├── utils/                        # Utility functions
│   │   ├── recs_utils.py            # Recommendation processing utilities
│   │   ├── scope_utils.py           # Scope normalization utilities
│   │   └── store.py                 # Session storage management
│   ├── vendor_finder/                # Vendor discovery and matching
│   │   ├── api.py                   # Vendor API integrations
│   │   ├── cache.py                 # Caching mechanisms
│   │   ├── models.py                # Vendor data models
│   │   ├── service.py               # Vendor service logic
│   │   └── pipeline/                # Vendor search pipeline
│   │       ├── extractor.py         # Data extraction
│   │       ├── paginate.py          # Pagination handling
│   │       ├── ranker.py            # Vendor ranking algorithms
│   │       ├── retriever.py         # Vendor retrieval
│   │       └── validator.py         # Data validation
│   ├── rfq/                         # RFQ generation system
│   │   ├── rfq_service.py          # RFQ generation logic
│   │   ├── rfq_config.yaml         # RFQ configuration
│   │   └── generated/               # Generated RFQ documents
│   ├── logs/                        # Application logs
│   ├── server.py                    # Main FastAPI application
│   ├── requirements.txt             # Python dependencies
│   └── .env.local                   # Environment configuration
├── frontend-new/                     # React Frontend Application
│   ├── src/
│   │   ├── components/              # React components
│   │   │   ├── steps/               # Multi-step workflow components
│   │   │   │   ├── StepCARTEnhanced.tsx      # Enhanced cart management
│   │   │   │   ├── StepProductDetails.tsx    # Product specification input
│   │   │   │   ├── StepProjectContext.tsx    # Project context setup
│   │   │   │   ├── StepProjectSummary.tsx    # Project summary review
│   │   │   │   ├── StepRFQ.tsx               # RFQ generation
│   │   │   │   ├── StepRFQProcurement.tsx    # RFQ procurement workflow
│   │   │   │   ├── StepRFQProcurementSimple.tsx # Simplified RFQ workflow
│   │   │   │   ├── StepSpecifications.tsx    # Technical specifications
│   │   │   │   └── StepVendorSearch.tsx     # Vendor search and selection
│   │   │   ├── theme-provider.tsx   # Theme configuration
│   │   │   └── ui/                  # Reusable UI components
│   │   │       ├── badge.tsx        # Badge component
│   │   │       ├── button.tsx        # Button component
│   │   │       ├── card.tsx          # Card component
│   │   │       ├── input.tsx         # Input component
│   │   │       ├── label.tsx         # Label component
│   │   │       ├── progress.tsx     # Progress indicator
│   │   │       ├── radio-group.tsx   # Radio button group
│   │   │       ├── select.tsx        # Select dropdown
│   │   │       ├── separator.tsx     # Visual separator
│   │   │       ├── switch.tsx        # Toggle switch
│   │   │       └── textarea.tsx     # Text area component
│   │   ├── hooks/                   # Custom React hooks
│   │   │   └── useStepManager.ts    # Step navigation management
│   │   ├── lib/                     # Utility libraries
│   │   │   ├── api.ts               # API client configuration
│   │   │   ├── g1RuleEngine.ts      # G1 decision gate rules
│   │   │   ├── postCartApi.ts       # Post-cart API integration
│   │   │   ├── stepConfigs.ts       # Step configuration definitions
│   │   │   ├── stepManager.ts       # Step management logic
│   │   │   ├── testProducts.ts      # Test product data
│   │   │   ├── testProjectContexts.ts # Test project contexts
│   │   │   └── utils.ts             # General utilities
│   │   ├── App.tsx                  # Main application component
│   │   ├── main.tsx                 # Application entry point
│   │   ├── types.ts                 # TypeScript type definitions
│   │   └── index.css                # Global styles
│   ├── package.json                 # Node.js dependencies
│   ├── vite.config.ts               # Vite build configuration
│   ├── tailwind.config.js           # Tailwind CSS configuration
│   └── tsconfig.json                # TypeScript configuration
├── logs/                            # Application logs
├── start-with-logs.sh               # Development startup script
└── view-logs.sh                     # Log viewing script
```

## 🛠️ Key Features

### 1. **AI-Powered Procurement Intake**
- Intelligent requirements analysis from uploaded documents
- Automated scope extraction and normalization
- Follow-up question generation for missing information

### 2. **Smart Recommendation Engine**
- AI-generated product specifications and variants
- Budget-aware recommendations with multiple options
- Compliance-aware suggestions (NDAA, TAA, MIL-STD)

### 3. **Advanced Vendor Discovery**
- Web search integration for vendor finding
- AI-powered vendor ranking and validation
- Real-time vendor information retrieval

### 4. **Automated RFQ Generation**
- Template-based RFQ document creation
- Vendor-specific customization
- Compliance document generation

### 5. **Post-Cart Workflow Management**
- G1 decision gate evaluation
- Approval routing and management
- Purchase order generation

## 🚀 Quick Start

### Prerequisites
- Python 3.9+
- Node.js 18+
- OpenAI API Key

### Installation & Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ganeshmamidipalli/KIBA_WORKING_DEMO.git
   cd KIBA_WORKING_DEMO
   ```

2. **Backend Setup**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Environment Configuration**
   ```bash
   # Copy and configure environment file
   cp .env.local .env
   # Edit .env and add your OpenAI API key
   ```

4. **Frontend Setup**
   ```bash
   cd ../frontend-new
   npm install
   ```

5. **Start Development Servers**
   ```bash
   # From project root
   chmod +x start-with-logs.sh
   ./start-with-logs.sh
   ```

### Access Points
- **Frontend**: http://localhost:5173 (or 5174 if 5173 is busy)
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## 🔧 Core Components Explained

### Backend Services

#### 1. **Procurement Intake Service** (`services/procurement_intake.py`)
- Processes initial product requirements
- Generates follow-up questions for missing information
- Normalizes scope from multiple sources

#### 2. **Recommendation Engine** (`services/procurement_recommend.py`)
- Generates AI-powered product recommendations
- Creates multiple specification variants
- Includes pricing and lead time estimates

#### 3. **OpenAI Client** (`services/openai_client.py`)
- Centralized OpenAI API client management
- Handles API key configuration and error handling
- Provides retry mechanisms for reliability

#### 4. **Vendor Finder** (`vendor_finder/`)
- Comprehensive vendor discovery system
- Web search integration for real-time vendor data
- Caching and validation mechanisms

#### 5. **RFQ Service** (`rfq/rfq_service.py`)
- Automated RFQ document generation
- Template-based customization
- Vendor-specific formatting

### Frontend Components

#### 1. **Step-Based Workflow**
- **StepProductDetails**: Product specification input
- **StepProjectContext**: Project setup and context
- **StepProjectSummary**: Review and edit project summary
- **StepSpecifications**: Technical requirements
- **StepVendorSearch**: Vendor discovery and selection
- **StepRFQ**: RFQ generation and management
- **StepCARTEnhanced**: Enhanced cart management

#### 2. **API Integration** (`lib/api.ts`)
- Centralized API client configuration
- Error handling and retry logic
- Type-safe API calls

#### 3. **Step Management** (`hooks/useStepManager.ts`)
- Multi-step workflow navigation
- State persistence across steps
- Progress tracking

## 🔌 API Endpoints

### Core Procurement APIs
- `POST /api/intake_recommendations` - Start intake process
- `POST /api/submit_followups` - Submit follow-up answers
- `POST /api/session/{id}/generate_recommendations` - Generate final recommendations

### File Processing
- `POST /api/files/upload` - Upload and analyze documents
- `POST /api/files/analyze` - Enhanced file analysis

### Vendor Management
- `POST /api/vendor_finder` - Find vendors for products
- `POST /api/suggest-vendors` - AI-powered vendor suggestions

### RFQ Generation
- `POST /api/rfq/generate` - Generate RFQ documents
- `GET /api/rfq/download/{filename}` - Download RFQ files

### Post-Cart Workflow
- `POST /api/post-cart/g1-evaluate` - Evaluate G1 decision gate
- `POST /api/post-cart/pr` - Create purchase request
- `POST /api/post-cart/rfq/generate` - Generate RFQ

## 🧪 Testing

### Backend Testing
```bash
cd backend
python -m pytest
```

### Frontend Testing
```bash
cd frontend-new
npm run test
```

## 📊 Monitoring & Logs

- **Backend Logs**: `logs/api.log`, `logs/server.out`
- **Frontend Logs**: `logs/frontend.out`
- **Token Usage**: `logs/token_usage.log`
- **Live Logs**: Use `./start-with-logs.sh` for real-time monitoring

## 🔐 Environment Variables

### Backend (.env.local)
```bash
OPENAI_API_KEY=your_openai_api_key
OPENAI_CHAT_MODEL=gpt-4o-2024-08-06
HOST=0.0.0.0
PORT=8001
MAX_FILE_MB=10
MAX_TOTAL_MB=30
LOG_LEVEL=INFO
```

### Frontend (.env.development)
```bash
VITE_API_BASE_URL=http://localhost:8000
```

## 🚀 Deployment

### Production Build
```bash
# Frontend
cd frontend-new
npm run build

# Backend
cd backend
pip install -r requirements.txt
python server.py
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the API documentation at http://localhost:8000/docs
- Review the logs for debugging information

## 🔄 Version History

- **v1.0.0**: Initial release with core procurement workflow
- **v1.1.0**: Added AI-powered recommendations
- **v1.2.0**: Enhanced vendor discovery and RFQ generation
- **v1.3.0**: Post-cart workflow management

---

**Built with ❤️ using FastAPI, React, TypeScript, and OpenAI**
