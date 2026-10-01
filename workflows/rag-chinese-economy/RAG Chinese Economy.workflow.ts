const load_Memory = memory({ type: '@n8n/n8n-nodes-langchain.memoryPostgresChat', version: 1.4, config: { name: 'Load Memory', parameters: { sessionIdType: 'customKey', sessionKey: expr('{{ $(\'When Chat Message Received\').first().json.sessionId }}') }, credentials: { postgres: newCredential('Postgres account') }, position: [608, 480] } });
const gemini_Routing_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1.2, config: { name: 'Gemini Routing Model', parameters: { modelName: 'models/gemini-2.5-flash-lite', options: { maxOutputTokens: 512, temperature: 0 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [1104, 480] } });
const routing_Parser = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Routing Parser', parameters: { schemaType: 'manual', inputSchema: '{\n  "type": "object",\n  "properties": {\n    "route": { "type": "string", "enum": ["search", "direct"] },\n    "standaloneQuestion": { "type": "string" },\n    "queries": { "type": "array", "items": { "type": "string" }, "maxItems": 3 },\n    "keywords": { "type": "array", "items": { "type": "string" }, "maxItems": 6 }\n  },\n  "required": ["route", "standaloneQuestion", "queries", "keywords"]\n}' }, position: [1264, 480] } });
const gemini_Reranking_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1.2, config: { name: 'Gemini Reranking Model', parameters: { modelName: 'models/gemini-3.1-flash-lite-preview', options: { maxOutputTokens: 1024, temperature: 0 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [2752, 480] } });
const reranking_Parser = outputParser({ type: '@n8n/n8n-nodes-langchain.outputParserStructured', version: 1.3, config: { name: 'Reranking Parser', parameters: { schemaType: 'manual', inputSchema: '{\n  "type": "object",\n  "properties": {\n    "ranking": {\n      "type": "array",\n      "items": {\n        "type": "object",\n        "properties": {\n          "id": { "type": "integer" },\n          "score": { "type": "number", "minimum": 0, "maximum": 10 }\n        },\n        "required": ["id", "score"]\n      }\n    }\n  },\n  "required": ["ranking"]\n}' }, position: [2912, 480] } });
const gemini_Chat_Model = languageModel({ type: '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', version: 1.2, config: { name: 'Gemini Chat Model', parameters: { modelName: 'models/gemini-3.1-flash-lite-preview', options: { maxOutputTokens: 1024, temperature: 0.2 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [3456, 480] } });
const save_Memory = memory({ type: '@n8n/n8n-nodes-langchain.memoryPostgresChat', version: 1.4, config: { name: 'Save Memory', parameters: { sessionIdType: 'customKey', sessionKey: expr('{{ $(\'When Chat Message Received\').first().json.sessionId }}') }, credentials: { postgres: newCredential('Postgres account') }, position: [3760, 480] } });

const pDF_Form = trigger({
  type: 'n8n-nodes-base.formTrigger',
  version: 2.6,
  config: { name: 'PDF Form', parameters: { formTitle: 'Chinese Economy Book - Ingestion', formDescription: 'Upload the PDF of the reference book on the Chinese economy (a text PDF, not a scan). Running it again resumes the ingestion: chunks already stored are skipped.', formFields: { values: [{ fieldLabel: 'Book (PDF)', fieldType: 'file', fieldName: 'book', multipleFiles: false, acceptFileTypes: '.pdf', requiredField: true }] }, options: {} }, position: [64, -560] }
});

const extract = node({
  type: 'n8n-nodes-base.extractFromFile',
  version: 1.1,
  config: { name: 'Extract', parameters: { operation: 'pdf', binaryPropertyName: 'book', options: { joinPages: false } }, position: [288, -560], notes: 'Extracts the text of the book page by page so that every chunk keeps its page number.' }
});

const cleaning = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Cleaning', parameters: { assignments: { assignments: [{ id: 'clean-pages', name: 'pages', value: expr('{{ [].concat($json.text ?? []).map(page => String(page ?? \'\').replace(/\\uFFFD/g, "\'").replace(/[\\u007B\\u007D]/g, \'\').replace(/[ \\t]+/g, \' \').replace(/\\n\\n\\n+/g, \'\\n\\n\').trim()) }}'), type: 'array' }, { id: 'book-source', name: 'source', value: expr('{{ $json.info?.Title ? $json.info.Title.concat($json.info.Author ? \' (\'.concat($json.info.Author, \')\') : \'\') : ($(\'PDF Form\').first().binary?.book?.fileName ?? \'Reference book\').replace(/\\.pdf$/i, \'\').replace(/_+/g, \' \').trim() }}'), type: 'string' }] }, options: {} }, position: [592, -560], notes: 'Normalizes the text of every page (spaces, blank lines, undecodable quotes, braces) and builds the book title used in citations.' }
});

const chunking = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Chunking', parameters: { jsCode: '// Split the cleaned book into overlapping chunks and record the pages each chunk covers\nconst CHUNK_SIZE = 2000; // characters per chunk\nconst OVERLAP = 200;     // characters repeated between two consecutive chunks\nconst MIN_LENGTH = 30;   // ignore blank pages and tiny leftovers\n\nconst { pages = [], source } = $input.first().json;\n\n// Concatenate the pages and remember where each one starts in the full text\nlet fullText = \'\';\nconst pageStarts = [];\npages.forEach((page, index) => {\n  if (page.length < MIN_LENGTH) return;\n  pageStarts.push({ offset: fullText.length, pageNumber: index + 1 });\n  fullText += page + \'\\n\\n\';\n});\nif (!pageStarts.length) {\n  throw new Error(\'No extractable text in this PDF (scanned or image-only file?). Nothing was stored.\');\n}\nconst pageAt = (offset) => {\n  let pageNumber = pageStarts[0].pageNumber;\n  for (const start of pageStarts) {\n    if (start.offset > offset) break;\n    pageNumber = start.pageNumber;\n  }\n  return pageNumber;\n};\n\nconst chunks = [];\nlet start = 0;\nwhile (start < fullText.length) {\n  let end = Math.min(start + CHUNK_SIZE, fullText.length);\n  if (end < fullText.length) {\n    // Prefer to cut at a paragraph, then a sentence, then a word boundary\n    const window = fullText.slice(start, end);\n    const cut = [window.lastIndexOf(\'\\n\\n\'), window.lastIndexOf(\'. \'), window.lastIndexOf(\' \')]\n      .find((position) => position > CHUNK_SIZE / 2);\n    if (cut !== undefined) end = start + cut + 1;\n  }\n  const content = fullText.slice(start, end).trim();\n  if (content.length >= MIN_LENGTH) {\n    const firstPage = pageAt(start);\n    const lastPage = pageAt(end - 1);\n    chunks.push({\n      json: {\n        content,\n        metadata: { source, pageNumber: firstPage === lastPage ? firstPage : `${firstPage}-${lastPage}`, chunkIndex: chunks.length },\n      },\n    });\n  }\n  if (end >= fullText.length) break;\n  start = end - OVERLAP;\n  const space = fullText.indexOf(\' \', start); // do not start in the middle of a word\n  if (space !== -1 && space < end) start = space + 1;\n}\nreturn chunks;' }, position: [896, -560], notes: 'Cuts the book into chunks of about 2000 characters with 200 characters of overlap, each tagged with its source and page range. Stops if the PDF has no text.' }
});

const limit = node({
  type: 'n8n-nodes-base.limit',
  version: 1,
  config: { name: 'Limit', parameters: { maxItems: 1000 }, position: [1120, -560], notes: 'Test value: only the first 3 chunks are embedded. Set it to 1000 to ingest the whole book.' }
});

const find_Stored_Chunks = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Find Stored Chunks', parameters: { operation: 'executeQuery', query: 'select coalesce(json_agg((metadata->>\'chunkIndex\')::int), \'[]\'::json) as stored\nfrom public.documents\nwhere metadata->>\'source\' = $1;', options: { queryReplacement: expr('{{ [ $json.metadata.source ] }}') } }, credentials: { postgres: newCredential('Postgres account') }, position: [1424, -560], notes: 'Lists the chunk numbers of this book already in the knowledge base, so a relaunch resumes where it stopped.', executeOnce: true }
});

const keep_Missing_Chunks = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Keep Missing Chunks', parameters: { jsCode: '// Skip the chunks already stored by a previous run: no duplicate rows and no wasted Gemini quota\nconst stored = new Set(($input.first().json.stored ?? []).map(Number));\nreturn $(\'Limit\').all().filter((chunk) => !stored.has(chunk.json.metadata.chunkIndex));' }, position: [1648, -560], notes: 'Keeps only the chunks that are not in the knowledge base yet.' }
});

const loop_Over_Items = node({
  type: 'n8n-nodes-base.splitInBatches',
  version: 3,
  config: { name: 'Loop Over Items', parameters: { batchSize: 25, options: {} }, position: [1952, -560], notes: 'Sends the chunks to the sub-workflow 25 at a time; each batch is stored before the next one starts.' }
});

const ingestion_Complete = node({
  type: 'n8n-nodes-base.noOp',
  version: 1,
  config: { name: 'Ingestion Complete', position: [2208, -656], notes: 'Reached when every batch has been stored. A green execution in the Executions list means the whole book is in the knowledge base.' }
});

const chunking_SUB = node({
  type: 'n8n-nodes-base.executeWorkflow',
  version: 1.4,
  config: { name: 'Chunking (SUB)', parameters: { workflowId: { __rl: true, mode: 'id', value: 'YOUR_WORKFLOW_ID', cachedResultName: 'RAG Chinese Economy' }, workflowInputs: { mappingMode: 'defineBelow', value: {}, matchingColumns: [], schema: [], attemptToConvertTypes: false, convertFieldsToString: true }, options: { waitForSubWorkflow: true } }, position: [2208, -528], notes: 'Sends all the chunks to the sub-workflow below (Chunking (Trigger)) in a single call.' }
});

const when_Chat_Message_Received = trigger({
  type: '@n8n/n8n-nodes-langchain.chatTrigger',
  version: 1.5,
  config: { name: 'When Chat Message Received', parameters: { public: true, mode: 'webhook', options: { allowedOrigins: '*', responseMode: 'lastNode' } }, position: [64, 256] }
});

const config = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Config', parameters: { assignments: { assignments: [{ id: 'cfg-max-queries', name: 'maxQueries', value: 3, type: 'number' }, { id: 'cfg-match-count', name: 'matchCount', value: 8, type: 'number' }, { id: 'cfg-candidate-count', name: 'candidateCount', value: 15, type: 'number' }, { id: 'cfg-keep-count', name: 'keepCount', value: 5, type: 'number' }, { id: 'cfg-min-score', name: 'minRerankScore', value: 5, type: 'number' }, { id: 'cfg-history', name: 'historyExchanges', value: 5, type: 'number' }] }, includeOtherFields: true, options: {} }, position: [368, 256], notes: 'Settings of the answering pipeline: queries per question, results per query, candidates sent to reranking, passages kept, minimum relevance, exchanges of history.' }
});

const load_Messages = node({
  type: '@n8n/n8n-nodes-langchain.memoryManager',
  version: 1.1,
  config: { name: 'Load Messages', parameters: { options: { groupMessages: true } }, position: [592, 256], notes: 'Reads the last exchanges of this chat session from Supabase (table n8n_chat_histories).', alwaysOutputData: true, onError: 'continueErrorOutput', subnodes: { memory: load_Memory } }
});

const service_Unavailable_Reply = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Service Unavailable Reply', parameters: { assignments: { assignments: [{ id: 'error-output', name: 'output', value: 'Désolé, le service est momentanément indisponible, merci de réessayer plus tard. / Sorry, the service is temporarily unavailable, please try again later.', type: 'string' }] }, options: {} }, position: [3760, 800], executeOnce: true }
});

const context = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Context', parameters: { jsCode: '// Gather the question, the recent conversation and the settings used by the next steps\nconst config = $(\'Config\').first().json;\nconst strip = (text) => String(text ?? \'\').replace(/[{}]/g, \'\').trim(); // braces break LangChain prompt templates\n\nconst lines = [];\nfor (const item of $input.all()) {\n  const messages = Array.isArray(item.json.messages) ? item.json.messages : [item.json];\n  for (const message of messages) {\n    if (message.human) lines.push(`User: ${strip(message.human)}`);\n    if (message.ai) lines.push(`Assistant: ${strip(message.ai)}`);\n    const role = message.type ?? message.role;\n    const text = message.content ?? message.text ?? message.data?.content ?? message.kwargs?.content;\n    if (!message.human && !message.ai && role && text) {\n      lines.push(`${/ai|assistant/i.test(role) ? \'Assistant\' : \'User\'}: ${strip(text)}`);\n    }\n  }\n}\n\nreturn [{\n  json: {\n    question: strip(config.chatInput),\n    history: lines.slice(-2 * config.historyExchanges).join(\'\\n\') || \'No previous messages.\',\n    config,\n  },\n}];' }, position: [848, 256], notes: 'Builds the context of the turn: the user message, the recent conversation as text, and the settings.' }
});

const routing = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Routing', parameters: { promptType: 'define', text: expr('Conversation so far:\n{{ $json.history }}\n\nNew user message:\n{{ $json.question }}'), hasOutputParser: true, messages: { messageValues: [{ message: 'You are the query router of a question answering assistant about the Chinese economy. Its only knowledge source is a reference book written in English.\n\nAnalyse the new user message with the conversation and fill these fields:\n- route: "direct" only when the message needs no content from the book: greetings, thanks, small talk, or a request about the previous answers (rephrase, shorten, translate). Every question about economics, China, politics, figures or the book is "search". When in doubt, choose "search".\n- standaloneQuestion: the user message rewritten as a self-contained question, using the conversation to resolve references such as "it" or "and for the property sector?". Keep the language of the user.\n- queries: 1 to 3 short search queries written in English, each covering a different aspect of the question. Empty list when route is "direct".\n- keywords: 2 to 6 precise English terms likely to appear word for word in the book: names of people, companies, institutions, acronyms, technical terms. Empty list when route is "direct".' }] }, batching: {} }, position: [1152, 256], onError: 'continueErrorOutput', subnodes: { model: gemini_Routing_Model, outputParser: routing_Parser } }
});

const needs_Search = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Needs Search', parameters: { conditions: { combinator: 'and', options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 }, conditions: [{ id: 'route-is-not-direct', leftValue: expr('{{ $json.output.route }}'), rightValue: 'direct', operator: { type: 'string', operation: 'notEquals' } }] }, options: {} }, position: [1488, 256] }
});

const prepare_Queries = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Prepare Queries', parameters: { jsCode: '// One item per search query (at most maxQueries), each carrying the keywords for the full-text part of the search\nconst { config, question } = $(\'Context\').first().json;\nconst routing = $input.first().json.output ?? {};\n\nconst queries = [...new Set((routing.queries ?? []).map((query) => String(query).trim()).filter(Boolean))].slice(0, config.maxQueries);\nif (!queries.length) queries.push(routing.standaloneQuestion || question);\n\n// websearch_to_tsquery syntax: multi-word keywords between quotes, joined with "or"\nconst keywords = (routing.keywords ?? [])\n  .map((keyword) => String(keyword).replace(/["\']/g, \'\').trim())\n  .filter(Boolean)\n  .map((keyword) => (keyword.includes(\' \') ? `"${keyword}"` : keyword))\n  .join(\' or \');\n\nreturn queries.map((query) => ({ json: { query, keywords } }));' }, position: [1808, 256], notes: 'Turns the routing output into one item per search query, with the keywords in full-text search syntax.' }
});

const embed_Queries = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embed Queries', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{\n  "content": {\n    "parts": [\n      {\n        "text": {{ JSON.stringify($json.query) }}\n      }\n    ]\n  }\n}'), options: {} }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [2032, 256], notes: 'Same model as the ingestion (gemini-embedding-001), so query and chunk vectors are comparable.', retryOnFail: true, maxTries: 3, waitBetweenTries: 2000, onError: 'continueErrorOutput' }
});

const search = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Search', parameters: { operation: 'executeQuery', query: 'select id, content, metadata, similarity, vector_rank, keyword_rank, score\nfrom public.hybrid_search($1::extensions.vector, $2, $3);', options: { queryReplacement: expr('{{ [ JSON.stringify($json.embedding.values), $(\'Prepare Queries\').item.json.keywords, $(\'Context\').first().json.config.matchCount ] }}') } }, credentials: { postgres: newCredential('Postgres account') }, position: [2256, 256], notes: 'Hybrid search in Supabase: vector similarity plus keyword full-text search, merged by rank (hybrid_search SQL function).', alwaysOutputData: true, onError: 'continueErrorOutput' }
});

const merge_Results = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Merge Results', parameters: { jsCode: '// Merge the results of all queries: one entry per chunk with its best score, best candidates first\nconst { config, question } = $(\'Context\').first().json;\nconst routing = $(\'Routing\').first().json.output ?? {};\n\nconst best = new Map();\nfor (const { json: row } of $input.all()) {\n  if (!row.id) continue;\n  const key = String(row.id);\n  if (!best.has(key) || Number(row.score) > Number(best.get(key).score)) best.set(key, row);\n}\n\nconst candidates = [...best.values()]\n  .sort((a, b) => Number(b.score) - Number(a.score))\n  .slice(0, config.candidateCount)\n  .map((row) => ({\n    id: Number(row.id),\n    page: row.metadata?.pageNumber,\n    source: row.metadata?.source,\n    content: String(row.content ?? \'\').replace(/[{}]/g, \'\'),\n  }));\n\nconst candidateList = candidates\n  .map((candidate) => `<passage id="${candidate.id}" page="${candidate.page}">\\n${candidate.content}\\n</passage>`)\n  .join(\'\\n\\n\');\n\nreturn [{ json: { question: routing.standaloneQuestion || question, candidates, candidateList: candidateList || \'NO PASSAGE FOUND\' } }];' }, position: [2480, 256], notes: 'Deduplicates the passages found by the different queries and keeps the best candidates for reranking.' }
});

const reranking = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Reranking', parameters: { promptType: 'define', text: expr('Question:\n{{ $json.question }}\n\nCandidate passages:\n{{ $json.candidateList }}'), hasOutputParser: true, messages: { messageValues: [{ message: 'You rerank passages retrieved from a book about the Chinese economy.\nFor every candidate passage, give a relevance score from 0 to 10 for answering the question: 10 means the passage directly answers it, 5 means it gives useful context, 0 means it is unrelated.\nJudge only the relevance of the content, not its style or length. Return every passage id with its score.' }] }, batching: {} }, position: [2800, 256], onError: 'continueErrorOutput', subnodes: { model: gemini_Reranking_Model, outputParser: reranking_Parser } }
});

const keep_Best_Passages = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Keep Best Passages', parameters: { jsCode: '// Keep the passages Gemini judged most relevant and format them as cited excerpts for the answer\nconst { config } = $(\'Context\').first().json;\nconst { question, candidates } = $(\'Merge Results\').first().json;\nconst relevance = new Map(($input.first().json.output?.ranking ?? []).map((entry) => [Number(entry.id), Number(entry.score)]));\n\nconst kept = candidates\n  .map((candidate) => ({ ...candidate, relevance: relevance.get(candidate.id) ?? 0 }))\n  .filter((candidate) => candidate.relevance >= config.minRerankScore)\n  .sort((a, b) => b.relevance - a.relevance)\n  .slice(0, config.keepCount);\n\nconst context = kept\n  .map((passage, index) => `<excerpt id="${index + 1}" source="${passage.source || \'reference book\'}" page="${passage.page || \'unknown\'}">\\n${passage.content}\\n</excerpt>`)\n  .join(\'\\n\\n\');\n\nreturn [{ json: { question, context: context || \'NO RELEVANT EXCERPT FOUND\' } }];' }, position: [3136, 256], notes: 'Keeps the passages scored at least minRerankScore by the reranking, best first, at most keepCount.' }
});

const generation = node({
  type: '@n8n/n8n-nodes-langchain.chainLlm',
  version: 1.9,
  config: { name: 'Generation', parameters: { promptType: 'define', text: expr('Conversation so far:\n{{ $(\'Context\').first().json.history }}\n\nUser message:\n{{ $(\'Context\').first().json.question }}\n\nStandalone question:\n{{ $json.question }}\n\nExcerpts from the reference book:\n{{ $json.context }}'), messages: { messageValues: [{ message: 'You are a research assistant answering questions about the Chinese economy. You answer using ONLY the excerpts of the reference book given in the user message. Each excerpt has a source attribute (book title and author) and a page attribute. The conversation is only there to understand the question.\n\nAbsolute rules:\n1. Never invent anything and never use outside knowledge, even if you know the answer. If the excerpts do not contain the information, say so clearly, for example in French: "Je n\'ai pas cette information dans le livre." or in English: "I don\'t have this information in the book."\n2. Always answer in the language of the user message, even if the excerpts are written in another language.\n3. Structure a good answer as: the requested information first, then useful context found in the excerpts (figures, dates, causes and consequences, comparisons between periods, sectors or countries), then the source as (book title, p. X) using the source and page attributes of the excerpts you used.\n4. Copy every figure, percentage and date exactly as written in the excerpts and never guess a number. When the author gives an opinion or a forecast, present it as the view of the author.\n5. Stay concise: a few sentences or a short list.\n6. When the excerpts say NO SEARCH NEEDED, the message is small talk or about the previous answers: reply briefly from the conversation only, without adding any new fact.' }] }, batching: {} }, position: [3456, 256], onError: 'continueErrorOutput', subnodes: { model: gemini_Chat_Model } }
});

const save_Messages = node({
  type: '@n8n/n8n-nodes-langchain.memoryManager',
  version: 1.1,
  config: { name: 'Save Messages', parameters: { mode: 'insert', messages: { messageValues: [{ type: 'user', message: expr('{{ $(\'Context\').first().json.question }}') }, { type: 'ai', message: expr('{{ $json.text }}') }] } }, position: [3744, 256], notes: 'Stores the question and the answer in the chat history; the reply is sent even if saving fails.', onError: 'continueRegularOutput', subnodes: { memory: save_Memory } }
});

const format_Reply = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Format Reply', parameters: { assignments: { assignments: [{ id: 'reply-output', name: 'output', value: expr('{{ $(\'Generation\').first().json.text }}'), type: 'string' }] }, options: {} }, position: [3984, 256] }
});

const skip_Search = node({
  type: 'n8n-nodes-base.set',
  version: 3.5,
  config: { name: 'Skip Search', parameters: { assignments: { assignments: [{ id: 'direct-question', name: 'question', value: expr('{{ $json.output.standaloneQuestion || $(\'Context\').first().json.question }}'), type: 'string' }, { id: 'direct-context', name: 'context', value: 'NO SEARCH NEEDED: this message is small talk or about the conversation itself.', type: 'string' }] }, options: {} }, position: [1488, 480], notes: 'Direct route: no search and no reranking for greetings, thanks or requests about previous answers.' }
});

const chunking_Trigger = trigger({
  type: 'n8n-nodes-base.executeWorkflowTrigger',
  version: 1.2,
  config: { name: 'Chunking (Trigger)', parameters: { inputSource: 'passthrough' }, position: [1952, -224] }
});

const embedding = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.5,
  config: { name: 'Embedding', parameters: { method: 'POST', url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent', authentication: 'predefinedCredentialType', nodeCredentialType: 'googlePalmApi', sendBody: true, specifyBody: 'json', jsonBody: expr('{\n  "content": {\n    "parts": [\n      {\n        "text": {{ JSON.stringify($json.content) }}\n      }\n    ]\n  }\n}'), options: { batching: { batch: { batchSize: 1, batchInterval: 1300 } } } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [2176, -224], notes: 'Gemini gemini-embedding-001 turns each chunk into a 3072-dimension vector. One request every 1.3 s to stay under the free quota.', retryOnFail: true, maxTries: 5, waitBetweenTries: 5000 }
});

const execute_a_SQL_Query = node({
  type: 'n8n-nodes-base.postgres',
  version: 2.7,
  config: { name: 'Execute a SQL Query', parameters: { operation: 'executeQuery', query: 'insert into public.documents (content, metadata, embedding)\nvalues ($1, $2::jsonb, $3::extensions.vector)\non conflict do nothing;', options: { queryReplacement: expr('{{ [ $(\'Chunking (Trigger)\').item.json.content, JSON.stringify($(\'Chunking (Trigger)\').item.json.metadata), JSON.stringify($json.embedding.values) ] }}') } }, credentials: { postgres: newCredential('Postgres account') }, position: [2400, -224], notes: 'Stores the chunk, its metadata and its vector in the Supabase documents table. Values are passed as an array so that commas in the text are not split.' }
});

const wf = workflow('ragChineseEconomy', 'RAG Chinese Economy', { executionOrder: 'v1', binaryMode: 'separate', availableInMCP: true });

export default wf
  .add(pDF_Form)
  .to(extract)
  .to(cleaning)
  .to(chunking)
  .to(limit)
  .to(find_Stored_Chunks)
  .to(keep_Missing_Chunks)
  .to(splitInBatches(loop_Over_Items)
  .onEachBatch(chunking_SUB
    .to(nextBatch(loop_Over_Items)))
  .onDone(ingestion_Complete))
  .add(when_Chat_Message_Received)
  .to(config)
  .to(load_Messages
  .onError(service_Unavailable_Reply))
  .to(context)
  .to(routing
  .onError(service_Unavailable_Reply))
  .to(needs_Search.onTrue(prepare_Queries
    .to(embed_Queries
    .onError(service_Unavailable_Reply))
    .to(search
    .onError(service_Unavailable_Reply))
    .to(merge_Results)
    .to(reranking
    .onError(service_Unavailable_Reply))
    .to(keep_Best_Passages)
    .to(generation
    .onError(service_Unavailable_Reply))
    .to(save_Messages)
    .to(format_Reply)).onFalse(skip_Search
    .to(generation)))
  .add(chunking_Trigger)
  .to(embedding)
  .to(execute_a_SQL_Query)
  .add(sticky('## Ingestion\n### 1 · Dépôt & extraction\nLe formulaire reçoit le PDF du livre. **Extract** en sort le texte page par page.', [pDF_Form, extract], { name: 'Note Ingestion 1', color: 2, width: 480, height: 400, position: [0, -800] }))
  .add(sticky('### 2 · Nettoyage\nNormalise le texte de chaque page et construit le titre du livre utilisé dans les citations.', [cleaning], { name: 'Note Ingestion 2', color: 2, width: 256, height: 400, position: [528, -800] }))
  .add(sticky('### 3 · Découpage\n**Chunking** coupe le livre en morceaux d\'environ 2 000 caractères (200 de chevauchement), avec leurs pages. **Limit** borne le nombre de chunks pour les tests.', [chunking, limit], { name: 'Note Ingestion 3', color: 2, width: 480, height: 400, position: [832, -800] }))
  .add(sticky('### 4 · Reprise\nRepère les chunks déjà en base et ne garde que les manquants : une relance reprend là où elle s\'est arrêtée, sans doublon.', [find_Stored_Chunks, keep_Missing_Chunks], { name: 'Note Ingestion 4', color: 2, width: 480, height: 400, position: [1360, -800] }))
  .add(sticky('### 5 · Boucle par paquets de 25\nEnvoie les chunks au sous-workflow 25 par 25. Chaque paquet est enregistré avant le suivant. À la fin : **Ingestion Complete**.', [chunking_SUB, ingestion_Complete, loop_Over_Items], { name: 'Note Ingestion 5', color: 2, width: 736, height: 400, position: [1888, -800] }))
  .add(sticky('### 6 · Sous-workflow : vectorisation & stockage\nLancé par **Chunking (SUB)**, dans une exécution séparée. **Embedding** vectorise chaque chunk avec Gemini (1 requête / 1,3 s), **Execute a SQL Query** l\'insère dans Supabase.', [chunking_Trigger, embedding, execute_a_SQL_Query], { name: 'Note Ingestion 6', color: 2, width: 736, height: 304, position: [1888, -384] }))
  .add(sticky('## Answering\n### 1 · Input (Chat)\nReçoit le message de l\'utilisateur et son identifiant de session.', [when_Chat_Message_Received], { name: 'Note Answering 1', color: 2, width: 272, height: 624, position: [-16, 0] }))
  .add(sticky('### 2 · Context\n**Config** : réglages du pipeline. **Load Messages** : les 5 derniers échanges (Supabase). **Context** : question + historique.', [config, load_Messages, load_Memory, context], { name: 'Note Answering 2', color: 2, width: 720, height: 624, position: [320, 0] }))
  .add(sticky('### 3 · Routing\nGemini reformule la question et produit 1 à 3 requêtes et des mots-clés en anglais. **Needs Search** : recherche dans le livre, ou **Skip Search** pour une réponse directe (salutations, remerciements).', [routing, gemini_Routing_Model, routing_Parser, needs_Search, skip_Search], { name: 'Note Answering 3', color: 2, width: 560, height: 624, position: [1072, 0] }))
  .add(sticky('### 4 · Search\nVectorise chaque requête, puis recherche hybride dans Supabase (vecteurs + mots-clés). **Merge Results** dédoublonne et garde 15 candidats.', [prepare_Queries, embed_Queries, search, merge_Results], { name: 'Note Answering 4', color: 2, width: 864, height: 624, position: [1760, 0] }))
  .add(sticky('### 5 · Reranking\nGemini Flash Lite note chaque passage de 0 à 10. **Keep Best Passages** garde les 5 meilleurs (au moins 5/10).', [reranking, gemini_Reranking_Model, reranking_Parser, keep_Best_Passages], { name: 'Note Answering 5', color: 2, width: 576, height: 624, position: [2704, 0] }))
  .add(sticky('### 6 · Generation\nGemini rédige la réponse à partir des passages (langue de la question, citations, rien d\'inventé), puis l\'échange est enregistré dans l\'historique.', [gemini_Chat_Model, format_Reply, generation, save_Messages, save_Memory], { name: 'Note Answering 6', color: 2, width: 720, height: 624, position: [3408, 0] }))
  .add(sticky('### Pannes\nSi Gemini ou Supabase échoue à une étape, l\'utilisateur reçoit un message d\'excuse.', [service_Unavailable_Reply], { name: 'Note Answering 7', color: 2, width: 720, height: 288, position: [3408, 688] }))