const express = require('express');
const compression = require('compression');
const sm = require('sitemap');
const rp = require('request-promise-native');
const apicache = require('apicache');
const { readFileSync } =  require('fs');
const { join } =  require('path');
// Load zone.js for the server.
require('zone.js/dist/zone-node');

const { enableProdMode } = require('@angular/core');

// Import renderModuleFactory from @angular/platform-server.
const renderModuleFactory = require('@angular/platform-server').renderModuleFactory;

// Import the AOT compiled factory for your AppServerModule.
const AppServerModuleNgFactory = require('./dist-server/main.bundle').AppServerModuleNgFactory;

const template = readFileSync('./dist/index.html', { encoding: 'utf8' });

const app = express();
const port = process.env.PORT || 4200;
const cache = apicache.middleware;
const cacheDuration = '14 days';

let sitemap;
let showList;

enableProdMode();


function generateSitemap() {
  let newSitemap = sm.createSitemap ({
    hostname: 'https://episode.ninja',
    cacheTime: 600000
  });

  newSitemap.add({url: '/'});
  newSitemap.add({url: '/shows'});
  newSitemap.add({url: '/about'});

  rp({
    uri: 'https://episodes.stevendsanders.com/shows',
    json: true
  }).then(shows => {
    showList = shows;
    shows.forEach(show => {
      newSitemap.add({url: `/series/${show.slug}`});
      if (show.totalEpisodes >= 50) {
        newSitemap.add({url: `/series/${show.slug}/worst-episodes`});
      }
    });

    sitemap = newSitemap;
  });
}

generateSitemap();

/**
 * Express View
 */
app.engine('html', (_, options, callback) => {
  const opts = {
    document: template, url: options.req.url, extraProviders: [
      {
        provide: 'REQUEST',
        useValue: options.req,
      }]
  };

  renderModuleFactory(AppServerModuleNgFactory, opts)
    .then(html => callback(null, html));
});

app.set('view engine', 'html');
app.set('views', 'src');


/**
 * Enable compression
 */
app.use(compression());


app.get('/sitemap.xml', function(req, res) {
  sitemap.toXML((err, xml) => {
    if (err) {
      return res.status(500).end();
    }
    res.header('Content-Type', 'application/xml');
    res.send( xml );
  });
});

app.post('/clear-cache', (req, res) => {
  generateSitemap();
  res.json(apicache.clear());
});


/**
 * serve static files
 */
app.get('*.*', express.static(join(__dirname, 'dist')));

app.get('*', cache(cacheDuration), (req, res) => {
  // If this is a series and the slug has changed
  // 301 redirect to the new slug
  let matchFound = false;
  let urlParts = req.originalUrl.split('/');

  if(urlParts[1] === 'series') {
    for (let show of showList) {
      if (!show.oldSlug) {
        continue;
      }

      if (urlParts[2] === show.oldSlug) {
        matchFound = true;
        res.redirect(301, `/series/${show.slug}`);
        res.end();
        break;
      }
    }
  }

  if (!matchFound) {
    res.render('index', {req});
  }
});

app.listen(port, () => {
  console.log(`listening on http://localhost:${port}!`);
});