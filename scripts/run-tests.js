#!/usr/bin/env node

/**
 * Test runner script for the voice assistant application
 * Runs unit tests for both main and renderer processes
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

async function runCommand(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            ...options
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(code);
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        child.on('error', reject);
    });
}

async function checkTestFiles() {
    const testDirectories = [
        'src/main/services/__tests__',
        'src/renderer/components/__tests__',
        'src/renderer/services/__tests__'
    ];

    const foundTests = [];
    
    for (const dir of testDirectories) {
        const fullPath = path.join(process.cwd(), dir);
        if (fs.existsSync(fullPath)) {
            const files = fs.readdirSync(fullPath);
            const testFiles = files.filter(file => file.endsWith('.test.ts') || file.endsWith('.test.tsx'));
            if (testFiles.length > 0) {
                foundTests.push({ dir, files: testFiles });
            }
        }
    }

    return foundTests;
}

async function main() {
    log('🧪 Voice Assistant Test Runner', colors.cyan);
    log('================================\n', colors.cyan);

    try {
        // Check if Jest is available
        log('📦 Checking test environment...', colors.blue);
        
        // Check for package.json test script
        const packagePath = path.join(process.cwd(), 'package.json');
        if (!fs.existsSync(packagePath)) {
            throw new Error('package.json not found');
        }

        const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        const hasTestScript = packageJson.scripts && packageJson.scripts.test;
        
        if (!hasTestScript) {
            log('⚠️  No test script found in package.json', colors.yellow);
            log('   You may need to add: "test": "jest"', colors.yellow);
        }

        // Discover test files
        log('🔍 Discovering test files...', colors.blue);
        const testFiles = await checkTestFiles();

        if (testFiles.length === 0) {
            log('❌ No test files found', colors.red);
            process.exit(1);
        }

        log(`✅ Found tests in ${testFiles.length} directories:`, colors.green);
        testFiles.forEach(({ dir, files }) => {
            log(`   📁 ${dir}: ${files.length} test files`, colors.green);
            files.forEach(file => {
                log(`     - ${file}`, colors.reset);
            });
        });

        log('\n🚀 Running tests...', colors.blue);

        // Try to run tests
        if (hasTestScript) {
            await runCommand('npm', ['test'], { 
                env: { 
                    ...process.env, 
                    NODE_ENV: 'test',
                    CI: 'true' // Prevents watch mode
                } 
            });
        } else {
            // Try running Jest directly
            try {
                await runCommand('npx', ['jest', '--passWithNoTests'], {
                    env: { 
                        ...process.env, 
                        NODE_ENV: 'test' 
                    }
                });
            } catch (error) {
                log('⚠️  Jest not available, trying to install...', colors.yellow);
                await runCommand('npm', ['install', '--save-dev', 'jest', '@types/jest', 'ts-jest']);
                
                // Create basic Jest config if it doesn't exist
                const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
                if (!fs.existsSync(jestConfigPath)) {
                    const jestConfig = `module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapping: {
    '^@main/(.*)$': '<rootDir>/src/main/$1',
    '^@renderer/(.*)$': '<rootDir>/src/renderer/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1'
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**'
  ]
};`;
                    fs.writeFileSync(jestConfigPath, jestConfig);
                    log('📝 Created basic Jest configuration', colors.green);
                }

                // Try running tests again
                await runCommand('npx', ['jest', '--passWithNoTests']);
            }
        }

        log('\n✅ All tests completed successfully!', colors.green);

    } catch (error) {
        log(`\n❌ Tests failed: ${error.message}`, colors.red);
        
        if (error.message.includes('Command failed')) {
            log('\n💡 Troubleshooting tips:', colors.yellow);
            log('   1. Make sure Jest is installed: npm install --save-dev jest @types/jest ts-jest', colors.yellow);
            log('   2. Check your test files for syntax errors', colors.yellow);
            log('   3. Ensure all dependencies are properly mocked', colors.yellow);
            log('   4. Run tests individually to isolate issues: npx jest ComponentName.test.tsx', colors.yellow);
        }
        
        process.exit(1);
    }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    log(`❌ Unhandled Rejection at: ${promise}, reason: ${reason}`, colors.red);
    process.exit(1);
});

// Run the test suite
main().catch(console.error);