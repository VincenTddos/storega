#!/bin/sh
# Arduino only compiles files inside the sketch folder, so each sketch gets a copy of the shared core.
# Edit firmware/common/*.h, then run this script (firmware/test/run.sh checks the copies are in sync).
cd "$(dirname "$0")"
for s in entry_node zone_node; do cp common/storega_core.h common/sha256.h "$s/"; done
echo "copied common/*.h into entry_node/ and zone_node/"
