const http = require('http');
const jsonHandler = require('./jsonResponses.js');

const port = process.env.PORT || process.env.NODE_PORT || 3000;

// HEAD requests use the same handlers as GET; the handlers leave the body out for HEAD.
const getRoutes = {
  '/getPokemon': jsonHandler.getPokemon,
  '/getPokemonById': jsonHandler.getPokemonById,
  '/getTypes': jsonHandler.getTypes,
  '/getEvolutions': jsonHandler.getEvolutions,
};

const urlStruct = {
  GET: getRoutes,
  HEAD: getRoutes,
  POST: {
    '/addPokemon': jsonHandler.addPokemon,
    '/updatePokemon': jsonHandler.updatePokemon,
  },
};

// Reads the request body and parses it by Content-Type (JSON or x-www-form-urlencoded),
// attaches it to request.body, then calls the handler. Bad or unknown bodies become {}
// so the handler can answer with a 400.
const parseBody = (request, response, handler) => {
  const body = [];

  request.on('error', (err) => {
    console.dir(err);
    response.statusCode = 400;
    response.end();
  });

  request.on('data', (chunk) => {
    body.push(chunk);
  });

  request.on('end', () => {
    const bodyString = Buffer.concat(body).toString();
    const contentType = (request.headers['content-type'] || '').split(';')[0].trim();

    request.body = {};
    try {
      if (contentType === 'application/json') {
        request.body = JSON.parse(bodyString);
      } else if (contentType === 'application/x-www-form-urlencoded') {
        request.body = Object.fromEntries(new URLSearchParams(bodyString));
      }
    } catch {
      request.body = {};
    }

    // JSON like null or [1,2] isn't a set of fields
    if (request.body === null || typeof request.body !== 'object' || Array.isArray(request.body)) {
      request.body = {};
    }

    handler(request, response);
  });
};

const onRequest = (request, response) => {
  const parsedUrl = new URL(request.url, 'http://localhost');
  const { pathname } = parsedUrl;
  request.query = Object.fromEntries(parsedUrl.searchParams);

  const handler = (urlStruct[request.method] || {})[pathname] || jsonHandler.notFound;

  if (request.method === 'POST') {
    return parseBody(request, response, handler);
  }
  return handler(request, response);
};

const server = http.createServer(onRequest);

// Only start listening when run directly (so the tests can start it on their own port).
if (require.main === module) {
  server.listen(port, () => {
    console.log(`Listening on 127.0.0.1:${port}`);
  });
}

module.exports = { server };
