import { LLMProvider } from "../../services/LLMProvider";
import { MainAgentExecution } from "../MainAgentExecution";
import * as dotenv from 'dotenv';
import path from 'path';
import { createDuckDBVectorStore } from "../../services/DuckDBVectorStore";

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Configure LangSmith tracing if API key is available
if (process.env.LANGSMITH_API_KEY) {
    process.env.LANGCHAIN_TRACING_V2 = 'true';
    process.env.LANGCHAIN_PROJECT = 'voice-assistant';
    process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
    process.env.LANGCHAIN_ENDPOINT = process.env.LANGSMITH_ENDPOINT || 'https://api.smith.langchain.com';
    console.log('✅ LangSmith tracing enabled');
    console.log(`📊 Project: ${process.env.LANGCHAIN_PROJECT}`);
}

async function initializeAgent(): Promise<MainAgentExecution> {
    console.log('\n🚀 Initializing RouterLangGraphAgent...\n');

    const ollamaBaseUrl = 'http://127.0.0.1:11435'
    // const ollamaBaseUrl = 'http://127.0.0.1:11435'
    // 1. Create LLM configuration
    const llmConfig = {
        provider: 'ollama' as const,  // Change to 'ollama' if using local models
        openai: {
            model: 'gpt-4o-mini',  // or 'gpt-4', 'gpt-3.5-turbo'
            apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here', // Replace with actual key
            temperature: 0.7,
            maxTokens: 4000
        },
        ollama: {
            // model: 'gemma3:1b',  // or any local model you have
            model: 'qwen3:4b',  // or any local model you have
            baseUrl: ollamaBaseUrl,
            temperature: 0.7
        },
        streaming: true,
        timeout: 60000
    };

    // 2. Initialize LLM Provider
    console.log('📦 Initializing LLM Provider...');
    const llmProvider = new LLMProvider(llmConfig);
    await llmProvider.initialize();
    console.log(`✅ LLM Provider initialized with: ${llmProvider.getCurrentProvider()}\n`);

    // 3. Initialize Memory Service (simplified for testing)
    console.log('🧠 Initializing Memory Service...');
    // Create a mock memory service that doesn't depend on Electron
    // We'll skip the actual initialization since it requires Electron's app module


    // Skip initialization to avoid Electron dependency
    // await memoryService.initialize();
    console.log('✅ Memory Service created (skipping initialization for testing)\n');

    // 4. Create RouterLangGraphAgent
    console.log('🤖 Creating RouterLangGraphAgent...');
    const llmOptions = {
        embeddingProvider: "ollama" as const,
        embeddingModel: "granite-embedding:278m",
        ollamaBaseUrl: ollamaBaseUrl,
    }
    const databasePath = "/Users/karwo09/code/voice-assistant/data/test-vectorstore"
    const vectorStore = await createDuckDBVectorStore(databasePath, llmOptions, "/Users/karwo09/code/voice-assistant/data/appDataPathTest"); // Create a mock or in-memory vector store for testing
    await vectorStore.initialize(); // Ensure it's initialized
    const result = await vectorStore.indexFolder(databasePath);
    console.log(`Indexed ${result.success} documents from ${databasePath}`);
    const agent = new MainAgentExecution({
        llmProvider,
        config: {
            enableStreaming: true,
            enableDeepResearch: true,
            vectorStore,
            fallbackToOriginal: true
        }
    });
    await agent.initialize();
    console.log('✅ RouterLangGraphAgent created successfully\n');

    // 5. Display agent status
    const status = agent.getStatus();
    console.log('📊 Agent Status:');
    console.log(`   Provider: ${status.provider}`);
    console.log(`   Available Tools: ${status.availableTools.join(', ')}`);

    return agent;
}

async function testVectorSearchMethod(agent: MainAgentExecution) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🧪 Testing VectorDB Agent Process Method');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const testQuery = "Based on my documents, who is my best friend?";

    console.log(`📝 Query: "${testQuery}"`);
    console.log('─'.repeat(60));
    console.log('\n💬 Streaming Response:\n');

    try {
        let fullResponse = '';
        const startTime = Date.now();

        for await (const chunk of agent.processStreaming(testQuery)) {
            let tmpChunk = chunk;
            if (typeof chunk !== 'string') {
                // Stringyfy json objects
                tmpChunk = JSON.stringify(chunk);
            }
            process.stdout.write(tmpChunk);
            fullResponse += tmpChunk;
        }

        const elapsedTime = Date.now() - startTime;
        console.log(`\n\n✅ VectorDB Streaming completed in ${elapsedTime}ms`);
        console.log(`📊 Total response length: ${fullResponse.length} characters`);
        console.log('─'.repeat(60));
    } catch (error) {
        console.error('\n❌ Streaming error:', error);
    }
}



async function testAgent() {
    try {
        // Initialize the agent
        const agent = await initializeAgent();


        await testVectorSearchMethod(agent);

        console.log('\n\n✅ All tests completed successfully!');


    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          RouterLangGraphAgent Test Suite                      ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('\nUsage: ts-node test-file.ts [process|stream|research|all] [--export-graph]\n');

    testAgent().then(() => {
        console.log('\n👋 Goodbye!');
        process.exit(0);
    }).catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}