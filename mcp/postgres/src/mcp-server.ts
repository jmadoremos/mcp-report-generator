import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult, ListResourcesResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { stringify } from 'csv-stringify';
import { createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { PostgreSQL } from './postgresql';

const resTableSchemaLabel = 'table_schema';

const resTableSchemaUri = 'postgres://schemas/{schema}/tables';

const resTableSchemaTitle = 'Table Schema';

const resTableSchemaDescription = 'Describes the table schema of the database';

const defaults = {
    listTables: { schema: 'public' },
    describeTables: { schema: 'public' },
    runQuery: { schema: 'public' },
}

const readTableSchemaInputSchema = z.object({
    schema: z.string().optional().describe('Schema name')
});

export type readTableSchemaInput = z.infer<typeof readTableSchemaInputSchema>;

const listTablesInputSchema = z.object({
    schema: z.string().optional().default(defaults.listTables.schema)
        .describe('Schema name to filter tables')
});

export type listTablesInput = z.infer<typeof listTablesInputSchema>;

const listTablesOutputSchema = z.object({
    tables: z.array(z.object({
        schema: z.string().describe('Schema name'),
        name: z.string().describe('Table name')
    })).describe('List of tables in the database')
});

export type listTablesOutput = z.infer<typeof listTablesOutputSchema>;

const describeTablesInputSchema = z.object({
    schema: z.string().optional().default(defaults.describeTables.schema)
        .describe('Schema name to filter tables')
});

export type describeTablesInput = z.infer<typeof describeTablesInputSchema>;

const describeTablesOutputSchema = z.object({
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

const runQueryInputSchema = z.object({
    parameterizedQuery: z.string().describe('Parameterized query'),
    values: z.array(z.unknown()).describe('List of values represented in the parameterized query')
});

export type runQueryInput = z.infer<typeof runQueryInputSchema>;

const runQueryOutputSchema = z.object({
    rowCount: z.number().describe('Number of rows found'),
    rows: z.array(z.record(z.string(), z.any())).describe('List of row values')
});

export type runQueryOutput = z.infer<typeof runQueryOutputSchema>;

const saveQueryResultInputSchema = z.object({
    parameterizedQuery: z.string().describe('Parameterized query'),
    values: z.array(z.unknown()).describe('List of values represented in the parameterized query'),
    filename: z.string().describe('Name of the CSV file to be generated'),
    path: z.string().describe('Absolute path without the filename where the CSV file will be saved')
});

export type saveQueryResultInput = z.infer<typeof saveQueryResultInputSchema>;

const saveQueryResultOutputSchema = z.object({
    rowCount: z.number().describe('Number of rows found'),
    fullPath: z.string().describe('Absolute path including filename of the generated CSV file')
});

export type saveQueryResultOutput = z.infer<typeof saveQueryResultOutputSchema>;


export const getServer = () => {
    const server = new McpServer({ name: 'postgres', version: '1.0.0' });

    // resource: table_schema
    server.registerResource(
        resTableSchemaLabel,
        new ResourceTemplate(resTableSchemaUri, { list: listTableSchemaUrisAsync }),
        {
            title: resTableSchemaTitle,
            description: resTableSchemaDescription
        },
        readTableSchemaHandlerAsync
    );

    // tool: postgres_ping
    server.registerTool(
        'postgres_ping',
        {
            description: 'Checks if the server is responding and database connection is established'
        },
        pingHandlerAsync
    );

    // tool: postgres_list_tables
    server.registerTool(
        'postgres_list_tables',
        {
            description: 'Lists the tables in the database with optional `schema` filter',
            inputSchema: listTablesInputSchema,
            outputSchema: listTablesOutputSchema
        },
        listTablesHandlerAsync
    );

    // tool: postgres_describe_tables
    server.registerTool(
        'postgres_describe_tables',
        {
            description: 'Describes the table schema of all tables in the database with optional `schema` filter',
            inputSchema: describeTablesInputSchema,
            outputSchema: describeTablesOutputSchema
        },
        describeTablesHandlerAsync
    );

    // tool: postgres_run_query
    server.registerTool(
        'postgres_run_query',
        {
            description: 'Runs a parameterized query',
            inputSchema: runQueryInputSchema,
            outputSchema: runQueryOutputSchema
        },
        runQueryHandlerAsync
    );

    // tool: postgres_save_query_result
    server.registerTool(
        'postgres_save_query_result',
        {
            description: 'Saves the query result to the designated location',
            inputSchema: saveQueryResultInputSchema,
            outputSchema: saveQueryResultOutputSchema
        },
        saveQueryResultHandlerAsync
    );

    return server;
};

async function listTableSchemaUrisAsync(): Promise<ListResourcesResult> {
    // Prepare parameterized query
    let query = `SELECT "schema_name" FROM information_schema."schemata"`;
    query += ` WHERE "schema_name" NOT LIKE 'pg_%'`;
    query += ` AND "schema_name" <> 'information_schema'`;

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{ schema_name: string }>(query);

    if (result.error) {
        return { resources: [] }
    }

    // Process result
    return {
        resources: result.data.map((value) => ({
            name: `${resTableSchemaLabel}_${value.schema_name}`,
            title: `${resTableSchemaTitle}: ${value.schema_name}`,
            description: `${resTableSchemaDescription} under '${value.schema_name}' schema`,
            uri: resTableSchemaUri.replace('{schema}', value.schema_name)
        }))
    }
}

async function readTableSchemaHandlerAsync(uri: URL, { schema }: readTableSchemaInput): Promise<ReadResourceResult> {
    // Prepare parameterized query
    let query = `SELECT "table_name", "column_name", "data_type",`;
    query += ` CASE "is_identity" WHEN 'NO' THEN false ELSE true END AS "identity",`;
    query += ` CASE "is_nullable" WHEN 'NO' THEN false ELSE true END AS "required",`;
    query += ` "character_maximum_length", "numeric_precision", "numeric_precision_radix"`;
    query += ` FROM information_schema."columns" WHERE "table_schema" = $1;`

    // Execute query
    const result = await PostgreSQL.getInstance().queryAsync<{
        table_name: string;
        column_name: string;
        data_type: string;
        identity: boolean;
        required: boolean;
        character_maximum_length?: number | null;
        numeric_precision?: number | null;
        numeric_precision_radix?: number | null;
    }>(query, [schema]);

    if (result.error) {
        return {
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Error describing tables: ${result.message}` }],
            isError: true
        }
    }

    // Process result
    if (result.data.length === 0) {
        return {
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: `Schema '${schema}' not found in database` }]
        }
    }

    return {
        contents: [
            {
                uri: uri.href,
                mimeType: 'application/json',
                text: JSON.stringify(result.data.map((value) => ({
                    table_name: `${schema}."${value.table_name}"`,
                    column_name: value.column_name,
                    column_type: value.data_type,
                    column_identity: value.identity,
                    column_required: value.required,
                    column_char_max_length: value.character_maximum_length,
                    column_num_precision: value.numeric_precision,
                    column_num_precision_radix: value.numeric_precision_radix
                })), null, 4)
            }
        ]
    }
}

async function pingHandlerAsync(): Promise<CallToolResult> {
    const result = await PostgreSQL.getInstance().queryAsync('SELECT 1');
    if (result.error) {
        return { content: [{ type: 'text', text: `Connection failed: ${result.message}` }], isError: true };
    }
    
    return { content: [{ type: 'text', text: 'pong' }] };
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

async function runQueryHandlerAsync({ parameterizedQuery, values }: runQueryInput): Promise<CallToolResult> {
    // Prepare content container
    let structuredContent: runQueryOutput = { rowCount: 0, rows: [] };

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

async function saveQueryResultHandlerAsync({ parameterizedQuery, values, filename, path }: saveQueryResultInput): Promise<CallToolResult> {
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
            content: [{ type: 'text', text: `No CSV file generated because no result was found` }],
            structuredContent: { rowCount: 0, fullPath: '' }
        }
    }

    // Configure stringifier to escape special characters
    const stringifier = stringify({
        header: true,
        quoted: true,           // Wraps all cells in "" to handle commas/tabs
        quoted_empty: true,
        escape: '"',            // Escapes double quotes with another double quote
        cast: {
            date: (value) => value.toISOString()
        },
    });

    // Return promise with writable stream
    return new Promise((resolve) => {
        const fullPath = join(path, filename);
        const writableStream = createWriteStream(fullPath);

        stringifier.pipe(writableStream);

        result.data.forEach((row) => stringifier.write(row));
        stringifier.end();

        writableStream.on('finish', () =>
            resolve({
                content: [{ type: 'text', text: `Created "${filename}" file with ${result.data.length} rows` }],
                structuredContent: { rowCount: result.data.length, fullPath }
            }));

        writableStream.on('error', (err) =>
            resolve({
                content: [{ type: 'text', text: `Error creating file: ${err.message}` }],
                isError: true
            }));
    });
}
