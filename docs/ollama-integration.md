# Ollama Integration Guide

This document explains how to integrate Ollama with our voice assistant system to enable local LLM capabilities.

## Prerequisites

Before setting up Ollama integration, ensure you have:

- Node.js v16 or higher installed
- Ollama server running on your machine
- Access to the command line/terminal

## Installation

1. First, install the Ollama server by visiting [https://ollama.ai](https://ollama.ai) and following the installation instructions for your operating system.

2. Once installed, start the Ollama service:
```bash
ollama serve
```

3. Pull a model you'd like to use. For example, to use the Llama 2 model:
```bash
ollama pull llama2
```

## Configuration

To configure the voice assistant to use Ollama, update the LLM settings in the application:

1. Open the settings panel in the application
2. Navigate to the "Language Model" section
3. Select "Ollama" as the provider
4. Enter the API endpoint (default is `http://localhost:11434`)
5. Select your preferred model from the dropdown

## Environment Variables

You can also configure Ollama through environment variables. Create a `.env` file in the root directory:

```env
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2
```

## API Usage

The application uses the following endpoints to communicate with Ollama:

- **Generate text**: `POST /api/generate`
- **List models**: `GET /api/tags`
- **Create model**: `POST /api/create`

Example request to generate text:
```json
{
  "model": "llama2",
  "prompt": "Why is the sky blue?",
  "stream": false
}
```

## Error Handling

Common issues and their solutions:

- **Connection refused**: Ensure the Ollama service is running
- **Model not found**: Pull the model using `ollama pull <model-name>`
- **Timeout errors**: Increase the timeout setting in the application configuration

## Performance Tips

- Use quantized models (e.g., `llama2:7b-q4_0`) for better performance on consumer hardware
- Keep your models updated with `ollama pull <model-name>` to get the latest improvements
- Monitor memory usage, as larger models require more RAM

## Security Considerations

- The Ollama API is only accessible locally by default
- Do not expose the Ollama API to public networks
- Regularly update Ollama to the latest version for security patches