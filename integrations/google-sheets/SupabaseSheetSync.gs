/**
 * Peregrine LMS – Google Sheets → Supabase sync
 *
 * Sheet layout (your convention):
 *   Row 1: email | password | course_id | full_name | sync_status
 *   Row 2: (optional labels / blank)
 *   Row 3+: data rows
 *
 * course_id cell: one or more values separated by comma/semicolon/newline.
 *   Each value can be a Supabase course UUID OR a course_code (placeholder created if missing).
 *
 * Setup (one-time in Apps Script):
 *   1. Project Settings → Script properties → Add:
 *        SUPABASE_URL          = https://YOUR_PROJECT.supabase.co (must be https, no trailing slash)
 *        SUPABASE_SERVICE_KEY  = your service_role JWT (never share; never commit)
 *        DEFAULT_INSTRUCTOR_ID = uuid of public.profiles.id for placeholder courses
 *
 *   Important: UrlFetchApp follows redirects and may turn POST into GET. User-create would then
 *   return the same JSON as “list users”. This script disables followRedirects on Auth calls and
 *   replays POST to the Location URL when needed.
 *   2. Run setupSheetSyncMenu() once from the editor to add the custom menu, OR
 *      add a time-based trigger for syncPendingRows() if you prefer batching.
 *   3. Extensions → Apps Script → Triggers → Add: onEdit → From spreadsheet → On edit
 *
 * Security: Storing passwords in Sheets is risky. Prefer invite links or one-time tokens in production.
 */

var DATA_START_ROW = 3;
var COL_EMAIL = 1;
var COL_PASSWORD = 2;
var COL_COURSE_ID = 3;
var COL_FULL_NAME = 4;
var COL_SYNC = 5;

/** Optional: limit how many rows sync per run (avoid URL fetch quotas). */
var MAX_ROWS_PER_RUN = 50;

/** Pause between rows in “Sync all” to reduce Supabase Auth bandwidth bursts. */
var BULK_SYNC_SLEEP_MS = 500;

var LIST_USERS_PER_PAGE = 200;
var LIST_USERS_MAX_PAGES = 12;

function getProps_() {
  var p = PropertiesService.getScriptProperties();
  var url = p.getProperty('SUPABASE_URL');
  var key = p.getProperty('SUPABASE_SERVICE_KEY');
  var instructor = p.getProperty('DEFAULT_INSTRUCTOR_ID');
  if (!url || !key || !instructor) {
    throw new Error(
      'Set Script properties: SUPABASE_URL, SUPABASE_SERVICE_KEY, DEFAULT_INSTRUCTOR_ID'
    );
  }
  url = String(url).trim().replace(/\/$/, '');
  /** Avoid http→https redirect (UrlFetchApp may turn redirected POST into GET). */
  if (/^http:\/\//i.test(url) && url.indexOf('.supabase.co') !== -1) {
    url = 'https://' + url.substring(7);
  }
  return { url: url, key: key, instructorId: instructor };
}

/** Origin for resolving relative Location headers from Auth. */
function supabaseOrigin_(baseUrl) {
  var m = String(baseUrl).replace(/\/$/, '').match(/^https?:\/\/[^/]+/i);
  return m ? m[0] : String(baseUrl).replace(/\/$/, '');
}

function resolveRedirectUrl_(baseUrl, location) {
  if (!location) return null;
  var loc = String(location).trim();
  if (/^https?:\/\//i.test(loc)) return loc;
  return supabaseOrigin_(baseUrl) + (loc.charAt(0) === '/' ? loc : '/' + loc);
}

/**
 * Auth requests with followRedirects:false — avoids POST /admin/users becoming GET (list users).
 * On 30x, repeats the same method to Location (replay POST with body).
 */
function authFetch_(props, method, pathOrUrl, opt_payload, opt_contentType) {
  var url = pathOrUrl.indexOf('http') === 0 ? pathOrUrl : props.url + pathOrUrl;
  var options = {
    method: method,
    headers: {
      apikey: props.key,
      Authorization: 'Bearer ' + props.key,
    },
    muteHttpExceptions: true,
    followRedirects: false,
  };
  if (opt_payload != null) {
    options.payload = opt_payload;
    options.contentType = opt_contentType || 'application/json';
  }
  var res;
  var hops = 0;
  while (hops < 4) {
    res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code < 300 || code >= 400) return res;
    var hdrs = res.getHeaders();
    var loc = hdrs['Location'] || hdrs['location'];
    var next = resolveRedirectUrl_(props.url, loc);
    if (!next) return res;
    url = next;
    hops++;
  }
  return res;
}

function setupSheetSyncMenu() {
  SpreadsheetApp.getUi()
    .createMenu('Supabase sync')
    .addItem('Sync all pending rows', 'syncPendingRows')
    .addItem('Sync this sheet row (active cell)', 'syncActiveRow')
    .addToUi();
}

/**
 * Installable trigger: Extensions → Apps Script → Triggers → onEdit → From spreadsheet → On edit
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var row = e.range.getRow();
  var col = e.range.getColumn();
  if (row < DATA_START_ROW) return;
  if (col > COL_SYNC) return;
  try {
    syncRow(row, e.range.getSheet());
  } catch (err) {
    Logger.log(err);
    e.range.getSheet().getRange(row, COL_SYNC).setValue('error: ' + String(err.message || err));
  }
}

function syncActiveRow() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var row = sheet.getActiveRange().getRow();
  if (row < DATA_START_ROW) {
    SpreadsheetApp.getUi().alert('Select a row at or below row ' + DATA_START_ROW);
    return;
  }
  syncRow(row, sheet);
  SpreadsheetApp.getUi().alert('Row ' + row + ' processed. Check sync_status.');
}

/** Process rows where sync_status is empty, "pending", or starts with "error" */
function syncPendingRows() {
  var sheet = SpreadsheetApp.getActiveSheet();
  var last = sheet.getLastRow();
  var n = 0;
  for (var row = DATA_START_ROW; row <= last && n < MAX_ROWS_PER_RUN; row++) {
    var status = String(sheet.getRange(row, COL_SYNC).getValue() || '').trim().toLowerCase();
    if (!status || status === 'pending' || status.indexOf('error') === 0) {
      try {
        syncRow(row, sheet);
        n++;
        if (BULK_SYNC_SLEEP_MS > 0) Utilities.sleep(BULK_SYNC_SLEEP_MS);
      } catch (err) {
        sheet.getRange(row, COL_SYNC).setValue('error: ' + String(err.message || err));
      }
    }
  }
}

/**
 * Core: create auth user (or reuse), ensure courses exist, enroll.
 */
function syncRow(row, sheet) {
  var email = String(sheet.getRange(row, COL_EMAIL).getValue() || '').trim();
  /** Trim avoids trailing spaces/newlines from Sheets breaking password rules. */
  var password = String(sheet.getRange(row, COL_PASSWORD).getValue() || '').trim();
  var courseRaw = String(sheet.getRange(row, COL_COURSE_ID).getValue() || '').trim();
  var fullName = String(sheet.getRange(row, COL_FULL_NAME).getValue() || '').trim();

  if (!email) {
    sheet.getRange(row, COL_SYNC).setValue('skipped: no email');
    return;
  }
  if (!password) {
    sheet.getRange(row, COL_SYNC).setValue('skipped: no password');
    return;
  }

  sheet.getRange(row, COL_SYNC).setValue('syncing…');

  var props = getProps_();
  var userId = ensureAuthUser_(props, email, password, fullName);
  var refs = parseCourseRefs_(courseRaw);

  if (refs.length === 0) {
    sheet.getRange(row, COL_SYNC).setValue('synced (no courses)');
    return;
  }

  var errors = [];
  for (var i = 0; i < refs.length; i++) {
    try {
      var courseId = resolveCourseRef_(props, refs[i]);
      enrollLearner_(props, courseId, userId);
    } catch (ex) {
      errors.push(refs[i] + ': ' + String(ex.message || ex));
    }
  }

  if (errors.length) {
    sheet.getRange(row, COL_SYNC).setValue('partial: ' + errors.join(' | '));
  } else {
    sheet.getRange(row, COL_SYNC).setValue('synced');
  }
}

/** Split course_id cell; dedupe by lowercase token. */
function parseCourseRefs_(raw) {
  if (!raw) return [];
  var parts = raw.split(/[,;\n]+/);
  var out = [];
  var seen = {};
  for (var i = 0; i < parts.length; i++) {
    var c = parts[i].trim();
    if (!c) continue;
    var key = c.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(c);
  }
  return out;
}

/** True if string looks like a Postgres/Supabase uuid. */
function isLikelyUuid_(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(s).trim()
  );
}

function courseExistsById_(props, id) {
  var res = UrlFetchApp.fetch(
    props.url +
      '/rest/v1/courses?id=eq.' +
      encodeURIComponent(id.trim()) +
      '&select=id&limit=1',
    {
      method: 'get',
      headers: {
        apikey: props.key,
        Authorization: 'Bearer ' + props.key,
      },
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() !== 200) return false;
  var rows = JSON.parse(res.getContentText());
  return rows && rows.length > 0;
}

/**
 * Resolve one token from course_id: existing UUID, or course_code (placeholder flow).
 */
function resolveCourseRef_(props, token) {
  var t = token.trim();
  if (isLikelyUuid_(t)) {
    if (courseExistsById_(props, t)) return t;
    throw new Error('no course with this id');
  }
  return ensureCourseByCode_(props, t);
}

function ensureAuthUser_(props, email, password, fullName) {
  var created = adminCreateUser_(props, email, password, fullName);
  /** New users: handle_new_user trigger copies user_metadata.full_name → profiles. */
  if (created && created.id) return created.id;

  var existing = findUserByEmail_(props, email);
  if (existing) {
    if (fullName) updateProfileFullName_(props, existing.id, fullName);
    return existing.id;
  }

  var probe = authFetch_(props, 'get', '/auth/v1/admin/users?page=1&per_page=1');
  var pCode = probe.getResponseCode();
  var pText = probe.getContentText();
  throw new Error(
    'Could not create or find user for ' +
      email +
      '. Auth said duplicate email but admin list users did not return this address (or list failed). ' +
      'Confirm SUPABASE_SERVICE_KEY is the service_role secret. ' +
      'admin/users probe: HTTP ' +
      pCode +
      ' — ' +
      (pText.length > 400 ? pText.substring(0, 400) + '…' : pText)
  );
}

/** Patch public.profiles.full_name (service role bypasses RLS). */
function updateProfileFullName_(props, profileId, fullName) {
  if (!fullName) return;
  var res = UrlFetchApp.fetch(
    props.url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(profileId),
    {
      method: 'patch',
      contentType: 'application/json',
      headers: {
        apikey: props.key,
        Authorization: 'Bearer ' + props.key,
        Prefer: 'return=minimal',
      },
      payload: JSON.stringify({ full_name: fullName }),
      muteHttpExceptions: true,
    }
  );
  var code = res.getResponseCode();
  if (code !== 200 && code !== 204) {
    Logger.log('profile full_name patch: ' + code + ' ' + res.getContentText());
  }
}

function adminCreateUser_(props, email, password, fullName) {
  var meta = { source: 'google_sheet_sync' };
  if (fullName) meta.full_name = fullName;
  var res = authFetch_(props, 'post', '/auth/v1/admin/users', JSON.stringify({
    email: email,
    password: password,
    email_confirm: true,
    user_metadata: meta,
  }));
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code === 200 || code === 201) {
    var j = JSON.parse(body);
    var u = pickUserFromAdminCreateResponse_(j, email);
    if (u && u.id) return u;
    /**
     * GET /admin/users returns { users, aud } with no `user` key — happens if POST was turned into GET.
     * Do not crawl all pages (bandwidth); fail with a clear hint.
     */
    if (looksLikeAdminListUsersPayload_(j)) {
      throw new Error(
        'POST /admin/users returned a user list, not create-user JSON. ' +
          'Usually UrlFetchApp followed a redirect and replayed as GET. ' +
          'Use SUPABASE_URL = https://YOUR_REF.supabase.co exactly. ' +
          'Body starts: ' +
          body.substring(0, 280)
      );
    }
    var found = findUserByEmail_(props, email);
    if (found && found.id) return found;
    throw new Error(
      'Auth returned 200/201 but could not match user id for ' +
        email +
        '. Check Authentication → Users. Body: ' +
        body.substring(0, 500)
    );
  }
  /**
   * Supabase returns 422 for many validation errors (weak password, invalid email, etc.), not only
   * “email already taken”. Only return null when we are sure the email already exists.
   */
  if (isAuthDuplicateEmail_(code, body)) {
    return null;
  }
  throw new Error('Auth create failed (' + code + '): ' + body);
}

/**
 * Normalize Admin API JSON after POST /admin/users: `{ user }`, single user root, or `{ users }`.
 * Only uses a `users[]` entry when email matches (never guesses another account).
 */
/** Shape of GET /admin/users (not POST create). */
function looksLikeAdminListUsersPayload_(json) {
  return !!(json && Array.isArray(json.users) && json.users.length && !json.user);
}

function pickUserFromAdminCreateResponse_(json, email) {
  if (!json) return null;
  if (json.user && json.user.id) return json.user;
  if (json.id && !json.users) return json;
  var target = String(email || '').toLowerCase();
  var users = json.users;
  if (!users || !users.length) return null;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (String(u.email || '').toLowerCase() === target) return u;
    var ids = u.identities || [];
    for (var k = 0; k < ids.length; k++) {
      var idd = ids[k].identity_data || {};
      if (String(idd.email || '').toLowerCase() === target) return u;
    }
  }
  return null;
}

/** True when Auth rejected create because this email is already registered. */
function isAuthDuplicateEmail_(httpCode, body) {
  var t = String(body || '');
  var low = t.toLowerCase();
  if (httpCode === 409) return true;
  try {
    var j = JSON.parse(t);
    var errCode = String(j.error_code || j.code || '').toLowerCase();
    var msg = String(j.msg || j.message || j.error_description || '').toLowerCase();
    if (errCode === 'email_exists' || errCode === 'user_already_exists') return true;
    if (errCode === 'identity_already_exists') return true;
    if (msg.indexOf('already registered') >= 0) return true;
    if (msg.indexOf('already exists') >= 0 && msg.indexOf('user') >= 0) return true;
    if (msg.indexOf('email') >= 0 && msg.indexOf('already') >= 0) return true;
    if (msg.indexOf('duplicate') >= 0) return true;
  } catch (ignore) {}
  if (low.indexOf('already been registered') >= 0) return true;
  if (low.indexOf('user already registered') >= 0) return true;
  if (low.indexOf('email address is already') >= 0) return true;
  if (low.indexOf('email_exists') >= 0) return true;
  return false;
}

function findUserByEmail_(props, email) {
  var page = 1;
  var perPage = LIST_USERS_PER_PAGE;
  var target = email.toLowerCase();
  while (page <= LIST_USERS_MAX_PAGES) {
    var res = authFetch_(
      props,
      'get',
      '/auth/v1/admin/users?page=' + page + '&per_page=' + perPage
    );
    var rc = res.getResponseCode();
    if (rc !== 200) {
      Logger.log('admin list users page ' + page + ' HTTP ' + rc + ' ' + res.getContentText());
      break;
    }
    var j = JSON.parse(res.getContentText());
    var users = j.users || [];
    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      var uemail = String(u.email || '').toLowerCase();
      if (uemail === target) return u;
      var ids = u.identities || [];
      for (var k = 0; k < ids.length; k++) {
        var idd = ids[k].identity_data || {};
        if (String(idd.email || '').toLowerCase() === target) return u;
      }
    }
    if (users.length < perPage) break;
    page++;
  }
  return null;
}

/**
 * Find course by course_code (case-insensitive). If missing, insert placeholder (invite_only, draft, no modules).
 */
function ensureCourseByCode_(props, code) {
  var trimmed = code.trim();
  var found = findCourseIdByCode_(props, trimmed);
  if (found) return found;

  var payload = {
    instructor_id: props.instructorId,
    course_code: trimmed,
    title: 'Placeholder: ' + trimmed,
    description: 'Auto-created from Google Sheet sync. Add modules in the LMS when ready.',
    status: 'draft',
    enrollment_type: 'invite_only',
  };

  var res = UrlFetchApp.fetch(props.url + '/rest/v1/courses', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: props.key,
      Authorization: 'Bearer ' + props.key,
      Prefer: 'return=representation',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var text = res.getContentText();
  var statusCode = res.getResponseCode();

  if (statusCode === 201) {
    var rows = JSON.parse(text);
    if (rows && rows[0] && rows[0].id) return rows[0].id;
  }

  // Race: another run inserted the same code
  if (statusCode === 409 || text.indexOf('duplicate') !== -1 || text.indexOf('unique') !== -1) {
    var again = findCourseIdByCode_(props, trimmed);
    if (again) return again;
  }

  throw new Error('Create course failed (' + statusCode + '): ' + text);
}

function findCourseIdByCode_(props, code) {
  var q =
    'select=id&course_code=ilike.' + encodeURIComponent(code.trim()) + '&limit=1';
  var res = UrlFetchApp.fetch(props.url + '/rest/v1/courses?' + q, {
    method: 'get',
    headers: {
      apikey: props.key,
      Authorization: 'Bearer ' + props.key,
    },
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;
  var rows = JSON.parse(res.getContentText());
  if (rows && rows.length) return rows[0].id;
  return null;
}

function enrollLearner_(props, courseId, learnerId) {
  var res = UrlFetchApp.fetch(props.url + '/rest/v1/enrollments', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: props.key,
      Authorization: 'Bearer ' + props.key,
      Prefer: 'return=minimal',
    },
    payload: JSON.stringify({
      course_id: courseId,
      learner_id: learnerId,
    }),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code === 201 || code === 200 || code === 204) return;
  // duplicate enrollment
  if (code === 409) return;
  var body = res.getContentText();
  throw new Error('enrollments (' + code + '): ' + body);
}
