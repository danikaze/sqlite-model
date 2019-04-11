import * as sqlite3 from 'sqlite3';
import { describe, it } from 'mocha';
import { assert } from 'chai';
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
  beforeEach(() => {
    testN++;
    if (existsSync(getTestDb())) {
      unlinkSync(getTestDb());
    }
  });

  after(() => {
    while (testN > 0 ) {
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
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].name, 'test');
    assert.isTrue(existsSync(getTestDb()));
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
      assert.isTrue(false);
    } catch (e) {
      assert.isTrue(true);
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

    assert.equal((await getStmt.all()).rows.length, 0);

    await insertStmt.run(value);
    const result = await getStmt.all();
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].value, value);
  });

  it('should be ready after opening the database', async () => {
    const model = createModel();
    await model.isReady();
  });

  it('should close the database');

  it('should provide the schema version', async () => {
    const model = createModel();
    assert.equal(await model.getCurrentSchemaVersion(), 1);
  });

  it('should execute arbitrary sql', async () => {
    const model = createModel();
    await model.isReady();

    const sql = 'INSERT INTO test(value) VALUES(123);'
    await model.publicExecSql(sql);
    const getStmt = await model.getStmt('getAll');
    const result = await getStmt.all();
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].value, 123);
  });

  it('should read sql from files', async () => {
    const model = createModel();
    const sql = await model.publicGetSqlFromFile(join(__dirname, './foobar.sql'));
    const expected = `SELECT * FROM test WHERE true;`;

    assert.equal(
      sql.trim().replace(/\n/g, ' '),
      expected.trim().replace(/\n/g, ' '),
    );
  });

  it('should prepare statements from sql queries', async () => {
    const model = createModel();
    await model.isReady();

    const insertSql = queries.insert;
    const insertStmt = await model.publicPrepareStmt(insertSql);

    const result = await insertStmt.run(1);
    assert.equal(result.result.changes, 1);
    assert.equal(result.result.lastID, 1);
  });

  it('should execute Statement.each properly', async () => {
    const model = createModel();
    const insertStmt = await model.getStmt('insert');
    const get = await model.getStmt('getAll');

    await insertStmt.run(1);
    await insertStmt.run(2);
    await insertStmt.run(3);

    let calledRows = [];
    await get.each((row) => {
      calledRows.push(row.value);
    });
    assert.deepEqual(calledRows, [1, 2, 3]);
  });
});
