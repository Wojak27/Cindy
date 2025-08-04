# Cindy - Scheduler for Research Tasks

## Requirements

1. Job runner for research and daily summaries
2. Automated web research that produces Markdown reports with citations
3. Persistent scheduling across restarts
4. Configurable research cadence
5. Cross-platform compatibility
6. Resource management and throttling

## Selected Technologies

### Node-Cron
- Simple cron-like job scheduling
- Good TypeScript support
- Lightweight and reliable
- Cross-platform compatibility

### Bull Queue
- Robust job queue management
- Retry mechanisms
- Concurrency control
- Persistent storage

## Implementation Architecture

```
src/
├── main/
│   ├── services/
│   │   ├── SchedulerService.ts
│   │   ├── ResearchService.ts
│   │   └── TaskQueueService.ts
│   ├── tasks/
│   │   ├── WebResearchTask.ts
│   │   ├── DailySummaryTask.ts
│   │   └── VaultIndexTask.ts
│   └── utils/
│       ├── CronParser.ts
│       └── ReportGenerator.ts
└── renderer/
    └── components/
        └── SchedulerSettings.tsx
```

## Core Components

### 1. Scheduler Service (Main Interface)

```typescript
// SchedulerService.ts
import { EventEmitter } from 'events';
import { TaskQueueService } from './TaskQueueService';
import { ResearchService } from './ResearchService';
import { CronParser } from '../utils/CronParser';

interface SchedulerConfig {
  enabled: boolean;
  maxConcurrentTasks: number;
  researchInterval: string; // cron expression
  dailySummaryTime: string; // cron expression
  vaultIndexPath: string;
}

interface ScheduledTask {
  id: string;
  name: string;
  type: 'research' | 'summary' | 'index';
  schedule: string; // cron expression
  lastRun?: Date;
  nextRun: Date;
  enabled: boolean;
  parameters: Record<string, any>;
}

class SchedulerService extends EventEmitter {
  private taskQueue: TaskQueueService;
  private researchService: ResearchService;
  private config: SchedulerConfig;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();
  private cronJobs: Map<string, any> = new Map(); // cron job instances
  private isInitialized: boolean = false;

  constructor(config: SchedulerConfig) {
    super();
    this.config = config;
    this.taskQueue = new TaskQueueService({
      concurrency: config.maxConcurrentTasks
    });
    this.researchService = new ResearchService();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize task queue
      await this.taskQueue.initialize();
      
      // Load scheduled tasks from persistence
      await this.loadScheduledTasks();
      
      // Start cron jobs if enabled
      if (this.config.enabled) {
        await this.startCronJobs();
      }
      
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      console.error('Failed to initialize scheduler:', error);
      throw error;
    }
  }

  async scheduleTask(task: Omit<ScheduledTask, 'id'>): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const taskId = this.generateTaskId();
      const scheduledTask: ScheduledTask = {
        id: taskId,
        ...task
      };

      // Store task
      this.scheduledTasks.set(taskId, scheduledTask);
      
      // Save to persistence
      await this.saveTask(scheduledTask);
      
      // Schedule cron job if enabled
      if (this.config.enabled && scheduledTask.enabled) {
        await this.scheduleCronJob(scheduledTask);
      }
      
      this.emit('taskScheduled', scheduledTask);
      return taskId;
    } catch (error) {
      console.error('Failed to schedule task:', error);
      throw error;
    }
  }

  async unscheduleTask(taskId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const task = this.scheduledTasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Remove cron job
      await this.unscheduleCronJob(taskId);
      
      // Remove from storage
      await this.deleteTask(taskId);
      
      // Remove from memory
      this.scheduledTasks.delete(taskId);
      
      this.emit('taskUnscheduled', taskId);
    } catch (error) {
      console.error('Failed to unschedule task:', error);
      throw error;
    }
  }

  async updateTask(taskId: string, updates: Partial<ScheduledTask>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const task = this.scheduledTasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Remove old cron job
      if (task.enabled) {
        await this.unscheduleCronJob(taskId);
      }

      // Update task
      const updatedTask = { ...task, ...updates };
      this.scheduledTasks.set(taskId, updatedTask);
      
      // Save to persistence
      await this.saveTask(updatedTask);
      
      // Schedule new cron job if enabled
      if (this.config.enabled && updatedTask.enabled) {
        await this.scheduleCronJob(updatedTask);
      }
      
      this.emit('taskUpdated', updatedTask);
    } catch (error) {
      console.error('Failed to update task:', error);
      throw error;
    }
  }

  async runTaskNow(taskId: string): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      const task = this.scheduledTasks.get(taskId);
      if (!task) {
        throw new Error(`Task not found: ${taskId}`);
      }

      // Add task to queue for immediate execution
      await this.taskQueue.addTask({
        id: taskId,
        name: task.name,
        type: task.type,
        parameters: task.parameters
      });
      
      this.emit('taskStarted', taskId);
    } catch (error) {
      console.error('Failed to run task:', error);
      throw error;
    }
  }

  async getTask(taskId: string): Promise<ScheduledTask | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return this.scheduledTasks.get(taskId) || null;
  }

  async getAllTasks(): Promise<ScheduledTask[]> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return Array.from(this.scheduledTasks.values());
  }

  async updateConfig(newConfig: Partial<SchedulerConfig>): Promise<void> {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // Handle scheduler enable/disable
    if (newConfig.enabled !== undefined && newConfig.enabled !== oldConfig.enabled) {
      if (newConfig.enabled) {
        await this.startCronJobs();
      } else {
        await this.stopCronJobs();
      }
    }
    
    // Handle concurrency changes
    if (newConfig.maxConcurrentTasks !== undefined) {
      await this.taskQueue.updateConcurrency(newConfig.maxConcurrentTasks);
    }
    
    // Save config
    await this.saveConfig();
    
    this.emit('configUpdated', this.config);
  }

  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  async pauseTask(taskId: string): Promise<void> {
    await this.updateTask(taskId, { enabled: false });
  }

  async resumeTask(taskId: string): Promise<void> {
    await this.updateTask(taskId, { enabled: true });
  }

  async close(): Promise<void> {
    await this.stopCronJobs();
    await this.taskQueue.close();
    this.isInitialized = false;
    this.emit('closed');
  }

  // Private methods
  private async startCronJobs(): Promise<void> {
    // Schedule all enabled tasks
    for (const task of this.scheduledTasks.values()) {
      if (task.enabled) {
        await this.scheduleCronJob(task);
      }
    }
    
    // Schedule built-in tasks
    await this.scheduleBuiltInTasks();
  }

  private async stopCronJobs(): Promise<void> {
    for (const [taskId, job] of this.cronJobs.entries()) {
      job.stop();
    }
    this.cronJobs.clear();
  }

  private async scheduleCronJob(task: ScheduledTask): Promise<void> {
    // In a real implementation, this would use node-cron or similar
    // For now, we'll simulate the scheduling
    
    console.log(`Scheduling task ${task.id} with cron: ${task.schedule}`);
    
    // Create cron job (placeholder)
    const cronJob = {
      start: () => console.log(`Started cron job for task ${task.id}`),
      stop: () => console.log(`Stopped cron job for task ${task.id}`)
    };
    
    this.cronJobs.set(task.id, cronJob);
    cronJob.start();
  }

  private async unscheduleCronJob(taskId: string): Promise<void> {
    const job = this.cronJobs.get(taskId);
    if (job) {
      job.stop();
      this.cronJobs.delete(taskId);
    }
  }

  private async scheduleBuiltInTasks(): Promise<void> {
    // Schedule daily summary task
    if (this.config.dailySummaryTime) {
      await this.scheduleTask({
        name: 'Daily Summary',
        type: 'summary',
        schedule: this.config.dailySummaryTime,
        nextRun: CronParser.getNextRun(this.config.dailySummaryTime),
        enabled: true,
        parameters: {
          outputPath: './Research/Summaries'
        }
      });
    }
    
    // Schedule vault indexing task (hourly)
    await this.scheduleTask({
      name: 'Vault Index Update',
      type: 'index',
      schedule: '0 * * * *', // Every hour
      nextRun: new Date(Date.now() + 60 * 60 * 1000),
      enabled: true,
      parameters: {
        vaultPath: this.config.vaultIndexPath
      }
    });
  }

  private async loadScheduledTasks(): Promise<void> {
    // Load tasks from persistence
    console.log('Loading scheduled tasks from persistence');
  }

  private async saveTask(task: ScheduledTask): Promise<void> {
    // Save task to persistence
    console.log(`Saving task ${task.id} to persistence`);
  }

  private async deleteTask(taskId: string): Promise<void> {
    // Delete task from persistence
    console.log(`Deleting task ${taskId} from persistence`);
  }

  private async saveConfig(): Promise<void> {
    // Save config to persistence
    console.log('Saving scheduler config to persistence');
  }

  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 2. Task Queue Service

```typescript
// TaskQueueService.ts
import { EventEmitter } from 'events';

interface TaskQueueConfig {
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
}

interface Task {
  id: string;
  name: string;
  type: string;
  parameters: Record<string, any>;
  priority?: number;
  createdAt: Date;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  result?: any;
  error?: Error;
  completedAt: Date;
}

class TaskQueueService extends EventEmitter {
  private config: TaskQueueConfig;
  private queue: Task[] = [];
  private runningTasks: Set<string> = new Set();
  private results: Map<string, TaskResult> = new Map();
  private isInitialized: boolean = false;

  constructor(config: TaskQueueConfig) {
    super();
    this.config = {
      concurrency: config.concurrency || 1,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000
    };
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Start processing queue
    this.startProcessing();
    
    this.isInitialized = true;
    this.emit('initialized');
  }

  async addTask(task: Omit<Task, 'createdAt'>): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const fullTask: Task = {
      ...task,
      createdAt: new Date()
    };

    // Add to queue
    this.queue.push(fullTask);
    
    // Sort by priority if specified
    this.queue.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    this.emit('taskAdded', fullTask);
  }

  async updateConcurrency(concurrency: number): Promise<void> {
    this.config.concurrency = concurrency;
    this.emit('concurrencyUpdated', concurrency);
  }

  getQueueStatus(): {
    pending: number;
    running: number;
    completed: number;
  } {
    return {
      pending: this.queue.length,
      running: this.runningTasks.size,
      completed: this.results.size
    };
  }

  async getTaskResult(taskId: string): Promise<TaskResult | null> {
    return this.results.get(taskId) || null;
  }

  async close(): Promise<void> {
    // Wait for running tasks to complete
    while (this.runningTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.isInitialized = false;
    this.emit('closed');
  }

  private startProcessing(): void {
    const processNext = async () => {
      if (!this.isInitialized) return;
      
      // Check if we can process more tasks
      if (this.runningTasks.size >= this.config.concurrency) {
        // Wait and try again
        setTimeout(processNext, 100);
        return;
      }
      
      // Get next task from queue
      const task = this.queue.shift();
      if (!task) {
        // No tasks in queue, wait and try again
        setTimeout(processNext, 1000);
        return;
      }
      
      // Process task
      this.processTask(task)
        .then(() => {
          // Continue processing
          processNext();
        })
        .catch(error => {
          console.error('Task processing error:', error);
          processNext();
        });
    };
    
    // Start processing
    processNext();
  }

  private async processTask(task: Task): Promise<void> {
    this.runningTasks.add(task.id);
    this.emit('taskStarted', task);
    
    try {
      let result: any;
      let attempts = 0;
      let success = false;
      
      while (!success && attempts < this.config.retryAttempts) {
        try {
          result = await this.executeTask(task);
          success = true;
        } catch (error) {
          attempts++;
          if (attempts >= this.config.retryAttempts) {
            throw error;
          }
          
          console.warn(`Task ${task.id} failed, retrying in ${this.config.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
        }
      }
      
      // Store result
      const taskResult: TaskResult = {
        taskId: task.id,
        success: true,
        result,
        completedAt: new Date()
      };
      
      this.results.set(task.id, taskResult);
      this.emit('taskCompleted', taskResult);
    } catch (error) {
      // Store error result
      const taskResult: TaskResult = {
        taskId: task.id,
        success: false,
        error,
        completedAt: new Date()
      };
      
      this.results.set(task.id, taskResult);
      this.emit('taskFailed', taskResult);
    } finally {
      this.runningTasks.delete(task.id);
    }
  }

  private async executeTask(task: Task): Promise<any> {
    // In a real implementation, this would route to specific task handlers
    // For now, we'll simulate execution
    
    console.log(`Executing task ${task.id}: ${task.name}`);
    
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    // Simulate random failures for testing
    if (Math.random() < 0.1) {
      throw new Error(`Task ${task.id} failed randomly`);
    }
    
    return { message: `Task ${task.name} completed successfully` };
  }
}

export { TaskQueueService };
```

### 3. Research Service

```typescript
// ResearchService.ts
import { WebSearchTool } from '../tools/WebSearchTool';
import { WebCrawlTool } from '../tools/WebCrawlTool';
import { ReportGenerator } from '../utils/ReportGenerator';

interface ResearchParameters {
  topic: string;
  maxResults: number;
  sources: string[];
  outputPath: string;
  includeCitations: boolean;
}

interface ResearchResult {
  topic: string;
  summary: string;
  sources: Array<{
    url: string;
    title: string;
    excerpt: string;
  }>;
  reportPath: string;
  completedAt: Date;
}

class ResearchService {
  private webSearch: WebSearchTool;
  private webCrawl: WebCrawlTool;
  private reportGenerator: ReportGenerator;

  constructor() {
    this.webSearch = new WebSearchTool();
    this.webCrawl = new WebCrawlTool();
    this.reportGenerator = new ReportGenerator();
  }

  async conductResearch(params: ResearchParameters): Promise<ResearchResult> {
    try {
      console.log(`Starting research on topic: ${params.topic}`);
      
      // Step 1: Search for relevant sources
      const searchResults = await this.webSearch.search(params.topic, {
        maxResults: params.maxResults
      });
      
      console.log(`Found ${searchResults.length} search results`);
      
      // Step 2: Crawl and extract content from sources
      const crawledContent = [];
      
      for (const result of searchResults) {
        try {
          const content = await this.webCrawl.crawl(result.url);
          crawledContent.push({
            ...result,
            content
          });
        } catch (error) {
          console.warn(`Failed to crawl ${result.url}:`, error);
        }
      }
      
      console.log(`Successfully crawled ${crawledContent.length} sources`);
      
      // Step 3: Generate research report
      const reportPath = await this.reportGenerator.generateReport({
        topic: params.topic,
        sources: crawledContent,
        outputPath: params.outputPath,
        includeCitations: params.includeCitations
      });
      
      // Step 4: Create summary
      const summary = this.generateSummary(crawledContent);
      
      const result: ResearchResult = {
        topic: params.topic,
        summary,
        sources: crawledContent.map(item => ({
          url: item.url,
          title: item.title,
          excerpt: item.excerpt || item.content.substring(0, 200) + '...'
        })),
        reportPath,
        completedAt: new Date()
      };
      
      console.log(`Research completed for topic: ${params.topic}`);
      return result;
    } catch (error) {
      console.error('Research failed:', error);
      throw error;
    }
  }

  private generateSummary(content: any[]): string {
    // In a real implementation, this would use an LLM to generate a summary
    // For now, we'll create a simple summary
    
    const totalSources = content.length;
    const totalWords = content.reduce((sum, item) => 
      sum + (item.content ? item.content.split(' ').length : 0), 0
    );
    
    return `Research completed on ${totalSources} sources with approximately ${totalWords} words of content.`;
  }
}

export { ResearchService };
```

### 4. Web Research Task

```typescript
// WebResearchTask.ts
import { ResearchService } from '../services/ResearchService';

interface WebResearchTaskParams {
  topic: string;
  maxResults?: number;
  outputPath?: string;
  schedule?: string;
}

class WebResearchTask {
  private researchService: ResearchService;

  constructor() {
    this.researchService = new ResearchService();
  }

  async execute(params: WebResearchTaskParams): Promise<any> {
    try {
      const researchParams = {
        topic: params.topic,
        maxResults: params.maxResults || 10,
        sources: [],
        outputPath: params.outputPath || './Research',
        includeCitations: true
      };
      
      const result = await this.researchService.conductResearch(researchParams);
      
      console.log(`Web research task completed for topic: ${params.topic}`);
      return result;
    } catch (error) {
      console.error(`Web research task failed for topic: ${params.topic}`, error);
      throw error;
    }
  }
}

export { WebResearchTask };
```

### 5. Cron Parser Utility

```typescript
// CronParser.ts
class CronParser {
  static getNextRun(cronExpression: string): Date {
    // In a real implementation, this would parse the cron expression
    // and calculate the next run time
    // For now, we'll return a future date
    
    // Simple implementation for common cron patterns
    if (cronExpression === '0 9 * * *') {
      // Daily at 9 AM
      const next = new Date();
      next.setHours(9, 0, 0, 0);
      if (next < new Date()) {
        next.setDate(next.getDate() + 1);
      }
      return next;
    } else if (cronExpression === '0 0 * * 1') {
      // Weekly on Monday at midnight
      const next = new Date();
      next.setHours(0, 0, 0, 0);
      const daysUntilMonday = (8 - next.getDay()) % 7;
      next.setDate(next.getDate() + daysUntilMonday);
      return next;
    }
    
    // Default to 1 hour from now
    return new Date(Date.now() + 60 * 60 * 1000);
  }
  
  static validate(cronExpression: string): boolean {
    // Simple validation - in a real implementation, this would be more thorough
    return typeof cronExpression === 'string' && cronExpression.split(' ').length === 5;
  }
}

export { CronParser };
```

### 6. Report Generator

```typescript
// ReportGenerator.ts
import { writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';

interface ReportParameters {
  topic: string;
  sources: Array<{
    url: string;
    title: string;
    content: string;
    excerpt?: string;
  }>;
  outputPath: string;
  includeCitations: boolean;
}

class ReportGenerator {
  async generateReport(params: ReportParameters): Promise<string> {
    try {
      // Create output directory if it doesn't exist
      await mkdir(params.outputPath, { recursive: true });
      
      // Create topic directory
      const topicDir = join(params.outputPath, this.sanitizeFilename(params.topic));
      await mkdir(topicDir, { recursive: true });
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `${timestamp}.md`;
      const filePath = join(topicDir, filename);
      
      // Generate report content
      const content = this.generateMarkdownContent(params);
      
      // Write report to file
      await writeFile(filePath, content, 'utf8');
      
      console.log(`Report generated at: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('Failed to generate report:', error);
      throw error;
    }
  }

  private generateMarkdownContent(params: ReportParameters): string {
    const lines: string[] = [];
    
    // Title
    lines.push(`# Research Report: ${params.topic}`);
    lines.push('');
    
    // Metadata
    lines.push(`**Generated on:** ${new Date().toISOString()}`);
    lines.push(`**Sources:** ${params.sources.length}`);
    lines.push('');
    
    // Summary
    lines.push('## Summary');
    lines.push('');
    lines.push(this.generateSummary(params.sources));
    lines.push('');
    
    // Content
    lines.push('## Detailed Findings');
    lines.push('');
    
    for (let i = 0; i < params.sources.length; i++) {
      const source = params.sources[i];
      lines.push(`### ${source.title}`);
      
      if (params.includeCitations) {
        lines.push(`[Source](${source.url})`);
      }
      
      lines.push('');
      
      const content = source.excerpt || source.content;
      const truncatedContent = content.length > 1000 ? 
        content.substring(0, 1000) + '...' : 
        content;
      
      lines.push(truncatedContent);
      lines.push('');
    }
    
    // Citations
    if (params.includeCitations && params.sources.length > 0) {
      lines.push('## Sources');
      lines.push('');
      
      for (const source of params.sources) {
        lines.push(`- [${source.title}](${source.url})`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }

  private generateSummary(sources: any[]): string {
    const totalSources = sources.length;
    const totalWords = sources.reduce((sum, source) => 
      sum + (source.content ? source.content.split(' ').length : 0), 0
    );
    
    return `This research analyzed ${totalSources} sources containing approximately ${totalWords} words of content related to the topic.`;
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  }
}

export { ReportGenerator };
```

## Settings Integration

```typescript
// SchedulerSettings.tsx
interface SchedulerSettingsProps {
  config: SchedulerConfig;
  tasks: ScheduledTask[];
  onConfigChange: (config: Partial<SchedulerConfig>) => void;
  onTaskUpdate: (taskId: string, updates: Partial<ScheduledTask>) => void;
  onTaskRun: (taskId: string) => void;
  onTaskDelete: (taskId: string) => void;
}

const SchedulerSettings: React.FC<SchedulerSettingsProps> = ({
  config,
  tasks,
  onConfigChange,
  onTaskUpdate,
  onTaskRun,
  onTaskDelete
}) => {
  return (
    <div className="scheduler-settings">
      <h3>Research Scheduler</h3>
      
      <div className="setting-group">
        <label>
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => onConfigChange({ enabled: e.target.checked })}
          />
          Enable automated research
        </label>
      </div>
      
      <div className="setting-group">
        <label htmlFor="max-concurrent">Max Concurrent Tasks: {config.maxConcurrentTasks}</label>
        <input
          id="max-concurrent"
          type="range"
          min="1"
          max="10"
          value={config.maxConcurrentTasks}
          onChange={(e) => onConfigChange({ maxConcurrentTasks: parseInt(e.target.value) })}
        />
      </div>
      
      <div className="setting-group">
        <label htmlFor="daily-summary-time">Daily Summary Time</label>
        <input
          id="daily-summary-time"
          type="text"
          value={config.dailySummaryTime}
          onChange={(e) => onConfigChange({ dailySummaryTime: e.target.value })}
          placeholder="Cron expression (e.g., 0 9 * * *)"
        />
        <div className="setting-description">
          Cron expression for daily summary generation (default: 0 9 * * * for 9 AM daily)
        </div>
      </div>
      
      <div className="setting-group">
        <label htmlFor="research-interval">Research Interval</label>
        <input
          id="research-interval"
          type="text"
          value={config.researchInterval}
          onChange={(e) => onConfigChange({ researchInterval: e.target.value })}
          placeholder="Cron expression (e.g., 0 0 * * 1)"
        />
        <div className="setting-description">
          Cron expression for periodic research tasks (default: 0 0 * * 1 for weekly)
        </div>
      </div>
      
      <h4>Scheduled Tasks</h4>
      <div className="tasks-list">
        {tasks.map(task => (
          <div key={task.id} className="task-item">
            <div className="task-header">
              <h5>{task.name}</h5>
              <div className="task-controls">
                <button 
                  onClick={() => onTaskRun(task.id)}
                  disabled={!task.enabled}
                >
                  Run Now
                </button>
                <button 
                  onClick={() => onTaskUpdate(task.id, { enabled: !task.enabled })}
                  className={task.enabled ? 'disable' : 'enable'}
                >
                  {task.enabled ? 'Disable' : 'Enable'}
                </button>
                <button 
                  onClick={() => onTaskDelete(task.id)}
                  className="delete"
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="task-details">
              <div className="task-schedule">
                <strong>Schedule:</strong> {task.schedule}
              </div>
              <div className="task-next-run">
                <strong>Next Run:</strong> {task.nextRun.toLocaleString()}
              </div>
              <div className="task-type">
                <strong>Type:</strong> {task.type}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="setting-group">
        <button onClick={() => {
          // In a real implementation, this would open a modal to create a new task
          console.log('Create new task');
        }}>
          Schedule New Research Task
        </button>
      </div>
    </div>
  );
};
```

## Dependencies

```json
{
  "dependencies": {
    "node-cron": "^3.0.2",
    "bull": "^4.11.5"
  }
}
```

## Performance Considerations

### 1. Resource Management
- Concurrency limits to prevent system overload
- Memory usage monitoring
- CPU throttling during intensive tasks
- Network bandwidth management

### 2. Task Prioritization
- Priority-based queue processing
- Critical task preemption
- Resource allocation based on task type
- Dynamic priority adjustment

### 3. Error Handling
- Retry mechanisms with exponential backoff
- Dead letter queue for failed tasks
- Error rate limiting
- Automatic task suspension on repeated failures

## Testing Strategy

### 1. Unit Tests
- Cron expression parsing
- Task scheduling logic
- Queue management
- Report generation

### 2. Integration Tests
- End-to-end task execution
- Scheduler persistence
- Cross-task dependencies
- Error recovery scenarios

### 3. Load Testing
- Concurrent task execution
- Resource usage under load
- Scheduler performance with many tasks
- Recovery from system failures

## Future Enhancements

### 1. Advanced Scheduling
- Dependency-based task scheduling
- Conditional task execution
- Recurring task patterns
- Timezone-aware scheduling

### 2. Monitoring and Analytics
- Task execution dashboards
- Performance metrics
- Resource utilization tracking
- Predictive scheduling

### 3. Distributed Processing
- Multi-node task distribution
- Load balancing across nodes
- Fault tolerance and redundancy
- Cross-node task coordination