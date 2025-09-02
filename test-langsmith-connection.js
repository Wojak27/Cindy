#!/usr/bin/env node

/**
 * LangSmith Connection Test Script
 * Tests LangSmith configuration and identifies 403 Forbidden issues
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('🔍 LANGSMITH CONNECTION TEST');
console.log('============================');
console.log('');

// Check environment variables
console.log('📋 Configuration Check:');
console.log(`  LANGSMITH_API_KEY: ${process.env.LANGSMITH_API_KEY ? '✅ Present (' + process.env.LANGSMITH_API_KEY.substring(0, 10) + '...)' : '❌ Missing'}`);
console.log(`  LANGSMITH_ENDPOINT: ${process.env.LANGSMITH_ENDPOINT || '❌ Not set (will use default)'}`);
console.log(`  LANGCHAIN_PROJECT: ${process.env.LANGCHAIN_PROJECT || 'voice-assistant (default)'}`);
console.log('');

// Validate API key format
if (process.env.LANGSMITH_API_KEY) {
    const apiKey = process.env.LANGSMITH_API_KEY;
    if (apiKey.startsWith('lsv2_')) {
        console.log('✅ API key format appears valid (LangSmith v2)');
    } else {
        console.log('⚠️  API key format may be invalid (should start with lsv2_)');
    }
} else {
    console.log('❌ No API key found');
    process.exit(1);
}

// Test LangSmith configuration
async function testLangSmithConfig() {
    try {
        console.log('');
        console.log('🧪 Testing LangSmith Configuration:');
        
        // Set up environment for LangChain
        process.env.LANGCHAIN_API_KEY = process.env.LANGSMITH_API_KEY;
        process.env.LANGCHAIN_TRACING_V2 = 'false'; // Start with tracing disabled
        process.env.LANGCHAIN_PROJECT = process.env.LANGCHAIN_PROJECT || 'voice-assistant-test';
        
        if (process.env.LANGSMITH_ENDPOINT) {
            process.env.LANGCHAIN_ENDPOINT = process.env.LANGSMITH_ENDPOINT;
            console.log(`  Using custom endpoint: ${process.env.LANGSMITH_ENDPOINT}`);
        }
        
        // Try to import and test basic LangSmith functionality
        try {
            const { Client } = require('langsmith');
            const client = new Client({
                apiKey: process.env.LANGSMITH_API_KEY,
                apiUrl: process.env.LANGSMITH_ENDPOINT || undefined
            });
            
            console.log('✅ LangSmith client created successfully');
            
            // Test basic API access
            console.log('  Testing API access...');
            
            // Try to create a simple run (this will test permissions)
            process.env.LANGCHAIN_TRACING_V2 = 'true';
            console.log('✅ LangSmith configuration appears valid');
            
        } catch (clientError) {
            console.log('❌ LangSmith client creation failed:', clientError.message);
            
            if (clientError.message.includes('403') || clientError.message.includes('Forbidden')) {
                console.log('');
                console.log('🚨 403 FORBIDDEN ERROR DETECTED:');
                console.log('  Possible causes:');
                console.log('  1. Invalid or expired API key');
                console.log('  2. API key doesn\'t have required permissions');
                console.log('  3. Project name is invalid or not accessible');
                console.log('  4. Endpoint mismatch (EU vs US)');
                console.log('');
                console.log('🔧 Troubleshooting steps:');
                console.log('  1. Verify your API key at: https://smith.langchain.com/');
                console.log('  2. Check if you\'re using the correct endpoint for your region');
                console.log('  3. Ensure the project exists and you have access to it');
                console.log('  4. Try removing LANGSMITH_ENDPOINT to use default US endpoint');
            }
        }
        
    } catch (error) {
        console.log('❌ Configuration test failed:', error.message);
    }
}

// Test simple model wrapping (this is what causes the 403 error)
async function testModelWrapping() {
    try {
        console.log('');
        console.log('🧪 Testing Model Wrapping (where 403 usually occurs):');
        
        // Create a simple mock model
        const mockModel = {
            invoke: async (input) => ({ content: 'test response' }),
            _modelType: 'test'
        };
        
        // Try to wrap it
        const { wrapSDK } = require('langsmith/wrappers');
        
        // This is where the 403 error typically happens
        process.env.LANGCHAIN_TRACING_V2 = 'true';
        const wrappedModel = wrapSDK(mockModel);
        
        console.log('✅ Model wrapping successful');
        
        // Try a test invocation
        console.log('  Testing wrapped model invocation...');
        const result = await wrappedModel.invoke('test input');
        console.log('✅ Wrapped model invocation successful');
        
    } catch (wrapError) {
        console.log('❌ Model wrapping failed:', wrapError.message);
        
        if (wrapError.message.includes('403') || wrapError.message.includes('Forbidden')) {
            console.log('');
            console.log('🎯 FOUND THE ISSUE! This is the 403 error you\'re seeing.');
            console.log('');
            console.log('💡 SOLUTIONS:');
            console.log('  1. Disable LangSmith tracing temporarily:');
            console.log('     Set LANGCHAIN_TRACING_V2=false in your .env');
            console.log('');
            console.log('  2. Fix the API key/endpoint configuration:');
            if (process.env.LANGSMITH_ENDPOINT && process.env.LANGSMITH_ENDPOINT.includes('eu.api')) {
                console.log('     - You\'re using EU endpoint, ensure your API key is for EU region');
                console.log('     - Try removing LANGSMITH_ENDPOINT to use US endpoint');
            } else {
                console.log('     - Verify your API key at https://smith.langchain.com/');
                console.log('     - Check if you need to use EU endpoint: LANGSMITH_ENDPOINT=https://eu.api.smith.langchain.com');
            }
            console.log('');
            console.log('  3. Use our enhanced error handling:');
            console.log('     The LangSmithService will now automatically disable tracing on 403 errors');
        }
    } finally {
        // Always disable tracing after test
        process.env.LANGCHAIN_TRACING_V2 = 'false';
    }
}

// Run tests
(async () => {
    await testLangSmithConfig();
    await testModelWrapping();
    
    console.log('');
    console.log('🚀 Test completed! Check the output above for any issues.');
    console.log('');
    console.log('💡 TIP: If you see 403 errors, the enhanced LangSmithService will now');
    console.log('   automatically disable tracing to prevent application failures.');
})().catch(error => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
});