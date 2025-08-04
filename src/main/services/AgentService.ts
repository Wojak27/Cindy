import { EventEmitter } from 'events';
import { createStore, applyMiddleware } from 'redux';
import { persistenceMiddleware } from '../../store/middleware/persistenceMiddleware';
import { rootReducer } from '../../store/reducers';
import { MemoryService } from './MemoryService';
import { ToolExecutorService } from './ToolExecutorService';
import { LLMRouterService } from './LLMRouterService';
import { CindyAgent } from '../agents/CindyAgent';

interface AgentConfig {
    maxIterations: number;
    timeout: number; // in milliseconds
    memorySize: number;
    enableStreaming: boolean;
}

export class AgentService extends EventEmitter {
    private store: any;
    private memoryService: MemoryService;
    private toolExecutor: ToolExecutorService;
    private llmRouter: LLMRouterService;
    private config: AgentConfig;
    private agent: CindyAgent;

    constructor(
        config: AgentConfig,
        llmRouter: LLMRouterService
    ) {
        super();
        this.config = config;
        this.llmRouter = llmRouter;

        // Initialize Redux store with persistence middleware
        this.store = createStore(
            rootReducer,
            applyMiddleware(persistenceMiddleware)
        );

        // Initialize services
        this.memoryService = new MemoryService(this.store);
        this.toolExecutor = new ToolExecutorService();
        this.agent = new CindyAgent({
            store: this.store,
            config: this.config,
            llmRouter: this.llmRouter,
            memoryService: this.memoryService,
            toolExecutor: this.toolExecutor
        });

        // Subscribe to store changes
        this.store.subscribe(() => {
            this.emit('stateChanged', this.store.getState());
        });
    }

    async execute(input: string): Promise<string | AsyncGenerator<string>> {
        return this.agent.process(input);
    }
}
