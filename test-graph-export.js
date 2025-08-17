/**
 * Test script for PNG graph export functionality
 * Run with: node test-graph-export.js
 */

const { LangGraphAgent } = require('./dist/main/agents/LangGraphAgent');

// Mock services for testing
const mockLLMProvider = {
    getCurrentProvider: () => 'ollama',
    invoke: async () => ({ content: 'Test response' })
};

const mockToolExecutor = {
    getAvailableTools: () => ['web_search', 'wikipedia_search'],
    executeTool: async () => 'Mock search results'
};

async function testGraphExport() {
    console.log('🎨 Deep Research Agent Graph Export Test');
    console.log('=======================================');

    try {
        // Create agent
        const agent = new LangGraphAgent({
            llmProvider: mockLLMProvider,
            memoryService: {},
            toolExecutor: mockToolExecutor,
            config: {}
        });

        console.log('✅ Agent initialized');

        // Export graph as PNG
        const outputPath = await agent.exportGraphAsPNG({
            outputPath: './my-research-graph.png',
            enableLangSmith: false
        });

        console.log(`✅ Graph exported to: ${outputPath}`);
        
        // Check file
        const fs = require('fs');
        if (fs.existsSync(outputPath)) {
            const stats = fs.statSync(outputPath);
            console.log(`📊 File size: ${stats.size} bytes`);
            console.log('🎉 PNG export successful!');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testGraphExport();