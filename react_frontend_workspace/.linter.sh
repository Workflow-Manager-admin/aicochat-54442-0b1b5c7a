#!/bin/bash
cd /home/kavia/workspace/code-generation/aicochat-54442-0b1b5c7a/react_frontend_workspace/react_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

