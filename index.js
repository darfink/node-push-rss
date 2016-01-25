'use strict';
var Datastore = require('nedb');
var Promise = require('bluebird');
var striptags = require('striptags');
var truncate = require('truncate');
var axios = require('axios');
var feed = Promise.promisify(require('feed-read'));
var decode = require('ent/decode');
var br2nl = require('./br2nl');

Promise.coroutine.addYieldHandler(function(value) {
  if(Array.isArray(value)) {
    return Promise.all(value);
  }
});

const config = require('./config.json');

if(!config.users || !config.database) {
  console.error("Cannot read config file");
  process.exit(1);
}

var db = Promise.promisifyAll(new Datastore({
  filename: config.database,
  autoload: true,
}));

// Iterate over each user sequentially
Promise.mapSeries(config.users, Promise.coroutine(handleUser));

function* handleUser(user) {
  // Use the most recent date from the database, or use the current date
  let entry = yield db.findOneAsync({ user: user.id });

  const initialTime = new Date();
  let mostRecentFetch = (entry === null ? initialTime : entry.mostRecentFetch);

  mostRecentFetch = new Date("2015");
  let feeds = yield Promise.filter(user.feeds, url => {
    return axios.head(url).then(result => {
      // Some sources do not set last modified (allow zero timestamps)
      let lastModified = new Date(result.headers['last-modified']);
      return (lastModified.getTime() || 0) === 0 || lastModified > mostRecentFetch;
    });
  });

  let Adapter = require(`./adapters/${user.type}`);
  let notifier = new Adapter(user.options);

  let notifyCount = 0;

  // Retrieve and parse the RSS feed (containing the articles)
  for(var articles of (yield feeds.map(url => feed(url)))) {
    // Only articles that have been recently published are interesting
    for(let article of articles.filter(article => article.published > mostRecentFetch)) {
      // Create a short and concise excerpt of the article (and decode HTML entities)
      article.content = truncate(decode(striptags(br2nl(article.content)).trim()), 300);

      // Use a little delay between each push notification
      yield Promise.delay(config.delay || 1000);

      // Send the notification to the user
      yield notifier.notify(article);
      notifyCount++;
    }
  }

  console.log('[RSS] Notified about %d new article(s) for user "%s"', notifyCount, user.name || "unknown");

  if(notifyCount > 0) {
    // Update the timestamp in the database to keep track of the date when the articles were retrieved
    yield db.updateAsync({ user: user.id }, { mostRecentFetch: initialTime, user: user.id, }, { upsert: true });
  }

  return notifyCount;
}
