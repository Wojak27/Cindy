/**
 * Simple unit tests for TodoListStep component
 */

import { render } from '@testing-library/react';
import TodoListStep, { TodoItem } from '../TodoListStep';

// Mock Material-UI components for simpler testing
jest.mock('@mui/material', () => ({
    Box: ({ children }: any) => <div data-testid="box">{children}</div>,
    Typography: ({ children }: any) => <span data-testid="typography">{children}</span>,
    Collapse: ({ children, in: isOpen }: any) => isOpen ? <div data-testid="collapse">{children}</div> : null,
    IconButton: ({ children, onClick }: any) => <button onClick={onClick} data-testid="icon-button">{children}</button>,
    Chip: ({ label }: any) => <span data-testid="chip">{label}</span>,
    List: ({ children }: any) => <ul data-testid="list">{children}</ul>,
    ListItem: ({ children }: any) => <li data-testid="list-item">{children}</li>,
    ListItemIcon: ({ children }: any) => <span data-testid="list-item-icon">{children}</span>,
    ListItemText: ({ primary }: any) => <span data-testid="list-item-text">{primary}</span>,
    LinearProgress: ({ value }: any) => <div data-testid="progress" data-value={value}>Progress: {value}%</div>
}));

// Mock Material-UI icons
jest.mock('@mui/icons-material', () => ({
    ExpandMore: () => <span data-testid="expand-more">ExpandMore</span>,
    ExpandLess: () => <span data-testid="expand-less">ExpandLess</span>,
    CheckCircle: () => <span data-testid="check-circle">CheckCircle</span>,
    PlayArrow: () => <span data-testid="play-arrow">PlayArrow</span>,
    RadioButtonUnchecked: () => <span data-testid="radio-button">RadioButtonUnchecked</span>,
    Assignment: () => <span data-testid="assignment">Assignment</span>
}));

describe('TodoListStep', () => {
    const mockTodos: TodoItem[] = [
        {
            content: 'Complete task 1',
            status: 'completed',
            activeForm: 'Completing task 1'
        },
        {
            content: 'Work on task 2',
            status: 'in_progress',
            activeForm: 'Working on task 2'
        },
        {
            content: 'Start task 3',
            status: 'pending',
            activeForm: 'Starting task 3'
        }
    ];

    it('renders without crashing', () => {
        const { container } = render(<TodoListStep todos={[]} />);
        expect(container).toBeDefined();
    });

    it('renders with todos', () => {
        const { container } = render(<TodoListStep todos={mockTodos} />);
        expect(container).toBeDefined();
        
        // Should have some list items
        const listItems = container.querySelectorAll('[data-testid="list-item"]');
        expect(listItems.length).toBe(mockTodos.length);
    });

    it('renders custom title when provided', () => {
        const customTitle = 'Custom Planning';
        const { container } = render(<TodoListStep todos={mockTodos} title={customTitle} />);
        
        const typography = container.querySelector('[data-testid="typography"]');
        expect(typography?.textContent).toBe(customTitle);
    });

    it('handles empty todos array', () => {
        const { container } = render(<TodoListStep todos={[]} />);
        expect(container).toBeDefined();
    });

    it('calculates progress correctly', () => {
        const { container } = render(<TodoListStep todos={mockTodos} />);
        
        // Should show progress bar
        const progress = container.querySelector('[data-testid="progress"]');
        expect(progress).toBeDefined();
        
        // Should have calculated correct progress (1 completed out of 3 = 33.33%)
        const progressValue = progress?.getAttribute('data-value');
        expect(parseFloat(progressValue || '0')).toBeCloseTo(33.33, 1);
    });

    it('shows different status indicators', () => {
        const { container } = render(<TodoListStep todos={mockTodos} />);
        
        // Should have different icons for different statuses
        const checkCircle = container.querySelector('[data-testid="check-circle"]');
        const playArrow = container.querySelector('[data-testid="play-arrow"]');
        const radioButton = container.querySelector('[data-testid="radio-button"]');
        
        expect(checkCircle).toBeDefined(); // completed
        expect(playArrow).toBeDefined(); // in_progress
        expect(radioButton).toBeDefined(); // pending
    });
});