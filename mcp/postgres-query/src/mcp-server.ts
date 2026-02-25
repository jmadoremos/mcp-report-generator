import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PostgreSQL } from './postgresql';
import { z } from 'zod';

export const defaults = {
    listTables: { schema: 'public' },
    describeTable: { schema: 'public' },
    describeTables: { schema: 'public' },
    query: { schema: 'public' },
}

export const listSchemasOutputSchema = z.object({
    schemas: z.array(z.string()).describe('List of user schemas in the database')
});

export type listSchemasOutput = z.infer<typeof listSchemasOutputSchema>;

export const listTablesInputSchema = z.object({
    schema: z.string().optional().default(defaults.listTables.schema)
        .describe('Schema name to filter tables')
});

export type listTablesInput = z.infer<typeof listTablesInputSchema>;

export const listTablesOutputSchema = z.object({
    tables: z.array(z.object({
        schema: z.string().describe('Schema name'),
        name: z.string().describe('Table name')
    })).describe('List of tables in the database')
});

export type listTablesOutput = z.infer<typeof listTablesOutputSchema>;

export const describeTableInputSchema = z.object({
    table: z.string().describe('Table name'),
    schema: z.string().optional().default(defaults.describeTable.schema)
        .describe('Schema name to filter tables')
});

export type describeTableInput = z.infer<typeof describeTableInputSchema>;

export const describeTableOutputSchema = z.object({
    schema: z.string().describe('Schema name'),
    table: z.string().describe('Table name'),
    columns: z.array(z.object({
        name: z.string().describe('Column name'),
        type: z.string().describe('Column data type'),
        required: z.boolean().describe('Column is required'),
        identity: z.boolean().describe('Column is identity'),
        char_max_length: z.union([z.number(), z.null()]).optional().describe('Maximum character length for text-based columns'),
        num_precision: z.union([z.number(), z.null()]).optional().describe('Precision for numeric columns'),
        num_precision_radix: z.union([z.number(), z.null()]).optional().describe('Precision radix for numeric columns')
    })).describe('List of columns in the table')
});

export type describeTableOutput = z.infer<typeof describeTableOutputSchema>;

export const describeTablesInputSchema = z.object({
    schema: z.string().optional().default(defaults.describeTables.schema)
        .describe('Schema name to filter tables')
});

export type describeTablesInput = z.infer<typeof describeTablesInputSchema>;

export const describeTablesOutputSchema = z.object({
    tables: z.array(z.object({
        schema: z.string().describe('Schema name'),
        name: z.string().describe('Table name'),
        columns: z.array(z.object({
            name: z.string().describe('Column name'),
            type: z.string().describe('Column data type'),
            required: z.boolean().describe('Column is required'),
            identity: z.boolean().describe('Column is identity'),
            char_max_length: z.union([z.number(), z.null()]).optional().describe('Maximum character length for text-based columns'),
            num_precision: z.union([z.number(), z.null()]).optional().describe('Precision for numeric columns'),
            num_precision_radix: z.union([z.number(), z.null()]).optional().describe('Precision radix for numeric columns')
        })).describe('List of columns in the table')
    })).describe('List of tables in the schema')
});

export type describeTablesOutput = z.infer<typeof describeTablesOutputSchema>;

export const queryInputSchema = z.object({
    parameterizedQuery: z.string().describe('Parameterized query'),
    values: z.array(z.unknown()).describe('List of values represented in the parameterized query'),
    schema: z.string().optional().default(defaults.query.schema)
        .describe('Schema name to filter tables')
});

export type queryInput = z.infer<typeof queryInputSchema>;

export const queryOutputSchema = z.object({
    rowCount: z.number().describe('Number of rows found'),
    rows: z.array(z.record(z.string(), z.any())).describe('List of row values')
});

export type queryOutput = z.infer<typeof queryOutputSchema>;

export const getServer = () => {
    const server = new McpServer({ name: 'postgres-query', version: '1.0.0' });

    // tool: ping
    server.registerTool(
        'ping',
        {
            description: 'Checks if the server is responding and database connection is established'
        },
        pingHandlerAsync
    );

    // tool: list_schemas
    server.registerTool(
        'list_schemas',
        {
            description: 'Lists the user schemas in the database',
            outputSchema: listSchemasOutputSchema
        },
        listSchemasHandlerAsync
    );

    // tool: list_tables
    server.registerTool(
        'list_tables',
        {
            description: 'Lists the tables in the database with optional `schema` filter',
            inputSchema: listTablesInputSchema,
            outputSchema: listTablesOutputSchema
        },
        listTablesHandlerAsync
    );

    // tool: describe_table
    server.registerTool(
        'describe_table',
        {
            description: 'Describes the table schema of a tables in the database with optional `schema` filter',
            inputSchema: describeTableInputSchema,
            outputSchema: describeTableOutputSchema
        },
        describeTableHandlerAsync
    );

    // tool: describe_tables
    server.registerTool(
        'describe_tables',
        {
            description: 'Describes the table schema of all tables in the database with optional `schema` filter',
            inputSchema: describeTablesInputSchema,
            outputSchema: describeTablesOutputSchema
        },
        describeTablesHandlerAsync
    );

    // tool: query
    server.registerTool(
        'query',
        {
            description: 'Queries the database with optional `schema` filter',
            inputSchema: queryInputSchema,
            outputSchema: queryOutputSchema
        },
        queryHandlerAsync
    );

    return server;
};

async function pingHandlerAsync(): Promise<CallToolResult> {
    const result = await PostgreSQL.getInstance().queryAsync('SELECT 1');
    if (result.error) {
        return { content: [{ type: 'text', text: `Connection failed: ${result.message}` }], isError: true };
    }
    
    return { content: [{ type: 'text', text: 'pong' }] };
}

async function listSchemasHandlerAsync(): Promise<CallToolResult> {
    // Prepare parameterized query
    let query = `SELECT "schema_name" FROM information_schema."schemata"`;
    query += ` WHERE "schema_name" NOT LIKE 'pg_%'`;
    query += ` AND "schema_name" <> 'information_schema'`;

    // Prepare content container
    const structuredContent: listSchemasOutput = { schemas: [] };

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{ schema_name: string }>(query);

    if (result.error) {
        return {
            content: [{ type: 'text', text: `Error listing schemas: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    structuredContent.schemas = result.data.map((value) => value.schema_name);

    return {
        content: [{ type: 'text', text: `Found ${result.data.length} schemas in the database` }],
        structuredContent: structuredContent
    };
}

async function listTablesHandlerAsync({ schema = defaults.listTables.schema }: listTablesInput): Promise<CallToolResult> {
    // Prepare parameterized query
    let query = `SELECT "table_schema", "table_name" FROM information_schema."tables"`;
    query += ` WHERE "table_type" = 'BASE TABLE'`;
    query += schema ? ` AND "table_schema" = $1;` : ';';

    const values = schema ? [schema] : [];

    // Prepare content container
    const structuredContent: listTablesOutput = { tables: [] };

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{
        table_schema: string;
        table_name: string;
    }>(query, values);

    if (result.error) {
        return {
            content: [{ type: 'text', text: `Error listing tables: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    structuredContent.tables = result.data.map((value) => ({
        schema: value.table_schema,
        name: value.table_name
    }));

    return {
        content: [{ type: 'text', text: `Found ${result.data.length} tables in the '${schema}' schema` }],
        structuredContent: structuredContent
    };
}

async function describeTableHandlerAsync({ table, schema = defaults.describeTable.schema }: describeTableInput): Promise<CallToolResult> {
    // Prepare parameterized query
    let query = `SELECT "column_name", "data_type",`;
    query += ` CASE "is_identity" WHEN 'NO' THEN false ELSE true END AS "identity",`;
    query += ` CASE "is_nullable" WHEN 'NO' THEN false ELSE true END AS "required",`;
    query += ` "character_maximum_length", "numeric_precision", "numeric_precision_radix"`;
    query += ` FROM information_schema."columns" WHERE "table_name" = $1 AND "table_schema" = $2;`

    const values = [table, schema];

    // Prepare content container
    const structuredContent: describeTableOutput = { schema, table, columns: [] };

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{
        column_name: string;
        data_type: string;
        identity: boolean;
        required: boolean;
        character_maximum_length?: number | null;
        numeric_precision?: number | null;
        numeric_precision_radix?: number | null;
    }>(query, values);

    if (result.error) {
        return {
            content: [{ type: 'text', text: `Error describing table: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    structuredContent.columns = result.data.map((value) => ({
        name: value.column_name,
        type: value.data_type,
        identity: value.identity,
        required: value.required,
        char_max_length: value.character_maximum_length,
        num_precision: value.numeric_precision,
        num_precision_radix: value.numeric_precision_radix
    }));

    return {
        content: [{ type: 'text', text: `Found ${result.data.length} columns in the '${schema}."${table}"' table` }],
        structuredContent: structuredContent
    };
}

async function describeTablesHandlerAsync({ schema = defaults.describeTables.schema }: describeTablesInput): Promise<CallToolResult> {
    // Prepare parameterized query
    let query = `SELECT "table_schema", "table_name", "column_name", "data_type",`;
    query += ` CASE "is_identity" WHEN 'NO' THEN false ELSE true END AS "identity",`;
    query += ` CASE "is_nullable" WHEN 'NO' THEN false ELSE true END AS "required",`;
    query += ` "character_maximum_length", "numeric_precision", "numeric_precision_radix"`;
    query += ` FROM information_schema."columns" WHERE "table_schema" = $1 ORDER BY "table_schema", "table_name";`

    const values = [schema];

    // Prepare content container
    const structuredContent: describeTablesOutput = { tables: [] };

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{
        table_schema: string;
        table_name: string;
        column_name: string;
        data_type: string;
        identity: boolean;
        required: boolean;
        character_maximum_length?: number | null;
        numeric_precision?: number | null;
        numeric_precision_radix?: number | null;
    }>(query, values);

    if (result.error) {
        return {
            content: [{ type: 'text', text: `Error describing tables: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    const tableCount = new Set(result.data.map((value) => value.table_name)).size;
    
    result.data.forEach((value) => {
        let index = structuredContent.tables.findIndex((row) => row.schema == value.table_schema && row.name == value.table_name );

        if (index == -1) {
            structuredContent.tables.push({
                schema: value.table_schema,
                name: value.table_name,
                columns: []
            });

            index = structuredContent.tables.length - 1;
        }

        structuredContent.tables[index].columns.push({
            name: value.column_name,
            type: value.data_type,
            identity: value.identity,
            required: value.required,
            char_max_length: value.character_maximum_length,
            num_precision: value.numeric_precision,
            num_precision_radix: value.numeric_precision_radix
        });
    });

    return {
        content: [{ type: 'text', text: `Found ${tableCount} tables in the '${schema}' schema` }],
        structuredContent: structuredContent
    };
}

async function queryHandlerAsync({ parameterizedQuery, values, schema = defaults.describeTable.schema }: queryInput): Promise<CallToolResult> {
    // Prepare content container
    let structuredContent: queryOutput = { rowCount: 0, rows: [] };

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<Record<string, unknown>>(parameterizedQuery, values);

    if (result.error) {
        return {
            content: [{ type: 'text', text: `Error querying database: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    if (result.data.length === 0) {
        return {
            content: [{ type: 'text', text: `No result found` }],
            structuredContent: structuredContent
        }
    }

    structuredContent.rowCount = result.data.length;
    structuredContent.rows = result.data;

    return {
        content: [{ type: 'text', text: `Found ${result.data.length} results from the query` }],
        structuredContent: structuredContent
    };
}
