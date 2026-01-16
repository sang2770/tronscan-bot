class ApiKeyAllocator {
  constructor(apiKeys = []) {
    this.apiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    this.currentIndex = 0;
  }

  getNextKey() {
    if (this.apiKeys.length === 0) {
      return '';
    }

    const key = this.apiKeys[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    return key;
  }

  updateKeys(apiKeys) {
    this.apiKeys = Array.isArray(apiKeys) ? apiKeys : [];
    this.currentIndex = 0;
  }

  hasKeys() {
    return this.apiKeys.length > 0;
  }

  getKeysCount() {
    return this.apiKeys.length;
  }
}

module.exports = ApiKeyAllocator;
