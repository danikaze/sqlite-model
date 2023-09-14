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
    expect(true).toBeTruthy();
  });

  it('should provide the schema version', async () => {
    expect(await model.getCurrentSchemaVersion()).toBe(1);
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
      const value = data[key as keyof typeof data];
      expect(await model.get(key)).toBeUndefined();
      await model.set(key, value);
      expect(await model.get(key)).toBe(value);
    }
  });

  it('example model should update data', async () => {
    const key = 'key';
    const value1 = 'value1';
    const value2 = 'value2';

    expect(await model.get(key)).toBeUndefined();
    await model.set(key, value1);
    expect(await model.get(key)).toBe(value1);
    await model.set(key, value2);
    expect(await model.get(key)).toBe(value2);
  });
});
