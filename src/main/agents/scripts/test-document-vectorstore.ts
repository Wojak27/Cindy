import { DuckDBVectorStore } from '../../services/DuckDBVectorStore';
import { LangChainVectorStoreService } from '../../services/LangChainVectorStoreService';
import { Document } from '@langchain/core/documents';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../../.env') });

// Test configuration interfaces
interface TestConfig {
    mode: 'duckdb' | 'langchain' | 'both' | 'performance' | 'providers';
    provider: 'openai' | 'ollama' | 'huggingface';
    verbose: boolean;
    tempDir: string;
}

interface TestResults {
    testName: string;
    provider: string;
    service: string;
    duration: number;
    success: boolean;
    error?: string;
    metrics?: {
        documentsIndexed?: number;
        searchResults?: number;
        memoryUsage?: number;
    };
}

class DocumentVectorStoreTest {
    private config: TestConfig;
    private results: TestResults[] = [];
    private tempDir: string;

    constructor(config: TestConfig) {
        this.config = config;
        this.tempDir = config.tempDir;
        this.ensureTempDir();
    }

    private ensureTempDir(): void {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
            console.log(`📁 Created temp directory: ${this.tempDir}`);
        }
    }

    private log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
        const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
        const prefix = level === 'info' ? '📊' : level === 'warn' ? '⚠️' : '❌';
        console.log(`${prefix} [${timestamp}] ${message}`);
    }

    private async createTestDuckDBStore(provider: string, apiKey?: string): Promise<DuckDBVectorStore> {
        const dbPath = path.join(this.tempDir, `test-vector-${provider}-${Date.now()}.db`);

        const config: any = {
            databasePath: dbPath,
            embeddingProvider: provider,
            chunkSize: 500, // Smaller for testing
            chunkOverlap: 50,
        };

        switch (provider) {
            case 'openai':
                if (!apiKey) throw new Error('OpenAI API key required');
                config.openaiApiKey = apiKey;
                config.embeddingModel = 'text-embedding-3-small';
                break;
            case 'ollama':
                config.ollamaBaseUrl = 'http://127.0.0.1:11434';
                config.embeddingModel = 'dengcao/Qwen3-Embedding-0.6B:Q8_0';
                break;
            case 'huggingface':
                config.huggingfaceModel = 'Xenova/all-MiniLM-L6-v2';
                break;
        }

        const store = new DuckDBVectorStore(config);
        await store.initialize();
        return store;
    }

    private async createTestLangChainStore(apiKey: string): Promise<LangChainVectorStoreService> {
        const service = new LangChainVectorStoreService({
            databasePath: this.tempDir,
            embeddingModel: 'text-embedding-3-small',
            chunkSize: 500,
            chunkOverlap: 50,
            autoIndex: false,
            openaiApiKey: apiKey
        });

        await service.initialize();
        return service;
    }

    private createTestDocuments(): Document[] {
        return [
            new Document({
                pageContent: "This is a test document about artificial intelligence. AI has revolutionized many industries including healthcare, finance, and transportation. Machine learning algorithms can process vast amounts of data to identify patterns and make predictions.",
                metadata: { source: 'test-ai.txt', type: 'article', category: 'technology' }
            }),
            new Document({
                pageContent: "Climate change is one of the most pressing issues of our time. Rising global temperatures are causing sea levels to rise, weather patterns to shift, and ecosystems to be disrupted. Renewable energy sources like solar and wind power are becoming increasingly important.",
                metadata: { source: 'test-climate.txt', type: 'article', category: 'environment' }
            }),
            new Document({
                pageContent: "The history of space exploration began in the mid-20th century with the launch of Sputnik 1 by the Soviet Union in 1957. This was followed by the first human spaceflight by Yuri Gagarin in 1961. The Apollo program culminated in the moon landing in 1969.",
                metadata: { source: 'test-space.txt', type: 'article', category: 'science' }
            }),
            new Document({
                pageContent: "Modern web development involves many technologies including HTML, CSS, JavaScript, and various frameworks like React, Vue, and Angular. Backend development often uses Node.js, Python, or Go with databases like MongoDB, PostgreSQL, or Redis.",
                metadata: { source: 'test-webdev.txt', type: 'article', category: 'programming' }
            })
        ];
    }

    private async createTestFiles(): Promise<string[]> {
        const testFiles: string[] = [];

        // Create test text files
        const textContent = {
            'sample.txt': "This is a sample text file for testing document vectorstore functionality. It contains multiple sentences to test text splitting and embedding generation. The content should be searchable and retrievable through similarity search.",
            'article.txt': "Advanced machine learning techniques are transforming the field of natural language processing. Large language models like GPT and BERT have achieved remarkable performance on various NLP tasks including text classification, named entity recognition, and question answering.",
            'research.md': "# Research Paper Summary\n\nThis document contains a summary of recent advances in vector databases and semantic search. Key topics include:\n\n- Embedding generation techniques\n- Similarity search algorithms\n- Performance optimization strategies\n- Real-world applications and use cases"
        };

        for (const [filename, content] of Object.entries(textContent)) {
            const filePath = path.join(this.tempDir, filename);
            fs.writeFileSync(filePath, content, 'utf-8');
            testFiles.push(filePath);
        }

        // Create test JSON file
        const jsonData = {
            title: "Test JSON Document",
            content: "This is a JSON document containing structured data for testing. It includes nested objects and arrays to verify proper JSON parsing and content extraction.",
            metadata: {
                created: "2024-01-01",
                author: "Test Suite",
                tags: ["testing", "json", "vectorstore"]
            }
        };

        const jsonPath = path.join(this.tempDir, 'data.json');
        fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2));
        testFiles.push(jsonPath);

        return testFiles;
    }

    async runDuckDBTests(provider: string): Promise<void> {
        this.log(`\n🦆 Starting DuckDB VectorStore tests with ${provider} provider`);

        const apiKey = provider === 'openai' ? process.env.OPENAI_API_KEY : undefined;
        let store: DuckDBVectorStore | null = null;

        try {
            // Test 1: Initialization
            const initStart = Date.now();
            store = await this.createTestDuckDBStore(provider, apiKey);
            const initDuration = Date.now() - initStart;

            this.results.push({
                testName: 'DuckDB Initialization',
                provider,
                service: 'DuckDBVectorStore',
                duration: initDuration,
                success: true
            });

            this.log(`✅ DuckDB initialization completed in ${initDuration}ms`);

            // Test 2: Add test documents
            const docs = this.createTestDocuments();
            const addStart = Date.now();
            await store.addDocuments(docs);
            const addDuration = Date.now() - addStart;

            this.results.push({
                testName: 'Add Documents',
                provider,
                service: 'DuckDBVectorStore',
                duration: addDuration,
                success: true,
                metrics: { documentsIndexed: docs.length }
            });

            this.log(`✅ Added ${docs.length} documents in ${addDuration}ms`);

            // Test 3: Similarity search
            const queries = [
                'artificial intelligence machine learning',
                'climate change environment',
                'space exploration moon landing',
                'web development programming'
            ];

            for (const query of queries) {
                const searchStart = Date.now();
                const results = await store.similaritySearch(query, 3);
                const searchDuration = Date.now() - searchStart;

                this.results.push({
                    testName: `Similarity Search: "${query.substring(0, 20)}..."`,
                    provider,
                    service: 'DuckDBVectorStore',
                    duration: searchDuration,
                    success: true,
                    metrics: { searchResults: results.length }
                });

                this.log(`✅ Search "${query}" returned ${results.length} results in ${searchDuration}ms`);

                if (this.config.verbose && results.length > 0) {
                    console.log(`   📄 Top result: "${results[0].pageContent.substring(0, 100)}..."`);
                }
            }

            // Test 4: File indexing
            const testFiles = await this.createTestFiles();
            const indexStart = Date.now();
            const indexResult = await store.indexFolder(this.tempDir);
            const indexDuration = Date.now() - indexStart;

            this.results.push({
                testName: 'Index Folder',
                provider,
                service: 'DuckDBVectorStore',
                duration: indexDuration,
                success: indexResult.errors === 0,
                metrics: { documentsIndexed: indexResult.success }
            });

            this.log(`✅ Indexed ${indexResult.success} files (${indexResult.errors} errors) in ${indexDuration}ms`);

            // Test 5: Search indexed files
            const fileSearchStart = Date.now();
            const fileResults = await store.similaritySearch('machine learning NLP', 5);
            const fileSearchDuration = Date.now() - fileSearchStart;

            this.results.push({
                testName: 'Search Indexed Files',
                provider,
                service: 'DuckDBVectorStore',
                duration: fileSearchDuration,
                success: true,
                metrics: { searchResults: fileResults.length }
            });

            this.log(`✅ File search returned ${fileResults.length} results in ${fileSearchDuration}ms`);

            // Test 6: Database stats
            await store.debugDatabaseContents();
            const indexedFiles = await store.getIndexedFiles();
            this.log(`📊 Total indexed files: ${indexedFiles.length}`);

        } catch (error) {
            this.log(`❌ DuckDB test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
            this.results.push({
                testName: 'DuckDB Test Suite',
                provider,
                service: 'DuckDBVectorStore',
                duration: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        } finally {
            if (store) {
                await store.close();
            }
        }
    }

    async runLangChainTests(): Promise<void> {
        this.log(`\n🔗 Starting LangChain VectorStore tests with OpenAI provider`);

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            this.log('❌ OpenAI API key required for LangChain tests', 'error');
            return;
        }

        let service: LangChainVectorStoreService | null = null;

        try {
            // Test 1: Initialization
            const initStart = Date.now();
            service = await this.createTestLangChainStore(apiKey);
            const initDuration = Date.now() - initStart;

            this.results.push({
                testName: 'LangChain Initialization',
                provider: 'openai',
                service: 'LangChainVectorStoreService',
                duration: initDuration,
                success: true
            });

            this.log(`✅ LangChain initialization completed in ${initDuration}ms`);

            // Test 2: Add test files
            const testFiles = await this.createTestFiles();
            let totalIndexed = 0;
            let totalDuration = 0;

            for (const filePath of testFiles) {
                const addStart = Date.now();
                const success = await service.addDocumentFromFile(filePath);
                const addDuration = Date.now() - addStart;
                totalDuration += addDuration;

                if (success) {
                    totalIndexed++;
                    this.log(`✅ Indexed file: ${path.basename(filePath)} (${addDuration}ms)`);
                } else {
                    this.log(`❌ Failed to index: ${path.basename(filePath)}`, 'error');
                }
            }

            this.results.push({
                testName: 'Index Files',
                provider: 'openai',
                service: 'LangChainVectorStoreService',
                duration: totalDuration,
                success: totalIndexed === testFiles.length,
                metrics: { documentsIndexed: totalIndexed }
            });

            // Test 3: Search tests
            const queries = [
                'machine learning natural language processing',
                'vector database semantic search',
                'JSON structured data testing'
            ];

            for (const query of queries) {
                const searchStart = Date.now();
                const results = await service.search(query, { k: 3 });
                const searchDuration = Date.now() - searchStart;

                this.results.push({
                    testName: `Search: "${query.substring(0, 20)}..."`,
                    provider: 'openai',
                    service: 'LangChainVectorStoreService',
                    duration: searchDuration,
                    success: true,
                    metrics: { searchResults: results.length }
                });

                this.log(`✅ Search "${query}" returned ${results.length} results in ${searchDuration}ms`);

                if (this.config.verbose && results.length > 0) {
                    console.log(`   📄 Top result: "${results[0].content.substring(0, 100)}..."`);
                    console.log(`   📊 Score: ${results[0].score?.toFixed(3)}`);
                }
            }

            // Test 4: Service stats
            const stats = await service.getStats();
            this.log(`📊 Service stats: ${stats.totalFiles} files, ${stats.totalChunks} chunks, ${stats.vectorStoreSize} vectors`);

        } catch (error) {
            this.log(`❌ LangChain test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
            this.results.push({
                testName: 'LangChain Test Suite',
                provider: 'openai',
                service: 'LangChainVectorStoreService',
                duration: 0,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    async runProviderComparison(): Promise<void> {
        this.log('\n🔄 Running embedding provider comparison tests');

        const providers = ['ollama', 'huggingface'];
        if (process.env.OPENAI_API_KEY) {
            providers.unshift('openai');
        }

        const testQuery = 'artificial intelligence machine learning';
        const docs = this.createTestDocuments().slice(0, 2); // Use fewer docs for comparison

        for (const provider of providers) {
            try {
                const store = await this.createTestDuckDBStore(provider, process.env.OPENAI_API_KEY);

                // Index documents
                const indexStart = Date.now();
                await store.addDocuments(docs);
                const indexDuration = Date.now() - indexStart;

                // Search test
                const searchStart = Date.now();
                const results = await store.similaritySearch(testQuery, 2);
                const searchDuration = Date.now() - searchStart;

                this.results.push({
                    testName: `Provider Comparison - ${provider}`,
                    provider,
                    service: 'DuckDBVectorStore',
                    duration: indexDuration + searchDuration,
                    success: true,
                    metrics: {
                        documentsIndexed: docs.length,
                        searchResults: results.length
                    }
                });

                this.log(`✅ ${provider}: indexed ${docs.length} docs (${indexDuration}ms), search returned ${results.length} results (${searchDuration}ms)`);

                await store.close();

            } catch (error) {
                this.log(`❌ ${provider} provider test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
                this.results.push({
                    testName: `Provider Comparison - ${provider}`,
                    provider,
                    service: 'DuckDBVectorStore',
                    duration: 0,
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    async runPerformanceTests(): Promise<void> {
        this.log('\n⚡ Running performance benchmark tests');

        // Create larger dataset for performance testing
        const largeDocs: Document[] = [];
        for (let i = 0; i < 50; i++) {
            largeDocs.push(new Document({
                pageContent: `Performance test document ${i}. This document contains content about various topics including technology, science, and research. The content is designed to test the performance of document indexing and search operations at scale. Document number ${i} has unique content that should be retrievable through similarity search operations.`,
                metadata: { source: `perf-test-${i}.txt`, batch: Math.floor(i / 10) }
            }));
        }

        if (process.env.OPENAI_API_KEY) {
            const store = await this.createTestDuckDBStore('openai', process.env.OPENAI_API_KEY);

            try {
                // Batch indexing performance
                const batchStart = Date.now();
                await store.addDocuments(largeDocs);
                const batchDuration = Date.now() - batchStart;

                this.log(`📊 Indexed ${largeDocs.length} documents in ${batchDuration}ms (${(batchDuration / largeDocs.length).toFixed(2)}ms per document)`);

                // Search performance with different k values
                const searchQuery = 'technology science research';
                for (const k of [1, 5, 10, 20]) {
                    const searchStart = Date.now();
                    const results = await store.similaritySearch(searchQuery, k);
                    const searchDuration = Date.now() - searchStart;

                    this.log(`📊 k=${k}: ${results.length} results in ${searchDuration}ms`);
                }

                // Memory usage
                const memUsage = process.memoryUsage();
                this.log(`💾 Memory usage: RSS ${(memUsage.rss / 1024 / 1024).toFixed(1)}MB, Heap ${(memUsage.heapUsed / 1024 / 1024).toFixed(1)}MB`);

                await store.close();

            } catch (error) {
                this.log(`❌ Performance test failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
                await store.close();
            }
        } else {
            this.log('⚠️ Skipping performance tests - OpenAI API key required', 'warn');
        }
    }

    private printResults(): void {
        console.log('\n' + '='.repeat(80));
        console.log('📊 TEST RESULTS SUMMARY');
        console.log('='.repeat(80));

        const successful = this.results.filter(r => r.success);
        const failed = this.results.filter(r => !r.success);

        console.log(`✅ Successful tests: ${successful.length}`);
        console.log(`❌ Failed tests: ${failed.length}`);
        console.log(`📈 Success rate: ${((successful.length / this.results.length) * 100).toFixed(1)}%`);

        if (successful.length > 0) {
            console.log('\n📊 Performance Summary:');
            const avgDuration = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
            console.log(`   Average test duration: ${avgDuration.toFixed(1)}ms`);

            const totalDocs = successful.reduce((sum, r) => sum + (r.metrics?.documentsIndexed || 0), 0);
            const totalSearches = successful.reduce((sum, r) => sum + (r.metrics?.searchResults || 0), 0);

            if (totalDocs > 0) console.log(`   Total documents indexed: ${totalDocs}`);
            if (totalSearches > 0) console.log(`   Total search results: ${totalSearches}`);
        }

        if (failed.length > 0) {
            console.log('\n❌ Failed Tests:');
            failed.forEach(r => {
                console.log(`   ${r.testName} (${r.service}): ${r.error}`);
            });
        }

        if (this.config.verbose) {
            console.log('\n📋 Detailed Results:');
            this.results.forEach(r => {
                const status = r.success ? '✅' : '❌';
                const metrics = r.metrics ? `| Docs: ${r.metrics.documentsIndexed || 0}, Results: ${r.metrics.searchResults || 0}` : '';
                console.log(`   ${status} ${r.testName} (${r.provider}/${r.service}): ${r.duration}ms ${metrics}`);
            });
        }
    }

    private cleanup(): void {
        try {
            // Clean up temporary files
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                for (const file of files) {
                    const filePath = path.join(this.tempDir, file);
                    try {
                        if (fs.statSync(filePath).isFile()) {
                            fs.unlinkSync(filePath);
                        }
                    } catch (error) {
                        // Ignore cleanup errors
                    }
                }

                // Try to remove the directory
                try {
                    fs.rmdirSync(this.tempDir);
                    this.log(`🧹 Cleaned up temp directory: ${this.tempDir}`);
                } catch (error) {
                    // Directory might not be empty, that's okay
                }
            }
        } catch (error) {
            this.log(`⚠️ Cleanup warning: ${error instanceof Error ? error.message : String(error)}`, 'warn');
        }
    }

    async runTests(): Promise<void> {
        const startTime = Date.now();
        this.log('🚀 Starting Document VectorStore Test Suite');
        this.log(`📋 Mode: ${this.config.mode}, Provider: ${this.config.provider}`);

        try {
            switch (this.config.mode) {
                case 'duckdb':
                    await this.runDuckDBTests(this.config.provider);
                    break;

                case 'langchain':
                    await this.runLangChainTests();
                    break;

                case 'both':
                    await this.runDuckDBTests(this.config.provider);
                    await this.runLangChainTests();
                    break;

                case 'providers':
                    await this.runProviderComparison();
                    break;

                case 'performance':
                    await this.runPerformanceTests();
                    break;

                default:
                    throw new Error(`Unknown test mode: ${this.config.mode}`);
            }

        } catch (error) {
            this.log(`❌ Test suite failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            const totalDuration = Date.now() - startTime;
            this.log(`⏱️ Total test duration: ${totalDuration}ms`);

            this.printResults();
            this.cleanup();
        }
    }
}

async function main(): Promise<void> {
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log('║               Document VectorStore Test Suite                ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    // Parse command line arguments
    const args = process.argv.slice(2);

    // Show help and exit if requested
    if (args.includes('--help') || args.includes('-h')) {
        console.log('\n📖 Usage:');
        console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts [mode] [provider] [--verbose]');
        console.log('\n🎯 Modes:');
        console.log('  duckdb      - Test DuckDBVectorStore only');
        console.log('  langchain   - Test LangChainVectorStoreService only');
        console.log('  both        - Test both implementations (default)');
        console.log('  providers   - Compare different embedding providers');
        console.log('  performance - Run performance benchmarks');
        console.log('\n🔧 Providers: openai, ollama, huggingface');
        console.log('🔍 Options: --verbose, -v (detailed output), --help, -h (show this help)');
        console.log('\n💡 Examples:');
        console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts');
        console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts duckdb ollama --verbose');
        console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts providers');
        console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts performance openai');
        return;
    }

    const mode = (args.find(arg => ['duckdb', 'langchain', 'both', 'providers', 'performance'].includes(arg)) as TestConfig['mode']) || 'both';
    const provider = (args.find(arg => ['openai', 'ollama', 'huggingface'].includes(arg)) as TestConfig['provider']) || 'ollama';
    const verbose = args.includes('--verbose') || args.includes('-v');

    console.log('\n📖 Usage:');
    console.log('  npm run ts-node src/main/services/test-document-vectorstore.ts [mode] [provider] [--verbose]');
    console.log('\n🎯 Modes:');
    console.log('  duckdb      - Test DuckDBVectorStore only');
    console.log('  langchain   - Test LangChainVectorStoreService only');
    console.log('  both        - Test both implementations (default)');
    console.log('  providers   - Compare different embedding providers');
    console.log('  performance - Run performance benchmarks');
    console.log('\n🔧 Providers: openai, ollama, huggingface');
    console.log('🔍 Options: --verbose, -v (detailed output)');
    console.log('');

    // Validate environment
    if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
        console.log('⚠️ Warning: OpenAI API key not found in environment variables');
        console.log('   Set OPENAI_API_KEY in your .env file for OpenAI tests');
    }

    if (provider === 'ollama') {
        console.log('🦙 Note: Ollama tests require a running Ollama server at http://127.0.0.1:11434');
        console.log('   Make sure the required embedding model is installed: dengcao/Qwen3-Embedding-0.6B:Q8_0');
    }

    const config: TestConfig = {
        mode,
        provider,
        verbose,
        tempDir: path.join(os.tmpdir(), `vectorstore-test-${Date.now()}`)
    };

    const testSuite = new DocumentVectorStoreTest(config);
    await testSuite.runTests();

    console.log('\n👋 Test suite completed. Goodbye!');
}

// Run the test suite
if (require.main === module) {
    main().catch((error) => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

export { DocumentVectorStoreTest };