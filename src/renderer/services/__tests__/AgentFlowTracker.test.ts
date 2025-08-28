/**
 * Unit tests for AgentFlowTracker service
 */

import { AgentFlowTracker } from '../AgentFlowTracker';

describe('AgentFlowTracker', () => {
    let tracker: AgentFlowTracker;

    beforeEach(() => {
        tracker = new AgentFlowTracker();
    });

    describe('basic step management', () => {
        it('should initialize with empty steps', () => {
            const steps = tracker.getSteps();
            expect(steps).toHaveLength(0);
        });

        it('should add a step and return an ID', () => {
            const stepId = tracker.addStep({
                title: 'Test Step',
                details: 'Test details'
            });

            expect(stepId).toMatch(/^step_\d+$/);
            
            const steps = tracker.getSteps();
            expect(steps).toHaveLength(1);
            expect(steps[0].title).toBe('Test Step');
            expect(steps[0].details).toBe('Test details');
            expect(steps[0].status).toBe('pending');
        });

        it('should update step status', () => {
            const stepId = tracker.addStep({ title: 'Test Step' });
            tracker.updateStepStatus(stepId, 'running', 'In progress');

            const steps = tracker.getSteps();
            expect(steps[0].status).toBe('running');
            expect(steps[0].details).toBe('In progress');
        });

        it('should calculate duration when completing a step', (done) => {
            const stepId = tracker.addStep({ title: 'Test Step' });
            
            // Wait a small amount and then complete
            setTimeout(() => {
                tracker.completeStep(stepId);
                
                const steps = tracker.getSteps();
                expect(steps[0].status).toBe('completed');
                expect(steps[0].duration).toBeDefined();
                expect(steps[0].duration).toBeGreaterThan(0);
                done();
            }, 10);
        });
    });

    describe('convenience methods', () => {
        it('should start a new step immediately', () => {
            tracker.startNewStep({ title: 'Running Step' });
            
            const steps = tracker.getSteps();
            expect(steps[0].status).toBe('running');
            expect(steps[0].title).toBe('Running Step');
        });

        it('should add a completed step', () => {
            tracker.addCompletedStep({ title: 'Completed Step' });
            
            const steps = tracker.getSteps();
            expect(steps[0].status).toBe('completed');
            expect(steps[0].title).toBe('Completed Step');
        });

        it('should mark step as error', () => {
            const stepId = tracker.addStep({ title: 'Test Step' });
            tracker.errorStep(stepId, 'Something went wrong');

            const steps = tracker.getSteps();
            expect(steps[0].status).toBe('error');
            expect(steps[0].details).toBe('Error: Something went wrong');
        });
    });

    describe('todo list steps', () => {
        it('should add todo list step with metadata', () => {
            const todos = [
                { content: 'Task 1', status: 'completed', activeForm: 'Task 1' },
                { content: 'Task 2', status: 'pending', activeForm: 'Task 2' }
            ];

            const stepId = tracker.addTodoListStep({
                title: 'Planning Phase',
                todos: todos,
                timestamp: new Date('2023-10-15T10:30:00Z')
            });

            expect(stepId).toMatch(/^todo_\d+$/);
            
            const steps = tracker.getSteps();
            expect(steps).toHaveLength(1);
            
            const todoStep = steps[0];
            expect(todoStep.title).toBe('Planning Phase');
            expect(todoStep.status).toBe('completed');
            expect(todoStep.details).toBe('Created task list with 2 items');
            expect(todoStep.metadata?.type).toBe('todo-list');
            expect(todoStep.metadata?.todos).toEqual(todos);
        });

        it('should use default title for todo step if not provided', () => {
            const todos = [{ content: 'Task', status: 'pending', activeForm: 'Task' }];
            
            tracker.addTodoListStep({ todos });
            
            const steps = tracker.getSteps();
            expect(steps[0].title).toBe('Task Planning');
        });
    });

    describe('substeps', () => {
        it('should add substeps to parent step', () => {
            const parentId = tracker.addStep({ title: 'Parent Step' });
            tracker.addStep({ 
                title: 'Child Step', 
                parentId: parentId 
            });

            const steps = tracker.getSteps();
            expect(steps).toHaveLength(1); // Only parent at root level
            expect(steps[0].substeps).toHaveLength(1);
            expect(steps[0].substeps![0].title).toBe('Child Step');
        });

        it('should update substeps correctly', () => {
            const parentId = tracker.addStep({ title: 'Parent Step' });
            const childId = tracker.addStep({ 
                title: 'Child Step', 
                parentId: parentId 
            });

            tracker.updateStepStatus(childId, 'completed');

            const steps = tracker.getSteps();
            expect(steps[0].substeps![0].status).toBe('completed');
        });
    });

    describe('step finding', () => {
        it('should find root level steps', () => {
            const stepId = tracker.addStep({ title: 'Root Step' });
            tracker.updateStepStatus(stepId, 'running');

            const steps = tracker.getSteps();
            expect(steps[0].status).toBe('running');
        });

        it('should find nested substeps', () => {
            const parentId = tracker.addStep({ title: 'Parent' });
            const childId = tracker.addStep({ title: 'Child', parentId });
            
            tracker.updateStepStatus(childId, 'running');

            const steps = tracker.getSteps();
            expect(steps[0].substeps![0].status).toBe('running');
        });
    });

    describe('subscriptions', () => {
        it('should notify listeners when steps change', (done) => {
            const listener = jest.fn((steps) => {
                if (steps.length > 0) {
                    expect(steps[0].title).toBe('Test Step');
                    expect(listener).toHaveBeenCalled();
                    done();
                }
            });

            tracker.subscribe(listener);
            tracker.addStep({ title: 'Test Step' });
        });

        it('should return unsubscribe function', () => {
            const listener = jest.fn();
            const unsubscribe = tracker.subscribe(listener);

            tracker.addStep({ title: 'Test' });
            expect(listener).toHaveBeenCalled();

            listener.mockClear();
            unsubscribe();
            
            tracker.addStep({ title: 'Test 2' });
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('reset', () => {
        it('should clear all steps and reset counter', () => {
            tracker.addStep({ title: 'Step 1' });
            tracker.addStep({ title: 'Step 2' });
            
            expect(tracker.getSteps()).toHaveLength(2);
            
            tracker.reset();
            
            expect(tracker.getSteps()).toHaveLength(0);
            
            // Next step should start from step_1 again
            const newStepId = tracker.addStep({ title: 'New Step' });
            expect(newStepId).toBe('step_1');
        });

        it('should notify listeners on reset', () => {
            const listener = jest.fn();
            tracker.subscribe(listener);
            
            tracker.addStep({ title: 'Step' });
            listener.mockClear();
            
            tracker.reset();
            
            expect(listener).toHaveBeenCalledWith([]);
        });
    });
});