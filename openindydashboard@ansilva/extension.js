import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const RACEHOOKS_API_BASE = 'https://api.racehooks.io/v1/indycar';
const RACEHOOKS_PROJECT_URL = 'https://racehooks.io/docs/motorsport-data-api';
const INDYCAR_SCHEDULE_URL = 'https://www.indycar.com/Schedule';

const REFRESH_SECONDS = 60 * 60;
const SCHEDULER_TICK_SECONDS = 15 * 60;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_ENDPOINT_CACHE_ENTRIES = 20;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ALLOWED_PATHS = new Set(['seasons', 'standings']);
const SEASON_PATH_RE = /^seasons\/(19\d{2}|20\d{2}|21\d{2})\/races$/;
const UI_SCHEMA_VERSION = 1;
const BUILD_VERSION = '1';

// Race start times for 2027 had not been announced when this build was made.
// Dates and venues are from INDYCAR's official schedule announcement (2026-10-23).
// Store date-only values: never imply a start time that the source did not publish.
const OFFICIAL_2027_CALENDAR = Object.freeze([
    {date: '2027-03-07', venue: 'Streets of St. Petersburg'},
    {date: '2027-03-13', venue: 'Phoenix Raceway'},
    {date: '2027-03-21', venue: 'Streets of Arlington'},
    {date: '2027-04-04', venue: 'Barber Motorsports Park'},
    {date: '2027-04-18', venue: 'Streets of Long Beach'},
    {date: '2027-05-15', venue: 'Indianapolis Motor Speedway Road Course'},
    {date: '2027-05-30', venue: 'The 111th Indianapolis 500'},
    {date: '2027-06-06', venue: 'Streets of Detroit'},
    {date: '2027-06-13', venue: 'World Wide Technology Raceway'},
    {date: '2027-06-27', venue: 'Road America'},
    {date: '2027-07-04', venue: 'Mid-Ohio Sports Car Course'},
    {date: '2027-07-18', venue: 'Circuit de Barcelona-Catalunya'},
    {date: '2027-08-01', venue: 'Portland International Raceway'},
    {date: '2027-08-15', venue: 'Streets of Markham'},
    {date: '2027-08-28', venue: 'Milwaukee Mile Race 1'},
    {date: '2027-08-29', venue: 'Milwaukee Mile Race 2'},
    {date: '2027-09-05', venue: 'WeatherTech Raceway Laguna Seca'},
]);

function unixNow() {
    return GLib.DateTime.new_now_utc().to_unix();
}

function sanitizeUiText(value, maxLen = 180) {
    const text = String(value ?? '');
    const clean = text
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

function boundedNumber(value, fallback, min, max) {
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function isAllowedPath(path) {
    return typeof path === 'string' &&
        (ALLOWED_PATHS.has(path) || SEASON_PATH_RE.test(path));
}

function dateAtLocalNoon(dateText) {
    const match = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match)
        return null;

    try {
        return GLib.DateTime.new_local(
            Number.parseInt(match[1], 10),
            Number.parseInt(match[2], 10),
            Number.parseInt(match[3], 10),
            12, 0, 0);
    } catch (_error) {
        return null;
    }
}

function formatDate(dateText) {
    const date = dateAtLocalNoon(dateText);
    return date ? date.format('%a, %b %e, %Y') : 'Date unavailable';
}

function formatUpdatedTs(unixTs) {
    if (!unixTs)
        return 'never';

    try {
        const date = GLib.DateTime.new_from_unix_local(unixTs);
        return date ? date.format('%m-%d %H:%M %Z') : 'unknown';
    } catch (_error) {
        return 'unknown';
    }
}

function normalizeStandings(payload) {
    const season = boundedNumber(payload?.data?.season, 0, 1996, 2200);
    const raw = payload?.data?.standings;
    if (!season || !Array.isArray(raw))
        throw new Error('Invalid RaceHooks standings payload');

    const drivers = raw.slice(0, 100).map((entry, index) => ({
        position: boundedNumber(entry?.position, index + 1, 1, 200),
        name: sanitizeUiText(entry?.name || 'Unknown driver', 80),
        points: boundedNumber(entry?.points, 0, 0, 100000),
    })).filter(entry => entry.name);

    if (!drivers.length)
        throw new Error('RaceHooks standings are empty');

    return {season, drivers};
}

class OpenIndyIndicator extends PanelMenu.Button {
    static {
        GObject.registerClass(this);
    }

    static cacheFilePath() {
        return GLib.build_filenamev([
            GLib.get_user_cache_dir(),
            'openindy-dashboard-cache.json',
        ]);
    }

    constructor() {
        super(0.0, 'OpenIndy Dashboard');

        this._http = new Soup.Session({
            timeout: 15,
            user_agent: 'OpenIndy-Dashboard-GNOME/1.0',
        });
        this._refreshSourceId = 0;
        this._refreshSignalId = 0;
        this._linkSignals = [];
        this._isRefreshing = false;
        this._destroyed = false;
        this._cacheLoadCancellable = new Gio.Cancellable();
        this._cachePath = OpenIndyIndicator.cacheFilePath();
        this._cache = this._defaultCache();
        this._hasStandings = false;

        this._label = new St.Label({
            text: 'INDY',
            y_expand: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(this._label);
        this.menu.box.add_style_class_name('openindy-menu-box');

        this._calendarHeader = new PopupMenu.PopupMenuItem('Next IndyCar race', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._calendarHeader);
        this._calendarContent = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._calendarContent);

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._standingsHeader = new PopupMenu.PopupMenuItem('2026 championship points', {
            reactive: false,
            can_focus: false,
        });
        this.menu.addMenuItem(this._standingsHeader);
        this._standingsContent = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._standingsContent);

        this._refreshItem = new PopupMenu.PopupMenuItem('Refresh points');
        this._refreshSignalId = this._refreshItem.connect('activate', () => {
            this._onRefreshNow();
        });
        this.menu.addMenuItem(this._refreshItem);

        const buildItem = new PopupMenu.PopupMenuItem(`Build: ${BUILD_VERSION}`, {
            reactive: false,
            can_focus: false,
        });
        buildItem.add_style_class_name('openindy-row-dim');
        this.menu.addMenuItem(buildItem);
        this.menu.addMenuItem(this._createCreditsItem());

        this._renderCalendar();
        this._setSectionMessage(this._standingsContent, 'Loading 2026 points…');
        this._initAsync().catch(error => {
            if (!this._destroyed)
                console.warn(`[openindydashboard] Initialization failed: ${String(error?.message || error)}`);
        });

        this._refreshSourceId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT,
            SCHEDULER_TICK_SECONDS,
            () => {
                this._refresh(false).catch(error => {
                    if (!this._destroyed)
                        console.warn(`[openindydashboard] Scheduled refresh failed: ${String(error?.message || error)}`);
                });
                return GLib.SOURCE_CONTINUE;
            });
    }

    destroy() {
        this._destroyed = true;

        if (this._refreshSourceId) {
            GLib.Source.remove(this._refreshSourceId);
            this._refreshSourceId = 0;
        }
        if (this._refreshSignalId && this._refreshItem) {
            this._refreshItem.disconnect(this._refreshSignalId);
            this._refreshSignalId = 0;
        }
        for (const {button, signalId} of this._linkSignals) {
            if (button && signalId)
                button.disconnect(signalId);
        }
        this._linkSignals = [];

        this._cacheLoadCancellable?.cancel();
        this._cacheLoadCancellable = null;
        this._http?.abort();
        this._http = null;
        super.destroy();
    }

    _defaultCache() {
        return {
            endpoints: {},
            ui: {},
            meta: {
                lastRefreshTs: 0,
                lastRefreshSource: 'CACHE',
                uiSchemaVersion: UI_SCHEMA_VERSION,
            },
        };
    }

    async _initAsync() {
        const cancellable = this._cacheLoadCancellable;
        this._cache = await this._loadCache(cancellable);
        if (this._destroyed || cancellable?.is_cancelled())
            return;

        this._applyCachedUi();
        await this._refresh(false);
    }

    async _loadCache(cancellable) {
        try {
            const file = Gio.File.new_for_path(this._cachePath);
            const bytes = await new Promise((resolve, reject) => {
                file.load_contents_async(cancellable, (_file, result) => {
                    try {
                        const [, contents] = file.load_contents_finish(result);
                        resolve(contents);
                    } catch (error) {
                        reject(error);
                    }
                });
            });
            if (bytes.length > MAX_CACHE_BYTES)
                return this._defaultCache();

            const parsed = JSON.parse(new TextDecoder().decode(bytes));
            if (!parsed || typeof parsed !== 'object')
                return this._defaultCache();
            if ((parsed.meta?.uiSchemaVersion || 0) !== UI_SCHEMA_VERSION)
                return this._defaultCache();

            parsed.endpoints = parsed.endpoints && typeof parsed.endpoints === 'object' ? parsed.endpoints : {};
            parsed.ui = parsed.ui && typeof parsed.ui === 'object' ? parsed.ui : {};
            parsed.meta = parsed.meta && typeof parsed.meta === 'object' ? parsed.meta : {};
            parsed.meta.uiSchemaVersion = UI_SCHEMA_VERSION;
            return parsed;
        } catch (_error) {
            return this._defaultCache();
        }
    }

    _saveCache() {
        try {
            const entries = Object.entries(this._cache.endpoints || {});
            if (entries.length > MAX_ENDPOINT_CACHE_ENTRIES) {
                entries.sort((a, b) => (b[1]?.ts || 0) - (a[1]?.ts || 0));
                this._cache.endpoints = Object.fromEntries(entries.slice(0, MAX_ENDPOINT_CACHE_ENTRIES));
            }

            let data = JSON.stringify(this._cache);
            if (data.length > MAX_CACHE_BYTES) {
                this._cache.endpoints = {};
                data = JSON.stringify(this._cache);
            }
            if (data.length <= MAX_CACHE_BYTES) {
                Gio.File.new_for_path(this._cachePath).replace_contents(
                    data, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            }
        } catch (_error) {
            // Cache is best effort; never destabilize GNOME Shell for disk errors.
        }
    }

    _endpointCacheGet(path, maxAge) {
        const entry = this._cache.endpoints?.[`racehooks:${path}`];
        if (!entry || unixNow() - boundedNumber(entry.ts, 0, 0, Number.MAX_SAFE_INTEGER) > maxAge)
            return null;
        return entry.data;
    }

    _endpointCacheSet(path, data) {
        this._cache.endpoints[`racehooks:${path}`] = {ts: unixNow(), data};
    }

    _applyCachedUi() {
        const rows = this._cache.ui?.standingsRows;
        if (Array.isArray(rows) && rows.length) {
            this._setRows(this._standingsContent, rows);
            this._hasStandings = true;
        }
    }

    _renderCalendar() {
        const today = GLib.DateTime.new_now_local();
        const todayKey = today.format('%Y-%m-%d');
        const next = OFFICIAL_2027_CALENDAR.find(event => event.date >= todayKey) || null;
        const rows = [];

        if (next) {
            rows.push({text: next.venue});
            rows.push({text: formatDate(next.date), dim: true});
            rows.push({text: 'Start time not announced', dim: true});
            rows.push({text: 'Source: official 2027 schedule', dim: true});
            this._label.text = 'INDY | NEXT';
        } else {
            rows.push({text: '2027 season complete'});
            rows.push({text: 'Next season schedule not available', dim: true});
            this._label.text = 'INDY | DONE';
        }
        this._setRows(this._calendarContent, rows);
    }

    _clearSection(section) {
        section.removeAll();
    }

    _createRow(text, dim = false) {
        const item = new PopupMenu.PopupMenuItem(sanitizeUiText(text, 220), {
            reactive: false,
            can_focus: false,
        });
        item.add_style_class_name('openindy-row-compact');
        if (dim)
            item.add_style_class_name('openindy-row-dim');
        return item;
    }

    _setSectionMessage(section, message) {
        this._clearSection(section);
        section.addMenuItem(this._createRow(message));
    }

    _setRows(section, rows) {
        this._clearSection(section);
        for (const row of rows) {
            if (typeof row === 'string')
                section.addMenuItem(this._createRow(row));
            else
                section.addMenuItem(this._createRow(row.text, Boolean(row.dim)));
        }
    }

    _createCreditsItem() {
        const item = new PopupMenu.PopupBaseMenuItem({reactive: false, can_focus: false});
        item.add_style_class_name('openindy-row-compact');
        item.add_style_class_name('openindy-row-dim');
        item.add_child(new St.Label({text: 'Data: '}));
        item.add_child(this._createLinkButton('RaceHooks', RACEHOOKS_PROJECT_URL));
        item.add_child(new St.Label({text: ' / '}));
        item.add_child(this._createLinkButton('INDYCAR schedule', INDYCAR_SCHEDULE_URL));
        return item;
    }

    _createLinkButton(label, uri) {
        const button = new St.Button({
            label,
            reactive: true,
            can_focus: true,
            track_hover: true,
            style_class: 'openindy-link-button',
        });
        const signalId = button.connect('clicked', () => {
            try {
                Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
            } catch (_error) {
                // Attribution links are optional UI conveniences.
            }
        });
        this._linkSignals.push({button, signalId});
        return button;
    }

    async _onRefreshNow() {
        if (this._isRefreshing)
            return;
        this._refreshItem.label.text = 'Refreshing…';
        try {
            await this._refresh(true);
        } finally {
            if (!this._destroyed && this._refreshItem)
                this._refreshItem.label.text = 'Refresh points';
        }
    }

    async _fetchJson(path) {
        if (!isAllowedPath(path))
            throw new Error('Invalid RaceHooks API path');
        if (!this._http || this._destroyed)
            throw new Error('Extension disabled');

        return new Promise((resolve, reject) => {
            const message = Soup.Message.new('GET', `${RACEHOOKS_API_BASE}/${path}`);
            this._http.send_and_read_async(message, GLib.PRIORITY_DEFAULT, null, (session, result) => {
                try {
                    const bytes = session.send_and_read_finish(result);
                    const status = message.status_code ?? 0;
                    const data = bytes.get_data();
                    if (data.length > MAX_RESPONSE_BYTES)
                        throw new Error('RaceHooks response too large');
                    if (status === 429)
                        throw new Error('RaceHooks rate limit reached (429)');
                    if (status < 200 || status >= 300)
                        throw new Error(`RaceHooks HTTP ${status}`);
                    resolve(JSON.parse(new TextDecoder().decode(data)));
                } catch (error) {
                    reject(error);
                }
            });
        });
    }

    async _loadStandings(force) {
        const path = 'standings';
        if (!force) {
            const cached = this._endpointCacheGet(path, REFRESH_SECONDS);
            if (cached)
                return {standings: normalizeStandings(cached), source: 'CACHE'};
        }

        const payload = await this._fetchJson(path);
        const standings = normalizeStandings(payload);
        this._endpointCacheSet(path, payload);
        return {standings, source: 'API'};
    }

    async _refresh(force) {
        if (this._isRefreshing || this._destroyed)
            return;

        const lastRefresh = boundedNumber(this._cache.meta?.lastRefreshTs, 0, 0, Number.MAX_SAFE_INTEGER);
        if (!force && unixNow() - lastRefresh < REFRESH_SECONDS)
            return;

        this._isRefreshing = true;
        try {
            const result = await this._loadStandings(force);
            if (this._destroyed)
                return;

            const refreshedAt = unixNow();
            this._cache.meta.lastRefreshTs = refreshedAt;
            this._cache.meta.lastRefreshSource = result.source;
            this._renderStandings(result.standings, result.source, refreshedAt);
            this._cache.meta.uiSchemaVersion = UI_SCHEMA_VERSION;
            this._saveCache();
        } catch (error) {
            if (this._destroyed)
                return;
            const message = String(error?.message || error);
            if (!this._hasStandings) {
                this._setSectionMessage(this._standingsContent,
                    message.includes('429')
                        ? 'Rate limited. No cached points yet.'
                        : 'Points unavailable (network/API error).');
            }
            console.warn(`[openindydashboard] Points refresh failed: ${message}`);
        } finally {
            this._isRefreshing = false;
        }
    }

    _renderStandings({season, drivers}, source, refreshedAt) {
        const rows = [
            {text: `Drivers — ${season}`, dim: true},
            ...drivers.slice(0, 10).map(driver =>
                `${driver.position}. ${driver.name} — ${driver.points}p`),
            {text: `Updated: ${formatUpdatedTs(refreshedAt)} (${source})`, dim: true},
        ];

        this._standingsHeader.label.text = `${season} championship points`;
        this._setRows(this._standingsContent, rows);
        this._cache.ui.standingsRows = rows;
        this._hasStandings = true;
    }
}

export default class OpenIndyDashboardExtension extends Extension {
    enable() {
        this._indicator = new OpenIndyIndicator();
        Main.panel.addToStatusArea(this.uuid, this._indicator);
    }

    disable() {
        this._indicator?.destroy();
        this._indicator = null;
    }
}
