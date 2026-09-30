const every_Friday_7_PM = trigger({
  type: 'n8n-nodes-base.scheduleTrigger',
  version: 1.4,
  config: { name: 'Every Friday 7 PM', parameters: { rule: { interval: [{ field: 'weeks', triggerAtDay: [5], triggerAtHour: 19 }] } }, position: [0, 304], notes: 'Fires every Friday at 19:00. The workflow timezone is set to Europe/Paris.', notesInFlow: true }
});

const compute_Period = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Compute Period', parameters: { jsCode: '// Window = the last 7 days ending on the most recent Friday 19:00 (Paris time).\n// A 5-minute tolerance absorbs trigger jitter, so a run at 18:59:59 still anchors on today.\n// oldest/latest are ISO dates: the Slack node converts them to Slack timestamps itself.\nconst now = DateTime.now().setZone(\'Europe/Paris\');\nconst reference = now.plus({ minutes: 5 });\nlet end = reference.set({ hour: 19, minute: 0, second: 0, millisecond: 0 });\nwhile (end.weekday !== 5 || end > reference) {\n  end = end.minus({ days: 1 }).set({ hour: 19, minute: 0, second: 0, millisecond: 0 });\n}\nconst start = end.minus({ weeks: 1 });\n\nreturn [{\n  json: {\n    oldest: start.toISO(),\n    latest: end.toISO(),\n    periodStart: start.toFormat(\'dd/MM/yyyy HH:mm\'),\n    periodEnd: end.toFormat(\'dd/MM/yyyy HH:mm\'),\n    subject: \'Synthèse Slack, semaine du \' + now.toFormat(\'dd/MM\'),\n  },\n}];' }, position: [224, 304], notes: 'Computes the rolling 7-day window (previous Friday 19:00 to this Friday 19:00, Paris time) and the email subject.', notesInFlow: true }
});

const fetch_General_Messages = node({
  type: 'n8n-nodes-base.slack',
  version: 2.7,
  config: { name: 'Fetch General Messages', parameters: { resource: 'channel', operation: 'history', channelId: { __rl: true, mode: 'list', value: '', cachedResultName: 'général' }, returnAll: true, filters: { inclusive: false, latest: expr('{{ $("Compute Period").first().json.latest }}'), oldest: expr('{{ $("Compute Period").first().json.oldest }}') } }, credentials: { slackApi: newCredential('Slack account') }, position: [448, 480], webhookId: '18376c25-650b-4fce-8a73-f4214e619179', notes: 'Reads the public general channel for the period. Always outputs an item so an empty week still reaches the no-message branch.', notesInFlow: true, executeOnce: true, alwaysOutputData: true, onError: 'continueRegularOutput' }
});

const build_Transcript = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Transcript', parameters: { jsCode: '// Turns raw Slack history of the general channel into a readable, chronological transcript.\n// A Slack failure arrives here as an item carrying an "error" field (the Slack node continues on\n// its regular output). It is rethrown once, so a single retry loop starts per attempt.\nconst items = $input.all();\n\nconst failures = items\n  .map((item) => item.json && item.json.error)\n  .filter(Boolean)\n  .map((err) => (typeof err === \'string\' ? err : err.message || JSON.stringify(err)));\nif (failures.length) {\n  throw new Error(\'Slack read failed: \' + [...new Set(failures)].join(\' | \'));\n}\n\nconst IGNORED_SUBTYPES = [\'channel_join\', \'channel_leave\', \'channel_purpose\', \'channel_topic\', \'channel_name\', \'channel_archive\', \'channel_unarchive\'];\n\nconst lines = items\n  .map((item) => item.json)\n  .filter((m) => m && typeof m.text === \'string\' && m.text.trim() !== \'\' && !IGNORED_SUBTYPES.includes(m.subtype))\n  .sort((a, b) => Number(a.ts) - Number(b.ts))\n  .map((m) => {\n    const when = DateTime.fromSeconds(Number(m.ts)).setZone(\'Europe/Paris\').setLocale(\'fr\').toFormat(\'ccc dd/MM HH:mm\');\n    const profile = m.user_profile || {};\n    const author = profile.real_name || profile.display_name || m.username || (m.user ? \'<@\' + m.user + \'>\' : \'bot\');\n    return \'[\' + when + \'] \' + author + \' : \' + m.text.replace(/\\s+/g, \' \').trim();\n  });\n\nreturn [{\n  json: {\n    hasMessages: lines.length > 0,\n    generalCount: lines.length,\n    generalTranscript: lines.join(\'\\n\'),\n  },\n}];' }, position: [660, 300], notes: 'Drops system events, sorts messages by time and builds the channel transcript plus the message count.', notesInFlow: true, onError: 'continueErrorOutput' }
});

const count_Failure = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Count Failure', parameters: { jsCode: '// Counts consecutive failures in this execution ($runIndex is 0 on the first failure)\n// and keeps the error message for the alert email.\nconst input = $input.first().json || {};\nconst err = input.error;\nlet errorMessage = \'Unknown error\';\nif (typeof err === \'string\') errorMessage = err;\nelse if (err && (err.message || err.description)) errorMessage = [err.message, err.description].filter(Boolean).join(\' - \');\nelse errorMessage = JSON.stringify(input).slice(0, 500);\n\nreturn [{ json: { failureCount: $runIndex + 1, errorMessage } }];' }, position: [1104, 704], notes: 'Collects errors from every step and counts consecutive failures in this execution using the run index.', notesInFlow: true }
});

const retries_Left = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Retries Left', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 3 }, conditions: [{ id: 'retries-left-check', leftValue: expr('{{ $json.failureCount }}'), rightValue: 3, operator: { type: 'number', operation: 'lte' } }], combinator: 'and' }, options: {} }, position: [1344, 704], notes: 'Allows up to 3 retries after the initial failure. The 4th failure triggers the alert email.', notesInFlow: true }
});

const wait_Five_Minutes = node({
  type: 'n8n-nodes-base.wait',
  version: 1.1,
  config: { name: 'Wait Five Minutes', parameters: { amount: 5, unit: 'minutes' }, position: [1776, 512], webhookId: 'b502a9d0-b469-4894-90e8-79372836f51a', notes: 'Pauses 5 minutes before restarting from the Slack fetch with the same period.', notesInFlow: true }
});

const send_Failure_Alert = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Send Failure Alert', parameters: { sendTo: 'YOUR_EMAIL@gmail.com', subject: 'Échec de la synthèse Slack hebdomadaire', message: expr('<p>La synthèse Slack hebdomadaire n\'a pas pu être envoyée après {{ $json.failureCount }} tentatives (1 essai initial + 3 nouvelles tentatives espacées de 5 minutes).</p>\n<p><strong>Dernière erreur :</strong> {{ $json.errorMessage }}</p>\n<p>Exécution n8n : {{ $execution.id }} (workflow « {{ $workflow.name }} »).</p>'), options: { appendAttribution: false } }, credentials: { gmailOAuth2: newCredential('Gmail account') }, position: [1824, 880], webhookId: '0305c377-7274-4540-845c-17869166394c', notes: 'Alerts the same Gmail inbox when every retry has failed, with the last error message.', notesInFlow: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 5000 }
});

const has_Messages = node({
  type: 'n8n-nodes-base.if',
  version: 2.3,
  config: { name: 'Has Messages', parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 }, conditions: [{ id: 'has-messages-check', leftValue: expr('{{ $json.hasMessages }}'), rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }, position: [992, 128], notes: 'Routes to the AI summary when at least one message was posted, otherwise to the empty-week email.', notesInFlow: true }
});

const summarize_With_Gemini = node({
  type: '@n8n/n8n-nodes-langchain.googleGemini',
  version: 1.2,
  config: { name: 'Summarize With Gemini', parameters: { modelId: { __rl: true, mode: 'id', value: 'models/gemini-flash-latest' }, messages: { values: [{ content: expr('# Instructions\n<instructions>\n<goal>\nRédige une synthèse hebdomadaire courte et narrative des échanges du canal Slack #général ci-dessous, en français.\n</goal>\n\n<rules>\n1. Quelques phrases, deux ou trois courts paragraphes au maximum.\n2. Style narratif et fluide (pas de liste à puces), ton neutre et factuel.\n3. Mets en avant les sujets principaux, les décisions prises, les questions restées ouvertes et les échéances mentionnées.\n4. N\'invente rien : appuie-toi uniquement sur les messages fournis.\n5. Ne recopie pas les identifiants techniques Slack (du type <@U123ABC> ou <!channel>) ; parle plutôt d\'« un participant » si l\'auteur n\'est pas nommé.\n</rules>\n\n<output_format>\nRéponds uniquement avec un objet JSON valide, sans texte autour, de la forme :\n{"general": "synthèse du canal #général"}\nSépare les paragraphes par une ligne vide (\\n\\n).\n</output_format>\n</instructions>\n\n# Inputs\n<inputs>\n<period>Du {{ $(\'Compute Period\').first().json.periodStart }} au {{ $(\'Compute Period\').first().json.periodEnd }} (heure de Paris)</period>\n\n<channel name="#général" messages="{{ $json.generalCount }}">\n{{ $json.generalTranscript }}\n</channel>\n</inputs>') }] }, jsonOutput: true, builtInTools: {}, options: { systemMessage: 'Tu es un assistant qui résume des conversations Slack professionnelles en français, de façon concise, narrative et factuelle.', maxOutputTokens: 4096, temperature: 0.3 } }, credentials: { googlePalmApi: newCredential('Google Gemini(PaLM) Api account') }, position: [1296, 48], notes: 'Writes a short narrative French summary per channel with the free Gemini API tier. Returns JSON with one field per channel.', notesInFlow: true, onError: 'continueErrorOutput' }
});

const build_Summary_Email = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Summary Email', parameters: { jsCode: '// Parses the Gemini JSON answer and renders the HTML email body.\n// Any unreadable answer throws, which routes to the retry loop.\nconst period = $(\'Compute Period\').first().json;\nconst res = $input.first().json;\n\nlet summary = null;\nif (res && typeof res.general === \'string\') {\n  summary = res;\n} else {\n  let raw = \'\';\n  if (res && res.content && Array.isArray(res.content.parts)) {\n    raw = res.content.parts.map((p) => (typeof p.text === \'string\' ? p.text : \'\')).join(\'\');\n  } else if (res && typeof res.text === \'string\') {\n    raw = res.text;\n  }\n  raw = raw.replace(/^```(?:json)?\\s*/i, \'\').replace(/```\\s*$/, \'\').trim();\n  try {\n    summary = JSON.parse(raw);\n  } catch (e) {\n    throw new Error(\'Gemini returned an unreadable answer: \' + raw.slice(0, 300));\n  }\n}\nif (!summary || typeof summary.general !== \'string\' || !summary.general.trim()) {\n  throw new Error(\'Gemini answer is missing the summary.\');\n}\n\nconst escapeHtml = (s) => String(s).replace(/&/g, \'&amp;\').replace(/</g, \'&lt;\').replace(/>/g, \'&gt;\');\nconst toParagraphs = (s) => escapeHtml(s.trim())\n  .split(/\\n\\s*\\n/)\n  .map((p) => \'<p>\' + p.trim().replace(/\\n/g, \'<br>\') + \'</p>\')\n  .join(\'\');\n\nconst html = \'<p><em>Période couverte : du \' + period.periodStart + \' au \' + period.periodEnd + \' (heure de Paris).</em></p>\'\n  + \'<h2>#général</h2>\' + toParagraphs(summary.general);\n\nreturn [{ json: { subject: period.subject, html } }];' }, position: [1680, 48], notes: 'Parses the Gemini JSON answer and renders the HTML body with one section per channel. Throws on an unreadable answer so the retry loop kicks in.', notesInFlow: true, onError: 'continueErrorOutput' }
});

const send_Summary_Email = node({
  type: 'n8n-nodes-base.gmail',
  version: 2.2,
  config: { name: 'Send Summary Email', parameters: { sendTo: 'YOUR_EMAIL@gmail.com', subject: expr('{{ $json.subject }}'), message: expr('{{ $json.html }}'), options: { appendAttribution: false } }, credentials: { gmailOAuth2: newCredential('Gmail account') }, position: [2048, 240], webhookId: '8fcf1c68-94b6-42b4-8a21-7e051ae1fc54', notes: 'Sends the weekly digest (or the empty-week notice) to the personal Gmail inbox.', notesInFlow: true, executeOnce: true, onError: 'continueErrorOutput' }
});

const build_Empty_Email = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: { name: 'Build Empty Email', parameters: { jsCode: '// Builds the "nothing to report" email when the general channel was silent.\nconst period = $(\'Compute Period\').first().json;\nconst html = \'<p><em>Période couverte : du \' + period.periodStart + \' au \' + period.periodEnd + \' (heure de Paris).</em></p>\'\n  + \'<p>Rien à signaler cette semaine : aucun message n\\u2019a été publié dans #général.</p>\';\n\nreturn [{ json: { subject: period.subject, html } }];' }, position: [1584, 288], notes: 'Builds the nothing-to-report email with the usual subject when both channels were silent.', notesInFlow: true }
});

const wf = workflow('weeklySlackDigest', 'Weekly Slack Digest', { executionOrder: 'v1', timezone: 'Europe/Paris' });

export default wf
  .add(every_Friday_7_PM)
  .to(compute_Period)
  .to(fetch_General_Messages)
  .to(build_Transcript
  .onError(count_Failure
  .to(retries_Left.onTrue(wait_Five_Minutes
    .to(fetch_General_Messages)).onFalse(send_Failure_Alert))))
  .to(has_Messages.onTrue(summarize_With_Gemini
    .onError(count_Failure)
    .to(build_Summary_Email
    .onError(count_Failure))
    .to(send_Summary_Email
    .onError(count_Failure))).onFalse(build_Empty_Email
    .to(send_Summary_Email)))
  .add(sticky('## Mise en route\n1. **Slack** : identifiant de bot avec le scope `channels:history`, bot invité dans #général.\n2. **Gemini** : identifiant avec ta clé gratuite (sans facturation activée, pour garantir 0 €).\n3. **Gmail** : identifiant connecté et adresse renseignée dans les deux nœuds Gmail.\n4. Teste avec *Execute workflow*, puis active le workflow.', [], { name: 'Setup Note', color: 2, width: 520, height: 300, position: [-48, -80] }))
  .add(sticky('## Gestion des échecs\nToute erreur (Slack, Gemini, Gmail) part vers **Count Failure**. Le workflow retente en repartant de la lecture Slack sur la même période, avec une attente de 5 minutes entre deux essais (réglage de **Retries Left** et du nœud d\'attente). Au dernier échec, un seul e-mail d\'alerte est envoyé.', [], { name: 'Retry Note', color: 2, width: 620, height: 180, position: [1040, 912] }))
