import { LLMProvider } from "../services/LLMProvider";
import { RouterLangGraphAgent } from "./RouterLangGraphAgent";
import { LangChainMemoryService } from "../services/LangChainMemoryService";
import * as dotenv from 'dotenv';
import path from 'path';

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

async function initializeAgent(): Promise<RouterLangGraphAgent> {
    console.log('\n🚀 Initializing RouterLangGraphAgent...\n');

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
            model: 'qwen3:1.7b',  // or any local model you have
            baseUrl: 'http://127.0.0.1:11434',
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
    const memoryService = new LangChainMemoryService(
        {},  // Empty store for testing
        null,  // vectorStore (optional)
        llmProvider.getChatModel()  // LLM model for summarization
    );

    // Skip initialization to avoid Electron dependency
    // await memoryService.initialize();
    console.log('✅ Memory Service created (skipping initialization for testing)\n');

    // 4. Create RouterLangGraphAgent
    console.log('🤖 Creating RouterLangGraphAgent...');
    const agent = new RouterLangGraphAgent({
        llmProvider,
        memoryService,
        config: {
            enableStreaming: true,
            enableDeepResearch: true,
            fallbackToOriginal: true
        }
    });
    console.log('✅ RouterLangGraphAgent created successfully\n');

    // 5. Display agent status
    const status = agent.getStatus();
    console.log('📊 Agent Status:');
    console.log(`   Provider: ${status.provider}`);
    console.log(`   Available Tools: ${status.availableTools.join(', ')}`);
    console.log(`   Deep Research: ${status.deepResearchStatus.enabled ? 'Enabled' : 'Disabled'}`);
    console.log(`   Fallback: ${status.deepResearchStatus.fallbackEnabled ? 'Enabled' : 'Disabled'}\n`);

    return agent;
}

async function testProcessMethod(agent: RouterLangGraphAgent) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🧪 Testing Non-Streaming Process Method');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const testQueries = [
        "What's the weather like in San Francisco?",
        "Explain quantum computing in simple terms",
        "Research the latest developments in AI"
    ];

    for (const query of testQueries) {
        console.log(`\n📝 Query: "${query}"`);
        console.log('─'.repeat(60));

        try {
            const startTime = Date.now();
            const response = await agent.process(query);
            const elapsedTime = Date.now() - startTime;

            console.log(`\n💬 Response (${elapsedTime}ms):`);
            console.log(response);
            console.log('\n' + '─'.repeat(60));
        } catch (error) {
            console.error('❌ Error:', error);
        }
    }
}

async function testStreamingMethod(agent: RouterLangGraphAgent) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🧪 Testing Streaming Process Method');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const testQuery = "Tell me about the history of artificial intelligence";

    console.log(`📝 Query: "${testQuery}"`);
    console.log('─'.repeat(60));
    console.log('\n💬 Streaming Response:\n');

    try {
        let fullResponse = '';
        const startTime = Date.now();

        for await (const chunk of agent.processStreaming(testQuery)) {
            process.stdout.write(chunk);
            fullResponse += chunk;
        }

        const elapsedTime = Date.now() - startTime;
        console.log(`\n\n✅ Streaming completed in ${elapsedTime}ms`);
        console.log(`📊 Total response length: ${fullResponse.length} characters`);
        console.log('─'.repeat(60));
    } catch (error) {
        console.error('\n❌ Streaming error:', error);
    }
}

async function testDeepResearchMode(agent: RouterLangGraphAgent) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('🧪 Testing Deep Research Mode');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const researchQuery = "Research the web and write a research article about early humans in Africa.";

    console.log(`📝 Research Query: "${researchQuery}"`);
    console.log('─'.repeat(60));
    console.log('\n🔬 Initiating Deep Research...\n');

    try {
        let fullResponse = '';
        const startTime = Date.now();

        for await (const update of agent.processStreaming(researchQuery)) {
            process.stdout.write(update);
            fullResponse += update;
        }

        const elapsedTime = Date.now() - startTime;
        console.log(`\n\n✅ Research completed in ${elapsedTime}ms`);
        console.log(`📊 Total response length: ${fullResponse.length} characters`);
        console.log('─'.repeat(60));
    } catch (error) {
        console.error('\n❌ Research error:', error);
    }
}

async function testAgent() {
    try {
        // Initialize the agent
        const agent = await initializeAgent();

        // Run tests based on command line arguments
        const testMode = process.argv[2] || 'all';

        switch (testMode) {
            case 'process':
                await testProcessMethod(agent);
                break;
            case 'stream':
                await testStreamingMethod(agent);
                break;
            case 'research':
                await testDeepResearchMode(agent);
                break;
            case 'all':
            default:
                await testProcessMethod(agent);
                await testStreamingMethod(agent);
                await testDeepResearchMode(agent);
                break;
        }

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