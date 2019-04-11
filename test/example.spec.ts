import { describe, it } from 'mocha';
import { assert } from 'chai';
import { Example } from './example';
import { unlinkSync, existsSync } from 'fs';

describe('Example SqliteModel', () => {
  const DB_PATH = 'example.db';
  let model: Example;

  beforeEach(() => {
    if (existsSync(DB_PATH)) {
      unlinkSync(DB_PATH);
    }
    model = new Example(DB_PATH);
  });

  afterEach(async () => {
    unlinkSync(DB_PATH);
  });

  it('should be ready after opening the database', async () => {
    await model.isReady();
    assert.isTrue(true);
  });

  it('should provide the schema version', async () => {
    assert.equal(await model.getCurrentSchemaVersion(), 1);
  });

  it('example model should create data', async () => {
    const data = {
      int: 123,
      float: 123.456,
      string: '(ಠ_ಠ)',
      array: ['a', 1],
      object: { a: 1, b: 'str' },
    };

    const keys = Object.keys(data);
    for (const key in keys) {
      const value = data[key];
      assert.isUndefined(await model.get(key));
      await model.set(key, value);
      assert.strictEqual(await model.get(key), value);
    };
  });

  it('example model should update data', async () => {
    const key = 'key';
    const value1 = 'value1';
    const value2 = 'value2';

    assert.isUndefined(await model.get(key));
    await model.set(key, value1);
    assert.strictEqual(await model.get(key), value1);
    await model.set(key, value2);
    assert.strictEqual(await model.get(key), value2);
  });
});
