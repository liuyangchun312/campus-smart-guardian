// Cloud deployment supplies Durable Object SQLite instead of Node's local database.
export class DatabaseSync {
  constructor() { throw new Error("Cloud deployment requires a Durable Object database."); }
}
