'use strict';
var Prowl = require('node-prowl');
var Promise = require('bluebird');

module.exports = class {
  constructor(options) {
    this.pusher = Promise.promisifyAll(new Prowl(options.token));
  }

  notify(article) {
    return this.pusher.pushAsync(article.content, 'RSS feed', {
      description: article.title,
      url: article.link,
    });
  }
};
