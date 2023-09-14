import * as sqlite3 from 'sqlite3';
import { readFileSync, existsSync } from 'fs';
import { sync as mkdirp } from 'mkdirp';
import { dirname } from 'path';
import { asyncSecuential } from './async-secuential';
import { asyncParallel } from './async-parallel';
import {
  promisifyStatementResult,
  promisifyStatementEach,
  SqliteStatement,
  SqliteSingleResult,
  SqliteMultipleResult,
  SqliteNoResult,
} from './sqlite-statement';

export interface SqliteModelOptions<Q extends string> {
  /** File where the DB is stored */
  dbPath: string;
  /**
   * Mode to use when opening the database
   * Can be one or more of `sqlite3.OPEN_READONLY`, `sqlite3.OPEN_READWRITE` and `sqlite3.OPEN_CREATE`
   * Default is `OPEN_READWRITE | OPEN_CREATE`
   */
  dbMode?: number;
  /**
   * If the database doesn't exist, initialize it with the provided SQL
   * Can be directly a list of SQL strings or file paths containing valid SQL
   */
  createDbSql: string[];
  /** List of queries to prepare. They will be available as `SqliteStatement` objects in `this.stmt` */
  queries: { [K in Q]: string };
  /** sqlite3 verbose mode */
  verbose?: boolean;
  /** Name of the table to use for internal management */
  internalTable?: string;
}

interface InternalTableRow {
  key: string;
  value: string;
}
export class SqliteModel<Q extends string> {
  protected readonly modelOptions: SqliteModelOptions<Q>;
  protected readonly stmt: { [K in Q]: SqliteStatement };
  private readonly ready: Promise<void>;
  /*
   * `db` should be accessed (privately) only with `this.dbReady`
   */
  private db?: sqlite3.Database;

  constructor(options: SqliteModelOptions<Q>) {
    this.modelOptions = {
      dbMode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      verbose: false,
      internalTable: '_model',
      ...options,
    };

    this.stmt = {} as { [K in Q]: SqliteStatement };
    const { verbose } = this.modelOptions;

    if (verbose) {
      sqlite3.verbose();
    }

    this.ready = this.openDb().then(() => {});
  }

  /**
   * Return a promise to resolve when the database is ready (or reject if any error)
   *
   * @example
   * const model = new Model(options);
   * await model.isReady();
   * model.foobar();
   */
  public isReady(): Promise<void> {
    return this.ready;
  }

  /**
   * Retrieve the current schema version
   */
  public getCurrentSchemaVersion(): Promise<number> {
    return this.ready.then(
      () =>
        new Promise<number>((resolve, reject) => {
          const getVersionSql = `SELECT value FROM ${this.modelOptions.internalTable} WHERE key = ?`;
          this.db!.get<InternalTableRow>(getVersionSql, ['version'], (error, row) => {
            if (error) {
              reject(`Error while retrieving current schema version: ${error}`);
              return;
            }
            const currentVersion = row && Number(row.value);
            if (!currentVersion) {
              reject('Error while retrieving current schema version');
              return;
            }
            resolve(currentVersion);
          });
        })
    );
  }

  /**
   * First it finalizes every prepared statement
   * Then closes the connection to the database
   * Then resolves when done
   */
  public closeDb(): Promise<void> {
    return this.ready.then(
      () =>
        new Promise((resolve, reject) => {
          const finalized = Object.values(this.stmt).map((stmt) =>
            (stmt as SqliteStatement).finalize()
          );
          Promise.all(finalized)
            .then(() => {
              this.db!.close((error) => {
                if (error) {
                  reject(`Error closing the database: ${error}`);
                  return;
                }

                resolve();
              });
            })
            .catch((error) => reject(error));
        })
    );
  }

  /**
   * Read SQL code to execute from a file without the comments, to avoid runtime problems
   * and execute it, resolving or rejecting the returning promise when it finishes
   *
   * @param sql SQL Query string to execute
   */
  protected execSql(sql: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.db!.exec(sql, function cb(error) {
        if (error) {
          reject(`Error while executing sql: ${sql} (${error})`);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Return SQL code to execute from a file without the comments, to avoid runtime problems
   *
   * @param file Path to the file with SQL code
   */
  protected getSqlFromFile(file: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let sql: string;

      try {
        sql = readFileSync(file)
          .toString()
          .replace(/-- .*\n/gm, '');
      } catch (error) {
        reject(`Error while reading sql from ${file} (${error})`);
        return;
      }

      resolve(sql);
    });
  }

  /**
   * Prepare the provided sql query as a promisify wrapper around Statement
   */
  protected prepareStmt(sql: string): Promise<SqliteStatement> {
    return new Promise((resolve, reject) => {
      this.db!.prepare(sql, function prepared(error) {
        if (error) {
          reject(`Error preparing query ${sql} (${error})`);
          return;
        }

        const stmt: SqliteStatement = {
          bind: promisifyStatementResult<SqliteNoResult>(this, 'bind'),
          reset: promisifyStatementResult<SqliteNoResult>(this, 'reset'),
          finalize: promisifyStatementResult<SqliteNoResult>(this, 'finalize'),
          run: promisifyStatementResult<SqliteNoResult>(this, 'run'),
          get: promisifyStatementResult<SqliteSingleResult>(this, 'get', 'row'),
          all: promisifyStatementResult<SqliteMultipleResult>(this, 'all', 'rows'),
          each: promisifyStatementEach(this),
        };

        resolve(stmt);
      });
    });
  }

  /**
   * Open the database (or create it if it doesn't exist) and resolve when ready
   */
  private openDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { dbPath, dbMode } = this.modelOptions;
      mkdirp(dirname(dbPath));

      this.db = new sqlite3.Database(dbPath, dbMode, async (error) => {
        if (error) {
          reject(`sqlite: error opening the database: ${error}`);
          return;
        }

        try {
          if (await this.isNew()) {
            await this.createInternalTable();
            await this.createModelTables();
          }
          await this.prepareStmts();
        } catch (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  /**
   * Check if the model hasn't been initializated yet
   */
  private isNew(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const { internalTable } = this.modelOptions;
      const checkSql = `SELECT name FROM sqlite_master WHERE type='table' AND name='${internalTable}'`;
      this.db!.get(checkSql, (error, row) => {
        if (error) {
          reject(`Error while checking for internal table (${error})`);
          return;
        }

        resolve(!row);
      });
    });
  }

  /**
   * Create the internal table if it doesn't exist
   */
  private createInternalTable(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { internalTable } = this.modelOptions;
      const sql = `
        CREATE TABLE IF NOT EXISTS ${internalTable} (
          key text NOT NULL PRIMARY KEY,
          value text NOT NULL
        );

        INSERT INTO ${internalTable} VALUES('version', '1');
      `;

      this.db!.exec(sql, (error) => {
        if (error) {
          reject(`Error while creating internal table (${error})`);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Create the model tables in the database from the specified files or sql
   */
  private async createModelTables(): Promise<void> {
    await asyncSecuential(this.modelOptions.createDbSql, async (fileOrSql) => {
      if (existsSync(fileOrSql)) {
        try {
          const sql = await this.getSqlFromFile(fileOrSql);
          return this.execSql(sql);
        } catch (err) {
          throw err;
        }
      }
      return this.execSql(fileOrSql);
    });
  }

  /**
   * Prepare all the model queries as a promisified queries in `this.stmt`
   */
  private async prepareStmts(): Promise<void> {
    const { queries } = this.modelOptions;
    const stmt = this.stmt;

    type Q = keyof typeof queries;
    await asyncParallel(Object.keys(queries), async (query) => {
      stmt[query as Q] = await this.prepareStmt(queries[query as Q]);
    });
  }
}
