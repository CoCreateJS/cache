const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(require.resolve('../src/index.js'), 'utf8');
const handler = source.slice(source.indexOf('async function fileChange('), source.indexOf('\nif ("serviceWorker" in navigator)'));
function fixture() {
    const requests = [], writes = [];
    const file = { _id: 'id', pathname: '/file.js', src: 'complete contents' };
    const fileChange = vm.runInNewContext(handler + '\nfileChange', {
        window: { localStorage: { getItem: () => null } }, console,
        putFile: (cache, value) => writes.push(value),
        socket: { send: async data => { requests.push(data); return { success: true, object: [file] }; } }
    });
    return { requests, writes, file, fileChange };
}
test('file-content patches fetch complete records before cache storage', async () => {
    const f = fixture();
    await f.fileChange({ method: 'object.update', array: 'files', organization_id: 'org', database: 'dev',
        uuid: 'original', object: [{ _id: 'id', $set: { src: 'new contents' } }] });
    assert.equal(f.requests.length, 1);
    assert.equal(f.requests[0].method, 'object.read');
    assert.equal(f.requests[0].object._id, 'id');
    assert.equal(f.requests[0].organization_id, 'org');
    assert.equal(f.requests[0].uuid, undefined);
    assert.equal(f.requests[0].sync, true, 'The read listener must not duplicate this cache write');
    assert.equal(f.writes[0], f.file);
});
test('unrelated patches do not trigger file reads or incomplete cache writes', async () => {
    const f = fixture();
    await f.fileChange({ method: 'object.update', array: 'files', object: [{ _id: 'id', $set: { 'updated.on': 'now', label: 'label' } }] });
    assert.equal(f.requests.length, 0);
    assert.equal(f.writes.length, 0);
});
