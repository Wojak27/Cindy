console.log('Debug test starting...');

// Set a breakpoint on this line
const testBreakpoint = () => {
    console.log('This should stop at breakpoint'); // <- SET BREAKPOINT HERE
    return 'Breakpoint test complete';
};

console.log('About to call test function...');
const result = testBreakpoint();
console.log('Result:', result);

// Test ServiceManager import
console.log('Testing ServiceManager import...');
import { ServiceManager } from './src/main/services/ServiceManager';

const manager = new ServiceManager();
console.log('ServiceManager created successfully');
console.log('Loaded services:', manager.getLoadedServices());

console.log('Debug test complete');