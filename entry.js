// API primary file

// Dependencies
const fs = require('fs');
const url = require('url');
const http = require('http');
const https = require('https');
const config = require('./lib/config');
const path = require('path');
const handlers = require('./lib/handlers');

function serverCallback(req, res) {
  const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
    'Access-Control-Allow-Headers': '*',
  };

  const { pathname, query: queryStringObject } = url.parse(req.url, true);

  const trimmedPath = pathname.replace(/^\/+|\/+$/g, '');

  const method = req.method.toLowerCase();

  const { headers } = req;

  let body = [];

  req.on('data', chunk => {
    body.push(chunk);
  });

  req.on('end', () => {
    if (method === 'options') {
      res.writeHead(200, responseHeaders);
      res.end();
      return;
    }

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
      const { statusCode, returnedData, token = null } = await chosenHandler(AggregatedData);
      res.writeHead(statusCode, responseHeaders);

      if (token) {
        let returnedDataObj, dataToSend;

        try {
          returnedDataObj = JSON.parse(returnedData);
          dataToSend = JSON.stringify({ ...returnedDataObj, newToken: token });
        } catch {
          dataToSend = JSON.stringify({ returnedData, newToken: token });
        }

        res.end(dataToSend);
      } else res.end(returnedData);
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
