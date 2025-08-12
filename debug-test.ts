import { DuckDBVectorStore } from './src/main/services/DuckDBVectorStore';

async function runTest() {
    const dbPath = '/Users/karwo09/Documents/DeepResearchDocs/.vector_store/duckdb_vectors_ollama.db';
    const folderPath = '/Users/karwo09/Documents/DeepResearchDocs';

    const store = new DuckDBVectorStore({
        databasePath: dbPath,
        embeddingProvider: 'ollama',
        embeddingModel: 'dengcao/Qwen3-Embedding-0.6B:Q8_0',
        ollamaBaseUrl: 'http://127.0.0.1:11434'
    });

    try {
        console.log('[TEST] Initializing DuckDBVectorStore...');
        await store.initialize();
        console.log('[TEST] Initialization complete.');

        console.log('[TEST] Starting folder indexing...');
        const result = await store.indexFolder(folderPath);
        console.log('[TEST] Indexing complete:', result);
    } catch (err) {
        console.error('[TEST] Error during test:', err);
    } finally {
        await store.close();
    }
}

runTest();