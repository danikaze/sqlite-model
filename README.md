# sqlite-model

[![Build Status](https://travis-ci.org/danikaze/sqlite-model.svg?branch=master)](https://travis-ci.org/danikaze/sqlite-model)

Extend this class to easily create your data models based on [sqlite3](https://github.com/mapbox/node-sqlite3)

## Install

```
npm install sqlite-model
```

## Usage example

This library provides a base class with the basics method to access a SQLite database and promisified statement.

The easiest way to use the class, is extending it when implementing your model class.

To show it, we are going to implement a small model to **get** and **set** _jsonified_ values, which will use the following data definition and SQL queries:

```ts
-- table definition
CREATE TABLE IF NOT EXISTS example (
  key text NOT NULL PRIMARY KEY,
  value text NOT NULL,
);

-- query to set data
INSERT INTO example VALUES(?, ?);

-- query to get data
SELECT value FROM example WHERE key = ?;

-- if the value already exists, update it
UPDATE example SET value = ? WHERE key = ?;
```

The implementation for this model would be the following one:

```ts
import { SqliteModel } from '../src';

type Query = 'set' | 'get' | 'update';

export class Example extends SqliteModel<Query> {
  // we usually don't want to expose all the model options, so our constructor will have a different interface
  constructor(dbPath: string) {
    super({
      // `dbPath` is exposed for testing purposes
      dbPath,
      // This is the list of SQL statements that will be available in `this.stmt` to be used by the methods of your model
      queries: {
        set: 'INSERT INTO example VALUES(?, ?);',
        get: 'SELECT value FROM example WHERE key = ?;',
        update: 'UPDATE example SET value = ? WHERE key = ?;',
      },
      // This SQL will be executed only when the database is created the first time
      createDbSql: [
        `
        CREATE TABLE IF NOT EXISTS example (
          key text NOT NULL PRIMARY KEY,
          value text NOT NULL
        );
      `,
      ],
    });
  }

  /**
   * Set or update a `value` to a `key`
   *
   * @return Promise resolved when the operation is finished
   */
  public async set<T>(key: string, data: T): Promise<void> {
    // wait for the database to be ready
    // if your application makes sure that the model is not used until is ready, this line wouldn't be required, but it doesn't hurt to have it
    await this.isReady();

    let json: string;

    try {
      json = JSON.stringify(data);
    } catch (error) {
      throw new Error(`An error happened while trying to stringify ${key}`);
    }

    // if `set` fails it means that the primary key already exists, so we just try to update it
    try {
      await this.stmt.set.run(key, json);
    } catch (error) {
      await this.stmt.update.run(json, key);
    }
  }

  /**
   * Get the value associated to the specified `key`
   *
   * @return Promise resolved to the stored value or `undefined` if not found
   */
  public async get<T>(key: string): Promise<T> {
    // wait for the database to be ready
    // if your application makes sure that the model is not used until is ready, this line wouldn't be required, but it doesn't hurt to have it
    await this.isReady();

    try {
      const { row } = await this.stmt.get.get<{ value: string }>(key);
      const res = row && JSON.parse(row.value);
      return res as T;
    } catch (error) {
      throw new Error(`An error happened while trying to get ${key} [${error}]`);
    }
  }
}
```

And that's all.

As you can see, with this class as a base, you only need to implement the logic of your model without worrying about database operations, preparing statements or _dirty_ old-styled callbacks returned by the statement functions.
