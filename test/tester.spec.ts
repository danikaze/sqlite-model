import * as sqlite3 from 'sqlite3';
import { Tester } from './tester';
import { unlinkSync, existsSync, chmodSync, statSync } from 'fs';
import { SqliteModelOptions } from '../src';
import { join } from 'path';

type Q = 'checkTable' | 'getAll' | 'getGt' | 'insert' | 'delete';

const createDbSql = [
  // from SQL queries
  `CREATE TABLE IF NOT EXISTS test (value number NOT NULL);`,
  // from files
  join(__dirname, './create-table.sql'),
];
const queries: { [K in Q]: string } = {
  checkTable: 'SELECT name FROM sqlite_master WHERE type="table" AND name = ?',
  getAll: 'SELECT value FROM test;',
  getGt: 'SELECT value FROM test WHERE value > ?;',
  insert: 'INSERT INTO test(value) VALUES(?);',
  delete: 'DELETE FROM test WHERE value = ?;',
};

let testN = 0;

function getTestDb() {
  return join(__dirname, 'db', `tester.${testN}.db`);
}

function createModel<ExtraQueries extends string = never>(
  options: Partial<SqliteModelOptions<ExtraQueries>> = {}
): Tester<Q | ExtraQueries> {
  const model = new Tester<Q | ExtraQueries>({
    createDbSql,
    dbPath: getTestDb(),
    ...options,
    queries: {
      ...queries,
      ...options.queries,
    } as { [K in Q | ExtraQueries]: string },
  });

  return model;
}

describe('Test SqliteModel', () => {
  const NO_READABLE_FILE_PATH = join(__dirname, './no-readable.sql');
  const NO_READABLE_FILE_ORIGINAL_MODE = statSync(NO_READABLE_FILE_PATH).mode;

  // check if the database file exist and removes it in case
  // so it runs on a clear database
  beforeEach(() => {
    // make sure the no-readable file is no readable
    chmodSync(NO_READABLE_FILE_PATH, '000');

    testN++;
    if (existsSync(getTestDb())) {
      unlinkSync(getTestDb());
    }
  });

  afterEach(() => {
    // restore the mode of the no-readable file just in case
    chmodSync(NO_READABLE_FILE_PATH, NO_READABLE_FILE_ORIGINAL_MODE);
  });

  // remove the database files after running all the tests
  afterAll(() => {
    while (testN > 0) {
      if (existsSync(getTestDb())) {
        unlinkSync(getTestDb());
      }
      testN--;
    }
  });

  it('should output long stack trace when verbose is enabled', async () => {
    try {
      const nonVerboseModel = createModel({ verbose: false });
      const stmt = await nonVerboseModel.getStmt('insert');
      await stmt.run(123, 'extra-param');
      expect(true).toBeFalsy();
    } catch (error) {
      // for some reason can't read the error directly until
      // converted via stringify -> parse
      const err = JSON.parse(JSON.stringify(error));
      expect(err).toEqual({
        errno: 25,
        code: 'SQLITE_RANGE',
      });
    }

    try {
      const nonVerboseModel = createModel({ verbose: true });
      const stmt = await nonVerboseModel.getStmt('insert');
      await stmt.run(123, 'extra-param');
      expect(true).toBeFalsy();
    } catch (error) {
      // for some reason can't read the error directly until
      // converted via stringify -> parse
      const err = JSON.parse(JSON.stringify(error));
      expect(err).toEqual({
        __augmented: true,
        errno: 25,
        code: 'SQLITE_RANGE',
      });
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

  it('should close the database when done', async () => {
    const model = createModel();
    await model.closeDb();
    expect(true).toBeTruthy();
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

  it('should allow sql from strings and files when creating the database', async () => {
    const model = createModel();

    const stmt = await model.publicPrepareStmt(
      `SELECT name FROM sqlite_master
       WHERE type="table"
       AND (
        name="test" OR name="fromfile"
       );
      `
    );
    const res = await stmt.all();
    expect(res.rows).toEqual([{ name: 'test' }, { name: 'fromfile' }]);
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
    const getStmt = await model.getStmt('getAll');

    await insertStmt.run(1);
    await insertStmt.run(2);
    await insertStmt.run(3);

    let calledRows: number[] = [];
    await getStmt.each((row) => {
      calledRows.push(row.value);
    });
    expect(calledRows).toEqual([1, 2, 3]);
  });

  it('should throw catchable errors when preparing wrong statements', async () => {
    await expect(() =>
      createModel({ queries: { error: 'WRONG STATEMENT' } }).isReady()
    ).rejects.toMatch('Error preparing query');
  });

  it('should throw catchable errors (no table) when trying to retrieve the schema version', async () => {
    const model = createModel();
    await model.isReady();

    // should fail if the table gets deleted
    await model.publicExecSql(`DROP TABLE ${model.getOptions().internalTable};`);
    await expect(model.getCurrentSchemaVersion()).rejects.toMatch(
      'Error while retrieving current schema version'
    );
  });

  it('should throw catchable errors (no value) when trying to retrieve the schema version', async () => {
    const model = createModel();
    await model.isReady();

    // should fail if the value gets deleted
    await model.publicExecSql(`DELETE FROM ${model.getOptions().internalTable};`);
    await expect(model.getCurrentSchemaVersion()).rejects.toMatch(
      'Error while retrieving current schema version'
    );
  });

  it('should throw catchable errors on wrong sql execution', async () => {
    const model = createModel();
    await expect(model.publicExecSql('WRONG SQL')).rejects.toMatch('Error while executing sql');
  });

  it('should throw catchable errors on wrong statement usage', async () => {
    const model = createModel();
    const checkTableStmt = await model.getStmt('checkTable');
    const getAllStmt = await model.getStmt('getAll');
    const getGtStmt = await model.getStmt('getGt');
    const insertStmt = await model.getStmt('insert');
    const deleteStmt = await model.getStmt('delete');

    await expect(checkTableStmt.run(1, 2, 3)).rejects.toBeTruthy();
    await expect(getAllStmt.run(1, 2, 3)).rejects.toBeTruthy();
    await expect(getGtStmt.run(1, 2, 3)).rejects.toBeTruthy();
    await expect(insertStmt.run(1, 2, 3)).rejects.toBeTruthy();
    await expect(deleteStmt.run(1, 2, 3)).rejects.toBeTruthy();
  });

  it('should throw catchable errors on Statement.each', async () => {
    const model = createModel();
    const getAllStmt = await model.getStmt('getAll');
    const insertStmt = await model.getStmt('insert');

    // each callback shouldn't be executed if there are no rows
    expect(
      getAllStmt.each(() => {
        throw new Error();
      })
    ).resolves.toBeTruthy();

    await insertStmt.run(1);
    await insertStmt.run(2);
    await insertStmt.run(3);
    // TODO: how to trigger errors on each cb/complete???
  });

  it('should throw catchable errors when reading sql from files', async () => {
    await expect(() => {
      const model = createModel({
        createDbSql: [NO_READABLE_FILE_PATH],
      });
      return model.isReady();
    }).rejects.toMatch('Error while reading sql');
  });
});
