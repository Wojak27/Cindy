# HotpotQA Multi-Hop Reasoning Training System

A comprehensive training and evaluation system for multi-hop question answering using the HotpotQA dataset, integrated with vector databases and LangGraph reasoning workflows.

## Overview

This system implements a multi-hop reasoning agent capable of:
- **Multi-step reasoning** across multiple documents
- **Vector database retrieval** for relevant context
- **LangGraph workflow orchestration** for complex reasoning chains
- **Comprehensive evaluation** using HotpotQA metrics
- **Multiple embedding providers** (OpenAI, Ollama, HuggingFace)
- **Configurable reasoning depth** and parameters

## Quick Start

```bash
# Run with default settings (Ollama embeddings + LLM)
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --verbose

# Use OpenAI models (requires API key)
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --embedding openai --llm openai --verbose

# Process more examples
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --max-examples 100 --max-hops 4

# Use real HotpotQA dataset
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --dataset ./hotpot_train_v1.1.json
```

## System Architecture

### Multi-Hop Reasoning Workflow

```
Question Analysis → Document Retrieval → Reasoning & Answer → Verification
      ↑                    ↓                    ↓              ↓
   Initialize         Add Context         Need More Info?     Final Answer
                         ↑                    ↓
                    Next Hop Query ←── Continue Reasoning
```

### Core Components

1. **Question Analyzer**: Determines question type and initial search strategy
2. **Document Retriever**: Uses vector similarity search to find relevant context
3. **Multi-Hop Reasoner**: Performs iterative reasoning with retrieved documents
4. **Answer Verifier**: Validates and scores the final answer
5. **Evaluation System**: Comprehensive metrics following HotpotQA standards

## Features

### 🧠 Advanced Reasoning
- **Multi-hop question decomposition** into searchable sub-queries
- **Iterative document retrieval** based on reasoning progress
- **Context-aware answer synthesis** from multiple sources
- **Confidence scoring** and verification

### 📚 Vector Database Integration
- **DuckDBVectorStore** integration for efficient similarity search
- **Multiple embedding providers** with automatic fallback
- **Chunk-based indexing** optimized for multi-hop retrieval
- **Metadata tracking** for supporting fact identification

### 📊 Comprehensive Evaluation
- **Exact Match (EM)** accuracy scoring
- **F1 Score** for partial answer matching
- **Supporting Facts** precision/recall
- **Multi-hop reasoning** path analysis
- **Confidence calibration** metrics

### 🔧 Flexible Configuration
- **Configurable reasoning depth** (max hops)
- **Multiple LLM providers** (OpenAI, Ollama)
- **Embedding provider selection** (OpenAI, Ollama, HuggingFace)
- **Batch processing** and memory management
- **Evaluation split ratios** and dataset size limits

## Installation & Setup

### Prerequisites

```bash
# Install dependencies (should already be installed in the project)
npm install

# For Ollama usage
ollama pull qwen3:1.7b                        # Main reasoning model
ollama pull dengcao/Qwen3-Embedding-0.6B:Q8_0 # Embedding model

# For OpenAI usage (set in .env)
OPENAI_API_KEY=your_api_key_here
```

### HotpotQA Dataset

The system works with:
1. **Built-in sample data** (3 example questions for testing)
2. **Real HotpotQA dataset** (download from [HotpotQA website](https://hotpotqa.github.io/))

To use the real dataset:
```bash
# Download HotpotQA dataset
wget http://curtis.ml.cmu.edu/datasets/hotpot/hotpot_train_v1.1.json
wget http://curtis.ml.cmu.edu/datasets/hotpot/hotpot_dev_distractor_v1.json

# Run with real data
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --dataset ./hotpot_train_v1.1.json
```

## Configuration Options

### Command Line Arguments

```bash
# Dataset and I/O
--dataset <path>        # Path to HotpotQA JSON file (optional, uses samples if not provided)
--vector-db <path>      # Vector database path (default: temp file)

# Model Configuration  
--embedding <provider>  # openai | ollama | huggingface (default: ollama)
--llm <provider>        # openai | ollama (default: ollama)

# Training Parameters
--max-examples <n>      # Maximum examples to process (default: 50)
--max-hops <n>          # Maximum reasoning hops per question (default: 3)
--eval-split <ratio>    # Train/eval split ratio (default: 0.8)

# Output Control
--verbose, -v           # Detailed logging and progress
--help, -h             # Show help message
```

### Environment Variables

```bash
# Required for OpenAI models
OPENAI_API_KEY=your_openai_api_key

# Optional Ollama configuration
OLLAMA_BASE_URL=http://127.0.0.1:11434  # Default Ollama server
```

## Usage Examples

### Basic Training and Evaluation

```bash
# Start with sample data and default settings
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --verbose

# Expected output:
🚀 Initializing HotpotQA Training System
📚 Initializing vector database...
🧠 Initializing LLM provider...
🔄 Building multi-hop reasoning graph...
📥 Loading HotpotQA dataset...
🎭 Creating sample HotpotQA-style examples...
🗃️ Indexing dataset context into vector database...
🎯 Starting training and evaluation...
```

### Advanced Configuration

```bash
# Use OpenAI models with larger dataset
npm run ts-node src/main/agents/hotpot-qa-trainer.ts \
  --dataset ./hotpot_train_v1.1.json \
  --embedding openai \
  --llm openai \
  --max-examples 200 \
  --max-hops 4 \
  --verbose

# Local-only setup with HuggingFace embeddings
npm run ts-node src/main/agents/hotpot-qa-trainer.ts \
  --embedding huggingface \
  --llm ollama \
  --max-examples 100 \
  --verbose
```

### Performance Testing

```bash
# Test reasoning depth
npm run ts-node src/main/agents/hotpot-qa-trainer.ts \
  --max-hops 5 \
  --max-examples 50 \
  --verbose

# Batch processing
npm run ts-node src/main/agents/hotpot-qa-trainer.ts \
  --max-examples 500 \
  --eval-split 0.9
```

## Sample Output

```
╔═══════════════════════════════════════════════════════════════╗
║                  HotpotQA Training System                    ║
╚═══════════════════════════════════════════════════════════════╝

🔧 Configuration:
   Embedding Provider: ollama
   LLM Provider: ollama
   Max Examples: 50
   Max Hops: 3
   Vector DB: /tmp/hotpot-qa-vector-1234567890.db

🚀 Initializing HotpotQA Training System
📚 Initializing vector database...
✅ Vector store initialized with ollama embeddings
🧠 Initializing LLM provider...
✅ LLM provider initialized: ollama
🔄 Building multi-hop reasoning graph...
✅ Multi-hop reasoning graph compiled
📥 Loading HotpotQA dataset...
🎭 Creating sample HotpotQA-style examples...
✅ Loaded 3 examples
🗃️ Indexing dataset context into vector database...
✅ Successfully indexed 12 documents from 3 examples
🎯 Starting training and evaluation...
📊 Training on 2 examples, evaluating on 1 examples

🧪 Evaluating example 1/1: Which company was founded first, Apple Inc. or Micr...
🔍 Analyzing question: "Which company was founded first, Apple Inc. or Micr..."
📖 Retrieving documents for query: "Apple Inc Microsoft Corporation founding date"
📚 Retrieved 2 new documents (4 total found)
🧠 Reasoning and answering (hop 1)
✅ Verifying answer: "Apple Inc."

================================================================================
🏆 HOTPOTQA EVALUATION RESULTS
================================================================================
📊 Total Examples Evaluated: 1
🎯 Exact Match Score: 100.00%
📝 F1 Score: 100.00%
📚 Supporting Fact Precision: 50.00%
📖 Supporting Fact Recall: 50.00%
🔗 Supporting Fact F1: 50.00%
🦘 Average Hops per Question: 1.00
🧠 Reasoning Accuracy: 90.00%
================================================================================
```

## Multi-Hop Question Types

### Bridge Questions
Questions requiring information from multiple connected entities:
- "What is the capital of the country where [landmark] is located?"
- "Who directed the movie that won [award] in [year]?"

### Comparison Questions  
Questions requiring comparison between entities:
- "Which company was founded first, [A] or [B]?"
- "Which mountain is taller, [A] or [B]?"

### Complex Reasoning
Questions requiring multi-step logical inference:
- "What award did the director of [movie] win in [year]?"
- "Which university did the founder of [company] attend?"

## Evaluation Metrics

### Core Metrics
- **Exact Match (EM)**: Percentage of questions answered exactly correctly
- **F1 Score**: Token-level overlap between predicted and gold answers
- **Supporting Facts Precision/Recall**: Accuracy of identified supporting evidence

### Reasoning Metrics
- **Average Hops**: Mean number of reasoning steps per question
- **Reasoning Accuracy**: Confidence-weighted correctness
- **Context Utilization**: How effectively retrieved documents are used

## Advanced Features

### Memory System
- **Conversation history** tracking across reasoning hops
- **Document caching** to avoid redundant retrievals
- **Reasoning path** preservation for explainability

### Adaptive Reasoning
- **Dynamic hop limit** based on question complexity
- **Confidence thresholding** for early stopping
- **Query refinement** based on retrieval quality

### Evaluation Extensions
- **Answer type classification** (factual, numerical, boolean)
- **Reasoning chain validation** for step-by-step accuracy
- **Robustness testing** with adversarial examples

## Limitations and Future Work

### Current Limitations
- **Sample dataset**: Built-in examples are limited for comprehensive evaluation
- **Supporting fact extraction**: Simplified matching for supporting evidence
- **Fine-tuning**: Currently uses pre-trained models without task-specific training
- **Error handling**: Basic error recovery in reasoning chains

### Planned Improvements
- **Full HotpotQA integration** with automatic dataset download
- **Advanced supporting fact identification** using semantic similarity
- **Fine-tuning capabilities** for domain-specific performance
- **Interactive debugging** tools for reasoning chain analysis
- **Multi-modal reasoning** for questions involving images/tables

## Troubleshooting

### Common Issues

**Ollama Connection Failed**
```bash
# Start Ollama server
ollama serve

# Install required models
ollama pull qwen3:1.7b
ollama pull dengcao/Qwen3-Embedding-0.6B:Q8_0
```

**OpenAI API Key Missing**
```bash
# Set in .env file
echo "OPENAI_API_KEY=your_key_here" >> .env
```

**Memory Issues with Large Datasets**
```bash
# Reduce batch size
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --max-examples 25

# Use smaller embedding model
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --embedding huggingface
```

**Vector Database Errors**
```bash
# Check disk space and permissions
df -h /tmp
ls -la /tmp/hotpot-qa-vector-*

# Use custom path
npm run ts-node src/main/agents/hotpot-qa-trainer.ts --vector-db ./my-vector-db.db
```

### Performance Optimization

**For Large Datasets**:
- Use `--max-examples` to limit processing
- Increase `--eval-split` to reduce evaluation size
- Use local embeddings (Ollama/HuggingFace) to avoid API costs

**For Better Accuracy**:
- Increase `--max-hops` for complex questions
- Use OpenAI embeddings for better semantic understanding
- Process more training examples for better evaluation

## Integration

### With Existing Agent System
The HotpotQA trainer integrates with the existing Cindy agent architecture:

```typescript
import { HotpotQATrainer } from './hotpot-qa-trainer';

// Use in existing agent
const trainer = new HotpotQATrainer(config);
await trainer.initialize();
const answer = await trainer.answerQuestion("Your multi-hop question here");
```

### With Vector Database Services
Compatible with existing DuckDBVectorStore infrastructure:

```typescript
// Reuse existing vector store
const existingVectorStore = new DuckDBVectorStore(config);
const trainer = new HotpotQATrainer({
    // ... other config
    vectorDbPath: existingVectorStore.databasePath
});
```

## Contributing

To extend the HotpotQA training system:

1. **Add new question types** in the sample data generation
2. **Implement additional metrics** in the evaluation system
3. **Extend reasoning strategies** in the LangGraph workflow
4. **Add new embedding providers** in the vector store integration

## References

- [HotpotQA: A Dataset for Diverse, Explainable Multi-hop Question Answering](https://arxiv.org/abs/1809.09600)
- [HotpotQA Official Website](https://hotpotqa.github.io/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraphjs/)
- [DuckDB Vector Extension](https://github.com/duckdb/duckdb_vss)

## License

This implementation is part of the Cindy voice assistant project and follows the same license terms.