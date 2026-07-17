// ==UserScript==
// @name         GrepoFarm
// @version      1.0.7
// @description  Farm villages Grepolis — code V1 éprouvé
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// @grant        none
// ==/UserScript==

(function() {
    var uw = typeof unsafeWindow != 'undefined' ? unsafeWindow : window;

    var wait = setInterval(function() {
        if (!uw.$ || !uw.gpAjax || !uw.MM || !uw.ITowns) return;
        if (document.getElementById('loader')) return;
        clearInterval(wait); init();
    }, 500);

    function init() {
        var $ = uw.$;
        var active = false, running = false;
        var timingBase = 300, timingBoost = 600;
        var timer = null;

        var MODES = [
            ['5 min',300,600],['10 min',600,1200],['15 min',900,1800],
            ['20 min',1200,2400],['30 min',1800,3600],['45 min',2700,5400]
        ];

        // CSS
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

        /* ===== LOGIC FROM V1 (proven) ===== */

        // Generate 1 town per island, prefer poorest
        function genList() {
            var islands = {}, m = uw.MM.getOnlyCollectionByName('Town').models;
            for (var i=0; i<m.length; i++) {
                var a = m[i].attributes;
                if (a.on_small_island) continue;
                var r = uw.ITowns.getTown(a.id).resources();
                var p = Math.min(r.wood, r.stone, r.iron) / r.storage;
                if (!islands[a.island_id] || p < islands[a.island_id][1])
                    islands[a.island_id] = [a.id, p];
            }
            var list = []; for (var k in islands) list.push(islands[k][0]);
            return list;
        }

        // Seconds until next loot batch
        function nextLootSec() {
            var m = uw.MM.getCollections().FarmTownPlayerRelation[0].models;
            var c = {};
            for (var i=0; i<m.length; i++) {
                var lt = m[i].attributes.lootable_at; if (lt) c[lt] = (c[lt]||0)+1;
            }
            var best=0, val=0;
            for (var t in c) { if (c[t]>=val) { best=t; val=c[t]; } }
            var s = best - Math.floor(Date.now()/1000);
            return s>0 ? s : 0;
        }

        // Fake opening farm window (required by server)
        function fakeOpen(cb) {
            uw.gpAjax.ajaxGet('farm_town_overviews', 'index', {}, false, cb);
        }

        // Fake selecting multiple towns
        function fakeSelect(polis, cb) {
            uw.gpAjax.ajaxGet('farm_town_overviews', 'get_farm_towns_from_multiple_towns',
                {town_ids: polis}, false, cb);
        }

        // Claim all at once (captain)
        function claimMultiple(polis, cb) {
            uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
                towns: polis,
                time_option_base: timingBase,
                time_option_booty: timingBoost,
                claim_factor: 'normal'
            }, false, cb);
        }

        // Update farm window state
        function fakeUpdate(cb) {
            var t = uw.ITowns.getCurrentTown();
            var booty = 0, trade = 0;
            try { booty = t.getResearches().attributes.booty ? 1 : 0; } catch(e){}
            try { trade = t.getBuildings().attributes.trade_office ? 1 : 0; } catch(e){}
            uw.gpAjax.ajaxGet('farm_town_overviews', 'get_farm_towns_for_town', {
                island_x: t.getIslandCoordinateX(),
                island_y: t.getIslandCoordinateY(),
                current_town_id: t.id,
                booty_researched: booty,
                diplomacy_researched: '',
                trade_office: trade
            }, false, cb);
        }

        // Refresh farm map timers (V1 pattern)
        function refreshMap() {
            try { uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(); } catch(e){}
        }

        function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms); }); }

        async function doClaim() {
            var polis = genList();
            if (!polis.length) return;

            // V1 SEQUENCE — known to work
            fakeOpen(function() {
                sleep(800).then(function() {
                    fakeSelect(polis, function() {
                        sleep(1200).then(function() {
                            claimMultiple(polis, function() {
                                sleep(1500).then(function() {
                                    fakeUpdate(function() {
                                        setTimeout(refreshMap, 2000);
                                        running = false; refresh();
                                    });
                                });
                            });
                        });
                    });
                });
            });
        }

        function doClaimSingle() {
            var polis = genList();
            if (!polis.length) { running=false; refresh(); return; }
            var ft = uw.MM.getOnlyCollectionByName('FarmTown').models;
            var rl = uw.MM.getOnlyCollectionByName('FarmTownPlayerRelation').models;
            var now = Math.floor(Date.now()/1000);

            function loop(i) {
                if (i >= polis.length) { setTimeout(refreshMap, 500); running=false; refresh(); return; }
                var t = uw.ITowns.getTown(polis[i]);
                if (!t) { loop(i+1); return; }
                var x = t.getIslandCoordinateX(), y = t.getIslandCoordinateY();
                for (var fi=0; fi<ft.length; fi++) {
                    if (ft[fi].attributes.island_x!=x||ft[fi].attributes.island_y!=y) continue;
                    for (var ri=0; ri<rl.length; ri++) {
                        if (ft[fi].attributes.id!=rl[ri].attributes.farm_town_id) continue;
                        if (rl[ri].attributes.relation_status !== 1) continue;
                        if (rl[ri].attributes.lootable_at !== null && now < rl[ri].attributes.lootable_at) continue;
                        uw.gpAjax.ajaxPost('frontend_bridge','execute',{
                            model_url: 'FarmTownPlayerRelation/'+rl[ri].id,
                            action_name: 'claim',
                            arguments: {farm_town_id:ft[fi].attributes.id, type:'resources'},
                            town_id: polis[i]
                        }, false, function(){});
                        setTimeout(function(){loop(i+1);},500);
                        return;
                    }
                }
                loop(i+1);
            }
            loop(0);
        }

        /* ===== UI ===== */

        function refresh() {
            $('#farm_toggle').toggleClass('on', active);
            $('#farm_header').toggleClass('on', active);
            $('#farm_body .farm-btn').each(function() {
                $(this).toggleClass('on', parseInt($(this).data('base'))===timingBase);
            });

            var sec = nextLootSec();
            var ti = $('#farm_timer');
            if (!active) ti.text('Arrete').css('color','#888');
            else if (running) ti.text('Collecte...').css('color','#4fc3f7');
            else if (sec<=0) ti.text('Prete').css('color','#4caf50');
            else { var m=Math.floor(sec/60), s=sec%60; ti.text('Prochaine: '+m+'m '+s+'s').css('color','#ffcc00'); }

            var cap = false;
            try { cap=uw.GameDataPremium.isAdvisorActivated('captain'); } catch(e){}
            $('#farm_cap').text(cap ? 'Capitaine: actif' : 'Capitaine: absent');
        }

        function stop() { active=false; clearInterval(timer); timer=null; refresh(); }
        function start() { active=true; timer=setInterval(tick,1000); tick(); }

        function tick() {
            if (!active || running) return;
            if ($('.botcheck').length || $('#recaptcha_window').length) { refresh(); return; }
            var sec = nextLootSec();
            if (sec > 0) { refresh(); return; }
            running = true; refresh();
            if (cap()) doClaim(); else doClaimSingle();
        }

        function cap() {
            try { return uw.GameDataPremium.isAdvisorActivated('captain'); } catch(e){ return false; }
        }

        function setMode(b, t) { timingBase=b; timingBoost=t; refresh(); }

        /* BUILD PANEL */
        var mh=''; for (var i=0; i<MODES.length; i++) mh+='<span class="farm-btn" data-base="'+MODES[i][1]+'" data-boost="'+MODES[i][2]+'">'+MODES[i][0]+'</span>';

        var p = $('<div id="farm_panel"><div id="farm_header"><b style="color:#ffcc00">GrepoFarm</b><span style="font-size:11px;color:#888">v1.0.7</span><div id="farm_toggle"></div></div><div id="farm_body">'+mh+'<div id="farm_timer">Arrete</div><div id="farm_cap"></div></div></div>');
        $('body').append(p);

        $('#farm_header').click(function(){ active?stop():start(); });
        $('#farm_body').on('click','.farm-btn',function(){
            setMode(parseInt($(this).data('base')),parseInt($(this).data('boost')));
        });
        refresh();
    }
})();
