// ==UserScript==
// @name         GrepoFarm
// @version      1.0.2
// @description  Farm villages automatique Grepolis
// @match        http://*.grepolis.com/game/*
// @match        https://*.grepolis.com/game/*
// ==/UserScript==

(function() {
    'use strict';
    var uw = typeof unsafeWindow != 'undefined' ? unsafeWindow : window;
    var $ = uw.$;

    if (!$) return;

    /* === CSS === */
    $('<style>').text(
        '#farm_panel{position:fixed;top:60px;right:10px;width:280px;background:#12121a;'+
        'border:1px solid #333;border-radius:5px;z-index:9999;color:#ddd;'+
        'font:13px Arial;box-shadow:0 0 15px rgba(0,0,0,.7)}'+
        '#farm_header{background:#1a1a2e;padding:8px 10px;cursor:pointer;display:flex;'+
        'justify-content:space-between;align-items:center;border-radius:5px 5px 0 0}'+
        '#farm_header.on{background:#2a2a10}'+
        '#farm_body{padding:8px}'+
        '.farm-btn{display:inline-block;padding:4px 8px;margin:2px;background:#25253a;'+
        'color:#ccc;border:1px solid #3a3a55;border-radius:3px;font-size:11px;cursor:pointer}'+
        '.farm-btn:hover{background:#303050}'+
        '.farm-btn.on{background:#ffcc00;color:#000;font-weight:bold}'+
        '#farm_timer{padding:6px 0;font-size:13px;text-align:center}'+
        '#farm_toggle{width:14px;height:14px;border-radius:50%;background:#555;display:inline-block}'+
        '#farm_toggle.on{background:#4caf50;box-shadow:0 0 6px #4caf50}'
    ).appendTo('head');

    var active = false;
    var modeBase = 300, modeBoost = 600;
    var nextSec = 0, timer = null;
    var MODES = [
        ['5 min',300,600],['10 min',600,1200],['15 min',900,1800],
        ['20 min',1200,2400],['30 min',1800,3600],['45 min',2700,5400]
    ];

    function getNextSec() {
        var models = (uw.MM && uw.MM.getCollections && uw.MM.getCollections().FarmTownPlayerRelation[0].models) || [];
        var counts = {};
        for (var i=0; i<models.length; i++) {
            var lt = models[i].attributes.lootable_at;
            if (lt) counts[lt] = (counts[lt]||0)+1;
        }
        var best=0, val=0;
        for (var t in counts) { if (counts[t]>=val) { best=t; val=counts[t]; } }
        var s = best - Math.floor(Date.now()/1000);
        return s>0?s:0;
    }

    function genList() {
        var towns = (uw.MM && uw.MM.getOnlyCollectionByName && uw.MM.getOnlyCollectionByName('Town').models) || [];
        var islands = {};
        for (var i=0; i<towns.length; i++) {
            var a = towns[i].attributes;
            if (a.on_small_island) continue;
            var r = (uw.ITowns && uw.ITowns.getTown && uw.ITowns.getTown(a.id) && uw.ITowns.getTown(a.id).resources()) || {};
            var p = Math.min(r.wood||0, r.stone||0, r.iron||0) / (r.storage||1);
            if (!islands[a.island_id] || p < islands[a.island_id][1]) {
                islands[a.island_id] = [a.id, p];
            }
        }
        var list = [];
        for (var k in islands) list.push(islands[k][0]);
        return list;
    }

    function refresh() {
        var t = $('#farm_toggle');
        var h = $('#farm_header');
        if (active) { t.addClass('on'); h.addClass('on'); }
        else { t.removeClass('on'); h.removeClass('on'); }

        $('#farm_body .farm-btn').each(function() {
            $(this).toggleClass('on', parseInt($(this).data('base')) === modeBase);
        });

        var ti = $('#farm_timer');
        if (!active) { ti.text('Arrêté').css('color','#888'); return; }
        if (nextSec <= 0) { ti.text('Collecte...').css('color','#4fc3f7'); return; }
        var m = Math.floor(nextSec/60), s = nextSec%60;
        ti.text('Prochaine: '+m+'m '+s+'s').css('color','#ffcc00');
    }

    function stop() {
        active = false;
        clearInterval(timer); timer = null;
        refresh();
    }

    function start() {
        active = true;
        timer = setInterval(tick, 1000);
        tick();
    }

    function tick() {
        if (!active) return;
        nextSec = getNextSec();
        if (nextSec > 0) { refresh(); return; }
        if ($('.botcheck').length || $('#recaptcha_window').length) { refresh(); return; }

        var polis = genList();
        if (!polis.length) { refresh(); return; }

        nextSec = 9999; refresh();

        (uw.gpAjax && uw.gpAjax.ajaxGet && uw.gpAjax.ajaxGet('farm_town_overviews', 'index', {}, false, function() {
            setTimeout(function() {
                (uw.gpAjax && uw.gpAjax.ajaxGet && uw.gpAjax.ajaxGet('farm_town_overviews', 'get_farm_towns_from_multiple_towns', {town_ids: polis}, false, function() {
                    setTimeout(function() {
                        (uw.gpAjax && uw.gpAjax.ajaxPost && uw.gpAjax.ajaxPost('farm_town_overviews', 'claim_loads_multiple', {
                            towns: polis,
                            time_option_base: modeBase,
                            time_option_booty: modeBoost,
                            claim_factor: 'normal'
                        }, false, function() {}));
                        setTimeout(function() {
                            try { uw.WMap && uw.WMap.removeFarmTownLootCooldownIconAndRefreshLootTimers(); } catch(e){}
                        }, 2000);
                    }, 1200);
                }));
            }, 800);
        }));
    }

    function setMode(base, boost) {
        modeBase = base; modeBoost = boost;
        refresh();
    }

    /* === BUILD UI === */
    var load = setInterval(function() {
        if ($('#loader').length > 0) return;
        clearInterval(load);

        var modesHtml = '';
        for (var i=0; i<MODES.length; i++) {
            modesHtml += '<span class="farm-btn" data-base="'+MODES[i][1]+'" data-boost="'+MODES[i][2]+'">'+MODES[i][0]+'</span>';
        }

        var panel = $(
            '<div id="farm_panel">'+
            '<div id="farm_header">'+
            '<b style="color:#ffcc00">GrepoFarm</b>'+
            '<span style="font-size:11px;color:#888">v1.0.2</span>'+
            '<div id="farm_toggle"></div>'+
            '</div>'+
            '<div id="farm_body">'+modesHtml+
            '<div id="farm_timer">Arrêté</div>'+
            '</div>'+
            '</div>'
        );

        $('#farm_header', panel).click(function() { active ? stop() : start(); });
        $('.farm-btn', panel).click(function() {
            setMode(parseInt($(this).data('base')), parseInt($(this).data('boost')));
        });

        $('body').append(panel);
        refresh();
    }, 200);

})();
