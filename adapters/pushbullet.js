'use strict';
var PushBullet = require('pushbullet');
var Promise = require('bluebird');

module.exports = class {
  constructor(options) {
    this.pusher = Promise.promisifyAll(new PushBullet(options.token));
    this.device = options.id || {};
  }

  notify(article) {
    return this.pusher.pushAsync(this.device, {
      type: 'link',
      title: article.title,
      body: article.content,
      url: article.link,
    });
  }
};
