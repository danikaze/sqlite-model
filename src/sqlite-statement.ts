// tslint:disable:no-any
import * as sqlite3 from 'sqlite3';

export interface SqliteNoResult {
  result: sqlite3.RunResult;
}

export interface SqliteSingleResult<T = any> extends SqliteNoResult {
  row?: T;
}

export interface SqliteMultipleResult<T = any> extends SqliteNoResult {
  rows: T[];
}

export interface SqliteStatement {
  /**
   * Binds parameters to the prepared statement and resolves when done or when an error occurs.
   *
   * Binding parameters with this function completely resets the statement object and row cursor
   * and removes all previously bound parameters, if any.
   */
  bind(...params: any[]): Promise<SqliteNoResult>;
  /**
   * Resets the row cursor of the statement and preserves the parameter bindings.
   *
   * Resolves after the reset is complete. Never fails.
   * Use this function to re-execute the same query with the same bindings.
   */
  reset(): Promise<SqliteNoResult>;
  /**
   * Finalizes the statement. This is typically optional, but if you experience long delays before
   * the next query is executed, explicitly finalizing your statement might be necessary.
   */
  finalize(): Promise<SqliteNoResult>;
  /**
   * Binds parameters and executes the statement.
   *
   * If you specify bind parameters, they will be bound to the statement before it is executed.
   * Note that the bindings and the row cursor are reset when you specify even a single bind parameter.
   *
   * The statement will not be finalized after it is run, meaning you can run it multiple times.
   */
  run(...params: any[]): Promise<SqliteNoResult>;
  /**
   * Binds parameters, executes the statement and retrieves the first result row.
   * If the result is empty, the `row` field of the resolved result will be undefined.
   *
   * Using this method can leave the database locked, as the database awaits further calls to `get` to retrieve
   * subsequent rows. To inform the database that you are finished retrieving rows,
   * you should either `finalize` or `reset` the statement.
   */
  get<T = any>(...params: any[]): Promise<SqliteSingleResult<T>>;
  /**
   * Binds parameters, executes the statement and resolve to all result rows.
   *
   * If the result set is empty, the `rows` field is an empty array, otherwise it contains an object for each
   * result row which in turn contains the values of that row.
   * Like with `run`, the statement will not be finalized after executing this function.
   */
  all<T = any>(...params: any[]): Promise<SqliteMultipleResult<T>>;
  /**
   * Runs the SQL query with the specified parameters and calls the callback once for each result row.
   *
   * If the result set succeeds but is empty, the callback is never called. In all other cases, the callback is called
   * once for every retrieved row. The order of calls correspond exactly to the order of rows in the result set.
   * The returned promise will be resolved after the callback function is called for all elements.
   * If you know that a query only returns a very limited number of rows, it might be more convenient to use `all`
   * to retrieve all rows at once.
   *
   * Note that the callback is the first parameter, and the parameters, which are optionals, are at the end of the
   * parameter list (the opposite as the `sqlite3.Statement#each` wrapped function)
   */
  each<T = any>(callback: (row: T) => void, ...params: any[]): Promise<SqliteSingleResult<T>>;
}

export function promisifyStatementResult<
  R = SqliteNoResult | SqliteSingleResult | SqliteMultipleResult,
>(
  stmt: sqlite3.Statement,
  method: 'bind' | 'reset' | 'finalize' | 'run' | 'get' | 'all' | 'each',
  field?: 'row' | 'rows'
): (...params: any[]) => Promise<R> {
  return (...params) =>
    new Promise<R>((resolve, reject) => {
      stmt[method](
        ...params,
        function handler(this: sqlite3.RunResult, error: Error, r?: any | any[]) {
          if (error) {
            reject(error);
            return;
          }

          const data: SqliteNoResult | SqliteMultipleResult | Partial<SqliteSingleResult> = {
            result: this,
          };

          if (field && r) {
            data[field as keyof typeof data] = r;
          }

          resolve(data as R);
        }
      );
    });
}

export function promisifyStatementEach<T>(
  stmt: sqlite3.Statement
): (callback: (row: T) => void, ...params: any[]) => Promise<SqliteNoResult> {
  return (callback, ...params) =>
    new Promise<SqliteNoResult>((resolve, reject) => {
      function cb(error: Error, row: T) {
        if (error) {
          reject(error);
          return;
        }

        callback(row);
      }

      stmt.each(...params, cb, function handler(this: sqlite3.RunResult, error: Error) {
        if (error) {
          reject(error);
          return;
        }

        resolve({ result: this });
      });
    });
}
