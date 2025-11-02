const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MathemagicianService {
  constructor() {
    this.personality = {
      name: 'The Mathemagician',
      title: 'Keeper of Digital Tomes',
      traits: [
        'whimsical',
        'knowledgeable',
        'slightly eccentric',
        'fond of mathematical puns',
        'helpful but mysterious'
      ],
      greetings: [
        "*adjusts spectacles* Ah, a seeker of knowledge! How may I assist you today? 🎩✨",
        "*waves wand* Abracadabra! Welcome to the digital library. What wisdom do you seek? 📚",
        "*flourishes cape* The Mathemagician at your service! What equation of knowledge can I help you solve today?",
        "*conjures a small flame* Greetings! The tomes whisper of your arrival. How may I enlighten you?"
      ],
      farewells: [
        "Until our paths cross again, may your variables always be defined and your code never buggy! ✨",
        "The library's doors are always open. Return when you seek more mathematical marvels! 🎩",
        "*vanishes in a puff of equations* Poof! Remember, the answer is always 42!"
      ],
      paymentPrompts: [
        "*consults the ancient payment scrolls* To unlock the full library, we require a small tribute of $7 for weekly access. Or, if you prefer, we offer a monthly unlimited plan for greater savings! 💰",
        "*waves hand mysteriously* The knowledge you seek has a price - a mere $7 for a week of unlimited access! Or choose our monthly plan for an even better value. How would you like to proceed?",
        "*flips through a ledger* Ah, I see your free trial has expired! For just $7, I can extend your access to our entire collection for a full week. Or, for the truly dedicated, our monthly plan offers even greater value!"
      ],
      paymentInstructions: {
        ecocash: "To pay via EcoCash:\n1. +263772804180. Select 'Pay a Bill'\n3. Enter Biller Code: 12345\n4. Enter Reference: YOURPHONE\n5. Enter Amount: $7\n6. Enter your PIN to confirm\n\nOnce done, please send us a screenshot of your payment confirmation!",
        upi: "To pay via UPI:\n1. Open your UPI app\n2. Send $7 to UPI ID: mathemagician@upi\n3. In the note, mention: YOURPHONE\n\nPlease send us the transaction ID or screenshot after payment!"
      },
      paymentReceived: [
        "*examines the payment runes* Ah, I see your payment! Let me verify the magical transaction... ✨",
        "*casts verification spell* One moment while I confirm your payment in the ethereal ledger...",
        "*consults the financial oracle* Verifying your generous contribution to our library's upkeep..."
      ],
      paymentVerified: [
        "*trumpet fanfare* Payment verified! The library's doors swing open before you! What knowledge shall we explore first? 🎩✨",
        "*confetti explosion* Access granted! Your subscription is now active. The realm of knowledge awaits your command!",
        "*ancient tomes float by* Your payment has been verified! You now have full access to our collection. What would you like to read?"
      ],
      paymentFailed: [
        "*crystal ball fogs up* Hmm, I'm having trouble verifying your payment. Could you send the payment proof again?",
        "*scratches head* That's odd, the payment verification spell failed. Please check the details and try again.",
        "*frowns at ledger* I don't see that transaction in our records. Could there have been a mistake with the payment?"
      ],
      trialActivated: [
        "*waves wand* Your 1-hour trial has begun! The library is yours to explore. Return before time runs out to continue your journey!",
        "*sands of time flow* Your trial period starts now! You have one hour of unlimited access. What would you like to learn?",
        "*opens grand doors* Welcome to your trial! The clock is ticking - make the most of your hour with our collection!"
      ],
      trialExpired: [
        "*sad trombone* Your trial has ended, but don't be a square root! For just $7, you can continue your journey for a full week!",
        "*clock chimes* Time's up! But fear not - a small contribution of $7 will keep the knowledge flowing!",
        "*dusts off hourglass* Your trial has run its course. Would you like to subscribe and continue your studies?"
      ]
    };
  }

  getRandomResponse(type) {
    const responses = this.personality[type] || [];
    return responses.length > 0 
      ? responses[Math.floor(Math.random() * responses.length)]
      : "*adjusts spectacles* Hmm, something seems to be missing here...";
  }

  async formatBookResponse(book, action = 'found') {
    const actions = {
      found: 'I found this in our collection:',
      added: 'I\'ve added this new tome to our collection:',
      recommended: 'Based on your interests, I recommend:'
    };

    return `📚 *${book.title}* by ${book.author || 'Unknown Author'}

${actions[action] || 'Book details:'}
${book.description ? `\n${book.description}\n` : ''}
${book.category ? `📂 Category: ${book.category}\n` : ''}${book.tags?.length ? `🏷️ Tags: ${book.tags.join(', ')}\n` : ''}\nTo download, type: /get ${book.id}`;
  }

  async formatSubscriptionStatus(user) {
    if (!user.subscription) {
      return this.getRandomResponse('trialExpired');
    }

    const now = new Date();
    const expiry = new Date(user.subscription.expires_at);
    const timeLeft = Math.ceil((expiry - now) / (1000 * 60 * 60)); // Hours left

    if (timeLeft <= 0) {
      return this.getRandomResponse('trialExpired');
    }

    const days = Math.floor(timeLeft / 24);
    const hours = timeLeft % 24;

    let timeLeftText = '';
    if (days > 0) {
      timeLeftText += `${days} day${days > 1 ? 's' : ''} `;
    }
    if (hours > 0 || days === 0) {
      timeLeftText += `${hours} hour${hours !== 1 ? 's' : ''}`;
    }

    return `✨ *Subscription Status* ✨\n\n` +
           `🔑 *Plan:* ${user.subscription.plan_type.charAt(0).toUpperCase() + user.subscription.plan_type.slice(1)}\n` +
           `⏳ *Time Remaining:* ${timeLeftText}\n` +
           `📅 *Renews:* ${expiry.toLocaleDateString()}\n\n` +
           (user.subscription.plan_type === 'trial' 
             ? this.getRandomResponse('trialExpired')
             : "Thank you for supporting the library! 📚");
  }

  async formatPaymentInstructions(paymentMethod = 'ecocash') {
    return `💰 *Payment Instructions* 💰\n\n` +
           this.getRandomResponse('paymentPrompts') + '\n\n' +
           this.personality.paymentInstructions[paymentMethod.toLowerCase()] || 
           'Please contact support for payment assistance.';
  }

  async formatSearchResults(books, query) {
    if (books.length === 0) {
      return `*adjusts spectacles* Hmm, I couldn't find any books matching "${query}". Would you like to try different keywords?`;
    }

    let response = `🔍 *Search Results for "${query}"*\n\n`;
    
    books.forEach((book, index) => {
      response += `${index + 1}. *${book.title}* - ${book.author || 'Unknown Author'}`;
      if (book.category) response += ` (${book.category})`;
      response += `\n   Type: /get${book.id} to download\n\n`;
    });

    if (books.length < 5) {
      response += `\nTip: Try a broader search or check back later for more titles!`;
    }

    return response;
  }
}

module.exports = new MathemagicianService();
