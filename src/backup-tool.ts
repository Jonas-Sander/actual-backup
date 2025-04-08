// src/backup-tool.ts

import * as api from '@actual-app/api';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path'; // Optional: for potential path manipulation if needed

// Define an interface for expected argument types (good practice)
interface Arguments {
    syncId: string;
    backupDir: string;
    _: (string | number)[]; // Positional arguments captured by yargs
    $0: string; // Script name
}

// Use an async immediately-invoked function expression (IIFE)
(async (): Promise<void> => {
    // --- Argument Parsing ---
    const argv = await yargs(hideBin(process.argv))
        .option('sync-id', {
            alias: 's',
            type: 'string',
            description: 'Actual Budget Sync ID (UUID)',
            demandOption: true, // Makes this flag required
        })
        .option('backup-dir', {
            alias: 'd',
            type: 'string',
            description: 'Directory to save the backup files',
            default: 'backup', // Default value if flag is not provided
        })
        .usage('Usage: $0 --sync-id <uuid> [--backup-dir <path>]')
        .help() // Enable --help flag
        .alias('help', 'h')
        .strict() // Report errors for unknown options
        .parseAsync() as Arguments; // Parse arguments and assert type

    const { syncId, backupDir } = argv;

    // --- Environment Variable Handling ---
    const serverURL: string | undefined = process.env.SERVER_URL;
    const password: string | undefined = process.env.SERVER_PASSWORD;

    if (!serverURL) {
        console.error('Error: Environment variable SERVER_URL is not set.');
        process.exit(1);
    }
    if (!password) {
        console.error('Error: Environment variable SERVER_PASSWORD is not set.');
        process.exit(1);
    }

    console.log(`Using Sync ID: ${syncId}`);
    console.log(`Using Backup Directory: ${backupDir}`);
    console.log(`Target Server URL: ${serverURL}`);
    // Avoid logging the password!

    // --- Actual API Interaction ---
    try {
        console.log('Initializing Actual API...');
        await api.init({
            // Required configuration
            dataDir: backupDir,
            serverURL: serverURL,
            password: password,
        });
        console.log('API Initialized successfully.');


        console.log(`Downloading budget for Sync ID: ${syncId}...`);
        // The syncId is the budget ID for downloadBudget
        await api.downloadBudget(syncId);
        console.log('Budget downloaded successfully.');

    } catch (error) {
        console.error('Error during Actual API operation:', error);
        process.exit(1); // Exit with error status
    } finally {
        // --- Shutdown ---
        // Always attempt to shut down the API connection cleanly
        try {
            console.log('Shutting down Actual API connection...');
            await api.shutdown();
            console.log('API connection shut down.');
        } catch (shutdownError) {
            console.error('Error during API shutdown:', shutdownError);
            // Decide if you want to exit with error here too, potentially masking the original error
            // process.exit(1); 
        }
    }

    console.log('Backup process completed.');
    process.exit(0); // Explicitly exit with success status

})().catch(err => {
    // Catch any errors that might happen outside the main try/catch, like argument parsing
    console.error("Script execution failed:", err);
    process.exit(1);
});