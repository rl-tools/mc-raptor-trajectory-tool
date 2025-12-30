#!/bin/bash
set -e

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  npm install
fi

# Create output directory
mkdir -p lib

# Bundle the entire app with all dependencies included
npx esbuild src/app.jsx --bundle --minify --format=esm --outfile=lib/app.js

# Copy CSS
cp src/styles.css lib/styles.css

echo "App bundled to lib/app.js"
echo "Styles copied to lib/styles.css"
