const express = require('express');
const path = require('path');
const cors = require('cors');
const adminRouter = require('./adminRouter');

// Create Express server for admin panel
function setupAdminServer(port = 3000) {
    const app = express();

    // Middleware
    app.use(cors());
    app.use(express.json());
    app.use(express.static(__dirname));

    // Admin routes
    app.use('/admin', adminRouter);

    // Serve admin panel
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'index.html'));
    });

    // Error handling middleware
    app.use((err, req, res, next) => {
        console.error(err.stack);
        res.status(500).json({ error: 'Something went wrong!' });
    });

    // Start server with simple port retry on EADDRINUSE
    const start = (p, attemptsLeft = 5) => {
        const server = app.listen(p, () => {
            console.log(`Admin panel running at http://localhost:${p}`);
        });
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
                const nextPort = p + 1;
                console.warn(`Port ${p} in use. Trying ${nextPort}...`);
                start(nextPort, attemptsLeft - 1);
            } else {
                throw err;
            }
        });
        return server;
    };

    start(Number(port) || 3000);

    return app;
}

module.exports = { setupAdminServer };