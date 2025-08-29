# Contributing to Cindy AI Voice Assistant

Thank you for your interest in contributing to Cindy! This document provides guidelines and information for contributors to help maintain code quality and ensure smooth collaboration.

## 🎯 Getting Started

### Prerequisites

Before contributing, make sure you have:
- **Node.js 18+** and npm installed
- **Python 3.8+** (for some AI model dependencies)
- **Git** with your preferred workflow setup
- Basic familiarity with **Electron**, **React**, and **TypeScript**

### Development Setup

1. **Fork and clone the repository:**
   ```bash
   git clone https://github.com/yourusername/cindy-voice-assistant.git
   cd cindy-voice-assistant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys (see README.md for details)
   ```

4. **Verify your setup:**
   ```bash
   npm run dev
   ```

## 📝 Contribution Process

### 1. Issue First
Before starting work on a significant change:
- Check existing [issues](https://github.com/yourusername/cindy-voice-assistant/issues) and [discussions](https://github.com/yourusername/cindy-voice-assistant/discussions)
- Create a new issue to discuss your proposed changes
- Wait for maintainer feedback before proceeding with large features

### 2. Branch Strategy
- Create feature branches from `main`: `git checkout -b feature/your-feature-name`
- Use descriptive branch names:
  - `feature/add-weather-widget`
  - `fix/memory-leak-in-agent`
  - `docs/update-api-documentation`

### 3. Development Workflow
1. Make your changes following our [coding standards](#coding-standards)
2. Write or update tests (see [Testing Guidelines](#testing-guidelines))
3. Test your changes thoroughly
4. Commit with conventional commit messages
5. Push your branch and create a pull request

## 🧪 Testing Guidelines

### Test Requirements
**All new code must include comprehensive tests.** This is a core requirement for contributions.

### Test Types and Structure
```
src/
├── main/
│   ├── services/
│   │   ├── MyService.ts
│   │   └── __tests__/
│   │       └── MyService.test.ts
│   └── __tests__/
│       └── integration/
├── renderer/
│   ├── components/
│   │   ├── MyComponent.tsx
│   │   └── __tests__/
│   │       └── MyComponent.test.tsx
│   └── services/
│       └── __tests__/
└── __tests__/
    └── integration/
        └── feature.integration.test.ts
```

### Writing Tests

#### Unit Tests
- **Services**: Test all public methods, error handling, and edge cases
- **Components**: Test rendering, user interactions, and prop handling
- **Utilities**: Test all functions with various inputs

#### Integration Tests  
- **IPC Communication**: Test main-renderer process communication
- **Database Operations**: Test data persistence and retrieval
- **Service Integration**: Test services working together

#### Example Test Structure
```typescript
describe('ServiceName', () => {
  describe('methodName', () => {
    it('should handle normal case', () => {
      // Test implementation
    });
    
    it('should handle error case', () => {
      // Test error scenarios
    });
    
    it('should handle edge cases', () => {
      // Test boundary conditions
    });
  });
});
```

### Running Tests
```bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:watch       # Watch mode for TDD
npm run test:coverage    # Generate coverage reports
```

### Test Coverage Requirements
- **Minimum 80% coverage** for new code
- **100% coverage** for critical paths (authentication, data persistence, IPC)
- Use `npm run test:coverage` to verify coverage

## 🎨 Coding Standards

### TypeScript Guidelines
- **Strict mode enabled** - No `any` types except for external libraries
- **Explicit return types** for all functions
- **Interface over type** for object definitions
- **Consistent naming conventions**:
  - PascalCase for classes, interfaces, types
  - camelCase for variables, functions, methods
  - SCREAMING_SNAKE_CASE for constants

### Code Organization

#### File Structure
```typescript
// 1. Imports (grouped and sorted)
import React from 'react';
import { SomeType } from './types';
import { externalLibrary } from 'external-lib';

// 2. Types and interfaces
interface ComponentProps {
  prop: string;
}

// 3. Constants
const DEFAULT_CONFIG = {
  timeout: 5000
};

// 4. Main implementation
export class MyService {
  // Implementation
}

// 5. Default export (if applicable)
export default MyService;
```

#### Service Classes
```typescript
export class MyService {
  private initialized = false;
  
  constructor(private config: ServiceConfig) {}
  
  async initialize(): Promise<void> {
    // Initialization logic
  }
  
  async cleanup(): Promise<void> {
    // Cleanup logic
  }
  
  // Public methods...
}
```

#### React Components
```typescript
interface Props {
  requiredProp: string;
  optionalProp?: number;
}

export const MyComponent: React.FC<Props> = ({ 
  requiredProp, 
  optionalProp = 10 
}) => {
  // Use hooks at the top
  const [state, setState] = useState('');
  
  // Event handlers
  const handleClick = useCallback(() => {
    // Handler logic
  }, []);
  
  // Render
  return (
    <div>
      {/* Component JSX */}
    </div>
  );
};
```

### Code Quality Tools

#### Linting
```bash
npm run lint             # Check linting
npm run lint:fix         # Auto-fix issues
```

#### Formatting
We use Prettier with ESLint integration:
```bash
npm run format           # Format all files
```

#### Pre-commit Hooks
Pre-commit hooks automatically run:
- ESLint with auto-fix
- Prettier formatting
- Type checking
- Test validation

## 🏗️ Architecture Guidelines

### Adding New Features

#### 1. New Services
```typescript
// src/main/services/MyNewService.ts
export class MyNewService {
  async initialize(): Promise<void> {}
  async cleanup(): Promise<void> {}
  // Service methods...
}

// Register in src/main/main.ts
const myNewService = new MyNewService();
await myNewService.initialize();
```

#### 2. New Tools (for AI agents)
```typescript
// src/main/agents/tools/category/MyTool.ts
export class MyTool extends Tool {
  name = 'my_tool';
  description = 'What this tool does';
  
  async _call(input: string): Promise<string> {
    // Tool implementation
    return result;
  }
}

// Register in src/main/agents/tools/ToolRegistry.ts
```

#### 3. New UI Components
```typescript
// src/renderer/components/MyComponent.tsx
interface Props {
  // Props definition
}

export const MyComponent: React.FC<Props> = (props) => {
  // Component implementation
};

// Add corresponding tests
// src/renderer/components/__tests__/MyComponent.test.tsx
```

#### 4. New IPC Channels
```typescript
// Add to src/shared/ipc.ts
export const IPC_CHANNELS = {
  MY_NEW_CHANNEL: 'my-new-channel'
} as const;

// Main process handler (src/main/main.ts)
ipcMain.handle('my-new-channel', async (event, ...args) => {
  // Handler implementation
});

// Renderer process caller
const result = await ipcRenderer.invoke('my-new-channel', data);
```

### Performance Considerations
- **IPC calls are expensive** - batch operations when possible
- **Database queries** - use appropriate indexes and limit result sets
- **Memory management** - clean up resources in service cleanup methods
- **UI responsiveness** - use React.memo, useMemo, useCallback appropriately

### Security Guidelines
- **Never commit API keys** or sensitive data
- **Encrypt sensitive data** using SettingsService encryption
- **Validate all inputs** from external sources
- **Sanitize data** before database operations
- **Use secure IPC channels** for sensitive operations

## 📋 Pull Request Guidelines

### PR Preparation Checklist
- [ ] **Tests written** and passing (`npm test`)
- [ ] **Code linted** and formatted (`npm run lint`)
- [ ] **Type checking** passes (`npm run typecheck`)
- [ ] **Documentation updated** (if applicable)
- [ ] **CHANGELOG.md updated** (for significant changes)
- [ ] **Screenshots/videos** for UI changes

### PR Description Template
```markdown
## 🎯 Purpose
Brief description of what this PR does and why.

## 🔧 Changes Made
- List key changes
- Include technical details
- Note any breaking changes

## 🧪 Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated  
- [ ] Manual testing completed
- [ ] Edge cases covered

## 📸 Screenshots/Videos
(If applicable, include visuals for UI changes)

## 🚨 Breaking Changes
(If any, describe impact and migration steps)

## 📝 Notes
Any additional context or considerations for reviewers.
```

### Review Process
1. **Automated checks** must pass (CI/CD pipeline)
2. **Code review** by at least one maintainer
3. **Testing verification** by maintainers
4. **Documentation review** for user-facing changes
5. **Final approval** and merge

## 📦 Release Process

### Version Numbering
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR**: Breaking changes
- **MINOR**: New features (backward compatible)
- **PATCH**: Bug fixes (backward compatible)

### Conventional Commits
Use conventional commit format for automated changelog generation:

```bash
feat(scope): add new weather widget
fix(agent): resolve memory leak in tool execution  
docs(readme): update installation instructions
refactor(storage): optimize database queries
test(components): add unit tests for ChatList
perf(ui): improve rendering performance
style(lint): fix code formatting
chore(deps): update dependencies
```

### Scopes
- `agent` - AI agents and tool system
- `ui` - User interface components
- `storage` - Database and persistence
- `audio` - Speech/voice processing
- `ipc` - Inter-process communication
- `config` - Configuration and settings
- `build` - Build system and tooling
- `docs` - Documentation

## 🐛 Bug Reports

### Bug Report Template
When reporting bugs, include:

1. **Environment Information:**
   - OS version
   - Node.js version
   - Application version
   - Relevant API keys status

2. **Steps to Reproduce:**
   - Detailed step-by-step instructions
   - Expected vs actual behavior
   - Screenshots/videos if applicable

3. **Error Information:**
   - Console errors
   - Log files (from app data directory)
   - Network errors (if applicable)

4. **Additional Context:**
   - Configuration settings
   - Recent changes made
   - Workarounds discovered

### Debug Information
Enable debug mode for detailed logging:
```bash
DEBUG=cindy:* npm run dev
```

Log locations:
- **macOS**: `~/Library/Logs/Cindy/`
- **Windows**: `%USERPROFILE%\AppData\Roaming\Cindy\logs\`
- **Linux**: `~/.config/Cindy/logs/`

## 💡 Feature Requests

### Feature Request Template
```markdown
## 🎯 Feature Description
Clear description of the proposed feature.

## 🤔 Problem Statement
What problem does this solve? Who would benefit?

## 💡 Proposed Solution
How should this feature work? Include mockups if applicable.

## 🔄 Alternative Solutions
Other approaches considered.

## 📈 Impact Assessment
- User benefit level (Low/Medium/High)
- Implementation complexity (Low/Medium/High)
- Breaking changes (Yes/No)
```

## 🏷️ Issue Labels

### Priority Labels
- `priority/critical` - Security issues, data loss
- `priority/high` - Major functionality broken
- `priority/medium` - Important but not blocking
- `priority/low` - Nice to have improvements

### Type Labels
- `bug` - Something isn't working
- `enhancement` - New feature or improvement
- `documentation` - Documentation improvements
- `question` - Questions or support requests
- `good first issue` - Good for new contributors
- `help wanted` - Extra attention needed

### Component Labels
- `component/ui` - User interface
- `component/agent` - AI agents and tools
- `component/audio` - Voice processing
- `component/storage` - Data persistence
- `component/build` - Build system

## 🎓 Learning Resources

### Project-Specific Resources
- [Architecture Overview](./CLAUDE.md) - Technical architecture details
- [API Documentation](./docs/api/) - Internal API references
- [Tool Development Guide](./docs/tools/) - Creating new AI tools

### External Resources
- [Electron Documentation](https://www.electronjs.org/docs)
- [React Documentation](https://react.dev/)
- [LangChain Documentation](https://js.langchain.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 Community

### Communication Channels
- **GitHub Issues** - Bug reports and feature requests
- **GitHub Discussions** - Questions and community discussions
- **Discord Server** - Real-time chat and support
- **Email** - `contributors@cindyai.com`

### Code of Conduct
We follow the [Contributor Covenant Code of Conduct](https://www.contributor-covenant.org/). Please read it before participating.

### Recognition
Contributors are recognized in:
- Release notes
- Contributors section in README
- Hall of Fame page (coming soon)

## ❓ Getting Help

If you need help with:
- **Setup issues** - Check README.md or create an issue
- **Development questions** - Ask in GitHub Discussions
- **Bug reports** - Create a detailed issue
- **Feature ideas** - Start a discussion thread

## 📄 License

By contributing to Cindy, you agree that your contributions will be licensed under the same [MIT License](./LICENSE) that covers the project.

---

Thank you for contributing to Cindy! Your efforts help make this project better for everyone. 🚀