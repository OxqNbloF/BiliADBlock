import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { gzipSync, gunzipSync } from 'node:zlib';

const bundle = readFileSync(new URL('../dist/bilibili.video-ads.js', import.meta.url), 'utf8');
const unified = '/bilibili.app.viewunite.v1.View/';
const ipad = '/bilibili.app.view.v1.View/';
const concat = (...parts) => Buffer.concat(parts.map(part => Buffer.from(part)));
const varint = value => {
    const result = [];
    do { result.push((value & 127) | (value > 127 ? 128 : 0)); value = Math.floor(value / 128); } while (value);
    return Buffer.from(result);
};
const field = (number, body) => concat(varint(number * 8 + 2), varint(body.length), body);
const scalar = (number, value) => concat(varint(number * 8), varint(value));
const unknown = field(1000, Buffer.from('preserve server playback metadata'));

function fields(bytes) {
    let offset = 0;
    const read = () => {
        let value = 0, shift = 0, byte;
        do { byte = bytes[offset++]; value += (byte & 127) * 2 ** shift; shift += 7; } while (byte & 128);
        return value;
    };
    const result = [];
    while (offset < bytes.length) {
        const tag = read(), wire = tag & 7;
        let value;
        if (wire === 0) value = read();
        else if (wire === 2) { const length = read(); value = bytes.subarray(offset, offset + length); offset += length; }
        else throw new Error('Unsupported fixture wire type');
        result.push({ number: tag >>> 3, value });
    }
    return result;
}
const values = (bytes, number) => fields(bytes).filter(field => field.number === number).map(field => field.value);
const card = (type, stock = false) => concat(scalar(1, type), ...(stock ? [field(11, Buffer.from('ad stock'))] : []), unknown);
const cards = concat(field(1, card(1)), field(1, card(5)), field(1, card(6)), field(1, card(1, true)));
const relatedModule = concat(scalar(1, 28), field(22, cards));
const merchandise = scalar(1, 55);

function frame(payload, compressed = false) {
    const data = compressed ? gzipSync(payload) : payload;
    const result = new Uint8Array(5 + data.length);
    result[0] = Number(compressed);
    new DataView(result.buffer).setUint32(1, data.length);
    result.set(data, 5);
    return result;
}
function payload(frame) { return frame[0] ? gunzipSync(frame.subarray(5)) : Buffer.from(frame.subarray(5)); }
function run(path, body, overrides = {}) {
    let result, calls = 0, ioCalls = 0;
    const forbidden = () => { ioCalls++; throw new Error('Unexpected network/storage call'); };
    const context = {
        URL, Uint8Array, DataView, TextEncoder, TextDecoder,
        $request: { url: 'https://grpc.biliapi.net' + path, method: 'POST' },
        $response: { status: 200, body, headers: { 'content-type': 'application/grpc', 'grpc-encoding': 'gzip' }, h2_trailers: { 'grpc-status': '0' } },
        $httpClient: new Proxy({}, { get: () => forbidden }),
        $persistentStore: { read: forbidden, write: forbidden },
        $done(value) { calls++; result = value; },
        ...overrides,
    };
    const originalResponse = structuredClone(context.$response);
    vm.runInNewContext(bundle, context, { timeout: 1000 });
    assert.equal(calls, 1);
    assert.equal(ioCalls, 0);
    assert.deepEqual(structuredClone(context.$response), originalResponse);
    return result;
}

test('video details: remove banner ads, retain unknown metadata, compression and response headers/trailers', () => {
    for (const compressed of [false, true]) {
        const reqUser = field(7, Buffer.from('support creator'));
        const body = frame(concat(field(3, reqUser), field(7, Buffer.from('advertisement')), unknown), compressed);
        const output = run(unified + 'View', body);
        assert.deepEqual(Object.keys(output), ['body']);
        assert.equal(output.body[0], Number(compressed));
        assert.equal(new DataView(output.body.buffer).getUint32(1), output.body.length - 5);
        const result = payload(output.body);
        assert.equal(values(result, 7).length, 0);
        assert.deepEqual(values(result, 3)[0], reqUser);
        assert.deepEqual(values(result, 1000), values(unknown, 1000));
    }
});

test('recommendations: remove explicit ads and retain ordinary videos/live cards', () => {
    const result = payload(run(unified + 'RelatesFeed', frame(cards, true)).body);
    const kept = values(result, 1);
    assert.deepEqual(kept.map(bytes => values(bytes, 1)[0]), [1, 6]);
    for (const bytes of kept) assert.deepEqual(values(bytes, 1000), values(unknown, 1000));
});

test('nested detail modules and asynchronous recommendations remove merchandise and ad cards', () => {
    const modules = concat(field(2, relatedModule), field(2, merchandise));
    const introduction = field(2, modules);
    const view = field(5, field(1, introduction));
    const result = payload(run(unified + 'View', frame(view)).body);
    const cleanedModules = values(values(values(values(result, 5)[0], 1)[0], 2)[0], 2);
    assert.equal(cleanedModules.length, 1);
    assert.equal(values(values(cleanedModules[0], 22)[0], 1).length, 2);

    const asyncReply = concat(field(1, Buffer.from('ad')), field(2, concat(field(1, relatedModule), field(1, merchandise))));
    const asyncResult = payload(run(unified + 'AIRelateAsync', frame(asyncReply)).body);
    assert.equal(values(asyncResult, 1).length, 0);
    const asyncModules = values(values(asyncResult, 2)[0], 1);
    assert.equal(asyncModules.length, 1);
    assert.equal(values(values(asyncModules[0], 22)[0], 1).length, 2);
});

test('iPad detail and related-feed ads are removed while normal cards survive', () => {
    const ad = field(28, Buffer.from('ad'));
    const body = concat(field(30, ad), field(31, ad), field(41, ad), field(10, ad), field(10, unknown), unknown);
    const result = payload(run(ipad + 'View', frame(body)).body);
    for (const number of [30, 31, 41]) assert.equal(values(result, number).length, 0);
    assert.deepEqual(values(result, 10), [unknown]);
    assert.deepEqual(values(result, 1000), values(unknown, 1000));
    const related = payload(run(ipad + 'RelatesFeed', frame(concat(field(1, ad), field(1, unknown)))).body);
    assert.deepEqual(values(related, 1), [unknown]);
});

test('ad-free bodies and unsupported/malformed responses pass through unchanged', () => {
    for (const compressed of [false, true]) assert.equal(Object.keys(run(unified + 'View', frame(unknown, compressed))).length, 0);
    const ad = frame(field(7, Buffer.from('ad')));
    for (const body of [new Uint8Array(), ad.subarray(0, ad.length - 1), concat(ad, ad), frame(Uint8Array.of(255)), Uint8Array.of(1, 0, 0, 0, 1, 0)]) {
        assert.equal(Object.keys(run(unified + 'View', body)).length, 0);
    }
    for (const response of [
        { status: 500, headers: { 'content-type': 'application/grpc' } },
        { status: 200, headers: { 'content-type': 'application/json' } },
        { status: 200, headers: { 'content-type': 'application/grpc', 'grpc-status': '14' } },
        { status: 200, headers: { 'content-type': 'application/grpc' }, h2_trailers: { 'grpc-status': '14' } },
    ]) assert.equal(Object.keys(run(unified + 'View', ad, { $response: { body: ad, ...response } })).length, 0);
});

test('standard Loon configuration enables only five video-ad response routes', () => {
    const text = readFileSync(new URL('../release/loon/plugin/bilibili.lpx', import.meta.url), 'utf8');
    const lines = text.split('\n');
    const scripts = lines.filter(line => line.startsWith('http-response '));
    assert.equal(scripts.length, 2);
    const adRule = scripts.find(line => line.endsWith('tag=bilibili.video-ads'));
    const regex = new RegExp(adRule.split(' ')[1]);
    for (const prefix of ['https://grpc.biliapi.net', 'https://app.bilibili.com']) {
        for (const path of [unified + 'View', unified + 'RelatesFeed', unified + 'AIRelateAsync', ipad + 'View', ipad + 'RelatesFeed']) assert.ok(regex.test(prefix + path));
    }
    assert.ok(!lines.some(line => line.startsWith('http-request ')));
    assert.ok(!text.includes('[Rule]'));
    assert.ok(!text.includes('bilibili.protobuf.'));
    assert.ok(adRule.includes('bilibili.video-ads.js'));
    const allPatterns = lines.flatMap(line => line.startsWith('http-response ') ? [new RegExp(line.split(' ')[1])] : line.startsWith('^https:') ? [new RegExp(line.split(' ')[0])] : []);
    for (const path of [
        unified + 'ViewProgress', ipad + 'ViewProgress', unified + 'PlayPause', unified + 'ViewEndPage',
        '/bilibili.app.playerunite.v1.Player/PlayViewUnite', '/bilibili.app.playurl.v1.PlayURL/PlayView',
        '/bilibili.community.service.dm.v1.DM/DmView', '/bilibili.community.service.dm.v1.DM/DmSegMobile',
        '/bilibili.app.interface.v1.Teenagers/ModeStatus', '/bilibili.app.interface.v1.Search/DefaultWords',
    ]) {
        assert.ok(!allPatterns.some(pattern => pattern.test('https://grpc.biliapi.net' + path)), path);
        assert.equal(Object.keys(run(path, frame(field(7, Buffer.from('ad'))))).length, 0);
    }
});

test('HAR replay: captured gRPC responses outside the ad routes remain untouched', { skip: !process.env.BILIBILI_HAR_PATH }, () => {
    const har = JSON.parse(readFileSync(process.env.BILIBILI_HAR_PATH, 'utf8'));
    let checked = 0;
    for (const entry of har.log.entries) {
        const path = new URL(entry.request.url).pathname;
        if (!path.startsWith('/bilibili.')) continue;
        for (const response of [entry.response, entry.response._loonOriginal].filter(Boolean)) {
            const content = response.content;
            if (!content || content.encoding !== 'base64') continue;
            const body = new Uint8Array(Buffer.from(content.text, 'base64'));
            const output = run(path, body, {
                $request: { url: entry.request.url, method: entry.request.method },
                $response: { status: response.status, headers: Object.fromEntries(response.headers.map(h => [h.name, h.value])), body },
            });
            assert.equal(Object.keys(output).length, 0, path);
            checked++;
        }
    }
    assert.ok(checked >= 16);
});
