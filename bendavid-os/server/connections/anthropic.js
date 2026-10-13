'use strict';
// Lightweight reasoning route: a single structured call to the Claude API
// through the official Anthropic SDK (server side only; the key never reaches
// the browser). Used for short classification/summarization/drafting.
//
// Configuration (bendavid-os/.env):
//   ANTHROPIC_API_KEY=...          required
//   BENDAVID_LIGHT_MODEL=...       required, e.g. claude-opus-5-5 (your choice)
// No model is assumed: the self-test checks that the configured model is
// available to your key and supports the structured output this app needs.

const crypto = require('crypto');
const config = require('../config');
const { ConnectionError } = require('./errors');

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
// Models that accept server-side refusal fallbacks (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

let lib = null;
let libError = null;
function loadSdk() {
  if (lib || libError) return lib;
  try {
    const sdk = require('@anthropic-ai/sdk');
    lib = {
      Anthropic: sdk.Anthropic || sdk.default,
      errors: sdk,
      jsonSchemaOutputFormat: require('@anthropic-ai/sdk/helpers/json-schema').jsonSchemaOutputFormat,
      betaJSONSchemaOutputFormat: require('@anthropic-ai/sdk/helpers/beta/json-schema').betaJSONSchemaOutputFormat,
    };
  } catch (err) {
    libError = err;
  }
  return lib;
}

function settings() {
  return {
    apiKey: config.secret('ANTHROPIC_API_KEY'),
    model: config.env('BENDAVID_LIGHT_MODEL'),
    baseURL: config.env('BENDAVID_ANTHROPIC_BASE_URL', DEFAULT_BASE_URL),
  };
}

// Changes whenever key, model, or endpoint change, so an old self-test result
// is never shown as current.
function fingerprint() {
  const s = settings();
  if (!s.apiKey || !s.model) return null;
  return crypto.createHash('sha256').update(`${s.apiKey}|${s.model}|${s.baseURL}`).digest('hex').slice(0, 12);
}

function describe() {
  const s = settings();
  return { sdkInstalled: Boolean(loadSdk()), keyPresent: Boolean(s.apiKey), model: s.model || null, customEndpoint: s.baseURL !== DEFAULT_BASE_URL };
}

function makeClient() {
  const sdk = loadSdk();
  if (!sdk) throw new ConnectionError('sdk-missing', 'The Anthropic SDK is not installed. Run "npm install" in the bendavid-os folder.');
  const s = settings();
  if (!s.apiKey) throw new ConnectionError('not-configured', 'ANTHROPIC_API_KEY is not set in bendavid-os/.env.');
  if (!s.model) throw new ConnectionError('not-configured', 'BENDAVID_LIGHT_MODEL is not set in bendavid-os/.env.');
  return { client: new sdk.Anthropic({ apiKey: s.apiKey, baseURL: s.baseURL, maxRetries: 2, timeout: 90_000 }), sdk, model: s.model };
}

// Most specific first; never string-match messages.
function mapError(err, sdk, model) {
  if (err instanceof ConnectionError || !sdk) return err;
  const E = sdk.errors;
  if (err instanceof E.APIUserAbortError) return new ConnectionError('cancelled', 'Request cancelled.');
  if (err instanceof E.AuthenticationError) return new ConnectionError('auth', 'The API key was rejected (401). Check ANTHROPIC_API_KEY in .env.');
  if (err instanceof E.PermissionDeniedError) return new ConnectionError('permission', 'This API key is not allowed to use that model or feature (403).');
  if (err instanceof E.NotFoundError) return new ConnectionError('model-not-found', `Model "${model}" was not found for this API key (404). Check BENDAVID_LIGHT_MODEL.`);
  if (err instanceof E.RateLimitError) return new ConnectionError('rate-limited', 'Rate limited by the Anthropic API (429). Try again shortly.');
  if (err instanceof E.BadRequestError) return new ConnectionError('bad-request', `The API rejected the request (400): ${err.message}`);
  if (err instanceof E.InternalServerError) return new ConnectionError('api-error', `The Anthropic API had an error (${err.status}). Try again.`);
  if (err instanceof E.APIConnectionTimeoutError) return new ConnectionError('timeout', 'The Anthropic API did not respond in time.');
  if (err instanceof E.APIConnectionError) return new ConnectionError('network', 'Could not reach the Anthropic API. Check the internet connection.');
  if (err instanceof E.APIError) return new ConnectionError('api-error', `Anthropic API error ${err.status}: ${err.message}`);
  return err;
}

// One structured request. Returns the parsed object plus what the API itself
// reported (served model, token usage). Nothing here is estimated.
async function structured({ system, prompt, schema, maxTokens = 8000, effort = null, signal }) {
  const { client, sdk, model } = makeClient();
  const base = { model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] };
  try {
    let res;
    if (FALLBACK_MODELS.has(model)) {
      res = await client.beta.messages.parse({
        ...base,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { ...(effort ? { effort } : {}), format: sdk.betaJSONSchemaOutputFormat(schema) },
      }, { signal });
    } else {
      res = await client.messages.parse({
        ...base,
        output_config: { ...(effort ? { effort } : {}), format: sdk.jsonSchemaOutputFormat(schema) },
      }, { signal });
    }
    if (res.stop_reason === 'refusal') {
      const cat = res.stop_details && res.stop_details.category;
      throw new ConnectionError('refusal', `The model declined this request${cat ? ` (category: ${cat})` : ''}. Use the saved-data or template engine instead.`);
    }
    if (res.stop_reason === 'max_tokens') throw new ConnectionError('incomplete', 'The model response was cut off before it finished.');
    if (!res.parsed_output) throw new ConnectionError('unparseable', 'The model response did not match the expected format.');
    return {
      data: res.parsed_output,
      requestedModel: model,
      servedBy: res.model,
      usage: res.usage ? { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens } : null,
    };
  } catch (err) {
    throw mapError(err, sdk, model);
  }
}

const PROBE_SCHEMA = {
  type: 'object',
  properties: { intent: { type: 'string', enum: ['document_request', 'offer_question', 'scheduling', 'other'] } },
  required: ['intent'],
  additionalProperties: false,
};

// Self-test: (1) the model exists for this key (no tokens used), (2) it supports
// structured outputs, (3) one tiny classification with a known answer.
async function selfTest({ signal } = {}) {
  const { client, sdk, model } = makeClient();
  let info;
  try {
    info = await client.models.retrieve(model, {}, { signal });
  } catch (err) {
    throw mapError(err, sdk, model);
  }
  const caps = info.capabilities || {};
  if (caps.structured_outputs && caps.structured_outputs.supported === false) {
    throw new ConnectionError('unsuitable', `${info.id} does not support structured outputs, which BenDavid OS requires.`);
  }
  const effortSupported = Boolean(caps.effort && caps.effort.supported !== false && (!caps.effort.low || caps.effort.low.supported !== false));
  const probe = await structured({
    system: 'Classify the business owner message into one intent.',
    prompt: 'Message: "Can you send me your last three months of business bank statements?"',
    schema: PROBE_SCHEMA,
    maxTokens: 4000,
    effort: effortSupported ? 'low' : null,
    signal,
  });
  if (probe.data.intent !== 'document_request') {
    throw new ConnectionError('unsuitable', `Probe classification returned "${probe.data.intent}" instead of "document_request".`);
  }
  return {
    model: info.id,
    displayName: info.display_name || info.id,
    servedBy: probe.servedBy,
    effortSupported,
    usage: probe.usage,
    checks: [
      `Model ${info.id} is available to this API key.`,
      'Structured output request succeeded.',
      'Probe classification returned the expected answer.',
    ],
  };
}

module.exports = { describe, fingerprint, structured, selfTest, FALLBACK_MODELS };
