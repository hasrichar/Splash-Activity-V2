#!/usr/bin/env bash
set -e

PORT=${PORT:-5000}

echo "===================================================="
echo " Starting Splash Activity v2 Server on port :$PORT"
echo "===================================================="

if command -v gunicorn >/dev/null 2>&1; then
    exec gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 4 --timeout 120 app:app
else
    exec waitress-serve --host=0.0.0.0 --port=$PORT --threads=6 app:app
fi