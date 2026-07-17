// ==UserScript==
// @name         GrepoFarm
// @version      1.0.4
// @description  Farm villages API directe
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        none
// ==/UserScript==

(function() {
    var uw = typeof unsafeWindow != 'undefined' ? unsafeWindow : window;
    var D = document, $;

    function $(s, p) { return (p||D).querySelector(s); }
    function $$(s, p) { return (p||D).querySelectorAll(s); }

    /* === WAIT FOR GAME === */
    var wait = setInterval(function() {
        if (D.getElementById('loader')) return;
        if (!uw.$ || !uw.gpAjax || !uw.MM || !uw.ITowns) return;
        clearInterval(wait);
        $ = uw.$;
        init();
    }, 300);

    function init() {
        /* === CSS === */
        $('<style>').text(
            '#farm_panel{position:fixed;top:60px;right:10px;width:280px;background:#12121a;'+
            'border:1px solid #333;border-radius:5px;z-index:9999;color:#ddd;'+
            'font:13px Arial;box-shadow:0 0 15px rgba(0,0,0,.7)}'+
            '#farm_header{background:#1a1a2e;padding:8px 10px;border-radius:5px 5px 0 0;'+
            'display:flex;justify-content:space-between;align-items:center;cursor:pointer}'+
            '#farm_header.on{background:#2a2a10}'+
            '#farm_body{padding:8px}'+
            '.farm-btn{display:inline-block;padding:4px 8px;margin:2px;background:#25253a;'+
            'color:#ccc;border:1px solid #3a3a55;border-radius:3px;font-size:11px;cursor:pointer}'+
            '.farm-btn:hover{background:#303050}'+
            '.farm-btn.on{background:#ffcc00;color:#000;font-weight:bold}'+
            '#farm_timer{padding:6px 0;font-size:13px;text-align:center}'+
            '#farm_toggle{width:14px;height:14px;border-radius:50%;background:#555}'+
            '#farm_toggle.on{background:#4caf50;box-shadow:0 0 6px #4caf50}'+
            '#farm_cap{font-size:10px;color:#888;padding:2px 0;text-align:center}'
        ).appendTo('head');

        /* === STATE === */
        var active = false, running = false;
        var modeBase = 300, modeBoost = 600;
        var nextSec = 0, timer = null;
        var MODES = [
            ['5 min',300,600],['10 min',600,1200],['15 min',900,1800],
            ['20 min',1200,2400],['30 min',1800,3600],['45 min',2700,5400]
        ];

        function hasCaptain() {
            try { return uw.GameDataPremium.isAdvisorActivated('captain'); }
            catch(e) { return false; }
        }

        function genList() {
            var towns = uw.MM.getOnlyCollectionByName('Town').models;
            var islands = {}, i, a, r, p, list = [];
            for (i=0; i<towns.length; i++) {
                a = towns[i].attributes;
                if (a.on_small_island) continue;
                r = uw.ITowns.getTown(a.id).resources();
                p = Math.min(r.wood,r.stone,r.iron) / r.storage;
                if (!islands[a.island_id] || p < islands[a.island_id][1])
                    islands[a.island_id] = [a.id, p];
            }
            for (var k in islands) list.push(islands[k][0]);
            return list;
        }

        function getNextSec() {
            var m = uw.MM.getCollections().FarmTownPlayerRelation[0].models;
            var c = {}, i, lt, best=0, val=0;
            for (i=0; i<m.length; i++) {
                lt = m[i].attributes.lootable_at;
                if (lt) c[lt] = (c[lt]||0)+1;
            }
            for (var t in c) if (c[t]>=val) { best=t; val=c[t]; }
            var s = best - Math.floor(Date.now()/1000);
            return s>0?s:0;
        }

        function refresh() {
            $('#farm_toggle').className = 'farm_toggle' + (active ? ' on' : '');
            $('#farm_header').className = 'farm_header' + (active ? ' on' : '');

            $$('.farm-btn').forEach(function(b) {
                b.className = 'farm-btn' + (parseInt(b.dataset.base) === modeBase ? ' on' : '');
            });

            var t = $('#farm_timer');
            if (!active) { t.textContent = 'Arrêté'; t.style.color = '#888'; }
            else if (running) { t.textContent = 'Collecte...'; t.style.color = '#4fc3f7'; }
            else if (nextSec <= 0) { t.textContent = 'Prête'; t.style.color = '#4caf50'; }
            else { var m=Math.floor(nextSec/60), s=nextSec%60;
                   t.textContent = 'Prochaine: '+m+'m '+s+'s'; t.style.color = '#ffcc00'; }

            $('#farm_cap').textContent = hasCaptain() ? 'Capitaine: actif' : 'Capitaine: absent';
        }

        function stop() {
            active = false; clearInterval(timer); timer = null; refresh();
        }

        function start() {
            active = true; timer = setInterval(tick, 1000); tick();
        }

        function tick() {
            if (!active || running) return;
            nextSec = getNextSec();
            if (nextSec > 0) { refresh(); return; }
            if ($('.botcheck') || $('#recaptcha_window')) { refresh(); return; }

            running = true; refresh();

            var polis = genList();
            if (!polis.length) { running=false; refresh(); return; }

            if (hasCaptain()) {
                // API DIRECTE — pas de fake opening
                uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
                    towns: polis,
                    time_option_base: modeBase,
                    time_option_booty: modeBoost,
                    claim_factor: 'normal'
                }, false, function() {
                    setTimeout(function() {
                        try { uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(); } catch(e){}
                        running = false;
                        nextSec = getNextSec();
                        refresh();
                    }, 1500);
                });
            } else {
                claimOneByOne(polis, 0);
            }
        }

        function claimOneByOne(polis, idx) {
            if (idx >= polis.length) {
                setTimeout(function() {
                    try { uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(); } catch(e){}
                    running = false;
                    nextSec = getNextSec();
                    refresh();
                }, 500);
                return;
            }

            var tid = polis[idx];
            var town = uw.ITowns.getTown(tid);
            if (!town) { claimOneByOne(polis, idx+1); return; }
            var x = town.getIslandCoordinateX(), y = town.getIslandCoordinateY();
            var ft = uw.MM.getOnlyCollectionByName('FarmTown').models;
            var rel = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation').models;
            var now = Math.floor(Date.now()/1000);

            for (var fi=0; fi<ft.length; fi++) {
                if (ft[fi].attributes.island_x != x || ft[fi].attributes.island_y != y) continue;
                for (var ri=0; ri<rel.length; ri++) {
                    if (ft[fi].attributes.id != rel[ri].attributes.farm_town_id) continue;
                    if (rel[ri].attributes.relation_status !== 1) continue;
                    if (rel[ri].attributes.lootable_at !== null && now < rel[ri].attributes.lootable_at) continue;

                    uw.gpAjax.ajaxPost('frontend_bridge', 'execute', {
                        model_url: 'FarmTownPlayerRelation/'+rel[ri].id,
                        action_name: 'claim',
                        arguments: { farm_town_id: ft[fi].attributes.id, type: 'resources' },
                        town_id: tid
                    }, false, function(){});
                    setTimeout(function() { claimOneByOne(polis, idx+1); }, 500);
                    return;
                }
            }
            claimOneByOne(polis, idx+1);
        }

        function setMode(base, boost) {
            modeBase = base; modeBoost = boost; refresh();
        }

        /* === BUILD PANEL === */
        var modesHtml = '';
        MODES.forEach(function(m) {
            modesHtml += '<span class="farm-btn" data-base="'+m[1]+'" data-boost="'+m[2]+'">'+m[0]+'</span>';
        });

        var panel = document.createElement('div');
        panel.id = 'farm_panel';
        panel.innerHTML =
            '<div id="farm_header">'+
            '<b style="color:#ffcc00">GrepoFarm</b>'+
            '<span style="font-size:11px;color:#888">v1.0.4</span>'+
            '<div id="farm_toggle"></div>'+
            '</div>'+
            '<div id="farm_body">'+modesHtml+
            '<div id="farm_timer">Arrêté</div>'+
            '<div id="farm_cap"></div>'+
            '</div>';

        document.body.appendChild(panel);

        /* === HANDLERS === */
        $('#farm_header').addEventListener('click', function() { active ? stop() : start(); });
        $$('.farm-btn').forEach(function(b) {
            b.addEventListener('click', function() {
                setMode(parseInt(b.dataset.base), parseInt(b.dataset.boost));
            });
        });

        refresh();
    }
})();
