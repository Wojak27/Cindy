# Document Vectorstore Test Suite

A comprehensive command-line test suite for validating both DuckDB and LangChain vectorstore implementations in the Cindy voice assistant project.

## Overview

This test suite provides thorough testing capabilities for:
- **DuckDBVectorStore**: Modern vector database with multiple embedding providers
- **LangChainVectorStoreService**: FAISS-based semantic search implementation
- **Embedding Providers**: OpenAI, Ollama, and HuggingFace transformers
- **File Formats**: PDF, TXT, MD, JSON, DOCX support
- **Performance Benchmarking**: Speed and memory usage analysis

## Quick Start

```bash
# Run all tests with default settings (Ollama provider)
npm run ts-node src/main/services/test-document-vectorstore.ts

# Test specific implementations
npm run ts-node src/main/services/test-document-vectorstore.ts duckdb
npm run ts-node src/main/services/test-document-vectorstore.ts langchain

# Test with OpenAI embeddings (requires API key)
npm run ts-node src/main/services/test-document-vectorstore.ts both openai

# Compare embedding providers
npm run ts-node src/main/services/test-document-vectorstore.ts providers

# Run performance benchmarks
npm run ts-node src/main/services/test-document-vectorstore.ts performance --verbose
```

## Test Modes

### `both` (default)
Tests both DuckDBVectorStore and LangChainVectorStoreService implementations side-by-side for comparison.

### `duckdb`
Tests only the DuckDBVectorStore implementation with specified embedding provider.

### `langchain` 
Tests only the LangChainVectorStoreService (requires OpenAI API key).

### `providers`
Compares different embedding providers (OpenAI, Ollama, HuggingFace) using DuckDBVectorStore.

### `performance`
Runs comprehensive performance benchmarks with larger datasets to measure:
- Document indexing speed
- Search latency at different scales
- Memory usage patterns
- Embedding generation performance

## Embedding Providers

### OpenAI (API-based)
- **Model**: text-embedding-3-small (1536 dimensions)
- **Requirements**: OPENAI_API_KEY environment variable
- **Use case**: Highest quality embeddings, requires internet connection
- **Cost**: ~$0.02 per 1M tokens

### Ollama (Local)
- **Model**: dengcao/Qwen3-Embedding-0.6B:Q8_0 (1024 dimensions)
- **Requirements**: Ollama server running on localhost:11434
- **Use case**: Local inference, no API costs, good performance
- **Setup**: `ollama pull dengcao/Qwen3-Embedding-0.6B:Q8_0`

### HuggingFace (Local)
- **Model**: Xenova/all-MiniLM-L6-v2 (384 dimensions)
- **Requirements**: @huggingface/transformers package
- **Use case**: Completely offline, smaller model size
- **Performance**: Slower than Ollama but very private

## Environment Setup

### Required Environment Variables
```bash
# .env file
OPENAI_API_KEY=your_openai_api_key_here  # For OpenAI embeddings
```

### Optional Configuration
```bash
# Ollama server (if using Ollama provider)
ollama serve  # Start Ollama server
ollama pull dengcao/Qwen3-Embedding-0.6B:Q8_0  # Install embedding model
```

## Command Line Options

### Test Modes
- `duckdb` - Test DuckDBVectorStore only
- `langchain` - Test LangChainVectorStoreService only  
- `both` - Test both implementations (default)
- `providers` - Compare different embedding providers
- `performance` - Run performance benchmarks

### Embedding Providers
- `openai` - Use OpenAI embeddings (requires API key)
- `ollama` - Use Ollama local embeddings (default)
- `huggingface` - Use HuggingFace transformers

### Flags
- `--verbose`, `-v` - Enable detailed output and logging

## Test Coverage

### Initialization Tests
- ✅ Service initialization and configuration
- ✅ Database setup and table creation
- ✅ Embedding provider initialization
- ✅ Error handling for missing dependencies

### Document Processing Tests
- ✅ Individual document addition
- ✅ Batch document processing
- ✅ File format support (TXT, MD, JSON, PDF, DOCX)
- ✅ Text chunking and metadata preservation
- ✅ Folder indexing with progress tracking

### Search and Retrieval Tests
- ✅ Similarity search with various queries
- ✅ Search result ranking and relevance
- ✅ Different k values (result count)
- ✅ Fallback mechanisms when vector search fails

### Performance Tests
- ✅ Document indexing speed benchmarks
- ✅ Search latency measurements
- ✅ Memory usage tracking
- ✅ Scalability with large datasets

### Provider Comparison Tests
- ✅ Embedding quality comparison
- ✅ Performance differences between providers
- ✅ API vs local embedding trade-offs

## Test Data

The suite includes curated test data in `test-data/`:
- **sample-ai.txt**: AI/ML overview (2.5KB)
- **climate-change.md**: Environmental topics with markdown (4.2KB)  
- **research-data.json**: Structured research paper data (3.1KB)
- **space-exploration.txt**: Long-form space history (7.8KB)

Additional test documents are generated dynamically during testing.

## Sample Output

```
🚀 Starting Document VectorStore Test Suite
📋 Mode: both, Provider: ollama

🦆 Starting DuckDB VectorStore tests with ollama provider
✅ DuckDB initialization completed in 1,247ms
✅ Added 4 documents in 2,891ms
✅ Search "artificial intelligence machine learning" returned 3 results in 156ms
✅ Search "climate change environment" returned 2 results in 142ms
✅ Indexed 4 files (0 errors) in 3,456ms
📊 Total indexed files: 4

🔗 Starting LangChain VectorStore tests with OpenAI provider
✅ LangChain initialization completed in 892ms
✅ Indexed file: sample-ai.txt (1,234ms)
✅ Search "machine learning natural language processing" returned 2 results in 1,156ms

📊 TEST RESULTS SUMMARY
✅ Successful tests: 12
❌ Failed tests: 0
📈 Success rate: 100.0%
```

## Integration with CI/CD

The test suite can be integrated into automated testing pipelines:

```yaml
# GitHub Actions example
- name: Run Vectorstore Tests
  run: |
    npm run ts-node src/main/services/test-document-vectorstore.ts providers
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

## Troubleshooting

### Common Issues

**OpenAI API Key Missing**
```
⚠️ Warning: OpenAI API key not found in environment variables
```
Solution: Set `OPENAI_API_KEY` in your `.env` file

**Ollama Server Not Running**
```
❌ DuckDB test failed: Connection refused
```
Solution: Start Ollama server with `ollama serve`

**Missing Embedding Model**
```
❌ Model not found: dengcao/Qwen3-Embedding-0.6B:Q8_0
```
Solution: Install model with `ollama pull dengcao/Qwen3-Embedding-0.6B:Q8_0`

**Database Initialization Errors**
```
❌ VSS extension loading failed
```
Solution: Ensure DuckDB VSS extension is available and temp directory is writable

### Performance Considerations

- **Memory Usage**: Large datasets may require more RAM, especially with HuggingFace embeddings
- **API Limits**: OpenAI has rate limits; use delays between requests if needed
- **Disk Space**: Test creates temporary databases and files in system temp directory
- **Network**: OpenAI embeddings require internet connection

## Development

### Adding New Tests

1. Extend the `DocumentVectorStoreTest` class
2. Add new test methods following the naming pattern `run*Tests()`
3. Update the CLI argument parsing in `main()`
4. Add new test modes to the documentation

### Custom Embedding Providers

To add support for new embedding providers:
1. Update the `createTestDuckDBStore()` method
2. Add provider-specific configuration
3. Update the command-line argument parsing
4. Add provider documentation

## Related Files

- **Main Test Suite**: `test-document-vectorstore.ts`
- **DuckDB Implementation**: `DuckDBVectorStore.ts`
- **LangChain Implementation**: `LangChainVectorStoreService.ts`
- **Unit Tests**: `__tests__/DuckDBVectorStore.test.ts`
- **Test Data**: `test-data/` directory

## Contributing

When adding new test scenarios:
1. Ensure cross-platform compatibility
2. Add appropriate error handling
3. Include performance measurements
4. Update documentation
5. Test with all supported embedding providers

## License

This test suite is part of the Cindy voice assistant project and follows the same license terms.