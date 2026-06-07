#!/usr/bin/env bash
# מסנכרן את agent/ -> public/agent/ ומחדש manifest.json עם חתימות SHA256
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p public/agent
cp agent/index.js agent/updater.js agent/package.json public/agent/
cd public/agent
node -e "
const fs=require('fs'),c=require('crypto');
const files=['index.js','updater.js','package.json'];
const out={version:require('./package.json').version,updatedAt:new Date().toISOString(),files:files.map(n=>({name:n,url:'https://tiful360.com/agent/'+n,sha256:c.createHash('sha256').update(fs.readFileSync(n)).digest('hex')}))};
fs.writeFileSync('manifest.json',JSON.stringify(out,null,2));
console.log('manifest.json עודכן לגרסה',out.version);
"
