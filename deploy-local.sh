#!/bin/bash

# KIBA3 Local Deployment Script
# This script sets up and starts the KIBA3 project locally

set -e  # Exit on error

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 KIBA3 Local Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

echo "📁 Project root: $PROJECT_ROOT"
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed!${NC}"
    echo "Please install Python 3.9+ and try again."
    exit 1
fi
PYTHON_VERSION=$(python3 --version | cut -d' ' -f2)
echo -e "${GREEN}✅ Python: $PYTHON_VERSION${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed!${NC}"
    echo "Please install Node.js 18+ and try again."
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed!${NC}"
    exit 1
fi
NPM_VERSION=$(npm --version)
echo -e "${GREEN}✅ npm: $NPM_VERSION${NC}"

echo ""

# Backend Setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  📦 Backend Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_ROOT/backend"

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python3 -m venv .venv
    echo -e "${GREEN}✅ Virtual environment created${NC}"
else
    echo -e "${GREEN}✅ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo "🔌 Activating virtual environment..."
source .venv/bin/activate

# Upgrade pip
echo "⬆️  Upgrading pip..."
pip install --upgrade pip --quiet

# Install dependencies
echo "📥 Installing Python dependencies..."
if pip install -r requirements.txt --quiet; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠️  Some dependencies may have failed. Continuing...${NC}"
fi

# Check for .env.local or .env file
if [ ! -f ".env.local" ] && [ ! -f ".env" ]; then
    echo ""
    echo -e "${YELLOW}⚠️  No environment file found!${NC}"
    echo "Creating .env.local template..."
    cat > .env.local << EOF
# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_CHAT_MODEL=gpt-4o-2024-08-06

# Server Configuration
HOST=0.0.0.0
PORT=8000

# File Upload Limits
MAX_FILE_MB=10
MAX_TOTAL_MB=30

# Logging
LOG_LEVEL=INFO
EOF
    echo -e "${YELLOW}⚠️  Please edit backend/.env.local and add your OPENAI_API_KEY${NC}"
    echo ""
    read -p "Press Enter after you've added your API key, or Ctrl+C to cancel..."
fi

# Check if OPENAI_API_KEY is set
if [ -f ".env.local" ]; then
    source .env.local
elif [ -f ".env" ]; then
    source .env
fi

if [ -z "$OPENAI_API_KEY" ] || [ "$OPENAI_API_KEY" = "your_openai_api_key_here" ]; then
    echo -e "${RED}❌ OPENAI_API_KEY is not set in .env.local or .env${NC}"
    echo "Please add your OpenAI API key to backend/.env.local"
    exit 1
fi

echo -e "${GREEN}✅ Backend configuration OK${NC}"
echo ""

# Frontend Setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🎨 Frontend Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd "$PROJECT_ROOT/frontend-new"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📥 Installing Node.js dependencies..."
    npm install
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${GREEN}✅ Node modules already installed${NC}"
    echo "🔄 Checking for updates..."
    npm install --quiet
fi

echo -e "${GREEN}✅ Frontend configuration OK${NC}"
echo ""

# Create logs directory
mkdir -p "$PROJECT_ROOT/logs"

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Start the application:"
echo "   ./start-with-logs.sh"
echo ""
echo "2. Or start manually:"
echo "   Terminal 1 (Backend):"
echo "   cd backend && source .venv/bin/activate"
echo "   python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload"
echo ""
echo "   Terminal 2 (Frontend):"
echo "   cd frontend-new && npm run dev"
echo ""
echo "3. Access the application:"
echo "   Frontend: http://localhost:5174"
echo "   Backend API: http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"



