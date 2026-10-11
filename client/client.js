// Client script: every API call goes through callApi(), which sends Accept (and Content-Type when there is a body).

const TYPE_COLORS = {
  Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c',
  Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3',
  Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc',
  Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad',
};

const statusBox = document.querySelector('#status');
const summary = document.querySelector('#summary');
const results = document.querySelector('#results');

// Builds an element with optional class and text. textContent keeps user-added names from injecting HTML.
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Shows the HTTP status and any server message so people can see what the API said.
const showStatus = (status, data) => {
  const ok = status >= 200 && status < 300;
  const message = data && data.message ? `\n${data.message}` : '';
  statusBox.className = `status ${ok ? 'ok' : 'bad'}`;
  statusBox.textContent = `${status}${message}`;
};

// Sends a request with the right headers and returns { status, data }.
const callApi = async (url, { method = 'GET', body, contentType } = {}) => {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = contentType;
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  showStatus(response.status, data);
  return { status: response.status, data };
};

// Makes a row of colored type chips.
const chipRow = (names, extraClass = '') => {
  const row = el('div', 'chips');
  names.forEach((name) => {
    const chip = el('span', `chip ${extraClass}`.trim(), name);
    chip.style.setProperty('--chip', TYPE_COLORS[name] || '#888');
    row.append(chip);
  });
  return row;
};

// Builds one Pokémon card.
const renderCard = (entry) => {
  const card = el('article', 'card');
  if (entry.img) {
    const image = el('img');
    image.src = entry.img.replace(/^http:/, 'https:');
    image.alt = entry.name;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.remove());
    card.append(image);
  }
  card.append(el('span', 'num', `#${entry.num}`), el('h3', '', entry.name), chipRow(entry.type));
  card.append(el('p', 'facts', `${entry.height} · ${entry.weight}`));
  if (entry.weaknesses && entry.weaknesses.length) {
    card.append(el('p', 'label', 'Weak to'), chipRow(entry.weaknesses, 'weak'));
  }
  if (entry.next_evolution) {
    card.append(el('p', 'label', `Evolves into ${entry.next_evolution.map((next) => next.name).join(', ')}`));
  }
  return card;
};

// Asks the API for Pokémon using the filter form's values (filtering happens on the server).
const search = async () => {
  const params = new URLSearchParams();
  new FormData(document.querySelector('#filterForm')).forEach((value, key) => {
    if (value !== '') params.set(key, value);
  });
  const { status, data } = await callApi(`/getPokemon?${params}`);
  results.replaceChildren();
  if (status !== 200) {
    summary.textContent = '';
    return;
  }
  summary.textContent = `Showing ${data.count} matching Pokémon.`;
  data.results.forEach((entry) => results.append(renderCard(entry)));
};

// Fills both type dropdowns from GET /getTypes.
const loadTypes = async () => {
  const { data } = await callApi('/getTypes');
  ['#typeSelect', '#weaknessSelect'].forEach((selector) => {
    const select = document.querySelector(selector);
    data.types.forEach(({ type }) => select.append(new Option(type, type)));
  });
};

// Adds a Pokémon with a JSON body.
const addPokemon = async (form) => {
  const body = JSON.stringify(Object.fromEntries(new FormData(form)));
  const { status } = await callApi('/addPokemon', { method: 'POST', body, contentType: 'application/json' });
  if (status === 201) form.reset();
};

// Edits a Pokémon with a form-urlencoded body (shows the API accepts both formats).
const updatePokemon = async (form) => {
  const body = new URLSearchParams(new FormData(form)).toString();
  const { status } = await callApi('/updatePokemon', {
    method: 'POST', body, contentType: 'application/x-www-form-urlencoded',
  });
  if (status === 204) form.reset();
};

// Wires a form so the browser's default submit is cancelled and fetch() is used instead.
const handleForm = (selector, action, refresh = true) => {
  const form = document.querySelector(selector);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await action(form);
    if (refresh) {
      const message = statusBox.textContent;
      const className = statusBox.className;
      await search();
      statusBox.className = className; // keep the add/edit result visible after refreshing the list
      statusBox.textContent = message;
    }
  });
};

handleForm('#filterForm', search, false);
handleForm('#addForm', addPokemon);
handleForm('#updateForm', updatePokemon);

loadTypes().then(search);
