#!/bin/bash

# RouterLangGraphAgent Test Runner Script

echo "🚀 Starting RouterLangGraphAgent Test..."
echo ""

# Check if OPENAI_API_KEY is set
if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  Warning: OPENAI_API_KEY is not set."
    echo "   You can set it with: export OPENAI_API_KEY='your-key-here'"
    echo "   Or use Ollama by changing provider to 'ollama' in test-file.ts"
    echo ""
fi

# Navigate to the correct directory
cd "$(dirname "$0")"

# Run the test with ts-node
echo "Running test with arguments: $@"
echo "-------------------------------------------"

# Use npx to ensure ts-node is available
npx ts-node test-file.ts "$@"