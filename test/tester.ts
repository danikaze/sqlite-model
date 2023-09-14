import { SqliteModel, SqliteStatement, SqliteModelOptions } from '../src';

/**
 * Just a simple class exposing all the protected methods of the SqliteModel for testing
 */
export class Tester<Q extends string> extends SqliteModel<Q> {
  public getOptions(): SqliteModelOptions<Q> {
    return this.modelOptions;
  }

  public async getStmt(key: Q): Promise<SqliteStatement> {
    await this.isReady();
    return this.stmt[key];
  }

  public async publicExecSql(sql: string): Promise<void> {
    await this.isReady();
    return this.execSql(sql);
  }

  public async publicGetSqlFromFile(file: string): Promise<string> {
    await this.isReady();
    return this.getSqlFromFile(file);
  }

  public async publicPrepareStmt(sql: string): Promise<SqliteStatement> {
    await this.isReady();
    return this.prepareStmt(sql);
  }
}
