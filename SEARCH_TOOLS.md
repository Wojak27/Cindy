# Web Search Tools Configuration

Cindy supports multiple web search providers with automatic fallback capabilities.

## Available Search Tools

### 1. DuckDuckGo Search (Default)
- **Hashtag**: `#web`
- **API Key**: Not required (free)
- **Status**: Active by default
- **Best for**: General web searches
- **Rate Limiting**: Yes, with automatic retry and fallback

### 2. Brave Search
- **Hashtag**: `#brave`
- **API Key**: Not required (free public API)
- **Status**: Active by default
- **Best for**: Privacy-focused searches
- **Rate Limiting**: Minimal

### 3. Tavily Search (Premium)
- **Hashtag**: `#tavily`
- **API Key**: Required (set `TAVILY_API_KEY` environment variable)
- **Status**: Active only with API key
- **Best for**: AI-optimized research and high-quality results
- **Rate Limiting**: Based on API plan

### 4. Wikipedia Search
- **Hashtag**: N/A (automatic for encyclopedic queries)
- **API Key**: Not required
- **Status**: Active by default
- **Best for**: Encyclopedic information

## Setup Instructions

### Tavily Search Setup
1. Sign up for a free API key at https://tavily.com
2. Set the environment variable:
   ```bash
   export TAVILY_API_KEY="your-api-key-here"
   ```
3. Restart the application
4. Use `#tavily your search query` to force Tavily search

## Search Fallback Chain

When using `#web` (default web search), the system automatically falls back through available providers:

1. **DuckDuckGo** → (if rate limited) →
2. **Tavily** (if API key set) → (if fails) →
3. **Brave Search** → (if fails) →
4. **Error message with helpful instructions**

## Usage Examples

```
# Default web search (uses DuckDuckGo with fallbacks)
#web latest AI news

# Force Brave Search
#brave quantum computing breakthroughs

# Use Tavily for high-quality research
#tavily peer-reviewed studies on climate change

# Multiple searches in one query
#web weather forecast #brave stock market today
```

## Rate Limiting Protection

- Automatic retry with exponential backoff (5s, 10s, 20s)
- Minimum delay between searches (3s for DuckDuckGo, 1s for Tavily)
- Automatic fallback to alternative providers
- Graceful error messages when all providers fail

## Troubleshooting

### "DDG detected an anomaly" Error
- The system will automatically retry and fall back to other providers
- Wait a few seconds between searches

### Tavily Not Working
- Check if `TAVILY_API_KEY` is set: `echo $TAVILY_API_KEY`
- Verify your API key is valid at https://tavily.com/dashboard
- Check your API usage limits

### All Searches Failing
- Check internet connection
- Wait 30 seconds and try again (rate limits reset)
- Use specific hashtags (#brave, #tavily) to bypass problematic providers