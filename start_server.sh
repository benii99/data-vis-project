#!/bin/bash

# Script to start HTTP server and open visualization in Chrome
# Usage: ./start_server.sh [html_file]
# Example: ./start_server.sh shdi_horizon_2.html

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Change to the script directory (d3 folder)
cd "$SCRIPT_DIR"

# Get HTML file from argument or use default
HTML_FILE="${1:-shdi_horizon_2.html}"

# If a full path is provided, extract just the filename
HTML_FILE=$(basename "$HTML_FILE")

# Validate that the file exists
if [ ! -f "$HTML_FILE" ]; then
    echo "Error: HTML file '$HTML_FILE' not found in $SCRIPT_DIR"
    echo "Usage: $0 [html_file]"
    echo "Example: $0 shdi_horizon_2.html"
    exit 1
fi

echo "Using HTML file: $HTML_FILE"

# Check if port 8080 is already in use
if lsof -Pi :8080 -sTCP:LISTEN -t >/dev/null 2>&1 ; then
    echo "Port 8080 is already in use. Stopping existing server..."
    pkill -f "python3 -m http.server 8080"
    sleep 1
fi

# Start the HTTP server in the background
echo "Starting HTTP server on port 8080..."
python3 -m http.server 8080 > /dev/null 2>&1 &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 2

# Check if server started successfully
if ps -p $SERVER_PID > /dev/null; then
    echo "Server started successfully (PID: $SERVER_PID)"
    echo "Opening Chrome with: http://127.0.0.1:8080/$HTML_FILE"
    
    # Open Chrome with the visualization URL
    URL="http://127.0.0.1:8080/$HTML_FILE"
    google-chrome "$URL" 2>/dev/null || \
    chromium-browser "$URL" 2>/dev/null || \
    chromium "$URL" 2>/dev/null || \
    xdg-open "$URL" 2>/dev/null
    
    echo ""
    echo "Server is running. Press Ctrl+C to stop."
    echo "To stop the server manually, run: kill $SERVER_PID"
    echo ""
    
    # Wait for user interrupt
    trap "echo ''; echo 'Stopping server...'; kill $SERVER_PID 2>/dev/null; exit" INT TERM
    wait $SERVER_PID
else
    echo "Failed to start server!"
    exit 1
fi

