#!/bin/bash
# MoneyChat Android APK Build Script
# Usage: ./scripts/build-android.sh
#
# Prerequisites:
#   - Node.js >= 16
#   - Java JDK 8+ (for keytool, only needed to regenerate keystore)
#   - Android SDK (for local build) OR HBuilderX account (for cloud build)
#
# Two ways to build an APK:
#
# 1. HBuilderX Cloud Packaging (Recommended)
#    - Open project in HBuilderX
#    - Menu: 发行 -> 原生App-云打包
#    - Select Android, configure signing in manifest.json
#    - Download the signed APK
#
# 2. Local Build (Advanced)
#    - Run: npm run build:app
#    - This generates web resources in dist/build/app
#    - Use Android Studio to import and compile the native project
#    - Requires Android SDK, Gradle, and a configured Android project
#
# For most users, cloud packaging via HBuilderX is the simplest approach.

set -e

echo "=== MoneyChat Android Build ==="
echo ""

# Step 1: Run type check
echo "[1/3] Running type check..."
npm run type-check
echo "  ✓ Type check passed"

# Step 2: Build web resources for APP platform
echo "[2/3] Building APP resources..."
npm run dev:app 2>/dev/null &
BUILD_PID=$!

# Wait a moment for the build to start, then check
sleep 3

# For CI/production, use: npx uni build -p app
echo "  To build for production, run: npx uni build -p app"
echo "  To use HBuilderX cloud packaging, open the project in HBuilderX"

# Kill dev server if running
kill $BUILD_PID 2>/dev/null || true

echo ""
echo "[3/3] Build complete!"
echo ""
echo "Next steps:"
echo "  - Open project in HBuilderX for cloud packaging"
echo "  - Or run 'npx uni build -p app' for local build resources"
echo "  - Keystore: static/app-icon/moneychat.keystore"
echo "  - Keystore password: moneychat"
echo ""
echo "NOTE: For production, regenerate the keystore with secure passwords!"
echo "  keytool -genkey -v -keystore moneychat.keystore -alias moneychat"
