# VSCode Debugging Setup for Cindy

## ✅ Fixed Issues

1. **Source Maps Configuration**
   - Added `devtool: 'inline-source-map'` to webpack config for development
   - Configured ts-loader with proper source map options
   - Added path aliases resolution to webpack

2. **Launch Configurations**
   - Created multiple debug configurations for different scenarios
   - Added proper ts-node registration for TypeScript debugging
   - Fixed source map path overrides

## 🚀 How to Debug

### Option 1: Debug Main Process with ts-node (Recommended)
1. Open any TypeScript file in `src/main/` (e.g., `LangChainToolExecutorService.ts`)
2. Set breakpoints by clicking in the gutter (left of line numbers)
3. Press `F5` or go to Run → Start Debugging
4. Select **"Debug Main Process (ts-node)"**
5. Your breakpoints should now work! 🎉

### Option 2: Debug with Dev Server
1. Set your breakpoints in TypeScript files
2. Select **"Debug Dev Server"** configuration
3. This will run `npm run dev:main` with debugging enabled
4. Breakpoints will work with automatic child process attachment

### Option 3: Debug Main + Renderer
1. Use the **"Main + Renderer (ts-node)"** compound configuration
2. This debugs both the main process and renderer process simultaneously

## 🔧 Troubleshooting

If breakpoints still show as "unverified" (gray):

1. **Restart VSCode** - Sometimes VSCode needs a restart to pick up config changes

2. **Check TypeScript compilation**:
   ```bash
   npx tsc --noEmit
   ```

3. **Verify source maps are generated**:
   - Run the app in debug mode
   - Check if `dist/main/main.js.map` exists

4. **Clear build cache**:
   ```bash
   rm -rf dist/
   npm run build:main
   ```

5. **Check debug console output**:
   - Look for any path mapping errors
   - Verify that source files are being found

## 📝 Key Configuration Files

- `.vscode/launch.json` - Debug configurations
- `.vscode/tasks.json` - Build tasks for pre-launch
- `.webpack/main.js` - Webpack config with source maps
- `tsconfig.json` - TypeScript source map settings

## 🎯 Tips

- Use **"Debug Main Process (ts-node)"** for the best TypeScript debugging experience
- The debugger will stop at breakpoints in:
  - Services (`src/main/services/`)
  - Main process files (`src/main/`)
  - Shared utilities (`src/shared/`)
- Console output appears in the Debug Console panel
- Variables can be inspected in the Variables panel while paused

## 🐛 Common Issues

**Issue**: "Breakpoint set but not yet bound"
**Solution**: Make sure you're using the ts-node configuration and the file has been loaded

**Issue**: Breakpoints hit in JS files but not TS files
**Solution**: Check source map configuration and use inline-source-map

**Issue**: "Could not read source map"
**Solution**: Rebuild with `npm run build:main` or use ts-node configuration