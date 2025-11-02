const UserService = require('../services/UserService');
const BookService = require('../services/BookService');
const PaymentVerificationService = require('../services/PaymentVerificationService');
const MathemagicianService = require('../services/MathemagicianService');
const { isImage, downloadMedia } = require('../utils/fileUtils');
const { extractPhoneFromMessage } = require('../utils/messageUtils');

class MessageHandler {
  constructor(whatsappClient) {
    this.client = whatsappClient;
    this.userStates = new Map(); // Track user conversation state
  }

  async handleIncomingMessage(message) {
    try {
      const phone = extractPhoneFromMessage(message);
      if (!phone) return;

      // Get or create user
      const user = await UserService.findOrCreateUser(phone);
      
      // Check user's current state
      const userState = this.userStates.get(phone) || { state: 'idle' };
      
      // Handle different message types
      if (message.hasMedia) {
        await this.handleMediaMessage(message, user, userState);
      } else {
        await this.handleTextMessage(message, user, userState);
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await this.sendMessage(message.from, "*adjusts spectacles* Oh dear, something went wrong! Please try again later.");
    }
  }

  async handleTextMessage(message, user, userState) {
    const text = message.body.trim().toLowerCase();
    const phone = extractPhoneFromMessage(message);
    
    // Check if user is in a payment flow
    if (userState.state === 'awaiting_payment') {
      if (text === 'ecocash' || text === 'upi') {
        await this.handlePaymentMethodSelected(message, user, text);
        return;
      }
      // Reset state if they send something else
      this.userStates.set(phone, { state: 'idle' });
    }

    // Check user access
    const access = await UserService.checkAccess(user.id);
    
    if (!access.hasAccess && access.reason === 'subscription_required') {
      await this.handlePaymentPrompt(message, user);
      return;
    }

    if (!access.hasAccess && access.reason === 'trial_available') {
      await this.handleTrialActivation(message, user);
      return;
    }

    // Handle commands
    if (text.startsWith('/')) {
      await this.handleCommand(message, user, text);
      return;
    }

    // Default: Search for books
    await this.handleBookSearch(message, user, text);
  }

  async handleMediaMessage(message, user, userState) {
    // Check if this is a payment screenshot
    if (userState.state === 'awaiting_payment_proof' && isImage(message)) {
      await this.handlePaymentScreenshot(message, user);
      return;
    }

    // Default response for unsolicited media
    await this.sendMessage(
      message.from,
      "*puzzled look* I see you've sent me a file. If this is a payment proof, please type 'pay' first to start the payment process."
    );
  }

  async handleCommand(message, user, command) {
    const [cmd, ...args] = command.substring(1).split(' ');
    const phone = extractPhoneFromMessage(message);

    switch (cmd) {
      case 'start':
        await this.handleStartCommand(message, user);
        break;
      case 'help':
        await this.handleHelpCommand(message);
        break;
      case 'search':
        await this.handleBookSearch(message, user, args.join(' '));
        break;
      case 'get':
        if (args[0]) {
          await this.handleGetBookCommand(message, user, args[0]);
        } else {
          await this.sendMessage(message.from, "Please specify a book ID. Example: /get 123");
        }
        break;
      case 'pay':
        await this.handlePaymentPrompt(message, user);
        break;
      case 'status':
        await this.handleStatusCommand(message, user);
        break;
      case 'categories':
        await this.handleCategoriesCommand(message);
        break;
      case 'recent':
        await this.handleRecentCommand(message);
        break;
      default:
        await this.sendMessage(
          message.from,
          "*adjusts spectacles* Hmm, I don't recognize that command. Type /help to see what I can do!"
        );
    }
  }

  async handleStartCommand(message, user) {
    const welcomeMessage = `✨ *Welcome to the Digital Library* ✨\n\n` +
      `I'm the Mathemagician, your guide to the world's knowledge! 🎩✨\n\n` +
      `🔍 Search for books with: /search [title or author]\n` +
      `📚 Browse categories: /categories\n` +
      `🆕 See recent additions: /recent\n` +
      `💳 Check your status: /status\n` +
      `\n${MathemagicianService.getRandomResponse('greetings')}`;
    
    await this.sendMessage(message.from, welcomeMessage);
    
    // Check if user needs to start trial
    const access = await UserService.checkAccess(user.id);
    if (access.reason === 'trial_available') {
      await this.handleTrialActivation(message, user);
    } else if (access.reason === 'subscription_required') {
      await this.handlePaymentPrompt(message, user);
    }
  }

  async handleTrialActivation(message, user) {
    try {
      await UserService.startTrial(user.id);
      const response = MathemagicianService.getRandomResponse('trialActivated');
      await this.sendMessage(message.from, response);
    } catch (error) {
      console.error('Error starting trial:', error);
      await this.sendMessage(
        message.from,
        "*frowns* Something went wrong activating your trial. Please try again later or contact support if the issue persists."
      );
    }
  }

  async handlePaymentPrompt(message, user) {
    const phone = extractPhoneFromMessage(message);
    this.userStates.set(phone, { state: 'awaiting_payment' });
    
    const response = `💰 *Subscription Plans* 💰\n\n` +
      `1️⃣ *Weekly Access* - $7\n` +
      `   • Full access to all books\n` +
      `   • Automatic renewal available\n\n` +
      `2️⃣ *Monthly Unlimited* - $20\n` +
      `   • Save over 25%\n` +
      `   • Full access to all books\n` +
      `   • Priority support\n\n` +
      `Please choose your payment method:\n` +
      `• Type 'ecocash' for EcoCash\n` +
      `• Type 'upi' for UPI`;
    
    await this.sendMessage(message.from, response);
  }

  async handlePaymentMethodSelected(message, user, method) {
    const phone = extractPhoneFromMessage(message);
    this.userStates.set(phone, { 
      state: 'awaiting_payment_proof',
      paymentMethod: method 
    });
    
    const instructions = await MathemagicianService.formatPaymentInstructions(method);
    await this.sendMessage(message.from, instructions);
  }

  async handlePaymentScreenshot(message, user) {
    try {
      const phone = extractPhoneFromMessage(message);
      const media = await message.downloadMedia();
      
      // Save the media temporarily (in production, you'd save to cloud storage)
      const filePath = await downloadMedia(media, 'payments');
      
      // Process payment verification
      const verification = await PaymentVerificationService.processScreenshot(
        user.id,
        filePath,
        message.from,
        'WhatsApp Web'
      );
      
      if (verification.autoCheckResult === 'approved') {
        await this.sendMessage(
          message.from,
          MathemagicianService.getRandomResponse('paymentVerified')
        );
      } else if (verification.autoCheckResult === 'rejected') {
        await this.sendMessage(
          message.from,
          `*frowns* I couldn't verify your payment: ${verification.rejection_reason}. Please try again or contact support.`
        );
      } else {
        await this.sendMessage(
          message.from,
          "*adjusts spectacles* Your payment is being reviewed. We'll notify you once it's approved!"
        );
      }
      
      // Reset user state
      this.userStates.set(phone, { state: 'idle' });
      
    } catch (error) {
      console.error('Error processing payment screenshot:', error);
      await this.sendMessage(
        message.from,
        "*alarmed look* Something went wrong processing your payment. Please try again or contact support."
      );
    }
  }

  async handleBookSearch(message, user, query) {
    if (!query) {
      await this.sendMessage(
        message.from,
        "*adjusts spectacles* What would you like to search for? Example: /search python programming"
      );
      return;
    }

    try {
      const books = await BookService.searchBooks(query, 5);
      const response = await MathemagicianService.formatSearchResults(books, query);
      await this.sendMessage(message.from, response);
    } catch (error) {
      console.error('Error searching books:', error);
      await this.sendMessage(
        message.from,
        "*drops scroll* Oh dear! The library spirits are being uncooperative. Please try your search again."
      );
    }
  }

  async handleGetBookCommand(message, user, bookId) {
    try {
      // Check access first
      const access = await UserService.checkAccess(user.id);
      if (!access.hasAccess) {
        if (access.reason === 'trial_available') {
          await this.handleTrialActivation(message, user);
        } else {
          await this.handlePaymentPrompt(message, user);
        }
        return;
      }

      const book = await BookService.getBookById(bookId);
      if (!book) {
        await this.sendMessage(
          message.from,
          "*flips through pages* Hmm, I can't seem to find that book. Could you check the ID and try again?"
        );
        return;
      }

      const bookFile = await BookService.getBookFile(bookId);
      if (!bookFile) {
        await this.sendMessage(
          message.from,
          "*dusts off empty shelf* It seems this book is currently unavailable. Please try another one!"
        );
        return;
      }

      // Send the book file
      await this.client.sendMessage(
        message.from,
        {
          document: bookFile.path,
          filename: bookFile.filename,
          mimetype: bookFile.mimeType
        },
        { sendMediaAsDocument: true }
      );

      // Log the download
      await UserService.logBookDownload(user.id, bookId);
      
    } catch (error) {
      console.error('Error getting book:', error);
      await this.sendMessage(
        message.from,
        "*book falls with a thud* Oh dear! I couldn't fetch that book. Please try again later or contact support."
      );
    }
  }

  async handleStatusCommand(message, user) {
    try {
      const userWithSub = await UserService.getUserWithSubscription(user.id);
      const statusMessage = await MathemagicianService.formatSubscriptionStatus(userWithSub);
      await this.sendMessage(message.from, statusMessage);
    } catch (error) {
      console.error('Error getting status:', error);
      await this.sendMessage(
        message.from,
        "*crystal ball fogs up* I'm having trouble checking your status. Please try again later!"
      );
    }
  }

  async handleCategoriesCommand(message) {
    try {
      const categories = await BookService.getBookCategories();
      let response = "📚 *Book Categories* 📚\n\n";
      
      categories.forEach((category, index) => {
        response += `${index + 1}. ${category}\n`;
      });
      
      response += "\nTo browse a category, type: /category [name]\n";
      response += "Example: /category programming";
      
      await this.sendMessage(message.from, response);
    } catch (error) {
      console.error('Error getting categories:', error);
      await this.sendMessage(
        message.from,
        "*shelves collapse* Oh no! I couldn't fetch the categories. Please try again later!"
      );
    }
  }

  async handleRecentCommand(message) {
    try {
      const recentBooks = await BookService.getRecentBooks(5);
      
      if (recentBooks.length === 0) {
        await this.sendMessage(
          message.from,
          "*dusts off empty shelf* It seems we don't have any books in the collection yet!"
        );
        return;
      }
      
      let response = "📚 *Recently Added Books* 📚\n\n";
      
      recentBooks.forEach((book, index) => {
        response += `${index + 1}. *${book.title}* - ${book.author || 'Unknown Author'}\n`;
        response += `   Type: /get${book.id} to download\n\n`;
      });
      
      await this.sendMessage(message.from, response);
    } catch (error) {
      console.error('Error getting recent books:', error);
      await this.sendMessage(
        message.from,
        "*book falls off shelf* Oh dear! I couldn't fetch the recent books. Please try again later!"
      );
    }
  }

  async handleHelpCommand(message) {
    const helpMessage = `🎩 *Mathemagician's Help Menu* 🎩\n\n` +
      `*Basic Commands:*\n` +
      `/start - Start using the bot\n` +
      `/help - Show this help message\n` +
      `/status - Check your subscription status\n\n` +
      `*Book Commands:*\n` +
      `/search [query] - Search for books\n` +
      `/get [id] - Download a book by ID\n` +
      `/categories - List all book categories\n` +
      `/recent - Show recently added books\n\n` +
      `*Payment Commands:*\n` +
      `/pay - Subscribe or renew your access\n\n` +
      `Need help? Just type your question and I'll do my best to assist you!`;
    
    await this.sendMessage(message.from, helpMessage);
  }

  async sendMessage(to, text) {
    try {
      await this.client.sendMessage(to, text);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }
}

module.exports = MessageHandler;
