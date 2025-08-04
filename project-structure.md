# Cindy - Project Structure and File Organization

## Electron React Boilerplate Structure

Based on the standard Electron React Boilerplate with TypeScript, here's the complete project structure for Cindy:

```
cindy/
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   └── settings.json
├── assets/
│   ├── icons/
│   │   ├── app-icon.png
│   │   ├── tray-icon.png
│   │   └── tray-icon-dark.png
│   └── images/
├── config/
│   ├── jest.config.js
│   ├── webpack.config.js
│   └── webpack.main.config.js
├── docs/
│   ├── architecture.md
│   ├── modules.md
│   ├── data-models.md
│   ├── wake-word.md
│   ├── stt-tts.md
│   ├── llm-integration.md
│   ├── agent-framework.md
│   ├── vector-store.md
│   ├── scheduler.md
│   ├── settings-ui.md
│   ├── security.md
│   ├── autostart.md
│   ├── testing-ci.md
│   └── project-structure.md
├── e2e/
│   ├── fixtures/
│   ├── tests/
│   └── electron.fixture.ts
├── release/
│   └── app-update.yml
├── src/
│   ├── main/
│   │   ├── services/
│   │   │   ├── WakeWordService.ts
│   │   │   ├── SpeechToTextService.ts
│   │   │   ├── TextToSpeechService.ts
│   │   │   ├── LLMRouterService.ts
│   │   │   ├── AgentService.ts
│   │   │   ├── VectorStoreService.ts
│   │   │   ├── SchedulerService.ts
│   │   │   ├── SettingsService.ts
│   │   │   ├── SecurityService.ts
│   │   │   ├── AutostartService.ts
│   │   │   ├── TrayService.ts
│   │   │   └── ToolExecutorService.ts
│   │   ├── tools/
│   │   │   ├── FileSystemTool.ts
│   │   │   ├── WebSearchTool.ts
│   │   │   ├── WebCrawlTool.ts
│   │   │   └── EmailCalendarTool.ts
│   │   ├── utils/
│   │   │   ├── PorcupineWrapper.ts
│   │   │   ├── AudioBufferManager.ts
│   │   │   ├── TokenCounter.ts
│   │   │   ├── DocumentIndexer.ts
│   │   │   ├── SemanticSearchEngine.ts
│   │   │   ├── TextChunker.ts
│   │   │   ├── VectorEncoder.ts
│   │   │   ├── CronParser.ts
│   │   │   ├── ReportGenerator.ts
│   │   │   ├── PathValidator.ts
│   │   │   ├── ConfigManager.ts
│   │   │   ├── SecureStorage.ts
│   │   │   ├── EncryptionService.ts
│   │   │   ├── SecretsManager.ts
│   │   │   ├── PlatformDetector.ts
│   │   │   └── StartupOptimizer.ts
│   │   ├── store/
│   │   │   ├── index.ts
│   │   │   ├── reducers/
│   │   │   │   ├── conversationReducer.ts
│   │   │   │   ├── agentReducer.ts
│   │   │   │   └── systemReducer.ts
│   │   │   └── middleware/
│   │   │       └── persistenceMiddleware.ts
│   │   ├── agents/
│   │   │   ├── CindyAgent.ts
│   │   │   ├── ConversationAgent.ts
│   │   │   └── ResearchAgent.ts
│   │   ├── database/
│   │   │   ├── schema.sql
│   │   │   └── migrations/
│   │   ├── tasks/
│   │   │   ├── WebResearchTask.ts
│   │   │   ├── DailySummaryTask.ts
│   │   │   └── VaultIndexTask.ts
│   │   ├── index.ts
│   │   ├── main.ts
│   │   └── menu.ts
│   ├── renderer/
│   │   ├── components/
│   │   │   ├── SettingsModal.tsx
│   │   │   ├── GeneralSettings.tsx
│   │   │   ├── VoiceSettings.tsx
│   │   │   ├── ModelSettings.tsx
│   │   │   ├── VaultSettings.tsx
│   │   │   ├── ResearchSettings.tsx
│   │   │   ├── PrivacySettings.tsx
│   │   │   ├── SecuritySettings.tsx
│   │   │   ├── AutostartSettings.tsx
│   │   │   ├── AgentStatus.tsx
│   │   │   ├── SearchInterface.tsx
│   │   │   └── SchedulerSettings.tsx
│   │   ├── contexts/
│   │   │   ├── SettingsContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── hooks/
│   │   │   ├── useSettings.ts
│   │   │   ├── useVoice.ts
│   │   │   └── useAgent.ts
│   │   ├── pages/
│   │   │   ├── HomePage.tsx
│   │   │   ├── SettingsPage.tsx
│   │   │   └── StatusPage.tsx
│   │   ├── styles/
│   │   │   ├── main.css
│   │   │   ├── settings.css
│   │   │   └── components.css
│   │   ├── utils/
│   │   │   └── ipcRenderer.ts
│   │   ├── App.tsx
│   │   ├── index.tsx
│   │   └── routes.ts
│   ├── shared/
│   │   ├── types/
│   │   │   ├── settings.types.ts
│   │   │   ├── agent.types.ts
│   │   │   ├── security.types.ts
│   │   │   ├── autostart.types.ts
│   │   │   └── index.ts
│   │   ├── constants/
│   │   │   └── paths.ts
│   │   └── utils/
│   │       └── logger.ts
│   └── __tests__/
│       ├── unit/
│       │   ├── services/
│       │   ├── utils/
│       │   └── components/
│       ├── integration/
│       │   ├── services/
│       │   └── modules/
│       ├── setup.ts
│       ├── test-utils.ts
│       └── fixtures/
├── performance/
│   ├── stt-performance.test.ts
│   ├── load-test.js
│   └── memory-test.js
├── scripts/
│   ├── build.js
│   ├── package.js
│   ├── notarize.js
│   └── release.js
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   └── pre-commit
├── .storybook/
│   ├── main.js
│   └── preview.js
├── .webpack/
│   ├── main.js
│   └── renderer.js
├── .eslintignore
├── .eslintrc.js
├── .gitignore
├── .prettierignore
├── .prettierrc.js
├── CHANGELOG.md
├── LICENSE
├── README.md
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.renderer.json
└── tsconfig.test.json
```

## Key Directories and Files

### 1. Main Process (src/main/)

This directory contains all the Electron main process code that runs in the background:

- **services/**: Core service implementations (WakeWordService, SpeechToTextService, etc.)
- **tools/**: Agent tools for file operations, web search, etc.
- **utils/**: Utility classes and helpers
- **store/**: Redux store configuration for state management
- **agents/**: Agent implementations for different functionalities
- **database/**: Database schema and migrations
- **tasks/**: Scheduled task implementations
- **index.ts**: Entry point for the main process
- **main.ts**: Main Electron application setup
- **menu.ts**: System tray and application menu setup

### 2. Renderer Process (src/renderer/)

This directory contains the React frontend code that runs in the browser window:

- **components/**: Reusable UI components
- **contexts/**: React contexts for global state
- **hooks/**: Custom React hooks
- **pages/**: Page components for different views
- **styles/**: CSS stylesheets
- **utils/**: Frontend utilities
- **App.tsx**: Main application component
- **index.tsx**: Entry point for the renderer process
- **routes.ts**: Application routing configuration

### 3. Shared Code (src/shared/)

This directory contains code that is shared between main and renderer processes:

- **types/**: TypeScript type definitions
- **constants/**: Application constants
- **utils/**: Shared utilities

### 4. Testing (src/__tests__/)

This directory contains all test files:

- **unit/**: Unit tests for individual components
- **integration/**: Integration tests for combined components
- **setup.ts**: Test setup and configuration
- **test-utils.ts**: Test utilities and helpers
- **fixtures/**: Test data fixtures

### 5. Documentation (docs/)

This directory contains all project documentation:

- **architecture.md**: High-level architecture overview
- **modules.md**: Module breakdown and interactions
- **data-models.md**: Data models and persistence strategy
- **wake-word.md**: Wake-word detection implementation
- **stt-tts.md**: Speech-to-text and text-to-speech pipeline
- **llm-integration.md**: LLM integration with OpenAI and Ollama
- **agent-framework.md**: Agent framework and state management
- **vector-store.md**: Vector store implementation
- **scheduler.md**: Scheduler for research tasks
- **settings-ui.md**: Settings UI and configuration management
- **security.md**: Security and secrets management
- **autostart.md**: Cross-platform autostart mechanism
- **testing-ci.md**: Testing strategy and CI workflow
- **project-structure.md**: This file

### 6. Configuration Files

- **package.json**: Project dependencies and scripts
- **tsconfig.json**: TypeScript configuration
- **webpack.config.js**: Webpack build configuration
- **.eslintrc.js**: ESLint configuration
- **.prettierrc.js**: Prettier configuration
- **.gitignore**: Git ignore rules

## File Organization Principles

### 1. Separation of Concerns

- **Main Process**: Handles system-level operations, hardware access, and background services
- **Renderer Process**: Handles UI rendering and user interactions
- **Shared Code**: Common utilities and types used by both processes

### 2. Modular Architecture

- Each service is contained in its own file
- Related services are grouped in directories
- Clear interfaces between modules
- Dependency injection where appropriate

### 3. Test-Driven Development

- Tests are colocated with source code
- Unit tests for individual components
- Integration tests for combined functionality
- End-to-end tests for user workflows

### 4. Documentation

- Each major component has documentation
- Architecture decisions are recorded
- Implementation details are explained
- Usage examples are provided

## Package.json Structure

```json
{
  "name": "cindy",
  "productName": "Cindy",
  "version": "1.0.0",
  "description": "Always-on, cross-platform voice research assistant",
  "main": "./src/main/index.ts",
  "scripts": {
    "build": "concurrently \"npm run build:main\" \"npm run build:renderer\"",
    "build:main": "cross-env NODE_ENV=production webpack --config ./.webpack/main.js",
    "build:renderer": "cross-env NODE_ENV=production webpack --config ./.webpack/renderer.js",
    "dev": "concurrently \"npm run dev:main\" \"npm run dev:renderer\"",
    "dev:main": "cross-env NODE_ENV=development electron -r ts-node/register src/main/main.ts",
    "dev:renderer": "cross-env NODE_ENV=development webpack serve --config ./.webpack/renderer.js",
    "package": "npm run build && electron-builder build --publish never",
    "package:all": "npm run build && electron-builder build --publish never --mac --win --linux",
    "release": "npm run build && electron-builder build --publish always",
    "test": "jest",
    "test:unit": "jest src/__tests__/unit",
    "test:integration": "jest src/__tests__/integration",
    "test:e2e": "playwright test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix",
    "pre-commit": "lint-staged"
  },
  "dependencies": {
    "@picovoice/porcupine-node": "^3.0.0",
    "microsoft-cognitiveservices-speech-sdk": "^1.32.0",
    "openai": "^4.0.0",
    "axios": "^1.4.0",
    "langchain": "^0.0.190",
    "redux": "^4.2.1",
    "sqlite3": "^5.1.6",
    "faiss-node": "^0.1.0",
    "node-cron": "^3.0.2",
    "bull": "^4.11.5",
    "keytar": "^7.9.0",
    "auto-launch": "^5.0.5",
    "electron": "^25.0.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@types/node": "^18.0.0",
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "electron-builder": "^24.0.0",
    "electron-mocha": "^12.0.0",
    "jest": "^29.5.0",
    "jest-junit": "^16.0.0",
    "jest-html-reporter": "^3.10.0",
    "playwright": "^1.32.0",
    "ts-jest": "^29.1.0",
    "ts-loader": "^9.4.0",
    "ts-node": "^10.9.0",
    "webpack": "^5.80.0",
    "webpack-cli": "^5.0.0",
    "webpack-dev-server": "^4.13.0",
    "eslint": "^8.0.0",
    "prettier": "^2.8.0",
    "concurrently": "^8.0.0",
    "cross-env": "^7.0.0",
    "k6": "^0.43.0",
    "codecov": "^3.8.3"
  },
  "build": {
    "productName": "Cindy",
    "appId": "com.cindy.app",
    "directories": {
      "output": "release"
    },
    "files": [
      "dist/**/*",
      "node_modules/**/*",
      "assets/**/*",
      "package.json"
    ],
    "mac": {
      "category": "public.app-category.productivity",
      "target": [
        "dmg",
        "zip"
      ]
    },
    "win": {
      "target": [
        "nsis",
        "zip"
      ]
    },
    "linux": {
      "target": [
        "AppImage",
        "deb",
        "rpm"
      ],
      "category": "Office"
    }
  }
}
```

## TypeScript Configuration

### Root tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "lib": [
      "ES2021",
      "DOM"
    ],
    "declaration": true,
    "declarationMap": true,
    "jsx": "react-jsx",
    "strict": true,
    "pretty": true,
    "sourceMap": true,
    "baseUrl": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "paths": {
      "@main/*": [
        "main/*"
      ],
      "@renderer/*": [
        "renderer/*"
      ],
      "@shared/*": [
        "shared/*"
      ]
    }
  },
  "exclude": [
    "node_modules",
    "release"
  ]
}
```

## Webpack Configuration

### Main Process Webpack (.webpack/main.js)

```javascript
const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  target: 'electron-main',
  entry: './src/main/main.ts',
  output: {
    path: path.join(__dirname, '../dist/main'),
    filename: 'main.js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  node: {
    __dirname: false,
    __filename: false,
  },
};
```

## Environment Variables

### Development (.env.development)

```bash
NODE_ENV=development
ELECTRON_IS_DEV=1
```

### Production (.env.production)

```bash
NODE_ENV=production
ELECTRON_IS_DEV=0
```

## Git Ignore

```gitignore
# Dependencies
node_modules/

# Build outputs
dist/
release/
build/

# Logs
*.log

# OS generated files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Test coverage
coverage/

# Environment files
.env*.local

# Temporary files
*.tmp
*.temp

# Package manager
package-lock.json
yarn.lock
```

## Project Initialization

### Setup Script

```bash
#!/bin/bash

# Initialize project
echo "Initializing Cindy project..."

# Create directory structure
mkdir -p src/main/services
mkdir -p src/main/tools
mkdir -p src/main/utils
mkdir -p src/main/store/reducers
mkdir -p src/main/store/middleware
mkdir -p src/main/agents
mkdir -p src/main/database
mkdir -p src/main/tasks
mkdir -p src/renderer/components
mkdir -p src/renderer/contexts
mkdir -p src/renderer/hooks
mkdir -p src/renderer/pages
mkdir -p src/renderer/styles
mkdir -p src/renderer/utils
mkdir -p src/shared/types
mkdir -p src/shared/constants
mkdir -p src/shared/utils
mkdir -p src/__tests__/unit/services
mkdir -p src/__tests__/unit/utils
mkdir -p src/__tests__/unit/components
mkdir -p src/__tests__/integration/services
mkdir -p src/__tests__/integration/modules
mkdir -p docs
mkdir -p assets/icons
mkdir -p assets/images
mkdir -p config
mkdir -p scripts
mkdir -p .webpack
mkdir -p .github/workflows
mkdir -p .husky
mkdir -p .storybook
mkdir -p e2e/fixtures
mkdir -p e2e/tests
mkdir -p performance

# Install dependencies
npm install

# Initialize git repository
git init

# Create initial commit
git add .
git commit -m "Initial commit: Project structure for Cindy voice assistant"

echo "Cindy project initialized successfully!"
```

## Future Considerations

### 1. Scalability
- Modular design allows for easy extension
- Clear separation between components
- Well-defined interfaces

### 2. Maintainability
- Consistent naming conventions
- Comprehensive documentation
- Clear code organization

### 3. Performance
- Lazy loading where appropriate
- Efficient resource management
- Optimized build process

### 4. Security
- Secure storage for sensitive data
- Input validation and sanitization
- Secure communication between processes

This project structure provides a solid foundation for the Cindy voice research assistant, with clear organization, comprehensive documentation, and a robust testing strategy.