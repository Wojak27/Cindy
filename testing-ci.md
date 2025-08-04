# Cindy - Testing Strategy and CI Workflow

## Requirements

1. Unit testing framework
2. Integration testing capabilities
3. End-to-end testing
4. Cross-platform compatibility
5. Code coverage targets
6. Performance testing
7. Security testing
8. Automated CI/CD pipeline

## Selected Technologies

### Testing Framework
- **Jest**: For unit and integration testing
- **Playwright**: For end-to-end testing
- **Electron-Mocha**: For Electron-specific testing

### Code Coverage
- **Istanbul/nyc**: For code coverage analysis
- **Codecov**: For coverage reporting

### CI/CD Platform
- **GitHub Actions**: For automated workflows
- **Azure Pipelines**: Alternative option

### Performance Testing
- **k6**: For load and performance testing
- **Lighthouse**: For web performance (renderer process)

### Security Testing
- **npm audit**: For dependency vulnerability scanning
- **Snyk**: For continuous security monitoring

## Testing Strategy

### 1. Unit Testing

```typescript
// Example unit test structure
// src/__tests__/unit/services/WakeWordService.test.ts
import { WakeWordService } from '../../main/services/WakeWordService';
import { PorcupineWrapper } from '../../main/utils/PorcupineWrapper';

jest.mock('../../main/utils/PorcupineWrapper');

describe('WakeWordService', () => {
  let wakeWordService: WakeWordService;
  let mockPorcupine: jest.Mocked<PorcupineWrapper>;

  beforeEach(() => {
    mockPorcupine = new PorcupineWrapper() as jest.Mocked<PorcupineWrapper>;
    (PorcupineWrapper as jest.Mock).mockImplementation(() => mockPorcupine);
    wakeWordService = new WakeWordService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('startListening', () => {
    it('should initialize porcupine with correct keyword', async () => {
      const keyword = 'Hey Cindy';
      await wakeWordService.startListening(keyword);
      
      expect(mockPorcupine.initialize).toHaveBeenCalledWith(keyword, 0.5);
    });

    it('should emit listeningStarted event', async () => {
      const listeningStarted = jest.fn();
      wakeWordService.on('listeningStarted', listeningStarted);
      
      await wakeWordService.startListening('Hey Cindy');
      
      expect(listeningStarted).toHaveBeenCalled();
    });
  });

  describe('stopListening', () => {
    it('should cleanup porcupine resources', async () => {
      await wakeWordService.startListening('Hey Cindy');
      await wakeWordService.stopListening();
      
      expect(mockPorcupine.cleanup).toHaveBeenCalled();
    });
  });
});
```

### 2. Integration Testing

```typescript
// Example integration test structure
// src/__tests__/integration/STTIntegration.test.ts
import { SpeechToTextService } from '../../main/services/SpeechToTextService';
import { OnlineSTTEngine } from '../../main/services/OnlineSTTEngine';
import { OfflineSTTEngine } from '../../main/services/OfflineSTTEngine';

describe('SpeechToTextService Integration', () => {
  let sttService: SpeechToTextService;

  beforeAll(() => {
    sttService = new SpeechToTextService({
      provider: 'auto',
      language: 'en-US',
      autoPunctuation: true,
      profanityFilter: false,
      offlineModel: 'base'
    });
  });

  describe('Online STT Integration', () => {
    it('should transcribe audio using Azure Cognitive Services', async () => {
      // Mock audio data
      const audioData = new ArrayBuffer(1024);
      
      // Mock Azure response
      jest.spyOn(OnlineSTTEngine.prototype, 'transcribe').mockResolvedValue('Hello world');
      
      const result = await sttService.transcribe(audioData);
      
      expect(result).toBe('Hello world');
      expect(OnlineSTTEngine.prototype.transcribe).toHaveBeenCalledWith(audioData);
    });
  });

  describe('Offline STT Integration', () => {
    it('should fallback to offline transcription when online fails', async () => {
      // Mock online failure
      jest.spyOn(OnlineSTTEngine.prototype, 'transcribe').mockRejectedValue(new Error('Network error'));
      
      // Mock offline success
      jest.spyOn(OfflineSTTEngine.prototype, 'transcribe').mockResolvedValue('Hello world offline');
      
      const audioData = new ArrayBuffer(1024);
      const result = await sttService.transcribe(audioData);
      
      expect(result).toBe('Hello world offline');
      expect(OfflineSTTEngine.prototype.transcribe).toHaveBeenCalledWith(audioData);
    });
  });
});
```

### 3. End-to-End Testing

```typescript
// Example E2E test structure
// e2e/mainWindow.test.ts
import { test, expect } from '@playwright/test';
import { electronApp, page } from './electron.fixture';

test.describe('Main Window', () => {
  test('should show tray icon and menu', async () => {
    // Right-click tray icon
    await electronApp.evaluate(async ({ Tray }) => {
      // Simulate right-click on tray
    });

    // Check context menu items
    const menuItems = await electronApp.evaluate(({ Menu }) => {
      return Menu.getApplicationMenu().items.map(item => item.label);
    });

    expect(menuItems).toContain('Open Cindy');
    expect(menuItems).toContain('Settings');
    expect(menuItems).toContain('Quit');
  });

  test('should open settings modal', async () => {
    // Click settings menu item
    await electronApp.evaluate(({ Menu }) => {
      const settingsItem = Menu.getApplicationMenu().getMenuItemById('settings');
      settingsItem.click();
    });

    // Check if settings modal is visible
    const settingsModal = await page.waitForSelector('.settings-modal');
    expect(await settingsModal.isVisible()).toBe(true);
  });

  test('should save settings', async () => {
    // Open settings
    await electronApp.evaluate(({ Menu }) => {
      Menu.getApplicationMenu().getMenuItemById('settings').click();
    });

    // Change activation phrase
    await page.fill('#activation-phrase', 'Computer');

    // Close settings
    await page.click('.settings-footer button:last-child');

    // Verify settings were saved
    const savedSettings = await electronApp.evaluate(() => {
      // Get saved settings from main process
      return global.settingsService.get('voice');
    });

    expect(savedSettings.activationPhrase).toBe('Computer');
  });
});
```

## CI/CD Workflow

### GitHub Actions Configuration

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node-version: [18.x, 20.x]

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run linting
      run: npm run lint

    - name: Run unit tests
      run: npm run test:unit -- --coverage

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
        flags: unittests
        name: codecov-umbrella

    - name: Run integration tests
      run: npm run test:integration

    - name: Run security audit
      run: npm audit

  build:
    needs: test
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18.x'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Build application
      run: npm run build

    - name: Package application
      run: npm run package

    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: cindy-${{ matrix.os }}
        path: dist/

  e2e:
    needs: build
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Download build artifacts
      uses: actions/download-artifact@v3
      with:
        name: cindy-${{ matrix.os }}
        path: dist/

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18.x'

    - name: Install test dependencies
      run: npm ci

    - name: Run E2E tests
      run: npm run test:e2e

  release:
    needs: [test, build, e2e]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'

    steps:
    - name: Checkout code
      uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18.x'

    - name: Install dependencies
      run: npm ci

    - name: Create release
      run: npm run release
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Code Coverage Configuration

```json
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/main/index.ts',
    '!src/renderer/index.tsx'
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90
    }
  },
  testMatch: [
    '<rootDir>/src/__tests__/**/*.(test|spec).(ts|tsx)',
    '<rootDir>/src/**/__tests__/*.(test|spec).(ts|tsx)'
  ],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapping: {
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1'
  }
};
```

### Performance Testing

```typescript
// performance/stt-performance.test.ts
import { check } from 'k6';
import http from 'k6/http';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 }, // ramp up to 10 users
    { duration: '1m', target: 10 },  // stay at 10 users
    { duration: '30s', target: 0 },  // ramp down to 0 users
  ],
  thresholds: {
    'http_req_duration': ['p(95)<500'], // 95% of requests should be below 500ms
    'errors': ['rate<0.1'], // error rate should be less than 10%
  },
};

export default function () {
  const payload = {
    audio: http.file(open('./test-audio.wav'), 'audio/wav'),
    language: 'en-US'
  };

  const res = http.post('http://localhost:3000/api/stt', payload, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  errorRate.add(res.status !== 200);
}
```

## Testing Directory Structure

```
src/
├── __tests__/
│   ├── unit/
│   │   ├── services/
│   │   ├── utils/
│   │   └── components/
│   ├── integration/
│   │   ├── services/
│   │   └── modules/
│   ├── setup.ts
│   └── test-utils.ts
├── __mocks__/
│   ├── porcupine.ts
│   ├── openai.ts
│   └── ollama.ts
└── __fixtures__/
    ├── audio/
    ├── markdown/
    └── config/
```

## Code Quality and Linting

### ESLint Configuration

```json
// .eslintrc.json
{
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:jest/recommended"
  ],
  "plugins": [
    "@typescript-eslint",
    "react",
    "jest"
  ],
  "env": {
    "jest/globals": true
  },
  "rules": {
    "jest/expect-expect": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "jest/expect-expect": "off"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

### Pre-commit Hooks

```json
// package.json scripts
{
  "scripts": {
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
  "lint-staged": {
    "*.{ts,tsx}": [
      "eslint --fix",
      "jest --findRelatedTests"
    ]
  }
}
```

## Test Environment Setup

### Test Configuration

```typescript
// src/__tests__/setup.ts
import { app } from 'electron';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

// Mock Electron app for tests
jest.mock('electron', () => {
  const mockApp = {
    getPath: jest.fn((name: string) => {
      return join('/tmp', name);
    }),
    getName: jest.fn(() => 'Cindy'),
    getVersion: jest.fn(() => '1.0.0'),
    setLoginItemSettings: jest.fn(),
    getLoginItemSettings: jest.fn(() => ({ openAtLogin: false })),
  };

  return {
    app: mockApp,
    ipcMain: { handle: jest.fn(), on: jest.fn() },
    ipcRenderer: { invoke: jest.fn(), send: jest.fn() },
    BrowserWindow: jest.fn(),
    Tray: jest.fn(),
    Menu: {
      buildFromTemplate: jest.fn(),
      getApplicationMenu: jest.fn(),
    },
  };
});

// Setup test directories
beforeAll(async () => {
  // Create test directories
  const testDirs = [
    '/tmp/AppData',
    '/tmp/LocalAppData',
    '/tmp/UserData',
    '/tmp/Cache',
  ];

  for (const dir of testDirs) {
    await mkdir(dir, { recursive: true });
  }

  // Create test config
  await writeFile(
    '/tmp/UserData/config.json',
    JSON.stringify({
      general: { startAtLogin: true },
      voice: { activationPhrase: 'Hey Cindy' },
    })
  );
});

// Cleanup after tests
afterAll(async () => {
  // Cleanup test directories if needed
});
```

## Cross-Platform Testing

### Platform-Specific Tests

```typescript
// src/__tests__/unit/utils/PlatformDetector.test.ts
import { PlatformDetector } from '../../../main/utils/PlatformDetector';

describe('PlatformDetector', () => {
  const originalPlatform = process.platform;

  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
  });

  describe('Windows', () => {
    beforeAll(() => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
      });
    });

    it('should detect Windows platform', () => {
      expect(PlatformDetector.getPlatform()).toBe('win32');
      expect(PlatformDetector.isWindows()).toBe(true);
      expect(PlatformDetector.isMacOS()).toBe(false);
      expect(PlatformDetector.isLinux()).toBe(false);
    });

    it('should return Windows autostart directory', () => {
      const autostartDir = PlatformDetector.getAutostartDirectory();
      expect(autostartDir).toContain('Microsoft\\Windows\\Start Menu\\Programs\\Startup');
    });
  });

  describe('macOS', () => {
    beforeAll(() => {
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
      });
    });

    it('should detect macOS platform', () => {
      expect(PlatformDetector.getPlatform()).toBe('darwin');
      expect(PlatformDetector.isWindows()).toBe(false);
      expect(PlatformDetector.isMacOS()).toBe(true);
      expect(PlatformDetector.isLinux()).toBe(false);
    });

    it('should return macOS autostart directory', () => {
      const autostartDir = PlatformDetector.getAutostartDirectory();
      expect(autostartDir).toContain('/Library/LaunchAgents');
    });
  });

  describe('Linux', () => {
    beforeAll(() => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
      });
    });

    it('should detect Linux platform', () => {
      expect(PlatformDetector.getPlatform()).toBe('linux');
      expect(PlatformDetector.isWindows()).toBe(false);
      expect(PlatformDetector.isMacOS()).toBe(false);
      expect(PlatformDetector.isLinux()).toBe(true);
    });

    it('should return Linux autostart directory', () => {
      const autostartDir = PlatformDetector.getAutostartDirectory();
      expect(autostartDir).toContain('/.config/autostart');
    });
  });
});
```

## Performance and Load Testing

### Load Testing Script

```typescript
// performance/load-test.js
import { check, sleep } from 'k6';
import http from 'k6/http';
import { Counter, Rate, Trend } from 'k6/metrics';

const errorCounter = new Counter('errors');
const requestDuration = new Trend('request_duration');

export const options = {
  scenarios: {
    constant_load: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 iterations per second
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 20,
      maxVUs: 100,
    },
  },
  thresholds: {
    'http_req_duration': ['p(95)<1000'], // 95% of requests should be below 1 second
    'errors': ['rate<0.05'], // error rate should be less than 5%
  },
};

export default function () {
  const startTime = new Date().getTime();
  
  const res = http.get('http://localhost:3000/api/health');
  
  const endTime = new Date().getTime();
  requestDuration.add(endTime - startTime);
  
  const checkResult = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 1000ms': () => endTime - startTime < 1000,
  });
  
  if (!checkResult) {
    errorCounter.add(1);
  }
  
  sleep(1);
}
```

## Security Testing

### Dependency Security Scanning

```bash
# npm audit script
#!/bin/bash

echo "Running security audit..."

# Run npm audit
npm audit --audit-level=moderate

# Run Snyk scan if available
if command -v snyk &> /dev/null; then
  snyk test --severity-threshold=medium
fi

echo "Security audit completed"
```

## CI/CD Environment Variables

```bash
# .env.test
NODE_ENV=test
ELECTRON_IS_DEV=0
TEST_TIMEOUT=30000
COVERAGE_REPORT=true
```

## Test Reporting

### Test Report Generation

```json
// jest.config.js (extended)
module.exports = {
  // ... existing config
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: 'reports',
      outputName: 'junit.xml',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}',
      ancestorSeparator: ' > ',
    }],
    ['jest-html-reporter', {
      pageTitle: 'Cindy Test Report',
      outputPath: 'reports/test-report.html',
      includeFailureMsg: true,
    }]
  ],
};
```

## Dependencies

```json
{
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "electron-mocha": "^12.0.0",
    "jest": "^29.5.0",
    "jest-junit": "^16.0.0",
    "jest-html-reporter": "^3.10.0",
    "playwright": "^1.32.0",
    "ts-jest": "^29.1.0",
    "k6": "^0.43.0",
    "codecov": "^3.8.3"
  }
}
```

## Testing Best Practices

### 1. Test Organization
- Group tests by feature or module
- Use descriptive test names
- Keep tests focused and isolated
- Use setup and teardown hooks appropriately

### 2. Mocking Strategy
- Mock external dependencies
- Use factories for complex test data
- Mock time for time-dependent tests
- Reset mocks between tests

### 3. Performance Considerations
- Use fake timers for time-based tests
- Limit test data size
- Use parallel test execution
- Optimize test database usage

### 4. Cross-Platform Considerations
- Test on all supported platforms
- Use platform-specific test fixtures
- Handle platform-specific behavior
- Test file path handling

## Future Enhancements

### 1. Advanced Testing Features
- Property-based testing with fast-check
- Snapshot testing for UI components
- Contract testing for API integrations
- Chaos engineering for resilience testing

### 2. Monitoring and Analytics
- Test performance trending
- Flaky test detection
- Test coverage trending
- Automated test generation

### 3. Developer Experience
- Interactive test runner
- Test debugging tools
- Test coverage visualization
- Automated test suggestions