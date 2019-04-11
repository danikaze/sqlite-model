import { SqliteModel, SqliteStatement } from '../src';

// Just a simple class exposing all the protected methods of the SqliteModel for testing
export class Tester<Q extends string> extends SqliteModel<Q> {
  public async getStmt(key: Q): Promise<SqliteStatement> {
    await this.isReady();
    return this.stmt[key];
  }

  public publicExecSql(sql: string): Promise<void> {
    return this.execSql(sql);
  }

  public publicGetSqlFromFile(file: string): Promise<string> {
    return this.getSqlFromFile(file);
  }

  public publicPrepareStmt(sql: string): Promise<SqliteStatement> {
    return this.prepareStmt(sql);
  }
}
