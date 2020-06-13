// API primary file

// Dependencies
const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const handlers = require('./lib/handlers');

http
  .createServer((req, res) => {
    const { pathname, query: queryStringObject } = url.parse(req.url, true);

    const trimmedPath = pathname.replace(/^\/+|\/+$/g, '');

    const method = req.method.toLowerCase();

    const { headers } = req;

    let body = [];

    req
      .on('data', chunk => {
        body.push(chunk);
      })
      .on('end', () => {
        let payload = Buffer.concat(body).toString();
        const chosenHandler = handlers[trimmedPath] ?? handlers.notFound;

        const AggregatedData = {
          trimmedPath,
          queryStringObject,
          method,
          headers,
          payload,
        };

        (async () => {
          const { statusCode, returnedData } = await chosenHandler(AggregatedData);
          res.writeHead(statusCode, { 'Content-type': 'application/json' });
          res.end(returnedData);
          console.log(`Responded with ${returnedData} and a statusCode of ${statusCode}`);
        })();
      });
  })
  .listen(5000, () => {
    console.log('Listening on port 5000');
  });
