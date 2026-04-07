#!/bin/bash
# Wrapper to run TestSprite CLI with correct environment
export API_KEY="$TESTSPRITE_API_KEY"
cd /home/runner/workspace
exec node /home/runner/.npm/_npx/8ddf6bea01b2519d/node_modules/@testsprite/testsprite-mcp/dist/index.js generateCodeAndExecute
