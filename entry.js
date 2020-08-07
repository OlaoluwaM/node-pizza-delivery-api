// API primary file

// Dependencies
const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const config = require('./lib/config');
const path = require('path');
const handlers = require('./lib/handlers');
const helpersFuncObj = require('./lib/helpers');

function serverCallback(req, res) {
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
      const dataAsString = body.length === 0 ? 'null' : Buffer.concat(body).toString();
      let payload = JSON.parse(dataAsString);
      const chosenHandler = handlers[trimmedPath.split('/')[0]] ?? handlers.notFound;

      const AggregatedData = {
        trimmedPath,
        queryStringObject,
        method,
        headers,
        payload,
      };

      (async () => {
        const { statusCode, returnedData } = await chosenHandler(AggregatedData);
        res.writeHead(statusCode, {
          'Content-type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(returnedData);
        console.log(`Responded with ${returnedData} with a statusCode of ${statusCode}`);
      })();
    });
}

http.createServer(serverCallback).listen(config.httpPort, () => {
  console.log(`Listening on port ${config.httpPort}`);
});

const httpsServerOptions = {
  key: fs.readFileSync(path.join(__dirname, '/https/key.pem')),
  cert: fs.readFileSync(path.join(__dirname, '/https/cert.pem')),
};

https.createServer(httpsServerOptions, serverCallback).listen(config.httpsPort, () => {
  console.log(`Listening on port ${config.httpsPort}`);
});
