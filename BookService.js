const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const BaseService = require('./BaseService');
const AdminAuditService = require('./AdminAuditService');

class BookService {
  constructor() {
    this.booksDir = path.join(__dirname, '..', 'data', 'books');
    this.ensureBooksDirectory();
    this.adminAuditService = new AdminAuditService();
    this.booksIndex = [];
    this.loadBooksIndex();
  }

  ensureBooksDirectory() {
    if (!fs.access(this.booksDir).then(() => true).catch(() => false)) {
      return fs.mkdir(this.booksDir, { recursive: true });
    }
    return Promise.resolve();
  }

  async loadBooksIndex() {
    try {
      const indexPath = path.join(this.booksDir, '_index.json');
      const data = await fs.readFile(indexPath, 'utf8');
      this.booksIndex = JSON.parse(data);
    } catch (error) {
      this.booksIndex = [];
      await this.saveBooksIndex();
    }
  }

  async saveBooksIndex() {
    const indexPath = path.join(this.booksDir, '_index.json');
    await fs.writeFile(indexPath, JSON.stringify(this.booksIndex, null, 2), 'utf8');
  }

  async searchBooks(query, limit = 10) {
    if (!query) {
      return [];
    }
    
    const searchTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    
    return this.booksIndex
      .filter(book => {
        const searchableText = [
          book.title,
          book.author,
          book.description,
          book.tags?.join(' '),
          book.category
        ].filter(Boolean).join(' ').toLowerCase();
        
        return searchTerms.every(term => searchableText.includes(term));
      })
      .slice(0, limit);
  }

  async getBookById(bookId) {
    return this.booksIndex.find(book => book.id === bookId) || null;
  }

  async getBookFile(bookId) {
    const book = await this.getBookById(bookId);
    if (!book) {
      return null;
    }

    const filePath = path.join(this.booksDir, book.filename);
    try {
      await fs.access(filePath);
      return {
        path: filePath,
        filename: `${book.title}.${path.extname(book.filename).slice(1)}`,
        mimeType: mime.lookup(book.filename) || 'application/octet-stream',
        size: (await fs.stat(filePath)).size
      };
    } catch (error) {
      console.error(`Book file not found: ${filePath}`, error);
      return null;
    }
  }

  async addBook(file, metadata, userId) {
    const bookId = uuidv4();
    const fileExt = path.extname(file.originalname).toLowerCase();
    const filename = `${bookId}${fileExt}`;
    const filePath = path.join(this.booksDir, filename);

    // Save the file
    await fs.rename(file.path, filePath);

    // Add to index
    const bookData = {
      id: bookId,
      filename,
      title: metadata.title || 'Untitled',
      author: metadata.author || 'Unknown',
      description: metadata.description || '',
      category: metadata.category || 'General',
      tags: (metadata.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
      addedBy: userId,
      addedAt: new Date().toISOString(),
      fileSize: file.size,
      mimeType: file.mimetype
    };

    this.booksIndex.push(bookData);
    await this.saveBooksIndex();

    // Log the action
    await this.adminAuditService.logAction(
      userId,
      'book_add',
      'book',
      bookId,
      '0.0.0.0', // IP should come from request
      'system',  // User agent should come from request
      { title: bookData.title, author: bookData.author }
    );

    return bookData;
  }

  async deleteBook(bookId, userId) {
    const bookIndex = this.booksIndex.findIndex(book => book.id === bookId);
    if (bookIndex === -1) {
      throw new Error('Book not found');
    }

    const book = this.booksIndex[bookIndex];
    const filePath = path.join(this.booksDir, book.filename);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      console.error(`Failed to delete book file: ${filePath}`, error);
    }

    // Remove from index
    this.booksIndex.splice(bookIndex, 1);
    await this.saveBooksIndex();

    // Log the action
    await this.adminAuditService.logAction(
      userId,
      'book_delete',
      'book',
      bookId,
      '0.0.0.0', // IP should come from request
      'system',  // User agent should come from request
      { title: book.title, author: book.author }
    );

    return true;
  }

  async getBookCategories() {
    const categories = new Set();
    this.booksIndex.forEach(book => {
      if (book.category) {
        categories.add(book.category);
      }
    });
    return Array.from(categories).sort();
  }

  async getBooksByCategory(category, limit = 20) {
    return this.booksIndex
      .filter(book => book.category === category)
      .slice(0, limit);
  }

  async getRecentBooks(limit = 10) {
    return [...this.booksIndex]
      .sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt))
      .slice(0, limit);
  }
}

module.exports = new BookService();
