import { Pool } from "pg";

export type QueryResult<T> = {
    error?: boolean,
    message: string | unknown,
    data: T[]
};

export class PostgreSQL {
    private static instance: PostgreSQL;
    private static pool: Pool;

    private constructor() {
        // Retrieve and evaluate environment variables
        const pghost = process.env['PGHOST'] || 'localhost';
        const pgport = process.env['PGPORT'] || '5432';
        let parsedPgPort: number;
        try {
            if (!pgport)
                throw new Error('PGPORT environment variable is not set');

            parsedPgPort = Number.parseInt(pgport, 10);
            if (isNaN(parsedPgPort))
                throw new Error('PGPORT is not a number');
            else if (parsedPgPort > 65535)
                throw new Error('PGPORT is not a number');
        }
        catch (err) {
            console.error(err);
            process.exit(1);
        }
        const pgdatabase = process.env['PGDATABASE'];
        if (!pgdatabase) {
            console.error(`PGDATABASE environment variable is not set`);
            process.exit(1);
        }
        const pguser = process.env['PGUSER'];
        if (!pguser) {
            console.error(`PGUSER environment variable is not set`);
            process.exit(1);
        }
        const pgpassword = process.env['PGPASSWORD'];
        if (!pgpassword) {
            console.error(`PGPASSWORD environment variable is not set`);
            process.exit(1);
        }

        // Initialize connection pool
        if (!PostgreSQL.pool) {
            console.log(`PostgreSQL.pool    | Initializing connection pool...`);
            console.log(`PostgreSQL.pool    | PGHOST: ${pghost}`);
            console.log(`PostgreSQL.pool    | PGPORT: ${parsedPgPort}`);
            console.log(`PostgreSQL.pool    | PGDATABASE: ${pgdatabase}`);
            console.log(`PostgreSQL.pool    | PGUSER: ${pguser}`);
            console.log(`PostgreSQL.pool    | PGPASSWORD: ${'*'.repeat(pgpassword.length)}`);

            PostgreSQL.pool = new Pool({ ssl: false, min: 0, max: 1 })
        }
    }

    public static getInstance() {
        if (!PostgreSQL.instance) {
            PostgreSQL.instance = new PostgreSQL();
        }
        return PostgreSQL.instance;
    }

    public async queryAsync<T>(parameterizedQuery: string, values?: any[]): Promise<QueryResult<T>> {
        console.log(`PostgreSQL.queryAsync  | Executing query...`);
        console.log(`PostgreSQL.queryAsync  | query: ${parameterizedQuery}`);
        console.log(`PostgreSQL.queryAsync  | values: ${JSON.stringify(values ?? [], null, 4)}`);

        try {
            const res = await PostgreSQL.pool.query(parameterizedQuery, values);
            console.log(`PostgreSQL.queryAsync  | Executed.`);
            // console.log(`PostgreSQL.queryAsync  | result: ${JSON.stringify(res, null, 4)}`);
            console.log(`PostgreSQL.queryAsync  | result count: ${res.rowCount}`);

            return { message: 'success', data: res.rows ?? [] };
        }
        catch (err: unknown) {
            console.log(`PostgreSQL.queryAsync  | error: ${JSON.stringify(err, null, 4)}`);
            return { error: true, message: err, data: [] };
        }
    }

    public async closePoolAsync(): Promise<void> {
        console.log(`PostgreSQL.closePoolAsync  | Closing connection pool...`);
        if (PostgreSQL.pool) {
            await PostgreSQL.pool.end();
        }
        console.log(`PostgreSQL.closePoolAsync  | Closed.`);
    }
};
