declare module "node:sqlite" {
  export class StatementSync {
    run(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    get(...params: unknown[]): unknown
  }

  export class DatabaseSync {
    constructor(filename?: string, options?: { readOnly?: boolean; open?: boolean })
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
