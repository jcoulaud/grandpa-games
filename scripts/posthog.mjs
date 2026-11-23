// Sets up the PostHog project of jeux-papi.fr: its recording settings, two dashboards and their charts.
// Run it again after a change here: it finds the dashboards and the charts by name and updates them.
//
//   POSTHOG_PERSONAL_API_KEY=phx_... [POSTHOG_PROJECT_ID=363241] node scripts/posthog.mjs
//
// The key needs the scopes project:write, dashboard:write and insight:write. The events come from
// public/lib/ph.js, store.js and kit.js.
const HOST = 'https://eu.posthog.com';
const TOKEN = 'phc_te2NfQa4rJfJW5G3GYCQjZt9bw3LEzTG4USXJeZijxSx'; // the project key in public/lib/ph.js
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
if (!KEY) { console.error('Set POSTHOG_PERSONAL_API_KEY.'); process.exit(1); }

async function api(method, path, body) {
  const res = await fetch(HOST + path, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}
const all = async path => {
  const out = [];
  for (let url = path; url; ) {
    const page = await api('GET', url);
    out.push(...page.results);
    url = page.next && page.next.replace(HOST, '');
  }
  return out;
};

const is = (key, value) => ({ key, value: [value].flat(), operator: 'exact', type: 'event' });
const event = (name, { math = 'total', props = [], label } = {}) =>
  ({ kind: 'EventsNode', event: name, name, custom_name: label, math, properties: props });
const DAYS = { date_from: '-30d' };
const trends = (series, { breakdown, display = 'ActionsLineGraph', interval = 'day', formula } = {}) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'TrendsQuery', series, interval, dateRange: DAYS,
    breakdownFilter: breakdown ? { breakdown, breakdown_type: 'event', breakdown_limit: 25 } : undefined,
    trendsFilter: { display, ...(formula ? { formula } : {}) },
  },
});
const funnel = (series, breakdown) => ({
  kind: 'InsightVizNode',
  source: {
    kind: 'FunnelsQuery', series, dateRange: DAYS,
    funnelsFilter: { funnelWindowInterval: 1, funnelWindowIntervalUnit: 'day', funnelVizType: 'steps' },
    breakdownFilter: breakdown ? { breakdown, breakdown_type: 'event' } : undefined,
  },
});

const rulesPage = event('$pageview', { props: [is('page_type', 'rules')], label: 'Page de règles vue' });
const blogPage = event('$pageview', { props: [is('page_type', 'blog')], label: 'Article du blog vu' });
const libraryPage = event('$pageview', { props: [is('page_type', 'library')], label: 'Bibliothèque ouverte' });
const play = event('play clicked', { label: 'Clic sur Jouer' });
const started = event('game started', { label: 'Partie commencée' });
const won = event('game won', { label: 'Partie gagnée' });

const DASHBOARDS = [
  {
    name: 'Jeux de Papi : les parties',
    description: 'Les visiteurs, les jeux joués, les victoires, les niveaux et les aides.',
    insights: [
      ['Visiteurs par jour, par type de page', trends([event('$pageview', { math: 'dau' })], { breakdown: 'page_type' })],
      ['Parties commencées par jeu', trends([started], { breakdown: 'game', display: 'ActionsBarValue' })],
      ['Parties gagnées par jeu', trends([won], { breakdown: 'game', display: 'ActionsBarValue' })],
      ['Part des parties gagnées par jeu (%)', trends([started, won], { breakdown: 'game', display: 'ActionsBarValue', formula: 'B / A * 100' })],
      ['Parties commencées par niveau', trends([started], { breakdown: 'level', display: 'ActionsBarValue' })],
      ['Part des parties gagnées par niveau (%)', trends([started, won], { breakdown: 'level', display: 'ActionsBarValue', formula: 'B / A * 100' })],
      ['Parties commencées et gagnées par jour', trends([started, won], { interval: 'day' })],
      ['Joueurs par jour', trends([event('game started', { math: 'dau', label: 'Joueurs' })])],
      ['Indices et rappels par jeu', trends([event('hint used', { label: 'Indice' }), event('nudge shown', { label: 'Rappel' })], { breakdown: 'game', display: 'ActionsBarValue' })],
      ['Guide des règles lu jusqu’au bout', trends([event('rules guide closed')], { breakdown: 'read_all', display: 'ActionsPie' })],
      ['Application installée ou onglet du navigateur', trends([event('$pageview', { math: 'dau' })], { breakdown: 'installed' })],
      ['Installations de l’application', trends([event('app installed')], { interval: 'week' })],
      ['Les joueurs reviennent-ils jouer ?', {
        kind: 'InsightVizNode',
        source: {
          kind: 'RetentionQuery', dateRange: { date_from: '-8w' },
          retentionFilter: {
            period: 'Week', totalIntervals: 8, retentionType: 'retention_first_time',
            targetEntity: { id: 'game started', name: 'game started', type: 'events' },
            returningEntity: { id: 'game started', name: 'game started', type: 'events' },
          },
        },
      }],
    ],
  },
  {
    name: 'Jeux de Papi : les visiteurs',
    description: 'Les pages de règles, le blog, d’où viennent les visiteurs et combien finissent par jouer.',
    insights: [
      ['Des règles à la partie', funnel([rulesPage, play, started, won])],
      ['Des règles à la partie, par jeu', funnel([rulesPage, play, started], 'game')],
      ['Du blog à la partie', funnel([blogPage, started])],
      ['De la bibliothèque à la victoire', funnel([libraryPage, started, won])],
      ['Premier guide, puis partie', funnel([event('rules guide opened', { props: [is('first_visit', true)], label: 'Premier guide ouvert' }), started, won])],
      ['Pages de règles vues par jeu', trends([event('$pageview', { props: [is('page_type', 'rules')] })], { breakdown: 'game', display: 'ActionsBarValue' })],
      ['Articles du blog vus', trends([event('$pageview', { props: [is('page_type', 'blog')] })], { breakdown: '$pathname', display: 'ActionsBarValue' })],
      ['Clics sur Jouer par jeu', trends([play], { breakdown: 'to_game', display: 'ActionsBarValue' })],
      ['D’où viennent les visiteurs', trends([event('$pageview', { math: 'dau' })], { breakdown: '$referring_domain', display: 'ActionsTable' })],
      ['Pays des visiteurs', trends([event('$pageview', { math: 'dau' })], { breakdown: '$geoip_country_name', display: 'ActionsTable' })],
      ['Appareils des visiteurs', trends([event('$pageview', { math: 'dau' })], { breakdown: '$device_type', display: 'ActionsPie' })],
    ],
  },
];

// The project of the site: POSTHOG_PROJECT_ID, else the project selected in PostHog. Nothing is written
// unless it is the project of the key in public/lib/ph.js.
const project = await api('GET', `/api/projects/${process.env.POSTHOG_PROJECT_ID || '@current'}/`);
if (project.api_token !== TOKEN) {
  console.error(`Project ${project.name} is not the project of jeux-papi.fr. Set POSTHOG_PROJECT_ID to its id.`);
  process.exit(1);
}
const P = `/api/projects/${project.id}`;
console.log(`project ${project.name} (${project.id})`);

// Recordings, errors, heatmaps and the speed of the pages.
await api('PATCH', `${P}/`, {
  session_recording_opt_in: true,
  autocapture_exceptions_opt_in: true,
  capture_performance_opt_in: true,
  autocapture_web_vitals_opt_in: true,
  heatmaps_opt_in: true,
  autocapture_opt_out: false,
});
console.log('settings: recordings, errors, heatmaps and page speed on');

const dashboards = await all(`${P}/dashboards/?limit=100`);
const insights = await all(`${P}/insights/?limit=200&saved=true`);
for (const d of DASHBOARDS) {
  let dash = dashboards.find(x => x.name === d.name && !x.deleted);
  dash = dash ? await api('PATCH', `${P}/dashboards/${dash.id}/`, { description: d.description })
    : await api('POST', `${P}/dashboards/`, { name: d.name, description: d.description });
  for (const [name, query] of d.insights) {
    const old = insights.find(i => i.name === name && !i.deleted);
    if (old) await api('PATCH', `${P}/insights/${old.id}/`, { query, dashboards: [...new Set([...(old.dashboards || []), dash.id])] });
    else await api('POST', `${P}/insights/`, { name, query, dashboards: [dash.id], saved: true });
  }
  console.log(`${d.name}: ${d.insights.length} charts, ${HOST}/project/${project.id}/dashboard/${dash.id}`);
}
