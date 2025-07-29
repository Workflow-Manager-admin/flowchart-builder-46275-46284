#!/bin/bash
cd /home/kavia/workspace/code-generation/flowchart-builder-46275-46284/frontend_flow_chart_builder
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

