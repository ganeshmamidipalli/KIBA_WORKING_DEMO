#!/bin/bash

# Color codes for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   KIBA3 Project Log Viewer${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Choose log to view:"
echo "1) Backend Server Log (localhost:8000)"
echo "2) Frontend Dev Server Log"
echo "3) Both logs (side by side)"
echo "4) Tail all logs"
echo ""
read -p "Enter your choice [1-4]: " choice

case $choice in
    1)
        echo -e "${GREEN}Following Backend Server Log...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
        echo ""
        tail -f backend/logs/server.out
        ;;
    2)
        echo -e "${GREEN}Following Frontend Dev Server Log...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
        echo ""
        tail -f frontend-new/logs/frontend.out
        ;;
    3)
        echo -e "${GREEN}Opening both logs in separate terminal windows...${NC}"
        # Open backend log in a new terminal window
        osascript -e "tell app \"Terminal\" to do script \"cd $(pwd) && tail -f backend/logs/server.out\""
        sleep 1
        # Open frontend log in another new terminal window
        osascript -e "tell app \"Terminal\" to do script \"cd $(pwd) && tail -f frontend-new/logs/frontend.out\""
        echo -e "${GREEN}Logs opened in separate windows${NC}"
        ;;
    4)
        echo -e "${GREEN}Tailing all logs...${NC}"
        echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
        echo ""
        # Use multitail-like functionality with tail
        (tail -f backend/logs/server.out &) &
        tail -f frontend-new/logs/frontend.out
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac
