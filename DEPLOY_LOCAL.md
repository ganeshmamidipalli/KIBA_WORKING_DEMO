# 🚀 Local Deployment Guide for KIBA3

This guide will help you deploy and run the KIBA3 project locally on your machine.

## 📋 Prerequisites

Before starting, ensure you have the following installed:

- **Python 3.9+** (check with `python3 --version`)
- **Node.js 18+** (check with `node --version`)
- **npm** (comes with Node.js, check with `npm --version`)
- **OpenAI API Key** (get from https://platform.openai.com/api-keys)

## 🔧 Step-by-Step Deployment

### 1. Navigate to Project Directory

```bash
cd /Users/ganesh/Desktop/KIBA3.V1-for-demo-main
```

### 2. Backend Setup

#### 2.1 Create Python Virtual Environment

```bash
cd backend
python3 -m venv .venv
```

#### 2.2 Activate Virtual Environment

**On macOS/Linux:**
```bash
source .venv/bin/activate
```

**On Windows:**
```bash
.venv\Scripts\activate
```

#### 2.3 Install Python Dependencies

```bash
pip install -r requirements.txt
```

#### 2.4 Configure Environment Variables

Create a `.env` file in the `backend` directory:

```bash
cd backend
touch .env
```

Add the following content to `.env`:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_CHAT_MODEL=gpt-4o-2024-08-06
HOST=0.0.0.0
PORT=8000
MAX_FILE_MB=10
MAX_TOTAL_MB=30
LOG_LEVEL=INFO
```

**⚠️ Important:** Replace `your_openai_api_key_here` with your actual OpenAI API key.

### 3. Frontend Setup

#### 3.1 Navigate to Frontend Directory

```bash
cd ../frontend-new
```

#### 3.2 Install Node.js Dependencies

```bash
npm install
```

#### 3.3 Configure Frontend Environment (Optional)

If you need to change the API URL, create a `.env.development` file:

```bash
touch .env.development
```

Add:
```env
VITE_API_BASE_URL=http://localhost:8000
```

### 4. Start the Application

#### Option A: Using the Start Script (Recommended)

From the project root directory:

```bash
chmod +x start-with-logs.sh
./start-with-logs.sh
```

This will:
- Start the backend server on port 8000
- Start the frontend dev server on port 5174
- Show live logs from both servers

#### Option B: Manual Start

**Terminal 1 - Backend:**
```bash
cd backend
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 - Frontend:**
```bash
cd frontend-new
npm run dev
```

### 5. Access the Application

Once both servers are running:

- **Frontend Application**: http://localhost:5174 (or 5173 if 5174 is busy)
- **Backend API**: http://localhost:8000
- **API Documentation (Swagger)**: http://localhost:8000/docs
- **API Documentation (ReDoc)**: http://localhost:8000/redoc
- **Health Check**: http://localhost:8000/health

## ✅ Verification Steps

### Check Backend Health

```bash
curl http://localhost:8000/health
```

Expected response:
```json
{"status":"healthy"}
```

### Check Frontend

Open your browser and navigate to http://localhost:5174. You should see the KIBA3 application interface.

## 🛠️ Troubleshooting

### Backend Issues

**Port 8000 already in use:**
```bash
# Find and kill the process using port 8000
lsof -ti:8000 | xargs kill -9

# Or change the port in backend/.env
PORT=8001
```

**Python dependencies not installing:**
```bash
# Upgrade pip first
pip install --upgrade pip
pip install -r requirements.txt
```

**OpenAI API errors:**
- Verify your API key is correct in `backend/.env`
- Check your OpenAI account has credits/quota
- Ensure the API key has proper permissions

### Frontend Issues

**Port 5174 already in use:**
- Vite will automatically use the next available port (5175, 5176, etc.)
- Check the terminal output for the actual port number

**npm install fails:**
```bash
# Clear npm cache
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**TypeScript errors:**
```bash
# Check for type errors
cd frontend-new
npm run lint
```

### General Issues

**Servers not starting:**
- Ensure all prerequisites are installed
- Check that ports are not blocked by firewall
- Review logs in the `logs/` directory

**CORS errors:**
- Ensure backend CORS is configured to allow frontend origin
- Check that frontend is using the correct API URL

## 📊 Monitoring

### View Logs

**Backend logs:**
```bash
tail -f logs/backend-live.log
```

**Frontend logs:**
```bash
tail -f logs/frontend-live.log
```

**Both logs together:**
```bash
tail -f logs/backend-live.log logs/frontend-live.log
```

### Stop the Servers

If using the start script, press `Ctrl+C` in the terminal.

If running manually:
- Backend: `Ctrl+C` in the backend terminal
- Frontend: `Ctrl+C` in the frontend terminal

## 🔄 Restart After Changes

### Backend Changes
The backend runs with `--reload` flag, so it will automatically restart when you save Python files.

### Frontend Changes
Vite's dev server has hot module replacement (HMR), so changes are reflected immediately in the browser.

## 📝 Development Workflow

1. **Make changes** to code
2. **Save files** - servers auto-reload
3. **Test in browser** - frontend updates automatically
4. **Check logs** - monitor for errors
5. **Verify API** - test endpoints at http://localhost:8000/docs

## 🎯 Next Steps

After successful deployment:

1. Test the full workflow:
   - Step 1: Project Context
   - Step 2: Product Details
   - Step 3: AI Follow-ups
   - Step 4: AI Recommendations
   - Step 5: Vendor Search
   - Step 6: CART (Vendor Evaluation)

2. Review API documentation at http://localhost:8000/docs

3. Check the logs for any warnings or errors

## 🆘 Getting Help

If you encounter issues:

1. Check the logs in the `logs/` directory
2. Review the API documentation at http://localhost:8000/docs
3. Verify all environment variables are set correctly
4. Ensure all dependencies are installed

---

**Happy Coding! 🚀**



