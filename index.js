'use strict';
var Datastore = require('nedb');
var Pushover = require('pushover-notifications');
var Promise = require('bluebird');
var striptags = require('striptags');
var truncate = require('truncate');
var moment = require('moment');
var axios = require('axios');
var feed = Promise.promisify(require('feed-read'));
var decode = require('ent/decode');
var _ = require('lodash');
var br2nl = require('./br2nl');

var db = Promise.promisifyAll(new Datastore({ filename: './info.db', autoload: true }));
var config = require('./config.json');

if(!config.token || !config.users) {
  console.error("Cannot read config file");
  process.exit(1);
}

Promise.mapSeries(config.users, user => {
  // Create a Pushover connection for each user in the configuration
  let pusher = Promise.promisifyAll(new Pushover({ user: user.id, token: config.token }));
  let mostRecentFetch = null;

  return db.findOneAsync({ user: user.id })
    .then(entry => {
      // Use the most recent date from the database, or one week old news if no time is stored
      mostRecentFetch = (entry === null ? moment().subtract({ week: 1 }).toDate() : entry.mostRecentFetch);
      return user.feeds;
    })
    // Filter out feeds that have not been modified (using http HEAD)
    .filter(url => {
      return axios.head(url).then(result => {
        // Some sources do not set last modified (allow zero timestamps)
        let lastModified = new Date(result.headers['last-modified']);
        return lastModified.getTime() === 0 || lastModified > mostRecentFetch;
      }).catch(error => {
        console.error('[RSS] Could not check last modified date:', url);
        console.error(error);
        return false;
      });
    })
    // Retrieve and parse the RSS feed
    .map(url => feed(url))
    // Iterate over each RSS feed and notify of new articles
    .mapSeries(articles => {
      return Promise
        // Only articles that have been recently published are interesting
        .filter(articles, article => article.published > mostRecentFetch)
        .mapSeries(article => {
          // Create a short and concise excerpt of the article (and decode HTML entities)
          article.content = truncate(decode(striptags(br2nl(article.content)).trim()), 300);

          // Pushover does not allow too many simultaneous connections, so use a delay
          return Promise.delay(config.delay).then(() => {
            console.log('[RSS] New article:', article.title);

            // Send the notification with the article's UNIX date
            pusher.sendAsync({
              timestamp: article.published.getTime() / 1000,
              message: article.content,
              title: article.title,
              url: article.link,
              url_title: 'View Article',
            });
          });
        });
    })
    .then(notifications => {
      let notifyCount = _.sumBy(notifications, 'length');
      console.log('[RSS] Notified about %d new article(s) for user "%s"', notifyCount, user.id);

      if(notifyCount > 0) {
        return db.updateAsync({ user: user.id }, {
          mostRecentFetch: new Date(),
          user: user.id,
        }, { upsert: true }).then(notifyCount);
      }
      
      return notifyCount;
    });
});
