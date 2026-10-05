const fs = require('fs');

// The dataset is read and parsed once at startup. Everything after that uses this array,
// so anything added or edited disappears when the server restarts.
const pokemon = JSON.parse(fs.readFileSync(`${__dirname}/data/pokedex.json`));

// Helper: send a JSON body with a status code.
// Always sets Content-Type and Content-Length. HEAD requests get the headers but no body.
// Passing no object sends an empty body (used for 204).
const respondJSON = (request, response, status, object) => {
  const content = object ? JSON.stringify(object) : '';

  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(content),
  });

  if (request.method !== 'HEAD') {
    response.write(content);
  }
  response.end();
};

// Helper: send an error as { message, id }
const respondError = (request, response, status, id, message) => {
  respondJSON(request, response, status, { message, id });
};

// ---------- Small helpers ----------

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();

// Accepts an array or a comma-separated string ("Fire, Flying") and returns a clean array.
const toList = (value) => {
  const items = Array.isArray(value) ? value : String(value).split(',');
  return items.map((item) => String(item).trim()).filter(Boolean);
};

// True if a list of names contains `wanted`, ignoring capitalization.
const hasName = (list, wanted) => list.some((item) => item.toLowerCase() === wanted.toLowerCase());

// "1.2" -> "1.2 m". Values that already include a unit are kept as typed.
const withUnit = (value, unit) => {
  const text = String(value).trim();
  return /^[\d.]+$/.test(text) ? `${text} ${unit}` : text;
};

const nameTaken = (name, ignoreId) => pokemon.some(
  (p) => p.id !== ignoreId && p.name.toLowerCase() === name.toLowerCase(),
);

// Looks up the Pokémon for ?id=. Sends a 400 or 404 itself and returns undefined if it can't.
const findFromQuery = (request, response) => {
  const { id } = request.query;

  if (!id) {
    respondError(request, response, 400, 'missingParams', 'The id query parameter is required.');
    return undefined;
  }

  const found = pokemon.find((p) => p.id === Number(id));
  if (!found) {
    respondError(request, response, 404, 'notFound', `No Pokémon with id ${id} exists.`);
  }
  return found;
};

// ---------- GET / HEAD endpoints ----------

// /getPokemon?name=&type=&weakness=&limit=  -> filtering is done here, not in the browser
const getPokemon = (request, response) => {
  const {
    name, type, weakness, limit,
  } = request.query;
  let results = pokemon;

  if (name) {
    results = results.filter((p) => p.name.toLowerCase().includes(name.toLowerCase()));
  }
  if (type) {
    results = results.filter((p) => hasName(p.type, type));
  }
  if (weakness) {
    results = results.filter((p) => hasName(p.weaknesses || [], weakness));
  }
  if (limit !== undefined) {
    const max = Number(limit);
    if (!Number.isInteger(max) || max < 1) {
      return respondError(request, response, 400, 'invalidParams', 'limit must be a whole number of 1 or more.');
    }
    results = results.slice(0, max);
  }

  return respondJSON(request, response, 200, { count: results.length, results });
};

// /getPokemonById?id=1
const getPokemonById = (request, response) => {
  const found = findFromQuery(request, response);
  if (found) {
    respondJSON(request, response, 200, found);
  }
};

// /getTypes -> every type with how many Pokémon have it
const getTypes = (request, response) => {
  const counts = {};
  pokemon.forEach((p) => p.type.forEach((t) => {
    counts[t] = (counts[t] || 0) + 1;
  }));

  const types = Object.keys(counts).sort().map((t) => ({ type: t, count: counts[t] }));
  respondJSON(request, response, 200, { types });
};

// /getEvolutions?id=2 -> what it evolves from and into
const getEvolutions = (request, response) => {
  const found = findFromQuery(request, response);
  if (!found) return;

  const evolvesFrom = pokemon
    .filter((p) => (p.next_evolution || []).some((next) => next.num === found.num))
    .map((p) => ({ num: p.num, name: p.name }));

  respondJSON(request, response, 200, {
    id: found.id,
    name: found.name,
    evolvesFrom,
    evolvesInto: found.next_evolution || [],
  });
};

// Not found (used for any unknown URL, for GET, HEAD, and POST)
const notFound = (request, response) => {
  respondError(request, response, 404, 'notFound', 'The page or endpoint you are looking for was not found.');
};

// ---------- POST endpoints ----------

// Pulls the editable fields out of a request body, cleaned up. Blank fields are skipped.
const readFields = (body) => {
  const fields = {};
  if (body.name) fields.name = String(body.name).trim();
  if (body.type) fields.type = toList(body.type).map(capitalize);
  if (body.weaknesses) fields.weaknesses = toList(body.weaknesses).map(capitalize);
  if (body.height) fields.height = withUnit(body.height, 'm');
  if (body.weight) fields.weight = withUnit(body.weight, 'kg');
  if (body.img) fields.img = String(body.img).trim();
  return fields;
};

// POST /addPokemon -> 201 created, 400 missing fields, 409 duplicate name
const addPokemon = (request, response) => {
  const fields = readFields(request.body);

  if (!fields.name || !fields.type || fields.type.length === 0) {
    return respondError(request, response, 400, 'missingParams', 'name and type are both required.');
  }
  if (nameTaken(fields.name)) {
    return respondError(request, response, 409, 'duplicate', `A Pokémon named ${fields.name} already exists.`);
  }

  const id = Math.max(0, ...pokemon.map((p) => p.id)) + 1;
  const created = {
    id,
    num: String(id).padStart(3, '0'),
    img: '',
    height: 'Unknown',
    weight: 'Unknown',
    weaknesses: [],
    ...fields,
  };
  pokemon.push(created);

  return respondJSON(request, response, 201, created);
};

// POST /updatePokemon -> 204 updated, 400 bad request, 404 unknown id, 409 duplicate name
const updatePokemon = (request, response) => {
  const { id } = request.body;
  if (!id) {
    return respondError(request, response, 400, 'missingParams', 'id is required.');
  }

  const target = pokemon.find((p) => p.id === Number(id));
  if (!target) {
    return respondError(request, response, 404, 'notFound', `No Pokémon with id ${id} exists.`);
  }

  const fields = readFields(request.body);
  if (Object.keys(fields).length === 0) {
    return respondError(request, response, 400, 'missingParams', 'Send at least one field to change.');
  }
  if (fields.name && nameTaken(fields.name, target.id)) {
    return respondError(request, response, 409, 'duplicate', `A Pokémon named ${fields.name} already exists.`);
  }

  Object.assign(target, fields);
  return respondJSON(request, response, 204);
};

module.exports = {
  getPokemon,
  getPokemonById,
  getTypes,
  getEvolutions,
  notFound,
  addPokemon,
  updatePokemon,
};
