'use strict';
var Pushover = require('pushover-notifications');
var Promise = require('bluebird');

module.exports = class {
  constructor(options) {
    this.pusher = Promise.promisifyAll(
      new Pushover({
        token: options.token,
        user: options.id,
      })
    );
  }

  notify(article) {
    return this.pusher.sendAsync({
      timestamp: article.published.getTime() / 1000,
      message: article.content,
      title: article.title,
      url: article.link,
      url_title: 'View Article',
    });
  }
};
