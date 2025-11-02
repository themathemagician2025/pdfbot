const { v4: uuidv4 } = require('uuid');

class BaseService {
  constructor(model) {
    this.model = model;
  }

  async create(data) {
    return this.model.query().insert(data);
  }

  async findById(id) {
    return this.model.query().findById(id);
  }

  async update(id, data) {
    return this.model.query().patchAndFetchById(id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
  }

  async delete(id) {
    return this.model.query().deleteById(id);
  }

  async transaction() {
    return this.model.transaction();
  }

  generateReference(prefix = '') {
    return `${prefix}${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  }
}

module.exports = BaseService;
