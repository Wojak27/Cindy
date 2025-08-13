import { TextToSpeechService, TTSOptions } from '../main/services/TextToSpeechService';
import { MicroChunker, MicroChunkConfig } from '../main/services/MicroChunker';
import { BackpressureController } from '../main/services/BackpressureController';
import { ProsodySmoother } from '../main/services/ProsodySmoother';

/**
 * Comprehensive Test Suite for Micro-Streaming TTS
 * 
 * Tests latency targets, punctuation handling, response lengths,
 * performance modes, and network conditions.
 */

interface TestResult {
    testName: string;
    success: boolean;
    metrics: any;
    errors?: string[];
    latencyMs?: number;
    firstAudioTimeMs?: number;
    chunkCount?: number;
    avgChunkSizeTokens?: number;
}

export class MicroStreamingTestSuite {
    private ttsService: TextToSpeechService;
    private testResults: TestResult[] = [];

    constructor() {
        // Initialize with micro-streaming enabled
        this.ttsService = new TextToSpeechService({
            provider: 'system', // Use system TTS for faster testing
            enableStreaming: true,
            streamingMode: 'micro',
            microStreamingConfig: {
                mode: 'micro',
                lookaheadTokens: 4,
                chunkTokenBudget: 16,
                timeBudgetMs: 250,
                crossfadeMs: 10,
                forceFlushTimeoutMs: 500
            },
            enableProsodySmoothing: true
        });
    }

    /**
     * Run all test scenarios
     */
    async runAllTests(): Promise<TestResult[]> {
        console.log('🧪 Starting Micro-Streaming TTS Test Suite...\n');

        await this.ttsService.initialize();

        // Latency tests
        await this.testShortResponseLatency();
        await this.testFirstAudioTime();

        // Punctuation handling tests
        await this.testSoftPunctuation();
        await this.testHardPunctuation();
        await this.testMixedPunctuation();

        // Response length tests
        await this.testVeryShortResponses();
        await this.testLongResponses();
        await this.testBurstResponses();

        // Performance mode tests
        await this.testCpuMode();
        await this.testGpuMode();

        // Network jitter simulation
        await this.testNetworkJitter();

        // Backpressure tests
        await this.testHighBufferCondition();
        await this.testLowBufferCondition();

        // Feature flag tests
        await this.testSentenceModeRollback();
        await this.testHotConfigReload();

        await this.ttsService.cleanup();

        console.log('\n📊 Test Results Summary:');
        this.printTestSummary();

        return this.testResults;
    }

    /**
     * Test: Short response latency (≤ 400ms target)
     */
    private async testShortResponseLatency(): Promise<void> {
        const testName = 'Short Response Latency';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const text = 'Yes.';
            const startTime = Date.now();

            const result = await this.ttsService.synthesizeStreaming(text);
            const latencyMs = Date.now() - startTime;

            const success = result.success && latencyMs <= 400;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                latencyMs,
                firstAudioTimeMs: result.firstAudioTimeMs
            });

            console.log(`   ✅ Latency: ${latencyMs}ms (target: ≤400ms)`);
            console.log(`   ✅ First audio: ${result.firstAudioTimeMs || 'N/A'}ms\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: First audio time target
     */
    private async testFirstAudioTime(): Promise<void> {
        const testName = 'First Audio Time';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const text = 'Hello, how are you doing today?';

            const result = await this.ttsService.synthesizeStreaming(text);
            const firstAudioTime = result.firstAudioTimeMs || 0;
            const success = result.success && firstAudioTime <= 600; // 600ms for CPU mode

            this.testResults.push({
                testName,
                success,
                metrics: result,
                firstAudioTimeMs: firstAudioTime
            });

            console.log(`   ✅ First audio time: ${firstAudioTime}ms (target: ≤600ms)`);
            console.log(`   ✅ Chunk count: ${result.chunkCount || 0}\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Soft punctuation triggers (commas, colons, semicolons)
     */
    private async testSoftPunctuation(): Promise<void> {
        const testName = 'Soft Punctuation Handling';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const text = 'First part, second part; third part: final part.';

            const result = await this.ttsService.synthesizeStreaming(text);
            const expectedMinChunks = 3; // Should chunk on soft punctuation
            const success = result.success && (result.chunkCount || 0) >= expectedMinChunks;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                chunkCount: result.chunkCount
            });

            console.log(`   ✅ Chunks created: ${result.chunkCount || 0} (expected: ≥${expectedMinChunks})`);
            console.log(`   ✅ Avg chunk size: ${result.avgChunkSizeTokens || 0} tokens\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Hard punctuation triggers (periods, exclamations, questions)
     */
    private async testHardPunctuation(): Promise<void> {
        const testName = 'Hard Punctuation Handling';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const text = 'First sentence. Second sentence! Third sentence?';

            const result = await this.ttsService.synthesizeStreaming(text);
            const expectedChunks = 3; // Should chunk on each sentence ending
            const success = result.success && (result.chunkCount || 0) >= expectedChunks;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                chunkCount: result.chunkCount
            });

            console.log(`   ✅ Sentence chunks: ${result.chunkCount || 0} (expected: ≥${expectedChunks})\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Mixed punctuation scenario
     */
    private async testMixedPunctuation(): Promise<void> {
        const testName = 'Mixed Punctuation';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const text = 'Well, hello there! How are you: feeling good? Yes, very good.';

            const result = await this.ttsService.synthesizeStreaming(text);
            const success = result.success && (result.chunkCount || 0) >= 4;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                chunkCount: result.chunkCount
            });

            console.log(`   ✅ Mixed punctuation chunks: ${result.chunkCount || 0}\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Very short responses
     */
    private async testVeryShortResponses(): Promise<void> {
        const testName = 'Very Short Responses';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const shortTexts = ['OK', 'No.', 'Maybe', 'Yes!', 'Sure'];
            const results = [];

            for (const text of shortTexts) {
                const result = await this.ttsService.synthesizeStreaming(text);
                results.push(result);
            }

            const allSuccessful = results.every(r => r.success);
            const avgLatency = results.reduce((sum, r) => sum + (r.duration || 0), 0) / results.length;

            this.testResults.push({
                testName,
                success: allSuccessful && avgLatency <= 300,
                metrics: { avgLatency, results: results.length },
                latencyMs: avgLatency
            });

            console.log(`   ✅ All short responses successful: ${allSuccessful}`);
            console.log(`   ✅ Average latency: ${avgLatency.toFixed(0)}ms (target: ≤300ms)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Long responses
     */
    private async testLongResponses(): Promise<void> {
        const testName = 'Long Responses';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const longText = `This is a very long response that contains multiple sentences with various punctuation marks: commas, semicolons; question marks? and exclamation points! The purpose is to test how the micro-chunking system handles extended content, ensuring that backpressure control works properly and that the system can maintain good performance even with substantial amounts of text to process.`;

            const result = await this.ttsService.synthesizeStreaming(longText);
            const success = result.success && (result.chunkCount || 0) >= 8;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                chunkCount: result.chunkCount,
                avgChunkSizeTokens: result.avgChunkSizeTokens
            });

            console.log(`   ✅ Long response chunks: ${result.chunkCount || 0}`);
            console.log(`   ✅ Average chunk size: ${result.avgChunkSizeTokens?.toFixed(1) || 0} tokens\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Fast burst responses (backpressure)
     */
    private async testBurstResponses(): Promise<void> {
        const testName = 'Burst Responses';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const burstTexts = [
                'First response.',
                'Second response here.',
                'Third response coming.',
                'Fourth one ready.',
                'Fifth and final.'
            ];

            // Simulate backpressure by updating buffer telemetry
            this.ttsService.updateClientBufferTelemetry(2000, 0); // High buffer

            const startTime = Date.now();
            const results = await Promise.all(
                burstTexts.map(text => this.ttsService.synthesizeStreaming(text))
            );
            const totalTime = Date.now() - startTime;

            const allSuccessful = results.every(r => r.success);
            const avgChunkSize = results.reduce((sum, r) => sum + (r.avgChunkSizeTokens || 0), 0) / results.length;

            this.testResults.push({
                testName,
                success: allSuccessful,
                metrics: {
                    totalTime,
                    avgChunkSize,
                    responsesProcessed: results.length
                },
                avgChunkSizeTokens: avgChunkSize
            });

            console.log(`   ✅ Burst processing successful: ${allSuccessful}`);
            console.log(`   ✅ Total processing time: ${totalTime}ms`);
            console.log(`   ✅ Avg chunk size (with backpressure): ${avgChunkSize.toFixed(1)} tokens\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: CPU mode performance
     */
    private async testCpuMode(): Promise<void> {
        const testName = 'CPU Mode Performance';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Simulate CPU-only constraints
            await this.ttsService.updateOptions({
                microStreamingConfig: {
                    chunkTokenBudget: 12, // Smaller chunks for CPU
                    timeBudgetMs: 300     // Longer time budget
                }
            });

            const text = 'Testing CPU mode performance with moderate response length.';
            const result = await this.ttsService.synthesizeStreaming(text);

            const success = result.success && (result.firstAudioTimeMs || 0) <= 600;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                firstAudioTimeMs: result.firstAudioTimeMs
            });

            console.log(`   ✅ CPU mode first audio: ${result.firstAudioTimeMs || 0}ms (target: ≤600ms)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: GPU mode performance
     */
    private async testGpuMode(): Promise<void> {
        const testName = 'GPU Mode Performance';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Simulate GPU-optimized settings
            await this.ttsService.updateOptions({
                microStreamingConfig: {
                    chunkTokenBudget: 20, // Larger chunks for GPU
                    timeBudgetMs: 200     // Shorter time budget
                }
            });

            const text = 'Testing GPU mode performance with optimized chunk sizes.';
            const result = await this.ttsService.synthesizeStreaming(text);

            const success = result.success && (result.firstAudioTimeMs || 0) <= 400;

            this.testResults.push({
                testName,
                success,
                metrics: result,
                firstAudioTimeMs: result.firstAudioTimeMs
            });

            console.log(`   ✅ GPU mode first audio: ${result.firstAudioTimeMs || 0}ms (target: ≤400ms)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Network jitter simulation
     */
    private async testNetworkJitter(): Promise<void> {
        const testName = 'Network Jitter Simulation';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Simulate network jitter by introducing buffer fluctuations
            const text = 'Testing network jitter resilience with buffer fluctuations.';

            // Simulate varying buffer conditions during synthesis
            let synthesisPromise = this.ttsService.synthesizeStreaming(text);

            // Simulate jitter by updating buffer telemetry during synthesis
            setTimeout(() => this.ttsService.updateClientBufferTelemetry(50, 1), 100);  // Low buffer, underrun
            setTimeout(() => this.ttsService.updateClientBufferTelemetry(200, 0), 200); // Recovery
            setTimeout(() => this.ttsService.updateClientBufferTelemetry(30, 2), 300);  // Critical low
            setTimeout(() => this.ttsService.updateClientBufferTelemetry(150, 0), 400); // Stabilize

            const result = await synthesisPromise;
            const success = result.success;

            this.testResults.push({
                testName,
                success,
                metrics: result
            });

            console.log(`   ✅ Network jitter resilience: ${success ? 'PASS' : 'FAIL'}\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: High buffer condition (backpressure increases chunk size)
     */
    private async testHighBufferCondition(): Promise<void> {
        const testName = 'High Buffer Backpressure';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Simulate high buffer condition
            this.ttsService.updateClientBufferTelemetry(1800, 0); // High buffer, no underruns

            const text = 'Testing high buffer condition with increased chunk sizes.';
            const result = await this.ttsService.synthesizeStreaming(text);

            // Should use larger chunks due to backpressure
            const avgChunkSize = result.avgChunkSizeTokens || 0;
            const success = result.success && avgChunkSize >= 16; // Should increase from default

            this.testResults.push({
                testName,
                success,
                metrics: result,
                avgChunkSizeTokens: avgChunkSize
            });

            console.log(`   ✅ High buffer chunk size: ${avgChunkSize.toFixed(1)} tokens (expected: ≥16)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Low buffer condition (backpressure decreases chunk size)
     */
    private async testLowBufferCondition(): Promise<void> {
        const testName = 'Low Buffer Backpressure';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Simulate low buffer condition
            this.ttsService.updateClientBufferTelemetry(60, 3); // Low buffer, multiple underruns

            const text = 'Testing low buffer condition with decreased chunk sizes.';
            const result = await this.ttsService.synthesizeStreaming(text);

            // Should use smaller chunks due to backpressure
            const avgChunkSize = result.avgChunkSizeTokens || 0;
            const success = result.success && avgChunkSize <= 12; // Should decrease from default

            this.testResults.push({
                testName,
                success,
                metrics: result,
                avgChunkSizeTokens: avgChunkSize
            });

            console.log(`   ✅ Low buffer chunk size: ${avgChunkSize.toFixed(1)} tokens (expected: ≤12)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Rollback to sentence mode
     */
    private async testSentenceModeRollback(): Promise<void> {
        const testName = 'Sentence Mode Rollback';
        console.log(`🔬 Testing: ${testName}`);

        try {
            // Switch to sentence mode
            await this.ttsService.updateOptions({ streamingMode: 'sentence' });

            const text = 'Testing rollback to sentence mode. This should not micro-chunk.';
            const result = await this.ttsService.synthesizeStreaming(text);

            // Should process as sentences, not micro-chunks
            const success = result.success && !result.isMicroStreaming;

            this.testResults.push({
                testName,
                success,
                metrics: result
            });

            console.log(`   ✅ Sentence mode rollback: ${success ? 'PASS' : 'FAIL'}`);
            console.log(`   ✅ Is micro-streaming: ${result.isMicroStreaming || false}\n`);

            // Switch back to micro mode for remaining tests
            await this.ttsService.updateOptions({ streamingMode: 'micro' });

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Test: Hot configuration reload
     */
    private async testHotConfigReload(): Promise<void> {
        const testName = 'Hot Config Reload';
        console.log(`🔬 Testing: ${testName}`);

        try {
            const originalConfig = this.ttsService.getOptions();

            // Update config during runtime
            await this.ttsService.updateOptions({
                microStreamingConfig: {
                    chunkTokenBudget: 8,  // Very small chunks
                    timeBudgetMs: 150     // Very fast emission
                }
            });

            const text = 'Testing hot configuration reload with new parameters.';
            const result = await this.ttsService.synthesizeStreaming(text);

            const avgChunkSize = result.avgChunkSizeTokens || 0;
            const success = result.success && avgChunkSize <= 10; // Should use new smaller setting

            this.testResults.push({
                testName,
                success,
                metrics: result,
                avgChunkSizeTokens: avgChunkSize
            });

            console.log(`   ✅ Hot reload chunk size: ${avgChunkSize.toFixed(1)} tokens (expected: ≤10)\n`);

        } catch (error) {
            this.testResults.push({
                testName,
                success: false,
                metrics: {},
                errors: [error.message]
            });
            console.log(`   ❌ Error: ${error.message}\n`);
        }
    }

    /**
     * Print test summary
     */
    private printTestSummary(): void {
        const passed = this.testResults.filter(r => r.success).length;
        const total = this.testResults.length;
        const passRate = (passed / total * 100).toFixed(1);

        console.log(`📈 Passed: ${passed}/${total} tests (${passRate}%)\n`);

        // Print failed tests
        const failed = this.testResults.filter(r => !r.success);
        if (failed.length > 0) {
            console.log('❌ Failed Tests:');
            failed.forEach(test => {
                console.log(`   • ${test.testName}: ${test.errors?.join(', ') || 'Unknown error'}`);
            });
            console.log();
        }

        // Print key metrics
        const latencyTests = this.testResults.filter(r => r.latencyMs !== undefined);
        if (latencyTests.length > 0) {
            const avgLatency = latencyTests.reduce((sum, r) => sum + (r.latencyMs || 0), 0) / latencyTests.length;
            console.log(`⚡ Average Latency: ${avgLatency.toFixed(0)}ms`);
        }

        const firstAudioTests = this.testResults.filter(r => r.firstAudioTimeMs !== undefined);
        if (firstAudioTests.length > 0) {
            const avgFirstAudio = firstAudioTests.reduce((sum, r) => sum + (r.firstAudioTimeMs || 0), 0) / firstAudioTests.length;
            console.log(`🎵 Average First Audio Time: ${avgFirstAudio.toFixed(0)}ms`);
        }

        console.log('\n✅ Micro-streaming TTS test suite completed!');
    }
}

// Export for standalone testing
export async function runMicroStreamingTests(): Promise<TestResult[]> {
    const testSuite = new MicroStreamingTestSuite();
    return await testSuite.runAllTests();
}

// Run tests if this file is executed directly
if (require.main === module) {
    runMicroStreamingTests().catch(console.error);
}