/*
 * Backend for erhun.me/poll — deploy as a Google Apps Script web app (see README.md).
 * Data lives in a Google Sheet; invites are sent from the deploying account's primary calendar.
 */

const SHEETS = { polls: 'Polls', responses: 'Responses', events: 'Events' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('SHEET_ID')) {
    props.setProperty('SHEET_ID', SpreadsheetApp.create('erhun.me poll data').getId());
  }
  if (!props.getProperty('ADMIN_KEY')) {
    props.setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, ''));
  }
  Object.keys(SHEETS).forEach((k) => sheet_(SHEETS[k]));
  Calendar.Calendars.get('primary');
  Logger.log('Admin key: ' + props.getProperty('ADMIN_KEY'));
}

function doGet() {
  return ContentService.createTextOutput('Poll backend is running.');
}

function doPost(e) {
  let out;
  try {
    out = { ok: true, data: handle_(JSON.parse(e.postData.contents)) };
  } catch (err) {
    out = { ok: false, error: (err && err.message) || String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  switch (req.action) {
    case 'getPoll': return publicPoll_(req);
    case 'submit': return withLock_(() => submit_(req));
    case 'deleteOwn': return withLock_(() => deleteOwn_(req));
    default: break;
  }
  if (!isAdmin_(req.key)) throw new Error('Invalid admin key.');
  switch (req.action) {
    case 'adminCheck': return true;
    case 'adminListPolls': return listPolls_();
    case 'adminGetPoll': return adminPoll_(req.pollId);
    case 'adminCheckSlots': return availability_(pollSettings_(req.poll || {}), (req.poll && req.poll.options) || []);
    case 'adminSavePoll': return withLock_(() => savePoll_(req.poll || {}));
    case 'adminDeletePoll': return withLock_(() => deletePoll_(req.pollId));
    case 'adminDeleteResponse': return withLock_(() => deleteRows_(SHEETS.responses, (r) => r.id === req.responseId));
    case 'adminSaveEvent': return withLock_(() => saveEvent_(req.pollId, req.event || {}, req.eventId));
    case 'adminCancelEvent': return withLock_(() => cancelEvent_(req.eventId));
    default: throw new Error('Unknown action.');
  }
}

/* ---------- storage: one sheet per kind, rows of [id, pollId, json] ---------- */

function sheet_(name) {
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function rows_(name) {
  const sh = sheet_(name);
  const n = sh.getLastRow();
  if (!n) return [];
  return sh.getRange(1, 1, n, 3).getValues().map((r, i) => ({
    row: i + 1, id: String(r[0]), pollId: String(r[1]), data: JSON.parse(r[2]),
  }));
}

function find_(name, id) {
  return rows_(name).find((r) => r.id === id) || null;
}

function put_(name, id, pollId, data) {
  const sh = sheet_(name);
  const hit = find_(name, id);
  const values = [id, pollId || '', JSON.stringify(data)];
  if (hit) sh.getRange(hit.row, 1, 1, 3).setValues([values]);
  else sh.appendRow(values);
}

function deleteRows_(name, test) {
  const sh = sheet_(name);
  const hits = rows_(name).filter(test);
  if (!hits.length) throw new Error('Not found.');
  hits.reverse().forEach((r) => sh.deleteRow(r.row));
  return true;
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function isAdmin_(key) {
  const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return Boolean(stored) && key === stored;
}

function newId_(prefix) {
  return prefix + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
}

function clean_(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function clamp_(value, min, max, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/* ---------- polls ---------- */

function getPoll_(id) {
  const hit = find_(SHEETS.polls, String(id || ''));
  if (!hit) throw new Error('Poll not found.');
  return hit.data;
}

function responsesFor_(pollId) {
  return rows_(SHEETS.responses).filter((r) => r.pollId === pollId).map((r) => r.data)
    .sort((a, b) => a.created.localeCompare(b.created));
}

function savePoll_(p) {
  const existing = p.id ? find_(SHEETS.polls, p.id) : null;
  if (p.id && !existing) throw new Error('Poll not found.');
  const options = (Array.isArray(p.options) ? p.options : []).slice(0, 300).map((o) => ({
    id: /^o[a-z0-9]{12}$/.test(o.id) ? o.id : newId_('o'),
    day: clamp_(o.day, 0, 6, 0),
    start: /^([01]\d|2[0-3]):[0-5]\d$/.test(o.start) ? o.start : '09:00',
    duration: clamp_(o.duration, 5, 24 * 60, 60),
  })).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start) || a.duration - b.duration);

  const poll = {
    id: existing ? existing.id : newId_('p'),
    title: clean_(p.title, 200) || 'Untitled poll',
    description: clean_(p.description, 3000),
    location: clean_(p.location, 300),
    timezone: clean_(p.timezone, 64) || Session.getScriptTimeZone(),
    allowMaybe: p.allowMaybe !== false,
    hideResponses: Boolean(p.hideResponses),
    closed: Boolean(p.closed),
    options,
    created: existing ? existing.data.created : new Date().toISOString(),
  };
  Object.assign(poll, pollSettings_(p));
  put_(SHEETS.polls, poll.id, '', poll);
  return poll;
}

function deletePoll_(pollId) {
  deleteRows_(SHEETS.polls, (r) => r.id === pollId);
  [SHEETS.responses, SHEETS.events].forEach((name) => {
    if (rows_(name).some((r) => r.pollId === pollId)) deleteRows_(name, (r) => r.pollId === pollId);
  });
  return true;
}

function listPolls_() {
  const counts = {};
  rows_(SHEETS.responses).forEach((r) => { counts[r.pollId] = (counts[r.pollId] || 0) + 1; });
  return rows_(SHEETS.polls).map((r) => ({
    id: r.id, title: r.data.title, closed: r.data.closed, created: r.data.created,
    options: r.data.options.length, responses: counts[r.id] || 0,
  })).sort((a, b) => b.created.localeCompare(a.created));
}

function publicPoll_(req) {
  const poll = getPoll_(req.pollId);
  const all = responsesFor_(poll.id);
  const mine = req.responseId ? all.find((r) => r.id === req.responseId && r.token === req.token) : null;
  const visible = poll.hideResponses ? [] : all;
  if (poll.calendarCheck && poll.calendarHide) {
    const avail = availability_(poll, poll.options);
    if (!avail.error) poll.options = poll.options.filter((o, i) => avail.slots[i].busy <= poll.calendarTolerance);
  }
  ['calendarIds', 'calendarFrom', 'calendarWeeks', 'calendarTolerance'].forEach((k) => delete poll[k]);
  return {
    poll,
    responseCount: all.length,
    responses: visible.map((r) => ({ id: r.id, name: r.name, note: r.note, votes: r.votes })),
    mine: mine ? { id: mine.id, name: mine.name, email: mine.email, note: mine.note, votes: mine.votes } : null,
  };
}

function adminPoll_(pollId) {
  const poll = getPoll_(pollId);
  return {
    poll,
    responses: responsesFor_(poll.id).map((r) => ({
      id: r.id, name: r.name, email: r.email, note: r.note, votes: r.votes, created: r.created, updated: r.updated,
    })),
    events: rows_(SHEETS.events).filter((r) => r.pollId === poll.id).map((r) => r.data),
    availability: poll.calendarCheck ? availability_(poll, poll.options) : null,
  };
}

/* ---------- calendar availability (weekly slots checked against your free/busy) ---------- */

function pollSettings_(p) {
  return {
    timezone: clean_(p.timezone, 64) || Session.getScriptTimeZone(),
    calendarCheck: Boolean(p.calendarCheck),
    calendarHide: p.calendarHide !== false,
    calendarIds: clean_(p.calendarIds, 500) || 'primary',
    calendarFrom: /^\d{4}-\d\d-\d\d$/.test(p.calendarFrom) ? p.calendarFrom : '',
    calendarWeeks: clamp_(p.calendarWeeks, 1, 26, 8),
    calendarTolerance: clamp_(p.calendarTolerance, 0, 26, 0),
  };
}

function addDays_(date, days) {
  const d = date.split('-').map(Number);
  return new Date(Date.UTC(d[0], d[1] - 1, d[2]) + days * 86400000).toISOString().slice(0, 10);
}

function busyIntervals_(ids, timeMin, timeMax) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'fb:' + Utilities.base64Encode(ids.join(',') + '|' + timeMin + '|' + timeMax).slice(0, 200);
  const hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);

  const out = { busy: [], errors: [] };
  const end = new Date(timeMax).getTime();
  for (let t = new Date(timeMin).getTime(); t < end; t += 56 * 86400000) {
    const res = Calendar.Freebusy.query({
      timeMin: new Date(t).toISOString(),
      timeMax: new Date(Math.min(end, t + 56 * 86400000)).toISOString(),
      items: ids.map((id) => ({ id })),
    });
    ids.forEach((id) => {
      const cal = (res.calendars && res.calendars[id]) || {};
      if (cal.errors && cal.errors.length) out.errors.push(id + ': ' + cal.errors.map((e) => e.reason).join(', '));
      (cal.busy || []).forEach((b) => out.busy.push([new Date(b.start).getTime(), new Date(b.end).getTime()]));
    });
  }
  out.errors = out.errors.filter((e, i, all) => all.indexOf(e) === i);
  cache.put(cacheKey, JSON.stringify(out), 300);
  return out;
}

function availability_(settings, options) {
  const tz = settings.timezone;
  const from = settings.calendarFrom || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const weeks = settings.calendarWeeks;
  const ids = settings.calendarIds.split(/[\s,;]+/).filter(Boolean);
  const fromDay = (new Date(from + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const at = (date, time) => Utilities.parseDate(date + ' ' + time, tz, 'yyyy-MM-dd HH:mm').getTime();

  let found;
  try {
    found = busyIntervals_(ids, new Date(at(from, '00:00')).toISOString(), new Date(at(addDays_(from, weeks * 7 + 1), '00:00')).toISOString());
  } catch (err) {
    return { error: 'Could not read your calendar: ' + ((err && err.message) || err), from, weeks, slots: options.map(() => ({ busy: 0, total: weeks })) };
  }

  const slots = (options || []).map((o) => {
    const first = addDays_(from, (clamp_(o.day, 0, 6, 0) - fromDay + 7) % 7);
    let busy = 0;
    for (let w = 0; w < weeks; w += 1) {
      const start = at(addDays_(first, w * 7), /^([01]\d|2[0-3]):[0-5]\d$/.test(o.start) ? o.start : '09:00');
      const end = start + clamp_(o.duration, 5, 1440, 60) * 60000;
      if (found.busy.some((b) => b[0] < end && b[1] > start)) busy += 1;
    }
    return { busy, total: weeks };
  });
  return { from, weeks, slots, warnings: found.errors };
}

/* ---------- responses ---------- */

function submit_(req) {
  const poll = getPoll_(req.pollId);
  if (poll.closed) throw new Error('This poll is closed.');
  const name = clean_(req.name, 100);
  const email = clean_(req.email, 200).toLowerCase();
  if (!name) throw new Error('Please enter your name.');
  if (!EMAIL_RE.test(email)) throw new Error('Please enter a valid email address.');

  const optionIds = poll.options.map((o) => o.id);
  const votes = {};
  Object.keys(req.votes || {}).forEach((id) => {
    const v = req.votes[id];
    if (optionIds.indexOf(id) !== -1 && (v === 'yes' || (v === 'maybe' && poll.allowMaybe))) votes[id] = v;
  });
  const now = new Date().toISOString();
  const note = clean_(req.note, 300);

  let response;
  if (req.responseId) {
    const hit = find_(SHEETS.responses, req.responseId);
    if (!hit || hit.pollId !== poll.id || hit.data.token !== req.token) {
      throw new Error('This response can no longer be edited from this browser.');
    }
    response = Object.assign(hit.data, { name, email, note, votes, updated: now });
  } else {
    response = { id: newId_('r'), token: newId_('t') + newId_(''), name, email, note, votes, created: now, updated: now };
  }
  put_(SHEETS.responses, response.id, poll.id, response);
  return { responseId: response.id, token: response.token };
}

function deleteOwn_(req) {
  return deleteRows_(SHEETS.responses, (r) => r.id === req.responseId && r.pollId === req.pollId && r.data.token === req.token);
}

/* ---------- calendar events ---------- */

function localPlus_(date, time, minutes) {
  const d = date.split('-').map(Number);
  const t = time.split(':').map(Number);
  return new Date(Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]) + minutes * 60000).toISOString().slice(0, 19);
}

function saveEvent_(pollId, ev, eventId) {
  const poll = getPoll_(pollId);
  const existing = eventId ? find_(SHEETS.events, eventId) : null;
  if (eventId && !existing) throw new Error('Event not found.');

  const date = String(ev.date || '');
  const time = String(ev.time || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(date)) throw new Error('Please choose a date.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Please choose a start time.');
  const duration = clamp_(ev.duration, 5, 24 * 60, 60);
  const attendees = (Array.isArray(ev.attendees) ? ev.attendees : [])
    .map((e) => clean_(e, 200).toLowerCase())
    .filter((e, i, all) => EMAIL_RE.test(e) && all.indexOf(e) === i);
  if (!attendees.length) throw new Error('Choose at least one person to invite.');

  const repeat = ev.repeat === 'weekly' ? 'weekly' : 'none';
  const interval = clamp_(ev.interval, 1, 52, 1);
  const ends = ['never', 'until', 'count'].indexOf(ev.ends) !== -1 ? ev.ends : 'never';
  const until = /^\d{4}-\d\d-\d\d$/.test(ev.until) ? ev.until : '';
  const count = clamp_(ev.count, 1, 500, 10);
  let rule = '';
  if (repeat === 'weekly') {
    rule = 'RRULE:FREQ=WEEKLY;INTERVAL=' + interval;
    if (ends === 'until' && until) rule += ';UNTIL=' + until.replace(/-/g, '') + 'T235959Z';
    if (ends === 'count') rule += ';COUNT=' + count;
  }

  const record = {
    pollId,
    optionId: clean_(ev.optionId, 40),
    title: clean_(ev.title, 200) || poll.title,
    description: clean_(ev.description, 5000),
    location: clean_(ev.location, 300),
    date, time, duration, repeat, interval, ends, until, count, attendees,
    meet: Boolean(ev.meet) || Boolean(existing && existing.data.meetLink),
    timezone: poll.timezone,
  };
  const resource = {
    summary: record.title,
    description: record.description,
    location: record.location,
    start: { dateTime: date + 'T' + time + ':00', timeZone: poll.timezone },
    end: { dateTime: localPlus_(date, time, duration), timeZone: poll.timezone },
    attendees: attendees.map((email) => ({ email })),
    recurrence: rule ? [rule] : [],
  };
  if (ev.meet && !(existing && existing.data.meetLink)) {
    resource.conferenceData = { createRequest: { requestId: newId_('m'), conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  }

  const options = { sendUpdates: 'all', conferenceDataVersion: 1 };
  const saved = existing
    ? Calendar.Events.patch(resource, 'primary', eventId, options)
    : Calendar.Events.insert(resource, 'primary', options);

  Object.assign(record, {
    id: saved.id,
    htmlLink: saved.htmlLink || '',
    meetLink: saved.hangoutLink || (existing && existing.data.meetLink) || '',
    created: existing ? existing.data.created : new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  put_(SHEETS.events, saved.id, pollId, record);
  return record;
}

function cancelEvent_(eventId) {
  if (!find_(SHEETS.events, eventId)) throw new Error('Event not found.');
  try {
    Calendar.Events.remove('primary', eventId, { sendUpdates: 'all' });
  } catch (err) {
    if (!/not found|deleted|404|410/i.test(String(err && err.message))) throw err;
  }
  return deleteRows_(SHEETS.events, (r) => r.id === eventId);
}
