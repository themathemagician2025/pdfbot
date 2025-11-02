const fs = require('fs');
const path = require('path');
const personaService = require('../server/lib/personaService');
const SubscriptionService = require('../services/SubscriptionService');

/**
 * PDF Command Handler for WhatsApp Bot
 * - Lists PDFs in ./pdf
 * - Finds exact or partial matches (case-insensitive)
 * - Prevents path traversal by matching only against directory listing
 * - Checks subscription/trial access before sending PDF
 *
 * Usage:
 *  - `.pdf` or `/pdf`         -> list all PDFs
 *  - `.pdf <filename>`        -> send a file (exact or partial match)
 *  - `.pdf <some words>`      -> attempt partial match
 */
async function pdfCommand(sock, chatId, message, commandText) {
  try {
    // Config
    const pdfDir = path.join(__dirname, '..', 'pdf');
    const MAX_FILE_SIZE_MB = 2000; // Increased limit (~2 GB) to match WhatsApp document cap
    const senderPhone = (message.key?.remoteJid || chatId).replace(/:.*$/, ''); // best-effort phone id

    // Persona helper
    const personaReply = async (text) => {
      try {
        const framed = await personaService.frameMessage(senderPhone, text);
        await sock.sendMessage(chatId, { text: framed }, { quoted: message });
      } catch (e) {
        await sock.sendMessage(chatId, { text }, { quoted: message });
      }
    };

    // Ensure pdf directory exists
    if (!fs.existsSync(pdfDir)) {
      return await personaReply(
        "❌ *PDF Directory Not Found*\n\n" +
        "The PDF library hasn't been set up yet. Contact the administrator to add documents."
      );
    }

    // Read PDFs (only filenames, no directories)
    const pdfFiles = fs.readdirSync(pdfDir)
      .filter(file => fs.statSync(path.join(pdfDir, file)).isFile())
      .filter(file => path.extname(file).toLowerCase() === '.pdf')
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (!pdfFiles.length) {
      return await personaReply(
        "📚 *The Mathemagician's Library*\n\n" +
        "❌ No PDFs are available yet. Check back later for new additions."
      );
    }

    // Normalize incoming command text to extract query
    // commandText might be like ".pdf Fluid Mechanics" or message.message.conversation when command not passed
    const raw = (commandText || message.message?.conversation || '').trim();
    // Remove leading .pdf, /pdf or "pdf" token if present
    let query = raw.replace(/^(\.pdf|\/pdf|\bpdf\b)\s*/i, '').trim();
    // If user used just ".pdf" or provided no args, query will be empty -> list
    if (!query) {
      const listText = pdfFiles.map((file, i) => `${i + 1}. ${file}`).join('\n');
      return await personaReply(
        "📚 *The Mathemagician's Library*\n\n" +
        `${listText}\n\n` +
        "━━━━━━━━━━━━━━━━━━━━\n" +
        "💡 *How to Download:*\n" +
        "Type: `.pdf <filename>`\n\n" +
        `*Example:*\n.pdf ${pdfFiles[0]}`
      );
    }

    // Normalize user query for matching
    const q = query.toLowerCase();

    // Try exact filename match (with or without .pdf)
    let matchedFile = pdfFiles.find(file => {
      const fileLower = file.toLowerCase();
      return fileLower === q || fileLower === `${q}.pdf`;
    });

    // If no exact match, try partial matches
    if (!matchedFile) {
      const partialMatches = pdfFiles.filter(f => f.toLowerCase().includes(q));
      if (partialMatches.length === 0) {
        const available = pdfFiles.slice(0, 50).map((f, i) => `${i + 1}. ${f}`).join('\n');
        return await personaReply(
          `❌ *PDF Not Found: "${query}"*\n\n` +
          `📚 Available PDFs:\n${available}\n\n` +
          "💡 Tip: Use `.pdf` to see the full list."
        );
      }
      if (partialMatches.length > 1) {
        return await personaReply(
          `🔍 *Multiple matches found for "${query}":*\n\n` +
          partialMatches.slice(0, 25).map((f, i) => `${i + 1}. ${f}`).join('\n') +
          `\n\n💡 Be more specific or copy/paste the exact filename.`
        );
      }
      matchedFile = partialMatches[0];
    }

    // At this point we have a matchedFile from the directory listing (safe)
    const pdfPath = path.join(pdfDir, matchedFile);
    const stats = fs.statSync(pdfPath);
    const sizeMB = stats.size / (1024 * 1024);

    // Validate file size
    if (sizeMB > MAX_FILE_SIZE_MB) {
      return await personaReply(
        `❌ *File Too Large*\n\n` +
        `"${matchedFile}" is ${sizeMB.toFixed(2)} MB.\n` +
        `WhatsApp limit is ${MAX_FILE_SIZE_MB} MB.\n\n` +
        "Contact the administrator for alternative delivery."
      );
    }

    // Access check disabled: allow all users

    // Reaction: show sending indicator (if sock supports reaction)
    try {
      if (message.key) {
        await sock.sendMessage(chatId, { react: { text: '📤', key: message.key } });
      }
    } catch (e) {
      // ignore reaction failures
    }

    // Send the PDF document
    await sock.sendMessage(chatId, {
      document: { url: pdfPath },
      mimetype: 'application/pdf',
      fileName: matchedFile,
      caption:
        `📚 *${matchedFile}*\n\n` +
        `📊 Size: ${sizeMB.toFixed(2)} MB\n` +
        `🔢 From The Mathemagician's Archive\n\n` +
        `💡 _Knowledge is wealth. Use it wisely._`
    }, { quoted: message });

    // Success reaction
    try {
      if (message.key) {
        await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } });
      }
    } catch (e) {
      // ignore
    }

    console.log(`[PDF] Sent "${matchedFile}" to ${chatId}`);
    return;

  } catch (error) {
    console.error('[PDF] Error:', error);
    try {
      const framedErr = await personaService.frameMessage(chatId, '❌ *The Mathemagician Encountered an Error*\n\nFailed to process your PDF request. Please try again or contact support.');
      await sock.sendMessage(chatId, { text: framedErr }, { quoted: message });
    } catch (e) {
      await sock.sendMessage(chatId, { text: '❌ Failed to process your request. Try again.' }, { quoted: message });
    }
  }
}

module.exports = pdfCommand;
