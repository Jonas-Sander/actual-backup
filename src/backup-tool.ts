#!/usr/bin/env node

import * as api from '@actual-app/api';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import path from 'path';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';

// Define an interface for expected argument types
interface Arguments {
    syncId: string;
    backupDir: string;
    _: (string | number)[];
    $0: string;
}

// Flag to prevent double shutdown attempts
let isShuttingDown = false;

// --- Main Async Function ---
(async (): Promise<void> => {
    const argv = await yargs(hideBin(process.argv))
        // ... (yargs configuration remains the same) ...
        .option('sync-id', { alias: 's', type: 'string', description: 'Actual Budget Sync ID (UUID)', demandOption: true })
        .option('backup-dir', { alias: 'd', type: 'string', description: 'Base directory for backup operations (subfolder will be zipped, then removed)', default: 'backup' })
        .usage('Usage: $0 --sync-id <uuid> [--backup-dir <path>]')
        .help().alias('help', 'h')
        .strict()
        .parseAsync() as Arguments;

    const { syncId, backupDir } = argv;

    // --- Environment Variable Handling ---
    // ... (remains the same) ...
    const serverURL: string | undefined = process.env.SERVER_URL;
    const password: string | undefined = process.env.SERVER_PASSWORD;
    if (!serverURL || !password) { /* ... error handling ... */ process.exit(1); }

    console.log(`Using Sync ID: ${syncId}`);
    console.log(`Target Server URL: ${serverURL}`);

    // --- Backup Directory Preparation ---
    const resolvedBackupDir = await resolveAndVerifyBackupDir(backupDir); // This is the PARENT dir, e.g., ./backup
    await cleanBackupDir(resolvedBackupDir); // Clean the PARENT dir before init

    let downloadedBudgetPath: string | null = null; // To store the path like /path/to/backup/My-Finances-XYZ

    // --- Actual API Interaction ---
    try {
        console.log('Initializing Actual API...');
        await api.init({
            dataDir: resolvedBackupDir, // API will create subfolder inside here
            serverURL: serverURL,
            password: password,
        });
        console.log('API Initialized successfully.');

        console.log(`Downloading budget for Sync ID: ${syncId}...`);
        await api.downloadBudget(syncId);
        console.log('Budget downloaded successfully.');

        // --- Find the directory created by downloadBudget ---
        console.log(`Locating downloaded budget folder in ${resolvedBackupDir}...`);
        downloadedBudgetPath = await findCreatedBudgetDir(resolvedBackupDir);
        if (!downloadedBudgetPath) {
            throw new Error(`Could not find the downloaded budget directory inside ${resolvedBackupDir}.`);
        }
        console.log(`Found budget folder: ${downloadedBudgetPath}`);

    } catch (error) {
        console.error('Error during Actual API operation or finding budget folder:', error);
        process.exit(1);
    } finally {
        // --- Shutdown ---
        // ... (shutdown logic remains the same) ...
        if (!isShuttingDown) {
            isShuttingDown = true;
            try {
                console.log('Shutting down Actual API connection...');
                await api.shutdown();
                console.log('API connection shut down.');
            } catch (shutdownError) {
                console.error('Error during final API shutdown:', shutdownError);
                // Decide whether to exit(1) here depending on if shutdown failure is critical
            }
        }
    }

    // --- Zipping and Cleanup (only if download succeeded and path was found) ---
    if (downloadedBudgetPath) {
        try {
            console.log(`Zipping budget folder: ${downloadedBudgetPath}`);
            const zipFilePath = await createDatedZip(downloadedBudgetPath, resolvedBackupDir);
            console.log(`Successfully created zip file: ${zipFilePath}`);

            console.log(`Deleting original budget folder: ${downloadedBudgetPath}`);
            await deleteSourceDir(downloadedBudgetPath);
            console.log(`Successfully deleted original folder.`);

        } catch (zipOrDeleteError) {
            console.error('Error during zipping or cleanup:', zipOrDeleteError);
            // Exit with error if post-processing fails, as the backup isn't fully complete/clean
            process.exit(1);
        }
    } else {
        console.warn("Skipping zip and cleanup as the downloaded budget path was not found.");
        // Exit with error because the primary goal (getting the budget data) likely failed earlier
        process.exit(1);
    }


    console.log('Backup process completed successfully.');
    process.exit(0);

})().catch(err => {
    console.error("Script execution failed unexpectedly:", err);
    process.exit(1);
});


// --- Helper Functions ---

/** Formats Date object as YYYY-MM-DD */
function getFormattedDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/** Finds the primary subdirectory created within the backup base directory */
async function findCreatedBudgetDir(baseDir: string): Promise<string | null> {
    try {
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        const directories = entries.filter(entry => entry.isDirectory());

        if (directories.length === 1) {
            return path.join(baseDir, directories[0].name);
        } else if (directories.length === 0) {
            console.warn(`No subdirectories found in ${baseDir} after download.`);
            return null;
        } else {
            console.warn(`Multiple subdirectories found in ${baseDir}. Cannot reliably determine the budget folder.`);
            // Optional: List directories found for debugging
            console.warn(`Found: ${directories.map(d => d.name).join(', ')}`);
            return null; // Or handle ambiguity differently
        }
    } catch (error) {
        console.error(`Error reading base directory ${baseDir} to find budget folder:`, error);
        return null;
    }
}

/** Creates a zip file named YYYY-MM-DD <FolderName>.zip in the target directory */
async function createDatedZip(sourceDirPath: string, targetZipDir: string): Promise<string> {
    const folderName = path.basename(sourceDirPath); // e.g., "My-Finances-7a1809d"
    const dateStr = getFormattedDate(new Date());
    const zipFileName = `${dateStr} ${folderName}.zip`;
    const zipFilePath = path.join(targetZipDir, zipFileName); // Place zip in the parent dir

    console.log(`Creating zip: ${zipFilePath}`);

    try {
        const zip = new AdmZip();
        // Add the contents of the source directory directly into the zip root
        zip.addLocalFolder(sourceDirPath, '', (filename) => {
            // Optional filter: exclude specific files/folders if needed
            // e.g., if (filename.startsWith('.')) return false;
            return true;
        });
        // Write the zip file asynchronously (or use writeZipSync)
        await zip.writeZipPromise(zipFilePath); // Use promise version
        return zipFilePath;
    } catch (error) {
        console.error(`Failed to create zip file at ${zipFilePath}:`, error);
        throw error; // Re-throw to be caught by the caller
    }
}

/** Deletes the specified directory */
async function deleteSourceDir(dirPath: string): Promise<void> {
    try {
        await fs.rm(dirPath, { recursive: true, force: true });
    } catch (error) {
        console.error(`Failed to delete directory ${dirPath}:`, error);
        throw error; // Re-throw
    }
}


// ... (resolveAndVerifyBackupDir, cleanBackupDir, gracefulShutdown, signal handlers remain the same) ...

/** Resolves, creates, and verifies the base backup directory */
async function resolveAndVerifyBackupDir(backupDir: string): Promise<string> {
    let resolvedPath: string;
    try {
        resolvedPath = path.resolve(backupDir);
        console.log(`Ensuring base backup directory exists: ${resolvedPath}`);
        await fs.mkdir(resolvedPath, { recursive: true });
        await fs.access(resolvedPath, fs.constants.W_OK);
        console.log(`Write access verified for base directory: ${resolvedPath}`);
    } catch (err: any) { /* ... error handling ... */ process.exit(1); }
    return resolvedPath;
}

/** Cleans the base backup directory */
async function cleanBackupDir(dirPath: string): Promise<void> {
    console.log(`Cleaning existing files/folders from base backup directory: ${dirPath}`);
    console.warn(`WARNING: All contents of "${dirPath}" will be removed before backup.`);
    try {
        const entries = await fs.readdir(dirPath);
        for (const entry of entries) {
            await fs.rm(path.join(dirPath, entry), { recursive: true, force: true });
        }
        console.log(`Successfully cleaned base directory: ${dirPath}`);
    } catch (err: any) { /* ... error handling ... */ process.exit(1); }
}

/** Handles graceful shutdown */
async function gracefulShutdown(signal: string): Promise<void> { /* ... remains the same ... */ }
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));