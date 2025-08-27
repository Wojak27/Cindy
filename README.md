# Cindy - AI Voice Research Assistant

<p align="center">
  <img src="assets/cindy-logo.png" alt="Cindy Logo" width="200" height="200" />
</p>

<p align="center">
  <strong>An intelligent, always-on voice assistant for research, productivity, and conversation</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-20232A?style=for-the-badge&logo=electron&logoColor=white" />
  <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" />
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/LangChain-121011?style=for-the-badge&logo=chainlink&logoColor=white" />
</p>

## 🌟 Features

### 🎤 Voice Interaction
- **Wake word detection** with "Hey Cindy" activation
- **Real-time speech-to-text** with live transcription
- **Text-to-speech responses** with multiple voice options
- **Hands-free operation** for seamless productivity

### 🧠 AI-Powered Intelligence
- **Multi-LLM support** (OpenAI GPT, Ollama local models)
- **Intelligent agent routing** for different types of queries
- **Tool-based assistance** with web search, weather, maps
- **Deep research capabilities** for comprehensive analysis

### 🛠️ Advanced Tools
- **Web search integration** (DuckDuckGo, Wikipedia, Brave, etc.)
- **Weather information** with AccuWeather API
- **Interactive maps** with location visualization  
- **Document indexing** and semantic search
- **Email integration** with Gmail connector
- **Vector database** for knowledge management

### 💾 Data Management
- **Local chat history** with SQLite/DuckDB storage
- **Conversation management** with organized threads
- **Document processing** (PDF, DOCX, MD, TXT, JSON)
- **Settings persistence** with encrypted storage
- **Cross-platform compatibility** (macOS, Windows, Linux)

### 🎨 Modern UI
- **Clean, responsive interface** with Material-UI
- **Dark/light theme support**
- **Agent flow visualization** showing processing steps
- **Side panel widgets** for weather, maps, documents
- **Tool selection interface** for forced tool usage

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Python 3.8+ (for some AI models)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/cindy-voice-assistant.git
   cd cindy-voice-assistant
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

### Environment Variables

Create a `.env` file with the following variables:

```env
# OpenAI API (for GPT models)
OPENAI_API_KEY=your_openai_api_key

# AccuWeather API (for weather information)
ACCUWEATHER_API_KEY=your_accuweather_api_key

# Brave Search API (optional)
BRAVE_API_KEY=your_brave_search_api_key

# SerpAPI (optional)
SERPAPI_KEY=your_serpapi_key

# Tavily Search API (optional)
TAVILY_API_KEY=your_tavily_api_key

# Gmail Integration (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

## 🏗️ Architecture

### Process Architecture
Cindy uses Electron's multi-process architecture:

```
┌─────────────────┐    ┌─────────────────┐
│   Main Process  │◄──►│ Renderer Process│
│   (Node.js)     │IPC │   (React App)   │
│                 │    │                 │
│ • Services      │    │ • UI Components │
│ • AI Agents     │    │ • State Mgmt    │
│ • Tool Execution│    │ • User Interface│
│ • Data Storage  │    │ • Visualization │
└─────────────────┘    └─────────────────┘
```

### Service Layer
Core functionality is organized into services:

- **LLMProvider** - Multi-provider LLM interface
- **CindyAgent** - Main conversational agent
- **ToolRegistry** - Extensible tool system
- **ChatStorageService** - Conversation persistence
- **VectorStoreService** - Semantic search
- **SpeechToTextService** - Voice recognition
- **TextToSpeechService** - Voice synthesis

### Agent System
Intelligent routing between different agent types:

- **Deep Research Agent** - Comprehensive research workflows
- **Tool Agent** - Specific tool execution
- **Direct Response** - Simple conversation

## 📖 Usage Guide

### Voice Commands
- **"Hey Cindy"** - Activate voice mode
- **"Research [topic]"** - Trigger deep research
- **"What's the weather in [city]?"** - Get weather info
- **"Show me [location] on a map"** - Display location
- **"Search for [query]"** - Web search

### Tool Selection
Use the tool selector button in the input area to force specific tools:
- 🔍 **Web Search** - Force web search
- 🌤️ **Weather** - Force weather lookup  
- 🗺️ **Maps** - Force map display
- 📧 **Email** - Force email search
- 🧠 **Research** - Force deep research mode
- 📄 **Documents** - Force document search

### Settings
Access settings through the gear icon:
- **LLM Provider** - Switch between OpenAI/Ollama
- **Voice Settings** - Configure STT/TTS
- **API Keys** - Manage service credentials
- **Database** - Vector store configuration

## 🔧 Development

### Project Structure
```
src/
├── main/                 # Main process (Node.js)
│   ├── services/        # Core business logic
│   ├── agents/          # AI agents and tools
│   └── main.ts          # Entry point
├── renderer/            # Renderer process (React)
│   ├── components/      # UI components
│   ├── services/        # Client-side services
│   └── App.tsx          # Main React app
├── shared/              # Shared types/utilities
└── store/               # Redux state management
```

### Available Scripts

```bash
# Development
npm run dev              # Start both processes
npm run dev:main         # Main process only
npm run dev:renderer     # Renderer process only

# Building
npm run build            # Build both processes
npm run build:main       # Build main process
npm run build:renderer   # Build renderer process

# Testing
npm test                 # Run tests
npm run test:watch       # Watch mode
npm run lint             # Lint code
npm run lint:fix         # Fix lint issues

# Packaging
npm run package          # Package for current platform
npm run package:all      # Package for all platforms
npm run release          # Build and publish
```

### Adding New Tools

1. Create tool class in `src/main/agents/tools/[category]/`
2. Implement `ToolSpecification` interface
3. Register with `ToolRegistry`
4. Add to `ToolLoader` configuration

Example:
```typescript
export class MyTool extends Tool {
    name = 'my_tool';
    description = 'Description of what this tool does';
    
    async _call(input: string): Promise<string> {
        // Tool implementation
        return result;
    }
}
```

### Adding New Services

1. Create service class in `src/main/services/`
2. Add to `ServiceManager` initialization
3. Register IPC handlers if needed
4. Add to TypeScript types

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable  
5. Submit a pull request

### Commit Messages
We use conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation
- `refactor:` - Code refactoring
- `test:` - Adding tests

## 🐛 Troubleshooting

### Common Issues

**Voice activation not working:**
- Check microphone permissions
- Verify wake word service is running
- Try adjusting sensitivity settings

**LLM not responding:**
- Verify API keys are set correctly
- Check network connectivity
- Try switching LLM providers

**Tools not working:**
- Ensure required API keys are configured
- Check tool registry initialization
- Verify service dependencies

### Debug Mode
Enable debug logging:
```bash
DEBUG=cindy:* npm run dev
```

### Logs Location
- **macOS**: `~/Library/Logs/Cindy/`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Cindy\logs\`
- **Linux**: `~/.config/Cindy/logs/`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenAI** for GPT models and API
- **LangChain** for AI framework
- **Electron** for cross-platform desktop apps
- **React** for the user interface
- **Material-UI** for UI components
- **Picovoice** for wake word detection

## 📞 Support

- 🐛 **Bug Reports**: [GitHub Issues](https://github.com/yourusername/cindy-voice-assistant/issues)
- 💡 **Feature Requests**: [GitHub Discussions](https://github.com/yourusername/cindy-voice-assistant/discussions)
- 📧 **Email**: support@cindyai.com
- 💬 **Discord**: [Join our community](https://discord.gg/cindyai)

---

<p align="center">
  Made with ❤️ by the Cindy AI team
</p>