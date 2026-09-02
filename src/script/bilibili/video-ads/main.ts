import { gzipSync, gunzipSync } from 'fflate';
import { filterVideoAds, videoAdPaths } from './filter';
import type { HttpResponseDone } from '@/types/common';
import type { Done } from '@/types/loon';

function rewrite(): HttpResponseDone {
    if (typeof $response === 'undefined' || $request.method !== 'POST') return {};
    const url = new URL($request.url);
    if (!['grpc.biliapi.net', 'app.bilibili.com'].includes(url.hostname) || !videoAdPaths.has(url.pathname)) return {};
    if (!('status' in $response) || $response.status !== 200) return {};

    const headers = Object.fromEntries(Object.entries($response.headers).map(([key, value]) => [key.toLowerCase(), value]));
    if (!headers['content-type']?.startsWith('application/grpc')) return {};
    const trailers = 'h2_trailers' in $response ? $response.h2_trailers : undefined;
    for (const source of [headers, trailers ?? {}]) {
        for (const [key, value] of Object.entries(source)) {
            if (key.toLowerCase() === 'grpc-status' && value !== '0') return {};
        }
    }

    const frame = $response.body;
    if (!(frame instanceof Uint8Array) || frame.length < 5 || frame.length > 2 * 1024 * 1024) return {};
    const length = new DataView(frame.buffer, frame.byteOffset, frame.byteLength).getUint32(1);
    // Only rewrite complete unary messages. Preserve streams, trailers and malformed frames.
    if (length !== frame.length - 5 || (frame[0] !== 0 && frame[0] !== 1)) return {};
    if (frame[0] === 1 && headers['grpc-encoding'] !== 'gzip') return {};
    const payload = frame[0] === 1 ? gunzipSync(frame.subarray(5)) : frame.subarray(5);
    const filtered = filterVideoAds(url.pathname, payload);
    if (!filtered) return {};

    // Retain the original gRPC compression mode; do not replace headers or HTTP/2 trailers.
    const data = frame[0] === 1 ? gzipSync(filtered) : filtered;
    const body = new Uint8Array(5 + data.length);
    body[0] = frame[0];
    new DataView(body.buffer).setUint32(1, data.length);
    body.set(data, 5);
    return { body };
}

let result: HttpResponseDone = {};
try {
    result = rewrite();
} catch {
    // An unsupported schema or invalid payload must never prevent playback.
}
($done as Done)(result);
