# Document Vectorstore Test Data

This directory contains sample test data files used by the Document Vectorstore Test Suite.

## Files

### 1. `sample-ai.txt`
- **Topic**: Artificial Intelligence and Machine Learning
- **Size**: ~2.5KB
- **Content**: Comprehensive overview of AI/ML including history, applications, and future prospects
- **Use case**: Testing text document indexing and AI-related queries

### 2. `climate-change.md`
- **Topic**: Climate Change and Environmental Impact
- **Size**: ~4.2KB
- **Format**: Markdown with headers, lists, and formatting
- **Content**: Detailed analysis of climate change causes, effects, and solutions
- **Use case**: Testing markdown processing and environmental topic searches

### 3. `research-data.json`
- **Topic**: Vector Databases and Semantic Search Research
- **Size**: ~3.1KB
- **Format**: Structured JSON with nested objects and arrays
- **Content**: Academic paper metadata with sections, references, and metrics
- **Use case**: Testing JSON parsing and structured data indexing

### 4. `space-exploration.txt`
- **Topic**: Space Exploration History
- **Size**: ~7.8KB
- **Content**: Comprehensive history from Sputnik to modern commercial spaceflight
- **Use case**: Testing long-form text processing and space-related queries

## Usage

These files are automatically used by the test suite for:
- Document indexing performance testing
- Similarity search validation
- File format compatibility verification
- Content retrieval accuracy assessment

## Test Queries

Sample queries that work well with this dataset:
- "artificial intelligence machine learning applications"
- "climate change greenhouse gas emissions"
- "vector database semantic search research"
- "space exploration moon landing apollo"
- "renewable energy solar wind power"
- "neural networks deep learning"

## Adding New Test Data

To add new test files:
1. Place files in this directory
2. Use descriptive names and appropriate extensions (.txt, .md, .json, .pdf, .docx)
3. Ensure content is family-friendly and educational
4. Update this README with file descriptions