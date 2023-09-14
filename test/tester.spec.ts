import * as sqlite3 from 'sqlite3';
import { Tester } from './tester';
import { unlinkSync, existsSync } from 'fs';
import { SqliteModelOptions } from '../src';
import { join } from 'path';

type Q = 'checkTable' | 'getAll' | 'getGt' | 'insert' | 'delete';

const createDbSql = [`CREATE TABLE IF NOT EXISTS test (value number NOT NULL);`];
const queries: { [K in Q]: string } = {
  checkTable: 'SELECT name FROM sqlite_master WHERE type="table" AND name = ?',
  getAll: 'SELECT value FROM test;',
  getGt: 'SELECT value FROM test WHERE value > ?;',
  insert: 'INSERT INTO test(value) VALUES(?);',
  delete: 'DELETE FROM test WHERE value = ?;',
};

let testN = 0;

function getTestDb() {
  return `tester.${testN}.db`;
}

function createModel(options?: Partial<SqliteModelOptions<Q>>): Tester<Q> {
  const model = new Tester<Q>({
    createDbSql,
    queries,
    dbPath: getTestDb(),
    ...options,
  });

  return model;
}

describe('Test SqliteModel', () => {
  // check if the database file exist and removes it in case
  // so it runs on a clear database
  beforeEach(() => {
    testN++;
    if (existsSync(getTestDb())) {
      unlinkSync(getTestDb());
    }
  });

  // remove the database file after running the test
  afterAll(() => {
    while (testN > 0) {
      if (existsSync(getTestDb())) {
        unlinkSync(getTestDb());
      }
      testN--;
    }
  });

  it('should create a new database if not exists', async () => {
    const model = createModel();

    const stmt = await model.getStmt('checkTable');
    const result = await stmt.all('test');
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('test');
    expect(existsSync(getTestDb())).toBeTruthy();
  });

  it('should allow opening a database in read only mode', async () => {
    // create a db first
    const create = createModel();
    await create.isReady();

    // open it in read only mode (OPEN_CREATE and OPEN_READONLY are exclusive)
    const model = createModel({
      dbMode: sqlite3.OPEN_READONLY,
    });

    const stmt = await model.getStmt('insert');
    try {
      await stmt.run(1);
      expect(false).toBeTruthy();
    } catch (e) {
      expect(true).toBeTruthy();
    }
  });

  it('should allow multiple accesses to the same database', async () => {
    const value = 123456;
    const model1 = createModel();
    await model1.isReady();
    const model2 = createModel();
    await model2.isReady();

    const insertStmt = await model1.getStmt('insert');
    const getStmt = await model2.getStmt('getAll');

    expect((await getStmt.all()).rows.length).toBe(0);

    await insertStmt.run(value);
    const result = await getStmt.all();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].value).toBe(value);
  });

  it('should be ready after opening the database', async () => {
    const model = createModel();
    await model.isReady();
  });

  it.skip('should close the database', () => {});

  it('should provide the schema version', async () => {
    const model = createModel();
    expect(await model.getCurrentSchemaVersion()).toBe(1);
  });

  it('should execute arbitrary sql', async () => {
    const model = createModel();
    await model.isReady();

    const sql = 'INSERT INTO test(value) VALUES(123);';
    await model.publicExecSql(sql);
    const getStmt = await model.getStmt('getAll');
    const result = await getStmt.all();
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].value).toBe(123);
  });

  it('should read sql from files', async () => {
    const model = createModel();
    const sql = await model.publicGetSqlFromFile(join(__dirname, './foobar.sql'));
    const expected = `SELECT * FROM test WHERE true;`;

    expect(sql.trim().replace(/\n/g, ' ')).toBe(expected.trim().replace(/\n/g, ' '));
  });

  it('should prepare statements from sql queries', async () => {
    const model = createModel();
    await model.isReady();

    const insertSql = queries.insert;
    const insertStmt = await model.publicPrepareStmt(insertSql);

    const result = await insertStmt.run(1);
    expect(result.result.changes).toBe(1);
    expect(result.result.lastID).toBe(1);
  });

  it('should execute Statement.each properly', async () => {
    const model = createModel();
    const insertStmt = await model.getStmt('insert');
    const get = await model.getStmt('getAll');

    await insertStmt.run(1);
    await insertStmt.run(2);
    await insertStmt.run(3);

    let calledRows: number[] = [];
    await get.each((row) => {
      calledRows.push(row.value);
    });
    expect(calledRows).toEqual([1, 2, 3]);
  });
});
