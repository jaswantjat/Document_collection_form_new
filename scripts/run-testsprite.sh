#!/bin/bash
# Run the TestSprite MCP client — generates and executes AI browser tests.
# The client spawns @testsprite/testsprite-mcp@latest via npx each time,
# so no hardcoded cache paths that break across sessions.
export API_KEY="$TESTSPRITE_API_KEY"
cd /home/runner/workspace
exec node testsprite_client.mjs
