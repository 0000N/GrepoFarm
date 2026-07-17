// ==UserScript==
// @name         GrepoFarm
// @version      1.0.0
// @description  Farm villages automatique Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @icon         https://raw.githubusercontent.com/0000N/GrepoFarm/main/farm.png
// ==/UserScript==

(function() {

'use strict';
const uw = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

/* ======================== CSS ======================== */
const CSS = `
#farm_panel{position:fixed;top:60px;right:10px;width:280px;background:#12121a;
 border:1px solid #333;border-radius:5px;z-index:9999;color:#ddd;
 font:13px Arial;box-shadow:0 0 15px rgba(0,0,0,.7)}
#farm_header{background:#1a1a2e;padding:8px 10px;cursor:pointer;display:flex;
 justify-content:space-between;align-items:center;border-radius:5px 5px 0 0}
#farm_header.on{background:#2a2a10}
#farm_body{padding:8px}
.farm-btn{display:inline-block;padding:4px 8px;margin:2px;background:#25253a;
 color:#ccc;border:1px solid #3a3a55;border-radius:3px;font-size:11px;cursor:pointer}
.farm-btn:hover{background:#303050}
.farm-btn.on{background:#ffcc00;color:#000;font-weight:bold}
#farm_timer{padding:6px 0;font-size:13px;text-align:center}
#farm_toggle{width:14px;height:14px;border-radius:50%;background:#555;display:inline-block}
#farm_toggle.on{background:#4caf50;box-shadow:0 0 6px #4caf50}
`;

$('<style>').text(CSS).appendTo('head');

/* ======================== FARM ======================== */
const Farm = {
    active: false,
    modeBase: 300,
    modeBoost: 600,
    nextSec: 0,
    timer: null,

    modes: [
        ['5 min',  300,  600],
        ['10 min', 600,  1200],
        ['15 min', 900,  1800],
        ['20 min', 1200, 2400],
        ['30 min', 1800, 3600],
        ['45 min', 2700, 5400],
    ],

    start() {
        this.active = true;
        this.timer = setInterval(() => this.tick(), 1000);
        this._refresh();
    },

    stop() {
        this.active = false;
        clearInterval(this.timer);
        this.timer = null;
        this._refresh();
    },

    setMode(base, boost) {
        this.modeBase = base;
        this.modeBoost = boost;
        this._refresh();
    },

    _refresh() {
        const t = $('#farm_toggle');
        const h = $('#farm_header');
        if (this.active) { t.addClass('on'); h.addClass('on'); }
        else { t.removeClass('on'); h.removeClass('on'); }

        // Buttons
        $('#farm_body .farm-btn').each((i, el) => {
            const $el = $(el);
            $el.toggleClass('on', $el.data('base') === this.modeBase);
        });

        // Timer text
        const ti = $('#farm_timer');
        if (!this.active) { ti.text('⏸ Arrêté').css('color','#888'); return; }
        if (this.nextSec <= 0) { ti.text('⚡ Collecte...').css('color','#4fc3f7'); return; }
        const m = Math.floor(this.nextSec/60), s = this.nextSec%60;
        ti.text(`⏳ ${m}m ${s}s`).css('color','#ffcc00');
    },

    async tick() {
        this.nextSec = this._getNextSec();
        if (this.nextSec > 0) { this._refresh(); return; }

        const polis = this._genList();
        if (!polis.length) { this._refresh(); return; }

        if (Game.isCaptchaActive()) { this._refresh(); return; }

        // Simulate user actions
        await this._get('farm_town_overviews', 'index');
        await this._sleep(800);
        await this._get('farm_town_overviews', 'get_farm_towns_from_multiple_towns', { town_ids: polis });
        await this._sleep(1200);
        await this._post('farm_town_overviews', 'claim_loads_multiple', {
            towns: polis,
            time_option_base: this.modeBase,
            time_option_booty: this.modeBoost,
            claim_factor: 'normal',
        });
        // Refresh map timers
        setTimeout(() => { try { uw.WMap?.removeFarmTownLootCooldownIconAndRefreshLootTimers(); } catch(e){} }, 2000);

        this.nextSec = this._getNextSec();
        this._refresh();
    },

    _genList() {
        const islands = {};
        const towns = uw.MM?.getOnlyCollectionByName?.('Town')?.models || [];
        for (const t of towns) {
            const a = t.attributes;
            if (a.on_small_island) continue;
            const r = uw.ITowns?.getTown?.(a.id)?.resources?.() || {};
            const p = Math.min(r.wood||0, r.stone||0, r.iron||0) / (r.storage||1);
            if (!islands[a.island_id] || p < islands[a.island_id].p) {
                islands[a.island_id] = { id: a.id, p };
            }
        }
        return Object.values(islands).map(i => i.id);
    },

    _getNextSec() {
        const m = uw.MM?.getCollections?.()?.FarmTownPlayerRelation?.[0]?.models || [];
        const c = {};
        for (const x of m) { const lt = x.attributes?.lootable_at; if (lt) c[lt]=(c[lt]||0)+1; }
        let best=0, val=0;
        for (const t in c) { if (c[t]>=val) { best=t; val=c[t]; } }
        const s = best - Math.floor(Date.now()/1000);
        return s>0?s:0;
    },

    _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

    _get(ctrl, action, data) {
        return new Promise(r => uw.gpAjax?.ajaxGet?.(ctrl, action, data||{}, false, () => r()));
    },

    _post(ctrl, action, data) {
        return new Promise(r => uw.gpAjax?.ajaxPost?.(ctrl, action, data, false, () => r()));
    },
};

/* ======================== UI ======================== */
function buildPanel() {
    const html = `
<div id="farm_panel">
  <div id="farm_header" onclick="window.__grepoFarm.toggle()">
    <b style="color:#ffcc00">🌾 GrepoFarm</b>
    <span style="font-size:11px;color:#888">v1.0</span>
    <div id="farm_toggle"></div>
  </div>
  <div id="farm_body">
    ${Farm.modes.map(m => 
      `<span class="farm-btn" data-base="${m[1]}" onclick="window.__grepoFarm.setMode(${m[1]},${m[2]})">${m[0]}</span>`
    ).join('')}
    <div id="farm_timer">⏸ Arrêté</div>
  </div>
</div>`;
    $('body').append(html);
    Farm._refresh();
}

/* ======================== INIT ======================== */
const loader = setInterval(() => {
    if ($('#loader').length > 0) return;
    clearInterval(loader);

    window.__grepoFarm = {
        toggle: () => Farm.active ? Farm.stop() : Farm.start(),
        setMode: (base, boost) => Farm.setMode(base, boost),
    };

    buildPanel();
}, 200);

})();
