import { EnhancedDecisionAgent } from './enhanced-decision-agent';
import { LLMProvider } from '../../services/LLMProvider';
import { DuckDBVectorStore } from '../../services/DuckDBVectorStore';
import * as path from 'path';
import * as os from 'os';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

interface TestConfig {
    llmProvider?: 'openai' | 'ollama';
    embeddingProvider?: 'openai' | 'ollama' | 'huggingface';
    vectorDbPath?: string;
    verbose?: boolean;
}

/**
 * Test runner for the Enhanced Decision Agent
 * 
 * This script demonstrates the new LangGraph-based architecture
 * with enhanced state management and decision-making capabilities.
 */
class EnhancedAgentTester {
    private config: TestConfig;
    private agent?: EnhancedDecisionAgent;
    private llmProvider?: LLMProvider;
    private vectorStore?: DuckDBVectorStore;

    constructor(config: TestConfig = {}) {
        this.config = {
            llmProvider: 'ollama',
            embeddingProvider: 'ollama',
            vectorDbPath: path.join(os.tmpdir(), `enhanced-agent-test-${Date.now()}.db`),
            verbose: true,
            ...config
        };
    }

    async initialize(): Promise<void> {
        console.log('🚀 Initializing Enhanced Decision Agent Test Environment');
        console.log('═'.repeat(70));

        console.log(`📊 Configuration:`);
        console.log(`   LLM Provider: ${this.config.llmProvider}`);
        console.log(`   Embedding Provider: ${this.config.embeddingProvider}`);
        console.log(`   Vector DB Path: ${this.config.vectorDbPath}`);
        console.log(`   Verbose Mode: ${this.config.verbose}`);

        // Initialize LLM Provider
        await this.initializeLLMProvider();

        // Initialize Vector Store
        await this.initializeVectorStore();

        // Load sample data into vector store
        await this.loadSampleData();

        // Initialize Enhanced Agent
        await this.initializeAgent();

        console.log('✅ Test environment initialized successfully');
    }

    private async initializeLLMProvider(): Promise<void> {
        console.log('\n🧠 Initializing LLM Provider...');

        const llmConfig = {
            provider: this.config.llmProvider!,
            streaming: false,
            timeout: 30000,
            ...(this.config.llmProvider === 'openai' ? {
                openai: {
                    apiKey: process.env.OPENAI_API_KEY,
                    model: 'gpt-3.5-turbo',
                    temperature: 0.1
                }
            } : {
                ollama: {
                    baseUrl: 'http://127.0.0.1:11435',
                    model: 'qwen3:1.7b',
                    temperature: 0.1
                }
            })
        };

        this.llmProvider = new LLMProvider(llmConfig as any);
        await this.llmProvider.initialize();
        console.log(`✅ LLM Provider initialized: ${this.config.llmProvider}`);
    }

    private async initializeVectorStore(): Promise<void> {
        console.log('\n📚 Initializing Vector Store...');

        const vectorConfig = {
            databasePath: this.config.vectorDbPath!,
            embeddingProvider: this.config.embeddingProvider!,
            chunkSize: 300,
            chunkOverlap: 50,
            ...(this.config.embeddingProvider === 'openai' && {
                openaiApiKey: process.env.OPENAI_API_KEY
            })
        };

        this.vectorStore = new DuckDBVectorStore(vectorConfig as any);
        await this.vectorStore.initialize();
        console.log(`✅ Vector Store initialized with ${this.config.embeddingProvider} embeddings`);
    }

    private async loadSampleData(): Promise<void> {
        if (!this.vectorStore) return;

        console.log('\n🗃️ Loading sample knowledge base...');

        const sampleDocuments = [
            {
                content: "Apple Inc. is an American multinational technology company headquartered in Cupertino, California. Apple was founded by Steve Jobs, Steve Wozniak, and Ronald Wayne in April 1976 to develop and sell Wozniak's Apple I personal computer.",
                metadata: { source: 'apple_info', topic: 'company_history' }
            },
            {
                content: "Microsoft Corporation is an American multinational technology corporation with headquarters in Redmond, Washington. It develops, manufactures, licenses, supports, and sells computer software, consumer electronics, personal computers, and related services. Microsoft was founded by Bill Gates and Paul Allen on April 4, 1975.",
                metadata: { source: 'microsoft_info', topic: 'company_history' }
            },
            {
                content: "Artificial Intelligence (AI) is intelligence demonstrated by machines, in contrast to natural intelligence displayed by humans and animals. Leading AI textbooks define the field as the study of 'intelligent agents'.",
                metadata: { source: 'ai_definition', topic: 'technology' }
            },
            {
                content: "Machine learning is a method of data analysis that automates analytical model building. It is a branch of artificial intelligence based on the idea that systems can learn from data, identify patterns and make decisions with minimal human intervention.",
                metadata: { source: 'ml_definition', topic: 'technology' }
            },
            {
                content: "The Python programming language was created by Guido van Rossum and first released in 1991. Python is known for its simple syntax and readability, making it an excellent choice for beginners and experienced programmers alike.",
                metadata: { source: 'python_info', topic: 'programming' }
            },
            {
                content: "Climate change refers to long-term shifts in temperatures and weather patterns. While climate change is a natural phenomenon, scientific evidence shows that human activities have been the main driver of climate change since the 1800s.",
                metadata: { source: 'climate_info', topic: 'environment' }
            }
        ];

        for (const doc of sampleDocuments) {
            await this.vectorStore.addDocuments([{ pageContent: doc.content, metadata: doc.metadata }]);
        }

        console.log(`✅ Loaded ${sampleDocuments.length} sample documents into knowledge base`);
    }

    private async initializeAgent(): Promise<void> {
        console.log('\n🤖 Initializing Enhanced Decision Agent...');

        this.agent = new EnhancedDecisionAgent({
            llmProvider: this.llmProvider!,
            vectorStore: this.vectorStore,
            maxIterations: 8,
            maxResearchDepth: 3,
            confidenceThreshold: 0.75,
            verbose: this.config.verbose
        });

        await this.agent.initialize();
        console.log('✅ Enhanced Decision Agent initialized');
    }

    async runTestSuite(): Promise<void> {
        if (!this.agent) {
            throw new Error('Agent not initialized. Call initialize() first.');
        }

        console.log('\n' + '═'.repeat(70));
        console.log('🧪 ENHANCED DECISION AGENT TEST SUITE');
        console.log('═'.repeat(70));

        const testQuestions = [
            {
                question: "Which company was founded first, Apple or Microsoft?",
                expectedBehavior: "Should research both companies and compare founding dates",
                testFocus: "Research and comparison capabilities"
            },
            {
                question: "What is the relationship between artificial intelligence and machine learning?",
                expectedBehavior: "Should research both topics and explain their relationship",
                testFocus: "Research and synthesis capabilities"
            },
            {
                question: "How would you approach solving climate change?",
                expectedBehavior: "Should create a plan and potentially use research",
                testFocus: "Planning and strategic thinking"
            },
            {
                question: "What programming language should a beginner learn first?",
                expectedBehavior: "Should research programming languages and provide recommendations",
                testFocus: "Research and recommendation capabilities"
            }
        ];

        for (let i = 0; i < testQuestions.length; i++) {
            const test = testQuestions[i];

            console.log(`\n${'─'.repeat(50)}`);
            console.log(`🔬 Test ${i + 1}/${testQuestions.length}: ${test.testFocus}`);
            console.log(`${'─'.repeat(50)}`);
            console.log(`❓ Question: ${test.question}`);
            console.log(`🎯 Expected Behavior: ${test.expectedBehavior}`);

            try {
                const startTime = Date.now();
                const result = await this.agent.processQuestion(test.question);
                const endTime = Date.now();

                console.log(`\n📊 Test Results:`);
                console.log(`   ⏱️  Processing Time: ${endTime - startTime}ms`);
                console.log(`   🎯 Final Confidence: ${(result.confidence_level * 100).toFixed(1)}%`);
                console.log(`   🔄 Iterations Used: ${result.iteration_count}/${result.max_iterations}`);
                console.log(`   🔬 Research Depth: ${result.research_depth}/${result.max_research_depth}`);
                console.log(`   🛠️  Tools Used: ${result.tools_used?.length || 0}`);
                console.log(`   🧠 Decisions Made: ${result.decision_history?.length || 0}`);
                console.log(`   📚 Facts Learned: ${result.learned_facts?.length || 0}`);

                console.log(`\n💭 Agent State Summary:`);
                const stateSummary = this.agent.getAgentStateSummary(result);
                Object.entries(stateSummary).forEach(([key, value]) => {
                    console.log(`   ${key}: ${value}`);
                });

                console.log(`\n🤔 Decision History:`);
                result.decision_history?.forEach((decision, idx) => {
                    console.log(`   ${idx + 1}. ${decision.decision_type} (confidence: ${decision.confidence}) - ${decision.reasoning.substring(0, 80)}...`);
                });

                console.log(`\n📝 Final Answer:`);
                console.log(`   ${result.answer}`);

                if (result.error) {
                    console.log(`\n❌ Error: ${result.error}`);
                }

                console.log(`\n✅ Test ${i + 1} completed successfully`);

            } catch (error) {
                console.log(`\n❌ Test ${i + 1} failed: ${error}`);
                console.error(error);
            }
        }

        console.log(`\n` + '═'.repeat(70));
        console.log('🎉 TEST SUITE COMPLETED');
        console.log('═'.repeat(70));
    }

    async cleanup(): Promise<void> {
        console.log('\n🧹 Cleaning up test environment...');

        if (this.vectorStore) {
            await this.vectorStore.close();
        }

        console.log('✅ Cleanup completed');
    }
}

// Main execution function
async function main(): Promise<void> {
    console.log('╔═════════════════════════════════════════════════════════════════╗');
    console.log('║              Enhanced Decision Agent Test Runner               ║');
    console.log('╚═════════════════════════════════════════════════════════════════╝');

    // Parse command line arguments
    const args = process.argv.slice(2);

    if (args.includes('--help') || args.includes('-h')) {
        console.log('\n📖 Usage:');
        console.log('  npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts [options]');
        console.log('\n🎯 Options:');
        console.log('  --llm <provider>       LLM provider: openai|ollama (default: ollama)');
        console.log('  --embedding <provider> Embedding provider: openai|ollama|huggingface (default: ollama)');
        console.log('  --verbose, -v          Detailed output (default: true)');
        console.log('  --quiet, -q            Minimal output');
        console.log('  --help, -h             Show this help');
        console.log('\n💡 Examples:');
        console.log('  npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts --verbose');
        console.log('  npm run ts-node src/main/agents/scripts/test-enhanced-agent.ts --llm openai --embedding openai');
        return;
    }

    const config: TestConfig = {
        llmProvider: (args.find((_, i) => args[i - 1] === '--llm') as any) || 'ollama',
        embeddingProvider: (args.find((_, i) => args[i - 1] === '--embedding') as any) || 'ollama',
        verbose: !args.includes('--quiet') && !args.includes('-q')
    };

    const tester = new EnhancedAgentTester(config);

    try {
        // Initialize test environment
        await tester.initialize();

        // Run the test suite
        await tester.runTestSuite();

    } catch (error) {
        console.error('❌ Test execution failed:', error);
        process.exit(1);
    } finally {
        await tester.cleanup();
        console.log('\n👋 Enhanced Decision Agent testing completed. Goodbye!');
    }
}

// Run the test runner
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

export { EnhancedAgentTester };