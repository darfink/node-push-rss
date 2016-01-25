'use strict';
var Promise = require('bluebird');

module.exports = class {
  constructor(options) {
    console.log('[TEST] Adapter options:');
    console.dir(options);
  }

  notify(article) {
    console.log('[TEST] Adapter article:', article.title);
    return Promise.delay(300);
  }
};
