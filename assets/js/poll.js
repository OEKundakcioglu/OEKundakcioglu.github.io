(() => {
  'use strict';

  const root = document.getElementById('poll-app');
  if (!root) return;

  const API = root.dataset.api;
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const SHORT = DAYS.map((d) => d.slice(0, 3));
  const params = new URLSearchParams(location.search);
  const KEY_STORE = 'poll:admin-key';

  /* ---------- helpers ---------- */

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (['value', 'checked', 'disabled', 'selected', 'type', 'readOnly'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach((kid) => {
      if (kid == null || kid === false) return;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    });
    return el;
  }

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } },
  };

  async function api(action, payload) {
    if (!API) throw new Error('The poll backend is not set up yet (poll_api in _config.yml).');
    let res;
    try {
      res = await fetch(API, { method: 'POST', body: JSON.stringify(Object.assign({ action }, payload)) });
    } catch (e) {
      throw new Error('Could not reach the server. Please check your connection and try again.');
    }
    if (!res.ok) throw new Error(`Server error (${res.status}).`);
    const out = await res.json();
    if (!out.ok) throw new Error(out.error || 'Something went wrong.');
    return out.data;
  }

  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  const fromMin = (m) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const timeRange = (o) => `${o.start}–${fromMin(toMin(o.start) + o.duration)}`;
  const optLabel = (o) => `${SHORT[o.day]} ${timeRange(o)}`;
  const durLabel = (m) => (m < 60 ? `${m} min` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);
  const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayOfDate = (s) => (new Date(`${s}T12:00:00`).getDay() + 6) % 7;
  const nextDate = (day) => {
    const d = new Date();
    d.setDate(d.getDate() + (((day - (d.getDay() + 6) % 7) + 7) % 7 || 7));
    return isoDate(d);
  };
  const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } };

  function screen(...kids) {
    root.replaceChildren(...kids.flat(Infinity).filter(Boolean));
  }

  function fail(message) {
    screen(h('div', { class: 'pl-card pl-error-card' }, message));
  }

  let toastTimer;
  function toast(message, isError) {
    let el = document.querySelector('.pl-toast');
    if (!el) { el = h('div', { class: 'pl-toast', role: 'status' }); document.body.append(el); }
    el.textContent = message;
    el.classList.toggle('is-error', Boolean(isError));
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-on'), isError ? 7000 : 4000);
  }

  async function busy(button, fn) {
    button.disabled = true;
    try { return await fn(); } finally { button.disabled = false; }
  }

  function field(label, input, hint) {
    return h('label', { class: 'pl-field' }, h('span', { class: 'pl-label' }, label), input, hint ? h('span', { class: 'pl-hint' }, hint) : null);
  }

  /* ---------- the availability grid ---------- */

  const MARK = { yes: '✓', maybe: '(✓)' };
  const WORD = { yes: 'yes', maybe: 'if need be', no: 'no' };

  function grid(poll, rows, edit, cal) {
    const opts = poll.options;
    const tally = opts.map((o) => {
      const all = rows.map((r) => r.votes).concat(edit ? [edit.votes] : []);
      return { yes: all.filter((v) => v[o.id] === 'yes').length, maybe: all.filter((v) => v[o.id] === 'maybe').length };
    });
    const top = Math.max(0, ...tally.map((t) => t.yes * 2 + t.maybe));
    const best = tally.map((t) => top > 0 && t.yes * 2 + t.maybe === top);

    const groups = [];
    opts.forEach((o) => {
      const last = groups[groups.length - 1];
      if (last && last.day === o.day) last.span += 1;
      else groups.push({ day: o.day, span: 1 });
    });

    const cell = (o, i, vote) => h('td', { class: `pl-cell pl-${vote || 'no'}${best[i] ? ' is-best' : ''}`, title: `${optLabel(o)}: ${WORD[vote || 'no']}` }, MARK[vote] || '');

    const editCell = (o, i) => {
      const vote = edit.votes[o.id] || 'no';
      return h('td', { class: `pl-cell pl-input${best[i] ? ' is-best' : ''}` },
        h('button', {
          type: 'button',
          class: `pl-toggle pl-${vote}`,
          'aria-label': `${DAYS[o.day]} ${timeRange(o)}: ${WORD[vote]}`,
          onclick: () => {
            const order = poll.allowMaybe ? ['no', 'yes', 'maybe'] : ['no', 'yes'];
            const next = order[(order.indexOf(vote) + 1) % order.length];
            if (next === 'no') delete edit.votes[o.id]; else edit.votes[o.id] = next;
            edit.onChange();
          },
        }, MARK[vote] || ''));
    };

    return h('div', { class: 'pl-scroll' }, h('table', { class: 'pl-grid' },
      h('thead', null,
        h('tr', null, h('th', { class: 'pl-name', rowspan: 2 }, `${rows.length} participant${rows.length === 1 ? '' : 's'}`),
          groups.map((g) => h('th', { colspan: g.span, class: 'pl-day' }, DAYS[g.day]))),
        h('tr', null, opts.map((o, i) => h('th', { class: `pl-time${best[i] ? ' is-best' : ''}` },
          h('span', null, o.start), h('span', { class: 'pl-time-end' }, fromMin(toMin(o.start) + o.duration)))))),
      h('tbody', null,
        rows.map((r) => h('tr', null,
          h('th', { class: 'pl-name', scope: 'row' },
            h('span', { class: 'pl-person' }, r.name),
            r.sub ? h('span', { class: 'pl-sub' }, r.sub) : null,
            r.note ? h('span', { class: 'pl-note' }, r.note) : null,
            r.action || null),
          opts.map((o, i) => cell(o, i, r.votes[o.id])))),
        edit ? h('tr', { class: 'pl-edit-row' }, h('th', { class: 'pl-name', scope: 'row' }, edit.nameInput), opts.map(editCell)) : null),
      h('tfoot', null, h('tr', null, h('th', { class: 'pl-name' }, 'Available'),
        tally.map((t, i) => h('td', { class: `pl-count${best[i] ? ' is-best' : ''}` },
          h('strong', null, String(t.yes)), t.maybe ? h('span', { class: 'pl-sub' }, ` +${t.maybe}`) : null))),
      cal ? h('tr', { class: 'pl-cal-row' }, h('th', { class: 'pl-name' }, 'Your calendar', h('span', { class: 'pl-sub' }, `next ${cal.weeks} weeks`)),
        cal.slots.map((c) => calCell(c, cal.hideAbove))) : null)));
  }

  function calCell(c, hideAbove) {
    const hidden = hideAbove != null && c.busy > hideAbove;
    return h('td', { class: `pl-cal ${c.busy ? 'is-busy' : 'is-free'}`, title: `Busy in ${c.busy} of ${c.total} weeks${hidden ? ' · hidden from participants' : ''}` },
      c.busy ? `${c.busy}/${c.total}` : 'free', hidden ? h('span', { class: 'pl-sub pl-cal-hidden' }, 'hidden') : null);
  }

  function legend(poll) {
    return h('p', { class: 'pl-legend' },
      h('span', { class: 'pl-chip pl-yes' }, '✓'), ' Yes',
      poll.allowMaybe ? [h('span', { class: 'pl-chip pl-maybe' }, '(✓)'), ' If need be'] : null,
      h('span', { class: 'pl-chip pl-no' }), ' No');
  }

  function pollHeader(poll, extra) {
    return h('header', { class: 'pl-head' },
      h('h1', null, poll.title),
      poll.description ? h('p', { class: 'pl-desc' }, poll.description) : null,
      h('p', { class: 'pl-meta' },
        poll.location ? h('span', null, `Location: ${poll.location}`) : null,
        h('span', null, `Weekly times, shown in ${poll.timezone}`),
        extra || null));
  }

  /* ---------- participant view ---------- */

  async function votePage(message) {
    const pollId = params.get('id');
    if (!pollId) return fail('This poll link is incomplete. Please check the link you were given.');
    const storeKey = `poll:${pollId}`;
    let mineRef = store.get(storeKey);
    let data;
    try {
      data = await api('getPoll', { pollId, responseId: mineRef && mineRef.responseId, token: mineRef && mineRef.token });
    } catch (e) {
      return fail(e.message);
    }
    if (mineRef && !data.mine) { store.del(storeKey); mineRef = null; }

    const { poll, mine } = data;
    document.title = `${poll.title} | ${document.title.split('|').pop().trim()}`;
    const others = data.responses.filter((r) => !mine || r.id !== mine.id);
    const edit = {
      votes: Object.assign({}, mine ? mine.votes : {}),
      nameInput: h('input', { class: 'pl-input-text', type: 'text', value: mine ? mine.name : '', placeholder: 'Your name', 'aria-label': 'Your name', maxlength: 100 }),
      onChange: () => draw(),
    };
    const email = h('input', { class: 'pl-input-text', type: 'email', value: mine ? mine.email : '', placeholder: 'you@example.com', maxlength: 200 });
    const note = h('input', { class: 'pl-input-text', type: 'text', value: mine ? mine.note : '', placeholder: 'Optional', maxlength: 300 });
    const gridBox = h('div');

    function draw() {
      gridBox.replaceChildren(poll.closed ? grid(poll, mine ? others.concat([mine]) : others, null) : grid(poll, others, edit));
    }

    async function save(button) {
      await busy(button, async () => {
        try {
          const out = await api('submit', {
            pollId, name: edit.nameInput.value, email: email.value, note: note.value, votes: edit.votes,
            responseId: mine && mine.id, token: mineRef && mineRef.token,
          });
          store.set(storeKey, out);
          votePage(mine ? 'Your availability is updated.' : 'Thank you! Your availability is saved. You can come back to this link to change it.');
        } catch (e) {
          toast(e.message, true);
        }
      });
    }

    async function remove(button) {
      if (!window.confirm('Delete your response from this poll?')) return;
      await busy(button, async () => {
        try {
          await api('deleteOwn', { pollId, responseId: mine.id, token: mineRef.token });
          store.del(storeKey);
          votePage('Your response is deleted.');
        } catch (e) {
          toast(e.message, true);
        }
      });
    }

    draw();
    const saveBtn = h('button', { type: 'button', class: 'pl-btn pl-btn-primary', onclick: (e) => save(e.currentTarget) }, mine ? 'Update my availability' : 'Save my availability');

    screen(
      pollHeader(poll, h('span', null, `${data.responseCount} response${data.responseCount === 1 ? '' : 's'}`)),
      message ? h('div', { class: 'pl-banner' }, message) : null,
      poll.closed ? h('div', { class: 'pl-banner pl-banner-muted' }, 'This poll is closed.') : null,
      !poll.options.length ? h('div', { class: 'pl-banner pl-banner-muted' }, 'This poll has no time slots yet.') : null,
      poll.options.length ? [
        poll.closed ? null : h('p', { class: 'pl-muted' }, 'Click the boxes in your row to mark when you are available every week.'),
        legend(poll),
        gridBox,
        poll.hideResponses ? h('p', { class: 'pl-hint' }, 'Other responses are only visible to the organizer.') : null,
      ] : null,
      poll.closed || !poll.options.length ? null : h('div', { class: 'pl-card pl-form' },
        field('Email', email, 'Only the organizer sees your email. It is used to send you the meeting invitation.'),
        field('Note', note),
        h('div', { class: 'pl-actions' }, saveBtn,
          mine ? h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: (e) => remove(e.currentTarget) }, 'Delete my response') : null)));
    return null;
  }

  /* ---------- admin ---------- */

  async function adminPage() {
    let key = store.get(KEY_STORE);
    if (key) {
      try { await api('adminCheck', { key }); } catch (e) { key = null; store.del(KEY_STORE); }
    }
    if (!key) return adminLogin();
    const id = params.get('id');
    if (!id) return adminList(key);
    if (id === 'new') return screen(h('p', null, h('a', { href: '?' }, '← All polls')), h('h1', null, 'New poll'), editor(key, null));
    return adminPoll(key, id);
  }

  function adminLogin() {
    const input = h('input', { class: 'pl-input-text', type: 'password', autocomplete: 'current-password' });
    const form = h('form', { class: 'pl-card pl-form', onsubmit: async (e) => {
      e.preventDefault();
      const button = form.querySelector('button');
      await busy(button, async () => {
        try {
          await api('adminCheck', { key: input.value.trim() });
          store.set(KEY_STORE, input.value.trim());
          adminPage();
        } catch (err) {
          toast(err.message, true);
        }
      });
    } }, field('Admin key', input, ''),
    h('div', { class: 'pl-actions' }, h('button', { type: 'submit', class: 'pl-btn pl-btn-primary' }, 'Sign in')));
    screen(h('h1', null, 'Polls'), form);
  }

  async function adminList(key) {
    let polls;
    try { polls = await api('adminListPolls', { key }); } catch (e) { return fail(e.message); }
    screen(
      h('div', { class: 'pl-titlebar' }, h('h1', null, 'Polls'),
        h('div', { class: 'pl-actions' },
          h('a', { class: 'pl-btn pl-btn-primary', href: '?id=new' }, 'New poll'),
          h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: () => { store.del(KEY_STORE); adminPage(); } }, 'Sign out'))),
      polls.length ? h('div', { class: 'pl-list' }, polls.map((p) => h('a', { class: 'pl-list-item', href: `?id=${encodeURIComponent(p.id)}` },
        h('span', { class: 'pl-person' }, p.title),
        h('span', { class: 'pl-sub' }, `${p.responses} response${p.responses === 1 ? '' : 's'} · ${p.options} slot${p.options === 1 ? '' : 's'}${p.closed ? ' · closed' : ''} · created ${p.created.slice(0, 10)}`))))
        : h('p', { class: 'pl-muted' }, 'No polls yet.'));
    return null;
  }

  async function adminPoll(key, pollId, message) {
    let data;
    try { data = await api('adminGetPoll', { key, pollId }); } catch (e) { return fail(e.message); }
    const { poll } = data;
    const refresh = (msg) => {
      const y = window.scrollY;
      return adminPoll(key, pollId).then(() => { window.scrollTo(0, y); if (msg) toast(msg); });
    };

    const link = `${location.origin}${location.pathname.replace(/admin\/?$/, '')}?id=${encodeURIComponent(poll.id)}`;
    const linkInput = h('input', { class: 'pl-input-text', type: 'text', readOnly: true, value: link, onfocus: (e) => e.target.select() });
    const share = h('div', { class: 'pl-card pl-share' },
      h('span', { class: 'pl-label' }, 'Share this link'),
      h('div', { class: 'pl-row' }, linkInput,
        h('button', { type: 'button', class: 'pl-btn', onclick: async () => {
          try { await navigator.clipboard.writeText(link); toast('Link copied.'); } catch (e) { linkInput.select(); }
        } }, 'Copy'),
        h('a', { class: 'pl-btn', href: link, target: '_blank', rel: 'noopener' }, 'Open')));

    const rows = data.responses.map((r) => ({
      name: r.name, sub: r.email, note: r.note, votes: r.votes,
      action: h('button', { type: 'button', class: 'pl-link-danger', onclick: async (e) => {
        if (!window.confirm(`Delete ${r.name}'s response?`)) return;
        await busy(e.currentTarget, async () => {
          try { await api('adminDeleteResponse', { key, responseId: r.id }); refresh(`${r.name}'s response is deleted.`); } catch (err) { toast(err.message, true); }
        });
      } }, 'Delete'),
    }));

    const avail = data.availability;
    const calOk = avail && !avail.error;
    const calInfo = calOk ? { weeks: avail.weeks, slots: avail.slots, hideAbove: poll.calendarHide ? poll.calendarTolerance : null } : null;
    const hiddenCount = calOk && poll.calendarHide ? avail.slots.filter((c) => c.busy > poll.calendarTolerance).length : 0;
    const scheduleBox = h('div');
    const showSchedule = (event) => scheduleBox.replaceChildren(scheduler(key, data, event, refresh));
    showSchedule(null);

    screen(
      h('p', null, h('a', { href: '?' }, '← All polls')),
      pollHeader(poll, poll.closed ? h('span', null, 'Closed') : null),
      message ? h('div', { class: 'pl-banner' }, message) : null,
      avail && avail.error ? h('div', { class: 'pl-banner pl-banner-warn' }, `${avail.error} Participants currently see all slots.`) : null,
      calOk && avail.warnings && avail.warnings.length ? h('div', { class: 'pl-banner pl-banner-warn' }, `Some calendars could not be read (${avail.warnings.join('; ')}). Check the calendar IDs in Poll settings.`) : null,
      hiddenCount ? h('div', { class: 'pl-banner pl-banner-muted' }, `${hiddenCount} slot${hiddenCount === 1 ? ' is' : 's are'} hidden from participants because your calendar is busy then.`) : null,
      share,
      h('h2', null, `Responses (${data.responses.length})`),
      poll.options.length && (data.responses.length || calInfo) ? [legend(poll), grid(poll, rows, null, calInfo)] : null,
      !poll.options.length || !data.responses.length ? h('p', { class: 'pl-muted' }, poll.options.length ? 'No responses yet.' : 'Add time slots below to start collecting responses.') : null,
      h('h2', null, 'Send a calendar invite'),
      scheduleBox,
      data.events.length ? [h('h2', null, 'Invites sent'), h('div', { class: 'pl-list' }, data.events.map((ev) => eventCard(key, ev, showSchedule, refresh)))] : null,
      h('h2', null, 'Poll settings'),
      editor(key, poll, calOk ? avail : null));
    return null;
  }

  function eventCard(key, ev, edit, refresh) {
    const when = ev.repeat === 'weekly'
      ? `Every ${ev.interval > 1 ? `${ev.interval} weeks on ` : ''}${DAYS[dayOfDate(ev.date)]} at ${ev.time}, from ${ev.date}${ev.ends === 'until' && ev.until ? ` until ${ev.until}` : ev.ends === 'count' ? ` (${ev.count} times)` : ''}`
      : `${DAYS[dayOfDate(ev.date)]} ${ev.date} at ${ev.time}`;
    return h('div', { class: 'pl-list-item pl-event' },
      h('span', { class: 'pl-person' }, ev.title),
      h('span', { class: 'pl-sub' }, `${when} · ${durLabel(ev.duration)} (${ev.timezone})${ev.location ? ` · ${ev.location}` : ''}`),
      h('span', { class: 'pl-sub' }, `${ev.attendees.length} guest${ev.attendees.length === 1 ? '' : 's'}: ${ev.attendees.join(', ')}`),
      h('div', { class: 'pl-actions' },
        ev.htmlLink ? h('a', { class: 'pl-btn', href: ev.htmlLink, target: '_blank', rel: 'noopener' }, 'Open in Google Calendar') : null,
        ev.meetLink ? h('a', { class: 'pl-btn', href: ev.meetLink, target: '_blank', rel: 'noopener' }, 'Meet link') : null,
        h('button', { type: 'button', class: 'pl-btn', onclick: () => { edit(ev); document.querySelector('.pl-schedule').scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 'Edit'),
        h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: async (e) => {
          if (!window.confirm(`Cancel "${ev.title}" and notify ${ev.attendees.length} guest${ev.attendees.length === 1 ? '' : 's'}?`)) return;
          await busy(e.currentTarget, async () => {
            try { await api('adminCancelEvent', { key, eventId: ev.id }); refresh('The meeting is cancelled and guests are notified.'); } catch (err) { toast(err.message, true); }
          });
        } }, 'Cancel meeting')));
  }

  function scheduler(key, data, editing, refresh) {
    const { poll, responses } = data;
    const withEmail = responses.filter((r) => r.email);
    const ev = editing || {};
    const optSelect = h('select', { class: 'pl-input-text' },
      h('option', { value: '' }, '— choose a time slot —'),
      poll.options.map((o, i) => {
        const c = data.availability && !data.availability.error ? data.availability.slots[i] : null;
        const yes = responses.filter((r) => r.votes[o.id] === 'yes').length;
        const maybe = responses.filter((r) => r.votes[o.id] === 'maybe').length;
        return h('option', { value: o.id, selected: o.id === ev.optionId }, `${optLabel(o)} · ${yes} yes${maybe ? `, ${maybe} if need be` : ''}${c ? (c.busy ? ` · you are busy ${c.busy}/${c.total} weeks` : ' · you are free') : ''}`);
      }));

    const checks = withEmail.map((r) => ({ r, box: h('input', { type: 'checkbox', checked: Boolean(editing && ev.attendees.includes(r.email)) }), mark: h('span', { class: 'pl-chip' }) }));
    const extras = h('textarea', { class: 'pl-input-text', rows: 2, placeholder: 'other@example.com, another@example.com' });
    if (editing) extras.value = ev.attendees.filter((a) => !withEmail.some((r) => r.email === a)).join(', ');

    const title = h('input', { class: 'pl-input-text', type: 'text', value: ev.title || poll.title, maxlength: 200 });
    const date = h('input', { class: 'pl-input-text', type: 'date', value: ev.date || '' });
    const time = h('input', { class: 'pl-input-text', type: 'time', value: ev.time || '' });
    const duration = h('input', { class: 'pl-input-text', type: 'number', min: 5, max: 1440, step: 5, value: ev.duration || 60 });
    const loc = h('input', { class: 'pl-input-text', type: 'text', value: editing ? ev.location : poll.location, maxlength: 300 });
    const desc = h('textarea', { class: 'pl-input-text', rows: 3 });
    desc.value = editing ? ev.description : poll.description;
    const repeat = h('select', { class: 'pl-input-text' }, h('option', { value: 'none' }, 'Does not repeat'), h('option', { value: 'weekly', selected: ev.repeat === 'weekly' }, 'Weekly'));
    const interval = h('input', { class: 'pl-input-text', type: 'number', min: 1, max: 52, value: ev.interval || 1 });
    const ends = h('select', { class: 'pl-input-text' },
      h('option', { value: 'never' }, 'Never'),
      h('option', { value: 'until', selected: ev.ends === 'until' }, 'On a date'),
      h('option', { value: 'count', selected: ev.ends === 'count' }, 'After a number of meetings'));
    const until = h('input', { class: 'pl-input-text', type: 'date', value: ev.until || '' });
    const count = h('input', { class: 'pl-input-text', type: 'number', min: 1, max: 500, value: ev.count || 10 });
    const meet = h('input', { type: 'checkbox', checked: Boolean(ev.meet), disabled: Boolean(editing && ev.meetLink) });

    const repeatBox = h('div', { class: 'pl-grid-form' }, field('Every … weeks', interval), field('Ends', ends), field('End date', until), field('Number of meetings', count));
    const syncRepeat = () => {
      repeatBox.hidden = repeat.value !== 'weekly';
      until.closest('label').hidden = ends.value !== 'until';
      count.closest('label').hidden = ends.value !== 'count';
    };
    repeat.addEventListener('change', syncRepeat);
    ends.addEventListener('change', syncRepeat);

    const syncMarks = () => {
      checks.forEach(({ r, mark }) => {
        const v = r.votes[optSelect.value] || 'no';
        mark.className = `pl-chip pl-${optSelect.value ? v : 'none'}`;
        mark.textContent = optSelect.value ? (MARK[v] || '') : '';
      });
    };
    const selectAvailable = () => checks.forEach(({ r, box }) => { box.checked = ['yes', 'maybe'].includes(r.votes[optSelect.value]); });
    optSelect.addEventListener('change', () => {
      const o = poll.options.find((x) => x.id === optSelect.value);
      if (o) {
        date.value = nextDate(o.day);
        time.value = o.start;
        duration.value = o.duration;
        selectAvailable();
      }
      syncMarks();
    });

    const submit = h('button', { type: 'submit', class: 'pl-btn pl-btn-primary' }, editing ? 'Save changes and notify guests' : 'Send invites');
    const form = h('form', { class: 'pl-card pl-form pl-schedule', onsubmit: async (e) => {
      e.preventDefault();
      const attendees = checks.filter((c) => c.box.checked).map((c) => c.r.email)
        .concat(extras.value.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean));
      await busy(submit, async () => {
        try {
          await api('adminSaveEvent', {
            key, pollId: poll.id, eventId: editing ? ev.id : undefined,
            event: {
              optionId: optSelect.value, title: title.value, description: desc.value, location: loc.value,
              date: date.value, time: time.value, duration: Number(duration.value),
              repeat: repeat.value, interval: Number(interval.value), ends: ends.value, until: until.value, count: Number(count.value),
              meet: meet.checked, attendees,
            },
          });
          refresh(editing ? 'The meeting is updated and guests are notified.' : `Invites sent to ${attendees.length} ${attendees.length === 1 ? 'person' : 'people'}.`);
        } catch (err) {
          toast(err.message, true);
        }
      });
    } },
    editing ? h('div', { class: 'pl-banner' }, `Editing "${ev.title}". Saving sends the update to all guests.`) : null,
    field('Time slot', optSelect, 'Picking a slot fills in the time and selects everyone who is available.'),
    h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, 'Guests'),
      withEmail.length ? h('div', { class: 'pl-checks' }, checks.map(({ r, box, mark }) => h('label', { class: 'pl-check' }, box, mark, ` ${r.name} `, h('span', { class: 'pl-sub' }, r.email))))
        : h('span', { class: 'pl-hint' }, 'No responses with an email address yet.'),
      withEmail.length ? h('div', { class: 'pl-actions' },
        h('button', { type: 'button', class: 'pl-btn pl-btn-small', onclick: selectAvailable }, 'Select available'),
        h('button', { type: 'button', class: 'pl-btn pl-btn-small', onclick: () => checks.forEach((c) => { c.box.checked = true; }) }, 'All'),
        h('button', { type: 'button', class: 'pl-btn pl-btn-small', onclick: () => checks.forEach((c) => { c.box.checked = false; }) }, 'None')) : null),
    field('Other guests', extras, 'Separate email addresses with commas.'),
    field('Title', title),
    h('div', { class: 'pl-grid-form' }, field('First meeting', date), field('Start time', time), field('Duration (minutes)', duration)),
    field('Repeat', repeat),
    repeatBox,
    field('Location', loc),
    field('Description', desc),
    h('label', { class: 'pl-check' }, meet, editing && ev.meetLink ? ' Google Meet link added' : ' Add a Google Meet link'),
    h('p', { class: 'pl-hint' }, `Times are in ${poll.timezone}. Google Calendar emails the invitation${editing ? ' update' : ''} to every guest.`),
    h('div', { class: 'pl-actions' }, submit,
      editing ? h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: () => form.replaceWith(scheduler(key, data, null, refresh)) }, 'Stop editing') : null));

    syncRepeat();
    syncMarks();
    return form;
  }

  function editor(key, poll, initialAvail) {
    const p = poll || { title: '', description: '', location: '', timezone: browserZone(), allowMaybe: true, hideResponses: false, closed: false, options: [] };
    let options = p.options.map((o) => Object.assign({}, o));

    const title = h('input', { class: 'pl-input-text', type: 'text', value: p.title, maxlength: 200, required: true });
    const desc = h('textarea', { class: 'pl-input-text', rows: 3 });
    desc.value = p.description;
    const loc = h('input', { class: 'pl-input-text', type: 'text', value: p.location, maxlength: 300 });
    const tz = h('input', { class: 'pl-input-text', type: 'text', value: p.timezone, placeholder: 'Europe/Istanbul' });
    const maybe = h('input', { type: 'checkbox', checked: p.allowMaybe });
    const hide = h('input', { type: 'checkbox', checked: p.hideResponses });
    const closed = h('input', { type: 'checkbox', checked: p.closed });

    const calCheck = h('input', { type: 'checkbox', checked: Boolean(p.calendarCheck) });
    const calIds = h('input', { class: 'pl-input-text', type: 'text', value: p.calendarIds || 'primary', placeholder: 'primary' });
    const calFrom = h('input', { class: 'pl-input-text', type: 'date', value: p.calendarFrom || '' });
    const calWeeks = h('input', { class: 'pl-input-text', type: 'number', min: 1, max: 26, value: p.calendarWeeks || 8 });
    const calHide = h('input', { type: 'checkbox', checked: p.calendarHide !== false });
    const calTol = h('input', { class: 'pl-input-text', type: 'number', min: 0, max: 26, value: p.calendarTolerance || 0 });
    const calSettings = () => ({
      timezone: tz.value, calendarCheck: calCheck.checked, calendarIds: calIds.value, calendarFrom: calFrom.value,
      calendarWeeks: Number(calWeeks.value), calendarHide: calHide.checked, calendarTolerance: Number(calTol.value),
    });
    const slotKey = (o) => `${o.day}|${o.start}|${o.duration}`;
    const busyMap = new Map();
    if (initialAvail) p.options.forEach((o, i) => busyMap.set(slotKey(o), initialAvail.slots[i]));
    const calBox = h('div', { class: 'pl-generator' },
      h('label', { class: 'pl-check' }, calCheck, ' Check my Google Calendar for conflicts'),
      h('div', { class: 'pl-cal-settings' },
        field('Calendars to check', calIds, '"primary" is your main calendar. Add other calendar IDs (for example a work calendar shared with this account), separated by commas.'),
        h('div', { class: 'pl-grid-form' }, field('Check from', calFrom, 'Empty means today.'), field('Weeks to check', calWeeks)),
        h('label', { class: 'pl-check' }, calHide, ' Hide slots from participants when I am busy'),
        field('Busy weeks allowed before hiding', calTol, '0 hides a slot if you are busy in any checked week. For example, 1 tolerates a single clash.'),
        h('div', { class: 'pl-actions' },
          h('button', { type: 'button', class: 'pl-btn', onclick: (e) => checkCalendar(e.currentTarget) }, 'Check my calendar now'),
          h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: () => {
            const tol = Number(calTol.value) || 0;
            const busy = options.filter((o) => (busyMap.get(slotKey(o)) || { busy: 0 }).busy > tol);
            if (!busy.length) return toast('No checked slot clashes with your calendar.');
            if (!window.confirm(`Remove ${busy.length} slot${busy.length === 1 ? '' : 's'} that clash with your calendar?`)) return null;
            options = options.filter((o) => !busy.includes(o));
            drawOptions();
            return null;
          } }, 'Remove busy slots'))));
    const syncCal = () => { calBox.querySelector('.pl-cal-settings').hidden = !calCheck.checked; };
    calCheck.addEventListener('change', syncCal);

    async function checkCalendar(button) {
      if (!options.length) return toast('Add time slots first.', true);
      return busy(button, async () => {
        try {
          const res = await api('adminCheckSlots', { key, poll: Object.assign(calSettings(), { options }) });
          if (res.error) return toast(res.error, true);
          options.forEach((o, i) => busyMap.set(slotKey(o), res.slots[i]));
          drawOptions();
          const clash = res.slots.filter((c) => c.busy).length;
          return toast(`${clash} of ${options.length} slots clash with your calendar in the next ${res.weeks} weeks.${res.warnings && res.warnings.length ? ` Could not read: ${res.warnings.join('; ')}` : ''}`, Boolean(res.warnings && res.warnings.length));
        } catch (err) {
          return toast(err.message, true);
        }
      });
    }

    const dayBoxes = DAYS.map((d, i) => h('input', { type: 'checkbox', value: i, checked: !poll && i < 5 }));
    const from = h('input', { class: 'pl-input-text', type: 'time', value: '09:00' });
    const to = h('input', { class: 'pl-input-text', type: 'time', value: '17:00' });
    const len = h('input', { class: 'pl-input-text', type: 'number', min: 5, max: 1440, step: 5, value: 60 });
    const list = h('div', { class: 'pl-options' });

    const sorted = () => options.sort((a, b) => a.day - b.day || a.start.localeCompare(b.start) || a.duration - b.duration);
    function drawOptions() {
      sorted();
      list.replaceChildren(...(options.length ? options.map((o) => h('div', { class: 'pl-option' },
        h('select', { class: 'pl-input-text', 'aria-label': 'Day', onchange: (e) => { o.day = Number(e.target.value); drawOptions(); } },
          DAYS.map((d, i) => h('option', { value: i, selected: i === o.day }, d))),
        h('input', { class: 'pl-input-text', type: 'time', value: o.start, 'aria-label': 'Start time', onchange: (e) => { if (e.target.value) { o.start = e.target.value; drawOptions(); } } }),
        h('input', { class: 'pl-input-text', type: 'number', min: 5, max: 1440, step: 5, value: o.duration, 'aria-label': 'Duration in minutes', onchange: (e) => { o.duration = Math.max(5, Number(e.target.value) || 60); drawOptions(); } }),
        h('span', { class: 'pl-sub' }, `min · ends ${fromMin(toMin(o.start) + o.duration)}`,
          busyMap.has(slotKey(o)) ? h('span', { class: `pl-cal-badge ${busyMap.get(slotKey(o)).busy ? 'is-busy' : 'is-free'}` },
            busyMap.get(slotKey(o)).busy ? `busy ${busyMap.get(slotKey(o)).busy}/${busyMap.get(slotKey(o)).total}` : 'free') : null),
        h('button', { type: 'button', class: 'pl-link-danger', 'aria-label': `Remove ${optLabel(o)}`, onclick: () => { options = options.filter((x) => x !== o); drawOptions(); } }, 'Remove')))
        : [h('p', { class: 'pl-muted' }, 'No time slots yet. Add some above.')]));
    }

    function addSlots() {
      const days = dayBoxes.filter((b) => b.checked).map((b) => Number(b.value));
      const a = toMin(from.value || '00:00');
      const b = toMin(to.value || '00:00') || 1440;
      const step = Math.max(5, Number(len.value) || 60);
      if (!days.length) return toast('Choose at least one day.', true);
      if (b - a < step) return toast('The time range is shorter than one slot.', true);
      let added = 0;
      days.forEach((day) => {
        for (let t = a; t + step <= b; t += step) {
          const start = fromMin(t);
          if (!options.some((o) => o.day === day && o.start === start && o.duration === step)) { options.push({ day, start, duration: step }); added += 1; }
        }
      });
      drawOptions();
      return toast(`${added} slot${added === 1 ? '' : 's'} added.`);
    }

    const save = h('button', { type: 'submit', class: 'pl-btn pl-btn-primary' }, poll ? 'Save poll' : 'Create poll');
    const form = h('form', { class: 'pl-card pl-form', onsubmit: async (e) => {
      e.preventDefault();
      await busy(save, async () => {
        try {
          const saved = await api('adminSavePoll', { key, poll: {
            id: poll ? poll.id : undefined, title: title.value, description: desc.value, location: loc.value, timezone: tz.value,
            allowMaybe: maybe.checked, hideResponses: hide.checked, closed: closed.checked, options, ...calSettings(), timezone: tz.value,
          } });
          if (poll) adminPoll(key, saved.id).then(() => toast('Poll saved.'));
          else location.search = `?id=${encodeURIComponent(saved.id)}`;
        } catch (err) {
          toast(err.message, true);
        }
      });
    } },
    field('Title', title),
    field('Description', desc),
    h('div', { class: 'pl-grid-form' }, field('Location', loc), field('Time zone', tz, 'All times in this poll and its invites use this zone.')),
    h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, 'Time slots (repeat every week)'),
      h('div', { class: 'pl-generator' },
        h('div', { class: 'pl-checks pl-days' }, dayBoxes.map((box, i) => h('label', { class: 'pl-check' }, box, ` ${SHORT[i]}`))),
        h('div', { class: 'pl-grid-form' }, field('From', from), field('To', to), field('Slot length (minutes)', len, 'Use the full range for one long slot.')),
        h('div', { class: 'pl-actions' }, h('button', { type: 'button', class: 'pl-btn', onclick: addSlots }, 'Add slots'),
          h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: () => { if (options.length && window.confirm('Remove all time slots?')) { options = []; drawOptions(); } } }, 'Remove all'))),
      list),
    h('div', { class: 'pl-field' }, h('span', { class: 'pl-label' }, 'My availability'), calBox),
    h('div', { class: 'pl-checks' },
      h('label', { class: 'pl-check' }, maybe, ' Allow "if need be" answers'),
      h('label', { class: 'pl-check' }, hide, ' Hide responses from participants'),
      h('label', { class: 'pl-check' }, closed, ' Closed (no new responses)')),
    poll && poll.options.length ? h('p', { class: 'pl-hint' }, 'Removing a slot also removes the answers given for it.') : null,
    h('div', { class: 'pl-actions' }, save,
      poll ? h('button', { type: 'button', class: 'pl-btn pl-btn-quiet', onclick: async (e) => {
        if (!window.confirm(`Delete "${poll.title}" and all its responses? Calendar invites already sent are not cancelled.`)) return;
        await busy(e.currentTarget, async () => {
          try { await api('adminDeletePoll', { key, pollId: poll.id }); location.search = ''; } catch (err) { toast(err.message, true); }
        });
      } }, 'Delete poll') : null));

    drawOptions();
    syncCal();
    return form;
  }

  if (root.dataset.mode === 'admin') adminPage();
  else votePage();
})();
