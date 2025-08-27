# Scripts

This directory contains utility scripts for development, building, and maintenance of the Cindy AI Voice Assistant project.

## Available Scripts

### 🏗️ Build and Development Scripts

#### `generate-uml.js`
Generates UML diagrams for system architecture visualization:

**Purpose**: 
- Creates visual representations of the application architecture
- Generates service dependency diagrams
- Produces component relationship charts

**Usage**:
```bash
node scripts/generate-uml.js
```

**Output**:
- UML diagrams in various formats (PNG, SVG)
- Architecture documentation
- Service relationship maps

**Dependencies**:
- PlantUML integration
- Graphviz for diagram rendering
- File system analysis tools

#### `update-versions.js`
Version management and synchronization across the project:

**Purpose**:
- Synchronizes version numbers across package.json files
- Updates version references in documentation
- Manages release version consistency

**Usage**:
```bash
node scripts/update-versions.js [new-version]
```

**Features**:
- Semantic versioning support
- Automatic version bumping
- Cross-file version synchronization
- Git tag integration

## NPM Scripts

The main project scripts are defined in `package.json`:

### Development Scripts
```bash
npm run dev              # Start full development environment
npm run dev:main         # Main process only
npm run dev:renderer     # Renderer process only
npm run dev:watch        # Watch mode with hot reload
```

### Build Scripts
```bash
npm run build            # Build for production
npm run build:main       # Build main process
npm run build:renderer   # Build renderer process
npm run build:clean      # Clean build artifacts
```

### Test Scripts
```bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:e2e         # End-to-end tests
npm run test:watch       # Watch mode testing
npm run test:coverage    # Coverage reports
```

### Quality Scripts
```bash
npm run lint             # Lint TypeScript/JavaScript
npm run lint:fix         # Auto-fix linting issues
npm run format           # Format code with Prettier
npm run type-check       # TypeScript type checking
npm run audit            # Security audit
```

### Package Scripts
```bash
npm run package          # Package for current platform
npm run package:mac      # Package for macOS
npm run package:win      # Package for Windows
npm run package:linux    # Package for Linux
npm run package:all      # Package for all platforms
```

### Release Scripts
```bash
npm run prerelease       # Pre-release checks
npm run release          # Create release build
npm run release:patch    # Patch version release
npm run release:minor    # Minor version release
npm run release:major    # Major version release
npm run publish          # Publish to distribution
```

## Script Development

### Adding New Scripts

1. **Create Script File**:
   ```javascript
   // scripts/new-script.js
   #!/usr/bin/env node
   
   const fs = require('fs');
   const path = require('path');
   
   function main() {
       console.log('Running new script...');
       // Script logic here
   }
   
   if (require.main === module) {
       main();
   }
   
   module.exports = { main };
   ```

2. **Add to package.json**:
   ```json
   {
       "scripts": {
           "new-script": "node scripts/new-script.js"
       }
   }
   ```

3. **Make Executable** (Unix-like systems):
   ```bash
   chmod +x scripts/new-script.js
   ```

### Script Conventions

#### File Structure
- **Node.js Scripts**: Use `.js` extension
- **Shell Scripts**: Use `.sh` extension (if needed)
- **Cross-platform**: Prefer Node.js for cross-platform compatibility

#### Error Handling
```javascript
function safeOperation() {
    try {
        // Risky operation
        return { success: true, data: result };
    } catch (error) {
        console.error('Script error:', error.message);
        process.exit(1);
    }
}
```

#### Logging
```javascript
const chalk = require('chalk'); // For colored output

console.log(chalk.green('✅ Success message'));
console.log(chalk.yellow('⚠️  Warning message'));
console.log(chalk.red('❌ Error message'));
console.log(chalk.blue('ℹ️  Info message'));
```

#### Progress Indication
```javascript
const ora = require('ora'); // For spinners

const spinner = ora('Processing...').start();
// Long running operation
spinner.succeed('Completed successfully!');
```

## Common Script Patterns

### File Operations
```javascript
const fs = require('fs').promises;
const path = require('path');

async function processFiles(directory) {
    const files = await fs.readdir(directory);
    for (const file of files) {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        
        if (stats.isFile()) {
            await processFile(filePath);
        }
    }
}
```

### Command Execution
```javascript
const { execSync } = require('child_process');

function runCommand(command) {
    try {
        const output = execSync(command, { 
            encoding: 'utf8',
            stdio: 'pipe'
        });
        return output.trim();
    } catch (error) {
        console.error(`Command failed: ${command}`);
        throw error;
    }
}
```

### JSON Processing
```javascript
async function updatePackageJson(updates) {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    
    Object.assign(packageJson, updates);
    
    await fs.writeFile(
        packagePath, 
        JSON.stringify(packageJson, null, 2) + '\n'
    );
}
```

### Environment Handling
```javascript
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

function getConfig() {
    return {
        apiUrl: process.env.API_URL || 'http://localhost:3000',
        debugMode: isDevelopment,
        logLevel: isProduction ? 'error' : 'debug'
    };
}
```

## Automation

### Pre-commit Hooks
Scripts can be integrated with Git hooks:

```json
{
    "husky": {
        "hooks": {
            "pre-commit": "npm run lint && npm run test:unit",
            "pre-push": "npm run build && npm run test"
        }
    }
}
```

### CI/CD Integration
Scripts are used in continuous integration:

```yaml
# .github/workflows/ci.yml
steps:
  - name: Run tests
    run: npm run test:coverage
    
  - name: Build application
    run: npm run build
    
  - name: Package application
    run: npm run package:all
```

### Scheduled Tasks
Some scripts can be run on schedules:

```javascript
// scripts/maintenance.js
async function dailyMaintenance() {
    await cleanupTempFiles();
    await updateDependencies();
    await runSecurityAudit();
}
```

## Best Practices

### Security
- **Input Validation**: Validate all script inputs
- **Safe Execution**: Use safe command execution
- **Permission Checks**: Verify required permissions
- **Secrets Management**: Handle secrets securely

### Performance
- **Async Operations**: Use async/await for I/O
- **Parallel Processing**: Run independent tasks in parallel
- **Resource Cleanup**: Clean up resources after use
- **Memory Management**: Watch memory usage in long-running scripts

### Maintainability
- **Documentation**: Document complex scripts
- **Modular Design**: Break large scripts into modules
- **Testing**: Test critical scripts
- **Version Control**: Track script changes