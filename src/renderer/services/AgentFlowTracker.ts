/**
 * Agent Flow Tracker Service
 * Tracks and manages agent workflow steps for visualization
 */

import { AgentFlowStep } from '../components/AgentFlowVisualization';

export type FlowStepStatus = 'pending' | 'running' | 'completed' | 'error';

export interface FlowStepOptions {
    title: string;
    details?: string;
    parentId?: string;
}

export class AgentFlowTracker {
    private steps: Map<string, AgentFlowStep> = new Map();
    private listeners: Array<(steps: AgentFlowStep[]) => void> = [];
    private stepCounter = 0;

    constructor() {
        this.reset();
    }

    /**
     * Add a new workflow step
     */
    addStep(options: FlowStepOptions): string {
        const id = `step_${++this.stepCounter}`;
        const step: AgentFlowStep = {
            id,
            title: options.title,
            status: 'pending',
            timestamp: new Date(),
            details: options.details,
            substeps: []
        };

        if (options.parentId && this.steps.has(options.parentId)) {
            const parentStep = this.steps.get(options.parentId)!;
            if (!parentStep.substeps) {
                parentStep.substeps = [];
            }
            parentStep.substeps.push(step);
        } else {
            this.steps.set(id, step);
        }

        this.notifyListeners();
        return id;
    }

    /**
     * Update step status
     */
    updateStepStatus(stepId: string, status: FlowStepStatus, details?: string): void {
        const step = this.findStep(stepId);
        if (step) {
            step.status = status;
            if (details) {
                step.details = details;
            }
            if (status === 'completed' && step.timestamp) {
                step.duration = Date.now() - step.timestamp.getTime();
            }
            this.notifyListeners();
        }
    }

    /**
     * Add details to a step
     */
    updateStepDetails(stepId: string, details: string): void {
        const step = this.findStep(stepId);
        if (step) {
            step.details = details;
            this.notifyListeners();
        }
    }

    /**
     * Start a step (set status to running)
     */
    startStep(stepId: string): void {
        this.updateStepStatus(stepId, 'running');
    }

    /**
     * Complete a step
     */
    completeStep(stepId: string, details?: string): void {
        this.updateStepStatus(stepId, 'completed', details);
    }

    /**
     * Mark step as error
     */
    errorStep(stepId: string, error: string): void {
        this.updateStepStatus(stepId, 'error', `Error: ${error}`);
    }

    /**
     * Get all root-level steps
     */
    getSteps(): AgentFlowStep[] {
        return Array.from(this.steps.values());
    }

    /**
     * Reset all steps
     */
    reset(): void {
        this.steps.clear();
        this.stepCounter = 0;
        this.notifyListeners();
    }

    /**
     * Subscribe to step updates
     */
    subscribe(listener: (steps: AgentFlowStep[]) => void): () => void {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Create a step and immediately start it
     */
    startNewStep(options: FlowStepOptions): string {
        const stepId = this.addStep(options);
        this.startStep(stepId);
        return stepId;
    }

    /**
     * Add a quick completed step
     */
    addCompletedStep(options: FlowStepOptions): string {
        const stepId = this.addStep(options);
        this.completeStep(stepId);
        return stepId;
    }

    /**
     * Find step by ID (including substeps)
     */
    private findStep(stepId: string): AgentFlowStep | null {
        // Check root level steps
        if (this.steps.has(stepId)) {
            return this.steps.get(stepId)!;
        }

        // Check substeps recursively
        for (const rootStep of this.steps.values()) {
            const found = this.findStepRecursive(rootStep, stepId);
            if (found) return found;
        }

        return null;
    }

    private findStepRecursive(step: AgentFlowStep, stepId: string): AgentFlowStep | null {
        if (step.id === stepId) return step;
        
        if (step.substeps) {
            for (const substep of step.substeps) {
                const found = this.findStepRecursive(substep, stepId);
                if (found) return found;
            }
        }

        return null;
    }

    private notifyListeners(): void {
        const steps = this.getSteps();
        this.listeners.forEach(listener => listener(steps));
    }
}

// Global instance for the app
export const agentFlowTracker = new AgentFlowTracker();