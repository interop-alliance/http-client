# HTTP Client _(@interop/http-client)_

[![Node.js CI](https://github.com/interop-alliance/http-client/workflows/Node.js%20CI/badge.svg)](https://github.com/interop-alliance/http-client/actions?query=workflow%3A%22Node.js+CI%22)
[![NPM Version](https://img.shields.io/npm/v/@interop/http-client.svg)](https://npm.im/@interop/http-client)

> An opinionated, isomorphic HTTP client for Node.js, browsers, and React Native.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [License](#license)

## Background

* Forked from `@digitalbazaar/http-client@4.1.0`, converted to TypeScript.

## Install

- Node.js 24+ is recommended.

### PNPM

To install via PNPM:

```
pnpm install @interop/http-client
```

### Development

To install locally (for development):

```
git clone https://github.com/interop-alliance/http-client.git
cd http-client
pnpm install
```

## Usage

#### Import httpClient (Node.js)
```js
import https from 'https';
import {httpClient} from '@interop/http-client';
```

#### Import httpClient (browsers or React Native)
```js
import {httpClient} from '@interop/http-client';
```

#### Import and initialize a custom Bearer Token client
```js
import {httpClient} from '@interop/http-client';

const httpsAgent = new https.Agent({rejectUnauthorized: false});

const accessToken = '12345';
const headers = {Authorization: `Bearer ${accessToken}`};

const client = httpClient.extend({headers, httpsAgent});

// subsequent http calls will include an 'Authorization: Bearer 12345' header,
// and use the provided httpsAgent
```

#### GET a JSON response in the browser
```js
try {
  const response = await httpClient.get('http://httpbin.org/json');
  return response.data;
} catch(e) {
  // status is HTTP status code
  // data is JSON error from the server
  const {data, status} = e;
  throw e;
}
```

#### GET a JSON response in Node with an HTTP Agent
```js
import https from 'https';
// use an agent to avoid self-signed certificate errors
const agent = new https.Agent({rejectUnauthorized: false});
try {
  const response = await httpClient.get('http://httpbin.org/json', {agent});
  return response.data;
} catch(e) {
  // status is HTTP status code
  // data is JSON error from the server if available
  const {data, status} = e;
  throw e;
}
```

#### GET HTML by overriding default headers
```js
const headers = {Accept: 'text/html'};
try {
  const response = await httpClient.get('http://httpbin.org/html', {headers});
  // see: https://developer.mozilla.org/en-US/docs/Web/API/Response#methods
  return response.text();
} catch(e) {
  // status is HTTP status code
  // any message from the server can be parsed from the response if present
  const {response, status} = e;
  throw e;
}
```

#### POST a JSON payload
```js
try {
  const response = await httpClient.post('http://httpbin.org/json', {
    // `json` is the payload or body of the POST request
    json: {some: 'data'}
  });
  return response.data;
} catch(e) {
  // status is HTTP status code
  // data is JSON error from the server
  const {data, status} = e;
  throw e;
}
```

#### POST a JSON payload in Node with an HTTP Agent
```js
import https from 'https';
// use an agent to avoid self-signed certificate errors
const agent = new https.Agent({rejectUnauthorized: false});
try {
  const response = await httpClient.post('http://httpbin.org/json', {
    agent,
    // `json` is the payload or body of the POST request
    json: {some: 'data'}
  });
  return response.data;
} catch(e) {
  // status is HTTP status code
  // data is JSON error from the server
  const {data, status} = e;
  throw e;
}
```


## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md)

Copyright (c) 2020-2026 Digital Bazaar.
Copyright (c) 2026 Interop Alliance (conversion to TypeScript)

