import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { stringify } from 'csv-stringify';
import { z } from 'zod';
import { createWriteStream } from 'fs';
import { join } from 'path';

export const createFromJsonToFSInputSchema = z.object({
    filename: z.string().describe('Name of the file to be created'),
    path: z.string().describe('Absolute path of the file to be created without the filename'),
    // Accept arbitrary object shapes from agents (don't strip unknown keys)
    contents: z.array(z.record(z.string(), z.any())).describe('Contents of the file in an array of plain JSON objects')
});

export type createFromJsonToFSInput = z.infer<typeof createFromJsonToFSInputSchema>;

export const createFromJsonToFSOutputSchema = z.object({
    fullPath: z.string().describe('Full path of the created file'),
    rowCount: z.number().describe('Number of rows in the generated file')
});

export type createFromJsonToFSOutput = z.infer<typeof createFromJsonToFSOutputSchema>;

export const getServer = () => {
    const server = new McpServer({ name: 'csv-generator', version: '1.0.0' });

    // tool: create_fromjson_tofs
    server.registerTool(
        'create_fromjson_tofs',
        {
            description: 'Creates a CSV file on the file system',
            inputSchema: createFromJsonToFSInputSchema,
            outputSchema: createFromJsonToFSOutputSchema
        },
        createFromJsonToFSHandlerAsync
    );

    return server;
};

async function createFromJsonToFSHandlerAsync({ filename, path, contents }: createFromJsonToFSInput): Promise<CallToolResult> {
    console.log(`CsvGenerator.createFromJsonToFS    | Creating CSV file...`);
    console.log(`CsvGenerator.createFromJsonToFS    | Filename: ${filename}`);
    console.log(`CsvGenerator.createFromJsonToFS    | Path: ${path}`);
    console.log(`CsvGenerator.createFromJsonToFS    | Content count: ${contents.length}`);
    const fullPath = join(path, filename);
    const writableStream = createWriteStream(fullPath);

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

    return new Promise((resolve) => {
        stringifier.pipe(writableStream);

        contents.forEach((row) => stringifier.write(row));
        stringifier.end();

        writableStream.on('finish', () => {
            const structuredContent: createFromJsonToFSOutput = { fullPath, rowCount: contents.length };

            resolve({
                content: [{ type: 'text', text: `Created "${filename}" file with ${contents.length} rows` }],
                structuredContent: structuredContent
            });

            console.log(`CsvGenerator.createFromJsonToFS    | Created.`);
        });

        writableStream.on('error', (err) => {            
            console.log(`CsvGenerator.createFromJsonToFS    | Error encountered: ${err.message}`);

            resolve({
                content: [{ type: 'text', text: `Error creating file: ${err.message}` }],
                isError: true
            });
        });
    });
}
