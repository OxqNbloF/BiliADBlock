import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const loonConfig = readFileSync(new URL('../release/loon/plugin/bilibili.lpx', import.meta.url), 'utf8');
const loonLines = loonConfig.split('\n');

test('Loon playback isolation: neither rewrites nor scripts match the playback chain', () => {
    const patterns = loonLines.flatMap(line => {
        if (line.startsWith('^https:')) return [new RegExp(line.split(' ')[0])];
        if (line.startsWith('http-response ')) return [new RegExp(line.split(' ')[1])];
        assert.ok(!line.startsWith('http-request '), 'No script may reissue native requests');
        return [];
    });
    assert.ok(patterns.length > 0);
    for (const host of ['grpc.biliapi.net', 'app.bilibili.com', 'api.bilibili.com']) {
        for (const endpoint of [
            'bilibili.app.viewunite.v1.View/ViewProgress',
            'bilibili.app.view.v1.View/ViewProgress',
            'bilibili.app.playerunite.v1.Player/PlayViewUnite',
            'bilibili.app.playurl.v1.PlayURL/PlayView',
            'bilibili.pgc.gateway.player.v2.PlayURL/PlayView',
            'bilibili.community.service.dm.v1.DM/DmView',
            'bilibili.community.service.dm.v1.DM/DmSegMobile',
            'bilibili.main.community.reply.v1.Reply/MainList',
            'bilibili.app.view.v1.View/TFInfo',
            'bilibili.app.viewunite.v1.View/PlayPause',
            'bilibili.app.viewunite.v1.View/ViewEndPage',
            'x/player/playurl?avid=123',
            'x/player/wbi/playurl?avid=123',
            'pgc/player/api/playurl?avid=123',
            'x/pd-proxy/tracker?platform=ios',
        ]) {
            const url = `https://${host}/${endpoint}`;
            assert.ok(!patterns.some(pattern => pattern.test(url)), url);
        }
    }
    for (const url of [
        'https://video.bilivideo.com/video.m4s',
        'https://raw.githubusercontent.com/kokoryh/chronos/refs/heads/master/test.zip',
        'https://bsbsb.top/api/skipSegments?videoID=test',
        'https://api.live.bilibili.com/xlive/open-interface/v2/tracker/conf?platform=ios',
    ]) assert.ok(!patterns.some(pattern => pattern.test(url)), url);
    assert.ok(!loonConfig.includes('[Rule]'));
    assert.equal(loonLines.find(line => line.startsWith('hostname = ')), 'hostname = app.bilibili.com, api.bilibili.com, grpc.biliapi.net');
});

test('Loon playback isolation retains homepage controls and splash/feed filtering', () => {
    for (const prefix of ['showHotSearch=', 'homeTabOrder=']) {
        assert.ok(loonLines.some(line => line.startsWith(prefix)));
    }
    assert.deepEqual(readdirSync(new URL('../release/loon/plugin/', import.meta.url)).filter(name => name.endsWith('.lpx')), ['bilibili.lpx']);
    const scripts = loonLines.filter(line => line.startsWith('http-'));
    assert.deepEqual(scripts.map(line => line.match(/tag=([^,]+)$/)[1]).sort(), ['bilibili.home', 'bilibili.video-ads']);
    assert.ok(loonLines.some(line => line.includes('jq/bilibili.mine.jq')));
    const rewrites = loonLines.filter(line => line.startsWith('^https:')).map(line => new RegExp(line.split(' ')[0]));
    for (const endpoint of ['splash/list', 'splash/show', 'splash/event/list2', 'feed/index', 'feed/index/story']) {
        assert.ok(rewrites.some(pattern => pattern.test(`https://app.bilibili.com/x/v2/${endpoint}?build=1`)));
    }
    for (const name of ['sponsorBlock=', 'optimizeRequest=', 'purifyComment=', 'displayUpList=']) {
        assert.ok(!loonConfig.includes(name), 'Do not expose controls that have no effect');
    }
});

for (const filename of ['release/surge/module/bilibili.sgmodule']) {
    const lines = readFileSync(new URL('../' + filename, import.meta.url), 'utf8').split('\n');
    function patterns(type) {
        return lines.flatMap(line => {
            if (line.startsWith(type + ' ')) return [new RegExp(line.split(' ')[1])];
            if (line.includes('type=' + type + ',')) return [new RegExp(line.match(/pattern=(.*?),(?:argument|requires-body)=/)[1])];
            return [];
        });
    }
    const requests = patterns('http-request');
    const responses = patterns('http-response');

    test(`${filename}: video metadata and playback requests bypass ALL request scripts`, () => {
        for (const host of ['grpc.biliapi.net', 'app.bilibili.com']) {
            for (const endpoint of [
                'bilibili.app.viewunite.v1.View/View',
                'bilibili.app.view.v1.View/View',
                'bilibili.app.playerunite.v1.Player/PlayViewUnite',
                'bilibili.app.playurl.v1.PlayURL/PlayView',
                'bilibili.pgc.gateway.player.v2.PlayURL/PlayView',
            ]) {
                const url = `https://${host}/${endpoint}`;
                assert.ok(!requests.some(pattern => pattern.test(url)), url);
                assert.ok(responses.some(pattern => pattern.test(url)), 'Response filtering must remain: ' + url);
            }
            for (const endpoint of [
                'bilibili.main.community.reply.v1.Reply/MainList',
                'bilibili.community.service.dm.v1.DM/DmSegMobile',
            ]) assert.ok(requests.some(pattern => pattern.test(`https://${host}/${endpoint}`)));
        }
    });

    test(`${filename}: API hosts are not rejected while tracker blocking is retained`, () => {
        for (const host of ['api.biliapi.com', 'app.biliapi.com', 'api.biliapi.net', 'app.biliapi.net']) {
            assert.ok(!lines.some(line => line.startsWith(`DOMAIN,${host},REJECT`)), host);
        }
        assert.ok(lines.some(line => line.includes('DOMAIN-SUFFIX,chat.bilibili.com')));
        assert.ok(lines.some(line => line.includes('splash\\/list\\?') && line.includes('max_time')));
    });
}
