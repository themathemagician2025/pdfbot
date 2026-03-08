# WhatsApp Socket Singleton Fix

## Problem
The bot was experiencing "session replaced" conflicts due to multiple WhatsApp socket connections being created simultaneously. This happened because:

1. **Multiple socket initializations** - Direct Baileys `makeWASocket` calls in multiple places
2. **File watcher triggering reloads** - Hot reload creating duplicate sockets
3. **Repeated event handler registration** - Same handlers registered multiple times
4. **No connection guard** - No singleton pattern to prevent duplicate connections

## Solution Implemented

### 1. Created Singleton Socket Module (`server/lib/wa.js`)
- **Single source of truth** for WhatsApp socket connection
- **Connection guard** prevents multiple simultaneous connection attempts
- **Proper reconnection handling** with exponential backoff
- **Conflict detection** - Stops reconnecting when session is replaced (440 error)
- **Smart error handling** for different disconnect reasons:
  - `440` (conflict) → Stop and warn user
  - `515` (restart after pairing) → Let Baileys reconnect
  - Logout → Inform user to delete session
  - Other errors → Retry with 2-second delay

### 2. Refactored Main Index (`killerC/index.js`)
- **Replaced direct socket creation** with `getSocket()` singleton
- **One-time event handler registration** using `messageHandlersRegistered` flag
- **Removed duplicate reconnection logic** (now handled in singleton)
- **Disabled file watcher** to prevent duplicate socket creation
- **Updated shutdown handlers** to properly close socket

### 3. Configured Nodemon (`killerC/nodemon.json`)
- **Ignores session/auth/data folders** to prevent restart loops
- **500ms delay** before restart
- **Only watches code files** (`.js`, `.json`)
- Prevents QR regeneration loops

### 4. Updated Package Scripts
- Added `npm run dev` using nodemon with proper ignores

## How to Use

### Initial Setup
1. **Set auth directory** (optional):
   ```cmd
   set WA_SESSION_DIR=C:\Users\clive\pdfbot\auth\whatsapp
   ```

2. **Ensure only one instance running**:
   ```cmd
   taskkill /F /IM node.exe
   ```

3. **Start the bot**:
   ```cmd
   # Production (no auto-reload)
   npm start

   # Development (with nodemon, ignores auth/data)
   npm run dev
   ```

### If You Get "Session Replaced" Error

1. **Check for other WhatsApp connections**:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Remove any duplicate or unknown devices

2. **Kill all Node processes**:
   ```cmd
   taskkill /F /IM node.exe
   ```

3. **Verify no other bot process is running**:
   - Check Task Manager for node.exe
   - Close other terminals running the bot

4. **Restart cleanly**:
   ```cmd
   cd C:\Users\clive\pdfbot
   npm start
   ```

### Fresh QR Pairing

If you need to re-pair from scratch:

1. **Stop the bot**:
   ```cmd
   taskkill /F /IM node.exe
   ```

2. **Delete session folder**:
   ```cmd
   Remove-Item -Recurse -Force killerC\session
   ```

3. **Start and scan QR**:
   ```cmd
   npm start
   ```

## Technical Details

### Singleton Pattern
The `wa.js` module ensures only one socket exists:
```javascript
let sockSingleton = null;
let connecting = false;

async function getSocket() {
  if (sockSingleton) return sockSingleton;
  if (connecting) {
    // Wait for ongoing connection
    return new Promise(...);
  }
  // Create socket once
  sockSingleton = makeWASocket(...);
  return sockSingleton;
}
```

### Connection Guard
Prevents duplicate connections during initialization:
```javascript
if (!messageHandlersRegistered) {
  // Register all handlers once
  XeonBotInc.ev.on('messages.upsert', ...);
  XeonBotInc.ev.on('contacts.update', ...);
  messageHandlersRegistered = true;
}
```

### Conflict Handling
Stops reconnection when another client is detected:
```javascript
if (reason === 440 || reason === DisconnectReason.connectionReplaced) {
  console.warn('Session replaced. Not reconnecting.');
  sockSingleton = null;
  connecting = false;
  return; // Don't reconnect
}
```

## Environment Variables

```bash
# Optional: Custom session directory
WA_SESSION_DIR=./auth/whatsapp

# Optional: Enable file watcher (NOT RECOMMENDED)
ENABLE_FILE_WATCHER=false

# Log level
LOG_LEVEL=info

# Node environment
NODE_ENV=development
```

## Troubleshooting

### "Multiple QR codes generated"
- **Cause**: Multiple bot processes running
- **Fix**: Kill all node processes, start only one instance

### "Connection keeps dropping"
- **Cause**: Network issues or WhatsApp server lag
- **Fix**: Singleton handles reconnection automatically with backoff

### "Auth state being recreated"
- **Cause**: Different working directories resolving to different auth paths
- **Fix**: Always run from same directory or set `WA_SESSION_DIR`

### "File watcher spinning up duplicate sockets"
- **Cause**: Hot reload creating new socket before closing old one
- **Fix**: Use `npm run dev` with nodemon ignores, or disable file watcher

## Best Practices

1. ✅ **Use singleton pattern** - Always call `getSocket()`, never create new socket
2. ✅ **Run one instance** - Check for existing processes before starting
3. ✅ **Stable auth path** - Use consistent session directory
4. ✅ **Use nodemon properly** - Ignore auth/data folders
5. ✅ **Monitor linked devices** - Remove unknown devices from WhatsApp
6. ❌ **Don't create multiple sockets** - Use the singleton
7. ❌ **Don't ignore "replaced" errors** - Stop and fix the conflict
8. ❌ **Don't use file watcher** - Use nodemon instead

## Changes Made

### Files Created
- `killerC/server/lib/wa.js` - Singleton socket module
- `killerC/nodemon.json` - Nodemon configuration
- `WHATSAPP_SOCKET_FIX.md` - This documentation

### Files Modified
- `killerC/index.js` - Uses singleton, removed duplicate logic
- `killerC/package.json` - Added dev script
- `killerC/services/PaymentVerificationService.js` - Fixed SubscriptionService import
- `killerC/handlers/messageHandler.js` - Fixed util imports

## Verification

To verify the fix is working:

1. Start the bot: `npm start`
2. Check logs for:
   - ✅ "🔌 Connecting to WhatsApp (singleton)..."
   - ✅ "✅ Message handlers registered (once)"
   - ✅ "✅ WhatsApp connected successfully!"
3. Should NOT see:
   - ❌ Multiple "Initializing..." messages
   - ❌ Repeated QR code generation
   - ❌ "Session replaced" loops

## Support

If issues persist:
1. Check all linked devices in WhatsApp
2. Verify only one node.exe process in Task Manager
3. Try fresh pairing (delete session folder)
4. Check console logs for specific error codes
