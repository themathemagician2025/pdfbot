const logger = require('../lib/logger');

module.exports = {
    name: 'donate',
    description: 'Show donation information and instructions',
    aliases: ['donation', 'support'],
    async execute(sock, m, args) {
        try {
            const donateMessage = `💝 *DONATE TO SUPPORT THE MATHEMAGICIAN* 💝

Your generous donations help keep this service running and support continuous improvements to the bot and PDF library.

*📞 Donation Details:*
• EcoCash: *+263772804180---Name: Beauty Dziwomore*

*How to Donate:*
1. Send your donation via EcoCash to the number above
2. Take a screenshot of the transaction
3. Reply to this message with the screenshot and include these details:
   - TXN ID: [Transaction ID]
   - Amount: [Amount Donated]
   - Payer Phone: [Your Phone Number]

*🎁 Donation Rewards:*
• $1+ - Our eternal gratitude!
• $5+ - 1 month of premium access
• $10+ - 3 months of premium access
• $20+ - 6 months of premium access
• $50+ - 1 year of premium access + special role
• $100+ - Lifetime premium access + VIP status

*Premium benefits include:*
• Full access to all PDFs
• Priority support
• Early access to new features
• Ad-free experience
• And more!

Thank you for your support! 🙏`;

            await sock.sendMessage(m.chat, { 
                text: donateMessage,
                quoted: m
            });

        } catch (error) {
            logger.error('Error in donate command:', error);
            await sock.sendMessage(m.chat, {
                text: '❌ An error occurred while processing your request. Please try again later.'
            });
        }
    }
};
