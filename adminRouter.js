const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');

// Secret key for JWT - should be in environment variables in production
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const MFA_TOKEN = process.env.ADMIN_MFA_TOKEN || 'mathemagician-mfa-2025';

// In-memory store for verifications (replace with database in production)
let verifications = [];
let manualSubscribers = new Set();

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    try {
        const verified = jwt.verify(token, JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ error: 'Invalid token.' });
    }
};

// Middleware to verify MFA token for sensitive operations
const verifyMFA = (req, res, next) => {
    const mfaToken = req.headers['x-mfa-token'];
    if (!mfaToken || mfaToken !== MFA_TOKEN) {
        return res.status(401).json({ error: 'Invalid MFA token.' });
    }
    next();
};

// Admin login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    // In production, verify against database
    if (username === 'admin' && password === 'magicode2025') {
        const token = jwt.sign({ username }, JWT_SECRET);
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Invalid credentials.' });
    }
});

// Get pending verifications
router.get('/verifications/pending', verifyToken, async (req, res) => {
    try {
        res.json(verifications.filter(v => v.status === 'pending'));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch pending verifications.' });
    }
});

// Verify a payment proof
router.post('/verifications/:id/verify', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const verification = verifications.find(v => v.id === id);
        if (!verification) {
            return res.status(404).json({ error: 'Verification not found.' });
        }

        verification.status = 'verified';
        verification.verifiedAt = new Date().toISOString();
        verification.verifiedBy = req.user.username;
        verification.reason = reason;

        // Log the action
        await logAudit({
            action: 'verify',
            target: id,
            actor: req.user.username,
            reason
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to verify.' });
    }
});

// Reject a payment proof
router.post('/verifications/:id/reject', verifyToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        
        const verification = verifications.find(v => v.id === id);
        if (!verification) {
            return res.status(404).json({ error: 'Verification not found.' });
        }

        verification.status = 'rejected';
        verification.rejectedAt = new Date().toISOString();
        verification.rejectedBy = req.user.username;
        verification.reason = reason;

        // Log the action
        await logAudit({
            action: 'reject',
            target: id,
            actor: req.user.username,
            reason
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reject.' });
    }
});

// Add manual subscriber
router.post('/manual/add', verifyToken, async (req, res) => {
    try {
        const { phone, sticky, reason } = req.body;
        
        if (sticky) {
            // Check MFA token for sticky operations
            const mfaToken = req.headers['x-mfa-token'];
            if (!mfaToken || mfaToken !== MFA_TOKEN) {
                return res.status(401).json({ error: 'Invalid MFA token for sticky operation.' });
            }
        }

        manualSubscribers.add(phone);

        // Log the action
        await logAudit({
            action: 'manual_add',
            target: phone,
            actor: req.user.username,
            reason,
            sticky
        });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to add manual subscriber.' });
    }
});

// Reload manual store
router.post('/manual/reload', verifyToken, verifyMFA, async (req, res) => {
    try {
        // In production, reload from persistent storage
        res.json({ count: manualSubscribers.size });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reload manual store.' });
    }
});

// Get audit logs
router.get('/logs', verifyToken, async (req, res) => {
    try {
        const logs = await fs.readFile(path.join(__dirname, '../data/auditLogs.json'), 'utf8');
        res.json(JSON.parse(logs));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch audit logs.' });
    }
});

// Helper function to log audit events
async function logAudit(entry) {
    try {
        const logPath = path.join(__dirname, '../data/auditLogs.json');
        let logs = [];
        
        try {
            const existingLogs = await fs.readFile(logPath, 'utf8');
            logs = JSON.parse(existingLogs);
        } catch (err) {
            // File doesn't exist or is invalid, start with empty array
        }

        logs.push({
            ...entry,
            created_at: new Date().toISOString()
        });

        // Keep only last 1000 entries
        if (logs.length > 1000) {
            logs = logs.slice(-1000);
        }

        await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
    } catch (err) {
        console.error('Failed to write audit log:', err);
    }
}

module.exports = router;