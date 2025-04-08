#!/usr/bin/env node
// src/backup-tool.ts

// Use namespace import for CommonJS compatibility
import * as api from '@actual-app/api';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import fs from 'fs/promises'; // Import fs.promises for async file system operations

// Define an interface for expected argument types (good practice)
interface Arguments {
    syncId: string;
    backupDir: string;
    _: (string | number)[]; // Positional arguments captured by yargs
    $0: string; // Script name
}

// Flag to prevent double shutdown attempts from signal handlers and finally block
let isShuttingDown = false;

// --- Main Async Function ---
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
            description: 'Directory to save the backup files (will be cleaned before backup)',
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
    console.log(`Target Server URL: ${serverURL}`);
    // Avoid logging the password!

    // --- Backup Directory Preparation ---
    const resolvedBackupDir: string = await resolveAndVerifyBackupDir(backupDir);
    await cleanBackupDir(resolvedBackupDir); // Clean the directory *before* init

    // --- Actual API Interaction ---
    try {
        console.log('Initializing Actual API...');
        await api.init({
            dataDir: resolvedBackupDir, // Use the resolved, verified, and cleaned path
            serverURL: serverURL,
            password: password,
        });
        console.log('API Initialized successfully.');

        console.log(`Downloading budget for Sync ID: ${syncId}...`);
        await api.downloadBudget(syncId);
        console.log('Budget downloaded successfully.');

    } catch (error) {
        console.error('Error during Actual API operation:', error);
        // Consider adding more specific error checks here if the API provides error codes/types
        process.exit(1); // Exit with error status
    } finally {
        // --- Shutdown ---
        // Attempt shutdown only if not already triggered by a signal
        if (!isShuttingDown) {
            isShuttingDown = true; // Prevent signal handlers from running shutdown again
            try {
                console.log('Shutting down Actual API connection...');
                await api.shutdown();
                console.log('API connection shut down.');
            } catch (shutdownError) {
                console.error('Error during final API shutdown:', shutdownError);
                // If shutdown fails here, we might still want to exit successfully if the main task succeeded
                // or exit with an error if shutdown is critical. Let's exit with error for now.
                process.exit(1);
            }
        }
    }

    console.log('Backup process completed successfully.');
    process.exit(0); // Explicitly exit with success status

})().catch(err => {
    // Catch top-level errors (e.g., argument parsing, unexpected issues before try/catch)
    console.error("Script execution failed unexpectedly:", err);
    process.exit(1);
});

/**
 * Resolves the backup directory path, creates it if necessary, and verifies write access.
 * @param backupDir - The directory path specified by the user.
 * @returns The resolved absolute path to the backup directory.
 */
async function resolveAndVerifyBackupDir(backupDir: string): Promise<string> {
    let resolvedPath: string;
    try {
        resolvedPath = path.resolve(backupDir); // Get absolute path
        console.log(`Ensuring backup directory exists: ${resolvedPath}`);
        // Ensure directory exists, creating intermediate directories if needed
        await fs.mkdir(resolvedPath, { recursive: true });
        // Check write permissions
        await fs.access(resolvedPath, fs.constants.W_OK);
        console.log(`Write access verified for: ${resolvedPath}`);
    } catch (err: any) {
        console.error(`Error accessing backup directory "${backupDir}" (resolved to "${path.resolve(backupDir)}"):`);
        if (err.code === 'EACCES') {
            console.error('Permission denied. Please ensure the script has write access to the directory.');
        } else if (err.code === 'ENOENT') {
            console.error('Path component does not exist or is invalid (this error should be rare with recursive mkdir).');
        } else {
            console.error(err.message); // General error message
        }
        process.exit(1); // Exit if directory preparation fails
    }
    return resolvedPath;
}

/**
 * Removes all files and subdirectories within the specified directory.
 * WARNING: This is a destructive operation.
 * @param dirPath - The absolute path to the directory to clean.
 */
async function cleanBackupDir(dirPath: string): Promise<void> {
    console.log(`Cleaning existing files from backup directory: ${dirPath}`);
    console.warn(`WARNING: All contents of "${dirPath}" will be removed.`); // Add a warning
    try {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
            const entryPath = path.join(dirPath, entry);
            // Use fs.rm which handles both files and directories recursively
            await fs.rm(entryPath, { recursive: true, force: true });
        }
        console.log(`Successfully cleaned directory: ${dirPath}`);
    } catch (err: any) {
        // If readdir fails because the directory doesn't exist, that's okay (should have been created by verify step)
        if (err.code === 'ENOENT') {
            console.log(`Directory "${dirPath}" does not exist (already clean or removed).`)
            return;
        }
        console.error(`Error cleaning directory "${dirPath}":`, err.message);
        process.exit(1); // Exit if cleaning fails
    }
}

/**
 * Handles graceful shutdown on receiving signals (SIGINT, SIGTERM).
 * @param signal - The signal received ('SIGINT' or 'SIGTERM').
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Attempting graceful shutdown...`);
    try {
        // Check if API was even initialized potentially
        if (api && typeof api.shutdown === 'function') {
            // Check if the shutdown function actually exists on the imported object
            await api.shutdown();
            console.log('API connection shut down successfully.');
        } else {
            console.log('API not initialized or shutdown function unavailable.');
        }
    } catch (shutdownError) {
        console.error(`Error during API shutdown on ${signal}:`, shutdownError);
    } finally {
        // Exit with an error code to indicate interruption
        process.exit(1);
    }
}

// --- Signal Handlers ---
// Handle Ctrl+C
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// Handle termination signals (e.g., from kill command)
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));