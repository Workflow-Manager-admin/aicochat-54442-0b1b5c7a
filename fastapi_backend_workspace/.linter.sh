#!/bin/bash
cd /home/kavia/workspace/code-generation/aicochat-54442-0b1b5c7a/fastapi_backend_workspace/fastapi_backend
source venv/bin/activate
flake8 .
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

