#!/bin/bash
# start.sh - noctua Web App Launcher

# Get the script directory
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

# Ensure frontend is built
if [ ! -d "frontend/out" ]; then
    echo "Building frontend..."
    cd frontend
    npm run build
    cd ..
fi

echo "Starting noctua Web server..."
# Start the uvicorn server in the background
uv run uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
SERVER_PID=$!

# Wait briefly to ensure server is ready
sleep 2

# Open in the default macOS browser
open http://127.0.0.1:8000

echo "noctua Web App running... Press Ctrl+C to stop."

# Catch interrupt to kill the uvicorn process
trap "kill -9 $SERVER_PID" INT

# Wait on the running uvicorn process
wait $SERVER_PID
