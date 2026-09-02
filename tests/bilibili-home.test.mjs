import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const bundle = readFileSync(new URL('../dist/bilibili.json.js', import.meta.url), 'utf8');
const homeUrl = 'https://app.bilibili.com/x/resource/show/tab/v2';
const searchUrl = 'https://app.bilibili.com/x/v2/search/square';
const defaultIds = [731, 477, 478, 3502, 3503];
const layout = { code: 0, data: { tab: [], top: [], bottom: [], extra: 'keep' } };

function run(platform, url, argument, input, method = 'GET') {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Script did not finish')), 1000);
        const forbidden = () => {
            clearTimeout(timer);
            reject(new Error('Homepage processing must not issue network or storage calls'));
            throw new Error('Unexpected I/O');
        };
        const body = typeof input === 'string' ? input : JSON.stringify(input);
        const globals = {
            URL,
            console: { log() {} },
            $request: { url, method, headers: {} },
            $response: { status: 200, headers: {}, body },
            $argument: platform === 'loon' ? argument : JSON.stringify(argument),
            $httpClient: new Proxy({}, { get: () => forbidden }),
            $persistentStore: { read: forbidden, write: forbidden },
            $done(result) {
                clearTimeout(timer);
                resolve({ result, body: result.body ?? body });
            },
        };
        if (platform === 'loon') globals.$loon = 'iPhone';
        try {
            vm.runInNewContext(bundle, globals, { timeout: 1000 });
        } catch (error) {
            clearTimeout(timer);
            reject(error);
        }
    });
}

for (const platform of ['surge', 'loon']) {
    test(`${platform}: ordering, aliases, duplicates and fallback`, async () => {
        for (const [order, expected] of [
            [undefined, defaultIds],
            ['film>popular>recommend>live>anime', [3503, 478, 477, 731, 3502]],
            ['推荐，直播,熱門|番剧>影视', [477, 731, 478, 3502, 3503]],
            [' FILM ,film,unknown,推荐', [3503, 477, 731, 478, 3502]],
            ['', defaultIds],
            [null, defaultIds],
        ]) {
            const argument = order === undefined ? {} : { homeTabOrder: order };
            const output = await run(platform, homeUrl + '?s_locale=en', argument, layout);
            const { data } = JSON.parse(output.body);
            assert.deepEqual(data.tab.map(tab => tab.id), expected);
            assert.deepEqual(data.tab.map(tab => tab.pos), [1, 2, 3, 4, 5]);
            assert.deepEqual(data.tab.filter(tab => tab.default_selected === 1).map(tab => tab.id), [477]);
            assert.equal(data.extra, 'keep');
        }
    });

    test(`${platform}: hot searches can be shown without changing the original response`, async () => {
        const body = '{ "code": 0, "data": {"trending": ["test"], "extra": 42} }';
        for (const showHotSearch of [true, 1, 'true', '1', ' TRUE ']) {
            const output = await run(platform, searchUrl, { showHotSearch }, body);
            assert.equal(output.body, body);
            assert.equal(Object.keys(output.result).length, 0);
        }
        for (const showHotSearch of [undefined, false, 0, 'false', '0']) {
            const output = await run(platform, searchUrl, { showHotSearch }, body);
            const parsed = JSON.parse(output.body);
            assert.equal(parsed.code, -404);
            assert.equal(parsed.data, null);
        }
    });

    test(`${platform}: malformed and error responses pass through`, async () => {
        for (const url of [homeUrl, searchUrl]) {
            for (const body of ['not json', '{"code":-500,"data":null}', 'null']) {
                const output = await run(platform, url, {}, body);
                assert.equal(output.body, body);
                assert.equal(Object.keys(output.result).length, 0);
            }
        }
    });

    test(`${platform}: playback responses are not modified even if misrouted`, async () => {
        for (const url of [
            'https://grpc.biliapi.net/bilibili.app.playerunite.v1.Player/PlayViewUnite',
            'https://app.bilibili.com/x/player/playurl?avid=123',
        ]) {
            const output = await run(platform, url, { homeTabOrder: 'film', showHotSearch: false }, '{"code":0,"data":{"url":"video"}}');
            assert.equal(Object.keys(output.result).length, 0);
        }
    });
}

test('release rules isolate homepage/search from playback and remove conflicting rewrites', () => {
    for (const filename of ['release/loon/plugin/bilibili.lpx', 'release/surge/module/bilibili.sgmodule']) {
        const text = readFileSync(new URL('../' + filename, import.meta.url), 'utf8');
        const lines = text.split('\n');
        const line = lines.find(line => line.startsWith('bilibili.home =') || line.endsWith('tag=bilibili.home'));
        const pattern = line.startsWith('bilibili.home =')
            ? line.match(/pattern=(.*?),argument=/)[1]
            : line.split(' ')[1];
        const regex = new RegExp(pattern);
        for (const url of [homeUrl, searchUrl, searchUrl.replace('app.', 'api.')]) {
            assert.ok(regex.test(url));
            assert.ok(regex.test(url + '?build=1'));
            assert.ok(!regex.test(url + '/other'));
        }
        for (const url of [
            'https://grpc.biliapi.net/bilibili.app.viewunite.v1.View/View',
            'https://grpc.biliapi.net/bilibili.app.playerunite.v1.Player/PlayViewUnite',
            'https://app.bilibili.com/bilibili.app.playurl.v1.PlayURL/PlayView',
            'https://app.bilibili.com/bilibili.community.service.dm.v1.DM/DmSegMobile',
            'https://api.bilibili.com/x/player/playurl?avid=1',
            'https://video.bilivideo.com/video.m4s',
        ]) assert.ok(!regex.test(url));
        assert.ok(line.includes('timeout=3'));
        assert.ok(line.includes('OxqNbloF/BiliADBlock/refs/heads/dev/dist/bilibili.json.js'));
        assert.ok(!text.includes('jq/bilibili.tab.jq'));
        for (const mock of lines.filter(line => line.startsWith('^https:'))) {
            assert.ok(!new RegExp(mock.split(' ')[0]).test(searchUrl + '?build=1'));
        }
        const sharedRule = lines.find(line => line.startsWith('bilibili.json ='));
        if (sharedRule) {
            const sharedPattern = new RegExp(sharedRule.match(/pattern=(.*?),argument=/)[1]);
            assert.ok(!sharedPattern.test(homeUrl + '?build=1'));
            assert.ok(!sharedPattern.test(searchUrl + '?build=1'));
            assert.ok(sharedPattern.test('https://app.bilibili.com/x/v2/feed/index?build=1'));
        }
    }
});
