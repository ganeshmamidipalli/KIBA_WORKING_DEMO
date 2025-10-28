#!/bin/bash

# Start the project with live log viewing

echo "🚀 Starting KIBA3 Project with Live Logs..."
echo ""

# Start backend in background
cd backend
source .venv/bin/activate
python -m uvicorn server:app --host 0.0.0.0 --port 8000 --reload > ../logs/backend-live.log 2>&1 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"
echo "   → http://localhost:8000"
echo ""

# Start frontend in background
cd ../frontend-new
npm run dev > ../logs/frontend-live.log 2>&1 &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"
echo "   → http://localhost:5173"
echo ""

# Wait a bit for servers to start
sleep 3

# Show logs
echo "📊 Following logs (Press Ctrl+C to stop)..."
echo ""
echo "=========================================="

# Tail both logs with labels
tail -f ../logs/backend-live.log ../logs/frontend-live.log
