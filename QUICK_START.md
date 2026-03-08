# Quick Start - Fixed WhatsApp Connection

## ✅ What Was Fixed

1. **Created singleton socket** (`killerC/server/lib/wa.js`) - ensures only ONE WhatsApp connection
2. **Refactored index.js** - uses singleton instead of creating multiple sockets
3. **Configured nodemon** - ignores auth/data folders to prevent restart loops
4. **Fixed imports** - corrected service and utility import paths

## 🚀 How to Run

### Kill any existing processes first
```cmd
taskkill /F /IM node.exe
```

### Start the bot
```cmd
cd C:\Users\clive\pdfbot
npm start
```

### Or use development mode with auto-reload
```cmd
cd C:\Users\clive\pdfbot\killerC
npm run dev
```

## ⚠️ Important Notes

### If you see "Session replaced" error:
1. Check WhatsApp linked devices (Settings → Linked Devices)
2. Remove any duplicate/unknown devices
3. Kill all node processes: `taskkill /F /IM node.exe`
4. Restart bot

### To re-pair from scratch:
```cmd
# Stop bot
taskkill /F /IM node.exe

# Delete session
Remove-Item -Recurse -Force killerC\session

# Start fresh
npm start
```

## 📋 What to Expect

When starting correctly, you'll see:
```
🔌 Connecting to WhatsApp (singleton)...
✅ Message handlers registered (once)
📱 QR Code generated. Scan with WhatsApp.
✅ WhatsApp connected successfully!
```

You should NOT see:
- Multiple "Initializing..." messages
- Repeated QR generation
- "Session replaced" loops

## 🔧 Key Changes

- `killerC/server/lib/wa.js` - New singleton socket module
- `killerC/index.js` - Uses getSocket() instead of makeWASocket
- `killerC/nodemon.json` - Ignores session/auth/data folders
- `killerC/package.json` - Added "dev" script

See `WHATSAPP_SOCKET_FIX.md` for full technical details.
