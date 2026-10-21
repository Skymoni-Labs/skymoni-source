const MODELS = ['jev-latest', 'jev-preview', 'jev-1.13.0'];
export const meta = {
  apiVersion: 1, key: 'typesafe', name: 'TypeSafe / Jev', version: '1.1.1',
  author: {name: 'skymoni'}, icon: 'text:TS', website: 'https://typesafe.ai',
  description: {en: 'Structured decisions with Jev', zh: '使用 Jev 进行结构化判断、分类和评分'},
  baseUrl: 'https://api.typesafe.ai', auth: 'api_key', models: MODELS,
  fetchMode: 'per_task',
  routes: [{method: 'POST', path: '/typesafe/v1/systemone', type: 'submit', decode: 'evaluate', render: 'result', models: MODELS, retainResult: false}],
  usageSchema: {
    input_tokens: {type: 'number', unit: 'token', description: {en: 'Input token unit price', zh: '输入 Token 单价'}},
    output_tokens: {type: 'number', unit: 'token', description: {en: 'Output token unit price', zh: '输出 Token 单价'}}
  },
  usageExamples: [{label: 'Jev evaluation', facts: {input_tokens: 1000, output_tokens: 100}}]
};

function structured(value) {
  return typeof value === 'string' || (value !== null && typeof value === 'object');
}
function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validate(body) {
  if (!object(body) || !MODELS.includes(body.model)) throw Error('Choose an available Jev model');
  for (const field of ['messages','prompt','temperature','max_tokens','tools']) {
    if (body[field] !== undefined) throw Error('Jev accepts state and questions, not chat parameter ' + field);
  }
  if (body.stream !== undefined && body.stream !== false) throw Error('Jev does not support streaming');
  if (!structured(body.state)) throw Error('state must be text, an object, or an array');
  if (!object(body.questions)) throw Error('questions must be an object');
  const entries = Object.entries(body.questions);
  // Gateway resource guards, not the provider's token window or question limit.
  if (entries.length < 1 || entries.length > 4096) throw Error('skymoni accepts 1 to 4096 questions per request');
  if (JSON.stringify(body).length > 1000000) throw Error('Evaluation exceeds the skymoni request size limit');
  for (const [id,q] of entries) {
    if (!id || !object(q) || !structured(q.instructions)) throw Error('Every question needs instructions');
    if (q.type === 'noul') {
      if (q.criteria !== undefined && (!object(q.criteria) || Object.keys(q.criteria).some(k => k !== 'true' && k !== 'false'))) throw Error('Noul criteria must describe true and false');
    } else if (q.type === 'choice') {
      if (!object(q.criteria) || Object.keys(q.criteria).length < 1 || Object.keys(q.criteria).length > 255) throw Error('Choice requires 1 to 255 criteria');
    } else if (q.type === 'score') {
      if (!Array.isArray(q.criteria) || q.criteria.length < 2 || q.criteria.length > 10) throw Error('Score requires 2 to 10 criteria');
    } else throw Error('Question type must be noul, choice, or score');
    if (q.criteria !== undefined && Object.values(q.criteria).some(v => !(q.type === 'choice' && v === null) && !structured(v))) throw Error('Invalid criteria value for ' + q.type);
  }
  return body;
}
function usage(body) {
  const u = body && body.usage;
  if (!object(u)) throw Error('TypeSafe returned no token usage');
  for (const k of ['input_tokens','output_tokens']) {
    if (!Number.isInteger(u[k]) || u[k] < 0 || u[k] > 2147483647) throw Error('TypeSafe returned invalid token usage');
  }
  return {input_tokens: u.input_tokens, output_tokens: u.output_tokens};
}
export const native = {
  evaluate(ctx) {
    if (ctx.body.kind !== 'json') throw Error('Send an application/json request');
    const b = validate(ctx.body.value);
    return {kind: 'submit', model: b.model, action: 'evaluate', requestBody: {model: b.model, state: b.state, questions: b.questions}};
  },
  result(ctx, task) { return task.data; },
  error(ctx, error) { return {error: {type: error.code, message: error.message}}; }
};
export function buildSubmitRequest(ctx) {
  validate(ctx.requestBody);
  const base = ctx.baseUrl.replace(/\/$/, '');
  const gateway = ctx.upstream && ctx.upstream.kind === 'new_api';
  if (!gateway && base !== 'https://api.typesafe.ai') throw Error('Use the official TypeSafe address, or a New API channel for gateway chaining');
  if (gateway && !/^https?:\/\/[^/?#@]+(?:\/[^?#]*)?$/.test(base)) throw Error('Invalid upstream gateway address');
  const model = ctx.upstreamModel || ctx.model;
  if (!MODELS.includes(model)) throw Error('Mapped model must be an available Jev model');
  return {url: base + (gateway ? '/typesafe' : '') + '/v1/systemone', method: 'POST', headers: {'Content-Type':'application/json', Authorization: 'Bearer ' + ctx.apiKey}, body: {...ctx.requestBody, model}};
}
export function parseSubmitResponse(ctx, response) {
  if (response.statusCode !== 200) throw Error('TypeSafe request failed (HTTP ' + response.statusCode + ')');
  const b = response.body;
  usage(b);
  if (typeof b.model !== 'string' || !b.model.startsWith('jev-') || !object(b.answers)) throw Error('Invalid TypeSafe evaluation response');
  for (const [id,q] of Object.entries(ctx.requestBody.questions)) {
    const a = b.answers[id];
    if (!object(a) || a.type !== q.type) throw Error('TypeSafe returned incomplete answers');
    if (q.type === 'noul' && !(typeof a.noul === 'number' && a.noul >= 0 && a.noul <= 1)) throw Error('Invalid TypeSafe probability');
    if (q.type === 'choice' && !Object.prototype.hasOwnProperty.call(q.criteria,a.choice)) throw Error('Invalid TypeSafe choice');
    if (q.type === 'score' && !(typeof a.score === 'number' && a.score >= 0 && a.score <= q.criteria.length - 1)) throw Error('Invalid TypeSafe score');
    if (q.type !== 'noul') {
      if (!(typeof a.confidence === 'number' && a.confidence >= 0 && a.confidence <= 1)) throw Error('Invalid TypeSafe confidence');
      if (!object(a.probabilities)) throw Error('TypeSafe returned no probability distribution');
      const keys = Object.keys(q.criteria);
      if (Object.keys(a.probabilities).length !== keys.length) throw Error('Incomplete TypeSafe probability distribution');
      for (const key of keys) {
        const p = a.probabilities[key];
        if (!(typeof p === 'number' && p >= 0 && p <= 1)) throw Error('Invalid TypeSafe probability distribution');
        if (q.type === 'score' && (!object(a.legend) || typeof a.legend[key] !== 'string')) throw Error('TypeSafe returned incomplete score levels');
      }
    }
  }
  return {taskId: ctx.publicTaskId || utils.uuid(), taskData: b, immediate: {status: 'SUCCESS', progress: '100%'}};
}
export function extractUsage(ctx) {
  // Reserve a bounded estimate; successful settlement uses measured upstream tokens.
  return {input_tokens: Math.min(JSON.stringify(ctx.requestBody).length * 3 + 4096, 1000000), output_tokens: 0};
}
export function extractUsageOnComplete(ctx, result, data) { return usage(data); }
export function buildQueryRequest() { throw Error('Jev completes synchronously'); }
export function parseTaskResult() { return {status: 'UNKNOWN'}; }
