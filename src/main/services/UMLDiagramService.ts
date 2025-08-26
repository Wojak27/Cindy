import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export interface UMLGenerationOptions {
  outputDir?: string;
  outputFormat?: 'svg' | 'png' | 'pdf';
  includePrivateMembers?: boolean;
  classNamePattern?: string;
  excludePatterns?: string[];
}

export class UMLDiagramService {
  private readonly defaultOptions: UMLGenerationOptions = {
    outputDir: path.join(process.cwd(), 'diagrams'),
    outputFormat: 'svg',
    includePrivateMembers: false,
    excludePatterns: ['node_modules/**', 'dist/**', '**/*.test.ts', '**/*.spec.ts']
  };

  /**
   * Generate UML diagram for agent architecture
   */
  async generateAgentArchitectureDiagram(options: Partial<UMLGenerationOptions> = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    
    // Ensure output directory exists
    await this.ensureDirectoryExists(opts.outputDir!);

    const agentFiles = [
      'src/main/agents/ThinkingCindyAgent.ts',
      'src/main/agents/LangGraphAgent.ts',
      'src/main/agents/ToolAgent.ts',
      'src/main/agents/research/DeepResearchAgent.ts',
      'src/main/agents/research/DeepResearchIntegration.ts',
      'src/main/services/LangChainToolExecutorService.ts',
      'src/main/services/LangChainMemoryService.ts',
      'src/main/services/ServiceManager.ts'
    ];

    const outputPath = path.join(opts.outputDir!, `agent-architecture.${opts.outputFormat}`);
    
    return this.generateUMLFromFiles(agentFiles, outputPath, opts);
  }

  /**
   * Generate UML diagram for service layer
   */
  async generateServiceLayerDiagram(options: Partial<UMLGenerationOptions> = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    
    await this.ensureDirectoryExists(opts.outputDir!);

    const serviceFiles = [
      'src/main/services/ServiceManager.ts',
      'src/main/services/LLMRouterService.ts',
      'src/main/services/ChatStorageService.ts',
      'src/main/services/DuckDBVectorStore.ts',
      'src/main/services/SettingsService.ts',
      'src/main/services/ConnectorManagerService.ts',
      'src/main/services/SpeechToTextService.ts',
      'src/main/services/TextToSpeechService.ts'
    ];

    const outputPath = path.join(opts.outputDir!, `service-layer.${opts.outputFormat}`);
    
    return this.generateUMLFromFiles(serviceFiles, outputPath, opts);
  }

  /**
   * Generate UML diagram for tool system
   */
  async generateToolSystemDiagram(options: Partial<UMLGenerationOptions> = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    
    await this.ensureDirectoryExists(opts.outputDir!);

    const toolFiles = [
      'src/main/agents/tools/ToolRegistry.ts',
      'src/main/agents/tools/ToolLoader.ts',
      'src/main/agents/tools/ToolDefinitions.ts',
      'src/main/agents/tools/search/*.ts',
      'src/main/agents/tools/vector/*.ts',
      'src/main/agents/tools/weather/*.ts',
      'src/main/agents/tools/maps/*.ts',
      'src/main/agents/tools/connectors/*.ts'
    ];

    const outputPath = path.join(opts.outputDir!, `tool-system.${opts.outputFormat}`);
    
    return this.generateUMLFromFiles(toolFiles, outputPath, opts);
  }

  /**
   * Generate comprehensive system overview diagram
   */
  async generateSystemOverviewDiagram(options: Partial<UMLGenerationOptions> = {}): Promise<string> {
    const opts = { ...this.defaultOptions, ...options };
    
    await this.ensureDirectoryExists(opts.outputDir!);

    const systemFiles = [
      'src/main/main.ts',
      'src/main/services/ServiceManager.ts',
      'src/main/agents/ThinkingCindyAgent.ts',
      'src/main/agents/LangGraphAgent.ts',
      'src/main/services/LLMRouterService.ts',
      'src/main/services/ChatStorageService.ts',
      'src/main/services/DuckDBVectorStore.ts',
      'src/main/services/LangChainToolExecutorService.ts',
      'src/renderer/App.tsx',
      'src/renderer/components/ModernSettingsPanel.tsx'
    ];

    const outputPath = path.join(opts.outputDir!, `system-overview.${opts.outputFormat}`);
    
    return this.generateUMLFromFiles(systemFiles, outputPath, opts);
  }

  /**
   * Generate UML from specific files
   */
  private async generateUMLFromFiles(
    inputFiles: string[], 
    outputPath: string, 
    options: UMLGenerationOptions
  ): Promise<string> {
    try {
      // Validate input files exist
      const validFiles = await this.validateFiles(inputFiles);
      
      if (validFiles.length === 0) {
        throw new Error('No valid TypeScript files found for UML generation');
      }

      // Build tsuml2 command
      const command = this.buildTsUML2Command(validFiles, outputPath, options);
      
      // Execute command
      const { stdout, stderr } = await execAsync(command);
      
      if (stderr) {
        console.warn('TsUML2 warnings:', stderr);
      }
      
      // Verify output file was created
      const outputExists = await this.fileExists(outputPath);
      if (!outputExists) {
        throw new Error(`UML diagram generation failed - output file not created: ${outputPath}`);
      }

      console.log(`✅ UML diagram generated: ${outputPath}`);
      return outputPath;
      
    } catch (error) {
      console.error('UML generation error:', error);
      throw new Error(`Failed to generate UML diagram: ${error.message}`);
    }
  }

  /**
   * Build TsUML2 command string
   */
  private buildTsUML2Command(
    inputFiles: string[], 
    outputPath: string, 
    options: UMLGenerationOptions
  ): string {
    const parts = ['npx', 'tsuml2'];
    
    // Create a glob pattern that includes all input files
    // TsUML2 requires --glob instead of individual files
    const globPattern = this.createGlobPattern(inputFiles);
    parts.push('--glob', `"${globPattern}"`);
    
    // Output file
    parts.push('--outFile', outputPath);
    
    // Include private members (show modifiers)
    if (options.includePrivateMembers) {
      parts.push('--modifiers', 'true');
    }
    
    // Show property types
    parts.push('--propertyTypes', 'true');
    
    // Show type links
    parts.push('--typeLinks', 'true');
    
    // Export only public types if not including private members
    if (!options.includePrivateMembers) {
      parts.push('--exportedTypesOnly', 'true');
    }

    return parts.join(' ');
  }

  /**
   * Create a glob pattern from input files
   */
  private createGlobPattern(inputFiles: string[]): string {
    // If we have specific files, try to create a pattern that matches them
    if (inputFiles.length === 1) {
      return inputFiles[0];
    }
    
    // Find common directory
    const commonDir = this.findCommonDirectory(inputFiles);
    
    if (commonDir) {
      // Create a pattern that includes all subdirectories
      return `${commonDir}/**/*.ts`;
    }
    
    // Fallback: use a broad pattern
    return 'src/**/*.ts';
  }

  /**
   * Find common directory from file paths
   */
  private findCommonDirectory(filePaths: string[]): string | null {
    if (filePaths.length === 0) return null;
    
    const pathParts = filePaths.map(p => p.split('/'));
    const commonParts: string[] = [];
    
    // Find common prefix
    for (let i = 0; i < pathParts[0].length; i++) {
      const part = pathParts[0][i];
      
      if (pathParts.every(parts => parts[i] === part)) {
        commonParts.push(part);
      } else {
        break;
      }
    }
    
    return commonParts.length > 0 ? commonParts.join('/') : null;
  }

  /**
   * Validate that input files exist
   */
  private async validateFiles(inputFiles: string[]): Promise<string[]> {
    const validFiles: string[] = [];
    
    for (const file of inputFiles) {
      if (file.includes('*')) {
        // Handle glob patterns by expanding them
        const expandedFiles = await this.expandGlobPattern(file);
        validFiles.push(...expandedFiles);
      } else {
        // Check individual file
        const exists = await this.fileExists(file);
        if (exists) {
          validFiles.push(file);
        }
      }
    }
    
    return validFiles;
  }

  /**
   * Expand glob patterns to actual file paths
   */
  private async expandGlobPattern(pattern: string): Promise<string[]> {
    try {
      // Simple implementation - could be enhanced with proper glob library
      const baseDir = pattern.substring(0, pattern.lastIndexOf('/'));
      const fileName = pattern.substring(pattern.lastIndexOf('/') + 1);
      
      if (fileName === '*.ts') {
        const files = await fs.readdir(baseDir);
        return files
          .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.spec.ts'))
          .map(file => path.join(baseDir, file));
      }
      
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Get generated diagram info
   */
  async getDiagramInfo(diagramPath: string): Promise<{
    path: string;
    exists: boolean;
    size?: number;
    lastModified?: Date;
  }> {
    const exists = await this.fileExists(diagramPath);
    
    if (!exists) {
      return { path: diagramPath, exists: false };
    }

    try {
      const stats = await fs.stat(diagramPath);
      return {
        path: diagramPath,
        exists: true,
        size: stats.size,
        lastModified: stats.mtime
      };
    } catch {
      return { path: diagramPath, exists: false };
    }
  }

  /**
   * List all generated diagrams
   */
  async listGeneratedDiagrams(outputDir?: string): Promise<string[]> {
    const diagramDir = outputDir || this.defaultOptions.outputDir!;
    
    try {
      const files = await fs.readdir(diagramDir);
      return files.filter(file => 
        file.endsWith('.svg') || 
        file.endsWith('.png') || 
        file.endsWith('.pdf')
      ).map(file => path.join(diagramDir, file));
    } catch {
      return [];
    }
  }
}