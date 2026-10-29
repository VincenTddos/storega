#!/bin/sh
# Runs every automated check in the repo. Needs Node 18+ and g++ (or clang++).
set -e
cd "$(dirname "$0")/.."
echo "▸ 韌體邏輯（firmware/test）"; sh firmware/test/run.sh
echo "▸ Node-RED flow（node-red/test）"; node node-red/build-flows.js >/dev/null; node --test node-red/test/*.test.js
echo "▸ 儀表板資料模型（dashboard/test）"; node --test dashboard/test/*.test.js
echo "▸ 本機 broker 與模擬節點（tools/test）"
if [ -d tools/node_modules ]; then (cd tools && npm test --silent); else echo "  略過：先執行 cd tools && npm install"; fi
git diff --quiet -- node-red/flows.json 2>/dev/null || { echo "✗ node-red/flows.json 和 functions/ 不同步：請提交重新產生的 flows.json"; exit 1; }
echo "✓ 全部通過"
