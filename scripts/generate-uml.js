#!/usr/bin/env node

/**
 * CLI command for generating UML diagrams of the agent architecture
 * Usage: node scripts/generate-uml.js [options]
 */

const path = require('path');
const fs = require('fs').promises;

// Command line argument parsing
const args = process.argv.slice(2);
const options = {
    type: 'all',
    format: 'svg',
    output: path.join(process.cwd(), 'diagrams'),
    private: false,
    verbose: false
};

// Parse command line arguments
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '--type':
        case '-t':
            options.type = args[++i];
            break;
        case '--format':
        case '-f':
            options.format = args[++i];
            break;
        case '--output':
        case '-o':
            options.output = args[++i];
            break;
        case '--private':
        case '-p':
            options.private = true;
            break;
        case '--verbose':
        case '-v':
            options.verbose = true;
            break;
        case '--help':
        case '-h':
            showHelp();
            process.exit(0);
        default:
            if (arg.startsWith('-')) {
                console.error(`Unknown option: ${arg}`);
                process.exit(1);
            }
    }
}

function showHelp() {
    console.log(`
UML Diagram Generator for Voice Assistant Agent Architecture

Usage: node scripts/generate-uml.js [options]

Options:
  -t, --type <type>      Type of diagram to generate
                         Options: agent, service, tools, overview, all
                         Default: all

  -f, --format <format>  Output format
                         Options: svg, png, pdf
                         Default: svg

  -o, --output <dir>     Output directory
                         Default: ./diagrams

  -p, --private          Include private members in diagrams
                         Default: false

  -v, --verbose          Verbose output
                         Default: false

  -h, --help             Show this help message

Examples:
  node scripts/generate-uml.js
  node scripts/generate-uml.js --type agent --format png
  node scripts/generate-uml.js --type service --output ./docs/diagrams
  node scripts/generate-uml.js --type all --format svg --private --verbose
`);
}

async function generateUMLDiagrams() {
    try {
        if (options.verbose) {
            console.log('🔧 UML Diagram Generator Starting...');
            console.log('====================================');
            console.log(`Type: ${options.type}`);
            console.log(`Format: ${options.format}`);
            console.log(`Output: ${options.output}`);
            console.log(`Include Private: ${options.private}`);
            console.log('');
        }

        // Ensure output directory exists
        await fs.mkdir(options.output, { recursive: true });

        // Import the UML service (using dynamic import for ES modules compatibility)
        const UMLDiagramService = await import('../src/main/services/UMLDiagramService.js')
            .catch(() => {
                // Fallback: try to use the TypeScript file directly via ts-node
                return require('../src/main/services/UMLDiagramService.ts');
            });

        const umlService = new UMLDiagramService.UMLDiagramService();

        const generationOptions = {
            outputDir: options.output,
            outputFormat: options.format,
            includePrivateMembers: options.private
        };

        let results = {};

        switch (options.type) {
            case 'agent':
                console.log('📊 Generating agent architecture UML diagram...');
                results.agent = await umlService.generateAgentArchitectureDiagram(generationOptions);
                break;

            case 'service':
                console.log('📊 Generating service layer UML diagram...');
                results.service = await umlService.generateServiceLayerDiagram(generationOptions);
                break;

            case 'tools':
                console.log('📊 Generating tool system UML diagram...');
                results.tools = await umlService.generateToolSystemDiagram(generationOptions);
                break;

            case 'overview':
                console.log('📊 Generating system overview UML diagram...');
                results.overview = await umlService.generateSystemOverviewDiagram(generationOptions);
                break;

            case 'all':
            default:
                console.log('📊 Generating all UML diagrams...');
                
                const [agent, service, tools, overview] = await Promise.all([
                    umlService.generateAgentArchitectureDiagram(generationOptions),
                    umlService.generateServiceLayerDiagram(generationOptions),
                    umlService.generateToolSystemDiagram(generationOptions),
                    umlService.generateSystemOverviewDiagram(generationOptions)
                ]);

                results = { agent, service, tools, overview };
                break;
        }

        // Output results
        console.log('\n✅ UML Diagram Generation Complete!');
        console.log('===================================');

        for (const [type, filePath] of Object.entries(results)) {
            console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}: ${filePath}`);
        }

        // List all generated diagrams
        const allDiagrams = await umlService.listGeneratedDiagrams(options.output);
        
        if (allDiagrams.length > 0) {
            console.log('\nAll Generated Diagrams:');
            console.log('======================');
            allDiagrams.forEach(diagram => {
                console.log(`📄 ${path.basename(diagram)}`);
            });
        }

        console.log(`\n📁 Output directory: ${options.output}`);

    } catch (error) {
        console.error('\n❌ UML Generation Failed:');
        console.error('=========================');
        console.error(error.message);
        
        if (options.verbose) {
            console.error('\nFull error details:');
            console.error(error);
        }

        // Check for common issues and provide helpful suggestions
        if (error.message.includes('tsuml2')) {
            console.log('\n💡 Troubleshooting Tips:');
            console.log('========================');
            console.log('1. Make sure tsuml2 is installed: npm install tsuml2 --save-dev');
            console.log('2. For TypeScript compilation issues, try: npx tsc --noEmit');
            console.log('3. Check that input files exist and are valid TypeScript');
        }

        process.exit(1);
    }
}

// Add to package.json scripts suggestion
function suggestPackageJsonScripts() {
    console.log('\n💡 Add these scripts to your package.json:');
    console.log('==========================================');
    console.log(`
"scripts": {
  "uml": "node scripts/generate-uml.js",
  "uml:agent": "node scripts/generate-uml.js --type agent",
  "uml:service": "node scripts/generate-uml.js --type service", 
  "uml:tools": "node scripts/generate-uml.js --type tools",
  "uml:overview": "node scripts/generate-uml.js --type overview",
  "uml:png": "node scripts/generate-uml.js --format png",
  "uml:all": "node scripts/generate-uml.js --type all --verbose"
}
`);
    console.log('Then run: npm run uml');
}

// Run the generator
if (require.main === module) {
    generateUMLDiagrams()
        .then(() => {
            if (options.verbose) {
                suggestPackageJsonScripts();
            }
        })
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { generateUMLDiagrams, options };