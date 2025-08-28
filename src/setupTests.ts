/**
 * Test setup configuration
 * This file is run before each test file
 */

// Configure Jest DOM matchers
import '@testing-library/jest-dom';

// Mock Electron APIs
(global as any).require = jest.fn();

// Mock ipcRenderer for all tests
jest.mock('electron', () => ({
    ipcRenderer: {
        invoke: jest.fn().mockResolvedValue({}),
        on: jest.fn(),
        off: jest.fn(),
        removeAllListeners: jest.fn(),
        send: jest.fn()
    }
}));

// Mock D3.js for graph components
jest.mock('d3', () => ({
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    append: jest.fn().mockReturnThis(),
    attr: jest.fn().mockReturnThis(),
    style: jest.fn().mockReturnThis(),
    text: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    call: jest.fn().mockReturnThis(),
    data: jest.fn().mockReturnThis(),
    enter: jest.fn().mockReturnThis(),
    exit: jest.fn().mockReturnThis(),
    remove: jest.fn().mockReturnThis(),
    merge: jest.fn().mockReturnThis(),
    transition: jest.fn().mockReturnThis(),
    duration: jest.fn().mockReturnThis(),
    forceSimulation: jest.fn(() => ({
        nodes: jest.fn().mockReturnThis(),
        force: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis(),
        alpha: jest.fn().mockReturnThis(),
        restart: jest.fn().mockReturnThis(),
        stop: jest.fn().mockReturnThis()
    })),
    forceLink: jest.fn(() => ({
        id: jest.fn().mockReturnThis(),
        distance: jest.fn().mockReturnThis()
    })),
    forceManyBody: jest.fn(() => ({
        strength: jest.fn().mockReturnThis()
    })),
    forceCenter: jest.fn(),
    scaleOrdinal: jest.fn(() => jest.fn()),
    schemeCategory10: ['#1f77b4', '#ff7f0e', '#2ca02c'],
    zoom: jest.fn(() => ({
        on: jest.fn().mockReturnThis(),
        scaleExtent: jest.fn().mockReturnThis(),
        transform: jest.fn()
    })),
    zoomIdentity: { k: 1, x: 0, y: 0 },
    event: { transform: { k: 1, x: 0, y: 0 } }
}));

// Suppress console warnings in tests unless explicitly needed
const originalWarn = console.warn;
console.warn = (...args) => {
    // Only show warnings that are not React/testing related
    if (!args[0]?.includes?.('Warning:') && !args[0]?.includes?.('ReactDOM.render')) {
        originalWarn(...args);
    }
};

// Mock window.matchMedia for responsive components
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock IntersectionObserver
(global as any).IntersectionObserver = class IntersectionObserver {
    constructor(callback: any) {}
    disconnect() {}
    observe() {}
    unobserve() {}
    root = null;
    rootMargin = '';
    thresholds = [];
    takeRecords() { return []; }
};

// Mock ResizeObserver
(global as any).ResizeObserver = class ResizeObserver {
    constructor(callback: any) {}
    disconnect() {}
    observe() {}
    unobserve() {}
};